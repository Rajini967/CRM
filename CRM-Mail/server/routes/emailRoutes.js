const express = require('express');
const router = express.Router();
const { Email, EmailAccount, EmailFolder, EmailThread, EmailLog, Client, EmailTemplate, Conference, sequelize } = require('../models');
const { Op } = require('sequelize');
const nodemailer = require('nodemailer');
const multer = require('multer');
const crypto = require('crypto');
const MailComposer = require('nodemailer/lib/mail-composer');
const { ImapFlow } = require('imapflow');
const { decryptEmailPassword } = require('../utils/passwordUtils');
const { prepareAttachmentsForSending } = require('../utils/attachmentUtils');
const { normalizeEmailList, mergeEmailLists } = require('../utils/emailListUtils');
const { formatEmailHtml, logEmailHtmlPayload } = require('../utils/emailHtmlFormatter');

// Configure multer for file uploads - use any() to handle both files and fields
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const FALLBACK_DRAFT_FOLDER = '[Gmail]/Drafts';
const GENERIC_DRAFT_FOLDER = 'Drafts';

const generateDraftMessageId = (fromEmail = '') => {
  const domain = (fromEmail.split('@')[1] || 'mail-crm.local').trim();
  const randomPart = crypto.randomBytes(8).toString('hex');
  return `<draft-${Date.now()}-${randomPart}@${domain}>`;
};

const resolveDraftFolderName = (account = {}) => {
  if (account?.settings?.draftFolder) {
    return account.settings.draftFolder;
  }
  if (account?.imapHost?.toLowerCase().includes('gmail')) {
    return FALLBACK_DRAFT_FOLDER;
  }
  return GENERIC_DRAFT_FOLDER;
};

const normalizeDraftAttachments = (attachments) => {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return [];
  }

  return attachments
    .filter(Boolean)
    .map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content ? attachment.content : attachment.buffer,
      contentType: attachment.contentType,
      encoding: attachment.content ? 'base64' : undefined
    }))
    .filter(att => att.filename && att.content);
};

const buildDraftMime = async (emailPayload, account) => {
  const composer = new MailComposer({
    messageId: emailPayload.messageId,
    from: emailPayload.fromName
      ? `"${emailPayload.fromName}" <${emailPayload.from}>`
      : emailPayload.from,
    to: emailPayload.to || undefined,
    cc: emailPayload.cc || undefined,
    bcc: emailPayload.bcc || undefined,
    subject: emailPayload.subject || '(No Subject)',
    html: emailPayload.bodyHtml || undefined,
    text: emailPayload.bodyText || undefined,
    attachments: normalizeDraftAttachments(emailPayload.attachments),
    headers: {
      'X-Mail-CRM-Draft': 'true'
    }
  });

  return composer.compile().build();
};

// Helper function to get IMAP client for an account
const getImapClient = async (account) => {
  if (!account?.imapHost || !account?.imapUsername || !account?.imapPassword) {
    return null;
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: Number(account.imapPort) || 993,
    secure: account.imapSecure !== false,
    auth: {
      user: account.imapUsername,
      pass: decryptEmailPassword(account.imapPassword)
    },
    tls: {
      rejectUnauthorized: false
    },
    logger: false
  });

  await client.connect();
  return client;
};

// Helper function to resolve folder name for IMAP operations
const resolveImapFolderName = (folderName, account) => {
  if (!folderName) return 'INBOX';
  
  const isGmail = account?.imapHost?.toLowerCase().includes('gmail') || 
                  account?.email?.toLowerCase().includes('gmail');
  
  // Map common folder names to IMAP folder names
  const folderMap = {
    'inbox': 'INBOX',
    'sent': isGmail ? '[Gmail]/Sent Mail' : 'Sent',
    'drafts': isGmail ? '[Gmail]/Drafts' : 'Drafts',
    'trash': isGmail ? '[Gmail]/Trash' : 'Trash',
    'archive': isGmail ? '[Gmail]/All Mail' : 'Archive',
    'spam': isGmail ? '[Gmail]/Spam' : 'Spam',
    'all mail': isGmail ? '[Gmail]/All Mail' : 'All Mail'
  };

  return folderMap[folderName?.toLowerCase()] || folderName;
};

