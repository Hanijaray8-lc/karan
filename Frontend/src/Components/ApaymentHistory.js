// PaymentHistory.jsx
import { useState, useEffect, useRef } from 'react';
import {
  CalendarDays,
  IndianRupee,
  Search,
  Filter,
  RotateCcw,
  Users,
  XCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

import Navbar from './AgentNavbar';
import { isRecordNewForUser, getLoggedInUser } from '../utils/staffRecordFilter';

// Helper function to format payment date & time for display
const formatPaymentDateTime = (paymentDateStr, createdAtStr) => {
  const pDate = paymentDateStr ? new Date(paymentDateStr) : null;
  const cDate = createdAtStr ? new Date(createdAtStr) : null;

  const isValidP = pDate && !isNaN(pDate.getTime());
  const isValidC = cDate && !isNaN(cDate.getTime());

  if (!isValidP && !isValidC) {
    return { display: 'N/A', rawDate: new Date() };
  }

  if (!isValidP) {
    return {
      display: cDate.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }),
      rawDate: cDate,
    };
  }

  // Check if paymentDate has dummy time (like 12:00:00 UTC or 00:00:00 UTC)
  const isDummyTime =
    typeof paymentDateStr === 'string' &&
    (paymentDateStr.includes('T12:00:00') ||
      paymentDateStr.includes('T00:00:00') ||
      (pDate.getUTCHours() === 12 && pDate.getUTCMinutes() === 0 && pDate.getUTCSeconds() === 0) ||
      (pDate.getUTCHours() === 0 && pDate.getUTCMinutes() === 0 && pDate.getUTCSeconds() === 0));

  let finalDate = pDate;

  if (isDummyTime && isValidC) {
    // Keep target payment date, but adopt actual creation time from createdAt
    finalDate = new Date(pDate);
    finalDate.setHours(
      cDate.getHours(),
      cDate.getMinutes(),
      cDate.getSeconds(),
      cDate.getMilliseconds()
    );
  }

  return {
    display: finalDate.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    rawDate: finalDate,
  };
};

