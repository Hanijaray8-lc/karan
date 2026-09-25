import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import AdminNavbar from './AdminNavbar';

// Robust native PDF saver with multiple fallbacks
const savePdfBase64 = async (fileName, base64) => {
  const candidates = [Directory.Cache, Directory.Documents, Directory.Downloads, Directory.External];
  for (const dir of candidates) {
    try {
      await Filesystem.writeFile({ path: fileName, data: base64, directory: dir });
      const uriResult = await Filesystem.getUri({ path: fileName, directory: dir }).catch(() => null);
      return { success: true, directory: dir, uri: uriResult ? uriResult.uri : null };
    } catch (err) {
      try {
        await Filesystem.mkdir({ path: '', directory: dir, recursive: true });
        await Filesystem.writeFile({ path: fileName, data: base64, directory: dir });
        const uriResult = await Filesystem.getUri({ path: fileName, directory: dir }).catch(() => null);
        return { success: true, directory: dir, uri: uriResult ? uriResult.uri : null };
      } catch (err2) {
        console.warn('Write attempt failed for', dir, err2 || err);
      }
    }
  }
  return { success: false };
};

const PendingClients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState(() => {
    return localStorage.getItem('pending_selectedDistrict') || '';
  });
  const [selectedLandmark, setSelectedLandmark] = useState(() => {
    return localStorage.getItem('pending_selectedLandmark') || '';
  });
  const [selectedAgent, setSelectedAgent] = useState(() => {
    return localStorage.getItem('pending_selectedAgent') || '';
  });
  const [selectedEndDate, setSelectedEndDate] = useState('');
  const [notification, setNotification] = useState(null);

  // Pay modal state
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedPayClient, setSelectedPayClient] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payErrorMsg, setPayErrorMsg] = useState('');
  const [paySuccessMsg, setPaySuccessMsg] = useState('');

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleOpenPayModal = (client) => {
    setSelectedPayClient(client);
    const outstanding = getClientOutstanding(client);
    setPayAmount(outstanding > 0 ? String(outstanding) : '');
    setPaymentMethod('cash');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPayNotes('Payment from Pending section');
    setPayErrorMsg('');
    setPaySuccessMsg('');
    setShowPayModal(true);
  };

  const handleClosePayModal = () => {
    if (payLoading) return;
    setShowPayModal(false);
    setSelectedPayClient(null);
    setPayErrorMsg('');
    setPaySuccessMsg('');
  };

  const handleConfirmPay = async () => {
    if (!selectedPayClient) return;
    const numAmount = Number(payAmount);
    const outstanding = getClientOutstanding(selectedPayClient);

    if (!numAmount || numAmount <= 0) {
      setPayErrorMsg('Please enter a valid payment amount greater than 0.');
      return;
    }

    if (numAmount > outstanding) {
      setPayErrorMsg(`Payment amount (₹${numAmount.toLocaleString('en-IN')}) cannot exceed outstanding balance (₹${outstanding.toLocaleString('en-IN')}).`);
      return;
    }

    try {
      setPayLoading(true);
      setPayErrorMsg('');
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const finalPaymentDate = (paymentDate === todayStr)
        ? now.toISOString()
        : new Date(paymentDate).toISOString();

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.');
      }

      const response = await fetch('https://karan-e26t.onrender.com/api/payments/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          clientId: selectedPayClient._id,
          amount: numAmount,
          paymentMethod,
          notes: payNotes || 'Pending Client Payment',
          paymentDate: finalPaymentDate
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to process payment');
      }

      // Update client state locally so client-side is immediately updated
      const updatedClientData = data.data?.client;
      const createdPayment = data.data?.payment;
      const newReceived = (selectedPayClient.received || 0) + numAmount;
      const currentPending = selectedPayClient.pending !== undefined && selectedPayClient.pending !== null
        ? Number(selectedPayClient.pending)
        : Math.max(0, Number(selectedPayClient.amount || 6900) - Number(selectedPayClient.received || 0));
      const newPending = Math.max(0, currentPending - numAmount);
      const newStatus = newPending <= 0 ? 'paid' : (newReceived > 0 ? 'partial' : selectedPayClient.status);

      setClients(prevClients =>
        prevClients.map(c => {
          if (c._id === selectedPayClient._id) {
            const updatedPayments = c.payments
              ? [...c.payments, createdPayment || { amount: numAmount, paymentDate: finalPaymentDate }]
              : (createdPayment ? [createdPayment] : [{ amount: numAmount, paymentDate: finalPaymentDate }]);
            return {
              ...c,
              received: updatedClientData?.received ?? newReceived,
              pending: updatedClientData?.pending ?? newPending,
              status: updatedClientData?.status ?? newStatus,
              payments: updatedPayments
            };
          }
          return c;
        })
      );

      // Dispatch global events so Payment History and other tabs receive the updated payment
      window.dispatchEvent(new CustomEvent('paymentRecorded', {
        detail: {
          clientId: selectedPayClient._id,
          amount: numAmount,
          paymentDate: finalPaymentDate
        }
      }));
      window.dispatchEvent(new CustomEvent('clientUpdated', {
        detail: { clientId: selectedPayClient._id }
      }));

      const isFullyPaid = (updatedClientData?.pending ?? newPending) <= 0;
      const successText = isFullyPaid
        ? `Payment of ₹${numAmount.toLocaleString('en-IN')} successful! ${selectedPayClient.name} is now marked as FULLY PAID.`
        : `Payment of ₹${numAmount.toLocaleString('en-IN')} recorded successfully! Remaining balance: ₹${newPending.toLocaleString('en-IN')}.`;

      setPaySuccessMsg(successText);
      showNotification(successText, 'success');

      setTimeout(() => {
        handleClosePayModal();
      }, 1200);

    } catch (err) {
      console.error('Payment error:', err);
      setPayErrorMsg(err.message || 'Payment failed. Please try again.');
    } finally {
      setPayLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

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
        // Fetch payments to map them for dynamic due calculation
        try {
          const payRes = await fetch('https://karan-e26t.onrender.com/api/payments/test/all');
          const payJson = payRes.ok ? await payRes.json() : null;
          const payments = (payJson && payJson.data && payJson.data.payments) || [];

          const paymentsByClient = {};
          payments.forEach(p => {
            const clientId = p.client && p.client._id ? String(p.client._id) : (p.client ? String(p.client) : null);
            if (clientId) {
              if (!paymentsByClient[clientId]) paymentsByClient[clientId] = [];
              paymentsByClient[clientId].push(p);
            }
          });

          const mappedClients = data.clients.map(c => {
            const id = c._id ? String(c._id) : null;
            return {
              ...c,
              payments: paymentsByClient[id] || []
            };
          });
          setClients(mappedClients);
        } catch (err) {
          setClients(data.clients);
        }
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      showNotification('Failed to load clients', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getClientAgentKey = (client) => {
    if (!client) return '';
    if (client.assigned_agent) return String(client.assigned_agent);
    if (client.assigned_agent_name) return String(client.assigned_agent_name);
    if (client.agent && (client.agent._id || client.agent.name || client.agent.username)) {
      return String(client.agent._id || client.agent.name || client.agent.username);
    }
    return '';
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const d = new Date(dateString);
      return isNaN(d.getTime()) ? 'N/A' : format(d, 'dd-MM-yyyy');
    } catch {
      return 'N/A';
    }
  };

  const isLoanPastEndDate = (client, targetDate = new Date()) => {
    if (!client || !client.loan_end_date) return false;
    const end = new Date(client.loan_end_date);
    if (isNaN(end.getTime())) return false;

    const ref = new Date(targetDate);
    ref.setHours(23, 59, 59, 999);
    return end <= ref;
  };

  const getClientExtensions = (client) => {
    const start = client.loan_start_date ? new Date(client.loan_start_date) : null;
    if (!start || isNaN(start.getTime())) return 0;
    const originalWeeks = Math.round((client.amount || 6900) / 575);
    const totalWeeks = client.total_weeks && client.total_weeks > 0
      ? client.total_weeks
      : (client.loan_end_date ? Math.ceil((new Date(client.loan_end_date) - start) / (1000 * 60 * 60 * 24 * 7)) + 1 : originalWeeks);
    return Math.max(0, totalWeeks - originalWeeks);
  };

  const getClientOverdueOrPushedWeeks = (client) => {
    const ext = getClientExtensions(client);
    if (!client.loan_end_date) return ext;

    const end = new Date(client.loan_end_date);
    if (isNaN(end.getTime())) return ext;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDay = new Date(end);
    endDay.setHours(0, 0, 0, 0);

    if (today >= endDay) {
      const diffMs = today.getTime() - endDay.getTime();
      const overdueWeeks = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 7)));
      return Math.max(ext, overdueWeeks);
    }
    return ext;
  };

  const getClientOutstanding = (c) => {
    if (!c) return 0;
    const balance = c.pending !== undefined && c.pending !== null
      ? Number(c.pending)
      : Number(c.amount || 6900) - Number(c.received || 0);
    return balance > 0 ? balance : 0;
  };

  const getPendingClients = () => {
    return clients.filter(c => {
      const outstanding = getClientOutstanding(c);
      if (outstanding <= 0) return false;

      // Only show clients whose loan end date has arrived/passed and unpaid
      return isLoanPastEndDate(c);
    });
  };

  const calculateCurrentDue = (client) => {
    if (!client) return 575;
    const pendingCap = Number(client.pending ?? ((client.amount || 6900) - (client.received || 0)));
    if (pendingCap <= 0) return 0;

    const weeklyInstallment = (client.amount === 5000 || client.amount === 6900 || !client.weekly_amount)
      ? 575
      : Number(client.weekly_amount);

    return Math.min(pendingCap, weeklyInstallment);
  };

  const getFilteredClients = () => {
    let filtered = getPendingClients();

    if (selectedEndDate) {
      filtered = filtered.filter(c => {
        if (!c.loan_end_date) return false;
        const endStr = new Date(c.loan_end_date).toISOString().split('T')[0];
        return endStr <= selectedEndDate;
      });
    }
    if (selectedDistrict) {
      filtered = filtered.filter(c => c.district === selectedDistrict);
    }
    if (selectedLandmark) {
      filtered = filtered.filter(c => c.landmark === selectedLandmark);
    }
    if (selectedAgent) {
      filtered = filtered.filter(c => getClientAgentKey(c) === selectedAgent);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        return (c.name && c.name.toLowerCase().includes(query)) ||
          (c.phone && c.phone.includes(query)) ||
          (c.clientId && String(c.clientId).includes(query)) ||
          (c._id && String(c._id).includes(query));
      });
    }

    return filtered;
  };

  const getUniqueDistricts = () => {
    return [...new Set(getPendingClients().map(c => c.district))].filter(d => d).sort();
  };

  const getAvailableLandmarks = () => {
    const counts = {};
    getPendingClients().forEach((c) => {
      const lm = (c.landmark || '').toString().trim();
      if (!lm) return;
      if (selectedDistrict && (c.district || '').toString() !== selectedDistrict) return;
      counts[lm] = (counts[lm] || 0) + 1;
    });
    return Object.keys(counts).sort((a, b) => a.localeCompare(b));
  };

  const getUniqueAgents = () => {
    const map = {};
    getPendingClients().forEach((c) => {
      const key = getClientAgentKey(c);
      if (!key) return;
      const label = c.assigned_agent_name || (c.agent && (c.agent.name || c.agent.username)) || 'Unknown';
      map[key] = label;
    });
    return Object.entries(map).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  };

  const handleDistrictChange = (e) => {
    const val = e.target.value;
    setSelectedDistrict(val);
    setSelectedLandmark('');
    localStorage.setItem('pending_selectedDistrict', val);
    localStorage.removeItem('pending_selectedLandmark');
  };

  const handleLandmarkChange = (e) => {
    const val = e.target.value;
    setSelectedLandmark(val);
    localStorage.setItem('pending_selectedLandmark', val);
  };

  const handleAgentChange = (e) => {
    const val = e.target.value;
    setSelectedAgent(val);
    localStorage.setItem('pending_selectedAgent', val);
  };

  const handleExportPDF = async () => {
    const list = getFilteredClients();
    if (list.length === 0) {
      showNotification('No pending clients to export', 'info');
      return;
    }

    showNotification('Generating PDF, please wait...', 'info');

    const { jsPDF } = await import('jspdf');
    const html2canvasModule = await import('html2canvas');
    const html2canvas = html2canvasModule.default;
    const doc = new jsPDF('p', 'mm', 'a4');

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0px';
    container.style.top = '0px';
    container.style.zIndex = '-9999';
    container.style.opacity = '0.01';
    container.style.pointerEvents = 'none';
    container.style.width = '210mm';
    container.style.backgroundColor = '#ffffff';
    container.style.color = '#000000';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    document.body.appendChild(container);

    let title = 'Pending Clients Report (Unpaid Loans Past End Date)';

    const groups = {};
    list.forEach(c => {
      const landmark = (c.landmark && String(c.landmark).trim()) || 'Other Areas';
      const district = (c.district && String(c.district).trim()) || 'Other Districts';
      const key = `${landmark}|${district}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });

    let totalPendingAmount = 0;
    const sortedGroupKeys = Object.keys(groups).sort();
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
        titleEl.style.fontSize = '20px';
        titleEl.style.margin = '0 0 5px 0';
        titleEl.style.fontWeight = 'bold';

        const subEl = document.createElement('h2');
        subEl.innerText = 'Overdue Loan Collections List';
        subEl.style.fontSize = '14px';
        subEl.style.margin = '0 0 5px 0';

        const dateEl = document.createElement('div');
        dateEl.innerText = `Generated Date: ${format(new Date(), 'EEEE, MMMM d, yyyy')}`;
        dateEl.style.fontSize = '12px';

        headerDiv.appendChild(titleEl);
        headerDiv.appendChild(subEl);
        headerDiv.appendChild(dateEl);
      } else {
        const contEl = document.createElement('div');
        contEl.innerText = `Pending Clients — Continued`;
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
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 6%;">S.No</th>
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 30%;">Client Name</th>
        <th style="text-align: left; padding: 4px 0; border-bottom: 2px solid #000; width: 16%;">Phone</th>
        <th style="text-align: center; padding: 4px 0; border-bottom: 2px solid #000; width: 16%;">Loan End Date</th>
        <th style="text-align: center; padding: 4px 0; border-bottom: 2px solid #000; width: 14%;">Overdue/Pushes</th>
        <th style="text-align: right; padding: 4px 0; border-bottom: 2px solid #000; width: 18%;">Pending Balance</th>
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

    sortedGroupKeys.forEach(groupKey => {
      const [landmark, district] = groupKey.split('|');
      const groupClients = groups[groupKey];
      if (!groupClients || groupClients.length === 0) return;

      let rowsInCurrentGroupOnThisPage = 0;
      let currentLmDiv = null;
      let currentTable = null;

      const startNewGroupSection = (isContinued = false) => {
        currentLmDiv = document.createElement('div');
        currentLmDiv.style.marginBottom = '20px';

        const lmTitle = document.createElement('h3');
        lmTitle.innerText = isContinued
          ? `${landmark} (${district}) — Continued`
          : `${landmark} (${district})`;
        lmTitle.style.fontSize = '14px';
        lmTitle.style.margin = '10px 0 5px 0';
        lmTitle.style.borderBottom = '1px solid #ddd';
        lmTitle.style.paddingBottom = '3px';
        lmTitle.style.fontWeight = 'bold';
        currentLmDiv.appendChild(lmTitle);

        currentTable = document.createElement('table');
        currentTable.style.width = '100%';
        currentTable.style.borderCollapse = 'collapse';
        currentTable.style.fontSize = '12px';
        currentTable.appendChild(createThead());

        currentLmDiv.appendChild(currentTable);
        currentPage.appendChild(currentLmDiv);
        rowsInCurrentGroupOnThisPage = 0;
      };

      startNewGroupSection(false);

      let serialNo = 1;

      groupClients.forEach(client => {
        const outstanding = getClientOutstanding(client);
        const pushes = getClientOverdueOrPushedWeeks(client);
        const endDateStr = formatDate(client.loan_end_date);
        totalPendingAmount += outstanding;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee;">${serialNo++}</td>
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee; font-weight: 500;">${client.name} (${client.clientId || 'N/A'})</td>
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee;">${client.phone || 'N/A'}</td>
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee; text-align: center; font-size: 11px;">${endDateStr}</td>
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee; text-align: center;">${pushes} Weeks</td>
          <td style="padding: 5px 0; border-bottom: 1px dashed #eee; text-align: right; font-weight: 600;">₹${outstanding.toLocaleString('en-IN')}</td>
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

    const summaryDiv = document.createElement('div');
    summaryDiv.style.marginTop = '25px';
    summaryDiv.style.borderTop = '2px solid #000';
    summaryDiv.style.paddingTop = '10px';
    summaryDiv.style.textAlign = 'right';
    summaryDiv.style.fontSize = '14px';
    summaryDiv.style.fontWeight = 'bold';
    summaryDiv.innerHTML = `
      <span>Total Outstanding Balance: </span>
      <span style="font-size: 16px; margin-left: 10px;">₹${totalPendingAmount.toLocaleString('en-IN')}</span>
    `;

    currentPage.appendChild(summaryDiv);

    if (!doesElementFit(summaryDiv, currentPage)) {
      currentPage.removeChild(summaryDiv);
      currentPage = createNewPage();
      pages.push(currentPage);
      container.appendChild(currentPage);
      createHeader(currentPage, false);
      currentPage.appendChild(summaryDiv);
    }

    container.innerHTML = '';
    pages.forEach(p => container.appendChild(p));

    try {
      const pageElements = container.children;
      for (let i = 0; i < pageElements.length; i++) {
        if (i > 0) doc.addPage();
        const canvas = await html2canvas(pageElements[i], { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        doc.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
      }

      const pdfDataUri = doc.output('datauristring');
      const rawBase64 = pdfDataUri.split(',')[1];
      const filename = `KaranFinance_PendingClients_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

      if (Capacitor.isNativePlatform()) {
        const saveRes = await savePdfBase64(filename, rawBase64);
        if (saveRes.success) {
          showNotification('PDF saved successfully', 'success');
          if (saveRes.uri) {
            try {
              await Share.share({
                title: 'Karan Finance Pending Clients',
                text: 'Here is the pending clients report',
                url: saveRes.uri,
                dialogTitle: 'Share PDF'
              });
            } catch (shareErr) {
              console.warn('Share intent cancelled or failed:', shareErr);
            }
          }
        } else {
          showNotification('Failed to write file natively, sharing raw data...', 'warning');
          try {
            await Share.share({ title: filename, text: 'Pending Report', url: pdfDataUri });
          } catch (shareErr) {
            console.warn('Raw share failed:', shareErr);
          }
        }
      } else {
        doc.save(filename);
        showNotification('Report downloaded successfully', 'success');
      }
    } catch (err) {
      console.error('PDF export error:', err);
      showNotification('Failed to generate PDF', 'error');
    } finally {
      document.body.removeChild(container);
    }
  };

  const filteredList = getFilteredClients();

  const metrics = {
    totalClients: filteredList.length,
    totalOutstanding: filteredList.reduce((sum, c) => sum + getClientOutstanding(c), 0),
    totalPushes: filteredList.reduce((sum, c) => sum + getClientOverdueOrPushedWeeks(c), 0),
    avgPending: filteredList.length > 0 ? Math.round(filteredList.reduce((sum, c) => sum + getClientOutstanding(c), 0) / filteredList.length) : 0
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <AdminNavbar />

      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-xl text-white font-semibold transition-all ${notification.type === 'error' ? 'bg-red-500' : notification.type === 'warning' ? 'bg-yellow-500' : 'bg-emerald-600'
          }`}>
          {notification.message}
        </div>
      )}

      <div className="flex-1 px-4 py-6 w-full">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-[#16423C]">Pending Clients</h1>
            <p className="text-gray-500 text-sm mt-1">Clients with unpaid loans past end date</p>
          </div>
          <button
            onClick={handleExportPDF}
            className="bg-gradient-to-r from-emerald-600 to-[#16423C] text-white px-5 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:-translate-y-0.5 hover:shadow-lg transition-all active:scale-95 shadow cursor-pointer"
          >
            <i className="fas fa-file-pdf"></i>
            Export PDF Report
          </button>
        </div>

        {/* Metrics Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase">Total Clients</div>
              <div className="text-2xl font-bold text-gray-800 mt-1">{metrics.totalClients}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl font-bold">👤</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase">Outstanding Balance</div>
              <div className="text-2xl font-bold text-red-600 mt-1">₹{metrics.totalOutstanding.toLocaleString('en-IN')}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center text-xl font-bold">💰</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase">Cumulative Skips</div>
              <div className="text-2xl font-bold text-yellow-600 mt-1">{metrics.totalPushes} Weeks</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-yellow-50 text-yellow-600 flex items-center justify-center text-xl font-bold">🕒</div>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-gray-400 uppercase">Avg Outstanding</div>
              <div className="text-2xl font-bold text-emerald-800 mt-1">₹{metrics.avgPending.toLocaleString('en-IN')}</div>
            </div>
            <div className="w-12 h-12 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center text-xl font-bold">📊</div>
          </div>
        </div>

        {/* Filter Section */}
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-6 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Search by name, ID, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-4 pr-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white transition-all text-gray-800"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={selectedDistrict}
                onChange={handleDistrictChange}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-gray-700 font-medium cursor-pointer"
              >
                <option value="">All Districts</option>
                {getUniqueDistricts().map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <select
                value={selectedLandmark}
                onChange={handleLandmarkChange}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-gray-700 font-medium cursor-pointer"
              >
                <option value="">All Areas/Landmarks</option>
                {getAvailableLandmarks().map(lm => (
                  <option key={lm} value={lm}>{lm}</option>
                ))}
              </select>

              <select
                value={selectedAgent}
                onChange={handleAgentChange}
                className="px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:bg-white text-gray-700 font-medium cursor-pointer"
              >
                <option value="">All Agents</option>
                {getUniqueAgents().map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>

              {/* Loan End Date Filter */}
              <div className="flex items-center gap-2 bg-slate-50 border-2 border-slate-100 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-gray-500 whitespace-nowrap flex items-center gap-1">
                  <i className="fas fa-calendar-alt text-emerald-600"></i>
                  End Date:
                </span>
                <input
                  type="date"
                  value={selectedEndDate}
                  onChange={(e) => setSelectedEndDate(e.target.value)}
                  className="bg-transparent text-xs font-medium text-gray-700 focus:outline-none cursor-pointer"
                  title="Filter clients whose loan end date is on or before this date"
                />
                {selectedEndDate && (
                  <button
                    onClick={() => setSelectedEndDate('')}
                    className="text-xs text-red-500 hover:text-red-700 ml-1 font-bold"
                    title="Clear end date filter"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Clients Table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-20 text-center text-gray-500 font-semibold flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              Loading pending clients...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="p-20 text-center text-gray-400 font-semibold">
              🎉 No pending clients match the selected filters.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[950px] text-left border-collapse">
                <thead>
                  <tr className="bg-gradient-to-r from-emerald-800 to-[#16423C] text-white text-xs font-bold uppercase tracking-wider">
                    <th className="px-5 py-4">S.No</th>
                    <th className="px-5 py-4">Client Name</th>
                    <th className="px-5 py-4">Client ID</th>
                    <th className="px-5 py-4">Landmark / District</th>
                    <th className="px-5 py-4 text-center">Loan End Date</th>
                    <th className="px-5 py-4 text-right">Outstanding</th>
                    <th className="px-5 py-4 text-center">Overdue / Pushes</th>
                    <th className="px-5 py-4 text-center">Next Due</th>
                    <th className="px-5 py-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                  {filteredList.map((client, idx) => {
                    const outstanding = getClientOutstanding(client);
                    const pushes = getClientOverdueOrPushedWeeks(client);
                    const currentDue = calculateCurrentDue(client);
                    const isPast = isLoanPastEndDate(client);

                    return (
                      <tr
                        key={client._id}
                        onClick={() => navigate(`/Admin/AClientDetails?clientId=${client._id}`)}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        title="Click to view client details"
                      >
                        <td className="px-5 py-4 font-semibold text-gray-500">{idx + 1}</td>
                        <td className="px-5 py-4">
                          <div className="font-bold text-gray-800 group-hover:text-emerald-700 transition-colors">{client.name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{client.phone}</div>
                        </td>
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-gray-600">{client.clientId || 'N/A'}</td>
                        <td className="px-5 py-4">
                          <div className="font-semibold text-gray-700">{client.landmark || 'N/A'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{client.district || 'N/A'}</div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${isPast ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-slate-100 text-slate-700'
                            }`}>
                            {formatDate(client.loan_end_date)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-extrabold text-red-600">
                          ₹{outstanding.toLocaleString('en-IN')}
                        </td>
                        <td className="px-5 py-4 text-center font-bold text-yellow-600">
                          {pushes} Weeks
                        </td>
                        <td className="px-5 py-4 text-center">
                          <span className={`px-3 py-1.5 rounded-full font-bold text-xs ${currentDue > 0 ? 'bg-orange-50 text-orange-600 border border-orange-100' : 'bg-green-50 text-green-600 border border-green-100'
                            }`}>
                            ₹{currentDue.toLocaleString('en-IN')}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenPayModal(client);
                              }}
                              className="bg-[#16423C] hover:bg-[#1f5a52] text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 flex items-center gap-1.5"
                              title="Make a custom payment for this client"
                            >
                              <i className="fas fa-money-bill-wave text-xs"></i>
                              Pay
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/Admin/AClientDetails?clientId=${client._id}`);
                              }}
                              className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 hover:border-emerald-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
                              title="View client details"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Custom Payment Modal */}
      {showPayModal && selectedPayClient && (() => {
        const totalLoan = selectedPayClient.amount || 6900;
        const totalRec = selectedPayClient.received || 0;
        const outstanding = getClientOutstanding(selectedPayClient);
        const overdueWeeks = getClientOverdueOrPushedWeeks(selectedPayClient);
        const weeklyDue = calculateCurrentDue(selectedPayClient) || 575;
        const enteredNum = Number(payAmount) || 0;
        const remainingAfterPay = Math.max(0, outstanding - enteredNum);
        const willBeFullyPaid = enteredNum >= outstanding && outstanding > 0;

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">

              {/* Modal Header */}
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#16423C] flex items-center justify-center text-lg font-bold">
                    <i className="fas fa-hand-holding-dollar"></i>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-[#16423C]">Receive Payment</h3>
                    <p className="text-xs text-gray-500">Collect & update client balance in pending list</p>
                  </div>
                </div>
                <button
                  onClick={handleClosePayModal}
                  disabled={payLoading}
                  className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
                >
                  <i className="fas fa-times text-lg"></i>
                </button>
              </div>

              {/* Client Info Card */}
              <div className="bg-[#E9EFEC]/60 p-3.5 rounded-xl border border-[#C4DAD2] mb-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-bold text-gray-800 text-base">{selectedPayClient.name}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">ID: {selectedPayClient.clientId || 'N/A'} • {selectedPayClient.phone}</div>
                    <div className="text-xs text-gray-600 mt-1">
                      <i className="fas fa-map-marker-alt text-emerald-600 mr-1"></i>
                      {selectedPayClient.landmark || 'N/A'}, {selectedPayClient.district || 'N/A'}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      {overdueWeeks} Wks Overdue
                    </span>
                    <div className="text-[11px] text-gray-500 mt-1">
                      End: {formatDate(selectedPayClient.loan_end_date)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Financial Snapshot */}
              <div className="grid grid-cols-3 gap-2.5 mb-4">
                <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-center">
                  <div className="text-[11px] text-gray-500 font-medium">Total Loan</div>
                  <div className="text-sm font-bold text-gray-800 mt-0.5">₹{totalLoan.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 text-center">
                  <div className="text-[11px] text-emerald-700 font-medium">Received</div>
                  <div className="text-sm font-bold text-emerald-800 mt-0.5">₹{totalRec.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-red-50 p-2.5 rounded-xl border border-red-200 text-center">
                  <div className="text-[11px] text-red-700 font-medium">Outstanding</div>
                  <div className="text-sm font-extrabold text-red-700 mt-0.5">₹{outstanding.toLocaleString('en-IN')}</div>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1.5 uppercase tracking-wider">
                  Quick Amount Presets
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(outstanding))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === outstanding
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    Full Due (₹{outstanding.toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.min(outstanding, weeklyDue)))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === Math.min(outstanding, weeklyDue)
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    1 Wk Due (₹{Math.min(outstanding, weeklyDue).toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPayAmount(String(Math.round(outstanding / 2)))}
                    className={`py-2 px-2 text-xs font-bold rounded-lg border transition-all ${Number(payAmount) === Math.round(outstanding / 2)
                      ? 'bg-[#16423C] text-white border-[#16423C] shadow-sm'
                      : 'bg-gray-50 hover:bg-emerald-50 text-gray-700 border-gray-200 hover:border-emerald-300'
                      }`}
                  >
                    50% (₹{Math.round(outstanding / 2).toLocaleString('en-IN')})
                  </button>
                </div>
              </div>

              {/* Custom Value Amount Input */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-[#16423C] mb-1.5 uppercase tracking-wider">
                  Custom Payment Amount (₹) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-base">₹</span>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="Enter custom amount..."
                    min="1"
                    max={outstanding}
                    className="w-full pl-8 pr-3 py-2.5 border-2 border-[#16423C]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#16423C] focus:border-[#16423C] font-bold text-lg text-[#16423C] bg-white transition-all"
                  />
                </div>

                {/* Live Balance Preview */}
                <div className="mt-2 flex items-center justify-between text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                  <span className="text-gray-600 font-medium">Remaining Balance After Payment:</span>
                  <span className="font-extrabold text-gray-800">
                    ₹{remainingAfterPay.toLocaleString('en-IN')}
                    {willBeFullyPaid && (
                      <span className="ml-1.5 text-emerald-600 font-bold">(Marked as PAID ✓)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Payment Method & Date */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  >
                    <option value="cash">Cash</option>
                    <option value="online">Online Transfer / UPI</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                  />
                </div>
              </div>

              {/* Notes Input */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-gray-600 mb-1">
                  Notes / Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="e.g. Paid in office / custom settlement"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>

              {/* Error Message */}
              {payErrorMsg && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <i className="fas fa-exclamation-circle text-sm text-red-600"></i>
                  <span>{payErrorMsg}</span>
                </div>
              )}

              {/* Success Message */}
              {paySuccessMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <i className="fas fa-check-circle text-sm text-emerald-600"></i>
                  <span>{paySuccessMsg}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={handleConfirmPay}
                  disabled={payLoading || !payAmount || Number(payAmount) <= 0}
                  className="flex-1 bg-[#16423C] hover:bg-[#1f5a52] text-white py-2.5 rounded-xl font-bold text-sm transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {payLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Recording Payment...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle"></i>
                      Confirm Payment (₹{enteredNum.toLocaleString('en-IN')})
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleClosePayModal}
                  disabled={payLoading}
                  className="px-5 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-xl font-semibold text-sm transition-all"
                >
                  Cancel
                </button>
              </div>

            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default PendingClients;
