/**
 * Property / profile routes
 * Mirrors the user-profile.html localStorage profile object.
 *
 * GET    /api/properties/:id       — get property profile
 * PUT    /api/properties/:id       — update profile (rooms, name, currency, etc.)
 * GET    /api/properties           — list all properties for user (multi-property Phase 4)
 */
const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');

router.get('/',    auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.get('/:id', auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));
router.put('/:id', auth, async (req, res) => res.status(501).json({ error: 'Phase 2.' }));

module.exports = router;
