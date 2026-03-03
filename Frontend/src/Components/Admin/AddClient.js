// AddClient.js (Admin version - NO agent dropdown)
import React, { useState, useEffect } from 'react';
import {
  UserPlus,
  Pencil,
  Trash2,
  Search,
  Users,
  IndianRupee,
  X,
  Calendar
} from 'lucide-react';
import AdminNavbar from './AdminNavbar';

export default function ClientManagement() {
  const [clients, setClients] = useState([]);
  const [totalClients, setTotalClients] = useState(0);
  const [totalLoanAmount, setTotalLoanAmount] = useState(0);
  const [totalReceived, setTotalReceived] = useState(0);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [currentClient, setCurrentClient] = useState(null);
  const [loading, setLoading] = useState(false);

  // Form Data with default values (NO agent field)
  const [formData, setFormData] = useState({
    name: '',
    husband_name: '',
    phone: '',
    landmark: '',
    address: '',
    district: '',
    amount: '5000',
    received: '0',
    pending: '5000',
    loan_start_date: '',
    loan_end_date: '',
    status: 'pending',
    notes: '',
    nominee_name: '',
    nominee_address: '',
    nominee_phone: '',
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user || user.role !== 'admin') {
      alert('Access denied. Admin only.');
      window.location.href = '/';
    } else {
      fetchClients();
    }
  }, []);

  // Listen for external updates to a client's loan_end_date (e.g., from DailyDues Not Paid)
  useEffect(() => {
    const handler = (ev) => {
      try {
        const detail = ev && ev.detail ? ev.detail : null;
        if (!detail || !detail.clientId) return;
        const clientId = detail.clientId;
        const loanEndDate = detail.loan_end_date;

        // Update clients list if present in this page
        setClients(prev => prev.map(c => c._id === clientId ? { ...c, loan_end_date: loanEndDate } : c));

        // If currently editing this client, update the edit form as well
        setCurrentClient(prev => prev && prev._id === clientId ? { ...prev, loan_end_date: loanEndDate } : prev);
        if (showEditModal && currentClient && currentClient._id === clientId) {
          setFormData(prev => ({ ...prev, loan_end_date: loanEndDate ? loanEndDate.split('T')[0] : prev.loan_end_date }));
        }
      } catch (err) {
        // ignore
      }
    };

    window.addEventListener('clientLoanEndUpdated', handler);
    return () => window.removeEventListener('clientLoanEndUpdated', handler);
  }, [currentClient, showEditModal]);

  // Calculate pending amount whenever amount or received changes
  useEffect(() => {
    const amount = parseFloat(formData.amount) || 0;
    const received = parseFloat(formData.received) || 0;
    const pending = amount - received;
    
    setFormData(prev => ({
      ...prev,
      pending: pending >= 0 ? pending.toString() : '0'
    }));
  }, [formData.amount, formData.received]);

  const handleAuthError = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    alert('Your session has expired. Please login again.');
    window.location.href = '/';
  };

  // Calculate total weeks between loan start and end date
  const calculateTotalWeeks = () => {
    if (!formData.loan_start_date || !formData.loan_end_date) return 0;

    // Use UTC dates to avoid timezone offset issues when parsing date-only strings
    const s = new Date(formData.loan_start_date);
    const e = new Date(formData.loan_end_date);

    const startUTC = Date.UTC(s.getFullYear(), s.getMonth(), s.getDate());
    const endUTC = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());

    const durationDays = Math.round((endUTC - startUTC) / (1000 * 60 * 60 * 24));

    // Ensure at least 1 week to avoid division by zero elsewhere
    const totalWeeks = Math.max(1, Math.round(durationDays / 7));

    return totalWeeks;
  };

  // Calculate weekly amount based on pending amount and total weeks
  const calculateWeeklyAmount = () => {
    const pending = Number(parseFloat(formData.pending) || 0);
    const amount = Number(parseFloat(formData.amount) || 0);
    const totalWeeks = calculateTotalWeeks();

    if (totalWeeks <= 0) return 0;

    // Special rule: for ₹5000 loans, use fixed weekly amount ₹575 (non-dividable)
    if (amount === 5000) return 575;

    // Default: divide pending across weeks, rounded to 2 decimals
    return Number((pending / totalWeeks).toFixed(2));
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/clients', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
        handleAuthError();
        return;
      }
      
      const data = await res.json();
      
      if (data.success) {
        setClients(data.clients || []);
        setTotalClients(data.totalClients || 0);
        setTotalLoanAmount(data.totalLoanAmount || 0);
        setTotalReceived(data.totalReceived || 0);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      alert('Could not fetch clients');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClient = async (e) => {
    e.preventDefault();
    
    if (!formData.loan_start_date || !formData.loan_end_date) {
      alert('Please select loan start and end dates');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const amount = parseFloat(formData.amount) || 5000;
      const received = parseFloat(formData.received) || 0;

      const formattedData = {
        name: formData.name,
        husband_name: formData.husband_name,
        phone: formData.phone,
        landmark: formData.landmark || '',
        address: formData.address,
        district: formData.district,
        amount: amount,
        received: received,
        loan_start_date: formData.loan_start_date,
        loan_end_date: formData.loan_end_date,
        status: formData.status,
        notes: formData.notes || '',
        nominee_name: formData.nominee_name || '',
        nominee_address: formData.nominee_address || '',
        nominee_phone: formData.nominee_phone || ''
      };

      // include computed weekly fields so backend can persist them
      formattedData.total_weeks = calculateTotalWeeks();
      formattedData.weekly_amount = calculateWeeklyAmount();

      const res = await fetch('http://localhost:5000/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(formattedData),
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.message || 'Failed to add client');
      
      setShowAddModal(false);
      resetForm();
      await fetchClients();
      alert('Client added successfully!');
      
    } catch (err) {
      console.error('Error adding client:', err);
      alert('Could not add client: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      client.name?.toLowerCase().includes(searchLower) ||
      client.husband_name?.toLowerCase().includes(searchLower) ||
      client.phone?.includes(searchLower) ||
      client.landmark?.toLowerCase().includes(searchLower) ||
      client.address?.toLowerCase().includes(searchLower) ||
      client.district?.toLowerCase().includes(searchLower) ||
      client.nominee_name?.toLowerCase().includes(searchLower) ||
      client.nominee_phone?.includes(searchLower) ||
      client.notes?.toLowerCase().includes(searchLower);

    const matchesStatus = !statusFilter || client.status === statusFilter;

    const clientStartDate = client.loan_start_date ? new Date(client.loan_start_date) : null;
    const clientEndDate = client.loan_end_date ? new Date(client.loan_end_date) : null;
    const filterStartDate = dateStart ? new Date(dateStart) : null;
    const filterEndDate = dateEnd ? new Date(dateEnd) : null;

    const matchesDateStart = !filterStartDate || (clientStartDate && clientStartDate >= filterStartDate);
    const matchesDateEnd = !filterEndDate || (clientEndDate && clientEndDate <= filterEndDate);

    return matchesSearch && matchesStatus && matchesDateStart && matchesDateEnd;
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Restrict phone inputs to digits only and max 10 characters
    if (name === 'phone' || name === 'nominee_phone') {
      const digits = String(value).replace(/\D/g, '').slice(0, 10);
      setFormData((prev) => ({ ...prev, [name]: digits }));
      return;
    }

    // If start date is changed, auto-set end date to cover 12 dues.
    // Because the due-calculation logic counts inclusively, a span
    // of 11 weeks (77 days) yields 12 due dates.  Previously this code
    // added a full 12 weeks which produced 13 dues immediately.
    if (name === 'loan_start_date') {
      if (!value) {
        setFormData((prev) => ({ ...prev, loan_start_date: '', loan_end_date: '' }));
        return;
      }

      const start = new Date(value);
      // add 11 weeks = 77 days (inclusive counting yields 12 dues)
      const end = new Date(start.getTime() + 11 * 7 * 24 * 60 * 60 * 1000);
      const endStr = end.toISOString().slice(0, 10);

      setFormData((prev) => ({ ...prev, loan_start_date: value, loan_end_date: endStr }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      husband_name: '',
      phone: '',
      landmark: '',
      address: '',
      district: '',
      amount: '5000',
      received: '0',
      pending: '5000',
      loan_start_date: '',
      loan_end_date: '',
      status: 'pending',
      notes: '',
      nominee_name: '',
      nominee_address: '',
      nominee_phone: '',
    });
  };

  const handleEditClient = async (e) => {
    e.preventDefault();
    if (!currentClient?._id) return;
    
    try {
      const amount = parseFloat(formData.amount) || 0;
      const received = parseFloat(formData.received) || 0;
      const pending = amount - received;

      const updatedData = {
        ...formData,
        amount,
        received,
        pending,
        status: formData.status
      };

      // ensure weekly fields are updated when editing
      updatedData.total_weeks = calculateTotalWeeks();
      updatedData.weekly_amount = calculateWeeklyAmount();

      const res = await fetch(`http://localhost:5000/api/clients/${currentClient._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(updatedData),
      });
      
      if (res.status === 401) handleAuthError();
      if (!res.ok) throw new Error('Failed to update');
      
      setShowEditModal(false);
      resetForm();
      fetchClients();
      alert('Client updated successfully!');
    } catch (err) {
      console.error('Error editing client:', err);
      alert('Could not update client: ' + err.message);
    }
  };

  const handleDeleteClient = async () => {
    if (!currentClient?._id) return;
    try {
      const res = await fetch(`http://localhost:5000/api/clients/${currentClient._id}`, {
        method: 'DELETE',
        headers: { 
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      });
      
      if (res.status === 401) handleAuthError();
      if (!res.ok) throw new Error('Failed to delete');
      
      setShowDeleteModal(false);
      fetchClients();
      alert('Client deleted successfully!');
    } catch (err) {
      console.error('Error deleting client:', err);
      alert('Could not delete client: ' + err.message);
    }
  };

  const openEditModal = (client) => {
    setCurrentClient(client);
    setFormData({ 
      name: client.name || '',
      husband_name: client.husband_name || '',
      phone: client.phone || '',
      landmark: client.landmark || '',
      address: client.address || '',
      district: client.district || '',
      amount: client.amount?.toString() || '5000',
      received: client.received?.toString() || '0',
      pending: client.pending?.toString() || '5000',
      loan_start_date: client.loan_start_date?.split('T')[0] || '',
      loan_end_date: client.loan_end_date?.split('T')[0] || '',
      status: client.status || 'pending',
      notes: client.notes || '',
      nominee_name: client.nominee_name || '',
      nominee_address: client.nominee_address || '',
      nominee_phone: client.nominee_phone || '',
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (client) => {
    setCurrentClient(client);
    setShowDeleteModal(true);
  };

  const getStatusClass = (status) => {
    switch(status) {
      case 'paid': return 'bg-green-100 text-green-800 border border-green-200';
      case 'partial': return 'bg-amber-100 text-amber-800 border border-amber-200';
      default: return 'bg-red-100 text-red-800 border border-red-200';
    }
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'paid': return 'Paid ✅';
      case 'partial': return 'Partial ⚠️';
      default: return 'Pending ⏳';
    }
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] to-[#e9f0f5] pb-12">
      <AdminNavbar />
      
      {/* Header */}
      <header className="relative mt-2 mx-4 rounded-2xl overflow-hidden backdrop-blur-lg bg-gradient-to-r from-[#16423C] to-[#1f5a52] shadow-xl mb-6">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative px-6 py-6 text-white">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Client Management (Admin)</h1>
          <p className="text-emerald-100 mt-2 text-lg flex items-center gap-2">
            <UserPlus size={20} /> Manage all clients • Track loans
          </p>
        </div>
      </header>

      {/* Stats Cards - Single Row on Mobile */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-5 px-4 mb-6">
        <div className="backdrop-blur-lg bg-white/80 p-2 sm:p-4 lg:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 flex flex-col justify-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <div className="p-1 sm:p-3 bg-[#16423C]/10 rounded-xl hidden sm:block">
              <Users className="text-[#16423C]" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-[#16423C]">{totalClients}</p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">Total Clients</p>
            </div>
          </div>
        </div>
        <div className="backdrop-blur-lg bg-white/80 p-2 sm:p-4 lg:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 flex flex-col justify-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <div className="p-1 sm:p-3 bg-[#16423C]/10 rounded-xl hidden sm:block">
              <IndianRupee className="text-[#16423C]" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-[#16423C] truncate">
                ₹{Number(totalLoanAmount).toLocaleString('en-IN', { notation: 'compact', compactDisplay: 'short' })}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">Total Lent</p>
            </div>
          </div>
        </div>
        <div className="backdrop-blur-lg bg-white/80 p-2 sm:p-4 lg:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20 flex flex-col justify-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <div className="p-1 sm:p-3 bg-[#16423C]/10 rounded-xl hidden sm:block">
              <IndianRupee className="text-[#16423C]" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-lg sm:text-3xl lg:text-4xl font-bold text-[#16423C] truncate">
                ₹{Number(totalReceived).toLocaleString('en-IN', { notation: 'compact', compactDisplay: 'short' })}
              </p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">Total Received</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters Section - Organized in Rows */}
      <div className="px-4 mb-8 space-y-3">
        {/* Row 1: Search Bar + Status Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 backdrop-blur-lg bg-white/70 rounded-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#16423C]/60" size={18} />
            <input
              type="text"
              placeholder="Search by name, phone, district..."
              className="w-full pl-10 pr-4 py-3 bg-transparent border border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] placeholder-gray-500 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="py-3 px-4 border border-[#16423C]/20 rounded-lg bg-white/70 backdrop-blur-lg min-w-[140px] focus:outline-none focus:ring-2 focus:ring-[#16423C] text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="paid">Paid ✅</option>
            <option value="partial">Partial ⚠️</option>
            <option value="pending">Pending ⏳</option>
          </select>
        </div>

        {/* Row 2: Date Filters + Add Button */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 flex items-center gap-2 bg-white/70 backdrop-blur-lg rounded-lg px-3 border border-[#16423C]/20">
            <Calendar size={18} className="text-[#16423C]/60 flex-shrink-0" />
            <input
              type="date"
              className="py-3 bg-transparent focus:outline-none text-sm flex-1"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              placeholder="Start Date"
            />
          </div>

          <div className="flex-1 flex items-center gap-2 bg-white/70 backdrop-blur-lg rounded-lg px-3 border border-[#16423C]/20">
            <Calendar size={18} className="text-[#16423C]/60 flex-shrink-0" />
            <input
              type="date"
              className="py-3 bg-transparent focus:outline-none text-sm flex-1"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              placeholder="End Date"
            />
          </div>

          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="w-full sm:w-auto bg-[#16423C] text-white px-5 sm:px-6 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#1f5a52] transition-all duration-300 shadow-lg hover:shadow-xl font-medium whitespace-nowrap text-sm"
          >
            <UserPlus size={18} /> Add Client
          </button>
        </div>
      </div>

      {/* Table - ALL FIELDS DISPLAYED (NO AGENT COLUMN) */}
      <div className="mx-4 backdrop-blur-lg bg-white/80 rounded-2xl shadow-xl overflow-hidden border border-white/20">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#16423C] border-t-transparent"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading clients...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#16423C] text-white sticky top-0">
                <tr>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">ID</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Client Name</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Husband</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Phone</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Landmark</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Address</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">District</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Amount</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Received</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Pending</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Weekly Amount</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Weeks</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Start Date</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">End Date</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Status</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Nominee Name</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Nominee Phone</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Nominee Address</th>
                  <th className="px-3 py-4 font-semibold whitespace-nowrap">Notes</th>
                  <th className="px-3 py-4 font-semibold text-center whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16423C]/10">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={20} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={40} className="text-gray-400" />
                        <p className="text-lg">No matching clients found</p>
                        <button
                          onClick={() => {
                            resetForm();
                            setShowAddModal(true);
                          }}
                          className="text-[#16423C] hover:underline font-medium"
                        >
                          Add your first client
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client._id} className="hover:bg-[#16423C]/5 transition-colors duration-200">
                      <td className="px-3 py-4 font-medium text-[#16423C] whitespace-nowrap">
                        {client.clientId || `#${client._id?.slice(-6)}`}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.name || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.husband_name || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.phone || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.landmark || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.address || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.district || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap font-medium">₹{(client.amount || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-green-700 font-medium">₹{(client.received || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-4 whitespace-nowrap text-red-700 font-medium">₹{(client.pending || 0).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-4 whitespace-nowrap font-medium text-blue-600">₹{(client.weekly_amount || 0).toFixed(2)}</td>
                      <td className="px-3 py-4 whitespace-nowrap font-medium">{client.total_weeks || 0} weeks</td>
                      <td className="px-3 py-4 whitespace-nowrap">{formatDate(client.loan_start_date)}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{formatDate(client.loan_end_date)}</td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusClass(client.status)}`}>
                          {getStatusBadge(client.status)}
                        </span>
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.nominee_name || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.nominee_phone || '—'}</td>
                      <td className="px-3 py-4 whitespace-nowrap">{client.nominee_address || '—'}</td>
                      <td className="px-3 py-4 max-w-[200px] truncate" title={client.notes}>
                        {client.notes || '—'}
                      </td>
                      <td className="px-3 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 justify-center">
                          <button
                            onClick={() => openEditModal(client)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(client)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Client Modal (NO agent dropdown) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-white/50">
            <div className="sticky top-0 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UserPlus size={22} /> Add New Client
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleAddClient} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Client Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Husband Name <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="husband_name"
                    value={formData.husband_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number <span className="text-red-600">*</span>
                </label>
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                <input
                  name="landmark"
                  value={formData.landmark}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Address <span className="text-red-600">*</span>
                </label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  District <span className="text-red-600">*</span>
                </label>
                <select
                  name="district"
                  value={formData.district}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  required
                >
                  <option value="">Select District</option>
                  {['Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri',
                    'Dindigul','Erode','Kallakurichi','Kanchipuram','Kanyakumari','Karur',
                    'Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam','Namakkal',
                    'Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet',
                    'Salem','Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi',
                    'Tiruchirappalli','Tirunelveli','Tirupathur','Tiruppur','Tiruvallur',
                    'Tiruvannamalai','Tiruvarur','Vellore','Viluppuram','Virudhunagar'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                </select>
              </div>

              {/* Amount Fields */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Total Amount (₹) <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="amount"
                    type="number"
                    min="0"
                    step="100"
                    value={formData.amount}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Received (₹)
                  </label>
                  <input
                    name="received"
                    type="number"
                    min="0"
                    step="100"
                    value={formData.received}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pending (₹)
                  </label>
                  <input
                    name="pending"
                    type="number"
                    value={formData.pending}
                    readOnly
                    className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Status Field */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Status <span className="text-red-600">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  required
                >
                  <option value="pending">Pending ⏳</option>
                  <option value="partial">Partial Payment ⚠️</option>
                  <option value="paid">Paid ✅</option>
                </select>
              </div>

              {/* Date Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loan Start Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="loan_start_date"
                    type="date"
                    value={formData.loan_start_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loan End Date <span className="text-red-600">*</span>
                  </label>
                  <input
                    name="loan_end_date"
                    type="date"
                    value={formData.loan_end_date}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    required
                  />
                </div>
              </div>

              {/* Weekly Amount Calculation Display */}
              {formData.loan_start_date && formData.loan_end_date && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total Weeks
                      </label>
                      <input
                        type="number"
                        value={calculateTotalWeeks()}
                        readOnly
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed font-semibold"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weekly Amount (₹)
                      </label>
                      <input
                        type="number"
                        value={calculateWeeklyAmount().toFixed(2)}
                        readOnly
                        className="w-full px-4 py-2 border-2 border-blue-300 rounded-lg bg-blue-100 text-blue-900 cursor-not-allowed font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Pending Amount (₹)
                      </label>
                      <input
                        type="number"
                        value={formData.pending}
                        readOnly
                        className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed font-semibold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Nominee Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Name</label>
                  <input
                    name="nominee_name"
                    value={formData.nominee_name}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Phone</label>
                  <input
                    name="nominee_phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={formData.nominee_phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Address</label>
                <textarea
                  name="nominee_address"
                  value={formData.nominee_address}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>

              <div className="sticky bottom-0 bg-white/80 backdrop-blur-lg pt-4 pb-1 border-t-2 border-[#16423C]/10 mt-4">
                <div className="flex gap-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white py-3 rounded-xl font-bold hover:from-[#1f5a52] hover:to-[#16423C] transition-all duration-300 shadow-lg disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Client'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      resetForm();
                    }}
                    className="flex-1 bg-gray-200/80 backdrop-blur-lg text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-300 transition-all duration-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal (NO agent dropdown) */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-white/50">
            <div className="sticky top-0 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Pencil size={22} /> Edit Client
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  resetForm();
                }}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleEditClient} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Same form fields as Add Modal (NO agent field) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Client Name *</label>
                  <input name="name" value={formData.name} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Husband Name *</label>
                  <input name="husband_name" value={formData.husband_name} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                <input
                  name="phone"
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Landmark</label>
                <input name="landmark" value={formData.landmark} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Address *</label>
                <textarea name="address" value={formData.address} onChange={handleInputChange} rows={2} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
                <select name="district" value={formData.district} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required>
                  <option value="">Select District</option>
                  {['Ariyalur','Chengalpattu','Chennai','Coimbatore','Cuddalore','Dharmapuri',
                    'Dindigul','Erode','Kallakurichi','Kanchipuram','Kanyakumari','Karur',
                    'Krishnagiri','Madurai','Mayiladuthurai','Nagapattinam','Namakkal',
                    'Nilgiris','Perambalur','Pudukkottai','Ramanathapuram','Ranipet',
                    'Salem','Sivaganga','Tenkasi','Thanjavur','Theni','Thoothukudi',
                    'Tiruchirappalli','Tirunelveli','Tirupathur','Tiruppur','Tiruvallur',
                    'Tiruvannamalai','Tiruvarur','Vellore','Viluppuram','Virudhunagar'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹) *</label>
                  <input name="amount" type="number" value={formData.amount} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Received (₹)</label>
                  <input name="received" type="number" value={formData.received} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pending (₹)</label>
                  <input name="pending" type="number" value={formData.pending} readOnly className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg bg-gray-100" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required>
                  <option value="pending">Pending ⏳</option>
                  <option value="partial">Partial ⚠️</option>
                  <option value="paid">Paid ✅</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
                  <input name="loan_start_date" type="date" value={formData.loan_start_date} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date *</label>
                  <input name="loan_end_date" type="date" value={formData.loan_end_date} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" required />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Name</label>
                  <input name="nominee_name" value={formData.nominee_name} onChange={handleInputChange} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Phone</label>
                  <input
                    name="nominee_phone"
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={formData.nominee_phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nominee Address</label>
                <textarea name="nominee_address" value={formData.nominee_address} onChange={handleInputChange} rows={2} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea name="notes" value={formData.notes} onChange={handleInputChange} rows={2} className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg" />
              </div>

              <div className="sticky bottom-0 bg-white/80 backdrop-blur-lg pt-4 pb-1 border-t-2 border-[#16423C]/10 mt-4">
                <div className="flex gap-4">
                  <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white py-3 rounded-xl font-bold hover:from-[#1f5a52] hover:to-[#16423C] transition-all duration-300 shadow-lg">
                    {loading ? 'Updating...' : 'Update Client'}
                  </button>
                  <button type="button" onClick={() => { setShowEditModal(false); resetForm(); }} className="flex-1 bg-gray-200/80 backdrop-blur-lg text-gray-800 py-3 rounded-xl font-bold hover:bg-gray-300 transition-all duration-300">
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-white/50">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} className="text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#16423C] mb-4">Confirm Delete</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <strong className="text-[#16423C]">{currentClient?.name}</strong>?
                <br />
                <span className="text-sm text-red-600">This action cannot be undone.</span>
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleDeleteClient}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-medium hover:bg-red-700 transition-all duration-300 shadow-lg"
              >
                Yes, Delete
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-200/80 backdrop-blur-lg text-gray-800 py-3 rounded-xl font-medium hover:bg-gray-300 transition-all duration-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}