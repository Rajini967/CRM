const express = require('express');
const { Op } = require('sequelize');
const { Task, User, Organization } = require('../models');
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

// Helper: Create notification for task assignment
async function createTaskNotification(task, assignedToUser, assignedByUser) {
  try {
    const Notification = require('../models').Notification;
    
    await Notification.create({
      userId: assignedToUser.id,
      type: 'task_assigned',
      title: 'New Task Assigned',
      message: `${assignedByUser.name} assigned you a task: "${task.title}"`,
      data: {
        taskId: task.id,
        taskTitle: task.title,
        assignedById: assignedByUser.id,
        assignedByName: assignedByUser.name,
        dueDate: task.dueDate,
        priority: task.priority
      },
      isRead: false,
      organizationId: task.organizationId
    });

    console.log(`📋 Task notification created for ${assignedToUser.email}`);
  } catch (error) {
    console.error('Error creating task notification:', error);
  }
}

// Helper: Create notification for task completion
async function createTaskCompletionNotification(task, completedByUser, assignedToUser) {
  try {
    const Notification = require('../models').Notification;
    
    // Notify the person who assigned the task
    await Notification.create({
      userId: task.assignedById,
      type: 'task_completed',
      title: 'Task Completed',
      message: `${completedByUser.name} completed task: "${task.title}"`,
      data: {
        taskId: task.id,
        taskTitle: task.title,
        completedById: completedByUser.id,
        completedByName: completedByUser.name
      },
      isRead: false,
      organizationId: task.organizationId
    });

    console.log(`✅ Task completion notification created for ${assignedToUser.email}`);
  } catch (error) {
    console.error('Error creating task completion notification:', error);
  }
}

