const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const nodemailer = require('nodemailer');
const { EmailAccount, EmailTemplate, EmailLog } = require('../models');
const { decryptEmailPassword } = require('../utils/passwordUtils');
const { formatEmailHtml } = require('../utils/emailHtmlFormatter');
const { prepareAttachmentsForSending } = require('../utils/attachmentUtils');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv' // .csv alternative
    ];
    
    if (allowedMimes.includes(file.mimetype) || 
        file.originalname.match(/\.(xlsx|xls|csv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel (.xlsx, .xls) and CSV (.csv) files are allowed.'));
    }
  }
});

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

// Helper function to parse Excel/CSV file
const parseFile = (file) => {
  try {
    let workbook;
    
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/csv' || 
        file.originalname.toLowerCase().endsWith('.csv')) {
      // Parse CSV
      const csvData = file.buffer.toString('utf-8');
      workbook = XLSX.read(csvData, { type: 'string' });
    } else {
      // Parse Excel
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    }

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet, { 
      defval: '', // Default value for empty cells
      raw: false // Convert all values to strings
    });

    if (!data || data.length === 0) {
      throw new Error('File is empty or has no data rows');
    }

    return data;
  } catch (error) {
    throw new Error(`Failed to parse file: ${error.message}`);
  }
};

// Helper function to find email column (case-insensitive)
const findEmailColumn = (row) => {
  const keys = Object.keys(row);
  // Try to find email column (case-insensitive)
  const emailKey = keys.find(key => {
    const normalizedKey = key.toLowerCase().trim();
    return normalizedKey === 'email' || normalizedKey === 'e-mail';
  });
  return emailKey || null;
};

// Helper function to replace template variables
const replaceTemplateVariables = (text, variables) => {
  if (!text) return '';
  
  let result = text;
  Object.keys(variables).forEach(key => {
    const value = variables[key] || '';
    // Replace {ColumnName} format (case-sensitive to column names)
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  });
  
  return result;
};

// Helper function to validate email address
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

// Test route to verify router is working
router.get('/test', (req, res) => {
  res.json({ message: 'Bulk emails route is working', path: '/api/bulk-emails/test' });
});

// GET /api/bulk-emails/template - Download Excel template
router.get('/template', async (req, res) => {
  try {
    console.log('📥 Bulk email template download request received');
    console.log('Request URL:', req.originalUrl || req.url);
    console.log('Request method:', req.method);
    console.log('Request headers:', req.headers);
    
    // Create sample data with exactly 3 fields: NAME, EMAIL, MOBILE NUMBER
    const templateData = [
      {
        NAME: 'John Doe',
        EMAIL: 'john.doe@example.com',
        'MOBILE NUMBER': '+1234567890'
      },
      {
        NAME: 'Jane Smith',
        EMAIL: 'jane.smith@example.com',
        'MOBILE NUMBER': '+9876543210'
      }
    ];

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths (NAME: 25, EMAIL: 30, MOBILE NUMBER: 20)
    worksheet['!cols'] = [
      { wch: 25 }, // NAME
      { wch: 30 }, // EMAIL
      { wch: 20 }  // MOBILE NUMBER
    ];

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Recipients');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    console.log('✅ Template generated successfully, size:', buffer.length, 'bytes');

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk-email-template.xlsx"');
    res.setHeader('Content-Length', buffer.length);
    
    res.send(buffer);
  } catch (error) {
    console.error('❌ Error generating template:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to generate template', 
      details: error.message 
    });
  }
});

