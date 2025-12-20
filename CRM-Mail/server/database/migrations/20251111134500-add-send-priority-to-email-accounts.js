'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'email_accounts',
        'sendPriority',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100
        },
        { transaction }
      );

      const accounts = await queryInterface.sequelize.query(
        'SELECT "id" FROM "email_accounts" ORDER BY "createdAt" ASC',
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      let priority = 1;
      for (const account of accounts) {
        await queryInterface.sequelize.query(
          'UPDATE "email_accounts" SET "sendPriority" = :priority WHERE "id" = :id',
          {
            transaction,
            replacements: {
              priority,
              id: account.id
            }
          }
        );
        priority += 1;
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeColumn('email_accounts', 'sendPriority', { transaction });
    });
  }
};


