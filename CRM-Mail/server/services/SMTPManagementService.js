const { EmailAccount } = require('../models');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { prepareAttachmentsForSending } = require('../utils/attachmentUtils');
const { formatEmailHtml, logEmailHtmlPayload } = require('../utils/emailHtmlFormatter');

class SMTPManagementService {
  constructor() {
    this.transporters = new Map();
    this.healthChecks = new Map();
  }

  /**
   * Create SMTP account
   * @param {Object} accountData - Account data
   * @returns {Object} Created account
   */
  async createSMTPAccount(accountData) {
    try {
      const {
        organizationId,
        name,
        email,
        host,
        port,
        secure,
        username,
        password,
        fromName,
        fromEmail,
        replyTo,
        maxEmailsPerDay,
        maxEmailsPerHour
      } = accountData;

      // Validate required fields
      if (!name || !email || !host || !port || !username || !password) {
        throw new Error('Missing required fields: name, email, host, port, username, password');
      }

      // Test SMTP connection
      const testResult = await this.testSMTPConnection({
        host,
        port,
        secure,
        username,
        password
      });

      if (!testResult.success) {
        throw new Error(`SMTP connection failed: ${testResult.error}`);
      }

      const maxPriority = await EmailAccount.max('sendPriority');
      const nextPriority = Number.isFinite(maxPriority) ? maxPriority + 1 : 1;

      // Create account
      const account = await EmailAccount.create({
        organizationId,
        name,
        email,
        type: 'smtp',
        smtpHost: host,
        smtpPort: port,
        smtpSecure: secure,
        smtpUsername: username,
        smtpPassword: this.encryptPassword(password),
        fromName: fromName || name,
        fromEmail: fromEmail || email,
        replyTo: replyTo || email,
        maxEmailsPerDay: maxEmailsPerDay || 1000,
        maxEmailsPerHour: maxEmailsPerHour || 100,
        isActive: true,
        isDefault: false,
        sendPriority: nextPriority,
        reputationScore: 100,
        dailyEmailCount: 0,
        hourlyEmailCount: 0,
        lastUsed: new Date(),
        createdBy: accountData.userId
      });

      // Initialize transporter
      await this.initializeTransporter(account.id);

      return account;
    } catch (error) {
      console.error('Error creating SMTP account:', error);
      throw error;
    }
  }

  /**
   * Get SMTP accounts
   * @param {string} organizationId - Organization ID
   * @returns {Array} SMTP accounts
   */
  async getSMTPAccounts(organizationId) {
    try {
      const accounts = await EmailAccount.findAll({
        where: {
          organizationId,
          type: ['smtp', 'both']
        },
        order: [
          ['sendPriority', 'ASC'],
          ['createdAt', 'ASC']
        ]
      });

      return accounts.map(account => ({
        id: account.id,
        name: account.name,
        email: account.email,
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        fromName: account.fromName,
        fromEmail: account.fromEmail,
        replyTo: account.replyTo,
        isActive: account.isActive,
        isDefault: account.isDefault,
        sendPriority: account.sendPriority,
        reputationScore: account.reputationScore,
        dailyEmailCount: account.dailyEmailCount,
        hourlyEmailCount: account.hourlyEmailCount,
        maxEmailsPerDay: account.maxEmailsPerDay,
        maxEmailsPerHour: account.maxEmailsPerHour,
        lastUsed: account.lastUsed,
        createdAt: account.createdAt
      }));
    } catch (error) {
      console.error('Error getting SMTP accounts:', error);
      throw error;
    }
  }

  /**
   * Get health status
   * @param {string} accountId - Account ID
   * @returns {Object} Health status
   */
  async getHealthStatus(accountId) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      const healthCheck = this.healthChecks.get(accountId);
      if (healthCheck && Date.now() - healthCheck.timestamp < 5 * 60 * 1000) {
        return healthCheck.data;
      }

      // Perform health check
      const healthStatus = await this.performHealthCheck(accountId);
      
      // Cache the result
      this.healthChecks.set(accountId, {
        data: healthStatus,
        timestamp: Date.now()
      });

