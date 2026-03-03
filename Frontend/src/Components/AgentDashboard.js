// AgentDashboard.jsx
import React, { useState, useEffect } from 'react';
import {
  Gauge,
  Users,
  CalendarClock,
  User,
  IndianRupee,
  ListChecks,
  ArrowRight,
  Calendar,
} from 'lucide-react';

import AgentNavbar from './AgentNavbar';  // ← adjust path if needed

export default function AgentDashboard() {
  const [recentPayments, setRecentPayments] = useState([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [agentName, setAgentName] = useState('');
  const [monthlyStats, setMonthlyStats] = useState({
    totalCollected: 0,
    totalPending: 0,
    todayCollected: 0,
    todayPending: 0,
    todayDueTotal: 0,
    pendingClients: 0,
    totalClients: 0,
    totalLoan: 0,
    collectionRate: 0,
    todayClientsDue: 0,
    // new agent-specific metrics
    assignedTotalClients: 0,
    assignedTotalLoan: 0,
    assignedTotalPending: 0,
  });

  // Helper: compute weekly amount for a client (use stored weekly_amount if present)
  const computeWeeklyAmount = (client) => {
    if (!client) return 0;
    if (client.weekly_amount && Number(client.weekly_amount) > 0) return Number(client.weekly_amount);
    const amt = Number(client.amount || 0);
    const derived = Math.round((amt / 12) || 0);
    return derived > 0 ? derived : 575; // fallback to 575 if nothing else
  };

  // Helper: check if client is due on a specific date (matches DailyDues logic)
  const isClientDueOnDate = (client, dateObj) => {
    if (!client || !client.loan_start_date) return false;
    // If no pending amount, client is not due
    if (Number(client.pending) <= 0) return false;

    const start = new Date(client.loan_start_date);
    const defaultWeeks = 12;
    const end = client.loan_end_date 
      ? new Date(client.loan_end_date) 
      : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

    const target = new Date(dateObj);
    target.setHours(0, 0, 0, 0);

    let due = new Date(start);
    due.setHours(0, 0, 0, 0);

    while (due <= end) {
      if (due.getTime() === target.getTime()) return true;
      due.setDate(due.getDate() + 7);
    }
    return false;
  };

  useEffect(() => {
    const mapPaymentToRow = (payment) => ({
      client: payment.clientName || payment.client?.name || 'Unknown',
      received: payment.amount || 0,
      pending: payment.remainingDue || payment.pending || 0,
      date: payment.paymentDate ? new Date(payment.paymentDate).toLocaleString() : payment.date || '',
      status: payment.status || 'Pending'
    });

    const computeStats = (payments) => {
      const totalCollected = payments.reduce((s, x) => s + (Number(x.amount) || 0), 0);
      const totalPending = payments.reduce((s, x) => s + (Number(x.remainingDue || x.pending) || 0), 0);
      const today = new Date(); today.setHours(0,0,0,0);
      const todayCollected = payments.reduce((s, x) => {
        const d = x.paymentDate ? new Date(x.paymentDate) : (x.date ? new Date(x.date) : null);
        if (!d) return s;
        d.setHours(0,0,0,0);
        return s + ((d.getTime() === today.getTime()) ? (Number(x.amount) || 0) : 0);
      }, 0);
      const todayPending = payments.reduce((s, x) => {
        const d = x.paymentDate ? new Date(x.paymentDate) : (x.date ? new Date(x.date) : null);
        if (!d) return s;
        d.setHours(0,0,0,0);
        return s + ((d.getTime() === today.getTime()) ? (Number(x.remainingDue || x.pending) || 0) : 0);
      }, 0);
      const pendingClients = payments.filter(p => Number(p.remainingDue || p.pending) > 0).length;
      const totalClients = new Set(payments.map(p => p.clientName || p.client?.name || '')).size;
      const totalLoan = totalCollected + totalPending;
      const collectionRate = totalLoan > 0 ? Math.round((totalCollected / totalLoan) * 100) : 0;
      const todayClientsDue = payments.filter(p => {
        const d = p.paymentDate ? new Date(p.paymentDate) : (p.date ? new Date(p.date) : null);
        if (!d) return false;
        d.setHours(0,0,0,0);
        return d.getTime() === today.getTime();
      }).length;
      return { totalCollected, totalPending, todayCollected, todayPending, pendingClients, totalClients, totalLoan, collectionRate, todayClientsDue };
    };

    const fetchRecentPayments = async () => {
      try {
        setLoadingPayments(true);
        const userRaw = localStorage.getItem('user');
        if (!userRaw) {
          setRecentPayments([]);
          return;
        }
        const user = JSON.parse(userRaw);
        setAgentName(user.name || user.username || '');
        const agentId = user._id || user.id || null;
        const agentName = user.name || user.username || '';

        // Request recent payments; backend uses req.user to scope results to the
        // current agent, so no additional query parameter is needed.
        const token = localStorage.getItem('token');
        const url = `http://localhost:5000/api/payments/history?limit=6`;
        const res = await fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } });

        // helper that enforces agent filter regardless of server response
        const enforceAgentFilter = (paymentsArray) => {
          if (!agentId && !agentName) return paymentsArray;
          return paymentsArray.filter(p => {
            // match by stored agent reference if available
            if (agentId) {
              const payAgentId = p.agent?._id || p.agent || '';
              if (payAgentId && String(payAgentId) === String(agentId)) return true;
            }
            // fallback to collectedStaff string (older records)
            if (agentName) {
              const collectedStaff = p.collectedStaff || '';
              if (collectedStaff === agentName) return true;
            }
            return false;
          });
        };

        if (!res.ok) {
          // fallback to test endpoint
          const fallback = await fetch('http://localhost:5000/api/payments/test/all');
          if (!fallback.ok) throw new Error('Failed to fetch payments');
          const fbData = await fallback.json();
          const payments = (fbData.data && fbData.data.payments) || fbData.data || [];
          const filteredPayments = enforceAgentFilter(payments);
          const recent = filteredPayments.slice(0,6);
          setRecentPayments(recent.map(mapPaymentToRow));
          const stats = computeStats(filteredPayments);
          setMonthlyStats(stats);
          return;
        }

        const data = await res.json();
        const payments = (data.data && data.data.payments) || data.payments || [];
        // ensure the list contains only records belonging to this agent
        const filteredPayments = enforceAgentFilter(payments);
        setRecentPayments(filteredPayments.slice(0,6).map(mapPaymentToRow));
        // set agent name from localStorage user info (again, safe)
        try {
          const userRaw = localStorage.getItem('user');
          if (userRaw) {
            const user = JSON.parse(userRaw);
            setAgentName(user.name || user.username || '');
          }
        } catch (err) {
          // ignore
        }
        // compute stats from filtered payments only
        const stats = computeStats(filteredPayments);
        // Now fetch clients (agent view) to compute today's pending based on schedule
        try {
          const token = localStorage.getItem('token');
          const clientsRes = await fetch('http://localhost:5000/api/clients/all', {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          });

          let clientsList = [];
          if (clientsRes.ok) {
            const clientsJson = await clientsRes.json();
            clientsList = clientsJson.clients || [];
          } else {
            console.warn('Clients API failed, status:', clientsRes.status);
          }

          const today = new Date(); today.setHours(0,0,0,0);
          let todayClientsDue = 0;
          let todayPendingAmount = 0;
          let todayDueTotal = 0;

          // Log for debugging
          console.log('Total clients fetched:', clientsList.length);
          console.log('Agent ID:', agentId);

          // restrict clients list to those assigned to this agent, if agentId available
          let agentClients = clientsList;
          if (agentId) {
            agentClients = clientsList.filter(c => {
              const cid = c.agent?._id || c.agent;
              return cid && String(cid) === String(agentId);
            });
            console.log('Filtered agent clients:', agentClients.length);
          }

          // If no clients after agent filter, log and use all clients as fallback
          if (agentClients.length === 0 && clientsList.length > 0 && agentId) {
            console.warn('No clients matched agent ID, using all clients as fallback');
            agentClients = clientsList;
          }

          // merge some of these client-based metrics into monthly stats as well
          const assignedTotalClients = agentClients.length;
          const assignedTotalLoan = agentClients.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const assignedTotalPending = agentClients.reduce((s, c) => s + (Number(c.pending) || 0), 0);
          // later we will merge these values into state

          // For each agent-specific client, if due today and no payment in filteredPayments for today, count weekly amount as pending
          agentClients.forEach(client => {
            const isDue = isClientDueOnDate(client, today);
            console.log(`Client ${client.name || client.id}: isDue=${isDue}, pending=${client.pending}, start=${client.loan_start_date}`);
            
            if (isDue) {
              todayClientsDue++;
              const weekly = computeWeeklyAmount(client) || 575;
              console.log(`  Adding to due total: ${weekly}`);
              todayDueTotal += weekly; // Add to total due amount
              
              // check if a payment exists for this client with today's date
              const paidToday = filteredPayments.some(p => {
                const clientId = p.client?._id || p.client || p.clientName || '';
                const payClientId = p.client && p.client._id ? p.client._id : (p.client || '');
                // try match by id or name fallback
                const sameClient = (client._id && payClientId && client._id === payClientId) || (p.clientName && (p.clientName === client.name));
                if (!sameClient) return false;
                const pDate = p.paymentDate ? new Date(p.paymentDate) : (p.date ? new Date(p.date) : null);
                if (!pDate) return false;
                pDate.setHours(0,0,0,0);
                return pDate.getTime() === today.getTime();
              });

              if (!paidToday) {
                todayPendingAmount += weekly;
              }
            }
          });
          
          console.log('todayDueTotal:', todayDueTotal);
          
          // merge client counts now and combine with today-specific values
          const finalStats = {
            ...stats,
            assignedTotalClients,
            assignedTotalLoan,
            assignedTotalPending,
            todayCollected: stats.todayCollected,
            todayPending: todayPendingAmount,
            todayDueTotal,
            todayClientsDue
          };
          setMonthlyStats(finalStats);
        } catch (err) {
          console.error('Error in client processing:', err);
          // if clients fetch fails, fall back to normal stats
          setMonthlyStats(stats);
        }
      } catch (err) {
        console.error('Error fetching recent payments:', err);
        setRecentPayments([]);
      } finally {
        setLoadingPayments(false);
      }
    };

    fetchRecentPayments();
  }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      <AgentNavbar />

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 lg:py-10 space-y-10">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white rounded-2xl p-6 md:p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mt-[40px]">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">Welcome back, {agentName || 'Agent'}!</h1>
            <p className="text-emerald-100 mt-2 text-lg">Have a productive day ahead</p>
          </div>
          <div className="bg-emerald-900/40 px-6 py-4 rounded-xl text-right min-w-[220px] backdrop-blur-sm">
            <div className="text-sm opacity-90 flex items-center justify-end gap-2">
              <Calendar size={16} />
              {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="font-semibold text-lg">{agentName ? agentName : 'Agent'}</div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-6">
          {[
            { title: "MY CLIENTS", value: monthlyStats.assignedTotalClients || 0, subtitle: "Total assigned clients", icon: Users, color: "emerald" },
            { title: "MANAGED LOANS", value: `₹${(monthlyStats.assignedTotalLoan || 0).toLocaleString()}`, subtitle: "Total loan amount", color: "emerald" },
            // { title: "COLLECTION RATE", value: `${monthlyStats.collectionRate}%`, subtitle: "Overall collection progress", icon: Gauge, color: "emerald" },
          ].map((stat, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-2xl p-5 lg:p-6 shadow hover:shadow-lg transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 font-medium uppercase tracking-wide">{stat.title}</p>
                  <p className="text-4xl font-bold text-emerald-800 mt-3">{stat.value}</p>
                </div>
                {stat.icon && (
                  <div className={`bg-${stat.color}-50 p-4 rounded-xl`}>
                    <stat.icon className={`h-8 w-8 text-${stat.color}-700`} />
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-3">{stat.subtitle}</p>
            </div>
          ))}
        </div>

        {/* Today Status Card */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-6">
              <h3 className="text-xl font-semibold">Today Status</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Today Due Amount */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-l-4 border-blue-500 hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 font-medium uppercase tracking-wide">Today Due</p>
                    <p className="text-3xl font-bold text-blue-800 mt-2">
                      ₹{(monthlyStats.todayDueTotal || 0).toLocaleString()}
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
                      ₹{(monthlyStats.todayCollected || 0).toLocaleString()}
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
                      ₹{(monthlyStats.todayPending || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-4xl opacity-30">⏳</div>
                </div>
                <p className="text-xs text-amber-600 mt-2">Today not collected yet</p>
              </div>
            </div>
          </div>

        {/* Collection Progress + Recent Communications side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: Merged Collection Progress */}
          <div className="bg-white rounded-2xl border shadow-sm p-6 lg:p-7">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Collection Progress</h2>
              <span className="text-sm text-gray-500">{new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>

            {/* Monthly Section */}
            {/* <div className="mb-8">
              <h3 className="text-lg font-semibold text-gray-800 mb-5">Monthly</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Collected Amount</span>
                    <span className="font-bold">₹{monthlyStats.totalCollected.toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-600 transition-all duration-1000`} style={{ width: `${monthlyStats.totalCollected + monthlyStats.totalPending > 0 ? Math.round((monthlyStats.totalCollected / (monthlyStats.totalCollected + monthlyStats.totalPending)) * 100) : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Pending Amount</span>
                    <span className="font-bold">₹{monthlyStats.totalPending.toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-amber-600 transition-all duration-1000`} style={{ width: `${monthlyStats.totalCollected + monthlyStats.totalPending > 0 ? Math.round((monthlyStats.totalPending / (monthlyStats.totalCollected + monthlyStats.totalPending)) * 100) : 0}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-700">₹{monthlyStats.totalCollected.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Collected</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-700">₹{monthlyStats.totalPending.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-gray-800">{monthlyStats.pendingClients || 0}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending Clients</p>
                  </div>
                </div>

                <div className="pt-3">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Overall Status</span>
                    <span className="font-bold">{monthlyStats.totalCollected + monthlyStats.totalPending > 0 ? Math.round((monthlyStats.totalCollected / (monthlyStats.totalCollected + monthlyStats.totalPending)) * 100) : 0}%</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-600 transition-all duration-1000`} style={{ width: `${monthlyStats.totalCollected + monthlyStats.totalPending > 0 ? Math.round((monthlyStats.totalCollected / (monthlyStats.totalCollected + monthlyStats.totalPending)) * 100) : 0}%` }} />
                  </div>
                </div>
              </div>
            </div> */}

            {/* Today Section */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-5">Today</h3>
              <div className="space-y-5">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Collected Today</span>
                    <span className="font-bold">₹{(monthlyStats.todayCollected || 0).toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-600 transition-all duration-1000`} style={{ width: `${(monthlyStats.todayCollected || 0) + (monthlyStats.todayPending || 0) > 0 ? Math.round(((monthlyStats.todayCollected || 0) / ((monthlyStats.todayCollected || 0) + (monthlyStats.todayPending || 0))) * 100) : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Monthly collection</span>
                    <span className="font-bold">₹{(monthlyStats.totalCollected || 0).toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-amber-600 transition-all duration-1000`} style={{ width: `${(monthlyStats.totalCollected || 0) + (monthlyStats.totalPending || 0) > 0 ? Math.round(((monthlyStats.totalCollected || 0) / ((monthlyStats.totalCollected || 0) + (monthlyStats.totalPending || 0))) * 100) : 0}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-700 font-medium">Today's Target</span>
                    <span className="font-bold">₹{(monthlyStats.todayDueTotal || 0).toLocaleString()}</span>
                  </div>
                  <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-gray-600 transition-all duration-1000`} style={{ width: `100%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-2">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-emerald-700">₹{(monthlyStats.todayCollected || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Collected</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-amber-700">₹{(monthlyStats.todayPending || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-700">{monthlyStats.todayClientsDue}</p>
                    <p className="text-xs text-gray-500 mt-1">Clients Due</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Recent Client Communications */}
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Recent Communications</h2>
            </div>

            <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Client</th>
                    <th className="px-4 py-3 text-left font-medium">Amount</th>
                    <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingPayments ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600"></div>
                          <span className="text-gray-600 text-xs">Loading...</span>
                        </div>
                      </td>
                    </tr>
                  ) : recentPayments.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-gray-500 text-xs">No communications</td>
                    </tr>
                  ) : (
                    recentPayments.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium truncate">{row.client}</td>
                        <td className="px-4 py-3 text-green-700 font-medium">₹{Number(row.received).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{row.date}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}