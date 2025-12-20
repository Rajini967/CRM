const { User, Role } = require('../models');

/**
 * Role-based access control middleware
 * Implements hierarchical permissions: CEO -> TeamLead -> Member
 */
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

    const user = await User.findByPk(req.user.id, {
      include: [
        { model: Role, as: 'roleDetails' },
        { model: User, as: 'manager' }
      ]
    });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      // Check if user has required role
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ 
          error: 'Insufficient permissions',
          required: allowedRoles,
          current: user.role
        });
      }

      // Add user hierarchy info to request
      req.user.hierarchyLevel = user.hierarchyLevel;
      req.user.managerId = user.managerId;
      req.user.roleDetails = user.roleDetails;

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
};

/**
 * Check if user can access conference data
 * CEO: can access all conferences
 * TeamLead: can access conferences where they are primary contact or have subordinates assigned
 * Member: can only access conferences where they have assigned clients
 */
const requireConferenceAccess = async (req, res, next) => {
  try {
    const conferenceId = req.params.conferenceId || req.query.conferenceId || req.body.conferenceId;
    
    if (!conferenceId) {
      return res.status(400).json({ error: 'Conference ID required' });
    }

    const user = await User.findByPk(req.user.id, {
      include: [
        { model: User, as: 'subordinates' }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // CEO can access all conferences
    if (user.role === 'CEO') {
      return next();
    }

    // TeamLead can access conferences where they are primary contact or have subordinates
    if (user.role === 'TeamLead') {
      const hasAccess = await checkTeamLeadConferenceAccess(user.id, conferenceId);
      if (hasAccess) {
        return next();
      }
    }

    // Member can only access conferences where they have assigned clients
    if (user.role === 'Member') {
      const hasAccess = await checkMemberConferenceAccess(user.id, conferenceId);
      if (hasAccess) {
        return next();
      }
    }

    return res.status(403).json({ 
      error: 'Access denied to this conference',
      conferenceId 
    });

  } catch (error) {
    console.error('Conference access check error:', error);
    res.status(500).json({ error: 'Conference access check failed' });
  }
};

/**
 * Check if user can manage another user
 * CEO: can manage everyone
 * TeamLead: can manage Members under them
 * Member: cannot manage anyone
 */
const requireUserManagement = (action = 'view') => {
  return async (req, res, next) => {
    try {
      const targetUserId = req.params.userId || req.params.id;
      const currentUser = await User.findByPk(req.user.id);

      if (!currentUser) {
        return res.status(401).json({ error: 'User not found' });
      }

      // CEO can manage everyone
      if (currentUser.role === 'CEO') {
        return next();
      }

      // TeamLead can manage Members under them
      if (currentUser.role === 'TeamLead') {
        const targetUser = await User.findByPk(targetUserId);
        if (targetUser && targetUser.managerId === currentUser.id) {
          return next();
        }
      }

      // Members cannot manage anyone
      return res.status(403).json({ 
        error: `Insufficient permissions to ${action} user`,
        action,
        targetUserId 
      });

    } catch (error) {
      console.error('User management check error:', error);
      res.status(500).json({ error: 'User management check failed' });
    }
  };
};

/**
 * Helper function to check TeamLead conference access
 */
async function checkTeamLeadConferenceAccess(userId, conferenceId) {
  const { Conference, Client } = require('../models');
  
  // Check if user is primary contact for conference
  const isPrimaryContact = await Conference.findOne({
    where: { id: conferenceId, primaryContactUserId: userId }
  });

  if (isPrimaryContact) return true;

  // Check if any subordinates have clients in this conference
  const hasSubordinateClients = await Client.findOne({
    where: { 
      conferenceId,
      ownerUserId: {
        [require('sequelize').Op.in]: await getSubordinateIds(userId)
      }
    }
  });

  return !!hasSubordinateClients;
}

/**
 * Helper function to check Member conference access
 */
async function checkMemberConferenceAccess(userId, conferenceId) {
  const { Client } = require('../models');
  
  // Check if user has clients in this conference
  const hasClients = await Client.findOne({
    where: { 
      conferenceId,
      ownerUserId: userId
    }
  });

  return !!hasClients;
}

/**
 * Get all subordinate user IDs for a TeamLead
 */
async function getSubordinateIds(userId) {
  const subordinates = await User.findAll({
    where: { managerId: userId },
    attributes: ['id']
  });
  
  return subordinates.map(sub => sub.id);
}

/**
 * Check if user can access client data
 * CEO: can access all clients
 * TeamLead: can access clients assigned to them or their subordinates
 * Member: can only access clients assigned to them
 */
const requireClientAccess = async (req, res, next) => {
  try {
    const clientId = req.params.clientId || req.params.id;
    const currentUser = await User.findByPk(req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: 'User not found' });
    }

    // CEO can access all clients
    if (currentUser.role === 'CEO') {
      return next();
    }

    // For TeamLead and Member, check client ownership
    const { Client } = require('../models');
    const client = await Client.findByPk(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // TeamLead can access clients assigned to them or their subordinates
    if (currentUser.role === 'TeamLead') {
      const subordinateIds = await getSubordinateIds(currentUser.id);
      if (client.ownerUserId === currentUser.id || subordinateIds.includes(client.ownerUserId)) {
        return next();
      }
    }

    // Member can only access clients assigned to them
    if (currentUser.role === 'Member' && client.ownerUserId === currentUser.id) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Access denied to this client',
      clientId 
    });

  } catch (error) {
    console.error('Client access check error:', error);
    res.status(500).json({ error: 'Client access check failed' });
  }
};

module.exports = {
  requireRole,
  requireConferenceAccess,
  requireUserManagement,
  requireClientAccess
};
