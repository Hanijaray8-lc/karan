import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  FiBarChart2, 
  FiUsers, 
  FiFileText, 
  FiDollarSign, 
  FiMenu, 
  FiX,
  FiLogOut,
  FiUser
} from 'react-icons/fi';

const Navbar = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const [agentData, setAgentData] = useState({
    name: "Staff",
    role: "Loan Officer",
    profilePhoto: null
  });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (!token) {
      navigate('/Agentlogin');
      return;
    }

    if (savedUser) {
      const user = JSON.parse(savedUser);
      setAgentData({
        name: user.name || user.username || "Staff",
        role: user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "Loan Officer",
        profilePhoto: user.profilePhoto || null 
      });
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/');
  };

  const getInitials = (name) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  const initials = getInitials(agentData.name);

  const navItems = [
    { path: '/AgentDashboard', label: 'Dashboard', icon: FiBarChart2 },
    { path: '/DailyDues', label: 'Weekly Dues', icon: FiFileText },
    { path: '/ClientDetails', label: 'Client Profile', icon: FiUser },
    // { path: '/payment', label: 'Payment', icon: FiDollarSign },
  ];

  const isActive = (path) => location.pathname === path;

  return (
    <>
      {/* Navbar - Full Width Maatrapattullathu */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#16423C] backdrop-blur-sm border-b border-white/10 shadow-lg w-full">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          
          {/* Brand Logo */}
          <Link to="/dashboard" className="flex items-center gap-2 text-white font-bold text-xl min-w-fit">
            {/* logo placed in public/logo.png */}
            <img src="/KaranLogo.jpeg" alt="Karan Finance" className="h-11 w-11 rounded-full object-cover" />
            <span>Karan Finance</span>
          </Link>

          {/* Centered Navigation - Exact Card Model */}
          <div className="hidden lg:flex items-center justify-center flex-1 mx-10">
            <ul className="flex gap-4">
              {navItems.map((item) => (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`group relative flex items-center gap-3 px-5 py-2 rounded-lg transition-all duration-300 min-w-[145px] ${
                      isActive(item.path)
                        ? 'bg-white/20 border border-white/30 text-white shadow-md'
                        : 'bg-white/5 text-white/85 border border-white/5 hover:bg-white/15'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-lg ${
                      isActive(item.path) ? 'bg-white/20' : 'bg-white/10'
                    }`}>
                      <item.icon />
                    </div>
                    <h6 className="font-semibold text-sm tracking-wide">{item.label}</h6>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* User Section - Profile Photo & Logout Icon */}
          <div className="hidden lg:flex items-center gap-6 min-w-fit pl-4 border-l border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-[#6A9C89] to-[#16423C] flex items-center justify-center text-white font-bold text-xs border-2 border-white/20 shadow-xl">
                {agentData.profilePhoto ? (
                  <img src={agentData.profilePhoto} alt="profile" className="w-full h-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div className="text-left">
                <h6 className="font-bold text-white text-sm leading-none">{agentData.name}</h6>
                <small className="text-[#C4DAD2] text-[11px] opacity-70">Agent Portal</small>
              </div>
            </div>

            <button 
              onClick={() => setIsLogoutModalOpen(true)}
              className="p-2.5 rounded-xl bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white transition-all duration-300 border border-red-500/20 shadow-lg"
              title="Sign Out"
            >
              <FiLogOut size={18} />
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="lg:hidden text-white text-2xl p-1">
            {isMobileMenuOpen ? <FiX /> : <FiMenu />}
          </button>
        </div>

        {/* Mobile Sidebar/Menu */}
        <div className={`lg:hidden absolute top-16 left-0 right-0 bg-[#16423C] border-b border-white/10 transition-all duration-300 ${
          isMobileMenuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-5 pointer-events-none'
        }`}>
          <ul className="p-4 space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                    isActive(item.path) ? 'bg-white/20 text-white border border-white/20' : 'bg-white/5 text-white/85'
                  }`}
                >
                  <item.icon /> <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            ))}
            <div className="pt-2 mt-2 border-t border-white/10 flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-[#6A9C89] flex items-center justify-center font-bold text-white shadow-lg">
                  {agentData.profilePhoto ? (
                    <img src={agentData.profilePhoto} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <div>
                  <h6 className="text-white font-bold text-sm">{agentData.name}</h6>
                  <p className="text-[#C4DAD2] text-xs">Loan Officer</p>
                </div>
              </div>
              <button onClick={() => setIsLogoutModalOpen(true)} className="p-3 bg-red-500/20 text-red-400 rounded-xl">
                <FiLogOut size={20} />
              </button>
            </div>
          </ul>
        </div>
      </nav>

      {/* Logout Confirmation Modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md px-4">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <FiLogOut className="text-2xl text-red-600" />
            </div>
            <h4 className="text-2xl font-bold text-gray-900">Sign Out</h4>
            <p className="text-gray-500 mt-2 mb-8">Are you sure you want to exit, <br /><span className="text-[#16423C] font-semibold">{agentData.name}</span>?</p>
            <div className="flex gap-3">
              <button onClick={() => setIsLogoutModalOpen(false)} className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition-colors">Cancel</button>
              <button onClick={handleLogout} className="flex-1 py-3.5 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 shadow-xl shadow-red-200 transition-colors">Logout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;