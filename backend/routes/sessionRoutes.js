const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');
const authMiddleware = require('../middleware/authMiddleware');

// All session aggregation routes are protected by JWT authentication
router.use(authMiddleware);

// Session History Endpoints
router.get('/history', sessionController.getSessionHistory);
router.get('/:sessionId', sessionController.getSessionById);

module.exports = router;
