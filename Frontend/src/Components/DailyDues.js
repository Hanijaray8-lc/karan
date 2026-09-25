import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameDay } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import AgentNavbar from './AgentNavbar';  // ← adjust path if needed

const parseLocalDate = (dateInput) => {
  if (!dateInput) return null;
  if (dateInput instanceof Date) {
    return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
  }
  const str = String(dateInput).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
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

// Helper for generating scheduled weekly due dates
const getClientScheduledDueDates = (client) => {
  if (!client || !client.loan_start_date) return [];
  const start = parseLocalDate(client.loan_start_date);
  if (!start) return [];

  const defaultWeeks = 12;
  const end = client.loan_end_date
    ? parseLocalDate(client.loan_end_date)
    : new Date(start.getFullYear(), start.getMonth(), start.getDate() + (defaultWeeks - 1) * 7);

  const dueDates = [];
  let due = new Date(start);
  while (due <= end) {
    dueDates.push(toLocalDateStr(due));
    due.setDate(due.getDate() + 7);
  }
  return dueDates;
};

const DailyDues = () => {
  const [clients, setClients] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStartDate, setWeekStartDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('selectedDistrict');
    return saved || '';
  });
  const [selectedLandmark, setSelectedLandmark] = useState(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('selectedLandmark');
    return saved || '';
  });
  const [showClientModal, setShowClientModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFinalDueModal, setShowFinalDueModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calendarDateFilter, setCalendarDateFilter] = useState('');
  // Track per-client actions done today (frontend-only + server check for payments)
  const [paidTodayMap, setPaidTodayMap] = useState({}); // localStorage marker for Mark Paid
  const [notPaidTodayMap, setNotPaidTodayMap] = useState({}); // localStorage marker for Not Paid
  const [serverPaidTodayMap, setServerPaidTodayMap] = useState({}); // server-side payments today
  const [selectedAlpha, setSelectedAlpha] = useState(''); // alphabet filter for landmarks
  const [customAmount, setCustomAmount] = useState('');
  const [showMoreAlpha, setShowMoreAlpha] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // trigger to refresh clients after state changes (matches Agent view)
  // Maintain an ordered list of landmarks (persisted to localStorage) for drag-reorder
  const [orderedLandmarks, setOrderedLandmarks] = useState(() => {
    try {
      const saved = localStorage.getItem('landmarkOrder');
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  // Derive available landmarks from clients (filtered by selected district)
  const getAvailableLandmarks = () => {
    // Count clients per landmark (respect selected district filter) and
    // return landmarks sorted by count desc, then alphabetically.
    const counts = {};
    clients.forEach((c) => {
      const lm = (c.landmark || '').toString().trim();
      if (!lm) return;
      if (selectedDistrict) {
        if ((c.district || '').toString() !== selectedDistrict) return;
      }
      counts[lm] = (counts[lm] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return a.localeCompare(b);
    });
  };

  // Auto-select a landmark when an alphabet filter yields exactly one match
  useEffect(() => {
    if (!selectedAlpha) return;
    const avail = getAvailableLandmarks();
    const filtered = avail.filter(l => (l || '').toString().toLowerCase().startsWith(selectedAlpha.toLowerCase()));
    if (filtered.length === 1) setSelectedLandmark(filtered[0]);
  }, [selectedAlpha, clients, selectedDistrict]);

  const getIconForLandmark = (name) => {
    if (!name) return '🏷️';
    const n = name.toLowerCase();
    if (n.includes('tea') || n.includes('shop') || n.includes('t.nagar') || n.includes('tnagar')) return '☕';
    if (n.includes('k.k') || n.includes('kk')) return '🏙️';
    if (n.includes('race')) return '🏁';
    if (n.includes('srirang') || n.includes('temple')) return '🏛️';
    if (n.includes('marina') || n.includes('beach')) return '🌊';
    return '🏬';
  };

  // Compute weekly amount client-side when backend value is missing
  const computeWeeklyAmount = (client) => {
    try {
      if (!client) return 575;
      const amount = Number(client.amount || 0);
      const pendingTotal = Number(client.pending || 0);
      const pending = isNaN(pendingTotal) ? 0 : pendingTotal;

      if (amount === 5000 || amount === 6900 || pending === 5000 || pending === 6900) return 575;
      if (client.weekly_amount && Number(client.weekly_amount) > 0) return Number(client.weekly_amount);

      if (pending <= 0) return 0;
      if (!client.loan_start_date) return 575;

      const start = new Date(client.loan_start_date);
      const defaultWeeks = 12;
      // when there is no explicit end date, assume a 12‑week loan period
      // by setting the end to start + (defaultWeeks - 1) weeks.  The loop
      // that generates dues is inclusive of both start and end, so using
      // the full 12*7ms interval would produce 13 due dates.  Subtracting
      // one week ensures the initial count is 12, and pushing the due
      // date by one week increases the count to 13 as expected.
      const end = client.loan_end_date
        ? new Date(client.loan_end_date)
        : new Date(start.getTime() + (defaultWeeks - 1) * 7 * 24 * 60 * 60 * 1000);

      let durationMs = end.getTime() - start.getTime();
      let durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
      let weeks = Math.ceil(durationDays / 7);
      if (!weeks || weeks < 1) weeks = defaultWeeks;

      const weekly = weeks > 0 ? (pending / weeks) : 0;
      return Math.round(weekly * 100) / 100;
    } catch (err) {
      return 575;
    }
  };

  // Save district filter to localStorage
  useEffect(() => {
    localStorage.setItem('selectedDistrict', selectedDistrict);
  }, [selectedDistrict]);

  // Save landmark filter to localStorage
  useEffect(() => {
    localStorage.setItem('selectedLandmark', selectedLandmark);
  }, [selectedLandmark]);

  // Mock data - replace with actual API call
  useEffect(() => {
    fetchClients();

    // Setup polling to check for payments made by other users (every 30 seconds)
    const pollInterval = setInterval(() => {
      fetchClientsWithoutLoading();
    }, 30000); // 30 seconds

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
  }, []);

  // Listen for client updates from other components (e.g., payment cancellation)
  useEffect(() => {
    const handleClientUpdate = (event) => {
      const { clientId, loan_end_date } = event.detail;
      const todayISO = toLocalDateStr(new Date());
      setClients(prevClients =>
        prevClients.map(client => {
          if (client._id !== clientId) return client;
          const updated = {
            ...client,
            loan_end_date: loan_end_date,
            paid: false,
            payments: (client.payments || []).filter(p => {
              const pDate = p.paymentDate ? toLocalDateStr(new Date(p.paymentDate)) : null;
              return pDate !== todayISO;
            })
          };
          if (updated.paidDates instanceof Set) {
            const newSet = new Set(updated.paidDates);
            newSet.delete(todayISO);
            updated.paidDates = newSet;
          } else if (Array.isArray(updated.paidDates)) {
            updated.paidDates = updated.paidDates.filter(d => d !== todayISO);
          }
          return updated;
        })
      );
      // Clear local action markers to re-enable buttons
      setPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      setNotPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      // Clear server-side payment flag
      setServerPaidTodayMap(prev => {
        const newMap = { ...prev };
        delete newMap[clientId];
        return newMap;
      });
      // Clear localStorage entries for both actions
      try {
        localStorage.removeItem(`markedPaid_${clientId}`);
        localStorage.removeItem(`pushedNotPaid_${clientId}`);
      } catch (e) { }
      // Also update selectedClient if it's the same client
      setSelectedClient(prev => {
        if (!prev || prev._id !== clientId) return prev;
        const updated = {
          ...prev,
          loan_end_date: loan_end_date,
          paid: false,
          payments: (prev.payments || []).filter(p => {
            const pDate = p.paymentDate ? toLocalDateStr(new Date(p.paymentDate)) : null;
            return pDate !== todayISO;
          })
        };
        // remove today's paid date if present
        if (updated.paidDates instanceof Set) {
          const newSet = new Set(updated.paidDates);
          newSet.delete(todayISO);
          updated.paidDates = newSet;
        } else if (Array.isArray(updated.paidDates)) {
          updated.paidDates = updated.paidDates.filter(d => d !== todayISO);
        }
        return updated;
      });
      // trigger a small refresh so derived UI state (buttons, stats) re-evaluates
      setRefreshTrigger(prev => prev + 1);
      showNotification('Client due date has been extended due to payment cancellation.', 'info');
    };

    const handleClientPaid = (event) => {
      const { clientId, amount = 575 } = event.detail;
      const todayISO = toLocalDateStr(new Date());
      const newPayment = {
        amount,
        paymentDate: new Date().toISOString(),
        collectedByRole: JSON.parse(localStorage.getItem('user') || '{}')?.role || 'agent'
      };
      setClients(prevClients =>
        prevClients.map(client => {
          if (client._id !== clientId) return client;
          const updatedPayments = [...(client.payments || []), newPayment];
          const updated = {
            ...client,
            paid: true,
            received: (client.received || 0) + amount,
            pending: (client.pending || 0) - amount,
            payments: updatedPayments
          };
          if (updated.paidDates instanceof Set) {
            updated.paidDates = new Set([...updated.paidDates, todayISO]);
          } else if (Array.isArray(updated.paidDates)) {
            updated.paidDates = [...updated.paidDates, todayISO];
          } else {
            updated.paidDates = new Set([todayISO]);
          }
          return updated;
        })
      );
      setPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
      setSelectedClient(prev => {
        if (!prev || prev._id !== clientId) return prev;
        const updatedPayments = [...(prev.payments || []), newPayment];
        const updated = {
          ...prev,
          paid: true,
          received: (prev.received || 0) + amount,
          pending: (prev.pending || 0) - amount,
          payments: updatedPayments
        };
        if (updated.paidDates instanceof Set) {
          updated.paidDates = new Set([...updated.paidDates, todayISO]);
        } else if (Array.isArray(updated.paidDates)) {
          updated.paidDates = [...updated.paidDates, todayISO];
        } else {
          updated.paidDates = new Set([todayISO]);
        }
        return updated;
      });
    };

    const handleClientPushed = (event) => {
      const { clientId, loan_end_date } = event.detail;
      setClients(prevClients =>
        prevClients.map(client =>
          client._id === clientId ? { ...client, loan_end_date } : client
        )
      );
      setNotPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
      setSelectedClient(prev => {
        if (!prev || prev._id !== clientId) return prev;
        return { ...prev, loan_end_date };
      });
    };

    window.addEventListener('clientUpdated', handleClientUpdate);
    window.addEventListener('clientPaid', handleClientPaid);
    window.addEventListener('clientLoanEndUpdated', handleClientPushed);
    return () => {
      window.removeEventListener('clientUpdated', handleClientUpdate);
      window.removeEventListener('clientPaid', handleClientPaid);
      window.removeEventListener('clientLoanEndUpdated', handleClientPushed);
    };
  }, []);

  // Fetch clients without showing loading indicator (for polling)
  const fetchClientsWithoutLoading = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('https://karan-e26t.onrender.com/api/clients/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return;

      const data = await res.json();

      if (data.success && data.clients) {
        const transformedClients = data.clients.map(client => {
          const forcedWeekly = 575;
          const display = `₹${forcedWeekly.toLocaleString('en-IN')}`;
          const rawPending = client.pending ?? ((client.amount !== undefined && client.received !== undefined) ? (client.amount - client.received) : null);
          const normalizedPending = Number(rawPending ?? 0);

          return {
            ...client,
            pending: isNaN(normalizedPending) ? 0 : normalizedPending,
            weekly_amount_value: forcedWeekly,
            daily_amount: display,
            daily_amount_value: forcedWeekly,
            pending_amount: isNaN(normalizedPending) ? 0 : normalizedPending,
            paidDates: new Set(),
            paid: false,
            payments: [],
            type: 'loan'
          };
        });
        // Attach paid status by checking payment records
        try {
          const payRes = await fetch('https://karan-e26t.onrender.com/api/payments/test/all');
          const payJson = payRes.ok ? await payRes.json() : null;
          const rawPayments = (payJson && payJson.data && payJson.data.payments) || [];
          const seenIds = new Set();
          const payments = [];
          rawPayments.forEach(p => {
            const pId = p._id || p.id;
            if (pId) {
              if (!seenIds.has(pId)) {
                seenIds.add(pId);
                payments.push(p);
              }
            } else {
              payments.push(p);
            }
          });
          const todayISO = toLocalDateStr(new Date());

          // Build maps: paidDatesMap, collectorsMap, and paymentsByClient
          const paidDatesMap = {};
          const collectorsMap = {};
          const paymentsByClient = {};

          payments.forEach(p => {
            const clientId = p.client && p.client._id
              ? String(p.client._id)
              : (p.client && p.client.id
                ? String(p.client.id)
                : (p.client ? String(p.client) : (p.clientId ? String(p.clientId) : (p.client_id ? String(p.client_id) : null))));
            const pDate = p.paymentDate ? toLocalDateStr(p.paymentDate) : null;
            if (clientId && pDate) {
              if (!paidDatesMap[clientId]) paidDatesMap[clientId] = new Set();
              paidDatesMap[clientId].add(pDate);
            }

            if (clientId) {
              if (!paymentsByClient[clientId]) paymentsByClient[clientId] = [];
              paymentsByClient[clientId].push(p);
            }

            if (clientId && pDate === todayISO) {
              const role = p.collectedByRole || (p.collectedStaff || '').toString().match(/\((agent|manager|admin)\)$/)?.[1];
              if (role) {
                if (!collectorsMap[clientId]) collectorsMap[clientId] = new Set();
                collectorsMap[clientId].add(role);
              }
            }
          });

          // convert collectorsMap sets to arrays for state
          const collectorsObj = {};
          Object.keys(collectorsMap).forEach(k => { collectorsObj[k] = Array.from(collectorsMap[k]); });
          setServerPaidTodayMap(collectorsObj);

          // Sync local paid markers with server state (clear local markedPaid if server has no payment today)
          transformedClients.forEach(c => {
            const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
            if (id && (!collectorsObj[id] || collectorsObj[id].length === 0)) {
              try { localStorage.removeItem(`markedPaid_${id}`); } catch (e) { }
              setPaidTodayMap(prev => {
                if (!prev[id]) return prev;
                const n = { ...prev };
                delete n[id];
                return n;
              });
            }
          });

          setClients(prevClients => {
            const prevClientMap = {};
            (prevClients || []).forEach(c => {
              const cid = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
              if (cid) prevClientMap[cid] = c;
            });

            const withPaid = transformedClients.map(c => {
              const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
              const prevC = prevClientMap[id];

              let paidDates = paidDatesMap[id] ? new Set(paidDatesMap[id]) : new Set();

              // Merge any locally added paidDates from existing state
              if (prevC && prevC.paidDates) {
                if (prevC.paidDates instanceof Set) {
                  prevC.paidDates.forEach(d => paidDates.add(d));
                } else if (Array.isArray(prevC.paidDates)) {
                  prevC.paidDates.forEach(d => paidDates.add(d));
                }
              }

              let clientPayments = paymentsByClient[id] ? [...paymentsByClient[id]] : [];
              // Merge any locally added payments from existing state if not already present
              if (prevC && Array.isArray(prevC.payments) && prevC.payments.length > 0) {
                const existingDates = new Set(clientPayments.map(p => p.paymentDate ? toLocalDateStr(p.paymentDate) : null));
                prevC.payments.forEach(localP => {
                  const localDate = localP.paymentDate ? toLocalDateStr(localP.paymentDate) : null;
                  if (localDate && !existingDates.has(localDate)) {
                    clientPayments.push(localP);
                    paidDates.add(localDate);
                  }
                });
              }

              return { ...c, paidDates, paid: paidDates.has(todayISO), payments: clientPayments };
            });

            // Build map for pushed status
            const pushedToday = {};
            withPaid.forEach(c => {
              if (c.last_pushed_date === todayISO) {
                const cid = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
                if (cid) pushedToday[cid] = true;
              }
            });
            setNotPaidTodayMap(prev => ({ ...prev, ...pushedToday }));

            return withPaid;
          });
        } catch (err) {
          setClients(transformedClients);
        }
      }
    } catch (error) {
      // Silently fail for polling - don't show errors
    }
  };

  const fetchClients = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('https://karan-e26t.onrender.com/api/clients/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to fetch clients');

      const data = await res.json();

      if (data.success && data.clients) {
        // Transform API data to include weekly due information
        const transformedClients = data.clients.map(client => {
          // Force weekly amount globally to 575 as requested
          const forcedWeekly = 575;

          // format display (integer)
          const display = `₹${forcedWeekly.toLocaleString('en-IN')}`;

          // normalize pending: prefer explicit pending, otherwise amount - received
          const rawPending = client.pending ?? ((client.amount !== undefined && client.received !== undefined) ? (client.amount - client.received) : null);
          const normalizedPending = Number(rawPending ?? 0);

          return {
            ...client,
            // normalized numeric pending
            pending: isNaN(normalizedPending) ? 0 : normalizedPending,
            // weekly/daily amount fields used in UI
            weekly_amount_value: forcedWeekly,
            daily_amount: display,
            daily_amount_value: forcedWeekly,
            pending_amount: isNaN(normalizedPending) ? 0 : normalizedPending,
            paidDates: new Set(),
            paid: false,
            payments: [],
            type: 'loan'
          };
        });

        try {
          const payRes = await fetch('https://karan-e26t.onrender.com/api/payments/test/all');
          const payJson = payRes.ok ? await payRes.json() : null;
          const rawPayments = (payJson && payJson.data && payJson.data.payments) || [];
          const seenIds = new Set();
          const payments = [];
          rawPayments.forEach(p => {
            const pId = p._id || p.id;
            if (pId) {
              if (!seenIds.has(pId)) {
                seenIds.add(pId);
                payments.push(p);
              }
            } else {
              payments.push(p);
            }
          });
          const todayISO = toLocalDateStr(new Date());
          const paidDatesMap = {};
          const collectorsMap = {};
          const paymentsByClient = {};

          payments.forEach(p => {
            const clientId = p.client && p.client._id
              ? String(p.client._id)
              : (p.client && p.client.id
                ? String(p.client.id)
                : (p.client ? String(p.client) : (p.clientId ? String(p.clientId) : (p.client_id ? String(p.client_id) : null))));
            const pDate = p.paymentDate ? toLocalDateStr(p.paymentDate) : null;
            if (clientId && pDate) {
              if (!paidDatesMap[clientId]) paidDatesMap[clientId] = new Set();
              paidDatesMap[clientId].add(pDate);
            }

            if (clientId) {
              if (!paymentsByClient[clientId]) paymentsByClient[clientId] = [];
              paymentsByClient[clientId].push(p);
            }

            if (clientId && pDate === todayISO) {
              const role = p.collectedByRole || (p.collectedStaff || '').toString().match(/\((agent|manager|admin)\)$/)?.[1];
              if (role) {
                if (!collectorsMap[clientId]) collectorsMap[clientId] = new Set();
                collectorsMap[clientId].add(role);
              }
            }
          });

          const collectorsObj = {};
          Object.keys(collectorsMap).forEach(k => { collectorsObj[k] = Array.from(collectorsMap[k]); });
          setServerPaidTodayMap(collectorsObj);

          // Sync local paid markers with server state (clear local markedPaid if server has no payment today)
          transformedClients.forEach(c => {
            const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
            if (id && (!collectorsObj[id] || collectorsObj[id].length === 0)) {
              try { localStorage.removeItem(`markedPaid_${id}`); } catch (e) { }
              setPaidTodayMap(prev => {
                if (!prev[id]) return prev;
                const n = { ...prev };
                delete n[id];
                return n;
              });
            }
          });

          setClients(prevClients => {
            const prevClientMap = {};
            (prevClients || []).forEach(c => {
              const cid = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
              if (cid) prevClientMap[cid] = c;
            });

            const withPaid = transformedClients.map(c => {
              const id = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
              const prevC = prevClientMap[id];

              let paidDates = paidDatesMap[id] ? new Set(paidDatesMap[id]) : new Set();

              // Merge any locally added paidDates from existing state
              if (prevC && prevC.paidDates) {
                if (prevC.paidDates instanceof Set) {
                  prevC.paidDates.forEach(d => paidDates.add(d));
                } else if (Array.isArray(prevC.paidDates)) {
                  prevC.paidDates.forEach(d => paidDates.add(d));
                }
              }

              let clientPayments = paymentsByClient[id] ? [...paymentsByClient[id]] : [];
              // Merge any locally added payments from existing state if not already present
              if (prevC && Array.isArray(prevC.payments) && prevC.payments.length > 0) {
                const existingDates = new Set(clientPayments.map(p => p.paymentDate ? toLocalDateStr(p.paymentDate) : null));
                prevC.payments.forEach(localP => {
                  const localDate = localP.paymentDate ? toLocalDateStr(localP.paymentDate) : null;
                  if (localDate && !existingDates.has(localDate)) {
                    clientPayments.push(localP);
                    paidDates.add(localDate);
                  }
                });
              }

              return { ...c, paidDates, paid: paidDates.has(todayISO), payments: clientPayments };
            });

            // Build map for pushed status
            const pushedToday = {};
            withPaid.forEach(c => {
              if (c.last_pushed_date === todayISO) {
                const cid = c._id ? String(c._id) : (c.clientId ? String(c.clientId) : (c.id ? String(c.id) : null));
                if (cid) pushedToday[cid] = true;
              }
            });
            setNotPaidTodayMap(prev => ({ ...prev, ...pushedToday }));

            return withPaid;
          });
        } catch (err) {
          setClients(transformedClients);
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showNotification('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Show notification
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  // Calculate if client is due in the given week
  const isClientDueInWeek = (client, weekStartDate, weekEndDate) => {
    // use total pending amount (client.pending) to determine if loan is active
    if (!client || !client.loan_start_date || Number(client.pending) <= 0) {
      return false;
    }
    const wStartStr = toLocalDateStr(weekStartDate);
    const wEndStr = toLocalDateStr(weekEndDate);
    if (!wStartStr || !wEndStr) return false;

    const scheduledDates = getClientScheduledDueDates(client);
    return scheduledDates.some(d => d >= wStartStr && d <= wEndStr);
  };

  // Get week start and end dates
  const getWeekRange = (date) => {
    const curr = new Date(date);
    const first = curr.getDate() - curr.getDay();
    const weekStart = new Date(curr.setDate(first));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    // Set time to start and end of day
    weekStart.setHours(0, 0, 0, 0);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  };

  // Filter clients by due week
  const filterClientsByDueWeek = (date) => {
    const { weekStart, weekEnd } = getWeekRange(date);
    return clients.filter(client => isClientDueInWeek(client, weekStart, weekEnd));
  };

  // Apply all filters
  const getFilteredClients = () => {
    // kept for week-based calculations (calendar, stats, export)
    let filtered = filterClientsByDueWeek(selectedDate);

    if (selectedDistrict) {
      filtered = filtered.filter(client => client.district === selectedDistrict);
    }

    if (selectedLandmark) {
      filtered = filtered.filter(client => client.landmark === selectedLandmark);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(client => {
        return client.name.toLowerCase().includes(query) ||
          client.phone.includes(query) ||
          (client.address && client.address.toLowerCase().includes(query));
      });
    }

    return filtered;
  };

  const isClientPaidOnDate = (client, dateStr) => {
    if (!client) return false;
    const targetDate = dateStr || calendarDateFilter || toLocalDateStr(selectedDate);
    const todayISO = toLocalDateStr(new Date());
    const id = client._id || client.clientId || client.id;

    if (client.paidDates) {
      if (client.paidDates instanceof Set && client.paidDates.has(targetDate)) return true;
      if (Array.isArray(client.paidDates) && client.paidDates.includes(targetDate)) return true;
    }

    if (client.payments && Array.isArray(client.payments)) {
      const hasPaymentOnDate = client.payments.some(p => {
        const pDate = p.paymentDate ? toLocalDateStr(new Date(p.paymentDate)) : null;
        return pDate === targetDate;
      });
      if (hasPaymentOnDate) return true;
    }

    if (targetDate === todayISO) {
      if (id && paidTodayMap[id]) return true;
      if (id && isLocalActionDoneToday(id, 'markedPaid')) return true;
      if (id && Array.isArray(serverPaidTodayMap[id]) && serverPaidTodayMap[id].length > 0) return true;
    }

    if (isClientDueOnDate(client, targetDate) && calculateCurrentDue(client, targetDate) <= 0) {
      return true;
    }

    return false;
  };

  // Get clients to display in the grid (shows clients due on selected date)
  const getDisplayedClients = () => {
    let displayed = [...clients];

    // Filter by due date (today or selected calendar date)
    const filterDate = calendarDateFilter || toLocalDateStr(selectedDate);
    const todayISO = toLocalDateStr(new Date());
    displayed = displayed.filter(client => {
      const id = client._id || client.clientId || client.id;
      const isPushed = (filterDate === todayISO ? Boolean(notPaidTodayMap[id]) : false) || client.last_pushed_date === filterDate;
      const isPaid = isClientPaidOnDate(client, filterDate) || (client.status === 'paid' && Number(client.pending) <= 0) || calculateCurrentDue(client, filterDate) <= 0;
      return isClientDueOnDate(client, filterDate) && !isPushed && !isPaid;
    });

    if (selectedDistrict) {
      displayed = displayed.filter(client => client.district === selectedDistrict);
    }

    if (selectedLandmark) {
      displayed = displayed.filter(client => client.landmark === selectedLandmark);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      displayed = displayed.filter(client => {
        return (client.name && client.name.toLowerCase().includes(query)) ||
          (client.phone && client.phone.includes(query)) ||
          (client.address && client.address.toLowerCase().includes(query));
      });
    }

    return displayed;
  };

  // Get unique districts
  const getUniqueDistricts = () => {
    return [...new Set(clients.map(c => c.district))].filter(d => d).sort();
  };

  // Calculate stats
  const calculateStats = () => {
    const statsDate = calendarDateFilter || toLocalDateStr(selectedDate);
    const todayISO = toLocalDateStr(new Date());

    // Filter clients who are due on this date and not pushed
    const dueClients = clients.filter(client => {
      const id = client._id || client.clientId || client.id;
      const isPushed = (statsDate === todayISO ? Boolean(notPaidTodayMap[id]) : false) || client.last_pushed_date === statsDate;
      return isClientDueOnDate(client, statsDate) && !isPushed;
    });

    let filtered = dueClients;
    if (selectedDistrict) {
      filtered = filtered.filter(client => client.district === selectedDistrict);
    }
    if (selectedLandmark) {
      filtered = filtered.filter(client => client.landmark === selectedLandmark);
    }

    let totalDue = 0;
    let totalPaid = 0;

    filtered.forEach(client => {
      const remainingDue = calculateCurrentDue(client, statsDate);
      const paidOnDate = getPaidAmountOnDate(client, statsDate);

      totalPaid += paidOnDate;
      if (!isClientPaidOnDate(client, statsDate)) {
        totalDue += remainingDue;
      }
    });

    return { totalDue, totalPaid };
  };

  const getPaidAmountOnDate = (client, dateStr) => {
    if (!client || !client.payments) return 0;
    const seenIds = new Set();
    const uniquePayments = [];
    client.payments.forEach(p => {
      const pId = p._id || p.id;
      if (pId) {
        if (!seenIds.has(pId)) {
          seenIds.add(pId);
          uniquePayments.push(p);
        }
      } else {
        uniquePayments.push(p);
      }
    });

    return uniquePayments
      .filter(p => {
        const pDate = p.paymentDate ? toLocalDateStr(new Date(p.paymentDate)) : null;
        return pDate === dateStr;
      })
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  };

  const calculateCurrentDue = (client, dateParam) => {
    if (!client) return 575;
    const pendingCap = Number(client.pending ?? ((client.amount || 6900) - (client.received || 0)));
    if (pendingCap <= 0) return 0;

    const DEFAULT_WEEKLY_DUE = 575;
    const weeklyInstallment = DEFAULT_WEEKLY_DUE;

    // Use toLocalDateStr to avoid UTC/local timezone mismatch (do NOT use toISOString())
    const targetDateStr = dateParam || calendarDateFilter || toLocalDateStr(selectedDate);

    if (!client.loan_start_date) {
      return Math.min(pendingCap, weeklyInstallment);
    }

    const start = parseLocalDate(client.loan_start_date);
    const target = parseLocalDate(targetDateStr);
    if (!start || !target) return Math.min(pendingCap, weeklyInstallment);

    // Determine target week index T (1-based)
    let T = 1;
    if (target > start) {
      const diffDays = Math.round((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
      T = Math.floor(diffDays / 7) + 1;
    }

    // Map payments by week index using local dates (not UTC) so IST payments
    // near midnight are assigned to the correct week.
    const paymentsByWeek = {};
    if (client.payments && Array.isArray(client.payments) && client.payments.length > 0) {
      const seenIds = new Set();
      const uniquePayments = [];
      client.payments.forEach(p => {
        const pId = p._id || p.id;
        if (pId) {
          if (!seenIds.has(pId)) {
            seenIds.add(pId);
            uniquePayments.push(p);
          }
        } else {
          uniquePayments.push(p);
        }
      });

      uniquePayments.forEach(p => {
        if (!p.paymentDate) return;
        const pDate = parseLocalDate(p.paymentDate);
        if (!pDate) return;

        // Ignore payments that occurred prior to current loan_start_date
        if (pDate < start) return;

        let weekIdx = 1;
        if (pDate > start) {
          const pDiffDays = Math.round((pDate.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
          weekIdx = Math.floor(pDiffDays / 7) + 1;
        }
        paymentsByWeek[weekIdx] = (paymentsByWeek[weekIdx] || 0) + Number(p.amount || 0);
      });
    }

    if (T <= 1) {
      return Math.min(pendingCap, weeklyInstallment);
    }

    // Roll forward week by week: each week's due depends on the
    // actual due vs actual paid of the PREVIOUS week only (not a flat
    // comparison), so advance/shortfall correctly resolves after one week.
    let runningDue = weeklyInstallment; // due for week 1
    for (let k = 1; k < T; k++) {
      if (Object.prototype.hasOwnProperty.call(paymentsByWeek, k)) {
        const paidThisWeek = paymentsByWeek[k];
        const diff = paidThisWeek - weeklyInstallment;
        runningDue = weeklyInstallment - diff;
        if (runningDue < 0) runningDue = 0;
      } else {
        runningDue = weeklyInstallment; // no payment record for that week — reset to default
      }
    }
    const due = runningDue;

    return Math.min(pendingCap, due);
  };

  // Handle client click
  const handleClientClick = (client) => {
    setSelectedClient(client);
    const targetDateStr = calendarDateFilter || toLocalDateStr(selectedDate);
    const dueAmt = calculateCurrentDue(client, targetDateStr);
    const paidAmt = getPaidAmountOnDate(client, targetDateStr);
    const amountToShow = dueAmt > 0 ? dueAmt : (paidAmt > 0 ? paidAmt : dueAmt);
    setCustomAmount(amountToShow.toString());
    setShowClientModal(true);
    if (window.innerWidth <= 768) {
      document.body.style.overflow = 'hidden';
    }
  };

  // Helpers for per-day action checks
  const todayKey = () => {
    return toLocalDateStr(new Date());
  };

  const isLocalActionDoneToday = (clientId, action) => {
    try {
      const key = `${action}_${clientId}`;
      const v = localStorage.getItem(key);
      return v === todayKey();
    } catch (e) { return false; }
  };

  const setLocalActionDone = (clientId, action) => {
    try {
      const key = `${action}_${clientId}`;
      localStorage.setItem(key, todayKey());
      if (action === 'markedPaid') setPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
      if (action === 'pushedNotPaid') setNotPaidTodayMap(prev => ({ ...prev, [clientId]: true }));
    } catch (e) { }
  };

  // Helper to get today's date string (YYYY-MM-DD)
  const getTodayDateString = () => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  };

  // Query server for any payments for this client today (to avoid duplicate Mark Paid)
  const checkServerPaymentsToday = async (clientId) => {
    try {
      const token = localStorage.getItem('token');
      if (!clientId) return false;

      const today = getTodayDateString();
      // Query for payments made today for this specific client
      const res = await fetch(`https://karan-e26t.onrender.com/api/payments/history?clientId=${clientId}&startDate=${today}&endDate=${today}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return false;

      const data = await res.json();
      // Build a collectors array for this client for payments made today
      const payments = data && data.data && Array.isArray(data.data.payments) ? data.data.payments : [];
      const collectors = new Set();
      payments.forEach(p => {
        const role = p.collectedByRole || (p.collectedStaff || '').toString().match(/\((agent|manager|admin)\)$/)?.[1];
        if (role) collectors.add(role);
      });
      const collectorArray = Array.from(collectors);
      setServerPaidTodayMap(prev => ({ ...prev, [clientId]: collectorArray }));
      return collectorArray.length > 0;
    } catch (err) {
      console.error('Error checking payments today:', err);
      return false;
    }
  };

  // When modal opens (selectedClient), check localStorage and server state for today's actions
  useEffect(() => {
    if (!selectedClient) return;
    const id = selectedClient._id || selectedClient.clientId || selectedClient.id;
    if (!id) return;

    // populate local maps from localStorage
    if (isLocalActionDoneToday(id, 'markedPaid')) {
      setPaidTodayMap(prev => ({ ...prev, [id]: true }));
    }
    if (isLocalActionDoneToday(id, 'pushedNotPaid')) {
      setNotPaidTodayMap(prev => ({ ...prev, [id]: true }));
    }

    // check server for payments today
    checkServerPaymentsToday(id);
  }, [selectedClient]);

  // Force modal button state update when payment maps are cleared
  useEffect(() => {
    if (!selectedClient) return;
    const id = selectedClient._id || selectedClient.clientId || selectedClient.id;
    if (!id) return;

    // If both maps are empty for this client, sync selectedClient state to ensure modal button re-evaluates
    const serverHas = Array.isArray(serverPaidTodayMap[id]) ? serverPaidTodayMap[id].length > 0 : Boolean(serverPaidTodayMap[id]);
    if (!serverHas && !paidTodayMap[id]) {
      // Force a fresh copy of selectedClient to trigger re-render and button state evaluation
      setSelectedClient(prev => {
        if (!prev || (prev._id !== id && prev.clientId !== id && prev.id !== id)) return prev;
        // Ensure paidDates is an array/set for consistent evaluation
        if (!prev.paidDates || (!Array.isArray(prev.paidDates) && !(prev.paidDates instanceof Set))) {
          return { ...prev, paidDates: [] };
        }
        return { ...prev };
      });
    }
  }, [serverPaidTodayMap, paidTodayMap, selectedClient?._id]);

  const handleMarkPaid = async (client) => {
    try {
      const token = localStorage.getItem('token');
      const amount = Number(customAmount);
      if (isNaN(amount) || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
      }

      const targetDateStr = calendarDateFilter || toLocalDateStr(selectedDate);
      const payDateIso = targetDateStr ? `${targetDateStr}T12:00:00.000Z` : new Date().toISOString();

      const res = await fetch('https://karan-e26t.onrender.com/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: client._id,
          amount,
          paymentMethod: 'cash',
          notes: 'Marked from Weekly Dues',
          paymentDate: payDateIso
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save payment');

      // Update button state only - add current role to serverPaidTodayMap collectors
      try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user?.role || 'agent';
        setServerPaidTodayMap(prev => {
          const existing = Array.isArray(prev[client._id]) ? prev[client._id] : (prev[client._id] ? [prev[client._id]] : []);
          const set = new Set(existing);
          set.add(role);
          return { ...prev, [client._id]: Array.from(set) };
        });
      } catch (e) {
        // fallback: mark boolean true
        setServerPaidTodayMap(prev => ({ ...prev, [client._id]: ['agent'] }));
      }
      // Mark action locally for today so button stays disabled on page reload
      setLocalActionDone(client._id, 'markedPaid');
      const todayISO = getTodayDateString();
      const newPaymentObj = {
        amount,
        paymentDate: payDateIso,
        collectedByRole: JSON.parse(localStorage.getItem('user') || '{}')?.role || 'agent'
      };
      // Update client paid status immediately
      setSelectedClient(prev => {
        if (!prev) return prev;
        const prevPaid = prev.paidDates instanceof Set
          ? Array.from(prev.paidDates)
          : (Array.isArray(prev.paidDates) ? prev.paidDates : []);
        const prevPayments = Array.isArray(prev.payments) ? prev.payments : [];
        return {
          ...prev,
          paidDates: new Set([...prevPaid, targetDateStr]),
          paid: targetDateStr === todayISO,
          received: (prev.received || 0) + amount,
          pending: Math.max(0, (prev.pending || 0) - amount),
          payments: [...prevPayments, newPaymentObj]
        };
      });
      setClients(prevClients =>
        prevClients.map(c => {
          if (c._id !== client._id) return c;
          const cPaid = c.paidDates instanceof Set
            ? Array.from(c.paidDates)
            : (Array.isArray(c.paidDates) ? c.paidDates : []);
          const cPayments = Array.isArray(c.payments) ? c.payments : [];
          return {
            ...c,
            paidDates: new Set([...cPaid, targetDateStr]),
            paid: targetDateStr === todayISO,
            received: (c.received || 0) + amount,
            pending: Math.max(0, (c.pending || 0) - amount),
            payments: [...cPayments, newPaymentObj]
          };
        })
      );

      // Reset overflow immediately before closing modal
      document.body.style.overflow = 'auto';

      // Close modal and clear selected client
      setShowClientModal(false);
      setSelectedClient(null);

      // Dispatch event to sync with other components
      window.dispatchEvent(new CustomEvent('clientPaid', { detail: { clientId: client._id, amount } }));

      // Refresh data silently without reloading the entire page
      fetchClientsWithoutLoading();

      showNotification('Marked as paid successfully', 'success');
    } catch (err) {
      console.error('Mark paid error:', err);
      showNotification(err.message || 'Failed to mark paid', 'error');
    }
  };

  const isFinalDueWeek = (client) => {
    if (!client || !client.loan_start_date) return false;
    const targetDateStr = calendarDateFilter || toLocalDateStr(selectedDate);
    const weekIdx = calculateWeekIndex(client, targetDateStr);
    if (weekIdx && weekIdx >= 12) return true;

    const start = new Date(client.loan_start_date);
    start.setHours(0, 0, 0, 0);
    const target = new Date((targetDateStr || toLocalDateStr(new Date())) + 'T00:00:00');
    if (target >= start) {
      const diffMs = target.getTime() - start.getTime();
      const weeksPassed = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
      return weeksPassed >= 12;
    }
    return false;
  };

  // Execute 'Not Paid' - extend client's loan_end_date by 7 days
  const executeNotPaid = async (client) => {
    try {
      const token = localStorage.getItem('token');

      const currentEnd = client.loan_end_date ? new Date(client.loan_end_date) : null;
      let newEnd;
      if (currentEnd && !isNaN(currentEnd)) {
        newEnd = new Date(currentEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
      } else if (client.loan_start_date) {
        const start = new Date(client.loan_start_date);
        newEnd = new Date(start.getTime() + 12 * 7 * 24 * 60 * 60 * 1000);
      } else {
        showNotification('Cannot extend due date: missing start date', 'error');
        return;
      }

      const res = await fetch(`https://karan-e26t.onrender.com/api/clients/${client._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ loan_end_date: newEnd.toISOString(), is_pushed: true })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to extend due date');

      // update local client record
      setClients(prev => prev.map(c => c._id === client._id ? { ...c, loan_end_date: newEnd.toISOString() } : c));
      try {
        window.dispatchEvent(new CustomEvent('clientLoanEndUpdated', {
          detail: { clientId: client._id, loan_end_date: newEnd.toISOString() }
        }));
      } catch (e) {
        // ignore if dispatch fails in some environments
      }
      setLocalActionDone(client._id, 'pushedNotPaid');

      document.body.style.overflow = 'auto';

      setShowClientModal(false);
      setShowFinalDueModal(false);
      setSelectedClient(null);

      fetchClientsWithoutLoading();

      if (isFinalDueWeek(client)) {
        showNotification('12th due pushed. Client moved to Pending Clients section.', 'warning');
      } else {
        showNotification('Due extended by 1 week', 'success');
      }
    } catch (err) {
      console.error('Extend due error:', err);
      showNotification(err.message || 'Failed to extend due', 'error');
    }
  };

  const handleNotPaid = async (client) => {
    if (!client) return;
    if (isFinalDueWeek(client)) {
      setShowFinalDueModal(true);
      return;
    }
    await executeNotPaid(client);
  };

  // Close modal
  const closeModal = () => {
    document.body.style.overflow = 'auto';
    setShowClientModal(false);
    setShowFinalDueModal(false);
    setSelectedClient(null);
  };

  // Handle export PDF
  const handleExportPDF = async () => {
    // export only clients due on the selected date (or the calendarDateFilter if set)
    const exportDateStr = calendarDateFilter || format(selectedDate, 'yyyy-MM-dd');

    // apply district/landmark filters and only include clients due on the exact date
    const todayISO = toLocalDateStr(new Date());
    const candidates = clients.filter(c => {
      const id = c._id || c.clientId || c.id;
      const isPushed = (exportDateStr === todayISO ? Boolean(notPaidTodayMap[id]) : false) || c.last_pushed_date === exportDateStr;
      if (selectedDistrict && c.district !== selectedDistrict) return false;
      if (selectedLandmark && c.landmark !== selectedLandmark) return false;
      return isClientDueOnDate(c, exportDateStr) && calculateCurrentDue(c, exportDateStr) > 0 && !isPushed && !isClientPaidOnDate(c, exportDateStr);
    });

    if (candidates.length === 0) {
      showNotification('No unpaid clients to export for the selected date/filters', 'info');
      setShowExportModal(false);
      return;
    }

    showNotification('Generating PDF, please wait...', 'info');

    const { jsPDF } = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default;
    const doc = new jsPDF('p', 'mm', 'a4');

    // Create a hidden container for rendering
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0px';
    container.style.width = '210mm';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#000000';
    // Use standard fonts, browser will use fallback for Tamil natively
    container.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
    document.body.appendChild(container);

    let title = 'Daily Dues Report';
    if (selectedLandmark) {
      title += ` - ${selectedLandmark}`;
    }

    const groups = {};
    candidates.forEach(c => {
      const landmark = (c.landmark && String(c.landmark).trim()) || 'Other Areas';
      const district = (c.district && String(c.district).trim()) || 'Other Districts';
      const key = `${landmark}|${district}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    let total = 0;
    const orderedKeys = [];
    orderedAvailableLandmarks.forEach(lmk => {
      Object.keys(groups).forEach(k => {
        if (k.startsWith(lmk + '|')) orderedKeys.push(k);
      });
    });
    Object.keys(groups).forEach(k => { if (!orderedKeys.includes(k)) orderedKeys.push(k); });

    let pages = [];

    const createNewPage = () => {
      const page = document.createElement('div');
      page.style.width = '210mm';
      page.style.height = '297mm';
      page.style.padding = '15mm 15mm 25mm 15mm';
      page.style.boxSizing = 'border-box';
      page.style.position = 'relative';
      page.style.backgroundColor = '#ffffff';
      page.style.overflow = 'hidden';
      return page;
    };

    const createHeader = (pageDiv, full = false) => {
      const headerDiv = document.createElement('div');
      headerDiv.style.textAlign = 'center';
      headerDiv.style.marginBottom = '20px';

      if (full) {
        const titleEl = document.createElement('h1');
        titleEl.innerText = title;
        titleEl.style.fontSize = '22px';
        titleEl.style.margin = '0 0 5px 0';

        const subEl = document.createElement('h2');
        subEl.innerText = 'Unpaid Clients Collection List';
        subEl.style.fontSize = '16px';
        subEl.style.margin = '0 0 5px 0';

        const dateEl = document.createElement('div');
        dateEl.innerText = `Report Date: ${format(new Date(exportDateStr + 'T00:00:00'), 'EEEE, MMMM d, yyyy')}`;
        dateEl.style.fontSize = '14px';

        headerDiv.appendChild(titleEl);
        headerDiv.appendChild(subEl);
        headerDiv.appendChild(dateEl);
      } else {
        const contEl = document.createElement('div');
        contEl.innerText = `Daily Dues — Continued`;
        contEl.style.fontSize = '12px';
        contEl.style.fontWeight = '600';
        contEl.style.margin = '0 0 8px 0';
        headerDiv.appendChild(contEl);
      }
      pageDiv.appendChild(headerDiv);
    };

    const createThead = () => {
      const thead = document.createElement('tr');
      thead.innerHTML = `
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 10%;">S.No</th>
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 32%;">Client Name</th>
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 23%;">Client ID</th>
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 20%;">Phone</th>
        <th style="text-align: right; padding: 4px 0; border-bottom: 2px solid #000; width: 15%;">Amount</th>
      `;
      return thead;
    };

    const doesElementFit = (element, pageDiv) => {
      const pageRect = pageDiv.getBoundingClientRect();
      const pxPerMm = pageRect.height / 297;
      const maxAllowedBottom = pageRect.bottom - (25 * pxPerMm);
      const elemRect = element.getBoundingClientRect();
      return elemRect.bottom <= maxAllowedBottom + 0.5;
    };

    let currentPage = createNewPage();
    pages.push(currentPage);
    container.appendChild(currentPage);
    createHeader(currentPage, true);

    orderedKeys.forEach((landmarkKey) => {
      const list = groups[landmarkKey];
      if (!list || list.length === 0) return;
      const [lmk, dist] = landmarkKey.split('|');
      let hdrText = `Landmark: ${lmk} (${dist})`;

      let rowsInCurrentGroupOnThisPage = 0;
      let currentLmDiv = null;
      let currentTable = null;

      const startNewGroupSection = (isContinued = false) => {
        currentLmDiv = document.createElement('div');
        currentLmDiv.style.marginTop = '15px';

        const lmTitle = document.createElement('div');
        lmTitle.innerText = isContinued ? `${hdrText} — Continued` : hdrText;
        lmTitle.style.fontSize = '16px';
        lmTitle.style.fontWeight = 'bold';
        lmTitle.style.marginBottom = '8px';
        currentLmDiv.appendChild(lmTitle);

        currentTable = document.createElement('table');
        currentTable.style.width = '100%';
        currentTable.style.borderCollapse = 'collapse';
        currentTable.style.fontSize = '14px';
        currentTable.style.marginBottom = '10px';
        currentTable.appendChild(createThead());

        currentLmDiv.appendChild(currentTable);
        currentPage.appendChild(currentLmDiv);
        rowsInCurrentGroupOnThisPage = 0;
      };

      startNewGroupSection(false);

      let serialNo = 1;

      list.forEach(client => {
        const amountValue = calculateCurrentDue(client, exportDateStr);
        const weekIdx = calculateWeekIndex(client, exportDateStr) || 1;
        const amountText = `RS. ${amountValue.toLocaleString('en-IN')}/${weekIdx}`;
        total += amountValue;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding: 4px 0; border-bottom: 1px solid #eee;">${serialNo++}</td>
          <td style="padding: 4px 0; border-bottom: 1px solid #eee;">${String(client.name || '')}</td>
          <td style="padding: 4px 0; border-bottom: 1px solid #eee;">${String(client.clientId || 'N/A')}</td>
          <td style="padding: 4px 0; border-bottom: 1px solid #eee;">${String(client.phone || '')}</td>
          <td style="padding: 4px 0; border-bottom: 1px solid #eee; text-align: right;">${amountText}</td>
        `;

        currentTable.appendChild(tr);

        if (!doesElementFit(tr, currentPage)) {
          currentTable.removeChild(tr);

          if (rowsInCurrentGroupOnThisPage === 0) {
            currentPage.removeChild(currentLmDiv);

            currentPage = createNewPage();
            pages.push(currentPage);
            container.appendChild(currentPage);
            createHeader(currentPage, false);

            startNewGroupSection(false);
            currentTable.appendChild(tr);
            rowsInCurrentGroupOnThisPage = 1;
          } else {
            currentPage = createNewPage();
            pages.push(currentPage);
            container.appendChild(currentPage);
            createHeader(currentPage, false);

            startNewGroupSection(true);
            currentTable.appendChild(tr);
            rowsInCurrentGroupOnThisPage = 1;
          }
        } else {
          rowsInCurrentGroupOnThisPage++;
        }
      });
    });

    const totalDiv = document.createElement('div');
    totalDiv.innerText = `Total: RS. ${total.toFixed(0)}`;
    totalDiv.style.fontSize = '16px';
    totalDiv.style.fontWeight = 'bold';
    totalDiv.style.marginTop = '20px';

    currentPage.appendChild(totalDiv);

    if (!doesElementFit(totalDiv, currentPage)) {
      currentPage.removeChild(totalDiv);
      currentPage = createNewPage();
      pages.push(currentPage);
      container.appendChild(currentPage);
      createHeader(currentPage, false);
      currentPage.appendChild(totalDiv);
    }

    container.innerHTML = '';
    pages.forEach(p => container.appendChild(p));

    try {
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) doc.addPage();
        doc.addImage(imgData, 'PNG', 0, 0, 210, 297);
      }
    } catch (err) {
      console.error('Canvas error:', err);
      showNotification('Error generating PDF graphics', 'error');
    } finally {
      document.body.removeChild(container);
    }

    if (Capacitor.isNativePlatform()) {
      const pdfBase64 = doc.output('dataurlstring').split(',')[1];
      try {
        await Filesystem.writeFile({
          path: 'DailyDuesReport.pdf',
          data: pdfBase64,
          directory: Directory.Documents,
        });
        showNotification('PDF saved to Documents folder', 'success');
      } catch (error) {
        showNotification('Failed to save PDF: ' + error.message, 'error');
      }
    } else {
      doc.save('DailyDuesReport.pdf');
      showNotification('PDF downloaded successfully', 'success');
    }
    setShowExportModal(false);
  };

  // Get current week dates
  const getWeekDates = (date) => {
    const curr = new Date(date);
    const first = curr.getDate() - curr.getDay();
    const firstDayOfWeek = new Date(curr.setDate(first));
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(firstDayOfWeek);
      day.setDate(firstDayOfWeek.getDate() + i);
      weekDays.push(day);
    }
    return weekDays;
  };

  // Navigate to previous week
  const previousWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(newDate.getDate() - 7);
    setWeekStartDate(newDate);
  };

  // Navigate to next week
  const nextWeek = () => {
    const newDate = new Date(weekStartDate);
    newDate.setDate(newDate.getDate() + 7);
    setWeekStartDate(newDate);
  };

  // Render calendar days for current week
  const renderCalendarDays = () => {
    const weekDays = getWeekDates(weekStartDate);

    const todayISO = toLocalDateStr(new Date());
    return weekDays.map((day) => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const isCurrentDay = isToday(day);
      const isSelectedDay = isSameDay(day, selectedDate);

      // Count clients due on this specific day
      const clientsForDate = clients.filter(c => {
        const id = c._id || c.clientId || c.id;
        const isPushed = (dateStr === todayISO ? Boolean(notPaidTodayMap[id]) : false) || c.last_pushed_date === dateStr;
        return isClientDueOnDate(c, dateStr) && calculateCurrentDue(c, dateStr) > 0 && !isPushed && !isClientPaidOnDate(c, dateStr);
      });

      const clientCount = clientsForDate.length;

      return (
        <button
          key={dateStr}
          onClick={() => {
            setSelectedDate(day);
            // toggle calendar date filter: clicking same date unsets filter
            if (calendarDateFilter === dateStr) setCalendarDateFilter('');
            else setCalendarDateFilter(dateStr);
          }}
          className={`
            flex-1 min-w-0 aspect-square p-1 text-center rounded-lg border-2 transition-all duration-200
            flex flex-col gap-0.5 items-center justify-center text-sm
            ${isCurrentDay
              ? 'bg-[#16423C] text-white border-[#16423C]'
              : 'bg-white border-[#C4DAD2] text-[#16423C]'
            }
            ${isSelectedDay && !isCurrentDay
              ? 'border-[#6A9C89] bg-[#6A9C89] text-white shadow-lg'
              : ''
            }
            ${clientCount > 0 && !isSelectedDay ? 'border-[#6A9C89]' : ''}
            ${calendarDateFilter === dateStr ? 'ring-2 ring-[#6A9C89]/50' : ''}
            hover:shadow-lg active:scale-95
          `}
        >
          <span className="text-xs opacity-80 font-semibold">
            {format(day, 'EEE')}
          </span>
          <span className="text-lg font-bold">
            {format(day, 'd')}
          </span>
          {clientCount > 0 && (
            <span className={`text-xs font-bold px-1 py-0.5 rounded ${isCurrentDay || isSelectedDay
              ? 'bg-white/20 text-white'
              : 'bg-[#6A9C89]/20 text-[#6A9C89]'
              }`}>
              {clientCount}
            </span>
          )}
        </button>
      );
    });
  }

  // Check if client has a due on the exact date string (yyyy-MM-dd)
  const isClientDueOnDate = (client, dateStr) => {
    if (!client || !client.loan_start_date) return false;
    if (Number(client.pending) <= 0) return false;
    const targetStr = toLocalDateStr(dateStr);
    if (!targetStr) return false;

    const scheduledDates = getClientScheduledDueDates(client);
    return scheduledDates.includes(targetStr);
  };

  // Calculate which due-week index (1-based) the given date corresponds to for the client
  const calculateWeekIndex = (client, dateStr) => {
    if (!client || !client.loan_start_date) return null;
    if (Number(client.pending) <= 0) return null;
    const targetStr = toLocalDateStr(dateStr);
    if (!targetStr) return null;

    const scheduledDates = getClientScheduledDueDates(client);
    const idx = scheduledDates.indexOf(targetStr);
    return idx !== -1 ? idx + 1 : null;
  };

  // Drag handlers for reordering landmarks
  const handleDragStart = (e, landmarkName) => {
    try {
      e.dataTransfer.setData('text/plain', landmarkName);
      e.dataTransfer.effectAllowed = 'move';
    } catch (err) { }
  };

  const handleDropOnLandmark = (e, targetLandmark) => {
    e.preventDefault();
    try {
      const dragged = e.dataTransfer.getData('text/plain');
      if (!dragged) return;
      if (dragged === targetLandmark) return;

      const avail = getAvailableLandmarks();
      const base = (orderedLandmarks && orderedLandmarks.length) ? [...orderedLandmarks] : [...avail];

      const filtered = base.filter(x => x !== dragged);
      const targetIdx = filtered.indexOf(targetLandmark);
      if (targetIdx === -1) filtered.push(dragged);
      else filtered.splice(targetIdx, 0, dragged);

      setOrderedLandmarks(filtered);
      try { localStorage.setItem('landmarkOrder', JSON.stringify(filtered)); } catch (e) { }
    } catch (err) {
      console.error('drag drop error', err);
    }
  };

  const stats = calculateStats();
  const availableLandmarks = getAvailableLandmarks();
  // Merge saved order with currently available landmarks so new landmarks are appended
  const orderedAvailableLandmarks = (orderedLandmarks && orderedLandmarks.length)
    ? [...orderedLandmarks.filter(l => availableLandmarks.includes(l)), ...availableLandmarks.filter(l => !orderedLandmarks.includes(l))]
    : availableLandmarks;

  // Keep orderedLandmarks in sync when available landmarks change (add/remove)
  useEffect(() => {
    try {
      const avail = getAvailableLandmarks();
      if (!orderedLandmarks || orderedLandmarks.length === 0) {
        setOrderedLandmarks(avail);
        localStorage.setItem('landmarkOrder', JSON.stringify(avail));
        return;
      }
      const merged = [...orderedLandmarks.filter(l => avail.includes(l)), ...avail.filter(l => !orderedLandmarks.includes(l))];
      if (JSON.stringify(merged) !== JSON.stringify(orderedLandmarks)) {
        setOrderedLandmarks(merged);
        localStorage.setItem('landmarkOrder', JSON.stringify(merged));
      }
    } catch (e) { }
  }, [clients, selectedDistrict]);

  const filteredLandmarks = selectedAlpha
    ? orderedAvailableLandmarks.filter(l => (l || '').toString().toLowerCase().startsWith(selectedAlpha.toLowerCase()))
    : orderedAvailableLandmarks;
  const currentDate = calendarDateFilter || toLocalDateStr(selectedDate);
  // show all clients in the grid (but keep week-based logic for calendar/stats/export)
  const filteredClients = getDisplayedClients();

  // Order displayed clients by the orderedAvailableLandmarks sequence
  const orderedFilteredClients = (() => {
    try {
      const order = orderedAvailableLandmarks || [];
      const buckets = {};
      filteredClients.forEach(c => {
        const lm = (c.landmark && String(c.landmark).trim()) || 'Other Areas';
        if (!buckets[lm]) buckets[lm] = [];
        buckets[lm].push(c);
      });
      const res = [];
      order.forEach(lm => {
        if (buckets[lm]) {
          res.push(...buckets[lm]);
          delete buckets[lm];
        }
      });
      // append any remaining landmarks
      Object.keys(buckets).forEach(k => res.push(...buckets[k]));
      return res;
    } catch (e) { return filteredClients; }
  })();

  return (
    <>
      <div className="sticky top-0 z-50">
        <AgentNavbar />
      </div>

      {/* root wrapper now allows horizontal scrolling on desktop */}
      <div className="min-h-screen bg-[#E9EFEC] p-4 md:p-6 pt-4 md:pt-6 w-full font-sans overflow-x-auto">
        {/* Notification */}
        {notification && (
          <div className={`
          fixed top-5 right-5 z-[1001] p-4 rounded-lg shadow-xl border-2 max-w-[400px] font-semibold
          animate-[slideIn_0.3s_ease]
          ${notification.type === 'success' ? 'bg-[#6A9C89] text-white border-[#16423C]' : ''}
          ${notification.type === 'error' ? 'bg-[#16423C] text-white border-[#6A9C89]' : ''}
          ${notification.type === 'info' ? 'bg-[#16423C] text-white border-[#6A9C89]' : ''}
        `}>
            {notification.message}
          </div>
        )}
        <div className="flex flex-col gap-6 lg:gap-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row items-center gap-4 mb-6 w-full">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="bg-[#16423C] text-white px-6 py-3 rounded-xl shadow-md flex items-center gap-3 w-full md:w-auto justify-center">
                <i className="fas fa-money-bill-wave text-xl"></i>
                <span className="font-bold text-lg">Weekly Dues</span>
              </div>
            </div>
            <div className="flex-1 w-full">
              <input
                type="search"
                placeholder="Search clients by name, phone, or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-5 py-3 border-2 border-[#C4DAD2] rounded-xl bg-white text-[#16423C] placeholder-[#6A9C89] focus:outline-none focus:border-[#6A9C89] focus:shadow-lg transition-all"
              />
            </div>
          </div>

          {/* Search results count */}
          {searchQuery && (
            <div className="bg-white p-3 rounded-lg border-2 border-[#C4DAD2] text-[#6A9C89] font-semibold mb-2 w-full">
              Found {filteredClients.length} client(s)
            </div>
          )}

          {/* Sidebar and Main Content */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 w-full">
            {/* Sidebar */}
            <div className="bg-white rounded-xl p-5 shadow-lg border-2 border-[#C4DAD2] h-fit lg:sticky lg:top-5 w-full lg:w-[350px] flex-shrink-0">
              {/* District Filter */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                  Filter by District
                </label>
                <select
                  value={selectedDistrict}
                  onChange={(e) => setSelectedDistrict(e.target.value)}
                  className="w-full p-3 border-2 border-[#C4DAD2] rounded-lg bg-white text-[#16423C] font-medium cursor-pointer focus:outline-none focus:border-[#6A9C89]"
                >
                  <option value="">All Districts</option>
                  {getUniqueDistricts().map(district => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              </div>

              {/* Calendar - Weekly View */}
              <div className="mb-5">
                <label className="block text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-3">
                  This Week
                </label>
                <div className="bg-white p-3 rounded-lg border-2 border-[#C4DAD2]">
                  <div className="flex items-center gap-2 mb-3">
                    <button
                      onClick={previousWeek}
                      className="p-2 hover:bg-[#E9EFEC] rounded-lg transition-all text-[#16423C]"
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    <div className="flex-1 text-center text-sm font-semibold text-[#16423C]">
                      {format(getWeekDates(weekStartDate)[0], 'MMM d')} - {format(getWeekDates(weekStartDate)[6], 'MMM d')}
                    </div>
                    <button
                      onClick={nextWeek}
                      className="p-2 hover:bg-[#E9EFEC] rounded-lg transition-all text-[#16423C]"
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
                  <div className="flex gap-1">
                    {renderCalendarDays()}
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[#E9EFEC] px-3 py-4 rounded-lg border-2 border-[#C4DAD2] text-center">
                  <div className="text-xs font-semibold text-[#6A9C89] uppercase tracking-wide mb-1">
                    Due
                  </div>
                  <div className="text-lg font-bold text-[#16423C] break-words">
                    ₹{stats.totalDue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </div>
                </div>
                <div className="bg-[#E9EFEC] px-3 py-4 rounded-lg border-2 border-[#C4DAD2] text-center">
                  <div className="text-xs font-semibold text-[#6A9C89] uppercase tracking-wide mb-1">
                    Paid
                  </div>
                  <div className="text-lg font-bold text-[#16423C] break-words">
                    ₹{stats.totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                  </div>
                </div>
              </div>

              {/* Export Button */}
              {/* <button
                onClick={() => setShowExportModal(true)}
                className="w-full py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
              >
                <i className="fas fa-file-export"></i>
                Export Today's List
              </button> */}
            </div>

            {/* Main Content */}
            <div className="flex-1 w-full">
              {/* Title Section */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 pb-4 border-b-2 border-[#C4DAD2]">
                <h2 className="text-xl md:text-2xl font-bold text-[#16423C]">
                  Clients Due
                </h2>
                <div className="bg-[#E9EFEC] px-5 py-3 rounded-lg border-2 border-[#C4DAD2] text-[#16423C] font-semibold text-center w-full md:w-auto">
                  {format(calendarDateFilter ? new Date(calendarDateFilter + 'T00:00:00') : selectedDate, 'EEEE, MMMM d, yyyy')}
                </div>
              </div>

              {/* Landmarks Display - Grid Layout */}
              <div className="mb-6">
                {/* Alphabet filter (A-Z) */}
                <div className="flex flex-col gap-3 pb-6 mb-6 border-b-2 border-[#C4DAD2]">
                  <div className="flex items-center gap-2">
                    {['A', 'B', 'C'].map(letter => (
                      <button
                        key={letter}
                        onClick={() => setSelectedAlpha(prev => prev === letter ? '' : letter)}
                        className={`px-3 py-1 rounded text-sm font-semibold flex-shrink-0 ${selectedAlpha === letter ? 'bg-[#16423C] text-white' : 'bg-white text-[#16423C] border border-transparent hover:border-[#C4DAD2]'}`}
                      >
                        {letter}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 justify-start">
                    <button
                      onClick={() => setShowMoreAlpha(v => !v)}
                      className="px-4 py-1 rounded text-sm font-bold bg-white text-[#16423C] border border-[#C4DAD2]"
                    >
                      {showMoreAlpha ? '−' : '+'}
                    </button>

                    {showMoreAlpha && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => (
                          <button
                            key={letter}
                            onClick={() => setSelectedAlpha(prev => prev === letter ? '' : letter)}
                            className={`px-2 py-1 rounded text-sm font-semibold ${selectedAlpha === letter ? 'bg-[#16423C] text-white' : 'bg-white text-[#16423C] border border-transparent hover:border-[#C4DAD2]'}`}
                          >
                            {letter}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => { setSelectedAlpha(''); setShowMoreAlpha(false); }}
                      className="px-3 py-1 rounded text-sm font-semibold bg-white text-[#16423C] border border-[#C4DAD2]"
                    >
                      Clear Filter
                    </button>
                  </div>
                </div>

                {/* All Areas Button */}
                <div className="mb-6">
                  <button
                    onClick={() => setSelectedLandmark('')}
                    className={`
                  w-full px-6 py-4 rounded-lg font-semibold transition-all border-2
                  ${selectedLandmark === ''
                        ? 'bg-[#16423C] text-white border-[#16423C] shadow-lg'
                        : 'bg-white text-[#16423C] border-[#C4DAD2] hover:border-[#6A9C89]'
                      }
                `}
                  >
                    <i className="fas fa-th-large mr-2"></i>
                    All Areas
                  </button>
                </div>

                {/* Landmarks Grid - 4 columns (hidden when landmark is selected) */}
                {selectedLandmark === '' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {filteredLandmarks.filter(landmarkName => {
                      // Only show landmarks that have at least one client today
                      const todayClients = filteredClients.filter(c =>
                        (c.landmark || '') === landmarkName
                      );
                      return todayClients.length > 0;
                    }).map((landmarkName) => {
                      // Count today's clients for this landmark using filteredClients (already date-filtered)
                      const todayClients = filteredClients.filter(c =>
                        (c.landmark || '') === landmarkName
                      );
                      const icon = getIconForLandmark(landmarkName);
                      return (
                        <button
                          key={landmarkName}
                          draggable
                          onDragStart={(e) => handleDragStart(e, landmarkName)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => handleDropOnLandmark(e, landmarkName)}
                          onClick={() => setSelectedLandmark(landmarkName)}
                          className={`
                        p-4 rounded-lg font-semibold transition-all flex flex-col gap-3 items-center justify-center border-2 min-h-[120px]
                        bg-white text-[#16423C] border-[#C4DAD2] hover:border-[#6A9C89] hover:shadow-md
                      `}
                        >
                          <span className="text-3xl">{icon}</span>
                          <div className="flex flex-col items-center text-center">
                            <span className="text-sm font-semibold">{landmarkName}</span>
                            <span className="text-xs font-normal opacity-70">
                              {todayClients.length} today
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  // Show selected landmark prominently with Clear button
                  <div className="flex flex-col gap-4">
                    <div className="p-6 rounded-lg bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white border-2 border-[#16423C] shadow-lg flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <span className="text-4xl">{getIconForLandmark(selectedLandmark)}</span>
                        <div>
                          <h3 className="text-2xl font-bold">{selectedLandmark}</h3>
                          <p className="text-sm opacity-90">
                            {filteredClients.length} clients today
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedLandmark('')}
                        className="px-6 py-3 bg-white text-[#16423C] rounded-lg font-semibold hover:bg-[#E9EFEC] transition-all"
                      >
                        <i className="fas fa-times mr-2"></i>
                        Clear
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Message - no landmark selected */}
              {selectedLandmark === '' && !loading && filteredLandmarks.length === 0 && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-[#C4DAD2]">
                  <i className="fas fa-map-marker-alt text-6xl text-[#C4DAD2] mb-5"></i>
                  <h3 className="text-xl font-bold text-[#16423C] mb-3">No Landmarks Available</h3>
                  <p className="text-[#6A9C89]">No landmarks found for the selected filter</p>
                </div>
              )}

              {/* Loading State */}
              {loading && (
                <div className="text-center py-20">
                  <div className="w-10 h-10 border-4 border-[#C4DAD2] border-t-[#16423C] rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-[#6A9C89] font-semibold">Loading clients...</p>
                </div>
              )}

              {/* Client Grid - All Areas or Specific Landmark */}
              {(selectedLandmark === '' || selectedLandmark !== '') && !loading && filteredClients.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1 justify-items-stretch">
                  {orderedFilteredClients.map((client) => {
                    const weekIdx = calculateWeekIndex(client, currentDate);

                    return (
                      <div
                        key={client._id || client.clientId || client.id || client.phone}
                        onClick={() => handleClientClick(client)}
                        className="bg-white rounded-xl p-3 shadow-lg border-2 border-transparent hover:border-[#C4DAD2] hover:-translate-y-1 hover:shadow-xl transition-all cursor-pointer flex flex-col h-full active:scale-75w-medium"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <h3 className="text-lg font-bold text-[#16423C] mb-2 break-words">
                              {client.name}
                            </h3>
                            <div className="flex items-center flex-wrap gap-y-1">
                              <span className={`
                            inline-block text-xs font-semibold px-3 py-1.5 rounded-full
                            ${client.type === 'personal'
                                  ? 'bg-[#16423C]/10 text-[#16423C] border border-[#16423C]/20'
                                  : 'bg-[#16423C] text-white border border-[#16423C]'}
                          `}>
                                {client.type.charAt(0).toUpperCase() + client.type.slice(1)}
                              </span>
                              {weekIdx && (
                                <span className="inline-block text-xs font-semibold px-3 py-1.5 rounded-full bg-[#6A9C89]/10 text-[#6A9C89] border border-[#6A9C89]/20 ml-2">
                                  Week {weekIdx}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`
                        w-3 h-3 rounded-full flex-shrink-0
                        ${isClientPaidOnDate(client, currentDate)
                              ? 'bg-[#6A9C89] shadow-[0_0_0_3px_rgba(106,156,137,0.2)]'
                              : 'bg-[#16423C] shadow-[0_0_0_3px_rgba(22,66,60,0.2)]'}
                      `}></span>
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-3 text-[#16423C] mb-3">
                            <i className="fas fa-phone text-[#6A9C89] w-4"></i>
                            <span className="text-sm break-all">{client.phone}</span>
                          </div>
                          {client.address && (
                            <div className="text-sm text-[#6A9C89] leading-relaxed break-words">
                              {client.address}
                            </div>
                          )}
                        </div>

                        <div className="mt-4 pt-4 border-t-2 border-[#C4DAD2]">
                          <div className="text-sm font-semibold text-[#6A9C89] mb-1">
                            Weekly Payment
                          </div>
                          <div className={`
                        text-xl font-bold flex items-center justify-between
                        ${isClientPaidOnDate(client, currentDate) ? 'text-[#6A9C89] bg-[#6A9C89]/10 py-2 px-3 rounded-lg' : 'text-[#16423C]'}
                      `}>
                            <span>
                              ₹{
                                isClientPaidOnDate(client, currentDate)
                                  ? (getPaidAmountOnDate(client, currentDate) || calculateCurrentDue(client, currentDate)).toLocaleString('en-IN')
                                  : calculateCurrentDue(client, currentDate).toLocaleString('en-IN')
                              }
                            </span>
                            {isClientPaidOnDate(client, currentDate) && (
                              <span className="text-xs bg-[#6A9C89] text-white px-2.5 py-1 rounded-full font-bold ml-2">Paid ✅</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : !loading && (
                <div className="text-center py-20 bg-white rounded-xl border-2 border-[#C4DAD2]">
                  <i className="fas fa-users text-6xl text-[#C4DAD2] mb-5"></i>
                  <h3 className="text-xl font-bold text-[#16423C] mb-3">
                    {selectedLandmark ? 'No clients in this area' : 'No clients available'}
                  </h3>
                  <p className="text-[#6A9C89]">
                    {selectedLandmark ? 'Try selecting a different landmark' : 'Try adjusting your search criteria'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Client Details Modal */}
        {showClientModal && selectedClient && (
          <div
            className="fixed inset-0 bg-[#16423C]/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <div
              className="bg-white rounded-xl max-w-[380px] w-full max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-[#C4DAD2] animate-[modalFade_0.3s_ease] md:animate-[modalSlideUp_0.3s_ease] md:rounded-t-2xl md:rounded-b-none md:fixed md:inset-x-0 md:bottom-0 md:top-auto md:max-w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white p-6 sticky top-0 z-10 flex justify-between items-center">
                <h3 className="text-xl font-bold break-words pr-4">{selectedClient.name}</h3>
                <button
                  onClick={closeModal}
                  className="w-10 h-10 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex items-center justify-center text-2xl hover:rotate-90"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Client Type
                  </div>
                  <div className="text-base font-semibold text-[#16423C]">
                    {selectedClient.type.charAt(0).toUpperCase() + selectedClient.type.slice(1)}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Phone Number
                  </div>
                  <div className="text-base font-semibold text-[#16423C] break-words">
                    {selectedClient.phone}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Address
                  </div>
                  <div className="text-base font-semibold text-[#16423C] break-words">
                    {selectedClient.address || 'Address not provided'}
                  </div>
                </div>

                <div className="mb-5 pb-4 border-b-2 border-[#C4DAD2]">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    Due Date
                  </div>
                  <div className="text-base font-semibold text-[#16423C]">
                    {selectedClient.dueDate}
                  </div>
                </div>

                <div className="mb-6 p-4 bg-gradient-to-r from-[#E9EFEC] to-[#C4DAD2] rounded-xl border-2 border-[#C4DAD2] text-center">
                  <div className="text-sm font-semibold text-[#6A9C89] uppercase tracking-wide mb-2">
                    {isClientPaidOnDate(selectedClient, currentDate) ? 'Paid Amount' : 'Due Amount'}
                  </div>
                  <div className="text-4xl font-bold text-[#16423C] mb-4">
                    ₹{(isClientPaidOnDate(selectedClient, currentDate)
                      ? (getPaidAmountOnDate(selectedClient, currentDate) || calculateCurrentDue(selectedClient, currentDate))
                      : calculateCurrentDue(selectedClient, currentDate)
                    ).toLocaleString('en-IN')}
                  </div>

                  <div className="text-left">
                    <label className="block text-xs font-semibold text-[#6A9C89] uppercase tracking-wide mb-1.5">
                      Amount to Pay (₹)
                    </label>
                    <input
                      type="number"
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      disabled={isClientPaidOnDate(selectedClient, currentDate) || (selectedClient?._id && Array.isArray(serverPaidTodayMap[selectedClient._id]) && serverPaidTodayMap[selectedClient._id].includes('agent') && serverPaidTodayMap[selectedClient._id].includes('manager'))}
                      className="w-full px-3 py-2 text-center text-lg font-bold text-[#16423C] border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C] bg-white"
                    />
                    {(() => {
                      const dueVal = isClientPaidOnDate(selectedClient, currentDate)
                        ? (getPaidAmountOnDate(selectedClient, currentDate) || calculateCurrentDue(selectedClient, currentDate))
                        : calculateCurrentDue(selectedClient, currentDate);
                      const enteredVal = Number(customAmount) || 0;
                      const remaining = dueVal - enteredVal;
                      if (!isClientPaidOnDate(selectedClient, currentDate) && remaining > 0 && enteredVal > 0) {
                        return (
                          <p className="text-xs text-yellow-700 mt-2 font-semibold">
                            ⚠️ Partial: ₹{remaining} will be added to the next week's due.
                          </p>
                        );
                      } else if (!isClientPaidOnDate(selectedClient, currentDate) && remaining < 0) {
                        return (
                          <p className="text-xs text-green-700 mt-2 font-semibold">
                            ✨ Advance: ₹{Math.abs(remaining)} extra paid.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                {(() => {
                  const isPaid = !selectedClient || isClientPaidOnDate(selectedClient, currentDate) || calculateCurrentDue(selectedClient, currentDate) <= 0;
                  return (
                    <button
                      onClick={() => handleMarkPaid(selectedClient)}
                      disabled={isPaid}
                      className={`w-full py-4 mb-3 rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95 ${isPaid ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-[#6A9C89] to-[#16423C] text-white'}`}
                    >
                      <i className="fas fa-check"></i>
                      {isPaid ? 'Paid ✅' : 'Mark as Paid'}
                    </button>
                  );
                })()}

                {(() => {
                  const id = selectedClient?._id;
                  const bothCollected = id && Array.isArray(serverPaidTodayMap[id]) && serverPaidTodayMap[id].includes('agent') && serverPaidTodayMap[id].includes('manager');
                  const isDisabled = !selectedClient || notPaidTodayMap[selectedClient._id] || selectedClient.last_pushed_date === currentDate || calculateCurrentDue(selectedClient, currentDate) <= 0 || bothCollected || isClientPaidOnDate(selectedClient, currentDate);
                  return (
                    <button
                      onClick={() => handleNotPaid(selectedClient)}
                      disabled={isDisabled}
                      className={`w-full py-4 mb-3 ${isDisabled ? 'bg-gray-300 text-gray-600 cursor-not-allowed' : 'bg-yellow-500 text-white'} rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95`}
                    >
                      <i className="fas fa-forward"></i>
                      {(selectedClient && calculateCurrentDue(selectedClient, currentDate) <= 0) ? 'Already Paid' : (notPaidTodayMap[selectedClient._id] || selectedClient.last_pushed_date === currentDate) ? 'Already Pushed Today' : 'CANCEL (Push to next week)'}
                    </button>
                  );
                })()}

                <button
                  onClick={closeModal}
                  className="w-full py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
                >
                  <i className="fas fa-times"></i>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Export Modal */}
        {showExportModal && (
          <div
            className="fixed inset-0 bg-[#16423C]/70 backdrop-blur-sm z-[1000] flex items-center justify-center p-4"
            onClick={() => setShowExportModal(false)}
          >
            <div
              className="bg-white rounded-xl max-w-[500px] w-full shadow-2xl border-2 border-[#C4DAD2] animate-[modalFade_0.3s_ease]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white p-6 rounded-t-xl flex justify-between items-center">
                <h3 className="text-xl font-bold">Export Format</h3>
                <button
                  onClick={() => setShowExportModal(false)}
                  className="w-10 h-10 bg-white/20 rounded-lg hover:bg-white/30 transition-all flex items-center justify-center text-2xl hover:rotate-90"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <p className="text-center text-[#16423C] mb-8">
                  Choose export format for unpaid clients
                </p>

                <div className="flex flex-col md:flex-row gap-4">
                  <button
                    onClick={handleExportPDF}
                    className="flex-1 py-4 bg-gradient-to-r from-[#16423C] to-[#6A9C89] text-white rounded-xl font-semibold flex items-center justify-center gap-3 shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all active:scale-95"
                  >
                    <i className="fas fa-file-pdf"></i>
                    PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 12th Due Warning Dialogue Modal */}
        {showFinalDueModal && selectedClient && (
          <div
            className="fixed inset-0 bg-[#16423C]/70 backdrop-blur-sm z-[1100] flex items-center justify-center p-4"
            onClick={() => setShowFinalDueModal(false)}
          >
            <div
              className="bg-white rounded-2xl max-w-[480px] w-full shadow-2xl border-2 border-yellow-400 p-6 animate-[modalFade_0.3s_ease]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-4 text-yellow-600 mb-4">
                <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center text-2xl flex-shrink-0 font-bold">
                  ⚠️
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[#16423C]">12th (Final) Due Notice</h3>
                  <p className="text-xs text-yellow-700 font-bold">Client must pay something!</p>
                </div>
              </div>

              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-xl mb-6">
                <p className="text-sm text-yellow-900 leading-relaxed font-medium">
                  Client <strong className="text-[#16423C] font-bold">{selectedClient.name}</strong> is on their <strong>12th (final) due</strong>.
                </p>
                <p className="text-xs text-yellow-800 mt-2 font-semibold">
                  Pushing this due to next week will move the remaining balance (₹{(selectedClient.pending || 0).toLocaleString('en-IN')}) into the <strong>Pending Clients</strong> section.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => executeNotPaid(selectedClient)}
                  className="w-full py-3.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-95"
                >
                  <i className="fas fa-arrow-right"></i>
                  Move to Pending Clients (Push 1 Week)
                </button>

                <button
                  onClick={() => setShowFinalDueModal(false)}
                  className="w-full py-3 bg-[#6A9C89] hover:bg-[#16423C] text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <i className="fas fa-money-bill-wave"></i>
                  Pay Now
                </button>

                <button
                  onClick={() => setShowFinalDueModal(false)}
                  className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-all active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add required Font Awesome */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />

        {/* Add custom animations */}
        <style>{`
        @keyframes modalFade {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes modalSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      </div>
    </>
  );
};

export default DailyDues;