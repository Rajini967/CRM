const express = require('express');
const { Campaign, EmailTemplate, EmailAccount, Client, Conference, User } = require('../models');
const { requireRole, requireConferenceAccess } = require('../middleware/rbac');
const { templateRenderer } = require('../utils/templateRenderer');
const { emailService } = require('../services/EmailService');
const router = express.Router();

// Get all campaigns for a conference
router.get('/', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const { conferenceId, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = {};
    if (conferenceId) whereClause.conferenceId = conferenceId;
    if (status) whereClause.status = status;

    // Role-based filtering
    if (req.user.role === 'Member') {
      whereClause.ownerId = req.user.id;
    }

    const { count, rows: campaigns } = await Campaign.findAndCountAll({
      where: whereClause,
      include: [
        { model: EmailTemplate, as: 'template', attributes: ['id', 'name', 'subject'] },
        { model: EmailAccount, as: 'smtpAccount', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
        { model: Conference, as: 'conference', attributes: ['id', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      campaigns,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Get campaigns error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaign by ID
router.get('/:id', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id, {
      include: [
        { model: EmailTemplate, as: 'template' },
        { model: EmailAccount, as: 'smtpAccount' },
        { model: User, as: 'owner', attributes: ['id', 'name', 'email'] },
        { model: Conference, as: 'conference' }
      ]
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    console.error('Get campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create new campaign
router.post('/', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const {
      name,
      description,
      conferenceId,
      templateId,
      smtpAccountId,
      recipientData,
      settings = {}
    } = req.body;

    // Validate required fields
    if (!name || !conferenceId || !templateId || !smtpAccountId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify template exists
    const template = await EmailTemplate.findByPk(templateId);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Verify SMTP account exists
    const smtpAccount = await EmailAccount.findByPk(smtpAccountId);
    if (!smtpAccount) {
      return res.status(404).json({ error: 'SMTP account not found' });
    }

    // Calculate total recipients
    const totalRecipients = recipientData?.recipients?.length || 0;

    const campaign = await Campaign.create({
      name,
      description,
      conferenceId,
      templateId,
      smtpAccountId,
      ownerId: req.user.id,
      totalRecipients,
      recipientData,
      settings: {
        throttleRate: 100,
        batchSize: 50,
        retryAttempts: 3,
        retryDelay: 300000,
        ...settings
      }
    });

    res.status(201).json(campaign);
  } catch (error) {
    console.error('Create campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start campaign
router.post('/:id/start', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id, {
      include: [
        { model: EmailTemplate, as: 'template' },
        { model: EmailAccount, as: 'smtpAccount' },
        { model: Conference, as: 'conference' }
      ]
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Campaign can only be started from draft status' });
    }

    // Update campaign status
    await campaign.update({
      status: 'running',
      startedAt: new Date()
    });

    // Start campaign processing in background
    processCampaign(campaign).catch(error => {
      console.error('Campaign processing error:', error);
      campaign.update({ status: 'cancelled' });
    });

    res.json({ message: 'Campaign started successfully', campaign });
  } catch (error) {
    console.error('Start campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Pause campaign
router.post('/:id/pause', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'running') {
      return res.status(400).json({ error: 'Campaign is not running' });
    }

    await campaign.update({ status: 'paused' });

    res.json({ message: 'Campaign paused successfully', campaign });
  } catch (error) {
    console.error('Pause campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resume campaign
router.post('/:id/resume', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (campaign.status !== 'paused') {
      return res.status(400).json({ error: 'Campaign is not paused' });
    }

    await campaign.update({ status: 'running' });

    // Resume campaign processing
    processCampaign(campaign).catch(error => {
      console.error('Campaign processing error:', error);
      campaign.update({ status: 'cancelled' });
    });

    res.json({ message: 'Campaign resumed successfully', campaign });
  } catch (error) {
    console.error('Resume campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Cancel campaign
router.post('/:id/cancel', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    if (!['running', 'paused'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Campaign cannot be cancelled' });
    }

    await campaign.update({ 
      status: 'cancelled',
      completedAt: new Date()
    });

    res.json({ message: 'Campaign cancelled successfully', campaign });
  } catch (error) {
    console.error('Cancel campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get campaign status and progress
router.get('/:id/status', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id, {
      attributes: [
        'id', 'name', 'status', 'totalRecipients', 'sentCount',
        'deliveredCount', 'bouncedCount', 'repliedCount',
        'openedCount', 'clickedCount', 'startedAt', 'completedAt'
      ]
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const progress = {
      ...campaign.toJSON(),
      progressPercentage: campaign.totalRecipients > 0 
        ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100) 
        : 0,
      deliveryRate: campaign.sentCount > 0 
        ? Math.round((campaign.deliveredCount / campaign.sentCount) * 100) 
        : 0,
      bounceRate: campaign.sentCount > 0 
        ? Math.round((campaign.bouncedCount / campaign.sentCount) * 100) 
        : 0,
      replyRate: campaign.sentCount > 0 
        ? Math.round((campaign.repliedCount / campaign.sentCount) * 100) 
        : 0,
      openRate: campaign.sentCount > 0 
        ? Math.round((campaign.openedCount / campaign.sentCount) * 100) 
        : 0,
      clickRate: campaign.sentCount > 0 
        ? Math.round((campaign.clickedCount / campaign.sentCount) * 100) 
        : 0
    };

    res.json(progress);
  } catch (error) {
    console.error('Get campaign status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update campaign
router.put('/:id', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Only allow updates for draft campaigns
    if (campaign.status !== 'draft') {
      return res.status(400).json({ error: 'Only draft campaigns can be updated' });
    }

    const updatedCampaign = await campaign.update(req.body);

    res.json(updatedCampaign);
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete campaign
router.delete('/:id', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const campaign = await Campaign.findByPk(req.params.id);

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    // Only allow deletion of draft or cancelled campaigns
    if (!['draft', 'cancelled'].includes(campaign.status)) {
      return res.status(400).json({ error: 'Only draft or cancelled campaigns can be deleted' });
    }

    await campaign.destroy();

    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Process campaign in background
async function processCampaign(campaign) {
  try {
    const { recipientData, settings } = campaign;
    const recipients = recipientData?.recipients || [];
    
    if (recipients.length === 0) {
      await campaign.update({ status: 'completed', completedAt: new Date() });
      return;
    }

    const batchSize = settings.batchSize || 50;
    const throttleRate = settings.throttleRate || 100; // emails per minute
    const delayBetweenBatches = (60 * 1000) / throttleRate; // milliseconds

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      // Process batch
      await processBatch(campaign, batch);
      
      // Update progress
      await campaign.update({ sentCount: Math.min(i + batchSize, recipients.length) });
      
      // Throttle
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    // Mark campaign as completed
    await campaign.update({ 
      status: 'completed', 
      completedAt: new Date() 
    });

  } catch (error) {
    console.error('Campaign processing error:', error);
    await campaign.update({ status: 'cancelled' });
  }
}

// Process batch of recipients
async function processBatch(campaign, recipients) {
  for (const recipient of recipients) {
    try {
      // Render template with recipient data
      const rendered = await templateRenderer.renderTemplate(
        campaign.template.bodyHtml,
        recipient,
        campaign.conference,
        { ...recipient, unsubscribe_token: generateUnsubscribeToken(recipient.email) }
      );

      // Send email
      const emailData = {
        fromEmailAccountId: campaign.smtpAccountId,
        to: recipient.email,
        subject: rendered.subject,
        bodyHtml: rendered.bodyHtml,
        bodyText: rendered.bodyText,
        clientId: recipient.clientId,
        isTracked: true
      };

      await emailService.sendEmail(emailData, campaign.ownerId);

      // Update campaign stats
      await campaign.increment('deliveredCount');

    } catch (error) {
      console.error('Error sending email to recipient:', recipient.email, error);
      await campaign.increment('bouncedCount');
    }
  }
}

// Generate unsubscribe token
function generateUnsubscribeToken(email) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(email + Date.now()).digest('hex');
}

module.exports = router;
