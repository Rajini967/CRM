const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Organization = sequelize.define('Organization', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  domain: { 
    type: DataTypes.STRING, 
    unique: true,
    allowNull: false 
  },
  description: { 
    type: DataTypes.TEXT 
  },
  settings: { 
    type: DataTypes.JSON,
    defaultValue: () => ({
      branding: {
        logo: null,
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF'
      },
      email: {
        fromName: 'Conference CRM',
        fromEmail: 'noreply@conference-crm.com'
      },
      features: {
        maxUsers: 10,
        maxConferences: 5,
        maxClients: 1000,
        maxEmailsPerDay: 1000
      },
      compliance: {
        gdprEnabled: true,
        canSpamCompliant: true,
        unsubscribeRequired: true
      }
    })
  },
  billing: { 
    type: DataTypes.JSON,
    defaultValue: () => ({
      plan: 'starter',
      status: 'active',
      subscriptionId: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      usage: {
        users: 0,
        conferences: 0,
        clients: 0,
        emailsSent: 0
      }
    })
  },
  status: { 
    type: DataTypes.ENUM('active', 'suspended', 'cancelled'), 
    defaultValue: 'active' 
  },
  ownerId: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  subscriptionTier: { 
    type: DataTypes.ENUM('starter', 'professional', 'enterprise'), 
    defaultValue: 'starter' 
  },
  limits: { 
    type: DataTypes.JSON,
    defaultValue: () => ({
      maxUsers: 10,
      maxConferences: 5,
      maxClients: 1000,
      maxEmailsPerDay: 1000,
      maxTemplates: 50,
      maxSmtpAccounts: 3
    })
  },
  usage: { 
    type: DataTypes.JSON,
    defaultValue: () => ({
      users: 0,
      conferences: 0,
      clients: 0,
      emailsSent: 0,
      templates: 0,
      smtpAccounts: 0
    })
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  trialEndsAt: { 
    type: DataTypes.DATE 
  },
  createdAt: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  updatedAt: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  }
}, { 
  tableName: 'organizations',
  timestamps: true,
  indexes: [
    { fields: ['domain'] },
    { fields: ['status'] },
    { fields: ['ownerId'] },
    { fields: ['subscriptionTier'] },
    { fields: ['isActive'] }
  ]
});

module.exports = Organization;
