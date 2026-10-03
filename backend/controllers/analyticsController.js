const db = require('../database/db');
const { REQUIRED_SKILLS, SKILL_TYPES } = require('../utils/skills');

/**
 * GET /api/analytics/overview
 * Overview analytics: total sessions, average score, highest session score,
 * best skill, weakest skill, and current progression levels.
 */
const getOverview = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // 1. Session aggregates
        const [sessionStats] = await db.query(
            `SELECT 
                COUNT(*) AS total_sessions,
                COALESCE(MAX(overall_score), 0) AS highest_session_score,
                COALESCE(ROUND(AVG(overall_score), 2), 0.00) AS avg_score
             FROM sessions 
             WHERE user_id = ?`,
            [userId]
        );

        const totalSessions = Number(sessionStats[0].total_sessions);
        const highestSessionScore = Number(sessionStats[0].highest_session_score);
        const avgScore = Number(sessionStats[0].avg_score);

        // 2. Skill averages for Best & Weakest skill determination
        const [skillAverages] = await db.query(
            `SELECT 
                r.skill_type,
                ROUND(AVG(r.score), 2) AS avg_score,
                COUNT(*) AS attempts
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ?
             GROUP BY r.skill_type`,
            [userId]
        );

        let bestSkill = null;
        let weakestSkill = null;

        if (skillAverages.length > 0) {
            // Sort by average score descending
            const sortedByAvg = [...skillAverages].sort((a, b) => Number(b.avg_score) - Number(a.avg_score));
            bestSkill = sortedByAvg[0].skill_type;
            weakestSkill = sortedByAvg[sortedByAvg.length - 1].skill_type;
        }

        // 3. Current progression levels
        const [progressionRows] = await db.query(
            `SELECT skill_type, current_level, unlocked_level, highest_completed_level 
             FROM user_progression 
             WHERE user_id = ?`,
            [userId]
        );

        const progressionMap = new Map();
        for (const row of progressionRows) {
            progressionMap.set(row.skill_type, row.current_level);
        }

        const currentProgression = {
            memory_level: progressionMap.get(SKILL_TYPES.MEMORY) || 1,
            reflex_level: progressionMap.get(SKILL_TYPES.REFLEX) || 1,
            attention_level: progressionMap.get(SKILL_TYPES.ATTENTION) || 1,
            typing_level: progressionMap.get(SKILL_TYPES.TYPING) || 1
        };

        return res.status(200).json({
            success: true,
            total_sessions: totalSessions,
            average_score: avgScore,
            highest_session_score: highestSessionScore,
            best_skill: bestSkill,
            weakest_skill: weakestSkill,
            current_progression: currentProgression
        });

    } catch (error) {
        console.error('GetOverview Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving overview analytics.'
        });
    }
};

/**
 * GET /api/analytics/skills
 * Detailed analytics for each of the 4 cognitive domains:
 * Highest score, average score, latest score, levels completed, best performance,
 * mathematically correct improvement tracking, and domain-specific telemetry.
 */
