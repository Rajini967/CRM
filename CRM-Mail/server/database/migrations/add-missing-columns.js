const { DataTypes } = require('sequelize');

async function tableExists(queryInterface, tableName) {
  const tables = await queryInterface.showAllTables();
  if (Array.isArray(tables)) {
    return tables.includes(tableName) || tables.includes(tableName.toLowerCase());
  }
  return false;
}

async function columnExists(queryInterface, tableName, columnName) {
  try {
    const tableInfo = await queryInterface.describeTable(tableName);
    return Boolean(tableInfo && tableInfo[columnName]);
  } catch (error) {
    if (error.name === 'SequelizeDatabaseError') {
      return false;
    }
    throw error;
  }
}

async function addColumnIfMissing(queryInterface, tableName, columnName, columnDefinition, transaction) {
  const exists = await columnExists(queryInterface, tableName, columnName);
  if (exists) {
    console.log(`ℹ️  Column ${tableName}.${columnName} already exists, skipping`);
    return;
  }
  await queryInterface.addColumn(tableName, columnName, columnDefinition, { transaction });
}

async function removeColumnIfExists(queryInterface, tableName, columnName, transaction) {
  const exists = await columnExists(queryInterface, tableName, columnName);
  if (!exists) {
    return;
  }
  await queryInterface.removeColumn(tableName, columnName, { transaction });
}

async function createTableIfMissing(queryInterface, tableName, attributes, options = {}, transaction) {
  const exists = await tableExists(queryInterface, tableName);
  if (exists) {
    console.log(`ℹ️  Table ${tableName} already exists, skipping creation`);
    return;
  }
  await queryInterface.createTable(tableName, attributes, { ...options, transaction });
}

async function dropTableIfExists(queryInterface, tableName, transaction) {
  const exists = await tableExists(queryInterface, tableName);
  if (!exists) {
    return;
  }
  await queryInterface.dropTable(tableName, { transaction });
}

async function addIndexIfMissing(queryInterface, tableName, fields, options = {}, transaction) {
  const currentIndexes = await queryInterface.showIndex(tableName);
  const exists = currentIndexes.some((index) => {
    const indexFields = index.fields.map((field) => field.attribute || field.name);
    return indexFields.length === fields.length && indexFields.every((field, idx) => field === fields[idx]);
  });
  if (exists) {
    console.log(`ℹ️  Index on ${tableName}(${fields.join(',')}) already exists, skipping`);
    return;
  }
  await queryInterface.addIndex(tableName, fields, { ...options, transaction });
}

async function removeIndexIfExists(queryInterface, tableName, fields, transaction) {
  try {
    await queryInterface.removeIndex(tableName, fields, { transaction });
  } catch (error) {
    if (error.name === 'SequelizeDatabaseError') {
      console.log(`ℹ️  Index on ${tableName}(${fields.join(',')}) missing during removal, skipping`);
      return;
    }
    throw error;
  }
}

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🔄 Adding missing columns to database tables...');
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Add missing columns to conferences table
      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'organizationId',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'status',
        {
          type: DataTypes.ENUM('draft', 'active', 'paused', 'completed', 'cancelled'),
          defaultValue: 'draft',
          allowNull: false
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'assignedTeamLeadId',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'assignedMemberIds',
        {
          type: DataTypes.JSON,
          defaultValue: () => ([]),
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'metrics',
        {
          type: DataTypes.JSON,
          defaultValue: () => ({
            totalClients: 0,
            abstractsSubmitted: 0,
            registrations: 0,
            emailsSent: 0,
            openRate: 0,
            clickRate: 0,
            conversionRate: 0
          }),
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'revenue',
        {
          type: DataTypes.JSON,
          defaultValue: () => ({
            target: 0,
            actual: 0,
            currency: 'USD',
            registrationFee: 0,
            sponsorshipRevenue: 0
          }),
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'conferenceSettings',
        {
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
          }),
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'location',
        {
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
          }),
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'conferences',
        'contactInfo',
        {
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
          }),
          allowNull: true
        },
        transaction
      );

      // Add missing columns to clients table
      await addColumnIfMissing(
        queryInterface,
        'clients',
        'organizationId',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'clients',
        'organizationName',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      // Add missing columns to email_templates table
      await addColumnIfMissing(
        queryInterface,
        'email_templates',
        'organizationId',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      // Add missing columns to email_accounts table
      await addColumnIfMissing(
        queryInterface,
        'email_accounts',
        'organizationId',
        {
          type: DataTypes.STRING,
          allowNull: true
        },
        transaction
      );

      await addColumnIfMissing(
        queryInterface,
        'email_accounts',
        'sendPriority',
        {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: 'Lower number = higher priority for outbound sending'
        },
        transaction
      );

      await queryInterface.sequelize.query(
        `
        WITH ranked AS (
          SELECT "id",
                 ROW_NUMBER() OVER (ORDER BY "createdAt") AS priority
          FROM "email_accounts"
        )
        UPDATE "email_accounts" ea
        SET "sendPriority" = ranked.priority
        FROM ranked
        WHERE ranked.id = ea.id
          AND (ea."sendPriority" IS NULL OR ea."sendPriority" = 100)
        `,
        { transaction }
      );

      // Create notifications table
      await createTableIfMissing(
        queryInterface,
        'notifications',
        {
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
        },
        {},
        transaction
      );

      // Create audit_logs table
      await createTableIfMissing(
        queryInterface,
        'audit_logs',
        {
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
        },
        {},
        transaction
      );

      // Add indexes for better performance
      await addIndexIfMissing(queryInterface, 'conferences', ['status'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'conferences', ['assignedTeamLeadId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'conferences', ['organizationId', 'status'], {}, transaction);

      await addIndexIfMissing(queryInterface, 'notifications', ['userId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['type'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['priority'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['isRead'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['createdAt'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['userId', 'isRead'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'notifications', ['userId', 'type'], {}, transaction);

      await addIndexIfMissing(queryInterface, 'audit_logs', ['entityType'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['entityId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['action'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['userId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['organizationId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['severity'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['timestamp'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['entityType', 'entityId'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['userId', 'timestamp'], {}, transaction);
      await addIndexIfMissing(queryInterface, 'audit_logs', ['organizationId', 'timestamp'], {}, transaction);
    });
    console.log('✅ Successfully added missing columns and created new tables');
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 Removing added columns and tables...');
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Remove indexes first
      await removeIndexIfExists(queryInterface, 'conferences', ['status'], transaction);
      await removeIndexIfExists(queryInterface, 'conferences', ['assignedTeamLeadId'], transaction);
      await removeIndexIfExists(queryInterface, 'conferences', ['organizationId', 'status'], transaction);

      // Remove columns from conferences table
      await removeColumnIfExists(queryInterface, 'conferences', 'status', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'assignedTeamLeadId', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'assignedMemberIds', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'metrics', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'revenue', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'conferenceSettings', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'location', transaction);
      await removeColumnIfExists(queryInterface, 'conferences', 'contactInfo', transaction);

      // Remove columns from clients table
      await removeColumnIfExists(queryInterface, 'clients', 'organizationName', transaction);

      // Remove columns from email_templates table
      await removeColumnIfExists(queryInterface, 'email_templates', 'organizationId', transaction);

      // Remove columns from email_accounts table
      await removeColumnIfExists(queryInterface, 'email_accounts', 'organizationId', transaction);

      // Drop tables
      await dropTableIfExists(queryInterface, 'notifications', transaction);
      await dropTableIfExists(queryInterface, 'audit_logs', transaction);
    });
    console.log('✅ Successfully removed added columns and tables');
  }
};
