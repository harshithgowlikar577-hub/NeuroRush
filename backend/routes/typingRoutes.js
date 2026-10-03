const express = require('express');
const router = express.Router();
const typingController = require('../controllers/typingController');
const authMiddleware = require('../middleware/authMiddleware');

// All typing challenge routes are protected by JWT authentication
router.use(authMiddleware);

// Typing Challenge Endpoints
router.get('/challenge', typingController.getChallenge);
router.post('/submit', typingController.submitTyping);

module.exports = router;
