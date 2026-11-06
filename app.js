/**
 * AutoFlow • MovePredict Engine Controller (Presentation Edition)
 * Rol: Ingeniero de Algoritmos y Simulación — AutoMove City Bogotá
 */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof AUTOFLOW_DATA === 'undefined') {
    console.error('Error: AUTOFLOW_DATA no encontrado.');
    return;
  }

  const data = AUTOFLOW_DATA;
  const timeline = data.timeline;
  const nodes = data.nodes;
  const coefs = data.coefficients;

  // --- STATE ---
  let currentMinute = 569; // 09:29 AM (1st Preventive Alert)
  let isPlaying = false;
  let playTimer = null;
  let playSpeed = 1;
  let activeTab = 'curvas'; // 'curvas' | 'filtro' | 'validacion'

  // Filter & Threshold Live Parameters
  let threshold = 150;
  let alpha = 0.25;
  let windowSize = 15;
  let useDamping = true;
  const horizon = 30;

  // Dynamic arrays recalculated when filter parameters change
  let liveForecastByTarget = new Array(1440).fill(null); // Forecast for minute m (emitted at m-30)
  let liveForecastByOrigin = new Array(1440).fill(null); // Forecast emitted at minute k (for k+30)
  let liveAlertPoints = [];

  // --- DOM ELEMENTS ---
  const headerClock = document.getElementById('header-clock');
  const headerMinuteTag = document.getElementById('header-minute-tag');
  const navStatusDot = document.getElementById('nav-status-dot');
  const navStatusText = document.getElementById('nav-status-text');

  // KPI Elements
  const kpiThreshLabel = document.getElementById('kpi-thresh-label');
  const kpiCritMins = document.getElementById('kpi-crit-mins');
  const kpiCritHours = document.getElementById('kpi-crit-hours');
  const kpiCritRange = document.getElementById('kpi-crit-range');
  const kpiFilterPrec = document.getElementById('kpi-filter-prec');
  const kpiFilterRec = document.getElementById('kpi-filter-rec');
  const kpiFilterRmse = document.getElementById('kpi-filter-rmse');

  // Simulator Controls
  const timeSlider = document.getElementById('time-slider');
  const dayPhaseBadge = document.getElementById('day-phase-badge');
  const scrubberTimeDisplay = document.getElementById('scrubber-time-display');
  const btnPlay = document.getElementById('btn-play');
  const iconPlay = document.getElementById('icon-play');
  const textPlay = document.getElementById('text-play');
  const btnReset = document.getElementById('btn-reset');
  const speedChips = document.querySelectorAll('.speed-chip');
  const jumpPills = document.querySelectorAll('.jump-pill');

  // Telemetry & Radial Gauges
  const CIRCUMFERENCE = 2 * Math.PI * 29; // r=29 => ~182.21
  const teleSpline = document.getElementById('tele-spline');
  const teleTramoSub = document.getElementById('tele-tramo-sub');
  const gaugeSplineBar = document.getElementById('gauge-spline-bar');
  const gaugeSplinePct = document.getElementById('gauge-spline-pct');

  const teleObs = document.getElementById('tele-obs');
  const teleResSub = document.getElementById('tele-res-sub');
  const gaugeObsBar = document.getElementById('gauge-obs-bar');
  const gaugeObsPct = document.getElementById('gauge-obs-pct');

  const telePred = document.getElementById('tele-pred');
  const telePredSub = document.getElementById('tele-pred-sub');
  const gaugePredBar = document.getElementById('gauge-pred-bar');
  const gaugePredPct = document.getElementById('gauge-pred-pct');

  const teleFleet = document.getElementById('tele-fleet');
  const teleFleetSub = document.getElementById('tele-fleet-sub');
  const gaugeFleetBar = document.getElementById('gauge-fleet-bar');
  const gaugeFleetPct = document.getElementById('gauge-fleet-pct');

  // Banner & Fleet Bars
  const dispatchBanner = document.getElementById('dispatch-banner');
  const bannerDot = document.getElementById('banner-dot');
  const bannerTitle = document.getElementById('banner-title');
  const bannerSubtitle = document.getElementById('banner-subtitle');
  const bannerPill = document.getElementById('banner-pill');
  const radarModeTag = document.getElementById('radar-mode-tag');

  const barActiveTxt = document.getElementById('bar-active-txt');
  const barActiveFill = document.getElementById('bar-active-fill');
  const barDispatchTxt = document.getElementById('bar-dispatch-txt');
  const barDispatchFill = document.getElementById('bar-dispatch-fill');
  const barReserveTxt = document.getElementById('bar-reserve-txt');
  const barReserveFill = document.getElementById('bar-reserve-fill');

  // Studio & Lab Controls
  const studioTabs = document.querySelectorAll('.studio-tab');
  const chartSeriesToggles = document.getElementById('chart-series-toggles');
  const chkPer = document.getElementById('chk-per');
  const chkNat = document.getElementById('chk-nat');
  const chkLin = document.getElementById('chk-lin');
  const chkLag = document.getElementById('chk-lag');
  const chkNodes = document.getElementById('chk-nodes');

  const sliderParamThresh = document.getElementById('slider-param-thresh');
  const valParamThresh = document.getElementById('val-param-thresh');
  const sliderParamAlpha = document.getElementById('slider-param-alpha');
  const valParamAlpha = document.getElementById('val-param-alpha');
  const sliderParamWin = document.getElementById('slider-param-win');
  const valParamWin = document.getElementById('val-param-win');
  const chkDamping = document.getElementById('chk-damping');
  const btnRestoreParams = document.getElementById('btn-restore-params');

  const cmLiveRmse = document.getElementById('cm-live-rmse');
  const cmTp = document.getElementById('cm-tp');
  const cmFp = document.getElementById('cm-fp');
  const cmFn = document.getElementById('cm-fn');
  const cmTn = document.getElementById('cm-tn');

  // Polynomial Inspector Elements
  const polyLiveTramo = document.getElementById('poly-live-tramo');
  const polyLiveT = document.getElementById('poly-live-t');
  const polyLiveSymbolic = document.getElementById('poly-live-symbolic');
  const polyLiveResult = document.getElementById('poly-live-result');
  const tbodyPoly = document.getElementById('tbody-poly');

  // --- POPULATE POLYNOMIALS TABLE ---
  function renderPolyTable() {
    tbodyPoly.innerHTML = coefs.map((c, idx) => `
      <tr id="poly-row-${idx}" style="cursor: pointer;" data-mid="${Math.round(((c.inicio + c.fin) / 2) * 60)}">
        <td style="font-weight: 700; color: #c084fc;">S_${c.tramo}(t)</td>
        <td class="mono">[${c.inicio.toFixed(1)}h, ${c.fin.toFixed(1)}h]</td>
        <td class="mono" style="color: #34d399;">${c.a.toFixed(4)}</td>
        <td class="mono" style="color: #38bdf8;">${c.b >= 0 ? '+' : ''}${c.b.toFixed(4)}</td>
        <td class="mono" style="color: #fbbf24;">${c.c >= 0 ? '+' : ''}${c.c.toFixed(4)}</td>
        <td class="mono" style="color: #fb7185;">${c.d >= 0 ? '+' : ''}${c.d.toFixed(4)}</td>
      </tr>
    `).join('');

    tbodyPoly.querySelectorAll('tr').forEach(row => {
      row.addEventListener('click', () => {
        const targetMin = parseInt(row.getAttribute('data-mid'), 10);
        setMinute(targetMin);
      });
    });
  }
  renderPolyTable();

  // --- REAL-TIME CAUSAL FILTER ENGINE (EMA + MMP) ---
  function recomputeCausalFilter() {
    const N = 1440;
    const residuoObs = new Array(N);
    for (let k = 0; k < N; k++) {
      residuoObs[k] = timeline[k].observada - timeline[k].spline;
    }

    const suavizado = new Array(N).fill(0);
    const ponderada = new Array(N).fill(0);
    suavizado[0] = residuoObs[0];

    for (let k = 0; k < N; k++) {
      if (k > 0) {
        suavizado[k] = alpha * residuoObs[k] + (1 - alpha) * suavizado[k - 1];
      }
      const startIdx = Math.max(0, k - windowSize + 1);
      let weightedSum = 0;
      let weightTotal = 0;
      let w = 1;
      for (let j = startIdx; j <= k; j++) {
        weightedSum += residuoObs[j] * w;
        weightTotal += w;
        w++;
      }
      ponderada[k] = weightedSum / weightTotal;
    }

    const dampingFactor = useDamping ? Math.pow(0.95, horizon) : 1.0;

    liveForecastByTarget.fill(null);
    liveForecastByOrigin.fill(null);
    liveAlertPoints = [];

    let tp = 0, fp = 0, fn = 0, tn = 0;
    let sumSqError = 0;
    const pairsCount = N - horizon;

    for (let k = 0; k < pairsCount; k++) {
      const targetIdx = k + horizon;
      const baseTarget = timeline[targetIdx].spline;
      const corr = dampingFactor * (0.5 * suavizado[k] + 0.5 * ponderada[k]);
      const pred = Math.max(0, baseTarget + corr);

      liveForecastByOrigin[k] = pred;
      liveForecastByTarget[targetIdx] = pred;

      const truth = timeline[targetIdx].observada;
      const err = pred - truth;
      sumSqError += err * err;

      const isAlert = pred > threshold;
      const isTruthCrit = truth > threshold;

      if (isAlert && isTruthCrit) tp++;
      else if (isAlert && !isTruthCrit) fp++;
      else if (!isAlert && isTruthCrit) fn++;
      else tn++;

      if (isAlert && targetIdx % 8 === 0) {
        liveAlertPoints.push({ x: targetIdx, y: pred });
      }
    }

    const rmse = Math.sqrt(sumSqError / pairsCount);
    const precision = (tp + fp) > 0 ? (tp / (tp + fp)) * 100 : 0;
    const recall = (tp + fn) > 0 ? (tp / (tp + fn)) * 100 : 0;

    // Update Confusion Matrix & KPIs
    cmTp.textContent = tp;
    cmFp.textContent = fp;
    cmFn.textContent = fn;
    cmTn.textContent = tn;
    cmLiveRmse.textContent = `RMSE: ${rmse.toFixed(4)}`;

    kpiFilterPrec.textContent = `${precision.toFixed(1)}%`;
    kpiFilterRec.textContent = `Recall: ${recall.toFixed(1)}%`;
    kpiFilterRmse.textContent = rmse.toFixed(4);

    // Recalculate critical minutes on base spline for current threshold
    const critIndices = [];
    for (let m = 0; m < N; m++) {
      if (timeline[m].spline > threshold) critIndices.push(m);
    }
    kpiThreshLabel.textContent = threshold;
    kpiCritMins.textContent = critIndices.length;
    kpiCritHours.textContent = `minutos (${(critIndices.length / 60).toFixed(2)} h)`;
    if (critIndices.length > 0) {
      kpiCritRange.textContent = `${timeline[critIndices[0]].time} – ${timeline[critIndices[critIndices.length - 1]].time}`;
    } else {
      kpiCritRange.textContent = 'Sin cruce';
    }
  }

  recomputeCausalFilter();

  // --- CUSTOM CHART.JS PLUGIN: VERTICAL TIME CURSOR & +30M HORIZON ---
  const timeCursorPlugin = {
    id: 'timeCursorPlugin',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x || !scales.y) return;

      const xCurr = scales.x.getPixelForValue(currentMinute);
      const xHorizon = scales.x.getPixelForValue(Math.min(1439, currentMinute + horizon));
      const yThresh = scales.y.getPixelForValue(threshold);

      ctx.save();

      // 1. Subtle crimson glow above threshold
      if (yThresh > chartArea.top && yThresh < chartArea.bottom) {
        const gradCrit = ctx.createLinearGradient(0, chartArea.top, 0, yThresh);
        gradCrit.addColorStop(0, 'rgba(244, 63, 94, 0.14)');
        gradCrit.addColorStop(1, 'rgba(244, 63, 94, 0.01)');
        ctx.fillStyle = gradCrit;
        ctx.fillRect(chartArea.left, chartArea.top, chartArea.right - chartArea.left, yThresh - chartArea.top);
      }

      // 2. Shaded +30m predictive lookahead band [t, t+30]
      if (xCurr >= chartArea.left && xCurr <= chartArea.right) {
        const bandWidth = Math.max(2, xHorizon - xCurr);
        ctx.fillStyle = 'rgba(0, 242, 254, 0.09)';
        ctx.fillRect(xCurr, chartArea.top, bandWidth, chartArea.bottom - chartArea.top);

        // Vertical line at t
        ctx.beginPath();
        ctx.moveTo(xCurr, chartArea.top);
        ctx.lineTo(xCurr, chartArea.bottom);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00f2fe';
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Vertical dashed line at t+30
        if (xHorizon <= chartArea.right) {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.moveTo(xHorizon, chartArea.top);
          ctx.lineTo(xHorizon, chartArea.bottom);
          ctx.lineWidth = 1.2;
          ctx.strokeStyle = 'rgba(244, 63, 94, 0.75)';
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      ctx.restore();
    }
  };

  // --- CHART.JS INITIALIZATION ---
  const chartCanvas = document.getElementById('main-studio-chart');
  const chartCtx = chartCanvas.getContext('2d');

  const fillGradCyan = chartCtx.createLinearGradient(0, 0, 0, 420);
  fillGradCyan.addColorStop(0, 'rgba(0, 242, 254, 0.28)');
  fillGradCyan.addColorStop(1, 'rgba(0, 242, 254, 0.0)');

  const xLabels = timeline.map(d => d.time);

  // Node scatter points
  const allNodePoints = nodes.map(n => ({
    x: n.minuto,
    y: n.demanda,
    label: n.etiqueta
  }));

  const trainNodePoints = nodes.filter(n => !n.retenido).map(n => ({
    x: n.minuto,
    y: n.demanda,
    label: n.etiqueta
  }));

  const heldOutNodePoints = nodes.filter(n => n.retenido).map(n => ({
    x: n.minuto,
    y: n.demanda,
    label: `Retirado Validación: ${n.etiqueta}`
  }));

  function buildDatasetsForActiveTab() {
    const threshLine = {
      label: `Umbral Crítico (${threshold} sol/min)`,
      data: timeline.map(d => ({ x: d.m, y: threshold })),
      borderColor: '#f43f5e',
      borderWidth: 1.8,
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
      order: 2
    };

    const currentPointMarker = {
      label: `Instante Actual (${timeline[currentMinute].time})`,
      data: [{ x: currentMinute, y: timeline[currentMinute].spline }],
      borderColor: '#ffffff',
      backgroundColor: '#00f2fe',
      pointRadius: 7,
      pointHoverRadius: 10,
      showLine: false,
      order: 0
    };

    if (activeTab === 'curvas') {
      const list = [];
      if (chkPer.checked) {
        list.push({
          label: 'Spline Cúbica Periódica (C²)',
          data: timeline.map(d => ({ x: d.m, y: d.spline })),
          borderColor: '#00f2fe',
          backgroundColor: fillGradCyan,
          borderWidth: 2.8,
          pointRadius: 0,
          fill: true,
          order: 3
        });
      }
      if (chkNat.checked) {
        list.push({
          label: 'Spline Natural (S\'\'=0)',
          data: timeline.map(d => ({ x: d.m, y: d.natural })),
          borderColor: '#fbbf24',
          borderWidth: 2.2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          order: 4
        });
      }
      if (chkLin.checked) {
        list.push({
          label: 'Interpolación Lineal',
          data: timeline.map(d => ({ x: d.m, y: d.lineal })),
          borderColor: '#94a3b8',
          borderWidth: 1.8,
          borderDash: [3, 3],
          pointRadius: 0,
          fill: false,
          order: 5
        });
      }
      if (chkLag.checked) {
        list.push({
          label: 'Polinomio Global Lagrange',
          data: timeline.map(d => ({ x: d.m, y: d.lagrange })),
          borderColor: '#fb7185',
          borderWidth: 1.6,
          pointRadius: 0,
          fill: false,
          order: 6
        });
      }
      list.push(threshLine);
      if (chkNodes.checked) {
        list.push({
          type: 'scatter',
          label: 'Nodos de Muestreo + Cierre (24h, 15)',
          data: allNodePoints,
          borderColor: '#040814',
          backgroundColor: '#ffffff',
          borderWidth: 2,
          pointRadius: 6,
          pointHoverRadius: 9,
          order: 1
        });
      }
      list.push({
        type: 'scatter',
        ...currentPointMarker
      });
      return list;
    }

    if (activeTab === 'filtro') {
      return [
        {
          label: 'Pronóstico Emitido 30 min Antes (EMA+MMP)',
          data: timeline.map((d, idx) => ({ x: d.m, y: liveForecastByTarget[idx] })),
          borderColor: '#00f2fe',
          borderWidth: 2.4,
          pointRadius: 0,
          spanGaps: false,
          fill: false,
          order: 2
        },
        {
          label: 'Curva Base Periódica S(t)',
          data: timeline.map(d => ({ x: d.m, y: d.spline })),
          borderColor: '#94a3b8',
          borderWidth: 1.8,
          borderDash: [5, 4],
          pointRadius: 0,
          fill: false,
          order: 3
        },
        {
          label: 'Observación Sintética en Tiempo Real z(k)',
          data: timeline.map(d => ({ x: d.m, y: d.observada })),
          borderColor: 'rgba(168, 85, 247, 0.55)',
          backgroundColor: 'rgba(168, 85, 247, 0.08)',
          borderWidth: 1.2,
          pointRadius: 0,
          fill: true,
          order: 4
        },
        threshLine,
        {
          type: 'scatter',
          label: 'Episodios de Alerta (> Umbral)',
          data: liveAlertPoints,
          backgroundColor: '#f43f5e',
          borderColor: '#ffffff',
          borderWidth: 1,
          pointRadius: 4.5,
          order: 1
        },
        {
          type: 'scatter',
          ...currentPointMarker
        }
      ];
    }

    // Tab 3: 'validacion'
    return [
      {
        label: 'Spline Periódica (Entrenada sin 9h y 18h)',
        data: timeline.map(d => ({ x: d.m, y: d.val_spline })),
        borderColor: '#00f2fe',
        borderWidth: 2.6,
        pointRadius: 0,
        fill: false,
        order: 3
      },
      {
        label: 'Interpolación Lineal (Entrenada sin 9h y 18h)',
        data: timeline.map(d => ({ x: d.m, y: d.val_lineal })),
        borderColor: '#fbbf24',
        borderWidth: 2,
        borderDash: [5, 4],
        pointRadius: 0,
        fill: false,
        order: 4
      },
      {
        label: 'Lagrange Global (Hold-out RMSE: 8.62)',
        data: timeline.map(d => ({ x: d.m, y: d.val_lagrange })),
        borderColor: 'rgba(244, 63, 94, 0.5)',
        borderWidth: 1.4,
        pointRadius: 0,
        fill: false,
        order: 5
      },
      {
        type: 'scatter',
        label: 'Nodos de Entrenamiento (9 puntos)',
        data: trainNodePoints,
        backgroundColor: '#e2e8f0',
        borderColor: '#0f172a',
        borderWidth: 2,
        pointRadius: 5.5,
        order: 2
      },
      {
        type: 'scatter',
        label: 'Puntos Retirados Hold-Out (9.0h y 18.0h)',
        data: heldOutNodePoints,
        backgroundColor: '#f43f5e',
        borderColor: '#ffffff',
        borderWidth: 2,
        pointStyle: 'crossRot',
        pointRadius: 9,
        pointHoverRadius: 12,
        order: 1
      }
    ];
  }

  const studioChart = new Chart(chartCtx, {
    type: 'line',
    data: {
      datasets: buildDatasetsForActiveTab()
    },
    plugins: [timeCursorPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 180 },
      interaction: {
        mode: 'index',
        intersect: false
      },
      onClick(event, elements, chart) {
        const canvasPosition = Chart.helpers.getRelativePosition(event, chart);
        const clickedMinute = chart.scales.x.getValueForPixel(canvasPosition.x);
        if (clickedMinute !== undefined && clickedMinute >= 0 && clickedMinute < 1440) {
          setMinute(Math.round(clickedMinute));
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#cbd5e1',
            font: { family: "'Inter', sans-serif", size: 11, weight: '600' },
            usePointStyle: true,
            padding: 14
          }
        },
        tooltip: {
          backgroundColor: 'rgba(7, 11, 22, 0.94)',
          titleColor: '#00f2fe',
          bodyColor: '#f1f5f9',
          borderColor: 'rgba(0, 242, 254, 0.35)',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: "'JetBrains Mono', monospace", size: 12, weight: '700' },
          bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
          callbacks: {
            title(items) {
              if (!items.length) return '';
              const m = items[0].parsed.x;
              const row = timeline[m] || timeline[0];
              return `🕒 Hora: ${row.time} (t = ${row.hour.toFixed(2)} h | Min ${m})`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: 1439,
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            stepSize: 120,
            color: '#94a3b8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback(val) {
              const h = Math.floor(val / 60);
              return `${String(h).padStart(2, '0')}:00`;
            }
          }
        },
        y: {
          min: 0,
          max: 215,
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
          ticks: {
            color: '#94a3b8',
            font: { family: "'JetBrains Mono', monospace", size: 11 },
            callback: (v) => `${v} sol/m`
          }
        }
      }
    }
  });

  function refreshChart() {
    studioChart.data.datasets = buildDatasetsForActiveTab();
    studioChart.update('none');
  }

  // --- HELPER: SET RADIAL GAUGE ---
  function updateRadialGauge(circleEl, textEl, value, maxVal) {
    const ratio = Math.max(0, Math.min(1, value / maxVal));
    const offset = CIRCUMFERENCE * (1 - ratio);
    circleEl.style.strokeDashoffset = offset.toFixed(1);
    textEl.textContent = `${Math.round(ratio * 100)}%`;
  }

  // --- UPDATE DISPLAY FOR SELECTED MINUTE ---
  let currentAlertState = 'critical'; // 'normal' | 'warning' | 'critical'

  function setMinute(m) {
    currentMinute = Math.max(0, Math.min(1439, m));
    const d = timeline[currentMinute];
    const hourDec = d.hour;

    // Find active polynomial tramo (0..9)
    let tramoIdx = coefs.findIndex(c => hourDec >= c.inicio && hourDec < c.fin);
    if (tramoIdx === -1) tramoIdx = 9;
    const activeCoef = coefs[tramoIdx];

    // 1. Clocks & Scrubber
    timeSlider.value = currentMinute;
    headerClock.textContent = d.time;
    headerMinuteTag.textContent = `Min ${currentMinute}`;
    scrubberTimeDisplay.textContent = `${d.time} h (t = ${hourDec.toFixed(3)} h | Min ${currentMinute})`;

    // Day Phase Badge
    let phaseIcon = '🌙';
    let phaseName = 'Madrugada / Demanda Baja';
    if (currentMinute >= 360 && currentMinute < 600) {
      phaseIcon = '🌅';
      phaseName = 'Transición Mañana (Ascenso)';
    } else if (currentMinute >= 600 && currentMinute <= 900) {
      phaseIcon = '🔥';
      phaseName = 'Hora Pico Crítica Mediodía';
    } else if (currentMinute > 900 && currentMinute < 1170) {
      phaseIcon = '🌤️';
      phaseName = 'Tarde / Retorno Laboral';
    } else if (currentMinute >= 1170) {
      phaseIcon = '🌙';
      phaseName = 'Noche / Cierre Periódico';
    }
    dayPhaseBadge.textContent = `${phaseIcon} ${phaseName} • Tramo #${activeCoef.tramo} [${activeCoef.inicio}h - ${activeCoef.fin}h]`;

    // 2. Gauges
    teleSpline.textContent = d.spline.toFixed(2);
    teleTramoSub.textContent = `Solicitudes/min • Polinomio S_${activeCoef.tramo}(t)`;
    updateRadialGauge(gaugeSplineBar, gaugeSplinePct, d.spline, 190);

    const resVal = d.observada - d.spline;
    teleObs.textContent = d.observada.toFixed(2);
    teleResSub.textContent = `Residuo e(k): ${resVal >= 0 ? '+' : ''}${resVal.toFixed(2)} sol/min`;
    updateRadialGauge(gaugeObsBar, gaugeObsPct, d.observada, 190);

    // 30-min Forecast emitted at currentMinute for currentMinute + 30
    const targetMin = Math.min(1439, currentMinute + horizon);
    const targetTimeStr = timeline[targetMin].time;
    const predEmit = liveForecastByOrigin[currentMinute] !== null
      ? liveForecastByOrigin[currentMinute]
      : timeline[targetMin].spline;

    telePred.textContent = predEmit.toFixed(2);
    telePredSub.textContent = `Objetivo: ${targetTimeStr} h (+${horizon} min)`;
    updateRadialGauge(gaugePredBar, gaugePredPct, predEmit, 190);

    // 3. Alert Evaluation & Fleet Allocation (200 Taxis)
    const isForecastAlert = predEmit > threshold;
    const isCurrentCrit = d.spline > threshold;

    // Active passenger service taxis + preventative dispatch taxis
    const activeService = Math.min(172, Math.max(22, Math.round(d.spline * 0.92)));
    const preventativeDispatch = isForecastAlert
      ? Math.min(200 - activeService, Math.max(18, Math.round((predEmit - d.spline) * 1.1 + 22)))
      : Math.min(200 - activeService, Math.max(6, Math.round(predEmit * 0.08)));
    const totalDispatched = Math.min(195, activeService + preventativeDispatch);
    const reserveTaxis = 200 - totalDispatched;

    teleFleet.textContent = `${totalDispatched} / 200`;
    teleFleetSub.textContent = `${reserveTaxis} unidades en reserva / carga`;
    updateRadialGauge(gaugeFleetBar, gaugeFleetPct, totalDispatched, 200);

    // Fleet Breakdown Bars
    const pctAct = Math.round((activeService / 200) * 100);
    const pctDisp = Math.round((preventativeDispatch / 200) * 100);
    const pctRes = 100 - pctAct - pctDisp;

    barActiveTxt.textContent = `${activeService} taxis (${pctAct}%)`;
    barActiveFill.style.width = `${pctAct}%`;
    barDispatchTxt.textContent = `${preventativeDispatch} taxis (${pctDisp}%)`;
    barDispatchFill.style.width = `${pctDisp}%`;
    barReserveTxt.textContent = `${reserveTaxis} taxis (${pctRes}%)`;
    barReserveFill.style.width = `${pctRes}%`;

    // Banner state
    dispatchBanner.classList.remove('state-warning', 'state-critical');
    bannerDot.className = 'ping-dot';
    navStatusDot.className = 'ping-dot';

    if (isForecastAlert || isCurrentCrit) {
      currentAlertState = 'critical';
      dispatchBanner.classList.add('state-critical');
      bannerDot.classList.add('red');
      navStatusDot.classList.add('red');
      navStatusText.textContent = `ALERTA ACTIVA (${targetTimeStr})`;
      gaugePredBar.style.stroke = '#f43f5e';
      bannerTitle.textContent = `🚨 ALERTA PREVENTIVA DE DESPACHO: Demanda Proyectada ${predEmit.toFixed(2)} sol/min (${targetTimeStr})`;
      bannerSubtitle.textContent = `Supera el umbral crítico (${threshold} sol/min). Movilizando ${preventativeDispatch} taxis autónomos de refuerzo 30 min antes para sostener el KPI de -20% espera.`;
      bannerPill.textContent = 'DESPACHO CRÍTICO';
      bannerPill.style.background = 'rgba(244, 63, 94, 0.25)';
      bannerPill.style.color = '#fda4af';
      bannerPill.style.borderColor = '#f43f5e';
      radarModeTag.textContent = `ALERTA +30M: REASIGNANDO ${preventativeDispatch} TAXIS A ZONAS PICO`;
      radarModeTag.style.color = '#fb7185';
    } else if (predEmit > threshold * 0.78) {
      currentAlertState = 'warning';
      dispatchBanner.classList.add('state-warning');
      bannerDot.classList.add('amber');
      navStatusDot.classList.add('amber');
      navStatusText.textContent = 'Pre-Alerta Moderada';
      gaugePredBar.style.stroke = '#fbbf24';
      bannerTitle.textContent = `⚠️ DEMANDA EN ASCENSO: Proyección ${predEmit.toFixed(2)} sol/min para las ${targetTimeStr}`;
      bannerSubtitle.textContent = `Acercándose al umbral (${threshold} sol/min). Pre-posicionando ${preventativeDispatch} unidades en corredores principales de Bogotá.`;
      bannerPill.textContent = 'PRE-POSICIONAMIENTO';
      bannerPill.style.background = 'rgba(245, 158, 11, 0.2)';
      bannerPill.style.color = '#fcd34d';
      bannerPill.style.borderColor = '#f59e0b';
      radarModeTag.textContent = 'MODO: TRANSICIÓN PREVENTIVA';
      radarModeTag.style.color = '#fbbf24';
    } else {
      currentAlertState = 'normal';
      gaugePredBar.style.stroke = '#00f2fe';
      navStatusText.textContent = 'Operación Nominal';
      bannerTitle.textContent = `✅ OPERACIÓN ESTABLE: Demanda Proyectada ${predEmit.toFixed(2)} sol/min (${targetTimeStr})`;
      bannerSubtitle.textContent = `Demanda bajo umbral crítico (${threshold} sol/min). Flota operando con eficiencia energética y ${reserveTaxis} unidades en rotación de carga.`;
      bannerPill.textContent = 'FLUJO ÓPTIMO';
      bannerPill.style.background = 'rgba(16, 185, 129, 0.2)';
      bannerPill.style.color = '#6ee7b7';
      bannerPill.style.borderColor = '#10b981';
      radarModeTag.textContent = 'MODO: PATRULLAJE & CARGA ÓPTIMA';
      radarModeTag.style.color = '#00f2fe';
    }

    // 4. Live Piecewise Polynomial Formula Evaluation
    const dt = hourDec - activeCoef.inicio;
    const evalVal = activeCoef.a
      + activeCoef.b * dt
      + activeCoef.c * Math.pow(dt, 2)
      + activeCoef.d * Math.pow(dt, 3);

    polyLiveTramo.textContent = `TRAMO ACTIVO #${activeCoef.tramo} • INTERVALO [${activeCoef.inicio.toFixed(1)} h, ${activeCoef.fin.toFixed(1)} h]`;
    polyLiveT.textContent = `t = ${hourDec.toFixed(4)} h`;
    polyLiveSymbolic.textContent = `S_${activeCoef.tramo}(t) = ${activeCoef.a.toFixed(4)} ${activeCoef.b >= 0 ? '+' : '-'} ${Math.abs(activeCoef.b).toFixed(4)}(t - ${activeCoef.inicio}) ${activeCoef.c >= 0 ? '+' : '-'} ${Math.abs(activeCoef.c).toFixed(4)}(t - ${activeCoef.inicio})² ${activeCoef.d >= 0 ? '+' : '-'} ${Math.abs(activeCoef.d).toFixed(4)}(t - ${activeCoef.inicio})³`;
    polyLiveResult.innerHTML = `&rArr; En <strong>${d.time}</strong> (&Delta;t = ${dt.toFixed(4)} h): &nbsp; <strong>S_${activeCoef.tramo}(${hourDec.toFixed(3)}) = ${evalVal.toFixed(2)} solicitudes/min</strong>`;

    // Highlight active row in polynomial table
    tbodyPoly.querySelectorAll('tr').forEach((r, idx) => {
      if (idx === tramoIdx) r.classList.add('active-row');
      else r.classList.remove('active-row');
    });

    // 5. Update Jump Pill Highlight
    jumpPills.forEach(p => {
      if (parseInt(p.getAttribute('data-min'), 10) === currentMinute) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });

    // 6. Update Chart Marker
    refreshChart();
  }

  // --- SIMULATOR EVENT LISTENERS ---
  timeSlider.addEventListener('input', (e) => {
    setMinute(parseInt(e.target.value, 10));
  });

  jumpPills.forEach(pill => {
    pill.addEventListener('click', () => {
      setMinute(parseInt(pill.getAttribute('data-min'), 10));
    });
  });

  function toggleSimulation() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      textPlay.textContent = 'Pausar';
      iconPlay.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      const stepMs = Math.max(16, Math.round(90 / playSpeed));
      playTimer = setInterval(() => {
        const stepMin = playSpeed >= 15 ? 3 : 1;
        setMinute((currentMinute + stepMin) % 1440);
      }, stepMs);
    } else {
      textPlay.textContent = 'Simular Día';
      iconPlay.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      if (playTimer) clearInterval(playTimer);
    }
  }

  btnPlay.addEventListener('click', toggleSimulation);
  btnReset.addEventListener('click', () => {
    if (isPlaying) toggleSimulation();
    setMinute(0);
  });

  speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      playSpeed = parseInt(chip.getAttribute('data-speed'), 10);
      if (isPlaying) {
        toggleSimulation();
        toggleSimulation();
      }
    });
  });

  // --- STUDIO TABS & SERIES TOGGLES ---
  studioTabs.forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      studioTabs.forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');
      activeTab = tabBtn.getAttribute('data-tab');
      chartSeriesToggles.style.display = activeTab === 'curvas' ? 'flex' : 'none';
      refreshChart();
    });
  });

  [chkPer, chkNat, chkLin, chkLag, chkNodes].forEach(chk => {
    chk.addEventListener('change', refreshChart);
  });

  // --- LIVE FILTER PARAMETER SLIDERS ---
  function onFilterParamsChange() {
    threshold = parseInt(sliderParamThresh.value, 10);
    alpha = parseFloat(sliderParamAlpha.value);
    windowSize = parseInt(sliderParamWin.value, 10);
    useDamping = chkDamping.checked;

    valParamThresh.textContent = `${threshold} sol/min`;
    valParamAlpha.textContent = alpha.toFixed(2);
    valParamWin.textContent = `${windowSize} min`;

    recomputeCausalFilter();
    setMinute(currentMinute);
  }

  sliderParamThresh.addEventListener('input', onFilterParamsChange);
  sliderParamAlpha.addEventListener('input', onFilterParamsChange);
  sliderParamWin.addEventListener('input', onFilterParamsChange);
  chkDamping.addEventListener('change', onFilterParamsChange);

  btnRestoreParams.addEventListener('click', () => {
    sliderParamThresh.value = 150;
    sliderParamAlpha.value = 0.25;
    sliderParamWin.value = 15;
    chkDamping.checked = true;
    onFilterParamsChange();
  });

  // --- LIVE ANIMATED BOGOTÁ AUTONOMOUS FLEET RADAR (CANVAS 60FPS) ---
  const radarCanvas = document.getElementById('bogota-radar-canvas');
  const rCtx = radarCanvas.getContext('2d');

  const bogotaHubs = [
    { name: 'Usaquén', x: 0.72, y: 0.24, weight: 1.0 },
    { name: 'Chapinero / Zona T', x: 0.62, y: 0.48, weight: 1.35 },
    { name: 'Centro Intl.', x: 0.52, y: 0.74, weight: 1.2 },
    { name: 'Salitre / Corferias', x: 0.38, y: 0.56, weight: 1.1 },
    { name: 'El Dorado', x: 0.17, y: 0.42, weight: 1.25 },
    { name: 'Suba', x: 0.44, y: 0.22, weight: 0.9 }
  ];

  // Create 45 simulated autonomous taxi agents
  const taxiAgents = Array.from({ length: 45 }, (_, i) => {
    const startHub = bogotaHubs[i % bogotaHubs.length];
    const destHub = bogotaHubs[(i * 3 + 1) % bogotaHubs.length];
    return {
      x: startHub.x + (Math.random() - 0.5) * 0.12,
      y: startHub.y + (Math.random() - 0.5) * 0.12,
      targetIdx: (i * 3 + 1) % bogotaHubs.length,
      speed: 0.0018 + Math.random() * 0.0022,
      isPreventive: i % 3 === 0
    };
  });

  let radarAngle = 0;
  let pulsePhase = 0;

  function drawBogotaRadar() {
    const W = radarCanvas.width;
    const H = radarCanvas.height;
    rCtx.clearRect(0, 0, W, H);

    const demandRatio = Math.min(1.2, timeline[currentMinute].spline / 150);
    radarAngle = (radarAngle + 0.018) % (Math.PI * 2);
    pulsePhase = (pulsePhase + 0.05) % (Math.PI * 2);

    // 1. Tactical Grid & Rings
    const cx = W * 0.5;
    const cy = H * 0.5;
    rCtx.strokeStyle = 'rgba(56, 189, 248, 0.1)';
    rCtx.lineWidth = 1;
    [45, 90, 140, 195].forEach(r => {
      rCtx.beginPath();
      rCtx.arc(cx, cy, r, 0, Math.PI * 2);
      rCtx.stroke();
    });

    // Rotating Radar Sweep Sector
    const sweepGrad = rCtx.createConicGradient(radarAngle, cx, cy);
    sweepGrad.addColorStop(0, 'rgba(0, 242, 254, 0.18)');
    sweepGrad.addColorStop(0.12, 'rgba(0, 242, 254, 0.0)');
    sweepGrad.addColorStop(1, 'rgba(0, 242, 254, 0.0)');
    rCtx.fillStyle = sweepGrad;
    rCtx.beginPath();
    rCtx.arc(cx, cy, 220, 0, Math.PI * 2);
    rCtx.fill();

    // 2. Connective Corridors between Bogotá Hubs
    rCtx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    rCtx.lineWidth = 1;
    for (let i = 0; i < bogotaHubs.length; i++) {
      for (let j = i + 1; j < bogotaHubs.length; j++) {
        if (Math.abs(i - j) <= 2) {
          rCtx.beginPath();
          rCtx.moveTo(bogotaHubs[i].x * W, bogotaHubs[i].y * H);
          rCtx.lineTo(bogotaHubs[j].x * W, bogotaHubs[j].y * H);
          rCtx.stroke();
        }
      }
    }

    // 3. Update & Draw Autonomous Taxi Agents
    const speedMultiplier = 0.6 + demandRatio * 1.4;
    taxiAgents.forEach(agent => {
      const target = bogotaHubs[agent.targetIdx];
      const dx = target.x - agent.x;
      const dy = target.y - agent.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 0.02) {
        agent.targetIdx = Math.floor(Math.random() * bogotaHubs.length);
      } else {
        agent.x += (dx / dist) * agent.speed * speedMultiplier;
        agent.y += (dy / dist) * agent.speed * speedMultiplier;
      }

      const px = agent.x * W;
      const py = agent.y * H;

      rCtx.beginPath();
      rCtx.arc(px, py, agent.isPreventive && currentAlertState === 'critical' ? 3.2 : 2.3, 0, Math.PI * 2);
      if (currentAlertState === 'critical' && agent.isPreventive) {
        rCtx.fillStyle = '#fb7185';
        rCtx.shadowColor = '#f43f5e';
        rCtx.shadowBlur = 8;
      } else {
        rCtx.fillStyle = '#00f2fe';
        rCtx.shadowColor = '#00f2fe';
        rCtx.shadowBlur = 4;
      }
      rCtx.fill();
      rCtx.shadowBlur = 0;
    });

    // 4. Draw Bogotá Demand Hubs with Dynamic Heat Rings
    bogotaHubs.forEach(hub => {
      const hx = hub.x * W;
      const hy = hub.y * H;
      const baseRadius = (10 + demandRatio * 14 * hub.weight) + Math.sin(pulsePhase) * 3;

      const isHot = currentAlertState === 'critical' && hub.weight >= 1.15;
      const glowColor = isHot ? 'rgba(244, 63, 94, 0.38)' : 'rgba(0, 242, 254, 0.25)';
      const coreColor = isHot ? '#f43f5e' : '#00f2fe';

      const radGrad = rCtx.createRadialGradient(hx, hy, 2, hx, hy, baseRadius);
      radGrad.addColorStop(0, glowColor);
      radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      rCtx.fillStyle = radGrad;
      rCtx.beginPath();
      rCtx.arc(hx, hy, baseRadius, 0, Math.PI * 2);
      rCtx.fill();

      // Hub Core
      rCtx.fillStyle = coreColor;
      rCtx.beginPath();
      rCtx.arc(hx, hy, 4, 0, Math.PI * 2);
      rCtx.fill();

      // Hub Label
      rCtx.fillStyle = '#e2e8f0';
      rCtx.font = "600 10px 'Inter', sans-serif";
      rCtx.fillText(hub.name, hx + 7, hy + 3);
    });

    requestAnimationFrame(drawBogotaRadar);
  }

  // Initial Render
  setMinute(569);
  drawBogotaRadar();
});
