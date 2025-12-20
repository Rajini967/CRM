const express = require('express');
const { Op } = require('sequelize');
const { Notification, User } = require('../models');
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

// GET /api/notifications - Get user's notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      isRead, 
      type, 
      limit = 50, 
      offset = 0,
      priority 
    } = req.query;

    // Build where clause
    const whereClause = {
      userId: req.user.id,
      isActive: true
    };

    if (isRead !== undefined) {
      whereClause.isRead = isRead === 'true';
    }

    if (type) {
      whereClause.type = type;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    // Get notifications
    const notifications = await Notification.findAll({
      where: whereClause,
      order: [
        ['isRead', 'ASC'], // Unread first
        ['priority', 'DESC'], // Then by priority
        ['createdAt', 'DESC'] // Then by date
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Get total count
    const totalCount = await Notification.count({
      where: whereClause
    });

    // Get unread count
    const unreadCount = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
        isActive: true
      }
    });

    console.log(`📬 Fetched ${notifications.length} notifications for ${req.user.email} (${unreadCount} unread)`);

    res.json({
      notifications,
      total: totalCount,
      unread: unreadCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/unread-count - Get unread notification count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
        isActive: true
      }
    });

    res.json({ count });
  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/recent - Get recent notifications (last 10)
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: {
        userId: req.user.id,
        isActive: true
      },
      order: [
        ['isRead', 'ASC'],
        ['createdAt', 'DESC']
      ],
      limit: 10
    });

    res.json(notifications);
  } catch (error) {
    console.error('Error fetching recent notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications - Create notification
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { userId, title, message, type, data, priority, link } = req.body;

    if (!userId || !title || !message || !type) {
      return res.status(400).json({ error: 'userId, title, message, and type are required' });
    }

    // Check if target user exists
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Create notification
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      data: data || {},
      priority: priority || 'medium',
      link: link || null,
      isRead: false
    });

    console.log(`🔔 Notification created for ${targetUser.email}: ${title}`);

    res.status(201).json({
      message: 'Notification created successfully',
      notification
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Check ownership
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only mark your own notifications as read' });
    }

    // Mark as read
    await notification.update({
      isRead: true,
      readAt: new Date()
    });

    console.log(`✅ Notification ${id} marked as read by ${req.user.email}`);

    res.json({
      message: 'Notification marked as read',
      notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authenticateToken, async (req, res) => {
  try {
    const updateResult = await Notification.update(
      {
        isRead: true,
        readAt: new Date()
      },
      {
        where: {
          userId: req.user.id,
          isRead: false,
          isActive: true
        }
      }
    );

    console.log(`✅ Marked ${updateResult[0]} notifications as read for ${req.user.email}`);

    res.json({
      message: 'All notifications marked as read',
      count: updateResult[0]
    });
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findByPk(id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Check ownership
    if (notification.userId !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own notifications' });
    }

    // Soft delete (mark as inactive)
    await notification.update({ isActive: false });

    console.log(`🗑️ Notification ${id} deleted by ${req.user.email}`);

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notifications/delete-all - Delete all notifications
router.delete('/delete-all', authenticateToken, async (req, res) => {
  try {
    const updateResult = await Notification.update(
      { isActive: false },
      {
        where: {
          userId: req.user.id,
          isActive: true
        }
      }
    );

    console.log(`🗑️ Deleted ${updateResult[0]} notifications for ${req.user.email}`);

    res.json({
      message: 'All notifications deleted',
      count: updateResult[0]
    });
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;

