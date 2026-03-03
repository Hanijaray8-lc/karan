// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const Agent = require('../models/Agent');
const Client = require('../models/Client');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get dashboard stats for admin
// @route   GET /api/admin/stats
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const totalAgents = await Agent.countDocuments();
    const totalClients = await Client.countDocuments();
    
    const totalLoanAmount = await Client.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    const totalReceived = await Client.aggregate([
      { $group: { _id: null, total: { $sum: '$received' } } }
    ]);

    const recentAgents = await Agent.find().sort({ createdAt: -1 }).limit(5);
    const recentClients = await Client.find().populate('agent', 'name username').sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      stats: {
        totalAgents,
        totalClients,
        totalLoanAmount: totalLoanAmount[0]?.total || 0,
        totalReceived: totalReceived[0]?.total || 0
      },
      recentAgents,
      recentClients
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc    Get all agents for dropdown
// @route   GET /api/admin/agents-list
router.get('/agents-list', protect, authorize('admin'), async (req, res) => {
  try {
    const agents = await Agent.find({ status: 'Active' })
      .select('_id name username email phone')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      agents
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;