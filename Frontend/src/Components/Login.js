import React, { useState, useRef, useEffect } from 'react';
// Import logo from src so bundler includes it in production/native builds.
// Place your image at `Frontend/src/assets/KaranLogo.jpeg` (or .png)
import KaranLogo from '../assets/karanLogo.jpeg';
import axios from 'axios';
import { CheckCircle } from 'lucide-react';

export default function Login() {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const popupTimeoutRef = useRef(null);
  const redirectTimeoutRef = useRef(null);
  const [showFallbackLogo, setShowFallbackLogo] = useState(false);

  const showPopup = (type, title, message, duration = 2000) => {
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
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Convert username to lowercase for case-insensitive login
      const loginData = {
        ...formData,
        username: formData.username.toLowerCase()
      };
      const res = await axios.post('http://localhost:5000/api/auth/login', loginData);

      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('user', JSON.stringify(res.data.user));

        // Show success popup with role
        const role = res.data.user.role;
        const roleDisplay = role.charAt(0).toUpperCase() + role.slice(1);
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-96 transform transition-all hover:scale-105 duration-300">
        {/* Logo/Icon Section */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-[#16423c] flex items-center justify-center overflow-hidden">
            {!showFallbackLogo ? (
              <img
                src={KaranLogo}
                alt="Karan Finance"
                className="w-20 h-20 object-cover"
                onError={() => setShowFallbackLogo(true)}
              />
            ) : (
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm0 14c-2.03 0-4.43-.82-6-2.28 0-2.56 3.5-4.72 6-4.72s6 2.16 6 4.72c-1.57 1.46-3.97 2.28-6 2.28z" />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <h2 className="text-3xl font-bold mb-2 text-center" style={{ color: '#16423c' }}>
          Karan Finance
        </h2>
        <p className="text-gray-500 text-center mb-8 text-sm">Welcome back! Please login to your account</p>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded">
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
                type="password"
                placeholder="Enter your password"
                className="w-full border border-gray-300 pl-10 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423c] focus:border-transparent transition"
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                value={formData.password}
                required
              />
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
            className="w-full text-white py-3 rounded-lg font-bold transition transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Login Success Popup */}
      {popup.visible && popup.type === 'success' && (
        <div className="fixed top-5 right-5 z-[1001] p-4 rounded-lg shadow-xl flex items-start gap-3 max-w-xs font-medium bg-green-600 text-white border border-green-700">
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