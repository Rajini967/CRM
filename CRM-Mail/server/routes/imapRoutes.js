const express = require('express');
const router = express.Router();
const { EmailAccount, Email, User } = require('../models');
const realTimeImapService = require('../services/RealTimeImapService');
const ImapService = require('../services/ImapService');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const imapService = new ImapService();

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
};

router.use(authenticateToken);

router.get('/status', async (req, res) => {
  try {
    // Get all IMAP-enabled accounts from database
    // Include accounts with IMAP configuration, regardless of type (some accounts might be 'smtp' but have IMAP config)
    const accounts = await EmailAccount.findAll({
      where: { 
        imapHost: { [Op.ne]: null },
        imapUsername: { [Op.ne]: null },
        isActive: true
      },
      attributes: ['id', 'name', 'email', 'imapHost', 'imapPort', 'imapUsername', 'syncStatus', 'lastSyncAt', 'errorMessage', 'updatedAt', 'type', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });

    // Get actual connection status from RealTimeImapService
    const isPolling = realTimeImapService?.isRunning || false;
    const totalConnections = realTimeImapService?.connections?.size || 0;

    // Build connections array with real status for each account
    const connections = accounts.map(account => {
      // Check if account has an active connection in RealTimeImapService
      const hasConnection = realTimeImapService?.connections?.has(account.id) || false;
      const client = realTimeImapService?.connections?.get(account.id);
      
      // Determine actual connection state
      let isConnected = false;
      if (hasConnection && client) {
        try {
          // Check ImapFlow client connection state
          // ImapFlow client has 'authenticated' property (boolean) when connected and authenticated
          // It also has 'connected' property in some versions
          if (client.authenticated === true) {
            isConnected = true;
          }
          // Fallback: check if client has a mailbox open (indicates active connection)
          else if (client.mailbox && client.mailbox.path) {
            isConnected = true;
          }
          // Fallback: check if client has connected property
          else if (client.connected === true) {
            isConnected = true;
          }
          // Fallback: if client exists in connections map and database says active, assume connected
          // This handles cases where connection state can't be directly checked
          else if (account.syncStatus === 'active') {
            // Client exists in map and database says active - likely connected
            isConnected = true;
          }
        } catch (error) {
          // If we can't check connection state, use database status as fallback
          console.warn(`⚠️ Could not check connection state for account ${account.id}:`, error.message);
          // Use database syncStatus as indicator if client exists
          isConnected = account.syncStatus === 'active' && hasConnection;
        }
      } else {
        // No connection in map - definitely not connected
        // But check database status to show appropriate message
        isConnected = false;
      }

      // Get retry count if available
      const retryCount = realTimeImapService?.retryAttempts?.get(account.id) || 0;

      // Get connection status - use actual connection state when available, otherwise use database
      // If service is running and database says active, show as active even if no live connection yet
      let connectionStatus = 'disconnected';
      if (isConnected) {
        connectionStatus = 'connected';
      } else {
        // Not connected - determine status based on database and service state
        if (account.syncStatus === 'active' && isPolling) {
          // Database says active and service is running - likely connected or connecting
          if (retryCount > 0) {
            connectionStatus = 'error'; // Show as error while retrying
          } else {
            connectionStatus = 'active'; // Show as active (service is running, connection should be active)
          }
        } else if (account.syncStatus === 'active' && !isPolling) {
          // Database says active but service not running - might be stale, show as disconnected
          connectionStatus = 'disconnected';
        } else {
          // Use database syncStatus
          connectionStatus = account.syncStatus || 'disconnected';
        }
      }

      // Get last activity - use lastSyncAt from DB, or updatedAt, or current time if connected
      let lastActivity = account.lastSyncAt;
      if (!lastActivity || isNaN(new Date(lastActivity).getTime())) {
        lastActivity = account.updatedAt;
      }
      if (!lastActivity || isNaN(new Date(lastActivity).getTime())) {
        lastActivity = isConnected ? new Date() : null;
      }
      if (isConnected && !lastActivity) {
        lastActivity = new Date(); // Update to current time if connected
      }

      // Determine account name - use name, email, or IMAP host as fallback
      let accountName = account.name;
      if (!accountName || accountName.trim() === '') {
        accountName = account.email;
      }
      if (!accountName || accountName.trim() === '') {
        accountName = account.imapHost || 'Unknown Account';
      }
      
      // Determine account email - use email or IMAP username as fallback
      let accountEmail = account.email;
      if (!accountEmail || accountEmail.trim() === '') {
        accountEmail = account.imapUsername || account.imapHost || null;
      }

      return {
        accountId: account.id,
        accountName: accountName || 'Unknown Account',
        accountEmail: accountEmail,
        isConnected: isConnected,
        status: connectionStatus,
        retryCount: retryCount,
        lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null,
        errorMessage: account.errorMessage || null,
        imapHost: account.imapHost,
        imapPort: account.imapPort
      };
    });

    // Calculate last sync time from connected accounts
    const connectedAccounts = connections.filter(c => c.isConnected);
    const lastSync = connectedAccounts.length > 0 
      ? connectedAccounts.map(c => c.lastActivity).sort().pop() || null
      : null;

    res.json({
      isPolling: isPolling,
      totalConnections: totalConnections,
      configuredAccounts: accounts.length,
      connections: connections,
      lastSync: lastSync
    });
  } catch (error) {
    console.error('Get IMAP status error:', error);
    res.status(500).json({ error: 'Failed to get IMAP status', details: error.message });
  }
});

router.post('/polling', async (req, res) => {
  try {
    const { action } = req.body;

    if (action === 'start') {
      if (realTimeImapService.isRunning) {
        return res.json({ 
          success: true,
          message: 'IMAP polling is already running' 
        });
      }

      await realTimeImapService.startRealTimeSync();
      res.json({ 
        success: true,
        message: 'IMAP polling started successfully' 
      });
    } else if (action === 'stop') {
      if (!realTimeImapService.isRunning) {
        return res.json({ 
          success: true,
          message: 'IMAP polling is already stopped' 
        });
      }

      await realTimeImapService.stopRealTimeSync();
      res.json({ 
        success: true,
        message: 'IMAP polling stopped successfully' 
      });
    } else {
      res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
    }
  } catch (error) {
    console.error('Control IMAP polling error:', error);
    res.status(500).json({ error: 'Failed to control IMAP polling', details: error.message });
  }
});

router.delete('/polling', async (req, res) => {
  try {
    await realTimeImapService.stopRealTimeSync();
    res.json({ 
      success: true,
      message: 'IMAP polling stopped successfully' 
    });
  } catch (error) {
    console.error('Stop IMAP polling error:', error);
    res.status(500).json({ error: 'Failed to stop IMAP polling', details: error.message });
  }
});

router.post('/test', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const account = await EmailAccount.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    if (!account.imapHost || !account.imapUsername || !account.imapPassword) {
      return res.status(400).json({ 
        error: 'IMAP configuration incomplete',
        suggestions: ['Ensure IMAP host, username, and password are configured']
      });
    }

    const testResult = await imapService.testConnection(account);
    
    if (testResult.success) {
      res.json({
        success: true,
        message: `Successfully connected to ${account.imapHost}`,
        details: testResult
      });
    } else {
      res.status(400).json({
        success: false,
        error: testResult.error,
        suggestions: testResult.suggestions || []
      });
    }
  } catch (error) {
    console.error('Test IMAP connection error:', error);
    res.status(500).json({ 
      error: 'Failed to test IMAP connection', 
      details: error.message,
      suggestions: ['Check your IMAP credentials and server settings']
    });
  }
});

router.post('/fetch', async (req, res) => {
  try {
    const { accountId, maxMessages = 10 } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'Account ID is required' });
    }

    const account = await EmailAccount.findByPk(accountId);
    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    console.log(`📧 Fetching emails from ${account.name} (max: ${maxMessages})...`);
    const emails = await imapService.fetchEmails(account, maxMessages);

    res.json({
      success: true,
      message: `Fetched ${emails.length} emails`,
      emails: emails,
      count: emails.length
    });
  } catch (error) {
    console.error('Fetch emails error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch emails', 
      details: error.message 
    });
  }
});

module.exports = { router, realTimeImapService };
