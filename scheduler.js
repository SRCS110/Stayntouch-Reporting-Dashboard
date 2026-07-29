/**
 * SFTP Pipeline Scheduler
 *
 * Runs the StayNTouch SFTP pull on a configurable interval (default: every hour).
 * Parses new files and pushes data to the database via dataService.
 *
 * Run standalone:  node pipeline/sftp/scheduler.js
 * Or embed in the Express server by requiring this file in server/index.js
 *
 * Phase 3
 */
require('dotenv').config({ path: './server/config/.env' });
const cron         = require('node-cron');
const sftpClient   = require('./sftpClient');
const { parseBotB, parseProduction } = require('../parsers/botbParser');
const dataService  = require('../../server/services/dataService');

// Track which files we've already processed (in-memory; swap for DB in production)
const processedBotB        = new Set();
const processedProduction  = new Set();

const INTERVAL_MINUTES = parseInt(process.env.SFTP_POLL_INTERVAL_MINUTES || '60');

async function runPipeline(propertyId) {
  console.log(`[Pipeline] Starting SFTP pull — ${new Date().toISOString()}`);

  try {
    const { botb, production, errors } = await sftpClient.pullNewFiles(
      processedBotB,
      processedProduction
    );

    // Process BotB files
    for (const file of botb) {
      try {
        const { dailyRows, monthlyAggs } = parseBotB(file.content);
        await dataService.bulkUpsertDaily(propertyId, dailyRows);
        // Upsert monthly aggregates as actuals
        for (const agg of monthlyAggs) {
          await dataService.upsertEntry(propertyId, {
            key:     `${agg.year}-${String(agg.month).padStart(2,'0')}`,
            year:    agg.year,
            month:   agg.month,
            revenue: agg.revenue,
            adr:     agg.adr,
            occ:     agg.occ
          });
        }
        processedBotB.add(file.name);
        console.log(`[Pipeline] BotB processed: ${file.name} — ${dailyRows.length} daily rows`);
      } catch (e) {
        console.error(`[Pipeline] BotB parse error (${file.name}):`, e.message);
      }
    }

    // Process Production by Rate files
    for (const file of production) {
      try {
        const week = parseProduction(file.content);
        await dataService.upsertProdWeek(propertyId, week);
        processedProduction.add(file.name);
        console.log(`[Pipeline] Production processed: ${file.name}`);
      } catch (e) {
        console.error(`[Pipeline] Production parse error (${file.name}):`, e.message);
      }
    }

    if (errors.length) {
      console.warn(`[Pipeline] ${errors.length} download error(s):`, errors);
    }

    console.log(`[Pipeline] Cycle complete. BotB: ${botb.length}, Production: ${production.length}`);
  } catch (err) {
    console.error('[Pipeline] Fatal error in pull cycle:', err.message);
  }
}

// ── Schedule ──────────────────────────────────────────────────────────────
// Convert minutes to cron expression: every N minutes
const cronExpr = `*/${INTERVAL_MINUTES} * * * *`;

// TODO Phase 3: replace hardcoded propertyId with loop over all active properties
const PROPERTY_ID = process.env.DEFAULT_PROPERTY_ID || 1;

console.log(`[Pipeline] Scheduler starting — running every ${INTERVAL_MINUTES} minute(s).`);
runPipeline(PROPERTY_ID); // run immediately on start

cron.schedule(cronExpr, () => runPipeline(PROPERTY_ID));
