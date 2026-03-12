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
      role: role
    };

    res.json({
      success: true,
      token,
      user: userResponse
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
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