const express = require('express');
const router = express.Router();
const { EmailTemplateDraft } = require('../models');
const { sanitizeAttachmentsForStorage } = require('../utils/attachmentUtils');

const VALID_TEMPLATE_STAGES = new Set(['abstract_submission', 'registration']);

const buildOwnershipClause = (req) => {
  const clause = {};
  if (req.user?.organizationId) {
    clause.organizationId = req.user.organizationId;
  }
  if (req.user?.id) {
    clause.createdBy = req.user.id;
  }
  return clause;
};

router.get('/', async (req, res) => {
  try {
    const drafts = await EmailTemplateDraft.findAll({
      where: buildOwnershipClause(req),
      order: [['updatedAt', 'DESC']],
      limit: 100
    });
    res.json(drafts);
  } catch (error) {
    console.error('Get template drafts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const parseAttachmentInput = (input) => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.warn('Failed to parse draft attachments payload:', error.message);
          return [];
        }
      }
      return [];
    };

    const payload = {
      ...req.body,
      createdBy: req.user?.id || req.body.createdBy,
      organizationId: req.user?.organizationId || req.body.organizationId || null
    };

    if (payload.stage && !VALID_TEMPLATE_STAGES.has(payload.stage)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Stage must be either abstract_submission or registration'
      });
    }

    if (payload.attachments !== undefined) {
      const parsedAttachments = parseAttachmentInput(payload.attachments);
      payload.attachments = sanitizeAttachmentsForStorage(parsedAttachments);
    }

    const draft = await EmailTemplateDraft.create(payload);
    res.status(201).json(draft);
  } catch (error) {
    console.error('Create template draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const draft = await EmailTemplateDraft.findByPk(req.params.id);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (req.user?.id && draft.createdBy && draft.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to modify this draft' });
    }
    if (req.user?.organizationId && draft.organizationId && draft.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: 'You do not have permission to modify this draft' });
    }

    const parseAttachmentInput = (input) => {
      if (Array.isArray(input)) return input;
      if (typeof input === 'string') {
        try {
          const parsed = JSON.parse(input);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          console.warn('Failed to parse draft attachments payload:', error.message);
          return [];
        }
      }
      return [];
    };

    const payload = {
      ...req.body,
      organizationId: req.user?.organizationId || req.body.organizationId || draft.organizationId,
      createdBy: draft.createdBy || req.user?.id || req.body.createdBy
    };

    if (payload.stage && !VALID_TEMPLATE_STAGES.has(payload.stage)) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Stage must be either abstract_submission or registration'
      });
    }

    if (payload.attachments !== undefined) {
      const parsedAttachments = parseAttachmentInput(payload.attachments);
      payload.attachments = sanitizeAttachmentsForStorage(parsedAttachments);
    }

    const updated = await draft.update(payload);

    res.json(updated);
  } catch (error) {
    console.error('Update template draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const draft = await EmailTemplateDraft.findByPk(req.params.id);
    if (!draft) {
      return res.status(404).json({ error: 'Draft not found' });
    }

    if (req.user?.id && draft.createdBy && draft.createdBy !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this draft' });
    }
    if (req.user?.organizationId && draft.organizationId && draft.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: 'You do not have permission to delete this draft' });
    }

    await draft.destroy();
    res.json({ success: true, message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Delete template draft error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