const getSkillAnalytics = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // 1. Fetch progression levels
        const [progRows] = await db.query(
            `SELECT skill_type, current_level, unlocked_level, highest_completed_level 
             FROM user_progression 
             WHERE user_id = ?`,
            [userId]
        );
        const progMap = new Map();
        for (const p of progRows) {
            progMap.set(p.skill_type, p);
        }

        // 2. Query all skill results joined with sessions sorted chronologically
        const [rows] = await db.query(
            `SELECT 
                r.skill_type,
                r.score,
                r.accuracy,
                r.time_taken,
                s.session_date
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ?
             ORDER BY s.session_date ASC`,
            [userId]
        );

        // Group rows by skill
        const skillDataMap = {
            [SKILL_TYPES.MEMORY]: [],
            [SKILL_TYPES.REFLEX]: [],
            [SKILL_TYPES.ATTENTION]: [],
            [SKILL_TYPES.TYPING]: []
        };

        for (const row of rows) {
            if (skillDataMap[row.skill_type]) {
                skillDataMap[row.skill_type].push(row);
            }
        }

        const skillsAnalytics = {};

        for (const skill of REQUIRED_SKILLS) {
            const records = skillDataMap[skill];
            const levelsCompleted = records.length;
            const userProg = progMap.get(skill) || { current_level: 1, unlocked_level: 1, highest_completed_level: 0 };
            const currentLevel = userProg.current_level || 1;
            const bestLevel = Math.max(userProg.current_level || 1, userProg.highest_completed_level || 0);

            if (levelsCompleted === 0) {
                skillsAnalytics[skill] = {
                    total_attempts: 0,
                    levels_completed: 0,
                    current_level: currentLevel,
                    best_level: bestLevel,
                    highest_score: 0,
                    average_score: 0.00,
                    latest_score: null,
                    best_performance: null,
                    improvement: {
                        previous_performance: 0,
                        current_performance: 0,
                        improvement_pct: 0.00,
                        best_performance: 0,
                        average_performance: 0.00,
                        recent_average: 0.00,
                        historical_average: 0.00,
                        performance_change: 0.00,
                        recent_performance_trend: {
                            recent_average: 0.00,
                            historical_average: 0.00,
                            difference: 0.00,
                            trend_pct: 0.00,
                            direction: 'STABLE'
                        }
                    }
                };
                continue;
            }

            const scores = records.map(r => Number(r.score));
            const highestScore = Math.max(...scores);
            const sumScores = scores.reduce((sum, val) => sum + val, 0);
            const avgScore = Number((sumScores / levelsCompleted).toFixed(2));
            const latestScore = scores[scores.length - 1];
            const previousScore = levelsCompleted >= 2 ? scores[scores.length - 2] : scores[0];

            // 1. Mathematically Sound Improvement Calculation (Issue 1)
            let improvementPct = 0.00;
            if (levelsCompleted >= 2) {
                if (previousScore > 0) {
                    improvementPct = Number((((latestScore - previousScore) / previousScore) * 100).toFixed(2));
                } else {
                    improvementPct = latestScore > 0 ? 100.00 : 0.00;
                }
            }

            // Recent average trend vs historical average
            let recentAvg = 0.00;
            let historicalAvg = 0.00;
            let performanceChange = 0.00;
            let trendPct = 0.00;
            let trendDirection = 'STABLE';

            if (levelsCompleted >= 2) {
                const recentCount = Math.max(1, Math.min(3, Math.floor(levelsCompleted / 2)));
                const histCount = levelsCompleted - recentCount;
                const recentRecords = records.slice(levelsCompleted - recentCount);
                const historicalRecords = records.slice(0, histCount);

                const recentSum = recentRecords.reduce((sum, r) => sum + Number(r.score), 0);
                recentAvg = Number((recentSum / recentCount).toFixed(2));

                const histSum = historicalRecords.reduce((sum, r) => sum + Number(r.score), 0);
                historicalAvg = Number((histSum / histCount).toFixed(2));

                performanceChange = Number((recentAvg - historicalAvg).toFixed(2));
                trendPct = historicalAvg > 0 ? Number((((recentAvg - historicalAvg) / historicalAvg) * 100).toFixed(2)) : (performanceChange > 0 ? 100.00 : 0.00);
                trendDirection = performanceChange > 0 ? 'UPWARD' : (performanceChange < 0 ? 'DOWNWARD' : 'STABLE');
            } else {
                recentAvg = Number(latestScore.toFixed(2));
                historicalAvg = Number(latestScore.toFixed(2));
                performanceChange = 0.00;
                trendPct = 0.00;
                trendDirection = 'STABLE';
            }

            // 2. Domain-Specific Telemetry (Issue 8)
            let bestPerformance;
            let skillSpecificData = {};

            if (skill === SKILL_TYPES.REFLEX) {
                const minTime = Math.min(...records.map(r => Number(r.time_taken)));
                const avgTime = Number((records.reduce((sum, r) => sum + Number(r.time_taken), 0) / levelsCompleted).toFixed(3));
                const latestTime = Number(records[records.length - 1].time_taken);

                bestPerformance = {
                    highest_score: highestScore,
                    fastest_reaction_time_seconds: minTime,
                    fastest_reaction_time_ms: Math.round(minTime * 1000)
                };

                skillSpecificData = {
                    reaction_time_ms: Math.round(latestTime * 1000),
                    best_reaction_ms: Math.round(minTime * 1000),
                    average_reaction_ms: Math.round(avgTime * 1000)
                };
            } else if (skill === SKILL_TYPES.TYPING) {
                // Calculate WPM for each record
                const wpms = records.map(r => Math.max(0, Math.round((Number(r.score) - Number(r.accuracy) * 5) / 6.25)));
                const bestWpm = Math.max(...wpms);
                const latestWpm = wpms[wpms.length - 1];
                const avgWpm = Math.round(wpms.reduce((a, b) => a + b, 0) / levelsCompleted);
                const maxAccuracy = Math.max(...records.map(r => Number(r.accuracy)));
                const latestAccuracy = Number(records[records.length - 1].accuracy);

                bestPerformance = {
                    highest_score: highestScore,
                    best_accuracy: maxAccuracy,
                    best_wpm: bestWpm
                };

                skillSpecificData = {
                    wpm: latestWpm,
                    best_wpm: bestWpm,
                    average_wpm: avgWpm,
                    accuracy: latestAccuracy,
                    progress_trend: scores
                };
            } else if (skill === SKILL_TYPES.MEMORY) {
                const maxAccuracy = Math.max(...records.map(r => Number(r.accuracy)));
                const accuracyTrend = records.map(r => Number(r.accuracy));
                const completionRate = Number(((records.filter(r => Number(r.score) >= 700 || Number(r.accuracy) >= 70).length / levelsCompleted) * 100).toFixed(2));

                bestPerformance = {
                    highest_score: highestScore,
                    best_accuracy: maxAccuracy
                };

                skillSpecificData = {
                    accuracy_trend: accuracyTrend,
                    completion_rate: completionRate,
                    average_level: currentLevel
                };
            } else if (skill === SKILL_TYPES.ATTENTION) {
                const maxAccuracy = Math.max(...records.map(r => Number(r.accuracy)));
                const correctCount = records.filter(r => Number(r.accuracy) === 100).length;
                const errorCount = records.filter(r => Number(r.accuracy) === 0).length;
                const completionPct = Number(((correctCount / levelsCompleted) * 100).toFixed(2));

                bestPerformance = {
                    highest_score: highestScore,
                    best_accuracy: maxAccuracy
                };

                skillSpecificData = {
                    correct_selections: correctCount,
                    error_count: errorCount,
                    completion_pct: completionPct
                };
            }

            skillsAnalytics[skill] = {
                total_attempts: levelsCompleted,
                levels_completed: levelsCompleted,
                current_level: currentLevel,
                best_level: bestLevel,
                highest_score: highestScore,
                average_score: avgScore,
                latest_score: latestScore,
                previous_score: previousScore,
                best_performance: bestPerformance,
                ...skillSpecificData,
                improvement: {
                    previous_performance: previousScore,
                    current_performance: latestScore,
                    improvement_pct: improvementPct,
                    best_performance: highestScore,
                    average_performance: avgScore,
                    recent_average: recentAvg,
                    historical_average: historicalAvg,
                    performance_change: performanceChange,
                    recent_performance_trend: {
                        recent_average: recentAvg,
                        historical_average: historicalAvg,
                        difference: performanceChange,
                        trend_pct: trendPct,
                        direction: trendDirection
                    }
                }
            };
        }

        return res.status(200).json({
            success: true,
            skills: skillsAnalytics
        });

    } catch (error) {
        console.error('GetSkillAnalytics Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving skill analytics.'
        });
    }
};

