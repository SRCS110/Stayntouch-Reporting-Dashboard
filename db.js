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
    let _propertyId = null;

    async function getPropertyId() {
      if (_propertyId) return _propertyId;
      const user = (await sb.auth.getUser()).data.user;
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await sb
        .from('properties')
        .select('id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      if (error) throw new Error('Could not load property: ' + error.message);
      _propertyId = data.id;
      return _propertyId;
    }

    /* Reset cached ID on sign-out (handles account switching) */
    Auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') _propertyId = null;
    });

    /* ════════════════════════════════════════════════════════════
       GENERIC ARRAY TABLE HELPERS
       Used for entries, pace_entries, daily_entries, fin_budget,
       fin_actuals, prod_weeks — all share the same shape.
    ════════════════════════════════════════════════════════════ */

    async function loadTable(tableName) {
      const pid = await getPropertyId();
      const { data, error } = await sb
        .from(tableName)
        .select('*')
        .eq('property_id', pid)
        .order('year', { ascending: true });
      if (error) throw new Error(`Load ${tableName} failed: ` + error.message);
      return data || [];
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
              return { key, value: JSON.stringify(rows) };
            }

            /* ── Pace snapshots ── */
            case 'pace': {
              const rows = await loadTable('pace_entries');
              return { key, value: JSON.stringify(rows) };
            }

            /* ── Daily entries ── */
            case 'daily': {
              const rows = await loadTable('daily_entries');
              return { key, value: JSON.stringify(rows) };
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

            case 'pace':
              await upsertRows('pace_entries', parsed);
              return { key, value };

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
