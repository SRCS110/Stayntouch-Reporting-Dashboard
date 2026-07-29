# Architecture

## Phase 1 — Browser Client (current)

All logic runs in the browser. No server required. Data is stored in `localStorage` under the `hd_` prefix and accessed via a `window.storage` abstraction layer.

```
Browser
  └── client/index.html          (dashboard UI + JS)
  └── client/user-profile.html   (profile settings)
        └── window.storage       (abstraction layer)
              └── localStorage   (hd_entries, hd_settings, hd_pace, ...)
```

The `window.storage` abstraction is the key architectural decision that makes Phase 2 possible without rewriting the client. In Phase 2, this object's methods will point to the API instead of localStorage.

## Phase 2 — Server Backend

```
Browser
  └── client/index.html
        └── window.storage (now points to /api/ endpoints)
              └── server/index.js (Express)
                    ├── middleware/auth.js (JWT)
                    ├── middleware/license.js (license check)
                    ├── routes/*.js
                    └── services/dataService.js
                          └── PostgreSQL
```

### Switching from localStorage to the API

The client's `window.storage` polyfill in `client/index.html` will be swapped from:

```js
// Phase 1
window.storage = {
  get:  async (k)    => { return { value: localStorage.getItem('hd_'+k) }; },
  set:  async (k, v) => { localStorage.setItem('hd_'+k, v); },
  ...
};
```

To:

```js
// Phase 2
window.storage = {
  get:  async (k)    => { const r = await fetch(`/api/storage/${k}`, {headers: authHeaders()}); return r.json(); },
  set:  async (k, v) => { await fetch(`/api/storage/${k}`, {method:'PUT', body:v, headers: authHeaders()}); },
  ...
};
```

No other client code changes required.

## Phase 3 — PMS Pipeline

```
StayNTouch PMS
  └── SFTP export (hourly)           OR    REST API (polled)
        └── pipeline/sftp/scheduler.js      pipeline/api/stayntouch.js
              └── pipeline/parsers/botbParser.js
                    └── server/services/dataService.js
                          └── PostgreSQL
                                └── API serves to client
```

## Phase 4 — Multi-tenancy & Licensing

Each customer (property or hotel group) has:
- A user account with a license key
- An isolated `property_id` that scopes all their data
- A license tier (TRIAL / PRO / MULTI) enforced by middleware

License keys are generated with `scripts/generate-license.js` and validated on every API request by `middleware/license.js`.
