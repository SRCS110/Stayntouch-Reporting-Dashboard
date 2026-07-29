/**
 * StayNTouch SFTP Client
 *
 * Connects to the StayNTouch SFTP server and downloads new export files.
 * StayNTouch drops scheduled CSV exports into two folders:
 *   - Business on the Books (BotB) daily occupancy
 *   - Production by Rate (channel production)
 *
 * Phase 3 — configure SFTP credentials in server/config/.env
 *
 * Dependencies: ssh2-sftp-client (in package.json)
 */
const SftpClient = require('ssh2-sftp-client');
const path       = require('path');
const fs         = require('fs');

const sftp = new SftpClient();

async function connect() {
  const config = {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22'),
    username: process.env.SFTP_USER,
  };

  // Support either password or private key auth
  if (process.env.SFTP_PRIVATE_KEY_PATH) {
    config.privateKey = fs.readFileSync(process.env.SFTP_PRIVATE_KEY_PATH);
  } else {
    config.password = process.env.SFTP_PASSWORD;
  }

  await sftp.connect(config);
  console.log('[SFTP] Connected to StayNTouch SFTP server.');
}

async function disconnect() {
  await sftp.end();
  console.log('[SFTP] Disconnected.');
}

/**
 * List files in a remote folder, returning only those not yet processed.
 * @param {string} remotePath   - SFTP folder path
 * @param {Set<string>} seen    - set of filenames already imported
 * @returns {Array<{name, path}>}
 */
async function listNewFiles(remotePath, seen = new Set()) {
  const files = await sftp.list(remotePath);
  return files
    .filter(f => f.type === '-' && f.name.endsWith('.csv') && !seen.has(f.name))
    .map(f => ({ name: f.name, path: path.posix.join(remotePath, f.name) }));
}

/**
 * Download a remote file as a string.
 * @param {string} remotePath
 * @returns {string} file content
 */
async function downloadFile(remotePath) {
  const buffer = await sftp.get(remotePath);
  return buffer.toString('utf8');
}

/**
 * Full pull cycle: connect, list new files in each folder, download and return them.
 * @param {Set<string>} processedBotB       - already-imported BotB filenames
 * @param {Set<string>} processedProduction - already-imported Production filenames
 */
async function pullNewFiles(processedBotB, processedProduction) {
  const results = { botb: [], production: [], errors: [] };

  try {
    await connect();

    // Business on the Books
    const botbFolder = process.env.SFTP_BOTB_FOLDER || '/exports/business-on-books';
    const newBotB    = await listNewFiles(botbFolder, processedBotB);
    for (const file of newBotB) {
      try {
        const content = await downloadFile(file.path);
        results.botb.push({ name: file.name, content });
        console.log(`[SFTP] Downloaded BotB: ${file.name}`);
      } catch (e) {
        results.errors.push({ file: file.name, error: e.message });
      }
    }

    // Production by Rate
    const prodFolder = process.env.SFTP_PRODUCTION_FOLDER || '/exports/production-by-rate';
    const newProd    = await listNewFiles(prodFolder, processedProduction);
    for (const file of newProd) {
      try {
        const content = await downloadFile(file.path);
        results.production.push({ name: file.name, content });
        console.log(`[SFTP] Downloaded Production: ${file.name}`);
      } catch (e) {
        results.errors.push({ file: file.name, error: e.message });
      }
    }

  } finally {
    await disconnect();
  }

  return results;
}

module.exports = { pullNewFiles, connect, disconnect, listNewFiles, downloadFile };
