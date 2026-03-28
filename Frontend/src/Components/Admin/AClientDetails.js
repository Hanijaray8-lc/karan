// ClientDetails.js
import React, { useState, useEffect } from 'react';
import AgentNavbar from './AdminNavbar';

const AClientDetails = () => {
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedLandmark, setSelectedLandmark] = useState('');
  const [districts, setDistricts] = useState([]);
  const [landmarks, setLandmarks] = useState([]);
  // Fixed weekly amount used across this view (do not change other components)
  const FORCED_WEEKLY = 575;

  // Fetch clients from API
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');

        let clientsList = [];

        // If no token, use the public test endpoint to avoid 401 when not authenticated
        if (!token) {
          const res = await fetch('http://localhost:5000/api/clients/test/all');
          if (!res.ok) throw new Error('Failed to fetch clients');
          const json = await res.json();
          clientsList = json.clients || [];
        } else {
          // Try the protected endpoint when token is available
          const response = await fetch('http://localhost:5000/api/clients', {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          // If unauthorized, fallback to public test endpoint to avoid showing 401 errors to unauthenticated users
          if (response.status === 401) {
            const fb = await fetch('http://localhost:5000/api/clients/test/all');
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

        // Extract unique districts
        const uniqueDistricts = [...new Set(clientsList.map(c => c.district))].filter(d => d).sort();
        setDistricts(uniqueDistricts);

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
      const uniqueLandmarks = [...new Set(filteredByDistrict.map(c => c.landmark))].filter(l => l).sort();
      setLandmarks(uniqueLandmarks);
      setSelectedLandmark(''); // Reset landmark when district changes
    } else {
      setLandmarks([]);
      setSelectedLandmark('');
    }
  }, [selectedDistrict, clients]);

  // Filter clients based on search, district, and landmark
  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (client.clientId && client.clientId.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesDistrict = !selectedDistrict || client.district === selectedDistrict;
    const matchesLandmark = !selectedLandmark || client.landmark === selectedLandmark;

    return matchesSearch && matchesDistrict && matchesLandmark;
  });

  // Generate 12 weekly due payments based on loan dates (12 weeks)
  const generateDuePayments = (client) => {
    if (!client) return [];

    const payments = [];
    const startDate = new Date(client.loan_start_date);
    const endDate = new Date(client.loan_end_date);

    let currentDate = new Date(startDate);
    let paymentId = 1;

    // weekly amount forced to ₹575 (12-week schedule)
    const weeklyDue = FORCED_WEEKLY;

    while (currentDate <= endDate && paymentId <= 12) {
      const isPaid = (client.received || 0) >= (paymentId * weeklyDue);

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
        status: isPaid ? 'paid' : 'pending',
        paidDate: isPaid ? currentDate.toISOString().split('T')[0] : null,
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

  const [duePayments, setDuePayments] = useState([]);

  // Update due payments when selected client changes
  useEffect(() => {
    const attachPayments = async () => {
      if (!selectedClient) return;

      // Generate the base schedule
      const baseWeeks = generateDuePayments(selectedClient);

      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`http://localhost:5000/api/payments/client/${selectedClient._id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
          // Try admin route as a fallback (for admins viewing any client)
          const adminRes = await fetch(`http://localhost:5000/api/payments/admin/all`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (!adminRes.ok) {
            setDuePayments(baseWeeks);
            return;
          }

          const adminJson = await adminRes.json();
          const allPayments = (adminJson.data && adminJson.data.payments) || [];
          const paymentHistory = allPayments.filter(p => p.client && (p.client._id === selectedClient._id || p.client === selectedClient._id));

          // continue to merge using paymentHistory
          const merged = baseWeeks.map(week => ({ ...week }));

          paymentHistory.forEach(p => {
            if (!p.paymentDate) return;
            const pISO = new Date(p.paymentDate).toISOString().split('T')[0];

            const idx = merged.findIndex(w => {
              return pISO >= w.weekStartISO && pISO < w.weekEndISO;
            });

            if (idx !== -1) {
              merged[idx].status = 'paid';
              merged[idx].paidDate = pISO;
              merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
              merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
            }
          });

          setDuePayments(merged);
          return;
        }

        const json = await res.json();
        const paymentHistory = (json.data && json.data.paymentHistory) || [];

        // For each payment, try to find the week it belongs to and attach collected info
        const merged = baseWeeks.map(week => ({ ...week }));

        paymentHistory.forEach(p => {
          if (!p.paymentDate) return;
          const pISO = new Date(p.paymentDate).toISOString().split('T')[0];

          const idx = merged.findIndex(w => {
            return pISO >= w.weekStartISO && pISO < w.weekEndISO;
          });

          if (idx !== -1) {
            merged[idx].status = 'paid';
            merged[idx].paidDate = pISO;
            merged[idx].collectedStaff = p.collectedStaff || (p.agent && (p.agent.name || p.agent.username)) || 'Unknown';
            merged[idx].collectedByRole = p.collectedByRole || (p.agent ? 'agent' : null);
          }
        });

        setDuePayments(merged);
      } catch (err) {
        console.error('Error fetching client payments:', err);
        setDuePayments(baseWeeks);
      }
    };

    attachPayments();
  }, [selectedClient]);

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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
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
                      disabled={!selectedDistrict}
                      className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] bg-white cursor-pointer text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                      {/* <div className="mt-2 w-full px-1">
                        <span className={`inline-block text-xs font-semibold px-1.5 py-0.5 rounded text-white ${
                          client.status === 'paid' ? 'bg-green-500' :
                          client.status === 'partial' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}>
                          {client.status === 'paid' ? '✅ Paid' :
                           client.status === 'partial' ? '⚠️ Part' :
                           '⏳ Pend'}
                        </span>
                      </div> */}
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
                        <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.amount)}</p>
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
                        <p className="font-semibold text-base text-[#16423C]">{formatCurrency(FORCED_WEEKLY)}</p>
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
              {activeTab === 'dues' && (
                <div>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Total Loan</p>
                      <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.amount)}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Weekly</p>
                      <p className="font-bold text-base text-[#16423C]">{formatCurrency(FORCED_WEEKLY)}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Paid</p>
                      <p className="font-bold text-base text-green-600">{duePayments.filter(p => p.status === 'paid').length}/12</p>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Weekly Due</p>
                        <p className="font-semibold text-base text-[#16423C]">{formatCurrency(FORCED_WEEKLY)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-[#16423C]">Progress</span>
                      <span className="text-sm text-[#6A9C89]">{duePayments.filter(p => p.status === 'paid').length}/12</span>
                    </div>
                    <div className="h-2 bg-[#C4DAD2] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6A9C89] transition-all duration-500"
                        style={{ width: `${(duePayments.filter(p => p.status === 'paid').length / 12) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 12 Due Payments Table */}
                  <div className="mt-4">
                    <h3 className="text-base font-bold text-[#16423C] mb-2">Payment Schedule</h3>

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
                          </tr>
                        </thead>
                        <tbody>
                          {duePayments.map((payment, index) => (
                            <tr
                              key={payment.id}
                              className={`border-b border-[#C4DAD2] ${index % 2 === 0 ? 'bg-white' : 'bg-[#F5F9F7]'
                                }`}
                            >
                              <td className="p-2 font-medium text-[#16423C]">{payment.id}</td>
                              <td className="p-2">{payment.month}</td>
                              <td className="p-2 text-center font-semibold">{formatCurrency(payment.dueAmount)}</td>
                              <td className="p-2 text-center">
                                <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded ${payment.status === 'paid'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                  }`}>
                                  {payment.status === 'paid' ? '✅' : '⏳'}
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
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className="mt-4 p-3 bg-[#E9EFEC] rounded border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-2 text-base">Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-base">
                      <div>
                        <p className="text-sm text-gray-600">Paid</p>
                        <p className="font-bold text-green-600">{duePayments.filter(p => p.status === 'paid').length}/12</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Amount Paid</p>
                        <p className="font-bold text-green-600 text-sm">{formatCurrency(selectedClient.received || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pending</p>
                        <p className="font-bold text-red-500">{duePayments.filter(p => p.status === 'pending').length}/12</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Amount Due</p>
                        <p className="font-bold text-red-500 text-sm">{formatCurrency((selectedClient.amount || 0) - (selectedClient.received || 0))}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Font Awesome */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
    </div>
  );
};

export default AClientDetails;