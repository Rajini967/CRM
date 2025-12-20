module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');
      if (tableInfo.initialTemplateId) {
        console.log('✅ initialTemplateId already exists on conferences, skipping');
        return;
      }

      await queryInterface.addColumn(
        'conferences',
        'initialTemplateId',
        {
          type: Sequelize.STRING,
          allowNull: true,
          comment: 'Reference to EmailTemplate for Initial Invitation'
        },
        { transaction }
      );
    });
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      try {
        const tableInfo = await queryInterface.describeTable('conferences');
        if (!tableInfo.initialTemplateId) {
          return;
        }
        await queryInterface.removeColumn('conferences', 'initialTemplateId', { transaction });
      } catch (error) {
        if (error.name === 'SequelizeDatabaseError' && /does not exist/i.test(error.message)) {
          return;
        }
        throw error;
      }
    });
  }
};
