'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const ensureColumn = async (columnName) => {
        try {
          const tableInfo = await queryInterface.describeTable('clients');
          if (tableInfo[columnName]) {
            return;
          }
        } catch (error) {
          // describeTable may fail if table doesn't exist, rethrow
          throw error;
        }

        try {
          await queryInterface.addColumn(
            'clients',
            columnName,
            {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0
            },
            { transaction }
          );
        } catch (error) {
          if (
            error.name === 'SequelizeDatabaseError' &&
            error.original &&
            (error.original.code === '42701' || /already exists/i.test(error.original.message))
          ) {
            return;
          }
          throw error;
        }
      };

      await ensureColumn('manualStage1Count');
      await ensureColumn('manualStage2Count');

    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const dropColumnIfExists = async (columnName) => {
        try {
          const tableInfo = await queryInterface.describeTable('clients');
          if (!tableInfo[columnName]) {
            return;
          }
        } catch (error) {
          return;
        }

        try {
          await queryInterface.removeColumn('clients', columnName, { transaction });
        } catch (error) {
          if (
            error.name === 'SequelizeDatabaseError' &&
            error.original &&
            /does not exist/i.test(error.original.message)
          ) {
            return;
          }
          throw error;
        }
      };

      await dropColumnIfExists('manualStage1Count');
      await dropColumnIfExists('manualStage2Count');
    });
  }
};

