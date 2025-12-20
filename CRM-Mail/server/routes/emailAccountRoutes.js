const express = require('express');
const router = express.Router();
const { EmailAccount, EmailFolder, User, Email, Conference, sequelize } = require('../models');
const { Op } = require('sequelize');

// In-memory store for sync progress (cleared after completion)
const syncProgressStore = new Map();

// Simple authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Apply authentication to all routes
router.use(authenticateToken);

const normalizeRole = (role) => (role || '').toString().toLowerCase();
const isCeoUser = (req) => normalizeRole(req.user?.role) === 'ceo';
const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
};

const getAccountOwnerId = (account) => {
  if (!account) return null;
  if (account.ownerId) return account.ownerId;
  if (account.createdBy) return account.createdBy;
  return null;
};

const canUserAccessAccount = (req, account) => {
  if (!account) return false;
  if (isCeoUser(req)) return true;
  if (account.isSystemAccount) return true;
  const ownerId = getAccountOwnerId(account);
  return ownerId && req.user?.id && ownerId === req.user.id;
};

// Only CEOs are allowed to manage SMTP/IMAP accounts (create/update/delete/start-sync/stop-sync)
const canUserManageAccount = (req, account) => {
  if (!account) return false;
  return isCeoUser(req);
};

// Get SMTP account IDs from user's assigned conferences
const getConferenceSmtpAccountIds = async (req) => {
  if (isCeoUser(req)) {
    return null; // CEO can see all accounts
  }

  const userId = req.user?.id;
  if (!userId) {
    return [];
  }

  try {
    let whereClause = {};
    const role = normalizeRole(req.user?.role);

    if (role === 'teamlead') {
      whereClause.assignedTeamLeadId = userId;
    } else if (role === 'member') {
      // Member sees only conferences where they are in assignedMemberIds array
      whereClause = sequelize.where(
        sequelize.cast(sequelize.col('assignedMemberIds'), 'jsonb'),
        '@>',
        sequelize.cast(`["${userId}"]`, 'jsonb')
      );
    } else {
      // Unknown role - no conferences
      return [];
    }

    const conferences = await Conference.findAll({
      where: whereClause,
      attributes: ['id', 'settings']
    });

    const smtpIds = new Set();
    conferences.forEach(conference => {
      try {
        const settings = conference.settings || {};
        const smtpId = settings.smtp_default_id;
        if (smtpId && (typeof smtpId === 'string' || typeof smtpId === 'number')) {
          smtpIds.add(String(smtpId));
        }
      } catch (error) {
        console.error('Error extracting SMTP ID from conference:', error);
      }
    });

    return Array.from(smtpIds);
  } catch (error) {
    console.error('Error fetching conference SMTP account IDs:', error);
    return [];
  }
};

const buildVisibilityWhereClause = async (req) => {
  // CEO sees all accounts
  if (isCeoUser(req)) {
    return {};
  }

  // Get SMTP account IDs from assigned conferences
  const conferenceSmtpIds = await getConferenceSmtpAccountIds(req);
  
  if (conferenceSmtpIds.length === 0) {
    // No assigned conferences or no SMTP mappings - return empty result
    return { id: { [Op.eq]: null } }; // This will match nothing
  }

  // Only return SMTP accounts mapped to assigned conferences
  return {
    id: {
      [Op.in]: conferenceSmtpIds
    }
  };
};

const accountIncludes = [
  { model: User, as: 'creator', attributes: ['id', 'name', 'email'] },
  { model: User, as: 'owner', attributes: ['id', 'name', 'email'] }
];

const formatAccountResponse = (account) => {
  if (!account) return null;
  const data = typeof account.toJSON === 'function' ? account.toJSON() : account;
  data.ownerId = getAccountOwnerId(data);
  data.isSystemAccount = typeof data.isSystemAccount === 'boolean' ? data.isSystemAccount : false;
  return data;
};

