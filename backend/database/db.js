const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Create connection pool using DATABASE_URL / MYSQL_URL (cloud deployments) or discrete variables
// Support Railway, Aiven, PlanetScale, Render, and standard cloud MySQL variables
const connectionUri = process.env.DATABASE_URL 
    || process.env.MYSQL_URL 
    || process.env.MYSQL_PUBLIC_URL 
    || process.env.DATABASE_PUBLIC_URL;

const dbConfig = connectionUri
    ? {
        uri: connectionUri,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: (process.env.DB_SSL === 'true' || connectionUri.includes('ssl=')) ? { rejectUnauthorized: false } : undefined
    }
    : {
        host: process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
        port: parseInt(process.env.DB_PORT || process.env.MYSQLPORT, 10) || 3306,
        user: process.env.DB_USER || process.env.MYSQLUSER || 'root',
        password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || '',
        database: process.env.DB_NAME || process.env.MYSQLDATABASE || 'neurorush',
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
