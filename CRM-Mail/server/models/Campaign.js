const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Campaign = sequelize.define('Campaign', {
  id: {
    type: DataTypes.STRING,
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  conferenceId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  templateId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  smtpAccountId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ownerId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },
  totalRecipients: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  sentCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  deliveredCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  bouncedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  repliedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  openedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  clickedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  scheduledAt: {
    type: DataTypes.DATE
  },
  startedAt: {
    type: DataTypes.DATE
  },
  completedAt: {
    type: DataTypes.DATE
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      throttleRate: 100, // emails per minute
      batchSize: 50,
      retryAttempts: 3,
      retryDelay: 300000 // 5 minutes
    })
  },
  recipientData: {
    type: DataTypes.JSON,
    comment: 'Stores recipient list and mapping data'
  }
}, {
  tableName: 'campaigns',
  timestamps: true,
  indexes: [
    { fields: ['conferenceId'] },
    { fields: ['status'] },
    { fields: ['ownerId'] },
    { fields: ['scheduledAt'] }
  ]
});

module.exports = Campaign;
