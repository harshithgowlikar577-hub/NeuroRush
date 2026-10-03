const db = require('../database/db');
const { REQUIRED_SKILLS, SKILL_TYPES, DIFFICULTY_LEVELS, DIFFICULTY_ORDER } = require('../utils/skills');

const INCREASE_THRESHOLD = 800;
const DECREASE_THRESHOLD = 500;

/**
 * Ensure user has default difficulty records in MySQL
 * @param {string} userId
 */
const ensureUserDifficulty = async (userId) => {
    for (const skill of REQUIRED_SKILLS) {
        await db.query(
            `INSERT IGNORE INTO user_difficulty (user_id, skill_type, difficulty) 
             VALUES (?, ?, 'MEDIUM')`,
            [userId, skill]
        );
    }
};

/**
 * Helper to fetch a user's current difficulty for a specific skill
 * @param {string} userId
 * @param {string} skillType
 * @returns {Promise<string>} 'EASY' | 'MEDIUM' | 'HARD' | 'EXPERT'
 */
const getUserDifficulty = async (userId, skillType) => {
    const [rows] = await db.query(
        'SELECT difficulty FROM user_difficulty WHERE user_id = ? AND skill_type = ?',
        [userId, skillType]
    );

    if (rows.length > 0) {
        return rows[0].difficulty;
    }

    // Default to MEDIUM if not yet initialized
    await db.query(
        `INSERT IGNORE INTO user_difficulty (user_id, skill_type, difficulty) 
         VALUES (?, ?, 'MEDIUM')`,
        [userId, skillType]
    );
    return DIFFICULTY_LEVELS.MEDIUM;
};

/**
 * GET /api/adaptive/status
 * Return current difficulty state for all 4 cognitive domains
 */
const getAdaptiveStatus = async (req, res) => {
    try {
        const userId = req.user.user_id;
        await ensureUserDifficulty(userId);

        const [rows] = await db.query(
            'SELECT skill_type, difficulty FROM user_difficulty WHERE user_id = ?',
            [userId]
        );

        const difficultyMap = new Map();
        for (const row of rows) {
            difficultyMap.set(row.skill_type, row.difficulty);
        }

        return res.status(200).json({
            success: true,
            difficulties: {
                memory_difficulty: difficultyMap.get(SKILL_TYPES.MEMORY) || DIFFICULTY_LEVELS.MEDIUM,
                reflex_difficulty: difficultyMap.get(SKILL_TYPES.REFLEX) || DIFFICULTY_LEVELS.MEDIUM,
                attention_difficulty: difficultyMap.get(SKILL_TYPES.ATTENTION) || DIFFICULTY_LEVELS.MEDIUM,
                typing_difficulty: difficultyMap.get(SKILL_TYPES.TYPING) || DIFFICULTY_LEVELS.MEDIUM
            }
        });

    } catch (error) {
        console.error('GetAdaptiveStatus Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving adaptive difficulty status.'
        });
    }
};

/**
 * POST /api/adaptive/evaluate
 * Evaluate user's latest performance in a skill domain and adjust difficulty deterministically
 */
const evaluateDifficulty = async (req, res) => {
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

        await ensureUserDifficulty(userId);

        // 2. Fetch current difficulty
        const currentDifficulty = await getUserDifficulty(userId, skill_type);
        const currentIndex = DIFFICULTY_ORDER.indexOf(currentDifficulty);

        // 3. Fetch latest performance result for this skill
        const [results] = await db.query(
            `SELECT r.score, r.accuracy, s.session_date 
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ? AND r.skill_type = ?
             ORDER BY s.session_date DESC 
             LIMIT 1`,
            [userId, skill_type]
        );

        if (results.length === 0) {
            return res.status(200).json({
                success: true,
                skill_type,
                old_difficulty: currentDifficulty,
                new_difficulty: currentDifficulty,
                reason: `No completed challenges found for ${skill_type}. Current difficulty maintained.`
            });
        }

        const latestScore = Number(results[0].score);
        let newDifficulty = currentDifficulty;
        let reason = '';

        // 4. Transparent Deterministic Adaptation Rules
        if (latestScore >= INCREASE_THRESHOLD) {
            if (currentIndex < DIFFICULTY_ORDER.length - 1) {
                newDifficulty = DIFFICULTY_ORDER[currentIndex + 1];
                reason = `High performance detected (Score: ${latestScore} >= ${INCREASE_THRESHOLD}). Difficulty increased from ${currentDifficulty} to ${newDifficulty}.`;
            } else {
                newDifficulty = currentDifficulty;
                reason = `High performance detected (Score: ${latestScore} >= ${INCREASE_THRESHOLD}). Already at maximum difficulty (${DIFFICULTY_LEVELS.EXPERT}).`;
            }
        } else if (latestScore < DECREASE_THRESHOLD) {
            if (currentIndex > 0) {
                newDifficulty = DIFFICULTY_ORDER[currentIndex - 1];
                reason = `Performance below baseline detected (Score: ${latestScore} < ${DECREASE_THRESHOLD}). Difficulty decreased from ${currentDifficulty} to ${newDifficulty} to stabilize.`;
            } else {
                newDifficulty = currentDifficulty;
                reason = `Performance below baseline detected (Score: ${latestScore} < ${DECREASE_THRESHOLD}). Already at minimum difficulty (${DIFFICULTY_LEVELS.EASY}).`;
            }
        } else {
            newDifficulty = currentDifficulty;
            reason = `Performance stable (${DECREASE_THRESHOLD} <= Score: ${latestScore} < ${INCREASE_THRESHOLD}). Current difficulty maintained at ${currentDifficulty}.`;
        }

        // 5. Persist permanently if changed
        if (newDifficulty !== currentDifficulty) {
            await db.query(
                `UPDATE user_difficulty 
                 SET difficulty = ? 
                 WHERE user_id = ? AND skill_type = ?`,
                [newDifficulty, userId, skill_type]
            );
        }

        return res.status(200).json({
            success: true,
            skill_type,
            old_difficulty: currentDifficulty,
            new_difficulty: newDifficulty,
            achieved_score: latestScore,
            reason
        });

    } catch (error) {
        console.error('EvaluateDifficulty Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during adaptive difficulty evaluation.'
        });
    }
};

module.exports = {
    getAdaptiveStatus,
    evaluateDifficulty,
    getUserDifficulty,
    ensureUserDifficulty
};
