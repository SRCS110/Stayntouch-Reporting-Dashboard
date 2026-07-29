/**
 * Hotel Performance Dashboard — API Server
 * Phase 2: Replaces browser localStorage with a real database backend.
 *
 * STATUS: Framework stub — not yet active.
 * The Phase 1 client (client/index.html) uses localStorage and does not
 * require this server. This file is the starting point for Phase 2.
 */

require('dotenv').config({ path: './server/config/.env' });
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('./middleware/rateLimit');

// Route handlers (Phase 2 — stub files exist, logic to be implemented)
const authRoutes        = require('./routes/auth');
const propertiesRoutes  = require('./routes/properties');
const entriesRoutes     = require('./routes/entries');
const paceRoutes        = require('./routes/pace');
const dailyRoutes       = require('./routes/daily');
const financialsRoutes  = require('./routes/financials');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing middleware ──────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:8080',
  credentials: true
}));
app.use(express.json());
app.use(rateLimit);

// ── Static client (Phase 1 files served from /client) ─────────────────────
app.use(express.static('client'));

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/properties',  propertiesRoutes);
app.use('/api/entries',     entriesRoutes);
app.use('/api/pace',        paceRoutes);
app.use('/api/daily',       dailyRoutes);
app.use('/api/financials',  financialsRoutes);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    phase: 1,        // bump to 2 when DB is live
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ── 404 fallback ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Hotel Dashboard API running on port ${PORT}`);
  console.log(`Phase 1 client: http://localhost:${PORT}/index.html`);
});

module.exports = app;
