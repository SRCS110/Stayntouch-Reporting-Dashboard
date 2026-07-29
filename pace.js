/**
 * Booking pace snapshot routes
 * Mirrors localStorage 'hd_pace' array.
 *
 * GET    /api/pace
 * POST   /api/pace
 * PUT    /api/pace/:key
 * DELETE /api/pace/:key
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

router.get('/',        auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.post('/',       auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.put('/:key',    auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.delete('/:key', auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));

module.exports = router;
