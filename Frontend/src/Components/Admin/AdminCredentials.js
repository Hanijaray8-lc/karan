import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminNavbar from './AdminNavbar';
import {
  ShieldCheck,
  Camera,
  Scan,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Sparkles,
  Info,
  Check,
  X
} from 'lucide-react';
import {
  loadFaceApiModels,
  getFaceDescriptor,
  captureVideoSnapshot
} from '../../utils/faceRecognition';
import { requestCameraPermissions } from '../../utils/cameraService';

const API_URL = process.env.REACT_APP_API_URL || 'https://karanfinance.com/api';

export default function AdminCredentials() {
  const navigate = useNavigate();

  // Admin Profile State
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    faceRegistered: false,
    faceRegisteredAt: null,
    facePhoto: ''
  });
  const [loadingProfile, setLoadingProfile] = useState(true);

  // Form State for Credentials Update
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    newPassword: '',
    confirmPassword: '',
    currentPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [updatingCredentials, setUpdatingCredentials] = useState(false);
  const [credMessage, setCredMessage] = useState({ type: '', text: '' });

  // Camera & Face Registration State
  const [cameraActive, setCameraActive] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [registeringFace, setRegisteringFace] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceMessage, setFaceMessage] = useState({ type: '', text: '' });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingFace, setDeletingFace] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);

  // Check auth and fetch current admin credentials
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userRaw = localStorage.getItem('user');

    if (!token || !userRaw) {
      navigate('/');
      return;
    }

    try {
      const user = JSON.parse(userRaw);
      if (user.role !== 'admin') {
        navigate('/');
        return;
      }
    } catch (e) {
      navigate('/');
      return;
    }

    fetchAdminCredentials(token);
    // Preload face-api models in background
    loadFaceApiModels()
      .then(() => setModelsReady(true))
      .catch((err) => console.error('Model preload err:', err));

    return () => {
      stopCamera();
    };
  }, [navigate]);

  const fetchAdminCredentials = async (tokenOverride) => {
    const token = tokenOverride || localStorage.getItem('token');
    try {
      setLoadingProfile(true);
      const res = await axios.get(`${API_URL}/admin/credentials`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success) {
        const admin = res.data.admin;
        setProfile({
          username: admin.username || '',
          email: admin.email || '',
          faceRegistered: admin.faceRegistered || false,
          faceRegisteredAt: admin.faceRegisteredAt,
          facePhoto: admin.facePhoto || ''
        });
        setFormData(prev => ({
          ...prev,
          username: admin.username || '',
          email: admin.email || '',
          newPassword: '',
          confirmPassword: '',
          currentPassword: ''
        }));
      }
    } catch (err) {
      console.error('Failed to fetch admin credentials:', err);
      setCredMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to load admin profile.'
      });
    } finally {
      setLoadingProfile(false);
    }
  };

  // Handle Credentials Submit
  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();
    setCredMessage({ type: '', text: '' });

    if (formData.newPassword && formData.newPassword !== formData.confirmPassword) {
      setCredMessage({ type: 'error', text: 'New password and confirm password do not match.' });
      return;
    }

    if (formData.newPassword && formData.newPassword.length < 4) {
      setCredMessage({ type: 'error', text: 'Password must be at least 4 characters.' });
      return;
    }

    try {
      setUpdatingCredentials(true);
      const token = localStorage.getItem('token');

      const payload = {
        username: formData.username,
        email: formData.email,
        currentPassword: formData.currentPassword
      };
      if (formData.newPassword) {
        payload.password = formData.newPassword;
      }

      const res = await axios.put(`${API_URL}/admin/credentials`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success) {
        setCredMessage({ type: 'success', text: 'Admin credentials updated successfully!' });

        // Update user in localStorage
        const userRaw = localStorage.getItem('user');
        if (userRaw) {
          const u = JSON.parse(userRaw);
          u.username = res.data.admin.username;
          u.email = res.data.admin.email;
          localStorage.setItem('user', JSON.stringify(u));
        }

        setFormData(prev => ({
          ...prev,
          newPassword: '',
          confirmPassword: '',
          currentPassword: ''
        }));
        setProfile(prev => ({
          ...prev,
          username: res.data.admin.username,
          email: res.data.admin.email
        }));
      }
    } catch (err) {
      console.error('Update credentials error:', err);
      setCredMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update credentials. Please check current password.'
      });
    } finally {
      setUpdatingCredentials(false);
    }
  };

  // Camera Management
  const startCamera = async () => {
    setFaceMessage({ type: '', text: '' });
    try {
      setDetecting(true);
      await requestCameraPermissions().catch(() => { });
      await loadFaceApiModels();
      setModelsReady(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      streamRef.current = stream;
      setCameraActive(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.error(e));
          startFaceDetectionLoop();
        }
      }, 200);
    } catch (err) {
      console.error('Camera access error:', err);
      setFaceMessage({
        type: 'error',
        text: 'Unable to access webcam. Please allow camera permissions in your browser.'
      });
      setCameraActive(false);
      setDetecting(false);
    }
  };

  const stopCamera = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
      detectIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setFaceDetected(false);
    setDetecting(false);
  };

  const startFaceDetectionLoop = () => {
    if (detectIntervalRef.current) clearInterval(detectIntervalRef.current);

    detectIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;

      try {
        const detection = await getFaceDescriptor(videoRef.current);
        if (detection && detection.descriptor) {
          setFaceDetected(true);
        } else {
          setFaceDetected(false);
        }
      } catch (err) {
        // Ignore loop detection noise
      }
    }, 600);
  };

  // Register Face Action
  const handleRegisterFace = async () => {
    if (!videoRef.current) return;
    setFaceMessage({ type: '', text: '' });
    setRegisteringFace(true);

    try {
      // 1. Detect face and get 128-d descriptor
      const result = await getFaceDescriptor(videoRef.current);

      if (!result || !result.descriptor || result.descriptor.length !== 128) {
        setFaceMessage({
          type: 'error',
          text: 'No clear face detected. Please face the camera directly in good lighting.'
        });
        setRegisteringFace(false);
        return;
      }

      // 2. Capture a clean snapshot for admin preview
      const snapshot = captureVideoSnapshot(videoRef.current);

      // 3. Send descriptor and snapshot to backend
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_URL}/admin/register-face`,
        { descriptor: result.descriptor, photo: snapshot },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data && res.data.success) {
        setProfile(prev => ({
          ...prev,
          faceRegistered: true,
          faceRegisteredAt: res.data.faceRegisteredAt || new Date().toISOString(),
          facePhoto: res.data.facePhoto || snapshot
        }));
        setFaceMessage({
          type: 'success',
          text: 'Face registered successfully! You can now use Face Scan Login.'
        });
        stopCamera();
      }
    } catch (err) {
      console.error('Face registration failed:', err);
      setFaceMessage({
        type: 'error',
        text: err.response?.data?.message || 'Face registration failed. Please try again.'
      });
    } finally {
      setRegisteringFace(false);
    }
  };

  // Remove Registered Face
  const handleDeleteFace = async () => {
    try {
      setDeletingFace(true);
      const token = localStorage.getItem('token');
      const res = await axios.delete(`${API_URL}/admin/delete-face`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success) {
        setProfile(prev => ({
          ...prev,
          faceRegistered: false,
          faceRegisteredAt: null,
          facePhoto: ''
        }));
        setFaceMessage({
          type: 'success',
          text: 'Face biometric data deleted successfully.'
        });
        setDeleteConfirmOpen(false);
      }
    } catch (err) {
      console.error('Failed to delete face data:', err);
      setFaceMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to remove face registration.'
      });
    } finally {
      setDeletingFace(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <AdminNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-800 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur text-emerald-200 text-xs font-semibold uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Security & Authentication
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Admin Profile & Face Biometrics</h1>
            <p className="text-emerald-100/90 text-sm max-w-2xl">
              Manage your administrator credentials and register your facial biometrics to enable instant, passwordless Face ID login.
            </p>
          </div>

          <div className="flex items-center gap-3 self-stretch sm:self-auto bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10">
            <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-bold text-xl text-white">
              {profile.username ? profile.username.charAt(0).toUpperCase() : 'A'}
            </div>
            <div>
              <div className="text-sm font-bold">{profile.username || 'Admin'}</div>
              <div className="text-xs text-emerald-200">{profile.email || 'admin@karanfinance.com'}</div>
            </div>
          </div>
        </div>

        {loadingProfile ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500 space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-emerald-700" />
            <p className="text-sm font-medium">Loading administrator security settings...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column: Admin Credentials Form (5 Cols) */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-gray-100 relative overflow-hidden">
                <div className="flex items-center justify-between pb-5 border-b border-gray-100 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Admin Credentials</h2>
                      <p className="text-xs text-gray-500">Update username, email & password</p>
                    </div>
                  </div>
                </div>

                {/* Feedback message */}
                {credMessage.text && (
                  <div
                    className={`p-4 rounded-2xl mb-6 flex items-start gap-3 text-sm ${credMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                  >
                    {credMessage.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <span>{credMessage.text}</span>
                  </div>
                )}

                <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                  {/* Username Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        required
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm text-gray-900 font-medium transition"
                        placeholder="admin"
                      />
                    </div>
                  </div>

                  {/* Email Field */}
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                        <Mail className="w-4 h-4" />
                      </span>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm text-gray-900 font-medium transition"
                        placeholder="admin@karanfinance.com"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-xs font-semibold text-gray-500 mb-3">Change Password (Leave blank to keep current)</p>

                    {/* New Password */}
                    <div className="mb-3">
                      <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                        New Password
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                          <Lock className="w-4 h-4" />
                        </span>
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          value={formData.newPassword}
                          onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                          className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm text-gray-900 font-medium transition"
                          placeholder="Enter new password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                        >
                          {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm New Password */}
                    {formData.newPassword && (
                      <div className="mb-3">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                            <Lock className="w-4 h-4" />
                          </span>
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm text-gray-900 font-medium transition"
                            placeholder="Re-type new password"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Current Password Verification */}
                  <div className="pt-2 border-t border-gray-100">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                      Current Password <span className="text-gray-400 font-normal">(for verification)</span>
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                        <Lock className="w-4 h-4" />
                      </span>
                      <input
                        type={showCurrentPassword ? 'text' : 'password'}
                        value={formData.currentPassword}
                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:border-transparent text-sm text-gray-900 font-medium transition"
                        placeholder="Enter current password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                      >
                        {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={updatingCredentials}
                      className="w-full py-3 px-4 rounded-xl font-bold text-white bg-emerald-800 hover:bg-emerald-900 active:scale-[0.98] transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {updatingCredentials ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Save Credentials</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right Column: Face Biometric Registration (7 Cols) */}
            <div className="lg:col-span-7 space-y-6">
              <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-sm border border-gray-100 relative overflow-hidden">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-gray-100 mb-6 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
                      <Scan className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">Face ID Biometrics</h2>
                      <p className="text-xs text-gray-500">Scan & store face vector for 1-click Face Login</p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    {profile.faceRegistered ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
                        Face ID Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Not Registered
                      </span>
                    )}
                  </div>
                </div>

                {/* Feedback message */}
                {faceMessage.text && (
                  <div
                    className={`p-4 rounded-2xl mb-6 flex items-start gap-3 text-sm ${faceMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                      }`}
                  >
                    {faceMessage.type === 'success' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    )}
                    <span>{faceMessage.text}</span>
                  </div>
                )}

                {/* Main Registration Area */}
                {!cameraActive ? (
                  <div className="space-y-6">
                    {/* Status Info Card */}
                    {profile.faceRegistered ? (
                      <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-5 border border-emerald-100 flex flex-col sm:flex-row items-center gap-5">
                        {profile.facePhoto ? (
                          <img
                            src={profile.facePhoto}
                            alt="Registered Admin Face"
                            className="w-24 h-24 rounded-2xl object-cover border-2 border-emerald-600 shadow-md"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-bold text-3xl shadow-md">
                            <ShieldCheck className="w-12 h-12" />
                          </div>
                        )}

                        <div className="space-y-1 text-center sm:text-left flex-1">
                          <div className="flex items-center justify-center sm:justify-start gap-2">
                            <h3 className="font-bold text-gray-900 text-base">Face ID Registered</h3>
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </div>
                          <p className="text-xs text-gray-600">
                            Your face embedding vector is securely stored in database. You can use the Face Scan button on the Login page to authenticate instantly.
                          </p>
                          {profile.faceRegisteredAt && (
                            <p className="text-[11px] text-gray-400 font-medium">
                              Registered on: {new Date(profile.faceRegisteredAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200 text-center space-y-3">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
                          <Scan className="w-8 h-8" />
                        </div>
                        <h3 className="font-bold text-gray-900 text-base">No Face ID Registered Yet</h3>
                        <p className="text-xs text-gray-500 max-w-md mx-auto leading-relaxed">
                          Scan your face once using your webcam. The biometric vector is safely stored in the database so you can log in without typing your password!
                        </p>
                      </div>
                    )}

                    {/* How it works guidance */}
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                        <Info className="w-4 h-4 text-emerald-700" />
                        <span>Best Practices for Face Registration:</span>
                      </div>
                      <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside pl-1">
                        <li>Ensure good frontal lighting (avoid bright lights behind you).</li>
                        <li>Look directly at the webcam without tilting your head.</li>
                        <li>Remove heavy sunglasses, masks, or hats for best recognition accuracy.</li>
                      </ul>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-teal-700 hover:bg-teal-800 active:scale-[0.98] transition shadow-md flex items-center justify-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{profile.faceRegistered ? 'Re-Scan / Update Face ID' : 'Start Camera & Register Face'}</span>
                      </button>

                      {profile.faceRegistered && (
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmOpen(true)}
                          className="py-3 px-4 rounded-xl font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition flex items-center justify-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Remove Face ID</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Active Camera Live Scanner View */
                  <div className="space-y-4">
                    <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] max-h-[380px] w-full flex items-center justify-center border-2 border-teal-500 shadow-inner">
                      {/* Live Video Feed */}
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                      />

                      {/* Futuristic Scanner HUD Overlay */}
                      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                        {/* Target Face Frame / Reticle */}
                        <div
                          className={`relative w-48 h-56 sm:w-56 sm:h-64 rounded-3xl border-2 transition-all duration-300 ${faceDetected
                            ? 'border-emerald-400 bg-emerald-500/10 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                            : 'border-teal-300/60 border-dashed animate-pulse'
                            }`}
                        >
                          {/* Corner Reticles */}
                          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg"></div>
                          <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg"></div>
                          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg"></div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg"></div>

                          {/* Animated Laser Scan Beam */}
                          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-bounce"></div>
                        </div>

                        {/* Status Label on Overlay */}
                        <div className="absolute bottom-4 inset-x-4 flex justify-center">
                          <div
                            className={`px-4 py-1.5 rounded-full text-xs font-bold backdrop-blur-md flex items-center gap-2 shadow-lg transition-all ${faceDetected
                              ? 'bg-emerald-600/90 text-white border border-emerald-400'
                              : 'bg-black/70 text-amber-300 border border-amber-400/40'
                              }`}
                          >
                            {faceDetected ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                                <span>Face Detected! Ready to Capture</span>
                              </>
                            ) : (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                                <span>Position your face inside the frame...</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Camera Control Actions */}
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleRegisterFace}
                        disabled={registeringFace || !faceDetected}
                        className="flex-1 py-3.5 px-4 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {registeringFace ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Computing & Saving Biometrics...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-5 h-5 text-emerald-200" />
                            <span>Capture & Save Face ID</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={stopCamera}
                        disabled={registeringFace}
                        className="py-3.5 px-5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Delete Face Confirmation Modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4 border border-gray-100">
            <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-bold text-gray-900">Remove Face ID?</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Are you sure you want to remove your registered face biometric data? You will need to use your username and password to log in until you register a new face.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 py-2.5 rounded-xl font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 transition text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFace}
                disabled={deletingFace}
                className="flex-1 py-2.5 rounded-xl font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-md text-sm flex items-center justify-center gap-2"
              >
                {deletingFace ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Delete Face ID'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
