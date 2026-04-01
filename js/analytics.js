/* ══════════════════════════════════════════
   TriPlan — Analytics & Charts
   ══════════════════════════════════════════ */

// Chart.js global config
Chart.defaults.color = '#8B90A0';
Chart.defaults.borderColor = 'rgba(51, 56, 73, 0.5)';
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

const HEATMAP_COLORS = [
  'rgba(255,255,255,0.03)',  // 0
  'rgba(224,123,57,0.15)',   // 1
  'rgba(224,123,57,0.3)',    // 2
  'rgba(224,123,57,0.5)',    // 3
  'rgba(224,123,57,0.7)',    // 4+
];

let chartInstances = {};
let currentWeeklyType = 'run';

// ══════════════════════════════════════════
// DATA AGGREGATION
// ══════════════════════════════════════════
function getWeeklyData(a, weeks, source) {
  const result = [];
  const today = getThisSunday();

  for (let w = weeks - 1; w >= 0; w--) {
    const sun = new Date(today);
    sun.setDate(today.getDate() - w * 7);
    const label = `${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
    let run = 0, bike = 0, swim = 0;
    const activities = source === 'actual' ? (a.actuals || {}) : a.activities;

    for (let d = 0; d < 7; d++) {
      const day = new Date(sun);
      day.setDate(sun.getDate() + d);
      const dk = dateKey(day);
      (activities[dk] || []).forEach(act => {
        if (act.type === 'run') run += parseFloat(act.qty) || 0;
        else if (act.type === 'bike') bike += parseFloat(act.qty) || 0;
        else if (act.type === 'swim') swim += parseFloat(act.qty) || 0;
      });
    }
    result.push({ label, run, bike, swim, sunday: new Date(sun) });
  }
  return result;
}

function getMonthlyData(a, weeks, source) {
  const weeklyData = getWeeklyData(a, weeks, source);
  const monthMap = {};

  weeklyData.forEach(w => {
    const key = `${w.sunday.getFullYear()}-${String(w.sunday.getMonth()+1).padStart(2,'0')}`;
    const label = `${MONTHS[w.sunday.getMonth()]} ${w.sunday.getFullYear()}`;
    if (!monthMap[key]) monthMap[key] = { label, run: 0, bike: 0, swim: 0 };
    monthMap[key].run += w.run;
    monthMap[key].bike += w.bike;
    monthMap[key].swim += w.swim;
  });

  return Object.values(monthMap);
}

function getDailyData(a, weeks, source) {
  const result = [];
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today);
  start.setDate(today.getDate() - weeks * 7);
  const activities = source === 'actual' ? (a.actuals || {}) : a.activities;

  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const dk = dateKey(d);
    let total = 0;
    (activities[dk] || []).forEach(act => {
      // Normalize: convert swim yards to "equivalent miles" for heatmap intensity (1000yd ≈ 0.57mi effort)
      if (act.type === 'swim') total += ((parseFloat(act.qty) || 0) / 1760);
      else total += parseFloat(act.qty) || 0;
    });
    result.push({ date: new Date(d), total, dk });
  }
  return result;
}

// ══════════════════════════════════════════
// POPULATE COMPARE DROPDOWN
// ══════════════════════════════════════════
function populateCompareDropdown() {
  const sel = document.getElementById('analyticsCompare');
  const current = sel.value;
  sel.innerHTML = '<option value="">None</option>';
  appData.athletes.forEach((a, i) => {
    if (i !== viewingAthleteIndex) {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = a.name;
      sel.appendChild(opt);
    }
  });
  sel.value = current;
}

// ══════════════════════════════════════════
// RENDER ALL CHARTS
// ══════════════════════════════════════════
function renderAnalytics() {
  const weeks = parseInt(document.getElementById('analyticsRange').value);
  const source = document.getElementById('analyticsDataSource').value;
  const compareIdx = document.getElementById('analyticsCompare').value;

  const a = athlete();
  const compareAthlete = compareIdx !== '' ? appData.athletes[parseInt(compareIdx)] : null;

  renderWeeklyChart(a, weeks, source, compareAthlete);
  renderMonthlyChart(a, weeks, source);
  renderDonutChart(a, weeks, source);
  renderCumulativeChart(a, weeks, source, compareAthlete);
  renderPvAChart(a, weeks);
  renderHeatmap(a, weeks, source);
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

// ── Weekly Volume Bar Chart ──
function switchWeeklyChart(type) {
  currentWeeklyType = type;
  document.querySelectorAll('#weeklyChartTabs .chart-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === type));
  renderAnalytics();
}

function renderWeeklyChart(a, weeks, source, compareAthlete) {
  destroyChart('weekly');
  const data = getWeeklyData(a, weeks, source === 'both' ? 'planned' : source);
  const type = currentWeeklyType;
  const c = CHART_COLORS[type];
  const unit = type === 'swim' ? 'yd' : 'mi';

  const datasets = [{
    label: `${a.name.split(' ')[0]} ${type} (${unit})`,
    data: data.map(d => type === 'swim' ? Math.round(d[type]) : parseFloat(d[type].toFixed(1))),
    backgroundColor: c.bg,
    borderColor: c.primary,
    borderWidth: 1.5,
    borderRadius: 4,
  }];

  if (compareAthlete) {
    const cData = getWeeklyData(compareAthlete, weeks, source === 'both' ? 'planned' : source);
    datasets.push({
      label: `${compareAthlete.name.split(' ')[0]} ${type} (${unit})`,
      data: cData.map(d => type === 'swim' ? Math.round(d[type]) : parseFloat(d[type].toFixed(1))),
      backgroundColor: CHART_COLORS.compare.bg,
      borderColor: CHART_COLORS.compare.primary,
      borderWidth: 1.5,
      borderRadius: 4,
    });
  }

  chartInstances['weekly'] = new Chart(document.getElementById('chartWeekly'), {
    type: 'bar',
    data: { labels: data.map(d => d.label), datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: datasets.length > 1 } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(51,56,73,0.3)' } }, x: { grid: { display: false } } } }
  });
}

// ── Monthly Volume ──
function renderMonthlyChart(a, weeks, source) {
  destroyChart('monthly');
  const data = getMonthlyData(a, weeks, source === 'both' ? 'planned' : source);

  chartInstances['monthly'] = new Chart(document.getElementById('chartMonthly'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.label),
      datasets: [
        { label: 'Run (mi)', data: data.map(d => parseFloat(d.run.toFixed(1))), backgroundColor: CHART_COLORS.run.bg, borderColor: CHART_COLORS.run.primary, borderWidth: 1, borderRadius: 3 },
        { label: 'Bike (mi)', data: data.map(d => parseFloat(d.bike.toFixed(1))), backgroundColor: CHART_COLORS.bike.bg, borderColor: CHART_COLORS.bike.primary, borderWidth: 1, borderRadius: 3 },
        { label: 'Swim (100yd)', data: data.map(d => Math.round(d.swim / 100)), backgroundColor: CHART_COLORS.swim.bg, borderColor: CHART_COLORS.swim.primary, borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } } }, scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(51,56,73,0.3)' } } } }
  });
}

// ── Donut ──
function renderDonutChart(a, weeks, source) {
  destroyChart('donut');
  const data = getWeeklyData(a, weeks, source === 'both' ? 'planned' : source);
  let runT = 0, bikeT = 0, swimT = 0;
  data.forEach(d => { runT += d.run; bikeT += d.bike; swimT += d.swim / 1760; }); // Normalize swim

  const total = runT + bikeT + swimT;
  if (total === 0) {
    // Empty state
    chartInstances['donut'] = new Chart(document.getElementById('chartDonut'), {
      type: 'doughnut',
      data: { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['rgba(51,56,73,0.3)'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '65%' }
    });
    return;
  }

  chartInstances['donut'] = new Chart(document.getElementById('chartDonut'), {
    type: 'doughnut',
    data: {
      labels: ['Run', 'Bike', 'Swim'],
      datasets: [{
        data: [parseFloat(runT.toFixed(1)), parseFloat(bikeT.toFixed(1)), parseFloat(swimT.toFixed(1))],
        backgroundColor: [CHART_COLORS.run.primary, CHART_COLORS.bike.primary, CHART_COLORS.swim.primary],
        borderWidth: 0, hoverOffset: 8
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 14 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = ((ctx.parsed / total) * 100).toFixed(0);
              return `${ctx.label}: ${pct}%`;
            }
          }
        }
      }
    }
  });
}

// ── Cumulative Mileage ──
function renderCumulativeChart(a, weeks, source, compareAthlete) {
  destroyChart('cumulative');
  const data = getWeeklyData(a, weeks, source === 'both' ? 'planned' : source);

  let cumRun = 0, cumBike = 0, cumSwim = 0;
  const runCum = [], bikeCum = [], swimCum = [];
  data.forEach(d => {
    cumRun += d.run; cumBike += d.bike; cumSwim += d.swim;
    runCum.push(parseFloat(cumRun.toFixed(1)));
    bikeCum.push(parseFloat(cumBike.toFixed(1)));
    swimCum.push(Math.round(cumSwim));
  });

  const datasets = [
    { label: 'Run (mi)', data: runCum, borderColor: CHART_COLORS.run.primary, backgroundColor: CHART_COLORS.run.light, fill: true, tension: 0.3, borderWidth: 2, pointRadius: 2 },
    { label: 'Bike (mi)', data: bikeCum, borderColor: CHART_COLORS.bike.primary, backgroundColor: CHART_COLORS.bike.light, fill: true, tension: 0.3, borderWidth: 2, pointRadius: 2 },
  ];

  // Add compare overlay
  if (compareAthlete) {
    const cData = getWeeklyData(compareAthlete, weeks, source === 'both' ? 'planned' : source);
    let cRun = 0;
    const cRunCum = [];
    cData.forEach(d => { cRun += d.run; cRunCum.push(parseFloat(cRun.toFixed(1))); });
    datasets.push({
      label: `${compareAthlete.name.split(' ')[0]} Run`,
      data: cRunCum, borderColor: CHART_COLORS.compare.primary, borderDash: [5, 3],
      fill: false, tension: 0.3, borderWidth: 2, pointRadius: 1
    });
  }

  chartInstances['cumulative'] = new Chart(document.getElementById('chartCumulative'), {
    type: 'line',
    data: { labels: data.map(d => d.label), datasets },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 10 } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(51,56,73,0.3)' } }, x: { grid: { display: false } } } }
  });
}

// ── Planned vs Actual ──
function renderPvAChart(a, weeks) {
  destroyChart('pva');
  const planned = getWeeklyData(a, weeks, 'planned');
  const actual = getWeeklyData(a, weeks, 'actual');

  // Combine all three disciplines into total mileage (swim normalized)
  const pTotals = planned.map(d => parseFloat((d.run + d.bike + d.swim / 1760).toFixed(1)));
  const aTotals = actual.map(d => parseFloat((d.run + d.bike + d.swim / 1760).toFixed(1)));

  chartInstances['pva'] = new Chart(document.getElementById('chartPvA'), {
    type: 'bar',
    data: {
      labels: planned.map(d => d.label),
      datasets: [
        { label: 'Planned', data: pTotals, backgroundColor: CHART_COLORS.planned.bg, borderColor: CHART_COLORS.planned.primary, borderWidth: 1, borderRadius: 3 },
        { label: 'Actual', data: aTotals, backgroundColor: CHART_COLORS.actual.bg, borderColor: CHART_COLORS.actual.primary, borderWidth: 1, borderRadius: 3 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 12 } } }, scales: { y: { beginAtZero: true, grid: { color: 'rgba(51,56,73,0.3)' }, title: { display: true, text: 'Equivalent Miles', color: '#5C6175', font: { size: 10 } } }, x: { grid: { display: false } } } }
  });
}

// ── Training Heatmap ──
function renderHeatmap(a, weeks, source) {
  const container = document.getElementById('heatmapContainer');
  const dailyData = getDailyData(a, weeks, source === 'both' ? 'planned' : source);

  if (dailyData.length === 0) { container.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:20px;text-align:center;">No data for this range.</div>'; return; }

  // Find max for color scaling
  const maxVal = Math.max(...dailyData.map(d => d.total), 1);

  // Build week columns (each column = 1 week, rows = Sun–Sat)
  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  // Group by week column
  const weekCols = [];
  let currentCol = [];
  let lastWeekStart = null;

  dailyData.forEach(d => {
    const dayOfWeek = d.date.getDay();
    const weekStart = new Date(d.date);
    weekStart.setDate(d.date.getDate() - dayOfWeek);
    const wsKey = dateKey(weekStart);

    if (lastWeekStart !== wsKey) {
      if (currentCol.length > 0) weekCols.push(currentCol);
      currentCol = new Array(7).fill(null);
      lastWeekStart = wsKey;
    }
    currentCol[dayOfWeek] = d;
  });
  if (currentCol.length > 0) weekCols.push(currentCol);

  // Month labels
  let monthLabelsHtml = '<div class="heatmap-month-labels">';
  let lastMonth = -1;
  weekCols.forEach(col => {
    const firstDay = col.find(d => d);
    if (firstDay) {
      const m = firstDay.date.getMonth();
      if (m !== lastMonth) {
        monthLabelsHtml += `<span style="min-width:${19}px">${MONTHS[m]}</span>`;
        lastMonth = m;
      } else {
        monthLabelsHtml += `<span style="min-width:${19}px"></span>`;
      }
    }
  });
  monthLabelsHtml += '</div>';

  // Grid
  let gridHtml = '<div style="display:flex;">';
  // Day labels
  gridHtml += '<div class="heatmap-day-labels">';
  dayLabels.forEach(l => { gridHtml += `<span>${l}</span>`; });
  gridHtml += '</div>';

  gridHtml += '<div class="heatmap-grid">';
  weekCols.forEach(col => {
    gridHtml += '<div class="heatmap-col">';
    for (let i = 0; i < 7; i++) {
      const d = col[i];
      if (d) {
        const intensity = Math.min(4, Math.floor((d.total / maxVal) * 4));
        const color = d.total === 0 ? HEATMAP_COLORS[0] : HEATMAP_COLORS[Math.max(1, intensity)];
        const tip = `${MONTHS[d.date.getMonth()]} ${d.date.getDate()}: ${d.total > 0 ? d.total.toFixed(1) + ' equiv mi' : 'Rest'}`;
        gridHtml += `<div class="heatmap-cell" style="background:${color}" data-tooltip="${tip}"></div>`;
      } else {
        gridHtml += `<div class="heatmap-cell"></div>`;
      }
    }
    gridHtml += '</div>';
  });
  gridHtml += '</div></div>';

  // Legend
  let legendHtml = '<div class="heatmap-legend"><span>Less</span>';
  HEATMAP_COLORS.forEach(c => { legendHtml += `<div class="hm-swatch" style="background:${c}"></div>`; });
  legendHtml += '<span>More</span></div>';

  container.innerHTML = monthLabelsHtml + gridHtml + legendHtml;
}
