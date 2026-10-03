const bcrypt = require('bcryptjs');
const db = require('../database/db');
const { generateToken } = require('../utils/jwt');

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // 1. Validation
        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields (username, email, password) are required.'
            });
        }

        if (username.trim().length < 3) {
            return res.status(400).json({
                success: false,
                message: 'Username must be at least 3 characters long.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long.'
            });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address.'
            });
        }

        // 2. Check for duplicate username or email
        const [existingUsers] = await db.query(
            'SELECT username, email FROM users WHERE username = ? OR email = ?',
            [username.trim(), email.trim().toLowerCase()]
        );

        if (existingUsers.length > 0) {
            const conflict = existingUsers[0];
            if (conflict.username.toLowerCase() === username.trim().toLowerCase()) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists.'
                });
            }
            if (conflict.email.toLowerCase() === email.trim().toLowerCase()) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already exists.'
                });
            }
        }

        // 3. Hash password using bcrypt
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // 4. Insert into users table
        await db.query(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username.trim(), email.trim().toLowerCase(), password_hash]
        );

        // Fetch inserted user record (excluding password_hash)
        const [rows] = await db.query(
            'SELECT user_id, username, email, created_at FROM users WHERE email = ?',
            [email.trim().toLowerCase()]
        );

        const newUser = rows[0];

        // Initialize user_statistics record (1:1 relationship with users)
        await db.query(
            'INSERT INTO user_statistics (user_id, best_score, avg_score, total_sessions) VALUES (?, 0, 0.00, 0)',
            [newUser.user_id]
        );

        return res.status(201).json({
            success: true,
            message: 'User Registered Successfully',
            user: {
                user_id: newUser.user_id,
                username: newUser.username,
                email: newUser.email,
                created_at: newUser.created_at
            }
        });

    } catch (error) {
        // Handle MySQL unique constraint violation fallback
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage && error.sqlMessage.includes('uq_users_username')) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists.'
                });
            }
            if (error.sqlMessage && error.sqlMessage.includes('uq_users_email')) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already exists.'
                });
            }
        }

        console.error('Registration Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during registration.'
        });
    }
};

/**
 * Login existing user
 * POST /api/auth/login
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Validation
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required.'
            });
        }

        // 2. Query user from database
        const [users] = await db.query(
            'SELECT user_id, username, email, password_hash FROM users WHERE email = ?',
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        const user = users[0];

        // 3. Verify password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password.'
            });
        }

        // 4. Generate JWT token
        const token = generateToken({
            user_id: user.user_id,
            username: user.username
        });

        // 5. Response (Never return password_hash)
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user_id: user.user_id,
            username: user.username,
            email: user.email
        });

    } catch (error) {
        console.error('Login Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred during login.'
        });
    }
};

/**
 * Get current authenticated user details (Protected Route)
 * GET /api/auth/me
 */
const getMe = async (req, res) => {
    try {
        const userId = req.user.user_id;

        const [users] = await db.query(
            'SELECT user_id, username, email, created_at FROM users WHERE user_id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found.'
            });
        }

        const user = users[0];

        return res.status(200).json({
            success: true,
            user_id: user.user_id,
            username: user.username,
            email: user.email,
            created_at: user.created_at
        });

    } catch (error) {
        console.error('GetMe Error:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Database error occurred while fetching user profile.'
        });
    }
};

module.exports = {
    register,
    login,
    getMe
};
