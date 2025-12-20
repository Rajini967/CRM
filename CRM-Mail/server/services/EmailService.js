const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { Email, EmailAccount, EmailFolder, EmailThread, EmailLog, Client } = require('../models');
const { prepareAttachmentsForSending } = require('../utils/attachmentUtils');
const { decryptEmailPassword } = require('../utils/passwordUtils');
const { formatEmailHtml, logEmailHtmlPayload } = require('../utils/emailHtmlFormatter');

class EmailService {
  constructor() {
    this.connections = new Map();
    this.syncIntervals = new Map();
    this.isRunning = false;
  }

  // Initialize email service
  async initialize() {
    try {
      console.log('📧 Initializing Email Service...');
      
      // Load active email accounts
      const accounts = await EmailAccount.findAll({
        where: { isActive: true, syncStatus: 'active' },
        order: [
          ['sendPriority', 'ASC'],
          ['createdAt', 'ASC']
        ]
      });

      for (const account of accounts) {
        await this.setupAccountSync(account);
      }

      this.isRunning = true;
      console.log('✅ Email Service initialized successfully');
    } catch (error) {
      console.error('❌ Email Service initialization failed:', error);
      throw error;
    }
  }

  // Setup account synchronization
  async setupAccountSync(account) {
    try {
      // Setup IMAP connection for inbound emails
      if (account.type === 'imap' || account.type === 'both') {
        await this.setupIMAPConnection(account);
      }

      // Setup SMTP connection for outbound emails
      if (account.type === 'smtp' || account.type === 'both') {
        await this.setupSMTPConnection(account);
      }

      // Start sync interval
      this.startSyncInterval(account);
      
      console.log(`✅ Account sync setup completed for ${account.email}`);
    } catch (error) {
      console.error(`❌ Account sync setup failed for ${account.email}:`, error);
      await this.updateAccountStatus(account.id, 'error', error.message);
    }
  }

  // Setup IMAP connection
  async setupIMAPConnection(account) {
    const config = {
      host: account.imapHost,
      port: account.imapPort,
      secure: account.imapSecure,
      auth: {
        user: account.imapUsername,
        pass: decryptEmailPassword(account.imapPassword)
      },
      logger: false
    };

    const client = new ImapFlow(config);
    await client.connect();
    
    this.connections.set(`imap_${account.id}`, client);
    await this.updateAccountStatus(account.id, 'active');
  }

  // Setup SMTP connection
  async setupSMTPConnection(account) {
    const config = {
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465, // true for 465, false for other ports
      requireTLS: account.smtpPort === 587, // require TLS for port 587
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
        ciphers: 'SSLv3'
      },
      auth: {
        user: account.smtpUsername,
        pass: decryptEmailPassword(account.smtpPassword)
      }
    };

    const transporter = nodemailer.createTransport(config);
    
    // Verify connection
    await transporter.verify();
    
