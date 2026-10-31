// ClientDetails.js (Agent Component)
import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import AgentNavbar from './AgentNavbar';
import { filterClientsForUser, filterClientsForAgent, getLoggedInUser } from '../utils/staffRecordFilter';

const ClientDetails = () => {
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedLandmark, setSelectedLandmark] = useState('');
  const [weekDateFilter, setWeekDateFilter] = useState(''); // date filter: show clients due on this exact date
  const [districts, setDistricts] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  const FORCED_WEEKLY = 575;
  const [duePayments, setDuePayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // History view mode for 12 weeks dues
  const [historyViewMode, setHistoryViewMode] = useState('current');

  // Custom Pay modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payErrorMsg, setPayErrorMsg] = useState('');

  // Advance Payment modal state
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [selectedAdvanceWeeks, setSelectedAdvanceWeeks] = useState([]);
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advanceErrorMsg, setAdvanceErrorMsg] = useState('');

  // Popup and confirmation state
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const popupTimeoutRef = useRef(null);

  const showPopup = (type, title, message, duration = 4000) => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    setPopup({ visible: true, type, title, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup(prev => ({ ...prev, visible: false }));
      popupTimeoutRef.current = null;
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    };
  }, []);

  // Listen for client updates from other components (e.g., payment cancellation)
  useEffect(() => {
    const handleClientUpdate = (event) => {
      const { clientId, loan_end_date } = event.detail;
      if (selectedClient && selectedClient._id === clientId) {
        // Update the selected client with new loan_end_date
        setSelectedClient(prev => ({
          ...prev,
          loan_end_date: loan_end_date
        }));
        // Trigger refresh of due payments
        setRefreshTrigger(prev => prev + 1);
        showPopup('info', 'Updated', 'Client due date has been extended due to payment cancellation.');
      }
    };

    window.addEventListener('clientUpdated', handleClientUpdate);
    return () => window.removeEventListener('clientUpdated', handleClientUpdate);
  }, [selectedClient]);

  // Listen for clientPaid event (e.g. from Daily Dues) to sync in real-time
  useEffect(() => {
    const handleClientPaid = (e) => {
      if (e.detail?.clientId && selectedClient && (String(selectedClient._id) === String(e.detail.clientId) || String(selectedClient.clientId) === String(e.detail.clientId))) {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    window.addEventListener('clientPaid', handleClientPaid);
    return () => window.removeEventListener('clientPaid', handleClientPaid);
  }, [selectedClient]);

  // Helper to get client ID with fallback to last 6 characters of _id
  const getClientId = (c) => {
    if (!c) return 'N/A';
    if (c.clientId && String(c.clientId).trim() && String(c.clientId).trim().toUpperCase() !== 'N/A') {
      return String(c.clientId).trim();
    }
    if (c._id) {
      return String(c._id).slice(-6).toUpperCase();
    }
    return 'N/A';
  };

  // Fetch clients from API (agent-scoped) using authenticated endpoint
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        const response = await fetch('https://karanfinance.com/api/clients/all', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch clients (${response.status})`);
        }

        const data = await response.json();
        const rawClients = data.clients || [];
        const validClients = filterClientsForAgent(rawClients, getLoggedInUser());
        const clientsList = validClients.map(c => ({
          ...c,
          clientId: getClientId(c)
        }));
        setClients(clientsList);

        // Keep selectedClient in sync with fresh balances
        setSelectedClient(prev => {
          if (!prev) return prev;
          const fresh = clientsList.find(c => String(c._id) === String(prev._id) || (prev.clientId && String(c.clientId) === String(prev.clientId)));
          return fresh ? { ...prev, ...fresh, clientId: getClientId(fresh || prev) } : prev;
        });

        // Extract unique districts
        const uniqueDistricts = [...new Set(clientsList.map(c => c.district))].filter(d => d).sort();
        setDistricts(uniqueDistricts);

        // Extract unique landmarks from all clients
        const uniqueLandmarks = [...new Set(clientsList.map(c => c.landmark?.trim()).filter(l => l))].sort();
        setLandmarks(uniqueLandmarks);

        setError(null);
      } catch (err) {
        console.error('Error fetching clients:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClients();
  }, []);

  // Update landmarks when district changes
  useEffect(() => {
    if (selectedDistrict) {
      const filteredByDistrict = clients.filter(c => c.district === selectedDistrict);
      const uniqueLandmarks = [...new Set(filteredByDistrict.map(c => c.landmark?.trim()).filter(l => l))].sort();
      setLandmarks(uniqueLandmarks);
      setSelectedLandmark('');
    } else {
      // Show all landmarks from all districts when no district is selected
      const allLandmarks = [...new Set(clients.map(c => c.landmark?.trim()).filter(l => l))].sort();
      setLandmarks(allLandmarks);
      setSelectedLandmark('');
    }
  }, [selectedDistrict, clients]);

  // Helper: check if a client has a weekly due that falls exactly on the selected date (timezone-safe)
  const isClientDueOnDate = (client, selectedDateStr) => {
    if (!client || !client.loan_start_date || !selectedDateStr) return false;
    const loanStart = new Date(client.loan_start_date);
    loanStart.setHours(0, 0, 0, 0);
    const targetDate = new Date(selectedDateStr + 'T00:00:00');
    if (isNaN(targetDate.getTime()) || targetDate < loanStart) return false;

    // Check weekly cycle: must fall on the client's recurring weekday (loan_start_date day)
    if (targetDate.getDay() !== loanStart.getDay()) return false;

    const diffDays = Math.round((targetDate.getTime() - loanStart.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays % 7 !== 0) return false;

    const balance = Number(client.pending ?? ((client.amount || 6900) - (client.received || 0)));
    // If client has pending dues, they are due on this recurring weekday even past loan_end_date
    if (balance > 0 && client.status !== 'paid') return true;

    // If client is already fully paid, check if selectedDate was within their scheduled loan period
    const loanEnd = client.loan_end_date ? new Date(client.loan_end_date) : null;
    if (loanEnd) {
      loanEnd.setHours(23, 59, 59, 999);
      return targetDate <= loanEnd;
    }
    const maxEnd = new Date(loanStart.getTime() + 12 * 7 * 24 * 60 * 60 * 1000);
    return targetDate <= maxEnd;
  };

  // Filter clients based on search, district, and landmark
  const filteredClients = clients.filter(client => {
    const cId = getClientId(client);
    const matchesSearch = (client.name && client.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.phone && client.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (cId !== 'N/A' && cId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDistrict = !selectedDistrict || client.district === selectedDistrict;
    const matchesLandmark = !selectedLandmark || (client.landmark?.trim() === selectedLandmark);

    // Date filter: show only clients whose weekly due date is exactly the selected date
    let matchesWeekDate = true;
    if (weekDateFilter) {
      matchesWeekDate = isClientDueOnDate(client, weekDateFilter);
    }

    return matchesSearch && matchesDistrict && matchesLandmark && matchesWeekDate;
  });

  const capitalize = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  // Generate 12 weekly due payments based on loan dates (12 weeks)
  const generateDuePayments = (client) => {
    if (!client) return [];

    const payments = [];
    const startDate = new Date(client.loan_start_date);
    const endDate = new Date(client.loan_end_date);

    let currentDate = new Date(startDate);
    let paymentId = 1;

    // weekly amount (default to FORCED_WEEKLY 575)
    const weeklyDue = (client.weekly_amount && Number(client.weekly_amount) > 0) ? Number(client.weekly_amount) : FORCED_WEEKLY;

    while (currentDate <= endDate && paymentId <= 12) {
      // Calculate week start and end (ISO date strings) to match payments
      const weekStart = new Date(currentDate);
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + 7);

      payments.push({
        id: paymentId,
        month: `Week ${paymentId} - ${currentDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        dueAmount: weeklyDue,
        displayAmount: weeklyDue,
        paidAmount: 0,
        status: 'pending',
        paidDate: null,
        weekStartISO: weekStart.toISOString().split('T')[0],
        weekEndISO: weekEnd.toISOString().split('T')[0],
        collectedStaff: null,
        collectedByRole: null
      });

      // move to next week
      currentDate.setDate(currentDate.getDate() + 7);
      paymentId++;
    }

    // Fill remaining weeks if less than 12 using startDate as anchor
    while (paymentId <= 12) {
      const weekStart = new Date(startDate);
      weekStart.setDate(startDate.getDate() + (paymentId - 1) * 7);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);

      payments.push({
        id: paymentId,
        month: `Week ${paymentId} - ${weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`,
        dueAmount: weeklyDue,
        displayAmount: weeklyDue,
        paidAmount: 0,
        status: 'pending',
        paidDate: null,
        weekStartISO: weekStart.toISOString().split('T')[0],
        weekEndISO: weekEnd.toISOString().split('T')[0],
        collectedStaff: null,
        collectedByRole: null
      });
      paymentId++;
    }

    return payments;
  };

  // Apply rolling weekly adjustment logic to schedule of weeks.
  // Supports both:
  // 1. Deficit/shortfall (underpaid): if client pays less than target due (e.g. 400 instead of 575),
  //    that week shows 400 paid (due 0), and the shortfall (175) rolls forward to add to the next week (575 + 175 = 750).
  // 2. Excess/advance: if client pays more than target due, the excess rolls forward as credit to reduce subsequent weeks.
  const applyWeeklyAdjustment = (weeks, client) => {
    if (!weeks || weeks.length === 0) return [];
    const baseWeekly = (client?.weekly_amount && Number(client.weekly_amount) > 0)
      ? Number(client.weekly_amount)
      : FORCED_WEEKLY;

    let netBalance = 0; // positive = shortfall to carry forward; negative = excess credit to reduce

    return weeks.map(week => {
      const w = { ...week };

      if (w.status === 'paid') {
        if (w.isForeclosed) {
          w.displayAmount = w.paidAmount || w.dueAmount || baseWeekly;
          w.dueAmount = 0;
          netBalance = 0;
        } else if (w.isAdvance) {
          // Targeted advance payment for this specific week
          const actualPaid = (w.paidAmount !== undefined && w.paidAmount > 0) ? w.paidAmount : baseWeekly;
          w.paidAmount = actualPaid;
          w.displayAmount = actualPaid;
          w.dueAmount = 0;
        } else {
          // Target due for this week incorporates any rolling deficit or credit
          const targetDue = Math.max(0, baseWeekly + netBalance);
          const actualPaid = (w.paidAmount !== undefined && w.paidAmount > 0) ? w.paidAmount : targetDue;
          w.paidAmount = actualPaid;
          w.displayAmount = actualPaid;
          w.dueAmount = 0;
          // Update net balance: positive = shortfall, negative = credit
          netBalance = targetDue - actualPaid;
        }
      } else {
        // Pending week (status !== 'paid')
        if (netBalance > 0) {
          // Shortfall carried forward from previous week(s) attaches to this first pending week
          const totalDue = baseWeekly + netBalance;
          w.displayAmount = totalDue;
          w.dueAmount = totalDue;
          netBalance = 0; // Shortfall has been absorbed by this pending week
        } else if (netBalance < 0) {
          // Advance credit pool reduces this pending week
          const credit = -netBalance;
          if (credit >= baseWeekly) {
            netBalance += baseWeekly;
            w.displayAmount = 0;
            w.dueAmount = 0;
            w.status = 'advancePaid';
          } else {
            const remaining = baseWeekly - credit;
            w.displayAmount = remaining;
            w.dueAmount = remaining;
            netBalance = 0;
          }
        } else {
          // Normal pending week
          w.displayAmount = baseWeekly;
          w.dueAmount = baseWeekly;
        }
      }
      return w;
    });
  };

  // Helper to compute active/current weekly due amount for selected client
  const getCurrentWeeklyDue = (client, paymentsList) => {
    if (!client) return FORCED_WEEKLY;
    const pendingCap = Number(client.pending ?? ((client.amount || 6900) - (client.received || 0)));
    if (pendingCap <= 0) return 0;

    const firstPending = (paymentsList || []).find(p => p.status === 'pending');
    if (firstPending && firstPending.dueAmount !== undefined) {
      return Math.min(pendingCap, firstPending.dueAmount);
    }
    const baseWeekly = (client?.weekly_amount && Number(client.weekly_amount) > 0)
      ? Number(client.weekly_amount)
      : FORCED_WEEKLY;
    return Math.min(pendingCap, baseWeekly);
  };

  // Open cancel confirmation modal
  const openCancelConfirmModal = (paymentId, paymentAmount, clientId) => {
    setCancelPaymentData({ paymentId, paymentAmount, clientId });
    setShowCancelConfirmModal(true);
  };

  // Handle cancel payment - reverse the payment and update client record
  const handleConfirmCancelPayment = async () => {
    const { paymentId, paymentAmount, clientId } = cancelPaymentData;
    setShowCancelConfirmModal(false);
    try {
      const token = localStorage.getItem('token');

      // Call backend to delete payment and update client
      const res = await fetch(`https://karanfinance.com/api/payments/${paymentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId, amount: paymentAmount })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to cancel payment');
      }

      // Clear localStorage markers so buttons re-enable in MDailyDues
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
        localStorage.removeItem(`pushedNotPaid_${clientId}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      // Extend loan_end_date by 7 days since payment is cancelled
      const currentEndDate = selectedClient.loan_end_date ? new Date(selectedClient.loan_end_date) : null;
      let newEndDate;
      if (currentEndDate && !isNaN(currentEndDate)) {
        newEndDate = new Date(currentEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (selectedClient.loan_start_date) {
        const start = new Date(selectedClient.loan_start_date);
        newEndDate = new Date(start.getTime() + 13 * 7 * 24 * 60 * 60 * 1000); // push to 13 weeks
      }

      // Update client loan_end_date in backend
      if (newEndDate) {
        const updateRes = await fetch(`https://karanfinance.com/api/clients/${clientId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ loan_end_date: newEndDate.toISOString() })
        });

        if (!updateRes.ok) {
          console.error('Failed to update loan end date');
        }
      }

      // Update client in local state preserving weekly_amount and bumping total_weeks
      const updatedReceived = (selectedClient.received || 0) - paymentAmount;
      const updatedPending = (selectedClient.amount || 0) - updatedReceived;

      // compute new total weeks locally to keep UI in sync (loan_end_date extended by 7 days)
      let updatedTotalWeeks = selectedClient.total_weeks || 0;
      if (newEndDate && selectedClient.loan_start_date) {
        const start = new Date(selectedClient.loan_start_date);
        const end = new Date(newEndDate);
        const durationDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
        updatedTotalWeeks = Math.max(1, Math.round(durationDays / 7));
      }

      setSelectedClient(prev => ({
        ...prev,
        received: updatedReceived,
        pending: updatedPending,
        loan_end_date: newEndDate ? newEndDate.toISOString() : prev.loan_end_date,
        total_weeks: updatedTotalWeeks,
        status: updatedPending <= 0 ? 'paid' : updatedReceived > 0 ? 'partial' : 'pending'
      }));

      // Also update in clients list
      setClients(prevClients =>
        prevClients.map(client =>
          client._id === clientId
            ? {
              ...client,
              received: updatedReceived,
              pending: updatedPending,
              loan_end_date: newEndDate ? newEndDate.toISOString() : client.loan_end_date,
              total_weeks: updatedTotalWeeks,
              status: updatedPending <= 0 ? 'paid' : updatedReceived > 0 ? 'partial' : 'pending'
            }
            : client
        )
      );

      // Refresh payment history
      setRefreshTrigger(prev => prev + 1);

      // Show success message
      showPopup('success', 'Cancelled', 'Payment cancelled successfully. Due extended by 1 week and buttons re-enabled');
    } catch (error) {
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
    }
  };

  // Update due payments when selected client changes
  useEffect(() => {
    const attachPayments = async () => {
      if (!selectedClient) return;

      // Generate the base schedule
      const baseWeeks = generateDuePayments(selectedClient);

      try {
        setPaymentsLoading(true);
        const token = localStorage.getItem('token');
        let res = await fetch(`https://karanfinance.com/api/payments/client/${selectedClient._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        let paymentHistory = [];

        if (!res.ok) {
          const historyRes = await fetch(`https://karanfinance.com/api/payments/history?clientId=${selectedClient._id}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!historyRes.ok) {
            setDuePayments(applyWeeklyAdjustment(baseWeeks, selectedClient));
            return;
          }

          const historyJson = await historyRes.json();
          paymentHistory = (historyJson.data && historyJson.data.payments) || historyJson.payments || [];
        } else {
          const json = await res.json();
          paymentHistory = (json.data && json.data.paymentHistory) || json.paymentHistory || [];
        }

        // Deduplicate paymentHistory by _id
        const uniquePayments = [];
        const seenIds = new Set();
        paymentHistory.forEach(p => {
          const pId = p._id || p.id;
          if (pId) {
            if (!seenIds.has(pId)) {
              seenIds.add(pId);
              uniquePayments.push(p);
            }
          } else {
            uniquePayments.push(p);
          }
        });

        // Sort chronologically (oldest payment first)
        uniquePayments.sort((a, b) => {
          const dateA = new Date(a.paymentDate || a.createdAt || a.date || 0);
          const dateB = new Date(b.paymentDate || b.createdAt || b.date || 0);
          return dateA - dateB;
        });

        const merged = baseWeeks.map(week => ({ ...week }));
        const usedPaymentIds = new Set();

        const isUsed = (p) => {
          if (!p) return false;
          const pId = p._id || p.id;
          if (pId && usedPaymentIds.has(String(pId))) return true;
          const pDate = p.paymentDate || p.createdAt || p.date;
          if (pDate && usedPaymentIds.has(String(pDate))) return true;
          return false;
        };

        const markUsed = (p) => {
          if (!p) return;
          const pId = p._id || p.id;
          if (pId) usedPaymentIds.add(String(pId));
          const pDate = p.paymentDate || p.createdAt || p.date;
          if (pDate) usedPaymentIds.add(String(pDate));
        };

        // Pass 0: Handle advance payments targeting specific week(s)
        uniquePayments.forEach(p => {
          const notes = (p.notes || '').trim();
          const isAdv = /advance/i.test(notes) || p.isAdvance === true;
          if (!isAdv) return;

          const pDateStr = p.paymentDate || p.createdAt || p.date;
          if (!pDateStr) return;
          const pISO = new Date(pDateStr).toISOString().split('T')[0];

          let targetWeekIds = [];
          const bracketMatch = notes.match(/\[weeks:([0-9,\s]+)\]/i);
          if (bracketMatch && bracketMatch[1]) {
            targetWeekIds = bracketMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
          } else {
            const weekMatches = [...notes.matchAll(/week\s*([0-9]+)/gi)];
            if (weekMatches.length > 0) {
              targetWeekIds = weekMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
            }
          }

          // Always mark advance payment as used so it never touches Pass 1 or Pass 2
          markUsed(p);

          if (targetWeekIds.length > 0) {
            targetWeekIds.forEach(targetId => {
              const weekObj = merged.find(w => Number(w.id) === targetId && w.status !== 'paid');
              if (weekObj) {
                weekObj.status = 'paid';
                weekObj.paidDate = pISO;
                weekObj.paidAmount = weekObj.dueAmount || FORCED_WEEKLY;
                weekObj.collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Staff';
                weekObj.collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
                weekObj.paymentId = p._id || p.id;
                weekObj.isAdvance = true;
              }
            });
          } else {
            // General advance payment without specific week target: apply to earliest unpaid week
            const weekObj = merged.find(w => w.status !== 'paid');
            if (weekObj) {
              weekObj.status = 'paid';
              weekObj.paidDate = pISO;
              weekObj.paidAmount = weekObj.dueAmount || FORCED_WEEKLY;
              weekObj.collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Staff';
              weekObj.collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
              weekObj.paymentId = p._id || p.id;
              weekObj.isAdvance = true;
            }
          }
        });

        // Pass 1: Exact date range match (pISO between weekStartISO and weekEndISO)
        // Skip payments that are advance payments or already used
        uniquePayments.forEach(p => {
          if (isUsed(p)) return;
          const notes = (p.notes || '').trim();
          if (/advance/i.test(notes) || p.isAdvance === true) return;

          const pDateStr = p.paymentDate || p.createdAt || p.date;
          if (!pDateStr) return;
          const pISO = new Date(pDateStr).toISOString().split('T')[0];

          const idx = merged.findIndex(w => pISO >= w.weekStartISO && pISO < w.weekEndISO && w.status !== 'paid');
          if (idx !== -1) {
            merged[idx].status = 'paid';
            merged[idx].paidDate = pISO;
            merged[idx].paidAmount = (merged[idx].paidAmount || 0) + Number(p.amount || 0);
            merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
            merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
            merged[idx].paymentId = p._id || p.id;
            markUsed(p);
          }
        });

        // Pass 2: Unassigned payments fill remaining unpaid weeks only if payment date >= week start date
        // Skip payments that are advance payments or already used
        uniquePayments.forEach(p => {
          if (isUsed(p)) return;
          const notes = (p.notes || '').trim();
          if (/advance/i.test(notes) || p.isAdvance === true) return;

          const pDateStr = p.paymentDate || p.createdAt || p.date;
          if (!pDateStr) return;
          const pISO = new Date(pDateStr).toISOString().split('T')[0];

          const idx = merged.findIndex(w => w.status !== 'paid' && w.weekStartISO <= pISO);
          if (idx !== -1) {
            merged[idx].status = 'paid';
            merged[idx].paidDate = pISO;
            merged[idx].paidAmount = (merged[idx].paidAmount || 0) + Number(p.amount || 0);
            merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
            merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
            merged[idx].paymentId = p._id || p.id;
            markUsed(p);
          }
        });

        // Pass 3: If loan was foreclosed, mark remaining unpaid weeks as paid
        const currentLoanStart = selectedClient?.loan_start_date ? new Date(selectedClient.loan_start_date) : null;
        const currentForeclosurePayment = uniquePayments.find(p => {
          const method = (p.paymentMethod || '').toLowerCase();
          const notes = (p.notes || '').toLowerCase();
          const isFp = method === 'foreclosure' || notes.includes('foreclose');
          if (!isFp) return false;
          if (!currentLoanStart) return true;
          const pDate = new Date(p.paymentDate || p.createdAt || p.date || 0);
          return pDate >= currentLoanStart;
        });

        const isForeclosed = !!currentForeclosurePayment || (
          selectedClient?.status === 'paid' &&
          ((selectedClient?.notes || '').toLowerCase().includes('foreclose') || selectedClient?.isForeclosed === true)
        );

        if (isForeclosed) {
          const fp = currentForeclosurePayment;
          const fpDateStr = fp ? (fp.paymentDate || fp.createdAt || fp.date) : (selectedClient?.updatedAt || new Date().toISOString());
          const fpISO = fpDateStr ? new Date(fpDateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const fpStaff = fp ? (fp.collectedStaff || (fp.agent && (fp.agent.name || fp.agent.username)) || 'Foreclosed') : 'Foreclosed';
          const fpRole = fp ? (fp.collectedByRole || (fp.agent ? 'agent' : null)) : null;
          const fpId = fp ? (fp._id || fp.id) : null;

          merged.forEach(week => {
            if (week.status !== 'paid') {
              week.status = 'paid';
              week.paidDate = fpISO;
              week.collectedStaff = fpStaff;
              week.collectedByRole = fpRole;
              week.paymentId = fpId;
              week.isForeclosed = true;
            } else if (fpId && week.paymentId === fpId) {
              week.isForeclosed = true;
            }
          });
        }

        setDuePayments(applyWeeklyAdjustment(merged, selectedClient));
      } catch (err) {
        console.error('Error fetching client payments:', err);
        setDuePayments(applyWeeklyAdjustment(baseWeeks, selectedClient));
      } finally {
        setPaymentsLoading(false);
      }
    };

    attachPayments();
  }, [selectedClient, refreshTrigger]); // Added refreshTrigger dependency

  const openPayModal = () => {
    if (!selectedClient) return;
    const totalAmount = selectedClient.amount || 6900;
    const currentReceived = selectedClient.received || 0;
    const balAmount = selectedClient.pending !== undefined && selectedClient.pending !== null
      ? selectedClient.pending
      : Math.max(0, totalAmount - currentReceived);

    setPayAmount(balAmount > 0 ? String(balAmount) : '');
    setPayMethod('cash');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNotes('Payment from Client Details');
    setPayErrorMsg('');
    setShowPayModal(true);
  };

  // Open Advance Payment modal — shows pending/upcoming weeks to pay for
  const openAdvanceModal = () => {
    if (!selectedClient) return;
    const pending = duePayments.filter(w => w.status === 'pending');
    const firstPending = pending[0];
    const initialWeeks = firstPending ? [String(firstPending.id)] : [];
    setSelectedAdvanceWeeks(initialWeeks);
    const baseWeekly = (selectedClient.weekly_amount && Number(selectedClient.weekly_amount) > 0)
      ? Number(selectedClient.weekly_amount)
      : FORCED_WEEKLY;
    const initialTotal = initialWeeks.length * baseWeekly;
    setAdvanceAmount(String(initialTotal > 0 ? initialTotal : baseWeekly));
    setAdvanceNotes('');
    setAdvanceErrorMsg('');
    setShowAdvanceModal(true);
  };

  const toggleAdvanceWeek = (weekId) => {
    const sId = String(weekId);
    let nextSelected;
    if (selectedAdvanceWeeks.includes(sId)) {
      nextSelected = selectedAdvanceWeeks.filter(id => id !== sId);
    } else {
      nextSelected = [...selectedAdvanceWeeks, sId];
    }
    nextSelected.sort((a, b) => Number(a) - Number(b));
    setSelectedAdvanceWeeks(nextSelected);

    const baseWeekly = (selectedClient?.weekly_amount && Number(selectedClient.weekly_amount) > 0)
      ? Number(selectedClient.weekly_amount)
      : FORCED_WEEKLY;
    const outstanding = selectedClient?.pending !== undefined && selectedClient?.pending !== null
      ? selectedClient.pending
      : Math.max(0, (selectedClient?.amount || 6900) - (selectedClient?.received || 0));

    const totalForWeeks = nextSelected.reduce((sum, wid) => {
      const wObj = duePayments.find(w => String(w.id) === String(wid));
      return sum + (wObj?.dueAmount || baseWeekly);
    }, 0);

    setAdvanceAmount(String(Math.min(outstanding, totalForWeeks)));
  };

  const toggleSelectAllAdvanceWeeks = () => {
    const pending = duePayments.filter(w => w.status === 'pending');
    const baseWeekly = (selectedClient?.weekly_amount && Number(selectedClient.weekly_amount) > 0)
      ? Number(selectedClient.weekly_amount)
      : FORCED_WEEKLY;
    const outstanding = selectedClient?.pending !== undefined && selectedClient?.pending !== null
      ? selectedClient.pending
      : Math.max(0, (selectedClient?.amount || 6900) - (selectedClient?.received || 0));

    if (selectedAdvanceWeeks.length === pending.length) {
      setSelectedAdvanceWeeks([]);
      setAdvanceAmount('0');
    } else {
      const allIds = pending.map(w => String(w.id));
      setSelectedAdvanceWeeks(allIds);
      const totalAll = pending.reduce((sum, w) => sum + (w.dueAmount || baseWeekly), 0);
      setAdvanceAmount(String(Math.min(outstanding, totalAll)));
    }
  };

  // Handle Advance Payment submission
  const handleAdvancePay = async () => {
    if (!selectedClient || selectedAdvanceWeeks.length === 0) {
      setAdvanceErrorMsg('Please select at least one week.');
      return;
    }
    const numAmount = Number(advanceAmount);
    const outstanding = selectedClient.pending !== undefined && selectedClient.pending !== null
      ? selectedClient.pending
      : Math.max(0, (selectedClient.amount || 6900) - (selectedClient.received || 0));
    if (!numAmount || numAmount <= 0) { setAdvanceErrorMsg('Please enter a valid amount.'); return; }
    if (numAmount > outstanding) { setAdvanceErrorMsg(`Amount (₹${numAmount}) cannot exceed balance (₹${outstanding}).`); return; }

    const selectedWeekObjs = duePayments.filter(w => selectedAdvanceWeeks.includes(String(w.id)));
    const weekLabels = selectedWeekObjs.map(w => `Week ${w.id}`).join(', ');
    const weekIdsCsv = selectedAdvanceWeeks.join(',');
    const dueDatesCsv = selectedWeekObjs.map(w => w.weekStartISO).filter(Boolean).join(',');
    const todayDate = new Date().toISOString().split('T')[0];

    const dueTag = dueDatesCsv ? ` [dueDates:${dueDatesCsv}]` : '';
    const notePayload = advanceNotes.trim()
      ? `Advance for ${weekLabels} [weeks:${weekIdsCsv}]${dueTag} — ${advanceNotes.trim()}`
      : `Advance for ${weekLabels} [weeks:${weekIdsCsv}]${dueTag}`;

    try {
      setAdvanceLoading(true);
      setAdvanceErrorMsg('');
      const token = localStorage.getItem('token');
      const response = await fetch('https://karanfinance.com/api/payments/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          clientId: selectedClient._id,
          amount: numAmount,
          paymentMethod: 'cash',
          notes: notePayload,
          paymentDate: todayDate
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to process advance payment');
      const updatedClientData = data.data?.client;
      const currentReceived = selectedClient.received || 0;
      const totalAmount = selectedClient.amount || 6900;
      const newReceived = currentReceived + numAmount;
      const newPending = Math.max(0, totalAmount - newReceived);
      const updatedClient = {
        ...selectedClient,
        received: updatedClientData?.received ?? newReceived,
        pending: updatedClientData?.pending ?? newPending,
        status: updatedClientData?.status ?? (newPending <= 0 ? 'paid' : 'partial')
      };
      setSelectedClient(updatedClient);
      setClients(prev => prev.map(c => c._id === selectedClient._id ? updatedClient : c));
      setRefreshTrigger(prev => prev + 1);
      setShowAdvanceModal(false);
      window.dispatchEvent(new CustomEvent('clientPaid', {
        detail: {
          clientId: selectedClient._id,
          amount: numAmount,
          isAdvance: true,
          targetWeeks: selectedAdvanceWeeks,
          notes: notePayload
        }
      }));
      showPopup('success', '⚡ Advance Payment Recorded', `₹${numAmount.toLocaleString('en-IN')} advance for ${weekLabels} recorded. Shows in today's dashboard.`);
    } catch (err) {
      setAdvanceErrorMsg(err.message || 'Failed to process advance payment');
    } finally {
      setAdvanceLoading(false);
    }
  };

  const handleConfirmPayDue = async () => {
    if (!selectedClient) return;
    const numAmount = Number(payAmount);
    const totalAmount = selectedClient.amount || 6900;
    const currentReceived = selectedClient.received || 0;
    const balAmount = selectedClient.pending !== undefined && selectedClient.pending !== null
      ? selectedClient.pending
      : Math.max(0, totalAmount - currentReceived);

    if (!numAmount || numAmount <= 0) {
      setPayErrorMsg('Please enter a valid amount greater than 0.');
      return;
    }

    if (numAmount > balAmount) {
      setPayErrorMsg(`Payment amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed outstanding balance (₹${balAmount.toLocaleString('en-IN')}).`);
      return;
    }

    try {
      setPayLoading(true);
      setPayErrorMsg('');
      const token = localStorage.getItem('token');

      const response = await fetch('https://karanfinance.com/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          clientId: selectedClient._id,
          amount: numAmount,
          paymentMethod: payMethod,
          notes: payNotes,
          paymentDate: payDate
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to process payment');
      }

      const updatedClientData = data.data?.client;
      const newReceived = currentReceived + numAmount;
      const newPending = Math.max(0, totalAmount - newReceived);
      const newStatus = newPending <= 0 ? 'paid' : (newReceived > 0 ? 'partial' : selectedClient.status);

      const updatedClient = {
        ...selectedClient,
        received: updatedClientData?.received ?? newReceived,
        pending: updatedClientData?.pending ?? newPending,
        status: updatedClientData?.status ?? newStatus
      };

      setSelectedClient(updatedClient);
      setClients(prev => prev.map(c => c._id === selectedClient._id ? updatedClient : c));

      setRefreshTrigger(prev => prev + 1);
      setShowPayModal(false);

      // Dispatch event to sync with other components like DailyDues
      window.dispatchEvent(new CustomEvent('clientPaid', { detail: { clientId: selectedClient._id, amount: numAmount } }));

      const isPaid = (updatedClientData?.pending ?? newPending) <= 0;
      showPopup(
        'success',
        isPaid ? 'Loan Fully Paid' : 'Payment Recorded',
        isPaid
          ? `Payment of ₹${numAmount.toLocaleString('en-IN')} recorded. Loan is now marked as FULLY PAID!`
          : `Payment of ₹${numAmount.toLocaleString('en-IN')} recorded successfully. Remaining balance: ₹${newPending.toLocaleString('en-IN')}.`
      );

    } catch (err) {
      console.error('Error processing payment:', err);
      setPayErrorMsg(err.message || 'Failed to process payment');
    } finally {
      setPayLoading(false);
    }
  };


  const formatCurrency = (amount) => {
    return `₹${Number(amount || 0).toLocaleString('en-IN')}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Handle client selection
  const handleClientSelect = (client) => {
    const fullClient = {
      ...client,
      clientId: getClientId(client)
    };
    setSelectedClientId(client._id);
    setSelectedClient(fullClient);
    setActiveTab('overview'); // Reset to overview tab
  };

  // Handle back button
  const handleBack = () => {
    setSelectedClientId(null);
    setSelectedClient(null);
    setDuePayments([]);
    setActiveTab('overview');
  };

  return (
    <div className="min-h-screen bg-[#E9EFEC] font-sans">
      <AgentNavbar />

      <div className="pt-2 pb-8 w-full px-3">

        {/* Client List View */}
        {!selectedClientId && (
          <div>
            {/* Header with Background */}
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] rounded-lg shadow-md p-4 mb-6">
              <div className="mb-4">
                <h1 className="text-2xl font-bold text-white mb-1">Clients</h1>
                <p className="text-sm text-emerald-100">View and manage client details</p>
              </div>

              {/* Search and Filters Section */}
              <div className="bg-white/90 backdrop-blur-lg rounded-lg p-3 mt-4">

                {/* Search and Filters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder="Search by name, phone, ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm"
                    />
                  </div>

                  <div>
                    <select
                      value={selectedDistrict}
                      onChange={(e) => setSelectedDistrict(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] bg-white cursor-pointer text-sm"
                    >
                      <option value="">All Districts</option>
                      {districts.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      value={selectedLandmark}
                      onChange={(e) => setSelectedLandmark(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] bg-white cursor-pointer text-sm"
                    >
                      <option value="">All Landmarks</option>
                      {landmarks.map((landmark) => (
                        <option key={landmark} value={landmark}>
                          {landmark}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Exact Due Date Filter */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
                    <label className="text-xs font-semibold text-[#16423C] whitespace-nowrap flex items-center gap-1">
                      <i className="fas fa-calendar-day text-[#6A9C89]"></i>
                      Due Date:
                    </label>
                    <input
                      type="date"
                      value={weekDateFilter}
                      onChange={(e) => setWeekDateFilter(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] text-xs bg-white cursor-pointer"
                      title="Show only clients whose weekly due date falls exactly on this date"
                    />
                    {weekDateFilter && (
                      <button
                        onClick={() => setWeekDateFilter('')}
                        className="text-xs text-red-500 hover:text-red-700 font-semibold px-1.5 py-1 rounded border border-red-200 hover:border-red-400 transition-colors whitespace-nowrap"
                        title="Clear date filter"
                      >
                        ✕ Clear
                      </button>
                    )}
                  </div>
                  {weekDateFilter && (
                    <span className="text-xs text-[#6A9C89] font-medium bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                      Due on: {new Date(weekDateFilter).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                <div className="mt-2 text-xs text-[#16423C]">
                  <i className="fas fa-list text-[#16423C] mr-1"></i>
                  Showing {filteredClients.length} of {clients.length} clients
                  {weekDateFilter && <span className="ml-1 text-[#6A9C89] font-medium">(weekly due filter active)</span>}
                </div>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="flex justify-center items-center py-12">
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#6A9C89]"></div>
                  <p className="mt-4 text-gray-600">Loading clients...</p>
                </div>
              </div>
            )}

            {/* Error State */}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                <p className="text-sm"><strong>Error:</strong> {error}</p>
              </div>
            )}

            {/* Client Grid - 5 columns */}
            {!loading && filteredClients.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredClients.map((client) => (
                  <div
                    key={client._id}
                    onClick={() => handleClientSelect(client)}
                    className="bg-white rounded-lg p-3 shadow cursor-pointer transition-all duration-300 hover:shadow-lg border-2 border-[#16423C]/20 hover:border-[#16423C]/50 group"
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#6A9C89] border-2 border-[#C4DAD2] mb-2 group-hover:bg-[#5a8b79] transition-colors">
                        {client.name ? client.name.substring(0, 2).toUpperCase() : 'CL'}
                      </div>
                      <h4 className="text-md font-bold text-[#16423C] mb-1 line-clamp-2 leading-tight">{client.name}</h4>
                      <p className="text-md text-gray-500 mb-1 truncate">ID: {getClientId(client)}</p>
                      <p className="text-md text-gray-400 truncate">{client.phone}</p>
                      <div className={`mt-2 text-xs px-2 py-1 rounded-full ${client.status === 'paid' ? 'bg-green-100 text-green-800' :
                        client.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {client.status || 'pending'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredClients.length === 0 && (
              <div className="bg-white rounded-lg p-8 shadow text-center">
                <i className="fas fa-search text-gray-300 text-3xl mb-3 block"></i>
                <p className="text-gray-600 text-sm">
                  {searchQuery || selectedDistrict || selectedLandmark || weekDateFilter
                    ? 'No clients found matching your filters'
                    : 'No clients found'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Client Details View */}
        {selectedClientId && selectedClient && (
          <div className="bg-white rounded-lg p-5 md:p-6 shadow-md">

            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-[#16423C] font-semibold mb-4 hover:text-[#6A9C89] transition-colors group text-base"
            >
              <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
              Back to Clients List
            </button>

            <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg bg-[#6A9C89] border-4 border-[#C4DAD2]">
                {selectedClient.name ? selectedClient.name.substring(0, 2).toUpperCase() : 'CL'}
              </div>

              <div className="flex-1 w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-[#16423C] mb-1">
                      {selectedClient.name}
                    </h2>
                    <p className="text-base text-gray-600 mb-1">
                      <i className="fas fa-phone-alt text-[#6A9C89] mr-2"></i>
                      {selectedClient.phone}
                    </p>
                    <p className="text-sm text-gray-500">
                      <i className="fas fa-id-card text-[#6A9C89] mr-2"></i>
                      Client ID: {getClientId(selectedClient)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {selectedClient.status !== 'paid' && (selectedClient.pending > 0 || (selectedClient.amount || 6900) - (selectedClient.received || 0) > 0) && (
                      <>
                        <button
                          onClick={openPayModal}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                          title="Collect / Process Custom Payment"
                        >
                          <i className="fas fa-money-bill-wave text-xs"></i>
                          Pay Due
                        </button>
                        <button
                          onClick={openAdvanceModal}
                          className="bg-amber-500 hover:bg-amber-600 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                          title="Pay advance for upcoming week"
                        >
                          <i className="fas fa-forward text-xs"></i>
                          ⚡ Advance Pay
                        </button>
                      </>
                    )}
                    <span className={`inline-block px-3 py-1 rounded text-base font-semibold text-white ${selectedClient.status === 'paid' ? 'bg-green-500' :
                      selectedClient.status === 'partial' ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}>
                      {selectedClient.status === 'paid' ? '✅ Paid' :
                        selectedClient.status === 'partial' ? '⚠️ Partial' :
                          '⏳ Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-[#C4DAD2] mb-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 font-semibold text-base capitalize transition-all relative ${activeTab === 'overview'
                    ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]'
                    : 'text-gray-500 hover:text-[#6A9C89]'
                    }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('dues')}
                  className={`px-4 py-2 font-semibold text-base capitalize transition-all relative ${activeTab === 'dues'
                    ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]'
                    : 'text-gray-500 hover:text-[#6A9C89]'
                    }`}
                >
                  12 Weeks
                </button>
              </div>
            </div>

            <div className="min-h-[400px]">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="bg-[#E9EFEC] p-4 rounded border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-3 flex items-center gap-2 text-base">
                      <i className="fas fa-user-circle text-[#6A9C89]"></i>
                      Personal Info
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Full Name</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Husband Name</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.husband_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Phone</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.phone}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Client ID</p>
                        <p className="font-semibold text-base text-[#16423C]">{getClientId(selectedClient)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#E9EFEC] p-4 rounded border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-3 flex items-center gap-2 text-base">
                      <i className="fas fa-map-marker-alt text-[#6A9C89]"></i>
                      Address
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600 mb-1">Full Address</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.address}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Landmark</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.landmark || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">District</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.district}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#E9EFEC] p-4 rounded border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-3 flex items-center gap-2 text-base">
                      <i className="fas fa-coins text-[#6A9C89]"></i>
                      Loan Info
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                      <div className="bg-white p-2 rounded">
                        <p className="text-sm text-gray-600 mb-1">Total Amount</p>
                        <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.amount === 6900 ? 5000 : selectedClient.amount)}</p>
                      </div>
                      <div className="bg-white p-2 rounded">
                        <p className="text-sm text-gray-600 mb-1">Received</p>
                        <p className="font-bold text-base text-green-600">{formatCurrency(selectedClient.received || 0)}</p>
                      </div>
                      <div className="bg-white p-2 rounded">
                        <p className="text-sm text-gray-600 mb-1">Pending</p>
                        <p className="font-bold text-base text-red-500">{formatCurrency((selectedClient.amount || 0) - (selectedClient.received || 0))}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-[#C4DAD2]">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Start Date</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatDate(selectedClient.loan_start_date)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">End Date</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatDate(selectedClient.loan_end_date)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Weekly Due</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatCurrency(getCurrentWeeklyDue(selectedClient, duePayments))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Status</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-sm font-semibold text-white ${selectedClient.status === 'paid' ? 'bg-green-500' :
                          selectedClient.status === 'partial' ? 'bg-amber-500' :
                            'bg-red-500'
                          }`}>
                          {selectedClient.status === 'paid' ? '✅ Paid' :
                            selectedClient.status === 'partial' ? '⚠️ Partial' :
                              '⏳ Pending'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Dispensary Date</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatDate(selectedClient.dispensary)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#E9EFEC] p-4 rounded border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-3 flex items-center gap-2 text-base">
                      <i className="fas fa-users text-[#6A9C89]"></i>
                      Nominee
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Name</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.nominee_name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Phone</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.nominee_phone || 'N/A'}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600 mb-1">Address</p>
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.nominee_address || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 12 Weeks Dues Tab */}
              {activeTab === 'dues' && (() => {
                const currentLoanStart = selectedClient?.loan_start_date ? new Date(selectedClient.loan_start_date) : null;
                const currentPayments = duePayments.filter(p => {
                  if (!currentLoanStart) return true;
                  const pDate = new Date(p.paidDate || p.weekStartISO);
                  return pDate >= currentLoanStart || p.status === 'pending';
                });
                const previousPayments = duePayments.filter(p => {
                  if (!currentLoanStart) return false;
                  const pDate = new Date(p.paidDate || p.weekStartISO);
                  return p.status === 'paid' && pDate < currentLoanStart;
                });
                const activePaymentList = historyViewMode === 'previous' ? previousPayments : currentPayments;

                return (
                  <div>
                    {previousPayments.length > 0 && (
                      <div className="flex justify-between items-center mb-4 bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                        <span className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                          <i className="fas fa-history text-amber-600"></i>
                          Client has previous loan history available
                        </span>
                        <div className="flex bg-white/80 p-0.5 rounded-lg border border-amber-300">
                          <button
                            onClick={() => setHistoryViewMode('current')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${historyViewMode === 'current'
                              ? 'bg-[#16423C] text-white shadow-sm'
                              : 'text-[#16423C] hover:bg-gray-100'
                              }`}
                          >
                            Current Loan ({currentPayments.filter(p => p.status === 'paid').length}/12)
                          </button>
                          <button
                            onClick={() => setHistoryViewMode('previous')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${historyViewMode === 'previous'
                              ? 'bg-[#16423C] text-white shadow-sm'
                              : 'text-[#16423C] hover:bg-gray-100'
                              }`}
                          >
                            Previous History ({previousPayments.length})
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                      <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                        <p className="text-sm text-gray-600 mb-1">Total Loan</p>
                        <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.amount === 6900 ? 5000 : selectedClient.amount)}</p>
                      </div>
                      <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                        <p className="text-sm text-gray-600 mb-1">Weekly</p>
                        <p className="font-bold text-base text-[#16423C]">{formatCurrency(FORCED_WEEKLY)}</p>
                      </div>
                      <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                        <p className="text-sm text-gray-600 mb-1">Paid</p>
                        <p className="font-bold text-base text-green-600">
                          {activePaymentList.filter(p => p.status === 'paid').length} {historyViewMode === 'previous' ? 'weeks' : '/12'}
                        </p>
                      </div>
                      <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                        <p className="text-sm text-gray-600 mb-1">Weekly Due</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatCurrency(getCurrentWeeklyDue(selectedClient, duePayments))}</p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-semibold text-[#16423C]">Progress</span>
                        <span className="text-sm text-[#6A9C89]">
                          {historyViewMode === 'previous' ? `${activePaymentList.length} weeks (Completed)` : `${activePaymentList.filter(p => p.status === 'paid').length}/12 weeks`}
                        </span>
                      </div>
                      <div className="h-2 bg-[#C4DAD2] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#6A9C89] transition-all duration-500"
                          style={{ width: historyViewMode === 'previous' ? '100%' : `${(activePaymentList.filter(p => p.status === 'paid').length / 12) * 100}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* 12 Due Payments Table */}
                    <div className="mt-4">
                      <h3 className="text-base font-bold text-[#16423C] mb-2">
                        {historyViewMode === 'previous' ? 'Previous Loan Payment History' : 'Current Loan Payment Schedule'}
                      </h3>

                      {paymentsLoading ? (
                        <div className="flex justify-center items-center py-8">
                          <div className="text-center">
                            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#6A9C89]"></div>
                            <p className="mt-2 text-gray-600">Loading payments...</p>
                          </div>
                        </div>
                      ) : activePaymentList.length === 0 ? (
                        <div className="p-8 bg-[#E9EFEC] rounded border border-[#C4DAD2] text-center">
                          <i className="fas fa-credit-card text-gray-400 text-3xl mb-3"></i>
                          <p className="text-base text-gray-600">
                            {historyViewMode === 'previous' ? 'No previous loan payments found' : 'No payments recorded yet'}
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-[#16423C] text-white">
                                <th className="p-2 text-left">#</th>
                                <th className="p-2 text-left">Week</th>
                                <th className="p-2 text-center">Amount</th>
                                <th className="p-2 text-center">Status</th>
                                <th className="p-2 text-center">Paid Date</th>
                                <th className="p-2 text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activePaymentList.map((payment, index) => (
                                <tr
                                  key={payment.paymentId || payment.id || index}
                                  className={`border-b border-[#C4DAD2] ${index % 2 === 0 ? 'bg-white' : 'bg-[#F5F9F7]'
                                    }`}
                                >
                                  <td className="p-2 font-medium text-[#16423C]">{index + 1}</td>
                                  <td className="p-2">{payment.month || `Week ${index + 1}`}</td>
                                  <td className="p-2 text-center font-semibold">{formatCurrency(payment.displayAmount ?? payment.dueAmount)}</td>
                                  <td className="p-2 text-center">
                                    <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${payment.status === 'paid' || payment.status === 'advancePaid'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                      }`}>
                                      {payment.status === 'paid' || payment.status === 'advancePaid' ? '✅ Paid' : '⏳ Pending'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-center text-gray-600">
                                    {payment.paidDate ? formatDate(payment.paidDate) : '-'}
                                  </td>
                                  <td className="p-2 text-center">
                                    {payment.status === 'paid' && payment.paymentId && !payment.isForeclosed ? (
                                      <button
                                        onClick={() => openCancelConfirmModal(payment.paymentId, payment.paidAmount || payment.displayAmount || payment.dueAmount, selectedClient._id)}
                                        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95 shadow-sm hover:shadow"
                                      >
                                        Cancel
                                      </button>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Payment Summary */}
                    <div className="mt-4 p-3 bg-[#E9EFEC] rounded border border-[#C4DAD2]">
                      <h4 className="font-semibold text-[#16423C] mb-2 text-base">Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-base">
                        <div>
                          <p className="text-sm text-gray-600">Paid Weeks</p>
                          <p className="font-bold text-green-600">{activePaymentList.filter(p => p.status === 'paid').length} weeks</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Amount Paid</p>
                          <p className="font-bold text-green-600 text-sm">
                            {formatCurrency(activePaymentList.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.paidAmount || p.displayAmount || p.dueAmount || 0), 0))}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Pending Weeks</p>
                          <p className="font-bold text-red-500">{historyViewMode === 'previous' ? 0 : activePaymentList.filter(p => p.status === 'pending').length} weeks</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Amount Due</p>
                          <p className="font-bold text-red-500 text-sm">
                            {historyViewMode === 'previous' ? '₹0' : formatCurrency((selectedClient.amount || 0) - (selectedClient.received || 0))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Custom Pay Due Modal */}
      {showPayModal && selectedClient && (() => {
        const totalLoan = selectedClient.amount || 6900;
        const totalRec = selectedClient.received || 0;
        const outstanding = selectedClient.pending !== undefined && selectedClient.pending !== null
          ? selectedClient.pending
          : Math.max(0, totalLoan - totalRec);
        const weeklyDue = getCurrentWeeklyDue(selectedClient, duePayments);
        const enteredNum = Number(payAmount) || 0;
        const remainingAfterPay = Math.max(0, outstanding - enteredNum);
        const willBeFullyPaid = enteredNum >= outstanding && outstanding > 0;

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">

              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#16423C] flex items-center justify-center text-lg font-bold">
                    <i className="fas fa-hand-holding-dollar"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#16423C]">Receive Payment</h3>
                    <p className="text-xs text-gray-500">Process custom payment & update client balance</p>
                  </div>
                </div>
                <button
                  onClick={() => !payLoading && setShowPayModal(false)}
                  disabled={payLoading}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              {/* Client Info Card */}
              <div className="bg-[#E9EFEC]/60 p-3.5 rounded-xl border border-[#C4DAD2] mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-800 text-base">{selectedClient.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {getClientId(selectedClient)} • {selectedClient.phone}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      <i className="fas fa-map-marker-alt text-emerald-600 mr-1"></i>
                      {selectedClient.landmark || 'N/A'}, {selectedClient.district || 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Bal: ₹{outstanding.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Total Loan</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">₹{totalLoan.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center">
                  <div className="text-[11px] text-emerald-700 font-medium">Received</div>
                  <div className="text-sm font-bold text-emerald-800 mt-0.5">₹{totalRec.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-red-50 p-2.5 rounded-xl border border-red-200 text-center">
                  <div className="text-[11px] text-red-700 font-medium">Outstanding</div>
                  <div className="text-sm font-extrabold text-red-700 mt-0.5">₹{outstanding.toLocaleString('en-IN')}</div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                  Quick Amount Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(outstanding))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === outstanding
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    Full Due (₹{outstanding.toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.min(outstanding, weeklyDue)))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === Math.min(outstanding, weeklyDue)
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    1 Wk Due (₹{Math.min(outstanding, weeklyDue).toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.round(outstanding / 2)))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === Math.round(outstanding / 2)
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    50% (₹{Math.round(outstanding / 2).toLocaleString('en-IN')})
                  </button>
                </div>
              </div>

              {/* Custom Value Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-[#16423C] mb-1.5 uppercase tracking-wider">
                  Custom Payment Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-base">₹</span>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Enter custom amount..."
                    min="1"
                    max={outstanding}
                    className="w-full pl-8 pr-3 py-2.5 border-2 border-[#16423C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#16423C] focus:border-[#16423C] font-bold text-lg text-[#16423C] bg-white transition-all"
                  />
                </div>

                {/* Live Balance Preview */}
                <div className="mt-2 flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-gray-600 font-medium">Remaining Balance After Payment:</span>
                  <span className="font-extrabold text-gray-800">
                    ₹{remainingAfterPay.toLocaleString('en-IN')}
                    {willBeFullyPaid && (
                      <span className="ml-1.5 text-emerald-600 font-bold">(Marked as PAID ✓)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online Transfer / UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  />
                </div>
              </div>

              {/* Notes Input */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Paid in office / custom settlement"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>

              {/* Error Message */}
              {payErrorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <i className="fas fa-exclamation-circle text-sm text-red-600"></i>
                  <span>{payErrorMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleConfirmPayDue}
                  disabled={payLoading || !payAmount || Number(payAmount) <= 0}
                  className="flex-1 bg-[#16423C] hover:bg-[#1f5a52] text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {payLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Recording Payment...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle"></i>
                      Confirm Payment (₹{enteredNum.toLocaleString('en-IN')})
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  disabled={payLoading}
                  className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm transition-all"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        );
      })()}



      {/* Advance Payment Modal */}
      {showAdvanceModal && selectedClient && (() => {
        const outstanding = selectedClient.pending !== undefined && selectedClient.pending !== null
          ? selectedClient.pending
          : Math.max(0, (selectedClient.amount || 6900) - (selectedClient.received || 0));
        const pendingWeeks = duePayments.filter(w => w.status === 'pending' || w.status === 'advancePaid');
        const baseWeekly = (selectedClient.weekly_amount && Number(selectedClient.weekly_amount) > 0)
          ? Number(selectedClient.weekly_amount) : FORCED_WEEKLY;
        const numAdvance = Number(advanceAmount) || 0;
        const remainingAfter = Math.max(0, outstanding - numAdvance);
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-amber-100 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-amber-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg font-bold">
                    ⚡
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#16423C]">Advance Payment</h3>
                    <p className="text-xs text-gray-500">Pay for upcoming due week early</p>
                  </div>
                </div>
                <button onClick={() => !advanceLoading && setShowAdvanceModal(false)} disabled={advanceLoading}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40">
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              {/* Client Info */}
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 mb-4">
                <div className="font-bold text-gray-800 text-sm">{selectedClient.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">ID: {getClientId(selectedClient)} • Balance: ₹{outstanding.toLocaleString('en-IN')}</div>
              </div>

              {/* Due Week Selector - Multiple Weeks */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Select Due Week(s) <span className="text-red-500">*</span>
                  </label>
                  {pendingWeeks.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllAdvanceWeeks}
                      className="text-xs font-bold text-amber-600 hover:text-amber-800 transition-colors"
                    >
                      {selectedAdvanceWeeks.length === pendingWeeks.length ? '✕ Deselect All' : '✓ Select All'}
                    </button>
                  )}
                </div>

                {pendingWeeks.length === 0 ? (
                  <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border">No pending weeks found</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {pendingWeeks.map(w => {
                      const isSelected = selectedAdvanceWeeks.includes(String(w.id));
                      return (
                        <div
                          key={w.id}
                          onClick={() => toggleAdvanceWeek(w.id)}
                          className={`flex items-center gap-3 p-2.5 rounded-xl border-2 cursor-pointer transition-all ${isSelected
                            ? 'border-amber-500 bg-amber-50 shadow-sm'
                            : 'border-gray-200 hover:border-amber-200 bg-white'
                            }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => { }}
                            className="w-4 h-4 text-amber-600 rounded border-gray-300 focus:ring-amber-500 cursor-pointer"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-gray-800 flex items-center justify-between">
                              <span>{w.month}</span>
                              <span className="text-amber-700 font-bold">₹{(w.dueAmount || baseWeekly).toLocaleString('en-IN')}</span>
                            </div>
                            <div className="text-[11px] text-gray-500">
                              Week #{w.id} • Due: ₹{(w.dueAmount || baseWeekly).toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selectedAdvanceWeeks.length > 0 && (
                  <div className="mt-2 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1.5 rounded-lg border border-amber-200 flex items-center justify-between">
                    <span>Selected: <strong>{selectedAdvanceWeeks.length} week{selectedAdvanceWeeks.length > 1 ? 's' : ''}</strong> (Week {selectedAdvanceWeeks.join(', ')})</span>
                    <span>Total: ₹{(selectedAdvanceWeeks.length * baseWeekly).toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>

              {/* Amount Field */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wider">Payment Amount (₹) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
                  <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)}
                    placeholder="Enter amount..."
                    min="1" max={outstanding}
                    className="w-full pl-8 pr-3 py-2.5 border-2 border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400 font-bold text-lg text-[#16423C] bg-white transition-all" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border">
                  <span className="text-gray-600">Remaining after payment:</span>
                  <span className="font-bold text-gray-800">₹{remainingAfter.toLocaleString('en-IN')}
                    {numAdvance >= outstanding && outstanding > 0 && <span className="ml-1 text-emerald-600">(FULLY PAID ✓)</span>}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-700 mb-1">Notes (Optional)</label>
                <input type="text" value={advanceNotes} onChange={e => setAdvanceNotes(e.target.value)}
                  placeholder="e.g. Paid in advance at office..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400" />
              </div>

              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-lg mb-4">
                ℹ️ Payment recorded with <strong>today's date</strong> — shows in today's dashboard collected amount.
              </div>

              {advanceErrorMsg && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <i className="fas fa-exclamation-circle"></i> {advanceErrorMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button onClick={handleAdvancePay}
                  disabled={advanceLoading || selectedAdvanceWeeks.length === 0 || !advanceAmount || Number(advanceAmount) <= 0}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                  {advanceLoading ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>Recording...</>
                  ) : (
                    <>⚡ Confirm Advance Pay (₹{numAdvance.toLocaleString('en-IN')})</>
                  )}
                </button>
                <button onClick={() => setShowAdvanceModal(false)} disabled={advanceLoading}
                  className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm transition-all">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cancel Payment Confirmation Modal */}
      {showCancelConfirmModal && cancelPaymentData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/50">
            <div className="text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-yellow-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#16423C] mb-4">Confirm Cancel Payment</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to cancel this payment? This will reverse the transaction and extend the loan by 1 week.
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleConfirmCancelPayment}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-all duration-300 shadow-lg"
              >
                Yes, Cancel Payment
              </button>
              <button
                onClick={() => setShowCancelConfirmModal(false)}
                className="flex-1 bg-gray-200/80 backdrop-blur-lg text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-all duration-300"
              >
                No, Keep Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup notification (success / error) */}
      {popup.visible && (
        <div className={`fixed top-5 right-5 z-[1001] p-4 rounded-lg shadow-xl flex items-start gap-3 max-w-xs font-medium ${popup.type === 'success' ? 'bg-green-600 text-white border border-green-700' : 'bg-red-600 text-white border border-red-700'}`}>
          <div className="flex-shrink-0 mt-0.5">
            {popup.type === 'success' ? <CheckCircle size={28} /> : <XCircle size={28} />}
          </div>
          <div className="leading-snug">
            <div className="font-bold">{popup.title}</div>
            <div className="text-sm mt-1">{popup.message}</div>
          </div>
        </div>
      )}

      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
    </div>
  );
};

export default ClientDetails;