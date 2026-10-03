const db = require('../database/db');
const { REQUIRED_SKILLS, SKILL_TYPES } = require('../utils/skills');

// Minimum score required to unlock the next level
const UNLOCK_SCORE_THRESHOLD = 700;

/**
 * Helper to ensure default progression rows exist for a user in MySQL
 * @param {string} userId
 */
const ensureUserProgression = async (userId) => {
    for (const skill of REQUIRED_SKILLS) {
        await db.query(
            `INSERT IGNORE INTO user_progression (user_id, skill_type, current_level, unlocked_level, highest_completed_level) 
             VALUES (?, ?, 1, 1, 0)`,
            [userId, skill]
        );
    }
};

/**
 * Retrieve Progression Status for Authenticated User
 * GET /api/progression/status
 */
const getProgressionStatus = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Ensure rows exist in MySQL
        await ensureUserProgression(userId);

        const [rows] = await db.query(
            `SELECT skill_type, current_level, unlocked_level, highest_completed_level 
             FROM user_progression 
             WHERE user_id = ?`,
            [userId]
        );

        const progression = {};
        for (const row of rows) {
            progression[row.skill_type] = {
                current_level: row.current_level,
                unlocked_level: row.unlocked_level,
                highest_completed_level: row.highest_completed_level
            };
        }

        return res.status(200).json({
            success: true,
            progression
        });

    } catch (error) {
        console.error('GetProgressionStatus Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving progression status.'
        });
    }
};

/**
 * Evaluate Challenge Performance and Unlock Next Level
 * POST /api/progression/evaluate
 */
const evaluateProgression = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { skill_type } = req.body;

        // 1. Validation
        if (!skill_type || !REQUIRED_SKILLS.includes(skill_type)) {
            return res.status(400).json({
                success: false,
                message: `Valid skill_type (${REQUIRED_SKILLS.join(', ')}) is required.`
            });
        }

        await ensureUserProgression(userId);

        // 2. Fetch the user's latest challenge result for this skill
        const [results] = await db.query(
            `SELECT r.result_id, r.score, r.accuracy, s.session_id, s.session_date 
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ? AND r.skill_type = ?
             ORDER BY s.session_date DESC 
             LIMIT 1`,
            [userId, skill_type]
        );

        if (results.length === 0) {
            return res.status(400).json({
                success: false,
                unlocked: false,
                reason: `No completed challenge found for ${skill_type}. Complete a challenge first.`
            });
        }

        const latestResult = results[0];

        // 3. Fetch current progression state
        const [progRows] = await db.query(
            `SELECT current_level, unlocked_level, highest_completed_level, last_session_id 
             FROM user_progression 
             WHERE user_id = ? AND skill_type = ?`,
            [userId, skill_type]
        );

        const currentProg = progRows[0];

        // Check if this specific session was already evaluated for an unlock
        if (currentProg.last_session_id && currentProg.last_session_id === latestResult.session_id) {
            return res.status(200).json({
                success: true,
                unlocked: false,
                skill_type: skill_type,
                current_level: currentProg.current_level,
                reason: 'Level already unlocked with this session. Complete a new challenge at your current level to advance.'
            });
        }

        // 4. Deterministic Unlock Evaluation
        // Criterion: Challenge completed AND Achieved Score >= 700 points
        if (latestResult.score >= UNLOCK_SCORE_THRESHOLD) {
            const newHighest = currentProg.current_level;
            const newUnlocked = currentProg.current_level + 1;
            const newCurrent = newUnlocked;

            // Update MySQL permanently
            await db.query(
                `UPDATE user_progression 
                 SET highest_completed_level = ?, unlocked_level = ?, current_level = ?, last_session_id = ? 
                 WHERE user_id = ? AND skill_type = ?`,
                [newHighest, newUnlocked, newCurrent, latestResult.session_id, userId, skill_type]
            );

            return res.status(200).json({
                success: true,
                unlocked: true,
                skill_type: skill_type,
                new_level: newCurrent,
                achieved_score: latestResult.score,
                required_score: UNLOCK_SCORE_THRESHOLD,
                message: `New Challenge Unlocked! Advanced to Level ${newCurrent} in ${skill_type}.`
            });
        } else {
            return res.status(200).json({
                success: true,
                unlocked: false,
                skill_type: skill_type,
                current_level: currentProg.current_level,
                achieved_score: latestResult.score,
                required_score: UNLOCK_SCORE_THRESHOLD,
                reason: `Required score of ${UNLOCK_SCORE_THRESHOLD} not reached. Achieved score: ${latestResult.score}.`
            });
        }

    } catch (error) {
        console.error('EvaluateProgression Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during progression evaluation.'
        });
    }
};

