const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UnsubscribeLog = sequelize.define('UnsubscribeLog', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  clientId: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Client ID this unsubscribe log belongs to'
  },
  emailId: { 
    type: DataTypes.STRING,
    comment: 'Email ID that triggered the unsubscribe'
  },
  unsubscribeDate: { 
    type: DataTypes.DATE, 
    allowNull: false,
    comment: 'Date when unsubscribe occurred'
  },
  unsubscribeMethod: { 
    type: DataTypes.ENUM('email', 'website', 'phone', 'api', 'manual'),
    defaultValue: 'email',
    comment: 'Method of unsubscribe'
  },
  unsubscribeReason: { 
    type: DataTypes.STRING,
    comment: 'Reason for unsubscribe'
  },
  ipAddress: { 
    type: DataTypes.STRING,
    comment: 'IP address when unsubscribe occurred'
  },
  userAgent: { 
    type: DataTypes.STRING,
    comment: 'User agent when unsubscribe occurred'
  },
  organizationId: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Organization this unsubscribe log belongs to'
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true,
    comment: 'Whether this unsubscribe is currently active'
  },
  reactivatedDate: { 
    type: DataTypes.DATE,
    comment: 'Date when client was reactivated'
  },
  reactivatedBy: { 
    type: DataTypes.STRING,
    comment: 'User who reactivated the client'
  }
}, { 
  tableName: 'unsubscribe_logs',
  timestamps: true,
  indexes: [
    { fields: ['clientId'] },
    { fields: ['emailId'] },
    { fields: ['unsubscribeDate'] },
    { fields: ['unsubscribeMethod'] },
    { fields: ['organizationId'] },
    { fields: ['isActive'] },
    { fields: ['clientId', 'isActive'] },
    { fields: ['organizationId', 'unsubscribeDate'] }
  ]
});

module.exports = UnsubscribeLog;