// Helper function to format payment date (due date) for display
const formatPaymentDate = (paymentDateStr, createdAtStr, notes, client) => {
  // If notes indicate advance payment targeting specific week(s) or explicit due dates
  if (notes) {
    // 1. Check for explicit dueDates tag: [dueDates:2026-10-28,2026-11-04]
    const dueDatesMatch = notes.match(/\[dueDates:([0-9\-,]+)\]/i);
    if (dueDatesMatch && dueDatesMatch[1]) {
      const dates = dueDatesMatch[1].split(',').map(dStr => {
        const match = dStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          const [, y, m, d] = match;
          return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
        return dStr.trim();
      });
      return dates.join(', ');
    }

    // 2. Check for [weeks:2] or [weeks:2,3] and compute from client loan_start_date
    const weeksMatch = notes.match(/\[weeks:([0-9,\s]+)\]/i);
    const loanStart = client?.loan_start_date;
    if (weeksMatch && weeksMatch[1] && loanStart) {
      const weekIds = weeksMatch[1].split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      const startD = new Date(loanStart);
      if (!isNaN(startD.getTime()) && weekIds.length > 0) {
        const computedDates = weekIds.map(wId => {
          const targetD = new Date(startD);
          targetD.setDate(targetD.getDate() + (wId - 1) * 7);
          const d = String(targetD.getDate()).padStart(2, '0');
          const m = String(targetD.getMonth() + 1).padStart(2, '0');
          const y = targetD.getFullYear();
          return `${d}/${m}/${y}`;
        });
        return computedDates.join(', ');
      }
    }
  }

  if (!paymentDateStr && !createdAtStr) return 'N/A';

  const str = paymentDateStr || createdAtStr;

  // If string starts with YYYY-MM-DD, extract directly to avoid UTC timezone shifts
  if (typeof str === 'string') {
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
  }

  const dObj = str instanceof Date ? str : new Date(str);
  if (isNaN(dObj.getTime())) return 'N/A';

  return dObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Helper function to format paid date & time for display
const formatPaidDate = (createdAtStr, paymentDateStr) => {
  const cDate = createdAtStr ? new Date(createdAtStr) : null;
  const pDate = paymentDateStr ? new Date(paymentDateStr) : null;

  const isValidC = cDate && !isNaN(cDate.getTime());
  const isValidP = pDate && !isNaN(pDate.getTime());

  if (!isValidC && !isValidP) return 'N/A';

  // Check if string has dummy time (like 12:00:00 UTC or 00:00:00 UTC)
  const isDummy = (val, dateObj) =>
    typeof val === 'string' &&
    (val.includes('T12:00:00') ||
      val.includes('T00:00:00') ||
      (dateObj && dateObj.getUTCHours() === 12 && dateObj.getUTCMinutes() === 0 && dateObj.getUTCSeconds() === 0) ||
      (dateObj && dateObj.getUTCHours() === 0 && dateObj.getUTCMinutes() === 0 && dateObj.getUTCSeconds() === 0));

  // If createdAt is valid and not a dummy time, use it (exact payment timestamp)
  if (isValidC && !isDummy(createdAtStr, cDate)) {
    return cDate.toLocaleString('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Fallback to whichever is valid
  const targetDate = isValidC ? cDate : pDate;
  const targetStr = isValidC ? createdAtStr : paymentDateStr;

  if (isDummy(targetStr, targetDate)) {
    return formatPaymentDate(targetStr);
  }

  return targetDate.toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Helper function to check if a date corresponds to the current date (today)
const isTodayDate = (dateInput) => {
  if (!dateInput) return false;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return false;
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
};

export default function ApaymentHistory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10; // records per page
  const [staffFilter, setStaffFilter] = useState('All Staff');
  const [dateFilter, setDateFilter] = useState('');
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalCollected: 0,
    todayCollected: 0,
    totalPending: 0,
  });
  const [staffList, setStaffList] = useState(['All Staff']);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [clientsList, setClientsList] = useState([]);

  // Modal and cancel payment state
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });

  // Get logged-in user info from localStorage
  useEffect(() => {
    try {
      const userInfo = localStorage.getItem('user');
      if (userInfo) {
        const user = JSON.parse(userInfo);
        setLoggedInUser(user);
      }
    } catch (err) {
      console.error('Error retrieving user info:', err);
    }
  }, []);

  // Popup timeout ref
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

  // Fetch payment data from backend
  useEffect(() => {
    fetchPayments();
    fetchAllClients();

    // Instant reload on custom payment/client events dispatched by other components
    const handlePaymentRecorded = () => {
      fetchPaymentsWithoutLoading();
    };
    window.addEventListener('paymentRecorded', handlePaymentRecorded);
    window.addEventListener('clientUpdated', handlePaymentRecorded);

    // Instant reload when user switches back to this browser tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchPaymentsWithoutLoading();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Instant reload when browser window is focused (e.g. alt-tab back)
    const handleWindowFocus = () => {
      fetchPaymentsWithoutLoading();
    };
    window.addEventListener('focus', handleWindowFocus);

    // Background polling every 60 seconds (reduced from 5s to avoid server overload)
    const pollInterval = setInterval(() => {
      fetchPaymentsWithoutLoading();
    }, 60000); // 60 seconds

    // Cleanup all listeners and interval on unmount
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('paymentRecorded', handlePaymentRecorded);
      window.removeEventListener('clientUpdated', handlePaymentRecorded);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // Fetch payments with loading indicator
  const fetchPayments = async () => {
    setLoading(true);
    try {
      await fetchPaymentsData();
    } finally {
      setLoading(false);
    }
  };

  // Fetch payments without showing loading indicator (for polling)
  const fetchPaymentsWithoutLoading = async () => {
    await fetchPaymentsData();
  };

  // Core fetching logic
  const fetchPaymentsData = async () => {
    try {
      // Use test endpoint (no auth required) for now
      const response = await fetch('https://karanfinance.com/api/payments/test/all', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to fetch payment history (${response.status})`);
      }

      const data = await response.json();

      if (data.success) {
        // Map backend data to frontend format
        const formattedRecords = data.data.payments.map((payment) => {
          const dt = formatPaymentDateTime(payment.paymentDate, payment.createdAt);
          const paymentDateDisplay = formatPaymentDate(payment.paymentDate, payment.createdAt, payment.notes, payment.client);
          const paidDateDisplay = formatPaidDate(payment.createdAt, payment.paymentDate);

          return {
            _id: payment._id,
            datetime: dt.display,
            paymentDate: paymentDateDisplay,
            paidDate: paidDateDisplay,
            rawDate: dt.rawDate,
            createdAt: payment.createdAt ? new Date(payment.createdAt) : null,
            paymentDateRaw: payment.paymentDate ? new Date(payment.paymentDate) : null,
            paymentMethod: payment.paymentMethod || 'cash',
            notes: payment.notes || '',
            // Store the role of who collected the payment (agent / manager / admin)
            collectedByRole: (payment.collectedByRole || 'agent').toLowerCase(),
            staff: (() => {
              const rawName = payment.collectedStaff || '';
              const agentName = payment.agent && (payment.agent.name || payment.agent.username);
              const roleLabel = payment.collectedByRole ? payment.collectedByRole.charAt(0).toUpperCase() + payment.collectedByRole.slice(1) : null;

              // If backend returned only a role label like 'Manager' treat it as missing
              const roleOnly = rawName && ['agent', 'manager', 'admin'].includes(rawName.toString().toLowerCase());

              const displayName = (!rawName || roleOnly)
                ? (agentName || (payment.collectedStaffId ? String(payment.collectedStaffId) : (roleLabel || 'Unknown')))
                : rawName;

              return {
                id: payment.agent?._id || (payment.collectedStaffId ? String(payment.collectedStaffId) : 'N/A'),
                name: displayName,
                role: roleLabel,
              };
            })(),
            client: {
              id: payment.client?._id || (typeof payment.client === 'string' ? payment.client : null) || 'N/A',
              name: payment.clientName || payment.client?.name || 'Unknown',
              phone: payment.client?.phone || 'N/A',
              district: payment.client?.district || 'N/A',
              landmark: payment.client?.landmark || 'N/A',
              assignedAgent: payment.client?.assigned_agent || payment.client?.assigned_agent_name || payment.client?.agent || null,
            },
            received: payment.amount || 0,
            pending: payment.remainingDue || 0,
          };
        });

        // Sort descending: latest payment first (most recent on top)
        formattedRecords.sort((a, b) => {
          const timeA = a.createdAt ? a.createdAt.getTime() : (a.rawDate ? a.rawDate.getTime() : 0);
          const timeB = b.createdAt ? b.createdAt.getTime() : (b.rawDate ? b.rawDate.getTime() : 0);
          if (timeB !== timeA) return timeB - timeA;
          return String(b._id || '').localeCompare(String(a._id || ''));
        });

        // Deduplicate AND scope to this agent's own payments only.
        // Agent should only see payments they personally collected.
        const currentUser = loggedInUser || getLoggedInUser();
        const agentId = currentUser ? String(currentUser._id || currentUser.id || '').trim() : '';
        const agentName = currentUser ? (currentUser.name || currentUser.username || '').trim().toLowerCase() : '';

        // Detect if any records have agent linkage (backward-compat guard)
        const hasAgentLink = formattedRecords.some(r =>
          r.agent || r.collectedStaffId || r.collectedStaff
        );

        const uniqueRecords = [];
        const seenKeys = new Set();

        formattedRecords.forEach((record) => {
          // 1. Join-date filter
          if (!isRecordNewForUser(record, currentUser)) return;

          // 2. Agent-identity filter (only if there is linkage data)
          if (hasAgentLink && agentId) {
            const recAgentId =
              (record.agent
                ? (typeof record.agent === 'object'
                  ? (record.agent._id || record.agent.id)
                  : record.agent)
                : null) ||
              record.collectedStaffId ||
              null;

            const recAgentName = (
              (record.agent && typeof record.agent === 'object'
                ? (record.agent.name || record.agent.username)
                : '') ||
              record.collectedStaff ||
              record.staff?.name ||
              ''
            ).trim().toLowerCase();

            const idMatch = recAgentId && String(recAgentId).trim() === agentId;
            const nameMatch = agentName && recAgentName && recAgentName.includes(agentName);
            const noLink = !recAgentId && !recAgentName;

            if (!idMatch && !nameMatch && !noLink) return;
          }

          const idKey = record._id ? String(record._id) : null;
          const clientId = record.client?.id || record.client?.phone || record.client?.name;
          const dateStr = record.rawDate
            ? `${record.rawDate.getFullYear()}-${String(record.rawDate.getMonth() + 1).padStart(2, '0')}-${String(record.rawDate.getDate()).padStart(2, '0')}`
            : record.datetime;
          const clientDateKey = clientId && dateStr ? `${clientId}_${dateStr}` : null;

          if (idKey && seenKeys.has(idKey)) return;
          if (clientDateKey && seenKeys.has(clientDateKey)) return;

          if (idKey) seenKeys.add(idKey);
          if (clientDateKey) seenKeys.add(clientDateKey);
          uniqueRecords.push(record);
        });

        setPaymentRecords(uniqueRecords);
        setError(null);

        // Calculate stats using uniqueRecords
        const totalCollected = uniqueRecords.reduce((sum, r) => sum + (r.received || 0), 0);
        let todayCollected = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        uniqueRecords.forEach((record) => {
          if (isTodayDate(record.createdAt) || isTodayDate(record.rawDate)) {
            todayCollected += record.received;
          }
        });

        // Calculate total pending from all unique payments
        const totalPending = uniqueRecords.reduce(
          (sum, record) => sum + (record.pending || 0),
          0
        );

        setStats({
          totalCollected,
          todayCollected,
          totalPending,
        });

        // Extract unique staff names
        const uniqueStaff = [
          'All Staff',
          ...new Set(uniqueRecords.map((r) => r.staff.name).filter(name => name !== 'Unknown')),
        ];
        setStaffList(uniqueStaff);
      } else {
        throw new Error(data.message || 'Failed to fetch payment history');
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
      setError(err.message);
    }
  };

  // Fetch all clients to get loan dates for cancel payment logic
  const fetchAllClients = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token available for fetching clients');
        return;
      }

      const response = await fetch('https://karanfinance.com/api/clients/all', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.clients) {
          setClientsList(data.clients);
        }
      } else {
        console.warn('Failed to fetch clients list');
      }
    } catch (err) {
      console.warn('Error fetching clients:', err);
      // Not critical, continue without it
    }
  };

  // Open cancel confirmation modal
  const openCancelConfirmModal = (paymentId, paymentAmount, clientId, paymentCreatedAt) => {
    setCancelPaymentData({ paymentId, paymentAmount, clientId, paymentCreatedAt });
    setShowCancelConfirmModal(true);
  };

  // Handle cancel payment - reverse the payment and update client record
  const handleConfirmCancelPayment = async () => {
    const { paymentId, paymentAmount, clientId, paymentCreatedAt } = cancelPaymentData;
    setShowCancelConfirmModal(false);

    // Optimistic delete: remove from UI instantly before server call, rollback if server fails
    const previousRecords = paymentRecords ? [...paymentRecords] : [];
    setPaymentRecords(prev => (prev || []).filter(r => String(r._id) !== String(cancelPaymentData.paymentId)));

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

      // Only extend loan end date if the cancelled payment was NOT made today.
      // If payment was made today, it's a same-day reversal — no week extension needed.
      const wasToday = isTodayDate(paymentCreatedAt);

      if (!wasToday) {
        // Look up client details from the cached clients list
        const client = clientsList.find(c => c._id === clientId);
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
      }

      // NOTE: No full re-fetch needed - optimistic delete already removed the record above
      // Show success message
      const msg = wasToday
        ? 'Payment cancelled successfully.'
        : 'Payment cancelled successfully. Due extended by 1 week.';
      showPopup('success', 'Cancelled', msg);
    } catch (error) {
      // Rollback: restore the record that was optimistically removed
      setPaymentRecords(previousRecords);
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
    }
  };

  // Helper to determine if payment belongs to the logged-in agent (either collected by agent or for client assigned to agent)
  const isPaymentForAgent = (record, user, clients) => {
    if (!user) return true;
    const userRole = (user.role || '').toLowerCase();
    if (userRole !== 'agent') return true;

    const userId = String(user._id || user.id || '').trim();
    const userName = (user.name || user.username || user.email || '').toLowerCase().replace(/\s*\(.*?\)/g, '').trim();

    // 1. Check if collected by this agent directly
    const staffId = String(record.staff?.id || '').trim();
    const staffName = (record.staff?.name || '').toLowerCase().replace(/\s*\(.*?\)/g, '').trim();

    if (userId && staffId === userId) return true;
    if (userName && staffName.includes(userName)) return true;
    if (userName && userName.includes(staffName) && staffName.length > 0) return true;

    // 2. Check if client in payment record is assigned to this agent
    const clientId = String(record.client?.id || '').trim();
    const clientObj = Array.isArray(clients) ? clients.find(c => String(c._id || c.id || '') === clientId) : null;

    const recordAssigned = record.client?.assignedAgent;
    if (recordAssigned) {
      const assignedId = String(recordAssigned._id || recordAssigned.id || recordAssigned || '').trim();
      const assignedName = (recordAssigned.name || recordAssigned.username || String(recordAssigned)).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();
      if (userId && assignedId === userId) return true;
      if (userName && assignedName.includes(userName)) return true;
      if (userName && userName.includes(assignedName) && assignedName.length > 0) return true;
    }

    if (clientObj) {
      const assignedId = String(clientObj.assigned_agent?._id || clientObj.assigned_agent?.id || clientObj.assigned_agent || clientObj.agent?._id || clientObj.agent?.id || '').trim();
      const assignedName = (clientObj.assigned_agent_name || clientObj.assigned_agent?.name || clientObj.assigned_agent?.username || clientObj.agent?.name || clientObj.agent?.username || String(clientObj.assigned_agent || '')).toLowerCase().replace(/\s*\(.*?\)/g, '').trim();

      if (userId && assignedId === userId) return true;
      if (userName && assignedName.includes(userName)) return true;
      if (userName && userName.includes(assignedName) && assignedName.length > 0) return true;
    }

    return false;
  };

  const filteredRecords = paymentRecords.filter((record) => {
    // Agent-side: only show payments collected by agents (exclude manager/admin payments)
    const isAgentPayment = (record.collectedByRole || 'agent') === 'agent';
    if (!isAgentPayment) return false;

    const matchesSearch =
      (record.staff?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.district || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.landmark || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paymentDate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paidDate || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStaff =
      staffFilter === 'All Staff' || record.staff?.name === staffFilter;

    const belongsToAgent = isPaymentForAgent(record, loggedInUser, clientsList);

    const matchesDate = !dateFilter || (() => {
      const checkD = (d) => {
        if (!d) return false;
        const dObj = d instanceof Date ? d : new Date(d);
        if (isNaN(dObj.getTime())) return false;
        const year = dObj.getFullYear();
        const month = String(dObj.getMonth() + 1).padStart(2, '0');
        const day = String(dObj.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}` === dateFilter;
      };
      return checkD(record.rawDate) || checkD(record.createdAt) || checkD(record.paymentDateRaw);
    })();

    return matchesSearch && matchesStaff && belongsToAgent && matchesDate;
  });

  // ---------------- Pagination (10 records per page) ----------------
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIdx = (safePage - 1) * PAGE_SIZE;
  const paginatedRecords = filteredRecords.slice(pageStartIdx, pageStartIdx + PAGE_SIZE);

  // go back to page 1 whenever a filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, staffFilter, dateFilter]);

  // keep current page valid if the list shrinks (e.g. after cancelling a payment)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // page numbers with ellipsis, e.g. 1 … 4 5 6 … 20
  const getPageNumbers = () => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages = [1];
    const start = Math.max(2, safePage - 1);
    const end = Math.min(totalPages - 1, safePage + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
    return pages;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-800 font-medium">Error: {error}</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ← Now using imported component instead of inline header */}
      <Navbar />

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
        {/* Logged-in User Info */}
        {/* {loggedInUser && (
          <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Logged in as:</p>
                <p className="text-lg font-semibold text-emerald-700">
                  {loggedInUser.name || loggedInUser.username || 'User'}
                  {loggedInUser.role && `(${loggedInUser.role})`}
                </p>
              </div>
            </div>
          </div>
        )} */}

        {/* Summary Cards */}
        {/* <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-8">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white rounded-xl shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Total Collection</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{stats.totalCollected.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <IndianRupee className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Today's Collection</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{stats.todayCollected.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <CalendarDays className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-emerald-500 to-emerald-400 text-white rounded-xl shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Total Pending</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{stats.totalPending.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <Users className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>
        </div> */}

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <IndianRupee className="h-5 w-5 text-emerald-700" />
              Payment History
            </h2>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3">
              <div className="relative col-span-2 sm:col-span-1 sm:min-w-[240px] sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search client name"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="relative col-span-2 sm:col-span-1 w-full sm:w-auto">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm w-full sm:w-40"
                />
              </div>

              <button className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors">
                <Filter size={16} />
                Filter
              </button>

              <button
                onClick={() => {
                  setSearchTerm('');
                  setStaffFilter('All Staff');
                  setDateFilter('');
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors"
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-[#16423C] text-white sticky top-0">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Payment Date (Due Date)</th>
                  <th className="px-6 py-4 text-left font-semibold">Paid Date</th>
                  {/* <th className="px-6 py-4 text-left font-semibold">Collected Staff</th> */}
                  <th className="px-6 py-4 text-left font-semibold">Client Name</th>
                  <th className="px-6 py-4 text-left font-semibold">Mobile</th>
                  <th className="px-6 py-4 text-left font-semibold">District</th>
                  <th className="px-6 py-4 text-left font-semibold">Landmark</th>
                  <th className="px-6 py-4 text-left font-semibold">Received</th>
                  <th className="px-6 py-4 text-left font-semibold">Actions</th>
                  {/* <th className="px-6 py-4 text-left font-semibold">Pending</th> */}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        <span className="text-gray-600">Loading payment records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-500">
                      No payment records found
                    </td>
                  </tr>
                ) : (
                  paginatedRecords.map((record, idx) => (
                    <tr
                      key={record._id || `${pageStartIdx + idx}`}
                      className="border-t hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{record.paymentDate}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-gray-700">{record.paidDate}</td>
                      {/* <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          {record.staff.name}
                          {record.staff.role ? ` (${record.staff.role})` : ''}
                        </span>
                      </td> */}
                      <td className="px-6 py-4">{record.client.name}</td>
                      <td className="px-6 py-4">{record.client.phone}</td>
                      <td className="px-6 py-4">{record.client.district}</td>
                      <td className="px-6 py-4">{record.client.landmark}</td>
                      <td className="px-6 py-4 font-medium text-green-700">
                        ₹{record.received.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openCancelConfirmModal(record._id, record.received, record.client.id, record.createdAt)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95 shadow-sm hover:shadow"
                        >
                          Cancel
                        </button>
                      </td>
                      {/* <td className="px-6 py-4 font-medium text-red-700">
                        ₹{record.pending.toLocaleString('en-IN')}
                      </td> */}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile card list (below md) */}
          <div className="md:hidden divide-y divide-gray-100">
            {loading ? (
              <div className="py-12 flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                <span className="text-gray-600 text-sm">Loading payment records...</span>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-sm">No payment records found</div>
            ) : (
              paginatedRecords.map((record, idx) => (
                <div key={record._id || `m-${pageStartIdx + idx}`} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-gray-900 break-words min-w-0">{record.client.name}</p>
                    <p className="text-lg font-bold text-green-700 flex-shrink-0">₹{record.received.toLocaleString('en-IN')}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                      <p className="text-gray-500">Payment Date (Due)</p>
                      <p className="font-medium text-gray-900">{record.paymentDate}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Paid Date</p>
                      <p className="font-medium text-gray-900">{record.paidDate}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Mobile</p>
                      <p className="font-medium text-gray-900">{record.client.phone}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">District</p>
                      <p className="font-medium text-gray-900 break-words">{record.client.district}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500">Landmark</p>
                      <p className="font-medium text-gray-900 break-words">{record.client.landmark}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => openCancelConfirmModal(record._id, record.received, record.client.id, record.createdAt)}
                    className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 shadow-sm"
                  >
                    Cancel
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {!loading && filteredRecords.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 bg-white">
              <p className="text-sm text-gray-600">
                Showing{' '}
                <span className="font-semibold">{pageStartIdx + 1}</span>
                {' – '}
                <span className="font-semibold">{Math.min(pageStartIdx + PAGE_SIZE, filteredRecords.length)}</span>
                {' of '}
                <span className="font-semibold">{filteredRecords.length}</span> records
              </p>

              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <button
                  onClick={() => setCurrentPage(safePage - 1)}
                  disabled={safePage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>

                <span className="sm:hidden px-2 text-sm font-medium text-gray-700">
                  Page {safePage} / {totalPages}
                </span>

                {getPageNumbers().map((pg, i) =>
                  pg === '...' ? (
                    <span key={`dots-${i}`} className="hidden sm:inline px-2 text-gray-500">…</span>
                  ) : (
                    <button
                      key={pg}
                      onClick={() => setCurrentPage(pg)}
                      className={`hidden sm:inline-block min-w-[36px] px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${pg === safePage
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      {pg}
                    </button>
                  )
                )}

                <button
                  onClick={() => setCurrentPage(safePage + 1)}
                  disabled={safePage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

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
        <div className={`fixed top-5 right-4 left-4 sm:left-auto sm:right-5 z-[1001] p-4 rounded-lg shadow-xl flex items-start gap-3 sm:max-w-xs font-medium ${popup.type === 'success' ? 'bg-green-600 text-white border border-green-700' : 'bg-red-600 text-white border border-red-700'}`}>
          <div className="flex-shrink-0 mt-0.5">
            {popup.type === 'success' ? <CheckCircle size={28} /> : <XCircle size={28} />}
          </div>
          <div className="leading-snug">
            <div className="font-bold">{popup.title}</div>
            <div className="text-sm mt-1">{popup.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}