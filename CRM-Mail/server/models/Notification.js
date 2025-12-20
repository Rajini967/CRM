const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Notification = sequelize.define('Notification', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  userId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  type: { 
    type: DataTypes.ENUM(
      'email_sent',
      'email_bounced', 
      'client_added',
      'client_updated',
      'conference_created',
      'follow_up_completed',
      'system_alert',
      'user_activity'
    ), 
    allowNull: false 
  },
  title: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  message: { 
    type: DataTypes.TEXT, 
    allowNull: false 
  },
  data: { 
    type: DataTypes.JSON,
    defaultValue: () => ({})
  },
  priority: { 
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'), 
    defaultValue: 'medium' 
  },
  isRead: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  readAt: { 
    type: DataTypes.DATE 
  },
  sendEmail: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  emailSent: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  emailSentAt: { 
    type: DataTypes.DATE 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  }
}, { 
  tableName: 'notifications',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['type'] },
    { fields: ['priority'] },
    { fields: ['isRead'] },
    { fields: ['createdAt'] },
    { fields: ['userId', 'isRead'] },
    { fields: ['userId', 'type'] }
  ]
});

module.exports = Notification;
