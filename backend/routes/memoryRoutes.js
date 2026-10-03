const express = require('express');
const router = express.Router();
const memoryController = require('../controllers/memoryController');
const authMiddleware = require('../middleware/authMiddleware');

// All memory challenge routes are protected by JWT authentication
router.use(authMiddleware);

// Memory Challenge Endpoints
router.get('/challenge', memoryController.getChallenge);
router.post('/submit', memoryController.submitChallenge);

module.exports = router;
