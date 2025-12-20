const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Conference = sequelize.define('Conference', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  shortName: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Short abbreviation for the conference name'
  },
  venue: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  startDate: { 
    type: DataTypes.DATE, 
    allowNull: false 
  },
  endDate: { 
    type: DataTypes.DATE, 
    allowNull: false 
  },
  // organizationId: { 
  //   type: DataTypes.STRING, 
  //   allowNull: true, 
  //   comment: 'Organization this conference belongs to' 
  // },
  primaryContactUserId: { 
    type: DataTypes.STRING, 
    allowNull: true 
  },
  currency: { 
    type: DataTypes.STRING, 
    defaultValue: 'USD' 
  },
  abstractDeadline: { 
    type: DataTypes.DATE 
  },
  registrationDeadline: { 
    type: DataTypes.DATE 
  },
  description: {
    type: DataTypes.TEXT
  },
  website: {
    type: DataTypes.STRING
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      followup_intervals: {
        "Stage1": { value: 7, unit: "days" },
        "Stage2": { value: 3, unit: "days" }
      },
      max_attempts: {
        "Stage1": 6,
        "Stage2": 6
      },
      skip_weekends: true,
      smtp_default_id: null,
      timezone: "UTC",
      working_hours: {
        start: "09:00",
        end: "17:00"
      }
    }),
    comment: 'Conference settings - followup_intervals support: { value: number, unit: "days"|"hours"|"minutes" }'
  },
  // Stage 1 Template ID (Abstract Submission)
  stage1TemplateId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Reference to EmailTemplate for Stage 1'
  },
  // Stage 2 Template ID (Registration)
  stage2TemplateId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Reference to EmailTemplate for Stage 2'
  },
  // Conference Status
  status: {
    type: DataTypes.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
    defaultValue: 'draft'
  },
  // Assignment Information
  assignedTeamLeadId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Team Lead assigned to manage this conference'
  },
  assignedMemberIds: {
    type: DataTypes.JSON,
    defaultValue: () => ([]),
    comment: 'Array of Member IDs assigned to this conference'
  },
  // Performance Metrics
  metrics: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      totalClients: 0,
      abstractsSubmitted: 0,
      registrations: 0,
      emailsSent: 0,
      openRate: 0,
      clickRate: 0,
      conversionRate: 0
    })
  },
  // Revenue Information
  revenue: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      target: 0,
      actual: 0,
      currency: 'USD',
      registrationFee: 0,
      sponsorshipRevenue: 0
    })
  },
  // Conference Settings
  conferenceSettings: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      maxParticipants: 1000,
      registrationRequired: true,
      abstractRequired: true,
      paymentRequired: false,
      earlyBirdDiscount: 0,
      groupDiscount: 0,
      cancellationPolicy: '',
      refundPolicy: ''
    })
  },
  // Location Information
  location: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      address: '',
      city: '',
      state: '',
      country: '',
      postalCode: '',
      coordinates: {
        latitude: null,
        longitude: null
      }
    })
  },
  // Contact Information
  contactInfo: {
    type: DataTypes.JSON,
    defaultValue: () => ({
      phone: '',
      email: '',
      website: '',
      socialMedia: {
        twitter: '',
        linkedin: '',
        facebook: ''
      }
    })
  }
}, { 
  tableName: 'conferences',
  timestamps: true,
  indexes: [
    { fields: ['organizationId'] },
    { fields: ['primaryContactUserId'] },
    { fields: ['assignedTeamLeadId'] },
    { fields: ['status'] },
    { fields: ['startDate'] },
    { fields: ['isActive'] },
    { fields: ['organizationId', 'status'] }
  ]
});

module.exports = Conference;
