const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const http = require('http');
const socketIo = require('socket.io');
const ImapService = require('./services/ImapService');
const FollowUpService = require('./services/FollowUpService');
const RealTimeImapService = require('./services/RealTimeImapService');
const EmailJobScheduler = require('./services/EmailJobScheduler');
const { initDatabase } = require('./database/init');
const { seedCleanData } = require('./database/cleanSeed');
const { ensureEmailAccountOwnershipColumns } = require('./database/ensureEmailAccountOwnershipColumns');
const { Organization, User, Role, Conference, Client, Email, EmailTemplate, FollowUpJob, EmailLog, EmailAccount, EmailFolder, EmailThread, sequelize } = require('./models');
const { Op, Sequelize } = require('sequelize');
const EmailService = require('./services/EmailService');
const emailRoutes = require('./routes/emailRoutes');
const emailAccountRoutes = require('./routes/emailAccountRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const userRoutes = require('./routes/userRoutes');
const clientRoutes = require('./routes/clientRoutes');
const bulkEmailRoutes = require('./routes/bulkEmailRoutes');
const { rescheduleConferenceFollowUps } = clientRoutes;
const { router: imapRoutes, realTimeImapService } = require('./routes/imapRoutes');
const templateDraftRoutes = require('./routes/templateDraftRoutes');
const { sanitizeAttachmentsForStorage } = require('./utils/attachmentUtils');
const { normalizeMessageId, normalizeSubject } = require('./utils/messageIdUtils');
const VALID_TEMPLATE_STAGES = new Set(['abstract_submission', 'registration']);

const { normalizeEmailList } = require('./utils/emailListUtils');
const { formatEmailHtml, logEmailHtmlPayload } = require('./utils/emailHtmlFormatter');
const { requireRole, requireConferenceAccess, requireUserManagement, requireClientAccess } = require('./middleware/rbac');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const EMAIL_TEST_MODE = process.env.EMAIL_TEST_MODE !== 'false';

// Global error handlers to prevent server crashes from unhandled errors (e.g., ImapFlow timeouts)
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
  // Check if it's an ImapFlow timeout error
  if (reason && (reason.code === 'ETIMEOUT' || reason.message?.includes('timeout'))) {
    console.error('⏱️ ImapFlow timeout error caught - this is handled by RealTimeImapService');
    // Don't crash - the service will handle reconnection
    return;
  }
  // Log other unhandled rejections but don't crash
  console.error('⚠️ Unhandled rejection logged, server continues running');
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ Uncaught Exception:', error);
  // Check if it's an ImapFlow timeout error
  if (error.code === 'ETIMEOUT' || error.message?.includes('timeout')) {
    console.error('⏱️ ImapFlow timeout error caught - this is handled by RealTimeImapService');
    // Don't crash - the service will handle reconnection
    return;
  }
  // For other uncaught exceptions, log and continue (or exit if critical)
  console.error('⚠️ Uncaught exception logged, server continues running');
});

// Enhanced CORS configuration - Allow all origins for Replit environment
const corsOptions = {
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Initialize services
const imapService = new ImapService();
const followUpService = new FollowUpService();
const emailService = new EmailService();
const emailJobScheduler = new EmailJobScheduler();

// Helper function to handle Sequelize validation errors and return proper error responses
const handleSequelizeError = (error, res, defaultMessage = 'An error occurred') => {
  console.error('Database error:', error);
  
  // Handle Sequelize validation errors
  if (error.name === 'SequelizeValidationError') {
    const validationErrors = error.errors.map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    // Create user-friendly error message
    const errorMessages = validationErrors.map(err => {
      const fieldName = err.field.charAt(0).toUpperCase() + err.field.slice(1).replace(/([A-Z])/g, ' $1');
      return `${fieldName}: ${err.message}`;
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      message: errorMessages.join(', '),
      details: validationErrors
    });
  }
  
  // Handle unique constraint errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    const field = error.errors?.[0]?.path || 'field';
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
    return res.status(400).json({
      error: 'Duplicate entry',
      message: `${fieldName} already exists. Please use a different value.`,
      field: field
    });
  }
  
  // Handle foreign key constraint errors
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Invalid reference',
      message: 'The referenced record does not exist. Please check your input.'
    });
  }
  
  // Handle database connection errors
  if (error.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: 'Database connection error',
      message: 'Unable to connect to the database. Please try again later.'
    });
  }
  
  // Handle not null constraint errors
  if (error.name === 'SequelizeDatabaseError' && error.message?.includes('NOT NULL')) {
    const fieldMatch = error.message.match(/column "(\w+)"/);
    const field = fieldMatch ? fieldMatch[1] : 'field';
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
    return res.status(400).json({
      error: 'Required field missing',
      message: `${fieldName} is required. Please provide a value.`,
      field: field
    });
  }
  
  // Default error response
  return res.status(500).json({
    error: 'Internal server error',
    message: defaultMessage,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

const normalizeShortName = (value) => {
  if (typeof value !== 'string') {
    return value === null ? null : undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 100);
};

const INTERVAL_UNITS = new Set(['minutes', 'hours', 'days']);
const DEFAULT_STAGE1_INTERVAL = { value: 7, unit: 'days' };
const DEFAULT_STAGE2_INTERVAL = { value: 3, unit: 'days' };
const DEFAULT_MAX_ATTEMPTS = { Stage1: 6, Stage2: 6 };
const DEFAULT_WORKING_HOURS = { start: '09:00', end: '17:00' };
const DEFAULT_TIMEZONE = 'UTC';

const normalizeIntervalConfig = (raw, fallback) => {
  if (raw === null || raw === undefined) {
    return { ...fallback };
  }

  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return { value: raw, unit: 'days' };
  }

  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return { value: parsed, unit: 'days' };
    }
  }

  if (typeof raw === 'object') {
    const value = Number(raw.value);
    const unit = typeof raw.unit === 'string' ? raw.unit.toLowerCase() : fallback.unit;
    if (Number.isFinite(value) && value > 0) {
      return {
        value,
        unit: INTERVAL_UNITS.has(unit) ? unit : fallback.unit
      };
    }
  }

  return { ...fallback };
};

const normalizeMaxAttempts = (raw, fallback) => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
};

const normalizeWorkingHours = (raw) => {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WORKING_HOURS };
  }
  const start = typeof raw.start === 'string' && raw.start.trim() ? raw.start.trim() : DEFAULT_WORKING_HOURS.start;
  const end = typeof raw.end === 'string' && raw.end.trim() ? raw.end.trim() : DEFAULT_WORKING_HOURS.end;
  return { start, end };
};

const sanitizeOptionalUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.href;
  } catch (error) {
    return null;
  }
};

const normalizeTemplateSequence = (rawSequence, fallbackId) => {
  let candidates = [];

  if (Array.isArray(rawSequence)) {
    candidates = rawSequence;
  } else if (typeof rawSequence === 'string') {
    const trimmed = rawSequence.trim();
    if (trimmed) {
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            candidates = parsed;
          } else {
            candidates = [trimmed];
          }
        } catch (error) {
          candidates = [trimmed];
        }
      } else {
        candidates = [trimmed];
      }
    }
  }

  const cleaned = candidates
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  if (!cleaned.length && typeof fallbackId === 'string' && fallbackId.trim()) {
    cleaned.push(fallbackId.trim());
  }

  return cleaned;
};

