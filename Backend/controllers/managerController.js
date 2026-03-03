// controllers/managerController.js
const Manager = require('../models/Manager');
const bcrypt = require('bcryptjs');

// @desc    Get all managers
// @route   GET /api/managers
const getManagers = async (req, res) => {
  try {
    const managers = await Manager.find().sort({ createdAt: -1 });
    
    const totalManagers = await Manager.countDocuments();
    const activeManagers = await Manager.countDocuments({ status: 'Active' });
    const inactiveManagers = await Manager.countDocuments({ status: 'Inactive' });

    res.json({
      success: true,
      managers,
      stats: {
        totalManagers,
        activeManagers,
        inactiveManagers
      }
    });
  } catch (error) {
    console.error('Get managers error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create new manager
// @route   POST /api/managers
const createManager = async (req, res) => {
  try {
    const { username, name, email, phone, password, status } = req.body;

    // Validate required fields
    if (!username || !name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, name, email, phone, and password are required'
      });
    }

    // Check if manager exists
    const existingManager = await Manager.findOne({
      $or: [{ email }, { username }]
    });

    if (existingManager) {
      return res.status(400).json({
        success: false,
        message: 'Manager with this email or username already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create manager
    const manager = await Manager.create({
      username,
      name,
      email,
      phone,
      password: hashedPassword,
      status: status || 'Active',
      addedBy: req.user.id // Admin ID who added
    });

    // Remove password from response
    const managerResponse = manager.toObject();
    delete managerResponse.password;

    res.status(201).json({
      success: true,
      data: managerResponse,
      message: 'Manager created successfully'
    });
  } catch (error) {
    console.error('Create manager error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update manager
// @route   PUT /api/managers/:id
const updateManager = async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id);

    if (!manager) {
      return res.status(404).json({ 
        success: false, 
        message: 'Manager not found' 
      });
    }

    const { username, name, email, phone, password, status } = req.body;

    // Update fields
    if (username) manager.username = username;
    if (name) manager.name = name;
    if (email) manager.email = email;
    if (phone) manager.phone = phone;
    if (status) manager.status = status;

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      manager.password = await bcrypt.hash(password, salt);
    }

    const updatedManager = await manager.save();
    
    // Remove password from response
    const managerResponse = updatedManager.toObject();
    delete managerResponse.password;

    res.json({
      success: true,
      data: managerResponse,
      message: 'Manager updated successfully'
    });
  } catch (error) {
    console.error('Update manager error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete manager
// @route   DELETE /api/managers/:id
const deleteManager = async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id);

    if (!manager) {
      return res.status(404).json({ 
        success: false, 
        message: 'Manager not found' 
      });
    }

    await manager.deleteOne();
    
    res.json({ 
      success: true, 
      message: 'Manager deleted successfully' 
    });
  } catch (error) {
    console.error('Delete manager error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single manager
// @route   GET /api/managers/:id
const getManagerById = async (req, res) => {
  try {
    const manager = await Manager.findById(req.params.id).select('-password');
    
    if (!manager) {
      return res.status(404).json({ 
        success: false, 
        message: 'Manager not found' 
      });
    }

    res.json({
      success: true,
      data: manager
    });
  } catch (error) {
    console.error('Get manager by id error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get manager stats
// @route   GET /api/managers/stats
const getManagerStats = async (req, res) => {
  try {
    const totalManagers = await Manager.countDocuments();
    const activeManagers = await Manager.countDocuments({ status: 'Active' });
    const inactiveManagers = await Manager.countDocuments({ status: 'Inactive' });
    
    // New managers this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = await Manager.countDocuments({
      createdAt: { $gte: startOfMonth }
    });

    res.json({
      success: true,
      stats: {
        totalManagers,
        activeManagers,
        inactiveManagers,
        newThisMonth
      }
    });
  } catch (error) {
    console.error('Get manager stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = {
  getManagers,
  createManager,
  updateManager,
  deleteManager,
  getManagerById,
  getManagerStats
};