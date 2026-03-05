// ClientDetails.js (Agent Component)
import React, { useState, useEffect } from 'react';
import AgentNavbar from './AgentNavbar';

const ClientDetails = () => {
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
  const [duePayments, setDuePayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch clients from API using manager-accessible endpoint
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setLoading(true);
        
        // Use test endpoint (no auth required)
        const response = await fetch('http://localhost:5000/api/clients/test/all', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch clients (${response.status})`);
        }

        const data = await response.json();
        const clientsList = data.clients || [];
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
      setSelectedLandmark('');
    } else {
      setLandmarks([]);
      setSelectedLandmark('');
    }
  }, [selectedDistrict, clients]);

  // Filter clients based on search, district, and landmark
  const filteredClients = clients.filter(client => {
    const matchesSearch = (client.name && client.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                         (client.phone && client.phone.includes(searchQuery)) ||
                         (client.clientId && client.clientId.includes(searchQuery));
    
    const matchesDistrict = !selectedDistrict || client.district === selectedDistrict;
    const matchesLandmark = !selectedLandmark || client.landmark === selectedLandmark;
    
    return matchesSearch && matchesDistrict && matchesLandmark;
  });

  // Fetch payment history from backend
  const fetchPaymentHistory = async (clientId, clientData = null) => {
    if (!clientId) return [];
    
    try {
      setPaymentsLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/payments/history?clientId=${clientId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        console.error('Failed to fetch payment history');
        return [];
      }

      const data = await res.json();
      const paymentRecords = data.data?.payments || [];

      // Use clientData if provided, otherwise find client from clients list
      const clientForCalculation = clientData || clients.find(c => c._id === clientId);
      
      if (!clientForCalculation) {
        console.error('No client data available for payment calculation');
        return [];
      }

      // Transform payment records to table format
      const transformedPayments = paymentRecords.map((payment, index) => {
        // Calculate week number based on loan start date
        let weekNumber = index + 1; // Default to index-based
        if (clientForCalculation.loan_start_date) {
          const loanStartDate = new Date(clientForCalculation.loan_start_date);
          const paymentDate = new Date(payment.paymentDate || payment.createdAt || payment.date);
          const diffTime = Math.abs(paymentDate - loanStartDate);
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          weekNumber = Math.ceil(diffDays / 7) || index + 1;
        }

        // Calculate next due date (7 days after payment)
        const paymentDate = new Date(payment.paymentDate || payment.createdAt || payment.date);
        const nextDueDate = new Date(paymentDate);
        nextDueDate.setDate(nextDueDate.getDate() + 7);

        return {
          id: index + 1,
          month: new Date(payment.paymentDate || payment.createdAt || payment.date).toLocaleString('en-IN', { month: 'short' }),
          year: new Date(payment.paymentDate || payment.createdAt || payment.date).getFullYear(),
          dueAmount: payment.amount || payment.dueAmount || 0,
          status: 'paid',
          paidDate: new Date(payment.paymentDate || payment.createdAt || payment.date).toISOString().split('T')[0],
          paymentId: payment._id,
          fullDate: payment.paymentDate || payment.createdAt || payment.date,
          weekNumber: weekNumber,
          nextDueDate: nextDueDate.toISOString(),
          collectedBy: payment.collectedStaff || payment.agent?.name || payment.agent?.username || payment.collectedBy || 'N/A',
          agentId: payment.agent?._id || payment.agentId,
          paymentMethod: payment.paymentMethod || 'Cash',
          transactionId: payment.transactionId || 'N/A'
        };
      });

      // Sort payments by date (oldest first to maintain week order)
      transformedPayments.sort((a, b) => new Date(a.fullDate) - new Date(b.fullDate));
      
      // Re-assign sequential IDs based on sorted order
      transformedPayments.forEach((payment, index) => {
        payment.id = index + 1;
        payment.weekNumber = index + 1; // Ensure week numbers are sequential
      });

      return transformedPayments;
    } catch (error) {
      console.error('Error fetching payment history:', error);
      return [];
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Handle cancel payment - reverse the payment and update client record
  const handleCancelPayment = async (paymentId, paymentAmount, clientId) => {
    try {
      const token = localStorage.getItem('token');
      
      // Call backend to delete payment and update client
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

      // Clear localStorage markers so buttons re-enable in MDailyDues
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
        localStorage.removeItem(`pushedNotPaid_${clientId}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      // Extend loan_end_date by 7 days since payment is cancelled
      const currentEndDate = selectedClient.loan_end_date ? new Date(selectedClient.loan_end_date) : null;
      let newEndDate;
      if (currentEndDate && !isNaN(currentEndDate)) {
        newEndDate = new Date(currentEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (selectedClient.loan_start_date) {
        const start = new Date(selectedClient.loan_start_date);
        newEndDate = new Date(start.getTime() + 13 * 7 * 24 * 60 * 60 * 1000); // push to 13 weeks
      }

      // Update client loan_end_date in backend
      if (newEndDate) {
        const updateRes = await fetch(`http://localhost:5000/api/clients/${clientId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ loan_end_date: newEndDate.toISOString() })
        });

        if (!updateRes.ok) {
          console.error('Failed to update loan end date');
        }
      }

      // Update client in local state
      const updatedReceived = (selectedClient.received || 0) - paymentAmount;
      const updatedPending = (selectedClient.amount || 0) - updatedReceived;
      
      setSelectedClient(prev => ({
        ...prev,
        received: updatedReceived,
        pending: updatedPending,
        loan_end_date: newEndDate ? newEndDate.toISOString() : prev.loan_end_date,
        status: updatedPending <= 0 ? 'paid' : updatedReceived > 0 ? 'partial' : 'pending'
      }));

      // Also update in clients list
      setClients(prevClients => 
        prevClients.map(client => 
          client._id === clientId 
            ? { 
                ...client, 
                received: updatedReceived,
                pending: updatedPending,
                loan_end_date: newEndDate ? newEndDate.toISOString() : client.loan_end_date,
                status: updatedPending <= 0 ? 'paid' : updatedReceived > 0 ? 'partial' : 'pending'
              }
            : client
        )
      );

      // Refresh payment history
      const updatedPayments = await fetchPaymentHistory(clientId, selectedClient);
      setDuePayments(updatedPayments);
      setRefreshTrigger(prev => prev + 1);

      // Show success message
      alert('Payment cancelled successfully. Due extended by 1 week and buttons re-enabled');
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert(`Failed to cancel payment: ${error.message}`);
    }
  };

  // Update due payments when selected client changes or tab changes to dues
  useEffect(() => {
    const loadPayments = async () => {
      if (selectedClient && selectedClient._id && activeTab === 'dues') {
        const payments = await fetchPaymentHistory(selectedClient._id, selectedClient);
        setDuePayments(payments);
      }
    };
    
    loadPayments();
  }, [selectedClient?._id, activeTab, refreshTrigger]); // Added refreshTrigger dependency

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

  const formatDateTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Handle client selection
  const handleClientSelect = (client) => {
    setSelectedClientId(client._id);
    setSelectedClient(client);
    setDuePayments([]); // Clear previous payments
    setActiveTab('overview'); // Reset to overview tab
  };

  // Handle back button
  const handleBack = () => {
    setSelectedClientId(null);
    setSelectedClient(null);
    setDuePayments([]);
    setActiveTab('overview');
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
                <p className="text-sm text-emerald-100">View and manage client details</p>
              </div>
              
            {/* Search and Filters Section */}
            <div className="bg-white/90 backdrop-blur-lg rounded-lg p-3 mt-4">

              {/* Search and Filters */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                <div className="md:col-span-2">
                  <input
                    type="text"
                    placeholder="Search by name, phone, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border-2 border-[#16423C]/20 focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm"
                  />
                </div>

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
                <p className="text-sm"><strong>Error:</strong> {error}</p>
              </div>
            )}

            {/* Client Grid - 5 columns */}
            {!loading && filteredClients.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {filteredClients.map((client) => (
                  <div
                    key={client._id}
                    onClick={() => handleClientSelect(client)}
                    className="bg-white rounded-lg p-3 shadow cursor-pointer transition-all duration-300 hover:shadow-lg border-2 border-[#16423C]/20 hover:border-[#16423C]/50 group"
                  >
                    <div className="flex flex-col items-center text-center">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm bg-[#6A9C89] border-2 border-[#C4DAD2] mb-2 group-hover:bg-[#5a8b79] transition-colors">
                        {client.name ? client.name.substring(0, 2).toUpperCase() : 'CL'}
                      </div>
                      <h4 className="text-md font-bold text-[#16423C] mb-1 line-clamp-2 leading-tight">{client.name}</h4>
                      <p className="text-md text-gray-500 mb-1 truncate">ID: {client.clientId || 'N/A'}</p>
                      <p className="text-md text-gray-400 truncate">{client.phone}</p>
                      <div className={`mt-2 text-xs px-2 py-1 rounded-full ${
                        client.status === 'paid' ? 'bg-green-100 text-green-800' :
                        client.status === 'partial' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {client.status || 'pending'}
                      </div>
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
            
            <button 
              onClick={handleBack}
              className="flex items-center gap-2 text-[#16423C] font-semibold mb-4 hover:text-[#6A9C89] transition-colors group text-base"
            >
              <i className="fas fa-arrow-left group-hover:-translate-x-1 transition-transform"></i>
              Back to Clients List
            </button>

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
                    <p className="text-sm text-gray-500">
                      <i className="fas fa-id-card text-[#6A9C89] mr-2"></i>
                      Client ID: {selectedClient.clientId || 'N/A'}
                    </p>
                  </div>
                  <span className={`inline-block px-3 py-1 rounded text-base font-semibold text-white ${
                    selectedClient.status === 'paid' ? 'bg-green-500' :
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

            <div className="border-b border-[#C4DAD2] mb-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 font-semibold text-base capitalize transition-all relative ${
                    activeTab === 'overview' 
                      ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]' 
                      : 'text-gray-500 hover:text-[#6A9C89]'
                  }`}
                >
                  Overview
                </button>
                <button
                  onClick={() => setActiveTab('dues')}
                  className={`px-4 py-2 font-semibold text-base capitalize transition-all relative ${
                    activeTab === 'dues' 
                      ? 'text-[#16423C] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#16423C]' 
                      : 'text-gray-500 hover:text-[#6A9C89]'
                  }`}
                >
                  Payment History {duePayments.length > 0 && `(${duePayments.length})`}
                </button>
              </div>
            </div>

            <div className="min-h-[400px]">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
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

                  {/* <div className="bg-[#E9EFEC] p-4 rounded border border-[#C4DAD2]">
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
                        <p className="font-semibold text-base text-[#16423C]">{formatCurrency(selectedClient.weekly_amount || selectedClient.weekly_due || (selectedClient.amount === 5000 ? 575 : ((selectedClient.amount || 0) / 12)))}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Status</p>
                        <span className={`inline-block px-2 py-0.5 rounded text-sm font-semibold text-white ${
                          selectedClient.status === 'paid' ? 'bg-green-500' :
                          selectedClient.status === 'partial' ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}>
                          {selectedClient.status === 'paid' ? '✅ Paid' :
                           selectedClient.status === 'partial' ? '⚠️ Partial' :
                           '⏳ Pending'}
                        </span>
                      </div>
                    </div>
                  </div> */}

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

              {/* Payment History Tab */}
              {activeTab === 'dues' && (
                <div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Total Loan</p>
                      <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.amount)}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Weekly Due</p>
                      <p className="font-bold text-base text-[#16423C]">{formatCurrency(selectedClient.weekly_amount || selectedClient.weekly_due || (selectedClient.amount === 5000 ? 575 : ((selectedClient.amount || 0) / 12)))}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Paid Weeks</p>
                      <p className="font-bold text-base text-green-600">{duePayments.length}</p>
                    </div>
                    <div className="bg-[#E9EFEC] p-3 rounded border border-[#C4DAD2] text-center">
                      <p className="text-sm text-gray-600 mb-1">Remaining</p>
                      <p className="font-bold text-base text-red-500">{Math.max(0, 12 - duePayments.length)}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-semibold text-[#16423C]">Progress</span>
                      <span className="text-sm text-[#6A9C89]">{duePayments.length}/12 weeks</span>
                    </div>
                    <div className="h-2 bg-[#C4DAD2] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#6A9C89] transition-all duration-500"
                        style={{ width: `${(duePayments.length / 12) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <h3 className="text-base font-bold text-[#16423C] mb-2">Payment History</h3>
                    
                    {paymentsLoading ? (
                      <div className="flex justify-center items-center py-8">
                        <div className="text-center">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#6A9C89]"></div>
                          <p className="mt-2 text-gray-600">Loading payments...</p>
                        </div>
                      </div>
                    ) : duePayments.length === 0 ? (
                      <div className="p-8 bg-[#E9EFEC] rounded border border-[#C4DAD2] text-center">
                        <i className="fas fa-credit-card text-gray-400 text-3xl mb-3"></i>
                        <p className="text-base text-gray-600">No payments recorded yet for this client</p>
                        <p className="text-sm text-gray-500 mt-1">Payments will appear here once collected</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#16423C] text-white">
                              <th className="p-2 text-left">#</th>
                              <th className="p-2 text-left">Week</th>
                              <th className="p-2 text-left">Collected By</th>
                              {/* payment method column removed */}
                              <th className="p-2 text-right">Amount</th>
                              <th className="p-2 text-left">Date & Time</th>
                              <th className="p-2 text-center">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {duePayments.map((payment, index) => (
                              <tr 
                                key={payment.paymentId || payment.id || index} 
                                className={`border-b border-[#C4DAD2] ${
                                  index % 2 === 0 ? 'bg-white' : 'bg-[#F5F9F7]'
                                } hover:bg-[#E9EFEC] transition-colors`}
                              >
                                <td className="p-2 font-medium text-[#16423C]">{payment.id}</td>
                                <td className="p-2">
                                  <span className="font-semibold text-[#16423C] bg-[#C4DAD2] px-2 py-1 rounded">
                                    Week {payment.weekNumber}
                                  </span>
                                </td>
                                <td className="p-2">
                                  <div className="flex items-center">
                                    <i className="fas fa-user-circle text-[#6A9C89] mr-1"></i>
                                    <span className="text-sm text-[#6A9C89] font-semibold">
                                      {payment.collectedBy}
                                    </span>
                                  </div>
                                </td>
                                {/* payment method cell removed */}
                                <td className="p-2 text-right font-semibold text-[#16423C]">
                                  {formatCurrency(payment.dueAmount)}
                                </td>
                                <td className="p-2">
                                  <div className="text-sm">
                                    {new Date(payment.fullDate).toLocaleDateString('en-IN', { 
                                      day: 'numeric', 
                                      month: 'short', 
                                      year: 'numeric' 
                                    })}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(payment.fullDate).toLocaleTimeString('en-IN', { 
                                      hour: '2-digit', 
                                      minute: '2-digit' 
                                    })}
                                  </div>
                                </td>
                                <td className="p-2 text-center">
                                  <button
                                    onClick={() => {
                                      if (window.confirm('Are you sure you want to cancel this payment? This will reverse the transaction and extend the loan by 1 week.')) {
                                        handleCancelPayment(payment.paymentId, payment.dueAmount, selectedClient._id);
                                      }
                                    }}
                                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold transition-all active:scale-95 shadow-sm hover:shadow"
                                  >
                                    Cancel
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {duePayments.length > 0 && (
                    <div className="mt-6 p-4 bg-[#E9EFEC] rounded border border-[#C4DAD2]">
                      <h4 className="font-semibold text-[#16423C] mb-3 text-base">Payment Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white p-2 rounded">
                          <p className="text-xs text-gray-600">Total Weeks Paid</p>
                          <p className="font-bold text-green-600">{duePayments.length} weeks</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-xs text-gray-600">Amount Paid</p>
                          <p className="font-bold text-green-600">{formatCurrency(duePayments.reduce((sum, p) => sum + (p.dueAmount || 0), 0))}</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-xs text-gray-600">Remaining Weeks</p>
                          <p className="font-bold text-red-500">{Math.max(0, 12 - duePayments.length)} weeks</p>
                        </div>
                        <div className="bg-white p-2 rounded">
                          <p className="text-xs text-gray-600">Amount Due</p>
                          <p className="font-bold text-red-500">{formatCurrency((selectedClient.amount || 0) - (selectedClient.received || 0))}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <link 
        rel="stylesheet" 
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" 
      />
    </div>
  );
};

export default ClientDetails;