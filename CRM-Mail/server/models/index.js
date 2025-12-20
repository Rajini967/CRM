const { sequelize } = require('../config/database');
const Organization = require('./Organization');
const User = require('./User');
const Role = require('./Role');
const Conference = require('./Conference');
const Client = require('./Client');
const Email = require('./Email');
const EmailTemplate = require('./EmailTemplate');
const EmailTemplateDraft = require('./EmailTemplateDraft');
const FollowUpJob = require('./FollowUpJob');
const EmailLog = require('./EmailLog');
const EmailAccount = require('./EmailAccount');
const EmailFolder = require('./EmailFolder');
const EmailThread = require('./EmailThread');
const Campaign = require('./Campaign');
const Notification = require('./Notification');
const AuditLog = require('./AuditLog');
const ClientNote = require('./ClientNote');
const Task = require('./Task');
const SearchPreset = require('./SearchPreset');

// Define relationships
// Organization relationships
Organization.hasMany(User, { foreignKey: 'organizationId', as: 'users' });
User.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Conference, { foreignKey: 'organizationId', as: 'conferences' });
Conference.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(Client, { foreignKey: 'organizationId', as: 'clients' });
Client.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(EmailTemplate, { foreignKey: 'organizationId', as: 'emailTemplates' });
EmailTemplate.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(EmailTemplateDraft, { foreignKey: 'organizationId', as: 'emailTemplateDrafts' });
EmailTemplateDraft.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

Organization.hasMany(EmailAccount, { foreignKey: 'organizationId', as: 'emailAccounts' });
EmailAccount.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

// Role relationships
Role.hasMany(User, { foreignKey: 'roleId', as: 'users' });
User.belongsTo(Role, { foreignKey: 'roleId', as: 'roleDetails' });

// User hierarchy relationships
User.hasMany(User, { foreignKey: 'managerId', as: 'subordinates' });
User.belongsTo(User, { foreignKey: 'managerId', as: 'manager' });

// User relationships
User.hasMany(Conference, { foreignKey: 'primaryContactUserId', as: 'conferences' });
Conference.belongsTo(User, { foreignKey: 'primaryContactUserId', as: 'primaryContact' });

User.hasMany(EmailTemplate, { foreignKey: 'createdBy', as: 'templates' });
EmailTemplate.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.hasMany(EmailTemplateDraft, { foreignKey: 'createdBy', as: 'templateDrafts' });
EmailTemplateDraft.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.hasMany(FollowUpJob, { foreignKey: 'createdBy', as: 'followUpJobs' });
FollowUpJob.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

User.hasMany(Campaign, { foreignKey: 'ownerId', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

// Conference relationships
Conference.hasMany(Client, { foreignKey: 'conferenceId', as: 'clients' });
Client.belongsTo(Conference, { foreignKey: 'conferenceId', as: 'conference' });

Conference.hasMany(EmailTemplate, { foreignKey: 'conferenceId', as: 'templates' });
EmailTemplate.belongsTo(Conference, { foreignKey: 'conferenceId', as: 'conference' });

EmailTemplate.hasMany(FollowUpJob, { foreignKey: 'templateId', as: 'followUpJobs' });
FollowUpJob.belongsTo(EmailTemplate, { foreignKey: 'templateId', as: 'template' });

Conference.hasMany(EmailAccount, { foreignKey: 'conferenceId', as: 'emailAccounts' });
EmailAccount.belongsTo(Conference, { foreignKey: 'conferenceId', as: 'conference' });

Conference.hasMany(Campaign, { foreignKey: 'conferenceId', as: 'campaigns' });
Campaign.belongsTo(Conference, { foreignKey: 'conferenceId', as: 'conference' });

Conference.hasMany(FollowUpJob, { foreignKey: 'conferenceId', as: 'followUpJobs' });
FollowUpJob.belongsTo(Conference, { foreignKey: 'conferenceId', as: 'conference' });

// Client relationships
Client.belongsTo(User, { foreignKey: 'ownerUserId', as: 'owner' });
User.hasMany(Client, { foreignKey: 'ownerUserId', as: 'clients' });

Client.hasMany(Email, { foreignKey: 'clientId', as: 'emails' });
Email.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

Client.hasMany(FollowUpJob, { foreignKey: 'clientId', as: 'followUpJobs' });
FollowUpJob.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

Client.hasMany(EmailLog, { foreignKey: 'clientId', as: 'emailLogs' });
EmailLog.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

// ClientNote relationships
Client.hasMany(ClientNote, { foreignKey: 'clientId', as: 'clientNotes' });
ClientNote.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });

User.hasMany(ClientNote, { foreignKey: 'authorId', as: 'clientNotes' });
ClientNote.belongsTo(User, { foreignKey: 'authorId', as: 'author' });

