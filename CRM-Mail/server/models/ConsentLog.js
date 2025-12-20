const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConsentLog = sequelize.define('ConsentLog', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  clientId: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Client ID this consent log belongs to'
  },
  consentType: { 
    type: DataTypes.ENUM('marketing', 'analytics', 'cookies', 'data_processing', 'communication'),
    defaultValue: 'marketing',
    comment: 'Type of consent given'
  },
  consentGiven: { 
    type: DataTypes.BOOLEAN, 
    allowNull: false,
    comment: 'Whether consent was given or withdrawn'
  },
  consentDate: { 
    type: DataTypes.DATE, 
    allowNull: false,
    comment: 'Date when consent was given'
  },
  consentMethod: { 
    type: DataTypes.STRING,
    comment: 'Method of consent (email, website, phone, etc.)'
  },
  consentSource: { 
    type: DataTypes.STRING,
    comment: 'Source of consent (website, email, form, etc.)'
  },
  consentText: { 
    type: DataTypes.TEXT,
    comment: 'Text of the consent given'
  },
  ipAddress: { 
    type: DataTypes.STRING,
    comment: 'IP address when consent was given'
  },
  userAgent: { 
    type: DataTypes.STRING,
    comment: 'User agent when consent was given'
  },
  organizationId: { 
    type: DataTypes.STRING, 
    allowNull: false,
    comment: 'Organization this consent log belongs to'
  },
  withdrawalDate: { 
    type: DataTypes.DATE,
    comment: 'Date when consent was withdrawn'
  },
  withdrawalMethod: { 
    type: DataTypes.STRING,
    comment: 'Method of consent withdrawal'
  },
  withdrawalReason: { 
    type: DataTypes.STRING,
    comment: 'Reason for consent withdrawal'
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true,
    comment: 'Whether this consent is currently active'
  }
}, { 
  tableName: 'consent_logs',
  timestamps: true,
  indexes: [
    { fields: ['clientId'] },
    { fields: ['consentType'] },
    { fields: ['consentGiven'] },
    { fields: ['consentDate'] },
    { fields: ['organizationId'] },
    { fields: ['isActive'] },
    { fields: ['clientId', 'consentType'] },
    { fields: ['organizationId', 'consentDate'] }
  ]
});

module.exports = ConsentLog;
