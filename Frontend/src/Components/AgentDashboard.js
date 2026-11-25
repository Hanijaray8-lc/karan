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
import { isRecordNewForUser } from '../utils/staffRecordFilter';
import { getClientWeekSchedule } from './DailyDues';

// ---------------------------------------------------------------------------
// Who collected the payment? Agent dashboard must show AGENT-collected
// payments only — manager/admin collected payments are excluded everywhere
// (recent list, today collected, totals, today pending).
// Rule: only payments collected by an AGENT are shown.
// ---------------------------------------------------------------------------
const getCollectorRole = (p) => {
  if (!p) return '';
  const direct = (p.collectedByRole || '').toString().trim().toLowerCase();
  if (direct) return direct;
  const staff = (p.collectedStaff || '').toString().trim();
  // backend sometimes stores only a role label ("Manager") or "Name (manager)"
  if (['agent', 'manager', 'admin'].includes(staff.toLowerCase())) return staff.toLowerCase();
  const m = staff.match(/\((agent|manager|admin)\)\s*$/i);
  return m ? m[1].toLowerCase() : '';
};

// STRICT: true only when an AGENT collected the payment.
//  - role 'agent'            -> yes
//  - role 'manager'/'admin'  -> no
//  - role missing (legacy)   -> yes only if collectedStaff is empty or is this agent's name
const isAgentCollected = (p, agentName = '') => {
  const role = getCollectorRole(p);
  if (role === 'agent') return true;
  if (role) return false; // manager / admin / anything else
  const staff = (p.collectedStaff || p.staff?.name || '').toString().trim().toLowerCase();
  if (!staff) return true;
  const me = (agentName || '').toString().trim().toLowerCase();
  return !!me && (staff === me || staff.includes(me) || me.includes(staff));
};

// Safely read the assigned-agent id from a client (string / object / {$oid})
const getClientAgentId = (c) => {
  if (!c) return '';
  const raw =
    (c.assigned_agent && typeof c.assigned_agent === 'object'
      ? (c.assigned_agent._id || c.assigned_agent.id || c.assigned_agent.$oid)
      : c.assigned_agent) ||
    c.agentId || c.agent_id ||
    (c.agent && typeof c.agent === 'object'
      ? (c.agent._id || c.agent.id || c.agent.$oid)
      : c.agent) ||
    '';
  return String(raw).trim();
};

