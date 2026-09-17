const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Auth routes
router.post('/login', authController.login);
router.post('/face-login', authController.faceLogin);
router.get('/check-status', protect, authController.checkStatus);
router.post('/logout', protect, authController.logout);

module.exports = router;