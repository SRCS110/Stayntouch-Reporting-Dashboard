/**
 * Monthly actuals routes
 *
 * GET    /api/entries              — list all entries for property
 * POST   /api/entries              — create/upsert entry
 * PUT    /api/entries/:key         — update entry by key (YYYY-MM)
 * DELETE /api/entries/:key         — delete entry
 *
 * These mirror the localStorage 'hd_entries' array.
 * In Phase 2 the client's window.storage.get/set calls will hit these
 * endpoints instead of localStorage.
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const db      = require('../config/db');

// GET /api/entries
router.get('/', auth, async (req, res) => {
  // TODO Phase 2:
  // SELECT * FROM entries WHERE property_id = req.user.propertyId ORDER BY year, month
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

// POST /api/entries  (upsert by year+month key)
router.post('/', auth, async (req, res) => {
  // TODO Phase 2:
  // INSERT INTO entries (property_id, key, year, month, revenue, adr, occ)
  // ON CONFLICT (property_id, key) DO UPDATE SET ...
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

// PUT /api/entries/:key
router.put('/:key', auth, async (req, res) => {
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

// DELETE /api/entries/:key
router.delete('/:key', auth, async (req, res) => {
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

module.exports = router;
