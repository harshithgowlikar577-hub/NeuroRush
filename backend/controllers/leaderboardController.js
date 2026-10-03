const db = require('../database/db');
const { SKILL_TYPES, REQUIRED_SKILLS } = require('../utils/skills');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parse and sanitize pagination query parameters
 * @param {Object} query
 * @returns {{ page: number, limit: number, offset: number }}
 */
const parsePagination = (query) => {
    let page = parseInt(query.page, 10) || 1;
    let limit = parseInt(query.limit, 10) || DEFAULT_LIMIT;

    if (page < 1) page = 1;
    if (limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const offset = (page - 1) * limit;
    return { page, limit, offset };
};

/**
 * GET /api/leaderboard/global
 * Rank users by their highest overall session score.
 * Tie-breaking: score DESC, achieved_at ASC, user_id ASC.
 */
const getGlobalLeaderboard = async (req, res) => {
    try {
        let { page, limit, offset } = parsePagination(req.query);

        // 1. Get total number of distinct users who have completed sessions
        const [countResult] = await db.query(
            'SELECT COUNT(DISTINCT user_id) AS total FROM sessions'
        );
        const total = Number(countResult[0].total) || 0;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

        if (total === 0) {
            return res.status(200).json({
                success: true,
                leaderboard_type: 'GLOBAL',
                page: 1,
                limit,
                total: 0,
                total_pages: 1,
                leaderboard: []
            });
        }

        // Prevent empty pagination: clamp page to totalPages if exceeded
        if (page > totalPages) {
            page = totalPages;
            offset = (page - 1) * limit;
        }

        // 2. Query deterministic rankings with tie-breaking and level progression
        const [rows] = await db.query(
            `WITH user_best AS (
                SELECT 
                    s.user_id,
                    u.username,
                    s.overall_score AS score,
                    s.session_date AS achieved_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY s.user_id 
                        ORDER BY s.overall_score DESC, s.session_date ASC, s.session_id ASC
                    ) AS rn
                FROM sessions s
                JOIN users u ON s.user_id = u.user_id
            )
            SELECT 
                ub.user_id, 
                ub.username, 
                ub.score, 
                ub.achieved_at,
                COALESCE(p.max_level, 1) AS level,
                COALESCE(p.total_completed, 0) AS completed_levels
            FROM user_best ub
            LEFT JOIN (
                SELECT user_id, 
                       SUM(highest_completed_level) AS total_completed, 
                       MAX(current_level) AS max_level
                FROM user_progression
                GROUP BY user_id
            ) p ON p.user_id = ub.user_id
            WHERE ub.rn = 1
            ORDER BY ub.score DESC, ub.achieved_at ASC, ub.user_id ASC
            LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        // Map entries and compute deterministic rank
        const leaderboard = rows.map((row, idx) => ({
            rank: offset + idx + 1,
            username: row.username,
            score: Number(row.score),
            level: Number(row.level || 1),
            levels_completed: Number(row.completed_levels || 0),
            achieved_at: row.achieved_at
        }));

        return res.status(200).json({
            success: true,
            leaderboard_type: 'GLOBAL',
            page,
            limit,
            total,
            total_pages: totalPages,
            leaderboard
        });

    } catch (error) {
        console.error('GetGlobalLeaderboard Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving global leaderboard.'
        });
    }
};

/**
 * Internal helper to retrieve leaderboard for a specific skill domain
 * @param {Object} req
 * @param {Object} res
 * @param {string} skillType
 */
const fetchSkillLeaderboard = async (req, res, skillType) => {
    try {
        let { page, limit, offset } = parsePagination(req.query);

        // 1. Get total number of distinct users who attempted this skill
        const [countResult] = await db.query(
            `SELECT COUNT(DISTINCT s.user_id) AS total 
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE r.skill_type = ?`,
            [skillType]
        );

        const total = Number(countResult[0].total) || 0;
        const totalPages = total > 0 ? Math.ceil(total / limit) : 1;

        if (total === 0) {
            return res.status(200).json({
                success: true,
                skill_type: skillType,
                page: 1,
                limit,
                total: 0,
                total_pages: 1,
                leaderboard: []
            });
        }

        // Prevent empty pagination: clamp page to totalPages if exceeded
        if (page > totalPages) {
            page = totalPages;
            offset = (page - 1) * limit;
        }

        // 2. Query deterministic skill rankings with tie-breaking and level progression
        const [rows] = await db.query(
            `WITH skill_best AS (
                SELECT 
                    s.user_id,
                    u.username,
                    r.score,
                    s.session_date AS achieved_at,
                    ROW_NUMBER() OVER (
                        PARTITION BY s.user_id 
                        ORDER BY r.score DESC, s.session_date ASC, r.result_id ASC
                    ) AS rn
                FROM skill_results r
                JOIN sessions s ON r.session_id = s.session_id
                JOIN users u ON s.user_id = u.user_id
                WHERE r.skill_type = ?
            )
            SELECT 
                sb.user_id, 
                sb.username, 
                sb.score, 
                sb.achieved_at,
                COALESCE(p.current_level, 1) AS level,
                COALESCE(p.highest_completed_level, 0) AS completed_levels
            FROM skill_best sb
            LEFT JOIN user_progression p ON p.user_id = sb.user_id AND p.skill_type = ?
            WHERE sb.rn = 1
            ORDER BY sb.score DESC, sb.achieved_at ASC, sb.user_id ASC
            LIMIT ? OFFSET ?`,
            [skillType, skillType, limit, offset]
        );

        const leaderboard = rows.map((row, idx) => ({
            rank: offset + idx + 1,
            username: row.username,
            score: Number(row.score),
            level: Number(row.level || 1),
            levels_completed: Number(row.completed_levels || 0),
            achieved_at: row.achieved_at
        }));

        return res.status(200).json({
            success: true,
            skill_type: skillType,
            page,
            limit,
            total,
            total_pages: totalPages,
            leaderboard
        });

    } catch (error) {
        console.error(`Get${skillType}Leaderboard Error:`, error.message);
        return res.status(500).json({
            success: false,
            message: `Database error occurred while retrieving ${skillType.toLowerCase()} leaderboard.`
        });
    }
};

/**
 * GET /api/leaderboard/memory
 */
const getMemoryLeaderboard = (req, res) => {
    return fetchSkillLeaderboard(req, res, SKILL_TYPES.MEMORY);
};

/**
 * GET /api/leaderboard/reflex
 */
const getReflexLeaderboard = (req, res) => {
    return fetchSkillLeaderboard(req, res, SKILL_TYPES.REFLEX);
};

/**
 * GET /api/leaderboard/attention
 */
const getAttentionLeaderboard = (req, res) => {
    return fetchSkillLeaderboard(req, res, SKILL_TYPES.ATTENTION);
};

/**
 * GET /api/leaderboard/typing
 */
const getTypingLeaderboard = (req, res) => {
    return fetchSkillLeaderboard(req, res, SKILL_TYPES.TYPING);
};

module.exports = {
    getGlobalLeaderboard,
    getMemoryLeaderboard,
    getReflexLeaderboard,
    getAttentionLeaderboard,
    getTypingLeaderboard
};
