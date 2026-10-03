const express = require('express');
const router = express.Router();
const leaderboardController = require('../controllers/leaderboardController');
const authMiddleware = require('../middleware/authMiddleware');

// All leaderboard endpoints are protected by JWT authentication
router.use(authMiddleware);

// Leaderboard API Endpoints
router.get('/global', leaderboardController.getGlobalLeaderboard);
router.get('/memory', leaderboardController.getMemoryLeaderboard);
router.get('/reflex', leaderboardController.getReflexLeaderboard);
router.get('/attention', leaderboardController.getAttentionLeaderboard);
router.get('/typing', leaderboardController.getTypingLeaderboard);

module.exports = router;
