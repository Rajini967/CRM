const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ClientNote = sequelize.define('ClientNote', {
  id: { 
    type: DataTypes.STRING, 
    primaryKey: true,
    defaultValue: () => require('uuid').v4()
  },
  clientId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  authorId: { 
    type: DataTypes.STRING, 
    allowNull: false
  },
  content: { 
    type: DataTypes.TEXT, 
    allowNull: false
  },
  type: { 
    type: DataTypes.ENUM('note', 'activity', 'system'), 
    defaultValue: 'note'
  },
  isPrivate: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  },
  mentions: { 
    type: DataTypes.JSON, 
    defaultValue: () => ([])
  },
  tags: { 
    type: DataTypes.JSON, 
    defaultValue: () => ([])
  },
  attachments: { 
    type: DataTypes.JSON, 
    defaultValue: () => ([])
  },
  priority: { 
    type: DataTypes.ENUM('low', 'medium', 'high'), 
    defaultValue: 'medium'
  },
  isPinned: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  },
  editedAt: { 
    type: DataTypes.DATE
  },
  editedBy: { 
    type: DataTypes.STRING
  },
  isDeleted: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false
  }
}, { 
  tableName: 'client_notes',
  timestamps: true,
  indexes: [
    { fields: ['clientId'] },
    { fields: ['authorId'] },
    { fields: ['type'] },
    { fields: ['isPrivate'] },
    { fields: ['isPinned'] },
    { fields: ['createdAt'] },
    { fields: ['clientId', 'type'] },
    { fields: ['clientId', 'isDeleted'] }
  ]
});

module.exports = ClientNote;

