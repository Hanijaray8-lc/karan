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

import AdminNavbar from '../Admin/AdminNavbar';
import ManagerNavbar from './ManagerNavbar';
import { isRecordNewForUser, filterPaymentsForManager, filterClientsForManager, filterAgentsForManager, getLoggedInUser } from '../../utils/staffRecordFilter';

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

// Helper function to get the actual date the payment was collected/paid
// Authoritative date is createdAt (when money was physically collected).
const getPaymentPaidDate = (record) => {
  if (!record) return null;
  if (record.createdAt && record.createdAt instanceof Date && !isNaN(record.createdAt.getTime())) {
    return record.createdAt;
  }
  if (record.rawDate && record.rawDate instanceof Date && !isNaN(record.rawDate.getTime())) {
    return record.rawDate;
  }
  if (record.paymentDateRaw && record.paymentDateRaw instanceof Date && !isNaN(record.paymentDateRaw.getTime())) {
    return record.paymentDateRaw;
  }
  return null;
};

// Helper function to format Date object into YYYY-MM-DD using local time
const formatDateToYMD = (dateInput) => {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function MpaymentHistory() {
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
  const [myAgents, setMyAgents] = useState([]);
  const [clientsList, setClientsList] = useState([]);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });

  const rawPaymentsRef = useRef([]);
  const popupTimeoutRef = useRef(null);
  // Refs to always hold the latest values inside async callbacks (avoid stale closures)
  const myAgentsRef = useRef([]);
  const clientsListRef = useRef([]);
  const loggedInUserRef = useRef(null);

  const showPopup = (type, title, message, duration = 4000) => {
    setPopup({ visible: true, type, title, message });
    if (popupTimeoutRef.current) {
      clearTimeout(popupTimeoutRef.current);
    }
    popupTimeoutRef.current = setTimeout(() => {
      setPopup({ visible: false, type: 'success', title: '', message: '' });
    }, duration);
  };

  // Get logged-in user info from localStorage
  useEffect(() => {
    try {
      const userInfo = localStorage.getItem('user');
      if (userInfo) {
        const user = JSON.parse(userInfo);
        loggedInUserRef.current = user;
        setLoggedInUser(user);
      }
    } catch (err) {
      console.error('Error retrieving user info:', err);
    }
  }, []);

  // Fetch payment data from backend
  useEffect(() => {
    // Load agents first, then clients (so clients are scoped correctly),
    // then load payments (so the filter has fresh data from refs).
    const initLoad = async () => {
      await fetchMyAgents();
      await fetchAllClients();
      fetchPayments();
    };
    initLoad();

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

    // Background polling every 5 seconds for near-real-time updates
    const pollInterval = setInterval(() => {
      fetchPaymentsWithoutLoading();
    }, 5000); // 5 seconds

    // Cleanup all listeners and interval on unmount
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('paymentRecorded', handlePaymentRecorded);
      window.removeEventListener('clientUpdated', handlePaymentRecorded);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  // Fetch agents assigned to this manager for scoped filtering
  const fetchMyAgents = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch('https://karanfinance.com/api/agents', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.success && data.agents) {
        const user = loggedInUserRef.current || getLoggedInUser();
        const filtered = filterAgentsForManager(data.agents, user);
        myAgentsRef.current = filtered;   // keep ref in sync
        setMyAgents(filtered);
      }
    } catch (e) {
      // silent fail – filter will fall back to date-only
    }
  };

  // Fetch payments with loading indicator
  const fetchPayments = async () => {
    setLoading(true);
    try {
      await fetchPaymentsData(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllClients = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
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
          // Use ref so we always have the latest agents even if state hasn't re-rendered yet
          const user = loggedInUserRef.current || getLoggedInUser();
          const scoped = filterClientsForManager(data.clients, myAgentsRef.current, user);
          clientsListRef.current = scoped;  // keep ref in sync
          setClientsList(scoped);
        }
      }
    } catch (err) {
      console.warn('Error fetching clients:', err);
    }
  };

  const openCancelConfirmModal = (paymentId, paymentAmount, clientId, paymentCreatedAt) => {
    setCancelPaymentData({ paymentId, paymentAmount, clientId, paymentCreatedAt });
    setShowCancelConfirmModal(true);
  };

  const handleConfirmCancelPayment = async () => {
    if (!cancelPaymentData) return;
    const { paymentId, paymentAmount, clientId, paymentCreatedAt } = cancelPaymentData;
    setShowCancelConfirmModal(false);
    try {
      const token = localStorage.getItem('token');

      const res = await fetch(`https://karanfinance.com/api/payments/${paymentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
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
        const client = clientsList.find(c => c._id === clientId);
        if (client) {
          const clientLoanStart = client.loan_start_date;
          const clientLoanEnd = client.loan_end_date;

          const currentEndDate = clientLoanEnd ? new Date(clientLoanEnd) : null;
          let newEndDate;

          if (currentEndDate && !isNaN(currentEndDate)) {
            newEndDate = new Date(currentEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
          } else if (clientLoanStart) {
            const start = new Date(clientLoanStart);
            newEndDate = new Date(start.getTime() + 13 * 7 * 24 * 60 * 60 * 1000);
          }

          if (newEndDate && token) {
            await fetch(`https://karanfinance.com/api/clients/${clientId}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ loan_end_date: newEndDate.toISOString() })
            });

            window.dispatchEvent(new CustomEvent('clientLoanEndUpdated', {
              detail: { clientId, loan_end_date: newEndDate.toISOString() }
            }));
            window.dispatchEvent(new CustomEvent('clientUpdated', {
              detail: { clientId, loan_end_date: newEndDate.toISOString() }
            }));
          }
        }
      }

      await fetchPayments();
      const msg = wasToday
        ? 'Payment cancelled successfully.'
        : 'Payment cancelled successfully. Due extended by 1 week.';
      showPopup('success', 'Cancelled', msg);
    } catch (error) {
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
    }
  };

  // Fetch payments without showing loading indicator (for polling)
  const fetchPaymentsWithoutLoading = async () => {
    await fetchPaymentsData(true); // silent=true: don't update error state on transient failures
  };

  // Core fetching logic
  // silent=true: used for polling/background refreshes — errors are logged but never shown to the user
  const fetchPaymentsData = async (silent = false) => {
    try {
      // Use authenticated history endpoint so the backend filters by manager
      const token = localStorage.getItem('token');
      const response = await fetch('https://karanfinance.com/api/payments/history', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
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
            managerId: payment.managerId || payment.client?.managerId || payment.client?.addedBy || null,
            agent: payment.agent,
            collectedStaffId: payment.collectedStaffId,
            collectedStaff: payment.collectedStaff,
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
              managerId: payment.client?.managerId || payment.client?.addedBy || null,
            },
            received: payment.amount || 0,
            pending: payment.remainingDue || 0,
            paymentMethod: payment.paymentMethod || 'cash',
            notes: payment.notes || '',
          };
        });

        // Sort: current date paid clients on top, latest payments first
        formattedRecords.sort((a, b) => {
          const isTodayA = (a.datetime !== 'N/A' || a.paidDate !== 'N/A') && isTodayDate(getPaymentPaidDate(a));
          const isTodayB = (b.datetime !== 'N/A' || b.paidDate !== 'N/A') && isTodayDate(getPaymentPaidDate(b));

          // If one is from current date and the other isn't, current date comes first
          if (isTodayA && !isTodayB) return -1;
          if (!isTodayA && isTodayB) return 1;

          // Within the same group, sort descending: latest payment first
          const timeA = a.createdAt ? a.createdAt.getTime() : (a.rawDate ? a.rawDate.getTime() : 0);
          const timeB = b.createdAt ? b.createdAt.getTime() : (b.rawDate ? b.rawDate.getTime() : 0);
          if (timeB !== timeA) return timeB - timeA;
          return String(b._id || '').localeCompare(String(a._id || ''));
        });

        rawPaymentsRef.current = formattedRecords;
        // Use refs so we always pass the latest agents/clients/user (not stale closure values)
        applyScopedPayments(formattedRecords, myAgentsRef.current, clientsListRef.current, loggedInUserRef.current || loggedInUser);
      } else {
        throw new Error(data.message || 'Failed to fetch payment history');
      }
    } catch (err) {
      console.error('Error fetching payments:', err);
      // Only update error state on initial load (not silent background polls)
      // This prevents transient network errors from wiping the UI during polling
      if (!silent) {
        setError(err.message);
      }
    }
  };

  const applyScopedPayments = (records, currentAgents, currentClients, user) => {
    const currentUser = user || loggedInUser || getLoggedInUser();
    const scopedPayments = filterPaymentsForManager(records, currentAgents, currentUser, currentClients);
    const uniqueRecords = [];
    const seenKeys = new Set();

    scopedPayments.forEach((record) => {
      const idKey = record._id ? String(record._id) : null;
      if (idKey && seenKeys.has(idKey)) return;
      if (idKey) seenKeys.add(idKey);
      uniqueRecords.push(record);
    });

    setPaymentRecords(uniqueRecords);
    setError(null);

    // Calculate stats using uniqueRecords based on actual collection date
    const totalCollected = uniqueRecords.reduce((sum, r) => sum + (r.received || 0), 0);
    let todayCollected = 0;

    uniqueRecords.forEach((record) => {
      const paidD = getPaymentPaidDate(record);
      if (isTodayDate(paidD)) {
        todayCollected += (record.received || 0);
      }
    });

    const totalPending = uniqueRecords.reduce(
      (sum, record) => sum + (record.pending || 0),
      0
    );

    setStats({
      totalCollected,
      todayCollected,
      totalPending,
    });

    const uniqueStaff = [
      'All Staff',
      ...new Set(uniqueRecords.map((r) => r.staff?.name).filter(name => name && name !== 'Unknown')),
    ];
    setStaffList(uniqueStaff);
  };

  useEffect(() => {
    // Keep refs in sync when state updates
    myAgentsRef.current = myAgents;
    clientsListRef.current = clientsList;
    if (loggedInUser) loggedInUserRef.current = loggedInUser;
    if (rawPaymentsRef.current && rawPaymentsRef.current.length > 0) {
      applyScopedPayments(rawPaymentsRef.current, myAgents, clientsList, loggedInUser);
    }
  }, [clientsList, myAgents, loggedInUser]);

  const filteredRecords = paymentRecords.filter((record) => {
    const matchesSearch =
      (record.staff?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paymentMethod || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.notes || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paymentDate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paidDate || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStaff =
      staffFilter === 'All Staff' || record.staff?.name === staffFilter;

    const matchesDate = !dateFilter || (() => {
      const paidDate = getPaymentPaidDate(record);
      return formatDateToYMD(paidDate) === dateFilter;
    })();

    return matchesSearch && matchesStaff && matchesDate;
  });

  // Compute stats based on BOTH staff + date filters (uses same filteredRecords)
  // Advance payments are calculated on the date they were actually collected/paid,
  // NOT on the future/advance due date.
  const filteredStats = (() => {
    const totalCollected = filteredRecords.reduce((sum, r) => sum + (r.received || 0), 0);
    let todayCollected = 0;
    filteredRecords.forEach((record) => {
      const paidD = getPaymentPaidDate(record);
      if (isTodayDate(paidD)) {
        todayCollected += (record.received || 0);
      }
    });
    const totalPending = filteredRecords.reduce((sum, r) => sum + (r.pending || 0), 0);
    return { totalCollected, todayCollected, totalPending };
  })();

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
        <ManagerNavbar />
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
      <ManagerNavbar />

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
        {/* Logged-in User Info */}
        {loggedInUser && (
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
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-8">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white rounded-xl shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">
                    {staffFilter === 'All Staff' && !dateFilter
                      ? 'Total Collection'
                      : staffFilter !== 'All Staff' && dateFilter
                        ? `${staffFilter} — ${dateFilter}`
                        : staffFilter !== 'All Staff'
                          ? `${staffFilter} — Total`
                          : `Date: ${dateFilter}`}
                  </p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{filteredStats.totalCollected.toLocaleString('en-IN')}
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
                  <p className="text-xs sm:text-sm opacity-90">
                    {dateFilter ? 'Received Amount' : staffFilter === 'All Staff' ? "Today's Collection" : `${staffFilter} — Today`}
                  </p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{(dateFilter ? filteredStats.totalCollected : filteredStats.todayCollected).toLocaleString('en-IN')}
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
                  <p className="text-xs sm:text-sm opacity-90">
                    {staffFilter === 'All Staff' ? 'Total Pending' : `${staffFilter} — Pending`}
                    {dateFilter && <span className="block text-[10px] opacity-75">({dateFilter})</span>}
                  </p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{filteredStats.totalPending.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <Users className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>
        </div>

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
                  placeholder="Search staff or client name"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto sm:min-w-[140px]"
              >
                {staffList.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-auto">
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
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-[#16423C] text-white sticky top-0">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Payment Date (Due Date)</th>
                  <th className="px-6 py-4 text-left font-semibold">Paid Date</th>
                  <th className="px-6 py-4 text-left font-semibold">Collected Staff</th>
                  <th className="px-6 py-4 text-left font-semibold">Client Name</th>
                  <th className="px-6 py-4 text-left font-semibold">Mobile</th>
                  <th className="px-6 py-4 text-left font-semibold">District</th>
                  <th className="px-6 py-4 text-left font-semibold">Landmark</th>
                  <th className="px-6 py-4 text-left font-semibold">Received</th>
                  <th className="px-6 py-4 text-left font-semibold">Pending</th>
                  <th className="px-6 py-4 text-center font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        <span className="text-gray-600">Loading payment records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center text-gray-500">
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
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          {record.staff.name}
                          {record.staff.role ? ` (${record.staff.role})` : ''}
                        </span>
                      </td>
                      <td className="px-6 py-4">{record.client.name}</td>
                      <td className="px-6 py-4">{record.client.phone}</td>
                      <td className="px-6 py-4">{record.client.district}</td>
                      <td className="px-6 py-4">{record.client.landmark}</td>
                      <td className="px-6 py-4 font-medium text-green-700">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>₹{record.received.toLocaleString('en-IN')}</span>
                          {(record.paymentMethod === 'Foreclosure' || record.paymentMethod === 'foreclosure' || (record.notes && record.notes.toLowerCase().includes('foreclose'))) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm">
                              Foreclosure
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-red-700">
                        ₹{record.pending.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => openCancelConfirmModal(record._id, record.received, record.client?.id, record.createdAt)}
                          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95 shadow-sm hover:shadow"
                        >
                          Cancel
                        </button>
                      </td>
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
              paginatedRecords.map((record, idx) => {
                const isForeclosure =
                  record.paymentMethod === 'Foreclosure' ||
                  record.paymentMethod === 'foreclosure' ||
                  (record.notes && record.notes.toLowerCase().includes('foreclose'));
                return (
                  <div key={record._id || `m-${pageStartIdx + idx}`} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 break-words">{record.client.name}</p>
                        <span className="inline-flex items-center mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 max-w-full">
                          <span className="truncate">
                            {record.staff.name}
                            {record.staff.role ? ` (${record.staff.role})` : ''}
                          </span>
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-lg font-bold text-green-700">₹{record.received.toLocaleString('en-IN')}</p>
                        {isForeclosure && (
                          <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                            Foreclosure
                          </span>
                        )}
                      </div>
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
                        <p className="text-gray-500">Pending</p>
                        <p className="font-semibold text-red-700">₹{record.pending.toLocaleString('en-IN')}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">District</p>
                        <p className="font-medium text-gray-900 break-words">{record.client.district}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Landmark</p>
                        <p className="font-medium text-gray-900 break-words">{record.client.landmark}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => openCancelConfirmModal(record._id, record.received, record.client?.id, record.createdAt)}
                      className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg text-sm font-semibold transition-all active:scale-95 shadow-sm"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })
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