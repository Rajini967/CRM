const { sequelize, User, Role, Conference, Client, Email, EmailTemplate, FollowUpJob, EmailLog, EmailAccount, EmailFolder, EmailThread, Campaign, Organization } = require('../models');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seedCleanData = async () => {
  try {
    console.log('🌱 Starting clean data seeding...');

    // 1. Create Roles
    const ceoRole = await Role.findOrCreate({
      where: { name: 'CEO' },
      defaults: {
        id: uuidv4(),
        name: 'CEO',
        displayName: 'Chief Executive Officer',
        description: 'Full system access and management',
        permissions: {
          users: ['create', 'read', 'update', 'delete'],
          conferences: ['create', 'read', 'update', 'delete'],
          clients: ['create', 'read', 'update', 'delete'],
          campaigns: ['create', 'read', 'update', 'delete'],
          templates: ['create', 'read', 'update', 'delete'],
          smtp: ['create', 'read', 'update', 'delete'],
          reports: ['read']
        },
        level: 1,
        isActive: true
      }
    });

    const teamLeadRole = await Role.findOrCreate({
      where: { name: 'TeamLead' },
      defaults: {
        id: uuidv4(),
        name: 'TeamLead',
        displayName: 'Team Lead',
        description: 'Manage team members and assigned clients',
        permissions: {
          users: ['read'],
          conferences: ['read'],
          clients: ['create', 'read', 'update'],
          campaigns: ['create', 'read', 'update'],
          templates: ['create', 'read', 'update'],
          smtp: ['read'],
          reports: ['read']
        },
        level: 2,
        isActive: true
      }
    });

    const memberRole = await Role.findOrCreate({
      where: { name: 'Member' },
      defaults: {
        id: uuidv4(),
        name: 'Member',
        displayName: 'Team Member',
        description: 'Basic access to assigned clients and tasks',
        permissions: {
          users: [],
          conferences: ['read'],
          clients: ['read', 'update'],
          campaigns: ['read'],
          templates: ['read'],
          smtp: [],
          reports: []
        },
        level: 3,
        isActive: true
      }
    });

    // 2. Create Default Organization first (with temporary ownerId)
    const tempOrgId = uuidv4();
    const defaultOrg = await Organization.findOrCreate({
      where: { domain: 'crm.local' },
      defaults: {
        id: tempOrgId,
        name: 'Default Organization',
        domain: 'crm.local',
        description: 'Default organization for CRM system',
        status: 'active',
        ownerId: tempOrgId, // Temporary self-reference
        subscriptionTier: 'enterprise',
        isActive: true
      }
    });

    // 3. Create Admin User with organizationId
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminUser = await User.findOrCreate({
      where: { email: 'admin@crm.com' },
      defaults: {
        id: uuidv4(),
        name: 'System Administrator',
        email: 'admin@crm.com',
        organizationId: defaultOrg[0].id,
        password: hashedPassword,
        role: 'CEO',
        roleId: ceoRole[0].id,
        hierarchyLevel: 1,
        isActive: true
      }
    });

    // Update organization with correct owner
    await defaultOrg[0].update({ ownerId: adminUser[0].id });

    // 3. Create Default Email Account
    const defaultEmailAccount = await EmailAccount.findOrCreate({
      where: { email: 'admin@crm.com' },
      defaults: {
        id: uuidv4(),
        name: 'Default SMTP Account',
        email: 'admin@crm.com',
        type: 'both',
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        smtpUsername: 'admin@crm.com',
        smtpPassword: 'your-app-password', // User needs to update this
        smtpSecure: true,
        smtpAuth: true,
        imapHost: 'imap.gmail.com',
        imapPort: 993,
        imapUsername: 'admin@crm.com',
        imapPassword: 'your-app-password', // User needs to update this
        imapSecure: true,
        isActive: true,
        isDefault: true,
        createdBy: adminUser[0].id,
        syncStatus: 'disconnected',
        syncInterval: 300,
        maxEmailsPerSync: 100
      }
    });

    console.log('✅ Clean data seeding completed successfully');
    console.log('👤 Admin user created: admin@crm.com / admin123');
    console.log('🔑 Roles created: CEO, TeamLead, Member');
    console.log('📧 Default email account created: admin@crm.com');
    
    return {
      roles: [ceoRole[0], teamLeadRole[0], memberRole[0]],
      adminUser: adminUser[0],
      defaultEmailAccount: defaultEmailAccount[0]
    };

  } catch (error) {
    console.error('❌ Error seeding clean data:', error);
    throw error;
  }
};

module.exports = { seedCleanData };
