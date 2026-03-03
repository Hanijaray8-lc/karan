// PaymentHistory.jsx
import { useState, useEffect } from 'react';
import {
  CalendarDays,
  IndianRupee,
  Search,
  Filter,
  RotateCcw,
  Users,
} from 'lucide-react';

import AdminNavbar from './AdminNavbar';

export default function PaymentHistory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [staffFilter, setStaffFilter] = useState('All Staff');
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
    
    // Setup polling to check for new payments (every 20 seconds)
    const pollInterval = setInterval(() => {
      fetchPaymentsWithoutLoading();
    }, 20000); // 20 seconds
    
    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
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
        const formattedRecords = data.data.payments.map((payment) => ({
          _id: payment._id,
          datetime: new Date(payment.paymentDate).toLocaleString('en-IN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          staff: {
            id: payment.agent?._id || 'N/A',
            // Use collectedStaff name with collectedByRole
            name: payment.collectedStaff || 'Unknown',
            // Use collectedByRole field directly
            role: payment.collectedByRole ? payment.collectedByRole.charAt(0).toUpperCase() + payment.collectedByRole.slice(1) : null,
          },
          client: {
            name: payment.clientName || payment.client?.name || 'Unknown',
            phone: payment.client?.phone || 'N/A',
            district: payment.client?.district || 'N/A',
            landmark: payment.client?.landmark || 'N/A',
          },
          received: payment.amount || 0,
          pending: payment.remainingDue || 0,
        }));

        setPaymentRecords(formattedRecords);
        setError(null);

        // Calculate stats
        const totalCollected = data.data.stats.totalCollected || 0;
        let todayCollected = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        formattedRecords.forEach((record) => {
          const paymentDate = new Date(record.datetime);
          paymentDate.setHours(0, 0, 0, 0);
          if (paymentDate.getTime() === today.getTime()) {
            todayCollected += record.received;
          }
        });

        // Calculate total pending from all payments
        const totalPending = formattedRecords.reduce(
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
      record.staff.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      record.client.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStaff =
      staffFilter === 'All Staff' || record.staff.name === staffFilter;

    return matchesSearch && matchesStaff;
  });

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
                  <p className="text-xs sm:text-sm opacity-90">Total Collection</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">
                    ₹{stats.totalCollected.toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="bg-white/20 p-2 sm:p-3 rounded-lg hidden sm:block">
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
                <div className="bg-white/20 p-2 sm:p-3 rounded-lg hidden sm:block">
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
                <div className="bg-white/20 p-2 sm:p-3 rounded-lg hidden sm:block">
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
                  className="border rounded-lg px-3 py-2 text-sm w-40"
                />
              </div>

              <button className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors">
                <Filter size={16} />
                Filter
              </button>

              <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors">
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
                        ₹{record.received.toLocaleString('en-IN')}
                      </td>
                      <td className="px-6 py-4 font-medium text-red-700">
                        ₹{record.pending.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}