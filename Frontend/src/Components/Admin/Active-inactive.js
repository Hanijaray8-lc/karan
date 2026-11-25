import React, { useState, useEffect } from 'react';
import AdminNavbar from './AdminNavbar';
import { Search, Users, Clock, Award, CheckCircle, RefreshCw, RotateCcw } from 'lucide-react';

// Pagination page size (used by both desktop table and mobile cards)
const MOBILE_PAGE_SIZE = 20;

const AdminActiveInactive = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Tab state: 'active' or 'inactive'
  const [activeTab, setActiveTab] = useState('active');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedLandmark, setSelectedLandmark] = useState('');
  const [districts, setDistricts] = useState([]);
  const [landmarks, setLandmarks] = useState([]);

  // Pagination (UI only, shared by desktop table and mobile cards)
  const [mobilePage, setMobilePage] = useState(1);

  // Fetch client data
  const fetchClients = async () => {
    try {
      setLoading(true);
      setError(null);

      let response = await fetch('https://karanfinance.com/api/clients/test/all', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const token = localStorage.getItem('token');
        response = await fetch('https://karanfinance.com/api/clients', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch clients (${response.status})`);
      }

      const data = await response.json();
      const clientsList = data.clients || data.data || [];
      setClients(clientsList);

      // Extract unique districts
      const uniqueDistricts = [...new Set(clientsList.map(c => c.district))].filter(Boolean).sort();
      setDistricts(uniqueDistricts);

      // Extract unique landmarks
      const uniqueLandmarks = [...new Set(clientsList.map(c => c.landmark?.trim()))].filter(Boolean).sort();
      setLandmarks(uniqueLandmarks);

    } catch (err) {
      console.error('Error fetching clients for Admin Active/Inactive:', err);
      setError(err.message || 'Failed to load client data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Filter landmarks when district selection changes
  useEffect(() => {
    if (selectedDistrict) {
      const filteredByDistrict = clients.filter(c => c.district === selectedDistrict);
      const uniqueLandmarks = [...new Set(filteredByDistrict.map(c => c.landmark?.trim()))].filter(Boolean).sort();
      setLandmarks(uniqueLandmarks);
      setSelectedLandmark('');
    } else {
      const allLandmarks = [...new Set(clients.map(c => c.landmark?.trim()))].filter(Boolean).sort();
      setLandmarks(allLandmarks);
      setSelectedLandmark('');
    }
  }, [selectedDistrict, clients]);

  // Calculation helpers
  const getWeeklyAmount = (client) => {
    if (client.weekly_amount && Number(client.weekly_amount) > 0) {
      return Number(client.weekly_amount);
    }
    return 575; // Default weekly installment for ₹5000/₹6900 loans
  };

  const getTotalWeeks = (client) => {
    const amt = Number(client.amount || 0);
    const weekly = getWeeklyAmount(client);
    // Standard ₹5000/₹6900 loan with ₹575/wk has at least 12 weeks
    if (amt === 6900 || amt === 5000 || weekly === 575) {
      return Math.max(12, Number(client.total_weeks || 12));
    }
    if (client.total_weeks && Number(client.total_weeks) > 0) {
      return Number(client.total_weeks);
    }
    return 12;
  };

  const getPaidWeeks = (client) => {
    const weekly = getWeeklyAmount(client);
    const totalWeeks = getTotalWeeks(client);
    const received = Number(client.received || 0);
    const weeksPaid = weekly > 0 ? Math.floor(received / weekly) : 0;
    return Math.min(weeksPaid, totalWeeks);
  };

  const is12WeekFullyCompleted = (client) => {
    const totalWeeks = getTotalWeeks(client);
    const weeksPaid = getPaidWeeks(client);
    const pending = Number(client.pending || 0);
    const isPaidStatus = client.status === 'paid';

    // Inactive side ONLY shows clients who have completed all weeks AND have no pending amount
    return (weeksPaid >= totalWeeks || isPaidStatus) && pending <= 0;
  };

  // Split clients into Active and Inactive categories
  const activeClients = clients.filter(c => !is12WeekFullyCompleted(c));
  const inactiveClients = clients.filter(c => is12WeekFullyCompleted(c));

  // Apply search and dropdown filters to current tab list
  const currentList = activeTab === 'active' ? activeClients : inactiveClients;

  const filteredClients = currentList.filter(client => {
    const matchesSearch =
      !searchQuery ||
      (client.name && client.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.phone && client.phone.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.clientId && client.clientId.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.landmark && client.landmark.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (client.address && client.address.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDistrict = !selectedDistrict || client.district === selectedDistrict;
    const matchesLandmark = !selectedLandmark || (client.landmark?.trim() === selectedLandmark);

    return matchesSearch && matchesDistrict && matchesLandmark;
  });

  // Pagination: back to page 1 whenever tab / filters change
  useEffect(() => {
    setMobilePage(1);
  }, [activeTab, searchQuery, selectedDistrict, selectedLandmark]);

  const mobileTotalPages = Math.max(1, Math.ceil(filteredClients.length / MOBILE_PAGE_SIZE));
  const mobileCurrentPage = Math.min(mobilePage, mobileTotalPages);
  const mobileStartIndex = (mobileCurrentPage - 1) * MOBILE_PAGE_SIZE;
  const mobileClients = filteredClients.slice(mobileStartIndex, mobileStartIndex + MOBILE_PAGE_SIZE);


  const formatCurrency = (amt) => `₹${Number(amt || 0).toLocaleString('en-IN')}`;

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavbar />

      {/* Main Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
        {/* Summary Cards (click Active / Inactive card to switch list) */}
        <div className="grid grid-cols-3 gap-3 sm:gap-5 mb-6 sm:mb-8">
          <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 text-white rounded-xl shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Total Clients</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">{clients.length}</p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <Users className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>

          <div
            onClick={() => setActiveTab('active')}
            className={`cursor-pointer bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl shadow-md overflow-hidden transition-all ${activeTab === 'active' ? 'ring-2 ring-offset-2 ring-[#16423C]' : 'opacity-90 hover:opacity-100'
              }`}
          >
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Active Clients</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">{activeClients.length}</p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <Clock className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>

          <div
            onClick={() => setActiveTab('inactive')}
            className={`cursor-pointer bg-gradient-to-r from-emerald-500 to-emerald-400 text-white rounded-xl shadow-md overflow-hidden transition-all ${activeTab === 'inactive' ? 'ring-2 ring-offset-2 ring-[#16423C]' : 'opacity-90 hover:opacity-100'
              }`}
          >
            <div className="p-3 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm opacity-90">Inactive Clients</p>
                  <p className="text-lg sm:text-3xl font-bold mt-0 sm:mt-1 truncate">{inactiveClients.length}</p>
                </div>
                <div className="bg-[#16423C]/20 p-2 sm:p-3 rounded-lg hidden sm:block">
                  <Award className="h-6 w-6 sm:h-8 sm:w-8" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="bg-white rounded-xl shadow border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700" />
              Client Status
            </h2>

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-3">
              {/* Active / Inactive tabs */}
              <div className="col-span-2 sm:col-span-1 flex rounded-lg border border-gray-300 overflow-hidden text-sm">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`flex-1 sm:flex-none px-4 py-2 font-medium transition-colors ${activeTab === 'active' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Active ({activeClients.length})
                </button>
                <button
                  onClick={() => setActiveTab('inactive')}
                  className={`flex-1 sm:flex-none px-4 py-2 font-medium border-l border-gray-300 transition-colors ${activeTab === 'inactive' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  Inactive ({inactiveClients.length})
                </button>
              </div>

              <div className="relative col-span-2 sm:col-span-1 sm:min-w-[240px] sm:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search Client ID, name, phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto sm:min-w-[140px]"
              >
                <option value="">All Districts ({districts.length})</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={selectedLandmark}
                onChange={(e) => setSelectedLandmark(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm w-full sm:w-auto sm:min-w-[140px]"
              >
                <option value="">All Landmarks ({landmarks.length})</option>
                {landmarks.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>

              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedDistrict('');
                  setSelectedLandmark('');
                }}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm transition-colors"
              >
                <RotateCcw size={16} />
                Reset
              </button>

              <button
                onClick={fetchClients}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors disabled:opacity-60"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Clients list */}
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p className="text-red-800 font-medium">Error: {error}</p>
            <button
              onClick={fetchClients}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : (
          <div className="sm:bg-white sm:rounded-xl sm:shadow sm:border sm:border-gray-200 sm:overflow-hidden">
            {/* Desktop / tablet table (hidden on mobile) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1400px]">
                <thead className="bg-[#16423C] text-white sticky top-0">
                  <tr>
                    <th className="px-6 py-4 text-left font-semibold">Client ID</th>
                    <th className="px-6 py-4 text-left font-semibold">Client Name</th>
                    <th className="px-6 py-4 text-left font-semibold">Mobile</th>
                    <th className="px-6 py-4 text-left font-semibold">District</th>
                    <th className="px-6 py-4 text-left font-semibold">Landmark</th>
                    <th className="px-6 py-4 text-left font-semibold">Agent</th>
                    <th className="px-6 py-4 text-left font-semibold">Weekly Progress</th>
                    <th className="px-6 py-4 text-left font-semibold">Start Date</th>
                    <th className="px-6 py-4 text-left font-semibold">Weekly Due</th>
                    <th className="px-6 py-4 text-left font-semibold">Total</th>
                    <th className="px-6 py-4 text-left font-semibold">Received</th>
                    <th className="px-6 py-4 text-left font-semibold">Pending</th>
                    <th className="px-6 py-4 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={13} className="py-16 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                          <span className="text-gray-600">Loading clients data...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-16 text-center text-gray-500">
                        No {activeTab} clients found
                      </td>
                    </tr>
                  ) : (
                    mobileClients.map((client, idx) => {
                      const totalWks = getTotalWeeks(client);
                      const weeksPaid = getPaidWeeks(client);
                      const isCompleted = is12WeekFullyCompleted(client);
                      const progressPct = Math.min(Math.round((weeksPaid / totalWks) * 100), 100);

                      return (
                        <tr
                          key={client._id || client.clientId || `${mobileStartIndex + idx}`}
                          className="border-t hover:bg-gray-50 transition-colors"
                        >
                          <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">{client.clientId || 'N/A'}</td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-900">{client.name}</div>
                            {client.husband_name && (
                              <div className="text-xs text-gray-500">H/o: {client.husband_name}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">{client.phone}</td>
                          <td className="px-6 py-4">{client.district}</td>
                          <td className="px-6 py-4">{client.landmark}</td>
                          <td className="px-6 py-4">
                            {client.assigned_agent_name ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                {client.assigned_agent_name}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 min-w-[160px]">
                            <div className="text-xs font-medium text-gray-700 mb-1">
                              {weeksPaid} / {totalWks} Weeks ({progressPct}%)
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${progressPct}%` }}></div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-700">{formatDate(client.loan_start_date)}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-700">{formatCurrency(getWeeklyAmount(client))}/wk</td>
                          <td className="px-6 py-4 font-medium text-gray-900">{formatCurrency(client.amount)}</td>
                          <td className="px-6 py-4 font-medium text-green-700">{formatCurrency(client.received)}</td>
                          <td className="px-6 py-4 font-medium text-red-700">{formatCurrency(client.pending)}</td>
                          <td className="px-6 py-4">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700 whitespace-nowrap">
                                <CheckCircle size={12} />
                                12 Wk Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                <Clock size={12} />
                                Active
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Total records */}
            {!loading && filteredClients.length > 0 && (
              <div className="hidden sm:flex items-center justify-between px-4 sm:px-6 py-4 border-t border-gray-200 bg-white">
                <p className="text-sm text-gray-600">
                  Showing <span className="font-semibold">{mobileStartIndex + 1}</span>–
                  <span className="font-semibold">{Math.min(mobileStartIndex + MOBILE_PAGE_SIZE, filteredClients.length)}</span> of{' '}
                  <span className="font-semibold">{filteredClients.length}</span> clients
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                    disabled={mobileCurrentPage <= 1}
                    className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  <span className="text-sm text-gray-700 whitespace-nowrap">
                    Page {mobileCurrentPage} / {mobileTotalPages}
                  </span>
                  <button
                    onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
                    disabled={mobileCurrentPage >= mobileTotalPages}
                    className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}

            {/* Mobile card view (hidden on sm and up) */}
            <div className="sm:hidden">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 bg-white rounded-xl shadow border border-gray-200">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
                  <span className="text-gray-600 text-sm">Loading clients data...</span>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="py-16 text-center text-gray-500 text-sm bg-white rounded-xl shadow border border-gray-200">
                  No {activeTab} clients found
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden divide-y divide-gray-200">
                    {mobileClients.map((client, idx) => {
                      const totalWks = getTotalWeeks(client);
                      const weeksPaid = getPaidWeeks(client);
                      const isCompleted = is12WeekFullyCompleted(client);
                      const progressPct = Math.min(Math.round((weeksPaid / totalWks) * 100), 100);

                      return (
                        <div key={client._id || client.clientId || `m-${mobileStartIndex + idx}`} className="p-4 min-w-0">
                          {/* Client name + pending */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-semibold text-gray-900 break-words">{client.name}</p>
                              {client.husband_name && (
                                <p className="text-xs text-gray-500">H/o: {client.husband_name}</p>
                              )}
                            </div>
                            <p className="text-lg font-bold text-red-700 shrink-0">{formatCurrency(client.pending)}</p>
                          </div>

                          {/* ID + agent + status badges */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              {client.clientId || 'ID-N/A'}
                            </span>
                            {client.assigned_agent_name && (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 break-words max-w-full">
                                {client.assigned_agent_name}
                              </span>
                            )}
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-200 text-gray-700">
                                <CheckCircle size={11} />
                                12 Wk Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                <Clock size={11} />
                                Active
                              </span>
                            )}
                          </div>

                          {/* Progress */}
                          <div className="mt-3">
                            <div className="flex justify-between text-xs text-gray-600 mb-1">
                              <span>Weekly Progress</span>
                              <span className="font-medium">{weeksPaid} / {totalWks} ({progressPct}%)</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                              <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${progressPct}%` }}></div>
                            </div>
                          </div>

                          {/* Details grid */}
                          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-4 text-sm">
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Mobile</p>
                              <p className="font-medium text-gray-900 break-words">{client.phone}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Total</p>
                              <p className="font-medium text-gray-900 break-words">{formatCurrency(client.amount)}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">District</p>
                              <p className="font-medium text-gray-900 break-words">{client.district}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Received</p>
                              <p className="font-medium text-green-700 break-words">{formatCurrency(client.received)}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Landmark</p>
                              <p className="font-medium text-gray-900 break-words">{client.landmark}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Start Date</p>
                              <p className="font-medium text-gray-900 break-words">{formatDate(client.loan_start_date)}</p>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500">Weekly Due</p>
                              <p className="font-medium text-gray-900 break-words">{formatCurrency(getWeeklyAmount(client))}/wk</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mobile pagination */}
                  <div className="flex items-center justify-between gap-2 mt-4 px-1">
                    <p className="text-xs text-gray-600">
                      {mobileStartIndex + 1}–{Math.min(mobileStartIndex + MOBILE_PAGE_SIZE, filteredClients.length)} of{' '}
                      <span className="font-semibold">{filteredClients.length}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                        disabled={mobileCurrentPage <= 1}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Prev
                      </button>
                      <span className="text-xs text-gray-700 whitespace-nowrap">
                        {mobileCurrentPage} / {mobileTotalPages}
                      </span>
                      <button
                        onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
                        disabled={mobileCurrentPage >= mobileTotalPages}
                        className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminActiveInactive;