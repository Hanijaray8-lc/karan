// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const connectDB = require('./config/db');

// Routes Import
const authRoutes = require('./routes/authRoutes');
const agentRoutes = require('./routes/agentRoutes');
const clientRoutes = require('./routes/clientRoutes');
const adminRoutes = require('./routes/adminRoutes'); // NEW: Admin routes
const managerRoutes = require('./routes/managerRoutes'); 
const paymentRoutes = require('./routes/paymentRoutes');

const app = express();

// Connect to MongoDB
connectDB();

// 1. Middlewares
app.use(cors({
  origin: ['http://localhost:3000', 'https://localhost', 'http://localhost', process.env.FRONTEND_URL || ''].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 2. Static files (for profile photos etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 3. API Routes
app.use('/api/auth', authRoutes);        // Login
app.use('/api/agents', agentRoutes);      // Admin manages agents
app.use('/api/clients', clientRoutes);    // Admin adds clients with agent assignment
app.use('/api/admin', adminRoutes);       // NEW: Admin dashboard routes
app.use('/api/managers', managerRoutes);
app.use('/api/payments', paymentRoutes);


// 4. Health Check
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: 'Karan Finance API is running',
    status: 'active'
  });
});

// 5. 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    message: `Route not found: ${req.method} ${req.url}` 
  });
});

// 6. Global Error Handler
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🚀 API URL: http://localhost:${PORT}/api`);
});