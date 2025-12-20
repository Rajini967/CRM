const { DataTypes } = require('sequelize');

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.sequelize.transaction(async (t) => {
			const table = await queryInterface.describeTable('clients');

			const columnExists = (column) => Boolean(table && table[column]);

			if (!columnExists('name')) {
				await queryInterface.addColumn('clients', 'name', {
					type: DataTypes.STRING,
					allowNull: true
				}, { transaction: t });
			}

			const hasFirstName = columnExists('firstName');
			const hasLastName = columnExists('lastName');

			if (hasFirstName || hasLastName) {
				let buildNameExpression = '';
				if (hasFirstName && hasLastName) {
					buildNameExpression = `TRIM(
						COALESCE("firstName", '') ||
						CASE
							WHEN COALESCE("firstName", '') <> '' AND COALESCE("lastName", '') <> '' THEN ' '
							ELSE ''
						END ||
						COALESCE("lastName", '')
					)`;
				} else if (hasFirstName) {
					buildNameExpression = `TRIM(COALESCE("firstName", ''))`;
				} else {
					buildNameExpression = `TRIM(COALESCE("lastName", ''))`;
				}

				await queryInterface.sequelize.query(
					`UPDATE "clients"
					 SET "name" = ${buildNameExpression}
					 WHERE ("name" IS NULL OR "name" = '')`,
					{ transaction: t }
				);
			}

			if (columnExists('name')) {
				await queryInterface.changeColumn('clients', 'name', {
					type: DataTypes.STRING,
					allowNull: false,
					defaultValue: ''
				}, { transaction: t });
			}

			try {
				await queryInterface.removeIndex('clients', ['firstName', 'lastName'], { transaction: t });
			} catch {}

			if (hasFirstName) {
				await queryInterface.removeColumn('clients', 'firstName', { transaction: t });
			}
			if (hasLastName) {
				await queryInterface.removeColumn('clients', 'lastName', { transaction: t });
			}

			try {
				await queryInterface.addIndex('clients', ['name'], { transaction: t });
			} catch {}
		});
	},

	down: async (queryInterface, Sequelize) => {
		await queryInterface.sequelize.transaction(async (t) => {
			const table = await queryInterface.describeTable('clients');
			// 1) Re-add firstName/lastName as nullable
			if (!table.firstName) {
				await queryInterface.addColumn('clients', 'firstName', { type: DataTypes.STRING, allowNull: true }, { transaction: t });
			}
			if (!table.lastName) {
				await queryInterface.addColumn('clients', 'lastName', { type: DataTypes.STRING, allowNull: true }, { transaction: t });
			}
			// 2) Split name into first token + remainder
			await queryInterface.sequelize.query(
				`UPDATE clients
				 SET firstName = TRIM(SUBSTRING_INDEX(name, ' ', 1)),
				     lastName = TRIM(SUBSTRING(name, LENGTH(SUBSTRING_INDEX(name, ' ', 1)) + 1))`,
				{ transaction: t }
			);
			// 3) Best-effort index
			try { await queryInterface.addIndex('clients', ['firstName', 'lastName'], { transaction: t }); } catch {}
			// 4) Keep name column (do not drop) to avoid data loss; make it nullable for compatibility
			await queryInterface.changeColumn('clients', 'name', { type: DataTypes.STRING, allowNull: true }, { transaction: t });
		});
	}
};


