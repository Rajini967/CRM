const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const { formatEmailHtml, logEmailHtmlPayload } = require('../utils/emailHtmlFormatter');

class FollowUpService {
  constructor() {
    this.followUpJobs = [];
    this.isRunning = false;
    this.checkInterval = 60 * 1000; // Check every minute
    this.intervalId = null;
  }

  /**
   * Initialize follow-up service
   */
  async initialize(db) {
    this.db = db;
    this.followUpJobs = db.followupJobs || [];
    this.isRunning = true;
    
    console.log('Follow-up service initialized');
    this.startScheduler();
  }

  /**
   * Start the follow-up scheduler
   */
  startScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    this.intervalId = setInterval(() => {
      this.processFollowUps();
    }, this.checkInterval);

    console.log('Follow-up scheduler started');
  }

  /**
   * Stop the follow-up scheduler
   */
  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Follow-up scheduler stopped');
  }

  /**
   * Process all active follow-up jobs
   */
  async processFollowUps() {
    if (!this.isRunning || !this.db) return;

    const activeJobs = this.followUpJobs.filter(job => 
      job.status === 'active' && 
      !job.paused && 
      job.nextSendAt <= new Date()
    );

    for (const job of activeJobs) {
      try {
        await this.processFollowUpJob(job);
      } catch (error) {
        console.error(`Error processing follow-up job ${job.id}:`, error.message);
      }
    }
  }

  /**
   * Process a single follow-up job
   */
  async processFollowUpJob(job) {
    const client = this.db.clients.find(c => c.id === job.clientId);
    if (!client) {
      console.log(`Client not found for job ${job.id}`);
      return;
    }

    // Check if client has moved to next stage
    if (this.shouldMoveToNextStage(client, job)) {
      await this.moveToNextStage(job, client);
      return;
    }

    // Check if follow-up limit reached
    if (job.followUpCount >= job.maxFollowUps) {
      await this.completeJob(job, 'max_followups_reached');
      return;
    }

    // Send follow-up email
    await this.sendFollowUpEmail(job, client);
  }

  /**
   * Check if client should move to next stage
   */
  shouldMoveToNextStage(client, job) {
    if (job.stage === 'abstract_submission' && client.status === 'Abstract Submitted') {
      return true;
    }
    if (job.stage === 'registration' && client.status === 'Registered') {
      return true;
    }
    return false;
  }

  /**
   * Move client to next stage
   */
  async moveToNextStage(job, client) {
    console.log(`Moving client ${client.name} to next stage`);

    if (job.stage === 'abstract_submission') {
      // Move to registration stage
      const newJob = {
        id: uuidv4(),
        clientId: job.clientId,
        stage: 'registration',
        followUpCount: 0,
        maxFollowUps: 6,
        intervalDays: 3,
        nextSendAt: this.calculateNextSendDate(3),
        status: 'active',
        paused: false,
        createdAt: new Date(),
        createdBy: job.createdBy
      };

      this.followUpJobs.push(newJob);
      this.db.followupJobs.push(newJob);

      // Complete old job
      await this.completeJob(job, 'moved_to_next_stage');
    } else if (job.stage === 'registration') {
      // Complete registration stage
      await this.completeJob(job, 'registration_completed');
    }
  }

  /**
   * Complete a follow-up job
   */
  async completeJob(job, reason) {
    job.status = 'completed';
    job.completedAt = new Date();
    job.completionReason = reason;

    console.log(`Follow-up job ${job.id} completed: ${reason}`);
  }

  /**
   * Send follow-up email
   */
  async sendFollowUpEmail(job, client) {
    try {
      // Get template for this stage
      const template = this.getTemplateForStage(job.stage, job.followUpCount + 1);
      if (!template) {
        console.log(`No template found for stage ${job.stage}, follow-up ${job.followUpCount + 1}`);
        return;
      }

      // Process template variables
      const processedSubject = this.processTemplate(template.subject, client);
      const processedBody = this.processTemplate(template.bodyHtml, client);

      // Get SMTP account
      const smtpAccount = this.db.smtpAccounts.find(a => a.isSystem);
      if (!smtpAccount) {
        console.log('No SMTP account configured');
        return;
      }

      // Send email
      const result = await this.sendEmail(client.email, processedSubject, processedBody, smtpAccount);

      // Update job
      job.followUpCount++;
      job.lastSentAt = new Date();
      job.nextSendAt = this.calculateNextSendDate(job.intervalDays);

      // Create email log
      this.db.emailLogs.push({
        id: uuidv4(),
        clientId: client.id,
        from: smtpAccount.fromEmail,
        to: client.email,
        subject: processedSubject,
        bodyPreview: processedBody.substring(0, 100),
        status: result.success ? 'sent' : 'failed',
        smtpAccountId: smtpAccount.id,
        messageId: result.messageId,
        sentAt: new Date(),
        followUpJobId: job.id,
        templateId: template.id,
        attempts: 1,
        errorText: result.success ? null : result.error
      });

      // Create email record
      this.db.emails.push({
        id: uuidv4(),
        from: smtpAccount.fromEmail,
        to: client.email,
        subject: processedSubject,
        body: processedBody,
        bodyText: this.stripHtml(processedBody),
        isRead: false,
        isImportant: false,
        isDraft: false,
        isSent: true,
        isDeleted: false,
        threadId: uuidv4(),
        inReplyTo: null,
        attachments: [],
        sentAt: new Date(),
        receivedAt: null,
        clientId: client.id,
        userId: job.createdBy,
        followUpJobId: job.id,
        templateId: template.id
      });

      console.log(`Follow-up email sent to ${client.name} (${job.stage}, #${job.followUpCount})`);

    } catch (error) {
      console.error(`Error sending follow-up email:`, error.message);
    }
  }

  /**
   * Get template for stage and follow-up number
   */
  getTemplateForStage(stage, followUpNumber) {
    const templates = this.db.templates.filter(t => 
      t.stage === stage && 
      t.isActive && 
      t.followUpNumber === followUpNumber
    );

    return templates[0] || templates.find(t => t.followUpNumber === null);
  }

  /**
   * Process template variables
   */
  processTemplate(template, client) {
    let processed = template;

    // Get conference details
    const conference = this.db.conferences[0] || {};
    
    const variables = {
      '{{client_name}}': client.name,
      '{{client_email}}': client.email,
      '{{client_country}}': client.country,
      '{{conference_name}}': conference.name || 'Conference',
      '{{conference_date}}': conference.date || 'TBD',
      '{{conference_venue}}': conference.venue || 'TBD',
      '{{abstract_deadline}}': conference.abstractDeadline || 'TBD',
      '{{registration_deadline}}': conference.registrationDeadline || 'TBD'
    };

    Object.entries(variables).forEach(([placeholder, value]) => {
      processed = processed.replace(new RegExp(placeholder, 'g'), value);
    });

    return processed;
  }

  /**
   * Calculate next send date (skip weekends)
   */
  calculateNextSendDate(intervalDays) {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);

    // Skip weekends
    while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }

    return nextDate;
  }

  /**
   * Send email using SMTP
   */
  async sendEmail(to, subject, body, smtpAccount) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpAccount.host,
        port: Number(smtpAccount.port) || 587,
        secure: Number(smtpAccount.port) === 465, // true for 465, false for other ports
        requireTLS: Number(smtpAccount.port) === 587, // require TLS for port 587
        tls: {
          rejectUnauthorized: false, // Allow self-signed certificates
          ciphers: 'SSLv3'
        },
        auth: {
          user: smtpAccount.smtpUsername || smtpAccount.username,
          pass: require('../utils/passwordUtils').decryptEmailPassword(smtpAccount.smtpPassword || smtpAccount.password)
        }
      });

      const formattedBodyHtml = formatEmailHtml(body);
      logEmailHtmlPayload('legacy-follow-up', formattedBodyHtml);
      const htmlPayload = formattedBodyHtml || body;

      const info = await transporter.sendMail({
        from: smtpAccount.fromEmail,
        to: to,
        subject: subject,
        html: htmlPayload
      });

      return {
        success: true,
        messageId: info.messageId
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Strip HTML tags from text
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Create follow-up job for client
   */
  createFollowUpJob(clientId, stage, createdBy, customInterval = null) {
    const intervalDays = customInterval || (stage === 'abstract_submission' ? 7 : 3);
    
    const job = {
      id: uuidv4(),
      clientId: clientId,
      stage: stage,
      followUpCount: 0,
      maxFollowUps: 6,
      intervalDays: intervalDays,
      nextSendAt: this.calculateNextSendDate(intervalDays),
      status: 'active',
      paused: false,
      createdAt: new Date(),
      createdBy: createdBy
    };

    this.followUpJobs.push(job);
    this.db.followupJobs.push(job);

    return job;
  }

  /**
   * Pause follow-up job
   */
  pauseJob(jobId) {
    const job = this.followUpJobs.find(j => j.id === jobId);
    if (job) {
      job.paused = true;
      job.pausedAt = new Date();
    }
  }

  /**
   * Resume follow-up job
   */
  resumeJob(jobId) {
    const job = this.followUpJobs.find(j => j.id === jobId);
    if (job) {
      job.paused = false;
      job.resumedAt = new Date();
    }
  }

  /**
   * Stop follow-up job
   */
  stopJob(jobId) {
    const job = this.followUpJobs.find(j => j.id === jobId);
    if (job) {
      job.status = 'stopped';
      job.stoppedAt = new Date();
    }
  }

  /**
   * Get follow-up statistics
   */
  getStatistics() {
    const totalJobs = this.followUpJobs.length;
    const activeJobs = this.followUpJobs.filter(j => j.status === 'active').length;
    const pausedJobs = this.followUpJobs.filter(j => j.paused).length;
    const completedJobs = this.followUpJobs.filter(j => j.status === 'completed').length;
    const totalEmailsSent = this.followUpJobs.reduce((sum, job) => sum + job.followUpCount, 0);

    return {
      totalJobs,
      activeJobs,
      pausedJobs,
      completedJobs,
      totalEmailsSent
    };
  }
}

module.exports = FollowUpService;
