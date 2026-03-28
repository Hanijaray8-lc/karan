// routes/agentRoutes.js
const express = require('express');
const router = express.Router();
const {
  getAgents,
  createAgent,
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

// Admin and manager can view agents, only admin can create/modify
router.route('/')
  .get(authorize('admin', 'manager'), getAgents)
  .post(authorize('admin'), upload.single('profilePhoto'), createAgent);

router.get('/stats', authorize('admin'), getAgentStats);
router.get('/department/:dept', authorize('admin'), getAgentsByDepartment);

// Admin or agent can view, only admin can modify
router.route('/:id')
  .get(authorize('admin', 'agent'), getAgentById)
  .put(authorize('admin'), upload.single('profilePhoto'), updateAgent)
  .delete(authorize('admin'), deleteAgent);

// Reset password endpoint (admin)
router.post('/:id/reset-password', authorize('admin'), resetAgentPassword);

module.exports = router;