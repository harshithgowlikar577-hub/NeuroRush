const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const authMiddleware = require('../middleware/authMiddleware');

// All profile endpoints are protected by JWT authentication middleware
router.use(authMiddleware);

// Profile endpoints
router.get('/', profileController.getProfile);
router.get('/dashboard', profileController.getDashboardSummary);
router.get('/sessions', profileController.getSessionHistory);
router.get('/records', profileController.getPersonalRecords);

module.exports = router;
