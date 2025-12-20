'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'UPDATE "clients" SET "currentStage" = \'stage1\' WHERE "currentStage" = \'initial\'',
        { transaction }
      );

      await queryInterface.sequelize.query(
        'UPDATE "followup_jobs" SET "stage" = \'abstract_submission\' WHERE "stage" = \'initial\'',
        { transaction }
      );

      await queryInterface.sequelize.query(
        'UPDATE "email_templates" SET "stage" = \'abstract_submission\' WHERE "stage" = \'initial_invitation\'',
        { transaction }
      );

      const dialect = queryInterface.sequelize.getDialect();

      const tableInfo = await queryInterface.describeTable('conferences');
      if (tableInfo.initialTemplateId) {
        if (dialect === 'postgres') {
          await queryInterface.sequelize.query(
            'ALTER TABLE "conferences" DROP CONSTRAINT IF EXISTS "conferences_initialTemplateId_fkey";',
            { transaction }
          );
        }
        await queryInterface.removeColumn('conferences', 'initialTemplateId', { transaction });
      }

      if (dialect === 'postgres') {
        await queryInterface.sequelize.query('ALTER TABLE "clients" ALTER COLUMN "currentStage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_clients_currentStage" RENAME TO "enum_clients_currentStage_old";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_clients_currentStage\" AS ENUM ('stage1','stage2','completed');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "clients" ALTER COLUMN "currentStage" TYPE "enum_clients_currentStage" USING "currentStage"::text::"enum_clients_currentStage";', { transaction });
        await queryInterface.sequelize.query("ALTER TABLE \"clients\" ALTER COLUMN \"currentStage\" SET DEFAULT 'stage1';", { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_clients_currentStage_old";', { transaction });

        await queryInterface.sequelize.query('ALTER TABLE "followup_jobs" ALTER COLUMN "stage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_followup_jobs_stage" RENAME TO "enum_followup_jobs_stage_old";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_followup_jobs_stage\" AS ENUM ('stage1','stage2','abstract_submission','registration');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "followup_jobs" ALTER COLUMN "stage" TYPE "enum_followup_jobs_stage" USING "stage"::text::"enum_followup_jobs_stage";', { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_followup_jobs_stage_old";', { transaction });

        await queryInterface.sequelize.query('ALTER TABLE "email_templates" ALTER COLUMN "stage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_email_templates_stage" RENAME TO "enum_email_templates_stage_old";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_email_templates_stage\" AS ENUM ('abstract_submission','registration');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "email_templates" ALTER COLUMN "stage" TYPE "enum_email_templates_stage" USING "stage"::text::"enum_email_templates_stage";', { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_email_templates_stage_old";', { transaction });
      } else {
        await queryInterface.changeColumn(
          'clients',
          'currentStage',
          {
            type: Sequelize.ENUM('stage1', 'stage2', 'completed'),
            allowNull: false,
            defaultValue: 'stage1'
          },
          { transaction }
        );

        await queryInterface.changeColumn(
          'followup_jobs',
          'stage',
          {
            type: Sequelize.ENUM('stage1', 'stage2', 'abstract_submission', 'registration'),
            allowNull: false
          },
          { transaction }
        );

        await queryInterface.changeColumn(
          'email_templates',
          'stage',
          {
            type: Sequelize.ENUM('abstract_submission', 'registration'),
            allowNull: false
          },
          { transaction }
        );
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const tableInfo = await queryInterface.describeTable('conferences');
      if (!tableInfo.initialTemplateId) {
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
      }

      await queryInterface.sequelize.query(
        'UPDATE "clients" SET "currentStage" = \'initial\' WHERE "currentStage" = \'stage1\'',
        { transaction }
      );

      await queryInterface.sequelize.query(
        'UPDATE "followup_jobs" SET "stage" = \'initial\' WHERE "stage" = \'abstract_submission\'',
        { transaction }
      );

      await queryInterface.sequelize.query(
        'UPDATE "email_templates" SET "stage" = \'initial_invitation\' WHERE "stage" = \'abstract_submission\'',
        { transaction }
      );

      const dialect = queryInterface.sequelize.getDialect();

      if (dialect === 'postgres') {
        await queryInterface.sequelize.query('ALTER TABLE "clients" ALTER COLUMN "currentStage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_clients_currentStage" RENAME TO "enum_clients_currentStage_new";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_clients_currentStage\" AS ENUM ('initial','stage1','stage2','completed');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "clients" ALTER COLUMN "currentStage" TYPE "enum_clients_currentStage" USING "currentStage"::text::"enum_clients_currentStage";', { transaction });
        await queryInterface.sequelize.query("ALTER TABLE \"clients\" ALTER COLUMN \"currentStage\" SET DEFAULT 'initial';", { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_clients_currentStage_new";', { transaction });

        await queryInterface.sequelize.query('ALTER TABLE "followup_jobs" ALTER COLUMN "stage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_followup_jobs_stage" RENAME TO "enum_followup_jobs_stage_new";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_followup_jobs_stage\" AS ENUM ('initial','stage1','stage2','abstract_submission','registration');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "followup_jobs" ALTER COLUMN "stage" TYPE "enum_followup_jobs_stage" USING "stage"::text::"enum_followup_jobs_stage";', { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_followup_jobs_stage_new";', { transaction });

        await queryInterface.sequelize.query('ALTER TABLE "email_templates" ALTER COLUMN "stage" DROP DEFAULT;', { transaction });
        await queryInterface.sequelize.query('ALTER TYPE "enum_email_templates_stage" RENAME TO "enum_email_templates_stage_new";', { transaction });
        await queryInterface.sequelize.query("CREATE TYPE \"enum_email_templates_stage\" AS ENUM ('initial_invitation','abstract_submission','registration');", { transaction });
        await queryInterface.sequelize.query('ALTER TABLE "email_templates" ALTER COLUMN "stage" TYPE "enum_email_templates_stage" USING "stage"::text::"enum_email_templates_stage";', { transaction });
        await queryInterface.sequelize.query('DROP TYPE "enum_email_templates_stage_new";', { transaction });
      } else {
        await queryInterface.changeColumn(
          'clients',
          'currentStage',
          {
            type: Sequelize.ENUM('initial', 'stage1', 'stage2', 'completed'),
            allowNull: false,
            defaultValue: 'initial'
          },
          { transaction }
        );

        await queryInterface.changeColumn(
          'followup_jobs',
          'stage',
          {
            type: Sequelize.ENUM('initial', 'stage1', 'stage2', 'abstract_submission', 'registration'),
            allowNull: false
          },
          { transaction }
        );

        await queryInterface.changeColumn(
          'email_templates',
          'stage',
          {
            type: Sequelize.ENUM('initial_invitation', 'abstract_submission', 'registration'),
            allowNull: false
          },
          { transaction }
        );
      }
    });
  }
};

