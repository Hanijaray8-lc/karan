// ClientDetails.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';
import AgentNavbar from './AdminNavbar';

const AClientDetails = () => {
  const [searchParams] = useSearchParams();
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedLandmark, setSelectedLandmark] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [districts, setDistricts] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  // Fixed weekly amount used across this view (do not change other components)
  const FORCED_WEEKLY = 575;

  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Reloan modal & history state
  const [showReloanModal, setShowReloanModal] = useState(false);
  const [reloanStartDate, setReloanStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reloanDispensary, setReloanDispensary] = useState('');
  const [reloanLandmark, setReloanLandmark] = useState('');
  const [reloanDistrict, setReloanDistrict] = useState('');
  const [reloanLoading, setReloanLoading] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState('current');

  // Foreclose modal state
  const [showForecloseModal, setShowForecloseModal] = useState(false);
  const [forecloseGivenAmount, setForecloseGivenAmount] = useState('');
  const [forecloseLoading, setForecloseLoading] = useState(false);

  // Cancel Foreclose modal state
  const [showCancelForecloseModal, setShowCancelForecloseModal] = useState(false);
  const [cancelForecloseLoading, setCancelForecloseLoading] = useState(false);

  // Custom Pay modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payErrorMsg, setPayErrorMsg] = useState('');

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

  const popupTimeoutRef = useRef(null);

  const showPopup = (type, title, message, duration = 4000) => {
    setPopup({ visible: true, type, title, message });
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    popupTimeoutRef.current = setTimeout(() => {
      setPopup({ visible: false, type: 'success', title: '', message: '' });
    }, duration);
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

      // Call backend to delete payment
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

      // Clear localStorage markers so buttons re-enable in DailyDues / MDailyDues
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
        localStorage.removeItem(`pushedNotPaid_${clientId}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      // Look up client details
      const client = clients.find(c => c._id === clientId);
      if (!client) {
        throw new Error('Client details not found. Please refresh the page and try again.');
      }

      const clientLoanStart = client.loan_start_date;
      const clientLoanEnd = client.loan_end_date;

      // Extend loan_end_date by 7 days since payment is cancelled
      const currentEndDate = clientLoanEnd ? new Date(clientLoanEnd) : null;
      let newEndDate;

      if (currentEndDate && !isNaN(currentEndDate)) {
        newEndDate = new Date(currentEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (clientLoanStart) {
        const start = new Date(clientLoanStart);
        newEndDate = new Date(start.getTime() + 13 * 7 * 24 * 60 * 60 * 1000); // push to 13 weeks
      } else {
        throw new Error('Unable to calculate new loan end date');
      }

      // Update client loan_end_date in backend
      const updateRes = await fetch(`https://karanfinance.com/api/clients/${clientId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ loan_end_date: newEndDate.toISOString() })
      });

      const updateData = await updateRes.json();

      if (!updateRes.ok) {
        throw new Error(updateData.message || 'Failed to update loan end date');
      }

      console.log('Successfully extended loan end date');

      // Dispatch custom event to notify other components about the change
      window.dispatchEvent(new CustomEvent('clientUpdated', {
        detail: { clientId, loan_end_date: newEndDate.toISOString() }
      }));

      // Update client in local state preserving weekly_amount and bumping total_weeks
      const updatedReceived = (selectedClient.received || 0) - paymentAmount;
      const updatedPending = (selectedClient.amount || 0) - updatedReceived;

      // compute new total weeks locally to keep UI in sync
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
        prevClients.map(c =>
          c._id === clientId
            ? {
              ...c,
              received: updatedReceived,
              pending: updatedPending,
              loan_end_date: newEndDate ? newEndDate.toISOString() : c.loan_end_date,
              total_weeks: updatedTotalWeeks,
              status: updatedPending <= 0 ? 'paid' : updatedReceived > 0 ? 'partial' : 'pending'
            }
            : c
        )
      );

      // Refresh payments list
      setRefreshTrigger(prev => prev + 1);

      // Show success message
      showPopup('success', 'Cancelled', 'Payment cancelled successfully. Due extended by 1 week.');
    } catch (error) {
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
    }
  };

  // Fetch clients from API
  const fetchClients = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const token = localStorage.getItem('token');

      let clientsList = [];

      // If no token, use the public test endpoint to avoid 401 when not authenticated
      if (!token) {
        const res = await fetch('https://karanfinance.com/api/clients/test/all');
        if (!res.ok) throw new Error('Failed to fetch clients');
        const json = await res.json();
        clientsList = json.clients || [];
      } else {
        // Try the protected endpoint when token is available
        const response = await fetch('https://karanfinance.com/api/clients', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        // If unauthorized, fallback to public test endpoint to avoid showing 401 errors to unauthenticated users
        if (response.status === 401) {
          const fb = await fetch('https://karanfinance.com/api/clients/test/all');
          if (!fb.ok) throw new Error('Failed to fetch clients');
          const fbJson = await fb.json();
          clientsList = fbJson.clients || [];
        } else {
          if (!response.ok) throw new Error('Failed to fetch clients');
          const data = await response.json();
          clientsList = data.clients || [];
        }
      }

      setClients(clientsList);

      // Keep selectedClient in sync with fresh balances
      setSelectedClient(prev => {
        if (!prev) return prev;
        const fresh = clientsList.find(c => String(c._id) === String(prev._id) || (prev.clientId && String(c.clientId) === String(prev.clientId)));
        return fresh ? { ...prev, ...fresh } : prev;
      });

      // Check if a clientId was provided via URL query parameter
      const targetId = searchParams.get('clientId');
      if (targetId) {
        const found = clientsList.find(c => String(c._id) === targetId || String(c.clientId) === targetId);
        if (found) {
          setSelectedClientId(found._id);
          setSelectedClient(found);
        }
      }

      // Extract unique districts
      const uniqueDistricts = [...new Set(clientsList.map(c => c.district))].filter(d => d).sort();
      setDistricts(uniqueDistricts);

      // Extract unique landmarks from all clients (trimmed)
      const uniqueLandmarks = [...new Set(clientsList.map(c => c.landmark?.trim()).filter(l => l))].sort();
      setLandmarks(uniqueLandmarks);

      setError(null);
    } catch (err) {
      console.error('Error fetching clients:', err);
      if (!silent) setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Listen for clientPaid event (e.g. from Daily Dues) to sync in real-time
  useEffect(() => {
    const handleClientPaid = (e) => {
      fetchClients(true);
      if (e.detail?.clientId && selectedClient && (String(selectedClient._id) === String(e.detail.clientId) || String(selectedClient.clientId) === String(e.detail.clientId))) {
        setRefreshTrigger(prev => prev + 1);
      }
    };
    window.addEventListener('clientPaid', handleClientPaid);
    return () => window.removeEventListener('clientPaid', handleClientPaid);
  }, [selectedClient, fetchClients]);

  // Update landmarks when district changes
  useEffect(() => {
    if (selectedDistrict) {
      const filteredByDistrict = clients.filter(c => c.district === selectedDistrict);
      const uniqueLandmarks = [...new Set(filteredByDistrict.map(c => c.landmark?.trim()).filter(l => l))].sort();
      setLandmarks(uniqueLandmarks);
      setSelectedLandmark(''); // Reset landmark when district changes
    } else {
      // Show all landmarks when no district is selected
      const allLandmarks = [...new Set(clients.map(c => c.landmark?.trim()).filter(l => l))].sort();
      setLandmarks(allLandmarks);
      setSelectedLandmark('');
    }
  }, [selectedDistrict, clients]);

  // Helper to check if a client's loan end date has arrived or passed and has unpaid balance
  const isClientOverdue = (client) => {
    if (!client || !client.loan_end_date) return false;
    const balance = Number(client.pending ?? ((client.amount || 6900) - (client.received || 0)));
    if (balance <= 0) return false;
    const end = new Date(client.loan_end_date);
    if (isNaN(end.getTime())) return false;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return end <= today;
  };

  // Filter clients based on search, district, landmark, and status
  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.clientId && client.clientId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDistrict = !selectedDistrict || client.district === selectedDistrict;
    const matchesLandmark = !selectedLandmark || (client.landmark?.trim() === selectedLandmark);

    let matchesStatus = true;
    if (selectedStatus === 'pending') {
      matchesStatus = client.status === 'pending' || isClientOverdue(client);
    } else if (selectedStatus === 'partial') {
      matchesStatus = client.status === 'partial' && !isClientOverdue(client);
    } else if (selectedStatus === 'paid') {
      matchesStatus = client.status === 'paid';
    }

    return matchesSearch && matchesDistrict && matchesLandmark && matchesStatus;
  });

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
        // keep property name `month` for compatibility with UI code below,
        // but store a human-friendly week label instead of a month name.
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

  // Apply rolling weekly adjustment logic to schedule of weeks
  // (e.g. week 1 pays 600 -> week 2 due becomes 550; week 2 pays 550 -> week 3 returns to 575)
  const applyWeeklyAdjustment = (weeks, client) => {
    if (!weeks || weeks.length === 0) return [];
    const baseWeekly = (client?.weekly_amount && Number(client.weekly_amount) > 0)
      ? Number(client.weekly_amount)
      : FORCED_WEEKLY;

    let runningDue = baseWeekly;

    return weeks.map(week => {
      const w = { ...week };
      w.dueAmount = runningDue;

      if (w.status === 'paid') {
        if (w.isForeclosed) {
          w.displayAmount = w.dueAmount;
        } else {
          const actualPaid = (w.paidAmount !== undefined && w.paidAmount > 0) ? w.paidAmount : w.dueAmount;
          w.paidAmount = actualPaid;
          w.displayAmount = actualPaid;
          const diff = actualPaid - runningDue;
          runningDue = Math.max(0, baseWeekly - diff);
        }
      } else {
        w.displayAmount = runningDue;
        runningDue = baseWeekly;
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

  const [duePayments, setDuePayments] = useState([]);

  // Update due payments when selected client changes
  useEffect(() => {
    const attachPayments = async () => {
      if (!selectedClient) return;

      // Generate the base schedule
      const baseWeeks = generateDuePayments(selectedClient);

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`https://karanfinance.com/api/payments/client/${selectedClient._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          // Try admin route as a fallback (for admins viewing any client)
          const adminRes = await fetch(`https://karanfinance.com/api/payments/admin/all`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!adminRes.ok) {
            setDuePayments(applyWeeklyAdjustment(baseWeeks, selectedClient));
            return;
          }

          const adminJson = await adminRes.json();
          const allPayments = (adminJson.data && adminJson.data.payments) || [];
          const paymentHistory = allPayments.filter(p => p.client && (p.client._id === selectedClient._id || p.client === selectedClient._id));

          // Deduplicate paymentHistory by _id
          const uniquePaymentsFallback = [];
          const seenIdsFallback = new Set();
          paymentHistory.forEach(p => {
            const pId = p._id || p.id;
            if (pId) {
              if (!seenIdsFallback.has(pId)) {
                seenIdsFallback.add(pId);
                uniquePaymentsFallback.push(p);
              }
            } else {
              uniquePaymentsFallback.push(p);
            }
          });

          uniquePaymentsFallback.sort((a, b) => {
            const dateA = new Date(a.paymentDate || a.createdAt || a.date || 0);
            const dateB = new Date(b.paymentDate || b.createdAt || b.date || 0);
            return dateA - dateB;
          });

          const mergedFallback = baseWeeks.map(week => ({ ...week }));
          const usedPaymentIdsFallback = new Set();

          // Pass 1: Exact date range match
          uniquePaymentsFallback.forEach(p => {
            const pDateStr = p.paymentDate || p.createdAt || p.date;
            if (!pDateStr) return;
            const pISO = new Date(pDateStr).toISOString().split('T')[0];
            const pId = p._id || p.id || pDateStr;

            const idx = mergedFallback.findIndex(w => pISO >= w.weekStartISO && pISO < w.weekEndISO && w.status !== 'paid');
            if (idx !== -1) {
              mergedFallback[idx].status = 'paid';
              mergedFallback[idx].paidDate = pISO;
              mergedFallback[idx].paidAmount = (mergedFallback[idx].paidAmount || 0) + Number(p.amount || 0);
              mergedFallback[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
              mergedFallback[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
              mergedFallback[idx].paymentId = p._id || p.id;
              usedPaymentIdsFallback.add(pId);
            }
          });

          // Pass 2: Unassigned payments fill remaining unpaid weeks
          uniquePaymentsFallback.forEach(p => {
            const pDateStr = p.paymentDate || p.createdAt || p.date;
            if (!pDateStr) return;
            const pId = p._id || p.id || pDateStr;
            if (usedPaymentIdsFallback.has(pId)) return;

            const pISO = new Date(pDateStr).toISOString().split('T')[0];
            const idx = mergedFallback.findIndex(w => w.status !== 'paid' && w.weekStartISO <= pISO);
            if (idx !== -1) {
              mergedFallback[idx].status = 'paid';
              mergedFallback[idx].paidDate = pISO;
              mergedFallback[idx].paidAmount = (mergedFallback[idx].paidAmount || 0) + Number(p.amount || 0);
              mergedFallback[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
              mergedFallback[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
              mergedFallback[idx].paymentId = p._id || p.id;
              usedPaymentIdsFallback.add(pId);
            }
          });

          // Pass 3: If loan was foreclosed, mark remaining unpaid weeks as paid
          const currentLoanStartFallback = selectedClient?.loan_start_date ? new Date(selectedClient.loan_start_date) : null;
          const currentForeclosurePaymentFallback = uniquePaymentsFallback.find(p => {
            const method = (p.paymentMethod || '').toLowerCase();
            const notes = (p.notes || '').toLowerCase();
            const isFp = method === 'foreclosure' || notes.includes('foreclose');
            if (!isFp) return false;
            if (!currentLoanStartFallback) return true;
            const pDate = new Date(p.paymentDate || p.createdAt || p.date || 0);
            return pDate >= currentLoanStartFallback;
          });

          const isForeclosedFallback = !!currentForeclosurePaymentFallback || (
            selectedClient?.status === 'paid' &&
            ((selectedClient?.notes || '').toLowerCase().includes('foreclose') || selectedClient?.isForeclosed === true)
          );

          if (isForeclosedFallback) {
            const fp = currentForeclosurePaymentFallback;
            const fpDateStr = fp ? (fp.paymentDate || fp.createdAt || fp.date) : (selectedClient?.updatedAt || new Date().toISOString());
            const fpISO = fpDateStr ? new Date(fpDateStr).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
            const fpStaff = fp ? (fp.collectedStaff || (fp.agent && (fp.agent.name || fp.agent.username)) || 'Foreclosed') : 'Foreclosed';
            const fpRole = fp ? (fp.collectedByRole || (fp.agent ? 'agent' : null)) : null;
            const fpId = fp ? (fp._id || fp.id) : null;

            mergedFallback.forEach(week => {
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

          setDuePayments(applyWeeklyAdjustment(mergedFallback, selectedClient));
          return;
        }

        const json = await res.json();
        const paymentHistory = (json.data && json.data.paymentHistory) || [];

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

        // Pass 1: Exact date range match
        uniquePayments.forEach(p => {
          const pDateStr = p.paymentDate || p.createdAt || p.date;
          if (!pDateStr) return;
          const pISO = new Date(pDateStr).toISOString().split('T')[0];
          const pId = p._id || p.id || pDateStr;

          const idx = merged.findIndex(w => pISO >= w.weekStartISO && pISO < w.weekEndISO && w.status !== 'paid');
          if (idx !== -1) {
            merged[idx].status = 'paid';
            merged[idx].paidDate = pISO;
            merged[idx].paidAmount = (merged[idx].paidAmount || 0) + Number(p.amount || 0);
            merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
            merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
            merged[idx].paymentId = p._id || p.id;
            usedPaymentIds.add(pId);
          }
        });

        // Pass 2: Unassigned payments fill remaining unpaid weeks
        uniquePayments.forEach(p => {
          const pDateStr = p.paymentDate || p.createdAt || p.date;
          if (!pDateStr) return;
          const pId = p._id || p.id || pDateStr;
          if (usedPaymentIds.has(pId)) return;

          const pISO = new Date(pDateStr).toISOString().split('T')[0];
          const idx = merged.findIndex(w => w.status !== 'paid' && w.weekStartISO <= pISO);
          if (idx !== -1) {
            merged[idx].status = 'paid';
            merged[idx].paidDate = pISO;
            merged[idx].paidAmount = (merged[idx].paidAmount || 0) + Number(p.amount || 0);
            merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
            merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
            merged[idx].paymentId = p._id || p.id;
            usedPaymentIds.add(pId);
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
      }
    };

    attachPayments();
  }, [selectedClient, refreshTrigger]);

  const openReloanModal = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    setReloanStartDate(todayStr);
    setReloanDispensary(selectedClient?.dispensary ? selectedClient.dispensary.split('T')[0] : '');
    // Pre-fill new landmark and district with the client's current values
    setReloanLandmark(selectedClient?.landmark?.trim() || '');
    setReloanDistrict(selectedClient?.district?.trim() || '');
    setShowReloanModal(true);
  };

  const openForecloseModal = () => {
    if (!selectedClient) return;
    const totalLoanFull = selectedClient.amount || 6900;
    const currentReceived = selectedClient.received || 0;
    const balAmount = selectedClient.pending !== undefined && selectedClient.pending !== null
      ? selectedClient.pending
      : Math.max(0, totalLoanFull - currentReceived);
    setForecloseGivenAmount(balAmount.toString());
    setShowForecloseModal(true);
  };

  const handleConfirmForeclose = async () => {
    if (!selectedClient) return;
    const totalLoanAmount = selectedClient.amount || 6900;
    const currentReceived = selectedClient.received || 0;
    const balAmount = selectedClient.pending !== undefined && selectedClient.pending !== null
      ? selectedClient.pending
      : Math.max(0, totalLoanAmount - currentReceived);
    const givenNum = Number(forecloseGivenAmount || 0);

    if (givenNum !== balAmount) {
      showPopup('error', 'Mismatch', 'Given amount must match total balance amount to foreclose.');
      return;
    }

    try {
      setForecloseLoading(true);
      const token = localStorage.getItem('token');

      // 1. Process payment for foreclosure balance
      let paymentSuccess = false;
      if (givenNum > 0) {
        try {
          const payRes = await fetch('https://karanfinance.com/api/payments/process', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
              clientId: selectedClient._id,
              amount: givenNum,
              paymentMethod: 'Foreclosure',
              notes: 'Loan Foreclosure Payment',
              paymentDate: new Date().toISOString()
            })
          });
          if (payRes.ok) {
            paymentSuccess = true;
          } else {
            const errData = await payRes.json().catch(() => ({}));
            console.error('Payment process error during foreclosure:', errData);
          }
        } catch (e) {
          console.warn('Payment process endpoint error, falling back to client update:', e);
        }
      }

      // 2. Always update client status to paid and pending to 0
      const updateRes = await fetch(`https://karanfinance.com/api/clients/${selectedClient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          received: totalLoanAmount,
          pending: 0,
          status: 'paid',
          notes: 'Loan Foreclosed'
        })
      });

      if (!updateRes.ok && !paymentSuccess) {
        const data = await updateRes.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to foreclose loan');
      }

      try {
        localStorage.removeItem(`markedPaid_${selectedClient._id}`);
        localStorage.removeItem(`pushedNotPaid_${selectedClient._id}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      const updatedClient = {
        ...selectedClient,
        received: totalLoanAmount,
        pending: 0,
        status: 'paid',
        notes: 'Loan Foreclosed',
        isForeclosed: true
      };

      setSelectedClient(updatedClient);
      setClients(prev => prev.map(c => c._id === selectedClient._id ? updatedClient : c));

      // Immediately mark all unpaid weeks as paid in duePayments state
      const nowISO = new Date().toISOString().split('T')[0];
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const staffName = user?.name || user?.username || 'Foreclosed';
      const staffRole = user?.role || 'admin';

      setDuePayments(prev => prev.map(w => {
        if (w.status !== 'paid') {
          return {
            ...w,
            status: 'paid',
            paidDate: nowISO,
            collectedStaff: staffName,
            collectedByRole: staffRole,
            isForeclosed: true
          };
        }
        return w;
      }));

      // Dispatch global events so Payment History and other components update immediately
      window.dispatchEvent(new CustomEvent('paymentRecorded', {
        detail: {
          clientId: selectedClient._id,
          amount: givenNum,
          paymentMethod: 'Foreclosure',
          paymentDate: new Date().toISOString()
        }
      }));
      window.dispatchEvent(new CustomEvent('clientUpdated', {
        detail: { clientId: selectedClient._id, status: 'paid' }
      }));

      setRefreshTrigger(prev => prev + 1);
      setShowForecloseModal(false);
      showPopup('success', 'Loan Foreclosed', 'Loan has been foreclosed and marked as fully paid.');
    } catch (error) {
      console.error('Error foreclosing loan:', error);
      showPopup('error', 'Foreclose Failed', error.message || 'Failed to foreclose loan');
    } finally {
      setForecloseLoading(false);
    }
  };

  const openCancelForecloseModal = () => {
    setShowCancelForecloseModal(true);
  };

  const handleConfirmCancelForeclose = async () => {
    if (!selectedClient) return;
    try {
      setCancelForecloseLoading(true);
      const token = localStorage.getItem('token');

      // 1. Fetch current payment records to identify foreclosure payment(s)
      const historyRes = await fetch(`https://karanfinance.com/api/payments/history?clientId=${selectedClient._id}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        }
      });

      let payments = [];
      if (historyRes.ok) {
        const historyData = await historyRes.json();
        payments = historyData.data?.payments || [];
      }

      // Delete any foreclosure payment records
      const foreclosurePayments = payments.filter(p => p.paymentMethod === 'Foreclosure');
      for (const fp of foreclosurePayments) {
        try {
          await fetch(`https://karanfinance.com/api/payments/${fp._id}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ clientId: selectedClient._id, amount: fp.amount })
          });
        } catch (e) {
          console.warn('Error deleting foreclosure payment record:', e);
        }
      }

      // Calculate restored received from standard payments
      const standardPayments = payments.filter(p => p.paymentMethod !== 'Foreclosure');
      const restoredReceived = standardPayments.reduce((sum, p) => sum + (p.dueAmount || p.amount || 0), 0);
      const totalAmount = selectedClient.amount || 6900;
      const restoredPending = Math.max(0, totalAmount - restoredReceived);
      const restoredStatus = restoredPending <= 0 ? 'paid' : (restoredReceived > 0 ? 'partial' : 'pending');

      // Update client in backend
      const updateRes = await fetch(`https://karanfinance.com/api/clients/${selectedClient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          received: restoredReceived,
          pending: restoredPending,
          status: restoredStatus,
          notes: ''
        })
      });

      if (!updateRes.ok) {
        const errData = await updateRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to cancel foreclosure');
      }

      const updatedClient = {
        ...selectedClient,
        received: restoredReceived,
        pending: restoredPending,
        status: restoredStatus,
        notes: '',
        isForeclosed: false
      };

      setSelectedClient(updatedClient);
      setClients(prev => prev.map(c => c._id === selectedClient._id ? updatedClient : c));

      // Revert foreclosed weeks in duePayments state
      setDuePayments(prev => prev.map(w => w.isForeclosed ? {
        ...w,
        status: 'pending',
        paidDate: null,
        collectedStaff: null,
        collectedByRole: null,
        paymentId: null,
        isForeclosed: false
      } : w));

      // Dispatch global events so Payment History updates
      window.dispatchEvent(new CustomEvent('paymentRecorded', {
        detail: { clientId: selectedClient._id }
      }));
      window.dispatchEvent(new CustomEvent('clientUpdated', {
        detail: { clientId: selectedClient._id, status: restoredStatus }
      }));

      setRefreshTrigger(prev => prev + 1);
      setShowCancelForecloseModal(false);
      showPopup('success', 'Foreclosure Cancelled', 'Foreclosure has been cancelled. Loan reopened and week set restored.');
    } catch (error) {
      console.error('Error cancelling foreclosure:', error);
      showPopup('error', 'Cancel Failed', error.message || 'Failed to cancel foreclosure');
    } finally {
      setCancelForecloseLoading(false);
    }
  };

  const handleConfirmReloan = async () => {
    if (!selectedClient || !reloanStartDate) return;
    try {
      setReloanLoading(true);
      const token = localStorage.getItem('token');
      const start = new Date(reloanStartDate);
      const end = new Date(start.getTime() + 12 * 7 * 24 * 60 * 60 * 1000);
      const loanAmount = selectedClient.amount || 6900;
      const weeklyAmount = 575;

      const payload = {
        loan_start_date: start.toISOString(),
        loan_end_date: end.toISOString(),
        received: 0,
        pending: loanAmount,
        weekly_amount: weeklyAmount,
        total_weeks: 12,
        status: 'pending',
        dispensary: reloanDispensary ? new Date(reloanDispensary).toISOString() : null,
        // Update landmark and district for new loan cycle — used by DailyDues landmark filtering
        ...(reloanLandmark ? { landmark: reloanLandmark } : {}),
        ...(reloanDistrict ? { district: reloanDistrict } : {})
      };

      const res = await fetch(`https://karanfinance.com/api/clients/${selectedClient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to submit reloan');
      }

      try {
        localStorage.removeItem(`markedPaid_${selectedClient._id}`);
        localStorage.removeItem(`pushedNotPaid_${selectedClient._id}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      const updatedClient = {
        ...selectedClient,
        ...payload,
        loan_start_date: start.toISOString(),
        loan_end_date: end.toISOString(),
        received: 0,
        pending: loanAmount,
        status: 'pending'
      };

      setSelectedClient(updatedClient);
      setClients(prev => prev.map(c => c._id === selectedClient._id ? updatedClient : c));

      setRefreshTrigger(prev => prev + 1);
      setHistoryViewMode('current');
      setShowReloanModal(false);
      showPopup('success', 'Reloan Successful', 'New loan cycle has been started for this client.');
    } catch (error) {
      console.error('Error initiating reloan:', error);
      showPopup('error', 'Reloan Failed', error.message || 'Failed to reloan client');
    } finally {
      setReloanLoading(false);
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

  const capitalize = (s) => {
    if (!s) return '';
    return s.charAt(0).toUpperCase() + s.slice(1);
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
                <p className="text-sm text-emerald-100">Manage and view client details</p>
              </div>

              {/* Search and Filters Section */}
              <div className="bg-white/90 backdrop-blur-lg rounded-lg p-3 mt-4">

                {/* Search and Filters in Single Row */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                  {/* Search Bar */}
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder="Search by name, phone, ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm"
                    />
                  </div>

                  {/* District Filter */}
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

                  {/* Landmark Filter */}
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

                  {/* Status Filter */}
                  <div>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] bg-white cursor-pointer text-sm font-medium"
                    >
                      <option value="">All Status</option>
                      <option value="pending">⏳ Pending (Unpaid / Overdue)</option>
                      <option value="partial">⚠️ Partial</option>
                      <option value="paid">✅ Paid</option>
                    </select>
                  </div>
                </div>

                {/* Results Count */}
                <div className="mt-2 text-xs text-[#16423C]">
                  <i className="fas fa-list text-[#16423C] mr-1"></i>
                  Showing {filteredClients.length} of {clients.length} clients
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
                <p>Error: {error}</p>
              </div>
            )}

            {/* Client Grid - 5 columns */}
            {!loading && filteredClients.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredClients.map((client) => (
                  <div
                    key={client._id}
                    onClick={() => {
                      setSelectedClientId(client._id);
                      setSelectedClient(client);
                    }}
                    className="bg-white rounded-lg p-3 shadow cursor-pointer transition-all duration-300 hover:shadow-lg border-2 border-[#16423C]/20 hover:border-[#16423C]/50 group"
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#6A9C89] border-2 border-[#C4DAD2] mb-2 group-hover:bg-[#5a8b79] transition-colors">
                        {client.name ? client.name.substring(0, 2).toUpperCase() : 'CL'}
                      </div>
                      <h4 className="text-md font-bold text-[#16423C] mb-1 line-clamp-2 leading-tight">{client.name}</h4>
                      <p className="text-md text-gray-500 mb-1 truncate">ID: {client.clientId || 'N/A'}</p>
                      <p className="text-md text-gray-400 truncate">{client.phone}</p>
                      <div className="mt-2 w-full px-1">
                        <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded ${client.status === 'paid' ? 'bg-green-100 text-green-800' :
                          isClientOverdue(client) ? 'bg-red-100 text-red-800 font-bold' :
                            client.status === 'partial' ? 'bg-amber-100 text-amber-800' :
                              'bg-red-100 text-red-800'
                          }`}>
                          {client.status === 'paid' ? '✅ Paid' :
                            isClientOverdue(client) ? '⏳ Pending (Overdue)' :
                              client.status === 'partial' ? '⚠️ Partial' :
                                '⏳ Pending'}
                        </span>
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
                  {searchQuery || selectedDistrict || selectedLandmark
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

            {/* Back Button */}
            <button
              onClick={() => {
                setSelectedClientId(null);
                setSelectedClient(null);
              }}
              className="flex items-center gap-2 text-[#16423C] font-semibold mb-4 hover:text-[#6A9C89] transition-colors group text-base"
            >
              <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
              Back
            </button>

            {/* Client Profile Header */}
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
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedClient.status !== 'paid' && (selectedClient.pending > 0 || (selectedClient.amount || 6900) - (selectedClient.received || 0) > 0) && (
                      <button
                        onClick={openPayModal}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        title="Collect / Process Custom Payment"
                      >
                        <i className="fas fa-money-bill-wave text-xs"></i>
                        Pay Due
                      </button>
                    )}
                    {selectedClient.status !== 'paid' ? (
                      <button
                        onClick={openForecloseModal}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        title="Foreclose Loan"
                      >
                        <i className="fas fa-hand-holding-dollar text-xs"></i>
                        Foreclose
                      </button>
                    ) : (
                      <button
                        onClick={openCancelForecloseModal}
                        className="bg-red-600 hover:bg-red-700 text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                        title="Cancel Foreclosure and Reopen Loan"
                      >
                        <i className="fas fa-rotate-left text-xs"></i>
                        Cancel Foreclose
                      </button>
                    )}
                    <button
                      onClick={openReloanModal}
                      className="bg-[#16423C] hover:bg-[#1f5a52] text-white px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer"
                      title="Start New Loan (Reloan)"
                    >
                      <i className="fas fa-rotate-right text-xs"></i>
                      Reloan
                    </button>
                    <span className={`inline-block px-3 py-1 rounded text-base font-semibold text-white ${selectedClient.status === 'paid' ? 'bg-green-500' :
                      isClientOverdue(selectedClient) ? 'bg-red-600' :
                        selectedClient.status === 'partial' ? 'bg-amber-500' :
                          'bg-red-500'
                      }`}>
                      {selectedClient.status === 'paid' ? '✅ Paid' :
                        isClientOverdue(selectedClient) ? '⏳ Pending (Overdue)' :
                          selectedClient.status === 'partial' ? '⚠️ Partial' :
                            '⏳ Pending'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            {/* <div className="flex flex-col sm:flex-row gap-2 mb-6">
              <button className="flex-1 bg-[#16423C] text-white px-4 py-2 rounded text-base font-semibold hover:bg-[#0f2e29] transition-all flex items-center justify-center gap-2">
                <i className="fas fa-plus"></i>
                Add Loan
              </button>
              <button className="flex-1 bg-[#6A9C89] text-white px-4 py-2 rounded text-base font-semibold hover:bg-[#5a8b79] transition-all flex items-center justify-center gap-2">
                <i className="fas fa-edit"></i>
                Edit
              </button>
            </div> */}

            {/* Tabs */}
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

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Personal Information */}
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
                        <p className="font-semibold text-base text-[#16423C]">{selectedClient.clientId || 'N/A'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Information */}
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

                  {/* Loan Information */}
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

                  {/* Nominee Information */}
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

                      {activePaymentList.length === 0 ? (
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
                                <th className="p-2 text-left">Collected By</th>
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
                                    <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${payment.status === 'paid'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                      }`}>
                                      {payment.status === 'paid' ? '✅ Paid' : '⏳ Pending'}
                                    </span>
                                  </td>
                                  <td className="p-2 text-center text-gray-600">
                                    {payment.paidDate ? formatDate(payment.paidDate) : '-'}
                                  </td>
                                  <td className="p-2 text-gray-600">
                                    {payment.collectedStaff ? (
                                      payment.collectedStaff + (payment.collectedByRole ? ` (${capitalize(payment.collectedByRole)})` : '')
                                    ) : '-'}
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
                    <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {selectedClient.clientId || 'N/A'} • {selectedClient.phone}</div>
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

      {/* Foreclose Modal */}
      {showForecloseModal && selectedClient && (() => {
        const totalLoanVal = selectedClient.amount === 6900 ? 5000 : (selectedClient.amount || 0);
        const totalLoanFull = selectedClient.amount || 6900;
        const currentReceived = selectedClient.received || 0;
        const balAmount = selectedClient.pending !== undefined && selectedClient.pending !== null
          ? selectedClient.pending
          : Math.max(0, totalLoanFull - currentReceived);
        const givenNum = Number(forecloseGivenAmount || 0);
        const remainingBal = balAmount - givenNum;
        const isMatch = (givenNum === balAmount) && balAmount >= 0;

        return (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-100">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                <div className="flex items-center gap-2 text-[#16423C]">
                  <i className="fas fa-hand-holding-dollar text-lg text-amber-600"></i>
                  <h3 className="text-xl font-bold">Foreclose Loan</h3>
                </div>
                <button
                  onClick={() => setShowForecloseModal(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-[#E9EFEC] p-3 rounded-lg border border-[#C4DAD2]">
                  <p className="text-xs text-gray-500 uppercase font-semibold">Client</p>
                  <p className="text-base font-bold text-[#16423C]">{selectedClient.name}</p>
                  <p className="text-xs text-gray-600">ID: {selectedClient.clientId || 'N/A'}</p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-center">
                    <p className="text-xs text-gray-500 font-medium">Total Loan</p>
                    <p className="text-sm font-bold text-[#16423C]">{formatCurrency(totalLoanVal)}</p>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 text-center">
                    <p className="text-xs text-emerald-800 font-medium">Given / Paid</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(currentReceived)}</p>
                  </div>
                  <div className="bg-red-50 p-2.5 rounded-lg border border-red-200 text-center">
                    <p className="text-xs text-red-800 font-medium">Total Balance</p>
                    <p className="text-sm font-bold text-red-600">{formatCurrency(balAmount)}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-[#16423C] mb-1">
                    Foreclose Given Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={forecloseGivenAmount}
                    onChange={(e) => setForecloseGivenAmount(e.target.value)}
                    placeholder="Enter balance amount..."
                    className="w-full px-3 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] text-base font-bold text-[#16423C] bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 bg-gray-50 rounded border border-gray-200">
                    <span className="text-gray-500">Required Balance: </span>
                    <span className="font-bold text-gray-800">{formatCurrency(balAmount)}</span>
                  </div>
                  <div className="p-2 bg-gray-50 rounded border border-gray-200">
                    <span className="text-gray-500">Remaining Balance: </span>
                    <span className={`font-bold ${remainingBal === 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.max(0, remainingBal))}
                    </span>
                  </div>
                </div>

                {isMatch ? (
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                    <i className="fas fa-check-circle text-emerald-600 text-base flex-shrink-0"></i>
                    <span>Given amount matches total balance! Click confirm to foreclose loan & mark all 12 weeks as paid.</span>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
                    <i className="fas fa-exclamation-triangle text-amber-600 text-base flex-shrink-0"></i>
                    <span>Given amount must match total balance amount ({formatCurrency(balAmount)}) to foreclose loan.</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirmForeclose}
                  disabled={forecloseLoading || !isMatch}
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2.5 rounded-lg font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {forecloseLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Foreclosing...
                    </>
                  ) : (
                    'Confirm Foreclose'
                  )}
                </button>
                <button
                  onClick={() => setShowForecloseModal(false)}
                  className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cancel Foreclose Modal */}
      {showCancelForecloseModal && selectedClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/50 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-rotate-left text-2xl text-red-600"></i>
            </div>
            <h2 className="text-2xl font-bold text-[#16423C] mb-2">Cancel Foreclosure</h2>
            <p className="text-gray-600 text-sm mb-6">
              Are you sure you want to cancel the foreclosure for <strong>{selectedClient.name}</strong>? This will reopen the loan and restore previous dues and payment schedule.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmCancelForeclose}
                disabled={cancelForecloseLoading}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {cancelForecloseLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Cancelling...
                  </>
                ) : (
                  'Yes, Cancel Foreclose'
                )}
              </button>
              <button
                onClick={() => setShowCancelForecloseModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-2.5 rounded-lg font-semibold hover:bg-gray-300 transition-all"
              >
                No, Keep Paid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reloan Modal */}
      {showReloanModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-[#16423C]">
                <i className="fas fa-rotate-right text-lg"></i>
                <h3 className="text-xl font-bold">Reloan Client</h3>
              </div>
              <button
                onClick={() => setShowReloanModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="fas fa-times text-lg"></i>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-[#E9EFEC] p-3 rounded-lg border border-[#C4DAD2]">
                <p className="text-xs text-gray-500 uppercase font-semibold">Client</p>
                <p className="text-base font-bold text-[#16423C]">{selectedClient?.name}</p>
                <p className="text-xs text-gray-600">ID: {selectedClient?.clientId || 'N/A'}</p>
              </div>

              {/* Previous Loan Landmark — read-only info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Previous Loan Landmark</p>
                <p className="text-sm font-bold text-blue-900">
                  {selectedClient?.landmark?.trim() || <span className="text-gray-400 font-normal italic">Not set</span>}
                </p>
              </div>

              {/* New Loan Landmark */}
              <div>
                <label className="block text-sm font-semibold text-[#16423C] mb-1">
                  New Loan Landmark <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reloanLandmark}
                  onChange={(e) => setReloanLandmark(e.target.value)}
                  placeholder="Enter landmark"
                  className="w-full px-3 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm font-medium text-[#16423C] bg-white"
                />
                {!reloanLandmark && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <i className="fas fa-exclamation-triangle"></i>
                    Enter the landmark for the new loan cycle (used in Daily Dues)
                  </p>
                )}
              </div>

              {/* New Loan District */}
              <div>
                <label className="block text-sm font-semibold text-[#16423C] mb-1">
                  District
                </label>
                <input
                  type="text"
                  value={reloanDistrict}
                  onChange={(e) => setReloanDistrict(e.target.value)}
                  placeholder="Enter district"
                  className="w-full px-3 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm font-medium text-[#16423C] bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#16423C] mb-1">
                  Loan Start Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={reloanStartDate}
                  onChange={(e) => setReloanStartDate(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm font-medium text-[#16423C] bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#16423C] mb-1">
                  Dispensary Date
                </label>
                <input
                  type="date"
                  value={reloanDispensary}
                  onChange={(e) => setReloanDispensary(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm font-medium text-[#16423C] bg-white"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">
                  Calculated Loan End Date (12 Weeks)
                </label>
                <input
                  type="text"
                  readOnly
                  value={
                    reloanStartDate
                      ? new Date(new Date(reloanStartDate).getTime() + 12 * 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })
                      : 'N/A'
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-700 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-800 font-medium">New Loan Amount</p>
                  <p className="text-base font-bold text-emerald-900">
                    ₹{Number(selectedClient?.amount === 6900 ? 5000 : (selectedClient?.amount || 5000)).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  <p className="text-xs text-emerald-800 font-medium">Weekly Due</p>
                  <p className="text-base font-bold text-emerald-900">₹575</p>
                </div>
              </div>

              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                <i className="fas fa-info-circle mr-1"></i>
                Starting a reloan will reset current dues and archive previous payment history under "Previous Loan History".
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmReloan}
                disabled={reloanLoading || !reloanStartDate || !reloanLandmark}
                className="flex-1 bg-[#16423C] hover:bg-[#1f5a52] text-white py-2.5 rounded-lg font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {reloanLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  'Confirm Reloan'
                )}
              </button>
              <button
                onClick={() => setShowReloanModal(false)}
                className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Popup notification */}
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

      {/* Font Awesome */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
    </div>
  );
};

export default AClientDetails;