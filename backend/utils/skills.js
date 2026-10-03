/**
 * Single Source of Truth for NeuroRush Skill Domains
 * Aligns with PostgreSQL / MySQL ENUM ('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING')
 */
const SKILL_TYPES = Object.freeze({
    MEMORY: 'MEMORY',
    REFLEX: 'REFLEX',
    ATTENTION: 'ATTENTION',
    TYPING: 'TYPING'
});

const REQUIRED_SKILLS = Object.freeze([
    SKILL_TYPES.MEMORY,
    SKILL_TYPES.REFLEX,
    SKILL_TYPES.ATTENTION,
    SKILL_TYPES.TYPING
]);

const DIFFICULTY_LEVELS = Object.freeze({
    EASY: 'EASY',
    MEDIUM: 'MEDIUM',
    HARD: 'HARD',
    EXPERT: 'EXPERT'
});

const DIFFICULTY_ORDER = Object.freeze([
    DIFFICULTY_LEVELS.EASY,
    DIFFICULTY_LEVELS.MEDIUM,
    DIFFICULTY_LEVELS.HARD,
    DIFFICULTY_LEVELS.EXPERT
]);

module.exports = {
    SKILL_TYPES,
    REQUIRED_SKILLS,
    DIFFICULTY_LEVELS,
    DIFFICULTY_ORDER
};
