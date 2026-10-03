const crypto = require('crypto');
const db = require('../database/db');
const { SKILL_TYPES, DIFFICULTY_LEVELS } = require('../utils/skills');
const { getUserDifficulty } = require('./adaptiveController');

// In-memory active reflex challenge tracker with 5-minute TTL
const activeReflexChallenges = new Map();

// Default constants
const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const MAX_REACTION_TIME_MS = 5000;

// Cleanup expired challenges (> 5 minutes old)
const cleanupExpiredReflexChallenges = () => {
    const now = Date.now();
    for (const [id, challenge] of activeReflexChallenges.entries()) {
        if (now - challenge.createdAt > 5 * 60 * 1000) {
            activeReflexChallenges.delete(id);
        }
    }
};

/**
 * Initialize a new Reflex Challenge scaled to current adaptive difficulty
 * GET /api/reflex/challenge
 */
const getChallenge = async (req, res) => {
    try {
        cleanupExpiredReflexChallenges();

        const challengeId = crypto.randomUUID();
        const userId = req.user.user_id;

        // Fetch current adaptive difficulty for REFLEX
        const difficulty = await getUserDifficulty(userId, SKILL_TYPES.REFLEX);

        // Scale reaction window and delays
        let maxReactionTimeMs = 5000;
        let minDelayMs = 2000;
        let maxDelayMs = 5000;

        if (difficulty === DIFFICULTY_LEVELS.EASY) {
            maxReactionTimeMs = 6000;
            minDelayMs = 2000;
            maxDelayMs = 4000;
        } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
            maxReactionTimeMs = 3500;
            minDelayMs = 1500;
            maxDelayMs = 4500;
        } else if (difficulty === DIFFICULTY_LEVELS.EXPERT) {
            maxReactionTimeMs = 2500;
            minDelayMs = 1000;
            maxDelayMs = 4000;
        }

        activeReflexChallenges.set(challengeId, {
            userId,
            difficulty,
            maxReactionTimeMs,
            minDelayMs,
            maxDelayMs,
            state: 'INITIALIZED',
            createdAt: Date.now(),
            startTime: null,
            delayMs: null,
            triggerTime: null
        });

        return res.status(200).json({
            success: true,
            challenge_id: challengeId,
            difficulty,
            max_reaction_time_ms: maxReactionTimeMs,
            state: 'READY',
            message: 'Reflex challenge initialized. Call /api/reflex/start to begin.'
        });

    } catch (error) {
        console.error('GetReflexChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to initialize reflex challenge.'
        });
    }
};

/**
 * Start Reflex Challenge Timer & Generate Random Delay
 * POST /api/reflex/start
 */
const startChallenge = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { challenge_id } = req.body;

        if (!challenge_id) {
            return res.status(400).json({
                success: false,
                message: 'Challenge ID is required.'
            });
        }

        const challenge = activeReflexChallenges.get(challenge_id);
        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found or has expired. Please initialize a new challenge.'
            });
        }

        if (challenge.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: This challenge belongs to a different user.'
            });
        }

        // Generate unpredictable delay between 2000ms and 5000ms
        const delayMs = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
        const startTime = Date.now();
        const triggerTime = startTime + delayMs;

        challenge.state = 'WAITING';
        challenge.startTime = startTime;
        challenge.delayMs = delayMs;
        challenge.triggerTime = triggerTime;

        return res.status(200).json({
            success: true,
            challenge_id,
            state: 'WAITING',
            delay_ms: delayMs,
            message: 'WAIT... Trigger will appear after the delay. React immediately when it turns to CLICK NOW.'
        });

    } catch (error) {
        console.error('StartReflexChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to start reflex challenge.'
        });
    }
};

/**
 * Submit User Reaction & Evaluate Timing / Scoring
 * POST /api/reflex/submit
 */
