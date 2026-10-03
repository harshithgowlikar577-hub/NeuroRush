# NeuroRush — Phase 1: Database Architecture & Data Foundation

## 1. Executive Architecture Overview

NeuroRush is a cognitive performance platform designed to record, track, and analyze cognitive performance across four primary domains:
* **Memory**
* **Reflex**
* **Attention**
* **Typing**

This document describes the foundational relational database architecture (Phase 1), designed and deployed for **MySQL 8.0+** (Database: `neurorush`, Engine: `InnoDB`, Charset: `utf8mb4`). The architecture complies with Third Normal Form (3NF), guarantees referential integrity, eliminates orphan records, and provides the indexing foundation for future analytics, adaptive difficulty engines, and global leaderboards.

---

## 2. Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    users ||--o{ sessions : "has"
    users ||--|| user_statistics : "tracks"
    users ||--o{ user_achievements : "earns"
    users ||--o{ user_progression : "progresses"
    sessions ||--|{ skill_results : "yields"
    achievements ||--o{ user_achievements : "awarded_via"

    users {
        varchar(36) user_id PK
        varchar(50) username UK
        varchar(255) email UK
        varchar(255) password_hash
        timestamp created_at
    }

    user_statistics {
        varchar(36) user_id PK, FK
        integer best_score
        decimal(10,2) avg_score
        integer total_sessions
    }

    sessions {
        varchar(36) session_id PK
        varchar(36) user_id FK
        timestamp session_date
        integer overall_score
    }

    skill_results {
        varchar(36) result_id PK
        varchar(36) session_id FK
        enum skill_type
        integer score
        decimal(5,2) accuracy
        decimal(10,3) time_taken
    }

    challenges {
        varchar(36) challenge_id PK
        enum skill_type
        enum difficulty
        varchar(255) content_reference
    }

    achievements {
        varchar(36) achievement_id PK
        varchar(100) title UK
        text description
    }

    user_achievements {
        varchar(36) user_id PK, FK
        varchar(36) achievement_id PK, FK
        timestamp earned_date
    }

    user_progression {
        varchar(36) user_id PK, FK
        enum skill_type PK
        integer current_level
        integer unlocked_level
        integer highest_completed_level
        timestamp updated_at
        varchar(36) last_session_id
    }
```

---

## 3. Authoritative Types & Enumerations

To guarantee a **Single Source of Truth** across the platform, domain categories are formalized via MySQL ENUM types:

### `skill_type`
The four immutable cognitive domains:
* `MEMORY`: Visual and spatial pattern recall.
* `REFLEX`: Reaction speed and motor inhibition.
* `ATTENTION`: Sustained focus, selective vigilance, and task switching.
* `TYPING`: Motor precision, input velocity, and linguistic throughput.

### `difficulty_level`
Standardized challenge tier scale:
* `EASY`
* `MEDIUM`
* `HARD`
* `EXPERT`

---

## 4. Table Definitions & Schemas

### 4.1. `users`
Authoritative store for identity, credentials, and account creation timestamps.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | `VARCHAR(36)` | No | `(UUID())` | Primary Key |
| `username` | `VARCHAR(50)` | No | — | Unique, length >= 3 |
| `email` | `VARCHAR(255)` | No | — | Unique, regex email validation |
| `password_hash` | `VARCHAR(255)` | No | — | Cryptographic hash storage only |
| `created_at` | `TIMESTAMP` | No | `CURRENT_TIMESTAMP` | Account registration time |

### 4.2. `user_statistics`
Denormalized aggregate metrics for instantaneous profile lookup without re-scanning historical sessions. Maintained in strict 1:1 parity with `users`.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | `VARCHAR(36)` | No | — | Primary Key, Foreign Key -> `users(user_id)` ON DELETE CASCADE |
| `best_score` | `INT` | No | `0` | Check (`best_score >= 0`) |
| `avg_score` | `DECIMAL(10, 2)`| No | `0.00` | Check (`avg_score >= 0.00`) |
| `total_sessions`| `INT` | No | `0` | Check (`total_sessions >= 0`) |

### 4.3. `sessions`
Records each full test run completed by an authenticated user.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `session_id` | `VARCHAR(36)` | No | `(UUID())` | Primary Key |
| `user_id` | `VARCHAR(36)` | No | — | Foreign Key -> `users(user_id)` ON DELETE CASCADE |
| `session_date` | `TIMESTAMP` | No | `CURRENT_TIMESTAMP` | Timestamp of session completion |
| `overall_score`| `INT` | No | — | Check (`overall_score >= 0`) |

### 4.4. `skill_results`
Granular performance measurements recorded during a session, segmented by cognitive domain.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `result_id` | `VARCHAR(36)` | No | `(UUID())` | Primary Key |
| `session_id` | `VARCHAR(36)` | No | — | Foreign Key -> `sessions(session_id)` ON DELETE CASCADE |
| `skill_type` | `ENUM` | No | — | Validated ENUM (`MEMORY`, `REFLEX`, `ATTENTION`, `TYPING`) |
| `score` | `INT` | No | — | Check (`score >= 0`) |
| `accuracy` | `DECIMAL(5, 2)` | No | — | Check (`accuracy BETWEEN 0.00 AND 100.00`) |
| `time_taken` | `DECIMAL(10, 3)`| No | — | Check (`time_taken >= 0.000`) in seconds |

### 4.5. `challenges`
Modular catalog of challenge definitions and asset references. Kept decoupled from player sessions to allow dynamic content addition and difficulty tuning.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `challenge_id` | `VARCHAR(36)` | No | `(UUID())` | Primary Key |
| `skill_type` | `ENUM` | No | — | Validated ENUM |
| `difficulty` | `ENUM` | No | — | Validated ENUM (`EASY`, `MEDIUM`, `HARD`, `EXPERT`) |
| `content_reference` | `VARCHAR(255)`| No | — | URI/Key pointing to challenge asset payload |

### 4.6. `achievements`
System-wide milestone and accomplishment definitions.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `achievement_id` | `VARCHAR(36)` | No | `(UUID())` | Primary Key |
| `title` | `VARCHAR(100)` | No | — | Unique, non-empty |
| `description` | `TEXT` | No | — | Human-readable requirement criteria |

### 4.7. `user_achievements`
Many-to-many junction table recording the acquisition of achievements by users.

| Column | Type | Nullable | Default | Constraints / Notes |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | `VARCHAR(36)` | No | — | Composite PK, FK -> `users(user_id)` ON DELETE CASCADE |
| `achievement_id` | `VARCHAR(36)` | No | — | Composite PK, FK -> `achievements(achievement_id)` ON DELETE CASCADE |
| `earned_date` | `TIMESTAMP` | No | `CURRENT_TIMESTAMP` | Time badge/achievement was awarded |

---

## 5. Primary Keys, Foreign Keys, & Constraints

### 5.1. Referential Integrity & Cascade Semantics
* `users` → `sessions`: Cascades on user deletion (`ON DELETE CASCADE`), ensuring no dangling sessions exist.
* `users` → `user_statistics`: Cascades on user deletion (`ON DELETE CASCADE`), maintaining 1:1 identity consistency.
* `sessions` → `skill_results`: Cascades on session deletion (`ON DELETE CASCADE`), preventing orphaned telemetry rows.
* `users` / `achievements` → `user_achievements`: Composite primary key `(user_id, achievement_id)` prevents duplicate awards. Cascades on deletion of either entity.

### 5.2. Check Constraints
1. **Non-Negative Scores**:
   * `sessions.overall_score >= 0`
   * `skill_results.score >= 0`
   * `user_statistics.best_score >= 0`
   * `user_statistics.avg_score >= 0.00`
2. **Normalized Percentage Bounds**:
   * `skill_results.accuracy >= 0.00 AND skill_results.accuracy <= 100.00`
3. **Execution Duration Integrity**:
   * `skill_results.time_taken >= 0.000`
4. **Structural Validity**:
   * `users.username`: Minimum length of 3 characters (`CHAR_LENGTH(TRIM(username)) >= 3`).
   * `users.email`: RFC standard pattern match check.
   * `achievements.title` & `challenges.content_reference`: Disallow empty whitespace strings.

---

## 6. Indexing Strategy

Indexes are explicitly configured on MySQL InnoDB to support sub-millisecond query performance:

| Index Name | Table | Target Columns | Target Query Workload |
| :--- | :--- | :--- | :--- |
| `idx_users_username` | `users` | `username` | User lookups and authentication |
| `idx_users_email` | `users` | `email` | Login and account validation |
| `idx_sessions_user_id` | `sessions` | `user_id` | User session lookups |
| `idx_sessions_session_date`| `sessions` | `session_date DESC` | Platform activity timeline & audits |
| `idx_sessions_overall_score`| `sessions` | `overall_score DESC`| Global all-time and seasonal leaderboards |
| `idx_sessions_user_date` | `sessions` | `user_id, session_date DESC` | User personal timeline & trend analysis |
| `idx_skill_results_session_id`| `skill_results`| `session_id` | Fetching results per session |
| `idx_skill_results_skill_type`| `skill_results`| `skill_type` | Cognitive domain segmentation |
| `idx_skill_results_type_score`| `skill_results`| `skill_type, score DESC` | Domain-specific high scores & percentiles |
| `idx_user_statistics_best_score`| `user_statistics`| `best_score DESC`| Instant global player ranking |
| `idx_user_statistics_avg_score` | `user_statistics`| `avg_score DESC` | Player consistency leaderboards |
| `idx_challenges_skill_type` | `challenges` | `skill_type` | Challenge engine query by domain |
| `idx_challenges_skill_difficulty` | `challenges` | `skill_type, difficulty` | Adaptive difficulty engine matching |
| `idx_user_achievements_user_id` | `user_achievements`| `user_id` | User showcase & profile badges |
| `idx_user_achievements_earned_date`| `user_achievements`| `earned_date DESC`| Recent achievement feed |

---

## 7. Database Connection Configuration

* **DBMS**: MySQL 8.0 Community Server (Active Windows Service: `MySQL80`)
* **Host**: `localhost`
* **Port**: `3306`
* **Username**: `root`
* **Password**: `ab34!cde`
* **Database**: `neurorush`
* **Charset / Collation**: `utf8mb4` / `utf8mb4_0900_ai_ci`
