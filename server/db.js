// db.js: Module for PostgreSQL database operations
// Creates a connection pool for efficient connection management
const { Pool } = require('pg');
require('dotenv').config();

// Create connection pool
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Export method for executing SQL queries
module.exports = {
    query: (text, params) => pool.query(text, params),
};