const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const { decryptEmailPassword } = require('../utils/passwordUtils');

class ImapService {
  constructor() {
    this.connections = new Map();
    this.isPolling = false;
    this.pollInterval = 2 * 60 * 1000; // 2 minutes
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  /**
   * Validate and normalize IMAP configuration
   */
  validateImapConfig(account) {
    const errors = [];
    
    if (!account.imapHost) {
      errors.push('IMAP Host is required');
    } else {
      // Fix common hostname mistakes
      let host = account.imapHost.toLowerCase().trim();
      
      // Fix common Gmail mistakes
      if (host.includes('gmail.com') && !host.startsWith('imap.')) {
        host = 'imap.gmail.com';
      }
      
      // Fix common Outlook mistakes
      if (host.includes('outlook.com') && !host.startsWith('outlook.')) {
        host = 'outlook.office365.com';
      }
      
      // Fix common Yahoo mistakes
      if (host.includes('yahoo.com') && !host.startsWith('imap.')) {
        host = 'imap.mail.yahoo.com';
      }
      
      account.imapHost = host;
    }
    
    if (!account.imapUsername) {
      errors.push('IMAP Username is required');
    }
    
    if (!account.imapPassword) {
      errors.push('IMAP Password is required');
    }
    
    // Set default port if not specified
    if (!account.imapPort) {
      account.imapPort = 993;
    }
    
    // Set default security if not specified
    if (!account.imapSecurity) {
      account.imapSecurity = 'ssl';
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      account
    };
  }

  /**
   * Create IMAP connection for an account
   */
  async createConnection(account) {
    const connectionId = account.id;
    
    // Validate and normalize configuration
    const validation = this.validateImapConfig(account);
    if (!validation.isValid) {
      throw new Error(`IMAP configuration invalid: ${validation.errors.join(', ')}`);
    }
    
    const normalizedAccount = validation.account;
    
    try {
      console.log(`Connecting to IMAP: ${normalizedAccount.imapHost}:${normalizedAccount.imapPort}`);
      
      const client = new ImapFlow({
        host: normalizedAccount.imapHost,
        port: Number(normalizedAccount.imapPort) || 993,
        secure: normalizedAccount.imapSecurity === 'ssl' || Number(normalizedAccount.imapPort) === 993,
        auth: {
          user: normalizedAccount.imapUsername,
          pass: decryptEmailPassword(normalizedAccount.imapPassword)
        },
        logger: false, // Disable ImapFlow logging
        tls: {
          rejectUnauthorized: false // Allow self-signed certificates
        }
      });

      // Enhanced error handling
      client.on('error', (err) => {
        console.error(`IMAP Error for account ${account.name}:`, err.message);
        this.handleConnectionError(connectionId, err);
      });

      client.on('close', () => {
        console.log(`IMAP connection closed for account ${account.name}`);
        this.connections.delete(connectionId);
      });

      await client.connect();
      
      this.connections.set(connectionId, {
        client,
        account,
        lastActivity: new Date(),
        retryCount: 0,
        isConnected: true
      });

      console.log(`IMAP connected for account: ${account.name}`);
      return client;
    } catch (error) {
      console.error(`Failed to connect IMAP for account ${account.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle connection errors with retry logic
   */
  async handleConnectionError(connectionId, error) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    connection.retryCount++;
    connection.isConnected = false;

    if (connection.retryCount < this.maxRetries) {
      console.log(`Retrying IMAP connection for ${connection.account.name} (attempt ${connection.retryCount})`);
      setTimeout(() => {
        this.reconnect(connectionId);
      }, this.retryDelay * connection.retryCount);
    } else {
      console.error(`Max retries reached for IMAP account ${connection.account.name}`);
      this.connections.delete(connectionId);
    }
  }

  /**
   * Reconnect to IMAP server
   */
  async reconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      await connection.client.logout();
    } catch (e) {
      // Ignore logout errors
    }

    try {
      await this.createConnection(connection.account);
    } catch (error) {
      console.error(`Reconnection failed for ${connection.account.name}:`, error.message);
    }
  }

  /**
   * Test IMAP connection
   */
  async testConnection(account) {
    try {
      const client = await this.createConnection(account);
      const lock = await client.getMailboxLock(account.imapFolder || 'INBOX');
      
      try {
        // Test basic operations
        const status = await client.status(account.imapFolder || 'INBOX', { messages: true, unseen: true });
        console.log(`IMAP test successful for ${account.name}: ${status.messages} messages, ${status.unseen} unseen`);
        return { success: true, message: 'IMAP connection successful', status };
      } finally {
        lock.release();
        await client.logout();
      }
    } catch (error) {
      console.error(`IMAP test failed for ${account.name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Gmail folder mapping
   */
  getGmailFolders() {
    return {
      'INBOX': 'inbox',
      '[Gmail]/Sent Mail': 'sent',
      '[Gmail]/All Mail': 'all',
      '[Gmail]/Spam': 'spam',
      '[Gmail]/Trash': 'trash',
      '[Gmail]/Drafts': 'drafts',
      '[Gmail]/Important': 'important',
      'Sent': 'sent',
      'Drafts': 'drafts',
      'Trash': 'trash',
      'Spam': 'spam',
      'CATEGORY_PROMOTIONS': 'promotions',
      '[Gmail]/Promotions': 'promotions'
    };
  }

  /**
   * Fetch emails from a specific folder
   */
  async fetchEmailsFromFolder(client, account, folderName, folderType, options = {}) {
    const {
      maxMessages = 500,
      unseenOnly = false,
      since = null
    } = options;

    try {
      const lock = await client.getMailboxLock(folderName);
      
      try {
        // Build search criteria
        let searchCriteria = {};
        if (unseenOnly) {
          searchCriteria.seen = false;
        }
        if (since) {
          searchCriteria.since = since;
        }

        // Search for messages
        const messages = await client.search(searchCriteria);
        
        if (messages.length === 0) {
          return [];
        }

        // Fetch recent messages (limit to maxMessages)
        const recentMessages = messages.slice(-maxMessages);
        const fetcher = await client.fetch(recentMessages, { 
          envelope: true, 
          source: true, 
          internalDate: true,
          uid: true,
          flags: true
        });

        const emails = [];
        for await (let msg of fetcher) {
          try {
            const parsed = await simpleParser(msg.source);
            
            let references = parsed.headers.get('references');
            if (references && typeof references !== 'string') {
              references = Array.isArray(references) ? references.join(' ') : String(references);
            }
            
            // Extract body content properly
            const bodyHtml = parsed.html || '';
            const bodyText = parsed.text || '';
            const body = bodyHtml || (bodyText ? `<pre>${bodyText}</pre>` : '');
            
            // For drafts, generate messageId if missing
            let messageId = parsed.messageId;
            if (!messageId && (msg.flags?.has('\\Draft') || folderType === 'drafts')) {
              messageId = `draft-${msg.uid}-${account.id}-${Date.now()}`;
            }
            
            // Log draft content for debugging
            if (msg.flags?.has('\\Draft') || folderType === 'drafts') {
              console.log(`📝 Draft detected in ImapService - Subject: "${parsed.subject}", HTML length: ${bodyHtml.length}, Text length: ${bodyText.length}, UID: ${msg.uid}`);
            }
            
            const email = {
              id: uuidv4(),
              uid: msg.uid,
              from: parsed.from?.text || '',
              to: parsed.to?.text || '',
              cc: parsed.cc?.text || '',
              bcc: parsed.bcc?.text || '',
              subject: parsed.subject || '(no subject)',
              body: body,
              bodyHtml: bodyHtml, // Ensure bodyHtml is set
              bodyText: bodyText, // Ensure bodyText is set
              isRead: msg.flags?.has('\\Seen') || false,
              isImportant: msg.flags?.has('\\Flagged') || false,
              isDraft: msg.flags?.has('\\Draft') || folderType === 'drafts',
              isSent: folderType === 'sent',
              isDeleted: folderType === 'trash',
              folder: folderType,
              threadId: null,
              inReplyTo: parsed.headers.get('in-reply-to') || null,
              attachments: JSON.stringify((parsed.attachments || []).map(a => ({ 
                filename: a.filename, 
                size: a.size,
                contentType: a.contentType,
                contentId: a.contentId
              }))),
              sentAt: parsed.date ? new Date(parsed.date) : new Date(),
              receivedAt: msg.internalDate ? new Date(msg.internalDate) : new Date(),
              date: parsed.date ? new Date(parsed.date) : new Date(),
              clientId: null,
              userId: null,
              emailAccountId: account.id,
              flags: Array.from(msg.flags || []),
              messageId: messageId, // Use generated messageId for drafts if needed
              references: references || null,
              status: (msg.flags?.has('\\Draft') || folderType === 'drafts') ? 'draft' : 'sent' // Set status for drafts
            };

            emails.push(email);
          } catch (parseError) {
            console.error(`Failed to parse email:`, parseError.message);
          }
        }

        console.log(`📬 Fetched ${emails.length} emails from folder: ${folderName}`);
        return emails;

      } finally {
        lock.release();
      }
    } catch (error) {
      console.error(`Error fetching from folder ${folderName}:`, error.message);
      return [];
    }
  }

  /**
   * Fetch emails from IMAP account (supports multiple folders)
   */
  async fetchEmails(account, options = {}) {
    const {
      maxMessages = 500,
      unseenOnly = false,
      since = null,
      folders = null // null means fetch from all folders
    } = options;

    let connection = this.connections.get(account.id);
    
    // Create connection if not exists
    if (!connection || !connection.isConnected) {
      try {
        await this.createConnection(account);
        connection = this.connections.get(account.id);
      } catch (error) {
        console.error(`Failed to create IMAP connection for ${account.name}:`, error.message);
        return { success: false, error: error.message, emails: [] };
      }
    }

    try {
      const client = connection.client;
      const allEmails = [];
      
      // Get list of folders to sync
      let foldersToSync = folders;
      if (!foldersToSync) {
        // Get all available folders
        const folderMapping = this.getGmailFolders();
        foldersToSync = Object.keys(folderMapping);
      }

      // Fetch from each folder
      for (const folderName of foldersToSync) {
        const folderMapping = this.getGmailFolders();
        const folderType = folderMapping[folderName] || 'inbox';
        
        try {
          const folderEmails = await this.fetchEmailsFromFolder(
            client,
            account,
            folderName,
            folderType,
            { maxMessages, unseenOnly, since }
          );
          allEmails.push(...folderEmails);
        } catch (error) {
          console.error(`Skipping folder ${folderName}:`, error.message);
        }
      }

      connection.lastActivity = new Date();
      return { 
        success: true, 
        emails: allEmails, 
        message: `Fetched ${allEmails.length} emails from ${foldersToSync.length} folders` 
      };

    } catch (error) {
      console.error(`IMAP fetch error for ${account.name}:`, error.message);
      connection.isConnected = false;
      return { success: false, error: error.message, emails: [] };
    }
  }

  /**
   * Match incoming email with existing client
   */
  matchEmailWithClient(email, clients) {
    const emailAddress = email.from.toLowerCase();
    
    // Try to find client by email
    let client = clients.find(c => 
      c.email && c.email.toLowerCase() === emailAddress
    );

    if (!client) {
      // Try to extract email from "Name <email@domain.com>" format
      const emailMatch = email.from.match(/<([^>]+)>/);
      if (emailMatch) {
        const extractedEmail = emailMatch[1].toLowerCase();
        client = clients.find(c => 
          c.email && c.email.toLowerCase() === extractedEmail
        );
      }
    }

    if (!client) {
      // Try to find by name in subject or body
      const clientNames = clients.map(c => `${c.firstName} ${c.lastName}`.toLowerCase());
      const emailText = `${email.subject} ${email.bodyText}`.toLowerCase();
      
      for (let i = 0; i < clientNames.length; i++) {
        if (emailText.includes(clientNames[i])) {
          client = clients[i];
          break;
        }
      }
    }

    return client;
  }

  /**
   * Process incoming emails and store them
   */
  async processIncomingEmails(account, db) {
    try {
      const result = await this.fetchEmails(account, { 
        maxMessages: 20, 
        unseenOnly: true 
      });

      if (!result.success) {
        console.error(`Failed to fetch emails for ${account.name}:`, result.error);
        return { processed: 0, errors: 1 };
      }

      let processed = 0;
      let errors = 0;

      for (const email of result.emails) {
        try {
          // Match with existing client
          const matchedClient = this.matchEmailWithClient(email, db.clients);
          if (matchedClient) {
            email.clientId = matchedClient.id;
            email.userId = matchedClient.ownerUserId;
          }

          // Store email
          db.emails.push(email);

          // Create email log
          db.emailLogs.push({
            id: uuidv4(),
            clientId: email.clientId,
            from: email.from,
            to: email.to,
            subject: email.subject,
            bodyPreview: (email.bodyText || '').substring(0, 100),
            status: 'received',
            smtpAccountId: account.id,
            messageId: email.messageId,
            in_reply_to: email.inReplyTo,
            thread_id: email.threadId,
            receivedAt: email.receivedAt,
            attempts: 0,
            errorText: null
          });

          processed++;
        } catch (error) {
          console.error(`Error processing email:`, error.message);
          errors++;
        }
      }

      console.log(`Processed ${processed} emails from ${account.name} (${errors} errors)`);
      return { processed, errors };

    } catch (error) {
      console.error(`Error processing emails for ${account.name}:`, error.message);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Process incoming emails and store them in database
   */
  async processIncomingEmailsWithDatabase(account) {
    try {
      const result = await this.fetchEmails(account, { 
        maxMessages: 20, 
        unseenOnly: true 
      });

      if (!result.success) {
        console.error(`Failed to fetch emails for ${account.name}:`, result.error);
        return { processed: 0, errors: 1 };
      }

      let processed = 0;
      let errors = 0;

      // Import models dynamically to avoid circular dependencies
      const { Client, Email, EmailLog } = require('../models');

      for (const email of result.emails) {
        try {
          // Get clients for matching
          const clients = await Client.findAll();
          const matchedClient = this.matchEmailWithClient(email, clients);
          if (matchedClient) {
            email.clientId = matchedClient.id;
            email.userId = matchedClient.ownerUserId;
          }

          // Store email in database
          await Email.create(email);

          // Create email log
          await EmailLog.create({
            id: uuidv4(),
            clientId: email.clientId,
            from: email.from,
            to: email.to,
            subject: email.subject,
            bodyPreview: (email.bodyText || '').substring(0, 100),
            status: 'received',
            smtpAccountId: account.id,
            messageId: email.messageId,
            in_reply_to: email.inReplyTo,
            thread_id: email.threadId,
            receivedAt: email.receivedAt,
            attempts: 0,
            errorText: null
          });

          processed++;
        } catch (error) {
          console.error(`Error processing email:`, error.message);
          errors++;
        }
      }

      console.log(`Processed ${processed} emails from ${account.name} (${errors} errors)`);
      return { processed, errors };

    } catch (error) {
      console.error(`Error processing emails for ${account.name}:`, error.message);
      return { processed: 0, errors: 1 };
    }
  }

  /**
   * Start IMAP polling for all accounts
   */
  async startPolling(accounts) {
    if (this.isPolling) {
      console.log('IMAP polling already started');
      return;
    }

    this.isPolling = true;
    console.log('Starting IMAP polling...');

    const pollAccounts = async () => {
      try {
        const imapAccounts = accounts.filter(a => a.imapHost && a.imapUsername);
        
        if (imapAccounts.length === 0) {
          console.log('No IMAP accounts configured');
          return;
        }

        console.log(`Polling ${imapAccounts.length} IMAP accounts...`);
        
        for (const account of imapAccounts) {
          try {
            await this.processIncomingEmailsWithDatabase(account);
          } catch (error) {
            console.error(`Error polling account ${account.name}:`, error.message);
          }
        }
      } catch (error) {
        console.error('IMAP polling error:', error.message);
      }
    };

    // Initial poll
    await pollAccounts();

    // Set up interval
    this.pollTimer = setInterval(pollAccounts, this.pollInterval);
  }

  /**
   * Stop IMAP polling
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isPolling = false;
    console.log('IMAP polling stopped');
  }

  /**
   * Get IMAP status for all accounts
   */
  getStatus() {
    const status = {
      isPolling: this.isPolling,
      connections: [],
      totalConnections: this.connections.size
    };

    for (const [id, connection] of this.connections) {
      status.connections.push({
        accountId: id,
        accountName: connection.account.name,
        isConnected: connection.isConnected,
        lastActivity: connection.lastActivity,
        retryCount: connection.retryCount
      });
    }

    return status;
  }

  /**
   * Cleanup all connections
   */
  async cleanup() {
    this.stopPolling();
    
    for (const [id, connection] of this.connections) {
      try {
        await connection.client.logout();
      } catch (error) {
        console.error(`Error closing connection ${id}:`, error.message);
      }
    }
    
    this.connections.clear();
    console.log('IMAP service cleaned up');
  }
}

module.exports = ImapService;
