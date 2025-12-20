const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailFolder = sequelize.define('EmailFolder', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  displayName: { 
    type: DataTypes.STRING 
  },
  type: { 
    type: DataTypes.ENUM('inbox', 'sent', 'drafts', 'trash', 'archive', 'spam', 'important', 'custom'), 
    allowNull: false 
  },
  emailAccountId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  parentId: { 
    type: DataTypes.STRING 
  },
  path: { 
    type: DataTypes.STRING,
    comment: 'Full folder path (e.g., INBOX/Subfolder)'
  },
  delimiter: { 
    type: DataTypes.STRING,
    defaultValue: '/'
  },
  attributes: { 
    type: DataTypes.JSON,
    comment: 'IMAP folder attributes'
  },
  messageCount: { 
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  unreadCount: { 
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  isSubscribed: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  lastSyncAt: {
    type: DataTypes.DATE
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  color: {
    type: DataTypes.STRING,
    defaultValue: '#6B7280'
  },
  icon: {
    type: DataTypes.STRING
  }
}, { 
  tableName: 'email_folders',
  timestamps: true,
  indexes: [
    { fields: ['emailAccountId'] },
    { fields: ['type'] },
    { fields: ['parentId'] },
    { fields: ['path'] },
    { fields: ['isActive'] }
  ]
});

module.exports = EmailFolder;
