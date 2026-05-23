const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || '';

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: /railway|neon|render/i.test(DATABASE_URL) || process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
  : null;

function isPostgres() {
  return !!pool;
}

async function initDatabase() {
  if (!pool) return;
  await pool.query('SELECT 1');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_data (
      user_id    VARCHAR(16)  NOT NULL,
      file_key   VARCHAR(64)  NOT NULL,
      data       JSONB        NOT NULL,
      updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, file_key)
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_data_user_id ON user_data (user_id)
  `);
  console.log('PostgreSQL database initialized.');
}

module.exports = { pool, isPostgres, initDatabase };
