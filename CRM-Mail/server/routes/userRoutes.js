const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Conference, Client } = require('../models');
const { Op } = require('sequelize');

// JWT Secret from environment or default
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Helper function to handle Sequelize validation errors and return proper error responses
const handleSequelizeError = (error, res, defaultMessage = 'An error occurred') => {
  console.error('Database error:', error);
  
  // Handle Sequelize validation errors
  if (error.name === 'SequelizeValidationError') {
    const validationErrors = error.errors.map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
    
    // Create user-friendly error message
    const errorMessages = validationErrors.map(err => {
      const fieldName = err.field.charAt(0).toUpperCase() + err.field.slice(1).replace(/([A-Z])/g, ' $1');
      return `${fieldName}: ${err.message}`;
    });
    
    return res.status(400).json({
      error: 'Validation failed',
      message: errorMessages.join(', '),
      details: validationErrors
    });
  }
  
  // Handle unique constraint errors
  if (error.name === 'SequelizeUniqueConstraintError') {
    const field = error.errors?.[0]?.path || 'field';
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
    return res.status(400).json({
      error: 'Duplicate entry',
      message: `${fieldName} already exists. Please use a different value.`,
      field: field
    });
  }
  
  // Handle foreign key constraint errors
  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return res.status(400).json({
      error: 'Invalid reference',
      message: 'The referenced record does not exist. Please check your input.'
    });
  }
  
  // Handle database connection errors
  if (error.name === 'SequelizeConnectionError') {
    return res.status(503).json({
      error: 'Database connection error',
      message: 'Unable to connect to the database. Please try again later.'
    });
  }
  
  // Handle not null constraint errors
  if (error.name === 'SequelizeDatabaseError' && error.message?.includes('NOT NULL')) {
    const fieldMatch = error.message.match(/column "(\w+)"/);
    const field = fieldMatch ? fieldMatch[1] : 'field';
    const fieldName = field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1');
    return res.status(400).json({
      error: 'Required field missing',
      message: `${fieldName} is required. Please provide a value.`,
      field: field
    });
  }
  
  // Default error response
  return res.status(500).json({
    error: 'Internal server error',
    message: defaultMessage,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
};

// Middleware to check authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return res.status(403).json({ error: 'Invalid token', details: err.message });
    }
    req.user = user;
    next();
  });
};

