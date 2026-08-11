/**
 * report.js — Hotel Performance Dashboard PDF Report Generator
 * 3-page layout:
 *   Page 1 — Cover + MTD KPIs + YTD summary
 *   Page 2 — Forward Pace (4 months) + STLY Booking Pace
 *   Page 3 — Financial Summary + YTD Monthly Detail table
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

  /* ── Design tokens — no harsh black ── */
  const C = {
    orange: [230, 126,  34],
    navy:   [ 46,  64,  83],   // softer dark blue-grey (headers)
    green:  [ 39, 174,  96],
    red:    [231,  76,  60],
    blue:   [ 46, 134, 193],
    ink:    [ 55,  65,  81],   // soft dark slate — replaces harsh black
    soft:   [107, 122, 141],
    xsoft:  [156, 163, 175],
    line:   [227, 232, 239],
    paper:  [245, 247, 250],
    white:  [255, 255, 255],
    good:   [ 39, 174,  96],
    bad:    [231,  76,  60],
  };

  const W = 215.9, H = 279.4;
  const ML = 14, MR = 14;
  const CW = W - ML - MR;

  const today    = new Date();
  const pad      = n => String(n).padStart(2,'0');
  const todayStr = today.toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
  const curMonth = today.getMonth() + 1;
  const curYear  = today.getFullYear();
  const propName = activeProfile?.name || activeProfile?.propName || 'Hotel Property';
  const rooms    = totalRooms || 0;
  const sym      = currencySymbol || '$';

  /* ── Helpers ── */
  const sf = (size, weight='normal', color=C.ink) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', weight);
    doc.setTextColor(...color);
  };
  const fillRect = (x, y, w, h, color, r=0) => {
    doc.setFillColor(...color);
    r > 0 ? doc.roundedRect(x,y,w,h,r,r,'F') : doc.rect(x,y,w,h,'F');
  };
  const hLine = (y, color=C.line) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.25);
    doc.line(ML, y, W-MR, y);
  };
  const deltaStr = (cur, prior) => {
    if(!cur||!prior||prior===0) return '—';
    const p=((cur-prior)/Math.abs(prior))*100;
    return `${p>=0?'+':''}${p.toFixed(1)}%`;
  };
  const deltaCol = (cur, prior) => (!cur||!prior) ? C.soft : cur>=prior ? C.good : C.bad;

  /* ── Page header (orange band) ── */
  const pageHeader = (pageNum, subtitle) => {
    fillRect(0, 0, W, 13, C.orange);
    sf(10, 'bold', C.white);
    doc.text(propName, ML, 9);
    sf(7.5, 'normal', C.white);
    doc.text(subtitle, W/2, 9, { align:'center' });
    sf(7.5, 'normal', C.white);
    doc.text(`${pageNum} / 3`, W-MR, 9, { align:'right' });
    return 18;
  };

  /* ── Page footer ── */
  const pageFooter = () => {
    hLine(H-9);
    sf(6.5, 'normal', C.xsoft);
    doc.text(`${propName} · ${todayStr} · SNT Reporting Platform`, W/2, H-4, { align:'center' });
  };

  /* ── Section label (slim orange left bar) ── */
  const sectionLabel = (y, title) => {
    fillRect(ML, y, 3, 5, C.orange);
    sf(8, 'bold', C.ink);
    doc.text(title.toUpperCase(), ML+6, y+4);
    return y+8;
  };

  /* ── KPI tile ── */
  const kpiTile = (x, y, w, h, label, value, lyValue) => {
    fillRect(x, y, w-2, h, C.paper, 2);
    sf(6, 'bold', C.soft);
    doc.text(label, x+4, y+5);
    sf(12, 'bold', C.ink);
    doc.text(value||'—', x+4, y+14);
    if(lyValue!=null) {
      const raw  = parseFloat((value||'').replace(/[^0-9.\-]/g,''));
      const rawL = parseFloat((lyValue||'').replace(/[^0-9.\-]/g,''));
      const dStr = deltaStr(raw, rawL);
      sf(6.5, 'bold', deltaCol(raw, rawL));
      doc.text(dStr+' vs LY', x+4, y+20);
      sf(6, 'normal', C.xsoft);
      doc.text('LY: '+lyValue, x+w-6, y+20, { align:'right' });
    }
  };

  /* ─────────────────────────────────────────
     PAGE 1 — COVER + KPIs
  ───────────────────────────────────────── */

  /* Cover band */
  fillRect(0, 0, W, 68, C.orange);

  sf(20, 'bold', C.white);
  doc.text(propName, W/2, 24, { align:'center' });

  sf(10, 'normal', C.white);
  doc.text('Monthly Performance Report', W/2, 34, { align:'center' });

  /* Period pill */
  fillRect(W/2-38, 40, 76, 9, [255,255,255], 4);
  doc.setFillColor(255,255,255); // already set
  sf(8, 'bold', C.orange);
  doc.text(`${MONTHS[curMonth-1]} ${curYear}  ·  MTD + Forward Pace`, W/2, 46.5, { align:'center' });

  sf(7, 'normal', C.white);
  doc.text(`Generated ${todayStr}`, W/2, 58, { align:'center' });

  /* Report meta strip */
  const metaY = 72;
  fillRect(ML, metaY, CW, 14, C.paper, 2);
  const metaCols = [
    ['PROPERTY',     propName],
    ['TOTAL ROOMS',  rooms ? `${rooms}` : 'Not set'],
    ['CURRENCY',     sym],
    ['PERIOD',       `${MONTHS[curMonth-1]} ${curYear}`],
  ];
  const mcw = CW / metaCols.length;
  metaCols.forEach(([k,v], i) => {
    sf(5.5, 'bold', C.soft);  doc.text(k, ML + i*mcw + 4, metaY+5);
    sf(8,   'bold', C.ink);   doc.text(v, ML + i*mcw + 4, metaY+11);
  });

  let cy = metaY + 22;

  /* MTD KPIs — only days elapsed so far this month */
  const todayDay = today.getDate();
  const mtdDays  = dailyEntries.filter(d=>d.year===curYear&&d.month===curMonth&&d.day<=todayDay);
  cy = sectionLabel(cy, `${MONTHS[curMonth-1]} ${curYear} — Month to Date (${MONTHS[curMonth-1]} 1–${todayDay})`);
  const mtdRms   = mtdDays.reduce((s,d)=>s+(parseInt(d.rms)||0),0);
  const mtdOccS  = mtdDays.reduce((s,d)=>s+(parseFloat(d.occ)||0),0);
  const mtdADR   = mtdRms>0 ? mtdRev/mtdRms : 0;
  const mtdOcc   = mtdDays.length ? mtdOccS/mtdDays.length : 0;
  const mtdArn   = rooms&&mtdDays.length ? rooms*mtdDays.length : null;
  const mtdRvPAR = mtdArn ? mtdRev/mtdArn : null;

  const lyMTD    = dailyEntries.filter(d=>d.year===curYear-1&&d.month===curMonth&&d.day<=today.getDate());
  const lyMRev   = lyMTD.reduce((s,d)=>s+(parseFloat(d.revenue)||0),0);
  const lyMRms   = lyMTD.reduce((s,d)=>s+(parseInt(d.rms)||0),0);
  const lyMOccS  = lyMTD.reduce((s,d)=>s+(parseFloat(d.occ)||0),0);
  const lyMADR   = lyMRms>0?lyMRev/lyMRms:0;
  const lyMOcc   = lyMTD.length?lyMOccS/lyMTD.length:0;
  const lyMArn   = rooms&&lyMTD.length?rooms*lyMTD.length:null;
  const lyMRvPAR = lyMArn?lyMRev/lyMArn:null;

  const tw = CW/4;
  kpiTile(ML,       cy, tw, 24, 'MTD REVENUE',   mtdRev>0?fmtMoney(mtdRev):'—',     lyMRev>0?fmtMoney(lyMRev):null);
  kpiTile(ML+tw,    cy, tw, 24, 'MTD ADR',        mtdADR>0?fmtMoney2(mtdADR):'—',    lyMADR>0?fmtMoney2(lyMADR):null);
  kpiTile(ML+tw*2,  cy, tw, 24, 'MTD OCCUPANCY',  mtdOcc>0?fmtPct(mtdOcc):'—',       lyMOcc>0?fmtPct(lyMOcc):null);
  kpiTile(ML+tw*3,  cy, tw, 24, 'MTD REVPAR',     mtdRvPAR?fmtMoney2(mtdRvPAR):'—',  lyMRvPAR?fmtMoney2(lyMRvPAR):null);
  cy += 28;

  /* YTD KPIs */
  cy = sectionLabel(cy, `${curYear} Year to Date — Jan through ${MONTHS[curMonth-1]}`);

  const ytdE   = entries.filter(e=>e.year===curYear&&e.month<=curMonth);
  const ytdLY  = entries.filter(e=>e.year===curYear-1&&e.month<=curMonth);
  const ytdRev = ytdE.reduce((s,e)=>s+e.revenue,0);
  const ytdLYR = ytdLY.reduce((s,e)=>s+e.revenue,0);
  const ytdADR = ytdE.length?ytdE.reduce((s,e)=>s+e.adr,0)/ytdE.length:0;
  const ytdLYA = ytdLY.length?ytdLY.reduce((s,e)=>s+e.adr,0)/ytdLY.length:0;
  const ytdOcc = ytdE.length?ytdE.reduce((s,e)=>s+e.occ,0)/ytdE.length:0;
  const ytdLYO = ytdLY.length?ytdLY.reduce((s,e)=>s+e.occ,0)/ytdLY.length:0;
  const ytdTArn= ytdE.reduce((s,e)=>s+availableRoomNights(e.year,e.month),0);
  const ytdRvP = ytdTArn?ytdRev/ytdTArn:null;
  const ytdLYTArn=ytdLY.reduce((s,e)=>s+availableRoomNights(e.year,e.month),0);
  const ytdLYRvP=ytdLYTArn?ytdLYR/ytdLYTArn:null;

  kpiTile(ML,       cy, tw, 24, 'YTD REVENUE',   ytdRev>0?fmtMoney(ytdRev):'—',     ytdLYR>0?fmtMoney(ytdLYR):null);
  kpiTile(ML+tw,    cy, tw, 24, 'YTD ADR',        ytdADR>0?fmtMoney2(ytdADR):'—',    ytdLYA>0?fmtMoney2(ytdLYA):null);
  kpiTile(ML+tw*2,  cy, tw, 24, 'YTD OCCUPANCY',  ytdOcc>0?fmtPct(ytdOcc):'—',       ytdLYO>0?fmtPct(ytdLYO):null);
  kpiTile(ML+tw*3,  cy, tw, 24, 'YTD REVPAR',     ytdRvP?fmtMoney2(ytdRvP):'—',      ytdLYRvP?fmtMoney2(ytdLYRvP):null);
  cy += 28;

  /* MTD vs LY comparison table */
  cy = sectionLabel(cy, 'MTD vs Same Period Last Year');
  doc.autoTable({
    startY: cy,
    margin: { left:ML, right:MR },
    head: [['Metric', `${MONTHS[curMonth-1]} ${curYear} MTD`, `${MONTHS[curMonth-1]} ${curYear-1} (same days)`, 'Variance $', 'Variance %']],
    body: [
      ['Revenue',   mtdRev>0?fmtMoney(mtdRev):'—',      lyMRev>0?fmtMoney(lyMRev):'—',      mtdRev&&lyMRev?fmtMoney(mtdRev-lyMRev):'—',  deltaStr(mtdRev,lyMRev)],
      ['ADR',       mtdADR>0?fmtMoney2(mtdADR):'—',     lyMADR>0?fmtMoney2(lyMADR):'—',     mtdADR&&lyMADR?fmtMoney2(mtdADR-lyMADR):'—', deltaStr(mtdADR,lyMADR)],
      ['Occupancy', mtdOcc>0?fmtPct(mtdOcc):'—',        lyMOcc>0?fmtPct(lyMOcc):'—',        '—',                                          deltaStr(mtdOcc,lyMOcc)],
      ['RevPAR',    mtdRvPAR?fmtMoney2(mtdRvPAR):'—',   lyMRvPAR?fmtMoney2(lyMRvPAR):'—',   '—',                                          deltaStr(mtdRvPAR,lyMRvPAR)],
      ['Days',      `${mtdDays.length} days`,             `${lyMTD.length} days`,              '—',                                          '—'],
    ],
    styles: { fontSize:7.5, cellPadding:2.5, textColor:C.ink },
    headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7 },
    alternateRowStyles: { fillColor:C.paper },
    columnStyles: { 0:{fontStyle:'bold'}, 3:{halign:'right'}, 4:{halign:'right', fontStyle:'bold'} },
    didParseCell: d => {
      if(d.section==='body'&&d.column.index===4){
        const v=parseFloat((d.cell.raw||'').replace(/[+%]/g,''));
        if(!isNaN(v)) d.cell.styles.textColor=v>=0?C.good:C.bad;
      }
    }
  });

  pageFooter();

  /* ─────────────────────────────────────────
     PAGE 2 — FORWARD PACE + STLY
  ───────────────────────────────────────── */
  doc.addPage();
  cy = pageHeader(2, 'Forward Pace & Booking Pace — Same Time Last Year');

  /* Forward pace cards — 4 across */
  cy = sectionLabel(cy, 'Forward Pace — Current BotB On-Books vs Last Year Actuals');

  const fwdMonths = [];
  for(let i=0;i<4;i++){
    let y=curYear, m=curMonth+i;
    if(m>12){m-=12;y++;}
    fwdMonths.push({year:y,month:m});
  }

  const cardW = (CW-6)/4;
  const cardH = 38;

  fwdMonths.forEach(({year,month},idx)=>{
    const ob    = getMonthlyOnBooks(year,month);
    const ly    = entries.find(e=>e.year===year-1&&e.month===month);
    const lyRev = ly?ly.revenue:null;
    const obRev = ob?ob.revenue:null;
    const pct   = obRev&&lyRev?(obRev/lyRev)*100:null;
    const isOnP = pct!==null&&pct>=100;
    const isCur = year===curYear&&month===curMonth;
    const cx    = ML + idx*(cardW+2);

    fillRect(cx, cy, cardW, cardH, C.paper, 2);

    // Accent left bar
    const barColor = isCur?C.blue:(pct===null?C.xsoft:(isOnP?C.green:C.red));
    fillRect(cx, cy, 2.5, cardH, barColor, 1);

    sf(6.5,'bold',C.soft);
    doc.text(`${MONTHS[month-1].slice(0,3).toUpperCase()} ${year}`, cx+5, cy+6);
    if(isCur){ sf(5,'bold',C.blue); doc.text('IN PROGRESS', cx+cardW-4, cy+6, {align:'right'}); }

    sf(10,'bold',C.ink);
    doc.text(obRev?fmtMoney(obRev):'—', cx+5, cy+15);
    sf(6,'normal',C.soft);
    doc.text('on-books'+(ob?.asOfDate?` · ${ob.asOfDate}`:''), cx+5, cy+20);

    if(lyRev){
      // Mini bar
      const bw=cardW-10;
      fillRect(cx+5, cy+23, bw, 2.5, C.line);
      fillRect(cx+5, cy+23, Math.min((pct||0)/100,1)*bw, 2.5, barColor, 0);
      sf(6.5,'bold', isCur?C.blue:(isOnP?C.good:C.bad));
      doc.text(pct?`${pct.toFixed(1)}%`:' ', cx+5, cy+30);
      sf(6,'normal',C.xsoft);
      doc.text(`LY ${fmtMoney(lyRev)}`, cx+cardW-4, cy+30, {align:'right'});
    } else {
      sf(6,'normal',C.xsoft); doc.text('No LY data', cx+5, cy+28);
    }
    if(ob?.adr>0){
      sf(5.5,'normal',C.soft);
      doc.text(`ADR ${fmtMoney2(ob.adr)} · ${ob.occ>0?fmtPct(ob.occ):'—'}`, cx+5, cy+35);
    }
  });

  cy += cardH + 6;

  /* Pace summary table */
  cy = sectionLabel(cy, 'Pace Summary');
  doc.autoTable({
    startY: cy,
    margin: { left:ML, right:MR },
    head: [['Month','On-Books Rev','ADR','Occ %','RevPAR','LY Actual Rev','Pace %']],
    body: fwdMonths.map(({year,month})=>{
      const ob=getMonthlyOnBooks(year,month);
      const ly=entries.find(e=>e.year===year-1&&e.month===month);
      const arn=rooms?rooms*daysInMonth(year,month):null;
      return [
        `${MONTHS[month-1]} ${year}${year===curYear&&month===curMonth?' (MTD)':''}`,
        ob?fmtMoney(ob.revenue):'—',
        ob?.adr>0?fmtMoney2(ob.adr):'—',
        ob?.occ>0?fmtPct(ob.occ):'—',
        ob&&arn?fmtMoney2(ob.revenue/arn):'—',
        ly?fmtMoney(ly.revenue):'—',
        ob&&ly?`${((ob.revenue/ly.revenue)*100).toFixed(1)}%`:'—',
      ];
    }),
    styles: { fontSize:7.5, cellPadding:2.5, textColor:C.ink },
    headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7 },
    alternateRowStyles: { fillColor:C.paper },
    columnStyles: {1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},5:{halign:'right'},6:{halign:'right',fontStyle:'bold'}},
    didParseCell: d=>{
      if(d.section==='body'&&d.column.index===6){
        const v=parseFloat((d.cell.raw||'').replace('%',''));
        if(!isNaN(v)) d.cell.styles.textColor=v>=100?C.good:C.bad;
      }
    }
  });
  cy = doc.lastAutoTable.finalY + 8;

  /* STLY section */
  let arrYear=curYear, arrMonth=curMonth+1;
  if(arrMonth>12){arrMonth=1;arrYear++;}
  const arrDays=daysInMonth(arrYear,arrMonth);

  cy = sectionLabel(cy, `Booking Pace — ${MONTHS[arrMonth-1]} ${arrYear} Arrivals, Same Time Last Year`);

  if(!stlyData?.current&&!stlyData?.prior){
    fillRect(ML, cy, CW, 12, C.paper, 2);
    sf(7.5,'normal',C.soft);
    doc.text('Upload Reservations by User reports in the dashboard to populate this section.', ML+4, cy+8);
    cy += 18;
  } else {
    const cur2=stlyData.current, ly2=stlyData.prior;
    const curADR=cur2?.roomNights>0?cur2.totalRevenue/cur2.roomNights:null;
    const lyADR2=ly2?.roomNights>0?ly2.totalRevenue/ly2.roomNights:null;
    const curOcc=cur2&&rooms?(cur2.roomNights/(rooms*arrDays))*100:null;
    const lyOcc2=ly2&&rooms?(ly2.roomNights/(rooms*arrDays))*100:null;
    const curRvP=cur2&&rooms?cur2.totalRevenue/(rooms*arrDays):null;
    const lyRvP2=ly2&&rooms?ly2.totalRevenue/(rooms*arrDays):null;
    const pace=cur2&&ly2?(cur2.totalRevenue/ly2.totalRevenue)*100:null;

    /* Pace hero */
    if(pace!==null){
      const pColor=pace>=100?C.green:C.red;
      fillRect(ML, cy, CW, 16, C.paper, 2);
      doc.setDrawColor(...pColor); doc.setLineWidth(0.5);
      doc.roundedRect(ML,cy,CW,16,2,2,'S');
      sf(7,'bold',C.soft); doc.text('PACE VS. SAME TIME LAST YEAR', W/2, cy+5, {align:'center'});
      sf(16,'bold',pColor); doc.text(`${pace>=100?'+':''}${(pace-100).toFixed(1)}%`, W/2, cy+13, {align:'center'});
      cy += 20;
    }

    /* STLY table */
    const curFrom=`${curYear-1}-${pad(curMonth)}-${pad(today.getDate())}`;
    const curTo=`${curYear}-${pad(curMonth)}-${pad(today.getDate())}`;
    const lyFrom=`${curYear-2}-${pad(curMonth)}-${pad(today.getDate())}`;
    const lyTo=`${curYear-1}-${pad(curMonth)}-${pad(today.getDate())}`;

    doc.autoTable({
      startY: cy,
      margin: { left:ML, right:MR },
      head: [['Metric',`Current (${curFrom.slice(0,7)} → ${curTo.slice(0,7)})`,`Prior (${lyFrom.slice(0,7)} → ${lyTo.slice(0,7)})`,'Var %']],
      body: [
        ['Room Nights', cur2?Math.round(cur2.roomNights).toLocaleString():'—', ly2?Math.round(ly2.roomNights).toLocaleString():'—', deltaStr(cur2?.roomNights,ly2?.roomNights)],
        ['Total Revenue', cur2?fmtMoney(cur2.totalRevenue):'—', ly2?fmtMoney(ly2.totalRevenue):'—', deltaStr(cur2?.totalRevenue,ly2?.totalRevenue)],
        ['ADR', curADR?fmtMoney2(curADR):'—', lyADR2?fmtMoney2(lyADR2):'—', deltaStr(curADR,lyADR2)],
        [`Occupancy (${rooms}rms×${arrDays}d)`, curOcc?curOcc.toFixed(1)+'%':'—', lyOcc2?lyOcc2.toFixed(1)+'%':'—', deltaStr(curOcc,lyOcc2)],
        ['RevPAR', curRvP?fmtMoney2(curRvP):'—', lyRvP2?fmtMoney2(lyRvP2):'—', deltaStr(curRvP,lyRvP2)],
      ],
      styles: { fontSize:7.5, cellPadding:2.5, textColor:C.ink },
      headStyles: { fillColor:C.navy, textColor:C.white, fontStyle:'bold', fontSize:7 },
      alternateRowStyles: { fillColor:C.paper },
      columnStyles: { 0:{fontStyle:'bold'}, 2:{halign:'right'}, 3:{halign:'right',fontStyle:'bold'} },
      didParseCell: d=>{
        if(d.section==='body'&&d.column.index===3){
          const v=parseFloat((d.cell.raw||'').replace(/[+%]/g,''));
          if(!isNaN(v)) d.cell.styles.textColor=v>=0?C.good:C.bad;
        }
      }
    });
  }

  pageFooter();

  /* ─────────────────────────────────────────
     PAGE 3 — FINANCIALS + YTD MONTHLY DETAIL
  ───────────────────────────────────────── */
  doc.addPage();
  cy = pageHeader(3, 'Financial Summary & Year-to-Date Monthly Detail');

  /* Financial summary */
  const FIN_YEAR=curYear;
  const finMonthKeys=[...new Set([
    ...finBudget.filter(b=>b.year===FIN_YEAR).map(b=>b.key),
    ...finActuals.filter(a=>a.year===FIN_YEAR).map(a=>a.key),
    ...entries.filter(e=>e.year===FIN_YEAR&&e.month<=curMonth).map(e=>keyFor(e.year,e.month)),
    ...dailyEntries.filter(d=>d.year===FIN_YEAR&&d.month<=curMonth).map(d=>keyFor(d.year,d.month)),
  ])].sort();

  const getRRev=(year,month)=>{
    const a=entries.find(e=>e.year===year&&e.month===month);
    if(a)return a.revenue;
    const ob=getMonthlyOnBooks(year,month);
    return ob?ob.revenue:null;
  };

  cy = sectionLabel(cy, `${FIN_YEAR} Financial Summary — Budget vs Actuals`);

  if(!finMonthKeys.length){
    fillRect(ML,cy,CW,12,C.paper,2);
    sf(7.5,'normal',C.soft);
    doc.text('No financial data on file. Set a budget in the Financials tab.', ML+4, cy+8);
    cy+=18;
  } else {
    const cats=[
      {label:'Room Revenue', getB:b=>b?.roomRev||0,    getA:(k,y,m)=>getRRev(y,m)||0},
      {label:'Room Fees',    getB:b=>b?.roomFees||0,   getA:(k)=>{const a=finActuals.find(x=>x.key===k);return a?.roomFees||0;}},
      {label:'Restaurant',   getB:b=>b?.restaurant||0, getA:(k)=>{const a=finActuals.find(x=>x.key===k);return a?.restaurant||0;}},
      {label:'Parking',      getB:b=>b?.parking||0,    getA:(k)=>{const a=finActuals.find(x=>x.key===k);return a?.parking||0;}},
      {label:'Misc.',        getB:b=>b?.misc||0,       getA:(k)=>{const a=finActuals.find(x=>x.key===k);return a?.misc||0;}},
    ];

    // YTD totals
    let totB=0, totA=0;
    finMonthKeys.forEach(k=>{
      const [y,m]=k.split('-').map(Number);
      const bud=finBudget.find(b=>b.key===k);
      cats.forEach(c=>{totB+=bud?c.getB(bud):0; totA+=c.getA(k,y,m);});
    });

    // 3 summary tiles
    const fw=CW/3;
    const vC=totA>=totB?C.good:C.bad;
    fillRect(ML,      cy, fw-2, 18, C.paper, 2);
    fillRect(ML+fw,   cy, fw-2, 18, C.paper, 2);
    fillRect(ML+fw*2, cy, fw-2, 18, C.paper, 2);
    sf(5.5,'bold',C.soft); doc.text('YTD BUDGET',    ML+4,       cy+5);
    sf(5.5,'bold',C.soft); doc.text('YTD ACTUAL',    ML+fw+4,    cy+5);
    sf(5.5,'bold',C.soft); doc.text('VARIANCE',       ML+fw*2+4,  cy+5);
    sf(10,'bold',C.ink);   doc.text(fmtMoney(totB),  ML+4,       cy+14);
    sf(10,'bold',C.ink);   doc.text(fmtMoney(totA),  ML+fw+4,    cy+14);
    sf(10,'bold',vC);      doc.text(`${totA>=totB?'+':''}${fmtMoney(totA-totB)}`, ML+fw*2+4, cy+14);
    cy+=22;

    // Category rows
    const catRows=cats.map(c=>{
      let totCB=0,totCA=0;
      const cells=finMonthKeys.map(k=>{
        const[y,m]=k.split('-').map(Number);
        const bud=finBudget.find(b=>b.key===k);
        const bv=bud?c.getB(bud):null;
        const av=c.getA(k,y,m);
        if(bv)totCB+=bv; if(av)totCA+=av;
        if(!bv&&!av)return'—';
        const vp=bv?((av-bv)/Math.abs(bv)*100).toFixed(1)+'%':'';
        return `${fmtMoney(av)}\n${vp}`;
      });
      const totVP=totCB>0?`${((totCA-totCB)/Math.abs(totCB)*100).toFixed(1)}%`:'—';
      return [c.label,...cells,`${fmtMoney(totCA)}\n${totVP}`];
    });

    const colH=['Category',...finMonthKeys.map(k=>{const[,m]=k.split('-').map(Number);return MONTHS[m-1].slice(0,3)}),'YTD Total'];
    doc.autoTable({
      startY:cy, margin:{left:ML,right:MR},
      head:[colH], body:catRows,
      styles:{fontSize:6.5,cellPadding:2,overflow:'linebreak',textColor:C.ink},
      headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:6.5},
      columnStyles:{0:{fontStyle:'bold',cellWidth:24}},
      alternateRowStyles:{fillColor:C.paper},
    });
    cy=doc.lastAutoTable.finalY+8;
  }

  /* YTD Monthly Detail */
  cy = sectionLabel(cy, `${curYear} Monthly Detail vs ${curYear-1}`);

  const detailRows=[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>{
    const act=entries.find(e=>e.year===curYear&&e.month===m);
    const ly=entries.find(e=>e.year===curYear-1&&e.month===m);
    const ob=!act?getMonthlyOnBooks(curYear,m):null;
    const cur2=act||(ob?{revenue:ob.revenue,adr:ob.adr,occ:ob.occ}:null);
    const src=act?'':ob?ob.source==='botb'?'[B]':'[P]':'';
    const arn=rooms?rooms*daysInMonth(curYear,m):null;
    const lyArn=rooms?rooms*daysInMonth(curYear-1,m):null;
    return [
      MONTHS[m-1].slice(0,3)+(src?' '+src:''),
      cur2?fmtMoney(cur2.revenue):(m<=curMonth?'—':''),
      cur2?.adr>0?fmtMoney2(cur2.adr):(m<=curMonth?'—':''),
      cur2?.occ>0?fmtPct(cur2.occ):(m<=curMonth?'—':''),
      cur2&&arn?fmtMoney2(cur2.revenue/arn):(m<=curMonth?'—':''),
      ly?fmtMoney(ly.revenue):'—',
      ly?.adr>0?fmtMoney2(ly.adr):'—',
      ly?.occ>0?fmtPct(ly.occ):'—',
      ly&&lyArn?fmtMoney2(ly.revenue/lyArn):'—',
      cur2&&ly?deltaStr(cur2.revenue,ly.revenue):'—',
    ];
  });

  // YTD totals
  const ytdAE=entries.filter(e=>e.year===curYear&&e.month<=curMonth);
  const ytdLYE=entries.filter(e=>e.year===curYear-1&&e.month<=curMonth);
  const ytdRvT=ytdAE.reduce((s,e)=>s+e.revenue,0);
  const ytdLYRT=ytdLYE.reduce((s,e)=>s+e.revenue,0);
  detailRows.push([
    `YTD`,
    ytdRvT>0?fmtMoney(ytdRvT):'—',
    ytdAE.length?fmtMoney2(ytdAE.reduce((s,e)=>s+e.adr,0)/ytdAE.length):'—',
    ytdAE.length?fmtPct(ytdAE.reduce((s,e)=>s+e.occ,0)/ytdAE.length):'—',
    '—',
    ytdLYRT>0?fmtMoney(ytdLYRT):'—',
    ytdLYE.length?fmtMoney2(ytdLYE.reduce((s,e)=>s+e.adr,0)/ytdLYE.length):'—',
    ytdLYE.length?fmtPct(ytdLYE.reduce((s,e)=>s+e.occ,0)/ytdLYE.length):'—',
    '—',
    deltaStr(ytdRvT,ytdLYRT),
  ]);

  doc.autoTable({
    startY:cy, margin:{left:ML,right:MR},
    head:[[`Month`,`${curYear} Rev`,`${curYear} ADR`,`${curYear} Occ`,`${curYear} RvPAR`,`${curYear-1} Rev`,`${curYear-1} ADR`,`${curYear-1} Occ`,`${curYear-1} RvPAR`,'Rev Δ%']],
    body:detailRows,
    styles:{fontSize:7,cellPadding:2.2,textColor:C.ink},
    headStyles:{fillColor:C.navy,textColor:C.white,fontStyle:'bold',fontSize:6.5},
    alternateRowStyles:{fillColor:C.paper},
    columnStyles:{
      0:{fontStyle:'bold'},
      1:{halign:'right'},2:{halign:'right'},3:{halign:'right'},4:{halign:'right'},
      5:{halign:'right'},6:{halign:'right'},7:{halign:'right'},8:{halign:'right'},
      9:{halign:'right',fontStyle:'bold'},
    },
    didParseCell:d=>{
      const isYTD=d.row.index===detailRows.length-1;
      if(isYTD){d.cell.styles.fillColor=C.navy;d.cell.styles.textColor=C.white;d.cell.styles.fontStyle='bold';}
      if(!isYTD&&d.section==='body'&&d.column.index===9){
        const v=parseFloat((d.cell.raw||'').replace(/[+%]/g,''));
        if(!isNaN(v))d.cell.styles.textColor=v>=0?C.good:C.bad;
      }
    }
  });

  pageFooter();

  /* ── Save ── */
  const fname=`${propName.replace(/\s+/g,'-')}-Report-${MONTHS[curMonth-1]}-${curYear}.pdf`;
  doc.save(fname);
};
