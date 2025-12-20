const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Email = sequelize.define('Email', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  messageId: { 
    type: DataTypes.STRING, 
    unique: true 
  },
  uid: {
    type: DataTypes.INTEGER,
    comment: 'IMAP UID'
  },
  from: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  fromName: {
    type: DataTypes.STRING
  },
  to: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  toName: {
    type: DataTypes.STRING
  },
  cc: {
    type: DataTypes.TEXT
  },
  ccName: {
    type: DataTypes.TEXT
  },
  bcc: {
    type: DataTypes.TEXT
  },
  bccName: {
    type: DataTypes.TEXT
  },
  subject: { 
    type: DataTypes.STRING 
  },
  body: { 
    type: DataTypes.TEXT 
  },
  bodyHtml: { 
    type: DataTypes.TEXT 
  },
  bodyText: {
    type: DataTypes.TEXT
  },
  folderId: { 
    type: DataTypes.STRING 
  },
  folder: { 
    type: DataTypes.STRING, 
    defaultValue: 'inbox' 
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
  hasAttachments: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  attachments: { 
    type: DataTypes.JSON 
  },
  date: { 
    type: DataTypes.DATE, 
    allowNull: false 
  },
  size: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0 
  },
  clientId: { 
    type: DataTypes.STRING 
  },
  emailAccountId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  threadId: {
    type: DataTypes.STRING
  },
  isSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDraft: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  replyTo: {
    type: DataTypes.STRING
  },
  inReplyTo: {
    type: DataTypes.STRING
  },
  references: {
    type: DataTypes.TEXT,
    comment: 'References header for threading'
  },
  // Parent entity linking
  parentId: {
    type: DataTypes.STRING,
    comment: 'Parent entity ID (Account, Contact, etc.)'
  },
  parentType: {
    type: DataTypes.ENUM('account', 'contact', 'lead', 'opportunity', 'case')
  },
  // Email tracking
  isTracked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  trackingId: {
    type: DataTypes.STRING,
    unique: true
  },
  // Status tracking
  status: {
    type: DataTypes.ENUM('draft', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'),
    defaultValue: 'draft'
  },
  // Flags and labels
  flags: {
    type: DataTypes.JSON,
    comment: 'IMAP flags'
  },
  labels: {
    type: DataTypes.JSON,
    comment: 'Custom labels'
  },
  // Priority and urgency
  priority: {
    type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
    defaultValue: 'normal'
  },
  // Delivery tracking
  deliveredAt: {
    type: DataTypes.DATE
  },
  openedAt: {
    type: DataTypes.DATE
  },
  clickedAt: {
    type: DataTypes.DATE
  },
  bouncedAt: {
    type: DataTypes.DATE
  },
  bounceReason: {
    type: DataTypes.TEXT
  }
}, { 
  tableName: 'emails',
  timestamps: true,
  indexes: [
    { fields: ['messageId'] },
    { fields: ['from'] },
    { fields: ['to'] },
    { fields: ['folder'] },
    { fields: ['clientId'] },
    { fields: ['emailAccountId'] },
    { fields: ['date'] },
    { fields: ['status'] }
  ]
});

module.exports = Email;
