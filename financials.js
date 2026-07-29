/**
 * Financial budget & actuals routes
 * Mirrors 'hd_finBudget' and 'hd_finActuals' localStorage arrays.
 *
 * GET  /api/financials/budget
 * POST /api/financials/budget
 * GET  /api/financials/actuals
 * POST /api/financials/actuals
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

router.get('/budget',   auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.post('/budget',  auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.get('/actuals',  auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.post('/actuals', auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));

module.exports = router;