// POST /api/bulk-emails/send - Send bulk emails
router.post('/send', upload.single('file'), async (req, res) => {
  let successCount = 0;
  let failedCount = 0;
  const errors = [];

  try {
    // Validate required fields
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const { emailAccountId, subject, bodyHtml, bodyText, templateId } = req.body;

    if (!emailAccountId) {
      return res.status(400).json({ error: 'Email account ID is required' });
    }

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    const finalBodyText = bodyText || (bodyHtml ? bodyHtml.replace(/<[^>]*>/g, '') : '');
    if (!finalBodyText || !finalBodyText.trim()) {
      return res.status(400).json({ error: 'Email body is required' });
    }

    // Get email account
    let account = await EmailAccount.findByPk(emailAccountId);
    if (!account) {
      const asNumber = parseInt(emailAccountId, 10);
      if (!Number.isNaN(asNumber)) {
        account = await EmailAccount.findByPk(asNumber);
      }
    }

    if (!account) {
      return res.status(404).json({ error: 'Email account not found' });
    }

    // Check if account has SMTP configuration
    if (account.type !== 'smtp' && account.type !== 'both') {
      return res.status(400).json({ error: 'Selected account does not support SMTP sending' });
    }

    // Get template if provided
    let template = null;
    let templateAttachments = [];
    if (templateId) {
      template = await EmailTemplate.findByPk(templateId);
      if (template && template.attachments && Array.isArray(template.attachments)) {
        templateAttachments = prepareAttachmentsForSending(template.attachments);
      }
    }

    // Parse file
    let recipients;
    try {
      recipients = parseFile(req.file);
    } catch (parseError) {
      return res.status(400).json({ error: parseError.message });
    }

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found in file' });
    }

    // Find email column
    const firstRow = recipients[0];
    const emailColumn = findEmailColumn(firstRow);

    if (!emailColumn) {
      return res.status(400).json({ 
        error: 'Email column not found. Please ensure your file has a column named "Email" (case-insensitive)' 
      });
    }

    // Create nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpPort === 465,
      requireTLS: account.smtpPort === 587,
      tls: {
        rejectUnauthorized: false
      },
      auth: {
        user: account.smtpUsername,
        pass: decryptEmailPassword(account.smtpPassword)
      }
    });

    // Format HTML body
    const formattedBodyHtml = formatEmailHtml(bodyHtml || '');

    // Process each recipient
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const recipientEmail = recipient[emailColumn];

      // Skip if email is missing or invalid
      if (!recipientEmail || !isValidEmail(recipientEmail)) {
        failedCount++;
        errors.push(`Row ${i + 2}: Invalid or missing email address "${recipientEmail}"`);
        continue;
      }

      try {
        // Build variables object from all columns
        const variables = {};
        Object.keys(recipient).forEach(key => {
          variables[key] = recipient[key] || '';
        });

        // Replace template variables in subject and body
        const personalizedSubject = replaceTemplateVariables(subject, variables);
        const personalizedBodyHtml = replaceTemplateVariables(formattedBodyHtml || bodyHtml, variables);
        const personalizedBodyText = replaceTemplateVariables(finalBodyText, variables);

        // Prepare email options
        const mailOptions = {
          from: `${account.name} <${account.email}>`,
          to: recipientEmail.trim(),
          subject: personalizedSubject,
          text: personalizedBodyText,
          html: personalizedBodyHtml
        };

        // Add template attachments if any
        if (templateAttachments.length > 0) {
          mailOptions.attachments = templateAttachments;
        }

        // Send email
        await transporter.sendMail(mailOptions);

        // Log successful send
        try {
          await EmailLog.create({
            emailAccountId: account.id,
            to: recipientEmail.trim(),
            subject: personalizedSubject,
            status: 'sent',
            sentAt: new Date(),
            error: null
          });
        } catch (logError) {
          console.warn('Failed to log email:', logError.message);
        }

        successCount++;
      } catch (sendError) {
        failedCount++;
        const errorMessage = `Row ${i + 2} (${recipientEmail}): ${sendError.message}`;
        errors.push(errorMessage);

        // Log failed send
        try {
          await EmailLog.create({
            emailAccountId: account.id,
            to: recipientEmail.trim(),
            subject: subject,
            status: 'failed',
            sentAt: null,
            error: sendError.message
          });
        } catch (logError) {
          console.warn('Failed to log email error:', logError.message);
        }
      }

      // Add small delay to avoid overwhelming SMTP server
      if (i < recipients.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay between emails
      }
    }

    // Return results
    res.json({
      success: successCount,
      failed: failedCount,
      total: recipients.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk email send:', error);
    res.status(500).json({ 
      error: 'Failed to send bulk emails',
      details: error.message 
    });
  }
});

module.exports = router;