      return healthStatus;
    } catch (error) {
      console.error('Error getting health status:', error);
      throw error;
    }
  }

  /**
   * Perform health check
   * @param {string} accountId - Account ID
   * @returns {Object} Health check result
   */
  async performHealthCheck(accountId) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      const startTime = Date.now();
      
      // Test connection
      const connectionTest = await this.testSMTPConnection({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        username: account.smtpUsername,
        password: this.decryptPassword(account.smtpPassword)
      });

      const responseTime = Date.now() - startTime;

      const healthStatus = {
        accountId,
        status: connectionTest.success ? 'healthy' : 'unhealthy',
        responseTime: `${responseTime}ms`,
        connectionTest: connectionTest,
        reputationScore: account.reputationScore,
        dailyEmailCount: account.dailyEmailCount,
        hourlyEmailCount: account.hourlyEmailCount,
        maxEmailsPerDay: account.maxEmailsPerDay,
        maxEmailsPerHour: account.maxEmailsPerHour,
        isActive: account.isActive,
        lastUsed: account.lastUsed,
        timestamp: new Date()
      };

      // Update account with health status
      await account.update({
        lastHealthCheck: new Date(),
        healthStatus: healthStatus.status,
        responseTime: responseTime
      });

      return healthStatus;
    } catch (error) {
      console.error('Error performing health check:', error);
      return {
        accountId,
        status: 'error',
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Test SMTP connection
   * @param {Object} config - SMTP configuration
   * @returns {Object} Test result
   */
  async testSMTPConnection(config) {
    try {
      const transporter = nodemailer.createTransporter({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
          user: config.username,
          pass: config.password
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      await transporter.verify();
      await transporter.close();

      return {
        success: true,
        message: 'SMTP connection successful'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize transporter
   * @param {string} accountId - Account ID
   */
  async initializeTransporter(accountId) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      const transporter = nodemailer.createTransporter({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpSecure,
        auth: {
          user: account.smtpUsername,
          pass: this.decryptPassword(account.smtpPassword)
        },
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        rateLimit: account.maxEmailsPerHour || 100
      });

      this.transporters.set(accountId, transporter);
    } catch (error) {
      console.error('Error initializing transporter:', error);
      throw error;
    }
  }

  /**
   * Get transporter
   * @param {string} accountId - Account ID
   * @returns {Object} Transporter
   */
  getTransporter(accountId) {
    return this.transporters.get(accountId);
  }

  /**
   * Send email
   * @param {string} accountId - Account ID
   * @param {Object} emailData - Email data
   * @returns {Object} Send result
   */
  async sendEmail(accountId, emailData) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      // Check rate limits
      await this.checkRateLimits(account);

      const transporter = this.getTransporter(accountId);
      if (!transporter) {
        await this.initializeTransporter(accountId);
        const transporter = this.getTransporter(accountId);
      }

      const formattedBodyHtml = formatEmailHtml(emailData.bodyHtml || emailData.bodyText || '');
      logEmailHtmlPayload('smtp-management', formattedBodyHtml);
      const htmlPayload = formattedBodyHtml || emailData.bodyHtml || '';
      const textPayload = emailData.bodyText || (htmlPayload ? htmlPayload.replace(/<[^>]*>/g, '') : '');

      const mailOptions = {
        from: `${account.fromName} <${account.fromEmail}>`,
        to: emailData.to,
        subject: emailData.subject,
        html: htmlPayload || textPayload,
        text: textPayload,
        replyTo: account.replyTo
      };

      const normalizedAttachments = prepareAttachmentsForSending(emailData.attachments);
      if (normalizedAttachments.length > 0) {
        mailOptions.attachments = normalizedAttachments;
      }

      const result = await transporter.sendMail(mailOptions);

      // Update account usage
      await this.updateAccountUsage(account);

      return {
        success: true,
        messageId: result.messageId,
        response: result.response
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Check rate limits
   * @param {Object} account - Account object
   */
  async checkRateLimits(account) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

    // Check daily limit
    if (account.dailyEmailCount >= account.maxEmailsPerDay) {
      throw new Error('Daily email limit reached');
    }

    // Check hourly limit
    if (account.hourlyEmailCount >= account.maxEmailsPerHour) {
      throw new Error('Hourly email limit reached');
    }

    // Reset counters if needed
    if (account.lastUsed < today) {
      await account.update({ dailyEmailCount: 0 });
    }

    if (account.lastUsed < currentHour) {
      await account.update({ hourlyEmailCount: 0 });
    }
  }

  /**
   * Update account usage
   * @param {Object} account - Account object
   */
  async updateAccountUsage(account) {
    try {
      await account.update({
        dailyEmailCount: account.dailyEmailCount + 1,
        hourlyEmailCount: account.hourlyEmailCount + 1,
        lastUsed: new Date()
      });
    } catch (error) {
      console.error('Error updating account usage:', error);
    }
  }

  /**
   * Encrypt password
   * @param {string} password - Password to encrypt
   * @returns {string} Encrypted password
   */
  encryptPassword(password) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(algorithm, key);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt password
   * @param {string} encryptedPassword - Encrypted password
   * @returns {string} Decrypted password
   */
  decryptPassword(encryptedPassword) {
    try {
      const algorithm = 'aes-256-cbc';
      const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-key', 'salt', 32);
      const [ivHex, encrypted] = encryptedPassword.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipher(algorithm, key);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('Error decrypting password:', error);
      return encryptedPassword; // Return original if decryption fails
    }
  }

  /**
   * Update account reputation
   * @param {string} accountId - Account ID
   * @param {number} scoreChange - Score change
   */
  async updateAccountReputation(accountId, scoreChange) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      const newScore = Math.max(0, Math.min(100, account.reputationScore + scoreChange));
      await account.update({ reputationScore: newScore });

      return newScore;
    } catch (error) {
      console.error('Error updating account reputation:', error);
      throw error;
    }
  }

  /**
   * Get account statistics
   * @param {string} accountId - Account ID
   * @returns {Object} Account statistics
   */
  async getAccountStatistics(accountId) {
    try {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('SMTP account not found');
      }

      return {
        accountId,
        name: account.name,
        email: account.email,
        reputationScore: account.reputationScore,
        dailyEmailCount: account.dailyEmailCount,
        hourlyEmailCount: account.hourlyEmailCount,
        maxEmailsPerDay: account.maxEmailsPerDay,
        maxEmailsPerHour: account.maxEmailsPerHour,
        dailyUsagePercentage: Math.round((account.dailyEmailCount / account.maxEmailsPerDay) * 100),
        hourlyUsagePercentage: Math.round((account.hourlyEmailCount / account.maxEmailsPerHour) * 100),
        lastUsed: account.lastUsed,
        isActive: account.isActive,
        healthStatus: account.healthStatus,
        responseTime: account.responseTime
      };
    } catch (error) {
      console.error('Error getting account statistics:', error);
      throw error;
    }
  }

  /**
   * Cleanup old transporters
   */
  cleanupTransporters() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes

    for (const [accountId, transporter] of this.transporters.entries()) {
      if (now - transporter.lastUsed > timeout) {
        transporter.close();
        this.transporters.delete(accountId);
      }
    }
  }
}

module.exports = SMTPManagementService;