// Task relationships
Organization.hasMany(Task, { foreignKey: 'organizationId', as: 'tasks' });
Task.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

User.hasMany(Task, { foreignKey: 'assignedToId', as: 'assignedTasks' });
Task.belongsTo(User, { foreignKey: 'assignedToId', as: 'assignedTo' });

User.hasMany(Task, { foreignKey: 'assignedById', as: 'createdTasks' });
Task.belongsTo(User, { foreignKey: 'assignedById', as: 'assignedBy' });

User.hasMany(Task, { foreignKey: 'completedById', as: 'completedTasks' });
Task.belongsTo(User, { foreignKey: 'completedById', as: 'completedBy' });

// Self-referencing for subtasks
Task.hasMany(Task, { foreignKey: 'parentTaskId', as: 'subtasks' });
Task.belongsTo(Task, { foreignKey: 'parentTaskId', as: 'parentTask' });

// SearchPreset relationships
Organization.hasMany(SearchPreset, { foreignKey: 'organizationId', as: 'searchPresets' });
SearchPreset.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

User.hasMany(SearchPreset, { foreignKey: 'userId', as: 'searchPresets' });
SearchPreset.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Email relationships
Email.hasMany(EmailLog, { foreignKey: 'emailId', as: 'logs' });
EmailLog.belongsTo(Email, { foreignKey: 'emailId', as: 'email' });

// Email Account relationships
User.hasMany(EmailAccount, { foreignKey: 'createdBy', as: 'emailAccounts' });
EmailAccount.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
User.hasMany(EmailAccount, { foreignKey: 'ownerId', as: 'ownedEmailAccounts' });
EmailAccount.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

EmailAccount.hasMany(EmailFolder, { foreignKey: 'emailAccountId', as: 'folders' });
EmailFolder.belongsTo(EmailAccount, { foreignKey: 'emailAccountId', as: 'emailAccount' });

EmailAccount.hasMany(Email, { foreignKey: 'emailAccountId', as: 'emails' });
Email.belongsTo(EmailAccount, { foreignKey: 'emailAccountId', as: 'emailAccount' });

EmailAccount.hasMany(EmailThread, { foreignKey: 'emailAccountId', as: 'threads' });
EmailThread.belongsTo(EmailAccount, { foreignKey: 'emailAccountId', as: 'emailAccount' });

// Email Folder relationships
EmailFolder.hasMany(EmailFolder, { foreignKey: 'parentId', as: 'subfolders' });
EmailFolder.belongsTo(EmailFolder, { foreignKey: 'parentId', as: 'parent' });

EmailFolder.hasMany(Email, { foreignKey: 'folderId', as: 'emails' });
Email.belongsTo(EmailFolder, { foreignKey: 'folderId', as: 'emailFolder' });

// Email Thread relationships (optional - threadId can be null)
EmailThread.hasMany(Email, { foreignKey: 'threadId', as: 'emails', constraints: false });
Email.belongsTo(EmailThread, { foreignKey: 'threadId', as: 'thread', constraints: false });

EmailThread.belongsTo(Client, { foreignKey: 'clientId', as: 'client' });
Client.hasMany(EmailThread, { foreignKey: 'clientId', as: 'emailThreads' });

// Campaign relationships
Campaign.belongsTo(EmailTemplate, { foreignKey: 'templateId', as: 'template' });
EmailTemplate.hasMany(Campaign, { foreignKey: 'templateId', as: 'campaigns' });

Campaign.belongsTo(EmailAccount, { foreignKey: 'smtpAccountId', as: 'smtpAccount' });
EmailAccount.hasMany(Campaign, { foreignKey: 'smtpAccountId', as: 'campaigns' });

// Conference template associations
Conference.belongsTo(EmailTemplate, { foreignKey: 'stage1TemplateId', as: 'stage1Template' });
Conference.belongsTo(EmailTemplate, { foreignKey: 'stage2TemplateId', as: 'stage2Template' });

// Notification relationships
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Audit relationships
Organization.hasMany(AuditLog, { foreignKey: 'organizationId', as: 'auditLogs' });
AuditLog.belongsTo(Organization, { foreignKey: 'organizationId', as: 'organization' });

User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// Export all models and sequelize instance
module.exports = {
  sequelize,
  Organization,
  User,
  Role,
  Conference,
  Client,
  Email,
  EmailTemplate,
  EmailTemplateDraft,
  FollowUpJob,
  EmailLog,
  EmailAccount,
  EmailFolder,
  EmailThread,
  Campaign,
  Notification,
  AuditLog,
  ClientNote,
  Task,
  SearchPreset
};
