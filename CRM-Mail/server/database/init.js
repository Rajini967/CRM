const { sequelize, User, Role, Conference, Client, Email, EmailTemplate, FollowUpJob, EmailLog, EmailAccount, EmailFolder, EmailThread, Campaign } = require('../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { ensureEmailAccountOwnershipColumns } = require('./ensureEmailAccountOwnershipColumns');

const initDatabase = async () => {
  try {
    // Test connection
    await sequelize.authenticate();
    console.log('✅ MySQL database connection established successfully.');
    console.log('📊 Database: crmdb');
    console.log('👤 User: root');

    // Ensure legacy databases have the ownership columns before syncing models
    await ensureEmailAccountOwnershipColumns(sequelize);

    // Sync all models (create tables if they don't exist, preserve existing data)
    await sequelize.sync({ force: false }); // Set to false to preserve existing data
    console.log('✅ Database synchronized successfully.');

    // Seed initial data
    await seedInitialData();
    console.log('✅ Initial data seeded successfully.');

    return true;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};

const seedInitialData = async () => {
  try {
    // Create default users
    const existingUser = await User.findOne({ where: { email: 'admin@crm.com' } });
    if (!existingUser) {
      await User.create({
        id: '1',
        email: 'admin@crm.com',
        password: bcrypt.hashSync('admin123', 10),
        name: 'Admin User',
        role: 'CEO',
        hierarchyLevel: 1,
        isActive: true
      });
      console.log('👤 Created admin user');
    }

    const existingTeamLead = await User.findOne({ where: { email: 'teamlead@crm.com' } });
    if (!existingTeamLead) {
      await User.create({
        id: '2',
        email: 'teamlead@crm.com',
        password: bcrypt.hashSync('teamlead123', 10),
        name: 'Team Lead User',
        role: 'TeamLead',
        hierarchyLevel: 2,
        isActive: true
      });
      console.log('👤 Created team lead user');
    }

    const existingMember = await User.findOne({ where: { email: 'member@crm.com' } });
    if (!existingMember) {
      await User.create({
        id: '3',
        email: 'member@crm.com',
        password: bcrypt.hashSync('member123', 10),
        name: 'Member User',
        role: 'Member',
        hierarchyLevel: 3,
        managerId: '2',
        isActive: true
      });
      console.log('👤 Created member user');
    }

    // Create default conference
    const existingConference = await Conference.findOne({ where: { id: '1' } });
    if (!existingConference) {
      await Conference.create({
        id: '1',
        name: 'Tech Conference 2024',
        venue: 'Convention Center',
        startDate: new Date('2024-06-15'),
        endDate: new Date('2024-06-17'),
        primaryContactUserId: '1',
        currency: 'USD',
        abstractDeadline: new Date('2024-05-15'),
        registrationDeadline: new Date('2024-06-01'),
        description: 'Annual Technology Conference featuring the latest innovations',
        website: 'https://techconf2024.com',
        settings: {
          followup_intervals: {
            "Stage1": 7,
            "Stage2": 3
          },
          max_attempts: {
            "Stage1": 6,
            "Stage2": 6
          },
          skip_weekends: true,
          smtp_default_id: null,
          timezone: "UTC",
          working_hours: {
            start: "09:00",
            end: "17:00"
          }
        },
        isActive: true
      });
      console.log('🏢 Created default conference');
    }

    // Email templates are now managed through the UI
    // No demo templates are created by default
    console.log('📧 Email templates will be created through the UI');

    console.log('🎉 Database initialization completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding initial data:', error);
    throw error;
  }
};

module.exports = { initDatabase };
