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

import AdminNavbar from '../Admin/AdminNavbar';
import ManagerNavbar from './ManagerNavbar';

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

export default function MpaymentHistory() {
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
  const [clientsList, setClientsList] = useState([]);
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });

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

  // Fetch payments with loading indicator
  const fetchPayments = async () => {
    setLoading(true);
    try {
      await fetchPaymentsData();
    } finally {
      setLoading(false);
    }
  };

  const fetchAllClients = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await fetch('https://karan-e26t.onrender.com/api/clients/all', {
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
      }
    } catch (err) {
      console.warn('Error fetching clients:', err);
    }
  };

  const openCancelConfirmModal = (paymentId, paymentAmount, clientId) => {
    setCancelPaymentData({ paymentId, paymentAmount, clientId });
    setShowCancelConfirmModal(true);
  };

  const handleConfirmCancelPayment = async () => {
    if (!cancelPaymentData) return;
    const { paymentId, paymentAmount, clientId } = cancelPaymentData;
    setShowCancelConfirmModal(false);
    try {
      const token = localStorage.getItem('token');

      const res = await fetch(`https://karan-e26t.onrender.com/api/payments/${paymentId}`, {
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
          await fetch(`https://karan-e26t.onrender.com/api/clients/${clientId}`, {
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

      await fetchPayments();
      showPopup('success', 'Cancelled', 'Payment cancelled successfully. Due extended by 1 week.');
    } catch (error) {
      console.error('Error cancelling payment:', error);
      showPopup('error', 'Error', `Failed to cancel payment: ${error.message}`);
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
      const response = await fetch('https://karan-e26t.onrender.com/api/payments/test/all', {
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
          return {
            _id: payment._id,
            datetime: dt.display,
            rawDate: dt.rawDate,
            createdAt: payment.createdAt ? new Date(payment.createdAt) : null,
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
            },
            received: payment.amount || 0,
            pending: payment.remainingDue || 0,
            paymentMethod: payment.paymentMethod || 'cash',
            notes: payment.notes || '',
          };
        });

        // Sort: current date paid clients on top, latest payments first
        formattedRecords.sort((a, b) => {
          const isTodayA = a.datetime !== 'N/A' && (isTodayDate(a.rawDate) || isTodayDate(a.createdAt));
          const isTodayB = b.datetime !== 'N/A' && (isTodayDate(b.rawDate) || isTodayDate(b.createdAt));

          // If one is from current date and the other isn't, current date comes first
          if (isTodayA && !isTodayB) return -1;
          if (!isTodayA && isTodayB) return 1;

          // Within the same group, sort descending: latest payment first
          const timeA = a.rawDate ? a.rawDate.getTime() : 0;
          const timeB = b.rawDate ? b.rawDate.getTime() : 0;
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

        // Calculate stats using uniqueRecords
        const totalCollected = uniqueRecords.reduce((sum, r) => sum + (r.received || 0), 0);
        let todayCollected = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        uniqueRecords.forEach((record) => {
          if (record.rawDate) {
            const paymentDate = new Date(record.rawDate);
            paymentDate.setHours(0, 0, 0, 0);
            if (paymentDate.getTime() === today.getTime()) {
              todayCollected += record.received;
            }
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

  const filteredRecords = paymentRecords.filter((record) => {
    const matchesSearch =
      (record.staff?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.client?.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.paymentMethod || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.notes || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStaff =
      staffFilter === 'All Staff' || record.staff?.name === staffFilter;

    const matchesDate = !dateFilter || (record.rawDate && (() => {
      const year = record.rawDate.getFullYear();
      const month = String(record.rawDate.getMonth() + 1).padStart(2, '0');
      const day = String(record.rawDate.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}` === dateFilter;
    })());

    return matchesSearch && matchesStaff && matchesDate;
  });

  // Compute stats based on BOTH staff + date filters (uses same filteredRecords)
  // This ensures summary cards always reflect the active filter combination
  const filteredStats = (() => {
    const totalCollected = filteredRecords.reduce((sum, r) => sum + (r.received || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let todayCollected = 0;
    filteredRecords.forEach((record) => {
      if (record.rawDate) {
        const pd = new Date(record.rawDate);
        pd.setHours(0, 0, 0, 0);
        if (pd.getTime() === today.getTime()) todayCollected += record.received;
      }
    });
    const totalPending = filteredRecords.reduce((sum, r) => sum + (r.pending || 0), 0);
    return { totalCollected, todayCollected, totalPending };
  })();

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
                    ₹{filteredStats.todayCollected.toLocaleString('en-IN')}
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
            <table className="w-full text-sm min-w-[1000px]">
              <thead className="bg-[#16423C] text-white sticky top-0">
                <tr>
                  <th className="px-6 py-4 text-left font-semibold">Date & Time</th>
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
                    <td colSpan={9} className="py-16 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                        <span className="text-gray-600">Loading payment records...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-16 text-center text-gray-500">
                      No payment records found
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record, idx) => (
                    <tr
                      key={idx}
                      className="border-t hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">{record.datetime}</td>
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
                          onClick={() => openCancelConfirmModal(record._id, record.received, record.client?.id)}
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
    </div>
  );
}