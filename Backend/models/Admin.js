const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'admin' }, // இந்த வரி முக்கியம்
  faceDescriptor: { type: [Number], default: [] },
  faceRegistered: { type: Boolean, default: false },
  faceRegisteredAt: { type: Date, default: null },
  facePhoto: { type: String, default: '' } // Base64 or snapshot URL
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);