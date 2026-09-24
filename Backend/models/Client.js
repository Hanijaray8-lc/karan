// models/Client.js
const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  clientId: {
    type: String,
    unique: true,
    sparse: true
  },

  name: {
    type: String,
    required: [true, 'Client name is required'],
    trim: true
  },
  
  husband_name: {
    type: String,
    trim: true
  },
  
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true
  },
  
  password: {
    type: String,
    default: '',
    trim: true
  },
  
  landmark: String,
  
  dispensary: {
    type: Date
  },
  
  address: {
    type: String,
    required: true
  },
  
  district: {
    type: String,
    required: true,
  },

  amount: { type: Number, required: true, min: 0 },
  received: { type: Number, default: 0, min: 0 },
  pending: { type: Number, default: 0 },

  loan_start_date: { type: Date, required: true },
  loan_end_date: { type: Date, required: true },
  distributed_amount_date: { type: Date },

  // Weekly installment calculation
  weekly_amount: { type: Number, default: 0, min: 0 },
  total_weeks: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },

  notes: String,

  nominee_name: String,
  nominee_husband: String,
  nominee_phone: String,
  nominee_address: String,
  // Assigned agent (optional) - reference and denormalized name for easy display
  assigned_agent: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' },
  assigned_agent_name: { type: String, default: '' },

  last_pushed_date: { type: String, default: '' },
}, {
  timestamps: true
});

module.exports = mongoose.model('Client', clientSchema);