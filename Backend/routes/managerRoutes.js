// routes/managerRoutes.js
const express = require('express');
const router = express.Router();
const {
  getManagers,
  createManager,
  updateManager,
  deleteManager,
  getManagerById,
  getManagerStats
} = require('../controllers/managerController');

const { protect, authorize } = require('../middleware/auth');

// All routes are protected and only admin can access
router.use(protect);
router.use(authorize('admin'));

// Manager routes
router.route('/')
  .get(getManagers)
  .post(createManager);

router.get('/stats', getManagerStats);

router.route('/:id')
  .get(getManagerById)
  .put(updateManager)
  .delete(deleteManager);

module.exports = router;