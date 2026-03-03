import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Added for redirection
import AdminNavbar from './AdminNavbar';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const AgentManagement = () => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [agents, setAgents] = useState([]);
  const [stats, setStats] = useState({
    totalAgents: 0,
    activeAgents: 0,
    onLeaveAgents: 0,
    newThisMonth: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    email: '',
    phone: '',
    password: '',
    status: 'Active',
    profilePhoto: null
  });

  // Check authentication and Fetch agents on component mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    // Secure the route: If no token or not admin, send to login
    if (!token || !user || user.role !== 'admin') {
      navigate('/'); 
    } else {
      fetchAgents();
    }
  }, [navigate]);

  const fetchAgents = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await axios.get(`${API_URL}/agents`, {
        headers: {
          Authorization: `Bearer ${token}` // Added Token
        }
      });
      
      if (response.data && response.data.agents) {
        setAgents(response.data.agents);
        setStats({
          totalAgents: response.data.stats?.totalAgents || 0,
          activeAgents: response.data.stats?.activeAgents || 0,
          onLeaveAgents: response.data.stats?.onLeaveAgents || 0,
          newThisMonth: response.data.stats?.newThisMonth || 0
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
      if (error.response?.status === 401) navigate('/'); // Kick to login if token expired
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === 'file') {
      if (files && files.length > 0) {
        setFormData({ ...formData, profilePhoto: files[0] });
      }
    } else {
      // Restrict phone input to digits only and max 10 characters
      if (name === 'phone') {
        const digits = String(value).replace(/\D/g, '').slice(0, 10);
        setFormData({ ...formData, [name]: digits });
      } else {
        setFormData({ ...formData, [name]: value });
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.username || !formData.name || !formData.email || (!selectedAgent && !formData.password)) {
      alert('Please fill in all required fields');
      return;
    }

    const token = localStorage.getItem('token');
    const formDataToSend = new FormData();
    
    formDataToSend.append('username', formData.username);
    formDataToSend.append('name', formData.name);
    formDataToSend.append('email', formData.email);
    if (formData.phone) formDataToSend.append('phone', formData.phone);
    if (formData.password) formDataToSend.append('password', formData.password);
    formDataToSend.append('status', formData.status);
    formDataToSend.append('department', 'Field Agent');
    formDataToSend.append('commission', '0');
    
    if (formData.profilePhoto instanceof File) {
      formDataToSend.append('profilePhoto', formData.profilePhoto);
    }

    try {
      const url = selectedAgent 
        ? `${API_URL}/agents/${selectedAgent._id}`
        : `${API_URL}/agents`;
      
      const method = selectedAgent ? 'put' : 'post';
      
      const response = await axios({
        method: method,
        url: url,
        data: formDataToSend,
        headers: { 
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}` // Added Token
        }
      });

      if (response.data) {
        await fetchAgents();
        setIsModalOpen(false);
        resetForm();
        alert(`Agent ${selectedAgent ? 'updated' : 'created'} successfully!`);
      }
    } catch (error) {
      console.error('Submit error:', error);
      alert('Error: ' + (error.response?.data?.message || 'Failed to save agent'));
    }
  };

  const handleDelete = async (agentId) => {
    if (!window.confirm('Are you sure you want to delete this agent?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/agents/${agentId}`, {
        headers: {
          Authorization: `Bearer ${token}` // Added Token
        }
      });
      await fetchAgents();
      alert('Agent deleted successfully!');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete agent');
    }
  };

  const handleEdit = (agent) => {
    setSelectedAgent(agent);
    setFormData({
      username: agent.username,
      name: agent.name,
      email: agent.email,
      phone: agent.phone || '',
      password: '',
      status: agent.status,
      profilePhoto: null
    });
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setSelectedAgent(null);
    setFormData({
      username: '',
      name: '',
      email: '',
      phone: '',
      password: '',
      status: 'Active',
      profilePhoto: null
    });
  };

  const filteredAgents = agents.filter(agent => 
    agent.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    agent.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statCards = [
    { title: 'TOTAL AGENTS', value: stats.totalAgents, color: 'text-emerald-700' },
    { title: 'ACTIVE AGENTS', value: stats.activeAgents, color: 'text-emerald-700' },
    { title: 'NEW THIS MONTH', value: stats.newThisMonth, color: 'text-emerald-700' },
    // { title: 'ON LEAVE', value: stats.onLeaveAgents, color: 'text-red-600' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] to-[#e9f0f5] pb-12">
      <AdminNavbar />

      <div className="w-full px-4 sm:px-6 lg:px-10 xl:px-16 py-2 sm:py-4">
        {/* Header - Green Theme */}
        <header className="relative mb-8 rounded-2xl overflow-hidden backdrop-blur-lg bg-gradient-to-r from-[#16423C] to-[#1f5a52] shadow-xl">
          <div className="absolute inset-0 bg-black/20"></div>
          <div className="relative px-6 py-8 text-white">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Agent Management</h1>
            <p className="text-emerald-100 mt-2 text-lg">Manage your agents and their accounts</p>
          </div>
        </header>

        {/* Stats Cards - Green Theme - Single Row on Mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-5 mb-10">
          {statCards.map((stat, i) => (
            <div key={i} className="backdrop-blur-lg bg-white/80 rounded-xl shadow border border-white/20 p-2 sm:p-4 lg:p-6 text-center hover:shadow-md transition-all duration-300 flex flex-col justify-center">
              <p className={`text-lg sm:text-2xl lg:text-4xl font-bold ${stat.color}`}>{loading ? '...' : stat.value}</p>
              <p className="mt-1 sm:mt-2 text-xs sm:text-sm font-medium text-gray-600 uppercase tracking-wide truncate">{stat.title}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
          <div className="bg-gradient-to-r from-[#16423C] to-[#1f5a52] text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <span className="text-xl font-semibold">Agents</span>
            <button
              onClick={() => { resetForm(); setIsModalOpen(true); }}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              <span className="text-lg">+</span> Add Agent
            </button>
          </div>

          <div className="p-6 border-b border-gray-200">
            <div className="relative backdrop-blur-lg bg-white/70 rounded-lg border-2 border-[#16423C]/30">
              <input
                type="text"
                placeholder="Search agents by name, email, or username..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 bg-transparent focus:outline-none focus:ring-2 focus:ring-[#16423C] text-gray-700 placeholder-gray-500"
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-emerald-500 border-t-transparent"></div>
              <p className="mt-2 text-gray-600">Loading agents...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-[#16423C] text-white sticky top-0">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">JOIN DATE</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">AGENT</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">EMAIL</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">PHONE NUMBER</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">STATUS</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredAgents.map((agent) => (
                    <tr key={agent._id} className="hover:bg-gray-50">
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600">
                        {new Date(agent.joinDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-semibold overflow-hidden">
                            {agent.profilePhoto ? (
                              <img src={`${API_URL.replace('/api', '')}${agent.profilePhoto}`} alt="" className="w-full h-full object-cover" />
                            ) : agent.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{agent.name}</div>
                            <div className="text-xs text-gray-500">@{agent.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600">{agent.email}</td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm text-gray-600">{agent.phone || 'N/A'}</td>
                      <td className="px-6 py-5 whitespace-nowrap">
                        <span className={`px-3 py-1 inline-flex text-xs font-semibold rounded-full ${agent.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-3">
                          <button onClick={() => handleEdit(agent)} className="text-emerald-600 hover:text-emerald-800">✏️</button>
                          <button onClick={() => handleDelete(agent._id)} className="text-red-600 hover:text-red-800">🗑️</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center px-6 py-5 border-b">
              <h2 className="text-xl font-bold text-gray-900">{selectedAgent ? 'Edit Agent' : 'Add New Agent'}</h2>
              <button onClick={() => { setIsModalOpen(false); resetForm(); }} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="p-6 space-y-6">
                <div className="flex flex-col items-center">
                  <div className="w-24 h-24 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden">
                    {formData.profilePhoto ? (
                      <img src={URL.createObjectURL(formData.profilePhoto)} alt="Preview" className="w-full h-full object-cover" />
                    ) : <span className="text-4xl">👤</span>}
                  </div>
                  <input type="file" id="profilePhoto" name="profilePhoto" accept="image/*" onChange={handleInputChange} className="hidden" />
                  <label htmlFor="profilePhoto" className="mt-3 text-sm text-emerald-600 font-medium cursor-pointer">↑ Upload Photo</label>
                </div>

                <div className="space-y-4">
                  <input type="text" name="username" value={formData.username} onChange={handleInputChange} placeholder="Username *" className="w-full px-4 py-2 border rounded-lg" required />
                  <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Full Name *" className="w-full px-4 py-2 border rounded-lg" required />
                  <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="Email *" className="w-full px-4 py-2 border rounded-lg" required />
                  <input
                    type="tel"
                    name="phone"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={10}
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="Phone"
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                  <input type="password" name="password" value={formData.password} onChange={handleInputChange} placeholder={selectedAgent ? "New Password (Optional)" : "Password *"} className="w-full px-4 py-2 border rounded-lg" required={!selectedAgent} />
                  
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-4 py-2 border rounded-lg">
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="px-6 py-5 border-t flex justify-end gap-3">
                <button type="button" onClick={() => { setIsModalOpen(false); resetForm(); }} className="px-5 py-2 border rounded-lg">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">{selectedAgent ? 'Update' : 'Add'} Agent</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentManagement;