/**
 * API rate limiting — prevents abuse and protects the server.
 * 100 requests per IP per 15 minutes in production.
 */
const rateLimit = require('express-rate-limit');

module.exports = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' }
});
