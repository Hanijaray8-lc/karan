// routes/agentRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAgents,
  createAgent,
  approveAgent,
  rejectAgent,
  updateAgentStatus,
  getPendingApprovals,
  updateAgent,
  deleteAgent,
  getAgentById,
  getAgentsByDepartment,
  getAgentStats,
  resetAgentPassword
} = require('../controllers/agentController');

const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');

// All agent routes require authentication
router.use(protect);

// Admin and manager can view agents, only admin can create
router.route('/')
  .get(authorize('admin', 'manager'), getAgents)
  .post(authorize('admin'), upload.single('profilePhoto'), createAgent);

router.get('/stats', authorize('admin', 'manager'), getAgentStats);
router.get('/department/:dept', authorize('admin', 'manager'), getAgentsByDepartment);

// Pending approvals queue & login attempt alerts (Admin & Manager)
router.get('/pending-approvals', authorize('admin', 'manager'), getPendingApprovals);

// Approval actions (Admin & Manager)
router.put('/:id/approve', authorize('admin', 'manager'), approveAgent);
router.put('/:id/reject', authorize('admin', 'manager'), rejectAgent);
router.put('/:id/status', authorize('admin', 'manager'), updateAgentStatus);

// Admin or agent can view, only admin can modify
router.route('/:id')
  .get(authorize('admin', 'agent'), getAgentById)
  .put(authorize('admin'), upload.single('profilePhoto'), updateAgent)
  .delete(authorize('admin'), deleteAgent);

// Reset password endpoint (admin)
router.post('/:id/reset-password', authorize('admin'), resetAgentPassword);

module.exports = router;