const { Sequelize } = require('sequelize');

const ensureEmailAccountOwnershipColumns = async (sequelizeInstance) => {
  if (!sequelizeInstance) {
    console.warn('⚠️  Cannot ensure email account ownership columns without a sequelize instance');
    return;
  }

  const queryInterface = sequelizeInstance.getQueryInterface();

  let tableDefinition;
  try {
    tableDefinition = await queryInterface.describeTable('email_accounts');
  } catch (error) {
    console.warn('⚠️  Could not inspect email_accounts table (it might not exist yet). Skipping ownership column check.');
    return;
  }

  // Add ownerId column if missing
  if (!tableDefinition.ownerId) {
    console.log('🛠️  Adding ownerId column to email_accounts (missing).');
    await queryInterface.addColumn('email_accounts', 'ownerId', {
      type: Sequelize.STRING,
      allowNull: true
    });
  }

  // Add isSystemAccount column if missing
  if (!tableDefinition.isSystemAccount) {
    console.log('🛠️  Adding isSystemAccount column to email_accounts (missing).');
    await queryInterface.addColumn('email_accounts', 'isSystemAccount', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
  }
};

module.exports = { ensureEmailAccountOwnershipColumns };

