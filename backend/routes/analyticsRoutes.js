const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const authMiddleware = require('../middleware/authMiddleware');

// All analytics endpoints are protected by JWT authentication
router.use(authMiddleware);

// Analytics API Endpoints
router.get('/overview', analyticsController.getOverview);
router.get('/skills', analyticsController.getSkillAnalytics);
router.get('/records', analyticsController.getPersonalRecords);
router.get('/history', analyticsController.getHistory);

module.exports = router;