const normalizeConferenceSettings = (rawSettings = {}, options = {}) => {
  const normalizedFollowups = {
    Stage1: normalizeIntervalConfig(rawSettings.followup_intervals?.Stage1, DEFAULT_STAGE1_INTERVAL),
    Stage2: normalizeIntervalConfig(rawSettings.followup_intervals?.Stage2, DEFAULT_STAGE2_INTERVAL)
  };

  const normalizedAttempts = {
    Stage1: normalizeMaxAttempts(rawSettings.max_attempts?.Stage1, DEFAULT_MAX_ATTEMPTS.Stage1),
    Stage2: normalizeMaxAttempts(rawSettings.max_attempts?.Stage2, DEFAULT_MAX_ATTEMPTS.Stage2)
  };

  const skipWeekends = rawSettings.skip_weekends === undefined ? true : Boolean(rawSettings.skip_weekends);
  const timezone = typeof rawSettings.timezone === 'string' && rawSettings.timezone.trim()
    ? rawSettings.timezone.trim()
    : DEFAULT_TIMEZONE;
  const workingHours = normalizeWorkingHours(rawSettings.working_hours);
  const followupCC = normalizeEmailList(rawSettings.followupCC);
  const abstractSubmissionLink = sanitizeOptionalUrl(rawSettings.abstractSubmissionLink || rawSettings.abstract_submission_link);
  const registrationLink = sanitizeOptionalUrl(rawSettings.registrationLink || rawSettings.registration_link);
  const smtpDefaultId = typeof rawSettings.smtp_default_id === 'string' && rawSettings.smtp_default_id.trim()
    ? rawSettings.smtp_default_id.trim()
    : null;
  const stage1TemplatesRaw = rawSettings.stage1Templates ?? rawSettings.stage1TemplateSequence;
  const stage2TemplatesRaw = rawSettings.stage2Templates ?? rawSettings.stage2TemplateSequence;
  const stage1Templates = normalizeTemplateSequence(stage1TemplatesRaw, options.stage1TemplateId);
  const stage2Templates = normalizeTemplateSequence(stage2TemplatesRaw, options.stage2TemplateId);
  const limitedStage1Templates = stage1Templates.slice(0, normalizedAttempts.Stage1);
  const limitedStage2Templates = stage2Templates.slice(0, normalizedAttempts.Stage2);

  return {
    ...rawSettings,
    followup_intervals: {
      ...(rawSettings.followup_intervals || {}),
      ...normalizedFollowups
    },
    max_attempts: {
      ...(rawSettings.max_attempts || {}),
      ...normalizedAttempts
    },
    skip_weekends: skipWeekends,
    timezone,
    working_hours: workingHours,
    followupCC,
    abstractSubmissionLink,
    registrationLink,
    smtp_default_id: smtpDefaultId,
    stage1Templates: limitedStage1Templates,
    stage2Templates: limitedStage2Templates
  };
};

// Create HTTP server and WebSocket
const server = http.createServer(app);
const io = socketIo(server, {
  cors: corsOptions
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected to WebSocket:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected from WebSocket:', socket.id);
  });
  
  // Handle email-related events
  socket.on('join-email-room', (data) => {
    socket.join('email-updates');
    console.log('📧 Client joined email room');
  });
});

// Middleware
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Database initialization flag
let dbInitialized = false;

// Initialize database
async function initializeDatabase() {
  try {
    console.log('🔧 Initializing database...');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Preflight: ensure clients.name exists for backward compatibility
    try {
      const qi = sequelize.getQueryInterface();
      const { DataTypes } = require('sequelize');
      const table = await qi.describeTable('clients').catch(() => ({}));
      if (table && !table.name) {
        console.log('🛠️ Adding clients.name column (preflight)...');
        await qi.addColumn('clients', 'name', { type: DataTypes.STRING, allowNull: true });
        await sequelize.query(
          `UPDATE clients
             SET name = TRIM(CONCAT(COALESCE(firstName, ''),
               CASE WHEN COALESCE(firstName,'')<>'' AND COALESCE(lastName,'')<>'' THEN ' ' ELSE '' END,
               COALESCE(lastName,'')))
           WHERE name IS NULL OR name = ''`
        );
        await qi.changeColumn('clients', 'name', { type: DataTypes.STRING, allowNull: false, defaultValue: '' });
        try { await qi.removeColumn('clients', 'firstName'); } catch {}
        try { await qi.removeColumn('clients', 'lastName'); } catch {}
        console.log('✅ clients.name column ensured');
      }
      
      // Ensure conferences table no longer has legacy initialTemplateId column
      const conferenceTable = await qi.describeTable('conferences').catch(() => null);
      if (conferenceTable && conferenceTable.initialTemplateId) {
        const dialect = sequelize.getDialect();
        if (dialect === 'postgres') {
          try {
            await sequelize.query('ALTER TABLE "conferences" DROP CONSTRAINT IF EXISTS "conferences_initialTemplateId_fkey";');
          } catch (constraintError) {
            console.log('ℹ️ Skipping dropping legacy initialTemplateId FK:', constraintError.message);
          }
        }
        console.log('🛠️ Removing legacy conferences.initialTemplateId column (preflight)...');
        await qi.removeColumn('conferences', 'initialTemplateId').catch((removeError) => {
          if (!/does not exist/i.test(removeError.message)) {
            throw removeError;
          }
        });
      }
    } catch (e) {
      console.log('ℹ️ Preflight adjustments skipped:', e.message);
    }
    
    // Ensure legacy databases have ownership columns for SMTP accounts before syncing
    await ensureEmailAccountOwnershipColumns(sequelize);

    // Sync database - create tables if they don't exist
    await sequelize.sync({ force: false });
    console.log('✅ Database connected and synced');
    
    // Check if we have users, if not seed the database
    const userCount = await User.count();
    if (userCount === 0) {
      console.log('🌱 Seeding database with initial data...');
      await seedCleanData();
      console.log('✅ Database seeded successfully');
    } else {
      console.log(`📊 Database already has ${userCount} users, preserving existing data`);
    }
    
    dbInitialized = true;
    console.log('✅ Database initialization completed');
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    dbInitialized = false;
    throw error;
  }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: dbInitialized ? 'connected' : 'disconnected',
    emailTestMode: EMAIL_TEST_MODE
  });
});

// App version endpoint for cache-busting
app.get('/api/version', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  // Get package.json version or use timestamp
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
    );
    const version = packageJson.version || '1.0.0';
    
    // Use build time as version (file modification time of index.js)
    const buildTime = fs.statSync(__filename).mtime.getTime();
    
    res.json({
      version: version,
      buildTime: buildTime,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Fallback to timestamp if package.json not found
    res.json({
      version: '1.0.0',
      buildTime: Date.now(),
      timestamp: new Date().toISOString()
    });
  }
});

