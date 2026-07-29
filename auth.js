/**
 * Auth routes
 * POST /api/auth/register  — create account
 * POST /api/auth/login     — get JWT
 * POST /api/auth/refresh   — refresh JWT
 * POST /api/auth/logout    — invalidate token (client-side only for now)
 */
const express       = require('express');
const bcrypt        = require('bcryptjs');
const jwt           = require('jsonwebtoken');
const router        = express.Router();
const db            = require('../config/db');
const userService   = require('../services/userService');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  // TODO Phase 2: implement user registration
  // 1. Validate email + password
  // 2. Hash password with bcrypt
  // 3. Insert user into DB
  // 4. Create default property profile for user
  // 5. Return JWT
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  // TODO Phase 2: implement login
  // 1. Look up user by email
  // 2. Compare password hash
  // 3. Return signed JWT containing { userId, propertyId, email, licenseKey }
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
  // TODO Phase 2: implement token refresh
  res.status(501).json({ error: 'Not yet implemented — Phase 2.' });
});

module.exports = router;
