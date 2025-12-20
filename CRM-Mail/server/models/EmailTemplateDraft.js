const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailTemplateDraft = sequelize.define('EmailTemplateDraft', {
  id: {
    type: DataTypes.UUID,
    primaryKey: true,
    defaultValue: DataTypes.UUIDV4
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  stage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  followUpNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: true
  },
  bodyHtml: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  bodyText: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  variables: {
    type: DataTypes.JSON,
    allowNull: true
  },
  attachments: {
    type: DataTypes.JSON,
    allowNull: true
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  organizationId: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'email_template_drafts',
  timestamps: true,
  indexes: [
    { fields: ['createdBy'] },
    { fields: ['organizationId'] },
    { fields: ['stage'] }
  ]
});

module.exports = EmailTemplateDraft;

