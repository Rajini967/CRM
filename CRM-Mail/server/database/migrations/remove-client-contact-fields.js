const { DataTypes } = require('sequelize');

module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Safely remove columns if they exist; ignore if already absent
		const dropColumnIfExists = async (table, column) => {
			try {
				await queryInterface.removeColumn(table, column);
				console.log(`✅ Removed column ${table}.${column}`);
			} catch (err) {
				console.log(`ℹ️ Skipped removing ${table}.${column}: ${err.message}`);
			}
		};

		// Attempt to drop any index involving organizationName
		const dropIndexIfExists = async (table, fieldsOrName) => {
			try {
				await queryInterface.removeIndex(table, fieldsOrName);
				console.log(`✅ Removed index on ${table} (${fieldsOrName})`);
			} catch (err) {
				console.log(`ℹ️ Skipped removing index ${fieldsOrName} on ${table}: ${err.message}`);
			}
		};

		await dropColumnIfExists('clients', 'phone');
		await dropColumnIfExists('clients', 'organizationName');
		await dropColumnIfExists('clients', 'position');

		// Try by fields array first; if not present, it will be skipped
		await dropIndexIfExists('clients', ['organizationName']);
		// Also try a common auto-generated name just in case
		await dropIndexIfExists('clients', 'clients_organizationName');
	},

	down: async (queryInterface, Sequelize) => {
		// Re-add columns as nullable to allow rollback without data constraints
		const addColumnIfMissing = async (table, column, spec) => {
			try {
				await queryInterface.addColumn(table, column, spec);
				console.log(`✅ Added column ${table}.${column}`);
			} catch (err) {
				console.log(`ℹ️ Skipped adding ${table}.${column}: ${err.message}`);
			}
		};

		await addColumnIfMissing('clients', 'phone', { type: DataTypes.STRING, allowNull: true });
		await addColumnIfMissing('clients', 'organizationName', { type: DataTypes.STRING, allowNull: true });
		await addColumnIfMissing('clients', 'position', { type: DataTypes.STRING, allowNull: true });

		// Recreate simple index for organizationName
		try {
			await queryInterface.addIndex('clients', ['organizationName']);
			console.log('✅ Recreated index on clients.organizationName');
		} catch (err) {
			console.log(`ℹ️ Skipped recreating index on clients.organizationName: ${err.message}`);
		}
	}
};


