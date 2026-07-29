# Hotel Performance Dashboard

A browser-based hotel reporting and analytics platform. Tracks revenue, ADR, occupancy, RevPAR, booking pace, daily calendar data, channel production, and financial budget vs. actuals.

**Current phase:** Client-side (Phase 1) — all data stored in browser localStorage, optional Google Drive sync.

**Roadmap:** Moving to a self-hosted server backend (Phase 2) with direct StayNTouch PMS integration via SFTP and REST API (Phase 3), and multi-tenant licensing (Phase 4).

---

## Live Demo

[https://YOUR-GITHUB-USERNAME.github.io/Licensable-dashboard](https://YOUR-GITHUB-USERNAME.github.io/Licensable-dashboard)

---

## Project Structure

```
Licensable-dashboard/
│
├── client/                        # Phase 1 — browser-only frontend (live now)
│   ├── index.html                 # Main dashboard
│   └── user-profile.html          # Property profile & settings manager
│
├── server/                        # Phase 2 — Node.js backend (future)
│   ├── index.js                   # Express app entry point
│   ├── config/
│   │   ├── db.js                  # Database connection (PostgreSQL)
│   │   └── env.example            # Environment variable template
│   ├── middleware/
│   │   ├── auth.js                # JWT authentication
│   │   ├── license.js             # License key validation
│   │   └── rateLimit.js           # API rate limiting
│   ├── routes/
│   │   ├── auth.js                # /api/auth — login, register, refresh
│   │   ├── properties.js          # /api/properties — property/profile CRUD
│   │   ├── entries.js             # /api/entries — monthly actuals
│   │   ├── pace.js                # /api/pace — pace snapshots
│   │   ├── daily.js               # /api/daily — daily calendar entries
│   │   └── financials.js          # /api/financials — budget & actuals
│   └── services/
│       ├── userService.js         # User account management
│       ├── dataService.js         # Data persistence layer
│       └── licenseService.js      # License key generation & validation
│
├── pipeline/                      # Phase 3 — PMS data integration (future)
│   ├── sftp/
│   │   ├── sftpClient.js          # StayNTouch SFTP connection & polling
│   │   ├── fileWatcher.js         # Watch for new PMS export files
│   │   └── scheduler.js           # Cron job runner
│   ├── api/
│   │   ├── stayntouch.js          # StayNTouch REST API client
│   │   ├── endpoints.js           # API endpoint constants
│   │   └── auth.js                # OAuth2 / API key handler
│   └── parsers/
│       ├── botbParser.js          # Business on the Books CSV parser (extracted from client)
│       ├── productionParser.js    # Production by Rate CSV parser
│       └── normalizer.js          # Normalize PMS data → dashboard schema
│
├── docs/
│   ├── ARCHITECTURE.md            # System design decisions
│   ├── API.md                     # REST API reference (Phase 2)
│   ├── SFTP_SETUP.md              # StayNTouch SFTP configuration guide
│   ├── LICENSING.md               # Commercial licensing model
│   └── DEPLOYMENT.md              # Server deployment guide
│
├── scripts/
│   ├── db-migrate.js              # Database schema migrations
│   ├── seed.js                    # Seed data for development
│   └── generate-license.js        # Generate license keys for customers
│
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml       # Auto-deploy client to GitHub Pages
│       └── test.yml               # Run tests on pull requests
│
├── .gitignore
├── package.json                   # Node.js manifest (Phase 2+)
├── LICENSE                        # MIT + Commons Clause
└── README.md                      # This file
```

---

## Phase 1 — Current (Browser-only)

Everything runs in the browser. No server required.

**Features:**
- Monthly actuals, booking pace, daily calendar
- RevPAR, ADR, occupancy tracking
- Financial budget vs. actuals
- Channel production by rate plan
- CSV import (Business on the Books, Production by Rate)
- Google Drive sync
- Property profile with persistent settings
- Password-gated access

**Data storage:** Browser `localStorage` under the `hd_` prefix.

### Run locally

Just open `client/index.html` in any modern browser. No build step required.

---

## Phase 2 — Server Backend (Planned)

A Node.js/Express server that replaces `localStorage` with a real database, adds user accounts, and enables multi-property / multi-user access.

**Tech stack planned:**
- Node.js + Express
- PostgreSQL (user data, property data, entries)
- JWT authentication
- License key validation middleware

**What changes for the client:**
- `window.storage` calls (already abstracted in the client) will point to `/api/` instead of `localStorage`
- No UI changes required — the storage abstraction layer handles the switch

---

## Phase 3 — StayNTouch PMS Integration (Planned)

Automated data pipeline replacing manual CSV uploads and Google Drive sync.

### Option A — SFTP (recommended first step)
StayNTouch can drop scheduled report exports (BotB, Production by Rate) into an SFTP folder. The pipeline polls that folder, parses new files, and pushes data to the database automatically.

**Flow:**
```
StayNTouch PMS → scheduled export → SFTP folder
                                        ↓
                               pipeline/sftp/fileWatcher.js
                                        ↓
                               pipeline/parsers/botbParser.js
                                        ↓
                               server/services/dataService.js
                                        ↓
                                   PostgreSQL DB
                                        ↓
                               client dashboard (live data)
```

### Option B — REST API
StayNTouch exposes a REST API. The pipeline authenticates with OAuth2 and pulls data on a schedule.

**Relevant StayNTouch endpoints (to be confirmed):**
- Business on the Books
- Daily Revenue
- Rate Plan Production

See `docs/SFTP_SETUP.md` and `pipeline/api/stayntouch.js` for implementation details.

---

## Phase 4 — Licensing & Multi-tenancy (Planned)

- License key generation per customer/property
- Tenant isolation (each property's data is separate)
- Usage-based billing hooks
- White-label support (custom branding per license)

See `docs/LICENSING.md` for the commercial licensing model.

---

## License

MIT + Commons Clause. Free for personal and evaluation use. A commercial license is required for paid deployment or SaaS use. See `LICENSE` for details.
