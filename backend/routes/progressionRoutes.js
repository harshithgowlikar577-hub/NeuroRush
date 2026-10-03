const express = require('express');
const router = express.Router();
const progressionController = require('../controllers/progressionController');
const authMiddleware = require('../middleware/authMiddleware');

// All progression routes are protected by JWT authentication
router.use(authMiddleware);

// Progression Endpoints
router.get('/status', progressionController.getProgressionStatus);
router.post('/evaluate', progressionController.evaluateProgression);
router.post('/reset', progressionController.resetSkillProgression);
router.post('/reset-all', progressionController.resetAllProgression);

module.exports = router;
