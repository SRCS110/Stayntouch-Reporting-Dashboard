/**
 * db.js — Supabase data layer for Hotel Performance Dashboard
 *
 * Drop-in replacement for the window.storage localStorage polyfill.
 * Exposes the same window.storage API the dashboard already calls,
 * but reads/writes to Supabase Postgres instead of localStorage.
 *
 * Also exposes window.DB for direct table operations used by
 * user-profile.html and future StayNTouch pipeline writes.
 *
 * Key mapping (localStorage → Supabase table):
 *   hd_entries    → entries
 *   hd_pace       → pace_entries
 *   hd_daily      → daily_entries
 *   hd_settings   → properties (total_rooms column)
 *   hd_finBudget  → fin_budget
 *   hd_finActuals → fin_actuals
 *   hd_prodWeeks  → prod_weeks
 *   profile       → properties (all columns)
 *   drivePrefs    → properties (drive_folder_* columns)
 *
 * Depends on: auth.js (must load first)
 */

(async function initDB() {

  /* ── Wait for Supabase client to be ready ── */
  function waitForAuth(cb, tries = 0) {
    if (window.Auth && window.Auth.getClient) { cb(); return; }
    if (tries < 50) setTimeout(() => waitForAuth(cb, tries + 1), 100);
    else console.error('[db.js] Auth module never loaded');
  }

  waitForAuth(async () => {
    const sb = Auth.getClient();

    /* ════════════════════════════════════════════════════════════
       PROPERTY RESOLVER
       Every user has exactly one property row (created by the
       handle_new_user trigger). We cache the property_id here
       so we never make redundant SELECT calls.
    ════════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       PROPERTY RESOLVER — multi-property aware
       Supports multiple properties per user.
       Active property stored in Supabase active_property table
       and cached in localStorage as fallback.
    ════════════════════════════════════════════════════════════ */
    let _propertyId   = null;  // currently active property UUID
    let _propertyList = null;  // cached list of all accessible properties

    /* Get the active property ID — respects user's selection */
    async function getPropertyId() {
      if (_propertyId) return _propertyId;

      const user = (await sb.auth.getSession()).data.session?.user;
      if (!user) throw new Error('Not authenticated');

      // Check localStorage first (instant, avoids extra round-trip)
      const cached = localStorage.getItem('hd_active_property_' + user.id);

      // Load all accessible properties (owned + member)
      const list = await listAllProperties(user.id);
      if (!list.length) throw new Error('No properties found for this account');

      // Use cached selection if it's still valid
      if (cached && list.find(p => p.id === cached)) {
        _propertyId = cached;
        return _propertyId;
      }

      // Default to first property
      _propertyId = list[0].id;
      localStorage.setItem('hd_active_property_' + user.id, _propertyId);
      return _propertyId;
    }

    /* Load all properties this user owns or is a member of */
    async function listAllProperties(userId) {
      if (_propertyList) return _propertyList;

      // Owned properties
      const { data: owned } = await sb
        .from('properties')
        .select('id, name, city, state, total_rooms')
        .eq('user_id', userId)
        .order('name');

      // Member properties (invited)
      const { data: memberships } = await sb
        .from('property_members')
        .select('property_id, role, properties(id,name,city,state,total_rooms)')
        .eq('user_id', userId);

      const memberProps = (memberships || [])
        .filter(m => m.properties)
        .map(m => ({ ...m.properties, role: m.role, isMember: true }));

      // Merge, deduplicate
      const all = [
        ...(owned || []).map(p => ({ ...p, role: 'admin', isOwner: true })),
        ...memberProps.filter(m => !(owned||[]).find(o => o.id === m.id))
      ];

      _propertyList = all;
      return _propertyList;
    }

    /* Switch to a different property — clears all cached data */
    function switchToProperty(propertyId) {
      _propertyId   = propertyId;
      _propertyList = null;
      // Persist selection
      sb.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          localStorage.setItem('hd_active_property_' + data.session.user.id, propertyId);
          // Also persist to Supabase
          sb.from('active_property').upsert({
            user_id:     data.session.user.id,
            property_id: propertyId,
            updated_at:  new Date().toISOString()
          }, { onConflict: 'user_id' }).then(() => {});
        }
      });
    }

    /* Expose switch function globally for index.html to call */
    window._dbSwitchProperty = switchToProperty;
    window._dbListProperties  = () => _propertyList;

    /* Reset on sign-out */
    Auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        _propertyId   = null;
        _propertyList = null;
      }
    });

    /* ════════════════════════════════════════════════════════════
       GENERIC ARRAY TABLE HELPERS
       Used for entries, pace_entries, daily_entries, fin_budget,
       fin_actuals, prod_weeks — all share the same shape.
    ════════════════════════════════════════════════════════════ */

    async function loadTable(tableName) {
      const pid = await getPropertyId();
      const PAGE = 1000;
      let allRows = [];
      let from = 0;

      while (true) {
        const { data, error } = await sb
          .from(tableName)
          .select('*')
          .eq('property_id', pid)
          .order('year', { ascending: true })
          .range(from, from + PAGE - 1);

        if (error) throw new Error(`Load ${tableName} failed: ` + error.message);
        const rows = data || [];
        allRows = allRows.concat(rows);

        // If we got a full page there may be more — keep going
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      return allRows;
    }

    async function upsertRows(tableName, rows) {
      if (!rows) return;
      const pid = await getPropertyId();

      // Get current keys in Supabase for this property
      const { data: existing, error: fetchErr } = await sb
        .from(tableName)
        .select('key')
        .eq('property_id', pid);
      if (fetchErr) throw new Error(`Fetch keys ${tableName} failed: ` + fetchErr.message);

      const existingKeys = new Set((existing || []).map(r => r.key));
      const newKeys      = new Set(rows.map(r => r.key));

      // Delete rows that exist in DB but are no longer in the array
      const toDelete = [...existingKeys].filter(k => !newKeys.has(k));
      if (toDelete.length) {
        const { error: delErr } = await sb
          .from(tableName)
          .delete()
          .eq('property_id', pid)
          .in('key', toDelete);
        if (delErr) throw new Error(`Delete stale ${tableName} rows failed: ` + delErr.message);
      }

      // Upsert all current rows
      if (rows.length) {
        const payload = rows.map(r => ({ ...r, property_id: pid }));
        const { error: upsertErr } = await sb
          .from(tableName)
          .upsert(payload, { onConflict: 'property_id,key' });
        if (upsertErr) throw new Error(`Upsert ${tableName} failed: ` + upsertErr.message);
      }
    }

    async function deleteRow(tableName, key) {
      const pid = await getPropertyId();
      const { error } = await sb
        .from(tableName)
        .delete()
        .eq('property_id', pid)
        .eq('key', key);
      if (error) throw new Error(`Delete ${tableName}/${key} failed: ` + error.message);
    }

    /* ════════════════════════════════════════════════════════════
       COLUMN MAPPING
       Converts camelCase JS objects ↔ snake_case DB columns
       for tables that need it (fin_budget, fin_actuals, prod_weeks)
    ════════════════════════════════════════════════════════════ */

    function toFinBudgetRow(r) {
      return {
        key: r.key, year: r.year, month: r.month,
        room_rev:   r.roomRev   ?? 0,
        room_fees:  r.roomFees  ?? 0,
        restaurant: r.restaurant ?? 0,
        parking:    r.parking   ?? 0,
        misc:       r.misc      ?? 0
      };
    }
    function fromFinBudgetRow(r) {
      return {
        key: r.key, year: r.year, month: r.month,
        roomRev:    r.room_rev   ?? 0,
        roomFees:   r.room_fees  ?? 0,
        restaurant: r.restaurant ?? 0,
        parking:    r.parking    ?? 0,
        misc:       r.misc       ?? 0
      };
    }
    function toFinActualsRow(r) {
      return {
        key: r.key, year: r.year, month: r.month,
        room_fees:  r.roomFees  ?? 0,
        restaurant: r.restaurant ?? 0,
        parking:    r.parking   ?? 0,
        misc:       r.misc      ?? 0
      };
    }
    function fromFinActualsRow(r) {
      return {
        key: r.key, year: r.year, month: r.month,
        roomFees:   r.room_fees  ?? 0,
        restaurant: r.restaurant ?? 0,
        parking:    r.parking    ?? 0,
        misc:       r.misc       ?? 0
      };
    }
    function toProdWeekRow(r) {
      return {
        week_key:   r.weekKey ?? r.week_key,
        label:      r.label,
        year:       r.year,
        start_date: r.startDate ?? r.start_date,
        end_date:   r.endDate   ?? r.end_date,
        plans:      r.plans,
        total:      r.total,
        // prod_weeks uses week_key not key — handled separately
        key:        r.weekKey ?? r.week_key
      };
    }
    function fromProdWeekRow(r) {
      return {
        weekKey:   r.week_key,
        key:       r.week_key,
        label:     r.label,
        year:      r.year,
        startDate: r.start_date,
        endDate:   r.end_date,
        plans:     r.plans,
        total:     r.total
      };
    }

    /* ════════════════════════════════════════════════════════════
       window.storage REPLACEMENT
       Exact same API as the localStorage polyfill:
         get(key)        → { key, value: JSON string }
         set(key, value) → { key, value }
         delete(key)     → { key, deleted: true }
         list(prefix)    → { keys: [...] }

       The dashboard calls these as:
         window.storage.get('entries')   → parses JSON → entries[]
         window.storage.set('entries', JSON.stringify(entries))
    ════════════════════════════════════════════════════════════ */

    window.storage = {

      async get(key) {
        try {
          switch (key) {

            /* ── Monthly actuals ── */
            case 'entries': {
              const rows = await loadTable('entries');
              const mapped = rows.map(r => ({
                key:     r.key,
                year:    r.year,
                month:   r.month,
                revenue: parseFloat(r.revenue) || 0,
                adr:     parseFloat(r.adr)     || 0,
                occ:     parseFloat(r.occ)     || 0
              }));
              return { key, value: JSON.stringify(mapped) };
            }

            /* ── Pace snapshots ── */
            case 'pace': {
              const rows = await loadTable('pace_entries');
              const mapped = rows.map(r => ({
                key:       r.key,
                year:      r.year,
                month:     r.month,
                asOfDate:  r.as_of_date || null,
                revenue:   parseFloat(r.revenue) || 0,
                adr:       parseFloat(r.adr)     || 0,
                occ:       parseFloat(r.occ)     || 0
              }));
              return { key, value: JSON.stringify(mapped) };
            }

            /* ── Daily entries ── */
            case 'daily': {
              const rows = await loadTable('daily_entries');
              // Map Supabase snake_case → dashboard expected shape
              const mapped = rows.map(r => ({
                key:     r.key,
                year:    r.year,
                month:   r.month,
                day:     r.day,
                revenue: parseFloat(r.revenue) || 0,
                adr:     parseFloat(r.adr)     || 0,
                occ:     parseFloat(r.occ)     || 0,
                rms:     r.rms != null ? parseInt(r.rms) : null,
                source:  r.source || 'upload'
              }));
              return { key, value: JSON.stringify(mapped) };
            }

            /* ── Settings (rooms) — stored on properties row ── */
            case 'settings': {
              const pid = await getPropertyId();
              const { data, error } = await sb
                .from('properties')
                .select('total_rooms, currency, fiscal_year_start')
                .eq('id', pid)
                .single();
              if (error) throw error;
              return {
                key,
                value: JSON.stringify({
                  rooms:             data.total_rooms,
                  currency:          data.currency || '$',
                  fiscalYearStart:   data.fiscal_year_start || 1
                })
              };
            }

            /* ── Financial budget ── */
            case 'finBudget': {
              const rows = await loadTable('fin_budget');
              return { key, value: JSON.stringify(rows.map(fromFinBudgetRow)) };
            }

            /* ── Financial actuals ── */
            case 'finActuals': {
              const rows = await loadTable('fin_actuals');
              return { key, value: JSON.stringify(rows.map(fromFinActualsRow)) };
            }

            /* ── Production weeks ── */
            case 'prodWeeks': {
              const pid = await getPropertyId();
              const { data, error } = await sb
                .from('prod_weeks')
                .select('*')
                .eq('property_id', pid)
                .order('year', { ascending: true });
              if (error) throw error;
              return { key, value: JSON.stringify((data || []).map(fromProdWeekRow)) };
            }

            /* ── Drive prefs — stored on properties row ── */
            case 'drivePrefs': {
              const pid = await getPropertyId();
              const { data, error } = await sb
                .from('properties')
                .select('drive_folder_current, drive_folder_historical, drive_folder_production')
                .eq('id', pid)
                .single();
              if (error) throw error;
              return {
                key,
                value: JSON.stringify({
                  folderName:     data.drive_folder_current    || '',
                  histFolderName: data.drive_folder_historical || '',
                  prodFolderName: data.drive_folder_production || ''
                })
              };
            }

            default:
              throw new Error('Unknown storage key: ' + key);
          }
        } catch (e) {
          // Return null-equivalent so callers fall back to empty state
          console.warn('[db.js] get(' + key + ') failed:', e.message);
          throw e;
        }
      },

      async set(key, value) {
        try {
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;

          switch (key) {

            case 'entries':
              await upsertRows('entries', parsed);
              return { key, value };

            case 'pace': {
              // pace_entries: map asOfDate → as_of_date for Supabase
              const pid = await getPropertyId();
              const mapped = parsed.map(r => ({
                key:         r.key,
                year:        r.year,
                month:       r.month,
                as_of_date:  r.asOfDate || r.as_of_date || null,
                revenue:     r.revenue  || 0,
                adr:         r.adr      || 0,
                occ:         r.occ      || 0,
                property_id: pid
              }));
              // Sync deletions then upsert
              const { data: existing } = await sb
                .from('pace_entries').select('key').eq('property_id', pid);
              const existingKeys = new Set((existing||[]).map(r=>r.key));
              const newKeys = new Set(mapped.map(r=>r.key));
              const toDelete = [...existingKeys].filter(k=>!newKeys.has(k));
              if (toDelete.length) {
                await sb.from('pace_entries').delete()
                  .eq('property_id', pid).in('key', toDelete);
              }
              if (mapped.length) {
                const { error } = await sb.from('pace_entries')
                  .upsert(mapped, { onConflict: 'property_id,key' });
                if (error) throw new Error('Upsert pace_entries failed: ' + error.message);
              }
              return { key, value };
            }

            case 'daily': {
              // daily_entries: sync deletions then upsert
              // Must include day column explicitly
              const pid = await getPropertyId();
              const parsed = typeof value === 'string' ? JSON.parse(value) : value;

              // Get existing keys
              const { data: existing } = await sb
                .from('daily_entries').select('key').eq('property_id', pid);
              const existingKeys = new Set((existing||[]).map(r=>r.key));
              const newKeys = new Set(parsed.map(r=>r.key));
              const toDelete = [...existingKeys].filter(k=>!newKeys.has(k));

              if (toDelete.length) {
                await sb.from('daily_entries').delete()
                  .eq('property_id', pid).in('key', toDelete);
              }
              if (parsed.length) {
                const payload = parsed.map(r => ({
                  key:         r.key,
                  year:        r.year,
                  month:       r.month,
                  day:         r.day,
                  revenue:     r.revenue,
                  adr:         r.adr,
                  occ:         r.occ,
                  rms:         r.rms || null,
                  source:      r.source || 'upload',
                  property_id: pid
                }));
                const { error } = await sb.from('daily_entries')
                  .upsert(payload, { onConflict: 'property_id,key' });
                if (error) throw new Error('Upsert daily_entries failed: ' + error.message);
              }
              return { key, value };
            }

            case 'settings': {
              const pid = await getPropertyId();
              const update = {};
              if (parsed.rooms             != null) update.total_rooms         = parsed.rooms;
              if (parsed.currency          != null) update.currency            = parsed.currency;
              if (parsed.fiscalYearStart   != null) update.fiscal_year_start   = parsed.fiscalYearStart;
              if (Object.keys(update).length) {
                update.updated_at = new Date().toISOString();
                const { error } = await sb.from('properties').update(update).eq('id', pid);
                if (error) throw error;
              }
              return { key, value };
            }

            case 'finBudget':
              await upsertRows('fin_budget', parsed.map(toFinBudgetRow));
              return { key, value };

            case 'finActuals':
              await upsertRows('fin_actuals', parsed.map(toFinActualsRow));
              return { key, value };

            case 'prodWeeks': {
              const pid = await getPropertyId();
              // Sync deletions by week_key, then upsert remaining
              const { data: existingWK } = await sb
                .from('prod_weeks').select('week_key').eq('property_id', pid);
              const existingSet = new Set((existingWK||[]).map(r=>r.week_key));
              const newSet = new Set(parsed.map(r=>r.weekKey||r.week_key));
              const toDelete = [...existingSet].filter(k=>!newSet.has(k));
              if (toDelete.length) {
                await sb.from('prod_weeks').delete()
                  .eq('property_id', pid).in('week_key', toDelete);
              }
              if (parsed.length) {
                const payload = parsed.map(r => ({ ...toProdWeekRow(r), property_id: pid }));
                const { error } = await sb.from('prod_weeks')
                  .upsert(payload, { onConflict: 'property_id,week_key' });
                if (error) throw error;
              }
              return { key, value };
            }

            case 'drivePrefs': {
              const pid = await getPropertyId();
              const update = {
                drive_folder_current:    parsed.folderName     || null,
                drive_folder_historical: parsed.histFolderName || null,
                drive_folder_production: parsed.prodFolderName || null,
                updated_at: new Date().toISOString()
              };
              const { error } = await sb.from('properties').update(update).eq('id', pid);
              if (error) throw error;
              return { key, value };
            }

            default:
              console.warn('[db.js] set: unknown key', key);
              return null;
          }
        } catch (e) {
          console.error('[db.js] set(' + key + ') failed:', e.message);
          return null;
        }
      },

      async delete(key, filter) {
        try {
          // filter = { key: 'YYYY-MM' } for row-level deletes
          if (filter && filter.key) {
            const tableMap = {
              entries:    'entries',
              pace:       'pace_entries',
              daily:      'daily_entries',
              finBudget:  'fin_budget',
              finActuals: 'fin_actuals'
            };
            if (tableMap[key]) {
              await deleteRow(tableMap[key], filter.key);
              return { key, deleted: true };
            }
          }
          return { key, deleted: false };
        } catch (e) {
          console.error('[db.js] delete(' + key + ') failed:', e.message);
          return null;
        }
      },

      async list(prefix) {
        // The dashboard doesn't heavily use list() — return known keys
        const known = ['entries','pace','daily','settings','finBudget','finActuals','prodWeeks'];
        return { keys: prefix ? known.filter(k => k.startsWith(prefix)) : known };
      }
    };

    /* ════════════════════════════════════════════════════════════
       window.DB — direct table API for user-profile.html
       and future StayNTouch pipeline writes
    ════════════════════════════════════════════════════════════ */

    window.DB = {

      /* Get the full property profile */
      async getProfile() {
        const pid = await getPropertyId();
        const { data, error } = await sb
          .from('properties')
          .select('*')
          .eq('id', pid)
          .single();
        if (error) throw error;
        return data;
      },

      /* Save the full property profile */
      async saveProfile(profile) {
        const pid = await getPropertyId();
        const update = {
          name:                    profile.propName            || profile.name,
          brand:                   profile.propBrand           || profile.brand,
          city:                    profile.propCity            || profile.city,
          state:                   profile.propState           || profile.state,
          notes:                   profile.propNotes           || profile.notes,
          total_rooms:             profile.totalRooms ? parseInt(profile.totalRooms, 10) : null,
          room_types:              profile.roomTypes           || null,
          currency:                profile.currency            || '$',
          fiscal_year_start:       profile.fiscalYearStart ? parseInt(profile.fiscalYearStart, 10) : 1,
          revenue_sources:         profile.revenueSources      || null,
          comp_set:                profile.compSet             || null,
          drive_folder_current:    profile.driveFolderCurrent  || null,
          drive_folder_historical: profile.driveFolderHistorical || null,
          drive_folder_production: profile.driveFolderProduction || null,
          updated_at:              new Date().toISOString()
        };
        const { error } = await sb.from('properties').update(update).eq('id', pid);
        if (error) throw error;
        return update;
      },

      /* Bulk upsert daily rows — used by SFTP/API pipeline in Phase 3 */
      async bulkUpsertDaily(rows) {
        const pid = await getPropertyId();
        if (!rows || !rows.length) return;
        const payload = rows.map(r => ({
          key:         r.key,
          year:        r.year,
          month:       r.month,
          day:         r.day,
          revenue:     r.revenue,
          adr:         r.adr,
          occ:         r.occ,
          rms:         r.rms || null,
          source:      r.source || 'pipeline',
          property_id: pid
        }));
        const { error } = await sb
          .from('daily_entries')
          .upsert(payload, { onConflict: 'property_id,key' });
        if (error) throw error;
      },

      /* Delete a single row from any table by key */
      async deleteByKey(table, key) {
        await deleteRow(table, key);
      },

      /* ── Multi-property management ─────────────────────────────── */

      /* List all properties this user owns or is a member of */
      async listProperties() {
        const user = (await sb.auth.getSession()).data.session?.user;
        if (!user) throw new Error('Not authenticated');
        return await listAllProperties(user.id);
      },

      /* Create a new property for this user */
      async createProperty(name) {
        const user = (await sb.auth.getSession()).data.session?.user;
        if (!user) throw new Error('Not authenticated');
        const { data, error } = await sb
          .from('properties')
          .insert({ user_id: user.id, name, currency: '$', fiscal_year_start: 1 })
          .select('id, name')
          .single();
        if (error) throw new Error('createProperty failed: ' + error.message);
        _propertyList = null; // bust cache
        return data;
      },

      /* Switch active property — reloads all dashboard data */
      switchProperty(propertyId) {
        switchToProperty(propertyId);
      },

      /* Get current active property ID */
      async getActivePropertyId() {
        return await getPropertyId();
      },

      /* ── Team management (property_members) ────────────────────── */

      /* List all members of the active property */
      async listMembers() {
        const pid = await getPropertyId();

        // Get members
        const { data: members, error } = await sb
          .from('property_members')
          .select('id, user_id, role, invited_at')
          .eq('property_id', pid)
          .order('invited_at');
        if (error) throw new Error('listMembers failed: ' + error.message);
        if (!members || !members.length) return [];

        // Get emails from the member_emails view
        const userIds = members.map(m => m.user_id);
        const { data: emails } = await sb
          .from('member_emails')
          .select('id, email')
          .in('id', userIds);

        const emailMap = {};
        (emails || []).forEach(e => { emailMap[e.id] = e.email; });

        return members.map(m => ({
          id:        m.id,
          userId:    m.user_id,
          email:     emailMap[m.user_id] || m.user_id,
          role:      m.role,
          invitedAt: m.invited_at
        }));
      },

      /* Invite a user by email to the active property.
         Flow:
         1. Write a pending_invites row (tracked regardless of user state)
         2. If user already exists → add to property_members immediately
         3. If new user → send OTP magic link; trigger adds them on sign-in */
      async inviteUser(email, role = 'viewer') {
        const pid  = await getPropertyId();
        const user = (await sb.auth.getSession()).data.session?.user;
        if (!user) throw new Error('Not authenticated');

        // Always write a pending invite record first
        const { error: piErr } = await sb
          .from('pending_invites')
          .upsert({
            property_id: pid,
            email:       email.toLowerCase().trim(),
            role,
            invited_by:  user.id,
            accepted_at: null
          }, { onConflict: 'property_id,email' });
        if (piErr) throw new Error('Could not record invite: ' + piErr.message);

        // Check if user already has an account (via member_emails view)
        try {
          const { data: existing } = await sb
            .from('member_emails')
            .select('id, email')
            .eq('email', email.toLowerCase().trim())
            .maybeSingle();

          if (existing?.id) {
            // User exists — add to property_members immediately
            await sb.from('property_members').upsert({
              property_id: pid,
              user_id:     existing.id,
              role,
              invited_by:  user.id
            }, { onConflict: 'property_id,user_id' });

            // Mark invite as accepted
            await sb.from('pending_invites')
              .update({ accepted_at: new Date().toISOString() })
              .eq('property_id', pid)
              .eq('email', email.toLowerCase().trim());

            return { email, role, status: 'added' };
          }
        } catch(e) {
          // member_emails view may not exist yet — continue to OTP
        }

        // New user — send magic link sign-in email
        const { error: otpErr } = await sb.auth.signInWithOtp({
          email: email.toLowerCase().trim(),
          options: {
            shouldCreateUser: true,
            emailRedirectTo:  `${location.origin}/index.html`
          }
        });
        if (otpErr) throw new Error('Invite email failed: ' + otpErr.message);

        return { email, role, status: 'invited' };
      },

      /* Update a member's role */
      async updateMemberRole(memberId, role) {
        const { error } = await sb
          .from('property_members')
          .update({ role })
          .eq('id', memberId);
        if (error) throw new Error('updateMemberRole failed: ' + error.message);
      },

      /* Remove a member from the active property */
      async removeMember(memberId) {
        const { error } = await sb
          .from('property_members')
          .delete()
          .eq('id', memberId);
        if (error) throw new Error('removeMember failed: ' + error.message);
      },

      /* Check if current user is owner of active property */
      async isOwner() {
        const pid  = await getPropertyId();
        const user = (await sb.auth.getSession()).data.session?.user;
        if (!user) return false;
        const { data } = await sb
          .from('properties')
          .select('id')
          .eq('id', pid)
          .eq('user_id', user.id)
          .maybeSingle();
        return !!data;
      },

      /* ── STLY Upload Log ──────────────────────────────────────
         Stores every "Reservations by User by Date Range" upload.
         Table: stly_uploads
         Columns: id, property_id, slot, filename, uploaded_at,
                  arrival_month, arrival_year, room_nights,
                  total_revenue, report_date
      ── */

      /* Save a new STLY upload record */
      async saveSTLYUpload(entry) {
        const pid = await getPropertyId();
        const { error } = await sb.from('stly_uploads').insert({
          property_id:    pid,
          slot:           entry.slot,           // 'current' | 'prior'
          filename:       entry.filename || null,
          uploaded_at:    entry.uploadedAt || new Date().toISOString(),
          arrival_month:  entry.arrivalMonth || null,
          arrival_year:   entry.arrivalYear  || null,
          room_nights:    entry.roomNights,
          total_revenue:  entry.totalRevenue,
          report_date:    entry.reportDate   || null
        });
        if (error) throw new Error('saveSTLYUpload failed: ' + error.message);
      },

      /* Get all STLY upload history for this property, newest first */
      async getSTLYUploads() {
        const pid = await getPropertyId();
        const { data, error } = await sb
          .from('stly_uploads')
          .select('*')
          .eq('property_id', pid)
          .order('uploaded_at', { ascending: false })
          .limit(100);
        if (error) throw new Error('getSTLYUploads failed: ' + error.message);
        return (data || []).map(r => ({
          id:            r.id,
          slot:          r.slot,
          filename:      r.filename,
          uploadedAt:    r.uploaded_at,
          arrivalMonth:  r.arrival_month,
          arrivalYear:   r.arrival_year,
          roomNights:    r.room_nights,
          totalRevenue:  r.total_revenue,
          reportDate:    r.report_date
        }));
      },

      /* Delete a single STLY upload record by its UUID */
      async deleteSTLYUpload(id) {
        const { error } = await sb
          .from('stly_uploads')
          .delete()
          .eq('id', id);
        if (error) throw new Error('deleteSTLYUpload failed: ' + error.message);
      },

      /* Delete all STLY upload history for this property */
      async clearSTLYUploads() {
        const pid = await getPropertyId();
        const { error } = await sb
          .from('stly_uploads')
          .delete()
          .eq('property_id', pid);
        if (error) throw new Error('clearSTLYUploads failed: ' + error.message);
      },

      /* Save the current active STLY data (the two loaded files) ─
         Stored as a single row per property in stly_current.
         Upserts on property_id so there's always exactly one row. */
      async saveSTLYCurrent(stlyData) {
        const pid = await getPropertyId();
        const { error } = await sb
          .from('stly_current')
          .upsert({
            property_id:          pid,
            current_room_nights:  stlyData.current?.roomNights  ?? null,
            current_total_revenue:stlyData.current?.totalRevenue?? null,
            prior_room_nights:    stlyData.prior?.roomNights    ?? null,
            prior_total_revenue:  stlyData.prior?.totalRevenue  ?? null,
            updated_at:           new Date().toISOString()
          }, { onConflict: 'property_id' });
        if (error) throw new Error('saveSTLYCurrent failed: ' + error.message);
      },

      /* Get the current active STLY data */
      async getSTLYCurrent() {
        const pid = await getPropertyId();
        const { data, error } = await sb
          .from('stly_current')
          .select('*')
          .eq('property_id', pid)
          .maybeSingle();
        if (error) throw new Error('getSTLYCurrent failed: ' + error.message);
        if (!data) return { current: null, prior: null };
        return {
          current: data.current_room_nights != null ? {
            roomNights:   data.current_room_nights,
            totalRevenue: data.current_total_revenue
          } : null,
          prior: data.prior_room_nights != null ? {
            roomNights:   data.prior_room_nights,
            totalRevenue: data.prior_total_revenue
          } : null
        };
      },

      /* Raw Supabase client — for advanced queries */
      client: sb
    };

    /* ════════════════════════════════════════════════════════════
       DRIVE PREFS MIGRATION
       On first load, migrate any existing localStorage drive prefs
       to Supabase so they aren't lost in the transition.
    ════════════════════════════════════════════════════════════ */
    (async () => {
      try {
        const existing = localStorage.getItem('hotelDrivePrefs');
        const migrated = localStorage.getItem('hd_db_migrated_drive');
        if (existing && !migrated) {
          const prefs = JSON.parse(existing);
          await window.storage.set('drivePrefs', JSON.stringify({
            folderName:     prefs.folderName     || '',
            histFolderName: prefs.histFolderName || '',
            prodFolderName: prefs.prodFolderName || ''
          }));
          localStorage.setItem('hd_db_migrated_drive', '1');
          console.log('[db.js] Drive prefs migrated to Supabase.');
        }
      } catch (e) {
        // Non-fatal — Drive prefs can be re-entered
      }
    })();

    console.log('[db.js] Supabase storage layer ready.');
    window._dbReady = true;

    // Clear stale localStorage hd_ cache so it never serves as a fallback
    // once Supabase is confirmed working. Data lives in Supabase now.
    try {
      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('hd_') &&
        !['hd_stly','hd_stly_log','hd_db_migrated_drive'].includes(k));
      keysToRemove.forEach(k => localStorage.removeItem(k));
      if (keysToRemove.length) console.log(`[db.js] Cleared ${keysToRemove.length} stale localStorage keys.`);
    } catch(e) {}

    document.dispatchEvent(new Event('db:ready'));
  });

})();
