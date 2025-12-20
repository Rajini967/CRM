module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');
      if (!tableInfo.stage1Template) {
        await queryInterface.addColumn(
          'conferences',
          'stage1Template',
          {
            type: Sequelize.JSON,
            allowNull: true
          },
          { transaction }
        );
      }
      if (!tableInfo.stage2Template) {
        await queryInterface.addColumn(
          'conferences',
          'stage2Template',
          {
            type: Sequelize.JSON,
            allowNull: true
          },
          { transaction }
        );
      }
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');
      if (tableInfo.stage1Template) {
        await queryInterface.removeColumn('conferences', 'stage1Template', { transaction });
      }
      if (tableInfo.stage2Template) {
        await queryInterface.removeColumn('conferences', 'stage2Template', { transaction });
      }
    });
  }
};
