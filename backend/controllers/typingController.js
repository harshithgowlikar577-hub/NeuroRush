const crypto = require('crypto');
const db = require('../database/db');
const { SKILL_TYPES, DIFFICULTY_LEVELS } = require('../utils/skills');
const { getUserDifficulty } = require('./adaptiveController');

// Curated bank of passages grouped by difficulty
const PARAGRAPH_BANKS = {
    [DIFFICULTY_LEVELS.EASY]: [
        "The quick brown fox jumps over the lazy dog.",
        "Practice makes progress in every cognitive skill.",
        "Clear minds learn new concepts with ease."
    ],
    [DIFFICULTY_LEVELS.MEDIUM]: [
        "Practice and focus are the keys to building strong cognitive speed.",
        "Clean code and clear logic make software maintainable and scalable.",
        "Memory and attention work together to process information quickly."
    ],
    [DIFFICULTY_LEVELS.HARD]: [
        "Consistent daily training improves pattern recall, reaction times, and sharpens analytical mental clarity under pressure.",
        "Technology and science continue to reshape how humans learn, communicate, and solve intricate engineering problems."
    ],
    [DIFFICULTY_LEVELS.EXPERT]: [
        "NeuroRush measures cognitive throughput across multiple distinct domains; sustained focus, motor inhibition, and error-free execution are essential for top-tier performance.",
        "Algorithmic efficiency and architectural discipline eliminate redundant layers, ensuring low-latency database transactions and optimal user interaction."
    ]
};

// In-memory active typing challenge store with 10-minute TTL
const activeTypingChallenges = new Map();

// Cleanup expired challenges (> 10 minutes)
const cleanupExpiredTypingChallenges = () => {
    const now = Date.now();
    for (const [id, challenge] of activeTypingChallenges.entries()) {
        if (now - challenge.createdAt > 10 * 60 * 1000) {
            activeTypingChallenges.delete(id);
        }
    }
};

/**
 * Generate a new Typing Challenge scaled to current adaptive difficulty
 * GET /api/typing/challenge
 */
const getChallenge = async (req, res) => {
    try {
        cleanupExpiredTypingChallenges();

        const userId = req.user.user_id;

        // Fetch user's current adaptive difficulty for TYPING
        const difficulty = await getUserDifficulty(userId, SKILL_TYPES.TYPING);
        const bank = PARAGRAPH_BANKS[difficulty] || PARAGRAPH_BANKS[DIFFICULTY_LEVELS.MEDIUM];

        // Select a random paragraph from the difficulty bank
        const randomIndex = Math.floor(Math.random() * bank.length);
        const paragraph = bank[randomIndex];

        const challengeId = crypto.randomUUID();
        const startTime = Date.now();

        // Save active challenge linked to user
        activeTypingChallenges.set(challengeId, {
            userId,
            difficulty,
            paragraph,
            startTime,
            createdAt: startTime
        });

        const wordCount = paragraph.trim().split(/\s+/).length;

        return res.status(200).json({
            success: true,
            challenge_id: challengeId,
            difficulty: difficulty,
            paragraph: paragraph,
            character_count: paragraph.length,
            word_count: wordCount,
            instruction: "Type the paragraph exactly as displayed and submit when finished."
        });

    } catch (error) {
        console.error('GetTypingChallenge Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate typing challenge.'
        });
    }
};

/**
 * Submit User Typed Text & Evaluate WPM, Accuracy, Errors, and Score
 * POST /api/typing/submit
 */