/**
 * GET /api/analytics/records
 * Personal records: fastest reaction time, highest memory score,
 * highest attention score, highest typing score, highest overall session score.
 */
const getPersonalRecords = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // 1. Highest Overall Session Score
        const [sessionMax] = await db.query(
            `SELECT COALESCE(MAX(overall_score), 0) AS highest_overall_session_score 
             FROM sessions 
             WHERE user_id = ?`,
            [userId]
        );
        const highestOverallSessionScore = Number(sessionMax[0].highest_overall_session_score);

        // 2. High scores and fastest times per skill
        const [skillRecords] = await db.query(
            `SELECT 
                r.skill_type,
                MAX(r.score) AS max_score,
                MIN(r.time_taken) AS min_time
             FROM skill_results r
             JOIN sessions s ON r.session_id = s.session_id
             WHERE s.user_id = ?
             GROUP BY r.skill_type`,
            [userId]
        );

        const recordsMap = new Map();
        for (const rec of skillRecords) {
            recordsMap.set(rec.skill_type, {
                max_score: Number(rec.max_score),
                min_time: Number(rec.min_time)
            });
        }

        const memoryData = recordsMap.get(SKILL_TYPES.MEMORY);
        const reflexData = recordsMap.get(SKILL_TYPES.REFLEX);
        const attentionData = recordsMap.get(SKILL_TYPES.ATTENTION);
        const typingData = recordsMap.get(SKILL_TYPES.TYPING);

        const fastestReactionSec = reflexData ? reflexData.min_time : null;
        const fastestReactionMs = reflexData ? Math.round(reflexData.min_time * 1000) : null;

        return res.status(200).json({
            success: true,
            records: {
                highest_overall_session_score: highestOverallSessionScore,
                highest_memory_score: memoryData ? memoryData.max_score : 0,
                fastest_reaction_time: {
                    seconds: fastestReactionSec,
                    milliseconds: fastestReactionMs
                },
                highest_attention_score: attentionData ? attentionData.max_score : 0,
                highest_typing_score: typingData ? typingData.max_score : 0
            }
        });

    } catch (error) {
        console.error('GetPersonalRecords Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving personal records.'
        });
    }
};