// Get SMTP account IDs from user's assigned conferences
const getConferenceSmtpAccountIds = async (req) => {
  const normalizeRole = (role) => (role || '').toString().toLowerCase();
  const isCeo = normalizeRole(req.user?.role) === 'ceo';
  
  if (isCeo) {
    return null; // CEO can see all emails
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

// Helper function to sync email operations with IMAP server
const syncEmailOperationToImap = async (email, account, operation, options = {}) => {
  if (!account?.imapHost || !account?.imapUsername || !account?.imapPassword) {
    console.warn(`Skipping IMAP sync for ${account?.email} - IMAP credentials missing`);
    return null;
  }

  if (!email.uid) {
    console.warn(`Skipping IMAP sync for email ${email.id} - no UID available`);
    return null;
  }

  let client = null;
  try {
    client = await getImapClient(account);
    if (!client) return null;

    const currentFolder = resolveImapFolderName(email.folder || 'inbox', account);
    const lock = await client.getMailboxLock(currentFolder);

    try {
      if (operation === 'delete') {
        // Move to trash or delete
        const trashFolder = resolveImapFolderName('trash', account);
        try {
          await client.messageMove(email.uid, trashFolder, { uid: true });
          console.log(`✅ Moved email ${email.id} (UID: ${email.uid}) to trash on IMAP`);
        } catch (moveError) {
          // If move fails, try to delete directly
          try {
            await client.messageDelete(email.uid, { uid: true });
            console.log(`✅ Deleted email ${email.id} (UID: ${email.uid}) from IMAP`);
          } catch (deleteError) {
            console.warn(`⚠️ Failed to delete email ${email.id} from IMAP:`, deleteError.message);
          }
        }
      } else if (operation === 'archive') {
        // For Gmail, archive means moving to All Mail (or removing \Inbox flag)
        // For other providers, move to Archive folder
        const archiveFolder = resolveImapFolderName('archive', account);
        try {
          // Try to move to archive folder
          await client.messageMove(email.uid, archiveFolder, { uid: true });
          console.log(`✅ Moved email ${email.id} (UID: ${email.uid}) to archive on IMAP`);
        } catch (error) {
          // If move fails, try to remove \Inbox flag (Gmail archive behavior)
          try {
            await client.messageFlagsRemove(email.uid, ['\\Inbox'], { uid: true });
            console.log(`✅ Archived email ${email.id} (UID: ${email.uid}) by removing \\Inbox flag`);
          } catch (flagError) {
            console.warn(`⚠️ Failed to archive email ${email.id} on IMAP:`, error.message);
          }
        }
      } else if (operation === 'star') {
        // Set or remove starred flag
        const flags = options.isStarred ? ['\\Flagged'] : [];
        try {
          await client.messageFlagsSet(email.uid, flags, { uid: true });
          console.log(`✅ ${options.isStarred ? 'Starred' : 'Unstarred'} email ${email.id} (UID: ${email.uid}) on IMAP`);
        } catch (error) {
          console.warn(`⚠️ Failed to ${options.isStarred ? 'star' : 'unstar'} email ${email.id} on IMAP:`, error.message);
        }
      } else if (operation === 'move') {
        // Move to a different folder
        const targetFolder = resolveImapFolderName(options.targetFolder, account);
        try {
          await client.messageMove(email.uid, targetFolder, { uid: true });
          console.log(`✅ Moved email ${email.id} (UID: ${email.uid}) to ${targetFolder} on IMAP`);
        } catch (error) {
          console.warn(`⚠️ Failed to move email ${email.id} to ${options.targetFolder} on IMAP:`, error.message);
        }
      } else if (operation === 'read') {
        // Set or remove read flag (\Seen)
        const flags = options.isRead ? ['\\Seen'] : [];
        try {
          if (options.isRead) {
            await client.messageFlagsAdd(email.uid, flags, { uid: true });
            console.log(`✅ Marked email ${email.id} (UID: ${email.uid}) as read on IMAP`);
          } else {
            await client.messageFlagsRemove(email.uid, ['\\Seen'], { uid: true });
            console.log(`✅ Marked email ${email.id} (UID: ${email.uid}) as unread on IMAP`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to ${options.isRead ? 'mark as read' : 'mark as unread'} email ${email.id} on IMAP:`, error.message);
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error(`❌ IMAP sync error for email ${email.id}:`, error.message);
    // Don't throw - allow operation to continue even if IMAP sync fails
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch (logoutError) {
        // Ignore logout errors
      }
    }
  }
};

const syncDraftToMailbox = async (emailRecord, account, { replaceUid = null } = {}) => {
  if (!account?.imapHost || !account?.imapUsername || !account?.imapPassword) {
    console.warn(`Skipping IMAP draft sync for ${account?.email} - IMAP credentials missing`);
    return null;
  }

  const client = new ImapFlow({
    host: account.imapHost,
    port: Number(account.imapPort) || 993,
    secure: account.imapSecure !== false,
    auth: {
      user: account.imapUsername,
      pass: decryptEmailPassword(account.imapPassword)
    },
    tls: {
      rejectUnauthorized: false
    },
    logger: false
  });

  const preferredFolder = resolveDraftFolderName(account);
  const fallbackFolder = preferredFolder === FALLBACK_DRAFT_FOLDER ? GENERIC_DRAFT_FOLDER : FALLBACK_DRAFT_FOLDER;

  const uploadToFolder = async (folderName) => {
    const mime = await buildDraftMime(emailRecord, account);
    const response = await client.append(folderName, mime, ['\\Draft'], emailRecord.date || new Date());
    return { response, folderName };
  };

  const deleteExistingDraft = async (folderName, uid) => {
    if (!uid) return;
    const lock = await client.getMailboxLock(folderName);
    try {
      await client.messageDelete(uid, { uid: true });
    } finally {
      lock.release();
    }
  };

  try {
    await client.connect();

    if (replaceUid) {
      const deleteTargets = [preferredFolder];
      if (fallbackFolder && fallbackFolder !== preferredFolder) {
        deleteTargets.push(fallbackFolder);
      }

      for (const folderTarget of deleteTargets) {
        try {
          await deleteExistingDraft(folderTarget, replaceUid);
          break;
        } catch (deleteError) {
          console.warn(`Failed to delete previous draft UID ${replaceUid} from ${folderTarget}:`, deleteError.message);
        }
      }
    }

    let appendResult;
    try {
      appendResult = await uploadToFolder(preferredFolder);
    } catch (primaryError) {
      console.warn(`Draft upload failed for folder ${preferredFolder}, retrying with ${fallbackFolder}:`, primaryError.message);
      appendResult = await uploadToFolder(fallbackFolder);
    }

    const uid = appendResult?.response?.uid || null;
    if (uid) {
      await emailRecord.update({
        uid,
        folder: 'drafts',
        status: 'draft'
      });
    }

    return {
      uid,
      folder: appendResult?.response?.destination || appendResult?.folderName
    };
  } catch (error) {
    console.error('Failed to sync draft to mailbox:', error.message);
    throw error;
  } finally {
    try {
      await client.logout();
    } catch (logoutError) {
      // Ignore logout errors
    }
  }
};

// Get email suggestions for autocomplete
router.get('/suggestions', async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const searchPattern = `%${query}%`;
    
    // Find unique email addresses from all email interactions (from, to, cc, bcc)
    const emails = await Email.findAll({
      attributes: ['from', 'to', 'cc', 'bcc'],
      where: {
        [Op.or]: [
          { from: { [Op.iLike]: searchPattern } },
          { to: { [Op.iLike]: searchPattern } },
          { cc: { [Op.iLike]: searchPattern } },
          { bcc: { [Op.iLike]: searchPattern } }
        ]
      },
      limit: 50
    });

    // Extract unique email addresses
    const emailSet = new Set();
    emails.forEach(email => {
      if (email.from) emailSet.add(email.from);
      if (email.to) {
        // Split multiple recipients
        email.to.split(',').forEach(e => emailSet.add(e.trim()));
      }
      if (email.cc) {
        email.cc.split(',').forEach(e => emailSet.add(e.trim()));
      }
      if (email.bcc) {
        email.bcc.split(',').forEach(e => emailSet.add(e.trim()));
      }
    });

    // Also check clients table for matching emails
    const clients = await Client.findAll({
      attributes: ['email', 'name'],
      where: {
        email: { [Op.iLike]: searchPattern }
      },
      limit: 20
    });

    clients.forEach(client => {
      if (client.email) emailSet.add(client.email);
    });

    // Convert to array and format suggestions
    const suggestions = Array.from(emailSet)
      .filter(email => email && email.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10) // Limit to 10 suggestions
      .map(email => {
        // Extract name if available (format: "Name <email@example.com>")
        const nameMatch = email.match(/^(.+?)\s*<(.+?)>$/);
        if (nameMatch) {
          return {
            email: nameMatch[2],
            display: email,
            name: nameMatch[1].trim()
          };
        }
        return {
          email: email,
          display: email,
          name: null
        };
      });

    res.json(suggestions);
  } catch (error) {
    console.error('Get email suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get emails with advanced filtering
router.get('/', async (req, res) => {
  try {
    // Validate and sanitize filter parameters
    let {
      folder = 'inbox',
      search = '',
      filter = 'all',
      sortBy = 'date',
      sortOrder = 'desc',
      page = 1,
      limit = 50,
      accountId,
      fromEmail,
      toEmail,
      startDate,
      endDate
    } = req.query;
    
    // Validate folder
    const validFolders = ['inbox', 'sent', 'drafts', 'trash', 'spam', 'all', 'all-mail', 'archive'];
    if (!validFolders.includes(folder)) {
      folder = 'inbox';
    }
    
    // Validate sortBy
    const validSortBy = ['date', 'subject', 'from', 'to'];
    if (!validSortBy.includes(sortBy)) {
      sortBy = 'date';
    }
    
    // Validate sortOrder
    if (sortOrder !== 'asc' && sortOrder !== 'desc') {
      sortOrder = 'desc';
    }
    
    // Validate pagination
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(100, Math.max(1, parseInt(limit) || 50));
    
    // Sanitize search string
    if (search && typeof search === 'string') {
      search = search.trim().substring(0, 200); // Limit search length
    } else {
      search = '';
    }
    
    // Sanitize email filters
    if (fromEmail && typeof fromEmail === 'string') {
      fromEmail = fromEmail.trim().substring(0, 200);
    } else {
      fromEmail = null;
    }
    
    if (toEmail && typeof toEmail === 'string') {
      toEmail = toEmail.trim().substring(0, 200);
    } else {
      toEmail = null;
    }
    
    // Validate dates
    let validStartDate = null;
    let validEndDate = null;
    
    if (startDate) {
      try {
        const parsedStartDate = new Date(startDate);
        if (!isNaN(parsedStartDate.getTime())) {
          validStartDate = parsedStartDate;
        }
      } catch (dateError) {
        console.error('Invalid startDate:', dateError);
      }
    }
    
    if (endDate) {
      try {
        const parsedEndDate = new Date(endDate);
        if (!isNaN(parsedEndDate.getTime())) {
          validEndDate = parsedEndDate;
          validEndDate.setHours(23, 59, 59, 999); // End of day
        }
      } catch (dateError) {
        console.error('Invalid endDate:', dateError);
      }
    }

    // Validate accountId if provided
    if (accountId && accountId !== 'all') {
      try {
        const account = await EmailAccount.findByPk(accountId);
        if (!account) {
          accountId = null; // Reset if account doesn't exist
        }
      } catch (accountError) {
        console.error('Error validating accountId:', accountError);
        accountId = null;
      }
    } else {
      accountId = null;
    }

    // Enhanced folder filtering logic to properly separate inbox from sent emails
    const whereClause = {};
    let folderCondition = null;

    if (folder === 'inbox') {
      // Inbox: received emails only (not sent, not drafts, not deleted)
      folderCondition = {
        [Op.and]: [
          { [Op.or]: [{ folder: 'inbox' }, { folder: 'INBOX' }, { folder: null }] },
          { [Op.or]: [{ isSent: false }, { isSent: null }] },
          { [Op.or]: [{ isDraft: false }, { isDraft: null }] },
          { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] }
        ]
      };
    } else if (folder === 'sent') {
      // Sent: outbound emails only (not deleted)
      folderCondition = {
        [Op.and]: [
          {
            [Op.or]: [
              { isSent: true },
              { folder: { [Op.iLike]: 'sent' } }
            ]
          },
          { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] }
        ]
      };
    } else if (folder === 'drafts') {
      // Drafts: emails marked as drafts OR in drafts folder, not sent, not deleted
      folderCondition = {
        [Op.and]: [
          {
            [Op.or]: [
              { isDraft: true },
              { folder: 'drafts' }
            ]
          },
          { [Op.or]: [{ isSent: false }, { isSent: null }] },
          { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] }
        ]
      };
    } else if (folder === 'all' || folder === 'all-mail') {
      // All Mail: all non-deleted emails regardless of folder
      folderCondition = { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] };
    } else if (folder === 'spam') {
      // Spam: emails in spam folder (case-insensitive, not deleted)
      folderCondition = {
        [Op.and]: [
          { folder: { [Op.iLike]: 'spam' } },
          { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] }
        ]
      };
    } else if (folder === 'trash') {
      // Trash: emails in trash folder OR marked as deleted
      folderCondition = {
        [Op.or]: [
          { folder: { [Op.iLike]: 'trash' } },
          { isDeleted: true }
        ]
      };
    } else {
      // For other folders (archive, etc.), use folder as-is (not deleted)
      folderCondition = {
        [Op.and]: [
          { folder: folder },
          { [Op.or]: [{ isDeleted: false }, { isDeleted: null }] }
        ]
      };
    }

    // Build whereClause: combine folder condition with other filters using AND
    const conditions = [folderCondition];

    // For non-CEO users, filter by conference-assigned SMTP accounts
    const conferenceSmtpIds = await getConferenceSmtpAccountIds(req);
    
    console.log(`📧 Email Query - User: ${req.user?.email} (${req.user?.role}), accountId: ${accountId}, conferenceSmtpIds:`, conferenceSmtpIds);
    
    // CEO sees all emails
    if (conferenceSmtpIds === null) {
      // CEO user - no filtering by conference SMTP accounts
      console.log(`👑 CEO user - showing all emails`);
      if (accountId && accountId !== 'all') {
        conditions.push({ emailAccountId: accountId });
        console.log(`📧 Filtering by accountId: ${accountId}`);
      } else {
        console.log(`📧 No accountId filter - showing all emails`);
      }
    } else {
      // Non-CEO user - filter by conference-assigned SMTP accounts
      console.log(`🔒 Non-CEO user - filtering by conference SMTP accounts:`, conferenceSmtpIds);
      if (conferenceSmtpIds.length === 0) {
        // User has no assigned conferences or no SMTP mappings - return empty result
        console.log(`⚠️ No assigned conferences or SMTP mappings - returning empty result`);
        return res.json({
          emails: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: 0,
            hasMore: false
          }
        });
      }
      
      // User has assigned conferences with SMTP mappings
      if (accountId && accountId !== 'all') {
        // If specific account requested, verify it's in allowed list
        if (!conferenceSmtpIds.includes(String(accountId))) {
          // Requested account is not in allowed list - return empty result
          console.log(`⚠️ Requested account ${accountId} not in allowed list - returning empty result`);
          return res.json({
            emails: [],
            pagination: {
              total: 0,
              page: parseInt(page),
              limit: parseInt(limit),
              pages: 0,
              hasMore: false
            }
          });
        }
        conditions.push({ emailAccountId: accountId });
        console.log(`📧 Filtering by accountId: ${accountId}`);
      } else {
        // No specific account requested - filter to only allowed accounts
        conditions.push({
          emailAccountId: {
            [Op.in]: conferenceSmtpIds
          }
        });
        console.log(`📧 Filtering by conference SMTP account IDs:`, conferenceSmtpIds);
      }
    }

    // Add email address filters (only if valid)
    if (fromEmail) {
      try {
        conditions.push({ from: { [Op.iLike]: `%${fromEmail}%` } });
      } catch (fromError) {
        console.error('Error applying fromEmail filter:', fromError);
      }
    }
    if (toEmail) {
      try {
        conditions.push({ to: { [Op.iLike]: `%${toEmail}%` } });
      } catch (toError) {
        console.error('Error applying toEmail filter:', toError);
      }
    }

    // Add date range filters (only if valid dates)
    if (validStartDate || validEndDate) {
      try {
        const dateCondition = {};
        if (validStartDate) {
          dateCondition[Op.gte] = validStartDate;
        }
        if (validEndDate) {
          dateCondition[Op.lte] = validEndDate;
        }
        if (Object.keys(dateCondition).length > 0) {
          conditions.push({ date: dateCondition });
        }
      } catch (dateError) {
        console.error('Error applying date filters:', dateError);
      }
    }

    // Add general search filter (only if valid)
    if (search) {
      try {
        conditions.push({
          [Op.or]: [
            { subject: { [Op.iLike]: `%${search}%` } },
            { from: { [Op.iLike]: `%${search}%` } },
            { to: { [Op.iLike]: `%${search}%` } },
            { body: { [Op.iLike]: `%${search}%` } }
          ]
        });
      } catch (searchError) {
        console.error('Error applying search filter:', searchError);
      }
    }

    // Add additional filters
    try {
      switch (filter) {
        case 'unread':
          conditions.push({ isRead: false });
          break;
        case 'important':
          conditions.push({ isImportant: true });
          break;
        case 'starred':
          conditions.push({ isStarred: true });
          break;
        case 'attachments':
          conditions.push({ hasAttachments: true });
          break;
        case 'sent':
          conditions.push({ isSent: true });
          break;
        case 'drafts':
          conditions.push({ isDraft: true });
          break;
      }
    } catch (filterError) {
      console.error('Error applying filter:', filterError);
    }

    // Combine all conditions with AND
    // Flatten conditions to avoid nested Op.and
    const flattenedConditions = [];
    conditions.forEach(condition => {
      if (condition && typeof condition === 'object') {
        // If condition already has Op.and, extract its conditions
        if (condition[Op.and] && Array.isArray(condition[Op.and])) {
          flattenedConditions.push(...condition[Op.and]);
        } else {
          flattenedConditions.push(condition);
        }
      }
    });
    
    if (flattenedConditions.length === 1) {
      Object.assign(whereClause, flattenedConditions[0]);
    } else if (flattenedConditions.length > 1) {
      whereClause[Op.and] = flattenedConditions;
    }

    // Build order clause
    const orderClause = [];
    switch (sortBy) {
      case 'from':
        orderClause.push(['from', sortOrder]);
        break;
      case 'subject':
        orderClause.push(['subject', sortOrder]);
        break;
      case 'size':
        orderClause.push(['size', sortOrder]);
        break;
      case 'date':
      default:
        orderClause.push(['date', sortOrder]);
        break;
    }

    const offset = (page - 1) * limit;
    const parsedLimit = parseInt(limit);

    // Execute query with error handling
    let count = 0;
    let emails = [];
    
    console.log(`📧 Executing email query with whereClause:`, JSON.stringify(whereClause, null, 2));
    
    try {
      const result = await Email.findAndCountAll({
        where: whereClause,
        include: [
          { model: EmailAccount, as: 'emailAccount', attributes: ['id', 'name', 'email'], required: false },
          { model: EmailFolder, as: 'emailFolder', attributes: ['id', 'name', 'type'], required: false },
          { model: EmailThread, as: 'thread', attributes: ['id', 'subject'], required: false },
          { model: Client, as: 'client', attributes: ['id', 'name', 'email'], required: false }
        ],
        order: orderClause,
        limit: parsedLimit,
        offset: parseInt(offset),
        distinct: true
      });
      
      count = result.count || 0;
      emails = Array.isArray(result.rows) ? result.rows : [];
      console.log(`✅ Email query executed successfully - Found ${count} emails, returning ${emails.length} emails`);
    } catch (queryError) {
      console.error('❌ Error executing email query:', queryError);
      // Return empty result instead of error
      count = 0;
      emails = [];
    }

    res.json({
      emails: emails || [],
      pagination: {
        total: count || 0,
        page: parseInt(page),
        limit: parsedLimit,
        pages: Math.ceil(count / parsedLimit),
        hasMore: offset + emails.length < count
      }
    });
  } catch (error) {
    console.error('Get emails error:', error);
    // Return safe default response instead of error
    res.status(500).json({ 
      error: 'Failed to fetch emails',
      message: error.message || 'Internal server error',
      emails: [],
      pagination: {
        total: 0,
        page: 1,
        limit: 50,
        pages: 0,
        hasMore: false
      }
    });
  }
});

// Get email by ID
router.get('/:id', async (req, res) => {
  try {
    const email = await Email.findByPk(req.params.id, {
      include: [
        { model: EmailAccount, as: 'emailAccount', attributes: ['id', 'name', 'email'] },
        { model: EmailFolder, as: 'emailFolder', attributes: ['id', 'name', 'type'] },
        { model: EmailThread, as: 'thread', attributes: ['id', 'subject'] },
        { model: Client, as: 'client', attributes: ['id', 'name', 'email'] },
        { model: EmailLog, as: 'logs', order: [['timestamp', 'DESC']] }
      ]
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json(email);
  } catch (error) {
    console.error('Get email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update email (for folder changes, etc.)
router.put('/:id', async (req, res) => {
  try {
    const { folder, isStarred, isImportant, isRead } = req.body;
    const email = await Email.findByPk(req.params.id, {
      include: [{
        model: EmailAccount,
        as: 'emailAccount'
      }]
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    const updateData = {};
    const needsImapSync = {};
    
    if (folder !== undefined) {
      updateData.folder = folder;
      needsImapSync.move = folder !== email.folder;
      needsImapSync.targetFolder = folder;
    }
    if (isStarred !== undefined) {
      updateData.isStarred = isStarred;
      needsImapSync.star = isStarred !== email.isStarred;
    }
    if (isImportant !== undefined) updateData.isImportant = isImportant;
    if (isRead !== undefined) {
      updateData.isRead = isRead;
      needsImapSync.read = isRead !== email.isRead;
    }

    // Update database immediately (don't wait for IMAP sync)
    await email.update(updateData);
    await email.reload();

    // Perform IMAP sync asynchronously in the background (non-blocking)
    if (email.emailAccount && (needsImapSync.move || needsImapSync.star || needsImapSync.read)) {
      setImmediate(async () => {
        try {
          // Reload email to get current state before syncing
          const emailForSync = await Email.findByPk(req.params.id, {
            include: [{
              model: EmailAccount,
              as: 'emailAccount'
            }]
          });

          if (emailForSync && emailForSync.emailAccount) {
            if (needsImapSync.move && folder === 'archive') {
              await syncEmailOperationToImap(emailForSync, emailForSync.emailAccount, 'archive');
            } else if (needsImapSync.move) {
              await syncEmailOperationToImap(emailForSync, emailForSync.emailAccount, 'move', { targetFolder: folder });
            }
            
            if (needsImapSync.star) {
              await syncEmailOperationToImap(emailForSync, emailForSync.emailAccount, 'star', { isStarred });
            }
            
            if (needsImapSync.read) {
              await syncEmailOperationToImap(emailForSync, emailForSync.emailAccount, 'read', { isRead });
            }
          }
        } catch (syncError) {
          console.error(`Failed to sync email ${email.id} with IMAP:`, syncError.message);
          // Don't fail the request if IMAP sync fails
        }
      });
    }

    // Return response immediately
    res.json(email);
  } catch (error) {
    console.error('Update email error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Send email with attachments support
router.post('/send', upload.any(), async (req, res) => {
  try {
    // Debug: Log all received data
    console.log('=== Email Send Request Debug ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body keys:', Object.keys(req.body));
    console.log('Body values:', JSON.stringify(req.body, null, 2));
    console.log('Files:', req.files ? req.files.map(f => ({ fieldname: f.fieldname, filename: f.originalname })) : 'No files');
    console.log('================================');
    
    // Parse form fields from multipart/form-data
    const emailAccountId = req.body.emailAccountId;
    const to = req.body.to;
    const rawCc = req.body.cc || '';
    const rawBcc = req.body.bcc || '';
    const subject = req.body.subject;
    const body = req.body.body || '';
    const bodyHtml = req.body.bodyHtml || req.body.body || '';
    const bodyText = req.body.bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '') : '');
    const parentId = req.body.parentId || null;
    const parentType = req.body.parentType || null;
    const isTracked = req.body.isTracked === 'true' || req.body.isTracked === true;
    const clientId = req.body.clientId || null;
    const conferenceId = req.body.conferenceId || null;

    // Get uploaded files - filter by fieldname 'attachments'
    const uploadedFiles = (req.files || []).filter(file => file.fieldname === 'attachments');
    let templateAttachmentsMeta = [];
    let templateAttachmentsForSending = [];
    if (req.body.templateId) {
      try {
        const template = await EmailTemplate.findByPk(req.body.templateId);
        if (template?.attachments && Array.isArray(template.attachments)) {
          templateAttachmentsMeta = template.attachments.map(att => ({
            filename: att.filename || att.name || 'attachment',
            name: att.name || att.filename || 'attachment',
            size: att.size || null,
            type: att.contentType || att.type || null,
            contentType: att.contentType || att.type || null,
            encoding: att.encoding || (att.content ? 'base64' : undefined),
            content: att.content || null
          }));
          templateAttachmentsForSending = prepareAttachmentsForSending(template.attachments);
        }
      } catch (err) {
        console.warn('⚠️  Unable to load template attachments:', err.message);
      }
    }

    // Validate required fields with detailed error
    if (!emailAccountId || emailAccountId === 'undefined' || emailAccountId === 'null' || emailAccountId === '') {
      console.error('❌ Missing or invalid emailAccountId:', emailAccountId);
      console.error('Full request body:', JSON.stringify(req.body, null, 2));
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'emailAccountId is required and must be a valid UUID or number',
        received: { emailAccountId, to, subject }
      });
    }
    
    if (!to || !to.trim() || to === 'undefined' || to === '') {
      console.error('❌ Missing or invalid to field:', to);
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Recipient (to) is required',
        received: { emailAccountId, to, subject }
      });
    }
    
    if (!subject || !subject.trim() || subject === 'undefined' || subject === '') {
      console.error('❌ Missing or invalid subject:', subject);
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Subject is required',
        received: { emailAccountId, to, subject }
      });
    }

    // Resolve email account agnostically (UUID or numeric), no strict format validation
    let account;
    let accountId;
    const cleanedEmailAccountId = String(emailAccountId || '').trim();

    console.log('🔍 Resolving emailAccountId:', cleanedEmailAccountId);

    // Try primary key lookup directly (works for UUID string IDs)
    account = await EmailAccount.findByPk(cleanedEmailAccountId);

    // If not found and id looks numeric, try numeric PK just in case
    if (!account) {
      const asNumber = parseInt(cleanedEmailAccountId, 10);
      if (!Number.isNaN(asNumber)) {
        account = await EmailAccount.findByPk(asNumber);
      }
    }

    // As a fallback, try findOne by id equality (string)
    if (!account) {
      account = await EmailAccount.findOne({ where: { id: cleanedEmailAccountId } });
    }

    if (!account) {
      console.error('❌ Email account not found for id:', cleanedEmailAccountId);
      return res.status(404).json({ 
        error: 'Email account not found',
        details: `No email account found with id: ${cleanedEmailAccountId}`
      });
    }

    accountId = account.id; // ensure we use the exact id from DB
    console.log('✅ Found email account:', account.email, account.name, 'ID:', accountId);

    // Prepare attachments array for database storage
    const attachments = [
      ...uploadedFiles.map(file => ({
        filename: file.originalname,
        name: file.originalname,
        content: file.buffer.toString('base64'),
        contentType: file.mimetype,
        size: file.size
      })),
      ...templateAttachmentsMeta
    ];

    // Conference-level follow-up CC recipients
    let conferenceFollowupCc = [];
    if (conferenceId) {
      try {
        const conference = await Conference.findByPk(conferenceId);
        if (conference?.settings?.followupCC) {
          conferenceFollowupCc = normalizeEmailList(conference.settings.followupCC);
        }
      } catch (err) {
        console.warn(`⚠️  Unable to load conference follow-up CC for conference ${conferenceId}:`, err.message);
      }
    }

    const ccListFromRequest = normalizeEmailList(rawCc);
    const combinedCcList = mergeEmailLists(ccListFromRequest, conferenceFollowupCc);
    const ccHeaderValue = combinedCcList.length > 0 ? combinedCcList.join(', ') : null;
    const bccHeaderValue = rawBcc && rawBcc.trim() ? rawBcc : null;

    if (conferenceFollowupCc.length > 0) {
      console.log(`📎 [Follow-up CC] Applying ${conferenceFollowupCc.length} conference-level CC recipient(s) to this email.`);
    }

    const formattedBodyHtml = formatEmailHtml(bodyHtml || body || '');
    logEmailHtmlPayload('manual-compose', formattedBodyHtml);
    const finalHtmlPayload = formattedBodyHtml || bodyHtml || body || bodyText || '';
    const finalTextPayload = bodyText || body || (finalHtmlPayload ? finalHtmlPayload.replace(/<[^>]*>/g, '') : '');

    // Create email record
    const email = await Email.create({
      emailAccountId: accountId,
      from: account.email,
      fromName: account.name,
      to,
      cc: ccHeaderValue,
      bcc: bccHeaderValue,
      subject,
      body: finalTextPayload,
      bodyHtml: finalHtmlPayload,
      bodyText: finalTextPayload,
      attachments: attachments.length > 0 ? attachments : null,
      parentId,
      parentType,
      isTracked,
      isSent: false,
      status: 'draft',
      folder: 'sent',
      date: new Date()
    });

    // Send actual email using nodemailer
    try {
      // Create transporter with proper TLS settings
      const transporter = nodemailer.createTransport({
        host: account.smtpHost,
        port: account.smtpPort,
        secure: account.smtpPort === 465, // true for 465, false for other ports
        requireTLS: account.smtpPort === 587, // require TLS for port 587
        tls: {
          rejectUnauthorized: false
        },
        auth: {
          user: account.smtpUsername,
          pass: decryptEmailPassword(account.smtpPassword)
        }
      });

      // Threading headers (add-only, preserve existing behavior when none found)
      let threadingHeaders = {};
      try {
        if (clientId) {
          const where = { clientId, status: 'sent' };
          if (conferenceId) where.conferenceId = conferenceId;
          const root = await Email.findOne({
            where,
            order: [['createdAt', 'ASC']],
            attributes: ['messageId']
          });
          if (root?.messageId) {
            threadingHeaders.inReplyTo = root.messageId;
            threadingHeaders.references = root.messageId;
          }
        }
      } catch (e) {
        console.log('Threading lookup skipped:', e.message);
      }

      // Prepare email options
      const mailOptions = {
        from: `${account.name} <${account.email}>`,
        to: to,
        subject: subject,
        text: finalTextPayload,
        html: finalHtmlPayload,
        ...threadingHeaders
      };

      // Add CC and BCC if provided
      if (ccHeaderValue) mailOptions.cc = ccHeaderValue;
      if (bccHeaderValue) mailOptions.bcc = bccHeaderValue;

      // Add attachments if any
      const uploadAttachmentsForSending = uploadedFiles.map(file => ({
        filename: file.originalname,
        content: file.buffer,
        contentType: file.mimetype
      }));

      const combinedAttachments = [
        ...templateAttachmentsForSending,
        ...uploadAttachmentsForSending
      ];

      if (combinedAttachments.length > 0) {
        mailOptions.attachments = combinedAttachments;
      }

      // Send email
      const info = await transporter.sendMail(mailOptions);
      
      // Check if email was actually accepted or rejected
      const wasAccepted = info.accepted && info.accepted.length > 0;
      const wasRejected = info.rejected && info.rejected.length > 0;
      
      if (wasRejected) {
        // Email was rejected by SMTP server
        console.error('❌ Email rejected by SMTP server:');
        console.error('   Rejected recipients:', info.rejected);
        console.error('   Response:', info.response);
        
        await email.update({
          isSent: false,
          status: 'failed',
          errorMessage: `Rejected recipients: ${info.rejected.join(', ')}`
        });
        
        return res.status(400).json({
          error: 'Email delivery failed',
          details: `The following recipients were rejected: ${info.rejected.join(', ')}`,
          rejected: info.rejected,
          accepted: info.accepted || []
        });
      }
      
      // Email was accepted by SMTP server
      console.log('✅ Email accepted by SMTP server:');
      console.log('   Message ID:', info.messageId);
      console.log('   Accepted recipients:', info.accepted);
      console.log('   Response:', info.response);
      
      // Update email record with success
      await email.update({
        isSent: true,
        status: 'sent',
        messageId: info.messageId,
        deliveredAt: new Date()
      });

      console.log('📧 Email marked as sent in database');
      
      res.status(201).json({
        ...email.toJSON(),
        isSent: true,
        status: 'sent',
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected || []
      });
      
    } catch (sendError) {
      console.error('📧 Email send failed:', sendError);
      
      // Update email record with failure
      await email.update({
        isSent: false,
        status: 'failed'
      });
      
      res.status(500).json({ 
        error: 'Failed to send email',
        details: sendError.message 
      });
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save email as draft (without sending)
router.post('/draft', upload.any(), async (req, res) => {
  try {
    const emailAccountId = req.body.emailAccountId;
    const to = req.body.to || '';
    const cc = req.body.cc || '';
    const bcc = req.body.bcc || '';
    const subject = req.body.subject || '';
    const bodyHtml = req.body.bodyHtml || req.body.body || '';
    const bodyText = req.body.bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '') : '');
    const parentId = req.body.parentId || null;
    const parentType = req.body.parentType || null;
    const isTracked = req.body.isTracked === 'true' || req.body.isTracked === true;

    // Validate emailAccountId
    if (!emailAccountId || emailAccountId === 'undefined' || emailAccountId === 'null' || emailAccountId === '') {
      return res.status(400).json({ error: 'emailAccountId is required' });
    }

    // Resolve email account agnostically (UUID or numeric)
    let account;
    let accountId;
    const cleanedEmailAccountId = String(emailAccountId || '').trim();

    // Try primary key lookup directly (works for UUID string IDs)
    account = await EmailAccount.findByPk(cleanedEmailAccountId);

    // If not found and id looks numeric, try numeric PK just in case
    if (!account) {
      const asNumber = parseInt(cleanedEmailAccountId, 10);
      if (!Number.isNaN(asNumber)) {
        account = await EmailAccount.findByPk(asNumber);
      }
    }

    // As a fallback, try findOne by id equality (string)
    if (!account) {
      account = await EmailAccount.findOne({ where: { id: cleanedEmailAccountId } });
    }

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    accountId = account.id; // ensure we use the exact id from DB

    // Get uploaded files - filter by fieldname 'attachments'
    const uploadedFiles = (req.files || []).filter(file => file.fieldname === 'attachments');

    // Prepare attachments array for database storage
    const attachments = uploadedFiles.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('base64'),
      contentType: file.mimetype,
      size: file.size
    }));

    const messageId = generateDraftMessageId(account.email);

    // Create draft email record
    const email = await Email.create({
      emailAccountId: accountId,
      from: account.email,
      fromName: account.name,
      to: to || account.email, // Default to account email if no recipient
      cc: cc || null,
      bcc: bcc || null,
      subject: subject || '(No Subject)',
      body: bodyHtml || bodyText || '',
      bodyHtml: bodyHtml || '',
      bodyText: bodyText || '',
      attachments: attachments.length > 0 ? attachments : null,
      hasAttachments: attachments.length > 0,
      parentId,
      parentType,
      isTracked,
      isSent: false,
      isDraft: true,
      status: 'draft',
      folder: 'drafts',
      date: new Date(),
      messageId
    });

    try {
      await syncDraftToMailbox(email, account);
    } catch (syncError) {
      console.error('Draft saved locally but failed to sync with mailbox:', syncError.message);
    }

    res.status(201).json({
      ...email.toJSON(),
      message: 'Draft saved successfully'
    });
  } catch (error) {
    console.error('Save draft error:', error);
    res.status(500).json({ error: 'Failed to save draft', details: error.message });
  }
});

// Update existing draft
router.put('/draft/:id', upload.any(), async (req, res) => {
  try {
    const draftId = req.params.id;
    const emailAccountId = req.body.emailAccountId;
    const to = req.body.to || '';
    const cc = req.body.cc || '';
    const bcc = req.body.bcc || '';
    const subject = req.body.subject || '';
    const bodyHtml = req.body.bodyHtml || req.body.body || '';
    const bodyText = req.body.bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '') : '');
    const parentId = req.body.parentId || null;
    const parentType = req.body.parentType || null;
    const isTracked = req.body.isTracked === 'true' || req.body.isTracked === true;

    // Validate emailAccountId
    if (!emailAccountId || emailAccountId === 'undefined' || emailAccountId === 'null' || emailAccountId === '') {
      return res.status(400).json({ error: 'emailAccountId is required' });
    }

    // Find the draft
    const draft = await Email.findByPk(draftId);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (!draft.isDraft) {
      return res.status(400).json({ error: 'Email is not a draft' });
    }

    // Resolve email account agnostically (UUID or numeric)
    let account;
    let accountId;
    const cleanedEmailAccountId = String(emailAccountId || '').trim();

    // Try primary key lookup directly (works for UUID string IDs)
    account = await EmailAccount.findByPk(cleanedEmailAccountId);

    // If not found and id looks numeric, try numeric PK just in case
    if (!account) {
      const asNumber = parseInt(cleanedEmailAccountId, 10);
      if (!Number.isNaN(asNumber)) {
        account = await EmailAccount.findByPk(asNumber);
      }
    }

    // As a fallback, try findOne by id equality (string)
    if (!account) {
      account = await EmailAccount.findOne({ where: { id: cleanedEmailAccountId } });
    }

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    accountId = account.id; // ensure we use the exact id from DB

    // Get uploaded files - filter by fieldname 'attachments'
    const uploadedFiles = (req.files || []).filter(file => file.fieldname === 'attachments');

    // Prepare attachments array for database storage
    const attachments = uploadedFiles.map(file => ({
      filename: file.originalname,
      content: file.buffer.toString('base64'),
      contentType: file.mimetype,
      size: file.size
    }));

    const finalAttachments = attachments.length > 0 ? attachments : (draft.attachments || null);
    const hasAttachments = Array.isArray(finalAttachments) ? finalAttachments.length > 0 : !!finalAttachments;
    const existingUid = draft.uid || null;

    // Update draft email record
    await draft.update({
      emailAccountId: accountId,
      from: account.email,
      fromName: account.name,
      to: to || account.email, // Default to account email if no recipient
      cc: cc || null,
      bcc: bcc || null,
      subject: subject || '(No Subject)',
      body: bodyHtml || bodyText || '',
      bodyHtml: bodyHtml || '',
      bodyText: bodyText || '',
      attachments: finalAttachments,
      hasAttachments,
      parentId,
      parentType,
      isTracked,
      date: new Date(), // Update timestamp
      messageId: draft.messageId || generateDraftMessageId(account.email)
    });

    // Reload to get updated data
    await draft.reload();

    try {
      await syncDraftToMailbox(draft, account, { replaceUid: existingUid });
    } catch (syncError) {
      console.error('Draft updated locally but failed to sync with mailbox:', syncError.message);
    }

    res.status(200).json({
      ...draft.toJSON(),
      message: 'Draft updated successfully'
    });
  } catch (error) {
    console.error('Update draft error:', error);
    res.status(500).json({ error: 'Failed to update draft', details: error.message });
  }
});

// Mark emails as read
router.put('/mark-read', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    // Update database immediately
    await Email.update(
      { isRead: true },
      { where: { id: { [Op.in]: emailIds } } }
    );

    // Return response immediately
    res.json({ success: true });

    // Perform IMAP sync asynchronously in the background
    setImmediate(async () => {
      try {
        const emails = await Email.findAll({
          where: { id: { [Op.in]: emailIds } },
          include: [{
            model: EmailAccount,
            as: 'emailAccount'
          }]
        });

        for (const email of emails) {
          if (email.emailAccount && email.uid) {
            await syncEmailOperationToImap(email, email.emailAccount, 'read', { isRead: true });
          }
        }
      } catch (syncError) {
        console.error('Failed to sync mark-as-read with IMAP:', syncError.message);
        // Don't fail the request if IMAP sync fails
      }
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark emails as unread
router.put('/mark-unread', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    // Update database immediately
    await Email.update(
      { isRead: false },
      { where: { id: { [Op.in]: emailIds } } }
    );

    // Return response immediately
    res.json({ success: true });

    // Perform IMAP sync asynchronously in the background
    setImmediate(async () => {
      try {
        const emails = await Email.findAll({
          where: { id: { [Op.in]: emailIds } },
          include: [{
            model: EmailAccount,
            as: 'emailAccount'
          }]
        });

        for (const email of emails) {
          if (email.emailAccount && email.uid) {
            await syncEmailOperationToImap(email, email.emailAccount, 'read', { isRead: false });
          }
        }
      } catch (syncError) {
        console.error('Failed to sync mark-as-unread with IMAP:', syncError.message);
        // Don't fail the request if IMAP sync fails
      }
    });
  } catch (error) {
    console.error('Mark as unread error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark emails as important
router.put('/mark-important', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    await Email.update(
      { isImportant: true },
      { where: { id: { [Op.in]: emailIds } } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark as important error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark emails as starred
router.put('/mark-starred', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    // Get emails with their accounts for IMAP sync
    const emails = await Email.findAll({
      where: { id: { [Op.in]: emailIds } },
      include: [{
        model: EmailAccount,
        as: 'emailAccount',
        required: false
      }]
    });

    // Update database immediately (don't wait for IMAP sync)
    await Email.update(
      { isStarred: true },
      { where: { id: { [Op.in]: emailIds } } }
    );

    // Return response immediately
    res.json({ success: true });

    // Perform IMAP sync asynchronously in the background (non-blocking)
    setImmediate(async () => {
      for (const email of emails) {
        if (email.emailAccount) {
          try {
            await syncEmailOperationToImap(email, email.emailAccount, 'star', { isStarred: true });
          } catch (syncError) {
            console.error(`Failed to sync star for email ${email.id}:`, syncError.message);
            // Continue with other emails even if one fails
          }
        }
      }
    });
  } catch (error) {
    console.error('Mark as starred error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Move emails to folder
router.put('/move', async (req, res) => {
  try {
    const { emailIds, folderId } = req.body;

    if (!emailIds || !Array.isArray(emailIds) || !folderId) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const folder = await EmailFolder.findByPk(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // Get emails with their accounts for IMAP sync (before update)
    const emails = await Email.findAll({
      where: { id: { [Op.in]: emailIds } },
      include: [{
        model: EmailAccount,
        as: 'emailAccount',
        required: false
      }]
    });

    // Update database immediately (don't wait for IMAP sync)
    await Email.update(
      { folderId, folder: folder.type },
      { where: { id: { [Op.in]: emailIds } } }
    );

    // Return response immediately
    res.json({ success: true });

    // Perform IMAP sync asynchronously in the background (non-blocking)
    setImmediate(async () => {
      for (const email of emails) {
        if (email.emailAccount) {
          try {
            await syncEmailOperationToImap(email, email.emailAccount, 'move', { targetFolder: folder.type });
          } catch (syncError) {
            console.error(`Failed to sync move for email ${email.id}:`, syncError.message);
            // Continue with other emails even if one fails
          }
        }
      }
    });
  } catch (error) {
    console.error('Move emails error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Delete emails
router.delete('/', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    // Get emails with their accounts for IMAP sync (before update)
    const emails = await Email.findAll({
      where: { id: { [Op.in]: emailIds } },
      include: [{
        model: EmailAccount,
        as: 'emailAccount',
        required: false
      }]
    });

    // Update database immediately (don't wait for IMAP sync)
    await Email.update(
      { folder: 'trash', isDeleted: true },
      { where: { id: { [Op.in]: emailIds } } }
    );

    // Return response immediately
    res.json({ success: true });

    // Perform IMAP sync asynchronously in the background (non-blocking)
    setImmediate(async () => {
      for (const email of emails) {
        if (email.emailAccount) {
          try {
            await syncEmailOperationToImap(email, email.emailAccount, 'delete');
          } catch (syncError) {
            console.error(`Failed to sync delete for email ${email.id}:`, syncError.message);
            // Continue with other emails even if one fails
          }
        }
      }
    });
  } catch (error) {
    console.error('Delete emails error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Permanently delete emails
router.delete('/permanent', async (req, res) => {
  try {
    const { emailIds } = req.body;

    if (!emailIds || !Array.isArray(emailIds)) {
      return res.status(400).json({ error: 'Invalid email IDs' });
    }

    await Email.destroy({
      where: { id: { [Op.in]: emailIds } }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Permanent delete emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get email statistics
router.get('/stats/overview', async (req, res) => {
  try {
    const stats = await Email.findAll({
      attributes: [
        [Email.sequelize.fn('COUNT', Email.sequelize.col('id')), 'total'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isRead" = false THEN 1 END')), 'unread'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isImportant" = true THEN 1 END')), 'important'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isStarred" = true THEN 1 END')), 'starred'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "hasAttachments" = true THEN 1 END')), 'withAttachments'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isSent" = true THEN 1 END')), 'sent'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isDraft" = true THEN 1 END')), 'drafts']
      ],
      raw: true
    });

    res.json(stats[0]);
  } catch (error) {
    console.error('Get email stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get folder statistics
router.get('/stats/folders', async (req, res) => {
  try {
    const stats = await Email.findAll({
      attributes: [
        'folder',
        [Email.sequelize.fn('COUNT', Email.sequelize.col('id')), 'count'],
        [Email.sequelize.fn('COUNT', Email.sequelize.literal('CASE WHEN "isRead" = false THEN 1 END')), 'unread']
      ],
      group: ['folder'],
      raw: true
    });

    res.json(stats);
  } catch (error) {
    console.error('Get folder stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Sync emails from IMAP
router.post('/sync', async (req, res) => {
  try {
    const ImapService = require('../services/ImapService');
    const imapService = new ImapService();
    const { accountId, daysBack = 365 } = req.body;
    
    // Get IMAP accounts to sync
    let accounts;
    if (accountId) {
      const account = await EmailAccount.findByPk(accountId);
      if (!account) {
        return res.status(404).json({ error: 'Email account not found' });
      }
      accounts = [account];
    } else {
      accounts = await EmailAccount.findAll({
        where: { 
          type: { [Op.in]: ['imap', 'both'] },
          imapHost: { [Op.ne]: null },
          isActive: true
        }
      });
    }

    if (accounts.length === 0) {
      return res.status(400).json({ 
        error: 'No IMAP accounts configured',
        message: 'Please add an IMAP email account first'
      });
    }

    // Calculate date for historical sync
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    console.log(`📧 Starting email sync for ${accounts.length} account(s), fetching ${daysBack} days back...`);

    let totalSynced = 0;
    const syncResults = [];

    // Sync each account
    for (const account of accounts) {
      try {
        console.log(`🔄 Syncing account: ${account.name} (${account.email})`);
        
        // Fetch historical emails
        const result = await imapService.fetchEmails(account, {
          maxMessages: 500, // Fetch up to 500 emails
          unseenOnly: false, // Fetch all emails, not just unread
          since: sinceDate
        });

        if (result.success && result.emails) {
          // Save emails to database with auto-created threads
          for (const emailData of result.emails) {
            try {
              // For drafts, check by UID and folder instead of messageId (drafts might not have messageId)
              let existingEmail = null;
              if (emailData.isDraft && emailData.uid) {
                existingEmail = await Email.findOne({
                  where: { 
                    uid: emailData.uid,
                    emailAccountId: account.id,
                    folder: 'drafts'
                  }
                });
              } else if (emailData.messageId) {
                existingEmail = await Email.findOne({
                  where: { 
                    messageId: emailData.messageId,
                    emailAccountId: account.id
                  }
                });
              }

              if (!existingEmail) {
                // For drafts, skip thread creation (drafts don't need threads)
                let thread = null;
                if (!emailData.isDraft) {
                  // Auto-create or find thread for this email
                  const threadSubject = emailData.subject || 'no-subject';
                  
                  thread = await EmailThread.findOne({
                    where: { 
                      emailAccountId: account.id,
                      subject: threadSubject
                    }
                  });
                  
                  if (!thread) {
                    const { v4: uuidv4 } = require('uuid');
                    thread = await EmailThread.create({
                      id: uuidv4(),
                      subject: threadSubject,
                      participants: [emailData.from, emailData.to].filter(Boolean).join(', '),
                      emailAccountId: account.id,
                      lastMessageAt: emailData.date || new Date()
                    });
                    console.log(`📝 Created thread for: ${threadSubject}`);
                  }
                }
                
                // For drafts, generate messageId if missing
                if (emailData.isDraft && !emailData.messageId) {
                  const { v4: uuidv4 } = require('uuid');
                  emailData.messageId = `draft-${emailData.uid}-${account.id}-${Date.now()}`;
                }
                
                // Create email with thread - preserve folder from sync (spam, drafts, sent, etc.)
                // Set status correctly: draft if isDraft, sent if isSent (or received), otherwise 'sent'
                const emailStatus = emailData.isDraft ? 'draft' : (emailData.isSent ? 'sent' : 'sent');
                
                // Ensure bodyHtml is set for drafts
                const emailToSave = {
                  ...emailData,
                  threadId: thread?.id || null,
                  emailAccountId: account.id,
                  folder: emailData.folder || 'inbox', // Preserve folder from sync instead of forcing 'inbox'
                  status: emailStatus, // Set status correctly to avoid 'draft' default
                  bodyHtml: emailData.bodyHtml || emailData.body || '', // Ensure bodyHtml is set
                  bodyText: emailData.bodyText || (emailData.body ? emailData.body.replace(/<[^>]*>/g, '') : '') || '' // Ensure bodyText is set
                };
                
                console.log(`💾 Saving ${emailData.isDraft ? 'draft' : 'email'}: ${emailData.subject} (folder: ${emailData.folder}, bodyHtml length: ${emailToSave.bodyHtml?.length || 0})`);
                
                await Email.create(emailToSave);
                totalSynced++;
              }
            } catch (saveError) {
              console.error(`Error saving email: ${saveError.message}`);
            }
          }

          syncResults.push({
            accountId: account.id,
            accountName: account.name,
            accountEmail: account.email,
            emailsFound: result.emails.length,
            success: true
          });
          
          console.log(`✅ Synced ${result.emails.length} emails from ${account.name}`);
        } else {
          syncResults.push({
            accountId: account.id,
            accountName: account.name,
            accountEmail: account.email,
            emailsFound: 0,
            success: false,
            error: result.error || 'No emails found'
          });
        }
      } catch (accountError) {
        console.error(`Error syncing account ${account.name}:`, accountError.message);
        syncResults.push({
          accountId: account.id,
          accountName: account.name,
          accountEmail: account.email,
          success: false,
          error: accountError.message
        });
      }
    }

    console.log(`✅ Email sync completed. Total new emails: ${totalSynced}`);

    res.json({ 
      success: true,
      message: `Successfully synced ${totalSynced} new emails from ${accounts.length} account(s)`,
      totalSynced,
      accountsProcessed: accounts.length,
      daysBack,
      results: syncResults
    });
  } catch (error) {
    console.error('Sync emails error:', error);
    res.status(500).json({ error: 'Failed to trigger email sync', details: error.message });
  }
});

// Clear demo emails
router.post('/clear', async (req, res) => {
  try {
    const result = await Email.destroy({
      where: {
        isDraft: { [Op.or]: [true, null] }
      }
    });

    res.json({ 
      success: true,
      message: `Cleared ${result} demo/draft emails`,
      count: result
    });
  } catch (error) {
    console.error('Clear emails error:', error);
    res.status(500).json({ error: 'Failed to clear emails', details: error.message });
  }
});

module.exports = router;
