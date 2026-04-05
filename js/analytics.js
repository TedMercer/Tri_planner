/* ══════════════════════════════════════════
   TriPlan — Analytics (Firebase Edition)
   ══════════════════════════════════════════ */

Chart.defaults.color = '#8B90A0';
Chart.defaults.borderColor = 'rgba(51,56,73,0.5)';
Chart.defaults.font.family = "'DM Sans', sans-serif";
Chart.defaults.font.size = 11;

const CHART_COLORS = {
  run: { primary: '#E07B39', bg: 'rgba(224,123,57,0.3)', light: 'rgba(224,123,57,0.08)' },
  bike: { primary: '#2A9D8F', bg: 'rgba(42,157,143,0.3)', light: 'rgba(42,157,143,0.08)' },
  swim: { primary: '#6A7BDB', bg: 'rgba(106,123,219,0.3)', light: 'rgba(106,123,219,0.08)' },
  compare: { primary: '#B5637A', bg: 'rgba(181,99,122,0.3)' },
  planned: { primary: '#8B90A0', bg: 'rgba(139,144,160,0.2)' },
  actual: { primary: '#4CAF82', bg: 'rgba(76,175,130,0.3)' }
};
const HEATMAP_COLORS = ['rgba(255,255,255,0.03)','rgba(224,123,57,0.15)','rgba(224,123,57,0.3)','rgba(224,123,57,0.5)','rgba(224,123,57,0.7)'];

let chartInstances = {};
let currentWeeklyType = 'run';

