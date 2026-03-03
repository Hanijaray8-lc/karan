// controllers/agentController.js
const Agent = require('../models/Agent');
const bcrypt = require('bcryptjs');

// @desc    Get all agents (only agents, not managers)
// @route   GET /api/agents
const getAgents = async (req, res) => {
  try {
    // Find only users with role 'agent'
    const agents = await Agent.find({ role: 'agent' }).sort({ joinDate: -1 });
    
    const totalAgents = await Agent.countDocuments({ role: 'agent' });
    const activeAgents = await Agent.countDocuments({ role: 'agent', status: 'Active' });
    const onLeaveAgents = await Agent.countDocuments({ role: 'agent', status: 'On Leave' });
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = await Agent.countDocuments({
      role: 'agent',
      joinDate: { $gte: startOfMonth }
    });

    // Department-wise stats
    const departmentStats = await Agent.aggregate([
      { $match: { role: 'agent' } },
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      agents,
      stats: {
        totalAgents,
        activeAgents,
        onLeaveAgents,
        newThisMonth,
        departmentStats
      }
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create new agent (only agent role)
// @route   POST /api/agents
const createAgent = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    const { username, name, email, phone, password, status, department, commission } = req.body;

    // Validate required fields
    if (!username || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, name, email, and password are required'
      });
    }

    // Check if agent exists
    const existingAgent = await Agent.findOne({
      $or: [{ email }, { username }]
    });

    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this email or username already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create agent data object - force role as 'agent'
    const agentData = {
      username,
      name,
      email,
      phone: phone || '',
      password: hashedPassword,
      status: status || 'Active',
      department: department || 'Field Agent',
      commission: commission ? parseInt(commission) : 0,
      role: 'agent' // Force agent role
    };

    // Add profile photo if uploaded
    if (req.file) {
      agentData.profilePhoto = `/uploads/${req.file.filename}`;
    }

    console.log('Creating agent with data:', agentData);
    
    // Create agent
    const agent = await Agent.create(agentData);

    // Remove password from response
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    res.status(201).json({
      success: true,
      data: agentResponse,
      message: 'Agent created successfully'
    });
  } catch (error) {
    console.error('Create agent error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    // Handle duplicate key error
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

// @desc    Update agent
// @route   PUT /api/agents/:id
const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    const { username, name, email, phone, password, status, department, commission } = req.body;

    // Update fields
    if (username) agent.username = username;
    if (name) agent.name = name;
    if (email) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (status) agent.status = status;
    if (department) agent.department = department;
    if (commission !== undefined) agent.commission = parseInt(commission);

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      agent.password = await bcrypt.hash(password, salt);
    }

    // Update profile photo if provided
    if (req.file) {
      agent.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const updatedAgent = await agent.save();
    
    // Remove password from response
    const agentResponse = updatedAgent.toObject();
    delete agentResponse.password;

    res.json({
      success: true,
      data: agentResponse,
      message: 'Agent updated successfully'
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete agent
// @route   DELETE /api/agents/:id
const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    await agent.deleteOne();
    
    res.json({ 
      success: true, 
      message: 'Agent deleted successfully' 
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single agent
// @route   GET /api/agents/:id
const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id).select('-password');
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    console.error('Get agent by id error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get agents by department
// @route   GET /api/agents/department/:dept
const getAgentsByDepartment = async (req, res) => {
  try {
    const agents = await Agent.find({ 
      department: req.params.dept,
      status: 'Active',
      role: 'agent'
    }).sort({ name: 1 }).select('-password');
    
    res.json({
      success: true,
      data: agents
    });
  } catch (error) {
    console.error('Get agents by department error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get agent stats
// @route   GET /api/agents/stats
const getAgentStats = async (req, res) => {
  try {
    const totalAgents = await Agent.countDocuments({ role: 'agent' });
    const activeAgents = await Agent.countDocuments({ role: 'agent', status: 'Active' });
    const onLeaveAgents = await Agent.countDocuments({ role: 'agent', status: 'On Leave' });
    const inactiveAgents = await Agent.countDocuments({ role: 'agent', status: 'Inactive' });
    
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = await Agent.countDocuments({
      role: 'agent',
      joinDate: { $gte: startOfMonth }
    });

    res.json({
      success: true,
      stats: {
        totalAgents,
        activeAgents,
        onLeaveAgents,
        inactiveAgents,
        newThisMonth
      }
    });
  } catch (error) {
    console.error('Get agent stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentById,
  getAgentsByDepartment,
  getAgentStats
};
{/*const Agent = require('../models/Agent');
const bcrypt = require('bcryptjs');

// @desc    Get all agents
// @route   GET /api/agents
const getAgents = async (req, res) => {
  try {
    const agents = await Agent.find().sort({ joinDate: -1 });
    
    // Get stats for Karan Finance
    const totalAgents = await Agent.countDocuments();
    const activeAgents = await Agent.countDocuments({ status: 'Active' });
    const onLeaveAgents = await Agent.countDocuments({ status: 'On Leave' });
    
    // Get new agents this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const newThisMonth = await Agent.countDocuments({
      joinDate: { $gte: startOfMonth }
    });

    // Department-wise stats
    const departmentStats = await Agent.aggregate([
      {
        $group: {
          _id: '$department',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      agents,
      stats: {
        totalAgents,
        activeAgents,
        onLeaveAgents,
        newThisMonth,
        departmentStats
      }
    });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create new agent
// @route   POST /api/agents
const createAgent = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);
    
    const { username, name, email, phone, password, status, department, commission } = req.body;

    // Validate required fields
    if (!username || !name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: username, name, email, and password are required'
      });
    }

    // Check if agent exists
    const existingAgent = await Agent.findOne({
      $or: [{ email }, { username }]
    });

    if (existingAgent) {
      return res.status(400).json({
        success: false,
        message: 'Agent with this email or username already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create agent data object
    const agentData = {
      username,
      name,
      email,
      phone: phone || '',
      password: hashedPassword,
      status: status || 'Active',
      department: department || 'Field Agent',
      commission: commission ? parseInt(commission) : 0,
    };

    // Add profile photo if uploaded
    if (req.file) {
      agentData.profilePhoto = `/uploads/${req.file.filename}`;
    }

    console.log('Creating agent with data:', agentData);
    
    // Create agent
    const agent = await Agent.create(agentData);

    res.status(201).json({
      success: true,
      data: agent,
      message: 'Agent created successfully'
    });
  } catch (error) {
    console.error('Create agent error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    
    // Handle duplicate key error
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

// @desc    Update agent
// @route   PUT /api/agents/:id
const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    const { username, name, email, phone, password, status, department, commission } = req.body;

    // Update fields
    if (username) agent.username = username;
    if (name) agent.name = name;
    if (email) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (status) agent.status = status;
    if (department) agent.department = department;
    if (commission !== undefined) agent.commission = parseInt(commission);

    // Update password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      agent.password = await bcrypt.hash(password, salt);
    }

    // Update profile photo if provided
    if (req.file) {
      agent.profilePhoto = `/uploads/${req.file.filename}`;
    }

    const updatedAgent = await agent.save();
    
    res.json({
      success: true,
      data: updatedAgent,
      message: 'Agent updated successfully'
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete agent
// @route   DELETE /api/agents/:id
const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    await agent.deleteOne();
    
    res.json({ 
      success: true, 
      message: 'Agent deleted successfully' 
    });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single agent
// @route   GET /api/agents/:id
const getAgentById = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    
    if (!agent) {
      return res.status(404).json({ 
        success: false, 
        message: 'Agent not found' 
      });
    }

    res.json({
      success: true,
      data: agent
    });
  } catch (error) {
    console.error('Get agent by id error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get agents by department
// @route   GET /api/agents/department/:dept
const getAgentsByDepartment = async (req, res) => {
  try {
    const agents = await Agent.find({ 
      department: req.params.dept,
      status: 'Active'
    }).sort({ name: 1 });
    
    res.json({
      success: true,
      data: agents
    });
  } catch (error) {
    console.error('Get agents by department error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

module.exports = {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentById,
  getAgentsByDepartment,
};*/}