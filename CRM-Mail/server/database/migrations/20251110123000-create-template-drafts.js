'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableExists = await queryInterface
      .describeTable('email_template_drafts')
      .then(() => true)
      .catch(() => false);

    if (!tableExists) {
      await queryInterface.createTable('email_template_drafts', {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4
      },
      name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      stage: {
        type: Sequelize.STRING,
        allowNull: true
      },
      followUpNumber: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1
      },
      subject: {
        type: Sequelize.STRING,
        allowNull: true
      },
      bodyHtml: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      bodyText: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      variables: {
        type: Sequelize.JSON,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSON,
        allowNull: true
      },
      createdBy: {
        type: Sequelize.STRING,
        allowNull: true
      },
      organizationId: {
        type: Sequelize.STRING,
        allowNull: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW')
      }
    });
    }

    const safeAddIndex = async (fields) => {
      try {
        await queryInterface.addIndex('email_template_drafts', fields);
      } catch (error) {
        if (!/already exists/i.test(error.message)) {
          throw error;
        }
      }
    };

    await safeAddIndex(['createdBy']);
    await safeAddIndex(['organizationId']);
    await safeAddIndex(['stage']);
  },

  down: async (queryInterface) => {
    const tableExists = await queryInterface
      .describeTable('email_template_drafts')
      .then(() => true)
      .catch(() => false);

    if (!tableExists) {
      return;
    }

    const safeRemoveIndex = async (fields) => {
      try {
        await queryInterface.removeIndex('email_template_drafts', fields);
      } catch (error) {
        if (!/does not exist/i.test(error.message)) {
          throw error;
        }
      }
    };

    await safeRemoveIndex(['stage']);
    await safeRemoveIndex(['organizationId']);
    await safeRemoveIndex(['createdBy']);
    await queryInterface.dropTable('email_template_drafts');
  }
};

