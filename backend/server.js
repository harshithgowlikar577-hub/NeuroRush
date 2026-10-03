const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize database connection
require('./database/db');

// Import routes
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const memoryRoutes = require('./routes/memoryRoutes');
const reflexRoutes = require('./routes/reflexRoutes');
const attentionRoutes = require('./routes/attentionRoutes');
const typingRoutes = require('./routes/typingRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const progressionRoutes = require('./routes/progressionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const leaderboardRoutes = require('./routes/leaderboardRoutes');
const achievementRoutes = require('./routes/achievementRoutes');
const adaptiveRoutes = require('./routes/adaptiveRoutes');

const path = require('path');

const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// Global Middleware
app.use(cors());
app.use(express.json());

// Phase 11 Security: Rate Limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// Serve Static Frontend Assets (Phase 14 UI/UX Refinement)
app.use(express.static(path.join(__dirname, 'public')));
if (path.join(__dirname, '..', 'frontend')) {
    app.use(express.static(path.join(__dirname, '..', 'frontend')));
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/memory', memoryRoutes);
app.use('/api/reflex', reflexRoutes);
app.use('/api/attention', attentionRoutes);
app.use('/api/typing', typingRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/progression', progressionRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/adaptive', adaptiveRoutes);

// Health check route
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'NeuroRush Backend' });
});

// SPA Fallback for client-side routing
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 Handler for undefined API routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found.'
    });
});

// Global Error Handler (Hides stack traces for clean production response)
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err.message);
    res.status(500).json({
        success: false,
        message: 'Internal server error.'
    });
});

// Start Server (only when run directly or in non-serverless environment)
let server;
if (!process.env.VERCEL) {
    server = app.listen(PORT, () => {
        console.log(`NeuroRush Server running on port ${PORT}`);
    });
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
