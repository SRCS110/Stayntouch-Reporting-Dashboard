/**
 * PostgreSQL connection pool.
 * Phase 2 — not active until server is deployed.
 */
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Keep connections alive in production
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected DB client error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