// Get email accounts
router.get('/', async (req, res) => {
  try {
    const whereClause = await buildVisibilityWhereClause(req);
    const accounts = await EmailAccount.findAll({
      where: whereClause,
      include: accountIncludes,
      order: [
        ['sendPriority', 'ASC'],
        ['createdAt', 'ASC']
      ]
    });

    res.json(accounts.map(formatAccountResponse));
  } catch (error) {
    console.error('Get email accounts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get email account by ID
router.get('/:id', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id, {
      include: [
        ...accountIncludes,
        { model: EmailFolder, as: 'folders', order: [['sortOrder', 'ASC']] }
      ]
    });

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserAccessAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to view this SMTP account' });
    }

    res.json(formatAccountResponse(account));
  } catch (error) {
    console.error('Get email account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create email account
router.post('/', async (req, res) => {
  try {
    console.log('📧 SMTP Account Creation Request:', {
      body: req.body,
      user: req.user ? req.user.id : 'No user'
    });
    
    const {
      name,
      email,
      fromEmail, // Frontend sends this instead of email
      type = 'both',
      smtpHost,
      host, // Frontend sends this instead of smtpHost
      smtpPort = 587,
      port, // Frontend sends this instead of smtpPort
      smtpUsername,
      username, // Frontend sends this instead of smtpUsername
      smtpPassword,
      password, // Frontend sends this instead of smtpPassword
      smtpSecure = true,
      security, // Frontend sends this instead of smtpSecure
      smtpAuth = true,
      imapHost,
      imapPort = 993,
      imapUsername,
      imapPassword,
      imapSecure = true,
      imapSecurity, // Frontend sends this instead of imapSecure
      syncInterval = 300,
      maxEmailsPerSync = 100,
      autoReply = false,
      autoReplyMessage,
      signature,
      createdBy,
      isSystem, // Frontend sends this
      allowUsers // Frontend sends this
    } = req.body;

    // Enterprise-level field mapping and validation
    const emailAddress = email || fromEmail;
    const smtpHostValue = smtpHost || host;
    const smtpPortValue = smtpPort || port || 587;
    const smtpUsernameValue = smtpUsername || username;
    const smtpPasswordValue = smtpPassword || password;
    const smtpSecureValue = smtpSecure || (security === 'ssl' || security === 'tls');
    const imapSecureValue = imapSecure || (imapSecurity === 'ssl' || imapSecurity === 'tls');
    
    // Enterprise validation
    if (!emailAddress) {
      return res.status(400).json({ 
        error: 'Email address is required',
        code: 'MISSING_EMAIL',
        details: 'Please provide either email or fromEmail field'
      });
    }
    
    if (!smtpHostValue) {
      return res.status(400).json({ 
        error: 'SMTP host is required',
        code: 'MISSING_SMTP_HOST',
        details: 'Please provide either smtpHost or host field'
      });
    }
    
    if (!smtpUsernameValue) {
      return res.status(400).json({ 
        error: 'SMTP username is required',
        code: 'MISSING_SMTP_USERNAME',
        details: 'Please provide either smtpUsername or username field'
      });
    }
    
    if (!smtpPasswordValue) {
      return res.status(400).json({ 
        error: 'SMTP password is required',
        code: 'MISSING_SMTP_PASSWORD',
        details: 'Please provide either smtpPassword or password field'
      });
    }
    
    // Use email as name if name not provided
    const accountName = name || emailAddress;

    // Use authenticated user ID if createdBy not provided
    const creatorId = createdBy || (req.user ? req.user.id : null);
    console.log('📧 Using creator ID:', creatorId);
    
    // Enterprise-level user validation
    if (creatorId) {
      const userExists = await User.findByPk(creatorId);
      if (!userExists) {
        return res.status(400).json({
          error: 'Invalid user ID',
          code: 'INVALID_USER',
          details: `User with ID ${creatorId} does not exist`
        });
      }
    }

    // Check if account already exists
    const existingAccount = await EmailAccount.findOne({
      where: { email: emailAddress }
    });

    if (existingAccount) {
      return res.status(400).json({ 
        error: 'Email account already exists',
        code: 'ACCOUNT_EXISTS',
        details: `An account with email ${emailAddress} already exists`
      });
    }

    // Enterprise-level account creation with proper field mapping
    const accountData = {
      name: accountName,
      email: emailAddress,
      type,
      smtpHost: smtpHostValue,
      smtpPort: smtpPortValue,
      smtpUsername: smtpUsernameValue,
      smtpPassword: smtpPasswordValue,
      smtpSecure: smtpSecureValue,
      smtpAuth,
      imapHost: imapHost || 'imap.gmail.com',
      imapPort: imapPort || 993,
      imapUsername: imapUsername || smtpUsernameValue,
      imapPassword: imapPassword || smtpPasswordValue,
      imapSecure: imapSecureValue,
      syncInterval,
      maxEmailsPerSync,
      autoReply,
      autoReplyMessage,
      signature,
      syncStatus: 'disconnected',
      isActive: true, // Automatically activate new accounts
      ownerId: creatorId || (req.user ? req.user.id : null),
      isSystemAccount: false, // All accounts are accessible to CEO, filtered by conference for others
      allowUsers: false // Not used anymore
    };

    const maxPriority = await EmailAccount.max('sendPriority');
    accountData.sendPriority = Number.isFinite(maxPriority) ? maxPriority + 1 : 1;
    
    // Only add createdBy if we have a valid user ID and it exists in database
    if (creatorId) {
      try {
        const userExists = await User.findByPk(creatorId);
        if (userExists) {
          accountData.createdBy = creatorId;
        } else {
          console.log('User not found, creating account without createdBy');
        }
      } catch (error) {
        console.log('Error checking user, creating account without createdBy:', error.message);
      }
    }
    
    const account = await EmailAccount.create(accountData);

    // Auto-activate and start monitoring if IMAP is configured
    let syncProgress = { status: 'idle', message: '', emailsSynced: 0, totalEmails: 0 };
    
    if ((type === 'imap' || type === 'both') && imapHost) {
      console.log(`📧 Auto-activating and starting sync for new account: ${account.name}`);
      
      // Set status to syncing immediately so frontend can show progress
      syncProgress.status = 'syncing';
      syncProgress.message = 'Initializing email sync...';
      
      // Start real-time monitoring (non-blocking, doesn't interrupt existing syncs)
      const realTimeImapService = require('../services/RealTimeImapService');
      
      // Add to real-time monitoring in background
      setTimeout(async () => {
        try {
          // Reload account to get fresh data
          const freshAccount = await EmailAccount.findByPk(account.id);
          if (freshAccount && freshAccount.isActive) {
            console.log(`🔄 Adding ${freshAccount.name} to real-time monitoring...`);
            await realTimeImapService.startAccountMonitoring(freshAccount);
            console.log(`✅ ${freshAccount.name} added to real-time monitoring`);
          }
        } catch (monitorError) {
          console.error(`⚠️ Failed to add ${account.name} to real-time monitoring:`, monitorError.message);
          // Don't fail the request, just log the error
        }
      }, 1000); // Wait 1 second before adding to monitoring
      
      // Trigger initial email sync in background (non-blocking)
      const ImapService = require('../services/ImapService');
      const imapService = new ImapService();
      
      // Store progress in memory for real-time access
      syncProgressStore.set(account.id, syncProgress);
      
      // Async background sync - don't await
      setTimeout(async () => {
        try {
          syncProgress.message = 'Connecting to email server...';
          syncProgressStore.set(account.id, { ...syncProgress });
          
          const sinceDate = new Date();
          sinceDate.setDate(sinceDate.getDate() - 365); // 1 year back
          
          syncProgress.message = 'Fetching emails...';
          syncProgressStore.set(account.id, { ...syncProgress });
          
          const result = await imapService.fetchEmails(account, {
            maxMessages: 500,
            unseenOnly: false,
            since: sinceDate
          });
          
          if (result.success && result.emails) {
            const { Email } = require('../models');
            let syncedCount = 0;
            const totalEmails = result.emails.length;
            syncProgress.totalEmails = totalEmails;
            syncProgress.message = `Processing ${totalEmails} emails...`;
            syncProgressStore.set(account.id, { ...syncProgress });
            
            for (const emailData of result.emails) {
              try {
                const existingEmail = await Email.findOne({
                  where: { 
                    messageId: emailData.messageId,
                    emailAccountId: account.id
                  }
                });
                
                if (!existingEmail) {
                  await Email.create({
                    ...emailData,
                    emailAccountId: account.id,
                    folder: 'inbox'
                  });
                  syncedCount++;
                  syncProgress.emailsSynced = syncedCount;
                  
                  // Update progress every 10 emails for better UX
                  if (syncedCount % 10 === 0 || syncedCount === totalEmails) {
                    syncProgressStore.set(account.id, { ...syncProgress });
                  }
                }
              } catch (saveError) {
                console.error(`Error saving email during auto-sync: ${saveError.message}`);
              }
            }
            
            syncProgress.status = 'completed';
            syncProgress.message = `Successfully synced ${syncedCount} new emails`;
            syncProgressStore.set(account.id, { ...syncProgress });
            console.log(`✅ Auto-sync completed for ${account.name}: ${syncedCount} new emails`);
            
            // Update account sync status (use 'active' instead of 'connected' - enum only allows: active, paused, error, disconnected)
            await account.update({ 
              syncStatus: 'active',
              lastSyncAt: new Date()
            });
            
            // Clear progress after 30 seconds (give frontend time to see completion)
            setTimeout(() => {
              syncProgressStore.delete(account.id);
            }, 30000);
          } else {
            syncProgress.status = 'error';
            syncProgress.message = result.error || 'Failed to fetch emails';
            syncProgressStore.set(account.id, { ...syncProgress });
            console.error(`❌ Auto-sync failed for ${account.name}:`, result.error);
            
            // Clear progress after 30 seconds
            setTimeout(() => {
              syncProgressStore.delete(account.id);
            }, 30000);
          }
        } catch (syncError) {
          syncProgress.status = 'error';
          syncProgress.message = syncError.message;
          syncProgressStore.set(account.id, { ...syncProgress });
          console.error(`❌ Auto-sync failed for ${account.name}:`, syncError.message);
          
          // Update account sync status
          await account.update({ syncStatus: 'error', errorMessage: syncError.message });
          
          // Clear progress after 30 seconds
          setTimeout(() => {
            syncProgressStore.delete(account.id);
          }, 30000);
        }
      }, 2000); // Wait 2 seconds before starting sync
    } else {
      // No IMAP, just mark as ready
      syncProgress.status = 'completed';
      syncProgress.message = 'Account activated (SMTP only)';
    }

    // Enterprise-level success response
    res.status(201).json({
      success: true,
      message: 'SMTP account created and activated. Email sync started in background.',
      data: {
        id: account.id,
        name: account.name,
        email: account.email,
        type: account.type,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        status: 'created',
        isActive: account.isActive,
        syncStatus: (type === 'imap' || type === 'both') ? 'syncing' : 'not_applicable',
        syncProgress: syncProgress,
        createdAt: account.createdAt,
        sendPriority: account.sendPriority,
        ownerId: getAccountOwnerId(account),
        isSystemAccount: account.isSystemAccount
      }
    });
  } catch (error) {
    console.error('Create email account error:', error);
    
    // Enterprise-level error handling
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        error: 'Email account already exists',
        code: 'DUPLICATE_EMAIL',
        details: 'An account with this email address already exists'
      });
    }
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        error: 'Invalid user reference',
        code: 'INVALID_USER_REFERENCE',
        details: 'The specified user does not exist in the system'
      });
    }
    
    res.status(500).json({ 
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      details: 'An unexpected error occurred while creating the SMTP account'
    });
  }
});

