/**
 * Daily calendar entries routes
 * Mirrors localStorage 'hd_daily' array.
 * In Phase 3, this table is populated automatically by the PMS pipeline.
 *
 * GET    /api/daily?year=2026&month=7
 * POST   /api/daily           (bulk upsert from CSV import or pipeline)
 * DELETE /api/daily/:key      (YYYY-MM-DD)
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

router.get('/',        auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.post('/',       auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.delete('/:key', auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));

module.exports = router;
