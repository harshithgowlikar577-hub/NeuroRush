const db = require('../database/db');

const MAX_SESSIONS = 15;

/**
 * Enforces FIFO Queue Data Structure behavior on user sessions:
 * Maintains only the latest 15 sessions per user.
 * When session 16 arrives, the oldest session is removed (FIFO).
 * Cascades deletion to skill_results.
 * Synchronizes user_statistics (total_sessions, best_score, avg_score).
 * 
 * @param {string} userId 
 * @param {object} connection - MySQL connection (transaction) or pool
 */
const enforceSessionQueue = async (userId, connection = db) => {
    // 1. Fetch all session IDs for this user ordered chronologically (oldest first)
    const [sessions] = await connection.query(
        `SELECT session_id FROM sessions 
         WHERE user_id = ? 
         ORDER BY session_date ASC, session_id ASC`,
        [userId]
    );

    if (sessions.length > MAX_SESSIONS) {
        const excessCount = sessions.length - MAX_SESSIONS;
        const sessionsToDelete = sessions.slice(0, excessCount).map(s => s.session_id);

        if (sessionsToDelete.length > 0) {
            await connection.query(
                `DELETE FROM sessions WHERE session_id IN (?)`,
                [sessionsToDelete]
            );
        }
    }

    // 2. Synchronize user_statistics with the active 15-session queue
    const [statsSummary] = await connection.query(
        `SELECT 
            COUNT(*) AS total, 
            COALESCE(MAX(overall_score), 0) AS best, 
            COALESCE(ROUND(AVG(overall_score), 2), 0.00) AS avg_score 
         FROM sessions 
         WHERE user_id = ?`,
        [userId]
    );

    const total = Number(statsSummary[0].total) || 0;
    const best = Number(statsSummary[0].best) || 0;
    const avg = Number(statsSummary[0].avg_score) || 0.00;

    await connection.query(
        `UPDATE user_statistics 
         SET total_sessions = ?, best_score = ?, avg_score = ? 
         WHERE user_id = ?`,
        [total, best, avg, userId]
    );
};

module.exports = {
    MAX_SESSIONS,
    enforceSessionQueue
};