/**
 * Reset progression and history for an individual skill domain
 * POST /api/progression/reset
 */
const resetSkillProgression = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const userId = req.user.user_id;
        const { skill_type } = req.body;

        if (!skill_type || !REQUIRED_SKILLS.includes(skill_type)) {
            return res.status(400).json({
                success: false,
                message: `Valid skill_type (${REQUIRED_SKILLS.join(', ')}) is required.`
            });
        }

        await connection.beginTransaction();

        // 1. Reset user_progression row to Level 1
        await connection.query(
            `UPDATE user_progression 
             SET current_level = 1, unlocked_level = 1, highest_completed_level = 0, last_session_id = NULL 
             WHERE user_id = ? AND skill_type = ?`,
            [userId, skill_type]
        );

        // 2. Reset adaptive difficulty for this skill
        try {
            await connection.query(
                `UPDATE user_difficulty 
                 SET current_difficulty = 'MEDIUM', consecutive_successes = 0, consecutive_failures = 0 
                 WHERE user_id = ? AND skill_type = ?`,
                [userId, skill_type]
            );
        } catch (e) {
            // Ignore if table not present
        }

        // 3. Delete skill_results for this skill belonging to this user
        await connection.query(
            `DELETE r FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ? AND r.skill_type = ?`,
            [userId, skill_type]
        );

        // 4. Delete orphaned sessions (sessions that have no skill results left)
        await connection.query(
            `DELETE s FROM sessions s
             LEFT JOIN skill_results r ON s.session_id = r.session_id
             WHERE s.user_id = ? AND r.result_id IS NULL`,
            [userId]
        );

        // 5. Synchronize user_statistics and session queue
        const { enforceSessionQueue } = require('../utils/sessionQueue');
        await enforceSessionQueue(userId, connection);

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: `Progression and history for ${skill_type} reset to Level 1 successfully.`,
            skill_type,
            level: 1
        });
    } catch (error) {
        await connection.rollback();
        console.error('ResetSkillProgression Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while resetting skill progression.'
        });
    } finally {
        connection.release();
    }
};

/**
 * Global Reset: Wipes all challenge progress, analytics, statistics, history, scores, and rankings
 * POST /api/progression/reset-all
 */
const resetAllProgression = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const userId = req.user.user_id;

        await connection.beginTransaction();

        // 1. Delete all sessions for this user (cascades to all skill_results via foreign key)
        await connection.query(
            'DELETE FROM sessions WHERE user_id = ?',
            [userId]
        );

        // 2. Reset user_statistics record
        await connection.query(
            `UPDATE user_statistics 
             SET total_sessions = 0, best_score = 0, avg_score = 0.00 
             WHERE user_id = ?`,
            [userId]
        );

        // 3. Reset all user_progression rows to Level 1
        await connection.query(
            `UPDATE user_progression 
             SET current_level = 1, unlocked_level = 1, highest_completed_level = 0, last_session_id = NULL 
             WHERE user_id = ?`,
            [userId]
        );

        // 4. Reset adaptive difficulty
        try {
            await connection.query(
                `UPDATE user_difficulty 
                 SET current_difficulty = 'MEDIUM', consecutive_successes = 0, consecutive_failures = 0 
                 WHERE user_id = ?`,
                [userId]
            );
        } catch (e) {}

        // 5. Remove earned achievements for complete account restart
        try {
            await connection.query(
                'DELETE FROM user_achievements WHERE user_id = ?',
                [userId]
            );
        } catch (e) {}

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'All NeuroRush challenge progress, statistics, history, and achievements have been reset successfully.'
        });
    } catch (error) {
        await connection.rollback();
        console.error('ResetAllProgression Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during global progress reset.'
        });
    } finally {
        connection.release();
    }
};

module.exports = {
    getProgressionStatus,
    evaluateProgression,
    resetSkillProgression,
    resetAllProgression,
    ensureUserProgression
};
