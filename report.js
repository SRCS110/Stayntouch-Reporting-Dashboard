/**
 * report.js — Hotel Performance Dashboard PDF Report Generator
 *
 * Generates a multi-page PDF report from live dashboard data.
 * Called by the "Export PDF" button in index.html.
 * Depends on: jsPDF + jspdf-autotable (loaded via CDN in index.html)
 *
 * Report sections:
 *   Page 1  — Cover page (property name, report date, period)
 *   Page 2  — MTD Performance (KPIs vs LY)
 *   Page 3  — Forward Pace (current BotB on-books vs LY actuals, 4 months)
 *   Page 4  — Booking Pace — Same Time Last Year (STLY comparison)
 *   Page 5  — Financial Summary (budget vs actuals, all categories)
 *   Page 6  — Monthly Detail (YTD actuals table)
 */

window.generateReport = function(ctx) {
  const {
    entries, paceEntries, dailyEntries, finBudget, finActuals,
    stlyData, totalRooms, currencySymbol, activeProfile,
    fmtMoney, fmtMoney2, fmtPct, MONTHS,
    getMonthlyOnBooks, getAllOnBooksMonths, daysInMonth,
    availableRoomNights, keyFor
  } = ctx;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  /* ── Design tokens ── */
  const C = {
    orange:  [230, 126, 34],
    navy:    [26,  35,  50],
    green:   [39,  174, 96],
    red:     [231, 76,  60],
    blue:    [46,  134, 193],
    ink:     [26,  35,  50],
    soft:    [107, 122, 141],
    line:    [227, 232, 239],
    paper:   [242, 244, 247],
    white:   [255, 255, 255],
    good:    [39,  174, 96],
    bad:     [231, 76,  60],
  };

  const W = 215.9; // letter width mm
  const H = 279.4; // letter height mm
  const ML = 16, MR = 16, MT = 16;
  const CW = W - ML - MR; // content width

  const today = new Date();
  const pad = n => String(n).padStart(2,'0');
  const todayStr = today.toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
  const curMonth = today.getMonth() + 1;
  const curYear  = today.getFullYear();
  const propName = activeProfile?.name || activeProfile?.propName || 'Hotel Property';
  const rooms    = totalRooms || 0;

  /* ── Helpers ── */
  function setFont(size, weight='normal', color=C.ink) {
    doc.setFontSize(size);
    doc.setFont('helvetica', weight);
    doc.setTextColor(...color);
  }
  function rect(x, y, w, h, color, radius=0) {
    doc.setFillColor(...color);
    doc.roundedRect(x, y, w, h, radius, radius, 'F');
  }
  function hLine(y, color=C.line, x1=ML, x2=W-MR) {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.3);
    doc.line(x1, y, x2, y);
  }
  function varColor(actual, budget) {
    if(actual === null || budget === null || budget === 0) return C.soft;
    return actual >= budget ? C.good : C.bad;
  }
  function varStr(actual, budget, fmt='pct') {
    if(actual === null || budget === null || budget === 0) return '—';
    const diff = actual - budget;
    const pct = (diff / Math.abs(budget)) * 100;
    if(fmt === 'pct') return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    return `${diff >= 0 ? '+' : ''}${fmtMoney(diff)}`;
  }
  function deltaStr(cur, prior) {
    if(!cur || !prior || prior === 0) return '—';
    const p = ((cur - prior) / Math.abs(prior)) * 100;
    return `${p >= 0 ? '+' : ''}${p.toFixed(1)}%`;
  }
  function deltaColor(cur, prior) {
    if(!cur || !prior) return C.soft;
    return cur >= prior ? C.good : C.bad;
  }
  function sectionHeader(doc, y, title) {
    rect(ML, y, CW, 7, C.navy);
    setFont(9, 'bold', C.white);
    doc.text(title.toUpperCase(), ML + 4, y + 5);
    return y + 10;
  }
  function pageHeader(doc, pageNum, pageTitle) {
    rect(0, 0, W, 12, C.orange);
    setFont(9, 'bold', C.white);
    doc.text(propName, ML, 8);
    setFont(7.5, 'normal', [255,255,255,180]);
    doc.text(pageTitle, W/2, 8, { align:'center' });
    doc.text(`Page ${pageNum}`, W - MR, 8, { align:'right' });
    return 20;
  }
  function pageFooter(doc) {
    hLine(H - 10, C.line);
    setFont(7, 'normal', C.soft);
    doc.text(`Generated ${todayStr} · SNT Reporting Platform · sntreporting.srcs.online`, W/2, H - 5, { align:'center' });
  }

  /* ── KPI box helper ── */
  function kpiBox(x, y, w, label, value, lyValue, unit='') {
    rect(x, y, w - 2, 28, C.paper, 2);
    setFont(6.5, 'bold', C.soft);
    doc.text(label.toUpperCase(), x + 4, y + 6);
    setFont(13, 'bold', C.ink);
    doc.text(value, x + 4, y + 17);
    if(lyValue !== null && lyValue !== undefined) {
      const dStr = deltaStr(
        parseFloat(value.replace(/[$,%]/g,'')),
        parseFloat(lyValue.replace(/[$,%]/g,''))
      );
      const dColor = deltaColor(
        parseFloat(value.replace(/[$,%]/g,'')),
        parseFloat(lyValue.replace(/[$,%]/g,''))
      );
      setFont(7, 'bold', dColor);
      doc.text(dStr + ' vs LY', x + 4, y + 23);
      setFont(6.5, 'normal', C.soft);
      doc.text('LY: ' + lyValue, x + w - 6, y + 23, { align:'right' });
    }
  }

  /* ════════════════════════════════════════
     PAGE 1 — COVER
  ════════════════════════════════════════ */
  // Orange header band
  rect(0, 0, W, 60, C.orange);

  // Property name
  setFont(22, 'bold', C.white);
  doc.text(propName, W/2, 22, { align:'center' });

  // Report title
  setFont(12, 'normal', [255,255,255]);
  doc.text('Monthly Performance Report', W/2, 32, { align:'center' });

  // Period badge
  rect(W/2 - 35, 38, 70, 10, [255,255,255,40], 5);
  setFont(9, 'bold', C.white);
  const periodLabel = `${MONTHS[curMonth-1]} ${curYear} · MTD + Forward Pace`;
  doc.text(periodLabel, W/2, 45, { align:'center' });

  // Generated date
  setFont(8, 'normal', [255,255,255,180]);
  doc.text(`Generated ${todayStr}`, W/2, 55, { align:'center' });

  // Info grid
  let cy = 72;
  const infoItems = [
    ['Property', propName],
    ['Total Rooms', rooms ? `${rooms} rooms` : 'Not set'],
    ['Report Period', `${MONTHS[curMonth-1]} ${curYear} (Month-to-Date)`],
    ['Currency', currencySymbol || '$'],
    ['Report Date', todayStr],
    ['Platform', 'SNT Reporting Platform'],
  ];
  setFont(8, 'bold', C.soft);
  doc.text('REPORT DETAILS', ML, cy); cy += 5;
  hLine(cy, C.line); cy += 5;

  infoItems.forEach(([k, v]) => {
    setFont(7.5, 'bold', C.soft);
    doc.text(k, ML, cy);
    setFont(7.5, 'normal', C.ink);
    doc.text(v, ML + 45, cy);
    cy += 6;
  });

  // Contents
  cy += 6;
  hLine(cy, C.line); cy += 6;
  setFont(8, 'bold', C.soft);
  doc.text('CONTENTS', ML, cy); cy += 6;
  const contents = [
    ['Page 2', 'Month-to-Date Performance — KPIs vs Last Year'],
    ['Page 3', 'Forward Pace — Current BotB On-Books vs LY Actuals'],
    ['Page 4', 'Booking Pace — Same Time Last Year (STLY)'],
    ['Page 5', 'Financial Summary — Budget vs Actuals'],
    ['Page 6', 'Year-to-Date Monthly Detail'],
  ];
  contents.forEach(([pg, title]) => {
    setFont(7.5, 'bold', C.blue);
    doc.text(pg, ML, cy);
    setFont(7.5, 'normal', C.ink);
    doc.text(title, ML + 14, cy);
    cy += 6;
  });

  // Confidentiality footer
  cy = H - 25;
  hLine(cy, C.line); cy += 6;
  setFont(7, 'normal', C.soft);
  doc.text('CONFIDENTIAL — For internal use and authorized recipients only.', W/2, cy, { align:'center' });
  doc.text('Generated by SNT Reporting Platform · sntreporting.srcs.online', W/2, cy + 5, { align:'center' });

  /* ════════════════════════════════════════
     PAGE 2 — MTD PERFORMANCE KPIs
  ════════════════════════════════════════ */
  doc.addPage();
  cy = pageHeader(doc, 2, 'Month-to-Date Performance');

  // Get MTD data from daily entries
  const mtdDays = dailyEntries.filter(d => d.year === curYear && d.month === curMonth);
  const mtdRev  = mtdDays.reduce((s,d) => s + (parseFloat(d.revenue)||0), 0);
  const mtdRms  = mtdDays.reduce((s,d) => s + (parseInt(d.rms)||0), 0);
  const mtdOccSum = mtdDays.reduce((s,d) => s + (parseFloat(d.occ)||0), 0);
  const mtdADR  = mtdRms > 0 ? mtdRev / mtdRms : 0;
  const mtdOcc  = mtdDays.length > 0 ? mtdOccSum / mtdDays.length : 0;
  const arn     = rooms && mtdDays.length ? rooms * mtdDays.length : null;
  const mtdRevPAR = arn ? mtdRev / arn : null;

  // LY same period
  const lyDays = dailyEntries.filter(d => d.year === curYear-1 && d.month === curMonth && d.day <= today.getDate());
  const lyRev  = lyDays.reduce((s,d) => s + (parseFloat(d.revenue)||0), 0);
  const lyRms  = lyDays.reduce((s,d) => s + (parseInt(d.rms)||0), 0);
  const lyOccSum = lyDays.reduce((s,d) => s + (parseFloat(d.occ)||0), 0);
  const lyADR  = lyRms > 0 ? lyRev / lyRms : 0;
  const lyOcc  = lyDays.length > 0 ? lyOccSum / lyDays.length : 0;
  const lyArn  = rooms && lyDays.length ? rooms * lyDays.length : null;
  const lyRevPAR = lyArn ? lyRev / lyArn : null;

  // Also get full-month actuals from entries
  const monthActual = entries.find(e => e.year === curYear && e.month === curMonth);
  const lyActual    = entries.find(e => e.year === curYear-1 && e.month === curMonth);

  cy = sectionHeader(doc, cy, `Month to Date — ${MONTHS[curMonth-1]} ${curYear} (through ${MONTHS[curMonth-1]} ${today.getDate()})`);
  cy += 2;

  // KPI boxes — 4 across
  const bw = CW / 4;
  kpiBox(ML,          cy, bw, 'MTD Revenue',   mtdRev>0?fmtMoney(mtdRev):'—',   lyRev>0?fmtMoney(lyRev):null);
  kpiBox(ML + bw,     cy, bw, 'MTD ADR',       mtdADR>0?fmtMoney2(mtdADR):'—',  lyADR>0?fmtMoney2(lyADR):null);
  kpiBox(ML + bw*2,   cy, bw, 'MTD Occupancy', mtdOcc>0?fmtPct(mtdOcc):'—',     lyOcc>0?fmtPct(lyOcc):null);
  kpiBox(ML + bw*3,   cy, bw, 'MTD RevPAR',    mtdRevPAR?fmtMoney2(mtdRevPAR):'—', lyRevPAR?fmtMoney2(lyRevPAR):null);
  cy += 32;

  // YTD summary
  cy = sectionHeader(doc, cy, `Year to Date — ${curYear} vs ${curYear-1}`);
  cy += 2;

  const ytdEntries = entries.filter(e => e.year === curYear && e.month <= curMonth);
  const ytdLY      = entries.filter(e => e.year === curYear-1 && e.month <= curMonth);
  const ytdRev  = ytdEntries.reduce((s,e) => s+e.revenue, 0);
  const ytdLYRev = ytdLY.reduce((s,e) => s+e.revenue, 0);
  const ytdADR  = ytdEntries.length ? ytdEntries.reduce((s,e)=>s+e.adr,0)/ytdEntries.length : 0;
  const ytdLYADR = ytdLY.length ? ytdLY.reduce((s,e)=>s+e.adr,0)/ytdLY.length : 0;
  const ytdOcc  = ytdEntries.length ? ytdEntries.reduce((s,e)=>s+e.occ,0)/ytdEntries.length : 0;
  const ytdLYOcc = ytdLY.length ? ytdLY.reduce((s,e)=>s+e.occ,0)/ytdLY.length : 0;
  const ytdRevPAR = rooms&&ytdEntries.length ? ytdRev/ytdEntries.reduce((s,e)=>s+availableRoomNights(e.year,e.month),0) : null;
  const ytdLYRevPAR = rooms&&ytdLY.length ? ytdLYRev/ytdLY.reduce((s,e)=>s+availableRoomNights(e.year,e.month),0) : null;

  kpiBox(ML,        cy, bw, 'YTD Revenue',   ytdRev>0?fmtMoney(ytdRev):'—',    ytdLYRev>0?fmtMoney(ytdLYRev):null);
  kpiBox(ML+bw,     cy, bw, 'YTD ADR',       ytdADR>0?fmtMoney2(ytdADR):'—',   ytdLYADR>0?fmtMoney2(ytdLYADR):null);
  kpiBox(ML+bw*2,   cy, bw, 'YTD Occupancy', ytdOcc>0?fmtPct(ytdOcc):'—',      ytdLYOcc>0?fmtPct(ytdLYOcc):null);
  kpiBox(ML+bw*3,   cy, bw, 'YTD RevPAR',    ytdRevPAR?fmtMoney2(ytdRevPAR):'—', ytdLYRevPAR?fmtMoney2(ytdLYRevPAR):null);
  cy += 32;

  // Current month detail table
  cy = sectionHeader(doc, cy, `${MONTHS[curMonth-1]} ${curYear} — Daily Summary vs Prior Year`);
  cy += 2;

  doc.autoTable({
    startY: cy,
    margin: { left: ML, right: MR },
    head: [['Metric', `${MONTHS[curMonth-1]} ${curYear} MTD`, `${MONTHS[curMonth-1]} ${curYear-1} (same days)`, 'Variance $', 'Variance %']],
    body: [
      ['Revenue',   mtdRev>0?fmtMoney(mtdRev):'—',     lyRev>0?fmtMoney(lyRev):'—',     mtdRev&&lyRev?fmtMoney(mtdRev-lyRev):'—',   deltaStr(mtdRev,lyRev)],
      ['ADR',       mtdADR>0?fmtMoney2(mtdADR):'—',    lyADR>0?fmtMoney2(lyADR):'—',    mtdADR&&lyADR?fmtMoney2(mtdADR-lyADR):'—', deltaStr(mtdADR,lyADR)],
      ['Occupancy', mtdOcc>0?fmtPct(mtdOcc):'—',       lyOcc>0?fmtPct(lyOcc):'—',       '—',                                        deltaStr(mtdOcc,lyOcc)],
      ['RevPAR',    mtdRevPAR?fmtMoney2(mtdRevPAR):'—',lyRevPAR?fmtMoney2(lyRevPAR):'—','—',                                        deltaStr(mtdRevPAR,lyRevPAR)],
      ['Days on file', `${mtdDays.length}`, `${lyDays.length}`, '—', '—'],
    ],
    styles: { fontSize:8, cellPadding:3 },
    headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7.5 },
    alternateRowStyles: { fillColor:[248,250,252] },
    columnStyles: { 0:{fontStyle:'bold'}, 3:{halign:'right'}, 4:{halign:'right'} },
    didParseCell: (data) => {
      if(data.section === 'body' && (data.column.index === 4)) {
        const v = parseFloat((data.cell.raw||'').replace(/[+%]/g,''));
        if(!isNaN(v)) data.cell.styles.textColor = v >= 0 ? C.good : C.bad;
      }
    }
  });

  pageFooter(doc);

  /* ════════════════════════════════════════
     PAGE 3 — FORWARD PACE
  ════════════════════════════════════════ */
  doc.addPage();
  cy = pageHeader(doc, 3, 'Forward Pace — Current BotB vs Last Year');

  cy = sectionHeader(doc, cy, 'On-Books Revenue vs Last Year Actuals — Next 4 Months');
  cy += 4;

  // Build 4 months: current + next 3
  const fwdMonths = [];
  for(let i=0;i<4;i++){
    let y=curYear, m=curMonth+i;
    if(m>12){m-=12;y++;}
    fwdMonths.push({year:y,month:m});
  }

  // Draw pace cards — 2 per row
  const cardW = (CW - 4) / 2;
  const cardH = 42;
  let cardRow = 0;

  fwdMonths.forEach(({year,month}, idx) => {
    const ob = getMonthlyOnBooks(year, month);
    const ly = entries.find(e => e.year===year-1 && e.month===month);
    const lyRev = ly ? ly.revenue : null;
    const obRev = ob ? ob.revenue : null;
    const pct   = obRev && lyRev ? (obRev/lyRev)*100 : null;
    const isOnPace = pct !== null && pct >= 100;
    const isCurrent = year === curYear && month === curMonth;
    const days = daysInMonth(year, month);

    const cx = ML + (idx % 2) * (cardW + 4);
    const cy2 = cy + Math.floor(idx / 2) * (cardH + 4);

    // Card background
    rect(cx, cy2, cardW, cardH, [248,250,252], 3);
    // Left accent bar
    doc.setFillColor(...(isCurrent ? C.blue : (pct===null ? C.soft : (isOnPace ? C.green : C.red))));
    doc.roundedRect(cx, cy2, 3, cardH, 1.5, 1.5, 'F');

    // Month label
    setFont(8, 'bold', C.soft);
    doc.text(`${MONTHS[month-1].toUpperCase()} ${year}`, cx+7, cy2+7);
    if(isCurrent){
      rect(cx+cardW-22, cy2+2, 20, 5, C.blue, 2);
      setFont(5.5, 'bold', C.white);
      doc.text('IN PROGRESS', cx+cardW-12, cy2+6, {align:'center'});
    }

    // Revenue
    setFont(14, 'bold', C.ink);
    doc.text(obRev ? fmtMoney(obRev) : '—', cx+7, cy2+18);
    setFont(7, 'normal', C.soft);
    doc.text('On-books revenue' + (ob?.asOfDate ? ` · as of ${ob.asOfDate}` : ''), cx+7, cy2+24);

    // Pace bar
    if(lyRev){
      const barW = cardW - 14;
      rect(cx+7, cy2+27, barW, 3, C.line, 1);
      const fill = Math.min((pct||0)/100, 1) * barW;
      doc.setFillColor(...(isCurrent ? C.blue : (isOnPace ? C.green : C.red)));
      doc.roundedRect(cx+7, cy2+27, fill, 3, 1, 1, 'F');

      // Pace %
      setFont(7.5, 'bold', isCurrent ? C.blue : (isOnPace ? C.good : C.bad));
      doc.text(pct ? `${pct.toFixed(1)}% of LY ${fmtMoney(lyRev)}` : '—', cx+7, cy2+36);

      // ADR + Occ
      if(ob?.adr > 0){
        setFont(6.5, 'normal', C.soft);
        doc.text(`ADR ${fmtMoney2(ob.adr)} · Occ ${ob.occ>0?fmtPct(ob.occ):'—'}`, cx+7, cy2+41);
      }
    } else {
      setFont(7, 'normal', C.soft);
      doc.text('No LY actuals to compare', cx+7, cy2+33);
    }
  });

  cy += Math.ceil(fwdMonths.length/2) * (cardH + 4) + 8;

  // Forward pace summary table
  cy = sectionHeader(doc, cy, 'Forward Pace Summary');
  cy += 2;

  const paceRows = fwdMonths.map(({year,month}) => {
    const ob = getMonthlyOnBooks(year, month);
    const ly = entries.find(e=>e.year===year-1&&e.month===month);
    const pct = ob&&ly ? ((ob.revenue/ly.revenue)*100).toFixed(1)+'%' : '—';
    const arn = rooms ? rooms * daysInMonth(year,month) : null;
    const revpar = ob&&arn ? fmtMoney2(ob.revenue/arn) : '—';
    return [
      `${MONTHS[month-1]} ${year}${year===curYear&&month===curMonth?' (MTD)':''}`,
      ob ? fmtMoney(ob.revenue) : '—',
      ob?.adr > 0 ? fmtMoney2(ob.adr) : '—',
      ob?.occ > 0 ? fmtPct(ob.occ) : '—',
      revpar,
      ly ? fmtMoney(ly.revenue) : '—',
      pct,
    ];
  });

  doc.autoTable({
    startY: cy,
    margin: { left:ML, right:MR },
    head: [['Month','On-Books Rev.','ADR','Occ %','RevPAR','LY Actual Rev.','Pace %']],
    body: paceRows,
    styles: { fontSize:8, cellPadding:3 },
    headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7.5 },
    columnStyles: { 1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'}, 5:{halign:'right'}, 6:{halign:'right', fontStyle:'bold'} },
    alternateRowStyles: { fillColor:[248,250,252] },
    didParseCell: (data) => {
      if(data.section==='body' && data.column.index===6){
        const v = parseFloat((data.cell.raw||'').replace('%',''));
        if(!isNaN(v)) data.cell.styles.textColor = v>=100 ? C.good : C.bad;
      }
    }
  });

  pageFooter(doc);

  /* ════════════════════════════════════════
     PAGE 4 — STLY BOOKING PACE
  ════════════════════════════════════════ */
  doc.addPage();
  cy = pageHeader(doc, 4, 'Booking Pace — Same Time Last Year');

  // Arrival window = next month
  let arrYear = curYear, arrMonth = curMonth + 1;
  if(arrMonth > 12){ arrMonth = 1; arrYear++; }
  const arrDays = daysInMonth(arrYear, arrMonth);
  const arrLYDays = daysInMonth(arrYear-1, arrMonth);

  cy = sectionHeader(doc, cy, `${MONTHS[arrMonth-1]} ${arrYear} Arrivals — Reservations Created Comparison`);
  cy += 4;

  if(!stlyData.current && !stlyData.prior){
    setFont(9, 'normal', C.soft);
    doc.text('No STLY data loaded. Upload Reservations by User reports in the dashboard to populate this section.', ML, cy+8);
    cy += 20;
  } else {
    const cur = stlyData.current;
    const ly  = stlyData.prior;
    const curADR = cur&&cur.roomNights>0 ? cur.totalRevenue/cur.roomNights : null;
    const lyADR  = ly&&ly.roomNights>0  ? ly.totalRevenue/ly.roomNights   : null;
    const curOcc = cur&&rooms ? (cur.roomNights/(rooms*arrDays))*100  : null;
    const lyOcc  = ly&&rooms  ? (ly.roomNights/(rooms*arrLYDays))*100 : null;
    const curRevPAR = cur&&rooms ? cur.totalRevenue/(rooms*arrDays)   : null;
    const lyRevPAR  = ly&&rooms  ? ly.totalRevenue/(rooms*arrLYDays)  : null;
    const pacePct = cur&&ly ? ((cur.totalRevenue/ly.totalRevenue)*100) : null;

    // Date window labels
    const curFrom = `${curYear-1}-${pad(curMonth)}-${pad(today.getDate())}`;
    const curTo   = `${curYear}-${pad(curMonth)}-${pad(today.getDate())}`;
    const lyFrom  = `${curYear-2}-${pad(curMonth)}-${pad(today.getDate())}`;
    const lyTo    = `${curYear-1}-${pad(curMonth)}-${pad(today.getDate())}`;

    setFont(7.5, 'normal', C.soft);
    doc.text(`Current: ${curFrom} → ${curTo} · Prior: ${lyFrom} → ${lyTo}`, ML, cy);
    cy += 8;

    // Pace % hero
    if(pacePct !== null){
      const paceColor = pacePct >= 100 ? C.green : C.red;
      rect(ML, cy, CW, 18, [...paceColor, 15], 3);
      doc.setDrawColor(...paceColor);
      doc.setLineWidth(0.5);
      doc.roundedRect(ML, cy, CW, 18, 3, 3, 'S');
      setFont(8, 'bold', C.soft);
      doc.text('PACE VS. SAME TIME LAST YEAR', W/2, cy+5, {align:'center'});
      setFont(18, 'bold', paceColor);
      doc.text(`${pacePct>=100?'+':''}${(pacePct-100).toFixed(1)}%`, W/2, cy+14, {align:'center'});
      cy += 22;
    }

    // STLY comparison table
    doc.autoTable({
      startY: cy,
      margin: { left:ML, right:MR },
      head: [['Metric', `Current Year\n(${curFrom} → ${curTo})`, `Prior Year\n(${lyFrom} → ${lyTo})`, 'Variance', 'Var %']],
      body: [
        ['Room Nights on Books',
          cur ? Math.round(cur.roomNights).toLocaleString() : '—',
          ly  ? Math.round(ly.roomNights).toLocaleString()  : '—',
          cur&&ly ? `${cur.roomNights>=ly.roomNights?'+':''}${Math.round(cur.roomNights-ly.roomNights).toLocaleString()}` : '—',
          deltaStr(cur?.roomNights, ly?.roomNights)],
        ['Total Revenue on Books',
          cur ? fmtMoney(cur.totalRevenue) : '—',
          ly  ? fmtMoney(ly.totalRevenue)  : '—',
          cur&&ly ? fmtMoney(cur.totalRevenue-ly.totalRevenue) : '—',
          deltaStr(cur?.totalRevenue, ly?.totalRevenue)],
        ['ADR (Rev ÷ Rm Nights)',
          curADR ? fmtMoney2(curADR) : '—',
          lyADR  ? fmtMoney2(lyADR)  : '—',
          curADR&&lyADR ? fmtMoney2(curADR-lyADR) : '—',
          deltaStr(curADR, lyADR)],
        [`Occupancy (${rooms}rms × ${arrDays}d)`,
          curOcc ? curOcc.toFixed(1)+'%' : '—',
          lyOcc  ? lyOcc.toFixed(1)+'%'  : '—',
          curOcc&&lyOcc ? `${(curOcc-lyOcc).toFixed(1)} pts` : '—',
          deltaStr(curOcc, lyOcc)],
        ['RevPAR',
          curRevPAR ? fmtMoney2(curRevPAR) : '—',
          lyRevPAR  ? fmtMoney2(lyRevPAR)  : '—',
          curRevPAR&&lyRevPAR ? fmtMoney2(curRevPAR-lyRevPAR) : '—',
          deltaStr(curRevPAR, lyRevPAR)],
      ],
      styles: { fontSize:8, cellPadding:3 },
      headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7 },
      columnStyles: { 0:{fontStyle:'bold'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right', fontStyle:'bold'} },
      alternateRowStyles: { fillColor:[248,250,252] },
      didParseCell: (data) => {
        if(data.section==='body' && data.column.index===4){
          const raw = data.cell.raw || '';
          const v = parseFloat(raw.replace(/[+%pts]/g,'').trim());
          if(!isNaN(v)) data.cell.styles.textColor = v>=0 ? C.good : C.bad;
        }
      }
    });
    cy = doc.lastAutoTable.finalY + 6;

    // Note
    setFont(7, 'normal', C.soft);
    doc.text(`* Occupancy and RevPAR calculated using ${rooms||'?'} rooms × ${arrDays} days in ${MONTHS[arrMonth-1]} ${arrYear}.`, ML, cy);
  }

  pageFooter(doc);

  /* ════════════════════════════════════════
     PAGE 5 — FINANCIALS
  ════════════════════════════════════════ */
  doc.addPage();
  cy = pageHeader(doc, 5, 'Financial Summary — Budget vs Actuals');

  const FIN_YEAR = curYear;
  const finMonths = [...new Set([
    ...finBudget.filter(b=>b.year===FIN_YEAR).map(b=>b.key),
    ...finActuals.filter(a=>a.year===FIN_YEAR).map(a=>a.key),
    ...entries.filter(e=>e.year===FIN_YEAR).map(e=>keyFor(e.year,e.month)),
    ...dailyEntries.filter(d=>d.year===FIN_YEAR).map(d=>keyFor(d.year,d.month)),
  ])].sort();

  function getRoomRevForMonth(year, month){
    const act = entries.find(e=>e.year===year&&e.month===month);
    if(act) return act.revenue;
    const ob = getMonthlyOnBooks(year, month);
    return ob ? ob.revenue : null;
  }

  if(!finMonths.length){
    setFont(9, 'normal', C.soft);
    doc.text('No financial data on file. Set a budget and enter actuals in the Financials tab.', ML, cy+10);
  } else {
    // Build rows
    const cats = [
      {key:'roomRev',   label:'Room Revenue',   getBudget: b=>b?.roomRev||0,    getActual: (k,y,m)=>getRoomRevForMonth(y,m)},
      {key:'roomFees',  label:'Room Fees',       getBudget: b=>b?.roomFees||0,   getActual: (k)=>{const a=finActuals.find(x=>x.key===k);return a?.roomFees||0;}},
      {key:'restaurant',label:'Restaurant',      getBudget: b=>b?.restaurant||0, getActual: (k)=>{const a=finActuals.find(x=>x.key===k);return a?.restaurant||0;}},
      {key:'parking',   label:'Parking',         getBudget: b=>b?.parking||0,    getActual: (k)=>{const a=finActuals.find(x=>x.key===k);return a?.parking||0;}},
      {key:'misc',      label:'Misc. Revenue',   getBudget: b=>b?.misc||0,       getActual: (k)=>{const a=finActuals.find(x=>x.key===k);return a?.misc||0;}},
    ];

    // Summary KPI cards
    cy = sectionHeader(doc, cy, `${FIN_YEAR} Year-to-Date Financial Summary`);
    cy += 4;

    let totBud=0, totAct=0;
    finMonths.forEach(k=>{
      const [y,m]=k.split('-').map(Number);
      const bud=finBudget.find(b=>b.key===k);
      cats.forEach(cat=>{
        totBud += bud ? cat.getBudget(bud) : 0;
        const av = cat.getActual(k,y,m);
        totAct += av||0;
      });
    });

    const kw = CW / 3;
    const pctBudget = totBud>0 ? ((totAct/totBud)*100) : null;

    // Three summary boxes
    rect(ML,       cy, kw-2, 20, C.paper, 2);
    rect(ML+kw,    cy, kw-2, 20, C.paper, 2);
    rect(ML+kw*2,  cy, kw-2, 20, C.paper, 2);

    setFont(6.5,'bold',C.soft); doc.text('YTD TOTAL BUDGET', ML+4, cy+5);
    setFont(12,'bold',C.ink);   doc.text(fmtMoney(totBud), ML+4, cy+14);

    setFont(6.5,'bold',C.soft); doc.text('YTD TOTAL ACTUAL', ML+kw+4, cy+5);
    setFont(12,'bold',C.ink);   doc.text(fmtMoney(totAct), ML+kw+4, cy+14);

    const vColor = totAct>=totBud ? C.good : C.bad;
    setFont(6.5,'bold',C.soft); doc.text('VARIANCE', ML+kw*2+4, cy+5);
    setFont(12,'bold',vColor);
    doc.text(`${totAct>=totBud?'+':''}${fmtMoney(totAct-totBud)}`, ML+kw*2+4, cy+14);
    if(pctBudget!==null){
      setFont(7,'bold',vColor);
      doc.text(`${pctBudget.toFixed(1)}% of budget`, ML+kw*2+4, cy+19);
    }
    cy += 26;

    // Detail table by category and month
    cy = sectionHeader(doc, cy, 'Budget vs. Actuals by Month');
    cy += 2;

    const months = finMonths.slice(0, curMonth); // YTD only
    const colHeaders = ['Category', ...months.map(k=>{const[y,m]=k.split('-').map(Number);return MONTHS[m-1].slice(0,3)}), 'Total'];
    const catRows = cats.map(cat => {
      let rowBudTotal=0, rowActTotal=0;
      const cells = months.map(k=>{
        const [y,m]=k.split('-').map(Number);
        const bud=finBudget.find(b=>b.key===k);
        const budV=bud?cat.getBudget(bud):null;
        const actV=cat.getActual(k,y,m)||null;
        if(budV) rowBudTotal+=budV;
        if(actV) rowActTotal+=actV;
        if(budV===null&&(actV===null||actV===0)) return '—';
        if(budV===null) return actV>0?fmtMoney(actV):'—';
        return `${actV>0?fmtMoney(actV):'—'}\n(${fmtMoney(budV)})`;
      });
      const totVar = rowBudTotal>0 ? varStr(rowActTotal,rowBudTotal,'pct') : '—';
      return [cat.label, ...cells, `${fmtMoney(rowActTotal)}\n(${fmtMoney(rowBudTotal)})\n${totVar}`];
    });

    doc.autoTable({
      startY: cy,
      margin: { left:ML, right:MR },
      head: [colHeaders],
      body: catRows,
      styles: { fontSize:6.5, cellPadding:2, overflow:'linebreak' },
      headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:6.5 },
      columnStyles: { 0:{fontStyle:'bold', cellWidth:28} },
      alternateRowStyles: { fillColor:[248,250,252] },
    });
  }

  pageFooter(doc);

  /* ════════════════════════════════════════
     PAGE 6 — YTD MONTHLY DETAIL
  ════════════════════════════════════════ */
  doc.addPage();
  cy = pageHeader(doc, 6, 'Year-to-Date Monthly Detail');

  cy = sectionHeader(doc, cy, `${curYear} Monthly Actuals vs ${curYear-1}`);
  cy += 2;

  const allMonths = [1,2,3,4,5,6,7,8,9,10,11,12];
  const detailRows = allMonths.map(m => {
    const act = entries.find(e=>e.year===curYear&&e.month===m);
    const ly  = entries.find(e=>e.year===curYear-1&&e.month===m);
    const ob  = !act ? getMonthlyOnBooks(curYear, m) : null;
    const src = act ? 'actual' : ob ? ob.source : null;
    const cur = act || (ob ? {revenue:ob.revenue, adr:ob.adr, occ:ob.occ} : null);
    const arn = rooms ? rooms*daysInMonth(curYear,m) : null;
    const lyArn = rooms ? rooms*daysInMonth(curYear-1,m) : null;
    const revpar = cur&&arn ? fmtMoney2(cur.revenue/arn) : '—';
    const lyRevpar = ly&&lyArn ? fmtMoney2(ly.revenue/lyArn) : '—';
    const badge = src==='botb'?'[BotB]':src==='manual'?'[Pace]':src==='actual'?'':src?'['+src+']':'';

    return [
      MONTHS[m-1] + (badge?' '+badge:''),
      cur ? fmtMoney(cur.revenue) : (m<=curMonth?'—':''),
      cur&&cur.adr>0 ? fmtMoney2(cur.adr) : (m<=curMonth?'—':''),
      cur&&cur.occ>0 ? fmtPct(cur.occ) : (m<=curMonth?'—':''),
      revpar,
      ly ? fmtMoney(ly.revenue) : '—',
      ly&&ly.adr>0 ? fmtMoney2(ly.adr) : '—',
      ly&&ly.occ>0 ? fmtPct(ly.occ) : '—',
      lyRevpar,
      cur&&ly ? deltaStr(cur.revenue,ly.revenue) : '—',
    ];
  });

  // YTD totals row
  const ytdAct = entries.filter(e=>e.year===curYear&&e.month<=curMonth);
  const ytdLYe = entries.filter(e=>e.year===curYear-1&&e.month<=curMonth);
  const ytdRevT = ytdAct.reduce((s,e)=>s+e.revenue,0);
  const ytdLYRevT = ytdLYe.reduce((s,e)=>s+e.revenue,0);
  const ytdADRT = ytdAct.length?ytdAct.reduce((s,e)=>s+e.adr,0)/ytdAct.length:0;
  const ytdLYADRT = ytdLYe.length?ytdLYe.reduce((s,e)=>s+e.adr,0)/ytdLYe.length:0;
  const ytdOccT = ytdAct.length?ytdAct.reduce((s,e)=>s+e.occ,0)/ytdAct.length:0;
  const ytdLYOccT = ytdLYe.length?ytdLYe.reduce((s,e)=>s+e.occ,0)/ytdLYe.length:0;

  detailRows.push([
    `YTD (Jan–${MONTHS[curMonth-1]})`,
    ytdRevT>0?fmtMoney(ytdRevT):'—',
    ytdADRT>0?fmtMoney2(ytdADRT):'—',
    ytdOccT>0?fmtPct(ytdOccT):'—',
    '—',
    ytdLYRevT>0?fmtMoney(ytdLYRevT):'—',
    ytdLYADRT>0?fmtMoney2(ytdLYADRT):'—',
    ytdLYOccT>0?fmtPct(ytdLYOccT):'—',
    '—',
    deltaStr(ytdRevT,ytdLYRevT),
  ]);

  doc.autoTable({
    startY: cy,
    margin: { left:ML, right:MR },
    head: [['Month', `${curYear} Rev`, `${curYear} ADR`, `${curYear} Occ`, `${curYear} RvPAR`, `${curYear-1} Rev`, `${curYear-1} ADR`, `${curYear-1} Occ`, `${curYear-1} RvPAR`, 'Rev Δ%']],
    body: detailRows,
    styles: { fontSize:7, cellPadding:2.5 },
    headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:6.5 },
    columnStyles: {
      0:{fontStyle:'bold'},
      1:{halign:'right'}, 2:{halign:'right'}, 3:{halign:'right'}, 4:{halign:'right'},
      5:{halign:'right'}, 6:{halign:'right'}, 7:{halign:'right'}, 8:{halign:'right'},
      9:{halign:'right', fontStyle:'bold'},
    },
    alternateRowStyles: { fillColor:[248,250,252] },
    didParseCell: (data) => {
      const isYTD = data.row.index === detailRows.length - 1;
      if(isYTD) { data.cell.styles.fillColor = C.navy; data.cell.styles.textColor = C.white; data.cell.styles.fontStyle='bold'; }
      if(!isYTD && data.section==='body' && data.column.index===9){
        const v = parseFloat((data.cell.raw||'').replace(/[+%]/g,''));
        if(!isNaN(v)) data.cell.styles.textColor = v>=0?C.good:C.bad;
      }
    }
  });

  pageFooter(doc);

  /* ── Save ── */
  const filename = `${propName.replace(/\s+/g,'-')}-Performance-Report-${MONTHS[curMonth-1]}-${curYear}.pdf`;
  doc.save(filename);
};
