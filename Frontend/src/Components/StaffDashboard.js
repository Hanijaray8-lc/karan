import React from 'react';
import {
  Container,
  Grid,
  Paper,
  Typography,
  Box,
  Avatar,
  Card,
  CardContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress,
  Stack,
  Button,
  useTheme
} from '@mui/material';
import {
  TrendingUp,
  People,
  AccountBalance,
  Assignment,
  Payment,
  Dashboard as DashboardIcon,
  Person,
  Task,
  Receipt
} from '@mui/icons-material';

// Mock data for pending client payments (top small cards)
const pendingPayments = [
  { name: 'Nova x', amount: 1000.00, pending: 1000.00 },
  { name: 'm', amount: 10000.00, pending: 6400.00 },
  { name: 'Name', amount: 1000.00, pending: 560.00 },
];

// Recent communications table data
const recentCommunications = [
  { client: 'M', received: 1600.00, pending: 6400.00, date: 'Feb 13, 2026 09:29 AM', status: 'Pending' },
  { client: 'N', received: 140.00, pending: 560.00, date: 'Feb 13, 2026 09:28 AM', status: 'Pending' },
  { client: 'N', received: 200.00, pending: 800.00, date: 'Feb 13, 2026 09:26 AM', status: 'Pending' },
  { client: 'N', received: 200.00, pending: 800.00, date: 'Feb 12, 2026 11:09 AM', status: 'Pending' },
  { client: 'M', received: 2000.00, pending: 8000.00, date: 'Feb 12, 2026 11:01 AM', status: 'Pending' },
  { client: 'C', received: 44000.00, pending: 56000.00, date: 'Feb 12, 2026 09:54 AM', status: 'Pending' },
  { client: 'N', received: 1500.00, pending: 10845.00, date: 'Feb 12, 2026 09:28 AM', status: 'Pending' },
  { client: 'T', received: 1234.00, pending: 442766.00, date: 'Feb 11, 2026 10:48 AM', status: 'Pending' },
  { client: 'T', received: 111000.00, pending: 444000.00, date: 'Feb 11, 2026 10:47 AM', status: 'Pending' },
  { client: 'DC', received: 900.00, pending: 1596.00, date: 'Feb 11, 2026 10:45 AM', status: 'Pending' },
];

// Quick actions with progress values
const quickActions = [
  { label: 'Dashboard', icon: <DashboardIcon />, progress: null, pending: null, extra: null },
  { label: 'My Clients', icon: <Person />, progress: null, pending: '9 Pending', extra: null },
  { label: 'Tasks', icon: <Task />, progress: 44, pending: null, extra: '44% Remaining' },
  { label: 'Payment', icon: <Receipt />, progress: 0, pending: null, extra: '0% Remaining' },
  { label: null, icon: null, progress: 36, pending: null, extra: '36% Remaining' }, // standalone progress row in design
];

