// ClientDetails.js
import React, { useState, useEffect } from 'react';
import AgentNavbar from './AgentNavbar';

const ClientDetails = () => {
  const [selectedPhone, setSelectedPhone] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [duePayments, setDuePayments] = useState([]);
  // Fixed weekly amount used across this view
  const FORCED_WEEKLY = 575;
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch all clients on component mount
  useEffect(() => {
    fetchClients();
  }, []);

  // Filter clients based on search term
  useEffect(() => {
    if (clients.length > 0) {
      filterClients();
    }
  }, [searchTerm, clients]);

  // Generate due payments when client is selected
  useEffect(() => {
    if (selectedClient) {
      generateDuePayments(selectedClient);
    }
  }, [selectedClient]);

  const filterClients = () => {
    if (!searchTerm.trim()) {
      setFilteredClients(clients);
      return;
    }

    const searchLower = searchTerm.toLowerCase().trim();
    
    const filtered = clients.filter(client => {
      // Search by name
      const nameMatch = client.name?.toLowerCase().includes(searchLower);
      
      // Search by landmark
      const landmarkMatch = client.landmark?.toLowerCase().includes(searchLower);
      
      // Search by ID (clientId or last 6 digits of _id)
      const clientId = client.clientId || client._id?.slice(-6).toUpperCase();
      const idMatch = clientId?.toLowerCase().includes(searchLower);
      
      // Search by phone (if needed, but you can remove this if you don't want phone search)
      const phoneMatch = client.phone?.toLowerCase().includes(searchLower);
      
      return nameMatch || landmarkMatch || idMatch || phoneMatch;
    });
    
    setFilteredClients(filtered);
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const user = JSON.parse(localStorage.getItem('user'));

      if (!token || !user) {
        alert('Please login again');
        window.location.href = '/';
        return;
      }

      // Use the agent route instead of admin route
      const res = await fetch('http://localhost:5000/api/clients/all', {
        headers: { 
          'Authorization': `Bearer ${token}` 
        }
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      if (res.status === 403) {
        alert('You do not have permission to view clients');
        return;
      }

      const data = await res.json();

      if (data.success) {
        setClients(data.clients || []);
        setFilteredClients(data.clients || []);
      } else {
        alert(data.message || 'Failed to fetch clients');
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      alert('Could not fetch clients. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleAuthError = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    alert('Your session has expired. Please login again.');
    window.location.href = '/';
  };

  const handleClientSelect = (client) => {
    setSelectedClient(client);
    setSelectedPhone(client.phone);
  };

  const handleBackToList = () => {
    setSelectedPhone(null);
    setSelectedClient(null);
    setActiveTab('overview');
    setSearchTerm(''); // Clear search when going back
  };

  // Generate 12 weekly due payments based on client data
  const generateDuePayments = (client) => {
    if (!client) return;

    const payments = [];
    const startDate = client.loan_start_date ? new Date(client.loan_start_date) : new Date();

    // weekly amount forced to ₹575
    const weeklyDue = FORCED_WEEKLY;

    const receivedAmount = client.received || 0;
    const paidWeeksCount = Math.floor(receivedAmount / weeklyDue);

    for (let i = 0; i < 12; i++) {
      const weekStart = new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const weekLabel = `Week ${i + 1} - ${weekStart.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
      const status = i < paidWeeksCount ? 'paid' : 'pending';

      payments.push({
        id: i + 1,
        month: weekLabel,
        dueAmount: weeklyDue,
        status: status,
        paidDate: status === 'paid' ? new Date().toISOString().split('T')[0] : null
      });
    }

    setDuePayments(payments);
  };

  const handlePaymentStatus = (paymentId, newStatus) => {
    setDuePayments(prevPayments =>
      prevPayments.map(payment =>
        payment.id === paymentId
          ? { 
              ...payment, 
              status: newStatus,
              paidDate: newStatus === 'paid' ? new Date().toISOString().split('T')[0] : null
            }
          : payment
      )
    );
  };

  const getInitials = (name) => {
    if (!name) return 'CL';
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || name.substring(0, 2).toUpperCase();
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

  const getStatusBadge = (status) => {
    switch(status) {
      case 'paid': return '✅ Paid';
      case 'partial': return '⚠️ Partial';
      case 'pending': return '⏳ Pending';
      default: return status;
    }
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'partial': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'pending': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const calculateTotalStats = () => {
    if (!selectedClient) return {
      totalAmount: 0,
      weeklyDue: FORCED_WEEKLY,
      paidWeeks: 0,
      pendingWeeks: 12,
      totalPaid: 0,
      totalPending: 0
    };

    const paidWeeks = duePayments.filter(p => p.status === 'paid').length;
    const weeklyDue = FORCED_WEEKLY;
    const totalPaid = paidWeeks * weeklyDue;
    const totalPending = (12 - paidWeeks) * weeklyDue;

    return {
      totalAmount: selectedClient.amount || 0,
      weeklyDue: weeklyDue,
      paidWeeks: paidWeeks,
      pendingWeeks: 12 - paidWeeks,
      totalPaid: totalPaid,
      totalPending: totalPending
    };
  };

  const stats = calculateTotalStats();

  // Clear search function
  const clearSearch = () => {
    setSearchTerm('');
  };

  return (
    <div className="min-h-screen bg-[#E9EFEC] font-sans">
      <AgentNavbar />

      <div className="pt-24 pb-10 max-w-[1300px] mx-auto px-4">
        
        {/* Client List View */}
        {!selectedPhone && (
          <div>
            {/* Header with Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
              <div>
                <h1 className="text-3xl font-bold text-[#16423C]">Clients</h1>
                <p className="text-gray-600">Click on a client to view complete details</p>
              </div>
              
              {/* Search Bar */}
              <div className="w-full md:w-96">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name, landmark, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-white border-2 border-[#16423C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#16423C] focus:border-transparent shadow-sm"
                  />
                  <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[#6A9C89]"></i>
                  {searchTerm && (
                    <button
                      onClick={clearSearch}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#16423C] transition-colors"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>
                
                {/* Search Results Count */}
                {searchTerm && (
                  <p className="text-sm text-gray-500 mt-2">
                    Found {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#16423C] border-t-transparent"></div>
                <p className="mt-4 text-gray-600 font-medium">Loading clients...</p>
              </div>
            )}

            {/* Client Grid */}
            {!loading && (
              <>
                {filteredClients.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-xl">
                    {searchTerm ? (
                      <>
                        <i className="fas fa-search text-5xl text-gray-300 mb-4"></i>
                        <p className="text-gray-500 text-lg">No clients found matching "{searchTerm}"</p>
                        <button
                          onClick={clearSearch}
                          className="mt-4 text-[#16423C] hover:underline font-medium"
                        >
                          Clear search
                        </button>
                      </>
                    ) : (
                      <p className="text-gray-500 text-lg">No clients found</p>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map((client) => (
                      <div
                        key={client._id}
                        onClick={() => handleClientSelect(client)}
                        className="bg-white rounded-xl p-5 shadow-md cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg border-2 border-transparent hover:border-[#6A9C89] flex items-center gap-4"
                      >
                        <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg bg-[#6A9C89] border-2 border-[#C4DAD2]">
                          {getInitials(client.name)}
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-[#16423C] mb-1">{client.name || 'Unnamed'}</h4>
                          <p className="text-sm text-gray-500">ID: {client.clientId || client._id?.slice(-6).toUpperCase()}</p>
                          {client.landmark && (
                            <p className="text-xs text-gray-400 mt-1">
                              <i className="fas fa-map-marker-alt mr-1 text-[#6A9C89]"></i>
                              {client.landmark}
                            </p>
                          )}
                        </div>
                        <i className="fas fa-chevron-right text-[#6A9C89]"></i>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Client Details View */}
        {selectedPhone && selectedClient && (
          <div className="bg-white rounded-xl p-6 md:p-8 shadow-xl mt-4">
            
            {/* Back Button */}
            <button 
              onClick={handleBackToList}
              className="flex items-center gap-2 text-[#16423C] font-semibold mb-6 hover:text-[#6A9C89] transition-colors group"
            >
              <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
              Back to Client List
            </button>

            {/* Client Profile Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6 mb-8">
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-2xl bg-[#6A9C89] border-4 border-[#C4DAD2]">
                {getInitials(selectedClient.name)}
              </div>
              
              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold text-[#16423C] mb-2">
                      {selectedClient.name || 'Unnamed Client'}
                    </h2>
                    <p className="text-gray-600 mb-2">
                      <i className="fas fa-id-card text-[#6A9C89] mr-2"></i>
                      Client ID: {selectedClient.clientId || selectedClient._id?.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-gray-600">
                      <i className="fas fa-phone-alt text-[#6A9C89] mr-2"></i>
                      {selectedClient.phone || 'No phone'}
                    </p>
                  </div>
                  <span className={`inline-block px-4 py-2 rounded-full font-semibold ${getStatusClass(selectedClient.status)}`}>
                    {getStatusBadge(selectedClient.status)}
                  </span>
                </div>
              </div>
            </div>

            {/* No Action Buttons - Removed completely */}

            {/* Tabs */}
            <div className="border-b border-[#C4DAD2] mb-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-5 py-3 font-semibold capitalize transition-all relative ${
                    activeTab === 'overview' 
                      ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]' 
                      : 'text-gray-500 hover:text-[#6A9C89]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('dues')}
                  className={`px-5 py-3 font-semibold capitalize transition-all relative ${
                    activeTab === 'dues' 
                      ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]' 
                      : 'text-gray-500 hover:text-[#6A9C89]'
                  }`}
                >
                  12 Weeks Dues (₹575/week)
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="min-h-[400px]">
              {/* Overview Tab - Only Personal Info and Address Details */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Personal Information */}
                  <div className="bg-[#E9EFEC] p-5 rounded-lg border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-4 flex items-center gap-2">
                      <i className="fas fa-user-circle"></i>
                      Personal Information
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Full Name</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Husband Name</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.husband_name || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Phone Number</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.phone || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Client ID</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.clientId || selectedClient._id?.slice(-6).toUpperCase()}</p>
                      </div>
                    </div>
                  </div>

                  {/* Address Details with Landmark */}
                  <div className="bg-[#E9EFEC] p-5 rounded-lg border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-4 flex items-center gap-2">
                      <i className="fas fa-map-marker-alt"></i>
                      Address Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-600 mb-1">Full Address</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.address || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Landmark</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.landmark || '—'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">District</p>
                        <p className="font-semibold text-[#16423C]">{selectedClient.district || '—'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Loan Summary - Only Received and Pending (No Total Amount) */}
                  <div className="bg-[#E9EFEC] p-4 rounded-lg border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-2 flex items-center gap-2">
                      <i className="fas fa-coins"></i>
                      Loan Summary
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-center">
                      {/* Total Amount field is REMOVED completely - not even commented */}
                      <div>
                        <p className="text-xs text-gray-600">Received</p>
                        <p className="font-bold text-green-600">{formatCurrency(selectedClient.received)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600">Pending</p>
                        <p className="font-bold text-red-500">{formatCurrency(selectedClient.pending)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Nominee Information - REMOVED */}
                  {/* Notes - REMOVED */}
                </div>
              )}

              {/* 12 Weeks Dues Tab - Weekly amount set to ₹575 */}
              {activeTab === 'dues' && (
                <div>
                  {/* Summary Stats - Without Total Loan */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    {/* Total Loan field is REMOVED completely - not even commented */}
                    <div className="bg-[#E9EFEC] p-4 rounded-lg border border-[#C4DAD2] text-center">
                      <p className="text-xs text-gray-600 mb-1">Weekly Due</p>
                      <p className="text-lg font-bold text-[#16423C]">{formatCurrency(FORCED_WEEKLY)}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-4 rounded-lg border border-[#C4DAD2] text-center">
                      <p className="text-xs text-gray-600 mb-1">Paid Weeks</p>
                      <p className="text-lg font-bold text-green-600">{stats.paidWeeks}/12</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-4 rounded-lg border border-[#C4DAD2] text-center">
                      <p className="text-xs text-gray-600 mb-1">Pending Weeks</p>
                      <p className="text-lg font-bold text-red-500">{stats.pendingWeeks}/12</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-8">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-semibold text-[#16423C]">12 Weeks Progress</span>
                      <span className="text-sm font-semibold text-[#6A9C89]">{stats.paidWeeks}/12 Weeks Paid</span>
                    </div>
                    <div className="h-3 bg-[#C4DAD2] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#6A9C89] rounded-full transition-all duration-500"
                        style={{ width: `${(stats.paidWeeks / 12) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* 12 Due Payments Table */}
                  <div className="mt-8">
                    <h3 className="text-xl font-bold text-[#16423C] mb-4">
                      12 Weeks Due Payments (₹575 per week)
                    </h3>
                    
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#16423C] text-white">
                            <th className="p-3 text-left rounded-tl-lg">#</th>
                            <th className="p-3 text-left">Week</th>
                            <th className="p-3 text-left">Due Amount</th>
                            <th className="p-3 text-left">Status</th>
                            <th className="p-3 text-left">Paid Date</th>
                            <th className="p-3 text-left rounded-tr-lg">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {duePayments.map((payment, index) => (
                            <tr 
                              key={payment.id} 
                              className={`border-b border-[#C4DAD2] hover:bg-[#E9EFEC] ${
                                index % 2 === 0 ? 'bg-white' : 'bg-[#F5F9F7]'
                              }`}
                            >
                              <td className="p-3 font-medium text-[#16423C]">{payment.id}</td>
                              <td className="p-3 font-medium">{payment.month}</td>
                              <td className="p-3 font-semibold">{formatCurrency(payment.dueAmount)}</td>
                              <td className="p-3">
                                <span className={`inline-block text-xs font-semibold px-3 py-1.5 rounded-full ${getStatusClass(payment.status)}`}>
                                  {payment.status === 'paid' ? '✅ Paid' : '⏳ Pending'}
                                </span>
                              </td>
                              <td className="p-3">
                                {payment.paidDate ? formatDate(payment.paidDate) : '—'}
                              </td>
                              <td className="p-3">
                                {payment.status === 'pending' ? (
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handlePaymentStatus(payment.id, 'paid')}
                                      className="bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-green-600 transition-all flex items-center gap-1"
                                    >
                                      <i className="fas fa-check"></i>
                                      Paid
                                    </button>
                                    <button
                                      onClick={() => handlePaymentStatus(payment.id, 'cancelled')}
                                      className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-600 transition-all flex items-center gap-1"
                                    >
                                      <i className="fas fa-times"></i>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handlePaymentStatus(payment.id, 'pending')}
                                    className="bg-red-500 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-600 transition-all flex items-center gap-1"
                                  >
                                    <i className="fas fa-times"></i>
                                    Cancel
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payment Summary - Without Total Amount */}
                  <div className="mt-6 p-4 bg-[#E9EFEC] rounded-lg border border-[#C4DAD2]">
                    <h4 className="font-semibold text-[#16423C] mb-3">Summary</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Paid Months</p>
                        <p className="text-xl font-bold text-green-600">{stats.paidMonths} / 12</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Paid Amount</p>
                        <p className="text-xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Pending Months</p>
                        <p className="text-xl font-bold text-red-500">{stats.pendingMonths} / 12</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Total Pending</p>
                        <p className="text-xl font-bold text-red-500">{formatCurrency(stats.totalPending)}</p>
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

export default ClientDetails;