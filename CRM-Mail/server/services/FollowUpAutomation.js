const { FollowUpJob, Client, Conference, EmailTemplate, Email, EmailLog } = require('../models');
const TemplateEngine = require('./TemplateEngine');
const EmailService = require('./EmailService');
const cron = require('node-cron');

class FollowUpAutomation {
  constructor() {
    this.templateEngine = new TemplateEngine();
    this.emailService = new EmailService();
    this.isRunning = false;
    this.jobs = new Map();
  }

  /**
   * Initialize the follow-up automation system
   */
  async initialize() {
    try {
      console.log('🚀 Initializing Follow-up Automation System...');
      
      // Start the cron job for processing follow-ups
      this.startCronJob();
      
      // Load existing active jobs
      await this.loadActiveJobs();
      
      this.isRunning = true;
      console.log('✅ Follow-up Automation System initialized');
    } catch (error) {
      console.error('❌ Error initializing follow-up automation:', error);
      throw error;
    }
  }

  /**
   * Start the main cron job for processing follow-ups
   */
  startCronJob() {
    // Run every 5 minutes to check for pending follow-ups
    cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        await this.processPendingFollowUps();
      }
    });

    // Run every hour to clean up completed jobs
    cron.schedule('0 * * * *', async () => {
      if (this.isRunning) {
        await this.cleanupCompletedJobs();
      }
    });
  }

  /**
   * Load active follow-up jobs from database
   */
  async loadActiveJobs() {
    try {
      const activeJobs = await FollowUpJob.findAll({
        where: {
          status: 'active',
          paused: false
        },
        include: [
          { model: Client, as: 'client' },
          { model: Conference, as: 'conference' },
          { model: EmailTemplate, as: 'template' }
        ]
      });

      for (const job of activeJobs) {
        this.jobs.set(job.id, job);
      }

      console.log(`📋 Loaded ${activeJobs.length} active follow-up jobs`);
    } catch (error) {
      console.error('Error loading active jobs:', error);
    }
  }

  /**
   * Create a new follow-up job
   * @param {Object} jobData - Job data
   * @returns {Object} Created job
   */
  async createFollowUpJob(jobData) {
    try {
      const {
        clientId,
        conferenceId,
        templateId,
        stage,
        scheduledDate,
        settings = {}
      } = jobData;

      // Validate required fields
      if (!clientId || !conferenceId || !templateId || !stage) {
        throw new Error('Missing required fields: clientId, conferenceId, templateId, stage');
      }

      // Get client and conference data
      const client = await Client.findByPk(clientId);
      const conference = await Conference.findByPk(conferenceId);
      const template = await EmailTemplate.findByPk(templateId);

      if (!client || !conference || !template) {
        throw new Error('Client, conference, or template not found');
      }

      // Calculate next send date if not provided
      const nextSendDate = scheduledDate || this.calculateNextSendDate(conference, stage);

      // Create follow-up job
      const job = await FollowUpJob.create({
        clientId,
        conferenceId,
        templateId,
        stage,
        scheduledDate: nextSendDate,
        status: 'active',
        paused: false,
        skipWeekends: conference.settings?.skip_weekends || true,
        customInterval: conference.settings?.followup_intervals?.[stage] || 7,
        maxAttempts: conference.settings?.max_attempts?.[stage] || 6,
        currentAttempt: 0,
        settings: {
          ...settings,
          timezone: conference.settings?.timezone || 'UTC',
          workingHours: conference.settings?.working_hours || { start: '09:00', end: '17:00' }
        }
      });

      // Add to active jobs
      this.jobs.set(job.id, job);

      console.log(`📧 Created follow-up job for client ${client.email}, stage ${stage}`);
      return job;
    } catch (error) {
      console.error('Error creating follow-up job:', error);
      throw error;
    }
  }

  /**
   * Calculate next send date based on conference settings
   * @param {Object} conference - Conference object
   * @param {string} stage - Follow-up stage
   * @returns {Date} Next send date
   */
  calculateNextSendDate(conference, stage) {
    const now = new Date();
    const interval = conference.settings?.followup_intervals?.[stage] || 7;
    const skipWeekends = conference.settings?.skip_weekends || true;
    
    let nextDate = new Date(now.getTime() + (interval * 24 * 60 * 60 * 1000));
    
    // Skip weekends if enabled
    if (skipWeekends) {
      while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }
    
    return nextDate;
  }

  /**
   * Process pending follow-up jobs
   */
  async processPendingFollowUps() {
    try {
      const now = new Date();
      const pendingJobs = Array.from(this.jobs.values()).filter(job => 
        job.status === 'active' && 
        !job.paused && 
        new Date(job.scheduledDate) <= now
      );

      console.log(`🔄 Processing ${pendingJobs.length} pending follow-up jobs`);

      for (const job of pendingJobs) {
        try {
          await this.processFollowUpJob(job);
        } catch (error) {
          console.error(`Error processing job ${job.id}:`, error);
          // Mark job as failed
          await this.markJobAsFailed(job.id, error.message);
        }
      }
    } catch (error) {
      console.error('Error processing pending follow-ups:', error);
    }
  }

  /**
   * Process a single follow-up job
   * @param {Object} job - Follow-up job
   */
  async processFollowUpJob(job) {
    try {
      console.log(`📧 Processing follow-up job ${job.id} for client ${job.client.email}`);

      // Check if client is still active and not unsubscribed
      if (!job.client.isActive || job.client.isUnsubscribed) {
        console.log(`⏸️ Skipping job ${job.id} - client inactive or unsubscribed`);
        await this.markJobAsCompleted(job.id, 'Client inactive or unsubscribed');
        return;
      }

      // Check if client has moved to next stage
      if (this.shouldSkipJob(job)) {
        console.log(`⏭️ Skipping job ${job.id} - client moved to next stage`);
        await this.markJobAsCompleted(job.id, 'Client moved to next stage');
        return;
      }

      // Render email template
      const renderedTemplate = await this.templateEngine.renderTemplate(
        job.templateId,
        job.clientId,
        job.conferenceId
      );

      // Send email
      const emailResult = await this.sendFollowUpEmail(job, renderedTemplate);

      // Update job status
      await this.updateJobAfterSend(job, emailResult);

      console.log(`✅ Follow-up job ${job.id} processed successfully`);
    } catch (error) {
      console.error(`Error processing follow-up job ${job.id}:`, error);
      throw error;
    }
  }

  /**
   * Check if job should be skipped
   * @param {Object} job - Follow-up job
   * @returns {boolean} Should skip job
   */
  shouldSkipJob(job) {
    const client = job.client;
    const stage = job.stage;

    // If client has moved to next stage, skip current stage jobs
    if (stage === 'stage1' && client.currentStage === 'stage2') {
      return true;
    }

    // If client has completed registration, skip all follow-ups
    if (client.status === 'Registered' || client.currentStage === 'completed') {
      return true;
    }

    return false;
  }

  /**
   * Send follow-up email
   * @param {Object} job - Follow-up job
   * @param {Object} template - Rendered template
   * @returns {Object} Email result
   */
  async sendFollowUpEmail(job, template) {
    try {
      // Get SMTP account for the conference
      const smtpAccount = await this.getSmtpAccountForConference(job.conferenceId);
      if (!smtpAccount) {
        throw new Error('No SMTP account configured for conference');
      }

      // Prepare email data
      const emailData = {
        to: job.client.email,
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        bodyText: template.bodyText,
        clientId: job.clientId,
        conferenceId: job.conferenceId,
        templateId: job.templateId,
        campaignId: `followup-${job.id}`,
        attachments: template.attachments || []
      };

      // Send email
      const emailResult = await this.emailService.sendEmail(smtpAccount.id, emailData);

      // Log email
      await this.logEmailSent(job, emailResult, template);

      return emailResult;
    } catch (error) {
      console.error('Error sending follow-up email:', error);
      throw error;
    }
  }

  /**
   * Get SMTP account for conference
   * @param {string} conferenceId - Conference ID
   * @returns {Object} SMTP account
   */
  async getSmtpAccountForConference(conferenceId) {
    try {
      const conference = await Conference.findByPk(conferenceId);
      if (!conference) return null;

      // Get default SMTP account for the organization
      const smtpAccount = await EmailAccount.findOne({
        where: {
          organizationId: conference.organizationId,
          isActive: true,
          type: ['smtp', 'both']
        },
        order: [
          ['sendPriority', 'ASC'],
          ['createdAt', 'ASC']
        ]
      });

      return smtpAccount;
    } catch (error) {
      console.error('Error getting SMTP account:', error);
      return null;
    }
  }

  /**
   * Log email sent
   * @param {Object} job - Follow-up job
   * @param {Object} emailResult - Email result
   * @param {Object} template - Rendered template
   */
  async logEmailSent(job, emailResult, template) {
    try {
      // Create email log entry
      await EmailLog.create({
        emailId: emailResult.id,
        clientId: job.clientId,
        conferenceId: job.conferenceId,
        templateId: job.templateId,
        stage: job.stage,
        subject: template.subject,
        status: 'sent',
        sentAt: new Date(),
        recipientEmail: job.client.email,
        recipientName: `${job.client.firstName} ${job.client.lastName}`
      });

      // Update client engagement metrics
      await this.updateClientEngagement(job.clientId, {
        emailsSent: 1,
        lastEmailSent: new Date()
      });
    } catch (error) {
      console.error('Error logging email:', error);
    }
  }

  /**
   * Update client engagement metrics
   * @param {string} clientId - Client ID
   * @param {Object} metrics - Metrics to update
   */
  async updateClientEngagement(clientId, metrics) {
    try {
      const client = await Client.findByPk(clientId);
      if (!client) return;

      const currentEngagement = client.engagement || {};
      const updatedEngagement = {
        ...currentEngagement,
        ...metrics,
        emailsSent: (currentEngagement.emailsSent || 0) + (metrics.emailsSent || 0)
      };

      await client.update({ engagement: updatedEngagement });
    } catch (error) {
      console.error('Error updating client engagement:', error);
    }
  }

  /**
   * Update job after sending email
   * @param {Object} job - Follow-up job
   * @param {Object} emailResult - Email result
   */
  async updateJobAfterSend(job, emailResult) {
    try {
      const newAttempt = job.currentAttempt + 1;
      const maxAttempts = job.maxAttempts || 6;

      if (newAttempt >= maxAttempts) {
        // Mark job as completed
        await this.markJobAsCompleted(job.id, 'Maximum attempts reached');
      } else {
        // Schedule next follow-up
        const nextDate = this.calculateNextSendDate(job.conference, job.stage);
        await this.updateJob(job.id, {
          currentAttempt: newAttempt,
          scheduledDate: nextDate,
          lastSentAt: new Date()
        });
      }
    } catch (error) {
      console.error('Error updating job after send:', error);
    }
  }

  /**
   * Update job
   * @param {string} jobId - Job ID
   * @param {Object} updateData - Update data
   */
  async updateJob(jobId, updateData) {
    try {
      const job = await FollowUpJob.findByPk(jobId);
      if (!job) return;

      await job.update(updateData);
      this.jobs.set(jobId, job);
    } catch (error) {
      console.error('Error updating job:', error);
    }
  }

  /**
   * Mark job as completed
   * @param {string} jobId - Job ID
   * @param {string} reason - Completion reason
   */
  async markJobAsCompleted(jobId, reason) {
    try {
      await this.updateJob(jobId, {
        status: 'completed',
        completedAt: new Date(),
        completionReason: reason
      });
      this.jobs.delete(jobId);
    } catch (error) {
      console.error('Error marking job as completed:', error);
    }
  }

  /**
   * Mark job as failed
   * @param {string} jobId - Job ID
   * @param {string} error - Error message
   */
  async markJobAsFailed(jobId, error) {
    try {
      await this.updateJob(jobId, {
        status: 'failed',
        failedAt: new Date(),
        errorMessage: error
      });
    } catch (error) {
      console.error('Error marking job as failed:', error);
    }
  }

  /**
   * Pause follow-up job
   * @param {string} jobId - Job ID
   * @param {string} reason - Pause reason
   */
  async pauseJob(jobId, reason) {
    try {
      await this.updateJob(jobId, {
        paused: true,
        pausedAt: new Date(),
        pauseReason: reason
      });
    } catch (error) {
      console.error('Error pausing job:', error);
    }
  }

  /**
   * Resume follow-up job
   * @param {string} jobId - Job ID
   */
  async resumeJob(jobId) {
    try {
      await this.updateJob(jobId, {
        paused: false,
        resumedAt: new Date()
      });
    } catch (error) {
      console.error('Error resuming job:', error);
    }
  }

  /**
   * Clean up completed jobs
   */
  async cleanupCompletedJobs() {
    try {
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      await FollowUpJob.destroy({
        where: {
          status: 'completed',
          completedAt: {
            [Op.lt]: cutoffDate
          }
        }
      });

      console.log('🧹 Cleaned up old completed jobs');
    } catch (error) {
      console.error('Error cleaning up completed jobs:', error);
    }
  }

  /**
   * Get job statistics
   * @returns {Object} Job statistics
   */
  async getJobStatistics() {
    try {
      const stats = await FollowUpJob.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status']
      });

      const totalJobs = await FollowUpJob.count();
      const activeJobs = await FollowUpJob.count({ where: { status: 'active' } });
      const completedJobs = await FollowUpJob.count({ where: { status: 'completed' } });
      const failedJobs = await FollowUpJob.count({ where: { status: 'failed' } });

      return {
        total: totalJobs,
        active: activeJobs,
        completed: completedJobs,
        failed: failedJobs,
        breakdown: stats
      };
    } catch (error) {
      console.error('Error getting job statistics:', error);
      return {};
    }
  }
}

module.exports = FollowUpAutomation;
