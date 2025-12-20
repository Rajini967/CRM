const { DataTypes } = require('sequelize');

module.exports = {
  up: async (queryInterface) => {
    try {
      console.log('🔄 Adding shortName column to conferences table...');

      await queryInterface.addColumn('conferences', 'shortName', {
        type: DataTypes.STRING(100),
        allowNull: true,
        defaultValue: null,
        comment: 'Short abbreviation for the conference name'
      });

      console.log('✅ shortName column added successfully');
    } catch (error) {
      console.error('❌ Failed to add shortName column:', error);
      throw error;
    }
  },

  down: async (queryInterface) => {
    try {
      console.log('🔄 Removing shortName column from conferences table...');

      await queryInterface.removeColumn('conferences', 'shortName');

      console.log('✅ shortName column removed successfully');
    } catch (error) {
      console.error('❌ Failed to remove shortName column:', error);
      throw error;
    }
  }
};

