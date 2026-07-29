/**
 * Business on the Books (BotB) CSV Parser
 *
 * Extracted from client/index.html parseCSVContent() so the same logic
 * runs server-side in the pipeline without duplicating code.
 *
 * Also exports parseProduction() for Production by Rate CSVs.
 *
 * Phase 3 — used by pipeline/sftp/scheduler.js
 */

/* ── Core CSV parser ─────────────────────────────────────────────────── */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i+1] === '\n') i++;
        row.push(field); field = '';
        if (!(row.length === 1 && row[0] === '')) rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseNumeric(s) {
  const c = String(s || '').trim().replace(/,/g, '').replace(/%$/, '');
  return c === '' ? NaN : parseFloat(c);
}

function parseOcc(s) {
  const c = String(s || '').trim().replace(/,/g, '').replace(/%$/, '');
  if (c === '') return NaN;
  const v = parseFloat(c);
  return (v > 0 && v <= 1) ? v * 100 : v;
}

function parseDateCell(raw) {
  const s = (raw || '').trim();
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/); if (m) return { month:+m[1], day:+m[2], year:+m[3] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);   if (m) return { month:+m[1], day:+m[2], year:+m[3] };
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);          if (m) return { month:+m[2], day:+m[3], year:+m[1] };
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);   if (m) { const y=+m[3]; return { month:+m[1], day:+m[2], year: y<50?2000+y:1900+y }; }
  return null;
}

function findDirectColumn(top, pat) {
  for (let i = 0; i < top.length; i++) { if (pat.test((top[i] || '').trim())) return i; }
  return -1;
}

function findColumn(top, sub, gPat, sPat) {
  let carry = '';
  for (let i = 0; i < top.length; i++) {
    if (top[i] && top[i].trim() !== '') carry = top[i].trim();
    if (gPat.test(carry) && sPat.test((sub[i] || '').trim())) return i;
  }
  return -1;
}

function dailyKeyFor(y, m, d) {
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function monthKeyOf(y, m) { return `${y}-${m}`; }

/* ── BotB parser ─────────────────────────────────────────────────────── */
function parseBotB(text) {
  const allRows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (allRows.length < 3) throw new Error('File too short');

  // Locate header row (has DATE and RMS columns)
  let found = null;
  for (let i = 0; i < Math.min(6, allRows.length - 1); i++) {
    const r = allRows[i];
    if (r.some(c => /^date$/i.test((c || '').trim())) && r.some(c => /^rms$/i.test((c || '').trim()))) {
      found = { top: r, sub: allRows[i+1] || [], data: allRows.slice(i+2) };
      break;
    }
  }
  if (!found) throw new Error('Could not locate BotB header row (needs Date + RMS columns)');

  const { top, sub, data } = found;
  const dateCol = findDirectColumn(top, /^DATE$/i);
  const rmsCol  = findDirectColumn(top, /^RMS$/i);
  const occCol  = findDirectColumn(top, /^OCC\s*%?$/i);
  const rvnCol  = findColumn(top, sub, /TOTAL ROOMS/i, /^R(VN|ev)/i);
  const adrCol  = findColumn(top, sub, /TOTAL ROOMS/i, /^ADR/i);

  if (dateCol === -1 || occCol === -1 || rvnCol === -1 || adrCol === -1) {
    throw new Error(`BotB columns not found — Date:${dateCol} OCC:${occCol} Rvn:${rvnCol} ADR:${adrCol}`);
  }

  const dailyRows = [];
  data.forEach(r => {
    const d = parseDateCell(r[dateCol] || ''); if (!d) return;
    const dRev = parseNumeric(r[rvnCol]), dAdr = parseNumeric(r[adrCol]), dOcc = parseOcc(r[occCol]);
    const dRms = rmsCol !== -1 ? parseNumeric(r[rmsCol]) : NaN;
    if (isNaN(dRev) || isNaN(dAdr) || isNaN(dOcc)) return;
    dailyRows.push({
      key: dailyKeyFor(d.year, d.month, d.day),
      year: d.year, month: d.month, day: d.day,
      revenue: dRev, adr: dAdr, occ: dOcc,
      rms: isNaN(dRms) ? null : dRms
    });
  });

  // Aggregate daily rows to monthly
  const map = {};
  dailyRows.forEach(d => {
    const k = monthKeyOf(d.year, d.month);
    if (!map[k]) map[k] = { year:d.year, month:d.month, revenue:0, roomsSold:0, occSum:0, adrSum:0, days:0 };
    const e = map[k];
    e.revenue += d.revenue;
    e.roomsSold += isFinite(d.rms) ? d.rms : 0;
    e.occSum += d.occ; e.adrSum += d.adr; e.days++;
  });

  const monthlyAggs = Object.values(map).map(e => ({
    year: e.year, month: e.month, days: e.days, revenue: e.revenue,
    adr: e.roomsSold > 0 ? e.revenue / e.roomsSold : e.adrSum / e.days,
    occ: e.occSum / e.days
  })).sort((a, b) => a.year - b.year || a.month - b.month);

  return { dailyRows, monthlyAggs };
}

/* ── Production by Rate parser ───────────────────────────────────────── */
function parseProduction(text) {
  const allRows = parseCSV(text).filter(r => r.some(c => c.trim() !== ''));
  if (allRows.length < 2) throw new Error('File too short.');

  let headerRow = null, dataRows = [];
  for (let i = 0; i < Math.min(6, allRows.length - 1); i++) {
    if (/^rate$/i.test((allRows[i][0] || '').trim())) {
      headerRow = allRows[i]; dataRows = allRows.slice(i+1); break;
    }
  }
  if (!headerRow) throw new Error('Could not locate Production header row (first cell must be "RATE").');

  const dateStrings  = headerRow.slice(2).map(d => d.trim()).filter(d => d);
  const parsedDates  = dateStrings.map(parseDateCell).filter(Boolean);
  if (!parsedDates.length) throw new Error('No dates found in Production header.');

  const startD = parsedDates[0], endD = parsedDates[parsedDates.length - 1];
  const pad = n => String(n).padStart(2, '0');
  const label   = `${pad(startD.month)}/${pad(startD.day)}-${pad(endD.month)}/${pad(endD.day)}`;
  const weekKey = `${label}/${startD.year}`;
  const startDate = `${startD.year}-${pad(startD.month)}-${pad(startD.day)}`;
  const endDate   = `${endD.year}-${pad(endD.month)}-${pad(endD.day)}`;

  const plans = {};
  dataRows.forEach(row => {
    const rateName = (row[0] || '').trim(), metric = (row[1] || '').trim();
    if (/^rooms\s*#$/i.test(metric) && rateName.toLowerCase() !== 'undefined') {
      const weekTotal = dateStrings.reduce((sum, _, ci) => {
        const v = parseNumeric(row[2+ci]); return sum + (isNaN(v) ? 0 : v);
      }, 0);
      plans[rateName] = (plans[rateName] || 0) + weekTotal;
    }
  });

  if (!Object.keys(plans).length) throw new Error('No "Rooms #" rows found in Production file.');
  const total = Object.values(plans).reduce((s, v) => s + v, 0);

  return { weekKey, label, year: startD.year, startDate, endDate, plans, total };
}

module.exports = { parseBotB, parseProduction };
