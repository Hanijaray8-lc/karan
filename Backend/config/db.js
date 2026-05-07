const mongoose = require('mongoose');
const Admin = require('../models/Admin'); // உங்கள் Admin மாடல் இருக்கும் பாதை

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📂 Database: ${conn.connection.name}`);

    // --- Admin Seeding Logic Start ---
    // Avoid duplicate-key errors: search by username OR email, update if found
    const adminEmail = 'admin@gmail.com';
    const adminUsername = 'Karan finance';
    let adminExists = await Admin.findOne({ $or: [{ username: adminUsername }, { email: adminEmail }] });

    if (!adminExists) {
      // Store plaintext password (no hashing) — consider hashing for production
      await Admin.create({
        username: adminUsername,
        email: adminEmail,
        password: '080520',
        role: 'admin'
      });
      console.log(`🚀 Default Admin Created (User: ${adminUsername} / Pass: 080520)`);
    } else {
      // If an existing admin is found (by email or username), update username/password if needed
      let updated = false;
      if (adminExists.username !== adminUsername) {
        adminExists.username = adminUsername;
        updated = true;
      }
      if (adminExists.password !== '080520') {
        adminExists.password = '080520';
        updated = true;
      }
      if (updated) {
        await adminExists.save();
        console.log(`🔁 Default Admin updated to (User: ${adminUsername} / Pass: 080520)`);
      }
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