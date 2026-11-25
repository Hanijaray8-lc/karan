import React, { useState, useEffect } from 'react';
import ManagerNavbar from './ManagerNavbar';
import { filterClientsForUser, filterClientsForManager, filterAgentsForManager, getLoggedInUser } from '../../utils/staffRecordFilter';
import { User, Search, Filter, MapPin, Phone, CheckCircle, Clock, ShieldAlert, Award, Calendar, DollarSign, RefreshCw } from 'lucide-react';

const AciveInactive = () => {
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
  const [myAgents, setMyAgents] = useState([]);

  // Pagination state (20 clients per page)
  const [currentPage, setCurrentPage] = useState(1);
  const CLIENTS_PER_PAGE = 20;

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
      const rawClients = data.clients || data.data || [];
      const clientsList = filterClientsForManager(rawClients, myAgents, getLoggedInUser());
      setClients(clientsList);

      // Extract unique districts
      const uniqueDistricts = [...new Set(clientsList.map(c => c.district))].filter(Boolean).sort();
      setDistricts(uniqueDistricts);

      // Extract unique landmarks
      const uniqueLandmarks = [...new Set(clientsList.map(c => c.landmark?.trim()))].filter(Boolean).sort();
      setLandmarks(uniqueLandmarks);

    } catch (err) {
      console.error('Error fetching clients for Active/Inactive:', err);
      setError(err.message || 'Failed to load client data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchMyAgents();
  }, []);

  // Fetch agents scoped to this manager
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
        setMyAgents(filterAgentsForManager(data.agents, getLoggedInUser()));
      }
    } catch (e) {
      // silent fail
    }
  };

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

  // Pagination calculations (20 clients per page)
  const totalPages = Math.max(1, Math.ceil(filteredClients.length / CLIENTS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * CLIENTS_PER_PAGE;
  const paginatedClients = filteredClients.slice(pageStartIndex, pageStartIndex + CLIENTS_PER_PAGE);

  // Go back to page 1 whenever the tab, search or any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, selectedDistrict, selectedLandmark]);

  // Build page number list with ellipsis (e.g. 1 ... 4 5 6 ... 12)
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (safeCurrentPage > 3) pages.push('...');
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (safeCurrentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="sticky top-0 z-50">
        <ManagerNavbar />
      </div>

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-4 sm:px-6 lg:px-10 py-6 space-y-6">

        {/* Header Title Banner */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-3">
              <span>Client Status Dashboard</span>
              <span className="text-xs bg-emerald-700/80 border border-emerald-500/30 px-3 py-1 rounded-full font-medium uppercase tracking-wider text-emerald-200">
                Active / Inactive
              </span>
            </h1>
            <p className="text-emerald-100 text-sm mt-1">
              Separate clients into Active (ongoing dues) and Inactive (12 weeks fully completed clients).
            </p>
          </div>

          <button
            onClick={fetchClients}
            disabled={loading}
            className="flex items-center gap-2 bg-emerald-700/80 hover:bg-emerald-600 active:scale-95 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow transition duration-200 border border-emerald-500/40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Clients</p>
              <h3 className="text-2xl font-black text-gray-800 mt-1">{clients.length}</h3>
              <p className="text-xs text-gray-400 mt-0.5">Registered clients</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <User className="w-6 h-6" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('active')}
            className={`cursor-pointer bg-white rounded-2xl p-5 shadow-sm border transition-all duration-200 flex items-center justify-between ${activeTab === 'active' ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-md' : 'border-gray-100 hover:border-emerald-200'
              }`}
          >
            <div>
              <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Active Clients</p>
              <h3 className="text-2xl font-black text-emerald-700 mt-1">{activeClients.length}</h3>
              <p className="text-xs text-emerald-600/80 mt-0.5">Under 12 weeks ongoing</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Clock className="w-6 h-6 animate-pulse" />
            </div>
          </div>

          <div
            onClick={() => setActiveTab('inactive')}
            className={`cursor-pointer bg-white rounded-2xl p-5 shadow-sm border transition-all duration-200 flex items-center justify-between ${activeTab === 'inactive' ? 'border-purple-500 ring-2 ring-purple-500/20 shadow-md' : 'border-gray-100 hover:border-purple-200'
              }`}
          >
            <div>
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Inactive Clients</p>
              <h3 className="text-2xl font-black text-purple-700 mt-1">{inactiveClients.length}</h3>
              <p className="text-xs text-purple-600/80 mt-0.5">12 weeks completed</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <Award className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Tab Navigation & Search / Filter Controls */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-4">

          {/* Tabs */}
          <div className="flex border-b border-gray-100 pb-3 gap-2">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${activeTab === 'active'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <Clock className="w-4 h-4" />
              <span>Active Clients</span>
              <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-extrabold ${activeTab === 'active' ? 'bg-emerald-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                {activeClients.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('inactive')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${activeTab === 'inactive'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              <Award className="w-4 h-4" />
              <span>Inactive Clients (12 Weeks Completed)</span>
              <span className={`ml-1 px-2 py-0.5 text-xs rounded-full font-extrabold ${activeTab === 'inactive' ? 'bg-purple-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}>
                {inactiveClients.length}
              </span>
            </button>
          </div>

          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Search input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search Client ID, Name, Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition"
              />
            </div>

            {/* District dropdown */}
            <div>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="w-full py-2.5 px-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-gray-700"
              >
                <option value="">All Districts ({districts.length})</option>
                {districts.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Landmark dropdown */}
            <div>
              <select
                value={selectedLandmark}
                onChange={(e) => setSelectedLandmark(e.target.value)}
                className="w-full py-2.5 px-3 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition text-gray-700"
              >
                <option value="">All Landmarks ({landmarks.length})</option>
                {landmarks.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-emerald-600 border-t-transparent mb-4"></div>
            <p className="text-gray-500 font-medium text-sm">Loading clients data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700">
            <ShieldAlert className="w-8 h-8 mx-auto mb-2 text-red-500" />
            <h4 className="font-bold text-base">Failed to load client records</h4>
            <p className="text-sm text-red-600 mt-1">{error}</p>
            <button
              onClick={fetchClients}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold shadow hover:bg-red-700 transition"
            >
              Try Again
            </button>
          </div>
        ) : filteredClients.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
              <Filter className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">No clients found</h3>
            <p className="text-sm text-gray-500 mt-1">
              No {activeTab} clients match your current search or filter criteria.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card view (below md) */}
            <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-4">
              {paginatedClients.map((client) => {
                const totalWks = getTotalWeeks(client);
                const weeksPaid = getPaidWeeks(client);
                const isCompleted = is12WeekFullyCompleted(client);
                const weeklyAmt = getWeeklyAmount(client);
                const progressPct = Math.min(Math.round((weeksPaid / totalWks) * 100), 100);

                return (
                  <div
                    key={client._id || client.clientId}
                    className={`bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between ${isCompleted ? 'border-purple-200 hover:border-purple-300' : 'border-gray-100 hover:border-emerald-200'
                      }`}
                  >
                    <div>
                      {/* Header: Name, ID, Badge */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div>
                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                            {client.clientId || 'ID-N/A'}
                          </span>
                          <h3 className="text-base font-bold text-gray-900 mt-1.5 leading-snug">
                            {client.name}
                          </h3>
                          {client.husband_name && (
                            <p className="text-xs text-gray-500">H/o: {client.husband_name}</p>
                          )}
                        </div>

                        {isCompleted ? (
                          <span className="bg-purple-100 text-purple-700 border border-purple-200 text-xs font-extrabold px-3 py-1 rounded-full flex items-center gap-1 shrink-0">
                            <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
                            <span>12 Wk Completed</span>
                          </span>
                        ) : (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold px-3 py-1 rounded-full flex items-center gap-1 shrink-0">
                            <Clock className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Active</span>
                          </span>
                        )}
                      </div>

                      {/* Contact & Location Info */}
                      <div className="space-y-1.5 text-xs text-gray-600 border-t border-b border-gray-50 py-3 my-3">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="font-semibold text-gray-800">{client.phone}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                          <span className="truncate">
                            {client.landmark ? `${client.landmark}, ` : ''}{client.district}
                          </span>
                        </div>
                        {client.assigned_agent_name && (
                          <div className="flex items-center gap-2 text-gray-500">
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span>Agent: <strong className="text-gray-700">{client.assigned_agent_name}</strong></span>
                          </div>
                        )}
                      </div>

                      {/* Financial Progress & Dues */}
                      <div className="space-y-2.5">
                        {/* Weeks Completed Progress Bar */}
                        <div>
                          <div className="flex justify-between items-center text-xs font-semibold mb-1">
                            <span className="text-gray-500">Weekly Progress</span>
                            <span className={isCompleted ? 'text-purple-700 font-bold' : 'text-emerald-700 font-bold'}>
                              {weeksPaid} / {totalWks} Weeks ({progressPct}%)
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${isCompleted ? 'bg-purple-600' : 'bg-emerald-600'
                                }`}
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>
                        </div>

                        {/* Amounts Breakdown Grid */}
                        <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2.5 rounded-xl text-center">
                          <div>
                            <p className="text-[10px] uppercase font-bold text-gray-400">Total</p>
                            <p className="text-xs font-black text-gray-800">{formatCurrency(client.amount)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-emerald-600">Received</p>
                            <p className="text-xs font-black text-emerald-700">{formatCurrency(client.received)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] uppercase font-bold text-amber-600">Pending</p>
                            <p className="text-xs font-black text-amber-700">{formatCurrency(client.pending)}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: Dates */}
                    <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center text-[11px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>Start: {formatDate(client.loan_start_date)}</span>
                      </div>
                      <div>
                        <span>Due: <strong className="text-gray-700">{formatCurrency(weeklyAmt)}/wk</strong></span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / tablet table view (md and up) */}
            <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1100px] text-left border-collapse">
                  <thead>
                    <tr className={`text-white text-xs font-bold uppercase tracking-wider ${activeTab === 'inactive' ? 'bg-gradient-to-r from-purple-700 to-purple-900' : 'bg-gradient-to-r from-emerald-800 to-teal-900'}`}>
                      <th className="px-4 py-3.5">S.No</th>
                      <th className="px-4 py-3.5">Client ID</th>
                      <th className="px-4 py-3.5">Client Name</th>
                      <th className="px-4 py-3.5">Phone</th>
                      <th className="px-4 py-3.5">Landmark / District</th>
                      <th className="px-4 py-3.5">Agent</th>
                      <th className="px-4 py-3.5 min-w-[160px]">Weekly Progress</th>
                      <th className="px-4 py-3.5 text-right">Total</th>
                      <th className="px-4 py-3.5 text-right">Received</th>
                      <th className="px-4 py-3.5 text-right">Pending</th>
                      <th className="px-4 py-3.5 text-right">Weekly Due</th>
                      <th className="px-4 py-3.5">Start Date</th>
                      <th className="px-4 py-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                    {paginatedClients.map((client, idx) => {
                      const totalWks = getTotalWeeks(client);
                      const weeksPaid = getPaidWeeks(client);
                      const isCompleted = is12WeekFullyCompleted(client);
                      const weeklyAmt = getWeeklyAmount(client);
                      const progressPct = Math.min(Math.round((weeksPaid / totalWks) * 100), 100);

                      return (
                        <tr key={client._id || client.clientId} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3.5 font-semibold text-gray-500">{pageStartIndex + idx + 1}</td>
                          <td className="px-4 py-3.5">
                            <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap">
                              {client.clientId || 'ID-N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-900">{client.name}</div>
                            {client.husband_name && (
                              <div className="text-xs text-gray-500">H/o: {client.husband_name}</div>
                            )}
                          </td>
                          <td className="px-4 py-3.5 font-semibold text-gray-800 whitespace-nowrap">{client.phone}</td>
                          <td className="px-4 py-3.5">
                            <div className="font-semibold text-gray-700">{client.landmark || 'N/A'}</div>
                            <div className="text-xs text-gray-400">{client.district || 'N/A'}</div>
                          </td>
                          <td className="px-4 py-3.5 text-gray-600">{client.assigned_agent_name || '—'}</td>
                          <td className="px-4 py-3.5">
                            <div className={`text-xs font-bold mb-1 ${isCompleted ? 'text-purple-700' : 'text-emerald-700'}`}>
                              {weeksPaid} / {totalWks} Weeks ({progressPct}%)
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full ${isCompleted ? 'bg-purple-600' : 'bg-emerald-600'}`}
                                style={{ width: `${progressPct}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-gray-800 whitespace-nowrap">{formatCurrency(client.amount)}</td>
                          <td className="px-4 py-3.5 text-right font-bold text-emerald-700 whitespace-nowrap">{formatCurrency(client.received)}</td>
                          <td className="px-4 py-3.5 text-right font-bold text-amber-700 whitespace-nowrap">{formatCurrency(client.pending)}</td>
                          <td className="px-4 py-3.5 text-right font-semibold text-gray-700 whitespace-nowrap">{formatCurrency(weeklyAmt)}/wk</td>
                          <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">{formatDate(client.loan_start_date)}</td>
                          <td className="px-4 py-3.5 text-center">
                            {isCompleted ? (
                              <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 border border-purple-200 text-xs font-extrabold px-2.5 py-1 rounded-full whitespace-nowrap">
                                <CheckCircle className="w-3.5 h-3.5 text-purple-600" />
                                12 Wk Completed
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold px-2.5 py-1 rounded-full">
                                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                Active
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination (20 clients per page) */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3">
              <p className="text-xs sm:text-sm text-gray-500">
                Showing {pageStartIndex + 1}
                {' - '}
                {Math.min(pageStartIndex + CLIENTS_PER_PAGE, filteredClients.length)} of {filteredClients.length} clients
              </p>
              {filteredClients.length > CLIENTS_PER_PAGE && (
                <div className="flex items-center gap-1 flex-wrap justify-center">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                    disabled={safeCurrentPage === 1}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ‹ Prev
                  </button>
                  {getPageNumbers().map((page, idx) =>
                    page === '...' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 text-gray-500 text-xs">...</span>
                    ) : (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`min-w-[32px] px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${page === safeCurrentPage
                          ? (activeTab === 'inactive' ? 'bg-purple-600 text-white border-purple-600' : 'bg-emerald-600 text-white border-emerald-600')
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
                          }`}
                      >
                        {page}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
                    disabled={safeCurrentPage === totalPages}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next ›
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default AciveInactive;