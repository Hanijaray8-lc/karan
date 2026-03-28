// AddManager.js (Admin only - Add Managers) - Two Column Layout
import React, { useState, useEffect, useRef } from 'react';
import {
  UserPlus,
  Pencil,
  Trash2,
  Search,
  Users,
  Mail,
  Phone,
  X,
  User,
  Star,
  Calendar,
  Shield,
  CheckCircle,
  XCircle,
  Key,
  Eye,
  EyeOff
} from 'lucide-react';
import AdminNavbar from './AdminNavbar';

export default function AddManager() {
  const [managers, setManagers] = useState([]);
  const [filteredManagers, setFilteredManagers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);

  const [currentManager, setCurrentManager] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Popup state for success / error feedback
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const popupTimeoutRef = useRef(null);

  const showPopup = (type, title, message, duration = 4000) => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    setPopup({ visible: true, type, title, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup(prev => ({ ...prev, visible: false }));
      popupTimeoutRef.current = null;
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    };
  }, []);

  // Form Data - Basic details only
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    status: 'Active'
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (!token || !user || user.role !== 'admin') {
      alert('Access denied. Admin only.');
      window.location.href = '/';
    } else {
      fetchManagers();
    }
  }, []);

  useEffect(() => {
    filterManagers();
  }, [searchTerm, managers]);

  const handleAuthError = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    alert('Your session has expired. Please login again.');
    window.location.href = '/';
  };

  const fetchManagers = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/managers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const data = await res.json();

      if (data.success) {
        setManagers(data.managers || []);
        setFilteredManagers(data.managers || []);
      }
    } catch (err) {
      console.error('Error fetching managers:', err);
      alert('Could not fetch managers');
    } finally {
      setLoading(false);
    }
  };

  const filterManagers = () => {
    if (!searchTerm) {
      setFilteredManagers(managers);
      return;
    }

    const searchLower = searchTerm.toLowerCase();
    const filtered = managers.filter(manager =>
      manager.name?.toLowerCase().includes(searchLower) ||
      manager.username?.toLowerCase().includes(searchLower) ||
      manager.email?.toLowerCase().includes(searchLower) ||
      manager.phone?.includes(searchLower)
    );
    setFilteredManagers(filtered);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // If phone field, keep digits only and limit to 10 chars
    if (name === 'phone') {
      const digits = String(value).replace(/\D/g, '').slice(0, 10);
      setFormData(prev => ({ ...prev, [name]: digits }));
      return;
    }
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      username: '',
      name: '',
      email: '',
      phone: '',
      password: '',
      confirmPassword: '',
      status: 'Active'
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleAddManager = async (e) => {
    e.preventDefault();

    // Validation
    if (formData.password !== formData.confirmPassword) {
      showPopup('error', 'Validation', 'Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      showPopup('error', 'Validation', 'Password must be at least 6 characters long');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const managerData = {
        username: formData.username,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        status: formData.status
      };

      const res = await fetch('http://localhost:5000/api/managers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(managerData),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to add manager');

      setShowAddModal(false);
      resetForm();
      await fetchManagers();
      showPopup('success', 'Added', `Manager ${managerData.name || managerData.username} added successfully`);

    } catch (err) {
      console.error('Error adding manager:', err);
      showPopup('error', 'Error', err.message || 'Could not add manager');
    } finally {
      setLoading(false);
    }
  };

  const handleEditManager = async (e) => {
    e.preventDefault();

    if (!currentManager?._id) return;

    if (formData.password && formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const managerData = {
        username: formData.username,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        status: formData.status
      };

      // Only include password if provided
      if (formData.password) {
        managerData.password = formData.password;
      }

      const res = await fetch(`http://localhost:5000/api/managers/${currentManager._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(managerData),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to update manager');

      setShowEditModal(false);
      resetForm();
      await fetchManagers();
      alert('Manager updated successfully!');

    } catch (err) {
      console.error('Error updating manager:', err);
      alert('Could not update manager: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!currentManager?._id) return;
    if (!window.confirm('Generate a temporary password for this manager?')) return;
    try {
      setResetting(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/managers/${currentManager._id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset password');

      const temp = data.password;
      setFormData(prev => ({ ...prev, password: temp, confirmPassword: temp }));
      setTempPassword(temp);
      alert('Temporary password generated:\n' + temp + '\nIt will be saved when you click Update.');
    } catch (err) {
      console.error('Error resetting password:', err);
      alert('Could not generate temporary password');
    } finally {
      setResetting(false);
    }
  };

  const handleDeleteManager = async () => {
    if (!currentManager?._id) return;

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const res = await fetch(`http://localhost:5000/api/managers/${currentManager._id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (res.status === 401) handleAuthError();
      if (!res.ok) throw new Error('Failed to delete manager');

      setShowDeleteModal(false);
      await fetchManagers();
      alert('Manager deleted successfully!');

    } catch (err) {
      console.error('Error deleting manager:', err);
      alert('Could not delete manager: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (manager) => {
    setCurrentManager(manager);
    setFormData({
      username: manager.username || '',
      name: manager.name || '',
      email: manager.email || '',
      phone: manager.phone || '',
      password: manager.password || '',
      confirmPassword: manager.password || '',
      status: manager.status || 'Active'
    });
    setShowEditModal(true);
  };

  const openViewModal = (manager) => {
    setCurrentManager(manager);
    setShowViewModal(true);
  };

  const openDeleteModal = (manager) => {
    setCurrentManager(manager);
    setShowDeleteModal(true);
  };

  const getStatusBadge = (status) => {
    return status === 'Active'
      ? <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
        <CheckCircle size={12} className="mr-1" /> Active
      </span>
      : <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-200">
        <XCircle size={12} className="mr-1" /> Inactive
      </span>;
  };

  const formatDate = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Calculate stats
  const totalManagers = managers.length;
  const activeManagers = managers.filter(m => m.status === 'Active').length;
  const newThisMonth = managers.filter(m => {
    const joinDate = new Date(m.joinDate || m.createdAt);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return joinDate > thirtyDaysAgo;
  }).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] to-[#e9f0f5] pb-12">
      <AdminNavbar />

      {/* Header - Green Theme */}
      <header className="relative mt-2 mx-4 rounded-2xl overflow-hidden backdrop-blur-lg bg-gradient-to-r from-[#16423C] to-[#1f5a52] shadow-xl mb-6">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative px-6 py-6 text-white">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Manager Management</h1>
          <p className="text-emerald-100 mt-2 text-lg flex items-center gap-2">
            <Star size={20} /> Add and manage Managers only
          </p>
        </div>
      </header>

      {/* Stats Cards - Green Theme */}
      <div className="grid grid-cols-3 gap-2 sm:gap-5 px-4 mb-8">
        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="p-2 sm:p-3 bg-[#16423C]/10 rounded-xl">
              <Users className="text-[#16423C]" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-4xl font-bold text-[#16423C]">{totalManagers}</p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">Total Managers</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="p-2 sm:p-3 bg-green-100 rounded-xl">
              <User className="text-green-600" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-4xl font-bold text-green-600">{activeManagers}</p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">Active Managers</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-6 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="p-2 sm:p-3 bg-blue-100 rounded-xl">
              <Calendar className="text-blue-600" size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl sm:text-4xl font-bold text-blue-600">{newThisMonth}</p>
              <p className="text-xs sm:text-sm text-gray-600 uppercase tracking-wide font-medium truncate">New (30 days)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Add Button - Green Theme */}
      <div className="px-4 mb-8 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 backdrop-blur-lg bg-white/70 rounded-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#16423C]/60" size={18} />
          <input
            type="text"
            placeholder="Search managers by name, email, phone..."
            className="w-full pl-10 pr-4 py-3 bg-transparent border border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] placeholder-gray-500"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="bg-[#16423C] text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 hover:bg-[#1f5a52] transition-all duration-300 shadow-lg hover:shadow-xl min-w-[160px]"
        >
          <UserPlus size={20} /> Add Manager
        </button>
      </div>

      {/* Managers Table - Green Theme */}
      <div className="mx-4 backdrop-blur-lg bg-white/80 rounded-2xl shadow-xl overflow-hidden border border-white/20">
        {loading ? (
          <div className="text-center py-16">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#16423C] border-t-transparent"></div>
            <p className="mt-4 text-gray-600 font-medium">Loading managers...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#16423C] text-white sticky top-0">
                <tr>
                  <th className="px-4 py-4 font-semibold">S.No</th>
                  <th className="px-4 py-4 font-semibold">Name</th>
                  <th className="px-4 py-4 font-semibold">Username</th>
                  <th className="px-4 py-4 font-semibold">Password</th>
                  <th className="px-4 py-4 font-semibold">Email</th>
                  <th className="px-4 py-4 font-semibold">Phone</th>
                  <th className="px-4 py-4 font-semibold">Status</th>
                  <th className="px-4 py-4 font-semibold">Joined Date</th>
                  <th className="px-4 py-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#16423C]/10">
                {filteredManagers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={40} className="text-gray-400" />
                        <p className="text-lg">No managers found</p>
                        <button
                          onClick={() => {
                            resetForm();
                            setShowAddModal(true);
                          }}
                          className="text-[#16423C] hover:underline font-medium"
                        >
                          Add your first manager
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredManagers.map((manager, index) => (
                    <tr
                      key={manager._id}
                      className="hover:bg-[#16423C]/5 transition-colors duration-200 cursor-pointer"
                      onClick={() => openViewModal(manager)}
                    >
                      <td className="px-4 py-4 font-medium">{index + 1}</td>
                      <td className="px-4 py-4 font-medium text-[#16423C]">{manager.name || '—'}</td>
                      <td className="px-4 py-4">{manager.username || '—'}</td>
                      <td className="px-4 py-4">{manager.password || '—'}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <Mail size={14} className="text-gray-400" />
                          {manager.email || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1">
                          <Phone size={14} className="text-gray-400" />
                          {manager.phone || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-4">{getStatusBadge(manager.status)}</td>
                      <td className="px-4 py-4">{formatDate(manager.joinDate || manager.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => openEditModal(manager)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => openDeleteModal(manager)}
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

      {/* View Manager Modal - Green Theme */}
      {showViewModal && currentManager && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-white/50">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <User size={22} /> Manager Details
              </h2>
              <button
                onClick={() => setShowViewModal(false)}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-[#16423C]/10 flex items-center justify-center">
                  <User size={32} className="text-[#16423C]" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#16423C]">{currentManager.name}</h3>
                  <p className="text-gray-600">@{currentManager.username}</p>
                  <div className="mt-1">{getStatusBadge(currentManager.status)}</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail size={18} className="text-[#16423C]" />
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-medium">{currentManager.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone size={18} className="text-[#16423C]" />
                  <div>
                    <p className="text-xs text-gray-500">Phone</p>
                    <p className="font-medium">{currentManager.phone}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Calendar size={18} className="text-[#16423C]" />
                  <div>
                    <p className="text-xs text-gray-500">Joined Date</p>
                    <p className="font-medium">{formatDate(currentManager.joinDate || currentManager.createdAt)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <Shield size={18} className="text-[#16423C]" />
                  <div>
                    <p className="text-xs text-gray-500">Role</p>
                    <p className="font-medium">Manager</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(currentManager);
                  }}
                  className="flex-1 bg-[#16423C] text-white py-2 rounded-lg font-medium hover:bg-[#1f5a52] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowViewModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-medium hover:bg-gray-300 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Manager Modal - Two Column Layout */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/50">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <UserPlus size={22} /> Add New Manager
              </h2>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddManager} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter full name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Username <span className="text-red-600">*</span>
                    </label>
                    <input
                      name="username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email <span className="text-red-600">*</span>
                    </label>
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter email address"
                    />
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
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Password <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] pr-10"
                        required
                        minLength="6"
                        placeholder="Enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#16423C]"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {tempPassword && (
                      <div className="mt-2 text-sm bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
                        <strong>Temporary password:</strong> {tempPassword}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Confirm Password <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] pr-10"
                        required
                        placeholder="Confirm password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#16423C]"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Key size={14} /> Password must be at least 6 characters
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 mt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white py-3 rounded-lg font-medium hover:from-[#1f5a52] hover:to-[#16423C] transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Manager'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-all duration-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal - Two Column Layout */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-white/50">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Pencil size={22} /> Edit Manager
              </h2>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditManager} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter full name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
                    <input
                      name="username"
                      value={formData.username}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter username"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                    <input
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                      required
                      placeholder="Enter email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
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
                      placeholder="Enter phone"
                    />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <div className="relative">
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={formData.password}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] pr-10"
                        minLength="6"
                        placeholder="Enter password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#16423C]"
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                    <div className="relative">
                      <input
                        name="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        value={formData.confirmPassword}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] pr-10"
                        placeholder="Confirm new password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-[#16423C]"
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select
                      name="status"
                      value={formData.status}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="pt-2">
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Key size={14} /> Leave password empty to keep current
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-6 mt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white py-3 rounded-lg font-medium hover:from-[#1f5a52] hover:to-[#16423C] transition-all duration-300 disabled:opacity-50"
                >
                  {loading ? 'Updating...' : 'Update Manager'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    resetForm();
                  }}
                  className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  disabled={resetting}
                  className="flex-1 bg-yellow-100 text-yellow-800 py-3 rounded-lg font-medium hover:bg-yellow-200 transition-all duration-300"
                >
                  {resetting ? 'Resetting...' : 'Reset Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal - Green Theme */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-white/50">
            <div className="text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} className="text-red-600" />
              </div>
              <h2 className="text-2xl font-bold text-[#16423C] mb-4">Confirm Delete</h2>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <strong className="text-[#16423C]">{currentManager?.name}</strong>?
                <br />
                <span className="text-sm text-red-600">This action cannot be undone.</span>
              </p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleDeleteManager}
                disabled={loading}
                className="flex-1 bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-all duration-300 disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-all duration-300"
              >
                Cancel
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