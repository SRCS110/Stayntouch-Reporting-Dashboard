# StayNTouch SFTP Setup Guide

## Overview

StayNTouch can schedule automatic CSV report exports to an SFTP server. The pipeline polls this server hourly and imports new files into the database automatically, replacing manual CSV uploads and Google Drive sync.

## Step 1 — Request SFTP access from StayNTouch

Contact your StayNTouch account manager and request:
1. SFTP credentials (host, username, password or SSH key)
2. Scheduled export configuration for:
   - **Business on the Books** (daily, covers current + future dates)
   - **Production by Rate** (weekly)
3. Confirm the folder paths where exports will be dropped

## Step 2 — Configure the pipeline

Copy `server/config/env.example` to `server/config/.env` and fill in:

```
SFTP_HOST=sftp.stayntouch.com
SFTP_PORT=22
SFTP_USER=your_sftp_username
SFTP_PASSWORD=your_sftp_password
SFTP_BOTB_FOLDER=/exports/business-on-books
SFTP_PRODUCTION_FOLDER=/exports/production-by-rate
SFTP_POLL_INTERVAL_MINUTES=60
```

## Step 3 — Test the connection

```bash
node -e "
  require('dotenv').config({ path: './server/config/.env' });
  const sftp = require('./pipeline/sftp/sftpClient');
  sftp.connect().then(() => { console.log('Connected!'); sftp.disconnect(); });
"
```

## Step 4 — Run the pipeline

```bash
node pipeline/sftp/scheduler.js
```

Or embed in the main server by adding to `server/index.js`:

```js
if (process.env.SFTP_HOST) {
  require('../pipeline/sftp/scheduler');
}
```

## CSV Format Requirements

The pipeline parsers expect the same format as the manual CSV import in the dashboard.

### Business on the Books
- Must contain a header row with `DATE` and `RMS` columns
- Revenue, ADR, and Occupancy columns under a `TOTAL ROOMS` group header

### Production by Rate
- First column must be `RATE`
- Date columns across the top (one per day of the week)
- A `Rooms #` metric row per rate plan

If your StayNTouch export format differs, update `pipeline/parsers/botbParser.js`.

## Scheduling

StayNTouch exports are typically scheduled in their reporting module. Recommended schedule:
- **BotB**: daily at 6:00 AM (covers data through the previous day)
- **Production by Rate**: weekly on Monday morning

The pipeline will pick up any new files automatically within the poll interval.
