import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminNavbar from './AdminNavbar';
import axios from 'axios';
import { CheckCircle, XCircle } from 'lucide-react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const AssignAgents = () => {
  const navigate = useNavigate();
  const [managers, setManagers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedManager, setSelectedManager] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingAgentId, setSavingAgentId] = useState(null);
  const [searchManager, setSearchManager] = useState('');
  const [searchAgent, setSearchAgent] = useState('');

  // Popup
  const [popup, setPopup] = useState({ visible: false, type: 'success', title: '', message: '' });
  const popupTimeout = useRef(null);

  const showPopup = (type, title, message, duration = 3500) => {
    if (popupTimeout.current) clearTimeout(popupTimeout.current);
    setPopup({ visible: true, type, title, message });
    popupTimeout.current = setTimeout(() => setPopup(p => ({ ...p, visible: false })), duration);
  };

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const token = localStorage.getItem('token');
    if (!token || !user || user.role !== 'admin') {
      navigate('/');
      return;
    }
    fetchData();
    return () => { if (popupTimeout.current) clearTimeout(popupTimeout.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/admin/managers-with-agents`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data && res.data.success) {
        const fetchedManagers = res.data.managers || [];
        const fetchedAgents = res.data.agents || [];
        setManagers(fetchedManagers);
        setAgents(fetchedAgents);
        // Re-select the same manager if already selected (to refresh assigned list)
        setSelectedManager(prev => {
          if (!prev) return null;
          const updated = fetchedManagers.find(m => m._id === prev._id);
          return updated || prev;
        });
      }
    } catch (err) {
      showPopup('error', 'Error', 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToggle = async (agent) => {
    if (!selectedManager) {
      showPopup('error', 'Select Manager', 'Please select a manager first');
      return;
    }

    const isAssigned = selectedManager.assignedAgents?.includes(agent._id?.toString());
    setSavingAgentId(agent._id);

    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/admin/assign-agent`, {
        agentId: agent._id,
        managerId: isAssigned ? null : selectedManager._id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const agentIdStr = agent._id?.toString();

      // Optimistic update agents list
      setAgents(prev => prev.map(a => {
        if (a._id?.toString() !== agentIdStr) return a;
        return { ...a, managerId: isAssigned ? null : selectedManager._id };
      }));

      // Update managers list
      setManagers(prev => prev.map(m => {
        if (m._id === selectedManager._id) {
          const newAssigned = isAssigned
            ? m.assignedAgents.filter(id => id !== agentIdStr)
            : [...(m.assignedAgents || []), agentIdStr];
          return { ...m, assignedAgents: newAssigned };
        }
        // If re-assigning, remove from old manager
        if (!isAssigned && m.assignedAgents?.includes(agentIdStr)) {
          return { ...m, assignedAgents: m.assignedAgents.filter(id => id !== agentIdStr) };
        }
        return m;
      }));

      // Update selected manager state
      setSelectedManager(prev => {
        if (!prev || prev._id !== selectedManager._id) return prev;
        const newAssigned = isAssigned
          ? prev.assignedAgents.filter(id => id !== agentIdStr)
          : [...(prev.assignedAgents || []), agentIdStr];
        return { ...prev, assignedAgents: newAssigned };
      });

      showPopup(
        'success',
        isAssigned ? 'Unassigned' : 'Assigned',
        isAssigned
          ? `${agent.name} removed from ${selectedManager.name}`
          : `${agent.name} assigned to ${selectedManager.name}`
      );
    } catch (err) {
      showPopup('error', 'Error', err.response?.data?.message || 'Failed to update assignment');
    } finally {
      setSavingAgentId(null);
    }
  };

  const filteredManagers = managers.filter(m =>
    m.name?.toLowerCase().includes(searchManager.toLowerCase()) ||
    m.username?.toLowerCase().includes(searchManager.toLowerCase())
  );

  const filteredAgents = agents.filter(a =>
    a.name?.toLowerCase().includes(searchAgent.toLowerCase()) ||
    a.username?.toLowerCase().includes(searchAgent.toLowerCase())
  );

  // Get agent's current manager name (for warning label)
  const getAgentManagerName = (agent) => {
    if (!agent.managerId) return null;
    const agentMgrId = agent.managerId?.toString();
    const mgr = managers.find(m => m._id?.toString() === agentMgrId);
    return mgr ? mgr.name : null;
  };

  const assignedCount = selectedManager ? (selectedManager.assignedAgents?.length || 0) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f7f4] to-[#e8f5f1]">
      <AdminNavbar />

      {/* Toast Popup */}
      {popup.visible && (
        <div className={`fixed top-5 right-5 z-[1001] p-4 rounded-xl shadow-2xl flex items-start gap-3 max-w-xs font-medium ${popup.type === 'success' ? 'bg-emerald-600 text-white border border-emerald-700' : 'bg-red-600 text-white border border-red-700'}`}>
          <div className="flex-shrink-0 mt-0.5">
            {popup.type === 'success' ? <CheckCircle size={24} /> : <XCircle size={24} />}
          </div>
          <div className="leading-snug">
            <div className="font-bold text-sm">{popup.title}</div>
            <div className="text-xs mt-0.5 opacity-90">{popup.message}</div>
          </div>
        </div>
      )}

      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-6">
        {/* Header */}
        <div className="relative mb-8 rounded-2xl overflow-hidden bg-gradient-to-r from-[#16423C] to-[#1f5a52] shadow-xl">
          <div className="absolute inset-0 bg-black/10" />
          <div className="relative px-6 py-8 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight flex items-center gap-3">
                <span className="text-3xl">🔗</span> Assign Agents to Managers
              </h1>
              <p className="text-emerald-100 mt-2 text-base">
                Select a manager on the left, then toggle agents on the right to assign or unassign them
              </p>
            </div>
            <button
              onClick={fetchData}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 transition border border-white/30"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent mb-4" />
              <p className="text-gray-500 font-medium">Loading managers & agents...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* LEFT PANEL – Managers */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">Managers</h2>
                  <p className="text-emerald-200 text-xs mt-0.5">Click a manager to assign agents</p>
                </div>
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30">
                  {managers.length} Total
                </span>
              </div>

              <div className="p-4 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search managers..."
                  value={searchManager}
                  onChange={e => setSearchManager(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100" style={{ maxHeight: '520px' }}>
                {filteredManagers.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No managers found</div>
                ) : (
                  filteredManagers.map(manager => {
                    const isSelected = selectedManager?._id === manager._id;
                    const agentCount = manager.assignedAgents?.length || 0;
                    return (
                      <div
                        key={manager._id}
                        onClick={() => setSelectedManager(manager)}
                        className={`flex items-center gap-4 px-5 py-4 cursor-pointer transition-all ${isSelected
                          ? 'bg-emerald-50 border-l-4 border-emerald-600'
                          : 'hover:bg-gray-50 border-l-4 border-transparent'
                          }`}
                      >
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0 ${isSelected ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                          {manager.name?.charAt(0).toUpperCase() || 'M'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`font-semibold text-sm truncate ${isSelected ? 'text-emerald-800' : 'text-gray-900'}`}>
                            {manager.name}
                          </div>
                          <div className="text-xs text-gray-500">@{manager.username}</div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${agentCount > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {agentCount} Agent{agentCount !== 1 ? 's' : ''}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${manager.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {manager.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANEL – Agents */}
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden flex flex-col">
              <div className="bg-gradient-to-r from-[#1a5276] to-[#2e86c1] text-white px-5 py-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">
                    {selectedManager ? `Agents — ${selectedManager.name}` : 'All Agents'}
                  </h2>
                  <p className="text-blue-200 text-xs mt-0.5">
                    {selectedManager
                      ? `${assignedCount} assigned — toggle to assign/unassign`
                      : 'Select a manager first'}
                  </p>
                </div>
                <span className="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full border border-white/30">
                  {agents.length} Total
                </span>
              </div>

              <div className="p-4 border-b border-gray-100">
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={searchAgent}
                  onChange={e => setSearchAgent(e.target.value)}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100" style={{ maxHeight: '480px' }}>
                {!selectedManager ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="text-6xl mb-4">👈</div>
                    <p className="text-gray-500 font-medium">Select a manager from the left panel</p>
                    <p className="text-gray-400 text-sm mt-1">Then toggle agents to assign or unassign them</p>
                  </div>
                ) : filteredAgents.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 text-sm">No agents found</div>
                ) : (
                  filteredAgents.map(agent => {
                    const agentIdStr = agent._id?.toString();
                    const isAssigned = selectedManager.assignedAgents?.includes(agentIdStr);
                    const agentManagerId = agent.managerId?.toString();
                    const isAssignedToOther = agentManagerId && agentManagerId !== selectedManager._id?.toString();
                    const otherManagerName = isAssignedToOther ? getAgentManagerName(agent) : null;
                    const isSaving = savingAgentId === agent._id;

                    return (
                      <div
                        key={agent._id}
                        className={`flex items-center gap-4 px-5 py-4 transition-all ${isAssigned ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shadow-sm flex-shrink-0 ${isAssigned ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                          {agent.name?.charAt(0).toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-gray-900 truncate">{agent.name}</div>
                          <div className="text-xs text-gray-500">@{agent.username}</div>
                          {isAssignedToOther && (
                            <div className="text-[10px] text-amber-600 font-medium mt-0.5">
                              ⚠️ Under {otherManagerName || 'another manager'}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${agent.status === 'Active' ? 'bg-green-100 text-green-700' : agent.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-600'}`}>
                            {agent.status}
                          </span>
                          {/* Toggle Switch */}
                          <button
                            onClick={() => handleAssignToggle(agent)}
                            disabled={isSaving}
                            title={isAssigned ? 'Click to unassign' : 'Click to assign to ' + selectedManager.name}
                            style={{ position: 'relative' }}
                            className={`inline-flex h-7 w-14 items-center rounded-full transition-colors duration-300 focus:outline-none ${isAssigned ? 'bg-emerald-500' : 'bg-gray-300'} ${isSaving ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${isAssigned ? 'translate-x-8' : 'translate-x-1'}`}
                            />
                            {isSaving && (
                              <span className="absolute inset-0 flex items-center justify-center">
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              </span>
                            )}
                          </button>
                          <span className={`text-[10px] font-bold ${isAssigned ? 'text-emerald-600' : 'text-gray-400'}`}>
                            {isAssigned ? '✓ Assigned' : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Summary Footer */}
              {selectedManager && (
                <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between gap-2">
                  <div className="text-xs text-gray-600">
                    <span className="font-bold text-emerald-700">{assignedCount}</span> agent{assignedCount !== 1 ? 's' : ''} assigned to <span className="font-bold">{selectedManager.name}</span>
                  </div>
                  {assignedCount > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(selectedManager.assignedAgents || []).slice(0, 3).map(agentId => {
                        const a = agents.find(ag => ag._id?.toString() === agentId);
                        return a ? (
                          <span key={agentId} className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">
                            {a.name?.split(' ')[0]}
                          </span>
                        ) : null;
                      })}
                      {assignedCount > 3 && (
                        <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-semibold">
                          +{assignedCount - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <h3 className="font-bold text-blue-800 text-sm mb-2 flex items-center gap-2">
            <span>ℹ️</span> How Assignment Works
          </h3>
          <ul className="text-xs text-blue-700 space-y-1.5">
            <li>• <strong>Select a Manager</strong> from the left panel to see the agent assignment panel</li>
            <li>• <strong>Toggle the green switch</strong> next to any agent to assign or unassign them</li>
            <li>• Assigned agents' collected amounts will appear under that <strong>manager's dashboard view</strong></li>
            <li>• Agents marked ⚠️ are already under another manager — toggling will <strong>re-assign</strong> them</li>
            <li>• Changes are <strong>saved instantly</strong> — no save button needed</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AssignAgents;
