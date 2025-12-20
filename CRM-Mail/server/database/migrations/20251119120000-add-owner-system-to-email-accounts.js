/* eslint-disable no-console */
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableDefinition = await queryInterface.describeTable('email_accounts');

      if (!tableDefinition.ownerId) {
        await queryInterface.addColumn(
          'email_accounts',
          'ownerId',
          {
            type: Sequelize.STRING,
            allowNull: true
          },
          { transaction }
        );
        console.log('✅ Added ownerId to email_accounts');
      }

      if (!tableDefinition.isSystemAccount) {
        await queryInterface.addColumn(
          'email_accounts',
          'isSystemAccount',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false
          },
          { transaction }
        );
        console.log('✅ Added isSystemAccount to email_accounts');
      }

      // Backfill ownerId with createdBy for existing rows
      await queryInterface.sequelize.query(
        `
          UPDATE "email_accounts"
          SET "ownerId" = COALESCE("ownerId", "createdBy")
          WHERE "ownerId" IS NULL
        `,
        { transaction }
      );

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Failed to add ownerId/isSystemAccount to email_accounts:', error);
      throw error;
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      const tableDefinition = await queryInterface.describeTable('email_accounts');

      if (tableDefinition.isSystemAccount) {
        await queryInterface.removeColumn('email_accounts', 'isSystemAccount', { transaction });
        console.log('🗑️ Removed isSystemAccount from email_accounts');
      }

      if (tableDefinition.ownerId) {
        await queryInterface.removeColumn('email_accounts', 'ownerId', { transaction });
        console.log('🗑️ Removed ownerId from email_accounts');
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Failed to rollback ownerId/isSystemAccount from email_accounts:', error);
      throw error;
    }
  }
};

