// models/Agent.js
const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  // Agent மட்டுமே - Manager இல்லை
  role: { 
    type: String, 
    enum: ['agent'], // Only agent
    default: 'agent' 
  },
  status: { type: String, default: 'Active' },
  profilePhoto: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  joinDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);
{/*const mongoose = require('mongoose');

const agentSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String },
  password: { type: String, required: true },
  // 'agent' அல்லது 'manager' என பிரிக்க இது உதவும்
  role: { 
    type: String, 
    enum: ['agent', ], 
    default: 'agent' 
  },
  status: { type: String, default: 'Active' },
  profilePhoto: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  joinDate: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Agent', agentSchema);*/}