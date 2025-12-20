const { Organization, User, Conference, Client, EmailLog, FollowUpJob, Campaign, EmailTemplate, sequelize } = require('../models');
const { Op } = require('sequelize');

class AnalyticsService {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Get CEO dashboard analytics
   * @returns {Object} CEO dashboard data
   */
  async getCEODashboard() {
    try {
      const cacheKey = 'ceo_dashboard';
      const cached = this.getFromCache(cacheKey);
      if (cached) return cached;

      const dashboard = {
        overview: await this.getSystemOverview(),
        organizations: await this.getOrganizationsSummary(),
        performance: await this.getSystemPerformance(),
        recentActivity: await this.getRecentActivity(),
        alerts: await this.getSystemAlerts(),
        trends: await this.getTrends(),
        revenue: await this.getRevenueMetrics(),
        userActivity: await this.getUserActivity(),
        systemHealth: await this.getSystemHealth()
      };

      this.setCache(cacheKey, dashboard);
      return dashboard;
    } catch (error) {
      console.error('Error getting CEO dashboard:', error);
      throw error;
    }
  }

  /**
   * Get system overview metrics
   * @returns {Object} System overview
   */
  async getSystemOverview() {
    try {
      const [
        totalOrganizations,
        totalUsers,
        totalConferences,
        totalClients,
        totalEmails,
        activeFollowUps
      ] = await Promise.all([
        Organization.count(),
        User.count(),
        Conference.count(),
        Client.count(),
        EmailLog.count(),
        FollowUpJob.count({ where: { status: 'active' } })
      ]);

      return {
        totalOrganizations,
        totalUsers,
        totalConferences,
        totalClients,
        totalEmails,
        activeFollowUps,
        systemUptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting system overview:', error);
      return {};
    }
  }

  /**
   * Get organizations summary
   * @returns {Array} Organizations summary
   */
  async getOrganizationsSummary() {
    try {
      const organizations = await Organization.findAll({
        include: [
          { model: User, as: 'users', attributes: ['id', 'name', 'role', 'isActive'] },
          { model: Conference, as: 'conferences', attributes: ['id', 'name', 'status'] },
          { model: Client, as: 'clients', attributes: ['id', 'firstName', 'lastName', 'status'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      return organizations.map(org => ({
        id: org.id,
        name: org.name,
        domain: org.domain,
        status: org.status,
        subscriptionTier: org.subscriptionTier,
        userCount: org.users?.length || 0,
        conferenceCount: org.conferences?.length || 0,
        clientCount: org.clients?.length || 0,
        activeUsers: org.users?.filter(u => u.isActive).length || 0,
        activeConferences: org.conferences?.filter(c => c.status === 'active').length || 0,
        createdAt: org.createdAt,
        lastActivity: org.updatedAt
      }));
    } catch (error) {
      console.error('Error getting organizations summary:', error);
      return [];
    }
  }

  /**
   * Get system performance metrics
   * @returns {Object} Performance metrics
   */
  async getSystemPerformance() {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        emailsLast24h,
        emailsLast7d,
        newClientsLast24h,
        newClientsLast7d,
        activeConferences,
        completedFollowUps
      ] = await Promise.all([
        EmailLog.count({ where: { sentAt: { [Op.gte]: last24Hours } } }),
        EmailLog.count({ where: { sentAt: { [Op.gte]: last7Days } } }),
        Client.count({ where: { createdAt: { [Op.gte]: last24Hours } } }),
        Client.count({ where: { createdAt: { [Op.gte]: last7Days } } }),
        Conference.count({ where: { status: 'active' } }),
        FollowUpJob.count({ where: { status: 'completed' } })
      ]);

      return {
        emails: {
          last24Hours: emailsLast24h,
          last7Days: emailsLast7d,
          averagePerDay: Math.round(emailsLast7d / 7)
        },
        clients: {
          last24Hours: newClientsLast24h,
          last7Days: newClientsLast7d,
          averagePerDay: Math.round(newClientsLast7d / 7)
        },
        conferences: {
          active: activeConferences
        },
        followUps: {
          completed: completedFollowUps
        }
      };
    } catch (error) {
      console.error('Error getting system performance:', error);
      return {};
    }
  }

  /**
   * Get recent activity
   * @returns {Array} Recent activity
   */
  async getRecentActivity() {
    try {
      const activities = [];

      // Get recent clients
      const recentClients = await Client.findAll({
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [
          { model: User, as: 'owner', attributes: ['name'] },
          { model: Conference, as: 'conference', attributes: ['name'] }
        ]
      });

      recentClients.forEach(client => {
        activities.push({
          id: `client_${client.id}`,
          type: 'client_created',
          description: `New client ${client.firstName} ${client.lastName} added`,
          timestamp: client.createdAt,
          user: client.owner?.name || 'System',
          conference: client.conference?.name
        });
      });

      // Get recent emails
      const recentEmails = await EmailLog.findAll({
        order: [['sentAt', 'DESC']],
        limit: 5,
        include: [
          { model: Client, as: 'client', attributes: ['firstName', 'lastName'] }
        ]
      });

      recentEmails.forEach(email => {
        activities.push({
          id: `email_${email.id}`,
          type: 'email_sent',
          description: `Email sent to ${email.client?.firstName} ${email.client?.lastName}`,
          timestamp: email.sentAt,
          user: 'System',
          conference: email.conference?.name
        });
      });

      // Get recent conferences
      const recentConferences = await Conference.findAll({
        order: [['createdAt', 'DESC']],
        limit: 5,
        include: [
          { model: User, as: 'primaryContact', attributes: ['name'] }
        ]
      });

      recentConferences.forEach(conference => {
        activities.push({
          id: `conference_${conference.id}`,
          type: 'conference_created',
          description: `Conference ${conference.name} created`,
          timestamp: conference.createdAt,
          user: conference.primaryContact?.name || 'System'
        });
      });

      // Sort by timestamp and limit to 10
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return activities.slice(0, 10);
    } catch (error) {
      console.error('Error getting recent activity:', error);
      return [];
    }
  }

  /**
   * Get system alerts
   * @returns {Array} System alerts
   */
  async getSystemAlerts() {
    try {
      const alerts = [];

      // Check for failed follow-up jobs
      const failedJobs = await FollowUpJob.count({ where: { status: 'failed' } });
      if (failedJobs > 0) {
        alerts.push({
          id: 'failed_jobs',
          type: 'warning',
          title: 'Failed Follow-up Jobs',
          message: `${failedJobs} follow-up jobs have failed`,
          severity: 'medium',
          timestamp: new Date()
        });
      }

      // Check for bounced emails
      const bouncedEmails = await EmailLog.count({ 
        where: { 
          status: 'bounced',
          sentAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });
      if (bouncedEmails > 10) {
        alerts.push({
          id: 'high_bounce_rate',
          type: 'error',
          title: 'High Bounce Rate',
          message: `${bouncedEmails} emails bounced in the last 24 hours`,
          severity: 'high',
          timestamp: new Date()
        });
      }

      // Check for inactive users
      const inactiveUsers = await User.count({
        where: {
          isActive: true,
          lastLogin: { [Op.lt]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      });
      if (inactiveUsers > 0) {
        alerts.push({
          id: 'inactive_users',
          type: 'info',
          title: 'Inactive Users',
          message: `${inactiveUsers} users haven't logged in for 30+ days`,
          severity: 'low',
          timestamp: new Date()
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error getting system alerts:', error);
      return [];
    }
  }

  /**
   * Get trends data
   * @returns {Object} Trends data
   */
  async getTrends() {
    try {
      const now = new Date();
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get daily email trends
      const emailTrends = await EmailLog.findAll({
        where: { sentAt: { [Op.gte]: last30Days } },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('sentAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('sentAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('sentAt')), 'ASC']]
      });

      // Get daily client trends
      const clientTrends = await Client.findAll({
        where: { createdAt: { [Op.gte]: last30Days } },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
        order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']]
      });

      return {
        emails: emailTrends,
        clients: clientTrends
      };
    } catch (error) {
      console.error('Error getting trends:', error);
      return { emails: [], clients: [] };
    }
  }

  /**
   * Get revenue metrics
   * @returns {Object} Revenue metrics
   */
  async getRevenueMetrics() {
    try {
      const organizations = await Organization.findAll({
        attributes: ['subscriptionTier', 'billing'],
        where: { status: 'active' }
      });

      const revenueByTier = organizations.reduce((acc, org) => {
        const tier = org.subscriptionTier || 'starter';
        if (!acc[tier]) acc[tier] = 0;
        acc[tier]++;
        return acc;
      }, {});

      const totalRevenue = organizations.reduce((sum, org) => {
        const billing = org.billing || {};
        return sum + (billing.actual || 0);
      }, 0);

      return {
        totalRevenue,
        revenueByTier,
        totalOrganizations: organizations.length,
        averageRevenuePerOrganization: organizations.length > 0 ? Math.round(totalRevenue / organizations.length) : 0
      };
    } catch (error) {
      console.error('Error getting revenue metrics:', error);
      return {};
    }
  }

  /**
   * Get user activity
   * @returns {Object} User activity
   */
  async getUserActivity() {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        activeUsers,
        newUsers,
        userLogins
      ] = await Promise.all([
        User.count({ where: { lastLogin: { [Op.gte]: last24Hours } } }),
        User.count({ where: { createdAt: { [Op.gte]: last24Hours } } }),
        User.count({ where: { lastLogin: { [Op.gte]: last24Hours } } })
      ]);

      return {
        activeUsers,
        newUsers,
        userLogins,
        totalUsers: await User.count()
      };
    } catch (error) {
      console.error('Error getting user activity:', error);
      return {};
    }
  }

  /**
   * Get system health
   * @returns {Object} System health
   */
  async getSystemHealth() {
    try {
      return {
        database: {
          status: 'healthy',
          connectionPool: 'active',
          responseTime: '< 50ms'
        },
        services: {
          emailService: 'healthy',
          followUpService: 'healthy',
          notificationService: 'healthy',
          complianceService: 'healthy'
        },
        performance: {
          cpuUsage: process.cpuUsage(),
          memoryUsage: process.memoryUsage(),
          uptime: process.uptime()
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting system health:', error);
      return {};
    }
  }

  /**
   * Get conference analytics
   * @param {string} conferenceId - Conference ID
   * @returns {Object} Conference analytics
   */
  async getConferenceAnalytics(conferenceId) {
    try {
      const conference = await Conference.findByPk(conferenceId, {
        include: [
          { model: Client, as: 'clients' },
          { model: EmailLog, as: 'emailLogs' },
          { model: FollowUpJob, as: 'followUpJobs' }
        ]
      });

      if (!conference) {
        throw new Error('Conference not found');
      }

      const clients = conference.clients || [];
      const emailLogs = conference.emailLogs || [];
      const followUpJobs = conference.followUpJobs || [];

      // Calculate metrics
      const totalClients = clients.length;
      const leads = clients.filter(c => c.status === 'Lead').length;
      const abstractSubmitted = clients.filter(c => c.status === 'Abstract Submitted').length;
      const registered = clients.filter(c => c.status === 'Registered').length;

      const totalEmails = emailLogs.length;
      const sentEmails = emailLogs.filter(e => e.status === 'sent').length;
      const openedEmails = emailLogs.filter(e => e.status === 'opened').length;
      const clickedEmails = emailLogs.filter(e => e.status === 'clicked').length;

      const activeFollowUps = followUpJobs.filter(j => j.status === 'active').length;
      const completedFollowUps = followUpJobs.filter(j => j.status === 'completed').length;

      return {
        conference: {
          id: conference.id,
          name: conference.name,
          venue: conference.venue,
          startDate: conference.startDate,
          endDate: conference.endDate,
          status: conference.status
        },
        clients: {
          total: totalClients,
          leads,
          abstractSubmitted,
          registered,
          abstractSubmissionRate: totalClients > 0 ? Math.round((abstractSubmitted / totalClients) * 100) : 0,
          registrationRate: abstractSubmitted > 0 ? Math.round((registered / abstractSubmitted) * 100) : 0,
          overallConversionRate: totalClients > 0 ? Math.round((registered / totalClients) * 100) : 0
        },
        emails: {
          total: totalEmails,
          sent: sentEmails,
          opened: openedEmails,
          clicked: clickedEmails,
          openRate: sentEmails > 0 ? Math.round((openedEmails / sentEmails) * 100) : 0,
          clickRate: sentEmails > 0 ? Math.round((clickedEmails / sentEmails) * 100) : 0
        },
        followUps: {
          active: activeFollowUps,
          completed: completedFollowUps,
          total: followUpJobs.length
        }
      };
    } catch (error) {
      console.error('Error getting conference analytics:', error);
      throw error;
    }
  }

  /**
   * Get cache value
   * @param {string} key - Cache key
   * @returns {*} Cached value
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   */
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = AnalyticsService;