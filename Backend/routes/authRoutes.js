const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// This will now use the logic that checks both Admin and Agent tables
router.post('/login', authController.login);

module.exports = router;