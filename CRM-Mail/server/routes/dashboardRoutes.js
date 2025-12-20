const express = require('express');
const { Op } = require('sequelize');
const { 
  Conference, 
  Client, 
  FollowUpJob, 
  EmailLog, 
  Campaign, 
  EmailTemplate,
  User 
} = require('../models');
const { sequelize } = require('../config/database');
const { requireRole } = require('../middleware/rbac');
const router = express.Router();

// Get comprehensive dashboard stats
router.get('/stats', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const { conferenceId, dateFrom, dateTo } = req.query;
    
    // Set date range (default to last 30 days)
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let whereClause = {};
    if (conferenceId) whereClause.conferenceId = conferenceId;

    // Role-based filtering by assigned conferences
    if (req.user.role === 'TeamLead') {
      // Get conferences assigned to this TeamLead
      const assignedConferences = await Conference.findAll({
        where: { assignedTeamLeadId: req.user.id },
        attributes: ['id']
      });
      const conferenceIds = assignedConferences.map(c => c.id);
      
      if (conferenceIds.length === 0) {
        // No assigned conferences, return empty stats
        return res.json({
          totalClients: 0,
          clientsByStatus: {},
          followupStats: [],
          emailStats: {},
          campaignStats: {},
          recentClients: [],
          upcomingFollowups: []
        });
      }
      
      whereClause.conferenceId = { [Op.in]: conferenceIds };
      console.log(`🔒 TeamLead dashboard - Filtering by ${conferenceIds.length} assigned conference(s)`);
    } else if (req.user.role === 'Member') {
      // Get conferences where this Member is in assignedMemberIds (JSON column)
      const assignedConferences = await Conference.findAll({
        where: sequelize.where(
          sequelize.cast(sequelize.col('assignedMemberIds'), 'jsonb'),
          '@>',
          sequelize.cast(`["${req.user.id}"]`, 'jsonb')
        ),
        attributes: ['id']
      });
      const conferenceIds = assignedConferences.map(c => c.id);
      
      if (conferenceIds.length === 0) {
        // No assigned conferences, return empty stats
        return res.json({
          totalClients: 0,
          clientsByStatus: {},
          followupStats: [],
          emailStats: {},
          campaignStats: {},
          recentClients: [],
          upcomingFollowups: []
        });
      }
      
      whereClause.conferenceId = { [Op.in]: conferenceIds };
      console.log(`🔒 Member dashboard - Filtering by ${conferenceIds.length} assigned conference(s)`);
    } else if (req.user.role === 'CEO') {
      console.log(`👑 CEO dashboard - Showing all system data`);
    }

    // Basic client stats
    const totalClients = await Client.count({ where: whereClause });
    const clientsByStatus = await Client.findAll({
      where: whereClause,
      attributes: ['status', [Op.fn('COUNT', Op.col('id')), 'count']],
      group: ['status']
    });

    const statusCounts = clientsByStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.dataValues.count);
      return acc;
    }, {});

    // Follow-up stats
    const followupStats = await FollowUpJob.findAll({
      where: {
        ...whereClause,
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        'stage',
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: ['status', 'stage']
    });

    // Email stats
    const emailStats = await EmailLog.findAll({
      where: {
        ...whereClause,
        sentAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: ['status']
    });

    const emailCounts = emailStats.reduce((acc, item) => {
      acc[item.status] = parseInt(item.dataValues.count);
      return acc;
    }, {});

    // Campaign stats
    const campaignStats = await Campaign.findAll({
      where: {
        ...whereClause,
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        'status',
        [Op.fn('COUNT', Op.col('id')), 'count'],
        [Op.fn('SUM', Op.col('totalRecipients')), 'totalRecipients'],
        [Op.fn('SUM', Op.col('sentCount')), 'sentCount'],
        [Op.fn('SUM', Op.col('deliveredCount')), 'deliveredCount'],
        [Op.fn('SUM', Op.col('bouncedCount')), 'bouncedCount'],
        [Op.fn('SUM', Op.col('repliedCount')), 'repliedCount']
      ],
      group: ['status']
    });

    // Daily activity for charts
    const dailyActivity = await EmailLog.findAll({
      where: {
        ...whereClause,
        sentAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [Op.fn('DATE', Op.col('sentAt')), 'date'],
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: [Op.fn('DATE', Op.col('sentAt'))],
      order: [[Op.fn('DATE', Op.col('sentAt')), 'ASC']]
    });

    // Recent activities
    const recentActivities = await EmailLog.findAll({
      where: whereClause,
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'email'] }
      ],
      order: [['sentAt', 'DESC']],
      limit: 10
    });

    // Calculate conversion rates
    const abstractsSubmitted = statusCounts['Abstract Submitted'] || 0;
    const registered = statusCounts['Registered'] || 0;
    const conversionRate = abstractsSubmitted > 0 ? (registered / abstractsSubmitted * 100).toFixed(2) : 0;

    // Calculate email performance
    const totalSent = emailCounts.sent || 0;
    const totalDelivered = emailCounts.delivered || 0;
    const totalBounced = emailCounts.bounced || 0;
    const totalReplied = emailCounts.replied || 0;
    
    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent * 100).toFixed(2) : 0;
    const bounceRate = totalSent > 0 ? (totalBounced / totalSent * 100).toFixed(2) : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent * 100).toFixed(2) : 0;

    // Team performance (for CEO and TeamLead)
    let teamPerformance = null;
    if (req.user.role === 'CEO' || req.user.role === 'TeamLead') {
      const teamStats = await Client.findAll({
        where: whereClause,
        include: [
          { model: User, as: 'owner', attributes: ['id', 'name', 'email'] }
        ],
        attributes: [
          'ownerUserId',
          [Op.fn('COUNT', Op.col('id')), 'totalClients'],
          [Op.fn('COUNT', Op.col('CASE WHEN status = "Registered" THEN 1 END')), 'registeredClients']
        ],
        group: ['ownerUserId', 'owner.id', 'owner.name', 'owner.email']
      });

      teamPerformance = teamStats.map(stat => ({
        userId: stat.ownerUserId,
        userName: stat.owner.name,
        userEmail: stat.owner.email,
        totalClients: parseInt(stat.dataValues.totalClients),
        registeredClients: parseInt(stat.dataValues.registeredClients),
        conversionRate: stat.dataValues.totalClients > 0 
          ? (stat.dataValues.registeredClients / stat.dataValues.totalClients * 100).toFixed(2)
          : 0
      }));
    }

    // Conferences overview (scoped)
    const conferences = await Conference.findAll({
      where: whereClause.conferenceId ? { id: whereClause.conferenceId } : undefined,
      attributes: ['id', 'name', 'startDate', 'endDate', 'venue'],
      include: [{ model: User, as: 'primaryContact', attributes: ['id', 'name', 'email'] }]
    });

    // Needs attention
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const bouncedEmails = await EmailLog.findAll({
      where: { status: 'bounced', sentAt: { [Op.gte]: sevenDaysAgo }, ...(whereClause.conferenceId ? { conferenceId: whereClause.conferenceId } : {}) },
      limit: 20,
      order: [['sentAt', 'DESC']],
      include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'email'] }]
    });

    // Unanswered replies = inbound unread emails in last 24h (scope by client.conferenceId if available)
    const { Email } = require('../models');
    const unansweredRaw = await Email.findAll({
      where: { folder: 'inbox', isRead: false, date: { [Op.gte]: oneDayAgo }, clientId: { [Op.ne]: null } },
      include: [{ model: Client, as: 'client', attributes: ['id', 'name', 'email'], ...(whereClause.conferenceId ? { where: { conferenceId: whereClause.conferenceId } } : {}) }],
      order: [['date', 'DESC']],
      limit: 20
    });

    const stats = {
      overview: {
        totalClients,
        abstractsSubmitted,
        registered,
        unresponsive: statusCounts['Unresponsive'] || 0,
        conversionRate: parseFloat(conversionRate)
      },
      conferences: conferences.map(c => ({
        id: c.id,
        name: c.name,
        startDate: c.startDate,
        endDate: c.endDate,
        venue: c.venue,
        primaryContact: c.primaryContact ? { id: c.primaryContact.id, name: c.primaryContact.name, email: c.primaryContact.email } : null
      })),
      emailPerformance: {
        totalSent,
        totalDelivered,
        totalBounced,
        totalReplied,
        deliveryRate: parseFloat(deliveryRate),
        bounceRate: parseFloat(bounceRate),
        replyRate: parseFloat(replyRate)
      },
      needsAttention: {
        bouncedEmails: bouncedEmails.map(b => ({ id: b.id, clientId: b.clientId, clientName: b.client?.name, subject: b.subject, status: b.status, sentAt: b.sentAt })),
        unansweredReplies: unansweredRaw.map(e => ({ id: e.id, clientId: e.clientId, clientName: e.client?.name, subject: e.subject, date: e.date }))
      },
      followups: {
        active: followupStats.filter(f => f.status === 'active').length,
        paused: followupStats.filter(f => f.status === 'paused').length,
        completed: followupStats.filter(f => f.status === 'completed').length,
        byStage: followupStats.reduce((acc, item) => {
          if (!acc[item.stage]) acc[item.stage] = 0;
          acc[item.stage] += parseInt(item.dataValues.count);
          return acc;
        }, {})
      },
      campaigns: {
        total: campaignStats.length,
        running: campaignStats.filter(c => c.status === 'running').length,
        completed: campaignStats.filter(c => c.status === 'completed').length,
        totalRecipients: campaignStats.reduce((sum, c) => sum + (parseInt(c.dataValues.totalRecipients) || 0), 0),
        totalSent: campaignStats.reduce((sum, c) => sum + (parseInt(c.dataValues.sentCount) || 0), 0),
        totalDelivered: campaignStats.reduce((sum, c) => sum + (parseInt(c.dataValues.deliveredCount) || 0), 0),
        totalBounced: campaignStats.reduce((sum, c) => sum + (parseInt(c.dataValues.bouncedCount) || 0), 0),
        totalReplied: campaignStats.reduce((sum, c) => sum + (parseInt(c.dataValues.repliedCount) || 0), 0)
      },
      charts: {
        dailyActivity: dailyActivity.map(item => ({
          date: item.dataValues.date,
          count: parseInt(item.dataValues.count)
        })),
        statusDistribution: Object.entries(statusCounts).map(([status, count]) => ({
          status,
          count
        }))
      },
      recentActivities: recentActivities.map(activity => ({
        id: activity.id,
        type: activity.eventType,
        clientName: activity.client?.name,
        clientEmail: activity.client?.email,
        subject: activity.subject,
        status: activity.status,
        sentAt: activity.sentAt
      })),
      teamPerformance
    };

    res.json(stats);
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get conference summary
router.get('/conference/:id/summary', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const conferenceId = req.params.id;
    
    const conference = await Conference.findByPk(conferenceId, {
      include: [
        { model: User, as: 'primaryContact', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!conference) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    // Get conference-specific stats
    const clientStats = await Client.findAll({
      where: { conferenceId },
      attributes: [
        'status',
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: ['status']
    });

    const statusCounts = clientStats.reduce((acc, item) => {
      acc[item.status] = parseInt(item.dataValues.count);
      return acc;
    }, {});

    const totalClients = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    const abstractsSubmitted = statusCounts['Abstract Submitted'] || 0;
    const registered = statusCounts['Registered'] || 0;
    const conversionRate = abstractsSubmitted > 0 ? (registered / abstractsSubmitted * 100).toFixed(2) : 0;

    // Get recent activity
    const recentEmails = await EmailLog.findAll({
      where: { conferenceId },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name', 'email'] }
      ],
      order: [['sentAt', 'DESC']],
      limit: 5
    });

    const summary = {
      conference: {
        id: conference.id,
        name: conference.name,
        venue: conference.venue,
        startDate: conference.startDate,
        endDate: conference.endDate,
        primaryContact: conference.primaryContact
      },
      stats: {
        totalClients,
        abstractsSubmitted,
        registered,
        unresponsive: statusCounts['Unresponsive'] || 0,
        conversionRate: parseFloat(conversionRate)
      },
      recentActivity: recentEmails.map(email => ({
        id: email.id,
        clientName: email.client?.name,
        subject: email.subject,
        status: email.status,
        sentAt: email.sentAt
      }))
    };

    res.json(summary);
  } catch (error) {
    console.error('Get conference summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get KPIs for specific time period
router.get('/kpis', requireRole(['CEO', 'TeamLead', 'Member']), async (req, res) => {
  try {
    const { conferenceId, period = '30d' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    let startDate;
    
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    let whereClause = { createdAt: { [Op.between]: [startDate, endDate] } };
    if (conferenceId) whereClause.conferenceId = conferenceId;

    // Role-based filtering
    if (req.user.role === 'Member') {
      whereClause.ownerUserId = req.user.id;
    }

    // Get client acquisition trends
    const clientTrends = await Client.findAll({
      where: whereClause,
      attributes: [
        [Op.fn('DATE', Op.col('createdAt')), 'date'],
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: [Op.fn('DATE', Op.col('createdAt'))],
      order: [[Op.fn('DATE', Op.col('createdAt')), 'ASC']]
    });

    // Get email performance trends
    const emailTrends = await EmailLog.findAll({
      where: {
        ...whereClause,
        sentAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [Op.fn('DATE', Op.col('sentAt')), 'date'],
        [Op.fn('COUNT', Op.col('id')), 'totalSent'],
        [Op.fn('COUNT', Op.col('CASE WHEN status = "delivered" THEN 1 END')), 'delivered'],
        [Op.fn('COUNT', Op.col('CASE WHEN status = "bounced" THEN 1 END')), 'bounced'],
        [Op.fn('COUNT', Op.col('CASE WHEN status = "replied" THEN 1 END')), 'replied']
      ],
      group: [Op.fn('DATE', Op.col('sentAt'))],
      order: [[Op.fn('DATE', Op.col('sentAt')), 'ASC']]
    });

    // Calculate growth rates
    const totalClients = clientTrends.reduce((sum, item) => sum + parseInt(item.dataValues.count), 0);
    const totalEmails = emailTrends.reduce((sum, item) => sum + parseInt(item.dataValues.totalSent), 0);
    const totalDelivered = emailTrends.reduce((sum, item) => sum + parseInt(item.dataValues.delivered), 0);
    const totalReplied = emailTrends.reduce((sum, item) => sum + parseInt(item.dataValues.replied), 0);

    const kpis = {
      period,
      dateRange: { startDate, endDate },
      clientAcquisition: {
        total: totalClients,
        trends: clientTrends.map(item => ({
          date: item.dataValues.date,
          count: parseInt(item.dataValues.count)
        }))
      },
      emailPerformance: {
        totalSent: totalEmails,
        totalDelivered,
        totalReplied,
        deliveryRate: totalEmails > 0 ? (totalDelivered / totalEmails * 100).toFixed(2) : 0,
        replyRate: totalEmails > 0 ? (totalReplied / totalEmails * 100).toFixed(2) : 0,
        trends: emailTrends.map(item => ({
          date: item.dataValues.date,
          totalSent: parseInt(item.dataValues.totalSent),
          delivered: parseInt(item.dataValues.delivered),
          bounced: parseInt(item.dataValues.bounced),
          replied: parseInt(item.dataValues.replied)
        }))
      }
    };

    res.json(kpis);
  } catch (error) {
    console.error('Get KPIs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
