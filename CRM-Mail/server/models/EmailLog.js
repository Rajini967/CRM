const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailLog = sequelize.define('EmailLog', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  emailId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  clientId: { 
    type: DataTypes.STRING 
  },
  action: { 
    type: DataTypes.ENUM('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'), 
    allowNull: false 
  },
  details: { 
    type: DataTypes.JSON 
  },
  timestamp: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  sentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'replied'),
    defaultValue: 'queued'
  },
  ipAddress: {
    type: DataTypes.STRING
  },
  userAgent: {
    type: DataTypes.STRING
  }
}, { 
  tableName: 'email_logs',
  timestamps: true,
  indexes: [
    { fields: ['emailId'] },
    { fields: ['clientId'] },
    { fields: ['action'] },
    { fields: ['timestamp'] }
  ]
});

module.exports = EmailLog;
