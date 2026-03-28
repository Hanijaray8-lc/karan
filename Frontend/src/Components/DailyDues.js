import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import AgentNavbar from './AgentNavbar';  // ← adjust path if needed

const DailyDues = () => {
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('selectedDistrict');
    return saved || '';
  });
  const [selectedLandmark, setSelectedLandmark] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('selectedLandmark');
    return saved || '';
  });
  const [showClientModal, setShowClientModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarDateFilter, setCalendarDateFilter] = useState('');
  // Track per-client actions done today (frontend-only + server check for payments)
  const [paidTodayMap, setPaidTodayMap] = useState({}); // localStorage marker for Mark Paid
  const [notPaidTodayMap, setNotPaidTodayMap] = useState({}); // localStorage marker for Not Paid
  const [serverPaidTodayMap, setServerPaidTodayMap] = useState({}); // server-side payments today
  const [selectedAlpha, setSelectedAlpha] = useState(''); // alphabet filter for landmarks
  const [showMoreAlpha, setShowMoreAlpha] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // trigger to refresh clients after state changes (matches Agent view)
  // Maintain an ordered list of landmarks (persisted to localStorage) for drag-reorder
  const [orderedLandmarks, setOrderedLandmarks] = useState(() => {
    try {
      const saved = localStorage.getItem('landmarkOrder');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // Derive available landmarks from clients (filtered by selected district)
  const getAvailableLandmarks = () => {
    // Count clients per landmark (respect selected district filter) and
    // return landmarks sorted by count desc, then alphabetically.
    const counts = {};
    clients.forEach((c) => {
      const lm = (c.landmark || '').toString().trim();
      if (!lm) return;
      if (selectedDistrict) {
        if ((c.district || '').toString() !== selectedDistrict) return;
      }
      counts[lm] = (counts[lm] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return a.localeCompare(b);
    });
  };

  // Auto-select a landmark when an alphabet filter yields exactly one match
  useEffect(() => {
    if (!selectedAlpha) return;
    const avail = getAvailableLandmarks();
    const filtered = avail.filter(l => (l || '').toString().toLowerCase().startsWith(selectedAlpha.toLowerCase()));
    if (filtered.length === 1) setSelectedLandmark(filtered[0]);
  }, [selectedAlpha, clients, selectedDistrict]);

  const getIconForLandmark = (name) => {
    if (!name) return '🏷️';
    const n = name.toLowerCase();
    if (n.includes('tea') || n.includes('shop') || n.includes('t.nagar') || n.includes('tnagar')) return '☕';
    if (n.includes('k.k') || n.includes('kk')) return '🏙️';
    if (n.includes('race')) return '🏁';
    if (n.includes('srirang') || n.includes('temple')) return '🏛️';
    if (n.includes('marina') || n.includes('beach')) return '🌊';
    return '🏬';
  };

  // Compute weekly amount client-side when backend value is missing
  const computeWeeklyAmount = (client) => {
    try {
      const pendingTotal = Number(client.pending || 0);
      const pending = isNaN(pendingTotal) ? 0 : pendingTotal;

      if (pending <= 0) return 0;
      if (!client.loan_start_date) return 0;

      const start = new Date(client.loan_start_date);
      const defaultWeeks = 12;
      // when there is no explicit end date, assume a 12‑week loan period
      // by setting the end to start + (defaultWeeks - 1) weeks.  The loop
      // that generates dues is inclusive of both start and end, so using
      // the full 12*7ms interval would produce 13 due dates.  Subtracting
      // one week ensures the initial count is 12, and pushing the due
      // date by one week increases the count to 13 as expected.
      const end = client.loan_end_date
        ? new Date(client.loan_end_date)
        : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

      let durationMs = end.getTime() - start.getTime();
      let durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
      let weeks = Math.ceil(durationDays / 7);
      if (!weeks || weeks < 1) weeks = defaultWeeks;

      const weekly = weeks > 0 ? (pending / weeks) : 0;
      return Math.round(weekly * 100) / 100;
    } catch (err) {
      return 0;
    }
  };

  // Save district filter to localStorage
  useEffect(() => {
    localStorage.setItem('selectedDistrict', selectedDistrict);
  }, [selectedDistrict]);

  // Save landmark filter to localStorage
  useEffect(() => {
    localStorage.setItem('selectedLandmark', selectedLandmark);
  }, [selectedLandmark]);

  // Mock data - replace with actual API call
  useEffect(() => {
    fetchClients();

    // Setup polling to check for payments made by other users (every 30 seconds)
    const pollInterval = setInterval(() => {
      fetchClientsWithoutLoading();
    }, 30000); // 30 seconds

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
  }, []);

  // Listen for client updates from other components (e.g., payment cancellation)
  useEffect(() => {
    const handleClientUpdate = (event) => {
      const { clientId, loan_end_date } = event.detail;
      const todayISO = new Date().toISOString().split('T')[0];
      setClients(prevClients =>
        prevClients.map(client => {
          if (client._id !== clientId) return client;
          const updated = { ...client, loan_end_date: loan_end_date, paid: false };
          if (updated.paidDates instanceof Set) {
            const newSet = new Set(updated.paidDates);
            newSet.delete(todayISO);
            updated.paidDates = newSet;
          } else if (Array.isArray(updated.paidDates)) {
            updated.paidDates = updated.paidDates.filter(d => d !== todayISO);
          }
          return updated;
        })
      );
      // Clear local action markers to re-enable buttons
      setPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      setNotPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      // Clear server-side payment flag
      setServerPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      // Clear localStorage entry for marked paid action
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
      } catch (e) { }
      // Also update selectedClient if it's the same client
      setSelectedClient(prev => {
        if (!prev || prev._id !== clientId) return prev;
        const updated = { ...prev, loan_end_date: loan_end_date, paid: false };
        // remove today's paid date if present
        if (updated.paidDates instanceof Set) {
          const newSet = new Set(updated.paidDates);
          newSet.delete(todayISO);
          updated.paidDates = newSet;
        } else if (Array.isArray(updated.paidDates)) {
          updated.paidDates = updated.paidDates.filter(d => d !== todayISO);
        }
        return updated;
      });
      // trigger a small refresh so derived UI state (buttons, stats) re-evaluates
      setRefreshTrigger(prev => prev + 1);
      showNotification('Client due date has been extended due to payment cancellation.', 'info');
    };

    const handleClientPaid = (event) => {
      const { clientId } = event.detail;
      setClients(prevClients =>
        prevClients.map(client =>
          client._id === clientId ? { ...client, paid: true } : client
        )
      );
    };

    window.addEventListener('clientUpdated', handleClientUpdate);
    window.addEventListener('clientPaid', handleClientPaid);
    return () => {
      window.removeEventListener('clientUpdated', handleClientUpdate);
      window.removeEventListener('clientPaid', handleClientPaid);
    };
  }, []);

  // Fetch clients without showing loading indicator (for polling)
  const fetchClientsWithoutLoading = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/clients/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return;

      const data = await res.json();

      if (data.success && data.clients) {
        const transformedClients = data.clients.map(client => {
          const forcedWeekly = 575;
          const display = `₹${forcedWeekly.toLocaleString('en-IN')}`;
          const rawPending = client.pending ?? ((client.amount !== undefined && client.received !== undefined) ? (client.amount - client.received) : null);
          const normalizedPending = Number(rawPending ?? 0);

          return {
            ...client,
            pending: isNaN(normalizedPending) ? 0 : normalizedPending,
            weekly_amount_value: forcedWeekly,
            daily_amount: display,
            daily_amount_value: forcedWeekly,
            pending_amount: isNaN(normalizedPending) ? 0 : normalizedPending,
            paidDates: new Set(),
            paid: false,
            type: 'loan'
          };
        });
        // Attach paid status by checking payment records
        try {
          const payRes = await fetch('http://localhost:5000/api/payments/test/all');
          const payJson = payRes.ok ? await payRes.json() : null;
          const payments = (payJson && payJson.data && payJson.data.payments) || [];
          const todayISO = new Date().toISOString().split('T')[0];
          const paidDatesMap = {};

          payments.forEach(p => {
            const clientId = p.client && p.client._id ? String(p.client._id) : (p.client ? String(p.client) : null);
            const pDate = p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : null;
            if (clientId && pDate) {
              if (!paidDatesMap[clientId]) paidDatesMap[clientId] = new Set();
              paidDatesMap[clientId].add(pDate);
            }
          });

          const withPaid = transformedClients.map(c => {
            const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : null);
            const paidDates = paidDatesMap[id] || new Set();
            return { ...c, paidDates, paid: paidDates.has(todayISO) };
          });

          const paidMap = {};
          withPaid.forEach(c => { const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : null); if (id) paidMap[id] = Boolean(c.paid); });
          setServerPaidTodayMap(paidMap);

          setClients(withPaid);
        } catch (err) {
          setClients(transformedClients);
        }
      }
    } catch (error) {
      // Silently fail for polling - don't show errors
    }
  };

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/clients/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch clients');

      const data = await res.json();

      if (data.success && data.clients) {
        // Transform API data to include weekly due information
        const transformedClients = data.clients.map(client => {
          // Force weekly amount globally to 575 as requested
          const forcedWeekly = 575;

          // format display (integer)
          const display = `₹${forcedWeekly.toLocaleString('en-IN')}`;

          // normalize pending: prefer explicit pending, otherwise amount - received
          const rawPending = client.pending ?? ((client.amount !== undefined && client.received !== undefined) ? (client.amount - client.received) : null);
          const normalizedPending = Number(rawPending ?? 0);

          return {
            ...client,
            // normalized numeric pending
            pending: isNaN(normalizedPending) ? 0 : normalizedPending,
            // weekly/daily amount fields used in UI
            weekly_amount_value: forcedWeekly,
            daily_amount: display,
            daily_amount_value: forcedWeekly,
            pending_amount: isNaN(normalizedPending) ? 0 : normalizedPending,
            paidDates: new Set(),
            paid: false,
            type: 'loan'
          };
        });

        try {
          const payRes = await fetch('http://localhost:5000/api/payments/test/all');
          const payJson = payRes.ok ? await payRes.json() : null;
          const payments = (payJson && payJson.data && payJson.data.payments) || [];
          const todayISO = new Date().toISOString().split('T')[0];
          const paidDatesMap = {};

          payments.forEach(p => {
            const clientId = p.client && p.client._id ? String(p.client._id) : (p.client ? String(p.client) : null);
            const pDate = p.paymentDate ? new Date(p.paymentDate).toISOString().split('T')[0] : null;
            if (clientId && pDate) {
              if (!paidDatesMap[clientId]) paidDatesMap[clientId] = new Set();
              paidDatesMap[clientId].add(pDate);
            }
          });

          const withPaid = transformedClients.map(c => {
            const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : null);
            const paidDates = paidDatesMap[id] || new Set();
            return { ...c, paidDates, paid: paidDates.has(todayISO) };
          });

          const paidMap = {};
          withPaid.forEach(c => { const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : null); if (id) paidMap[id] = Boolean(c.paid); });
          setServerPaidTodayMap(paidMap);

          setClients(withPaid);
        } catch (err) {
          setClients(transformedClients);
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showNotification('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  // Calculate if client is due in the given week
  const isClientDueInWeek = (client, weekStartDate, weekEndDate) => {
    // use total pending amount (client.pending) to determine if loan is active
    if (!client.loan_start_date || Number(client.pending) <= 0) {
      return false;
    }

    const loanStartDate = new Date(client.loan_start_date);
    const loanEndDate = new Date(client.loan_end_date);

    // Calculate all weekly due dates for the client
    let dueDate = new Date(loanStartDate);

    while (dueDate <= loanEndDate) {
      // Check if this due date falls within the selected week
      if (dueDate >= weekStartDate && dueDate <= weekEndDate) {
        return true;
      }

      // Move to next week
      dueDate.setDate(dueDate.getDate() + 7);
    }

    return false;
  };

  // Get week start and end dates
  const getWeekRange = (date) => {
    const curr = new Date(date);
    const first = curr.getDate() - curr.getDay();
    const weekStart = new Date(curr.setDate(first));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Set time to start and end of day
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  };

  // Filter clients by due week
  const filterClientsByDueWeek = (date) => {
    const { weekStart, weekEnd } = getWeekRange(date);
    return clients.filter(client => isClientDueInWeek(client, weekStart, weekEnd));
  };

  // Apply all filters
  const getFilteredClients = () => {
    // kept for week-based calculations (calendar, stats, export)
    let filtered = filterClientsByDueWeek(selectedDate);

    if (selectedDistrict) {
      filtered = filtered.filter(client => client.district === selectedDistrict);
    }

    if (selectedLandmark) {
      filtered = filtered.filter(client => client.landmark === selectedLandmark);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client => {
        return client.name.toLowerCase().includes(query) ||
          client.phone.includes(query) ||
          (client.address && client.address.toLowerCase().includes(query));
      });
    }

    return filtered;
  };

  // Get clients to display in the grid (shows clients due on selected date and unpaid)
  const getDisplayedClients = () => {
    let displayed = [...clients];

    // Filter by due date (today or selected calendar date) and unpaid
    const filterDate = calendarDateFilter || selectedDate.toISOString().split('T')[0];
    displayed = displayed.filter(client => isClientDueOnDate(client, filterDate) && !client.paidDates.has(filterDate));

    if (selectedDistrict) {
      displayed = displayed.filter(client => client.district === selectedDistrict);
    }

    if (selectedLandmark) {
      displayed = displayed.filter(client => client.landmark === selectedLandmark);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      displayed = displayed.filter(client => {
        return (client.name && client.name.toLowerCase().includes(query)) ||
          (client.phone && client.phone.includes(query)) ||
          (client.address && client.address.toLowerCase().includes(query));
      });
    }

    return displayed;
  };

  // Get unique districts
  const getUniqueDistricts = () => {
    return [...new Set(clients.map(c => c.district))].filter(d => d).sort();
  };

  // Calculate stats
  const calculateStats = () => {
    let filtered = getFilteredClients();

    // If a calendar date is selected, only show stats for clients due on that specific date
    if (calendarDateFilter) {
      filtered = filtered.filter(client => isClientDueOnDate(client, calendarDateFilter));
    }

    let totalDue = 0;
    let totalPaid = 0;

    filtered.forEach(client => {
      const amt = client.daily_amount_value || 0;
      if (client.paid) {
        totalPaid += amt;
      } else {
        totalDue += amt;
      }
    });

    return { totalDue, totalPaid };
  };

  // Handle client click
  const handleClientClick = (client) => {
    setSelectedClient(client);
    setShowClientModal(true);
    if (window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden';
    }
  };

  // Helpers for per-day action checks
  const todayKey = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  const isLocalActionDoneToday = (clientId, action) => {
    try {
      const key = `${action}_${clientId}`;
      const v = localStorage.getItem(key);
      return v === todayKey();
    } catch (e) { return false; }
  };

  const setLocalActionDone = (clientId, action) => {
    try {
      const key = `${action}_${clientId}`;
      localStorage.setItem(key, todayKey());
      if (action === 'markedPaid') setPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
      if (action === 'pushedNotPaid') setNotPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
    } catch (e) { }
  };

  // Helper to get today's date string (YYYY-MM-DD)
  const getTodayDateString = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  // Query server for any payments for this client today (to avoid duplicate Mark Paid)
  const checkServerPaymentsToday = async (clientId) => {
    try {
      const token = localStorage.getItem('token');
      if (!clientId) return false;

      const today = getTodayDateString();
      // Query for payments made today for this specific client
      const res = await fetch(`http://localhost:5000/api/payments/history?clientId=${clientId}&startDate=${today}&endDate=${today}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return false;

      const data = await res.json();
      // Check if there are any payments recorded today
      const exists = data && data.data && Array.isArray(data.data.payments) && data.data.payments.length > 0;
      setServerPaidTodayMap(prev => ({ ...prev, [clientId]: exists }));
      return exists;
    } catch (err) {
      console.error('Error checking payments today:', err);
      return false;
    }
  };

  // When modal opens (selectedClient), check localStorage and server state for today's actions
  useEffect(() => {
    if (!selectedClient) return;
    const id = selectedClient._id || selectedClient.clientId || selectedClient.id;
    if (!id) return;

    // populate local maps from localStorage
    if (isLocalActionDoneToday(id, 'markedPaid')) {
      setPaidTodayMap(prev => ({ ...prev, [id]: true }));
    }
    if (isLocalActionDoneToday(id, 'pushedNotPaid')) {
      setNotPaidTodayMap(prev => ({ ...prev, [id]: true }));
    }

    // check server for payments today
    checkServerPaymentsToday(id);
  }, [selectedClient]);

  // Force modal button state update when payment maps are cleared
  useEffect(() => {
    if (!selectedClient) return;
    const id = selectedClient._id || selectedClient.clientId || selectedClient.id;
    if (!id) return;
    
    // If both maps are empty for this client, sync selectedClient state to ensure modal button re-evaluates
    if (!serverPaidTodayMap[id] && !paidTodayMap[id]) {
      // Force a fresh copy of selectedClient to trigger re-render and button state evaluation
      setSelectedClient(prev => {
        if (!prev || (prev._id !== id && prev.clientId !== id && prev.id !== id)) return prev;
        // Ensure paidDates is an array/set for consistent evaluation
        if (!prev.paidDates || (!Array.isArray(prev.paidDates) && !(prev.paidDates instanceof Set))) {
          return { ...prev, paidDates: [] };
        }
        return { ...prev };
      });
    }
  }, [serverPaidTodayMap, paidTodayMap, selectedClient?._id]);

  // POST payment for a client (mark as paid for this week's amount)
  const handleMarkPaid = async (client) => {
    try {
      const token = localStorage.getItem('token');
      const amount = Number(client.daily_amount_value || client.weekly_amount_value || 0);
      if (!amount || amount <= 0) {
        showNotification('Amount is zero, cannot mark paid', 'error');
        return;
      }

      const res = await fetch('http://localhost:5000/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ clientId: client._id, amount, paymentMethod: 'cash', notes: 'Marked from Weekly Dues' })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save payment');

      // Update button state only - disable via serverPaidTodayMap
      setServerPaidTodayMap(prev => ({ ...prev, [client._id]: true }));
      // Mark action locally for today so button stays disabled on page reload
      setLocalActionDone(client._id, 'markedPaid');
      // Update client paid status immediately
      setSelectedClient(prev => ({ ...prev, paidDates: new Set([...prev.paidDates, currentDate]), paid: true }));
      setClients(prevClients =>
        prevClients.map(c =>
          c._id === client._id ? { ...c, paidDates: new Set([...c.paidDates, currentDate]), paid: true } : c
        )
      );

      // Reset overflow immediately before closing modal
      document.body.style.overflow = 'auto';

      // Close modal and clear selected client
      setShowClientModal(false);
      setSelectedClient(null);

      // Dispatch event to sync with other components
      window.dispatchEvent(new CustomEvent('clientPaid', { detail: { clientId: client._id } }));

      showNotification('Marked as paid successfully', 'success');
    } catch (err) {
      console.error('Mark paid error:', err);
      showNotification(err.message || 'Failed to mark paid', 'error');
    }
  };

  // Handle 'Not Paid' - extend client's loan_end_date by 7 days
  const handleNotPaid = async (client) => {
    try {
      const token = localStorage.getItem('token');

      const currentEnd = client.loan_end_date ? new Date(client.loan_end_date) : null;
      let newEnd;
      if (currentEnd && !isNaN(currentEnd)) {
        newEnd = new Date(currentEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (client.loan_start_date) {
        const start = new Date(client.loan_start_date);
        // if there was no existing end date assume default 12 dues (start + 11w)
        // and then push it by 1 week, ending up with start + 12w
        newEnd = new Date(start.getTime() + 12 * 7 * 24 * 60 * 60 * 1000);
      } else {
        showNotification('Cannot extend due date: missing start date', 'error');
        return;
      }

      const res = await fetch(`http://localhost:5000/api/clients/${client._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ loan_end_date: newEnd.toISOString() })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to extend due date');

      // update local client record
      setClients(prev => prev.map(c => c._id === client._id ? { ...c, loan_end_date: newEnd.toISOString() } : c));
      // Notify other components (e.g., AddClient) about the updated loan_end_date
      try {
        window.dispatchEvent(new CustomEvent('clientLoanEndUpdated', {
          detail: { clientId: client._id, loan_end_date: newEnd.toISOString() }
        }));
      } catch (e) {
        // ignore if dispatch fails in some environments
      }
      // mark action locally for today so Not Paid can't be clicked again
      setLocalActionDone(client._id, 'pushedNotPaid');

      // Reset overflow immediately before closing modal
      document.body.style.overflow = 'auto';

      // Close modal and clear selected client
      setShowClientModal(false);
      setSelectedClient(null);

      showNotification('Due extended by 1 week', 'success');
    } catch (err) {
      console.error('Extend due error:', err);
      showNotification(err.message || 'Failed to extend due', 'error');
    }
  };

  // Close modal
  const closeModal = () => {
    document.body.style.overflow = 'auto';
    setShowClientModal(false);
    setSelectedClient(null);
  };

  // Handle export PDF
  const handleExportPDF = async () => {
    // export only clients due on the selected date (or the calendarDateFilter if set)
    const exportDateStr = calendarDateFilter || format(selectedDate, 'yyyy-MM-dd');

    // apply district/landmark filters and only include clients due on the exact date
    const candidates = clients.filter(c => {
      if (Number(c.pending) <= 0) return false;
      if (selectedDistrict && c.district !== selectedDistrict) return false;
      if (selectedLandmark && c.landmark !== selectedLandmark) return false;
      if (c.paidDates.has(exportDateStr)) return false;
      return isClientDueOnDate(c, exportDateStr);
    });

    if (candidates.length === 0) {
      showNotification('No unpaid clients to export for the selected date/filters', 'info');
      setShowExportModal(false);
      return;
    }

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();

    doc.setFontSize(16);
    let title = 'Daily Dues Report';
    if (selectedLandmark) {
      title += ` - ${selectedLandmark}`;
    }
    doc.text(title, 105, 15, { align: 'center' });
    doc.setFontSize(12);
    doc.text('Unpaid Clients Collection List', 105, 25, { align: 'center' });
    doc.text(`Report Date: ${format(new Date(exportDateStr + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}`, 105, 35, { align: 'center' });

    let y = 50;
    doc.setFontSize(11);

    // Header row for clients


    // Group candidates by landmark AND district combination
    const groups = {};
    candidates.forEach(c => {
      const landmark = (c.landmark && String(c.landmark).trim()) || 'Other Areas';
      const district = (c.district && String(c.district).trim()) || 'Other Districts';
      const key = `${landmark}|${district}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    let total = 0;
    // iterate groups in the user-defined ordered landmark order first
    const orderedKeys = [];
    orderedAvailableLandmarks.forEach(lmk => {
      Object.keys(groups).forEach(k => {
        if (k.startsWith(lmk + '|')) orderedKeys.push(k);
      });
    });
    // append any groups not present in ordered list
    Object.keys(groups).forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

    orderedKeys.forEach((landmark) => {
      const list = groups[landmark];

      // Landmark and District header
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      const [lmk, dist] = landmark.split('|');
      let hdr = `Landmark: ${lmk} ( ${dist})`;
      doc.text(hdr, 10, y);
      y += 7;
      doc.text('Client Name', 10, y);
      doc.text('Address', 80, y);
      doc.text('Phone', 130, y);
      doc.text('Amount', 180, y, { align: 'right' });
      y += 8;
      // For each client under this landmark
      list.forEach(client => {
        const amountValue = Number(client.daily_amount_value || client.weekly_amount_value || 0);
        const weekIdx = calculateWeekIndex(client, exportDateStr) || 1;
        const amountText = `RS. ${amountValue.toLocaleString('en-IN')}/${weekIdx}`;

        // Prepare row values
        const nameText = String(client.name || '');
        const districtText = client.district ? ` (${client.district})` : '';
        const address = String(client.address || '');
        const phone = String(client.phone || '');

        // write name+district in first column
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.text(nameText, 10, y);

        // write address in second column (wrap if needed)
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const addrLines = doc.splitTextToSize(address, 40);
        doc.text(addrLines, 80, y);

        // phone in third column
        if (phone) doc.text(phone, 130, y);

        // amount in last column
        doc.setFont('helvetica', 'normal');
        doc.text(amountText, 180, y, { align: 'right' });

        // move y by height of content (approx max of lines)
        const lineCount = Math.max(1, addrLines.length);
        y += 6 * lineCount;

        y += 4; // small spacer
        total += amountValue;

        if (y > 270) {
          doc.addPage();
          y = 20;
        }
      });

      // Spacer after group
      y += 6;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total: RS. ${total.toFixed(0)}`, 10, y + 10);

    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = doc.output('dataurlstring').split(',')[1];
      try {
        await Filesystem.writeFile({
          path: 'DailyDuesReport.pdf',
          data: pdfBase64,
          directory: Directory.Documents,
        });
        showNotification('PDF saved to Documents folder', 'success');
      } catch (error) {
        showNotification('Failed to save PDF: ' + error.message, 'error');
      }
    } else {
      doc.save('DailyDuesReport.pdf');
      showNotification('PDF downloaded successfully', 'success');
    }
    setShowExportModal(false);
  };

  // Get current week dates
  const getWeekDates = (date) => {
    const curr = new Date(date);
    const first = curr.getDate() - curr.getDay();
    const firstDayOfWeek = new Date(curr.setDate(first));
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(firstDayOfWeek);
      day.setDate(firstDayOfWeek.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  // Navigate to previous week
  const previousWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(newDate.getDate() - 7);
    setWeekStartDate(newDate);
  };

  // Navigate to next week
  const nextWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(newDate.getDate() + 7);
    setWeekStartDate(newDate);
  };

  // Render calendar days for current week
  const renderCalendarDays = () => {
    const weekDays = getWeekDates(weekStartDate);

    return weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const isCurrentDay = isToday(day);
      const isSelectedDay = isSameDay(day, selectedDate);

      // Count clients due on this specific day
      const clientsForDate = clients.filter(c => {
        if (!c.loan_start_date || Number(c.pending) <= 0) return false;

        const loanStartDate = new Date(c.loan_start_date);
        const loanEndDate = new Date(c.loan_end_date);
        const currentDayDate = new Date(day);

        // Calculate all weekly due dates for the client
        let dueDate = new Date(loanStartDate);

        while (dueDate <= loanEndDate) {
          // Check if this due date matches the day
          if (format(dueDate, 'yyyy-MM-dd') === dateStr) {
            return true;
          }

          // Move to next week
          dueDate.setDate(dueDate.getDate() + 7);
        }

        return false;
      }).filter(c => !c.paidDates.has(dateStr));

      const clientCount = clientsForDate.length;

      return (
        <button
          key={dateStr}
          onClick={() => {
            setSelectedDate(day);
            // toggle calendar date filter: clicking same date unsets filter
            if (calendarDateFilter === dateStr) setCalendarDateFilter('');
            else setCalendarDateFilter(dateStr);
          }}
          className={`
            flex-1 min-w-0 aspect-square p-1 text-center rounded-lg border-2 transition-all duration-200
            flex flex-col gap-0.5 items-center justify-center text-sm
            ${isCurrentDay
              ? 'bg-[#16423C] text-white border-[#16423C]'
              : 'bg-white border-[#C4DAD2] text-[#16423C]'
            }
            ${isSelectedDay && !isCurrentDay
              ? 'border-[#6A9C89] bg-[#6A9C89] text-white shadow-lg'
              : ''
            }
            ${clientCount > 0 && !isSelectedDay ? 'border-[#6A9C89]' : ''}
            ${calendarDateFilter === dateStr ? 'ring-2 ring-[#6A9C89]/50' : ''}
            hover:shadow-lg active:scale-95
          `}
        >
          <span className="text-xs opacity-80 font-semibold">
            {format(day, 'EEE')}
          </span>
          <span className="text-lg font-bold">
            {format(day, 'd')}
          </span>
          {clientCount > 0 && (
            <span className={`text-xs font-bold px-1 py-0.5 rounded ${isCurrentDay || isSelectedDay
                ? 'bg-white/20 text-white'
                : 'bg-[#6A9C89]/20 text-[#6A9C89]'
              }`}>
              {clientCount}
            </span>
          )}
        </button>
      );
    });
  }

  // Check if client has a due on the exact date string (yyyy-MM-dd)
  const isClientDueOnDate = (client, dateStr) => {
    if (!client || !client.loan_start_date) return false;
    if (Number(client.pending) <= 0) return false;

    const start = new Date(client.loan_start_date);
    const defaultWeeks = 12;
    const end = client.loan_end_date
      ? new Date(client.loan_end_date)
      : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

    const target = new Date(dateStr + 'T00:00:00');

    let due = new Date(start);
    while (due <= end) {
      if (format(due, 'yyyy-MM-dd') === format(target, 'yyyy-MM-dd')) return true;
      due.setDate(due.getDate() + 7);
    }
    return false;
  };

  // Calculate which due-week index (1-based) the given date corresponds to for the client
  const calculateWeekIndex = (client, dateStr) => {
    if (!client || !client.loan_start_date) return null;
    if (Number(client.pending) <= 0) return null;

    const start = new Date(client.loan_start_date);
    const defaultWeeks = 12;
    const end = client.loan_end_date
      ? new Date(client.loan_end_date)
      : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

    const target = new Date(dateStr + 'T00:00:00');

    let due = new Date(start);
    let idx = 1;
    while (due <= end) {
      if (format(due, 'yyyy-MM-dd') === format(target, 'yyyy-MM-dd')) return idx;
      due.setDate(due.getDate() + 7);
      idx += 1;
    }
    return null;
  };

  // Drag handlers for reordering landmarks
  const handleDragStart = (e, landmarkName) => {
    try {
      e.dataTransfer.setData('text/plain', landmarkName);
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) { }
  };

  const handleDropOnLandmark = (e, targetLandmark) => {
    e.preventDefault();
    try {
      const dragged = e.dataTransfer.getData('text/plain');
      if (!dragged) return;
      if (dragged === targetLandmark) return;

      const avail = getAvailableLandmarks();
      const base = (orderedLandmarks && orderedLandmarks.length) ? [...orderedLandmarks] : [...avail];

      const filtered = base.filter(x => x !== dragged);
      const targetIdx = filtered.indexOf(targetLandmark);
      if (targetIdx === -1) filtered.push(dragged);
      else filtered.splice(targetIdx, 0, dragged);

      setOrderedLandmarks(filtered);
      try { localStorage.setItem('landmarkOrder', JSON.stringify(filtered)); } catch (e) { }
    } catch (err) {
      console.error('drag drop error', err);
    }
  };

  const stats = calculateStats();
  const availableLandmarks = getAvailableLandmarks();
  // Merge saved order with currently available landmarks so new landmarks are appended
  const orderedAvailableLandmarks = (orderedLandmarks && orderedLandmarks.length)
    ? [...orderedLandmarks.filter(l => availableLandmarks.includes(l)), ...availableLandmarks.filter(l => !orderedLandmarks.includes(l))]
    : availableLandmarks;

  // Keep orderedLandmarks in sync when available landmarks change (add/remove)
  useEffect(() => {
    try {
      const avail = getAvailableLandmarks();
      if (!orderedLandmarks || orderedLandmarks.length === 0) {
        setOrderedLandmarks(avail);
        localStorage.setItem('landmarkOrder', JSON.stringify(avail));
        return;
      }
      const merged = [...orderedLandmarks.filter(l => avail.includes(l)), ...avail.filter(l => !orderedLandmarks.includes(l))];
      if (JSON.stringify(merged) !== JSON.stringify(orderedLandmarks)) {
        setOrderedLandmarks(merged);
        localStorage.setItem('landmarkOrder', JSON.stringify(merged));
      }
    } catch (e) { }
  }, [clients, selectedDistrict]);

  const filteredLandmarks = selectedAlpha
    ? orderedAvailableLandmarks.filter(l => (l || '').toString().toLowerCase().startsWith(selectedAlpha.toLowerCase()))
    : orderedAvailableLandmarks;
  const currentDate = calendarDateFilter || selectedDate.toISOString().split('T')[0];
  // show all clients in the grid (but keep week-based logic for calendar/stats/export)
  const filteredClients = getDisplayedClients();

  // Order displayed clients by the orderedAvailableLandmarks sequence
  const orderedFilteredClients = (() => {
    try {
      const order = orderedAvailableLandmarks || [];
      const buckets = {};
      filteredClients.forEach(c => {
        const lm = (c.landmark && String(c.landmark).trim()) || 'Other Areas';
        if (!buckets[lm]) buckets[lm] = [];
        buckets[lm].push(c);
      });
      const res = [];
      order.forEach(lm => {
        if (buckets[lm]) {
          res.push(...buckets[lm]);
          delete buckets[lm];
        }
      });
      // append any remaining landmarks
      Object.keys(buckets).forEach(k => res.push(...buckets[k]));
      return res;
    } catch (e) { return filteredClients; }
  })();

  return (
    <>
      <div className="sticky top-0 z-50">
        <AgentNavbar />
      </div>

      {/* root wrapper now allows horizontal scrolling on desktop */}
      <div className="min-h-screen bg-[#E9EFEC] p-4 md:p-6 pt-4 md:pt-6 w-full font-sans overflow-x-auto">
        {/* Notification */}
        {notification && (
          <div className={`
          fixed top-5 right-5 z-[1001] p-4 rounded-lg shadow-xl border-2 max-w-[400px] font-semibold
          animate-[slideIn_0.3s_ease]
          ${notification.type === 'success' ? 'bg-[#6A9C89] text-white border-[#16423C]' : ''}
          ${notification.type === 'error' ? 'bg-[#16423C] text-white border-[#6A9C89]' : ''}
          ${notification.type === 'info' ? 'bg-[#16423C] text-white border-[#6A9C89]' : ''}
        `}>
            {notification.message}
          </div>
        )}
        <div className="flex flex-col gap-6 lg:gap-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-center gap-4 mb-6 w-full">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-[#16423C] text-white px-6 py-3 rounded-xl shadow-md flex items-center gap-3 w-full md:w-auto justify-center">
                <i className="fas fa-money-bill-wave text-xl"></i>
                <span className="font-bold text-lg">Weekly Dues</span>
              </div>
            </div>
            <div className="flex-1 w-full">
              <input
                type="search"
                placeholder="Search clients by name, phone, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3 border-2 border-[#C4DAD2] rounded-xl bg-white text-[#16423C] placeholder-[#6A9C89] focus:outline-none focus:border-[#6A9C89] focus:shadow-lg transition-all"
              />
            </div>
          </div>

          {/* Search results count */}
          {searchQuery && (
            <div className="bg-white p-3 rounded-lg border-2 border-[#C4DAD2] text-[#6A9C89] font-semibold mb-2 w-full">
              Found {filteredClients.length} client(s)
            </div>
          )}

          {/* Sidebar and Main Content */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full">
            {/* Sidebar */}
            <div className="bg-white rounded-xl p-5 shadow-lg border-2 border-[#C4DAD2] h-fit lg:sticky lg:top-5 w-full lg:w-[350px] flex-shrink-0">
              {/* District Filter */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                  Filter by District
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full p-3 border-2 border-[#C4DAD2] rounded-lg bg-white text-[#16423C] font-medium cursor-pointer focus:outline-none focus:border-[#6A9C89]"
                >
                  <option value="">All Districts</option>
                  {getUniqueDistricts().map(district => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </div>

              {/* Calendar - Weekly View */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-3">
                  This Week
                </label>
                <div className="bg-white p-3 rounded-lg border-2 border-[#C4DAD2]">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={previousWeek}
                      className="p-2 hover:bg-[#E9EFEC] rounded-lg transition-all text-[#16423C]"
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    <div className="flex-1 text-center text-sm font-semibold text-[#16423C]">
                      {format(getWeekDates(weekStartDate)[0], 'MMM d')} - {format(getWeekDates(weekStartDate)[6], 'MMM d')}
                    </div>
                    <button
                      onClick={nextWeek}
                      className="p-2 hover:bg-[#E9EFEC] rounded-lg transition-all text-[#16423C]"
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {renderCalendarDays()}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[#E9EFEC] px-3 py-4 rounded-lg border-2 border-[#C4DAD2] text-center">
                  <div className="text-xs font-semibold text-[#6A9C89] uppercase tracking-wide mb-1">
                    Due
                  </div>
                  <div className="text-lg font-bold text-[#16423C] break-words">
                    ₹{stats.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="bg-[#E9EFEC] px-3 py-4 rounded-lg border-2 border-[#C4DAD2] text-center">
                  <div className="text-xs font-semibold text-[#6A9C89] uppercase tracking-wide mb-1">
                    Paid
                  </div>
                  <div className="text-lg font-bold text-[#16423C] break-words">
                    ₹{stats.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              {/* Export Button */}
              {/* <button
                onClick={() => setShowExportModal(true)}
                className="w-full py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
              >
                <i className="fas fa-file-export"></i>
                Export Today's List
              </button> */}
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full">
              {/* Title Section */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b-2 border-[#C4DAD2]">
                <h2 className="text-xl md:text-2xl font-bold text-[#16423C]">
                  Clients Due
                </h2>
                <div className="bg-[#E9EFEC] px-5 py-3 rounded-lg border-2 border-[#C4DAD2] text-[#16423C] font-semibold text-center w-full md:w-auto">
                  {format(calendarDateFilter ? new Date(calendarDateFilter + 'T00:00:00') : selectedDate, 'EEEE, MMMM d, yyyy')}
                </div>
              </div>

              {/* Landmarks Display - Grid Layout */}
              <div className="mb-6">
                {/* Alphabet filter (A-Z) */}
                <div className="flex flex-col gap-3 pb-6 mb-6 border-b-2 border-[#C4DAD2]">
                  <div className="flex items-center gap-2">
                    {['A','B','C'].map(letter => (
                      <button
                        key={letter}
                        onClick={() => setSelectedAlpha(prev => prev === letter ? '' : letter)}
                        className={`px-3 py-1 rounded text-sm font-semibold flex-shrink-0 ${selectedAlpha === letter ? 'bg-[#16423C] text-white' : 'bg-white text-[#16423C] border border-transparent hover:border-[#C4DAD2]'}`}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 justify-start">
                    <button
                      onClick={() => setShowMoreAlpha(v => !v)}
                      className="px-4 py-1 rounded text-sm font-bold bg-white text-[#16423C] border border-[#C4DAD2]"
                    >
                      {showMoreAlpha ? '−' : '+'}
                    </button>

                    {showMoreAlpha && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                          <button
                            key={letter}
                            onClick={() => setSelectedAlpha(prev => prev === letter ? '' : letter)}
                            className={`px-2 py-1 rounded text-sm font-semibold ${selectedAlpha === letter ? 'bg-[#16423C] text-white' : 'bg-white text-[#16423C] border border-transparent hover:border-[#C4DAD2]'}`}
                          >
                            {letter}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => { setSelectedAlpha(''); setShowMoreAlpha(false); }}
                      className="px-3 py-1 rounded text-sm font-semibold bg-white text-[#16423C] border border-[#C4DAD2]"
                    >
                      Clear Filter
                    </button>
                  </div>
                </div>

                {/* All Areas Button */}
                <div className="mb-6">
                  <button
                    onClick={() => setSelectedLandmark('')}
                    className={`
                  w-full px-6 py-4 rounded-lg font-semibold transition-all border-2
                  ${selectedLandmark === ''
                        ? 'bg-[#16423C] text-white border-[#16423C] shadow-lg'
                        : 'bg-white text-[#16423C] border-[#C4DAD2] hover:border-[#6A9C89]'
                      }
                `}
                  >
                    <i className="fas fa-th-large mr-2"></i>
                    All Areas
                  </button>
                </div>

                {/* Landmarks Grid - 4 columns (hidden when landmark is selected) */}
                {selectedLandmark === '' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredLandmarks.filter(landmarkName => {
                      // Only show landmarks that have at least one client today
                      const todayClients = filteredClients.filter(c => 
                        (c.landmark || '') === landmarkName
                      );
                      return todayClients.length > 0;
                    }).map((landmarkName) => {
                      // Count today's clients for this landmark using filteredClients (already date-filtered)
                      const todayClients = filteredClients.filter(c => 
                        (c.landmark || '') === landmarkName
                      );
                      const icon = getIconForLandmark(landmarkName);
                      return (
                        <button
                          key={landmarkName}
                          draggable
                          onDragStart={(e) => handleDragStart(e, landmarkName)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDropOnLandmark(e, landmarkName)}
                          onClick={() => setSelectedLandmark(landmarkName)}
                          className={`
                        p-4 rounded-lg font-semibold transition-all flex flex-col gap-3 items-center justify-center border-2 min-h-[120px]
                        bg-white text-[#16423C] border-[#C4DAD2] hover:border-[#6A9C89] hover:shadow-md
                      `}
                        >
                          <span className="text-3xl">{icon}</span>
                          <div className="flex flex-col items-center text-center">
                            <span className="text-sm font-semibold">{landmarkName}</span>
                            <span className="text-xs font-normal opacity-70">
                              {todayClients.length} today
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Show selected landmark prominently with Clear button
                  <div className="flex flex-col gap-4">
                    <div className="p-6 rounded-lg bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white border-2 border-[#16423C] shadow-lg flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-4xl">{getIconForLandmark(selectedLandmark)}</span>
                        <div>
                          <h3 className="text-2xl font-bold">{selectedLandmark}</h3>
                          <p className="text-sm opacity-90">
                            {filteredClients.length} clients today
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedLandmark('')}
                        className="px-6 py-3 bg-white text-[#16423C] rounded-lg font-semibold hover:bg-[#E9EFEC] transition-all"
                      >
                        <i className="fas fa-times mr-2"></i>
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Message - no landmark selected */}
              {selectedLandmark === '' && !loading && filteredLandmarks.length === 0 && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-[#C4DAD2]">
                  <i className="fas fa-map-marker-alt text-6xl text-[#C4DAD2] mb-5"></i>
                  <h3 className="text-xl font-bold text-[#16423C] mb-3">No Landmarks Available</h3>
                  <p className="text-[#6A9C89]">No landmarks found for the selected filter</p>
                </div>
              )}

              {/* Loading State */}
              {loading && (
                <div className="text-center py-20">
                  <div className="w-10 h-10 border-4 border-[#C4DAD2] border-t-[#16423C] rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-[#6A9C89] font-semibold">Loading clients...</p>
                </div>
              )}

              {/* Client Grid - All Areas or Specific Landmark */}
              {(selectedLandmark === '' || selectedLandmark !== '') && !loading && filteredClients.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 justify-items-stretch">
                  {orderedFilteredClients.map((client) => (
                    <div
                      key={client._id || client.clientId || client.id || client.phone}
                      onClick={() => handleClientClick(client)}
                      className="bg-white rounded-xl p-3 shadow-lg border-2 border-transparent hover:border-[#C4DAD2] hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex flex-col h-full active:scale-75w-medium"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold text-[#16423C] mb-2 break-words">
                            {client.name}
                          </h3>
                          <span className={`
                        inline-block text-xs font-semibold px-3 py-1.5 rounded-full
                        ${client.type === 'personal'
                              ? 'bg-[#16423C]/10 text-[#16423C] border border-[#16423C]/20'
                              : 'bg-[#16423C] text-white border border-[#16423C]'}
                      `}>
                            {client.type.charAt(0).toUpperCase() + client.type.slice(1)}
                          </span>
                        </div>
                        <span className={`
                      w-3 h-3 rounded-full flex-shrink-0
                      ${client.paid
                            ? 'bg-[#6A9C89] shadow-[0_0_0_3px_rgba(106,156,137,0.2)]'
                            : 'bg-[#16423C] shadow-[0_0_0_3px_rgba(22,66,60,0.2)]'}
                    `}></span>
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 text-[#16423C] mb-3">
                          <i className="fas fa-phone text-[#6A9C89] w-4"></i>
                          <span className="text-sm break-all">{client.phone}</span>
                        </div>
                        {client.address && (
                          <div className="text-sm text-[#6A9C89] leading-relaxed break-words">
                            {client.address}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-4 border-t-2 border-[#C4DAD2]">
                        <div className="text-sm font-semibold text-[#6A9C89] mb-1">
                          Weekly Payment
                        </div>
                        <div className={`
                      text-xl font-bold
                      ${client.paid ? 'text-[#6A9C89] bg-[#6A9C89]/10 py-2 px-3 rounded-lg inline-block' : 'text-[#16423C]'}
                    `}>
                          {client.daily_amount}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : !loading && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-[#C4DAD2]">
                  <i className="fas fa-users text-6xl text-[#C4DAD2] mb-5"></i>
                  <h3 className="text-xl font-bold text-[#16423C] mb-3">
                    {selectedLandmark ? 'No clients in this area' : 'No clients available'}
                  </h3>
                  <p className="text-[#6A9C89]">
                    {selectedLandmark ? 'Try selecting a different landmark' : 'Try adjusting your search criteria'}
                  </p>
                </div>
              ) }
            </div>
          </div>
        </div>

        {/* Client Details Modal */}
        {showClientModal && selectedClient && (
          <div
            className="fixed inset-0 bg-[#16423C]/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-xl max-w-[380px] w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-[#C4DAD2] animate-[modalFade_0.3s_ease] md:animate-[modalSlideUp_0.3s_ease] md:rounded-t-2xl md:rounded-b-none md:fixed md:inset-x-0 md:bottom-0 md:top-auto md:max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white p-6 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xl font-bold break-words pr-4">{selectedClient.name}</h3>
                <button
                  onClick={closeModal}
                  className="w-10 h-10 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex items-center justify-center text-2xl hover:rotate-90"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Client Type
                  </div>
                  <div className="text-base font-semibold text-[#16423C]">
                    {selectedClient.type.charAt(0).toUpperCase() + selectedClient.type.slice(1)}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Phone Number
                  </div>
                  <div className="text-base font-semibold text-[#16423C] break-words">
                    {selectedClient.phone}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Address
                  </div>
                  <div className="text-base font-semibold text-[#16423C] break-words">
                    {selectedClient.address || 'Address not provided'}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Due Date
                  </div>
                  <div className="text-base font-semibold text-[#16423C]">
                    {selectedClient.dueDate}
                  </div>
                </div>

                <div className="text-4xl font-bold text-[#16423C] text-center my-8 p-8 bg-gradient-to-r from-[#E9EFEC] to-[#C4DAD2] rounded-xl border-2 border-[#C4DAD2] break-words">
                  {selectedClient.daily_amount}
                </div>

                <button
                  onClick={() => handleMarkPaid(selectedClient)}
                  disabled={!selectedClient}
                  className="w-full py-4 mb-3 rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95 bg-gradient-to-r from-[#6A9C89] to-[#16423C] text-white"
                >
                  <i className="fas fa-check"></i>
                  Mark as Paid
                </button>

                <button
                  onClick={() => handleNotPaid(selectedClient)}
                  disabled={!selectedClient}
                  className="w-full py-4 mb-3 bg-yellow-500 text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
                >
                  <i className="fas fa-forward"></i>
                  CANCEL (Push to next week)
                </button>

                <button
                  onClick={closeModal}
                  className="w-full py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
                >
                  <i className="fas fa-times"></i>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div
            className="fixed inset-0 bg-[#16423C]/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
            onClick={() => setShowExportModal(false)}
          >
            <div
              className="bg-white rounded-xl max-w-[500px] w-full shadow-2xl border-2 border-[#C4DAD2] animate-[modalFade_0.3s_ease]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white p-6 rounded-t-xl flex justify-between items-center">
                <h3 className="text-xl font-bold">Export Format</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-10 h-10 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex items-center justify-center text-2xl hover:rotate-90"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <p className="text-center text-[#16423C] mb-8">
                  Choose export format for unpaid clients
                </p>

                <div className="flex flex-col md:flex-row gap-4">
                  <button
                    onClick={handleExportPDF}
                    className="flex-1 py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
                  >
                    <i className="fas fa-file-pdf"></i>
                    PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add required Font Awesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />

        {/* Add custom animations */}
        <style>{`
        @keyframes modalFade {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes modalSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      </div>
    </>
  );
};

export default DailyDues;