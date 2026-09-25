import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminNavbar from './AdminNavbar';
import {
  CheckCircle,
  XCircle,
  Clock,
  User,
  Phone,
  Mail,
  Shield,
  Search,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Bell,
  UserCheck,
  UserX,
  Calendar,
  Lock,
  ArrowRight
} from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'https://karan-e26t.onrender.com/api';

export default function AdminAproval() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'active' | 'rejected'
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingAgents, setPendingAgents] = useState([]);
  const [activeAgents, setActiveAgents] = useState([]);
  const [rejectedAgents, setRejectedAgents] = useState([]);
  const [recentLoginRequests, setRecentLoginRequests] = useState([]);
  const [stats, setStats] = useState({
    pendingCount: 0,
    recentLoginCount: 0,
    activeCount: 0,
    rejectedCount: 0
  });
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [toast, setToast] = useState(null);

  const prevPendingCountRef = useRef(0);
  const pollIntervalRef = useRef(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Auth protection
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    if (!token || !user || user.role !== 'admin') {
      navigate('/');
    }
  }, [navigate]);

  // Fetch pending approvals and agent lists
  const fetchApprovalsData = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await axios.get(`${API_URL}/agents/pending-approvals`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data && res.data.success) {
        const pAgents = res.data.pendingAgents || [];
        const aAgents = res.data.activeAgents || [];
        const rAgents = res.data.rejectedAgents || [];
        const rLogins = res.data.recentLoginRequests || [];

        // Check for newly arrived pending request
        if (pAgents.length > prevPendingCountRef.current && prevPendingCountRef.current !== 0) {
          showToast(`🔔 Alert: A new agent is waiting for your login approval!`, 'alert');
        }
        prevPendingCountRef.current = pAgents.length;

        setPendingAgents(pAgents);
        setActiveAgents(aAgents);
        setRejectedAgents(rAgents);
        setRecentLoginRequests(rLogins);
        setStats({
          pendingCount: pAgents.length,
          recentLoginCount: rLogins.length,
          activeCount: aAgents.length,
          rejectedCount: rAgents.length
        });
      }
    } catch (err) {
      console.error('Error fetching approval data:', err);
      if (err.response?.status === 401) {
        navigate('/');
      }
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  // Mount & Live polling (every 4 seconds)
  useEffect(() => {
    fetchApprovalsData();
    pollIntervalRef.current = setInterval(() => {
      fetchApprovalsData();
    }, 4000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Approve agent handler
  const handleApprove = async (agent) => {
    try {
      setActionLoadingId(agent._id);
      const token = localStorage.getItem('token');

      const res = await axios.put(
        `${API_URL}/agents/${agent._id}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data && res.data.success) {
        showToast(`✅ Agent ${agent.name || agent.username} approved! Access granted.`, 'success');
        fetchApprovalsData();
      }
    } catch (err) {
      console.error('Error approving agent:', err);
      showToast(err.response?.data?.message || 'Failed to approve agent', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reject agent handler
  const handleReject = async (agent) => {
    if (!window.confirm(`Are you sure you want to reject login access for ${agent.name || agent.username}?`)) {
      return;
    }

    try {
      setActionLoadingId(agent._id);
      const token = localStorage.getItem('token');

      const res = await axios.put(
        `${API_URL}/agents/${agent._id}/reject`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data && res.data.success) {
        showToast(`Agent ${agent.name || agent.username} access rejected.`, 'info');
        fetchApprovalsData();
      }
    } catch (err) {
      console.error('Error rejecting agent:', err);
      showToast(err.response?.data?.message || 'Failed to reject agent', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Set back to pending (Revoke access)
  const handleSetPending = async (agent) => {
    if (!window.confirm(`Revoke active access for ${agent.name || agent.username}? They will need approval on next login.`)) {
      return;
    }

    try {
      setActionLoadingId(agent._id);
      const token = localStorage.getItem('token');

      const res = await axios.put(
        `${API_URL}/agents/${agent._id}/status`,
        { status: 'Pending' },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.data && res.data.success) {
        showToast(`Agent ${agent.name || agent.username} status reset to Pending.`, 'info');
        fetchApprovalsData();
      }
    } catch (err) {
      console.error('Error setting agent pending:', err);
      showToast(err.response?.data?.message || 'Failed to update agent status', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filter list based on search term
  const getFilteredAgents = () => {
    let list = [];
    if (activeTab === 'pending') list = pendingAgents;
    else if (activeTab === 'active') list = activeAgents;
    else list = rejectedAgents;

    if (!searchTerm.trim()) return list;

    const term = searchTerm.toLowerCase();
    return list.filter(
      (a) =>
        (a.name && a.name.toLowerCase().includes(term)) ||
        (a.username && a.username.toLowerCase().includes(term)) ||
        (a.email && a.email.toLowerCase().includes(term)) ||
        (a.phone && a.phone.includes(term)) ||
        (a.department && a.department.toLowerCase().includes(term))
    );
  };

  const filteredList = getFilteredAgents();

  // Helper for time formatting
  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return 'Not attempted yet';
    const diffMs = new Date() - new Date(dateStr);
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffSec < 45) return 'Just now (Active attempt!)';
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
    return new Date(dateStr).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <AdminNavbar />

      {/* Floating Notification Toast */}
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white font-medium text-sm transition-all duration-300 transform translate-y-0 ${toast.type === 'error'
            ? 'bg-red-600 border border-red-700'
            : toast.type === 'alert'
              ? 'bg-amber-600 border border-amber-700 animate-bounce'
              : toast.type === 'info'
                ? 'bg-blue-600 border border-blue-700'
                : 'bg-emerald-600 border border-emerald-700'
            }`}
        >
          {toast.type === 'error' ? (
            <XCircle className="w-5 h-5 shrink-0" />
          ) : toast.type === 'alert' ? (
            <Bell className="w-5 h-5 shrink-0" />
          ) : (
            <CheckCircle className="w-5 h-5 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Top Header Banner */}
        <div className="bg-gradient-to-r from-[#16423c] via-emerald-900 to-[#1e584f] text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none"></div>

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 bg-emerald-800/80 px-3.5 py-1 rounded-full text-xs font-semibold text-emerald-200 border border-emerald-700/60">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Live Agent Approval Hub</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight">Agent Login Approvals</h1>
              <p className="text-emerald-100/90 text-sm max-w-xl">
                Review and approve agents waiting for access. When you approve an agent, their waiting screen unlocks instantly in real-time.
              </p>
            </div>

            <button
              onClick={() => fetchApprovalsData(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 active:scale-95 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition border border-white/20 shadow-md self-start sm:self-center"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Syncing...' : 'Sync Live'}</span>
            </button>
          </div>
        </div>

        {/* Live Pending Alert Notice Banner (if any agent is waiting) */}
        {stats.pendingCount > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-amber-950 text-base">
                  {stats.pendingCount} Agent{stats.pendingCount > 1 ? 's' : ''} Waiting for Approval
                </h3>
                <p className="text-amber-800 text-xs mt-0.5">
                  Agents who attempt login are waiting on their screen for your approval.
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveTab('pending')}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow"
            >
              <span>View Pending Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Pending Card */}
          <div
            onClick={() => setActiveTab('pending')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${activeTab === 'pending'
              ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-white border-gray-200 hover:border-amber-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Awaiting Approval</span>
              <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-amber-600">{stats.pendingCount}</span>
              <span className="text-xs font-semibold text-gray-500">agents waiting</span>
            </div>
          </div>

          {/* Recent Login Attempts Card */}
          <div
            onClick={() => setActiveTab('pending')}
            className="p-5 rounded-2xl bg-white border border-gray-200 shadow-sm cursor-pointer hover:border-blue-300 transition"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Login Requests</span>
              <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <Bell className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-blue-600">{stats.recentLoginCount}</span>
              <span className="text-xs font-semibold text-gray-500">active attempts</span>
            </div>
          </div>

          {/* Active Agents Card */}
          <div
            onClick={() => setActiveTab('active')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${activeTab === 'active'
              ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-white border-gray-200 hover:border-emerald-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Approved & Active</span>
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <UserCheck className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600">{stats.activeCount}</span>
              <span className="text-xs font-semibold text-gray-500">active staff</span>
            </div>
          </div>

          {/* Rejected / Inactive Card */}
          <div
            onClick={() => setActiveTab('rejected')}
            className={`p-5 rounded-2xl border transition-all cursor-pointer shadow-sm ${activeTab === 'rejected'
              ? 'bg-red-500/10 border-red-500 ring-2 ring-red-500/30'
              : 'bg-white border-gray-200 hover:border-red-300'
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rejected / Inactive</span>
              <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <UserX className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-black text-red-600">{stats.rejectedCount}</span>
              <span className="text-xs font-semibold text-gray-500">blocked</span>
            </div>
          </div>
        </div>

        {/* Action Bar: Search & Tabs */}
        <div className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-full sm:w-auto">
            <button
              onClick={() => setActiveTab('pending')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${activeTab === 'pending'
                ? 'bg-[#16423c] text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <span>Pending Approvals</span>
              {stats.pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-amber-400 text-gray-900">
                  {stats.pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${activeTab === 'active'
                ? 'bg-[#16423c] text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <span>Active Agents</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                {stats.activeCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('rejected')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${activeTab === 'rejected'
                ? 'bg-[#16423c] text-white shadow'
                : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <span>Rejected / Inactive</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                {stats.rejectedCount}
              </span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, username, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs font-medium rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#16423c] focus:border-transparent transition bg-gray-50/50"
            />
          </div>
        </div>

        {/* Agents List / Grid */}
        {loading ? (
          <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm flex flex-col items-center justify-center space-y-4">
            <RefreshCw className="w-8 h-8 animate-spin text-[#16423c]" />
            <p className="text-sm text-gray-500 font-medium">Loading approval queue...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 border border-gray-100 shadow-sm text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-gray-100 text-gray-400 mx-auto flex items-center justify-center">
              {activeTab === 'pending' ? <CheckCircle className="w-8 h-8 text-emerald-500" /> : <User className="w-8 h-8" />}
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              {activeTab === 'pending'
                ? 'No Pending Approvals'
                : activeTab === 'active'
                  ? 'No Active Agents Found'
                  : 'No Rejected Agents'}
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              {activeTab === 'pending'
                ? 'All agent login requests have been reviewed and approved. As soon as an agent attempts login, it will appear here.'
                : 'No records matching your search filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredList.map((agent) => {
              const isLoading = actionLoadingId === agent._id;
              const hasRecentAttempt = agent.loginRequested || agent.lastLoginAttempt;

              return (
                <div
                  key={agent._id}
                  className={`bg-white rounded-3xl border shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between ${agent.status === 'Pending'
                    ? hasRecentAttempt
                      ? 'border-amber-400 ring-2 ring-amber-400/20'
                      : 'border-amber-200'
                    : agent.status === 'Active'
                      ? 'border-gray-200 hover:border-emerald-300'
                      : 'border-red-200'
                    }`}
                >
                  {/* Card Header & Badge */}
                  <div className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className="w-13 h-13 w-12 h-12 rounded-2xl bg-[#16423c] text-white flex items-center justify-center font-bold text-lg shadow-md overflow-hidden shrink-0">
                          {agent.profilePhoto ? (
                            <img
                              src={agent.profilePhoto.startsWith('http') ? agent.profilePhoto : `${API_URL.replace('/api', '')}${agent.profilePhoto}`}
                              alt={agent.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            agent.name ? agent.name.charAt(0).toUpperCase() : 'A'
                          )}
                        </div>
                        <div>
                          <h4 className="font-extrabold text-base text-gray-900 leading-snug">
                            {agent.name || agent.username}
                          </h4>
                          <span className="text-xs font-semibold text-[#16423c]">
                            @{agent.username}
                          </span>
                        </div>
                      </div>

                      {/* Status Tag */}
                      {agent.status === 'Pending' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                          Pending
                        </span>
                      ) : agent.status === 'Active' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300 shrink-0">
                          <XCircle className="w-3.5 h-3.5 text-red-600" />
                          Rejected
                        </span>
                      )}
                    </div>

                    {/* Highlight banner for live login attempts */}
                    {agent.status === 'Pending' && hasRecentAttempt && (
                      <div className="bg-amber-50 rounded-xl p-2.5 border border-amber-200 flex items-center gap-2 text-xs font-bold text-amber-900">
                        <Bell className="w-4 h-4 text-amber-600 shrink-0 animate-bounce" />
                        <span>Login Attempted: {formatTimeAgo(agent.lastLoginAttempt)}</span>
                      </div>
                    )}

                    {/* Agent Details Info */}
                    <div className="space-y-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Phone className="w-3.5 h-3.5" /> Phone:
                        </span>
                        <strong className="text-gray-800 font-semibold">{agent.phone || 'N/A'}</strong>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Mail className="w-3.5 h-3.5" /> Email:
                        </span>
                        <span className="text-gray-800 font-medium truncate max-w-[180px]" title={agent.email}>
                          {agent.email}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Shield className="w-3.5 h-3.5" /> Department:
                        </span>
                        <span className="text-gray-800 font-semibold">{agent.department || 'Field Agent'}</span>
                      </div>

                      {agent.status === 'Active' && agent.approvedBy && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-gray-400">
                            <UserCheck className="w-3.5 h-3.5" /> Approved By:
                          </span>
                          <span className="text-emerald-700 font-bold">{agent.approvedBy}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Calendar className="w-3.5 h-3.5" /> Registered:
                        </span>
                        <span className="text-gray-600">
                          {agent.createdAt ? new Date(agent.createdAt).toLocaleDateString('en-IN') : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Action Buttons */}
                  <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex items-center gap-2">
                    {agent.status === 'Pending' ? (
                      <>
                        <button
                          onClick={() => handleApprove(agent)}
                          disabled={isLoading}
                          className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2.5 px-3 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>{isLoading ? 'Approving...' : 'Approve Access'}</span>
                        </button>

                        <button
                          onClick={() => handleReject(agent)}
                          disabled={isLoading}
                          className="inline-flex items-center justify-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 active:scale-95 py-2.5 px-3 rounded-xl text-xs font-bold transition disabled:opacity-50"
                          title="Reject Access"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Reject</span>
                        </button>
                      </>
                    ) : agent.status === 'Active' ? (
                      <>
                        <button
                          onClick={() => handleSetPending(agent)}
                          disabled={isLoading}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 active:scale-95 py-2 px-3 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          <span>Require Re-Approval</span>
                        </button>

                        <button
                          onClick={() => handleReject(agent)}
                          disabled={isLoading}
                          className="inline-flex items-center justify-center gap-1.5 bg-red-100 hover:bg-red-200 text-red-700 active:scale-95 py-2 px-3 rounded-xl text-xs font-bold transition disabled:opacity-50"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Suspend</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleApprove(agent)}
                        disabled={isLoading}
                        className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition shadow-sm disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>Re-Approve & Unlock</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
