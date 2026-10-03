-- ============================================================================
-- NEURORUSH — PHASE 1: DATABASE ARCHITECTURE & DATA FOUNDATION
-- Target Database: MySQL 8.0+
-- Database Name: neurorush
-- Normalization: Third Normal Form (3NF)
-- Single Source of Truth for Cognitive Domains: ENUM ('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING')
-- ============================================================================

CREATE DATABASE IF NOT EXISTS neurorush
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_0900_ai_ci;

USE neurorush;

-- ============================================================================
-- TABLE: USERS
-- Purpose: Authoritative store for user identity and credentials.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    user_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    username VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT chk_users_username_format CHECK (CHAR_LENGTH(TRIM(username)) >= 3),
    CONSTRAINT chk_users_email_format CHECK (email REGEXP '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: USER_STATISTICS
-- Purpose: Aggregated performance metrics for fast lookups (1:1 with USERS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_statistics (
    user_id VARCHAR(36) PRIMARY KEY,
    best_score INT NOT NULL DEFAULT 0,
    avg_score DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    total_sessions INT NOT NULL DEFAULT 0,

    CONSTRAINT fk_user_statistics_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_user_statistics_best_score CHECK (best_score >= 0),
    CONSTRAINT chk_user_statistics_avg_score CHECK (avg_score >= 0.00),
    CONSTRAINT chk_user_statistics_total_sessions CHECK (total_sessions >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: SESSIONS
-- Purpose: Records completed cognitive test runs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    user_id VARCHAR(36) NOT NULL,
    session_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    overall_score INT NOT NULL,

    CONSTRAINT fk_sessions_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_sessions_overall_score CHECK (overall_score >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: SKILL_RESULTS
-- Purpose: Granular performance metrics per cognitive skill within a session.
-- ============================================================================

CREATE TABLE IF NOT EXISTS skill_results (
    result_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    session_id VARCHAR(36) NOT NULL,
    skill_type ENUM('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING') NOT NULL,
    score INT NOT NULL,
    accuracy DECIMAL(5, 2) NOT NULL,
    time_taken DECIMAL(10, 3) NOT NULL,

    CONSTRAINT fk_skill_results_session FOREIGN KEY (session_id)
        REFERENCES sessions(session_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_skill_results_score CHECK (score >= 0),
    CONSTRAINT chk_skill_results_accuracy CHECK (accuracy >= 0.00 AND accuracy <= 100.00),
    CONSTRAINT chk_skill_results_time_taken CHECK (time_taken >= 0.000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: CHALLENGES
-- Purpose: Metadata and configuration references for cognitive challenges.
-- ============================================================================

CREATE TABLE IF NOT EXISTS challenges (
    challenge_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    skill_type ENUM('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING') NOT NULL,
    difficulty ENUM('EASY', 'MEDIUM', 'HARD', 'EXPERT') NOT NULL,
    content_reference VARCHAR(255) NOT NULL,

    CONSTRAINT chk_challenges_content_ref_nonempty CHECK (CHAR_LENGTH(TRIM(content_reference)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: ACHIEVEMENTS
-- Purpose: Global achievement milestone definitions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS achievements (
    achievement_id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,

    CONSTRAINT uq_achievements_title UNIQUE (title),
    CONSTRAINT chk_achievements_title_nonempty CHECK (CHAR_LENGTH(TRIM(title)) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- TABLE: USER_ACHIEVEMENTS
-- Purpose: Association junction tracking earned achievements by user (M:N).
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_achievements (
    user_id VARCHAR(36) NOT NULL,
    achievement_id VARCHAR(36) NOT NULL,
    earned_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_achievements PRIMARY KEY (user_id, achievement_id),
    CONSTRAINT fk_user_achievements_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_user_achievements_achievement FOREIGN KEY (achievement_id)
        REFERENCES achievements(achievement_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ============================================================================
-- INDEXES FOR QUERY OPTIMIZATION & FUTURE ANALYTICS
-- ============================================================================

-- Users: Authentication & lookups
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);

-- Sessions: History tracking, chronological analysis, and leaderboards
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_session_date ON sessions(session_date DESC);
CREATE INDEX idx_sessions_overall_score ON sessions(overall_score DESC);
CREATE INDEX idx_sessions_user_date ON sessions(user_id, session_date DESC);

-- Skill Results: Skill-specific analytics and aggregation
CREATE INDEX idx_skill_results_session_id ON skill_results(session_id);
CREATE INDEX idx_skill_results_skill_type ON skill_results(skill_type);
CREATE INDEX idx_skill_results_type_score ON skill_results(skill_type, score DESC);

-- User Statistics: Global rankings & leaderboards
CREATE INDEX idx_user_statistics_best_score ON user_statistics(best_score DESC);
CREATE INDEX idx_user_statistics_avg_score ON user_statistics(avg_score DESC);

-- Challenges: Filtering by domain and difficulty level
CREATE INDEX idx_challenges_skill_type ON challenges(skill_type);
CREATE INDEX idx_challenges_skill_difficulty ON challenges(skill_type, difficulty);

-- User Achievements: User profile badges & activity queries
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned_date ON user_achievements(earned_date DESC);

-- ============================================================================
-- TABLE: USER_PROGRESSION (Phase 9)
-- Purpose: Tracks independent progression and unlocked levels per cognitive domain.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_progression (
    user_id VARCHAR(36) NOT NULL,
    skill_type ENUM('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING') NOT NULL,
    current_level INT NOT NULL DEFAULT 1,
    unlocked_level INT NOT NULL DEFAULT 1,
    highest_completed_level INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_session_id VARCHAR(36) NULL,

    CONSTRAINT pk_user_progression PRIMARY KEY (user_id, skill_type),
    CONSTRAINT fk_user_progression_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,
    CONSTRAINT chk_progression_current_level CHECK (current_level >= 1),
    CONSTRAINT chk_progression_unlocked_level CHECK (unlocked_level >= current_level),
    CONSTRAINT chk_progression_highest_level CHECK (highest_completed_level >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_user_progression_user_id ON user_progression(user_id);

-- ============================================================================
-- TABLE: USER_DIFFICULTY (Phase 13)
-- Purpose: Tracks independent adaptive difficulty per cognitive domain.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_difficulty (
    user_id VARCHAR(36) NOT NULL,
    skill_type ENUM('MEMORY', 'REFLEX', 'ATTENTION', 'TYPING') NOT NULL,
    difficulty ENUM('EASY', 'MEDIUM', 'HARD', 'EXPERT') NOT NULL DEFAULT 'MEDIUM',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT pk_user_difficulty PRIMARY KEY (user_id, skill_type),
    CONSTRAINT fk_user_difficulty_user FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE INDEX idx_user_difficulty_user_id ON user_difficulty(user_id);