function getWeeklyData(a, weeks, source) {
  const result = []; const today = getThisSunday();
  for (let w = weeks-1; w >= 0; w--) {
    const sun = new Date(today); sun.setDate(today.getDate() - w*7);
    const label = `${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
    let run=0,bike=0,swim=0;
    const activities = source==='actual' ? (a.actuals||{}) : (a.activities||{});
    for (let d=0;d<7;d++) { const day=new Date(sun); day.setDate(sun.getDate()+d); const dk=dateKey(day);
      (activities[dk]||[]).forEach(act=>{if(act.type==='run')run+=parseFloat(act.qty)||0;else if(act.type==='bike')bike+=parseFloat(act.qty)||0;else if(act.type==='swim')swim+=parseFloat(act.qty)||0;}); }
    result.push({label,run,bike,swim,sunday:new Date(sun)});
  }
  return result;
}

function getMonthlyData(a, weeks, source) {
  const wd = getWeeklyData(a, weeks, source); const mm = {};
  wd.forEach(w => { const k=`${w.sunday.getFullYear()}-${String(w.sunday.getMonth()+1).padStart(2,'0')}`;
    const l=`${MONTHS[w.sunday.getMonth()]} ${w.sunday.getFullYear()}`;
    if(!mm[k]) mm[k]={label:l,run:0,bike:0,swim:0}; mm[k].run+=w.run; mm[k].bike+=w.bike; mm[k].swim+=w.swim; });
  return Object.values(mm);
}

function getDailyData(a, weeks, source) {
  const result=[]; const today=new Date(); today.setHours(0,0,0,0);
  const start=new Date(today); start.setDate(today.getDate()-weeks*7);
  const activities = source==='actual' ? (a.actuals||{}) : (a.activities||{});
  for (let d=new Date(start); d<=today; d.setDate(d.getDate()+1)) {
    const dk=dateKey(d); let total=0;
    (activities[dk]||[]).forEach(act=>{if(act.type==='swim') total+=((parseFloat(act.qty)||0)/1760); else total+=parseFloat(act.qty)||0;});
    result.push({date:new Date(d),total,dk});
  }
  return result;
}

function populateCompareDropdown() {
  const sel=document.getElementById('analyticsCompare'); const cur=sel.value;
  sel.innerHTML='<option value="">None</option>';
  athletes.forEach(a => {
    if (a.id !== viewingAthleteId) {
      const opt=document.createElement('option'); opt.value=a.id; opt.textContent=a.name; sel.appendChild(opt);
    }
  });
  sel.value=cur;
}

function renderAnalytics() {
  const weeks=parseInt(document.getElementById('analyticsRange').value);
  const source=document.getElementById('analyticsDataSource').value;
  const compareId=document.getElementById('analyticsCompare').value;
  const a=currentAthlete(); if(!a) return;
  const ca = compareId ? athleteById(compareId) : null;
  renderWeeklyChart(a,weeks,source,ca); renderMonthlyChart(a,weeks,source);
  renderDonutChart(a,weeks,source); renderCumulativeChart(a,weeks,source,ca);
  renderPvAChart(a,weeks); renderHeatmap(a,weeks,source);
}

function destroyChart(id) { if(chartInstances[id]){chartInstances[id].destroy();delete chartInstances[id];} }

function switchWeeklyChart(type) {
  currentWeeklyType=type;
  document.querySelectorAll('#weeklyChartTabs .chart-tab').forEach(t=>t.classList.toggle('active',t.textContent.toLowerCase()===type));
  renderAnalytics();
}

function renderWeeklyChart(a,weeks,source,ca) {
  destroyChart('weekly');
  const data=getWeeklyData(a,weeks,source==='both'?'planned':source);
  const type=currentWeeklyType; const c=CHART_COLORS[type]; const u=type==='swim'?'yd':'mi';
  const datasets=[{label:`${a.name.split(' ')[0]} ${type} (${u})`,data:data.map(d=>type==='swim'?Math.round(d[type]):parseFloat(d[type].toFixed(1))),backgroundColor:c.bg,borderColor:c.primary,borderWidth:1.5,borderRadius:4}];
  if(ca){const cd=getWeeklyData(ca,weeks,source==='both'?'planned':source);datasets.push({label:`${ca.name.split(' ')[0]} ${type} (${u})`,data:cd.map(d=>type==='swim'?Math.round(d[type]):parseFloat(d[type].toFixed(1))),backgroundColor:CHART_COLORS.compare.bg,borderColor:CHART_COLORS.compare.primary,borderWidth:1.5,borderRadius:4});}
  chartInstances['weekly']=new Chart(document.getElementById('chartWeekly'),{type:'bar',data:{labels:data.map(d=>d.label),datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:datasets.length>1}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}});
}

function renderMonthlyChart(a,weeks,source) {
  destroyChart('monthly');
  const data=getMonthlyData(a,weeks,source==='both'?'planned':source);
  chartInstances['monthly']=new Chart(document.getElementById('chartMonthly'),{type:'bar',data:{labels:data.map(d=>d.label),datasets:[
    {label:'Run (mi)',data:data.map(d=>parseFloat(d.run.toFixed(1))),backgroundColor:CHART_COLORS.run.bg,borderColor:CHART_COLORS.run.primary,borderWidth:1,borderRadius:3},
    {label:'Bike (mi)',data:data.map(d=>parseFloat(d.bike.toFixed(1))),backgroundColor:CHART_COLORS.bike.bg,borderColor:CHART_COLORS.bike.primary,borderWidth:1,borderRadius:3},
    {label:'Swim (100yd)',data:data.map(d=>Math.round(d.swim/100)),backgroundColor:CHART_COLORS.swim.bg,borderColor:CHART_COLORS.swim.primary,borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:12}}},scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}}}}});
}

function renderDonutChart(a,weeks,source) {
  destroyChart('donut');
  const data=getWeeklyData(a,weeks,source==='both'?'planned':source);
  let rT=0,bT=0,sT=0; data.forEach(d=>{rT+=d.run;bT+=d.bike;sT+=d.swim/1760;});
  const total=rT+bT+sT;
  if(total===0){chartInstances['donut']=new Chart(document.getElementById('chartDonut'),{type:'doughnut',data:{labels:['No data'],datasets:[{data:[1],backgroundColor:['rgba(51,56,73,0.3)'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},cutout:'65%'}});return;}
  chartInstances['donut']=new Chart(document.getElementById('chartDonut'),{type:'doughnut',data:{labels:['Run','Bike','Swim'],datasets:[{data:[parseFloat(rT.toFixed(1)),parseFloat(bT.toFixed(1)),parseFloat(sT.toFixed(1))],backgroundColor:[CHART_COLORS.run.primary,CHART_COLORS.bike.primary,CHART_COLORS.swim.primary],borderWidth:0,hoverOffset:8}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{position:'bottom',labels:{boxWidth:10,padding:14}},tooltip:{callbacks:{label:ctx=>{const pct=((ctx.parsed/total)*100).toFixed(0);return `${ctx.label}: ${pct}%`;}}}}}});
}

function renderCumulativeChart(a,weeks,source,ca) {
  destroyChart('cumulative');
  const data=getWeeklyData(a,weeks,source==='both'?'planned':source);
  let cr=0,cb=0; const rc=[],bc=[];
  data.forEach(d=>{cr+=d.run;cb+=d.bike;rc.push(parseFloat(cr.toFixed(1)));bc.push(parseFloat(cb.toFixed(1)));});
  const datasets=[
    {label:'Run (mi)',data:rc,borderColor:CHART_COLORS.run.primary,backgroundColor:CHART_COLORS.run.light,fill:true,tension:0.3,borderWidth:2,pointRadius:2},
    {label:'Bike (mi)',data:bc,borderColor:CHART_COLORS.bike.primary,backgroundColor:CHART_COLORS.bike.light,fill:true,tension:0.3,borderWidth:2,pointRadius:2}
  ];
  if(ca){const cd=getWeeklyData(ca,weeks,source==='both'?'planned':source);let ccr=0;const crc=[];cd.forEach(d=>{ccr+=d.run;crc.push(parseFloat(ccr.toFixed(1)));});
    datasets.push({label:`${ca.name.split(' ')[0]} Run`,data:crc,borderColor:CHART_COLORS.compare.primary,borderDash:[5,3],fill:false,tension:0.3,borderWidth:2,pointRadius:1});}
  chartInstances['cumulative']=new Chart(document.getElementById('chartCumulative'),{type:'line',data:{labels:data.map(d=>d.label),datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:10}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'}},x:{grid:{display:false}}}}});
}

function renderPvAChart(a,weeks) {
  destroyChart('pva');
  const p=getWeeklyData(a,weeks,'planned'); const ac=getWeeklyData(a,weeks,'actual');
  const pt=p.map(d=>parseFloat((d.run+d.bike+d.swim/1760).toFixed(1)));
  const at=ac.map(d=>parseFloat((d.run+d.bike+d.swim/1760).toFixed(1)));
  chartInstances['pva']=new Chart(document.getElementById('chartPvA'),{type:'bar',data:{labels:p.map(d=>d.label),datasets:[
    {label:'Planned',data:pt,backgroundColor:CHART_COLORS.planned.bg,borderColor:CHART_COLORS.planned.primary,borderWidth:1,borderRadius:3},
    {label:'Actual',data:at,backgroundColor:CHART_COLORS.actual.bg,borderColor:CHART_COLORS.actual.primary,borderWidth:1,borderRadius:3}
  ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{boxWidth:10,padding:12}}},scales:{y:{beginAtZero:true,grid:{color:'rgba(51,56,73,0.3)'},title:{display:true,text:'Equivalent Miles',color:'#5C6175',font:{size:10}}},x:{grid:{display:false}}}}});
}

function renderHeatmap(a,weeks,source) {
  const container=document.getElementById('heatmapContainer');
  const dd=getDailyData(a,weeks,source==='both'?'planned':source);
  if(dd.length===0){container.innerHTML='<div style="color:var(--text-dim);font-size:12px;padding:20px;text-align:center;">No data.</div>';return;}
  const maxVal=Math.max(...dd.map(d=>d.total),1);
  const dayLabels=['S','M','T','W','T','F','S'];
  const weekCols=[];let currentCol=[];let lastWS=null;
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
      const color=d.total===0?HEATMAP_COLORS[0]:HEATMAP_COLORS[Math.max(1,intensity)];
      const tip=`${MONTHS[d.date.getMonth()]} ${d.date.getDate()}: ${d.total>0?d.total.toFixed(1)+' equiv mi':'Rest'}`;
      ghtml+=`<div class="heatmap-cell" style="background:${color}" data-tooltip="${tip}"></div>`;}
    else{ghtml+='<div class="heatmap-cell"></div>';}}ghtml+='</div>';});
  ghtml+='</div></div>';

  let lhtml='<div class="heatmap-legend"><span>Less</span>';
  HEATMAP_COLORS.forEach(c=>{lhtml+=`<div class="hm-swatch" style="background:${c}"></div>`;});
  lhtml+='<span>More</span></div>';
  container.innerHTML=mhtml+ghtml+lhtml;
}
