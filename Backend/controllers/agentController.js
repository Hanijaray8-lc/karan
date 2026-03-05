// controllers/agentController.js
const Agent = require('../models/Agent');
// passwords are stored in plain text per requirement (insecure) -- no hashing library needed


// @desc    Get all agents (only agents, not managers)
// @route   GET /api/agents
const getAgents = async (req, res) => {
  try {
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new agent (only agent role)
// @route   POST /api/agents
const createAgent = async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file);

    const { username, name, email, phone, password, status, department, commission } = req.body;

    if (!username || !name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Missing required fields: username, name, email, and password are required' });
    }

    const existingAgent = await Agent.findOne({ $or: [{ email }, { username }] });
    if (existingAgent) return res.status(400).json({ success: false, message: 'Agent with this email or username already exists' });

    // Directly store plaintext password
    const agentData = {
      username,
      name,
      email,
      phone: phone || '',
      password,
      status: status || 'Active',
      department: department || 'Field Agent',
      commission: commission ? parseInt(commission) : 0,
      role: 'agent'
    };

    if (req.file) agentData.profilePhoto = `/uploads/${req.file.filename}`;

    const agent = await Agent.create(agentData);
    const agentResponse = agent.toObject();
    delete agentResponse.password;

    res.status(201).json({ success: true, data: agentResponse, message: 'Agent created successfully' });
  } catch (error) {
    console.error('Create agent error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages.join(', ') });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ success: false, message: `${field} already exists` });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update agent
// @route   PUT /api/agents/:id
const updateAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });

    const { username, name, email, phone, password, status, department, commission } = req.body;
    if (username) agent.username = username;
    if (name) agent.name = name;
    if (email) agent.email = email;
    if (phone !== undefined) agent.phone = phone;
    if (status) agent.status = status;
    if (department) agent.department = department;
    if (commission !== undefined) agent.commission = parseInt(commission);

    if (password) {
      // store new plaintext password
      agent.password = password;
    }

    if (req.file) agent.profilePhoto = `/uploads/${req.file.filename}`;

    const updatedAgent = await agent.save();
    const agentResponse = updatedAgent.toObject();
    delete agentResponse.password;

    res.json({ success: true, data: agentResponse, message: 'Agent updated successfully' });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete agent
// @route   DELETE /api/agents/:id
const deleteAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    await agent.deleteOne();
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single agent
// @route   GET /api/agents/:id
const getAgentById = async (req, res) => {
  try {
    // send password field so UI can display it
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    res.json({ success: true, data: agent });
  } catch (error) {
    console.error('Get agent by id error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get agents by department
// @route   GET /api/agents/department/:dept
const getAgentsByDepartment = async (req, res) => {
  try {
    const agents = await Agent.find({ department: req.params.dept, status: 'Active' }).sort({ name: 1 }).select('-password');
    res.json({ success: true, data: agents });
  } catch (error) {
    console.error('Get agents by department error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset agent password (generate a temporary password and return it once)
// @route   POST /api/agents/:id/reset-password
const resetAgentPassword = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ success: false, message: 'Agent not found' });
    const tempPassword = Math.random().toString(36).slice(-8);
    // store temporary plaintext password
    agent.password = tempPassword;
    await agent.save();
    res.json({ success: true, password: tempPassword, message: 'Temporary password generated' });
  } catch (error) {
    console.error('Reset agent password error:', error);
    res.status(500).json({ success: false, message: error.message });
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
    const newThisMonth = await Agent.countDocuments({ role: 'agent', joinDate: { $gte: startOfMonth } });
    res.json({ success: true, stats: { totalAgents, activeAgents, onLeaveAgents, inactiveAgents, newThisMonth } });
  } catch (error) {
    console.error('Get agent stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  getAgentById,
  getAgentsByDepartment,
  resetAgentPassword,
  getAgentStats
};

