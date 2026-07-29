/**
 * User account management service
 * Phase 2 — stub
 */
const db     = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

async function createUser({ email, password, propertyName }) {
  // TODO Phase 2
  // 1. Check email not already in use
  // 2. Hash password
  // 3. INSERT INTO users (email, password_hash) RETURNING id
  // 4. INSERT INTO properties (user_id, name) RETURNING id
  // 5. Return { userId, propertyId, token }
  throw new Error('Not yet implemented — Phase 2.');
}

async function loginUser({ email, password }) {
  // TODO Phase 2
  // 1. SELECT * FROM users WHERE email = $1
  // 2. bcrypt.compare(password, user.password_hash)
  // 3. Sign and return JWT
  throw new Error('Not yet implemented — Phase 2.');
}

async function getUserById(userId) {
  // TODO Phase 2
  throw new Error('Not yet implemented — Phase 2.');
}

module.exports = { createUser, loginUser, getUserById };
