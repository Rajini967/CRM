const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Task = sequelize.define('Task', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  title: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  description: { 
    type: DataTypes.TEXT, 
    allowNull: true
  },
  assignedToId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  assignedById: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  status: { 
    type: DataTypes.ENUM('pending', 'in-progress', 'completed', 'cancelled'), 
    defaultValue: 'pending'
  },
  priority: { 
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), 
    defaultValue: 'medium'
  },
  dueDate: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  completedById: { 
    type: DataTypes.STRING,
    allowNull: true
  },
  estimatedHours: { 
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  actualHours: { 
    type: DataTypes.DECIMAL(5, 2),
    allowNull: true
  },
  tags: { 
    type: DataTypes.JSON, 
    defaultValue: () => ([])
  },
  attachments: { 
    type: DataTypes.JSON, 
    defaultValue: () => ([])
  },
  notes: { 
    type: DataTypes.TEXT,
    allowNull: true
  },
  isRecurring: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  },
  recurringPattern: { 
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'yearly'),
    allowNull: true
  },
  parentTaskId: { 
    type: DataTypes.STRING,
    allowNull: true
  },
  organizationId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  isDeleted: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  }
}, { 
  tableName: 'tasks',
  timestamps: true,
  indexes: [
    { fields: ['assignedToId'] },
    { fields: ['assignedById'] },
    { fields: ['status'] },
    { fields: ['priority'] },
    { fields: ['dueDate'] },
    { fields: ['organizationId'] },
    { fields: ['parentTaskId'] },
    { fields: ['isDeleted'] },
    { fields: ['assignedToId', 'status'] },
    { fields: ['organizationId', 'status'] },
    { fields: ['dueDate', 'status'] }
  ]
});

module.exports = Task;
