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
  EyeOff,
  Scan,
  Camera,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import AdminNavbar from './AdminNavbar';
import { loadFaceApiModels, getFaceDescriptor, captureVideoSnapshot } from '../../utils/faceRecognition';
import { requestCameraPermissions } from '../../utils/cameraService';

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

  // Face Registration State
  const [faceData, setFaceData] = useState({ descriptor: null, photo: '' });
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturingFace, setCapturingFace] = useState(false);
  const [faceScanError, setFaceScanError] = useState('');

  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceDetectIntervalRef = useRef(null);

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
      stopCameraForManager();
    };
  }, []);

  // Form Data - Basic details & face biometric fields
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    status: 'Pending',
    faceDescriptor: [],
    facePhoto: '',
    deleteFace: false
  });

  const startCameraForManager = async () => {
    setFaceScanError('');
    setCameraLoading(true);
    setCameraActive(true);
    try {
      await requestCameraPermissions().catch(() => { });
      await loadFaceApiModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      faceStreamRef.current = stream;
      setCameraLoading(false);

      setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          faceVideoRef.current.play().catch(e => console.error(e));
          startFaceDetectionLoop();
        }
      }, 200);
    } catch (err) {
      console.error('Manager camera access error:', err);
      setCameraLoading(false);
      setFaceScanError('Unable to access camera. Please allow webcam permissions in your browser.');
    }
  };

  const stopCameraForManager = () => {
    if (faceDetectIntervalRef.current) {
      clearInterval(faceDetectIntervalRef.current);
      faceDetectIntervalRef.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach(track => track.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFaceDetected(false);
    setCapturingFace(false);
  };

  const startFaceDetectionLoop = () => {
    if (faceDetectIntervalRef.current) clearInterval(faceDetectIntervalRef.current);

    faceDetectIntervalRef.current = setInterval(async () => {
      if (!faceVideoRef.current || faceVideoRef.current.paused || faceVideoRef.current.ended) return;

      try {
        const detection = await getFaceDescriptor(faceVideoRef.current);
        if (detection && detection.descriptor && detection.descriptor.length === 128) {
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      } catch (err) {
        // detection loop noise
      }
    }, 600);
  };

  const handleCaptureManagerFace = async () => {
    if (!faceVideoRef.current) return;
    setCapturingFace(true);
    setFaceScanError('');

    try {
      const result = await getFaceDescriptor(faceVideoRef.current);
      if (!result || !result.descriptor || result.descriptor.length !== 128) {
        setFaceScanError('No clear face detected. Please position face directly in front of the camera.');
        setCapturingFace(false);
        return;
      }

      const snapshot = captureVideoSnapshot(faceVideoRef.current);
      setFaceData({ descriptor: result.descriptor, photo: snapshot });
      setFormData(prev => ({
        ...prev,
        faceDescriptor: result.descriptor,
        facePhoto: snapshot,
        deleteFace: false
      }));

      stopCameraForManager();
      showPopup('success', 'Face Scanned', 'Manager face biometric attached successfully!');
    } catch (err) {
      console.error('Capture face error:', err);
      setFaceScanError('Failed to capture face. Please try again.');
    } finally {
      setCapturingFace(false);
    }
  };

  const handleRemoveManagerFace = () => {
    setFaceData({ descriptor: null, photo: '' });
    setFormData(prev => ({
      ...prev,
      faceDescriptor: [],
      facePhoto: '',
      deleteFace: true
    }));
    showPopup('info', 'Face Removed', 'Face ID registration removed for this manager.');
  };

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
      const res = await fetch('https://karan-e26t.onrender.com/api/managers', {
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

  const handleApproveManager = async (managerId, managerName) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await fetch(`https://karan-e26t.onrender.com/api/managers/${managerId}/approve`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 401) {
        handleAuthError();
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to approve manager');

      showPopup('success', 'Approved', `Manager ${managerName} approved successfully!`);
      await fetchManagers();
      if (showViewModal) setShowViewModal(false);
    } catch (err) {
      console.error('Error approving manager:', err);
      showPopup('error', 'Error', err.message || 'Could not approve manager');
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
      status: 'Pending',
      faceDescriptor: [],
      facePhoto: '',
      deleteFace: false
    });
    setFaceData({ descriptor: null, photo: '' });
    stopCameraForManager();
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
        status: formData.status,
        faceDescriptor: formData.faceDescriptor || [],
        facePhoto: formData.facePhoto || ''
      };

      const res = await fetch('https://karan-e26t.onrender.com/api/managers', {
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
        status: formData.status,
        faceDescriptor: formData.faceDescriptor || [],
        facePhoto: formData.facePhoto || '',
        deleteFace: formData.deleteFace || false
      };

      // Only include password if provided
      if (formData.password) {
        managerData.password = formData.password;
      }

      const res = await fetch(`https://karan-e26t.onrender.com/api/managers/${currentManager._id}`, {
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
      const res = await fetch(`https://karan-e26t.onrender.com/api/managers/${currentManager._id}/reset-password`, {
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

      const res = await fetch(`https://karan-e26t.onrender.com/api/managers/${currentManager._id}`, {
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
    const hasFace = Boolean(manager.faceRegistered && manager.faceDescriptor && manager.faceDescriptor.length === 128);
    setFaceData({
      descriptor: hasFace ? manager.faceDescriptor : null,
      photo: manager.facePhoto || ''
    });
    setFormData({
      username: manager.username || '',
      name: manager.name || '',
      email: manager.email || '',
      phone: manager.phone || '',
      password: manager.password || '',
      confirmPassword: manager.password || '',
      status: manager.status || 'Pending',
      faceDescriptor: hasFace ? manager.faceDescriptor : [],
      facePhoto: manager.facePhoto || '',
      deleteFace: false
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
    if (status === 'Active') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-200">
          <CheckCircle size={12} className="mr-1" /> Active
        </span>
      );
    }
    if (status === 'Pending') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping mr-1.5"></span> Waiting Approval
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
        <XCircle size={12} className="mr-1" /> Inactive
      </span>
    );
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
  const pendingManagers = managers.filter(m => m.status === 'Pending').length;
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
            <Star size={20} /> Add and manage Managers and approvals
          </p>
        </div>
      </header>

      {/* Stats Cards - Green Theme */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 px-4 mb-8">
        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-2.5 bg-[#16423C]/10 rounded-xl">
              <Users className="text-[#16423C]" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-3xl font-bold text-[#16423C]">{totalManagers}</p>
              <p className="text-xs text-gray-600 uppercase tracking-wide font-medium truncate">Total Managers</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-2.5 bg-green-100 rounded-xl">
              <User className="text-green-600" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-3xl font-bold text-green-600">{activeManagers}</p>
              <p className="text-xs text-gray-600 uppercase tracking-wide font-medium truncate">Active</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-2.5 bg-amber-100 rounded-xl">
              <Shield className="text-amber-600" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-3xl font-bold text-amber-600">{pendingManagers}</p>
              <p className="text-xs text-gray-600 uppercase tracking-wide font-medium truncate">Pending Approval</p>
            </div>
          </div>
        </div>

        <div className="backdrop-blur-lg bg-white/80 p-3 sm:p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 border border-white/20">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <div className="p-2 sm:p-2.5 bg-blue-100 rounded-xl">
              <Calendar className="text-blue-600" size={22} />
            </div>
            <div className="min-w-0">
              <p className="text-xl sm:text-3xl font-bold text-blue-600">{newThisMonth}</p>
              <p className="text-xs text-gray-600 uppercase tracking-wide font-medium truncate">New (30 days)</p>
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
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
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
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 items-start">
                          {getStatusBadge(manager.status)}
                          {manager.faceRegistered && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200 shadow-sm" title="Face ID Registered">
                              <Scan size={11} className="text-teal-600" /> Face ID
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">{formatDate(manager.joinDate || manager.createdAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 justify-center" onClick={(e) => e.stopPropagation()}>
                          {manager.status === 'Pending' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApproveManager(manager._id, manager.name || manager.username);
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-md hover:shadow-lg transition-all"
                              title="Approve Manager Account"
                            >
                              <CheckCircle size={13} /> Approve
                            </button>
                          )}
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
                {currentManager.facePhoto ? (
                  <img
                    src={currentManager.facePhoto}
                    alt="Manager Face"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-emerald-600 shadow-md"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#16423C]/10 flex items-center justify-center">
                    <User size={32} className="text-[#16423C]" />
                  </div>
                )}
                <div>
                  <h3 className="text-xl font-bold text-[#16423C]">{currentManager.name}</h3>
                  <p className="text-gray-600">@{currentManager.username}</p>
                  <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                    {getStatusBadge(currentManager.status)}
                    {currentManager.faceRegistered && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                        <Scan size={11} className="text-teal-600" /> Face ID Active
                      </span>
                    )}
                  </div>
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

                {currentManager.faceRegistered && (
                  <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <Scan size={18} className="text-emerald-700" />
                    <div>
                      <p className="text-xs text-emerald-800 font-bold">Face ID Biometrics</p>
                      <p className="text-xs text-emerald-700">Registered for Face Scan Login</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                {currentManager.status === 'Pending' && (
                  <button
                    onClick={() => handleApproveManager(currentManager._id, currentManager.name || currentManager.username)}
                    className="flex-1 bg-emerald-600 text-white py-2 rounded-lg font-bold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <CheckCircle size={16} /> Approve
                  </button>
                )}
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
                      <option value="Pending">Pending (Waiting for Approval)</option>
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

                {/* Face ID Registration Section for Add Manager */}
                <div className="md:col-span-2 pt-3 border-t border-gray-100">
                  <label className="block text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <Scan className="w-4 h-4 text-[#16423C]" />
                    <span>Manager Face ID Biometrics</span>
                    <span className="text-xs font-normal text-gray-500">(Allows manager to login with Face Scan)</span>
                  </label>

                  {faceData.descriptor && faceData.descriptor.length === 128 ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        {faceData.photo ? (
                          <img
                            src={faceData.photo}
                            alt="Manager Face"
                            className="w-12 h-12 rounded-xl object-cover border border-emerald-500 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold">
                            <Scan className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                            <CheckCircle size={14} className="text-emerald-600" />
                            <span>Face ID Attached</span>
                          </div>
                          <p className="text-[11px] text-emerald-700/80">Manager can log in using face scanner on login page</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={startCameraForManager}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 transition shadow-sm flex items-center gap-1"
                        >
                          <Camera size={13} /> Re-Scan
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveManagerFace}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition"
                          title="Remove Face ID"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 border-dashed rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Camera className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>No face biometrics registered for this manager yet.</span>
                      </div>
                      <button
                        type="button"
                        onClick={startCameraForManager}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#16423C] hover:bg-[#1f5a52] transition shadow flex items-center gap-1.5 shrink-0"
                      >
                        <Scan size={13} /> Scan & Register Face
                      </button>
                    </div>
                  )}
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
                      <option value="Pending">Pending (Waiting for Approval)</option>
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

                {/* Face ID Registration Section for Edit Manager */}
                <div className="md:col-span-2 pt-3 border-t border-gray-100">
                  <label className="block text-sm font-semibold text-gray-800 mb-2 flex items-center gap-1.5">
                    <Scan className="w-4 h-4 text-[#16423C]" />
                    <span>Manager Face ID Biometrics</span>
                    <span className="text-xs font-normal text-gray-500">(Allows manager to login with Face Scan)</span>
                  </label>

                  {faceData.descriptor && faceData.descriptor.length === 128 ? (
                    <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                      <div className="flex items-center gap-3">
                        {faceData.photo ? (
                          <img
                            src={faceData.photo}
                            alt="Manager Face"
                            className="w-12 h-12 rounded-xl object-cover border border-emerald-500 shadow-sm"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold">
                            <Scan className="w-6 h-6" />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                            <CheckCircle size={14} className="text-emerald-600" />
                            <span>Face ID Registered</span>
                          </div>
                          <p className="text-[11px] text-emerald-700/80">Manager can log in using face scanner on login page</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={startCameraForManager}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100 border border-emerald-300 transition shadow-sm flex items-center gap-1"
                        >
                          <Camera size={13} /> Re-Scan
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveManagerFace}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition"
                          title="Remove Face ID"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-gray-200 border-dashed rounded-xl flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <Camera className="w-4 h-4 text-gray-400 shrink-0" />
                        <span>No face biometrics registered for this manager yet.</span>
                      </div>
                      <button
                        type="button"
                        onClick={startCameraForManager}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#16423C] hover:bg-[#1f5a52] transition shadow flex items-center gap-1.5 shrink-0"
                      >
                        <Scan size={13} /> Scan & Register Face
                      </button>
                    </div>
                  )}
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

      {/* Interactive Face Scanner Camera Modal */}
      {cameraActive && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-3xl p-6 max-w-md w-full border border-teal-500/30 shadow-2xl relative space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Scan size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Register Manager Face ID</h3>
                  <p className="text-[11px] text-teal-200/80">Scan manager face to store biometrics</p>
                </div>
              </div>
              <button
                type="button"
                onClick={stopCameraForManager}
                className="p-1 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Video Box */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] w-full flex items-center justify-center border-2 border-teal-500/50">
              {cameraLoading ? (
                <div className="flex flex-col items-center justify-center space-y-2 p-6 text-center">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
                  <p className="text-xs text-gray-300">Initializing camera & face models...</p>
                </div>
              ) : (
                <>
                  <video
                    ref={faceVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform -scale-x-100"
                  />
                  {/* Overlay HUD */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                    <div
                      className={`relative w-44 h-52 rounded-3xl border-2 transition-all duration-300 ${faceDetected
                        ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_20px_rgba(16,185,129,0.4)]'
                        : 'border-teal-300/40 border-dashed animate-pulse'
                        }`}
                    >
                      {/* Laser Scanner Line */}
                      <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#34d399] animate-bounce"></div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Status & Error */}
            <div className="text-center space-y-1.5">
              {faceScanError ? (
                <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span>{faceScanError}</span>
                </div>
              ) : (
                <p className="text-xs text-gray-300">
                  {faceDetected ? (
                    <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                      <Sparkles size={14} /> Face Detected! Ready to Capture
                    </span>
                  ) : (
                    'Position the manager\'s face inside the guide frame'
                  )}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCaptureManagerFace}
                disabled={!faceDetected || capturingFace}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 transition shadow-lg flex items-center justify-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {capturingFace ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Capturing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>Capture Face ID</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={stopCameraForManager}
                className="py-3 px-4 rounded-xl font-semibold text-gray-300 bg-slate-800 hover:bg-slate-700 transition text-sm"
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