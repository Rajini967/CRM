const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailAccount = sequelize.define('EmailAccount', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  type: { 
    type: DataTypes.ENUM('smtp', 'imap', 'both'), 
    allowNull: false,
    defaultValue: 'both'
  },
  // SMTP Configuration
  smtpHost: { 
    type: DataTypes.STRING 
  },
  smtpPort: { 
    type: DataTypes.INTEGER,
    defaultValue: 587
  },
  smtpUsername: { 
    type: DataTypes.STRING 
  },
  smtpPassword: { 
    type: DataTypes.STRING 
  },
  smtpSecure: { 
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  smtpAuth: { 
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // IMAP Configuration
  imapHost: { 
    type: DataTypes.STRING 
  },
  imapPort: { 
    type: DataTypes.INTEGER,
    defaultValue: 993
  },
  imapUsername: { 
    type: DataTypes.STRING 
  },
  imapPassword: { 
    type: DataTypes.STRING 
  },
  imapSecure: { 
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Settings
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  isDefault: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  createdBy: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  // organizationId: {
  //   type: DataTypes.STRING,
  //   allowNull: true,
  //   comment: 'Organization this email account belongs to'
  // },
  lastSyncAt: {
    type: DataTypes.DATE
  },
  syncStatus: {
    type: DataTypes.ENUM('active', 'paused', 'error', 'disconnected'),
    defaultValue: 'disconnected'
  },
  errorMessage: {
    type: DataTypes.TEXT
  },
  ownerId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isSystemAccount: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Advanced Settings
  syncInterval: {
    type: DataTypes.INTEGER,
    defaultValue: 300, // 5 minutes in seconds
    comment: 'Sync interval in seconds'
  },
  maxEmailsPerSync: {
    type: DataTypes.INTEGER,
    defaultValue: 100
  },
  autoReply: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  autoReplyMessage: {
    type: DataTypes.TEXT
  },
  signature: {
    type: DataTypes.TEXT
  },
  sendPriority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    comment: 'Lower number = higher priority for outbound sending'
  }
}, { 
  tableName: 'email_accounts',
  timestamps: true,
  indexes: [
    { fields: ['email'] },
    { fields: ['isActive'] },
    { fields: ['isDefault'] },
    { fields: ['createdBy'] },
    { fields: ['ownerId'] },
    { fields: ['isSystemAccount'] },
    { fields: ['syncStatus'] },
    { fields: ['sendPriority'] }
  ]
});

module.exports = EmailAccount;