// Actual date the money was PAID/collected (createdAt). Falls back to paymentDate / date
// only when createdAt is missing. paymentDate is the due date (can be an advance/future date),
// so it must NOT be used to decide "today collected".
const getPaidDate = (p) => {
  if (!p) return null;
  const candidates = [p.createdAt, p.paymentDate, p.date];
  for (const c of candidates) {
    if (!c) continue;
    const d = c instanceof Date ? new Date(c.getTime()) : new Date(c);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

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

  // Helper: compute weekly amount using the ORIGINAL loan total (not pending)
  // Using pending causes wrong values when advance payments reduce it early.
  const computeWeeklyAmount = (client) => {
    if (!client) return 0;
    // Prefer stored weekly_amount from server
    if (client.weekly_amount && Number(client.weekly_amount) > 0) return Number(client.weekly_amount);
    if (!client.loan_start_date) return 0;

    // Use total loan amount (received + pending) as the basis so advance
    // payments don't distort the per-week figure.
    const received = Number(client.received || 0);
    const pending = Number(client.pending || 0);
    const loanTotal = received + pending; // original repayable amount

    if (loanTotal <= 0) return 575; // fallback

    // For ₹5000 (payable ₹6900) loans, default to 575
    if (Number(client.amount) === 5000 || Number(client.amount) === 6900 || loanTotal === 6900) return 575;

    const amt = Number(client.amount || 0);
    const derived = Math.round((loanTotal / 12) || 0);
    return derived > 0 ? derived : 575;
  };

  // Parse date safely (strictly matches MDailyDues)
  const parseLocalDate = (dateInput) => {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    const str = String(dateInput).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const toLocalDateStr = (dateInput) => {
    if (!dateInput) return '';
    if (typeof dateInput === 'string') {
      const match = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Determine which 12-week installment (1..12) falls on targetStr (strictly 12-week schedule, matching MDailyDues)
  const getClientDueWeekIndex = (client, dateInput) => {
    if (!client || !client.loan_start_date) return -1;
    const start = parseLocalDate(client.loan_start_date);
    const target = parseLocalDate(dateInput);
    if (!start || !target || target < start) return -1;
    if (start.getDay() !== target.getDay()) return -1;
    const diffDays = Math.round((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays % 7 !== 0) return -1;
    const weekIndex = Math.floor(diffDays / 7) + 1;
    if (weekIndex < 1 || weekIndex > 12) return -1;
    return weekIndex;
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
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayCollected = payments.reduce((s, x) => {
        const d = getPaidDate(x);
        if (!d) return s;
        d.setHours(0, 0, 0, 0);
        return s + ((d.getTime() === today.getTime()) ? (Number(x.amount) || 0) : 0);
      }, 0);
      const todayPending = payments.reduce((s, x) => {
        const d = getPaidDate(x);
        if (!d) return s;
        d.setHours(0, 0, 0, 0);
        return s + ((d.getTime() === today.getTime()) ? (Number(x.remainingDue || x.pending) || 0) : 0);
      }, 0);
      const pendingClients = payments.filter(p => Number(p.remainingDue || p.pending) > 0).length;
      const totalClients = new Set(payments.map(p => p.clientName || p.client?.name || '')).size;
      const totalLoan = totalCollected + totalPending;
      const collectionRate = totalLoan > 0 ? Math.round((totalCollected / totalLoan) * 100) : 0;
      const todayClientsDue = payments.filter(p => {
        const d = getPaidDate(p);
        if (!d) return false;
        d.setHours(0, 0, 0, 0);
        return d.getTime() === today.getTime();
      }).length;
      return { totalCollected, totalPending, todayCollected, todayPending, pendingClients, totalClients, totalLoan, collectionRate, todayClientsDue };
    };

    const fetchRecentPayments = async () => {
      try {
        setLoadingPayments(true);
        const userRaw = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        if (!userRaw || !token) {
          window.location.href = '/';
          return;
        }
        const user = JSON.parse(userRaw);
        if (user.status === 'Pending') {
          window.location.href = '/';
          return;
        }
        setAgentName(user.name || user.username || '');
        const agentId = user._id || user.id || null;
        const agentName = user.name || user.username || '';

        // Request recent payments; backend uses req.user to scope results to the
        // current agent, so no additional query parameter is needed.
        const url = `https://karanfinance.com/api/payments/history?limit=500`;
        const [res, clientsRes] = await Promise.all([
          fetch(url, { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` } }),
          fetch('https://karanfinance.com/api/clients/all', {
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
          }).catch(err => {
            console.warn('Clients API fetch failed:', err);
            return { ok: false, status: 500 };
          })
        ]);

        // helper that enforces agent filter regardless of server response
        const enforceAgentFilter = (paymentsArray) => {
          if (!agentId && !agentName) return paymentsArray;
          return paymentsArray.filter(p => {
            // Exclude old payments made before the agent joined
            if (!isRecordNewForUser(p, user)) return false;

            // Show ONLY agent-collected payments (no manager / admin collections)
            if (!isAgentCollected(p, agentName)) return false;

            // match by stored agent reference if available
            if (agentId) {
              const payAgentId = p.agent?._id || p.agent || '';
              if (payAgentId && String(payAgentId) === String(agentId)) return true;
            }
            // fallback to collectedStaff string
            if (agentName) {
              const collectedStaff = p.collectedStaff || '';
              if (collectedStaff === agentName) return true;
            }
            return false;
          });
        };

        if (!res.ok) {
          // fallback to test endpoint
          const fallback = await fetch('https://karanfinance.com/api/payments/test/all');
          if (!fallback.ok) throw new Error('Failed to fetch payments');
          const fbData = await fallback.json();
          const payments = (fbData.data && fbData.data.payments) || fbData.data || [];
          const filteredPayments = enforceAgentFilter(payments);
          const recent = filteredPayments.slice(0, 6);
          setRecentPayments(recent.map(mapPaymentToRow));
          const stats = computeStats(filteredPayments);
          setMonthlyStats(stats);
          return;
        }

        const data = await res.json();
        const payments = (data.data && data.data.payments) || data.payments || [];
        // ensure the list contains only records belonging to this agent
        const filteredPayments = enforceAgentFilter(payments);
        setRecentPayments(filteredPayments.slice(0, 6).map(mapPaymentToRow));
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
          // clientsRes already fetched in parallel with payments

          let clientsList = [];
          if (clientsRes.ok) {
            const clientsJson = await clientsRes.json();
            clientsList = clientsJson.clients || [];
          } else {
            console.warn('Clients API failed, status:', clientsRes.status);
          }

          const today = new Date(); today.setHours(0, 0, 0, 0);
          let todayClientsDue = 0;
          let todayPendingAmount = 0;
          let todayDueTotal = 0;

          // Log for debugging
          console.log('Total clients fetched:', clientsList.length);
          console.log('Agent ID:', agentId);

          // restrict clients list to those assigned to this agent, if agentId available
          let agentClients = [];
          if (agentId) {
            agentClients = clientsList.filter(c => {
              // only clients assigned to THIS agent (manager-owned / unassigned clients excluded)
              const cid = getClientAgentId(c);
              if (!cid || cid !== String(agentId).trim()) return false;
              // keep join-date rule consistent with other agent pages
              return isRecordNewForUser(c, user);
            });
            console.log('Filtered agent clients:', agentClients.length);
          }

          // merge some of these client-based metrics into monthly stats as well
          const assignedTotalClients = agentClients.length;
          const assignedTotalLoan = agentClients.reduce((s, c) => s + (Number(c.amount) || 0), 0);
          const assignedTotalPending = agentClients.reduce((s, c) => s + (Number(c.pending) || 0), 0);
          // later we will merge these values into state

          // ---- Today Due / Today Pending (same logic as the Manager dashboard) ----
          // DUE     = FIXED total of every client scheduled today (paid or not); never reduces.
          // PENDING = scheduled clients whose installment for THIS due date is not paid on this
          //           due date. Advance / previous-week payments (by any staff) never reduce it;
          //           only a normal payment dated on today's due date does.
          const todayStr = toLocalDateStr(today);
          const payKey = (p) => {
            if (p.client && typeof p.client === 'object') return String(p.client._id || p.client.id || p.client.$oid || '');
            return String(p.client || p.clientId || p.client_id || '');
          };
          const paymentsByClientId = {};
          payments.forEach(p => {
            const k = payKey(p);
            if (!k) return;
            (paymentsByClientId[k] = paymentsByClientId[k] || []).push(p);
          });
          const isAdvancePayment = (p) => /advance/i.test(String(p.notes || '')) || p.isAdvance === true;

          agentClients.forEach(client => {
            const key = String(client._id || client.id || client.clientId || client.$oid || '').trim();
            if (!key) return;
            // Must be scheduled today (12-week schedule) and not pushed to next week
            if (getClientDueWeekIndex(client, today) === -1) return;
            if (client.last_pushed_date && toLocalDateStr(client.last_pushed_date) === todayStr) return;

            const clientPayments = paymentsByClientId[key] || [];
            const cw = {
              ...client,
              pending: Number(client.pending ?? ((client.amount || 6900) - (client.received || 0))),
              weekly_amount_value: 575,
              payments: clientPayments
            };
            const schedule = getClientWeekSchedule(cw, todayStr) || [];
            const weekObj = schedule.find(w => w.dueDate === todayStr);
            // Same check as the Weekly Dues page: only a normal payment dated on this due date that the
            // schedule assigned to THIS week counts. Advance / previous-week payments do not.
            const paidOnDueDate = !!weekObj && !weekObj.isAdvance && (weekObj.payments || []).some(p =>
              !isAdvancePayment(p) && toLocalDateStr(p.paymentDate || p.date) === todayStr
            );

            // Fully closed loans are only counted if they actually paid on this due date
            const closed = Number(client.pending) <= 0 || client.status === 'paid';
            if (closed && !paidOnDueDate) return;

            const weekly = computeWeeklyAmount(client) || 575;
            let amount = weekly;
            if (!closed) {
              if (weekObj && Number(weekObj.dueAmount) > 0) {
                amount = Math.min(Number(cw.pending), Number(weekObj.dueAmount));
              }
            }

            todayClientsDue++;
            todayDueTotal += amount;                          // fixed, never reduces
            if (!paidOnDueDate) todayPendingAmount += amount; // reduces only on due-date payment
          });

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

      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-12 py-8 lg:py-10 space-y-6 md:space-y-10">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-700 text-white rounded-2xl p-5 md:p-8 shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mt-0">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold break-words">Welcome back, {agentName || 'Agent'}!</h1>
            <p className="text-emerald-100 mt-2 text-base sm:text-lg">Have a productive day ahead</p>
          </div>
          <div className="bg-emerald-900/40 px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-left md:text-right w-full md:w-auto md:min-w-[220px] backdrop-blur-sm">
            <div className="text-sm opacity-90 flex items-center justify-start md:justify-end gap-2">
              <Calendar size={16} />
              {new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div className="font-semibold text-lg">{agentName ? agentName : 'Agent'}</div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {[
            { title: "MY CLIENTS", value: monthlyStats.assignedTotalClients || 0, subtitle: "Total assigned clients", icon: Users, color: "emerald" },
            { title: "MANAGED LOANS", value: `₹${(monthlyStats.assignedTotalLoan || 0).toLocaleString()}`, subtitle: "Total loan amount", color: "emerald" },
            // { title: "COLLECTION RATE", value: `${monthlyStats.collectionRate}%`, subtitle: "Overall collection progress", icon: Gauge, color: "emerald" },
          ].map((stat, index) => (
            <div
              key={index}
              className="bg-white border border-gray-200 rounded-2xl p-3 sm:p-5 lg:p-6 shadow hover:shadow-lg transition-all duration-300 min-w-0"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-sm text-gray-600 font-medium uppercase tracking-wide">{stat.title}</p>
                  <p className="text-xl sm:text-3xl lg:text-4xl font-bold text-emerald-800 mt-2 sm:mt-3 break-words">{stat.value}</p>
                </div>
                {stat.icon && (
                  <div className={`bg-${stat.color}-50 p-2 sm:p-4 rounded-xl shrink-0`}>
                    <stat.icon className={`h-5 w-5 sm:h-8 sm:w-8 text-${stat.color}-700`} />
                  </div>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-2 sm:mt-3">{stat.subtitle}</p>
            </div>
          ))}
        </div>

        {/* Today Status Card */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-4 sm:p-6">
          <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 py-3 rounded-lg mb-6">
            <h3 className="text-xl font-semibold">Today Status</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
            {/* Today Due Amount */}
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border-l-4 border-blue-500 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium uppercase tracking-wide">Today Due</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-800 mt-2 break-words">
                    ₹{(monthlyStats.todayDueTotal || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-3xl sm:text-4xl opacity-30 shrink-0">📅</div>
              </div>
              <p className="text-xs text-blue-600 mt-2">Today total due amount</p>
            </div>

            {/* Today Payment Success */}
            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg p-4 border-l-4 border-emerald-500 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-emerald-600 font-medium uppercase tracking-wide">Payment Success</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-800 mt-2 break-words">
                    ₹{(monthlyStats.todayCollected || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-3xl sm:text-4xl opacity-30 shrink-0">✓</div>
              </div>
              <p className="text-xs text-emerald-600 mt-2">Today collected amount</p>
            </div>

            {/* Today Pending Amount */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border-l-4 border-amber-500 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-amber-600 font-medium uppercase tracking-wide">Today Pending</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-800 mt-2 break-words">
                    ₹{(monthlyStats.todayPending || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-3xl sm:text-4xl opacity-30 shrink-0">⏳</div>
              </div>
              <p className="text-xs text-amber-600 mt-2">Today not collected yet</p>
            </div>
          </div>
        </div>

        {/* Collection Progress + Recent Communications side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-8">
          {/* Left: Merged Collection Progress */}
          <div className="bg-white rounded-2xl border shadow-sm p-4 sm:p-6 lg:p-7 min-w-0">
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

                <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2">
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-emerald-700 break-words">₹{monthlyStats.totalCollected.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Collected</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-amber-700 break-words">₹{monthlyStats.totalPending.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-gray-800 break-words">{monthlyStats.pendingClients || 0}</p>
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

                <div className="grid grid-cols-3 gap-2 sm:gap-4 pt-2">
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-emerald-700 break-words">₹{(monthlyStats.todayCollected || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Collected</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-amber-700 break-words">₹{(monthlyStats.todayPending || 0).toLocaleString()}</p>
                    <p className="text-xs text-gray-500 mt-1">Pending</p>
                  </div>
                  <div className="text-center">
                    <p className="text-base sm:text-2xl font-bold text-blue-700 break-words">{monthlyStats.todayClientsDue}</p>
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

            <div className="overflow-auto" style={{ maxHeight: '600px' }}>
              <table className="w-full min-w-[460px] text-xs">
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
                        <td className="px-3 sm:px-4 py-3 font-medium truncate max-w-[130px] sm:max-w-none">{row.client}</td>
                        <td className="px-3 sm:px-4 py-3 text-green-700 font-medium whitespace-nowrap">₹{Number(row.received).toLocaleString()}</td>
                        <td className="px-3 sm:px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{row.date}</td>
                        <td className="px-3 sm:px-4 py-3">
                          <span className="inline-flex whitespace-nowrap px-2 py-1 bg-orange-100 text-orange-800 rounded text-xs font-medium">
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