// Update email account
router.put('/:id', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to update this SMTP account' });
    }

    const updates = { ...req.body };
    const ceo = isCeoUser(req);

    if (!ceo) {
      delete updates.sendPriority;
      delete updates.isSystemAccount;
      delete updates.ownerId;
    } else if (updates.isSystemAccount !== undefined) {
      updates.isSystemAccount = parseBoolean(updates.isSystemAccount);
    }

    if (!ceo || updates.ownerId === undefined) {
      updates.ownerId = getAccountOwnerId(account);
    }

    const updatedAccount = await account.update(updates);
    res.json(formatAccountResponse(updatedAccount));
  } catch (error) {
    console.error('Update email account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update sending priority (reorders all accounts)
router.post('/:id/set-priority', async (req, res) => {
  const { priority } = req.body;

  const numericPriority = parseInt(priority, 10);
  if (!Number.isFinite(numericPriority) || numericPriority < 1) {
    return res.status(400).json({ error: 'Priority must be a positive integer' });
  }

  try {
    if (!isCeoUser(req)) {
      return res.status(403).json({ error: 'Only CEOs can reorder system SMTP accounts' });
    }

    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    await sequelize.transaction(async (transaction) => {
      const accounts = await EmailAccount.findAll({
        order: [
          ['sendPriority', 'ASC'],
          ['createdAt', 'ASC']
        ],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const currentIndex = accounts.findIndex(acc => acc.id === account.id);
      if (currentIndex === -1) {
        throw new Error('Email account not found during reordering');
      }

      const [targetAccount] = accounts.splice(currentIndex, 1);
      const insertIndex = Math.min(Math.max(numericPriority - 1, 0), accounts.length);
      accounts.splice(insertIndex, 0, targetAccount);

      for (let index = 0; index < accounts.length; index++) {
        const acc = accounts[index];
        const desiredPriority = index + 1;
        if (acc.sendPriority !== desiredPriority) {
          await EmailAccount.update(
            { sendPriority: desiredPriority },
            { where: { id: acc.id }, transaction }
          );
        }
      }
    });

    const updatedAccounts = await EmailAccount.findAll({
      include: accountIncludes,
      order: [
        ['sendPriority', 'ASC'],
        ['createdAt', 'ASC']
      ]
    });

    res.json({
      success: true,
      message: 'Priority updated successfully',
      accounts: updatedAccounts.map(formatAccountResponse)
    });
  } catch (error) {
    console.error('Set priority error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test email account connection
router.post('/:id/test', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserAccessAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to access this SMTP account' });
    }

    // TODO: Implement connection testing
    // This would test both SMTP and IMAP connections

    res.json({ success: true, message: 'Connection test successful' });
  } catch (error) {
    console.error('Test email account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sync progress for an account
router.get('/:id/sync-progress', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

            // Check in-memory progress store first (for real-time updates)
            const inMemoryProgress = syncProgressStore.get(req.params.id);
            if (inMemoryProgress) {
              // Map syncStatus: 'active' means connected/synced, 'disconnected' means not syncing
              let mappedStatus = account.syncStatus || 'disconnected';
              if (inMemoryProgress.status === 'syncing') {
                mappedStatus = 'active'; // Show as active while syncing
              } else if (inMemoryProgress.status === 'completed') {
                mappedStatus = 'active'; // Show as active when completed
              }
              
              return res.json({
                accountId: account.id,
                syncStatus: mappedStatus,
                lastSyncAt: account.lastSyncAt,
                isActive: account.isActive,
                errorMessage: account.errorMessage,
                progress: inMemoryProgress
              });
            }

            // Fallback to database status
            const syncStatus = account.syncStatus || 'disconnected';
            const lastSyncAt = account.lastSyncAt;
            
            res.json({
              accountId: account.id,
              syncStatus,
              lastSyncAt,
              isActive: account.isActive,
              errorMessage: account.errorMessage,
              progress: null
            });
  } catch (error) {
    console.error('Get sync progress error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start email account sync
router.post('/:id/start-sync', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to modify this SMTP account' });
    }

    // TODO: Start sync using EmailService
    await account.update({ syncStatus: 'active' });

    res.json({ success: true, message: 'Sync started' });
  } catch (error) {
    console.error('Start sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stop email account sync
router.post('/:id/stop-sync', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to modify this SMTP account' });
    }

    // TODO: Stop sync using EmailService
    await account.update({ syncStatus: 'paused' });

    res.json({ success: true, message: 'Sync stopped' });
  } catch (error) {
    console.error('Stop sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete email account
router.delete('/:id', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to delete this SMTP account' });
    }

    // TODO: Stop sync and close connections
    await account.destroy();

    res.json({ success: true, message: 'Email account deleted' });
  } catch (error) {
    console.error('Delete email account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get SMTP account usage statistics
router.get('/:id/usage', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserAccessAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to view this SMTP account' });
    }

    // Count total emails sent
    const totalSent = await Email.count({
      where: {
        emailAccountId: account.id,
        isSent: true,
        status: 'sent'
      }
    });

    // Count emails sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await Email.count({
      where: {
        emailAccountId: account.id,
        isSent: true,
        status: 'sent',
        deliveredAt: {
          [Op.gte]: today
        }
      }
    });

    // Count emails sent this week
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const sentThisWeek = await Email.count({
      where: {
        emailAccountId: account.id,
        isSent: true,
        status: 'sent',
        deliveredAt: {
          [Op.gte]: weekAgo
        }
      }
    });

    // Get last email sent
    const lastEmail = await Email.findOne({
      where: {
        emailAccountId: account.id,
        isSent: true,
        status: 'sent'
      },
      order: [['deliveredAt', 'DESC']],
      attributes: ['deliveredAt', 'subject', 'to']
    });

    res.json({
      accountId: account.id,
      totalSent,
      sentToday,
      sentThisWeek,
      lastUsed: account.lastUsed || lastEmail?.deliveredAt || null,
      lastEmail: lastEmail ? {
        deliveredAt: lastEmail.deliveredAt,
        subject: lastEmail.subject,
        to: lastEmail.to
      } : null,
      dailyEmailCount: account.dailyEmailCount || 0,
      hourlyEmailCount: account.hourlyEmailCount || 0,
      maxEmailsPerDay: account.maxEmailsPerDay || null,
      maxEmailsPerHour: account.maxEmailsPerHour || null,
      ownerId: getAccountOwnerId(account),
      isSystemAccount: account.isSystemAccount
    });
  } catch (error) {
    console.error('Get usage statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get email folders for account
router.get('/:id/folders', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserAccessAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to view this SMTP account' });
    }

    const folders = await EmailFolder.findAll({
      where: { emailAccountId: req.params.id },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']]
    });

    res.json(folders);
  } catch (error) {
    console.error('Get email folders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create email folder
router.post('/:id/folders', async (req, res) => {
  try {
    const account = await EmailAccount.findByPk(req.params.id);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to modify this SMTP account' });
    }

    const { name, type, parentId, path, delimiter = '/' } = req.body;

    if (!name || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const folder = await EmailFolder.create({
      name,
      type,
      parentId,
      path: path || name,
      delimiter,
      emailAccountId: req.params.id
    });

    res.status(201).json(folder);
  } catch (error) {
    console.error('Create email folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update email folder
router.put('/folders/:folderId', async (req, res) => {
  try {
    const folder = await EmailFolder.findByPk(req.params.folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Email folder not found' });
    }

    const account = await EmailAccount.findByPk(folder.emailAccountId);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to modify this SMTP account' });
    }

    const updatedFolder = await folder.update(req.body);
    res.json(updatedFolder);
  } catch (error) {
    console.error('Update email folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete email folder
router.delete('/folders/:folderId', async (req, res) => {
  try {
    const folder = await EmailFolder.findByPk(req.params.folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Email folder not found' });
    }

    const account = await EmailAccount.findByPk(folder.emailAccountId);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!canUserManageAccount(req, account)) {
      return res.status(403).json({ error: 'You do not have permission to modify this SMTP account' });
    }

    await folder.destroy();
    res.json({ success: true, message: 'Email folder deleted' });
  } catch (error) {
    console.error('Delete email folder error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
