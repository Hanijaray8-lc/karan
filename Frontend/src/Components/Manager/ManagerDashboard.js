import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import axios from 'axios';
import ManagerNavbar from './ManagerNavbar';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart, Bar } from 'recharts';
import { PieChart, Pie, Cell, Legend } from 'recharts';


// data will be loaded from backend



// Inside your component function:


const ManagerDashboard = () => {
  const navigate = useNavigate();
  const [selectedStaff, setSelectedStaff] = useState('All');
  const [searchStaff, setSearchStaff] = useState('');
  const [collectionData, setCollectionData] = useState([]);
  const [staffData, setStaffData] = useState([]);
  const [todayData, setTodayData] = useState([]);
  const [stats, setStats] = useState([]);
  const [recentActivities, setRecentActivities] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [todayDueTotal, setTodayDueTotal] = useState(0);
  const [todayCollectedTotal, setTodayCollectedTotal] = useState(0);
  const [todayPendingTotal, setTodayPendingTotal] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [pendingAgentsList, setPendingAgentsList] = useState([]);
  // Pie chart colors
  const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

  // totalPieData is always derived from staffData and does NOT change with the Today filter
  const totalPieData = staffData.map((s) => ({ name: s.name, value: s.collected }));

  // todayPieData follows the selectedStaff filter — changing this should NOT affect other charts
  const todayPieData = (selectedStaff === 'All')
    ? todayData.map((s) => ({ name: s.name, value: s.today }))
    : todayData.filter(d => d.name === selectedStaff).map((s) => ({ name: s.name, value: s.today }));

  const totalTodayAmount = (selectedStaff === 'All')
    ? todayData.reduce((sum, d) => sum + (d.today || 0), 0)
    : (todayData.find(d => d.name === selectedStaff)?.today || 0);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    const token = localStorage.getItem('token');

    // If no token, wrong role, or pending approval, kick them back to login/waiting screen
    if (!token || !user || user.role !== 'manager' || user.status === 'Pending') {
      navigate('/');
    }
  }, [navigate]);

  // Fetch collection & payment data from backend test endpoint
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoadingData(true);
        const res = await axios.get('https://karanfinance.com/api/payments/test/all');
        const payments = (res.data && res.data.data && res.data.data.payments) || [];
        const totalCollected = (res.data && res.data.data && res.data.data.stats && res.data.data.stats.totalCollected) || 0;

        // Helper to resolve who actually collected the payment
        const getCollectorName = (p) => {
          const rawStaff = p.collectedStaff?.trim();
          if (rawStaff && rawStaff.toLowerCase() !== 'unknown') {
            return rawStaff;
          }
          return p.agent?.name || p.agent?.username || rawStaff || 'Staff';
        };

        // Helper to check if payment happened today
        const isTodayPayment = (p) => {
          if (!p) return false;
          const today = new Date();
          const checkDate = (dInput) => {
            if (!dInput) return false;
            const d = new Date(dInput);
            return !isNaN(d.getTime()) &&
              d.getFullYear() === today.getFullYear() &&
              d.getMonth() === today.getMonth() &&
              d.getDate() === today.getDate();
          };
          return checkDate(p.paymentDate) || checkDate(p.createdAt);
        };

        // Recent activities (most recent 4)
        const recent = payments.slice(0, 4).map(p => ({
          action: 'Payment received',
          customer: p.client?.name || 'Unknown',
          amount: `₹${(p.amount || 0).toLocaleString()}`,
          time: new Date(p.paymentDate).toLocaleString('en-IN'),
          status: 'PAID',
          by: getCollectorName(p)
        }));

        // Staff totals (group by actual collector staff)
        const staffMap = {};
        payments.forEach(p => {
          const name = getCollectorName(p);
          staffMap[name] = (staffMap[name] || 0) + (p.amount || 0);
        });
        const staffArr = Object.keys(staffMap).map(name => ({ name, collected: staffMap[name] }));

        // Today's collections grouped by collector staff
        const todayPayments = payments.filter(isTodayPayment);
        const todayMap = {};
        todayPayments.forEach(p => {
          const name = getCollectorName(p);
          const role = p.collectedByRole || (name.toLowerCase().includes('manager') ? 'manager' : (name.toLowerCase().includes('admin') ? 'admin' : 'agent'));
          if (!todayMap[name]) {
            todayMap[name] = { name, today: 0, role };
          } else if (p.collectedByRole) {
            todayMap[name].role = p.collectedByRole;
          }
          todayMap[name].today += (p.amount || 0);
        });
        const todayArr = Object.values(todayMap);

        // Monthly collection (last 12 months)
        const monthBuckets = {};
        const now = new Date();
        for (let i = 0; i < 12; i++) {
          const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
          const key = d.toLocaleString('en-US', { month: 'short' });
          monthBuckets[key] = 0;
        }
        payments.forEach(p => {
          const d = new Date(p.paymentDate);
          const key = d.toLocaleString('en-US', { month: 'short' });
          if (monthBuckets.hasOwnProperty(key)) monthBuckets[key] += (p.amount || 0);
        });
        const monthly = Object.keys(monthBuckets).map(m => ({ month: m, amount: monthBuckets[m] }));

        // Fetch clients to compute total lent amount and outstanding dues
        const clientsRes = await axios.get('https://karanfinance.com/api/clients/test/all');
        const clients = (clientsRes.data && clientsRes.data.clients) || [];
        const totalLent = clients.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
        const totalPending = clients.reduce((sum, c) => sum + (Number(c.pending) || 0), 0);
        const totalClients = clients.length;

        // Helper: compute weekly amount for a client when server value missing
        const computeWeeklyAmount = (client) => {
          try {
            const pendingTotal = Number(client.pending || 0);
            if (pendingTotal <= 0) return 0;
            if (!client.loan_start_date) return 0;

            // For ₹5000 (payable ₹6900) loans, default to 575
            if (Number(client.amount) === 5000 || Number(client.amount) === 6900 || Number(client.pending) === 5000 || Number(client.pending) === 6900) return 575;

            const start = new Date(client.loan_start_date);
            const defaultWeeks = 12;
            const end = client.loan_end_date
              ? new Date(client.loan_end_date)
              : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

            let durationMs = end.getTime() - start.getTime();
            let durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
            let weeks = Math.ceil(durationDays / 7);
            if (!weeks || weeks < 1) weeks = defaultWeeks;

            const weekly = weeks > 0 ? (pendingTotal / weeks) : 0;
            return Math.round(weekly * 100) / 100;
          } catch (err) {
            return 0;
          }
        };

        // Helper: check if client has a due on the given date (Date object, compared by yyyy-mm-dd)
        const isClientDueOnDate = (client, dateObj) => {
          try {
            if (!client.loan_start_date) return false;
            const start = new Date(client.loan_start_date);
            const end = client.loan_end_date ? new Date(client.loan_end_date) : new Date(start.getTime() + (12 - 1) * 7 * 24 * 60 * 60 * 1000);

            // normalize to date-only
            const target = new Date(dateObj);
            target.setHours(0, 0, 0, 0);

            let due = new Date(start);
            due.setHours(0, 0, 0, 0);

            while (due <= end) {
              if (due.getTime() === target.getTime()) return true;
              due = new Date(due.getTime() + 7 * 24 * 60 * 60 * 1000);
            }
            return false;
          } catch (e) {
            return false;
          }
        };

        // Calculate today's due based on clients schedule
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        const dueTodayTotal = clients.reduce((sum, c) => {
          const pendingNum = Number(c.pending || 0);
          if (pendingNum <= 0) return sum;
          const weekly = (c.weekly_amount && Number(c.weekly_amount)) || computeWeeklyAmount(c) || 575;
          if (isClientDueOnDate(c, todayDate)) return sum + weekly;
          return sum;
        }, 0);

        const collectedTodayTotal = todayArr.reduce((sum, d) => sum + (d.today || 0), 0);
        const pendingToday = Math.max(0, dueTodayTotal - collectedTodayTotal);

        setTodayDueTotal(dueTodayTotal);
        setTodayCollectedTotal(collectedTodayTotal);
        setTodayPendingTotal(pendingToday);

        // Compute active and inactive client counts (12 week completed = inactive)
        let activeClientsCount = 0;
        let inactiveClientsCount = 0;
        clients.forEach(c => {
          const weeklyAmount = c.weekly_amount && Number(c.weekly_amount) > 0 ? Number(c.weekly_amount) : 575;
          const totalWeeks = c.total_weeks && Number(c.total_weeks) > 0 ? Number(c.total_weeks) : 12;
          const received = Number(c.received || 0);
          const weeksPaid = weeklyAmount > 0 ? Math.min(Math.floor(received / weeklyAmount), totalWeeks) : 0;

          if (weeksPaid >= totalWeeks) {
            inactiveClientsCount++;
          } else {
            activeClientsCount++;
          }
        });

        // Stats cards
        const statsArr = [
          { title: 'TOTAL LENT AMOUNT', value: `₹${totalLent.toLocaleString()}`, subtitle: 'Total Loans', color: 'text-emerald-600', icon: '💰' },
          { title: 'AMOUNT COLLECTED', value: `₹${totalCollected.toLocaleString()}`, subtitle: 'Total Paid', color: 'text-emerald-600', icon: '💳' },
          { title: 'OUTSTANDING DUES', value: `₹${totalPending.toLocaleString()}`, subtitle: 'Pending', color: 'text-red-600', icon: '📋' },
          { title: 'ACTIVE CLIENTS', value: `${activeClientsCount}`, subtitle: 'Ongoing Dues', color: 'text-emerald-600', icon: '👤', path: '/Manager/Acive-Inactive' },
          { title: 'INACTIVE CLIENTS', value: `${inactiveClientsCount}`, subtitle: '12 Wk Done', color: 'text-purple-600', icon: '🏆', path: '/Manager/Acive-Inactive' }
        ];

        setRecentActivities(recent);
        setStaffData(staffArr);
        setTodayData(todayArr);
        setCollectionData(monthly);
        setStats(statsArr);
      } catch (err) {
        console.error('Dashboard fetch error', err);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();

    // Poll for pending agent login requests (Manager)
    const checkPendingApprovals = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await axios.get('https://karanfinance.com/api/agents/pending-approvals', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data && res.data.success) {
          setPendingApprovalCount(res.data.pendingCount || 0);
          setPendingAgentsList(res.data.pendingAgents || []);
        }
      } catch (e) {
        // silent fail
      }
    };

    checkPendingApprovals();
    const pollId = setInterval(checkPendingApprovals, 4000);
    return () => clearInterval(pollId);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-50">
        <ManagerNavbar />
      </div>

      {/* Main content – full width with reasonable padding */}
      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-8 lg:py-10">
        {/* Real-time Agent Approval Alert Banner */}
        {pendingApprovalCount > 0 && (
          <div className="mb-6 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white p-4 sm:p-5 rounded-2xl shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border border-amber-300 animate-fadeIn">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-xl shrink-0 shadow-inner">
                🔔
              </div>
              <div>
                <h4 className="font-black text-base text-white leading-tight">
                  {pendingApprovalCount} Agent{pendingApprovalCount > 1 ? 's' : ''} Awaiting Login Approval
                </h4>
                <p className="text-amber-100 text-xs mt-0.5 font-medium">
                  {pendingAgentsList[0]?.name || pendingAgentsList[0]?.username || 'An agent'} attempted to log in. Please review and grant system access.
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/Manager/ManagerAproval')}
              className="bg-white text-amber-900 font-extrabold text-xs px-5 py-2.5 rounded-xl hover:bg-amber-50 active:scale-95 transition shadow-md shrink-0 flex items-center gap-1.5"
            >
              <span>Review & Approve Now</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] rounded-xl shadow-lg p-6 mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            Dashboard Overview
          </h1>
          <p className="mt-2 text-emerald-100 text-lg">
            Monitor your loan management system performance and activities
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-5 mb-10 lg:mb-12">
          {stats.map((stat, i) => (
            <div
              key={i}
              onClick={() => stat.path && navigate(stat.path)}
              className={`bg-white rounded-xl shadow-md border border-gray-200 p-5 hover:shadow-lg transition-all duration-200 ${stat.path ? 'cursor-pointer hover:border-emerald-500 hover:-translate-y-0.5' : ''
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl">{stat.icon}</span>
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-full ${stat.title.includes('INACTIVE') ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                  {stat.subtitle || 'System'}
                </span>
              </div>
              <p className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-1">{stat.value}</p>
              <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">{stat.title}</p>
            </div>
          ))}
        </div>

        {/* Today Status Card - First Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-10 lg:mb-12">
          {/* Today Status Card */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-6">
              <h3 className="text-xl font-semibold">Today Status</h3>
            </div>

            <div className="space-y-5">
              {/* Today Due Amount */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-l-4 border-blue-500 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium uppercase tracking-wide">Today Due</p>
                    <p className="text-3xl font-bold text-blue-800 mt-2">
                      ₹{(todayDueTotal || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-4xl opacity-30">📅</div>
                </div>
                <p className="text-xs text-blue-600 mt-2">Today total due amount</p>
              </div>

              {/* Today Payment Success */}
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border-l-4 border-emerald-500 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-emerald-600 font-medium uppercase tracking-wide">Payment Success</p>
                    <p className="text-3xl font-bold text-emerald-800 mt-2">
                      ₹{(todayCollectedTotal || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-4xl opacity-30">✓</div>
                </div>
                <p className="text-xs text-emerald-600 mt-2">Today collected amount</p>
              </div>

              {/* Today Pending Amount */}
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border-l-4 border-amber-500 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-amber-600 font-medium uppercase tracking-wide">Today Pending</p>
                    <p className="text-3xl font-bold text-amber-800 mt-2">
                      ₹{(todayPendingTotal || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-4xl opacity-30">⏳</div>
                </div>
                <p className="text-xs text-amber-600 mt-2">Today not collected yet</p>
              </div>
            </div>
          </div>

          {/* Recent Activity table (span 2 cols on large screens) */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-5">
              <h3 className="text-xl font-semibold">Recent Activity</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Action</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount/Details</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Time</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {recentActivities.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.action}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.customer}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.amount}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{item.time}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">{item.status}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Top row: recent activity small box, Today Collection, Actual Collection */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-10 lg:mb-12">
          {/* Recent activity small box */}
          <div className="bg-white rounded-xl shadow border border-gray-200 p-4">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-3">
              <h4 className="text-lg font-semibold">Recent Payments</h4>
            </div>
            <div className="divide-y">
              {recentActivities.slice(0, 3).map((r, idx) => (
                <div key={idx} className="py-3 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">{r.by ? r.by.charAt(0) : 'U'}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">{r.customer}</div>
                      <div className="text-sm font-bold text-emerald-700">{r.amount}</div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{r.time} • by {r.by}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today Collection (with staff filter and search) */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Today Collection</h3>
              <input
                type="text"
                placeholder="Search staff..."
                value={searchStaff}
                onChange={(e) => setSearchStaff(e.target.value)}
                className="px-3 py-2 rounded text-sm text-gray-800 bg-white w-40 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {/* Filtered Staff Data */}
            {(() => {
              const filtered = searchStaff
                ? todayData.filter(d =>
                  d.name.toLowerCase().includes(searchStaff.toLowerCase()) ||
                  (d.role && d.role.toLowerCase().includes(searchStaff.toLowerCase()))
                )
                : todayData;

              const topPerformer = filtered.length > 0 ? filtered.reduce((max, current) => current.today > max.today ? current : max) : null;
              const totalAmount = filtered.reduce((sum, d) => sum + (d.today || 0), 0);

              return (
                <>

                  {/* {topPerformer && (
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">🏆</span>
                        <span className="text-sm font-semibold text-amber-900">Top Performer</span>
                      </div>
                      <div className="text-2xl font-bold text-amber-700">{topPerformer.name}</div>
                      <div className="text-sm text-amber-600 mt-1">Collected: ₹{topPerformer.today.toLocaleString()}</div>
                    </div>
                  )} */}

                  {/* Total Collection Info */}
                  <div className="mb-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="text-xs text-emerald-700 font-medium">Total collected today {searchStaff && `(${filtered.length} staff)`}</div>
                    <div className="text-2xl font-bold text-emerald-700">₹{totalAmount.toLocaleString()}</div>
                  </div>

                  {/* Staff List - Ranked and Attractive */}
                  <div className="space-y-2 max-h-45 overflow-y-auto">
                    {filtered.length > 0 ? (
                      [...filtered].sort((a, b) => b.today - a.today).map((item, idx) => (
                        <div
                          key={item.name}
                          className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${idx === 0
                            ? 'bg-gradient-to-r from-amber-100 to-orange-100 border-amber-300 shadow-md'
                            : 'bg-white border-gray-200 hover:border-emerald-300'
                            }`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-white text-sm ${idx === 0 ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'bg-emerald-600'
                              }`}>
                              {idx + 1}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm text-gray-900">{item.name}</span>
                              {item.role && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${item.role === 'manager'
                                  ? 'bg-blue-100 text-blue-700'
                                  : item.role === 'admin'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-emerald-100 text-emerald-700'
                                  }`}>
                                  {item.role}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-bold ${idx === 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                            ₹{item.today.toLocaleString()}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-gray-500 text-sm">
                        No staff found matching "{searchStaff}"
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Actual Collection line chart */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-5">
              <h3 className="text-xl font-semibold">Actual Collection</h3>
            </div>
            <div className="h-48 md:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={collectionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};

export default ManagerDashboard;