/**
 * GET /api/analytics/history
 * Complete historical session analytics with deterministic aggregate metrics
 * and chronological session records.
 */
const getHistory = async (req, res) => {
    try {
        const userId = req.user.user_id;

        // 1. Session aggregates
        const [stats] = await db.query(
            `SELECT 
                COUNT(*) AS total_sessions,
                COALESCE(ROUND(AVG(overall_score), 2), 0.00) AS avg_score,
                COALESCE(MAX(overall_score), 0) AS highest_score,
                COALESCE(MIN(overall_score), 0) AS lowest_score
             FROM sessions 
             WHERE user_id = ?`,
            [userId]
        );

        const totalSessions = Number(stats[0].total_sessions);
        const avgScore = Number(stats[0].avg_score);
        const highestScore = Number(stats[0].highest_score);
        const lowestScore = Number(stats[0].lowest_score);

        // 2. Chronological session list (Latest 15 sessions per Queue limit)
        const [sessions] = await db.query(
            `SELECT 
                session_id,
                overall_score,
                session_date
             FROM sessions 
             WHERE user_id = ? 
             ORDER BY session_date DESC 
             LIMIT 15`,
            [userId]
        );

        const latestSessionScore = sessions.length > 0 ? sessions[sessions.length - 1].overall_score : null;

        return res.status(200).json({
            success: true,
            total_sessions: totalSessions,
            average_session_score: avgScore,
            highest_session_score: highestScore,
            lowest_session_score: lowestScore,
            latest_session_score: latestSessionScore,
            session_history: sessions
        });

    } catch (error) {
        console.error('GetHistory Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while retrieving session history analytics.'
        });
    }
};

module.exports = {
    getOverview,
    getSkillAnalytics,
    getPersonalRecords,
    getHistory
};
