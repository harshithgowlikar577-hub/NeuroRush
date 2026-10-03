const crypto = require('crypto');
const db = require('../database/db');
const { SKILL_TYPES, DIFFICULTY_LEVELS } = require('../utils/skills');
const { getUserDifficulty } = require('./adaptiveController');

// Distractor-Target pairs designed for selective visual attention
const ATTENTION_PAIRS = [
    { target: 'B', distractor: '8' },
    { target: '0', distractor: 'O' },
    { target: 'X', distractor: 'K' },
    { target: 'F', distractor: 'E' },
    { target: 'P', distractor: 'R' },
    { target: 'C', distractor: 'G' },
    { target: '5', distractor: 'S' }
];

const DEFAULT_GRID_ROWS = 5;
const DEFAULT_GRID_COLS = 5;

// In-memory active attention challenge store with 5-minute TTL
const activeAttentionChallenges = new Map();

// Cleanup expired challenges (> 5 minutes)
const cleanupExpiredAttentionChallenges = () => {
    const now = Date.now();
    for (const [id, challenge] of activeAttentionChallenges.entries()) {
        if (now - challenge.createdAt > 5 * 60 * 1000) {
            activeAttentionChallenges.delete(id);
        }
    }
};

/**
 * Generate a new Attention Challenge scaled to current adaptive difficulty
 * GET /api/attention/challenge
 */
const getChallenge = async (req, res) => {
    try {
        cleanupExpiredAttentionChallenges();

        const userId = req.user.user_id;

        // Fetch user's current adaptive difficulty for ATTENTION
        const difficulty = await getUserDifficulty(userId, SKILL_TYPES.ATTENTION);

        // Scale grid dimensions and distractors deterministically
        let rows = 5;
        let cols = 5;

        if (difficulty === DIFFICULTY_LEVELS.EASY) {
            rows = 3;
            cols = 3;
        } else if (difficulty === DIFFICULTY_LEVELS.HARD) {
            rows = 7;
            cols = 7;
        } else if (difficulty === DIFFICULTY_LEVELS.EXPERT) {
            rows = 9;
            cols = 9;
        }

        // 1. Pick a random character pair
        const pairIndex = Math.floor(Math.random() * ATTENTION_PAIRS.length);
        const { target, distractor } = ATTENTION_PAIRS[pairIndex];

        // 2. Pick a random position for the single target
        const targetRow = Math.floor(Math.random() * rows);
        const targetCol = Math.floor(Math.random() * cols);

        // 3. Construct grid filled with distractor, placing target at (targetRow, targetCol)
        const grid = [];
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                if (r === targetRow && c === targetCol) {
                    row.push(target);
                } else {
                    row.push(distractor);
                }
            }
            grid.push(row);
        }

        const challengeId = crypto.randomUUID();
        const startTime = Date.now();

        // 4. Save active challenge linked to authenticated user
        activeAttentionChallenges.set(challengeId, {
            userId,
            difficulty,
            rows,
            cols,
            target,
            distractor,
            targetRow,
            targetCol,
            startTime,
            createdAt: startTime
        });

        // 5. Return grid and target instructions
        return res.status(200).json({
            success: true,
            challenge_id: challengeId,
            difficulty: difficulty,
            target: target,
            distractor: distractor,
            grid: grid,
            dimensions: {
                rows: rows,
                cols: cols
            },
            instruction: `Find and select the target character '${target}' among the distractors.`
        });

    } catch (error) {
        console.error('GetAttentionChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate attention challenge.'
        });
    }
};

/**
 * Submit User Answer for Attention Challenge
 * POST /api/attention/submit
 */
const submitAnswer = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { challenge_id, selected_row, selected_col, time_taken } = req.body;
        const submitTime = Date.now();

        // 1. Input Validation
        if (!challenge_id) {
            return res.status(400).json({
                success: false,
                message: 'Challenge ID is required.'
            });
        }

        // 2. Retrieve active challenge
        const challenge = activeAttentionChallenges.get(challenge_id);
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

        const maxRows = challenge.rows || DEFAULT_GRID_ROWS;
        const maxCols = challenge.cols || DEFAULT_GRID_COLS;

        const row = parseInt(selected_row, 10);
        const col = parseInt(selected_col, 10);

        if (isNaN(row) || isNaN(col) || row < 0 || row >= maxRows || col < 0 || col >= maxCols) {
            return res.status(400).json({
                success: false,
                message: `Valid coordinates are required (row: 0-${maxRows - 1}, col: 0-${maxCols - 1}).`
            });
        }

        // Invalidate challenge to prevent replay
        activeAttentionChallenges.delete(challenge_id);

        // 3. Measure completion time in seconds
        let completionTime = (submitTime - challenge.startTime) / 1000;
        if (typeof time_taken === 'number' && time_taken > 0) {
            completionTime = parseFloat(time_taken.toFixed(3));
        } else {
            completionTime = parseFloat(completionTime.toFixed(3));
        }

        // 4. Target Validation & Deterministic Scoring
        const isCorrect = (row === challenge.targetRow && col === challenge.targetCol);
        let accuracy = 0.00;
        let score = 0;

        if (isCorrect) {
            accuracy = 100.00;

            // Base correct points: 600
            // Speed bonus: up to 400 points for completion under 10 seconds
            const basePoints = 600;
            const benchmarkSeconds = 10.0;
            let speedBonus = 0;

            if (completionTime < benchmarkSeconds) {
                const diff = benchmarkSeconds - completionTime;
                speedBonus = Math.round(diff * 40); // 10s difference = 400 pts
            }

            score = Math.min(1000, Math.max(100, Math.round(basePoints + speedBonus)));
        } else {
            accuracy = 0.00;
            score = 0;
        }

        // 5. Database Persistence (MySQL Transaction)
        const connection = await db.getConnection();
        let sessionId;

        try {
            await connection.beginTransaction();

            // A. Create Session Record (overall_score = attention score)
            sessionId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO sessions (session_id, user_id, session_date, overall_score) 
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
                [sessionId, userId, score]
            );

            // B. Create Skill Result Record (skill_type = 'ATTENTION')
            const resultId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO skill_results (result_id, session_id, skill_type, score, accuracy, time_taken) 
                 VALUES (?, ?, 'ATTENTION', ?, ?, ?)`,
                [resultId, sessionId, score, accuracy, completionTime]
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
            message: isCorrect ? 'Attention challenge completed successfully' : 'Incorrect target selected',
            session_id: sessionId,
            skill_type: 'ATTENTION',
            is_correct: isCorrect,
            accuracy: accuracy,
            time_taken: completionTime,
            score: score
        });

    } catch (error) {
        console.error('SubmitAttention Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during attention challenge submission.'
        });
    }
};

module.exports = {
    getChallenge,
    submitAnswer
};