// GET /api/tasks - Get all tasks for user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { 
      status, 
      priority, 
      assignedTo, 
      assignedBy, 
      dueDate, 
      overdue = 'false',
      limit = 50,
      offset = 0
    } = req.query;

    // Build where clause
    const whereClause = {
      organizationId: req.user.organizationId,
      isDeleted: false
    };

    // Filter by status
    if (status) {
      whereClause.status = status;
    }

    // Filter by priority
    if (priority) {
      whereClause.priority = priority;
    }

    // Filter by assigned to
    if (assignedTo) {
      whereClause.assignedToId = assignedTo;
    } else if (req.user.role !== 'CEO') {
      // Non-CEO users only see their own tasks
      whereClause.assignedToId = req.user.id;
    }

    // Filter by assigned by
    if (assignedBy) {
      whereClause.assignedById = assignedBy;
    }

    // Filter by due date
    if (dueDate) {
      const targetDate = new Date(dueDate);
      whereClause.dueDate = {
        [Op.between]: [
          new Date(targetDate.setHours(0, 0, 0, 0)),
          new Date(targetDate.setHours(23, 59, 59, 999))
        ]
      };
    }

    // Filter overdue tasks
    if (overdue === 'true') {
      whereClause.dueDate = {
        [Op.lt]: new Date(),
        [Op.ne]: null
      };
      whereClause.status = {
        [Op.in]: ['pending', 'in-progress']
      };
    }

    // Fetch tasks with related data
    const tasks = await Task.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'completedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Task,
          as: 'subtasks',
          include: [
            {
              model: User,
              as: 'assignedTo',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC']
      ],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    console.log(`📋 Fetched ${tasks.length} task(s) for user ${req.user.email}`);

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id - Get single task
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findOne({
      where: {
        id,
        organizationId: req.user.organizationId,
        isDeleted: false
      },
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'completedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: Task,
          as: 'subtasks',
          include: [
            {
              model: User,
              as: 'assignedTo',
              attributes: ['id', 'name', 'email']
            }
          ]
        },
        {
          model: Task,
          as: 'parentTask',
          include: [
            {
              model: User,
              as: 'assignedTo',
              attributes: ['id', 'name', 'email']
            }
          ]
        }
      ]
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if user has access to this task
    if (req.user.role !== 'CEO' && task.assignedToId !== req.user.id && task.assignedById !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to view this task' });
    }

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tasks - Create new task
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      title,
      description,
      assignedToId,
      dueDate,
      priority = 'medium',
      estimatedHours,
      tags = [],
      parentTaskId,
      notes
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Task title is required' });
    }

    if (!assignedToId) {
      return res.status(400).json({ error: 'Assigned user is required' });
    }

    // Verify assigned user exists and belongs to same organization
    const assignedToUser = await User.findOne({
      where: {
        id: assignedToId,
        organizationId: req.user.organizationId
      }
    });

    if (!assignedToUser) {
      return res.status(400).json({ error: 'Assigned user not found' });
    }

    // Verify parent task if provided
    if (parentTaskId) {
      const parentTask = await Task.findOne({
        where: {
          id: parentTaskId,
          organizationId: req.user.organizationId,
          isDeleted: false
        }
      });

      if (!parentTask) {
        return res.status(400).json({ error: 'Parent task not found' });
      }
    }

    // Create task
    const task = await Task.create({
      title: title.trim(),
      description,
      assignedToId,
      assignedById: req.user.id,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority,
      estimatedHours,
      tags,
      parentTaskId,
      notes,
      organizationId: req.user.organizationId,
      status: 'pending'
    });

    // Fetch task with related data
    const taskWithRelations = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    // Create notification for assigned user
    await createTaskNotification(taskWithRelations, assignedToUser, req.user);

    console.log(`✅ Task created: "${title}" assigned to ${assignedToUser.email} by ${req.user.email}`);

    res.status(201).json({
      message: 'Task created successfully',
      task: taskWithRelations
    });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      assignedToId,
      dueDate,
      priority,
      estimatedHours,
      actualHours,
      tags,
      notes,
      status
    } = req.body;

    // Get the task
    const task = await Task.findOne({
      where: {
        id,
        organizationId: req.user.organizationId,
        isDeleted: false
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check permissions
    const canEdit = req.user.role === 'CEO' || 
                   task.assignedToId === req.user.id || 
                   task.assignedById === req.user.id;

    if (!canEdit) {
      return res.status(403).json({ error: 'You do not have permission to edit this task' });
    }

    // Handle status change to completed
    if (status === 'completed' && task.status !== 'completed') {
      await task.update({
        status: 'completed',
        completedAt: new Date(),
        completedById: req.user.id
      });

      // Get assigned user for notification
      const assignedToUser = await User.findByPk(task.assignedToId);
      if (assignedToUser) {
        await createTaskCompletionNotification(task, req.user, assignedToUser);
      }
    } else {
      // Regular update
      const updateData = {};
      if (title) updateData.title = title.trim();
      if (description !== undefined) updateData.description = description;
      if (assignedToId) updateData.assignedToId = assignedToId;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (priority) updateData.priority = priority;
      if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours;
      if (actualHours !== undefined) updateData.actualHours = actualHours;
      if (tags) updateData.tags = tags;
      if (notes !== undefined) updateData.notes = notes;
      if (status) updateData.status = status;

      await task.update(updateData);
    }

    // Fetch updated task with relations
    const updatedTask = await Task.findByPk(task.id, {
      include: [
        {
          model: User,
          as: 'assignedTo',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'completedBy',
          attributes: ['id', 'name', 'email', 'role']
        }
      ]
    });

    console.log(`✅ Task ${id} updated by ${req.user.email}`);

    res.json({
      message: 'Task updated successfully',
      task: updatedTask
    });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id - Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const task = await Task.findOne({
      where: {
        id,
        organizationId: req.user.organizationId,
        isDeleted: false
      }
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Only CEO or task creator can delete
    if (req.user.role !== 'CEO' && task.assignedById !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete tasks you created' });
    }

    // Soft delete
    await task.update({ isDeleted: true });

    console.log(`🗑️ Task ${id} deleted by ${req.user.email}`);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/user/:userId - Get tasks for specific user
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, priority, overdue = 'false' } = req.query;

    // Check if user has permission to view other users' tasks
    if (req.user.id !== userId && req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'You can only view your own tasks' });
    }

    // Build where clause
    const whereClause = {
      assignedToId: userId,
      organizationId: req.user.organizationId,
      isDeleted: false
    };

    if (status) {
      whereClause.status = status;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (overdue === 'true') {
      whereClause.dueDate = {
        [Op.lt]: new Date(),
        [Op.ne]: null
      };
      whereClause.status = {
        [Op.in]: ['pending', 'in-progress']
      };
    }

    const tasks = await Task.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'assignedBy',
          attributes: ['id', 'name', 'email', 'role']
        },
        {
          model: User,
          as: 'completedBy',
          attributes: ['id', 'name', 'email', 'role']
        }
      ],
      order: [
        ['priority', 'DESC'],
        ['dueDate', 'ASC'],
        ['createdAt', 'DESC']
      ]
    });

    res.json(tasks);
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/stats/overview - Get task statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const { assignedTo } = req.query;

    // Build where clause
    const whereClause = {
      organizationId: req.user.organizationId,
      isDeleted: false
    };

    if (assignedTo) {
      whereClause.assignedToId = assignedTo;
    } else if (req.user.role !== 'CEO') {
      whereClause.assignedToId = req.user.id;
    }

    // Get task counts by status
    const statusCounts = await Task.findAll({
      where: whereClause,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get task counts by priority
    const priorityCounts = await Task.findAll({
      where: whereClause,
      attributes: [
        'priority',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['priority'],
      raw: true
    });

    // Get overdue tasks count
    const overdueCount = await Task.count({
      where: {
        ...whereClause,
        dueDate: {
          [Op.lt]: new Date(),
          [Op.ne]: null
        },
        status: {
          [Op.in]: ['pending', 'in-progress']
        }
      }
    });

    // Get tasks due today
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const dueTodayCount = await Task.count({
      where: {
        ...whereClause,
        dueDate: {
          [Op.between]: [startOfDay, endOfDay]
        },
        status: {
          [Op.in]: ['pending', 'in-progress']
        }
      }
    });

    // Format results
    const stats = {
      byStatus: {
        pending: 0,
        'in-progress': 0,
        completed: 0,
        cancelled: 0
      },
      byPriority: {
        low: 0,
        medium: 0,
        high: 0,
        urgent: 0
      },
      overdue: overdueCount,
      dueToday: dueTodayCount
    };

    // Populate status counts
    statusCounts.forEach(item => {
      stats.byStatus[item.status] = parseInt(item.count);
    });

    // Populate priority counts
    priorityCounts.forEach(item => {
      stats.byPriority[item.priority] = parseInt(item.count);
    });

    res.json(stats);
  } catch (error) {
    console.error('Error fetching task stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
