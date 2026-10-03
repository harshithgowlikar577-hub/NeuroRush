const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool using DATABASE_URL / MYSQL_URL (cloud deployments) or discrete variables
const dbConfig = (process.env.DATABASE_URL || process.env.MYSQL_URL)
    ? {
        uri: process.env.DATABASE_URL || process.env.MYSQL_URL,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'neurorush',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

const pool = mysql.createPool(dbConfig);

// Test connection on startup
(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('MySQL Connected Successfully');
        connection.release();
    } catch (error) {
        console.error('MySQL Connection Failed:', error.message);
    }
})();

module.exports = pool;
