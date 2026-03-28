// controllers/paymentController.js
const Payment = require('../models/Payment');
const Client = require('../models/Client');
const Agent = require('../models/Agent');
const Manager = require('../models/Manager');
const Admin = require('../models/Admin');

// Helper: Fetch and populate collected staff name from ID based on role
// For new payments: uses collectedStaffId + collectedByRole
// For old payments: falls back to agent field, or tries to fetch from Manager/Admin if needed
const populateCollectedStaffName = async (payments) => {
  const staffCache = {}; // Cache to avoid repeated DB queries

  // Helper to try lookups across collections and cache results
  const lookupAndCache = async (role, id) => {
    if (!id) return null;
    const key = `${role}-${id}`;
    if (staffCache[key]) return staffCache[key];

    try {
      let rec = null;
      if (role === 'agent') rec = await Agent.findById(id).select('name username');
      else if (role === 'manager') rec = await Manager.findById(id).select('name username');
      else if (role === 'admin') rec = await Admin.findById(id).select('name username');

      const name = rec?.name || rec?.username || null;
      staffCache[key] = name || null;
      return staffCache[key];
    } catch (err) {
      staffCache[key] = null;
      return null;
    }
  };

  // Generic try-any-collection lookup (agent -> manager -> admin)
  const tryAnyCollection = async (id) => {
    if (!id) return null;
    const candidates = [ ['agent', id], ['manager', id], ['admin', id] ];
    for (let [role, rid] of candidates) {
      const name = await lookupAndCache(role, rid);
      if (name) return name;
    }
    return null;
  };

  for (let payment of payments) {
    // start with whatever is stored (keeps backward compatibility)
    let staffName = payment.collectedStaff || null;

    // 1) If we have an explicit staff ID + role, use it
    if (payment.collectedStaffId && payment.collectedByRole) {
      const name = await lookupAndCache(payment.collectedByRole, payment.collectedStaffId);
      if (name) {
        // don't append yet; suffix added in normalization below
        staffName = name;
      }
    }

    // 2) If still not resolved, try to use agent field (legacy payments may store manager/admin id there)
    if ((!staffName || staffName === 'Unknown' || staffName.toLowerCase() === (payment.collectedByRole || '').toLowerCase()) && payment.agent) {
      // agent could be populated object or an id
      const staffId = (payment.agent && payment.agent._id) ? payment.agent._id : payment.agent;

      // If collectedByRole exists, try that collection first
      if (payment.collectedByRole) {
        const name = await lookupAndCache(payment.collectedByRole, staffId);
        if (name) {
          staffName = name;
        } else {
          // fallback: try any collection
          const anyName = await tryAnyCollection(staffId);
          if (anyName) staffName = anyName;
        }
      } else {
        // no role info — try any collection
        const anyName = await tryAnyCollection(staffId);
        if (anyName) staffName = anyName;
      }
    }

    // 3) As a final fallback, if agent was populated with name/username use it
    if ((!staffName || staffName === 'Unknown') && payment.agent && (payment.agent.name || payment.agent.username)) {
      staffName = payment.agent.name || payment.agent.username;
    }

    // Default to existing collectedStaff value or a readable role label
    if (!staffName) {
      if (payment.collectedByRole) {
        const roleLabel = payment.collectedByRole.charAt(0).toUpperCase() + payment.collectedByRole.slice(1);
        staffName = payment.collectedStaff || roleLabel;
      } else {
        staffName = payment.collectedStaff || 'Unknown';
      }
    }

    // normalize suffix: ensure role is appended exactly once
    if (payment.collectedByRole) {
      const suffix = ` (${payment.collectedByRole})`;
      // strip any existing occurrences of the same suffix at end (use double backslashes for RegExp)
      const stripPattern = new RegExp(`\\s*\\(${payment.collectedByRole}\\)\\s*$`);
      staffName = staffName.replace(stripPattern, '');
      // staffName = staffName + suffix;
    }

    payment.collectedStaff = staffName;
  }

  return payments;
};

