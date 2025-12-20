module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');

      if (tableInfo.stage1Template) {
        await queryInterface.removeColumn('conferences', 'stage1Template', { transaction });
      }
      if (tableInfo.stage2Template) {
        await queryInterface.removeColumn('conferences', 'stage2Template', { transaction });
      }

      if (!tableInfo.stage1TemplateId) {
        await queryInterface.addColumn(
          'conferences',
          'stage1TemplateId',
          {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Reference to EmailTemplate for Stage 1'
          },
          { transaction }
        );
      }

      if (!tableInfo.stage2TemplateId) {
        await queryInterface.addColumn(
          'conferences',
          'stage2TemplateId',
          {
            type: Sequelize.STRING,
            allowNull: true,
            comment: 'Reference to EmailTemplate for Stage 2'
          },
          { transaction }
        );
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');

      if (tableInfo.stage1TemplateId) {
        await queryInterface.removeColumn('conferences', 'stage1TemplateId', { transaction });
      }
      if (tableInfo.stage2TemplateId) {
        await queryInterface.removeColumn('conferences', 'stage2TemplateId', { transaction });
      }

      const refreshed = await queryInterface.describeTable('conferences');

      if (!refreshed.stage1Template) {
        await queryInterface.addColumn(
          'conferences',
          'stage1Template',
          { type: Sequelize.JSON, allowNull: true },
          { transaction }
        );
      }
      if (!refreshed.stage2Template) {
        await queryInterface.addColumn(
          'conferences',
          'stage2Template',
          { type: Sequelize.JSON, allowNull: true },
          { transaction }
        );
      }
    });
  }
};
