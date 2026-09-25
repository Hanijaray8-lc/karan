import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon, BellIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'https://karan-e26t.onrender.com/api';

const navItems = [
  { label: 'Dashboard', path: '/Admin/AdminDashboard' },
  { label: 'Approvals', path: '/Admin/AdminAproval', isApproval: true },
  { label: 'Add Manager', path: '/Admin/AddManager' },
  { label: 'Add Agent', path: '/Admin/AddAgent' },
  { label: 'Client Details', path: '/Admin/AClientDetails' },
  { label: 'Payment History', path: '/Admin/PaymentHistory' },
  { label: 'Pending Clients', path: '/Admin/PendingClients' },
  { label: 'Active / Inactive', path: '/Admin/Active-inactive' },
  { label: 'Admin Credentials', path: '/Admin/Credentials' },
];

const AdminNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [adminData, setAdminData] = useState({ name: 'Admin User', role: 'Super Admin' });
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingAgents, setPendingAgents] = useState([]);
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [newLoginAlert, setNewLoginAlert] = useState(null);

  const prevPendingCountRef = useRef(0);
  const dropdownRef = useRef(null);

  // LOGOUT LOGIC
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/'); // Redirect to login page
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem('user');
      if (saved) {
        const u = JSON.parse(saved);
        setAdminData({
          name: u.name || u.username || 'Admin User',
          role: u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : 'Super Admin'
        });
      }
    } catch (err) {
      // ignore
    }
  }, []);

  // Poll for pending agent approvals & login attempts
  useEffect(() => {
    const fetchPending = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await axios.get(`${API_URL}/agents/pending-approvals`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.data && res.data.success) {
          const count = res.data.pendingCount || 0;
          const agents = res.data.pendingAgents || [];

          // If a new agent login attempt just arrived, show top alert
          if (count > prevPendingCountRef.current && prevPendingCountRef.current !== 0) {
            const latest = agents[0];
            setNewLoginAlert(latest ? `${latest.name || latest.username} is requesting login approval!` : 'New agent login approval requested!');
            setTimeout(() => setNewLoginAlert(null), 5000);
          }
          prevPendingCountRef.current = count;

          setPendingCount(count);
          setPendingAgents(agents);
        }
      } catch (err) {
        // silent fail
      }
    };

    fetchPending();
    const interval = setInterval(fetchPending, 4000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowNotificationDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <>
      {/* Real-time Agent Login Toast Alert */}
      {newLoginAlert && (
        <div className="fixed top-18 right-6 z-50 bg-amber-500 text-gray-950 px-4 py-3 rounded-2xl shadow-2xl border-2 border-amber-300 font-bold text-xs flex items-center gap-3 animate-bounce">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></span>
          <span>🔔 {newLoginAlert}</span>
          <Link
            to="/Admin/AdminAproval"
            onClick={() => setNewLoginAlert(null)}
            className="ml-2 bg-gray-900 text-white px-2.5 py-1 rounded-lg text-[10px] hover:bg-black transition"
          >
            Review Now
          </Link>
        </div>
      )}

      <nav
        className="sticky top-0 z-40 bg-emerald-900 text-white w-full shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo + Brand */}
            <div className="flex items-center space-x-3">
              <img src="/karanLogo.jpeg" alt="Karan Finance" className="h-11 w-11 rounded-full object-cover" />
              <span className="text-2xl font-bold tracking-tight">
                Karan Finance
              </span>
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = location.pathname.toLowerCase() === item.path.toLowerCase() ||
                  (item.isApproval && (location.pathname.toLowerCase().includes('approval') || location.pathname.toLowerCase().includes('aproval')));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${isActive
                      ? 'bg-emerald-700 text-white'
                      : 'hover:bg-emerald-800'
                      }`}
                  >
                    <span>{item.label}</span>
                    {item.isApproval && pendingCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-400 text-gray-950 animate-pulse">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>

            {/* User Info + Bell Notification + Logout (desktop) */}
            <div className="hidden md:flex items-center space-x-3">
              {/* Notification Bell with Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                  className="relative p-2 rounded-full hover:bg-emerald-800 transition-colors text-white focus:outline-none"
                  title="Agent Approval Notifications"
                >
                  <BellIcon className="h-6 w-6" />
                  {pendingCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-extrabold flex items-center justify-center animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </button>

                {/* Dropdown Menu */}
                {showNotificationDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 text-gray-800 animate-fadeIn">
                    <div className="bg-[#16423c] text-white p-3.5 flex items-center justify-between">
                      <span className="font-bold text-xs">Agent Login Alerts</span>
                      <span className="text-[11px] bg-amber-400 text-gray-950 font-extrabold px-2 py-0.5 rounded-full">
                        {pendingCount} Pending
                      </span>
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
                      {pendingAgents.length === 0 ? (
                        <div className="p-4 text-center text-xs text-gray-500">
                          No pending agent login requests.
                        </div>
                      ) : (
                        pendingAgents.slice(0, 5).map((agent) => (
                          <Link
                            key={agent._id}
                            to="/Admin/AdminAproval"
                            onClick={() => setShowNotificationDropdown(false)}
                            className="p-3 flex items-center justify-between hover:bg-emerald-50/60 transition block"
                          >
                            <div className="text-left">
                              <div className="font-bold text-xs text-gray-900">{agent.name || agent.username}</div>
                              <div className="text-[11px] text-gray-500">@{agent.username} • Waiting for approval</div>
                            </div>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                              Review
                            </span>
                          </Link>
                        ))
                      )}
                    </div>

                    <div className="p-2 bg-gray-50 text-center border-t border-gray-100">
                      <Link
                        to="/Admin/AdminAproval"
                        onClick={() => setShowNotificationDropdown(false)}
                        className="text-xs font-bold text-[#16423c] hover:underline block py-1"
                      >
                        Open Approval Management →
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              {/* Admin Profile link */}
              <Link to="/Admin/Credentials" className="flex items-center space-x-2.5 p-1 rounded-xl hover:bg-emerald-800/80 transition-colors">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-sm shadow-sm">
                  {adminData.name ? adminData.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">{adminData.name}</div>
                  <div className="text-xs text-emerald-200 leading-tight">{adminData.role}</div>
                </div>
              </Link>

              {/* Logout Button */}
              <button
                onClick={() => setIsLogoutModalOpen(true)}
                className="p-2 rounded-full hover:bg-emerald-800 transition-colors text-white"
                title="Logout"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="md:hidden flex items-center space-x-2">
              {pendingCount > 0 && (
                <Link
                  to="/Admin/AdminAproval"
                  className="p-1 text-amber-300 relative"
                  title="Pending Approvals"
                >
                  <BellIcon className="h-6 w-6" />
                  <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full text-[9px] font-bold flex items-center justify-center text-white">
                    {pendingCount}
                  </span>
                </Link>
              )}
              <button
                onClick={toggleMobileMenu}
                className="p-2 rounded-md hover:bg-emerald-800 focus:outline-none"
              >
                {isMobileMenuOpen ? (
                  <XMarkIcon className="h-6 w-6" />
                ) : (
                  <Bars3Icon className="h-6 w-6" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          {isMobileMenuOpen && (
            <div
              className="md:hidden bg-emerald-800 py-4 px-2 space-y-2 border-t border-emerald-700"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {navItems.map((item) => {
                const isActive = location.pathname.toLowerCase() === item.path.toLowerCase() ||
                  (item.isApproval && (location.pathname.toLowerCase().includes('approval') || location.pathname.toLowerCase().includes('aproval')));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-4 py-3 rounded-md text-base font-medium ${isActive
                      ? 'bg-emerald-700 text-white'
                      : 'text-white hover:bg-emerald-700'
                      }`}
                  >
                    <span>{item.label}</span>
                    {item.isApproval && pendingCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-400 text-gray-900">
                        {pendingCount} Pending
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* Mobile User Info + Logout */}
              <div className="px-4 py-3 border-t border-emerald-700 mt-4 flex items-center justify-between">
                <Link to="/Admin/Credentials" onClick={() => setIsMobileMenuOpen(false)} className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg">
                    {adminData.name ? adminData.name.charAt(0).toUpperCase() : 'A'}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{adminData.name}</div>
                    <div className="text-xs text-emerald-300">{adminData.role}</div>
                  </div>
                </Link>

                <button
                  onClick={() => setIsLogoutModalOpen(true)}
                  className="p-2 rounded-full hover:bg-emerald-700 text-white"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <svg className="h-8 w-8 text-emerald-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7" />
              </svg>
            </div>
            <h4 className="text-xl font-bold text-gray-900">Sign Out</h4>
            <p className="text-gray-500 mt-2 mb-6">Are you sure you want to sign out, <span className="font-semibold text-emerald-700">{adminData.name}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
              <button onClick={() => { setIsLogoutModalOpen(false); handleLogout(); }} className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-xl transition">Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminNavbar;