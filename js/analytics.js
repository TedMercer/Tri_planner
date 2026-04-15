/* ══════════════════════════════════════════
   TriPlan — Analytics + StackUp + PMC
   ══════════════════════════════════════════ */
Chart.defaults.color = '#8B90A0';
Chart.defaults.borderColor = 'rgba(51,56,73,0.5)';
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size = 11;

const CC = {
  run: { primary: '#E07B39', bg: 'rgba(224,123,57,0.3)', light: 'rgba(224,123,57,0.08)' },
  bike: { primary: '#2A9D8F', bg: 'rgba(42,157,143,0.3)', light: 'rgba(42,157,143,0.08)' },
  swim: { primary: '#6A7BDB', bg: 'rgba(106,123,219,0.3)', light: 'rgba(106,123,219,0.08)' },
  compare: { primary: '#B5637A', bg: 'rgba(181,99,122,0.3)', light: 'rgba(181,99,122,0.08)' },
  planned: { primary: '#8B90A0', bg: 'rgba(139,144,160,0.2)' },
  actual: { primary: '#4CAF82', bg: 'rgba(76,175,130,0.3)' },
  fitness: '#3B82F6', fatigue: '#EC4899', form: '#FBBF24'
};
const HM_COLORS = ['rgba(255,255,255,0.03)','rgba(224,123,57,0.15)','rgba(224,123,57,0.3)','rgba(224,123,57,0.5)','rgba(224,123,57,0.7)'];

let chartInstances = {};
let currentWeeklyType = 'run';
let stackupWeeklyType = 'run';

// ── Data Aggregation ──
function getWeeklyData(a, weeks, source) {
  const result = []; const today = getThisSunday();
  for (let w = weeks-1; w >= 0; w--) {
    const sun = new Date(today); sun.setDate(today.getDate() - w*7);
    let run=0,bike=0,swim=0;
    const acts = source==='actual' ? (a.actuals||{}) : (a.activities||{});
    for (let d=0;d<7;d++) { const day=new Date(sun); day.setDate(sun.getDate()+d);
      (acts[dateKey(day)]||[]).forEach(act=>{if(act.type==='run')run+=parseFloat(act.qty)||0;else if(act.type==='bike')bike+=parseFloat(act.qty)||0;else if(act.type==='swim')swim+=parseFloat(act.qty)||0;}); }
    result.push({label:`${MONTHS[sun.getMonth()]} ${sun.getDate()}`,run,bike,swim,sunday:new Date(sun)});
  }
  return result;
}

function getMonthlyData(a, weeks, source) {
  const wd = getWeeklyData(a, weeks, source); const mm = {};
  wd.forEach(w => { const k=`${w.sunday.getFullYear()}-${String(w.sunday.getMonth()+1).padStart(2,'0')}`;
    if(!mm[k]) mm[k]={label:`${MONTHS[w.sunday.getMonth()]} ${w.sunday.getFullYear()}`,run:0,bike:0,swim:0}; mm[k].run+=w.run; mm[k].bike+=w.bike; mm[k].swim+=w.swim; });
  return Object.values(mm);
}

function getDailyData(a, weeks, source) {
  const result=[]; const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today); start.setDate(today.getDate()-weeks*7);
  const acts = source==='actual' ? (a.actuals||{}) : (a.activities||{});
  for (let d=new Date(start); d<=today; d.setDate(d.getDate()+1)) {
    const dk=dateKey(d); let total=0;
    (acts[dk]||[]).forEach(act=>{if(act.type==='swim') total+=((parseFloat(act.qty)||0)/1760); else total+=parseFloat(act.qty)||0;});
    result.push({date:new Date(d),total,dk});
  }
  return result;
}

// ── TSS Estimation (distance-based, no power meter needed) ──
// Rough TSS per mile/yard: Run ~15 TSS/mi, Bike ~5 TSS/mi, Swim ~3 TSS/100yd
function estimateDailyTSS(a, dk, source) {
  const acts = source==='actual' ? (a.actuals||{}) : (a.activities||{});
  let tss = 0;
  (acts[dk]||[]).forEach(act => {
    if (act.type === 'run') tss += (parseFloat(act.qty)||0) * 15;
    else if (act.type === 'bike') tss += (parseFloat(act.qty)||0) * 5;
    else if (act.type === 'swim') tss += ((parseFloat(act.qty)||0) / 100) * 3;
  });
  return tss;
}

// ── PMC Calculation ──
function calculatePMC(a, days, source) {
  const ctlTau = 42; const atlTau = 7;
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today); start.setDate(today.getDate() - days);
  // We need extra runway for the exponential to settle
  const runway = new Date(start); runway.setDate(start.getDate() - 60);

  let ctl = 0, atl = 0;
  const result = [];

  for (let d = new Date(runway); d <= today; d.setDate(d.getDate()+1)) {
    const dk = dateKey(d);
    const tss = estimateDailyTSS(a, dk, source);
    ctl = ctl + (tss - ctl) / ctlTau;
    atl = atl + (tss - atl) / atlTau;
    const tsb = ctl - atl;
    if (d >= start) {
      result.push({ date: new Date(d), ctl: parseFloat(ctl.toFixed(1)), atl: parseFloat(atl.toFixed(1)), tsb: parseFloat(tsb.toFixed(1)), tss: parseFloat(tss.toFixed(0)) });
    }
  }
  return result;
}

// ══════════════════════════════════════════
// ANALYTICS RENDERING
// ══════════════════════════════════════════
function renderAnalytics() {
  const weeks = parseInt(document.getElementById('analyticsRange').value);
  const source = document.getElementById('analyticsDataSource').value;
  const a = currentAthlete(); if (!a) return;
  renderPMCChart(a, weeks, source);
  renderWeeklyChart(a, weeks, source);
  renderMonthlyChart(a, weeks, source);
  renderDonutChart(a, weeks, source);
  renderCumulativeChart(a, weeks, source);
  renderPvAChart(a, weeks);
  renderHeatmap(a, weeks, source, 'heatmapContainer');
}

function destroyChart(id) { if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];} }

// ── PMC Chart ──
function renderPMCChart(a, weeks, source) {
  destroyChart('pmc');
  const src = source === 'both' ? 'actual' : source;
  const data = calculatePMC(a, weeks * 7, src);
  if (data.length === 0) return;

  const labels = data.map(d => `${MONTHS[d.date.getMonth()]} ${d.date.getDate()}`);
  // Show every Nth label to avoid crowding
  const step = Math.max(1, Math.floor(data.length / 20));
  const displayLabels = labels.map((l, i) => i % step === 0 ? l : '');

  chartInstances['pmc'] = new Chart(document.getElementById('chartPMC'), {
    type: 'line',
    data: {
      labels: displayLabels,
      datasets: [
        { label: 'Fitness (CTL)', data: data.map(d => d.ctl), borderColor: CC.fitness, backgroundColor: 'rgba(59,130,246,0.06)', fill: true, tension: 0.3, borderWidth: 2.5, pointRadius: 0 },
        { label: 'Fatigue (ATL)', data: data.map(d => d.atl), borderColor: CC.fatigue, backgroundColor: 'rgba(236,72,153,0.06)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0 },
        { label: 'Form (TSB)', data: data.map(d => d.tsb), borderColor: CC.form, backgroundColor: 'rgba(251,191,36,0.06)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, borderDash: [4,2] },
        { label: 'Daily TSS', data: data.map(d => d.tss), type: 'bar', backgroundColor: 'rgba(139,144,160,0.15)', borderWidth: 0, barPercentage: 0.9, yAxisID: 'y1', order: 1 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } },
        tooltip: { callbacks: { title: (items) => { const idx = items[0].dataIndex; const d = data[idx]; return `${MONTHS[d.date.getMonth()]} ${d.date.getDate()}, ${d.date.getFullYear()}`; } } } },
      scales: {
        y: { beginAtZero: false, grid: { color: 'rgba(51,56,73,0.3)' }, title: { display: true, text: 'CTL / ATL / TSB', color: '#5C6175', font: { size: 10 } } },
        y1: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'TSS', color: '#5C6175', font: { size: 10 } }, ticks: { color: '#5C6175' } },
        x: { grid: { display: false }, ticks: { maxRotation: 0 } }
      }
    }
  });
}

// ── Weekly Volume ──
function switchWeeklyChart(type) {
  currentWeeklyType = type;
  document.querySelectorAll('#weeklyChartTabs .chart-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === type));
  renderAnalytics();
}

function renderWeeklyChart(a, weeks, source) {
  destroyChart('weekly');
  const data = getWeeklyData(a, weeks, source==='both'?'planned':source);
  const type = currentWeeklyType; const c = CC[type]; const u = type==='swim'?'yd':'mi';
  chartInstances['weekly'] = new Chart(document.getElementById('chartWeekly'), {
    type:'bar', data:{labels:data.map(d=>d.label), datasets:[{label:`${type} (${u})`,data:data.map(d=>type==='swim'?Math.round(d[type]):parseFloat(d[type].toFixed(1))),backgroundColor:c.bg,borderColor:c.primary,borderWidth:1.5,borderRadius:4}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}
  });
}

function renderMonthlyChart(a, weeks, source) {
  destroyChart('monthly');
  const data = getMonthlyData(a, weeks, source==='both'?'planned':source);
  chartInstances['monthly'] = new Chart(document.getElementById('chartMonthly'), {type:'bar',data:{labels:data.map(d=>d.label),datasets:[
    {label:'Run (mi)',data:data.map(d=>parseFloat(d.run.toFixed(1))),backgroundColor:CC.run.bg,borderColor:CC.run.primary,borderWidth:1,borderRadius:3},
    {label:'Bike (mi)',data:data.map(d=>parseFloat(d.bike.toFixed(1))),backgroundColor:CC.bike.bg,borderColor:CC.bike.primary,borderWidth:1,borderRadius:3},
    {label:'Swim (100yd)',data:data.map(d=>Math.round(d.swim/100)),backgroundColor:CC.swim.bg,borderColor:CC.swim.primary,borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:12}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}}}}});
}