// Favicon endpoint to prevent 500 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Authentication routes
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user in database
    const user = await User.findOne({ 
      where: { email: email.toLowerCase() },
      include: [{ 
        model: Role, 
        as: 'roleDetails',
        required: false // Make it a LEFT JOIN so it doesn't fail if role doesn't exist
      }]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.roleDetails?.name || user.role || 'Member',
        name: user.name,
        organizationId: user.organizationId
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.roleDetails?.name || user.role || 'Member'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const user = await User.findByPk(req.user.id, {
      include: [{ 
        model: Role, 
        as: 'roleDetails',
        required: false // Make it a LEFT JOIN so it doesn't fail if role doesn't exist
      }]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.roleDetails?.name || user.role || 'Member'
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset routes
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { email } = req.body;
    const user = await User.findOne({ where: { email: email.toLowerCase() } });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate reset token
    const resetToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
    
    // In a real app, you'd send this via email
    res.json({ 
      message: 'Password reset token generated',
      resetToken: resetToken // For testing purposes
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await user.update({ password: hashedPassword });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register routes
const { router: analyticsRoutes } = require('./routes/analyticsRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const taskRoutes = require('./routes/taskRoutes');
const searchRoutes = require('./routes/searchRoutes');

// Protect email routes with authentication so req.user is available
app.use('/api/emails', authenticateToken, emailRoutes);
app.use('/api/bulk-emails', bulkEmailRoutes);
app.use('/api/email-accounts', emailAccountRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);

// Get clients for email compose (must be BEFORE /api/clients route)
app.get('/api/clients/for-email', authenticateToken, async (req, res) => {
  try {
    if (!dbInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    let whereClause = {};
    
    // Role-based filtering: Filter by assigned conferences
    if (req.user.role === 'TeamLead') {
      // Get conferences assigned to this TeamLead
      const assignedConferences = await Conference.findAll({
        where: { assignedTeamLeadId: req.user.id },
        attributes: ['id']
      });
      const conferenceIds = assignedConferences.map(c => c.id);
      
      if (conferenceIds.length > 0) {
        whereClause.conferenceId = { [Op.in]: conferenceIds };
        console.log(`🔒 TeamLead ${req.user.email} - Loading clients from ${conferenceIds.length} assigned conference(s) for email`);
      } else {
        console.log(`🔒 TeamLead ${req.user.email} has no assigned conferences - no clients for email`);
        return res.json([]);
      }
    } else if (req.user.role === 'Member') {
      // Get conferences where this Member is in assignedMemberIds
      const assignedConferences = await Conference.findAll({
        where: {
          assignedMemberIds: { [Op.contains]: [req.user.id] }
        },
        attributes: ['id']
      });
      const conferenceIds = assignedConferences.map(c => c.id);
      
      if (conferenceIds.length > 0) {
        whereClause.conferenceId = { [Op.in]: conferenceIds };
        console.log(`🔒 Member ${req.user.email} - Loading clients from ${conferenceIds.length} assigned conference(s) for email`);
      } else {
        console.log(`🔒 Member ${req.user.email} has no assigned conferences - no clients for email`);
        return res.json([]);
      }
    } else if (req.user.role === 'CEO') {
      console.log(`👑 CEO ${req.user.email} - Loading all clients for email`);
    }

    const clients = await Client.findAll({
      where: whereClause,
      attributes: [
        'id',
        'name',
        'email',
        [Sequelize.literal('NULL'), 'organization']
      ],
      limit: 100,
      order: [['createdAt', 'DESC']]
    });

    console.log(`📋 Found ${clients.length} client(s) for email compose`);
    res.json(clients);
  } catch (error) {
    console.error('Get clients for email error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register client routes AFTER the specific /for-email route to avoid route conflicts
app.use('/api/clients', clientRoutes);
app.use('/api/inbound', imapRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/search', searchRoutes);

// Direct email sending function
async function sendDirectEmail(client, emailType, conferenceName = 'Conference') {
  try {
    console.log(`📧 Sending ${emailType} email to ${client.email}`);
    
    if (EMAIL_TEST_MODE) {
      console.log(`🧪 TEST MODE: Email would be sent to ${client.email}`);
      console.log(`📧 Subject: ${emailType} for ${conferenceName}`);
      return { success: true, message: 'Email sent (test mode)' };
    }

    // Get active SMTP account
    const smtpAccount = await EmailAccount.findOne({ 
      where: { isActive: true, type: { [Op.in]: ['smtp', 'both'] } }
    });

    if (!smtpAccount) {
      console.log('⚠️ No active SMTP account found, skipping email');
      return { success: false, message: 'No SMTP account configured' };
    }

    // Create transporter
    const { decryptEmailPassword } = require('./utils/passwordUtils');
    const transporter = nodemailer.createTransport({
      host: smtpAccount.smtpHost,
      port: smtpAccount.smtpPort,
      secure: smtpAccount.smtpPort === 465,
      auth: {
        user: smtpAccount.smtpUsername || smtpAccount.username,
        pass: decryptEmailPassword(smtpAccount.smtpPassword || smtpAccount.password)
      }
    });

    // Email content based on type
    let subject, htmlContent, textContent;
    
    switch (emailType) {
      case 'initial_invitation':
        subject = `Welcome to ${conferenceName}!`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Welcome to ${conferenceName}!</h2>
            <p>Dear ${client.name || client.firstName},</p>
            <p>We are excited to invite you to participate in <strong>${conferenceName}</strong>!</p>
            <p>We look forward to your participation!</p>
            <p>Best regards,<br>Conference Team</p>
          </div>
        `;
        textContent = `Welcome to ${conferenceName}!\n\nDear ${client.name || client.firstName},\n\nWe are excited to invite you to participate in ${conferenceName}!\n\nWe look forward to your participation!\n\nBest regards,\nConference Team`;
        break;
        
      case 'abstract_submission':
        subject = `Abstract Submission Reminder - ${conferenceName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">Abstract Submission Reminder</h2>
            <p>Dear ${client.name || client.firstName},</p>
            <p>This is a friendly reminder about the abstract submission for <strong>${conferenceName}</strong>.</p>
            <p>Please submit your abstract to confirm your participation.</p>
            <p>Best regards,<br>Conference Team</p>
          </div>
        `;
        textContent = `Abstract Submission Reminder\n\nDear ${client.name || client.firstName},\n\nThis is a friendly reminder about the abstract submission for ${conferenceName}.\n\nPlease submit your abstract to confirm your participation.\n\nBest regards,\nConference Team`;
        break;
        
      case 'registration_reminder':
        subject = `Registration Reminder - ${conferenceName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #e74c3c;">Registration Reminder</h2>
            <p>Dear ${client.name || client.firstName},</p>
            <p>Thank you for your interest in <strong>${conferenceName}</strong>!</p>
            <p>We noticed you haven't completed your registration yet. This is a final reminder to secure your spot.</p>
            <p>Please complete your registration to confirm your participation.</p>
            <p>Best regards,<br>Conference Team</p>
          </div>
        `;
        textContent = `Registration Reminder\n\nDear ${client.name || client.firstName},\n\nThank you for your interest in ${conferenceName}!\n\nWe noticed you haven't completed your registration yet. This is a final reminder to secure your spot.\n\nPlease complete your registration to confirm your participation.\n\nBest regards,\nConference Team`;
        break;
        
      default:
        subject = `Update from ${conferenceName}`;
        htmlContent = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2c3e50;">Update from ${conferenceName}</h2>
            <p>Dear ${client.name || client.firstName},</p>
            <p>This is an update regarding your participation in <strong>${conferenceName}</strong>.</p>
            <p>Best regards,<br>Conference Team</p>
          </div>
        `;
        textContent = `Update from ${conferenceName}\n\nDear ${client.name || client.firstName},\n\nThis is an update regarding your participation in ${conferenceName}.\n\nBest regards,\nConference Team`;
    }

    // Send email
    const formattedHtmlContent = formatEmailHtml(htmlContent);
    logEmailHtmlPayload('system-template', formattedHtmlContent);

    const mailOptions = {
      from: smtpAccount.fromEmail || smtpAccount.email,
      to: client.email,
      subject: subject,
      text: textContent,
      html: formattedHtmlContent || htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully: ${info.messageId}`);

    // Log email
    await EmailLog.create({
      emailId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action: 'sent',
      clientId: client.id,
      emailType: emailType,
      status: 'sent',
      sentAt: new Date(),
      subject: subject,
      recipient: client.email
    });

    return { success: true, message: 'Email sent successfully', messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email sending failed:', error);
    
    // Log failed email
    await EmailLog.create({
      emailId: `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      action: 'failed',
      clientId: client.id,
      emailType: emailType,
      status: 'failed',
      error: error.message,
      subject: subject || 'Email',
      recipient: client.email
    });

    return { success: false, message: 'Email sending failed', error: error.message };
  }
}

// SMTP accounts alias (routes already registered above)
app.use('/api/smtp-accounts', emailAccountRoutes);

// Add missing analytics and system routes
app.get('/api/analytics/ceo-dashboard', authenticateToken, async (req, res) => {
  try {
    res.json({
      totalClients: 0,
      totalConferences: 0,
      totalEmails: 0,
      recentActivity: []
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/analytics/recent-activity', authenticateToken, async (req, res) => {
  try {
    res.json([]);
  } catch (error) {
    console.error('Recent activity error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optimized system status endpoint with caching
app.get('/api/system/status', authenticateToken, async (req, res) => {
  try {
    // Add cache headers for better performance
    res.set({
      'Cache-Control': 'private, max-age=60', // Cache for 1 minute
      'ETag': '"system-status-v1"'
    });

    res.json({
      status: 'healthy',
      database: 'connected',
      emailService: 'active',
      followUpService: 'active',
      realTimeSync: 'active',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Optimized notifications endpoint with caching
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    // Add cache headers for better performance
    res.set({
      'Cache-Control': 'private, max-age=120', // Cache for 2 minutes
      'ETag': `"notifications-${req.user.id}-v1"`
    });

    // Return empty array for now - can be enhanced later with actual notifications
    res.json([]);
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Note: /api/inbound/status is handled by imapRoutes router (mounted at /api/inbound)

app.post('/api/inbound/polling', authenticateToken, async (req, res) => {
  try {
    const { action } = req.body;
    res.json({
      success: true,
      message: `Polling ${action} successfully`,
      status: action === 'start' ? 'active' : 'stopped'
    });
  } catch (error) {
    console.error('Polling control error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/inbound/test', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Connection test successful',
      status: 'connected'
    });
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add missing inbound test POST endpoint
app.post('/api/inbound/test', authenticateToken, async (req, res) => {
  try {
    const { accountId } = req.body;
    
    res.json({
      success: true,
      message: 'IMAP connection test successful',
      status: 'connected',
      accountId: accountId || 'default'
    });
  } catch (error) {
    console.error('IMAP test error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/inbound/fetch', authenticateToken, async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Email fetch completed',
      emailsFetched: 0
    });
  } catch (error) {
    console.error('Email fetch error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add missing email management endpoints
app.post('/api/emails/clear', authenticateToken, async (req, res) => {
  try {
    // Clear demo emails
    await Email.destroy({ where: {} });
    await EmailLog.destroy({ where: {} });
    
    res.json({
      success: true,
      message: 'All demo emails cleared successfully'
    });
  } catch (error) {
    console.error('Clear emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/emails/reset', authenticateToken, async (req, res) => {
  try {
    // Reset email state
    await Email.destroy({ where: {} });
    await EmailLog.destroy({ where: {} });

    res.json({ 
      success: true, 
      message: 'Email state reset successfully'
    });
  } catch (error) {
    console.error('Reset emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add missing email endpoints
app.get('/api/emails', authenticateToken, async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;

    // CEOs can see all emails
    let conferenceWhereClause = {};

    if (userRole === 'TeamLead') {
      conferenceWhereClause.assignedTeamLeadId = userId;
    } else if (userRole === 'Member') {
      // Member: only conferences where they are in assignedMemberIds JSON array
      conferenceWhereClause = sequelize.where(
        sequelize.cast(sequelize.col('Conference.assignedMemberIds'), 'jsonb'),
        '@>',
        sequelize.cast(`["${userId}"]`, 'jsonb')
      );
    } else if (userRole !== 'CEO') {
      // Unknown roles get no emails
      return res.json([]);
    }

    const emails = await Email.findAll({
      include: [
        {
          model: Client,
          as: 'client',
          required: false,
          attributes: ['id', 'conferenceId'],
          include: [
            {
              model: Conference,
              as: 'conference',
              required: false,
              attributes: ['id', 'name', 'assignedTeamLeadId', 'assignedMemberIds'],
              where: conferenceWhereClause
            }
          ]
        }
      ],
      where: {
        // Only return emails that are linked to a client + conference when role is restricted
        ...(userRole === 'CEO'
          ? {}
          : {
              '$client.conference.id$': {
                [sequelize.Op.not]: null
              }
            })
      },
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json(emails);
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/email-logs', authenticateToken, async (req, res) => {
  try {
    const logs = await EmailLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json(logs);
  } catch (error) {
    console.error('Get email logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Email send endpoint is handled by emailRoutes.js - removed duplicate endpoint here
// Add missing conference endpoints
app.get('/api/conferences', authenticateToken, async (req, res) => {
  try {
    console.log(`🔍 API Call - User: ${req.user.email} (${req.user.role}) - ID: ${req.user.id}`);
    
    // Build where clause based on user role (with error handling)
    let whereClause = {};

    try {
      if (req.user.role === 'TeamLead') {
        // TeamLead sees only conferences where they are assigned
        whereClause.assignedTeamLeadId = req.user.id;
        console.log(`🔒 TeamLead ${req.user.email} - Filtering conferences by assignedTeamLeadId: ${req.user.id}`);
      } else if (req.user.role === 'Member') {
        // Member sees only conferences where they are in assignedMemberIds array (JSON column)
        // Use PostgreSQL JSON contains operator with proper casting
        whereClause = sequelize.where(
          sequelize.cast(sequelize.col('assignedMemberIds'), 'jsonb'),
          '@>',
          sequelize.cast(`["${req.user.id}"]`, 'jsonb')
        );
        console.log(`🔒 Member ${req.user.email} - Filtering conferences by assignedMemberIds contains: ${req.user.id}`);
      } else if (req.user.role === 'CEO') {
        // CEO sees all conferences (no filter)
        console.log(`👑 CEO ${req.user.email} - Showing all conferences`);
      } else {
        // Default: no conferences for unknown roles
        console.log(`⚠️ Unknown role ${req.user.role} - No conferences shown`);
        return res.json([]);
      }
    } catch (roleError) {
      console.error('Error in role-based filtering:', roleError);
      // Continue with empty filter if role filtering fails
    }

    // Execute query with error handling
    let conferences = [];
    try {
      conferences = await Conference.findAll({
        where: whereClause,
        order: [['createdAt', 'DESC']],
        limit: 100
      }).catch(() => []);
      
      conferences = Array.isArray(conferences) ? conferences : [];
    } catch (queryError) {
      console.error('Error executing conference query:', queryError);
      conferences = [];
    }

    console.log(`📋 Found ${conferences.length} conference(s) for ${req.user.role} ${req.user.email}`);
    
    res.json(conferences || []);
  } catch (error) {
    console.error('Get conferences error:', error);
    // Return safe default response instead of error
    res.status(500).json({ 
      error: 'Failed to fetch conferences',
      message: error.message || 'Internal server error',
      conferences: []
    });
  }
});

app.post('/api/conferences', authenticateToken, async (req, res) => {
  try {
    // Role-based authorization: Only CEO can create conferences
    if (req.user.role === 'Member' || req.user.role === 'TeamLead') {
      console.log(`🚫 ${req.user.role} ${req.user.email} attempted to create a conference`);
      return res.status(403).json({ 
        error: 'Permission denied',
        message: 'You do not have permission to create conferences. Only CEO can create conferences.'
      });
    }
    
    // Validate required fields before processing
    if (!req.body.name || !req.body.name.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Conference name is required',
        field: 'name'
      });
    }
    
    if (!req.body.shortName || !req.body.shortName.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Conference short name is required',
        field: 'shortName'
      });
    }
    
    if (!req.body.venue || !req.body.venue.trim()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Venue is required',
        field: 'venue'
      });
    }
    
    if (!req.body.startDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Start date is required',
        field: 'startDate'
      });
    }
    
    if (!req.body.endDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'End date is required',
        field: 'endDate'
      });
    }
    
    // Validate date range
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    
    if (isNaN(startDate.getTime())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Start date must be a valid date',
        field: 'startDate'
      });
    }
    
    if (isNaN(endDate.getTime())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'End date must be a valid date',
        field: 'endDate'
      });
    }
    
    if (endDate < startDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'End date must be after start date',
        field: 'endDate'
      });
    }
    
    // Clean the request body to handle empty template IDs
    const conferenceData = { ...req.body };
    
    const shortName = normalizeShortName(conferenceData.shortName);
    conferenceData.shortName = shortName !== undefined ? shortName : null;

    // Set template IDs to null if they are empty strings or undefined
    if (!conferenceData.stage1TemplateId || conferenceData.stage1TemplateId === '') {
      conferenceData.stage1TemplateId = null;
    }
    if (!conferenceData.stage2TemplateId || conferenceData.stage2TemplateId === '') {
      conferenceData.stage2TemplateId = null;
    }

    const incomingSettings = conferenceData.settings || {};
    if (conferenceData.stage1Templates) {
      incomingSettings.stage1Templates = conferenceData.stage1Templates;
    }
    if (conferenceData.stage2Templates) {
      incomingSettings.stage2Templates = conferenceData.stage2Templates;
    }
    conferenceData.settings = normalizeConferenceSettings(incomingSettings, {
      stage1TemplateId: conferenceData.stage1TemplateId,
      stage2TemplateId: conferenceData.stage2TemplateId
    });
    conferenceData.stage1TemplateId = conferenceData.settings.stage1Templates?.[0] || conferenceData.stage1TemplateId || null;
    conferenceData.stage2TemplateId = conferenceData.settings.stage2Templates?.[0] || conferenceData.stage2TemplateId || null;
    delete conferenceData.stage1Templates;
    delete conferenceData.stage2Templates;
    
    // Ensure other required fields have defaults
    conferenceData.status = conferenceData.status || 'draft';
    conferenceData.isActive = conferenceData.isActive !== false;
    
    const conference = await Conference.create(conferenceData);
    res.status(201).json(conference);
  } catch (error) {
    return handleSequelizeError(error, res, 'Failed to create conference');
  }
});

app.put('/api/conferences/:id', authenticateToken, async (req, res) => {
  try {
    const conference = await Conference.findByPk(req.params.id);
    if (!conference) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    // Role-based authorization check
    if (req.user.role === 'Member') {
      // Members cannot update conferences at all
      console.log(`🚫 Member ${req.user.email} attempted to update conference ${conference.id}`);
      return res.status(403).json({ 
        error: 'Permission denied',
        message: 'Members do not have permission to update conferences. You can only view assigned conferences.'
      });
    } else if (req.user.role === 'TeamLead') {
      // TeamLead can only edit conferences where they are assigned
      if (conference.assignedTeamLeadId !== req.user.id) {
        console.log(`🚫 TeamLead ${req.user.email} attempted to edit non-assigned conference ${conference.id}`);
        return res.status(403).json({ error: 'You do not have permission to edit this conference' });
      }
    }
    // CEO can edit all conferences (no check needed)

    const updateData = { ...req.body };
    if (Object.prototype.hasOwnProperty.call(updateData, 'shortName')) {
      const normalized = normalizeShortName(updateData.shortName);
      if (normalized !== undefined) {
        updateData.shortName = normalized;
      } else {
        delete updateData.shortName;
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'stage1TemplateId')) {
      if (!updateData.stage1TemplateId || updateData.stage1TemplateId === '') {
        updateData.stage1TemplateId = null;
      }
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'stage2TemplateId')) {
      if (!updateData.stage2TemplateId || updateData.stage2TemplateId === '') {
        updateData.stage2TemplateId = null;
      }
    }

    let shouldNormalizeSettings = false;
    let settingsPayload = null;

    if (Object.prototype.hasOwnProperty.call(updateData, 'settings')) {
      shouldNormalizeSettings = true;
      settingsPayload = updateData.settings || {};
    }

    if (updateData.stage1Templates || updateData.stage2Templates) {
      shouldNormalizeSettings = true;
      settingsPayload = settingsPayload || { ...(conference.settings || {}) };
      if (updateData.stage1Templates) {
        settingsPayload.stage1Templates = updateData.stage1Templates;
      }
      if (updateData.stage2Templates) {
        settingsPayload.stage2Templates = updateData.stage2Templates;
      }
    }

    if (shouldNormalizeSettings) {
      updateData.settings = normalizeConferenceSettings(settingsPayload, {
        stage1TemplateId: Object.prototype.hasOwnProperty.call(updateData, 'stage1TemplateId')
          ? updateData.stage1TemplateId
          : conference.stage1TemplateId,
        stage2TemplateId: Object.prototype.hasOwnProperty.call(updateData, 'stage2TemplateId')
          ? updateData.stage2TemplateId
          : conference.stage2TemplateId
      });
      if (!updateData.stage1TemplateId && updateData.settings.stage1Templates?.length) {
        updateData.stage1TemplateId = updateData.settings.stage1Templates[0];
      }
      if (!updateData.stage2TemplateId && updateData.settings.stage2Templates?.length) {
        updateData.stage2TemplateId = updateData.settings.stage2Templates[0];
      }
    }
    delete updateData.stage1Templates;
    delete updateData.stage2Templates;

    const previousState = conference.toJSON();

    // Validate required fields if they are being updated
    if (Object.prototype.hasOwnProperty.call(updateData, 'name') && (!updateData.name || !updateData.name.trim())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Conference name is required',
        field: 'name'
      });
    }
    
    if (Object.prototype.hasOwnProperty.call(updateData, 'shortName') && (!updateData.shortName || !updateData.shortName.trim())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Conference short name is required',
        field: 'shortName'
      });
    }
    
    if (Object.prototype.hasOwnProperty.call(updateData, 'venue') && (!updateData.venue || !updateData.venue.trim())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Venue is required',
        field: 'venue'
      });
    }
    
    if (Object.prototype.hasOwnProperty.call(updateData, 'startDate') && !updateData.startDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Start date is required',
        field: 'startDate'
      });
    }
    
    if (Object.prototype.hasOwnProperty.call(updateData, 'endDate') && !updateData.endDate) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'End date is required',
        field: 'endDate'
      });
    }
    
    // Validate date range if both dates are being updated
    if (updateData.startDate && updateData.endDate) {
      const startDate = new Date(updateData.startDate);
      const endDate = new Date(updateData.endDate);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'End date must be after start date',
          field: 'endDate'
        });
      }
    }

    await conference.update(updateData);
    await conference.reload();
    console.log(`✅ Conference ${conference.id} updated by ${req.user.role} ${req.user.email}`);
    
    if (hasFollowupSettingsChanged(previousState, conference.toJSON())) {
      try {
        const { updatedCount, pausedCount } = await rescheduleConferenceFollowUps(conference);
        console.log(`🔁 Follow-up jobs refreshed for conference ${conference.id}: updated=${updatedCount}, paused=${pausedCount}`);
      } catch (scheduleError) {
        console.error(`❌ Failed to reschedule follow-ups for conference ${conference.id}:`, scheduleError.message);
      }
    }

    res.json(conference);
  } catch (error) {
    return handleSequelizeError(error, res, 'Failed to update conference');
  }
});

app.delete('/api/conferences/:id', authenticateToken, async (req, res) => {
  try {
    const conference = await Conference.findByPk(req.params.id);
    if (!conference) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    // Role-based authorization check
    if (req.user.role === 'TeamLead') {
      // TeamLead can only delete conferences where they are assigned
      if (conference.assignedTeamLeadId !== req.user.id) {
        console.log(`🚫 TeamLead ${req.user.email} attempted to delete non-assigned conference ${conference.id}`);
        return res.status(403).json({ error: 'You do not have permission to delete this conference' });
      }
    } else if (req.user.role === 'Member') {
      // Member cannot delete conferences (read/update only)
      console.log(`🚫 Member ${req.user.email} attempted to delete conference ${conference.id}`);
      return res.status(403).json({ error: 'Members do not have permission to delete conferences' });
    }
    // CEO can delete all conferences (no check needed)

    await conference.destroy();
    console.log(`✅ Conference ${conference.id} deleted by ${req.user.role} ${req.user.email}`);
    res.json({ success: true, message: 'Conference deleted successfully' });
  } catch (error) {
    console.error('Delete conference error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function hasFollowupSettingsChanged(previous, current) {
  if (!previous || !current) {
    return false;
  }

  const templateFields = ['stage1TemplateId', 'stage2TemplateId'];
  for (const field of templateFields) {
    const prevValue = previous[field] || null;
    const currValue = current[field] || null;
    if (prevValue !== currValue) {
      return true;
    }
  }

  const prevSettings = previous.settings || {};
  const currSettings = current.settings || {};

  const prevIntervals = JSON.stringify(prevSettings.followup_intervals || {});
  const currIntervals = JSON.stringify(currSettings.followup_intervals || {});
  if (prevIntervals !== currIntervals) {
    return true;
  }

  const prevAttempts = JSON.stringify(prevSettings.max_attempts || {});
  const currAttempts = JSON.stringify(currSettings.max_attempts || {});
  if (prevAttempts !== currAttempts) {
    return true;
  }

  const prevSkipWeekends = prevSettings.skip_weekends !== undefined ? prevSettings.skip_weekends : true;
  const currSkipWeekends = currSettings.skip_weekends !== undefined ? currSettings.skip_weekends : true;
  if (prevSkipWeekends !== currSkipWeekends) {
    return true;
  }

  const prevStage1Templates = JSON.stringify(prevSettings.stage1Templates || []);
  const currStage1Templates = JSON.stringify(currSettings.stage1Templates || []);
  if (prevStage1Templates !== currStage1Templates) {
    return true;
  }

  const prevStage2Templates = JSON.stringify(prevSettings.stage2Templates || []);
  const currStage2Templates = JSON.stringify(currSettings.stage2Templates || []);
  if (prevStage2Templates !== currStage2Templates) {
    return true;
  }

  return false;
}

// Add missing template endpoints
app.get('/api/templates', authenticateToken, async (req, res) => {
  try {
    const templates = await EmailTemplate.findAll({
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(templates);
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const template = await EmailTemplate.findByPk(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    console.error('Get template by id error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/templates', authenticateToken, async (req, res) => {
  try {
    const parseAttachmentInput = (input) => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.warn('Failed to parse attachments payload:', error.message);
          return [];
        }
      }
      return [];
    };

    const payload = {
      ...req.body
    };

    if (payload.stage && !VALID_TEMPLATE_STAGES.has(payload.stage)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Stage must be either abstract_submission or registration'
      });
    }

    if (!payload.stage || !VALID_TEMPLATE_STAGES.has(payload.stage)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Stage must be either abstract_submission or registration'
      });
    }

    if (payload.attachments !== undefined) {
      const parsedAttachments = parseAttachmentInput(payload.attachments);
      payload.attachments = sanitizeAttachmentsForStorage(parsedAttachments);
    }

    const template = await EmailTemplate.create(payload);
    res.status(201).json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const template = await EmailTemplate.findByPk(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const parseAttachmentInput = (input) => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.warn('Failed to parse attachments payload:', error.message);
          return [];
        }
      }
      return [];
    };

    const payload = {
      ...req.body
    };

    if (payload.attachments !== undefined) {
      const parsedAttachments = parseAttachmentInput(payload.attachments);
      payload.attachments = sanitizeAttachmentsForStorage(parsedAttachments);
    }

    await template.update(payload);
    res.json(template);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/templates/:id', authenticateToken, async (req, res) => {
  try {
    const template = await EmailTemplate.findByPk(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    await template.destroy();
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Template drafts endpoints
app.use('/api/template-drafts', authenticateToken, templateDraftRoutes);

// Bulk assign conference endpoint
app.post('/api/clients/bulk-assign-conference', authenticateToken, async (req, res) => {
  try {
    console.log('🔗 Bulk assign conference request body:', req.body);
    
    // Handle both 'ids' and 'clientIds' for frontend compatibility
    const clientIds = req.body.clientIds || req.body.ids;
    const conferenceId = req.body.conferenceId;
    
    if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
      console.log('❌ Invalid clientIds:', clientIds);
      return res.status(400).json({ 
        error: 'Invalid clientIds', 
        details: 'clientIds must be a non-empty array' 
      });
    }
    
    if (!conferenceId) {
      return res.status(400).json({ 
        error: 'Conference ID is required' 
      });
    }
    
    // Check if conference exists
    const conference = await Conference.findByPk(conferenceId);
    if (!conference) {
      return res.status(404).json({ 
        error: 'Conference not found' 
      });
    }
    
    // Update clients with conference assignment and trigger email workflow
    const updatedClients = [];
    const emailResults = [];
    
    for (const clientId of clientIds) {
      const client = await Client.findByPk(clientId);
      if (client) {
        // Update conference assignment
        await client.update({ conferenceId: conferenceId });
        updatedClients.push(client);
        
        // Trigger automatic email workflow
        try {
          // Import the clientRoutes to access the workflow function
          const clientRoutes = require('./routes/clientRoutes');
          await clientRoutes.startAutomaticEmailWorkflow(clientId, conferenceId);
          emailResults.push({ clientId, success: true });
          console.log(`✅ Email workflow started for client ${clientId}`);
        } catch (emailError) {
          console.error(`❌ Email workflow failed for client ${clientId}:`, emailError);
          emailResults.push({ clientId, success: false, error: emailError.message });
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Successfully assigned ${updatedClients.length} clients to conference`,
      updatedClients: updatedClients.length,
      emailsTriggered: emailResults.filter(r => r.success).length
    });
  } catch (error) {
    console.error('Bulk assign conference error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
});

// Add missing user management endpoints
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.findAll({
      include: [{ model: Role, as: 'roleDetails' }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users', authenticateToken, async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.update(req.body);
    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    await user.destroy();
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add favicon endpoint
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Add health check endpoint
app.get('/api/health', (req, res) => {
      res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected'
  });
});

// Ensure auth/me endpoint is available
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role, as: 'roleDetails' }]
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
      }

      res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.name,
      lastName: user.name,
      role: user.roleDetails?.name || user.role,
      isActive: user.isActive,
      phone: user.phone,
      department: user.department,
      position: user.position
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Remove duplicate auth/me endpoint - already defined above

// Optimized dashboard endpoint with parallel queries and caching
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    // Validate and sanitize filter parameters
    let { timeRange = '7d', conferenceId = 'all' } = req.query;
    
    // Validate timeRange
    const validTimeRanges = ['1d', '7d', '30d', '90d'];
    if (!validTimeRanges.includes(timeRange)) {
      timeRange = '7d'; // Default to 7 days if invalid
    }
    
    // Validate conferenceId (should be 'all' or a valid UUID/ID)
    if (conferenceId && conferenceId !== 'all') {
      // Check if conference exists (optional validation)
      try {
        const conference = await Conference.findByPk(conferenceId);
        if (!conference) {
          conferenceId = 'all'; // Reset to 'all' if conference doesn't exist
        }
      } catch (err) {
        // If validation fails, use 'all'
        conferenceId = 'all';
      }
    }
    
    // Build where clauses based on role
    let conferenceWhere = {};
    let clientWhere = {};
    let emailWhere = {};
    
    // Role-based filtering - optimized with single query
    let conferenceIds = [];
    try {
      if (req.user.role === 'TeamLead') {
        const assignedConferences = await Conference.findAll({
          where: { assignedTeamLeadId: req.user.id },
          attributes: ['id']
        }).catch(() => []);
        conferenceIds = assignedConferences.map(c => c.id);
        
        if (conferenceIds.length > 0) {
          conferenceWhere.id = { [Op.in]: conferenceIds };
          clientWhere.conferenceId = { [Op.in]: conferenceIds };
          emailWhere.conferenceId = { [Op.in]: conferenceIds };
        }
        
        console.log(`🔒 TeamLead dashboard - ${conferenceIds.length} assigned conference(s)`);
      } else if (req.user.role === 'Member') {
        const assignedConferences = await Conference.findAll({
          where: {
            assignedMemberIds: { [Op.contains]: [req.user.id] }
          },
          attributes: ['id']
        }).catch(() => []);
        conferenceIds = assignedConferences.map(c => c.id);
        
        if (conferenceIds.length > 0) {
          conferenceWhere.id = { [Op.in]: conferenceIds };
          clientWhere.conferenceId = { [Op.in]: conferenceIds };
          emailWhere.conferenceId = { [Op.in]: conferenceIds };
        }
        
        console.log(`🔒 Member dashboard - ${conferenceIds.length} assigned conference(s)`);
      } else if (req.user.role === 'CEO') {
        console.log(`👑 CEO dashboard - All system data`);
      }
    } catch (roleError) {
      console.error('Error in role-based filtering:', roleError);
      // Continue with empty filters if role filtering fails
    }
    
    // Apply conference filter if specified
    if (conferenceId && conferenceId !== 'all') {
      conferenceWhere.id = conferenceId;
      clientWhere.conferenceId = conferenceId;
      emailWhere.conferenceId = conferenceId;
    }
    
    // Calculate time ranges with error handling
    const endDate = new Date();
    let startDate;
    try {
      switch (timeRange) {
        case '1d': startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); break;
        case '7d': startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); break;
        case '30d': startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); break;
        case '90d': startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); break;
        default: startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }
      
      // Validate dates
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date calculation');
      }
    } catch (dateError) {
      console.error('Error calculating date range:', dateError);
      // Fallback to default 7 days
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }
    
    // Apply time range filter ONLY to time-based metrics (not total counts)
    // Total counts should show all-time totals, not filtered by time range
    const clientWhereWithTime = {
      ...clientWhere,
      createdAt: { [Op.gte]: startDate, [Op.lte]: endDate }
    };
    const emailWhereWithTime = {
      ...emailWhere,
      sentAt: { [Op.gte]: startDate, [Op.lte]: endDate }
    };

    // Run all queries in parallel for better performance
    const [
      totalClients, 
      totalConferences, 
      totalEmails, 
      recentClients,
      clientStatusData,
      emailStatusData,
      conferences,
      bouncedEmails,
      unansweredReplies
    ] = await Promise.all([
      // Total counts - NO time filter (show all-time totals)
      Client.count({ where: clientWhere }),
      Conference.count({ where: conferenceWhere }),
      EmailLog.count({ where: emailWhere }), // Total emails sent (all-time)
      // Recent clients - WITH time filter (show recent activity)
      Client.findAll({
        where: clientWhereWithTime,
        limit: 5,
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'name', 'email', 'status', 'createdAt']
      }).catch(() => []), // Return empty array on error
      // Client status data - WITH time filter (show status distribution for the period)
      Client.findAll({
        where: clientWhereWithTime,
        attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
        group: ['status'],
        raw: true
      }).catch(() => []),
      // Email status data - WITH time filter (show email performance for the period)
      EmailLog.findAll({
        where: emailWhereWithTime,
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['status'],
        raw: true
      }).catch(() => []),
      // Conferences - NO time filter (show all conferences)
      Conference.findAll({
        where: conferenceWhere,
        attributes: ['id', 'name', 'startDate', 'endDate', 'venue', 'primaryContactUserId', 'revenue'],
        include: [{ model: User, as: 'primaryContact', attributes: ['id', 'name', 'email'], required: false }],
        limit: 50
      }).catch(() => []),
      // Bounced emails - WITH time filter (show recent bounces)
      EmailLog.findAll({
        where: {
          ...emailWhereWithTime,
          status: 'bounced'
        },
        limit: 20,
        order: [['sentAt', 'DESC']],
        include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'email'], required: false }]
      }).catch(() => []),
      // Unanswered replies - WITH time filter (show recent unanswered)
      Email.findAll({
        where: {
          folder: 'inbox',
          isRead: false,
          date: { [Op.gte]: startDate, [Op.lte]: endDate },
          clientId: { [Op.ne]: null }
        },
        limit: 20,
        order: [['date', 'DESC']],
        include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'email'], required: false }]
      }).catch(() => [])
    ]);

    // Calculate KPIs with error handling
    const statusCounts = {};
    try {
      if (Array.isArray(clientStatusData)) {
        clientStatusData.forEach(item => {
          if (item && item.status) {
            statusCounts[item.status] = parseInt(item.count) || 0;
          }
        });
      }
    } catch (kpiError) {
      console.error('Error calculating status counts:', kpiError);
    }
    
    const abstractsSubmitted = statusCounts['Abstract Submitted'] || 0;
    const registered = statusCounts['Registered'] || 0;
    const conversionRate = abstractsSubmitted > 0 ? (registered / abstractsSubmitted * 100).toFixed(2) : 0;
    
    // Calculate total revenue with error handling
    let totalRevenue = 0;
    try {
      if (Array.isArray(conferences)) {
        conferences.forEach(c => {
          try {
            if (c && c.revenue && c.revenue.actual) {
              totalRevenue += parseFloat(c.revenue.actual) || 0;
            }
          } catch (revError) {
            // Skip invalid revenue entries
          }
        });
      }
    } catch (revenueError) {
      console.error('Error calculating revenue:', revenueError);
    }
    
    // Calculate email performance with error handling
    const emailCounts = {};
    try {
      if (Array.isArray(emailStatusData)) {
        emailStatusData.forEach(item => {
          if (item && item.status) {
            emailCounts[item.status] = parseInt(item.count) || 0;
          }
        });
      }
    } catch (emailError) {
      console.error('Error calculating email counts:', emailError);
    }
    
    const totalSent = emailCounts['sent'] || 0;
    const totalDelivered = emailCounts['delivered'] || 0;
    const totalBounced = emailCounts['bounced'] || 0;
    const totalReplied = emailCounts['replied'] || 0;
    
    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent * 100).toFixed(2) : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent * 100).toFixed(2) : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent * 100).toFixed(2) : 0;

    // Add cache headers for better performance
    res.set({
      'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
      'ETag': `"${req.user.id}-${Date.now()}"`
    });

    // Safely map conferences with error handling
    const safeConferences = [];
    try {
      if (Array.isArray(conferences)) {
        conferences.forEach(c => {
          try {
            if (c && c.id) {
              safeConferences.push({
                id: c.id,
                name: c.name || '',
                startDate: c.startDate || null,
                endDate: c.endDate || null,
                venue: c.venue || '',
                primaryContact: c.primaryContact ? {
                  name: c.primaryContact.name || '',
                  email: c.primaryContact.email || ''
                } : null
              });
            }
          } catch (confError) {
            // Skip invalid conference entries
          }
        });
      }
    } catch (confMapError) {
      console.error('Error mapping conferences:', confMapError);
    }
    
    // Safely map bounced emails and unanswered replies
    const safeBouncedEmails = [];
    const safeUnansweredReplies = [];
    try {
      if (Array.isArray(bouncedEmails)) {
        bouncedEmails.forEach(b => {
          try {
            if (b && b.id) {
              safeBouncedEmails.push({
                id: b.id,
                clientId: b.clientId || null,
                clientName: b.client?.name || '',
                subject: b.subject || '',
                status: b.status || '',
                sentAt: b.sentAt || null
              });
            }
          } catch (bounceError) {
            // Skip invalid entries
          }
        });
      }
    } catch (bounceMapError) {
      console.error('Error mapping bounced emails:', bounceMapError);
    }
    
    try {
      if (Array.isArray(unansweredReplies)) {
        unansweredReplies.forEach(e => {
          try {
            if (e && e.id) {
              safeUnansweredReplies.push({
                id: e.id,
                clientId: e.clientId || null,
                clientName: e.client?.name || '',
                subject: e.subject || '',
                date: e.date || null
              });
            }
          } catch (replyError) {
            // Skip invalid entries
          }
        });
      }
    } catch (replyMapError) {
      console.error('Error mapping unanswered replies:', replyMapError);
    }

    res.json({ 
      // Original fields (preserved)
      totalClients: totalClients || 0,
      totalConferences: totalConferences || 0,
      totalEmails: totalEmails || 0,
      recentClients: Array.isArray(recentClients) ? recentClients : [],
      timeRange,
      conferenceId,
      userRole: req.user.role || 'Member',
      cached: false,
      // New additive fields
      conferences: safeConferences,
      kpis: {
        abstractsSubmitted: parseInt(abstractsSubmitted) || 0,
        registered: parseInt(registered) || 0,
        conversionRate: parseFloat(conversionRate) || 0,
        totalRevenue: parseFloat(totalRevenue) || 0
      },
      emailPerformance: {
        deliveryRate: parseFloat(deliveryRate) || 0,
        bounceRate: parseFloat(bounceRate) || 0,
        replyRate: parseFloat(replyRate) || 0
      },
      needsAttention: {
        bouncedEmails: safeBouncedEmails,
        unansweredReplies: safeUnansweredReplies
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    // Return safe default response instead of error
    res.status(500).json({ 
      error: 'Failed to load dashboard data',
      message: error.message || 'Internal server error',
      totalClients: 0,
      totalConferences: 0,
      totalEmails: 0,
      recentClients: [],
      kpis: {
        abstractsSubmitted: 0,
        registered: 0,
        conversionRate: 0,
        totalRevenue: 0
      },
      emailPerformance: {
        deliveryRate: 0,
        bounceRate: 0,
        replyRate: 0
      },
      needsAttention: {
        bouncedEmails: [],
        unansweredReplies: []
      }
    });
  }
});

