const mongoose = require('mongoose');
const Admin = require('../models/Admin'); // உங்கள் Admin மாடல் இருக்கும் பாதை

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);

    // --- Admin Seeding Logic Start ---
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      // Store plaintext password (no hashing)
      await Admin.create({
        username: 'admin',
        email: 'admin@gmail.com',
        password: '123',
        role: 'admin' // உங்கள் மாடலில் ரோல் இருந்தால்
      });
      console.log('🚀 Default Admin Created (User: admin / Pass: 123)');
    }
    // --- Admin Seeding Logic End ---

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;