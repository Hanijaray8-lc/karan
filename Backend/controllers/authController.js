// controllers/authController.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Agent = require('../models/Agent');
const Manager = require('../models/Manager'); // Add Manager model
// passwords stored plaintext, bcrypt not required

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    let user = null;
    let role = null;

    // Case-insensitive regex query to match username regardless of case in database
    const usernameRegex = new RegExp(`^${username}$`, 'i');

    // 1. Check Admin table
    user = await Admin.findOne({ username: usernameRegex });
    if (user) {
      role = 'admin';
    }

    // 2. If not admin, check Manager table
    if (!user) {
      user = await Manager.findOne({ username: usernameRegex });
      if (user) {
        role = 'manager';
      }
    }

    // 3. If not manager, check Agent table
    if (!user) {
      user = await Agent.findOne({ username: usernameRegex });
      if (user) {
        role = 'agent';
      }
    }

    // 4. If no user found
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // 5. Compare Password (plaintext)
    if (password !== user.password) {
      return res.status(401).json({ success: false, message: 'Invalid Password' });
    }

    // Check if account is Inactive or Rejected
    if (user.status === 'Inactive' || user.status === 'Rejected') {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated or rejected. Please contact Admin or Manager.' 
      });
    }

    // Track agent login attempt & trigger approval request on every agent login
    if (role === 'agent') {
      user.status = 'Pending';
      user.loginRequested = true;
      user.lastLoginAttempt = new Date();
      await user.save();
    }

    const userStatus = user.status || (role === 'admin' ? 'Active' : 'Pending');

    // 6. Generate Token with Role
    const token = jwt.sign(
      { 
        id: user._id, 
        role: role,
        model: role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Agent'
      },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1d' }
    );

    // 7. Remove password from response
    const userResponse = {
      id: user._id,
      username: user.username,
      name: user.name || user.username,
      email: user.email,
      role: role,
      status: userStatus
    };

    res.json({
      success: true,
      token,
      user: userResponse,
      isPending: userStatus === 'Pending'
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// Helper: Calculate Euclidean distance between two descriptor vectors
function getEuclideanDistance(desc1, desc2) {
  if (!desc1 || !desc2 || desc1.length !== desc2.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// @desc    Face Biometric Login for Admin & Manager
// @route   POST /api/auth/face-login
exports.faceLogin = async (req, res) => {
  try {
    const { descriptor } = req.body;

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return res.status(400).json({
        success: false,
        message: 'Invalid face biometric data. Please look directly at the camera and scan again.'
      });
    }

    // Find all admins and managers who have face registration
    const [admins, managers] = await Promise.all([
      Admin.find({ 
        faceRegistered: true,
        faceDescriptor: { $exists: true, $ne: [] }
      }),
      Manager.find({ 
        faceRegistered: true,
        faceDescriptor: { $exists: true, $ne: [] }
      })
    ]);

    if ((!admins || admins.length === 0) && (!managers || managers.length === 0)) {
      return res.status(401).json({
        success: false,
        message: 'No registered face biometrics found in database. Please register your face first or use password login.'
      });
    }

    const inputDesc = descriptor.map(n => Number(n));
    let matchedUser = null;
    let matchedRole = null;
    let minDistance = 1.0;
    const MATCH_THRESHOLD = 0.55; // Standard recommended face-api distance threshold

    // Check Admins
    for (const admin of admins) {
      if (admin.faceDescriptor && admin.faceDescriptor.length === 128) {
        const dist = getEuclideanDistance(inputDesc, admin.faceDescriptor);
        if (dist < minDistance) {
          minDistance = dist;
          if (dist < MATCH_THRESHOLD) {
            matchedUser = admin;
            matchedRole = 'admin';
          }
        }
      }
    }

    // Check Managers
    for (const manager of managers) {
      if (manager.faceDescriptor && manager.faceDescriptor.length === 128) {
        const dist = getEuclideanDistance(inputDesc, manager.faceDescriptor);
        if (dist < minDistance) {
          minDistance = dist;
          if (dist < MATCH_THRESHOLD) {
            matchedUser = manager;
            matchedRole = 'manager';
          }
        }
      }
    }

    if (!matchedUser) {
      return res.status(401).json({
        success: false,
        message: 'Face not recognized. Please ensure good lighting and look straight at the camera.'
      });
    }

    // Check if account is Inactive
    if (matchedUser.status === 'Inactive') {
      return res.status(403).json({ 
        success: false, 
        message: 'Your account has been deactivated. Please contact Admin.' 
      });
    }

    const userStatus = matchedUser.status || (matchedRole === 'admin' ? 'Active' : 'Pending');

    // Generate JWT token for matched user
    const token = jwt.sign(
      {
        id: matchedUser._id,
        role: matchedRole,
        model: matchedRole === 'admin' ? 'Admin' : 'Manager'
      },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1d' }
    );

    const userResponse = {
      id: matchedUser._id,
      username: matchedUser.username,
      name: matchedUser.name || matchedUser.username,
      email: matchedUser.email,
      role: matchedRole,
      status: userStatus
    };

    const roleTitle = matchedRole === 'admin' ? 'Admin' : 'Manager';

    return res.json({
      success: true,
      message: `Face verification successful! Welcome ${roleTitle}.`,
      token,
      user: userResponse,
      isPending: userStatus === 'Pending'
    });
  } catch (err) {
    console.error('Face login error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Server error during face login'
    });
  }
};

// @desc    Check current authenticated user status (for live approval polling)
// @route   GET /api/auth/check-status
exports.checkStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    let user = null;

    if (role === 'admin') {
      user = await Admin.findById(userId);
    } else if (role === 'manager') {
      user = await Manager.findById(userId);
    } else if (role === 'agent') {
      user = await Agent.findById(userId);
    }

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const currentStatus = user.status || (role === 'admin' ? 'Active' : 'Pending');

    res.json({
      success: true,
      status: currentStatus,
      role: role,
      user: {
        id: user._id,
        username: user.username,
        name: user.name || user.username,
        email: user.email,
        role: role,
        status: currentStatus
      }
    });
  } catch (err) {
    console.error('Check status error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// @desc    Logout user & reset agent status to Pending
// @route   POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    if (req.user && req.user.role === 'agent') {
      await Agent.findByIdAndUpdate(req.user.id, {
        status: 'Pending',
        loginRequested: false
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message || 'Logout failed' 
    });
  }
};
{/*const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Agent = require('../models/Agent');
const Manager = require('../models/Manager'); 
const bcrypt = require('bcryptjs');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const lowerUsername = username.toLowerCase();

    // 1. Check Admin table first
    let user = await Admin.findOne({ username: lowerUsername });
    let role = 'admin';

    // 2. If not admin, check Agent/Manager table
    if (!user) {
      user = await Agent.findOne({ username: lowerUsername });
      if (user) role = user.role; // can be 'manager' or 'agent'
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // 3. Compare Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid Password' });
    }

    // 4. Generate Token with Role
    const token = jwt.sign(
      { id: user._id, role: role },
      process.env.JWT_SECRET || 'secret123',
      { expiresIn: '1d' }
    );

    res.json({
      success: true,
      token,
      user: { id: user._id, username: user.username, role: role }
    });

  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};*/}