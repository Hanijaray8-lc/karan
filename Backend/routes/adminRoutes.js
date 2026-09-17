// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Agent = require('../models/Agent');
const Client = require('../models/Client');
const { protect, authorize } = require('../middleware/auth');

// @desc    Get dashboard stats for admin
// @route   GET /api/admin/stats
router.get('/stats', protect, authorize('admin'), async (req, res) => {
  try {
    const totalAgents = await Agent.countDocuments();
    const totalClients = await Client.countDocuments();
    
    const clientsList = await Client.find({}).lean();
    const totalLoanVal = clientsList.reduce((sum, c) => sum + (c.amount === 6900 ? 5000 : (c.amount || 0)), 0);
    const totalReceivedVal = clientsList.reduce((sum, c) => sum + (c.received || 0), 0);

    const recentAgents = await Agent.find().sort({ createdAt: -1 }).limit(5);
    const recentClients = await Client.find().populate('agent', 'name username').sort({ createdAt: -1 }).limit(5);

    res.json({
      success: true,
      stats: {
        totalAgents,
        totalClients,
        totalLoanAmount: totalLoanVal,
        totalReceived: totalReceivedVal
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

// @desc    Get Admin credentials and face registration status
// @route   GET /api/admin/credentials
router.get('/credentials', protect, authorize('admin'), async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id).select('-password');
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    res.json({
      success: true,
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        faceRegistered: Boolean(admin.faceRegistered && admin.faceDescriptor && admin.faceDescriptor.length > 0),
        faceRegisteredAt: admin.faceRegisteredAt,
        facePhoto: admin.facePhoto || ''
      }
    });
  } catch (err) {
    console.error('Get admin credentials error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc    Update Admin credentials (username, email, password)
// @route   PUT /api/admin/credentials
router.put('/credentials', protect, authorize('admin'), async (req, res) => {
  try {
    const { username, email, password, currentPassword } = req.body;
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    // Verify current password if provided or required
    if (currentPassword && currentPassword !== admin.password) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // If username is being changed, check uniqueness
    if (username && username.trim() !== admin.username) {
      const existing = await Admin.findOne({ 
        username: new RegExp(`^${username.trim()}$`, 'i'),
        _id: { $ne: admin._id } 
      });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
      admin.username = username.trim();
    }

    // If email is being changed, check uniqueness
    if (email && email.trim() !== admin.email) {
      const existingEmail = await Admin.findOne({ 
        email: new RegExp(`^${email.trim()}$`, 'i'),
        _id: { $ne: admin._id } 
      });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email is already registered' });
      }
      admin.email = email.trim();
    }

    // Update password if provided
    if (password && password.trim().length > 0) {
      admin.password = password.trim();
    }

    await admin.save();

    res.json({
      success: true,
      message: 'Admin credentials updated successfully',
      admin: {
        id: admin._id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
        faceRegistered: Boolean(admin.faceRegistered && admin.faceDescriptor && admin.faceDescriptor.length > 0),
        faceRegisteredAt: admin.faceRegisteredAt,
        facePhoto: admin.facePhoto || ''
      }
    });
  } catch (err) {
    console.error('Update admin credentials error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc    Register or Update Admin Face Descriptor
// @route   POST /api/admin/register-face
router.post('/register-face', protect, authorize('admin'), async (req, res) => {
  try {
    const { descriptor, photo } = req.body;

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid face descriptor data. Please scan again.' 
      });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    admin.faceDescriptor = descriptor.map(n => Number(n));
    admin.faceRegistered = true;
    admin.faceRegisteredAt = new Date();
    if (photo) {
      admin.facePhoto = photo;
    }

    await admin.save();

    res.json({
      success: true,
      message: 'Face registered successfully for Admin Face Login!',
      faceRegistered: true,
      faceRegisteredAt: admin.faceRegisteredAt,
      facePhoto: admin.facePhoto
    });
  } catch (err) {
    console.error('Face registration error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @desc    Delete registered face data
// @route   DELETE /api/admin/delete-face
router.delete('/delete-face', protect, authorize('admin'), async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin account not found' });
    }

    admin.faceDescriptor = [];
    admin.faceRegistered = false;
    admin.faceRegisteredAt = null;
    admin.facePhoto = '';

    await admin.save();

    res.json({
      success: true,
      message: 'Face registration removed successfully',
      faceRegistered: false
    });
  } catch (err) {
    console.error('Delete face registration error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;