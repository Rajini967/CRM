const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  entityType: { 
    type: DataTypes.ENUM(
      'user',
      'client', 
      'conference',
      'email',
      'template',
      'organization',
      'system'
    ), 
    allowNull: false 
  },
  entityId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  action: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  details: { 
    type: DataTypes.JSON,
    defaultValue: () => ({}),
    comment: 'Action details and metadata'
  },
  userId: { 
    type: DataTypes.STRING,
    comment: 'User who performed the action'
  },
  organizationId: { 
    type: DataTypes.STRING,
    comment: 'Organization context'
  },
  ipAddress: { 
    type: DataTypes.STRING,
    comment: 'IP address of the action'
  },
  userAgent: { 
    type: DataTypes.STRING,
    comment: 'User agent of the action'
  },
  severity: { 
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), 
    defaultValue: 'medium' 
  },
  timestamp: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  }
}, { 
  tableName: 'audit_logs',
  timestamps: false, // Using custom timestamp field
  indexes: [
    { fields: ['entityType'] },
    { fields: ['entityId'] },
    { fields: ['action'] },
    { fields: ['userId'] },
    { fields: ['organizationId'] },
    { fields: ['severity'] },
    { fields: ['timestamp'] },
    { fields: ['entityType', 'entityId'] },
    { fields: ['userId', 'timestamp'] },
    { fields: ['organizationId', 'timestamp'] }
  ]
});

module.exports = AuditLog;