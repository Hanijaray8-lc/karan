const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin'); // உங்கள் Admin மாடல் இருக்கும் பாதை

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);

    // --- Admin Seeding Logic Start ---
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      // 123 என்பதை ஹேஷ் (Hash) செய்து சேமிக்கிறோம்
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('123', salt);

      await Admin.create({
        username: 'admin',
        email: 'admin@gmail.com',
        password: hashedPassword,
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