const submitReaction = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { challenge_id, client_reaction_time_ms } = req.body;
        const submitTimestamp = Date.now();

        if (!challenge_id) {
            return res.status(400).json({
                success: false,
                message: 'Challenge ID is required.'
            });
        }

        const challenge = activeReflexChallenges.get(challenge_id);
        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found or has expired. Please request a new challenge.'
            });
        }

        if (challenge.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: This challenge belongs to a different user.'
            });
        }

        if (challenge.state !== 'WAITING') {
            return res.status(400).json({
                success: false,
                message: 'Challenge is not in active waiting state. Please start the challenge first.'
            });
        }

        // 1. Premature Click Detection
        // If user submitted before the trigger time
        if (submitTimestamp < challenge.triggerTime) {
            // Invalidate challenge to prevent repeated cheating attempts
            activeReflexChallenges.delete(challenge_id);

            return res.status(400).json({
                success: false,
                status: 'PREMATURE_CLICK',
                message: 'Too Early! You clicked before the trigger appeared. Challenge failed.'
            });
        }

        // 2. Measure Reaction Time
        // Compute reaction time based on server trigger timestamp
        let reactionTimeMs = submitTimestamp - challenge.triggerTime;

        // If client reported accurate measured local display reaction time,
        // use client time if within reasonable network transit tolerance (e.g. client <= server + 50ms)
        if (typeof client_reaction_time_ms === 'number' && client_reaction_time_ms > 0 && client_reaction_time_ms <= reactionTimeMs) {
            reactionTimeMs = Math.round(client_reaction_time_ms);
        }

        // Invalidate challenge to prevent replay submissions
        activeReflexChallenges.delete(challenge_id);

        // 3. Challenge Timeout Detection (> 5 seconds)
        if (reactionTimeMs > MAX_REACTION_TIME_MS) {
            return res.status(400).json({
                success: false,
                status: 'TIMEOUT',
                message: 'Challenge Timeout: Response exceeded 5000ms threshold.'
            });
        }

        // 4. Deterministic Scoring Algorithm
        // Benchmark scale:
        // <= 150ms: Perfect score (1000 points)
        // >= 1000ms: Baseline score (0 points)
        // Scaled linearly between 150ms and 1000ms:
        let score;
        if (reactionTimeMs <= 150) {
            score = 1000;
        } else if (reactionTimeMs >= 1000) {
            score = 0;
        } else {
            const rawScore = 1000 * (1 - (reactionTimeMs - 150) / 850);
            score = Math.max(0, Math.min(1000, Math.round(rawScore)));
        }

        // Accuracy for a valid on-time trigger response is 100.00%
        const accuracy = 100.00;
        const timeTakenSeconds = parseFloat((reactionTimeMs / 1000).toFixed(3));

        // 5. Database Persistence (MySQL Transaction)
        const connection = await db.getConnection();
        let sessionId;

        try {
            await connection.beginTransaction();

            // A. Create Session Record
            sessionId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO sessions (session_id, user_id, session_date, overall_score) 
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
                [sessionId, userId, score]
            );

            // B. Create Skill Result Record (skill_type = 'REFLEX')
            const resultId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO skill_results (result_id, session_id, skill_type, score, accuracy, time_taken) 
                 VALUES (?, ?, 'REFLEX', ?, ?, ?)`,
                [resultId, sessionId, score, accuracy, timeTakenSeconds]
            );

            // C. Enforce FIFO Queue Data Structure (15 max sessions) and synchronize user_statistics
            const { enforceSessionQueue } = require('../utils/sessionQueue');
            await enforceSessionQueue(userId, connection);

            await connection.commit();

            // Automatically evaluate achievements
            try {
                const { evaluateUserAchievements } = require('./achievementController');
                await evaluateUserAchievements(userId);
            } catch (achErr) {
                // Non-blocking notice
            }
        } catch (dbErr) {
            await connection.rollback();
            throw dbErr;
        } finally {
            connection.release();
        }

        // 6. Return response
        return res.status(201).json({
            success: true,
            message: 'Reflex challenge completed successfully',
            session_id: sessionId,
            skill_type: 'REFLEX',
            reaction_time: reactionTimeMs,
            accuracy: accuracy,
            score: score
        });

    } catch (error) {
        console.error('SubmitReflex Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during reflex submission.'
        });
    }
};

module.exports = {
    getChallenge,
    startChallenge,
    submitReaction
};
