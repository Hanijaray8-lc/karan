import React, { useState, useRef, useEffect } from 'react';
// Import logo from src so bundler includes it in production/native builds.
// Place your image at `Frontend/src/assets/KaranLogo.jpeg` (or .png)
import KaranLogo from '../assets/karanLogo.jpeg';
import axios from 'axios';
import { CheckCircle, Clock, LogOut, User, RefreshCw, AlertCircle, Scan, X, Sparkles } from 'lucide-react';
import { loadFaceApiModels, getFaceDescriptor } from '../utils/faceRecognition';
import { requestCameraPermissions } from '../utils/cameraService';
import { prewarmLocalDatabase } from '../services/prewarmService';

const API_URL = process.env.REACT_APP_API_URL || 'https://karanfinance.com/api';

export default function Login() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const popupTimeoutRef = useRef(null);
  const redirectTimeoutRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const [showFallbackLogo, setShowFallbackLogo] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Face Scan Login state
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState('idle'); // 'idle' | 'initializing' | 'scanning' | 'verifying' | 'success' | 'failed'
  const [faceScanError, setFaceScanError] = useState('');
  const [faceDetected, setFaceDetected] = useState(false);
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceScanIntervalRef = useRef(null);
  const isVerifyingRef = useRef(false);

  // Waiting for Admin Approval state
  const [showWaitingApproval, setShowWaitingApproval] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [isApprovedSuccess, setIsApprovedSuccess] = useState(false);

  const showPopup = (type, title, message, duration = 2000) => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    setPopup({ visible: true, type, title, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup(prev => ({ ...prev, visible: false }));
      popupTimeoutRef.current = null;
    }, duration);
  };

  // Poll server for approval status
  const startStatusPolling = (token, currentUser) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await axios.get(`${API_URL}/auth/check-status`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.data && res.data.success) {
          const freshStatus = res.data.status;
          const userRole = res.data.role || currentUser?.role;

          if (freshStatus === 'Active') {
            // Approval detected!
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;

            // Update user in localStorage
            const updatedUser = {
              ...currentUser,
              ...(res.data.user || {}),
              status: 'Active'
            };
            localStorage.setItem('user', JSON.stringify(updatedUser));

            // Show celebratory approved UI
            setIsApprovedSuccess(true);

            // Auto-navigate to dashboard after 1.5 seconds
            setTimeout(() => {
              if (userRole === 'admin') {
                window.location.href = '/Admin/AdminDashboard';
              } else if (userRole === 'manager') {
                window.location.href = '/Manager/managerdashboard';
              } else {
                window.location.href = '/AgentDashboard';
              }
            }, 1500);
          } else if (freshStatus === 'Rejected' || freshStatus === 'Inactive') {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
            handleLogoutPending('Your login request has been rejected or account is inactive. Please contact Admin/Manager.');
          }
        }
      } catch (err) {
        // If user was deleted by admin or token invalid
        if (err.response?.status === 401 || err.response?.status === 404) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          handleLogoutPending('Your account is no longer valid. Please contact Admin or Manager.');
        }
      }
    }, 2000);
  };

  // Handle page refresh or reopen: check if user is already logged in with Pending status
  useEffect(() => {
    try {
      const token = localStorage.getItem('token');
      const userRaw = localStorage.getItem('user');

      if (token && userRaw) {
        const user = JSON.parse(userRaw);
        if (user && user.status === 'Pending') {
          setPendingUser(user);
          setShowWaitingApproval(true);
          startStatusPolling(token, user);
        }
      }
    } catch (e) {
      // ignore
    }

    return () => {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (faceScanIntervalRef.current) clearInterval(faceScanIntervalRef.current);
      if (faceStreamRef.current) {
        faceStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const openFaceScanModal = async () => {
    setError('');
    setFaceScanError('');
    setFaceScanStatus('initializing');
    setShowFaceModal(true);
    isVerifyingRef.current = false;

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
      setFaceScanStatus('scanning');

      setTimeout(() => {
        if (faceVideoRef.current) {
          faceVideoRef.current.srcObject = stream;
          faceVideoRef.current.play().catch(e => console.error(e));
          startFaceAutoScanLoop();
        }
      }, 200);
    } catch (err) {
      console.error('Face scan camera error:', err);
      setFaceScanStatus('failed');
      setFaceScanError('Unable to access camera. Please allow webcam permission in your browser.');
    }
  };

  const closeFaceScanModal = () => {
    if (faceScanIntervalRef.current) {
      clearInterval(faceScanIntervalRef.current);
      faceScanIntervalRef.current = null;
    }
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach(track => track.stop());
      faceStreamRef.current = null;
    }
    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
    setShowFaceModal(false);
    setFaceScanStatus('idle');
    setFaceScanError('');
    setFaceDetected(false);
    isVerifyingRef.current = false;
  };

  const startFaceAutoScanLoop = () => {
    if (faceScanIntervalRef.current) clearInterval(faceScanIntervalRef.current);

    faceScanIntervalRef.current = setInterval(async () => {
      if (!faceVideoRef.current || faceVideoRef.current.paused || faceVideoRef.current.ended || isVerifyingRef.current) {
        return;
      }

      try {
        const detection = await getFaceDescriptor(faceVideoRef.current);
        if (detection && detection.descriptor && detection.descriptor.length === 128) {
          setFaceDetected(true);
          // Auto-trigger verification when a confident face is locked in
          if (detection.score > 0.65 && !isVerifyingRef.current) {
            handlePerformFaceLogin(detection.descriptor);
          }
        } else {
          setFaceDetected(false);
        }
      } catch (err) {
        // scan loop noise
      }
    }, 500);
  };

  const handlePerformFaceLogin = async (descriptorParam) => {
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setFaceScanStatus('verifying');
    setFaceScanError('');

    try {
      let descriptor = descriptorParam;
      if (!descriptor && faceVideoRef.current) {
        const detection = await getFaceDescriptor(faceVideoRef.current);
        if (detection && detection.descriptor) {
          descriptor = detection.descriptor;
        }
      }

      if (!descriptor || descriptor.length !== 128) {
        setFaceScanStatus('scanning');
        isVerifyingRef.current = false;
        setFaceScanError('No clear face detected. Please look straight at the camera in good lighting.');
        return;
      }

      const res = await axios.post(`${API_URL}/auth/face-login`, { descriptor });

      if (res.data && res.data.success) {
        setFaceScanStatus('success');
        const user = res.data.user;
        const token = res.data.token;

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        prewarmLocalDatabase();

        const role = user.role;
        const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

        // Check if user status is Pending (Waiting for Admin Approval)
        if (user.status === 'Pending') {
          closeFaceScanModal();
          setPendingUser(user);
          setShowWaitingApproval(true);
          startStatusPolling(token, user);
          return;
        }

        showPopup('success', 'Face Verified!', `Welcome ${roleDisplay}!`, 2000);

        setTimeout(() => {
          closeFaceScanModal();
          if (role === 'admin') {
            window.location.href = '/Admin/AdminDashboard';
          } else if (role === 'manager') {
            window.location.href = '/Manager/managerdashboard';
          } else {
            window.location.href = '/AgentDashboard';
          }
        }, 1200);
      }
    } catch (err) {
      console.error('Face login error:', err);
      setFaceScanStatus('failed');
      isVerifyingRef.current = false;
      setFaceScanError(err.response?.data?.message || 'Face not recognized. Make sure your face is registered or use password login.');
    }
  };

  const retryFaceScan = () => {
    isVerifyingRef.current = false;
    setFaceScanError('');
    setFaceScanStatus('scanning');
    startFaceAutoScanLoop();
  };

  const handleLogoutPending = (msg = '') => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setShowWaitingApproval(false);
    setPendingUser(null);
    setIsApprovedSuccess(false);
    if (msg) setError(msg);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Use formData as-is (avoid forcing lowercase which can break exact username checks)
      const loginData = { ...formData };
      const res = await axios.post(`${API_URL}/auth/login`, loginData);

      if (res.data.success) {
        const user = res.data.user;
        const token = res.data.token;

        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        prewarmLocalDatabase();

        // Check if user status is Pending (Waiting for Admin Approval)
        if (user.status === 'Pending') {
          setPendingUser(user);
          setShowWaitingApproval(true);
          setLoading(false);
          startStatusPolling(token, user);
          return;
        }

        // Active user: show success popup and redirect
        const role = user.role;
        const roleDisplay = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
        showPopup('success', 'Login Successful', `Welcome ${roleDisplay}!`, 2000);

        // Redirect after popup is shown
        redirectTimeoutRef.current = setTimeout(() => {
          if (role === 'admin') {
            window.location.href = '/Admin/AdminDashboard';
          } else if (role === 'manager') {
            window.location.href = '/Manager/managerdashboard';
          } else {
            window.location.href = '/AgentDashboard';
          }
        }, 2100);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Login Failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 relative">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 transform transition-all hover:scale-105 duration-300">
        {/* Logo/Icon Section - Click to Open Face Scan Login */}
        <div className="flex justify-center mb-6">
          <button
            type="button"
            onClick={openFaceScanModal}
            className="w-20 h-20 rounded-full bg-[#16423c] flex items-center justify-center overflow-hidden cursor-pointer hover:ring-4 hover:ring-emerald-500/50 hover:scale-110 active:scale-95 transition-all duration-300 shadow-md relative group focus:outline-none focus:ring-4 focus:ring-emerald-600/60"
            title="Click logo to Scan Face & Login"
            aria-label="Click logo to Scan Face & Login"
          >
            {!showFallbackLogo ? (
              <img
                src={KaranLogo}
                alt="Karan Finance - Click to Face Scan"
                className="w-20 h-20 object-cover group-hover:opacity-90 transition-opacity"
                onError={() => setShowFallbackLogo(true)}
              />
            ) : (
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6-2.28 0-2.56 3.5-4.72 6-4.72s6 2.16 6 4.72c-1.57 1.46-3.97 2.28-6 2.28z" />
              </svg>
            )}
          </button>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold mb-2 text-center" style={{ color: '#16423c' }}>
          Karan Finance
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">Welcome back! Please login to your account</p>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Username Field */}
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="username">
              Username
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </span>
              <input
                id="username"
                type="text"
                placeholder="Enter your username"
                className="w-full border border-gray-300 pl-10 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423c] focus:border-transparent transition"
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                value={formData.username}
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-semibold mb-2" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your password"
                className="w-full border border-gray-300 pl-10 pr-10 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423c] focus:border-transparent transition"
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                value={formData.password}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3.172 3.172a.75.75 0 011.06 0l12.596 12.597a.75.75 0 11-1.06 1.06L3.172 4.232a.75.75 0 010-1.06z" />
                    <path d="M10 4.5c4.97 0 8.5 4 8.5 7.5 0 .875-.233 1.72-.66 2.463l-1.06-1.06A6.99 6.99 0 0017.5 12c0-3.038-3.134-6-7.5-6a7.03 7.03 0 00-2.12.33L6.64 4.57A8.02 8.02 0 0110 4.5z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Forgot Password Link */}
          <div className="flex items-center justify-end mb-6">
            <a href="#" className="text-sm hover:underline" style={{ color: '#16423c' }}>
              Forgot Password?
            </a>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full text-white py-3 rounded-lg font-bold transition transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            style={{ backgroundColor: '#16423c' }}
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Logging in...
              </div>
            ) : (
              'Login'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center mt-6 text-sm text-gray-600">
          © 2026 Karan Finance. All rights reserved.
        </p>
      </div>

      {/* Interactive Face Scan Login Modal */}
      {showFaceModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-7 max-w-md w-full border border-teal-500/30 shadow-2xl relative overflow-hidden space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                  <Scan className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Face ID Authentication</h3>
                  <p className="text-[11px] text-teal-200/80">Admin Biometric Login</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeFaceScanModal}
                className="p-1.5 rounded-full text-gray-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Camera Viewport with Futuristic Scanning Overlay */}
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] w-full flex items-center justify-center border-2 border-teal-500/50 shadow-[0_0_20px_rgba(20,184,166,0.15)]">
              {faceScanStatus === 'initializing' ? (
                <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-teal-400" />
                  <p className="text-xs text-gray-300 font-medium">Initializing camera & neural models...</p>
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

                  {/* HUD Overlay */}
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
                    {/* Face Bounding Reticle */}
                    <div
                      className={`relative w-48 h-56 rounded-3xl border-2 transition-all duration-300 ${faceScanStatus === 'success'
                        ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_30px_#34d399]'
                        : faceDetected
                          ? 'border-teal-400 bg-teal-500/10 shadow-[0_0_20px_rgba(45,212,191,0.4)]'
                          : 'border-teal-300/40 border-dashed animate-pulse'
                        }`}
                    >
                      {/* Reticle Corners */}
                      <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 border-teal-300"></div>
                      <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 border-teal-300"></div>
                      <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 border-teal-300"></div>
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 border-teal-300"></div>

                      {/* Laser Scanner Line */}
                      {faceScanStatus !== 'success' && faceScanStatus !== 'failed' && (
                        <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-teal-300 to-transparent shadow-[0_0_10px_#2dd4bf] animate-bounce"></div>
                      )}

                      {/* Success Checkmark in Box */}
                      {faceScanStatus === 'success' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-emerald-950/40 rounded-3xl">
                          <CheckCircle className="w-16 h-16 text-emerald-400 animate-bounce" />
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Status Feedback Display */}
            <div className="text-center space-y-2">
              {faceScanStatus === 'verifying' && (
                <div className="inline-flex items-center gap-2 text-xs font-bold text-teal-300 bg-teal-950/80 px-3.5 py-1.5 rounded-full border border-teal-700/50">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Matching face biometric vector...</span>
                </div>
              )}

              {faceScanStatus === 'scanning' && (
                <div className="text-xs text-gray-300">
                  {faceDetected ? (
                    <span className="text-teal-300 font-semibold">Face aligned! Verifying automatically...</span>
                  ) : (
                    <span>Position your face clearly within the frame.</span>
                  )}
                </div>
              )}

              {faceScanStatus === 'success' && (
                <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-950/80 px-4 py-2 rounded-full border border-emerald-600">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Face Verified! Logging in Admin...</span>
                </div>
              )}

              {faceScanError && (
                <div className="p-3 rounded-xl bg-red-950/70 border border-red-800/80 text-red-200 text-xs text-left flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>{faceScanError}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2.5 pt-1">
              {faceScanStatus === 'failed' ? (
                <button
                  type="button"
                  onClick={retryFaceScan}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 transition flex items-center justify-center gap-2 text-sm shadow-lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Try Again / Re-Scan</span>
                </button>
              ) : faceScanStatus === 'scanning' ? (
                <button
                  type="button"
                  onClick={() => handlePerformFaceLogin()}
                  disabled={!faceDetected}
                  className="flex-1 py-2.5 px-4 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 transition flex items-center justify-center gap-2 text-sm shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Scan className="w-4 h-4" />
                  <span>Capture & Verify</span>
                </button>
              ) : null}

              <button
                type="button"
                onClick={closeFaceScanModal}
                className="py-2.5 px-4 rounded-xl font-semibold text-gray-300 bg-slate-800 hover:bg-slate-700 transition text-sm"
              >
                Use Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Waiting for Admin Approval Screen / Modal */}
      {showWaitingApproval && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-white/40 transform transition-all scale-100">
            {/* Modal Header with Gradient */}
            <div className={`px-6 py-6 text-white text-center transition-colors duration-500 ${isApprovedSuccess ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-[#16423c] to-[#1e584f]'}`}>
              <div className="relative w-20 h-20 mx-auto mb-3">
                {isApprovedSuccess ? (
                  <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center animate-bounce">
                    <CheckCircle className="w-12 h-12 text-white" />
                  </div>
                ) : (
                  <div className="relative w-20 h-20">
                    {/* Pulsing Aura Rings */}
                    <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping"></div>
                    <div className="relative w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-400/60 flex items-center justify-center">
                      <Clock className="w-10 h-10 text-amber-300 animate-pulse" />
                    </div>
                  </div>
                )}
              </div>

              <h2 className="text-2xl font-black tracking-tight">
                {isApprovedSuccess ? 'Approval Granted!' : 'Waiting for Admin / Manager Approval'}
              </h2>
              <p className="text-xs text-emerald-100/90 mt-1 font-medium">
                {isApprovedSuccess
                  ? 'Your account has been approved! Redirecting to your dashboard...'
                  : 'Your login request is waiting for Admin or Manager approval'}
              </p>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 text-gray-700">
              {/* User Identity Details Card */}
              {pendingUser && (
                <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-2.5">
                  <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-[#16423c]" />
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account</span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#16423c]/10 text-[#16423c] uppercase">
                      {pendingUser.role || 'Staff'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Name:</span>
                    <strong className="text-gray-900 font-bold">{pendingUser.name || pendingUser.username}</strong>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Username:</span>
                    <span className="text-gray-700 font-medium">@{pendingUser.username}</span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Status:</span>
                    {isApprovedSuccess ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                        <CheckCircle size={12} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                        Pending Approval
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Status Message & Live Polling Status */}
              <div className="text-center space-y-2">
                {!isApprovedSuccess ? (
                  <>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Your login request has been sent to the <strong>Admin and Manager</strong>. Once approved, this window will <strong>automatically redirect</strong> to your dashboard.
                    </p>
                    <div className="inline-flex items-center gap-2 text-xs text-[#16423c] font-semibold bg-emerald-50 px-3 py-1.5 rounded-full border border-emerald-200">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#16423c]" />
                      <span>Checking approval status in real-time...</span>
                    </div>
                  </>
                ) : (
                  <div className="py-2">
                    <div className="inline-flex items-center gap-2 text-sm text-emerald-700 font-bold bg-emerald-50 px-4 py-2 rounded-full border border-emerald-200 animate-pulse">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span>Redirecting to your dashboard...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Button: Logout / Switch Account */}
              {!isApprovedSuccess && (
                <div className="pt-2 border-t border-gray-100">
                  <button
                    onClick={() => handleLogoutPending()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-gray-600 hover:text-red-700 hover:bg-red-50 border border-gray-200 transition-all duration-200"
                  >
                    <LogOut size={14} /> Log Out / Switch Account
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Login Success Popup */}
      {popup.visible && popup.type === 'success' && (
        <div className="fixed top-5 right-5 z-[2001] p-4 rounded-lg shadow-xl flex items-start gap-3 max-w-xs font-medium bg-green-600 text-white border border-green-700">
          <div className="flex-shrink-0 mt-0.5">
            <CheckCircle size={28} />
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