const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const SearchPreset = sequelize.define('SearchPreset', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  userId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  name: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  description: { 
    type: DataTypes.TEXT,
    allowNull: true
  },
  entityType: { 
    type: DataTypes.ENUM('clients', 'conferences', 'emails', 'users', 'notes', 'tasks', 'global'), 
    allowNull: false
  },
  query: { 
    type: DataTypes.STRING,
    allowNull: true
  },
  filters: { 
    type: DataTypes.JSON, 
    defaultValue: () => ({})
  },
  sortBy: { 
    type: DataTypes.STRING, 
    defaultValue: 'createdAt'
  },
  sortOrder: { 
    type: DataTypes.ENUM('asc', 'desc'), 
    defaultValue: 'desc'
  },
  limit: { 
    type: DataTypes.INTEGER, 
    defaultValue: 50
  },
  isPublic: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  },
  organizationId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  usageCount: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0
  },
  lastUsedAt: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  isDeleted: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  }
}, { 
  tableName: 'search_presets',
  timestamps: true,
  indexes: [
    { fields: ['userId'] },
    { fields: ['organizationId'] },
    { fields: ['entityType'] },
    { fields: ['isPublic'] },
    { fields: ['isDeleted'] },
    { fields: ['userId', 'entityType'] },
    { fields: ['organizationId', 'isPublic'] }
  ]
});

module.exports = SearchPreset;
