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
} from 'lucide-react';
import AdminNavbar from './AdminNavbar';

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

export default function PaymentHistory() {
  const [searchTerm, setSearchTerm] = useState('');
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

  // Modal and cancel payment state
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const [clientsList, setClientsList] = useState([]);

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

  // Fetch payment data from backend
  useEffect(() => {
    fetchPayments();
    fetchAllClients();

    const handlePaymentRecorded = () => {
      fetchPaymentsWithoutLoading();
    };
    window.addEventListener('paymentRecorded', handlePaymentRecorded);
    window.addEventListener('clientUpdated', handlePaymentRecorded);

    // Setup polling to check for new payments (every 20 seconds)
    const pollInterval = setInterval(() => {
      fetchPaymentsWithoutLoading();
    }, 20000); // 20 seconds

    // Cleanup interval on unmount
    return () => {
      clearInterval(pollInterval);
      window.removeEventListener('paymentRecorded', handlePaymentRecorded);
      window.removeEventListener('clientUpdated', handlePaymentRecorded);
    };
  }, []);

  // Fetch all clients to get loan dates for cancel payment logic
  const fetchAllClients = async () => {
    try {
      const token = localStorage.getItem('token');
      let clientsData = [];

      if (!token) {
        // public test endpoint fallback
        const response = await fetch('http://localhost:5000/api/clients/test/all');
        if (response.ok) {
          const data = await response.json();
          clientsData = data.clients || [];
        }
      } else {
        const response = await fetch('http://localhost:5000/api/clients/all', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          clientsData = data.clients || [];
        } else if (response.status === 401) {
          const fb = await fetch('http://localhost:5000/api/clients/test/all');
          if (fb.ok) {
            const data = await fb.json();
            clientsData = data.clients || [];
          }
        }
      }

      setClientsList(clientsData);
    } catch (err) {
      console.warn('Error fetching clients:', err);
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
    try {
      const token = localStorage.getItem('token');

      // Call backend to delete payment
      const res = await fetch(`http://localhost:5000/api/payments/${paymentId}`, {
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

      // Only extend loan end date if the cancelled payment was NOT made today.
      // If payment was made today, it's a same-day reversal — no week extension needed.
      const wasToday = isTodayDate(paymentCreatedAt);

      if (!wasToday) {
        // Look up client details
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
        const updateRes = await fetch(`http://localhost:5000/api/clients/${clientId}`, {
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

      // Refresh payment data after cancellation
      await fetchPayments();

      // Show success message
      const msg = wasToday
        ? 'Payment cancelled successfully.'
        : 'Payment cancelled successfully. Due extended by 1 week.';
      showPopup('success', 'Cancelled', msg);
    } catch (error) {
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
    }
  };

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
      const response = await fetch('http://localhost:5000/api/payments/test/all', {
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
            staff: {
              id: payment.agent?._id || 'N/A',
              name: payment.collectedStaff || 'Unknown',
              role: payment.collectedByRole ? payment.collectedByRole.charAt(0).toUpperCase() + payment.collectedByRole.slice(1) : null,
            },
            client: {
              id: payment.client?._id || (typeof payment.client === 'string' ? payment.client : null) || 'N/A',
              name: payment.clientName || payment.client?.name || 'Unknown',
              phone: payment.client?.phone || 'N/A',
              district: payment.client?.district || 'N/A',
              landmark: payment.client?.landmark || 'N/A',
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

        // Deduplicate records by unique payment _id
        const uniqueRecords = [];
        const seenKeys = new Set();

        formattedRecords.forEach((record) => {
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
          ...new Set(formattedRecords.map((r) => r.staff.name).filter(name => name !== 'Unknown')),
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

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminNavbar />
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
      <AdminNavbar />

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

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[240px] flex-1">
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
                className="border rounded-lg px-3 py-2 text-sm min-w-[140px]"
              >
                {staffList.map((staff) => (
                  <option key={staff} value={staff}>
                    {staff}
                  </option>
                ))}
              </select>

              <div className="relative">
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm w-40"
                />
              </div>

              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors">
                <Filter size={16} />
                Filter
              </button>

              <button
                onClick={() => {
                  setSearchTerm('');
                  setStaffFilter('All Staff');
                  setDateFilter('');
                }}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors"
              >
                <RotateCcw size={16} />
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* Payment History Table */}
        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
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
                  <th className="px-6 py-4 text-left font-semibold">Actions</th>
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
                  filteredRecords.map((record, idx) => (
                    <tr
                      key={idx}
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
                      <td className="px-6 py-4">
                        <button
                          onClick={() => openCancelConfirmModal(record._id, record.received, record.client.id, record.createdAt)}
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
    </div>
  );
}