// GET /api/users - Get all users
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { role, search, page = 1, limit = 50, isActive } = req.query;
    
    let whereClause = {};
    
    // Filter by role if provided
    if (role && role !== 'all') {
      whereClause.role = role;
    }

    if (typeof isActive !== 'undefined') {
      const isActiveBool = typeof isActive === 'string' ? isActive.toLowerCase() === 'true' : Boolean(isActive);
      whereClause.isActive = isActiveBool;
    }
    
    // Search functionality
    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Role-based access control
    if (req.user.role === 'TeamLead') {
      // Team leads can only see their subordinates
      whereClause.managerId = req.user.id;
    } else if (req.user.role === 'Member') {
      // Members can only see themselves
      whereClause.id = req.user.id;
    }
    
    const { count, rows: users } = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'name', 'email', 'role', 'phone', 'department', 'position', 'isActive', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });
    
    res.json({
      users,
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/users/:id - Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findByPk(id, {
      attributes: ['id', 'name', 'email', 'role', 'phone', 'department', 'jobTitle', 'isActive', 'createdAt', 'updatedAt']
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Access control
    if (req.user.role !== 'CEO' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// POST /api/users - Create new user
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Only CEO and TeamLead can create users
    if (req.user.role !== 'CEO' && req.user.role !== 'TeamLead') {
      return res.status(403).json({ error: 'Only CEO and Team Leads can create users' });
    }
    
    const { name, email, password, role, phone, department, jobTitle, position, managerId } = req.body;

    // TeamLead can only create Member users (hard enforcement)
    if (req.user.role === 'TeamLead' && role !== 'Member') {
      return res.status(403).json({ error: 'Team Leads can only create users with Member role' });
    }
    
    // Validate required fields
    if (!name || !name.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Name is required',
        field: 'name'
      });
    }
    
    if (!email || !email.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Email is required',
        field: 'email'
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Please enter a valid email address',
        field: 'email'
      });
    }
    
    if (!password || !password.trim()) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Password is required',
        field: 'password'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Password must be at least 6 characters long',
        field: 'password'
      });
    }
    
    if (!role) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Role is required',
        field: 'role'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.trim() } });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Duplicate entry',
        message: 'A user with this email already exists',
        field: 'email'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user without organizationId to avoid foreign key constraint
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: req.user.role === 'TeamLead' ? 'Member' : role,
      phone,
      department,
      position: position || jobTitle, // Handle both field names
      managerId: managerId || req.user.id,
      organizationId: null, // Set to null to avoid foreign key constraint
      isActive: true
    });
    
    // Return user without password
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      department: user.department,
      position: user.position, // Use position instead of jobTitle
      isActive: user.isActive,
      createdAt: user.createdAt
    };
    
    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    return handleSequelizeError(error, res, 'Failed to create user');
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, phone, department, jobTitle, isActive } = req.body;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Access control
    if (req.user.role !== 'CEO' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Validate fields if they are being updated
    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Name is required',
        field: 'name'
      });
    }
    
    if (email !== undefined) {
      if (!email || !email.trim()) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Email is required',
          field: 'email'
        });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({
          error: 'Validation failed',
          message: 'Please enter a valid email address',
          field: 'email'
        });
      }
      
      // Check if email is already taken by another user
      const existingUser = await User.findOne({ 
        where: { 
          email: email.trim(),
          id: { [Op.ne]: id }
        } 
      });
      if (existingUser) {
        return res.status(400).json({
          error: 'Duplicate entry',
          message: 'A user with this email already exists',
          field: 'email'
        });
      }
    }
    
    // Update user
    await user.update({
      name: name || user.name,
      email: email || user.email,
      role: role || user.role,
      phone: phone || user.phone,
      department: department || user.department,
      jobTitle: jobTitle || user.jobTitle,
      isActive: isActive !== undefined ? isActive : user.isActive
    });
    
    // Return user without password
    const userResponse = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      department: user.department,
      jobTitle: user.jobTitle,
      isActive: user.isActive,
      updatedAt: user.updatedAt
    };
    
    res.json({
      message: 'User updated successfully',
      user: userResponse
    });
  } catch (error) {
    return handleSequelizeError(error, res, 'Failed to update user');
  }
});

// DELETE /api/users/:id - Delete user
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    // Only CEO can delete users
    if (req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'Only CEO can delete users' });
    }
    
    const { id } = req.params;
    
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent deleting CEO
    if (user.role === 'CEO') {
      return res.status(400).json({ error: 'Cannot delete CEO user' });
    }
    
    await user.destroy();
    
    res.json({
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// GET /api/users/stats/overview - Get user statistics
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const totalUsers = await User.count();
    const ceoCount = await User.count({ where: { role: 'CEO' } });
    const teamLeadCount = await User.count({ where: { role: 'TeamLead' } });
    const memberCount = await User.count({ where: { role: 'Member' } });
    const activeUsers = await User.count({ where: { isActive: true } });
    
    res.json({
      totalUsers,
      ceoCount,
      teamLeadCount,
      memberCount,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers
    });
  } catch (error) {
    console.error('Error fetching user statistics:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT /api/users/:id/change-password - Change user password
router.put('/:id/change-password', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Access control - users can only change their own password, or CEO can change any password
    if (req.user.role !== 'CEO' && req.user.id !== id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await user.update({ password: hashedNewPassword });

    console.log(`✅ Password changed for user ${user.email} by ${req.user.email}`);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// PUT /api/users/:id/reset-password - Reset user password (no current password required)
router.put('/:id/reset-password', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Access control - only CEO can reset passwords
    if (req.user.role !== 'CEO') {
      return res.status(403).json({ error: 'Only CEO can reset user passwords' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await user.update({ password: hashedPassword });

    console.log(`✅ Password reset for user ${user.email} by ${req.user.email}`);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

module.exports = router;

