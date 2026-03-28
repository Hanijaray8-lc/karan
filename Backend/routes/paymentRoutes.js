// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const {
  getPayments,
  getClientDue,
  processPayment,
  getPaymentHistory,
  getDashboardStats,
  getAllPayments,
  deletePayment,
  populateCollectedStaffName
} = require('../controllers/paymentController');

const { protect, authorize } = require('../middleware/auth');

// Test endpoint (no auth) - for debugging
router.get('/test/all', async (req, res) => {
  try {
    let payments = await Payment.find()
      .populate('client', 'name phone district landmark')
      .populate('agent', 'name username')
      .sort({ paymentDate: -1 });

    // Populate collected staff names from IDs
    payments = await populateCollectedStaffName(payments);

    const totalCollected = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

    res.json({
      success: true,
      data: {
        payments,
        stats: {
          totalPayments: payments.length,
          totalCollected
        }
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({ success: false, message: error.message, error: error.toString() });
  }
});

// All payment routes require authentication
router.use(protect);

// Admin routes (must come BEFORE parameterized routes)
router.get('/admin/all', authorize('admin'), getAllPayments);

// Agent routes
// payments can now be processed by agents, managers, or admins
// (managers/admins might need to mark payments manually during support/maintenance).
router.get('/', authorize('agent'), getPayments);
router.get('/dashboard', authorize('agent'), getDashboardStats);

// Get payment history for a specific client (path parameter) - MUST come before /history
router.get('/history/:clientId', authorize('agent', 'manager', 'admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    let query = { client: clientId };
    
    // Agents can only see payments they collected, managers/admins see all
    if (req.user.role === 'agent') {
      query.agent = req.user.id;
    }

    let payments = await Payment.find(query)
      .populate('client', 'name phone')
      .populate('agent', 'name username email')
      .sort({ paymentDate: -1 });

    // Populate collected staff names
    const { populateCollectedStaffName } = require('../controllers/paymentController');
    payments = await populateCollectedStaffName(payments);

    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      payments,
      total: payments.length,
      totalCollected
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Allow agents, managers and admins to query payment history with query params
router.get('/history', authorize('agent', 'manager', 'admin'), getPaymentHistory);
router.get('/client/:clientId', authorize('agent', 'admin', 'manager'), getClientDue);
// allow agents, managers, and admins to post payments
router.post('/process', authorize('agent', 'admin', 'manager'), processPayment);
// allow agents, managers, and admins to cancel/delete payments
router.delete('/:id', authorize('agent', 'manager', 'admin'), deletePayment);

module.exports = router;