const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EmailTemplate = sequelize.define('EmailTemplate', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  stage: { 
    type: DataTypes.ENUM('abstract_submission', 'registration'), 
    allowNull: false 
  },
  followUpNumber: { 
    type: DataTypes.INTEGER, 
    defaultValue: 1 
  },
  subject: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  bodyHtml: { 
    type: DataTypes.TEXT 
  },
  bodyText: { 
    type: DataTypes.TEXT 
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  createdBy: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  description: {
    type: DataTypes.TEXT
  },
  variables: {
    type: DataTypes.JSON,
    comment: 'Available template variables'
  },
  sendAfterDays: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    comment: 'Days to wait before sending this template'
  },
  attachments: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'File attachments for the template'
  }
}, { 
  tableName: 'email_templates',
  timestamps: true,
  indexes: [
    { fields: ['stage'] },
    { fields: ['followUpNumber'] },
    { fields: ['isActive'] },
    { fields: ['createdBy'] }
  ]
});

module.exports = EmailTemplate;