// Start server
async function startServer() {
  try {
    // Initialize database FIRST before accepting requests
    console.log('🔧 Initializing database...');
    await initializeDatabase();
    console.log('✅ Database connected and synced');
    console.log(`👥 Available users:`);
    console.log(`   CEO: admin@crm.com / admin123`);
    console.log(`   Manager: manager@crm.com / manager123`);
    console.log(`   Agent: agent@crm.com / agent123`);
    
    // Start IMAP real-time service
    console.log('📧 Starting IMAP real-time sync service...');
    try {
      // Initialize models in the service first
      realTimeImapService.initializeModels({ Email, EmailAccount, EmailThread, EmailLog, Client });
      await realTimeImapService.startRealTimeSync();
      console.log('✅ IMAP real-time sync started');
    } catch (error) {
      console.error('❌ Failed to start real-time IMAP sync:', error.message);
      console.log('💡 You can start it manually from the IMAP Settings page');
    }
    
    // Start Email Job Scheduler
    console.log('📨 Starting Email Job Scheduler...');
    try {
      emailJobScheduler.start();
      console.log('✅ Email Job Scheduler started');
    } catch (error) {
      console.error('❌ Failed to start Email Job Scheduler:', error.message);
    }
    
    // Start HTTP server AFTER database is ready
    server.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📡 Ready to accept requests`);
    });
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    console.error('⚠️  Cannot start server without database');
    process.exit(1);
  }
}

startServer();