function renderDonutChart(a, weeks, source) {
  destroyChart('donut');
  const data = getWeeklyData(a, weeks, source==='both'?'planned':source);
  let rT=0,bT=0,sT=0; data.forEach(d=>{rT+=d.run;bT+=d.bike;sT+=d.swim/1760;});
  const total=rT+bT+sT;
  if(total===0){chartInstances['donut']=new Chart(document.getElementById('chartDonut'),{type:'doughnut',data:{labels:['No data'],datasets:[{data:[1],backgroundColor:['rgba(51,56,73,0.3)'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});return;}
  chartInstances['donut']=new Chart(document.getElementById('chartDonut'),{type:'doughnut',data:{labels:['Run','Bike','Swim'],datasets:[{data:[parseFloat(rT.toFixed(1)),parseFloat(bT.toFixed(1)),parseFloat(sT.toFixed(1))],backgroundColor:[CC.run.primary,CC.bike.primary,CC.swim.primary],borderWidth:0,hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14}},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${((ctx.parsed/total)*100).toFixed(0)}%`}}}}});
}

function renderCumulativeChart(a, weeks, source) {
  destroyChart('cumulative');
  const data = getWeeklyData(a, weeks, source==='both'?'planned':source);
  let cr=0,cb=0; const rc=[],bc=[];
  data.forEach(d=>{cr+=d.run;cb+=d.bike;rc.push(parseFloat(cr.toFixed(1)));bc.push(parseFloat(cb.toFixed(1)));});
  chartInstances['cumulative']=new Chart(document.getElementById('chartCumulative'),{type:'line',data:{labels:data.map(d=>d.label),datasets:[
    {label:'Run (mi)',data:rc,borderColor:CC.run.primary,backgroundColor:CC.run.light,fill:true,tension:0.3,borderWidth:2,pointRadius:2},
    {label:'Bike (mi)',data:bc,borderColor:CC.bike.primary,backgroundColor:CC.bike.light,fill:true,tension:0.3,borderWidth:2,pointRadius:2}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:10}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}});
}

function renderPvAChart(a, weeks) {
  destroyChart('pva');
  const p=getWeeklyData(a,weeks,'planned'); const ac=getWeeklyData(a,weeks,'actual');
  chartInstances['pva']=new Chart(document.getElementById('chartPvA'),{type:'bar',data:{labels:p.map(d=>d.label),datasets:[
    {label:'Planned',data:p.map(d=>parseFloat((d.run+d.bike+d.swim/1760).toFixed(1))),backgroundColor:CC.planned.bg,borderColor:CC.planned.primary,borderWidth:1,borderRadius:3},
    {label:'Actual',data:ac.map(d=>parseFloat((d.run+d.bike+d.swim/1760).toFixed(1))),backgroundColor:CC.actual.bg,borderColor:CC.actual.primary,borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:12}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}});
}

// ── Heatmap (shared between Analytics and StackUp) ──
function renderHeatmap(a, weeks, source, containerId) {
  const container = document.getElementById(containerId);
  const dd = getDailyData(a, weeks, source==='both'?'planned':source);
  if(dd.length===0){container.innerHTML='<div style="color:var(--text-dim);font-size:12px;padding:20px;text-align:center;">No data.</div>';return;}
  const maxVal = Math.max(...dd.map(d=>d.total),1);
  const dayLabels = ['S','M','T','W','T','F','S'];
  const weekCols=[]; let currentCol=[]; let lastWS=null;
  dd.forEach(d=>{const dow=d.date.getDay();const ws=new Date(d.date);ws.setDate(d.date.getDate()-dow);const wsk=dateKey(ws);
    if(lastWS!==wsk){if(currentCol.length>0)weekCols.push(currentCol);currentCol=new Array(7).fill(null);lastWS=wsk;}currentCol[dow]=d;});
  if(currentCol.length>0)weekCols.push(currentCol);

  let mhtml='<div class="heatmap-month-labels">';let lm=-1;
  weekCols.forEach(col=>{const fd=col.find(d=>d);if(fd){const m=fd.date.getMonth();if(m!==lm){mhtml+=`<span style="min-width:19px">${MONTHS[m]}</span>`;lm=m;}else{mhtml+='<span style="min-width:19px"></span>';}}});
  mhtml+='</div>';
  let ghtml='<div style="display:flex;"><div class="heatmap-day-labels">';
  dayLabels.forEach(l=>{ghtml+=`<span>${l}</span>`;});
  ghtml+='</div><div class="heatmap-grid">';
  weekCols.forEach(col=>{ghtml+='<div class="heatmap-col">';
    for(let i=0;i<7;i++){const d=col[i];if(d){const intensity=Math.min(4,Math.floor((d.total/maxVal)*4));
      const color=d.total===0?HM_COLORS[0]:HM_COLORS[Math.max(1,intensity)];
      ghtml+=`<div class="heatmap-cell" style="background:${color}" data-tooltip="${MONTHS[d.date.getMonth()]} ${d.date.getDate()}: ${d.total>0?d.total.toFixed(1)+' equiv mi':'Rest'}"></div>`;}
    else{ghtml+='<div class="heatmap-cell"></div>';}}ghtml+='</div>';});
  ghtml+='</div></div>';
  let lhtml='<div class="heatmap-legend"><span>Less</span>';
  HM_COLORS.forEach(c=>{lhtml+=`<div class="hm-swatch" style="background:${c}"></div>`;});
  lhtml+='<span>More</span></div>';
  container.innerHTML=mhtml+ghtml+lhtml;
}

// ══════════════════════════════════════════
// STACKUP
// ══════════════════════════════════════════
function populateStackUpDropdown() {
  const sel = document.getElementById('stackupCompare');
  const cur = sel.value;
  sel.innerHTML = '';
  athletes.forEach(a => {
    if (a.id !== viewingAthleteId) {
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.name; sel.appendChild(opt);
    }
  });
  // If nothing selected and options exist, select first
  if (!cur && sel.options.length > 0) sel.selectedIndex = 0;
  else sel.value = cur;
}

function switchStackUpWeekly(type) {
  stackupWeeklyType = type;
  document.querySelectorAll('#stackupWeeklyTabs .chart-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === type));
  renderStackUp();
}

function renderStackUp() {
  const weeks = parseInt(document.getElementById('stackupRange').value);
  const source = document.getElementById('stackupSource').value;
  const compareId = document.getElementById('stackupCompare').value;

  const a = currentAthlete(); if (!a) return;
  const b = compareId ? athleteById(compareId) : null;

  renderStackUpSummary(a, b, weeks, source);
  renderStackUpWeekly(a, b, weeks, source);
  renderStackUpCumulative(a, b, weeks, source);
  renderStackUpDonuts(a, b, weeks, source);
  renderStackUpHeatmaps(a, b, weeks, source);
}

function renderStackUpSummary(a, b, weeks, source) {
  const container = document.getElementById('stackupSummary');
  const aData = getWeeklyData(a, weeks, source);
  const bData = b ? getWeeklyData(b, weeks, source) : null;

  const sum = (data, type) => data.reduce((s, d) => s + d[type], 0);
  const avgPerWeek = (data, type) => data.length > 0 ? sum(data, type) / data.length : 0;

  const metrics = [
    { label: 'Total Run', type: 'run', unit: 'mi', fmt: v => v.toFixed(1) },
    { label: 'Total Bike', type: 'bike', unit: 'mi', fmt: v => v.toFixed(1) },
    { label: 'Total Swim', type: 'swim', unit: 'yd', fmt: v => Math.round(v) },
    { label: 'Avg Run/wk', type: 'run', unit: 'mi', fmt: v => v.toFixed(1), avg: true },
    { label: 'Avg Bike/wk', type: 'bike', unit: 'mi', fmt: v => v.toFixed(1), avg: true },
    { label: 'Sessions/wk', type: null, unit: '', fmt: v => v.toFixed(1), custom: (data) => {
      const totalSessions = data.reduce((s,d) => s + ((d.run>0?1:0)+(d.bike>0?1:0)+(d.swim>0?1:0)), 0);
      return data.length > 0 ? totalSessions / data.length : 0;
    }}
  ];

  let html = '<div class="stackup-cards">';
  metrics.forEach(m => {
    const aVal = m.custom ? m.custom(aData) : (m.avg ? avgPerWeek(aData, m.type) : sum(aData, m.type));
    const bVal = b ? (m.custom ? m.custom(bData) : (m.avg ? avgPerWeek(bData, m.type) : sum(bData, m.type))) : null;
    const aWins = bVal !== null && aVal > bVal;
    const bWins = bVal !== null && bVal > aVal;

    html += `<div class="stackup-card">
      <div class="stackup-card-label">${m.label}</div>
      <div class="stackup-card-values">
        <div class="stackup-val ${aWins?'winner':''}">${m.fmt(aVal)} <span>${m.unit}</span></div>
        ${bVal !== null ? `<div class="stackup-vs">vs</div><div class="stackup-val compare ${bWins?'winner':''}">${m.fmt(bVal)} <span>${m.unit}</span></div>` : '<div class="stackup-val compare" style="color:var(--text-dim)">—</div>'}
      </div>
      <div class="stackup-card-names"><span>${a.name.split(' ')[0]}</span>${b?`<span>${b.name.split(' ')[0]}</span>`:''}</div>
    </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function renderStackUpWeekly(a, b, weeks, source) {
  destroyChart('stackWeekly');
  const aData = getWeeklyData(a, weeks, source);
  const type = stackupWeeklyType; const u = type==='swim'?'yd':'mi';
  const datasets = [{
    label: a.name.split(' ')[0], data: aData.map(d => type==='swim'?Math.round(d[type]):parseFloat(d[type].toFixed(1))),
    backgroundColor: CC[type].bg, borderColor: CC[type].primary, borderWidth: 1.5, borderRadius: 4
  }];
  if (b) {
    const bData = getWeeklyData(b, weeks, source);
    datasets.push({
      label: b.name.split(' ')[0], data: bData.map(d => type==='swim'?Math.round(d[type]):parseFloat(d[type].toFixed(1))),
      backgroundColor: CC.compare.bg, borderColor: CC.compare.primary, borderWidth: 1.5, borderRadius: 4
    });
  }
  chartInstances['stackWeekly'] = new Chart(document.getElementById('chartStackWeekly'), {
    type:'bar', data:{labels:aData.map(d=>d.label), datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{boxWidth:10,padding:12}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}
  });
}

function renderStackUpCumulative(a, b, weeks, source) {
  destroyChart('stackCumulative');
  const aData = getWeeklyData(a, weeks, source);
  let aR=0,aB=0; const aRc=[],aBc=[];
  aData.forEach(d=>{aR+=d.run;aB+=d.bike;aRc.push(parseFloat(aR.toFixed(1)));aBc.push(parseFloat(aB.toFixed(1)));});

  const datasets = [
    {label:`${a.name.split(' ')[0]} Run`,data:aRc,borderColor:CC.run.primary,fill:false,tension:0.3,borderWidth:2,pointRadius:1},
    {label:`${a.name.split(' ')[0]} Bike`,data:aBc,borderColor:CC.bike.primary,fill:false,tension:0.3,borderWidth:2,pointRadius:1}
  ];
  if (b) {
    const bData = getWeeklyData(b, weeks, source);
    let bR=0,bB=0; const bRc=[],bBc=[];
    bData.forEach(d=>{bR+=d.run;bB+=d.bike;bRc.push(parseFloat(bR.toFixed(1)));bBc.push(parseFloat(bB.toFixed(1)));});
    datasets.push({label:`${b.name.split(' ')[0]} Run`,data:bRc,borderColor:CC.compare.primary,borderDash:[5,3],fill:false,tension:0.3,borderWidth:2,pointRadius:1});
    datasets.push({label:`${b.name.split(' ')[0]} Bike`,data:bBc,borderColor:CC.compare.primary,fill:false,tension:0.3,borderWidth:1.5,pointRadius:1,borderDash:[2,2]});
  }
  chartInstances['stackCumulative']=new Chart(document.getElementById('chartStackCumulative'),{type:'line',data:{labels:aData.map(d=>d.label),datasets},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:8,font:{size:10}}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}});
}

function renderStackUpDonuts(a, b, weeks, source) {
  destroyChart('stackDonut1'); destroyChart('stackDonut2');
  const aData = getWeeklyData(a, weeks, source);
  let aR=0,aB=0,aS=0; aData.forEach(d=>{aR+=d.run;aB+=d.bike;aS+=d.swim/1760;});
  document.getElementById('stackDonutLabel1').textContent = a.name.split(' ')[0];

  const makeDonut = (id, r, b2, s) => {
    const total = r+b2+s;
    if (total===0) return new Chart(document.getElementById(id),{type:'doughnut',data:{labels:['No data'],datasets:[{data:[1],backgroundColor:['rgba(51,56,73,0.3)'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:true,plugins:{legend:{display:false}},cutout:'60%'}});
    return new Chart(document.getElementById(id),{type:'doughnut',data:{labels:['Run','Bike','Swim'],datasets:[{data:[parseFloat(r.toFixed(1)),parseFloat(b2.toFixed(1)),parseFloat(s.toFixed(1))],backgroundColor:[CC.run.primary,CC.bike.primary,CC.swim.primary],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:true,cutout:'60%',plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>`${ctx.label}: ${((ctx.parsed/total)*100).toFixed(0)}%`}}}}});
  };
  chartInstances['stackDonut1'] = makeDonut('chartStackDonut1', aR, aB, aS);

  if (b) {
    const bData = getWeeklyData(b, weeks, source);
    let bR=0,bB=0,bS=0; bData.forEach(d=>{bR+=d.run;bB+=d.bike;bS+=d.swim/1760;});
    document.getElementById('stackDonutLabel2').textContent = b.name.split(' ')[0];
    chartInstances['stackDonut2'] = makeDonut('chartStackDonut2', bR, bB, bS);
  } else {
    document.getElementById('stackDonutLabel2').textContent = 'No comparison';
    chartInstances['stackDonut2'] = makeDonut('chartStackDonut2', 0, 0, 0);
  }
}

function renderStackUpHeatmaps(a, b, weeks, source) {
  const container = document.getElementById('stackupHeatmaps');
  let html = `<div style="flex:1;min-width:250px;"><div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">${a.name.split(' ')[0]}</div><div id="stackHM1"></div></div>`;
  if (b) html += `<div style="flex:1;min-width:250px;"><div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px;">${b.name.split(' ')[0]}</div><div id="stackHM2"></div></div>`;
  container.innerHTML = html;

  renderHeatmap(a, weeks, source, 'stackHM1');
  if (b) renderHeatmap(b, weeks, source, 'stackHM2');
}

// Keep populateCompareDropdown for backward compat (no longer used in analytics but may be referenced)
function populateCompareDropdown() {}