const submitTyping = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { challenge_id, typed_text, time_taken } = req.body;
        const submitTimestamp = Date.now();

        // 1. Validation
        if (!challenge_id) {
            return res.status(400).json({
                success: false,
                message: 'Challenge ID is required.'
            });
        }

        if (typeof typed_text !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Typed text must be provided as a string.'
            });
        }

        if (typed_text.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Typed text cannot be empty.'
            });
        }

        // 2. Retrieve active challenge
        const challenge = activeTypingChallenges.get(challenge_id);
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

        // Invalidate challenge to prevent replay submissions
        activeTypingChallenges.delete(challenge_id);

        // 3. Compute duration in seconds (minimum 0.5s to prevent division by zero)
        let durationSeconds = (submitTimestamp - challenge.startTime) / 1000;
        if (typeof time_taken === 'number' && time_taken > 0) {
            durationSeconds = parseFloat(time_taken.toFixed(3));
        } else {
            durationSeconds = parseFloat(durationSeconds.toFixed(3));
        }

        if (durationSeconds < 0.5) {
            durationSeconds = 0.5;
        }

        const targetText = challenge.paragraph;
        const targetLen = targetText.length;
        const typedLen = typed_text.length;

        // 4. Character-by-character Accuracy and Error Analysis
        let correctChars = 0;
        let wrongChars = 0;
        const compareLimit = Math.min(targetLen, typedLen);

        for (let i = 0; i < compareLimit; i++) {
            if (typed_text[i] === targetText[i]) {
                correctChars++;
            } else {
                wrongChars++;
            }
        }

        const missingChars = Math.max(0, targetLen - typedLen);
        const extraChars = Math.max(0, typedLen - targetLen);
        const totalErrors = wrongChars + missingChars + extraChars;

        // Accuracy Percentage = (Correct Characters / Total Target Characters) * 100
        const rawAccuracy = (correctChars / targetLen) * 100;
        const accuracy = parseFloat(Math.max(0, Math.min(100, rawAccuracy)).toFixed(2));

        // 5. Standard WPM Calculation
        // WPM = (Total Typed Characters ÷ 5) ÷ Minutes Taken
        const minutesTaken = durationSeconds / 60.0;
        const rawWpm = (typedLen / 5) / minutesTaken;
        const wpm = parseFloat(rawWpm.toFixed(2));

        // 6. Deterministic Scoring Algorithm
        // Accuracy component: up to 500 points (accuracy% * 5)
        // Speed component: up to 500 points (benchmark 80 WPM = 500 points, i.e., WPM * 6.25)
        // Error penalty: 10 points per error
        const accuracyPoints = accuracy * 5; // Max 500
        const speedPoints = Math.min(500, Math.round(wpm * 6.25)); // Max 500
        const errorPenalty = totalErrors * 10;

        let totalScore = Math.round(accuracyPoints + speedPoints - errorPenalty);
        if (accuracy === 0) {
            totalScore = 0;
        }
        totalScore = Math.max(0, Math.min(1000, totalScore));

        // 7. Database Persistence (MySQL Transaction)
        const connection = await db.getConnection();
        let sessionId;

        try {
            await connection.beginTransaction();

            // A. Create Session Record (overall_score = typing score)
            sessionId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO sessions (session_id, user_id, session_date, overall_score) 
                 VALUES (?, ?, CURRENT_TIMESTAMP, ?)`,
                [sessionId, userId, totalScore]
            );

            // B. Create Skill Result Record (skill_type = 'TYPING')
            const resultId = crypto.randomUUID();
            await connection.query(
                `INSERT INTO skill_results (result_id, session_id, skill_type, score, accuracy, time_taken) 
                 VALUES (?, ?, 'TYPING', ?, ?, ?)`,
                [resultId, sessionId, totalScore, accuracy, durationSeconds]
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

        // 8. Return response
        return res.status(201).json({
            success: true,
            message: 'Typing challenge completed successfully',
            session_id: sessionId,
            skill_type: 'TYPING',
            wpm: wpm,
            accuracy: accuracy,
            errors: totalErrors,
            score: totalScore,
            time_taken: durationSeconds
        });

    } catch (error) {
        console.error('SubmitTyping Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during typing challenge submission.'
        });
    }
};

module.exports = {
    getChallenge,
    submitTyping
};