function StaffDashboard() {
  const theme = useTheme();

  return (
    <Box sx={{ bgcolor: '#f5f7fa', minHeight: '100vh', py: 3 }}>
      <Container maxWidth="xl">
        {/* Header with welcome back */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h4" fontWeight="bold">
            Welcome back, Nareshi!
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Last updated: Today, 11:45 AM
          </Typography>
        </Box>

        {/* Top metric cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {/* My Clients */}
          <Grid item xs={12} md={3}>
            <Paper elevation={1} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">MY CLIENTS</Typography>
                <Typography variant="h3" fontWeight="bold">7</Typography>
                <Typography variant="caption" color="text.secondary">Total assigned clients</Typography>
              </Box>
              <Avatar sx={{ bgcolor: '#e8f0fe', color: '#1a4fc3', width: 56, height: 56 }}>
                <People />
              </Avatar>
            </Paper>
          </Grid>

          {/* Managed Loans */}
          <Grid item xs={12} md={3}>
            <Paper elevation={1} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">MANAGED LOANS</Typography>
                <Typography variant="h5" fontWeight="bold">₹1,701,656</Typography>
                <Typography variant="caption" color="text.secondary">Total loan amount</Typography>
              </Box>
              <Avatar sx={{ bgcolor: '#e8f0fe', color: '#1a4fc3', width: 56, height: 56 }}>
                <AccountBalance />
              </Avatar>
            </Paper>
          </Grid>

          {/* Collected Amount */}
          <Grid item xs={12} md={3}>
            <Paper elevation={1} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">COLLECTED</Typography>
                <Typography variant="h5" fontWeight="bold">₹5,065,378</Typography>
                <Typography variant="caption" color="text.secondary">Total Collected</Typography>
              </Box>
              <Avatar sx={{ bgcolor: '#e8f0fe', color: '#1a4fc3', width: 56, height: 56 }}>
                <TrendingUp />
              </Avatar>
            </Paper>
          </Grid>

          {/* Today Pending */}
          <Grid item xs={12} md={3}>
            <Paper elevation={1} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="body2" color="text.secondary">TODAY PENDING</Typography>
                <Typography variant="h5" fontWeight="bold">₹0</Typography>
                <Typography variant="caption" color="text.secondary">Today Pending</Typography>
              </Box>
              <Avatar sx={{ bgcolor: '#e8f0fe', color: '#1a4fc3', width: 56, height: 56 }}>
                <Payment />
              </Avatar>
            </Paper>
          </Grid>
        </Grid>

        {/* Monthly collection progress and overall status */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Monthly Collection Progress</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography><strong>Collected Amount:</strong> ₹0</Typography>
                <Typography><strong>Pending Amount:</strong> ₹0</Typography>
              </Box>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body1"><strong>Overall Status:</strong></Typography>
                <Chip label="298%" color="success" sx={{ fontWeight: 'bold', fontSize: '1.2rem', bgcolor: '#2e7d32', color: 'white' }} />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Updated today</Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Pending client payments mini cards */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>Pending Client Payments</Typography>
              <Stack spacing={2}>
                {pendingPayments.map((item, idx) => (
                  <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', bgcolor: '#f9f9f9', p: 1.5, borderRadius: 1 }}>
                    <Typography><strong>{item.name}</strong> ₹{item.amount.toFixed(2)}</Typography>
                    <Typography color="error.main">Pending: ₹{item.pending.toFixed(2)}</Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        {/* Recent Client Communications Table */}
        <Paper sx={{ p: 3, mb: 4 }}>
          <Typography variant="h6" gutterBottom>Recent Client Communications</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f0f2f5' }}>
                  <TableCell><strong>Client</strong></TableCell>
                  <TableCell align="right"><strong>Amount Received</strong></TableCell>
                  <TableCell align="right"><strong>Pending Amount</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recentCommunications.map((row, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{row.client}</TableCell>
                    <TableCell align="right">₹{row.received.toLocaleString()}</TableCell>
                    <TableCell align="right">₹{row.pending.toLocaleString()}</TableCell>
                    <TableCell>{row.date}</TableCell>
                    <TableCell>
                      <Chip label={row.status} size="small" color="warning" variant="outlined" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Quick Actions with progress bars */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>Quick Actions</Typography>
          <Grid container spacing={2} alignItems="center">
            {/* Dashboard */}
            <Grid item xs={6} sm={2}>
              <Button variant="outlined" startIcon={<DashboardIcon />} fullWidth sx={{ justifyContent: 'flex-start' }}>Dashboard</Button>
            </Grid>
            {/* My Clients with pending badge */}
            <Grid item xs={6} sm={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button variant="outlined" startIcon={<Person />} fullWidth sx={{ justifyContent: 'flex-start' }}>My Clients</Button>
                <Chip label="9 Pending" size="small" color="error" />
              </Box>
            </Grid>
            {/* Tasks with progress */}
            <Grid item xs={6} sm={2}>
              <Box>
                <Button variant="outlined" startIcon={<Task />} fullWidth sx={{ justifyContent: 'flex-start', mb: 0.5 }}>Tasks</Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress variant="determinate" value={44} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
                  <Typography variant="caption">44% Remaining</Typography>
                </Box>
              </Box>
            </Grid>
            {/* Payment with progress */}
            <Grid item xs={6} sm={2}>
              <Box>
                <Button variant="outlined" startIcon={<Receipt />} fullWidth sx={{ justifyContent: 'flex-start', mb: 0.5 }}>Payment</Button>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LinearProgress variant="determinate" value={0} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
                  <Typography variant="caption">0% Remaining</Typography>
                </Box>
              </Box>
            </Grid>
            {/* Extra standalone progress (36%) */}
            <Grid item xs={12} sm={2}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: { xs: 1, sm: 0 } }}>
                <LinearProgress variant="determinate" value={36} sx={{ flexGrow: 1, height: 8, borderRadius: 4 }} />
                <Typography variant="caption">36% Remaining</Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 4, textAlign: 'center', color: 'text.secondary', typography: 'body2' }}>
          © 2026 LoanFlow Dashboard. All rights reserved. | Last updated: Today, 11:45 AM
        </Box>
      </Container>
    </Box>
  );
}

export default StaffDashboard;