const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const User = sequelize.define('User', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  email: { 
    type: DataTypes.STRING, 
    allowNull: false,
    validate: {
      isEmail: true
    }
  },
  organizationId: { 
    type: DataTypes.STRING, 
    allowNull: true, 
    comment: 'Organization this user belongs to' 
  },
  password: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false 
  },
  role: { 
    type: DataTypes.ENUM('CEO', 'TeamLead', 'Member'), 
    allowNull: false,
    defaultValue: 'Member'
  },
  roleId: {
    type: DataTypes.STRING,
    comment: 'Reference to Role table for detailed permissions'
  },
  managerId: {
    type: DataTypes.STRING,
    comment: 'Parent user in hierarchy (CEO -> TeamLead -> Member)'
  },
  hierarchyLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 3,
    comment: '1=CEO, 2=TeamLead, 3=Member'
  },
  isActive: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  permissions: { 
    type: DataTypes.JSON, 
    defaultValue: () => ({}),
    comment: 'Custom permissions for this user'
  },
  settings: { 
    type: DataTypes.JSON,
    defaultValue: () => ({
      notifications: {
        email: true,
        dashboard: true,
        reports: true
      },
      preferences: {
        timezone: 'UTC',
        dateFormat: 'MM/DD/YYYY',
        language: 'en'
      },
      dashboard: {
        defaultView: 'overview',
        widgets: ['recentClients', 'emailStats', 'conferenceProgress']
      }
    })
  },
  isOwner: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false, 
    comment: 'Is this user the organization owner' 
  },
  lastLogin: {
    type: DataTypes.DATE
  },
  loginCount: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0 
  },
  lastActivity: { 
    type: DataTypes.DATE 
  },
  profileImage: { 
    type: DataTypes.STRING, 
    comment: 'URL to user profile image' 
  },
  phone: { 
    type: DataTypes.STRING 
  },
  department: { 
    type: DataTypes.STRING 
  },
  position: { 
    type: DataTypes.STRING 
  },
  timezone: { 
    type: DataTypes.STRING, 
    defaultValue: 'UTC' 
  },
  language: { 
    type: DataTypes.STRING, 
    defaultValue: 'en' 
  },
  emailVerified: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  emailVerificationToken: { 
    type: DataTypes.STRING 
  },
  passwordResetToken: { 
    type: DataTypes.STRING 
  },
  passwordResetExpires: { 
    type: DataTypes.DATE 
  },
  twoFactorEnabled: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },
  twoFactorSecret: { 
    type: DataTypes.STRING 
  },
  apiKey: { 
    type: DataTypes.STRING, 
    unique: true 
  },
  apiKeyExpires: { 
    type: DataTypes.DATE 
  }
}, { 
  tableName: 'users',
  timestamps: true,
  indexes: [
    { fields: ['email', 'organizationId'], unique: true },
    { fields: ['organizationId'] },
    { fields: ['role'] },
    { fields: ['managerId'] },
    { fields: ['isActive'] },
    { fields: ['lastLogin'] },
    { fields: ['apiKey'] }
  ]
});

module.exports = User;
