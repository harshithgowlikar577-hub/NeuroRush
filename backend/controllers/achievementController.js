const db = require('../database/db');
const { SKILL_TYPES } = require('../utils/skills');

// Defined Initial Achievements for Phase 12
const INITIAL_ACHIEVEMENTS = [
    {
        title: 'FIRST_SESSION',
        description: 'Complete first NeuroRush session.',
        check: (totalSessions) => totalSessions >= 1
    },
    {
        title: 'MEMORY_MASTER',
        description: 'Reach defined memory score threshold.',
        check: (totalSessions, maxSkills) => (maxSkills.MEMORY || 0) >= 800
    },
    {
        title: 'REFLEX_MASTER',
        description: 'Reach defined reflex score threshold.',
        check: (totalSessions, maxSkills) => (maxSkills.REFLEX || 0) >= 800
    },
    {
        title: 'ATTENTION_MASTER',
        description: 'Reach defined attention score threshold.',
        check: (totalSessions, maxSkills) => (maxSkills.ATTENTION || 0) >= 800
    },
    {
        title: 'TYPING_MASTER',
        description: 'Reach defined typing score threshold.',
        check: (totalSessions, maxSkills) => (maxSkills.TYPING || 0) >= 800
    },
    {
        title: 'CONSISTENCY_AWARD',
        description: 'Reach defined completed session count.',
        check: (totalSessions) => totalSessions >= 5
    },
    {
        title: 'HIGH_PERFORMER',
        description: 'Reach defined overall session score threshold.',
        check: (totalSessions, maxSkills, maxOverallSession) => maxOverallSession >= 800
    }
];

let seeded = false;

/**
 * Ensure initial achievements exist in MySQL achievements table
 */
const ensureAchievementsSeeded = async () => {
    if (seeded) return;
    for (const ach of INITIAL_ACHIEVEMENTS) {
        await db.query(
            'INSERT IGNORE INTO achievements (title, description) VALUES (?, ?)',
            [ach.title, ach.description]
        );
    }
    seeded = true;
};

/**
 * Evaluate and award any newly qualified achievements for a user.
 * Reusable internally across controllers or via POST /api/achievements/evaluate.
 * @param {string} userId
 * @param {Object} [executor=db] Optional transaction connection
 * @returns {Promise<Array>} List of newly awarded achievement titles
 */
const evaluateUserAchievements = async (userId, executor = db) => {
    await ensureAchievementsSeeded();

    // 1. Fetch all definitions from MySQL
    const [allAchievements] = await executor.query(
        'SELECT achievement_id, title, description FROM achievements'
    );
    const achievementMap = new Map();
    for (const a of allAchievements) {
        achievementMap.set(a.title, a.achievement_id);
    }

    // 2. Fetch user's currently earned achievements
    const [earnedRows] = await executor.query(
        'SELECT achievement_id FROM user_achievements WHERE user_id = ?',
        [userId]
    );
    const earnedSet = new Set(earnedRows.map(r => r.achievement_id));

    // 3. Gather factual metrics from database
    // A. Total completed sessions and max overall score
    const [sessionStats] = await executor.query(
        `SELECT COUNT(*) AS total_sessions, COALESCE(MAX(overall_score), 0) AS max_overall 
         FROM sessions 
         WHERE user_id = ?`,
        [userId]
    );
    const totalSessions = Number(sessionStats[0].total_sessions) || 0;
    const maxOverall = Number(sessionStats[0].max_overall) || 0;

    // B. Max score achieved in each cognitive skill
    const [skillRows] = await executor.query(
        `SELECT r.skill_type, COALESCE(MAX(r.score), 0) AS max_score
         FROM skill_results r
         JOIN sessions s ON r.session_id = s.session_id
         WHERE s.user_id = ?
         GROUP BY r.skill_type`,
        [userId]
    );
    const maxSkills = {};
    for (const row of skillRows) {
        maxSkills[row.skill_type] = Number(row.max_score);
    }

    // 4. Deterministic evaluation
    const newlyAwarded = [];

    for (const def of INITIAL_ACHIEVEMENTS) {
        const achievementId = achievementMap.get(def.title);
        if (!achievementId) continue;

        // Skip if already earned
        if (earnedSet.has(achievementId)) continue;

        // Check qualification
        const qualifies = def.check(totalSessions, maxSkills, maxOverall);
        if (qualifies) {
            // Award achievement permanently
            await executor.query(
                `INSERT IGNORE INTO user_achievements (user_id, achievement_id, earned_date) 
                 VALUES (?, ?, CURRENT_TIMESTAMP)`,
                [userId, achievementId]
            );
            earnedSet.add(achievementId);
            newlyAwarded.push(def.title);
        }
    }

    return newlyAwarded;
};

/**
 * GET /api/achievements
 * Return all earned achievements for the authenticated user.
 */
const getEarnedAchievements = async (req, res) => {
    try {
        await ensureAchievementsSeeded();
        const userId = req.user.user_id;

        const [rows] = await db.query(
            `SELECT 
                a.title,
                a.description,
                ua.earned_date
             FROM user_achievements ua
             JOIN achievements a ON ua.achievement_id = a.achievement_id
             WHERE ua.user_id = ?
             ORDER BY ua.earned_date DESC`,
            [userId]
        );

        return res.status(200).json({
            success: true,
            achievement_count: rows.length,
            achievements: rows
        });

    } catch (error) {
        console.error('GetEarnedAchievements Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving user achievements.'
        });
    }
};

/**
 * GET /api/achievements/progress
 * Return all official achievements with completion flag and earned date if completed.
 */
const getAchievementProgress = async (req, res) => {
    try {
        await ensureAchievementsSeeded();
        const userId = req.user.user_id;

        const [rows] = await db.query(
            `SELECT 
                a.title,
                a.description,
                CASE WHEN ua.achievement_id IS NOT NULL THEN true ELSE false END AS earned,
                ua.earned_date
             FROM achievements a
             LEFT JOIN user_achievements ua ON a.achievement_id = ua.achievement_id AND ua.user_id = ?
             ORDER BY a.title ASC`,
            [userId]
        );

        const earnedCount = rows.filter(r => Boolean(r.earned)).length;

        return res.status(200).json({
            success: true,
            total_achievements: rows.length,
            earned_count: earnedCount,
            achievements: rows.map(r => ({
                title: r.title,
                description: r.description,
                earned: Boolean(r.earned),
                earned_date: r.earned_date || null
            }))
        });

    } catch (error) {
        console.error('GetAchievementProgress Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving achievement progress.'
        });
    }
};

/**
 * POST /api/achievements/evaluate
 * Trigger evaluation of user accomplishments and award any earned achievements.
 */
const evaluateAchievements = async (req, res) => {
    try {
        const userId = req.user.user_id;
        const newlyAwarded = await evaluateUserAchievements(userId, db);

        const [countRow] = await db.query(
            'SELECT COUNT(*) AS total FROM user_achievements WHERE user_id = ?',
            [userId]
        );

        return res.status(200).json({
            success: true,
            newly_awarded_count: newlyAwarded.length,
            newly_awarded: newlyAwarded,
            total_earned: Number(countRow[0].total)
        });

    } catch (error) {
        console.error('EvaluateAchievements Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during achievement evaluation.'
        });
    }
};

module.exports = {
    getEarnedAchievements,
    getAchievementProgress,
    evaluateAchievements,
    evaluateUserAchievements,
    ensureAchievementsSeeded
};
