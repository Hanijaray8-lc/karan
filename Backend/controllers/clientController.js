// controllers/clientController.js
const Client = require('../models/Client');
const Agent = require('../models/Agent');

// CREATE CLIENT
const createClient = async (req, res) => {
  console.log('✅ createClient function called');
  console.log('Request body:', req.body);
  console.log('User:', req.user);
  
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    // If an assigned agent id was provided, resolve its name for denormalized storage
    let assignedAgentId = req.body.assigned_agent || null;
    let assignedAgentName = '';
    if (assignedAgentId) {
      const agent = await Agent.findById(assignedAgentId);
      if (agent) assignedAgentName = agent.name || agent.username || '';
    }

    const clientData = {
      name: req.body.name,
      husband_name: req.body.husband_name,
      phone: req.body.phone,
      password: req.body.password || '',
      landmark: req.body.landmark || '',
      address: req.body.address,
      district: req.body.district,
      amount: parseFloat(req.body.amount) || 0,
      received: parseFloat(req.body.received) || 0,
      pending: parseFloat(req.body.pending) || 0,
      loan_start_date: req.body.loan_start_date,
      loan_end_date: req.body.loan_end_date,
      status: req.body.status || 'pending',
      notes: req.body.notes || '',
      nominee_name: req.body.nominee_name || '',
      nominee_husband: req.body.nominee_husband || '',
      nominee_address: req.body.nominee_address || '',
      nominee_phone: req.body.nominee_phone || '',
      staff_id: req.user.id,
      staff_name: req.user.name || req.user.username || 'Agent',
    };

    if (assignedAgentId) {
      clientData.assigned_agent = assignedAgentId;
      clientData.assigned_agent_name = assignedAgentName;
    }

    const client = new Client(clientData);
    const savedClient = await client.save();

    console.log('✅ Client saved successfully');

    return res.status(201).json({
      success: true,
      data: savedClient,
      message: 'Client created successfully'
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    
    return res.status(400).json({ 
      success: false,
      message: err.message || 'Failed to create client' 
    });
  }
};

// GET CLIENTS
const getClients = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not authenticated' 
      });
    }

    const clients = await Client.find({ staff_id: req.user.id }).sort({ created_at: -1 });
    const total = await Client.countDocuments({ staff_id: req.user.id });
    const totalReceived = await Client.aggregate([
      { $match: { staff_id: req.user.id } },
      { $group: { _id: null, total: { $sum: '$received' } } }
    ]);

    return res.json({
      success: true,
      clients,
      totalClients: total,
      totalAmount: totalReceived[0]?.total || 0,
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

module.exports = {
  createClient,
  getClients,
  getClientsByAgent,
  transferClient
};

// GET CLIENTS BY AGENT
const getClientsByAgent = async (req, res) => {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required'
      });
    }

    const clients = await Client.find({ assigned_agent: agentId }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      clients,
      total: clients.length
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// TRANSFER CLIENT FROM ONE AGENT TO ANOTHER
const transferClient = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_agent_id, new_agent_name } = req.body;

    if (!id || !new_agent_id) {
      return res.status(400).json({
        success: false,
        message: 'Client ID and new agent ID are required'
      });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const oldAgentId = client.assigned_agent;
    const oldAgentName = client.assigned_agent_name;

    // Update client with new agent
    client.assigned_agent = new_agent_id;
    client.assigned_agent_name = new_agent_name;

    // Store transfer history in notes or metadata
    const transferInfo = `\n[TRANSFERRED] From: ${oldAgentName || 'Unassigned'} → To: ${new_agent_name || 'Unknown'} on ${new Date().toLocaleDateString('en-IN')}`;
    client.notes = (client.notes || '') + transferInfo;

    const updatedClient = await client.save();

    return res.json({
      success: true,
      data: updatedClient,
      message: `Client transferred successfully from ${oldAgentName || 'Unassigned'} to ${new_agent_name}`
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};