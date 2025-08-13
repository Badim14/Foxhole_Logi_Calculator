// db.js: Module for PostgreSQL database operations
require('dotenv').config();
const { Pool } = require('pg');

// Configuration with fallbacks
const config = {
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'foxhole',
  user: process.env.DB_USER || 'foxhole',
  password: process.env.DB_PASSWORD || 'password',
  // Use connection string if provided, otherwise use individual config
  connectionString: process.env.DATABASE_URL,
};

// Create connection pool
const pool = new Pool(config);

// Test connection
pool.query('SELECT NOW()', (err) => {
  if (err) {
    console.error('❌ DB connection error:', err);
    console.error('🔧 Config used:', {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      // Don't log password for security
    });
  } else {
    console.log('✅ PostgreSQL connected successfully');
  }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Export method for executing SQL queries
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool,
};