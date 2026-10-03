const express = require('express');
const router = express.Router();
const reflexController = require('../controllers/reflexController');
const authMiddleware = require('../middleware/authMiddleware');

// All reflex challenge routes are protected by JWT authentication
router.use(authMiddleware);

// Reflex Challenge Endpoints
router.get('/challenge', reflexController.getChallenge);
router.post('/start', reflexController.startChallenge);
router.post('/submit', reflexController.submitReaction);

module.exports = router;