    this.connections.set(`smtp_${account.id}`, transporter);
    await this.updateAccountStatus(account.id, 'active');
  }

  // Start sync interval
  startSyncInterval(account) {
    const interval = setInterval(async () => {
      try {
        await this.syncAccount(account);
      } catch (error) {
        console.error(`Sync error for account ${account.email}:`, error);
      }
    }, account.syncInterval * 1000);

    this.syncIntervals.set(account.id, interval);
  }

  // Sync account emails
  async syncAccount(account) {
    try {
      if (account.type === 'imap' || account.type === 'both') {
        await this.syncInboundEmails(account);
      }
      
      await this.updateLastSync(account.id);
    } catch (error) {
      console.error(`Sync failed for account ${account.email}:`, error);
      await this.updateAccountStatus(account.id, 'error', error.message);
    }
  }

  // Sync inbound emails
  async syncInboundEmails(account) {
    const client = this.connections.get(`imap_${account.id}`);
    if (!client) return;

    try {
      // Get folders
      const folders = await this.getFolders(client, account);
      
      for (const folder of folders) {
        await this.syncFolder(client, account, folder);
      }
    } catch (error) {
      console.error(`Inbound sync failed for ${account.email}:`, error);
      throw error;
    }
  }

  // Get folders from IMAP
  async getFolders(client, account) {
    const folders = [];
    
    for await (const folder of client.list()) {
      const folderData = {
        name: folder.name,
        path: folder.path,
        delimiter: folder.delimiter,
        attributes: folder.attributes,
        emailAccountId: account.id
      };

      // Create or update folder
      const [folderRecord, created] = await EmailFolder.findOrCreate({
        where: { path: folder.path, emailAccountId: account.id },
        defaults: folderData
      });

      if (!created) {
        await folderRecord.update(folderData);
      }

      folders.push(folderRecord);
    }

    return folders;
  }

  // Sync folder emails
  async syncFolder(client, account, folder) {
    try {
      await client.mailboxOpen(folder.path);
      
      const messageCount = client.mailbox.messages;
      const unseenCount = client.mailbox.unseen;
      
      // Update folder counts
      await folder.update({
        messageCount,
        unreadCount: unseenCount
      });

      // Get recent emails
      const messages = client.fetch({
        from: Math.max(1, messageCount - account.maxEmailsPerSync + 1),
        to: messageCount
      }, { envelope: true, uid: true, flags: true, bodyParts: true });

      for await (const message of messages) {
        await this.processInboundEmail(client, account, folder, message);
      }
    } catch (error) {
      console.error(`Folder sync failed for ${folder.path}:`, error);
    }
  }

  // Process inbound email
  async processInboundEmail(client, account, folder, message) {
    try {
      // Check if email already exists
      const existingEmail = await Email.findOne({
        where: { 
          messageId: message.envelope.messageId,
          emailAccountId: account.id
        }
      });

      if (existingEmail) return;

      // Parse email
      const parsed = await simpleParser(message.bodyParts);
      
      // Extract participants
      const participants = this.extractParticipants(parsed);
      
      // Find or create thread
      const thread = await this.findOrCreateThread(account, parsed, participants);
      
      // Create email record
      const emailData = {
        messageId: parsed.messageId,
        uid: message.uid,
        from: parsed.from?.text || '',
        fromName: parsed.from?.value?.[0]?.name || '',
        to: parsed.to?.text || '',
        toName: parsed.to?.value?.[0]?.name || '',
        cc: parsed.cc?.text || '',
        ccName: parsed.cc?.value?.[0]?.name || '',
        bcc: parsed.bcc?.text || '',
        bccName: parsed.bcc?.value?.[0]?.name || '',
        subject: parsed.subject || '',
        body: parsed.text || '',
        bodyHtml: parsed.html || '',
        bodyText: parsed.text || '',
        folderId: folder.id,
        folder: folder.type || 'inbox',
        isRead: message.flags.has('\\Seen'),
        isImportant: message.flags.has('\\Flagged'),
        isStarred: message.flags.has('\\Flagged'),
        hasAttachments: parsed.attachments?.length > 0,
        attachments: parsed.attachments?.map(att => ({
          filename: att.filename,
          contentType: att.contentType,
          size: att.size,
          cid: att.cid
        })) || [],
        date: parsed.date || new Date(),
        size: parsed.size || 0,
        emailAccountId: account.id,
        threadId: thread.id,
        isSent: false,
        isDraft: false,
        replyTo: parsed.replyTo?.text || '',
        inReplyTo: parsed.inReplyTo || '',
        references: parsed.references || '',
        flags: Array.from(message.flags),
        status: 'delivered',
        priority: this.determinePriority(parsed)
      };

      const email = await Email.create(emailData);

      // Link to client if possible
      await this.linkEmailToClient(email, participants);

      // Update thread
      await this.updateThread(thread, email);

      console.log(`📧 Processed inbound email: ${email.subject}`);
    } catch (error) {
      console.error('Error processing inbound email:', error);
    }
  }

  // Extract participants from email
  extractParticipants(parsed) {
    const participants = new Set();
    
    if (parsed.from?.value) {
      parsed.from.value.forEach(addr => participants.add(addr.address));
    }
    if (parsed.to?.value) {
      parsed.to.value.forEach(addr => participants.add(addr.address));
    }
    if (parsed.cc?.value) {
      parsed.cc.value.forEach(addr => participants.add(addr.address));
    }
    if (parsed.bcc?.value) {
      parsed.bcc.value.forEach(addr => participants.add(addr.address));
    }

    return Array.from(participants);
  }

  // Find or create email thread
  async findOrCreateThread(account, parsed, participants) {
    const subject = parsed.subject || '';
    const cleanSubject = subject.replace(/^(Re:|Fwd?:|AW:)\s*/i, '');
    
    // Try to find existing thread
    let thread = await EmailThread.findOne({
      where: {
        emailAccountId: account.id,
        subject: cleanSubject
      }
    });

    if (!thread) {
      thread = await EmailThread.create({
        subject: cleanSubject,
        participants,
        emailAccountId: account.id,
        lastMessageAt: parsed.date || new Date()
      });
    }

    return thread;
  }

  // Update thread with new email
  async updateThread(thread, email) {
    await thread.update({
      lastMessageId: email.id,
      lastMessageAt: email.date,
      messageCount: thread.messageCount + 1,
      isRead: email.isRead,
      isImportant: email.isImportant || thread.isImportant,
      isStarred: email.isStarred || thread.isStarred
    });
  }

  // Link email to client
  async linkEmailToClient(email, participants) {
    for (const participant of participants) {
      const client = await Client.findOne({
        where: { email: participant }
      });

      if (client) {
        await email.update({
          clientId: client.id,
          parentId: client.id,
          parentType: 'contact'
        });
        break;
      }
    }
  }

  // Determine email priority
  determinePriority(parsed) {
    const subject = (parsed.subject || '').toLowerCase();
    const body = (parsed.text || '').toLowerCase();
    
    if (subject.includes('urgent') || subject.includes('asap') || body.includes('urgent')) {
      return 'urgent';
    }
    if (subject.includes('important') || body.includes('important')) {
      return 'high';
    }
    if (subject.includes('low priority') || body.includes('low priority')) {
      return 'low';
    }
    
    return 'normal';
  }

  // Send email
  async sendEmail(accountId, emailData) {
    try {
      const transporter = this.connections.get(`smtp_${accountId}`);
      if (!transporter) {
        throw new Error('SMTP connection not found');
      }

      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        throw new Error('Email account not found');
      }

      const formattedBodyHtml = formatEmailHtml(emailData.bodyHtml || emailData.bodyText || '');
      logEmailHtmlPayload('email-service', formattedBodyHtml);
      const htmlPayload = formattedBodyHtml || emailData.bodyHtml || '';
      const textPayload = emailData.bodyText || (htmlPayload ? htmlPayload.replace(/<[^>]*>/g, '') : '');

      // Create email record
      const email = await Email.create({
        ...emailData,
        body: textPayload || emailData.body || '',
        bodyHtml: htmlPayload,
        bodyText: textPayload,
        emailAccountId: accountId,
        isSent: true,
        status: 'sent',
        trackingId: uuidv4()
      });

      // Send email
      const normalizedAttachments = prepareAttachmentsForSending(emailData.attachments);

      const mailOptions = {
        from: `${account.name} <${account.email}>`,
        to: emailData.to,
        cc: emailData.cc,
        bcc: emailData.bcc,
        subject: emailData.subject,
        text: textPayload,
        html: htmlPayload || textPayload
      };

      if (normalizedAttachments.length > 0) {
        mailOptions.attachments = normalizedAttachments;
      }

      const result = await transporter.sendMail(mailOptions);

      // Update email with message ID
      await email.update({
        messageId: result.messageId,
        deliveredAt: new Date()
      });

      // Create email log
      await EmailLog.create({
        emailId: email.id,
        action: 'sent',
        details: { messageId: result.messageId }
      });

      console.log(`📤 Email sent: ${email.subject}`);
      return email;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // Update account status
  async updateAccountStatus(accountId, status, errorMessage = null) {
    await EmailAccount.update(
      { 
        syncStatus: status,
        errorMessage 
      },
      { where: { id: accountId } }
    );
  }

  // Update last sync time
  async updateLastSync(accountId) {
    await EmailAccount.update(
      { lastSyncAt: new Date() },
      { where: { id: accountId } }
    );
  }

  // Stop account sync
  async stopAccountSync(accountId) {
    const interval = this.syncIntervals.get(accountId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(accountId);
    }

    const imapClient = this.connections.get(`imap_${accountId}`);
    if (imapClient) {
      await imapClient.close();
      this.connections.delete(`imap_${accountId}`);
    }
  }

  // Cleanup
  async cleanup() {
    console.log('🧹 Cleaning up Email Service...');
    
    // Stop all sync intervals
    for (const [accountId, interval] of this.syncIntervals) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();

    // Close all connections
    for (const [key, connection] of this.connections) {
      if (connection.close) {
        await connection.close();
      }
    }
    this.connections.clear();

    this.isRunning = false;
    console.log('✅ Email Service cleanup completed');
  }
}

module.exports = EmailService;
