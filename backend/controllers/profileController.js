const db = require('../database/db');

/**
 * Get Authenticated User Profile
 * GET /api/profile
 */
const getProfile = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Query user info and aggregated statistics via LEFT JOIN
        const [rows] = await db.query(
            `SELECT 
                u.user_id,
                u.username,
                u.email,
                u.created_at,
                COALESCE(s.total_sessions, 0) AS total_sessions,
                COALESCE(s.best_score, 0) AS best_score,
                COALESCE(s.avg_score, 0.00) AS avg_score
            FROM users u
            LEFT JOIN user_statistics s ON u.user_id = s.user_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User profile not found.'
            });
        }

        const profile = rows[0];

        // Retrieve current skill progression levels from MySQL
        const [progRows] = await db.query(
            'SELECT skill_type, current_level FROM user_progression WHERE user_id = ?',
            [userId]
        );
        const progMap = new Map();
        for (const pr of progRows) {
            progMap.set(pr.skill_type, pr.current_level);
        }

        // Retrieve user earned achievements from MySQL
        const [achRows] = await db.query(
            `SELECT a.title, a.description, ua.earned_date 
             FROM user_achievements ua
             JOIN achievements a ON ua.achievement_id = a.achievement_id
             WHERE ua.user_id = ?
             ORDER BY ua.earned_date DESC`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            user_id: profile.user_id,
            username: profile.username,
            email: profile.email,
            created_at: profile.created_at,
            total_sessions: Number(profile.total_sessions),
            best_score: Number(profile.best_score),
            avg_score: Number(profile.avg_score),
            progression: {
                memory_level: progMap.get('MEMORY') || 1,
                reflex_level: progMap.get('REFLEX') || 1,
                attention_level: progMap.get('ATTENTION') || 1,
                typing_level: progMap.get('TYPING') || 1
            },
            achievements: {
                achievement_count: achRows.length,
                latest_achievement: achRows.length > 0 ? achRows[0] : null,
                earned_list: achRows
            }
        });

    } catch (error) {
        console.error('GetProfile Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving user profile.'
        });
    }
};

/**
 * Get Dashboard Summary
 * GET /api/profile/dashboard
 */
const getDashboardSummary = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // 1. Fetch user & stats
        const [userRows] = await db.query(
            `SELECT 
                u.username,
                u.created_at AS join_date,
                COALESCE(s.total_sessions, 0) AS total_sessions,
                COALESCE(s.best_score, 0) AS best_score,
                COALESCE(s.avg_score, 0.00) AS avg_score
            FROM users u
            LEFT JOIN user_statistics s ON u.user_id = s.user_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        const userInfo = userRows[0];

        // 2. Fetch up to 5 most recent sessions
        const [recentSessions] = await db.query(
            `SELECT 
                session_id,
                session_date,
                overall_score
            FROM sessions
            WHERE user_id = ?
            ORDER BY session_date DESC
            LIMIT 5`,
            [userId]
        );

        // Determine latest session date
        const latestSessionDate = recentSessions.length > 0 ? recentSessions[0].session_date : null;

        return res.status(200).json({
            success: true,
            username: userInfo.username,
            join_date: userInfo.join_date,
            total_sessions: Number(userInfo.total_sessions),
            best_score: Number(userInfo.best_score),
            avg_score: Number(userInfo.avg_score),
            latest_session_date: latestSessionDate,
            recent_sessions: recentSessions
        });

    } catch (error) {
        console.error('GetDashboardSummary Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving dashboard summary.'
        });
    }
};

/**
 * Get Session History with Pagination
 * GET /api/profile/sessions
 */
const getSessionHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Parse query pagination params
        let page = parseInt(req.query.page, 10) || 1;
        let limit = parseInt(req.query.limit, 10) || 10;

        if (page < 1) page = 1;
        if (limit < 1 || limit > 100) limit = 10;

        const offset = (page - 1) * limit;

        // 1. Get total session count for user
        const [countRows] = await db.query(
            'SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?',
            [userId]
        );
        const total = countRows[0].total;

        // 2. Fetch paginated sessions sorted newest first
        const [sessions] = await db.query(
            `SELECT 
                session_id,
                session_date,
                overall_score
            FROM sessions
            WHERE user_id = ?
            ORDER BY session_date DESC
            LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            sessions
        });

    } catch (error) {
        console.error('GetSessionHistory Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving session history.'
        });
    }
};

/**
 * Get Personal Records Foundation
 * GET /api/profile/records
 */
const getPersonalRecords = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // Query factual stored records from user_statistics and sessions
        const [statsRows] = await db.query(
            `SELECT 
                COALESCE(s.best_score, 0) AS highest_overall_score,
                COALESCE(s.total_sessions, 0) AS total_sessions_completed
            FROM users u
            LEFT JOIN user_statistics s ON u.user_id = s.user_id
            WHERE u.user_id = ?`,
            [userId]
        );

        if (statsRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        const stats = statsRows[0];

        // Fetch latest session date directly from sessions table
        const [latestRows] = await db.query(
            'SELECT session_date FROM sessions WHERE user_id = ? ORDER BY session_date DESC LIMIT 1',
            [userId]
        );

        const latestSessionDate = latestRows.length > 0 ? latestRows[0].session_date : null;

        return res.status(200).json({
            success: true,
            highest_overall_score: Number(stats.highest_overall_score),
            total_sessions_completed: Number(stats.total_sessions_completed),
            latest_session_date: latestSessionDate
        });

    } catch (error) {
        console.error('GetPersonalRecords Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving personal records.'
        });
    }
};

module.exports = {
    getProfile,
    getDashboardSummary,
    getSessionHistory,
    getPersonalRecords
};
