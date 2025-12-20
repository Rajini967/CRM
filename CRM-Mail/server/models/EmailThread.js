const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailThread = sequelize.define('EmailThread', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  subject: { 
    type: DataTypes.STRING 
  },
  participants: { 
    type: DataTypes.JSON,
    comment: 'Array of email addresses involved in the thread'
  },
  lastMessageId: { 
    type: DataTypes.STRING 
  },
  lastMessageAt: { 
    type: DataTypes.DATE 
  },
  messageCount: { 
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  isRead: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  isImportant: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  isStarred: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  folderId: { 
    type: DataTypes.STRING 
  },
  emailAccountId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  clientId: { 
    type: DataTypes.STRING 
  },
  parentId: { 
    type: DataTypes.STRING,
    comment: 'Parent entity ID (Account, Contact, etc.)'
  },
  parentType: { 
    type: DataTypes.ENUM('account', 'contact', 'lead', 'opportunity', 'case')
  },
  tags: { 
    type: DataTypes.JSON,
    comment: 'Array of tags'
  },
  status: { 
    type: DataTypes.ENUM('active', 'archived', 'deleted'),
    defaultValue: 'active'
  }
}, { 
  tableName: 'email_threads',
  timestamps: true,
  indexes: [
    { fields: ['emailAccountId'] },
    { fields: ['folderId'] },
    { fields: ['clientId'] },
    { fields: ['parentId', 'parentType'] },
    { fields: ['lastMessageAt'] },
    { fields: ['isRead'] },
    { fields: ['isImportant'] },
    { fields: ['status'] }
  ]
});

module.exports = EmailThread;