// @desc    Get all payments for agent (with due amounts)
// @route   GET /api/payments
const getPayments = async (req, res) => {
  try {
    const agentId = req.user.id;
    const agent = await Agent.findById(agentId);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Get all clients assigned to this agent with pending amounts
    const clients = await Client.find({ 
      assigned_agent: agentId,
      pending: { $gt: 0 } // Only clients with pending amount
    }).populate('assigned_agent', 'name username');

    // Get payment history for these clients (by client IDs)
    const clientIds = clients.map(c => c._id);
    let payments = [];
    if (clientIds.length > 0) {
      payments = await Payment.find({ client: { $in: clientIds } })
        .populate('client', 'name phone pending amount')
        .populate('agent', 'name username')
        .sort({ paymentDate: -1 });
    }

    // Populate collected staff names from IDs
    payments = await populateCollectedStaffName(payments);

    // Calculate total due amount
    const totalDue = clients.reduce((sum, client) => sum + (client.pending || 0), 0);

    res.json({
      success: true,
      data: {
        clients: clients.map(client => ({
          _id: client._id,
          name: client.name,
          phone: client.phone,
          amount: client.amount,
          pending: client.pending,
          received: client.received,
          status: client.status,
          duePercentage: ((client.pending / client.amount) * 100).toFixed(2)
        })),
        payments,
        stats: {
          totalClients: clients.length,
          totalDue,
          totalDueFormatted: `₹${totalDue.toLocaleString('en-IN')}`,
          averageDue: clients.length > 0 ? totalDue / clients.length : 0
        }
      }
    });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single client with due details
// @route   GET /api/payments/client/:clientId
const getClientDue = async (req, res) => {
  try {
    const { clientId } = req.params;
    const agentId = req.user.id;

    const client = await Client.findOne({ 
      _id: clientId, 
      assigned_agent: agentId 
    }).populate('assigned_agent', 'name username');

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found or not assigned to you'
      });
    }

    // Get payment history for this client
    let paymentHistory = await Payment.find({ 
      client: clientId
    }).populate('agent', 'name username').sort({ paymentDate: -1 });

    // Populate collected staff names from IDs
    paymentHistory = await populateCollectedStaffName(paymentHistory);

    res.json({
      success: true,
      data: {
        client: {
          _id: client._id,
          name: client.name,
          husband_name: client.husband_name,
          phone: client.phone,
          address: client.address,
          district: client.district,
          amount: client.amount,
          received: client.received,
          pending: client.pending,
          status: client.status,
          loan_start_date: client.loan_start_date,
          loan_end_date: client.loan_end_date
        },
        paymentHistory,
        dueAmount: client.pending,
        totalPaid: client.received,
        progress: ((client.received / client.amount) * 100).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Get client due error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Process payment
// @route   POST /api/payments/process
const processPayment = async (req, res) => {
  try {
    const { clientId, amount, paymentMethod = 'cash', notes = '' } = req.body;
    const agentId = req.user.id;

    // Validate amount
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid amount'
      });
    }

    // Find client by ID. If the client document includes an `agent` field,
    // ensure it matches the current agent. This keeps backwards
    // compatibility for clients without an `agent` property.
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    if (client.assigned_agent && client.assigned_agent.toString() !== agentId) {
      return res.status(404).json({
        success: false,
        message: 'Client not assigned to you'
      });
    }

    // Check if amount exceeds pending
    if (amount > client.pending) {
      return res.status(400).json({
        success: false,
        message: `Payment amount (₹${amount}) exceeds pending amount (₹${client.pending})`
      });
    }

    // Store previous due for record
    const previousDue = client.pending;

    // Update client
    client.received = (client.received || 0) + amount;
    client.pending = client.amount - client.received;
    
    // Update status
    if (client.pending <= 0) {
      client.status = 'paid';
    } else if (client.received > 0) {
      client.status = 'partial';
    }

    await client.save();

    // Create payment record
    const payment = await Payment.create({
      client: clientId,
      agent: agentId,
      amount,
      previousDue,
      remainingDue: client.pending,
      paymentMethod,
      notes
    });

    // Get user details based on role and store collected staff name and role
    let collectedByUser = null;
    const userRole = req.user.role;
    // middleware sets "id" not "_id"
    const userId = req.user.id;

    // lookup the collecting user so we can save a friendly name
    if (userRole === 'agent') {
      collectedByUser = await Agent.findById(userId).select('name username email');
    } else if (userRole === 'manager') {
      collectedByUser = await Manager.findById(userId).select('name username email');
    } else if (userRole === 'admin') {
      collectedByUser = await Admin.findById(userId).select('name username email');
    }

    if (collectedByUser) {
      // store only the name/username; role suffix will be appended later when results
      const displayName = collectedByUser.name || collectedByUser.username || '';
      payment.collectedStaff = displayName;
      payment.collectedStaffId = userId;
    } else {
      // fallback if lookup failed, will show role label later
      payment.collectedStaff = '';
    }

    // store the role separately as before
    payment.collectedByRole = userRole;
    await payment.save();

    // Populate client and agent details for response
    await payment.populate('client', 'name phone');
    await payment.populate('agent', 'name username email');

    // make sure the returned object has the role suffix as clients expect
    if (payment.collectedByRole) {
      const suffix = ` (${payment.collectedByRole})`;
      let ds = payment.collectedStaff || '';
      const stripPattern = new RegExp(`\\s*\\(${payment.collectedByRole}\\)\\s*$`);
      ds = ds.replace(stripPattern, '');
      payment.collectedStaff = ds + suffix;
    }

    res.json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        payment,
        client: {
          _id: client._id,
          name: client.name,
          amount: client.amount,
          received: client.received,
          pending: client.pending,
          status: client.status
        }
      }
    });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get payment history
