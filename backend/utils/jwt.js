const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_development_only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Generate a JWT token containing user_id and username
 * @param {Object} payload - { user_id, username }
 * @returns {string} Signed JWT token
 */
const generateToken = (payload) => {
    return jwt.sign(
        {
            user_id: payload.user_id,
            username: payload.username
        },
        JWT_SECRET,
        {
            expiresIn: JWT_EXPIRES_IN
        }
    );
};

/**
 * Verify a JWT token
 * @param {string} token
 * @returns {Object} Decoded payload
 */
const verifyToken = (token) => {
    return jwt.verify(token, JWT_SECRET);
};

module.exports = {
    generateToken,
    verifyToken
};
