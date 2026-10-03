const crypto = require('crypto');
const db = require('../database/db');
const { SKILL_TYPES, DIFFICULTY_LEVELS } = require('../utils/skills');
const { getUserDifficulty } = require('./adaptiveController');

// In-memory active challenge store with 10-minute TTL
const activeChallenges = new Map();

// Helper to cleanup expired challenges (> 10 mins)
const cleanupExpiredChallenges = () => {
    const now = Date.now();
    for (const [id, challenge] of activeChallenges.entries()) {
        if (now - challenge.createdAt > 10 * 60 * 1000) {
            activeChallenges.delete(id);
        }
    }
};

/**
 * Generate a new Memory Challenge scaled to current adaptive difficulty
 * GET /api/memory/challenge
 */
const getChallenge = async (req, res) => {
    try {
        cleanupExpiredChallenges();
        const userId = req.user.user_id;

        // Fetch user's current adaptive difficulty for MEMORY
        const difficulty = await getUserDifficulty(userId, SKILL_TYPES.MEMORY);

        // Scale challenge parameters deterministically
        let patternLength = 5;
        let displayTimeMs = 3000;
        let colorPalette = ['RED', 'BLUE', 'GREEN', 'YELLOW', 'ORANGE', 'PURPLE'];

        if (difficulty === DIFFICULTY_LEVELS.EASY) {
            patternLength = 3;
            displayTimeMs = 4000;
            colorPalette = ['RED', 'BLUE', 'GREEN', 'YELLOW'];
        } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
            patternLength = 7;
            displayTimeMs = 2500;
        } else if (difficulty === DIFFICULTY_LEVELS.EXPERT) {
            patternLength = 9;
            displayTimeMs = 2000;
        }

        // 1. Generate randomized pattern
        const pattern = [];
        for (let i = 0; i < patternLength; i++) {
            const randomIndex = Math.floor(Math.random() * colorPalette.length);
            pattern.push(colorPalette[randomIndex]);
        }

        const challengeId = crypto.randomUUID();
        const createdAt = Date.now();

        // 2. Store active challenge in map linked to authenticated user
        activeChallenges.set(challengeId, {
            userId: userId,
            pattern: pattern,
            createdAt: createdAt,
            difficulty: difficulty
        });

        // 3. Return challenge data for user memorization
        return res.status(200).json({
            success: true,
            challenge_id: challengeId,
            difficulty: difficulty,
            pattern: pattern,
            pattern_length: patternLength,
            display_time_ms: displayTimeMs,
            options: colorPalette
        });

    } catch (error) {
        console.error('GetChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate memory challenge.'
        });
    }
};

/**
 * Submit Memory Challenge Answer
 * POST /api/memory/submit
 */
const submitChallenge = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { challenge_id, user_answer, time_taken } = req.body;

        // 1. Validation
        if (!challenge_id) {
            return res.status(400).json({
                success: false,
                message: 'Challenge ID is required.'
            });
        }

        if (!Array.isArray(user_answer)) {
            return res.status(400).json({
                success: false,
                message: 'User answer must be an array of pattern items.'
            });
        }

        const parsedTimeTaken = parseFloat(time_taken);
        if (isNaN(parsedTimeTaken) || parsedTimeTaken < 0) {
            return res.status(400).json({
                success: false,
                message: 'A valid non-negative time_taken (in seconds) is required.'
            });
        }

        // 2. Retrieve challenge
        const challenge = activeChallenges.get(challenge_id);
        if (!challenge) {
            return res.status(404).json({
                success: false,
                message: 'Challenge not found or has expired. Please request a new challenge.'
            });
        }

        // Verify challenge belongs to this authenticated user
        if (challenge.userId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: This challenge belongs to a different user.'
            });
        }

        const originalPattern = challenge.pattern;

        // 3. Deterministic Accuracy Calculation
        // Compare elements at matching index positions
        let matches = 0;
        const totalItems = originalPattern.length;

        for (let i = 0; i < totalItems; i++) {
            if (user_answer[i] && user_answer[i].toString().toUpperCase() === originalPattern[i]) {
                matches++;
            }
        }

        const rawAccuracy = (matches / totalItems) * 100;
        const accuracy = parseFloat(rawAccuracy.toFixed(2)); // e.g. 80.00

        // 4. Deterministic Scoring Algorithm
        // Accuracy Points: up to 800 points (accuracy% * 8)
        // Time Bonus: up to 200 points for completing under 10 seconds, scaled by accuracy
        const baseAccuracyScore = accuracy * 8; // Max 800
        const benchmarkSeconds = 10.0;
        let timeBonus = 0;

        if (parsedTimeTaken < benchmarkSeconds && accuracy > 0) {
            const timeDifference = benchmarkSeconds - parsedTimeTaken;
            const potentialBonus = Math.round(timeDifference * 20); // 10s difference = 200 pts
            timeBonus = Math.round(potentialBonus * (accuracy / 100));
        }

        const totalScore = Math.min(1000, Math.max(0, Math.round(baseAccuracyScore + timeBonus)));

        // Remove challenge to prevent replay submissions
        activeChallenges.delete(challenge_id);

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
                [sessionId, userId, totalScore]
            );

            // B. Create Skill Result Record (skill_type = 'MEMORY')
            const resultId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO skill_results (result_id, session_id, skill_type, score, accuracy, time_taken) 
                 VALUES (?, ?, 'MEMORY', ?, ?, ?)`,
                [resultId, sessionId, totalScore, accuracy, parsedTimeTaken]
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
            message: 'Memory challenge completed successfully',
            session_id: sessionId,
            skill_type: 'MEMORY',
            accuracy: accuracy,
            time_taken: parsedTimeTaken,
            score: totalScore
        });

    } catch (error) {
        console.error('SubmitChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during challenge submission.'
        });
    }
};

module.exports = {
    getChallenge,
    submitChallenge
};
