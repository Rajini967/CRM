const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { v4: uuidv4 } = require('uuid');
const { Op } = require('sequelize');
const { decryptEmailPassword } = require('../utils/passwordUtils');
// Import models dynamically to avoid circular dependencies
let Email, EmailAccount, EmailThread, EmailLog, Client;

class RealTimeImapService {
  constructor() {
    this.connections = new Map();
    this.idleConnections = new Map();
    this.isRunning = false;
    this.io = null; // WebSocket instance
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.retryDelay = 5000;
    this.unsupportedDraftFolders = new Set();
  }

  /**
   * Initialize the real-time service with WebSocket
   */
  initialize(io) {
    this.io = io;
    console.log('🔄 Real-time IMAP service initialized');
  }

  /**
   * Initialize models (called after database is ready)
   */
  initializeModels(models) {
    Email = models.Email;
    EmailAccount = models.EmailAccount;
    EmailThread = models.EmailThread;
    EmailLog = models.EmailLog;
    Client = models.Client;
    console.log('📧 Real-time IMAP service models initialized');
  }

  /**
   * Start real-time IMAP monitoring for all accounts
   */
  async startRealTimeSync() {
    if (this.isRunning) {
      console.log('Real-time IMAP sync already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting real-time IMAP sync...');

    try {
      // Get all IMAP-enabled accounts
      // Include accounts with IMAP configuration, regardless of type (some accounts might be 'smtp' but have IMAP config)
      const accounts = await EmailAccount.findAll({
        where: { 
          imapHost: { [Op.ne]: null },
          imapUsername: { [Op.ne]: null },
          isActive: true
        },
        order: [['createdAt', 'ASC']]
      });

      if (accounts.length === 0) {
        console.log('⚠️ No IMAP accounts configured for real-time sync');
        return;
      }

      console.log(`📧 Setting up real-time sync for ${accounts.length} account(s)`);

      // Start monitoring each account
      for (const account of accounts) {
        await this.startAccountMonitoring(account);
      }

      console.log('✅ Real-time IMAP sync started successfully');
    } catch (error) {
      console.error('❌ Failed to start real-time IMAP sync:', error.message);
      this.isRunning = false;
    }
  }

  /**
   * Start monitoring a specific account with IDLE support
   */
  async startAccountMonitoring(account) {
    const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
    console.log(`🔄 Setting up real-time monitoring for ${accountName}...`);

    const folderConfigs = this.getFolderConfigs(account);

    for (const folderConfig of folderConfigs) {
      await this.startFolderConnection(account, folderConfig);
    }
  }

  /**
   * Build folder configuration for monitoring
   */
  getFolderConfigs(account) {
    const folderConfigs = [{ name: 'INBOX', type: 'inbox' }];
    const host = (account?.imapHost || '').toLowerCase();
    const accountEmail = (account?.email || '').toLowerCase();
    const gmailFolders = this.getGmailFolderNames();
    const isGmailHost = host.includes('gmail') || host.includes('googlemail');
    const isGmailEmail = accountEmail.endsWith('@gmail.com') || accountEmail.endsWith('@googlemail.com');

    if ((isGmailHost || isGmailEmail) && gmailFolders.drafts.length) {
      folderConfigs.push({ name: gmailFolders.drafts[0], type: 'drafts' });
    } else {
      folderConfigs.push({ name: 'Drafts', type: 'drafts' });
      folderConfigs.push({ name: 'drafts', type: 'drafts' });
    }

    return folderConfigs;
  }

  /**
   * Start monitoring a specific folder with its own connection
   */
  async startFolderConnection(account, folderConfig) {
    const { name: folderName, type: folderType } = folderConfig;
    const connectionKey = `${account.id}:${folderName}`;
    let client = null;

    try {
      const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
      console.log(`🔄 Establishing connection for ${accountName} - Folder: ${folderName} (${folderType})`);

      client = new ImapFlow({
        host: account.imapHost,
        port: account.imapPort || 993,
        secure: account.imapSecure !== false,
        auth: {
          user: account.imapUsername,
          pass: decryptEmailPassword(account.imapPassword)
        },
        logger: false,
        idling: true,
        socketTimeout: 300000,
        greetingTimeout: 30000,
        connectionTimeout: 60000,
        tls: {
          rejectUnauthorized: false
        }
      });

      client.on('error', async (error) => {
        const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
        console.error(`❌ IMAP client error for ${accountName} [${folderName}]:`, error.message, error.code);

        if (this.connections.has(connectionKey)) {
          this.connections.delete(connectionKey);
        }

        if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
          console.warn(`⏱️ Socket timeout for ${accountName} [${folderName}], will retry connection...`);
          await this.handleConnectionError(account, error, false, folderName, folderType);
        } else {
          await this.handleConnectionError(account, error, true, folderName, folderType);
        }
      });

      client.on('close', () => {
        const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
        console.log(`🔌 IMAP connection closed for ${accountName} [${folderName}]`);
        if (this.connections.has(connectionKey)) {
          this.connections.delete(connectionKey);
        }
      });

      try {
        await Promise.race([
          client.connect(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), 60000)
          )
        ]);
        console.log(`✅ Connected to ${accountName} (${account.imapHost}) [${folderName}]`);
      } catch (connectError) {
        try {
          if (client && client.connected) {
            await client.logout();
          }
        } catch (logoutError) {
          // ignore
        }
        throw connectError;
      }

