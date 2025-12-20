const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    try {
      console.log('🔄 Safely adding missing columns to database tables...');

      // Helper function to check if column exists
      const columnExists = async (tableName, columnName) => {
        try {
          const [results] = await queryInterface.sequelize.query(
            `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = '${columnName}'`
          );
          return results.length > 0;
        } catch (error) {
          return false;
        }
      };

      // Helper function to check if table exists
      const tableExists = async (tableName) => {
        try {
          const [results] = await queryInterface.sequelize.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_NAME = '${tableName}'`
          );
          return results.length > 0;
        } catch (error) {
          return false;
        }
      };

      // Add organizationId to conferences if it doesn't exist
      if (!(await columnExists('conferences', 'organizationId'))) {
        await queryInterface.addColumn('conferences', 'organizationId', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('✅ Added organizationId to conferences');
      }

      // Add status to conferences if it doesn't exist
      if (!(await columnExists('conferences', 'status'))) {
        await queryInterface.addColumn('conferences', 'status', {
          type: DataTypes.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
          defaultValue: 'draft',
          allowNull: false
        });
        console.log('✅ Added status to conferences');
      }

      // Add other conference columns
      const conferenceColumns = [
        { name: 'assignedTeamLeadId', type: DataTypes.STRING },
        { name: 'assignedMemberIds', type: DataTypes.JSON },
        { name: 'metrics', type: DataTypes.JSON },
        { name: 'revenue', type: DataTypes.JSON },
        { name: 'conferenceSettings', type: DataTypes.JSON },
        { name: 'location', type: DataTypes.JSON },
        { name: 'contactInfo', type: DataTypes.JSON }
      ];

      for (const column of conferenceColumns) {
        if (!(await columnExists('conferences', column.name))) {
          await queryInterface.addColumn('conferences', column.name, {
            type: column.type,
            allowNull: true
          });
          console.log(`✅ Added ${column.name} to conferences`);
        }
      }

      // Add organizationId to clients if it doesn't exist
      if (!(await columnExists('clients', 'organizationId'))) {
        await queryInterface.addColumn('clients', 'organizationId', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('✅ Added organizationId to clients');
      }

      // Add organizationName to clients if it doesn't exist
      if (!(await columnExists('clients', 'organizationName'))) {
        await queryInterface.addColumn('clients', 'organizationName', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('✅ Added organizationName to clients');
      }

      // Add organizationId to email_templates if it doesn't exist
      if (!(await columnExists('email_templates', 'organizationId'))) {
        await queryInterface.addColumn('email_templates', 'organizationId', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('✅ Added organizationId to email_templates');
      }

      // Add organizationId to email_accounts if it doesn't exist
      if (!(await columnExists('email_accounts', 'organizationId'))) {
        await queryInterface.addColumn('email_accounts', 'organizationId', {
          type: DataTypes.STRING,
          allowNull: true
        });
        console.log('✅ Added organizationId to email_accounts');
      }

      // Create notifications table if it doesn't exist
      if (!(await tableExists('notifications'))) {
        await queryInterface.createTable('notifications', {
          id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
          },
          userId: {
            type: DataTypes.STRING,
            allowNull: false
          },
          type: {
            type: DataTypes.ENUM(
              'email_sent',
              'email_bounced',
              'client_added',
              'client_updated',
              'conference_created',
              'follow_up_completed',
              'system_alert',
              'user_activity'
            ),
            allowNull: false
          },
          title: {
            type: DataTypes.STRING,
            allowNull: false
          },
          message: {
            type: DataTypes.TEXT,
            allowNull: false
          },
          data: {
            type: DataTypes.JSON,
            defaultValue: () => ({})
          },
          priority: {
            type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
            defaultValue: 'medium'
          },
          isRead: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          readAt: {
            type: DataTypes.DATE,
            allowNull: true
          },
          sendEmail: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          emailSent: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
          },
          emailSentAt: {
            type: DataTypes.DATE,
            allowNull: true
          },
          isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW
          }
        });
        console.log('✅ Created notifications table');
      }

      // Create audit_logs table if it doesn't exist
      if (!(await tableExists('audit_logs'))) {
        await queryInterface.createTable('audit_logs', {
          id: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false
          },
          entityType: {
            type: DataTypes.ENUM(
              'user',
              'client',
              'conference',
              'email',
              'template',
              'organization',
              'system'
            ),
            allowNull: false
          },
          entityId: {
            type: DataTypes.STRING,
            allowNull: false
          },
          action: {
            type: DataTypes.STRING,
            allowNull: false
          },
          details: {
            type: DataTypes.JSON,
            defaultValue: () => ({})
          },
          userId: {
            type: DataTypes.STRING,
            allowNull: true
          },
          organizationId: {
            type: DataTypes.STRING,
            allowNull: true
          },
          ipAddress: {
            type: DataTypes.STRING,
            allowNull: true
          },
          userAgent: {
            type: DataTypes.STRING,
            allowNull: true
          },
          severity: {
            type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
            defaultValue: 'medium'
          },
          timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW
          },
          isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true
          }
        });
        console.log('✅ Created audit_logs table');
      }

      // Add indexes safely
      try {
        await queryInterface.addIndex('conferences', ['status']);
        console.log('✅ Added status index to conferences');
      } catch (error) {
        console.log('⚠️ Status index already exists on conferences');
      }

      try {
        await queryInterface.addIndex('conferences', ['assignedTeamLeadId']);
        console.log('✅ Added assignedTeamLeadId index to conferences');
      } catch (error) {
        console.log('⚠️ assignedTeamLeadId index already exists on conferences');
      }

      try {
        await queryInterface.addIndex('conferences', ['organizationId', 'status']);
        console.log('✅ Added organizationId,status index to conferences');
      } catch (error) {
        console.log('⚠️ organizationId,status index already exists on conferences');
      }

      console.log('✅ Migration completed successfully');
    } catch (error) {
      console.error('❌ Error in migration:', error);
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    try {
      console.log('🔄 Rolling back migration...');
      
      // Remove indexes
      try {
        await queryInterface.removeIndex('conferences', ['status']);
      } catch (error) {
        console.log('⚠️ Status index not found on conferences');
      }

      try {
        await queryInterface.removeIndex('conferences', ['assignedTeamLeadId']);
      } catch (error) {
        console.log('⚠️ assignedTeamLeadId index not found on conferences');
      }

      try {
        await queryInterface.removeIndex('conferences', ['organizationId', 'status']);
      } catch (error) {
        console.log('⚠️ organizationId,status index not found on conferences');
      }

      // Remove columns
      const columnsToRemove = [
        'status', 'assignedTeamLeadId', 'assignedMemberIds', 'metrics', 
        'revenue', 'conferenceSettings', 'location', 'contactInfo', 'organizationId'
      ];

      for (const column of columnsToRemove) {
        try {
          await queryInterface.removeColumn('conferences', column);
          console.log(`✅ Removed ${column} from conferences`);
        } catch (error) {
          console.log(`⚠️ Column ${column} not found on conferences`);
        }
      }

      try {
        await queryInterface.removeColumn('clients', 'organizationId');
        console.log('✅ Removed organizationId from clients');
      } catch (error) {
        console.log('⚠️ organizationId not found on clients');
      }

      try {
        await queryInterface.removeColumn('clients', 'organizationName');
        console.log('✅ Removed organizationName from clients');
      } catch (error) {
        console.log('⚠️ organizationName not found on clients');
      }

      try {
        await queryInterface.removeColumn('email_templates', 'organizationId');
        console.log('✅ Removed organizationId from email_templates');
      } catch (error) {
        console.log('⚠️ organizationId not found on email_templates');
      }

      try {
        await queryInterface.removeColumn('email_accounts', 'organizationId');
        console.log('✅ Removed organizationId from email_accounts');
      } catch (error) {
        console.log('⚠️ organizationId not found on email_accounts');
      }

      // Drop tables
      try {
        await queryInterface.dropTable('notifications');
        console.log('✅ Dropped notifications table');
      } catch (error) {
        console.log('⚠️ notifications table not found');
      }

      try {
        await queryInterface.dropTable('audit_logs');
        console.log('✅ Dropped audit_logs table');
      } catch (error) {
        console.log('⚠️ audit_logs table not found');
      }

      console.log('✅ Rollback completed');
    } catch (error) {
      console.error('❌ Error in rollback:', error);
      throw error;
    }
  }
};
