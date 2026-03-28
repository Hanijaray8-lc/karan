// routes/clientRoutes.js
const express = require('express');
const router = express.Router();
const Client = require('../models/Client');
const Agent = require('../models/Agent');
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
    // If the requester is an agent, return only clients assigned to them.
    // Admins and managers continue to receive all clients.
    const filter = {};
    if (req.user && req.user.role === 'agent') {
      filter.assigned_agent = req.user.id;
    }

    const clients = await Client.find(filter).sort({ createdAt: -1 });

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

    // Resolve assigned agent if provided
    let assignedAgentId = req.body.assigned_agent || null;
    let assignedAgentName = '';
    if (assignedAgentId) {
      const agent = await Agent.findById(assignedAgentId);
      if (agent) assignedAgentName = agent.name || agent.username || '';
    }

    // Create client data (may include agent fields)
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
      nominee_husband: req.body.nominee_husband || '',
      nominee_phone: req.body.nominee_phone || '',
      nominee_address: req.body.nominee_address || ''
    };

    if (assignedAgentId) {
      clientData.assigned_agent = assignedAgentId;
      clientData.assigned_agent_name = assignedAgentName;
    }

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

// PUT - Update client (Admin, Agent, and Manager).
// Agents may only update `loan_end_date`. Managers and Admins may update all fields.
router.put('/:id', protect, authorize('admin', 'agent', 'manager'), async function updateClient(req, res) {
  try {
    const client = await Client.findById(req.params.id);

    if (!client) {
      return res.status(404).json({ success: false, message: 'Client not found' });
    }

    // If the requester is an agent, only allow updating the loan_end_date
    // (used by the 'Not Paid' action to extend the due date). Managers and
    // admins may update all standard fields.
    if (req.user.role === 'agent') {
      if (req.body.loan_end_date === undefined) {
        return res.status(403).json({ success: false, message: 'Agents may only update loan_end_date' });
      }
      client.loan_end_date = req.body.loan_end_date;
    } else {
      // Update fields (NO agent field)
      const fields = ['name', 'husband_name', 'phone', 'password', 'landmark', 'address', 'district',
        'amount', 'received', 'loan_start_date', 'loan_end_date',
        'notes', 'nominee_name', 'nominee_husband', 'nominee_phone', 'nominee_address'];

      fields.forEach(field => {
        if (req.body[field] !== undefined) {
          client[field] = req.body[field];
        }
      });

      // Allow admin/manager to assign/unassign an agent when updating
      if (req.body.assigned_agent !== undefined) {
        let assignedId = req.body.assigned_agent || null;
        let assignedName = '';
        if (assignedId) {
          const agent = await Agent.findById(assignedId);
          if (agent) assignedName = agent.name || agent.username || '';
        }
        client.assigned_agent = assignedId;
        client.assigned_agent_name = assignedName;
      }
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

// GET clients by agent (Manager & Admin only)
router.get('/agent/:agentId', protect, authorize('admin', 'manager'), async function getClientsByAgent(req, res) {
  try {
    const { agentId } = req.params;

    if (!agentId) {
      return res.status(400).json({
        success: false,
        message: 'Agent ID is required'
      });
    }

    const clients = await Client.find({ assigned_agent: agentId }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      clients,
      total: clients.length
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

// TRANSFER client from one agent to another (Manager & Admin only)
router.put('/:id/transfer', protect, authorize('admin', 'manager'), async function transferClient(req, res) {
  try {
    const { id } = req.params;
    const { new_agent_id, new_agent_name } = req.body;

    if (!id || !new_agent_id) {
      return res.status(400).json({
        success: false,
        message: 'Client ID and new agent ID are required'
      });
    }

    const client = await Client.findById(id);
    if (!client) {
      return res.status(404).json({
        success: false,
        message: 'Client not found'
      });
    }

    const oldAgentId = client.assigned_agent;
    const oldAgentName = client.assigned_agent_name;

    // Update client with new agent
    client.assigned_agent = new_agent_id;
    client.assigned_agent_name = new_agent_name;

    // Store transfer history in notes
    const transferInfo = `\n[TRANSFERRED] From: ${oldAgentName || 'Unassigned'} → To: ${new_agent_name || 'Unknown'} on ${new Date().toLocaleDateString('en-IN')} by ${req.user.name || req.user.username}`;
    client.notes = (client.notes || '') + transferInfo;

    const updatedClient = await client.save();

    return res.json({
      success: true,
      data: updatedClient,
      message: `Client transferred successfully from ${oldAgentName || 'Unassigned'} to ${new_agent_name}`
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
});

module.exports = router;