// @route   GET /api/payments/history
const getPaymentHistory = async (req, res) => {
  try {
    const agentId = req.user.id;
    const { startDate, endDate, clientId } = req.query;

    // By default restrict results to the current agent for agent users.
    // Managers and admins may request history for a specific client (clientId)
    // so when a clientId is provided and the requester is manager/admin we
    // do not force the agent filter — this allows viewing payments collected
    // by different agents for that client. Agents still only see their own payments.
    let query = {};
    if (req.user.role === 'agent') {
      query.agent = agentId;
    }

    // Filter by client (allowed for all roles). If the requester is an agent
    // this narrows the agent-scoped results; for manager/admin it will return
    // all payments for the client across collectors.
    if (clientId) {
      query.client = clientId;
    }

    // Filter by date range
    if (startDate || endDate) {
      query.paymentDate = {};
      if (startDate) {
        query.paymentDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.paymentDate.$lte = new Date(endDate);
      }
    }

    let payments = await Payment.find(query)
      .populate('client', 'name phone')
      .populate('agent', 'name username email') // Populate agent details (collected by)
      .sort({ paymentDate: -1 });

    // Populate collected staff names from IDs
    payments = await populateCollectedStaffName(payments);

    // Calculate totals
    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        payments,
        stats: {
          totalPayments: payments.length,
          totalCollected,
          averagePayment: payments.length > 0 ? totalCollected / payments.length : 0
        }
      }
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get dashboard stats for agent
// @route   GET /api/payments/dashboard
const getDashboardStats = async (req, res) => {
  try {
    const agentId = req.user.id;

    // Get all clients assigned to agent
    const clients = await Client.find({ assigned_agent: agentId });

    // Calculate stats
    const totalClients = clients.length;
    const totalLoanAmount = clients.reduce((sum, c) => sum + c.amount, 0);
    const totalReceived = clients.reduce((sum, c) => sum + c.received, 0);
    const totalPending = clients.reduce((sum, c) => sum + c.pending, 0);

    // Status wise counts
    const paidClients = clients.filter(c => c.status === 'paid').length;
    const partialClients = clients.filter(c => c.status === 'partial').length;
    const pendingClients = clients.filter(c => c.status === 'pending').length;

    // Today's collections
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayPayments = await Payment.find({
      agent: agentId,
      paymentDate: { $gte: today }
    });

    const todayCollection = todayPayments.reduce((sum, p) => sum + p.amount, 0);

    // This month's collections
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthPayments = await Payment.find({
      agent: agentId,
      paymentDate: { $gte: startOfMonth }
    });

    const monthCollection = monthPayments.reduce((sum, p) => sum + p.amount, 0);

    res.json({
      success: true,
      data: {
        clients: {
          total: totalClients,
          paid: paidClients,
          partial: partialClients,
          pending: pendingClients
        },
        amounts: {
          totalLoan: totalLoanAmount,
          totalReceived,
          totalPending,
          collectionRate: totalLoanAmount > 0 ? ((totalReceived / totalLoanAmount) * 100).toFixed(2) : 0
        },
        collections: {
          today: todayCollection,
          thisMonth: monthCollection
        }
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all payments (Admin only)
// @route   GET /api/payments/admin/all
const getAllPayments = async (req, res) => {
  try {
    let payments = await Payment.find()
      .populate('client', 'name phone district landmark')
      .populate('agent', 'name username')
      .sort({ paymentDate: -1 });

    // Populate collected staff names from IDs
    payments = await populateCollectedStaffName(payments);

    const totalCollected = payments.reduce((sum, p) => sum + p.amount, 0);

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
    console.error('Get all payments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete/Cancel payment
// @route   DELETE /api/payments/:id
const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { clientId, amount } = req.body;

    // Find and delete payment
    const payment = await Payment.findByIdAndDelete(id);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Update client: decrease received and increase pending
    const client = await Client.findById(clientId);

    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    // Reverse the payment
    client.received = Math.max(0, (client.received || 0) - amount);
    client.pending = (client.amount || 0) - client.received;

    // Update status
    if (client.pending >= client.amount) {
      client.status = 'pending';
    } else if (client.pending > 0 && client.received > 0) {
      client.status = 'partial';
    } else if (client.pending <= 0) {
      client.status = 'paid';
    }

    await client.save();

    res.json({
      success: true,
      message: 'Payment cancelled successfully',
      data: {
        client: {
          _id: client._id,
          received: client.received,
          pending: client.pending,
          status: client.status
        }
      }
    });
  } catch (error) {
    console.error('Delete payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getPayments,
  getClientDue,
  processPayment,
  getPaymentHistory,
  getDashboardStats,
  getAllPayments,
  deletePayment,
  populateCollectedStaffName
};