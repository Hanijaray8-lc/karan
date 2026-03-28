import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  ArrowRight,
  History,
  FileText,
  CheckCircle,
  AlertCircle,
  X,
  ChevronDown,
  Search,
  Plus,
  IndianRupee,
} from 'lucide-react';
import ManagerNavbar from './ManagerNavbar';

export default function ClientManage() {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [clientsOfAgent, setClientsOfAgent] = useState([]);
  const [allAgents, setAllAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [agentSearchTerm, setAgentSearchTerm] = useState('');

  // Modal states
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [targetAgent, setTargetAgent] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [transferHistory, setTransferHistory] = useState([]);

  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const popupTimeoutRef = useRef(null);

  const showPopup = (type, title, message, duration = 4000) => {
    if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    setPopup({ visible: true, type, title, message });
    popupTimeoutRef.current = setTimeout(() => {
      setPopup(prev => ({ ...prev, visible: false }));
      popupTimeoutRef.current = null;
    }, duration);
  };

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
    };
  }, []);

  // Fetch agents
  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const token = localStorage.getItem('token');
      // Try to read logged-in user info to decide which endpoint to call
      let storedUser = null;
      try {
        storedUser = JSON.parse(localStorage.getItem('user')) || null;
      } catch {}

      // If the logged-in user is an agent, fetch only that agent (agents list is admin/manager only)
      if (storedUser && (storedUser.role || '').toLowerCase() === 'agent') {
        const agentId = storedUser._id || storedUser.id;
        if (!agentId) {
          showPopup('error', 'Error', 'Agent id missing from stored user');
          return;
        }

        const res = await fetch(`https://karan-e26t.onrender.com/api/agents/${agentId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.status === 401) {
          alert('Session expired');
          window.location.href = '/';
          return;
        }

        if (res.status === 403) {
          const text = await res.text();
          console.error('403 fetching agent:', text);
          showPopup('error', 'Access denied', 'You do not have permission to view agents');
          return;
        }

        const data = await res.json();
        if (data && data.success && data.agent) {
          setAgents([data.agent]);
          setAllAgents([data.agent]);
        }
        return;
      }

      // Default: admin/manager - fetch full agents list
      const res = await fetch('https://karan-e26t.onrender.com/api/agents', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        alert('Session expired');
        window.location.href = '/';
        return;
      }

      if (res.status === 403) {
        const text = await res.text();
        console.error('403 fetching agents list:', text);
        showPopup('error', 'Access denied', 'You do not have permission to view the agents list');
        return;
      }

      const data = await res.json();
      if (data && data.success && data.agents) {
        setAgents(data.agents);
        setAllAgents(data.agents);
      }
    } catch (err) {
      console.error('Error fetching agents:', err);
      showPopup('error', 'Error', 'Failed to load agents');
    }
  };

  // Fetch clients for selected agent
  const fetchClientsForAgent = async (agentId) => {
    if (!agentId) {
      setClientsOfAgent([]);
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`https://karan-e26t.onrender.com/api/clients/agent/${agentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        alert('Session expired');
        window.location.href = '/';
        return;
      }

      const data = await res.json();
      if (data && data.success) {
        setClientsOfAgent(data.clients || []);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
      showPopup('error', 'Error', 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  // Fetch payment history for a client
  const fetchPaymentHistory = async (clientId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`https://karan-e26t.onrender.com/api/payments/history/${clientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) return;

      const data = await res.json();
      if (data && data.success) {
        setPaymentHistory(data.payments || []);
      }
    } catch (err) {
      console.error('Error fetching payment history:', err);
    }
  };

  // Handle agent selection
  const handleAgentSelect = (agent) => {
    setSelectedAgent(agent);
    fetchClientsForAgent(agent._id);
    setSearchTerm('');
  };

  // Open transfer modal
  const openTransferModal = (client) => {
    setSelectedClient(client);
    setTargetAgent(null);
    setShowTransferModal(true);
  };

  // Open payment history modal
  const openPaymentHistory = (client) => {
    setSelectedClient(client);
    fetchPaymentHistory(client._id);
    setShowPaymentHistory(true);
  };

  // Transfer client to another agent
  const handleTransferClient = async () => {
    if (!selectedClient || !targetAgent) {
      showPopup('error', 'Error', 'Please select a target agent');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`https://karan-e26t.onrender.com/api/clients/${selectedClient._id}/transfer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          new_agent_id: targetAgent._id,
          new_agent_name: targetAgent.name || targetAgent.username
        })
      });

      if (res.status === 401) {
        alert('Session expired');
        window.location.href = '/';
        return;
      }

      const data = await res.json();
      if (data.success) {
        showPopup('success', 'Success', `Client transferred to ${targetAgent.name || targetAgent.username}`);
        setShowTransferModal(false);
        fetchClientsForAgent(selectedAgent._id);
      } else {
        showPopup('error', 'Error', data.message || 'Failed to transfer client');
      }
    } catch (err) {
      console.error('Error transferring client:', err);
      showPopup('error', 'Error', 'Failed to transfer client');
    }
  };

  const filteredClients = clientsOfAgent.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.phone.includes(searchTerm)
  );

  const formatDate = (date) => {
    if (!date) return '—';
    try {
      return new Date(date).toLocaleDateString('en-IN');
    } catch {
      return '—';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <ManagerNavbar />
      <div className="pt-8 pb-6 px-4">
        {/* Header */}
        <header className="relative mb-6 rounded-2xl overflow-hidden backdrop-blur-lg bg-gradient-to-r from-[#16423C] to-[#1f5a52] shadow-xl">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="relative px-6 py-6 text-white">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Client Management</h1>
            <p className="text-emerald-100 mt-2 text-lg flex items-center gap-2">
              <Users size={20} /> Transfer & Manage Clients by Agent
            </p>
          </div>
        </header>

        {/* Main Content - 2 Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-auto lg:h-[calc(100vh-280px)]">
          {/* Left Panel - Agents List (30%) */}
          <div className="lg:col-span-1 backdrop-blur-lg bg-white/90 rounded-2xl shadow-lg overflow-hidden border border-white/50 flex flex-col min-h-[360px] lg:min-h-0">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Users size={22} /> Agents ({agents.length})
              </h2>
            </div>

            {/* Agent Search Bar */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={agentSearchTerm}
                  onChange={(e) => setAgentSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {agents
                .filter(agent =>
                  (agent.name || agent.username).toLowerCase().includes(agentSearchTerm.toLowerCase()) ||
                  (agent.phone || '').includes(agentSearchTerm)
                )
                .map(agent => (
                <button
                  key={agent._id}
                  onClick={() => handleAgentSelect(agent)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 transition-all duration-200 flex items-center gap-3 ${
                    selectedAgent?._id === agent._id
                      ? 'bg-[#16423C]/10 border-l-4 border-[#16423C]'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[#16423C]/20 flex items-center justify-center flex-shrink-0">
                    <Users size={18} className="text-[#16423C]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {agent.name || agent.username}
                    </p>
                    <p className="text-xs text-gray-500">{agent.phone || 'N/A'}</p>
                  </div>
                  {selectedAgent?._id === agent._id && (
                    <ChevronDown size={18} className="text-[#16423C] flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Right Panel - Clients Table (70%) */}
          <div className="lg:col-span-2 backdrop-blur-lg bg-white/90 rounded-2xl shadow-lg overflow-hidden border border-white/50 flex flex-col">
            {selectedAgent ? (
              <>
                <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">
                      Clients of {selectedAgent.name || selectedAgent.username}
                    </h2>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium">
                      {filteredClients.length} clients
                    </span>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                      type="text"
                      placeholder="Search by name or phone..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                    />
                  </div>
                </div>

                {/* Clients Table */}
                <div className="flex-1 overflow-y-auto min-h-[300px] lg:min-h-0">
                  {loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-[#16423C] border-t-transparent mb-4"></div>
                        <p className="text-gray-600">Loading clients...</p>
                      </div>
                    </div>
                  ) : filteredClients.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center py-12">
                        <Users size={48} className="text-gray-300 mx-auto mb-4" />
                        <p className="text-gray-500">
                          {searchTerm ? 'No matching clients found' : 'No clients for this agent'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {filteredClients.map(client => (
                        <div key={client._id} className="px-6 py-4 hover:bg-gray-50/50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <h3 className="font-bold text-gray-900">{client.name}</h3>
                              <p className="text-sm text-gray-600">📱 {client.phone}</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => openPaymentHistory(client)}
                                className="p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                                title="Payment History"
                              >
                                <History size={16} />
                              </button>
                              <button
                                onClick={() => openTransferModal(client)}
                                className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
                                title="Transfer Client"
                              >
                                <ArrowRight size={16} />
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                            <div>
                              <p className="text-gray-500">Amount</p>
                              <p className="font-semibold text-green-700">₹{(client.amount || 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Received</p>
                              <p className="font-semibold text-blue-700">₹{(client.received || 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Pending</p>
                              <p className="font-semibold text-red-700">₹{(client.pending || 0).toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Status</p>
                              <p className={`font-semibold text-xs ${
                                client.status === 'paid' ? 'text-green-600' :
                                client.status === 'partial' ? 'text-yellow-600' : 'text-red-600'
                              }`}>
                                {client.status === 'paid' ? '✅ Paid' :
                                 client.status === 'partial' ? '⚠️ Partial' : '⏳ Pending'}
                              </p>
                            </div>
                          </div>

                          <div className="text-xs text-gray-500 mt-2 flex items-center justify-between">
                            <span>📍 {client.district}</span>
                            <span>{formatDate(client.loan_start_date)} to {formatDate(client.loan_end_date)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Users size={48} className="text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">Select an agent to view their clients</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransferModal && selectedClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-md border border-white/50">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ArrowRight size={22} /> Transfer Client
              </h2>
              <button
                onClick={() => setShowTransferModal(false)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Current Client Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-bold text-gray-900 mb-2">Client: {selectedClient.name}</h3>
                <p className="text-sm text-gray-600">📱 {selectedClient.phone}</p>
                <p className="text-sm text-gray-600">💰 ₹{(selectedClient.amount || 0).toLocaleString('en-IN')}</p>
              </div>

              {/* Current Agent */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-xs text-gray-500 mb-1">FROM</p>
                <h3 className="font-bold text-gray-900">{selectedAgent.name || selectedAgent.username}</h3>
              </div>

              {/* Transfer Arrow */}
              <div className="flex justify-center">
                <ArrowRight className="text-[#16423C]" size={24} />
              </div>

              {/* Select Target Agent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">TO (Select Agent)</label>
                <select
                  value={targetAgent?._id || ''}
                  onChange={(e) => {
                    const agent = allAgents.find(a => a._id === e.target.value);
                    setTargetAgent(agent || null);
                  }}
                  className="w-full px-4 py-2 border-2 border-[#16423C]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#16423C]"
                >
                  <option value="">Select an agent...</option>
                  {allAgents
                    .filter(a => a._id !== selectedAgent._id)
                    .map(agent => (
                      <option key={agent._id} value={agent._id}>
                        {agent.name || agent.username}
                      </option>
                    ))}
                </select>
              </div>

              {targetAgent && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-gray-600">
                    <AlertCircle className="inline mr-2" size={16} />
                    This will transfer all client details and payment records to {targetAgent.name || targetAgent.username}.
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleTransferClient}
                  disabled={!targetAgent}
                  className="flex-1 bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white py-2 rounded-lg font-semibold hover:from-[#1f5a52] hover:to-[#16423C] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirm Transfer
                </button>
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="flex-1 bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {showPaymentHistory && selectedClient && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl w-full max-w-2xl border border-white/50 max-h-[80vh] overflow-hidden flex flex-col">
            <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History size={22} /> Payment History
              </h2>
              <button
                onClick={() => setShowPaymentHistory(false)}
                className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {/* Client Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <h3 className="font-bold text-gray-900">Client: {selectedClient.name}</h3>
                <p className="text-sm text-gray-600">💰 Total: ₹{(selectedClient.amount || 0).toLocaleString('en-IN')} | Pending: ₹{(selectedClient.pending || 0).toLocaleString('en-IN')}</p>
              </div>

              {/* Payments List */}
              {paymentHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText size={32} className="mx-auto mb-2 text-gray-300" />
                  <p>No payment history</p>
                </div>
              ) : (
                paymentHistory.map((payment, idx) => (
                  <div key={payment._id || idx} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          Payment #{paymentHistory.length - idx}
                        </p>
                        <p className="text-xs text-gray-500">{formatDate(payment.createdAt)}</p>
                      </div>
                      <span className="text-lg font-bold text-green-700">
                        +₹{(payment.amount || 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-gray-500">Collected By</p>
                        <p className="font-medium">{payment.collectedStaff || payment.staffName || 'Unknown'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Remaining Due</p>
                        <p className="font-medium text-red-600">₹{(payment.remainingDue || 0).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-gray-200 p-6">
              <button
                onClick={() => setShowPaymentHistory(false)}
                className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Notification */}
      {popup.visible && (
        <div className={`fixed top-5 right-5 z-[1001] p-4 rounded-lg shadow-xl flex items-start gap-3 max-w-xs font-medium ${
          popup.type === 'success' ? 'bg-green-600 text-white border border-green-700' : 'bg-red-600 text-white border border-red-700'
        }`}>
          <div className="flex-shrink-0 mt-0.5">
            {popup.type === 'success' ? <CheckCircle size={28} /> : <AlertCircle size={28} />}
          </div>
          <div className="leading-snug">
            <div className="font-bold">{popup.title}</div>
            <div className="text-sm mt-1">{popup.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}
