const crypto = require('crypto');
const db = require('../database/db');
const { REQUIRED_SKILLS, SKILL_TYPES } = require('../utils/skills');

/**
 * Retrieve a Completed Session Summary by ID
 * GET /api/session/:sessionId
 */
const getSessionById = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const { sessionId } = req.params;

        // Query session
        const [sessions] = await db.query(
            'SELECT session_id, user_id, session_date, overall_score FROM sessions WHERE session_id = ?',
            [sessionId]
        );

        if (sessions.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Session not found.'
            });
        }

        const session = sessions[0];

        // Security check: Verify session belongs to authenticated user
        if (session.user_id !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Access to this session is forbidden.'
            });
        }

        // Retrieve skill results for this session
        const [skillRows] = await db.query(
            'SELECT skill_type, score, accuracy, time_taken FROM skill_results WHERE session_id = ?',
            [sessionId]
        );

        // Map skill scores
        const skills = {
            memory_score: null,
            reflex_score: null,
            attention_score: null,
            typing_score: null
        };

        for (const row of skillRows) {
            if (row.skill_type === SKILL_TYPES.MEMORY) skills.memory_score = row.score;
            if (row.skill_type === SKILL_TYPES.REFLEX) skills.reflex_score = row.score;
            if (row.skill_type === SKILL_TYPES.ATTENTION) skills.attention_score = row.score;
            if (row.skill_type === SKILL_TYPES.TYPING) skills.typing_score = row.score;
        }

        return res.status(200).json({
            success: true,
            session_id: session.session_id,
            overall_score: session.overall_score,
            session_date: session.session_date,
            skills
        });

    } catch (error) {
        console.error('GetSessionById Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving session.'
        });
    }
};

/**
 * Retrieve Completed Sessions History
 * GET /api/session/history
 */
const getSessionHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const [sessions] = await db.query(
            `SELECT session_id, overall_score, session_date 
             FROM sessions 
             WHERE user_id = ? 
             ORDER BY session_date DESC
             LIMIT 15`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            total: sessions.length,
            sessions: sessions
        });

    } catch (error) {
        console.error('GetSessionHistory Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving session history.'
        });
    }
};

module.exports = {
    getSessionById,
    getSessionHistory
};
