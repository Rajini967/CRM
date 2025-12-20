const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Client = sequelize.define('Client', {
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
  country: { 
    type: DataTypes.STRING
  },
  status: { 
    type: DataTypes.ENUM('Lead', 'Abstract Submitted', 'Registered', 'Unresponsive', 'Registration Unresponsive', 'Rejected', 'Completed'), 
    defaultValue: 'Lead' 
  },
  conferenceId: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  notes: { 
    type: DataTypes.TEXT 
  },
  source: {
    type: DataTypes.STRING,
    defaultValue: 'Website'
  },
  lastContact: {
    type: DataTypes.DATE
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // organizationId: {
  //   type: DataTypes.STRING,
  //   allowNull: true,
  //   comment: 'Organization this client belongs to'
  // },
  ownerUserId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Enhanced Client Information
  title: {
    type: DataTypes.STRING,
    comment: 'Professional title (Dr., Prof., etc.)'
  },
  middleName: {
    type: DataTypes.STRING
  },
  dateOfBirth: {
    type: DataTypes.DATE
  },
  gender: {
    type: DataTypes.ENUM('Male', 'Female', 'Other', 'Prefer not to say')
  },
  // Contact Information
  alternateEmail: {
    type: DataTypes.STRING,
    validate: { isEmail: true }
  },
  alternatePhone: {
    type: DataTypes.STRING
  },
  // Professional Information
  department: {
    type: DataTypes.STRING
  },
  jobTitle: {
    type: DataTypes.STRING
  },
  yearsOfExperience: {
    type: DataTypes.INTEGER
  },
  expertise: {
    type: DataTypes.JSON,
    defaultValue: () => ([]),
    comment: 'Array of expertise areas'
  },
  // Conference-Specific Information
  abstractTitle: {
    type: DataTypes.STRING,
    comment: 'Title of submitted abstract'
  },
  abstractContent: {
    type: DataTypes.TEXT,
    comment: 'Content of submitted abstract'
  },
  abstractSubmittedAt: {
    type: DataTypes.DATE
  },
  registrationDate: {
    type: DataTypes.DATE
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'paid', 'refunded', 'cancelled'),
    defaultValue: 'pending'
  },
  paymentAmount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  paymentMethod: {
    type: DataTypes.STRING
  },
  // Communication Preferences
  communicationPreferences: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      email: true,
      phone: false,
      sms: false,
      frequency: 'normal' // low, normal, high
    })
  },
  // Follow-up Information
  currentStage: {
    type: DataTypes.ENUM('stage1', 'stage2', 'completed'),
    defaultValue: 'stage1'
  },
  followUpCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  lastFollowUpDate: {
    type: DataTypes.DATE
  },
  nextFollowUpDate: {
    type: DataTypes.DATE
  },
  followUpPaused: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  followUpPausedReason: {
    type: DataTypes.STRING
  },
  // Manual Email Tracking (for workflow resume)
  manualEmailsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of emails sent manually before automation started - automation will skip this many emails'
  },
  manualStage1Count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Stage 1 follow-ups already sent manually'
  },
  manualStage2Count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Stage 2 follow-ups already sent manually'
  },
  // Engagement Metrics
  engagement: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      emailsSent: 0,
      emailsOpened: 0,
      emailsClicked: 0,
      lastEmailOpen: null,
      lastEmailClick: null,
      responseRate: 0,
      engagementScore: 0
    })
  },
  // Tags and Categories
  tags: {
    type: DataTypes.JSON,
    defaultValue: () => ([]),
    comment: 'Array of tags for categorization'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  // Custom Fields
  customFields: {
    type: DataTypes.JSON,
    defaultValue: () => ({}),
    comment: 'Custom fields specific to organization'
  },
  // Compliance and Privacy
  gdprConsent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  gdprConsentDate: {
    type: DataTypes.DATE
  },
  unsubscribeDate: {
    type: DataTypes.DATE
  },
  isUnsubscribed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Social Media
  socialMedia: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      linkedin: '',
      twitter: '',
      facebook: '',
      website: ''
    })
  }
}, { 
  tableName: 'clients',
  timestamps: true,
  indexes: [
    { fields: ['organizationId'] },
    { fields: ['conferenceId'] },
    { fields: ['email', 'organizationId'], unique: true },
    { fields: ['status'] },
    { fields: ['currentStage'] },
    { fields: ['country'] },
    { fields: ['ownerUserId'] },
    { fields: ['isActive'] },
    { fields: ['isUnsubscribed'] },
    { fields: ['priority'] },
    { fields: ['followUpPaused'] },
    { fields: ['nextFollowUpDate'] },
    { fields: ['name'] },
    { fields: ['organizationId', 'status'] },
    { fields: ['organizationId', 'currentStage'] }
  ]
}, {
  tableName: 'clients',
  timestamps: true,
  getterMethods: {
    firstName() {
      const full = this.getDataValue('name') || '';
      return full.split(' ')[0] || '';
    },
    lastName() {
      const full = this.getDataValue('name') || '';
      const parts = full.split(' ');
      return parts.length > 1 ? parts.slice(1).join(' ') : '';
    }
  }
});

module.exports = Client;
