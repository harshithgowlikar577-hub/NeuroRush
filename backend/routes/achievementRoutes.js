const express = require('express');
const router = express.Router();
const achievementController = require('../controllers/achievementController');
const authMiddleware = require('../middleware/authMiddleware');

// All achievement endpoints are protected by JWT authentication
router.use(authMiddleware);

// Achievement API Endpoints
router.get('/', achievementController.getEarnedAchievements);
router.get('/progress', achievementController.getAchievementProgress);
router.post('/evaluate', achievementController.evaluateAchievements);

module.exports = router;
