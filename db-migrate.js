/**
 * Database migration script
 *
 * Run once to create all tables:
 *   node scripts/db-migrate.js
 *
 * Phase 2
 */
require('dotenv').config({ path: './server/config/.env' });
const db = require('./server/config/db');

async function migrate() {
  console.log('Running migrations…');

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      license_key   TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS properties (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT,
      brand           TEXT,
      city            TEXT,
      state           TEXT,
      total_rooms     INTEGER,
      currency        TEXT DEFAULT '$',
      fiscal_year_start INTEGER DEFAULT 1,
      drive_folder_current    TEXT,
      drive_folder_historical TEXT,
      drive_folder_production TEXT,
      notes           TEXT,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS entries (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      revenue     NUMERIC(14,2),
      adr         NUMERIC(10,2),
      occ         NUMERIC(6,3),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(property_id, key)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS pace_entries (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      as_of_date  DATE,
      revenue     NUMERIC(14,2),
      adr         NUMERIC(10,2),
      occ         NUMERIC(6,3),
      UNIQUE(property_id, key)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS daily_entries (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      day         INTEGER NOT NULL,
      revenue     NUMERIC(14,2),
      adr         NUMERIC(10,2),
      occ         NUMERIC(6,3),
      rms         INTEGER,
      source      TEXT DEFAULT 'manual',
      imported_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(property_id, key)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS fin_budget (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      room_rev    NUMERIC(14,2) DEFAULT 0,
      room_fees   NUMERIC(14,2) DEFAULT 0,
      restaurant  NUMERIC(14,2) DEFAULT 0,
      parking     NUMERIC(14,2) DEFAULT 0,
      UNIQUE(property_id, key)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS fin_actuals (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      key         TEXT NOT NULL,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      room_fees   NUMERIC(14,2) DEFAULT 0,
      restaurant  NUMERIC(14,2) DEFAULT 0,
      parking     NUMERIC(14,2) DEFAULT 0,
      UNIQUE(property_id, key)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS prod_weeks (
      id          SERIAL PRIMARY KEY,
      property_id INTEGER REFERENCES properties(id) ON DELETE CASCADE,
      week_key    TEXT NOT NULL,
      label       TEXT,
      year        INTEGER,
      start_date  DATE,
      end_date    DATE,
      plans       JSONB,
      total       INTEGER,
      UNIQUE(property_id, week_key)
    );
  `);

  console.log('✓ All tables created.');
  process.exit(0);
}

migrate().catch(err => { console.error('Migration failed:', err); process.exit(1); });
