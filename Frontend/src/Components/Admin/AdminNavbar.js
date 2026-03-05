import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRightOnRectangleIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

const navItems = [
  { label: 'Dashboard', path: '/Admin/AdminDashboard' },
    { label: 'Add Manager', path: '/Admin/AddManager' },

  { label: 'Add Agent', path: '/Admin/AddAgent' },
    { label: 'Add Client', path: '/Admin/AddClient' },

  { label: 'Client Details', path: '/Admin/AClientDetails' },
  { label: 'Payment History', path: '/Admin/PaymentHistory' },
];

const AdminNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [adminData, setAdminData] = useState({ name: 'Admin User', role: 'Super Admin' });

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
        setAdminData({ name: u.name || u.username || 'Admin User', role: u.role ? (u.role.charAt(0).toUpperCase() + u.role.slice(1)) : 'Super Admin' });
      }
    } catch (err) {
      // ignore
    }
  }, []);

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <>
      <nav className="sticky top-0 z-40 bg-emerald-900 text-white w-full shadow-md">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo + Brand */}
            <div className="flex items-center space-x-3">
              {/* Logo image; put your PNG at public/logo.png */}
              <img src="/KaranLogo.jpeg" alt="Karan Finance" className="h-11 w-11 rounded-full object-cover" />
              <span className="text-2xl font-bold tracking-tight">
                Karan Finance
              </span>
            </div>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center space-x-2">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    location.pathname === item.path
                      ? 'bg-emerald-700 text-white'
                      : 'hover:bg-emerald-800'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* User Info + Logout (desktop) */}
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg shadow-sm">
                  A
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">Admin User</div>
                  <div className="text-xs text-emerald-200 leading-tight">Super Admin</div>
                </div>
              </div>

              <button
                onClick={() => setIsLogoutModalOpen(true)}
                className="p-2 rounded-full hover:bg-emerald-800 transition-colors text-white"
                title="Logout"
              >
                <ArrowRightOnRectangleIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Hamburger Button */}
            <div className="md:hidden flex items-center">
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
            <div className="md:hidden bg-emerald-800 py-4 px-2 space-y-2 border-t border-emerald-700">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`block px-4 py-3 rounded-md text-base font-medium ${
                    location.pathname === item.path
                      ? 'bg-emerald-700 text-white'
                      : 'text-white hover:bg-emerald-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              {/* Mobile User Info + Logout */}
              <div className="px-4 py-3 border-t border-emerald-700 mt-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg">
                    A
                  </div>
                  <div>
                    <div className="text-sm font-medium">Admin User</div>
                    <div className="text-xs text-emerald-300">Super Admin</div>
                  </div>
                </div>

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