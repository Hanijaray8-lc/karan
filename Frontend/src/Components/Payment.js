// Payment.js - Updated with API integration
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AgentNavbar from './AgentNavbar';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [activeFilter, setActiveFilter] = useState('All');
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalClients: 0,
    totalDue: 0,
    averageDue: 0
  });
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [showCancelConfirmModal, setShowCancelConfirmModal] = useState(false);
  const [cancelPaymentData, setCancelPaymentData] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user) {
      setUserName(user.name || user.username || 'Agent');
    }
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/payments', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setPayments(response.data.data.clients);
        setFilteredPayments(response.data.data.clients);
        setStats(response.data.data.stats);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
      alert('Could not fetch payments');
    } finally {
      setLoading(false);
    }
  };

  // Filter by search
  useEffect(() => {
    let filtered = payments;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = payments.filter(p =>
        p.name.toLowerCase().includes(query) ||
        p.phone.includes(query)
      );
    }

    if (activeFilter !== 'All') {
      filtered = filtered.filter(p =>
        p.status.toLowerCase() === activeFilter.toLowerCase()
      );
    }

    setFilteredPayments(filtered);
  }, [searchQuery, payments, activeFilter]);

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : 'U';
  };

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'paid': return 'bg-green-100 text-green-800 border-green-200';
      case 'partial': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusBadgeColor = (status) => {
    switch (status.toLowerCase()) {
      case 'pending': return 'bg-[#ffe8b3] text-[#7a5a00]';
      case 'paid': return 'bg-[#d4f3e5] text-[#0f5132]';
      case 'partial': return 'bg-[#d7eef6] text-[#055160]';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatAmount = (amount) => {
    return '₹' + Number(amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const handleClientClick = (client) => {
    setSelectedClient(client);
    setTotalAmount(client.pending);
    setSelectedAmount(client.pending * 0.5); // Default 50%
    setPaymentMethod('cash');
    setNotes('');
    setShowModal(true);
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedClient(null);
    document.body.style.overflow = 'auto';
  };

  const handlePaymentOption = (option) => {
    switch (option) {
      case 'MIN':
        setSelectedAmount(totalAmount * 0.2);
        break;
      case '50%':
        setSelectedAmount(totalAmount * 0.5);
        break;
      case 'FULL':
        setSelectedAmount(totalAmount);
        break;
      case 'OTHER':
        // Will be handled by input
        break;
      default:
        break;
    }
  };

  const handleOtherAmountChange = (e) => {
    let val = parseFloat(e.target.value) || 0;
    if (val > totalAmount) val = totalAmount;
    if (val < 0) val = 0;
    setSelectedAmount(val);
  };

  const handleConfirmPayment = async () => {
    if (!selectedClient || selectedAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (selectedAmount > totalAmount) {
      alert(`Amount cannot exceed pending amount (${formatAmount(totalAmount)})`);
      return;
    }

    setProcessing(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:5000/api/payments/process', {
        clientId: selectedClient._id,
        amount: selectedAmount,
        paymentMethod,
        notes
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        alert(`Payment of ${formatAmount(selectedAmount)} successful!`);
        await fetchPayments(); // Refresh data
        closeModal();
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert(error.response?.data?.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Open cancel confirmation modal
  const openCancelConfirmModal = (payment) => {
    setCancelPaymentData(payment);
    setShowCancelConfirmModal(true);
  };

  // Close cancel confirmation modal
  const closeCancelConfirmModal = () => {
    setShowCancelConfirmModal(false);
    setCancelPaymentData(null);
  };

  // Handle cancel payment - extend client's loan by 1 week
  const handleConfirmCancelPayment = async () => {
    if (!selectedClient) {
      showNotification('No client selected', 'error');
      return;
    }

    setProcessing(true);
    closeCancelConfirmModal();

    try {
      const token = localStorage.getItem('token');
      const clientId = selectedClient._id;

      // Extend loan_end_date by 7 days
      const currentEndDate = selectedClient.loan_end_date ? new Date(selectedClient.loan_end_date) : null;
      let newEndDate;

      if (currentEndDate && !isNaN(currentEndDate)) {
        newEndDate = new Date(currentEndDate.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (selectedClient.loan_start_date) {
        const start = new Date(selectedClient.loan_start_date);
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

      if (!updateRes.ok) {
        const errorData = await updateRes.json();
        throw new Error(errorData.message || 'Failed to update loan end date');
      }

      // Clear localStorage markers for this client
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
        localStorage.removeItem(`pushedNotPaid_${clientId}`);
      } catch (e) {
        console.error('Error clearing localStorage:', e);
      }

      // Compute new total weeks locally to keep UI in sync
      let updatedTotalWeeks = selectedClient.total_weeks || 0;
      if (newEndDate && selectedClient.loan_start_date) {
        const start = new Date(selectedClient.loan_start_date);
        const end = new Date(newEndDate);
        const durationDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
        updatedTotalWeeks = Math.max(1, Math.round(durationDays / 7));
      }

      // Update selectedClient
      const updatedClient = {
        ...selectedClient,
        loan_end_date: newEndDate.toISOString(),
        total_weeks: updatedTotalWeeks
      };

      setSelectedClient(updatedClient);

      // Update in payments list
      setPayments(prevPayments =>
        prevPayments.map(p =>
          p._id === clientId
            ? {
              ...p,
              loan_end_date: newEndDate.toISOString(),
              total_weeks: updatedTotalWeeks
            }
            : p
        )
      );

      // Update filtered payments as well
      setFilteredPayments(prevFiltered =>
        prevFiltered.map(p =>
          p._id === clientId
            ? {
              ...p,
              loan_end_date: newEndDate.toISOString(),
              total_weeks: updatedTotalWeeks
            }
            : p
        )
      );

      showNotification('Due extended successfully! Loan extended by 1 week', 'success');
    } catch (error) {
      console.error('Error extending due:', error);
      showNotification(`Failed to extend due: ${error.message}`, 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#E9EFEC] font-sans">
      {/* Agent Navbar */}
      <AgentNavbar />

      {/* Page Header */}
      <div className="bg-[#16423C] text-white px-4 py-5 rounded-b-2xl shadow-md mt-20">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div>
            <h4 className="text-lg font-semibold">
              <i className="fas fa-money-check-dollar mr-2"></i>
              Payments Collection
            </h4>
            <p className="text-sm text-emerald-100 mt-1">
              Total Due: {formatAmount(stats.totalDue)} |
              Clients: {stats.totalClients}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-11 h-11 rounded-full bg-[#6A9C89] flex items-center justify-center font-semibold text-white">
              {getInitials(userName)}
            </div>
            <span className="font-bold">{userName}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column - Client List */}
          <div className="lg:w-2/3">
            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveFilter('All')}
                  className={`px-5 py-2 rounded-full border transition-all ${activeFilter === 'All'
                      ? 'bg-[#16423C] text-white border-[#16423C]'
                      : 'border-[#6A9C89] text-[#16423C] hover:bg-[#16423C] hover:text-white'
                    }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveFilter('Pending')}
                  className={`px-5 py-2 rounded-full border transition-all ${activeFilter === 'Pending'
                      ? 'bg-[#16423C] text-white border-[#16423C]'
                      : 'border-[#6A9C89] text-[#16423C] hover:bg-[#16423C] hover:text-white'
                    }`}
                >
                  Pending
                </button>
                <button
                  onClick={() => setActiveFilter('Partial')}
                  className={`px-5 py-2 rounded-full border transition-all ${activeFilter === 'Partial'
                      ? 'bg-[#16423C] text-white border-[#16423C]'
                      : 'border-[#6A9C89] text-[#16423C] hover:bg-[#16423C] hover:text-white'
                    }`}
                >
                  Partial
                </button>
              </div>
              <div className="flex-1 flex items-center bg-white rounded-full px-4 py-2 border border-[#C4DAD2]">
                <i className="fas fa-search text-gray-400 mr-2"></i>
                <input
                  type="text"
                  placeholder="Search name or phone"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full outline-none bg-transparent"
                />
              </div>
            </div>

            {/* Header */}
            <div className="flex justify-between items-center mb-3">
              <h6 className="font-semibold text-[#16423C]">DUE PAYMENTS</h6>
              <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm">
                {filteredPayments.length} Results
              </span>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-12">
                <div className="w-10 h-10 border-4 border-[#C4DAD2] border-t-[#16423C] rounded-full animate-spin mx-auto mb-3"></div>
                <p className="text-[#6A9C89]">Loading payments...</p>
              </div>
            )}

            {/* Payment Items */}
            {!loading && filteredPayments.map((payment) => (
              <div
                key={payment._id}
                onClick={() => handleClientClick(payment)}
                className="bg-white rounded-xl mb-3 shadow-sm hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-[#6A9C89] group"
              >
                <div className="p-4 relative">
                  {/* Status Badge */}
                  <span className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeColor(payment.status)}`}>
                    {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                  </span>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                    {/* Client Info */}
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-12 h-12 rounded-full bg-[#6A9C89] flex items-center justify-center font-bold text-white text-lg">
                        {getInitials(payment.name)}
                      </div>
                      <div>
                        <strong className="text-[#16423C] text-lg">{payment.name}</strong>
                        <br />
                        <small className="text-gray-500">{payment.phone}</small>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
                            Due: {payment.duePercentage}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="sm:ml-auto text-right">
                      <div className="font-bold text-xl text-[#16423C]">
                        {formatAmount(payment.pending)}
                      </div>
                      <small className="text-gray-500">
                        of {formatAmount(payment.amount)}
                      </small>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 w-full bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-[#16423C] h-1.5 rounded-full"
                      style={{ width: `${100 - payment.duePercentage}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}

            {/* Empty State */}
            {!loading && filteredPayments.length === 0 && (
              <div className="text-center py-16 bg-white rounded-xl">
                <i className="fas fa-credit-card text-5xl text-[#C4DAD2] mb-4"></i>
                <h5 className="text-xl font-semibold text-[#16423C] mb-2">No Due Payments</h5>
                <p className="text-gray-500">All clients have cleared their dues</p>
              </div>
            )}
          </div>

          {/* Right Column - Payment Modal (Desktop) */}
          <div className="hidden lg:block lg:w-1/3">
            {selectedClient ? (
              <div className="bg-white rounded-xl shadow-xl p-6 sticky top-24">
                <h5 className="text-xl font-bold text-[#16423C] mb-1">{selectedClient.name}</h5>
                <p className="text-gray-500 mb-2">{selectedClient.phone}</p>

                {/* Due Info */}
                <div className="bg-yellow-50 p-3 rounded-lg mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Amount:</span>
                    <span className="font-semibold">{formatAmount(selectedClient.amount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Received:</span>
                    <span className="font-semibold text-green-600">{formatAmount(selectedClient.received)}</span>
                  </div>
                  <div className="flex justify-between items-center text-lg font-bold mt-2 pt-2 border-t">
                    <span>Pending Due:</span>
                    <span className="text-red-600">{formatAmount(totalAmount)}</span>
                  </div>
                </div>

                <div className="text-center my-4">
                  <div className="text-4xl font-bold text-[#16423C]">
                    {formatAmount(selectedAmount)}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">Payment Amount</p>
                </div>

                {/* Payment Options */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {['MIN', '50%', 'FULL', 'OTHER'].map((option) => (
                    <button
                      key={option}
                      onClick={() => handlePaymentOption(option)}
                      className={`
                        p-2 text-center rounded-lg cursor-pointer transition-all border-2 text-sm
                        ${option === '50%'
                          ? 'bg-[#C4DAD2] border-[#16423C] font-semibold'
                          : 'bg-[#E9EFEC] border-transparent hover:border-[#16423C] hover:bg-[#C4DAD2]'
                        }
                      `}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                {/* Other Amount Input */}
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={selectedAmount}
                  onChange={handleOtherAmountChange}
                  className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-center"
                  min="1"
                  max={totalAmount}
                />

                {/* Payment Method */}
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg mb-4"
                >
                  <option value="cash">Cash</option>
                  <option value="online">Online Transfer</option>
                  <option value="cheque">Cheque</option>
                </select>

                {/* Notes */}
                <textarea
                  placeholder="Add notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg mb-4"
                  rows="2"
                />

                {/* Confirm Button */}
                <button
                  onClick={handleConfirmPayment}
                  disabled={processing}
                  className="w-full bg-[#16423C] text-white py-3 rounded-full font-semibold hover:bg-[#0f332f] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {processing ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle"></i>
                      Confirm Payment
                    </>
                  )}
                </button>

                {/* Cancel Button */}
                <button
                  onClick={() => openCancelConfirmModal(selectedClient)}
                  disabled={processing}
                  className="w-full bg-red-600 text-white py-3 rounded-full font-semibold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
                >
                  <i className="fas fa-times-circle"></i>
                  Cancel Payment & Extend 1 Week
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center sticky top-24">
                <i className="fas fa-arrow-left text-4xl text-[#C4DAD2] mb-3"></i>
                <h5 className="text-lg font-semibold text-[#16423C] mb-2">Select a Client</h5>
                <p className="text-gray-500">Click on any client to process payment</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Payment Modal */}
      {showModal && selectedClient && (
        <div
          className="fixed inset-0 bg-black/50 z-[9999] flex items-end lg:hidden"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h5 className="text-xl font-bold text-[#16423C]">{selectedClient.name}</h5>
                  <p className="text-gray-500">{selectedClient.phone}</p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center"
                >
                  <i className="fas fa-times"></i>
                </button>
              </div>

              {/* Due Info */}
              <div className="bg-yellow-50 p-3 rounded-lg mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm">Total:</span>
                  <span className="font-semibold">{formatAmount(selectedClient.amount)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm">Received:</span>
                  <span className="font-semibold text-green-600">{formatAmount(selectedClient.received)}</span>
                </div>
                <div className="flex justify-between items-center text-lg font-bold mt-2 pt-2 border-t">
                  <span>Due:</span>
                  <span className="text-red-600">{formatAmount(totalAmount)}</span>
                </div>
              </div>

              {/* Amount */}
              <div className="text-center my-4">
                <div className="text-4xl font-bold text-[#16423C]">
                  {formatAmount(selectedAmount)}
                </div>
              </div>

              {/* Payment Options */}
              <div className="grid grid-cols-4 gap-2 mb-4">
                {['MIN', '50%', 'FULL', 'OTHER'].map((option) => (
                  <button
                    key={option}
                    onClick={() => handlePaymentOption(option)}
                    className={`
                      p-2 text-center rounded-lg text-sm
                      ${option === '50%'
                        ? 'bg-[#C4DAD2] border-[#16423C] font-semibold'
                        : 'bg-[#E9EFEC] hover:bg-[#C4DAD2]'
                      }
                    `}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {/* Other Amount Input */}
              <input
                type="number"
                placeholder="Enter amount"
                value={selectedAmount}
                onChange={handleOtherAmountChange}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-center"
                min="1"
                max={totalAmount}
              />

              {/* Payment Method */}
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4"
              >
                <option value="cash">Cash</option>
                <option value="online">Online Transfer</option>
                <option value="cheque">Cheque</option>
              </select>

              {/* Notes */}
              <textarea
                placeholder="Add notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg mb-4"
                rows="2"
              />

              {/* Confirm Button */}
              <button
                onClick={handleConfirmPayment}
                disabled={processing}
                className="w-full bg-[#16423C] text-white py-3 rounded-full font-semibold hover:bg-[#0f332f] transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
              >
                {processing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check-circle"></i>
                    Confirm Payment
                  </>
                )}
              </button>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  openCancelConfirmModal(selectedClient);
                  closeModal();
                }}
                disabled={processing}
                className="w-full bg-red-600 text-white py-3 rounded-full font-semibold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
              >
                <i className="fas fa-times-circle"></i>
                Cancel & Extend 1 Week
              </button>

              {/* Close Button */}
              <button
                onClick={closeModal}
                className="w-full bg-gray-200 text-gray-700 py-3 rounded-full font-semibold hover:bg-gray-300 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Payment Confirmation Modal */}
      {showCancelConfirmModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[10000] flex items-center justify-center"
          onClick={closeCancelConfirmModal}
        >
          <div
            className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
              <i className="fas fa-exclamation-triangle text-red-600 text-lg"></i>
            </div>
            <h3 className="text-lg font-bold text-[#16423C] text-center mb-2">
              Cancel Payment?
            </h3>
            <p className="text-gray-600 text-center mb-4">
              This will cancel all payments for <strong>{cancelPaymentData?.name}</strong> and extend their loan by 1 week.
            </p>

            <div className="flex gap-3">
              <button
                onClick={closeCancelConfirmModal}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
              >
                No, Keep It
              </button>
              <button
                onClick={handleConfirmCancelPayment}
                disabled={processing}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Canceling...
                  </>
                ) : (
                  <>
                    <i className="fas fa-times"></i>
                    Yes, Cancel
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 px-6 py-4 rounded-lg shadow-lg text-white flex items-center gap-3 z-[50000] animate-in fade-in slide-in-from-bottom-4 ${
            notification.type === 'success'
              ? 'bg-green-600'
              : notification.type === 'error'
              ? 'bg-red-600'
              : 'bg-blue-600'
          }`}
        >
          <i
            className={`fas ${
              notification.type === 'success'
                ? 'fa-check-circle'
                : notification.type === 'error'
                ? 'fa-exclamation-circle'
                : 'fa-info-circle'
            }`}
          ></i>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Add Font Awesome */}
      <link
        rel="stylesheet"
        href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
      />
    </div>
  );
}