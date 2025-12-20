const express = require('express');
const { Op } = require('sequelize');
const { ClientNote, Client, User, Conference } = require('../models');
const router = express.Router();

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Helper: Check if user has access to client
async function checkClientAccess(clientId, userId, userRole) {
  if (userRole === 'CEO') {
    return true;
  }

  const client = await Client.findByPk(clientId);
  if (!client || !client.conferenceId) {
    return false;
  }

  const conference = await Conference.findByPk(client.conferenceId);
  if (!conference) {
    return false;
  }

  if (userRole === 'TeamLead') {
    return conference.assignedTeamLeadId === userId;
  } else if (userRole === 'Member') {
    const assignedMemberIds = conference.assignedMemberIds || [];
    return assignedMemberIds.includes(userId);
  }

  return false;
}

// Helper: Extract @mentions from content
function extractMentions(content) {
  const mentionPattern = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionPattern.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  
  return mentions;
}

// GET /api/clients/:clientId/notes - Get all notes for a client
router.get('/:clientId/notes', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { type, includePrivate = 'true' } = req.query;

    // Check client access
    const hasAccess = await checkClientAccess(clientId, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to view this client' });
    }

    // Build where clause
    const whereClause = {
      clientId,
      isDeleted: false
    };

    if (type) {
      whereClause.type = type;
    }

    // Privacy filter
    if (includePrivate === 'false' || req.user.role === 'Member') {
      // Non-private notes OR private notes authored by user
      whereClause[Op.or] = [
        { isPrivate: false },
        { authorId: req.user.id }
      ];
    } else if (req.user.role === 'TeamLead') {
      // TeamLead sees: public notes + their own private notes
      whereClause[Op.or] = [
        { isPrivate: false },
        { authorId: req.user.id }
      ];
    }
    // CEO sees all notes (no privacy filter)

    // Fetch notes with author information
    const notes = await ClientNote.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [
        ['isPinned', 'DESC'],
        ['createdAt', 'DESC']
      ]
    });

    console.log(`📝 Fetched ${notes.length} note(s) for client ${clientId} (${req.user.role})`);

    res.json(notes);
  } catch (error) {
    console.error('Error fetching client notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients/:clientId/notes - Create a note
router.post('/:clientId/notes', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { content, isPrivate = false, tags = [], priority = 'medium' } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Note content is required' });
    }

    // Check client access
    const hasAccess = await checkClientAccess(clientId, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to add notes to this client' });
    }

    // Extract @mentions from content
    const mentions = extractMentions(content);
    
    // TODO: Validate mentioned users exist and create notifications for them

    // Create note
    const note = await ClientNote.create({
      clientId,
      authorId: req.user.id,
      content,
      type: 'note',
      isPrivate,
      mentions,
      tags,
      priority,
      isPinned: false
    });

    // Fetch note with author info
    const noteWithAuthor = await ClientNote.findByPk(note.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    console.log(`✅ Note created for client ${clientId} by ${req.user.email} (${isPrivate ? 'private' : 'shared'})`);

    res.status(201).json({
      message: 'Note created successfully',
      note: noteWithAuthor
    });
  } catch (error) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:clientId/notes/:noteId - Update a note
router.put('/:clientId/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { clientId, noteId } = req.params;
    const { content, isPrivate, tags, priority } = req.body;

    // Get the note
    const note = await ClientNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Check if note belongs to this client
    if (note.clientId !== clientId) {
      return res.status(400).json({ error: 'Note does not belong to this client' });
    }

    // Only author or CEO can edit
    if (note.authorId !== req.user.id && req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'You can only edit your own notes' });
    }

    // Update note
    const updateData = {
      editedAt: new Date(),
      editedBy: req.user.id
    };

    if (content) {
      updateData.content = content;
      updateData.mentions = extractMentions(content);
    }
    if (isPrivate !== undefined) updateData.isPrivate = isPrivate;
    if (tags) updateData.tags = tags;
    if (priority) updateData.priority = priority;

    await note.update(updateData);

    // Fetch updated note with author
    const updatedNote = await ClientNote.findByPk(noteId, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    console.log(`✅ Note ${noteId} updated by ${req.user.email}`);

    res.json({
      message: 'Note updated successfully',
      note: updatedNote
    });
  } catch (error) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:clientId/notes/:noteId - Delete a note
router.delete('/:clientId/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await ClientNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or CEO can delete
    if (note.authorId !== req.user.id && req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'You can only delete your own notes' });
    }

    // Soft delete
    await note.update({ isDeleted: true });

    console.log(`🗑️ Note ${noteId} deleted by ${req.user.email}`);

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:clientId/notes/:noteId/pin - Toggle pin status
router.put('/:clientId/notes/:noteId/pin', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;

    const note = await ClientNote.findByPk(noteId);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Only author or CEO can pin
    if (note.authorId !== req.user.id && req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'You can only pin your own notes' });
    }

    // Toggle pin
    await note.update({ isPinned: !note.isPinned });

    console.log(`📌 Note ${noteId} ${note.isPinned ? 'pinned' : 'unpinned'} by ${req.user.email}`);

    res.json({
      message: note.isPinned ? 'Note pinned' : 'Note unpinned',
      isPinned: note.isPinned
    });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:clientId/activity - Get client activity timeline
router.get('/:clientId/activity', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;

    // Check client access
    const hasAccess = await checkClientAccess(clientId, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to view this client' });
    }

    // Get all activity notes (system-generated)
    const activityNotes = await ClientNote.findAll({
      where: {
        clientId,
        type: 'activity',
        isDeleted: false
      },
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 50
    });

    res.json(activityNotes);
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients/:clientId/notes/search - Search notes
router.post('/:clientId/notes/search', authenticateToken, async (req, res) => {
  try {
    const { clientId } = req.params;
    const { query, tags, authorId, priority } = req.body;

    // Check client access
    const hasAccess = await checkClientAccess(clientId, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to view this client' });
    }

    // Build search clause
    const whereClause = {
      clientId,
      isDeleted: false
    };

    if (query) {
      whereClause.content = { [Op.like]: `%${query}%` };
    }

    if (tags && tags.length > 0) {
      whereClause.tags = { [Op.overlap]: tags };
    }

    if (authorId) {
      whereClause.authorId = authorId;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    // Privacy filter
    if (req.user.role !== 'CEO') {
      whereClause[Op.or] = [
        { isPrivate: false },
        { authorId: req.user.id }
      ];
    }

    const notes = await ClientNote.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json(notes);
  } catch (error) {
    console.error('Error searching notes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

