// routes/clientRoutes.js
const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const { protect, authorize } = require('../middleware/auth');

// Helper function to calculate weekly installment
function calculateWeeklyInstallment(loanStartDate, loanEndDate, pendingAmount) {
  // Require at least a loan start date
  if (!loanStartDate) {
    return { weekly_amount: 0, total_weeks: 0 };
  }

  const startDate = new Date(loanStartDate);

  // Default to 12 weeks if end date missing or computed weeks are zero
  const defaultWeeks = 12;
  // for a missing end date assume exactly `defaultWeeks` instalments
  // by subtracting one week from the raw interval – the front end loops
  // inclusively over start/end when counting dues, so using the full
  // 12‑week span yields 13 entries.
  const endDate = loanEndDate
    ? new Date(loanEndDate)
    : new Date(startDate.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

  // Calculate duration in milliseconds
  const durationMs = endDate.getTime() - startDate.getTime();

  // Convert to days
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

  // Calculate number of weeks (ensure at least defaultWeeks)
  let totalWeeks = Math.ceil(durationDays / 7);
  if (!totalWeeks || totalWeeks < 1) totalWeeks = defaultWeeks;

  // Calculate weekly amount (avoid division by zero)
  const weeklyAmount = totalWeeks > 0 ? (Number(pendingAmount || 0) / totalWeeks) : 0;

  return {
    weekly_amount: Math.round(weeklyAmount * 100) / 100, // Round to 2 decimals
    total_weeks: totalWeeks
  };
}

// Test endpoint - Get all clients without auth
router.get('/test/all', async (req, res) => {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });
    
    res.json({
      success: true,
      clients
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all clients (Admin and Manager)
router.get('/', protect, authorize('admin','manager'), async function getClients(req, res) {
  try {
    const clients = await Client.find().sort({ createdAt: -1 });

    const totalClients = clients.length;
    const totalLoanAmount = clients.reduce((sum, client) => sum + Number(client.amount || 0), 0);
    const totalReceived = clients.reduce((sum, client) => sum + Number(client.received || 0), 0);

    res.json({
      success: true,
      clients,
      totalClients,
      totalLoanAmount,
      totalReceived
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET all clients for authenticated users (agents/managers/admin) - used by agent portal
router.get('/all', protect, authorize('admin', 'manager', 'agent'), async function getClientsForAgents(req, res) {
  try {
    // You may later restrict fields or filter by agent; for now return full list
    const clients = await Client.find().sort({ createdAt: -1 });

    res.json({
      success: true,
      clients
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST - Add new client (Admin and Manager)
router.post('/', protect, authorize('admin','manager'), async function createClient(req, res) {
  try {
    console.log('Admin adding new client');

    // Calculate pending and status
    const amount = Number(req.body.amount) || 0;
    const received = Number(req.body.received) || 0;
    const pending = amount - received;
    
    let status = 'pending';
    if (pending <= 0) {
      status = 'paid';
    } else if (received > 0) {
      status = 'partial';
    }

    // Calculate weekly installment (will be used as fallback)
    const computed = calculateWeeklyInstallment(
      req.body.loan_start_date,
      req.body.loan_end_date,
      pending
    );

    // Allow frontend to supply weekly_amount/total_weeks (admin only).
    // If provided and valid, prefer those values so a fixed ₹575 can be stored.
    let weekly_amount = computed.weekly_amount;
    let total_weeks = computed.total_weeks;

    if (req.body.weekly_amount !== undefined && !isNaN(Number(req.body.weekly_amount))) {
      weekly_amount = Math.round(Number(req.body.weekly_amount) * 100) / 100;
    }
    if (req.body.total_weeks !== undefined && Number(req.body.total_weeks) > 0) {
      total_weeks = Number(req.body.total_weeks);
    }

    // Create client data (NO agent field)
    const clientData = {
      name: req.body.name,
      husband_name: req.body.husband_name,
      phone: req.body.phone,
      landmark: req.body.landmark || '',
      address: req.body.address,
      district: req.body.district,
      amount: amount,
      received: received,
      pending: pending,
      loan_start_date: req.body.loan_start_date,
      loan_end_date: req.body.loan_end_date,
      weekly_amount: weekly_amount,
      total_weeks: total_weeks,
      status: status,
      notes: req.body.notes || '',
      nominee_name: req.body.nominee_name || '',
      nominee_phone: req.body.nominee_phone || '',
      nominee_address: req.body.nominee_address || ''
    };

    const newClient = new Client(clientData);
    await newClient.save();

    // Generate clientId (last 6 digits of _id)
    newClient.clientId = newClient._id.toString().slice(-6).toUpperCase();
    await newClient.save();

    res.status(201).json({
      success: true,
      message: 'Client added successfully',
      client: newClient
    });
  } catch (err) {
    console.error('Error adding client:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: err.message 
    });
  }
});

// PUT - Update client (Admin, Agent, and Manager). Agents/managers may only update loan_end_date.
router.put('/:id', protect, authorize('admin', 'agent', 'manager'), async function updateClient(req, res) {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // If the requester is an agent or manager, only allow updating the loan_end_date
    // (used by the 'Not Paid' action to extend the due date). Admins may
    // update all standard fields.
    if (req.user.role === 'agent' || req.user.role === 'manager') {
      if (req.body.loan_end_date === undefined) {
        return res.status(403).json({ success: false, message: 'Agents/managers may only update loan_end_date' });
      }
      client.loan_end_date = req.body.loan_end_date;
    } else {
      // Update fields (NO agent field)
      const fields = ['name', 'husband_name', 'phone', 'password', 'landmark', 'address', 'district',
        'amount', 'received', 'loan_start_date', 'loan_end_date',
        'notes', 'nominee_name', 'nominee_phone', 'nominee_address'];

      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          client[field] = req.body[field];
        }
      });
    }

    // Recalculate pending and status
    client.pending = (client.amount || 0) - (client.received || 0);
    
    if (client.pending <= 0) {
      client.status = 'paid';
    } else if (client.received > 0) {
      client.status = 'partial';
    } else {
      client.status = 'pending';
    }

    // Determine how to update weekly fields. Admins may recalc or override;
    // agents/managers should keep the existing weekly_amount but still adjust
    // total_weeks when the end date changes so that the schedule lengthens.
    let finalWeekly = client.weekly_amount;
    let finalWeeks = client.total_weeks;

    if (req.user.role === 'admin') {
      // Admins recompute by default and can override via request body.
      const computedUpdate = calculateWeeklyInstallment(
        client.loan_start_date,
        client.loan_end_date,
        client.pending
      );
      finalWeekly = computedUpdate.weekly_amount;
      finalWeeks = computedUpdate.total_weeks;

      if (req.body.weekly_amount !== undefined && !isNaN(Number(req.body.weekly_amount))) {
        finalWeekly = Math.round(Number(req.body.weekly_amount) * 100) / 100;
      }
      if (req.body.total_weeks !== undefined && Number(req.body.total_weeks) > 0) {
        finalWeeks = Number(req.body.total_weeks);
      }
    } else {
      // Agent/manager update: only loan_end_date changes (per earlier guard)
      // Extend total_weeks if end date has been modified. Do NOT recalc
      // weekly_amount so the customer keeps the same weekly installment.
      if (req.body.loan_end_date !== undefined) {
        const computedUpdate = calculateWeeklyInstallment(
          client.loan_start_date,
          client.loan_end_date,
          client.pending
        );
        finalWeeks = computedUpdate.total_weeks;
      }
    }

    client.weekly_amount = finalWeekly;
    client.total_weeks = finalWeeks;

    await client.save();

    res.json({ success: true, message: 'Client updated', client });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE client (Admin only)
router.delete('/:id', protect, authorize('admin','manager'), async function deleteClient(req, res) {
  try {
    await Client.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Client deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
