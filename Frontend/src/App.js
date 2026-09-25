import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import AdminDashboard from './Components/Admin/AdminDashboard';
import ManagerDashboard from './Components/Manager/ManagerDashboard';
import AddAgent from './Components/Admin/AddAgent';
import AClientDetails from './Components/Admin/AClientDetails';
import PaymentHistory from './Components/Admin/PaymentHistory';

import AgentDashboard from './Components/AgentDashboard';
import AddClient from './Components/Admin/AddClient';
import DailyDues from './Components/DailyDues';
import ClientDetails from './Components/ClientDetails';
import Payment from './Components/Payment';
import Login from './Components/Login';
import AddManager from './Components/Admin/AddManager';
import MClientDetails from './Components/Manager/MClientDetails';
import MDailyDues from './Components/Manager/MDailyDues';
import MpaymentHistory from './Components/Manager/MpaymentHistory';
import MAddClient from './Components/Manager/MAddClient';
import ClientManage from './Components/Manager/ClientManage';
import ApaymentHistory from './Components/ApaymentHistory';
import PendingClients from './Components/Admin/PendingClients';
import MPendingClients from './Components/Manager/MPendingClients';
import AciveInactive from './Components/Manager/Acive-Inactive';
import AdminActiveInactive from './Components/Admin/Active-inactive';
import AdminCredentials from './Components/Admin/AdminCredentials';
import AdminAproval from './Components/Admin/AdminAproval';
import ManagerAproval from './Components/Manager/ManagerAproval';

import SyncStatusBadge from './Components/SyncStatusBadge';
import { prewarmLocalDatabase } from './services/prewarmService';

const AppContent = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Handle Android back button
    const handleBackButton = () => {
      navigate(-1); // Navigate to previous page instead of exiting the app
    };

    CapacitorApp.addListener('backButton', handleBackButton);

    // Silently pre-warm local SQLite database in background
    prewarmLocalDatabase();

    return () => {
      CapacitorApp.removeAllListeners();
    };
  }, [navigate]);

  return (
    <>
      {/* <SyncStatusBadge /> */}

      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/Admin/admindashboard" element={<AdminDashboard />} />
        <Route path="/Manager/managerdashboard" element={<ManagerDashboard />} />
        <Route path="/Admin/AddAgent" element={<AddAgent />} />
        <Route path="/Admin/AClientDetails" element={<AClientDetails />} />

        <Route path="/Admin/PaymentHistory" element={<PaymentHistory />} />
        <Route path="/Admin/AddManager" element={<AddManager />} />
        <Route path="/Admin/Active-inactive" element={<AdminActiveInactive />} />
        <Route path="/Admin/Active-Inactive" element={<AdminActiveInactive />} />
        <Route path="/Admin/Credentials" element={<AdminCredentials />} />
        <Route path="/Admin/AdminCredentials" element={<AdminCredentials />} />
        <Route path="/Admin/AdminAproval" element={<AdminAproval />} />
        <Route path="/Admin/AdminApproval" element={<AdminAproval />} />
        <Route path="/Admin/approval" element={<AdminAproval />} />

        <Route path="/Manager/ManagerAproval" element={<ManagerAproval />} />
        <Route path="/Manager/ManagerApproval" element={<ManagerAproval />} />
        <Route path="/Manager/approval" element={<ManagerAproval />} />

        <Route path="/Manager/MClientDetails" element={<MClientDetails />} />
        <Route path="/Manager/MAddClient" element={<MAddClient />} />
        <Route path="/Manager/ClientManage" element={<ClientManage />} />
        <Route path="/Manager/MDailyDues" element={<MDailyDues />} />
        <Route path="/Manager/MpaymentHistory" element={<MpaymentHistory />} />
        <Route path="/Admin/PendingClients" element={<PendingClients />} />
        <Route path="/Manager/MPendingClients" element={<MPendingClients />} />
        <Route path="/Manager/Acive-Inactive" element={<AciveInactive />} />


        <Route path="/AgentDashboard" element={<AgentDashboard />} />
        <Route path="/Admin/AddClient" element={<AddClient />} />
        <Route path="/DailyDues" element={<DailyDues />} />
        <Route path="/ClientDetails" element={<ClientDetails />} />
        <Route path="/ApaymentHistory" element={<ApaymentHistory />} />

      </Routes>
    </>
  );
};

const App = () => {
  return (
    <Router>
      <AppContent />
    </Router>
  );
};

export default App;