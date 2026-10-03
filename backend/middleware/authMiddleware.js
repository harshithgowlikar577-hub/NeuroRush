const { verifyToken } = require('../utils/jwt');

/**
 * Authentication Middleware
 * Validates JWT from Authorization header and attaches user info to request
 */
const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        const token = authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. Malformed token format.'
            });
        }

        const decoded = verifyToken(token);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired. Please log in again.'
            });
        }

        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token.'
        });
    }
};

module.exports = authMiddleware;
