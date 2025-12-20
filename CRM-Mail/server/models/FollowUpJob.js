const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const FollowUpJob = sequelize.define('FollowUpJob', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  clientId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  conferenceId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  templateId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  stage: { 
    type: DataTypes.ENUM('stage1', 'stage2', 'abstract_submission', 'registration'), 
    allowNull: false 
  },
  followUpCount: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0 
  },
  maxFollowUps: { 
    type: DataTypes.INTEGER, 
    defaultValue: 3 
  },
  nextSendAt: { 
    type: DataTypes.DATE 
  },
  scheduledDate: {
    type: DataTypes.DATE
  },
  currentAttempt: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  maxAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 3
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  status: { 
    type: DataTypes.ENUM('active', 'paused', 'stopped'), 
    defaultValue: 'active' 
  },
  paused: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  skipWeekends: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  customInterval: { 
    type: DataTypes.INTEGER,
    comment: 'Custom interval in days'
  },
  lastSentAt: { 
    type: DataTypes.DATE 
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT
  },
  completedAt: {
    type: DataTypes.DATE
  }
}, { 
  tableName: 'followup_jobs',
  timestamps: true,
  indexes: [
    { fields: ['clientId'] },
    { fields: ['stage'] },
    { fields: ['status'] },
    { fields: ['nextSendAt'] },
    { fields: ['createdBy'] }
  ]
});

module.exports = FollowUpJob;
