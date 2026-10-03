const express = require('express');
const router = express.Router();
const adaptiveController = require('../controllers/adaptiveController');
const authMiddleware = require('../middleware/authMiddleware');

// All adaptive difficulty routes are protected by JWT authentication
router.use(authMiddleware);

// Adaptive Difficulty Endpoints
router.get('/status', adaptiveController.getAdaptiveStatus);
router.post('/evaluate', adaptiveController.evaluateDifficulty);

module.exports = router;
