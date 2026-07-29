/**
 * Data persistence service
 *
 * All database reads/writes for hotel data go through here.
 * Routes call this service; this service calls db.query().
 *
 * This keeps SQL out of route handlers and makes it easy to
 * swap the underlying store (e.g. PostgreSQL → a hosted DB) later.
 *
 * Phase 2 — stub. Implement each function when the DB is live.
 */
const db = require('../config/db');

/* ── Monthly entries ────────────────────────────────────────────────── */
async function getEntries(propertyId) {
  // TODO: SELECT * FROM entries WHERE property_id=$1 ORDER BY year,month
  return [];
}

async function upsertEntry(propertyId, entry) {
  // TODO: INSERT ... ON CONFLICT (property_id, key) DO UPDATE
}

async function deleteEntry(propertyId, key) {
  // TODO: DELETE FROM entries WHERE property_id=$1 AND key=$2
}

/* ── Pace snapshots ─────────────────────────────────────────────────── */
async function getPace(propertyId) { return []; }
async function upsertPace(propertyId, entry) {}
async function deletePace(propertyId, key) {}

/* ── Daily entries ──────────────────────────────────────────────────── */
async function getDailyEntries(propertyId, year, month) { return []; }
async function bulkUpsertDaily(propertyId, rows) {
  // TODO: batch insert with ON CONFLICT DO UPDATE — used by pipeline
}

/* ── Financial budget & actuals ─────────────────────────────────────── */
async function getFinBudget(propertyId) { return []; }
async function upsertFinBudget(propertyId, entry) {}
async function getFinActuals(propertyId) { return []; }
async function upsertFinActuals(propertyId, entry) {}

/* ── Property / profile ─────────────────────────────────────────────── */
async function getProperty(propertyId) { return null; }
async function updateProperty(propertyId, data) {}

/* ── Production weeks ───────────────────────────────────────────────── */
async function getProdWeeks(propertyId) { return []; }
async function upsertProdWeek(propertyId, week) {}

module.exports = {
  getEntries, upsertEntry, deleteEntry,
  getPace, upsertPace, deletePace,
  getDailyEntries, bulkUpsertDaily,
  getFinBudget, upsertFinBudget,
  getFinActuals, upsertFinActuals,
  getProperty, updateProperty,
  getProdWeeks, upsertProdWeek
};
