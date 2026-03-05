// controllers/clientController.js
const Client = require('../models/Client');

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
      nominee_address: req.body.nominee_address || '',
      nominee_phone: req.body.nominee_phone || '',
      staff_id: req.user.id,
      staff_name: req.user.name || req.user.username || 'Agent',
    };

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
  getClients
};