      this.connections.set(connectionKey, client);

      if (folderType === 'inbox') {
        try {
          await EmailAccount.update(
            {
              syncStatus: 'active',
              lastSyncAt: new Date(),
              errorMessage: null
            },
            { where: { id: account.id } }
          );
        } catch (error) {
          console.error(`⚠️ Failed to update database status for ${accountName}:`, error.message);
        }
      }

      await this.startIdleMonitoring(account, client, folderName, folderType, connectionKey);
    } catch (error) {
      const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
      console.error(`❌ Failed to setup monitoring for ${accountName} [${folderName}]:`, error.message);
      await this.handleConnectionError(account, error, true, folderName, folderType);
    }
  }

  /**
   * Get Gmail folder names (helper method)
   */
  getGmailFolderNames() {
    return {
      inbox: ['INBOX'],
      drafts: ['[Gmail]/Drafts', 'Drafts']
    };
  }

  /**
   * Start IDLE monitoring for real-time email detection (monitors INBOX and Drafts)
   */
  async startIdleMonitoring(account, client, folderName, folderType, connectionKey) {
    try {
      // Determine account name for logging
      const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
      this.monitoredFolders = this.monitoredFolders || new Map();
      this.monitoredFolders.set(connectionKey, { type: folderType, name: folderName });

      // Open requested folder
      await client.mailboxOpen(folderName);
      console.log(`📬 Monitoring ${folderName} (${folderType}) for ${accountName}`);

      // Get initial message count safely
      let initialCount = 0;
      try {
        if (client.mailbox && client.mailbox.messages) {
          initialCount = client.mailbox.messages.total || 0;
        }
      } catch (error) {
        console.warn(`⚠️ Could not get initial message count for ${folderName}:`, error.message);
      }
      console.log(`📊 Initial message count for ${folderName}: ${initialCount}`);

      this.lastMessageCounts = this.lastMessageCounts || new Map();
      if (!this.lastMessageCounts.has(connectionKey)) {
        const initialValue = folderType === 'drafts' ? 0 : initialCount;
        this.lastMessageCounts.set(connectionKey, initialValue);
      }

      if (folderType === 'drafts') {
        await this.checkForNewEmails(account, client, folderName, folderType, connectionKey);
      }

      // Start IDLE monitoring
      let idlePromise;
      try {
        idlePromise = client.idle();
        console.log(`🔄 IDLE monitoring started for ${accountName}`);
      } catch (error) {
        console.warn(`⚠️ IDLE not supported for ${accountName} [${folderName}], falling back to polling:`, error.message);
        this.startPollingFallback(account, client, folderName, folderType, connectionKey);
        return;
      }
      
      // Handle IDLE events - detect which folder was updated
      client.on('mailboxUpdate', async (update) => {
        console.log(`📧 Mailbox update detected for ${accountName} [${folderName}]:`, update);
        try {
          if (folderType === 'drafts') {
            await this.syncDeletedDrafts(account, client, folderName);
          }
          await this.handleNewEmails(account, client, update, folderType, folderName);
        } catch (error) {
          console.error(`❌ Error handling mailbox update for ${accountName} [${folderName}]:`, error.message);
        }
      });

      // Keep IDLE alive with timeout protection
      const keepAliveInterval = setInterval(async () => {
        try {
          if (client && client.connected) {
            // Use Promise.race to prevent keep-alive from hanging
            await Promise.race([
              client.noop(), // Keep connection alive
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Keep-alive timeout')), 10000)
              )
            ]);
          } else {
            // Connection lost, clear interval
            clearInterval(keepAliveInterval);
            console.warn(`⚠️ Connection lost for ${accountName} [${folderName}], stopping keep-alive`);
          }
        } catch (error) {
          console.error(`❌ Keep-alive failed for ${accountName} [${folderName}]:`, error.message);
          // If keep-alive fails, the connection might be dead - trigger reconnection
          if (error.code === 'ETIMEOUT' || error.message.includes('timeout')) {
            clearInterval(keepAliveInterval);
            await this.handleConnectionError(account, error, false, folderName, folderType);
          }
        }
      }, 30000); // Every 30 seconds
      
      // Store interval for cleanup
        this.keepAliveIntervals = this.keepAliveIntervals || new Map();
        this.keepAliveIntervals.set(connectionKey, keepAliveInterval);

      console.log(`✅ IDLE monitoring started for ${accountName}`);

    } catch (error) {
      const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
      const errorMsg = error?.message || '';
      if (errorMsg.includes('Command failed') || errorMsg.includes('BAD') || errorMsg.includes('NO')) {
        console.warn(`⚠️ IDLE unsupported for ${accountName} [${folderName}] - falling back to polling`, errorMsg);
        this.startPollingFallback(account, client, folderName, folderType, connectionKey);
        return;
      }
      console.error(`❌ Failed to start IDLE monitoring for ${accountName}:`, errorMsg);
      await this.handleConnectionError(account, error);
    }
  }

  /**
   * Fallback polling method when IDLE is not supported
   */
  startPollingFallback(account, client, folderName, folderType, connectionKey) {
    const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
    console.log(`🔄 Starting polling fallback for ${accountName} [${folderName}] (every 30 seconds)`);
    
    // Ensure pollingIntervals map exists
    this.pollingIntervals = this.pollingIntervals || new Map();
    
    // Clear any existing interval for this connection
    if (this.pollingIntervals.has(connectionKey)) {
      clearInterval(this.pollingIntervals.get(connectionKey));
      this.pollingIntervals.delete(connectionKey);
    }
    
    const pollInterval = setInterval(async () => {
      try {
        if (!client || !client.connected) {
          console.log(`❌ Client disconnected for ${accountName} [${folderName}], stopping polling`);
          clearInterval(pollInterval);
          this.pollingIntervals.delete(connectionKey);
          return;
        }
        
        // Check for new emails
        await this.checkForNewEmails(account, client, folderName, folderType, connectionKey);
      } catch (error) {
        console.error(`❌ Polling error for ${accountName} [${folderName}]:`, error.message);
        // If error persists, stop polling to prevent infinite error loops
        if (error.message && (error.message.includes('timeout') || error.message.includes('ETIMEDOUT'))) {
          console.warn(`⚠️ Stopping polling for ${accountName} [${folderName}] due to persistent errors`);
          clearInterval(pollInterval);
          this.pollingIntervals.delete(connectionKey);
        }
      }
    }, 30000); // Poll every 30 seconds
    
    // Store the interval for cleanup
    this.pollingIntervals.set(connectionKey, pollInterval);
  }

  /**
   * Check for new emails (polling method) - checks both INBOX and Drafts
   */
  async checkForNewEmails(account, client, folderName, folderType, connectionKey) {
    try {
      this.lastMessageCounts = this.lastMessageCounts || new Map();
      const lastCount = this.lastMessageCounts.get(connectionKey) || 0;

      const status = await client.status(folderName, { messages: true });
      const currentCount = status.messages || 0;

      if (currentCount > lastCount) {
        console.log(`📧 New emails detected in ${folderName} for ${account.name}: ${currentCount - lastCount} new`);
        
        await client.mailboxOpen(folderName);

        const newEmails = await this.fetchNewEmails(account, client, lastCount + 1, currentCount, folderType, folderName);

        for (const email of newEmails) {
          await this.processNewEmail(account, email);
        }

        this.lastMessageCounts.set(connectionKey, currentCount);
      }
      
      if (currentCount < lastCount) {
        console.log(`🗑️ Message count decreased in ${folderName} for ${account.name}: ${lastCount - currentCount} removed`);
        this.lastMessageCounts.set(connectionKey, currentCount);
      } else if (currentCount === lastCount && !this.lastMessageCounts.has(connectionKey)) {
        this.lastMessageCounts.set(connectionKey, currentCount);
      }

      if (folderType === 'drafts') {
        await this.syncDeletedDrafts(account, client, folderName);
      }
        
      // Update database lastSyncAt when emails are fetched
      if (folderType === 'inbox') {
        try {
          await EmailAccount.update(
            { 
              lastSyncAt: new Date(),
              syncStatus: 'active'
            },
            { where: { id: account.id } }
          );
        } catch (error) {
          console.error(`⚠️ Failed to update lastSyncAt for ${account.name}:`, error.message);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking for new emails for ${account.name}:`, error.message);
    }
  }

  /**
   * Handle new emails detected via IDLE
   */
  async handleNewEmails(account, client, update, folderType = 'inbox', folderName = 'INBOX') {
    try {
      console.log(`📬 Processing new emails for ${account.name} in folder ${folderName} (${folderType})...`);

      // Get current message count
      const currentCount = client.mailbox?.messages?.total || 0;
      console.log(`📊 Current message count for ${folderName}: ${currentCount}`);

      // Fetch recent messages (last 10)
      const messages = await client.fetch({
        from: Math.max(1, currentCount - 9),
        to: currentCount
      }, { 
        envelope: true, 
        source: true, 
        internalDate: true,
        uid: true,
        flags: true
      });

      const newEmails = [];
      for await (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source);
          
          // Extract and normalize references field
          let references = parsed.headers.get('references');
          if (references && typeof references !== 'string') {
            references = Array.isArray(references) ? references.join(' ') : String(references);
          }
          
          // Determine if email is a draft (check folder type first, then IMAP flag)
          const isDraft = folderType === 'drafts' || msg.flags?.has('\\Draft') || false;
          
          // Extract body content - drafts need special handling
          const bodyHtml = parsed.html || '';
          const bodyText = parsed.text || '';
          const body = bodyHtml || (bodyText ? `<pre>${bodyText}</pre>` : '');
          
          // For drafts, messageId might not exist - generate one if missing
          const messageId = isDraft
            ? `draft-${msg.uid}-${account.id}-${Date.now()}`
            : (parsed.messageId || `msg-${msg.uid}-${account.id}-${Date.now()}`);
          
          // Log draft content for debugging
          if (isDraft) {
            console.log(`📝 Draft detected in handleNewEmails - Folder: ${folderName} (${folderType}), Subject: "${parsed.subject}", HTML length: ${bodyHtml.length}, Text length: ${bodyText.length}, UID: ${msg.uid}, MessageId: ${messageId}`);
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
            isDraft: isDraft, // Use determined draft status
            isSent: false,
            isDeleted: false,
            folder: folderType, // Use detected folder type (inbox, drafts, etc.)
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
            status: (folderType === 'drafts' || msg.flags?.has('\\Draft')) ? 'draft' : 'sent' // Set status for drafts
          };

          // Process email (auto-creates thread and saves properly)
          await this.processNewEmail(account, email);
          newEmails.push(email);
        } catch (parseError) {
          console.error(`❌ Failed to parse email:`, parseError.message);
        }
      }

      // Update database lastSyncAt when emails are processed
      if (newEmails.length > 0) {
        try {
          await EmailAccount.update(
            { 
              lastSyncAt: new Date(),
              syncStatus: 'active'
            },
            { where: { id: account.id } }
          );
        } catch (error) {
          console.error(`⚠️ Failed to update lastSyncAt for ${account.name}:`, error.message);
        }
      }

      // Emit real-time update via WebSocket
      if (newEmails.length > 0 && this.io) {
        this.io.emit('newEmails', {
          accountId: account.id,
          accountName: account.name,
          emails: newEmails,
          count: newEmails.length
        });
        console.log(`📡 Real-time update sent: ${newEmails.length} new emails`);
      }

    } catch (error) {
      console.error(`❌ Error handling new emails for ${account.name}:`, error.message);
    }
  }

  /**
   * Reconcile deleted drafts between Gmail and CRM
   */
  async syncDeletedDrafts(account, client, folderName = '[Gmail]/Drafts') {
    if (!Email) {
      console.warn('⚠️ Email model not initialized, skipping draft deletion sync');
      return;
    }

    try {
      const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
      const remoteUids = new Set();
      const remoteMessageIds = new Set();

      if (this.unsupportedDraftFolders.has(`${account.id}:${folderName}`)) {
        return;
      }

      let lock;
      try {
        lock = await client.getMailboxLock(folderName);
        const fetcher = await client.fetch('1:*', { uid: true, envelope: true });
        for await (const msg of fetcher) {
          if (msg?.uid) {
            remoteUids.add(msg.uid);
          }
          if (msg?.envelope?.messageId) {
            remoteMessageIds.add(msg.envelope.messageId.trim());
          }
        }
      } catch (mailboxError) {
        const key = `${account.id}:${folderName}`;
        if (!this.unsupportedDraftFolders.has(key)) {
          console.error(`❌ Unable to inspect ${folderName} for ${accountName}:`, mailboxError.message);
          if (mailboxError.message?.includes('Command failed') || mailboxError.code === 'ALREADYEXISTS' || mailboxError.message?.includes('does not exist')) {
            this.unsupportedDraftFolders.add(key);
            console.warn(`⚠️ Disabling draft deletion sync for ${accountName} [${folderName}] due to unsupported mailbox`);
          }
        }
        return;
      } finally {
        if (lock) {
          lock.release();
        }
      }

      const localDrafts = await Email.findAll({
        where: {
          emailAccountId: account.id,
          folder: 'drafts',
          isDraft: true,
          [Op.or]: [
            { isDeleted: false },
            { isDeleted: null }
          ]
        }
      });

      if (!localDrafts.length) {
        return;
      }

      const draftsToRemove = [];
      for (const draft of localDrafts) {
        const hasUid = Boolean(draft.uid);
        const hasMessageId = Boolean(draft.messageId);
        const uidMissing = hasUid && !remoteUids.has(draft.uid);
        const messageMissing = !hasUid && hasMessageId && !remoteMessageIds.has(draft.messageId);

        if (uidMissing || messageMissing) {
          draftsToRemove.push(draft);
        }
      }

      if (!draftsToRemove.length) {
        return;
      }

      for (const draft of draftsToRemove) {
        await draft.update({
          isDeleted: true,
          folder: 'trash',
          updatedAt: new Date()
        });
      }

      console.log(`🧹 Removed ${draftsToRemove.length} deleted draft(s) from CRM for ${accountName}`);

      if (this.io) {
        this.io.emit('emailsDeleted', {
          accountId: account.id,
          emailIds: draftsToRemove.map((draft) => draft.id),
          folder: 'drafts'
        });
      }
    } catch (error) {
      console.error(`❌ Failed to sync deleted drafts for ${account.name}:`, error.message);
    }
  }

  /**
   * Handle connection errors with retry logic
   * @param {Object} account - Email account
   * @param {Error} error - Connection error
   * @param {boolean} incrementRetry - Whether to increment retry count (default: true)
   */
  async handleConnectionError(account, error, incrementRetry = true, folderName = 'INBOX', folderType = 'inbox') {
    const accountName = account.name || account.email || account.imapHost || 'Unknown Account';
    const connectionKey = `${account.id}:${folderName}`;
    const retryCount = this.retryAttempts.get(connectionKey) || 0;
    
    // Remove connection from map
    this.connections.delete(connectionKey);
    
    // Clear keep-alive interval if it exists
    if (this.keepAliveIntervals && this.keepAliveIntervals.has(connectionKey)) {
      clearInterval(this.keepAliveIntervals.get(connectionKey));
      this.keepAliveIntervals.delete(connectionKey);
    }
    
    // Clear polling interval if it exists
    if (this.pollingIntervals && this.pollingIntervals.has(connectionKey)) {
      clearInterval(this.pollingIntervals.get(connectionKey));
      this.pollingIntervals.delete(connectionKey);
    }
    
    // Determine error type and message
    const isTimeout = error.code === 'ETIMEOUT' || error.message.includes('timeout');
    const errorMessage = isTimeout 
      ? `Socket timeout: ${error.message || 'Connection timed out'}`
      : error.message || 'Connection error';
    
    // Update database with error status
    if (folderType === 'inbox') {
      try {
        await EmailAccount.update(
          { 
            syncStatus: retryCount < this.maxRetries ? 'error' : 'disconnected',
            errorMessage: errorMessage
          },
          { where: { id: account.id } }
        );
      } catch (dbError) {
        console.error(`⚠️ Failed to update database error status for ${accountName}:`, dbError.message);
      }
    }
    
    // For timeout errors, use longer retry delay (network issues take longer to resolve)
    const retryDelay = isTimeout ? this.retryDelay * 2 : this.retryDelay;
    
    if (retryCount < this.maxRetries) {
      const newRetryCount = incrementRetry ? retryCount + 1 : retryCount;
      console.log(`🔄 Retrying connection for ${accountName} [${folderName}] (attempt ${newRetryCount}/${this.maxRetries}) - ${isTimeout ? 'timeout' : 'error'}`);
      
      if (incrementRetry) {
        this.retryAttempts.set(connectionKey, newRetryCount);
      }
      
      setTimeout(async () => {
        try {
          await this.startFolderConnection(account, { name: folderName, type: folderType });
        } catch (retryError) {
          console.error(`❌ Retry failed for ${accountName} [${folderName}]:`, retryError.message);
          // Continue retry loop if not max retries
          if (newRetryCount < this.maxRetries) {
            await this.handleConnectionError(account, retryError, incrementRetry, folderName, folderType);
          }
        }
      }, retryDelay);
    } else {
      console.error(`❌ Max retries exceeded for ${accountName} [${folderName}]. Stopping monitoring.`);
      this.retryAttempts.delete(connectionKey);
      
      // Update database with final disconnected status
      if (folderType === 'inbox') {
        try {
          await EmailAccount.update(
            { 
              syncStatus: 'disconnected',
              errorMessage: `Max retries reached: ${errorMessage}`
            },
            { where: { id: account.id } }
          );
        } catch (dbError) {
          console.error(`⚠️ Failed to update database disconnected status for ${accountName}:`, dbError.message);
        }
      }
    }
  }

  /**
   * Stop real-time monitoring
   */
  async stopRealTimeSync() {
    console.log('🛑 Stopping real-time IMAP sync...');
    
    this.isRunning = false;
    
    // Clear all keep-alive intervals
    if (this.keepAliveIntervals) {
      for (const [connectionKey, interval] of this.keepAliveIntervals) {
        clearInterval(interval);
      }
      this.keepAliveIntervals.clear();
    }
    
    // Clear all polling intervals
    if (this.pollingIntervals) {
      for (const [connectionKey, interval] of this.pollingIntervals) {
        clearInterval(interval);
      }
      this.pollingIntervals.clear();
    }
    
    // Close all connections with timeout protection
    const closePromises = [];
    for (const [connectionKey, client] of this.connections) {
      closePromises.push(
        Promise.race([
          (async () => {
            try {
              if (client && client.connected) {
                await client.logout();
              }
            } catch (error) {
              console.error(`❌ Error closing connection for ${connectionKey}:`, error.message);
            }
          })(),
          new Promise((resolve) => 
            setTimeout(() => {
              console.warn(`⏱️ Timeout closing connection for ${connectionKey}`);
              resolve();
            }, 5000)
          )
        ])
      );
    }
    
    await Promise.allSettled(closePromises);
    
    this.connections.clear();
    this.idleConnections.clear();
    this.retryAttempts.clear();
    
    console.log('✅ Real-time IMAP sync stopped');
  }

  /**
   * Stop monitoring for a specific folder/account
   */
  async stopFolderMonitoring(accountId, folderName) {
    const connectionKey = `${accountId}:${folderName}`;
    console.log(`🛑 Stopping monitoring for connection: ${connectionKey}`);
    
    // Clear keep-alive interval
    if (this.keepAliveIntervals && this.keepAliveIntervals.has(connectionKey)) {
      clearInterval(this.keepAliveIntervals.get(connectionKey));
      this.keepAliveIntervals.delete(connectionKey);
    }
    
    // Clear polling interval
    if (this.pollingIntervals && this.pollingIntervals.has(connectionKey)) {
      clearInterval(this.pollingIntervals.get(connectionKey));
      this.pollingIntervals.delete(connectionKey);
    }
    
    // Close connection
    const client = this.connections.get(connectionKey);
    if (client) {
      try {
        if (client.connected) {
          await client.logout();
        }
      } catch (error) {
        console.error(`Error closing connection ${connectionKey}:`, error.message);
      }
      this.connections.delete(connectionKey);
    }
    
    // Remove from monitored folders
    if (this.monitoredFolders) {
      this.monitoredFolders.delete(connectionKey);
    }
    
    // Remove from idle connections
    if (this.idleConnections) {
      this.idleConnections.delete(connectionKey);
    }
    
    // Clear retry attempts
    if (this.retryAttempts) {
      this.retryAttempts.delete(connectionKey);
    }
    
    console.log(`✅ Stopped monitoring for ${connectionKey}`);
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeConnections: this.connections.size,
      accounts: Array.from(this.connections.keys())
    };
  }

  /**
   * Fetch new emails from a range
   */
  async fetchNewEmails(account, client, startSeq, endSeq, folderType = 'inbox', folderName = 'INBOX') {
    try {
      const emails = [];
      const messageSet = `${startSeq}:${endSeq}`;
      
      const messages = await client.fetch(messageSet, {
        envelope: true,
        source: true,
        internalDate: true,
        uid: true,
        flags: true
      });

      for await (const msg of messages) {
        try {
          const parsed = await simpleParser(msg.source);
          
          // Extract and normalize references field
          let references = parsed.headers.get('references');
          if (references && typeof references !== 'string') {
            references = Array.isArray(references) ? references.join(' ') : String(references);
          }
          
          // Determine if email is a draft (either from folder type or IMAP flag)
          const isDraft = folderType === 'drafts' || msg.flags?.has('\\Draft') || false;
          
          // Extract body content - drafts need special handling
          const bodyHtml = parsed.html || '';
          const bodyText = parsed.text || '';
          const body = bodyHtml || (bodyText ? `<pre>${bodyText}</pre>` : '');
          
          // For drafts, messageId might not exist - generate one if missing
          const messageId = isDraft
            ? `draft-${msg.uid}-${account.id}-${Date.now()}`
            : (parsed.messageId || `msg-${msg.uid}-${account.id}-${Date.now()}`);
          
          // Log draft content for debugging
          if (isDraft) {
            console.log(`📝 Draft detected in fetchNewEmails - Subject: "${parsed.subject}", HTML length: ${bodyHtml.length}, Text length: ${bodyText.length}`);
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
            isDraft: isDraft, // Use folder-based detection
            isSent: false,
            isDeleted: false,
            folder: folderType, // Use detected folder type
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
            userId: account.userId,
            flags: Array.from(msg.flags || []),
            messageId: messageId, // Use generated messageId for drafts if needed
            references: references || null,
            emailAccountId: account.id,
            status: isDraft ? 'draft' : 'sent' // Set status for drafts
          };
          
          emails.push(email);
        } catch (parseError) {
          console.error(`❌ Failed to parse email:`, parseError.message);
        }
      }
      
      return emails;
    } catch (error) {
      console.error(`❌ Error fetching new emails:`, error.message);
      return [];
    }
  }

  /**
   * Process a single new email
   */
  async processNewEmail(account, email) {
    try {
      // For drafts, check by UID and emailAccountId instead of just messageId
      // (drafts might not have a stable messageId)
      let existingEmail = null;
      if (email.isDraft && email.uid) {
        existingEmail = await Email.findOne({
          where: { 
            uid: email.uid,
            emailAccountId: account.id,
            folder: 'drafts'
          }
        });

        if (!existingEmail && email.messageId) {
          existingEmail = await Email.findOne({
            where: { messageId: email.messageId }
          });
        }
      } else if (email.messageId) {
        existingEmail = await Email.findOne({
          where: { messageId: email.messageId }
        });
      }

      if (!existingEmail) {
        // Auto-create or find thread for this email (skip for drafts)
        const threadIdentifier = email.inReplyTo || email.references || email.subject || 'no-subject';
        
        let thread = null;
        if (!email.isDraft) {
          thread = await EmailThread.findOne({
            where: { 
              emailAccountId: account.id,
              subject: email.subject || 'no-subject'
            }
          });

          if (!thread) {
            // Create new thread
            thread = await EmailThread.create({
              id: uuidv4(),
              subject: email.subject || 'no-subject',
              participants: JSON.stringify([email.from, email.to]),
              lastMessageId: email.messageId,
              lastMessageAt: email.date,
              messageCount: 1,
              isRead: email.isRead,
              isImportant: email.isImportant,
              emailAccountId: account.id,
              clientId: email.clientId,
              status: 'active'
            });
          } else {
            // Update existing thread
            await thread.update({
              lastMessageId: email.messageId,
              lastMessageAt: email.date,
              messageCount: thread.messageCount + 1,
              isRead: email.isRead
            });
          }

          // Set threadId for the email
          email.threadId = thread.id;
        }

        // Ensure references is a string (not array/object)
        if (email.references && typeof email.references !== 'string') {
          email.references = Array.isArray(email.references) 
            ? email.references.join(' ') 
            : JSON.stringify(email.references);
        }

        // Store new email
        const savedEmail = await Email.create(email);
        
        // Log draft details for debugging
        if (email.isDraft) {
          console.log(`📝 Draft saved successfully:`, {
            id: savedEmail.id,
            subject: email.subject,
            folder: email.folder,
            isDraft: email.isDraft,
            bodyHtmlLength: (email.bodyHtml || '').length,
            bodyTextLength: (email.bodyText || '').length,
            messageId: email.messageId
          });
        }
        
        // Create email log (skip for drafts as they're not "received")
        if (!email.isDraft) {
          await EmailLog.create({
            id: uuidv4(),
            emailId: savedEmail.id,
            clientId: email.clientId,
            from: email.from,
            to: email.to,
            subject: email.subject,
            bodyPreview: (email.bodyText || '').substring(0, 100),
            status: 'received',
            smtpAccountId: account.id,
            messageId: email.messageId,
            in_reply_to: email.inReplyTo,
            thread_id: thread?.id || null,
            receivedAt: email.receivedAt,
            attempts: 1,
            errorText: null,
            action: 'received'
          });
        }
        
        console.log(`📧 New email processed: ${email.subject}${email.isDraft ? ' (DRAFT)' : ''}`);
        
        // Emit real-time update
        if (this.io) {
          this.io.emit('newEmail', {
            accountId: account.id,
            email: savedEmail
          });
        }
      }
    } catch (error) {
      const validationDetails = Array.isArray(error?.errors)
        ? error.errors.map(e => `${e.path}: ${e.message}`).join('; ')
        : '';
      console.error(`Error saving email:`, error.message, validationDetails);
    }
  }
}

module.exports = new RealTimeImapService();
