const express = require('express');
const { Op } = require('sequelize');
const { 
  Conference, 
  Client, 
  Email,
  EmailLog, 
  FollowUpJob,
  User
} = require('../models');
const router = express.Router();

// Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Helper function to check conference access
async function checkConferenceAccess(conferenceId, userId, userRole) {
  if (userRole === 'CEO') {
    return true; // CEO has access to all conferences
  }

  const conference = await Conference.findByPk(conferenceId);
  if (!conference) {
    return false;
  }

  if (userRole === 'TeamLead') {
    return conference.assignedTeamLeadId === userId;
  } else if (userRole === 'Member') {
    const assignedMemberIds = conference.assignedMemberIds || [];
    return assignedMemberIds.includes(userId);
  }

  return false;
}

// GET /api/analytics/conference/:id - Get comprehensive conference analytics
router.get('/conference/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { dateFrom, dateTo } = req.query;

    // Check conference access
    const hasAccess = await checkConferenceAccess(id, req.user.id, req.user.role);
    if (!hasAccess) {
      console.log(`🚫 ${req.user.role} ${req.user.email} attempted to access analytics for non-assigned conference ${id}`);
      return res.status(403).json({ error: 'You do not have permission to view analytics for this conference' });
    }

    // Get conference
    const conference = await Conference.findByPk(id);
    if (!conference) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    // Set date range (default to all time or specific range)
    const endDate = dateTo ? new Date(dateTo) : new Date();
    const startDate = dateFrom ? new Date(dateFrom) : new Date(conference.createdAt || Date.now() - 365 * 24 * 60 * 60 * 1000);

    // Get all clients for this conference
    const totalClients = await Client.count({
      where: { conferenceId: id }
    });

    // Get clients by status
    const clientsByStatus = await Client.findAll({
      where: { conferenceId: id },
      attributes: [
        'status',
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    const statusCounts = clientsByStatus.reduce((acc, item) => {
      acc[item.status] = parseInt(item.count);
      return acc;
    }, {});

    // Get clients by stage
    const clientsByStage = await Client.findAll({
      where: { conferenceId: id },
      attributes: [
        'currentStage',
        [Op.fn('COUNT', Op.col('id')), 'count']
      ],
      group: ['currentStage'],
      raw: true
    });

    const stageCounts = clientsByStage.reduce((acc, item) => {
      acc[item.currentStage] = parseInt(item.count);
      return acc;
    }, {});

    // Calculate key metrics
    const abstractsSubmitted = statusCounts['Abstract Submitted'] || 0;
    const registered = statusCounts['Registered'] || 0;
    const unresponsive = statusCounts['Unresponsive'] || 0;

    const abstractSubmissionRate = totalClients > 0 ? (abstractsSubmitted / totalClients * 100).toFixed(2) : 0;
    const registrationRate = totalClients > 0 ? (registered / totalClients * 100).toFixed(2) : 0;
    const conversionRate = abstractsSubmitted > 0 ? (registered / abstractsSubmitted * 100).toFixed(2) : 0;

    // Get email stats
    const emailsSent = await EmailLog.count({
      where: {
        conferenceId: id,
        status: 'sent',
        sentAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const emailsDelivered = await EmailLog.count({
      where: {
        conferenceId: id,
        status: 'delivered',
        sentAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const emailsOpened = await EmailLog.count({
      where: {
        conferenceId: id,
        status: 'opened',
        sentAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const emailsClicked = await EmailLog.count({
      where: {
        conferenceId: id,
        status: 'clicked',
        sentAt: { [Op.between]: [startDate, endDate] }
      }
    });

    const emailsBounced = await EmailLog.count({
      where: {
        conferenceId: id,
        status: 'bounced',
        sentAt: { [Op.between]: [startDate, endDate] }
      }
    });

    // Calculate email performance rates
    const openRate = emailsDelivered > 0 ? (emailsOpened / emailsDelivered * 100).toFixed(2) : 0;
    const clickRate = emailsOpened > 0 ? (emailsClicked / emailsOpened * 100).toFixed(2) : 0;
    const bounceRate = emailsSent > 0 ? (emailsBounced / emailsSent * 100).toFixed(2) : 0;
    const deliveryRate = emailsSent > 0 ? (emailsDelivered / emailsSent * 100).toFixed(2) : 0;

    // Get active follow-up jobs
    const activeFollowUps = await FollowUpJob.count({
      where: {
        conferenceId: id,
        status: 'active',
        paused: false
      }
    });

    const pausedFollowUps = await FollowUpJob.count({
      where: {
        conferenceId: id,
        status: 'active',
        paused: true
      }
    });

    const completedFollowUps = await FollowUpJob.count({
      where: {
        conferenceId: id,
        status: 'completed'
      }
    });

    // Get timeline data (last 30 days)
    const timelineStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const timeline = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(date.setHours(0, 0, 0, 0));
      const dayEnd = new Date(date.setHours(23, 59, 59, 999));

      const dailyClients = await Client.count({
        where: {
          conferenceId: id,
          createdAt: { [Op.between]: [dayStart, dayEnd] }
        }
      });

      const dailyAbstracts = await Client.count({
        where: {
          conferenceId: id,
          status: 'Abstract Submitted',
          updatedAt: { [Op.between]: [dayStart, dayEnd] }
        }
      });

      const dailyRegistrations = await Client.count({
        where: {
          conferenceId: id,
          status: 'Registered',
          updatedAt: { [Op.between]: [dayStart, dayEnd] }
        }
      });

      const dailyEmails = await EmailLog.count({
        where: {
          conferenceId: id,
          sentAt: { [Op.between]: [dayStart, dayEnd] }
        }
      });

      timeline.push({
        date: dayStart.toISOString().split('T')[0],
        clients: dailyClients,
        abstracts: dailyAbstracts,
        registrations: dailyRegistrations,
        emails: dailyEmails
      });
    }

    // Get top performing team members (if any clients have owners)
    const topPerformers = await Client.findAll({
      where: { 
        conferenceId: id,
        ownerUserId: { [Op.ne]: null }
      },
      attributes: [
        'ownerUserId',
        [Op.fn('COUNT', Op.col('id')), 'clientCount'],
        [Op.fn('COUNT', Op.literal("CASE WHEN status = 'Registered' THEN 1 END")), 'registeredCount']
      ],
      group: ['ownerUserId'],
      raw: true,
      limit: 5,
      order: [[Op.literal('registeredCount'), 'DESC']]
    });

    // Enrich with user data
    const performersWithData = await Promise.all(
      topPerformers.map(async (perf) => {
        const user = await User.findByPk(perf.ownerUserId, {
          attributes: ['id', 'name', 'email', 'role']
        });
        return {
          user: user ? {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role
          } : null,
          clientCount: parseInt(perf.clientCount),
          registeredCount: parseInt(perf.registeredCount),
          conversionRate: perf.clientCount > 0 ? (perf.registeredCount / perf.clientCount * 100).toFixed(2) : 0
        };
      })
    );

    // Get revenue data
    const revenueData = conference.revenue || {
      target: 0,
      actual: 0,
      currency: 'USD'
    };

    // Compile analytics response
    const analytics = {
      conference: {
        id: conference.id,
        name: conference.name,
        venue: conference.venue,
        startDate: conference.startDate,
        endDate: conference.endDate,
        status: conference.status
      },
      overview: {
        totalClients,
        abstractsSubmitted,
        registrations: registered,
        unresponsive,
        abstractSubmissionRate: parseFloat(abstractSubmissionRate),
        registrationRate: parseFloat(registrationRate),
        conversionRate: parseFloat(conversionRate)
      },
      emailPerformance: {
        sent: emailsSent,
        delivered: emailsDelivered,
        opened: emailsOpened,
        clicked: emailsClicked,
        bounced: emailsBounced,
        openRate: parseFloat(openRate),
        clickRate: parseFloat(clickRate),
        bounceRate: parseFloat(bounceRate),
        deliveryRate: parseFloat(deliveryRate)
      },
      followUps: {
        active: activeFollowUps,
        paused: pausedFollowUps,
        completed: completedFollowUps,
        total: activeFollowUps + pausedFollowUps + completedFollowUps
      },
      pipeline: {
        stages: stageCounts,
        statuses: statusCounts
      },
      revenue: {
        target: revenueData.target || 0,
        actual: revenueData.actual || 0,
        currency: revenueData.currency || 'USD',
        progress: revenueData.target > 0 ? (revenueData.actual / revenueData.target * 100).toFixed(2) : 0
      },
      timeline,
      topPerformers: performersWithData.filter(p => p.user !== null),
      period: {
        from: startDate.toISOString(),
        to: endDate.toISOString()
      }
    };

    console.log(`📊 Analytics generated for conference ${conference.name} (${req.user.role} ${req.user.email})`);
    res.json(analytics);
  } catch (error) {
    console.error('Error getting conference analytics:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT /api/analytics/conference/:id/metrics - Update conference metrics
router.put('/conference/:id/metrics', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { metrics, revenue } = req.body;

    // Check conference access
    const hasAccess = await checkConferenceAccess(id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to update this conference' });
    }

    const conference = await Conference.findByPk(id);
    if (!conference) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    // Update metrics if provided
    if (metrics) {
      await conference.update({ metrics });
    }

    // Update revenue if provided
    if (revenue) {
      await conference.update({ revenue });
    }

    console.log(`✅ Conference ${id} metrics updated by ${req.user.role} ${req.user.email}`);
    res.json({ message: 'Metrics updated successfully', conference });
  } catch (error) {
    console.error('Error updating conference metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to recalculate and update conference metrics
async function recalculateConferenceMetrics(conferenceId) {
  try {
    const conference = await Conference.findByPk(conferenceId);
    if (!conference) {
      return;
    }

    // Count clients by status
    const totalClients = await Client.count({ where: { conferenceId } });
    const abstractsSubmitted = await Client.count({ 
      where: { conferenceId, status: 'Abstract Submitted' } 
    });
    const registrations = await Client.count({ 
      where: { conferenceId, status: 'Registered' } 
    });

    // Count emails
    const emailsSent = await EmailLog.count({
      where: { conferenceId, status: 'sent' }
    });

    const emailsOpened = await EmailLog.count({
      where: { conferenceId, status: 'opened' }
    });

    const emailsClicked = await EmailLog.count({
      where: { conferenceId, status: 'clicked' }
    });

    // Calculate rates
    const openRate = emailsSent > 0 ? (emailsOpened / emailsSent * 100).toFixed(2) : 0;
    const clickRate = emailsOpened > 0 ? (emailsClicked / emailsOpened * 100).toFixed(2) : 0;
    const conversionRate = abstractsSubmitted > 0 ? (registrations / abstractsSubmitted * 100).toFixed(2) : 0;

    // Update conference metrics
    const updatedMetrics = {
      totalClients,
      abstractsSubmitted,
      registrations,
      emailsSent,
      openRate: parseFloat(openRate),
      clickRate: parseFloat(clickRate),
      conversionRate: parseFloat(conversionRate),
      lastUpdated: new Date().toISOString()
    };

    await conference.update({ metrics: updatedMetrics });
    console.log(`📊 Conference ${conferenceId} metrics recalculated: ${totalClients} clients, ${registrations} registered`);

    return updatedMetrics;
  } catch (error) {
    console.error('Error recalculating conference metrics:', error);
    return null;
  }
}

// POST /api/analytics/conference/:id/recalculate - Manually trigger metrics recalculation
router.post('/conference/:id/recalculate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check conference access
    const hasAccess = await checkConferenceAccess(id, req.user.id, req.user.role);
    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not have permission to update this conference' });
    }

    const metrics = await recalculateConferenceMetrics(id);
    if (!metrics) {
      return res.status(404).json({ error: 'Conference not found' });
    }

    console.log(`♻️ Conference ${id} metrics recalculated by ${req.user.role} ${req.user.email}`);
    res.json({ message: 'Metrics recalculated successfully', metrics });
  } catch (error) {
    console.error('Error recalculating metrics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export the recalculate function for use in other routes
module.exports = { 
  router, 
  recalculateConferenceMetrics 
};

