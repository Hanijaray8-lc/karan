import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const navItems = [
  { label: 'Dashboard', path: '/Manager/managerdashboard' },
  { label: 'Add Client', path: '/Manager/MAddClient' },
  { label: 'Client Profile', path: '/Manager/MClientDetails'},
  { label: 'Weekly Dues', path: '/Manager/MDailyDues' },
  { label: 'Payment History', path: '/Manager/MpaymentHistory' },
];

const ManagerNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const [managerData, setManagerData] = useState({
    name: 'Manager',
    role: 'Staff Manager',
    profilePhoto: null
  });

  // Load logged-in user's data from localStorage
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        setManagerData({
          name: user.name || user.username || 'Manager',
          role: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Staff Manager',
          profilePhoto: user.profilePhoto || null
        });
      }
    } catch (err) {
      console.error('Error loading user data:', err);
    }
  }, []);

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const initials = getInitials(managerData.name);

  const handleLogout = () => {
    setIsLogoutModalOpen(true);
  };

  const confirmLogout = () => {
    setIsLogoutModalOpen(false);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  return (
    <nav className="bg-emerald-900 text-white w-full shadow-md">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          <div className="flex items-center space-x-3">
            <span className="text-2xl font-bold tracking-tight">₹ Karan Finance</span>
          </div>

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

          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg shadow-sm overflow-hidden">
                {managerData.profilePhoto ? (
                  <img src={managerData.profilePhoto} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div>
                <div className="text-sm font-medium leading-tight">{managerData.name}</div>
                <div className="text-xs text-emerald-200 leading-tight">{managerData.role}</div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 rounded-full hover:bg-emerald-800 transition-colors text-white"
            >
              Logout
            </button>
          </div>

          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 rounded-md hover:bg-emerald-800 focus:outline-none"
            >
              <span className="text-lg">☰</span>
            </button>
          </div>
        </div>
      
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
            <p className="text-gray-500 mt-2 mb-6">Are you sure you want to sign out, <span className="font-semibold text-emerald-700">{managerData.name}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition">Cancel</button>
              <button onClick={confirmLogout} className="flex-1 py-3.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-xl transition">Logout</button>
            </div>
          </div>
        </div>
      )}

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

            <div className="px-4 py-3 border-t border-emerald-700 mt-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-emerald-700 flex items-center justify-center font-bold text-lg overflow-hidden">
                  {managerData.profilePhoto ? (
                    <img src={managerData.profilePhoto} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div>
                  <div className="text-sm font-medium">{managerData.name}</div>
                  <div className="text-xs text-emerald-300">{managerData.role}</div>
                </div>
              </div>

              <button 
                onClick={handleLogout}
                className="p-2 rounded-full hover:bg-emerald-700 text-white"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default ManagerNavbar;
