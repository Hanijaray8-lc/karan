// models/Manager.js
const mongoose = require('mongoose');

const managerSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: [true, 'Username is required'], 
    unique: true,
    trim: true
  },
  name: { 
    type: String, 
    required: [true, 'Name is required'], 
    trim: true 
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'],
    trim: true
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'], 
    minlength: 6 
  },
  role: { 
    type: String, 
    default: 'manager', 
    enum: ['manager']
  },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive'], 
    default: 'Active' 
  },
  joinDate: { 
    type: Date, 
    default: Date.now 
  },
  addedBy: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Admin' 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Manager', managerSchema);