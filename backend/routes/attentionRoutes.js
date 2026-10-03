const express = require('express');
const router = express.Router();
const attentionController = require('../controllers/attentionController');
const authMiddleware = require('../middleware/authMiddleware');

// All attention challenge routes are protected by JWT authentication
router.use(authMiddleware);

// Attention Challenge Endpoints
router.get('/challenge', attentionController.getChallenge);
router.post('/submit', attentionController.submitAnswer);

module.exports = router;
