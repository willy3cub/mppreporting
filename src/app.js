// app.js s'exécute en <script> classique (pas d'import/export) : petit périmètre
// de helpers dupliqués depuis src/lib/compute.mjs, volontairement, pour éviter un bundler.

function latestLabel() {
  const labels = Object.keys(window.__WC.history);
  return labels[labels.length - 1];
}
function latestPoints() {
  return window.__WC.history[latestLabel()];
}
function playerByUid(uid) {
  return window.__WC.players.find((p) => p.uid === uid);
}
function rankStandings(points) {
  return Object.entries(points).sort((a, b) => b[1] - a[1])
    .map(([uid, pts], i) => ({ uid, pts, rank: i + 1 }));
}

function ordinalFr(v) {
  return v === 1 ? '1er' : `${v}e`;
}

function renderHero(root) {
  const label = latestLabel();
  root.insertAdjacentHTML('beforeend', `
    <div class="beams" aria-hidden="true"></div>
    <header class="hero">
      <div class="trophy">🏆</div>
      <h1>COUPE DU MONDE 2026</h1>
      <p class="sub">Bilan SHRS Football Club — Ligue UDMSMC8T</p>
      <p class="upd">Dernière mise à jour&nbsp;: ${label}</p>
    </header>
    <nav class="nav">
      <a href="#classement">Classement</a>
      <a href="#graphe">Évolution</a>
      <a href="#pronos">Pronostics</a>
      <a href="#bilan">Bilan</a>
    </nav>
    <section id="podium" class="podium"></section>`);
}

function renderPodium() {
  const top3 = rankStandings(latestPoints()).slice(0, 3);
  const medals = ['🥇', '🥈', '🥉'];
  const order = [1, 0, 2]; // 2e, 1er, 3e pour l'effet marches
  document.getElementById('podium').innerHTML = order.map((i) => {
    const s = top3[i]; if (!s) return '';
    const p = playerByUid(s.uid);
    return `<div class="step step-${s.rank}" style="--c:${p.color}">
      <div class="medal">${medals[s.rank - 1]}</div>
      <div class="pname">${p.name}</div>
      <div class="ppts">${s.pts.toLocaleString('fr-FR')} pts</div>
    </div>`;
  }).join('');
}

// Nav sticky : surligne l'ancre correspondant à la section visible.
function initNavScrollSpy() {
  const links = Array.from(document.querySelectorAll('.nav a'));
  if (!links.length) return;
  const sections = links
    .map((a) => document.getElementById(a.hash.slice(1)))
    .filter(Boolean);
  if (!sections.length) return;
  const setActive = (id) => {
    links.forEach((a) => a.classList.toggle('active', a.hash === `#${id}`));
  };
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting);
    if (visible.length) setActive(visible[0].target.id);
  }, { rootMargin: '-40% 0px -55% 0px' });
  sections.forEach((s) => observer.observe(s));
}

function initApp() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  renderHero(app);
  renderPodium();
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="graphe" class="card">
      <h2>📈 Évolution</h2>
      <div class="tabs">
        <button class="tab active" data-mode="ranks">Rangs</button>
        <button class="tab" data-mode="points">Points</button>
      </div>
      <div id="chart" style="height:460px"></div>
      <div id="replay" class="replay">
        <button id="playBtn" class="tab">▶︎ Rejouer</button>
        <input id="scrub" type="range" min="0" value="0" step="1">
        <span id="scrubLabel" class="muted"></span>
      </div>
    </section>`);
  initChart();
  initNavScrollSpy();
}

// -- Graphe : bump chart des rangs (1er en haut) + points cumulés --------

function seriesFor(mode) {
  const { history, players } = window.__WC;
  const labels = Object.keys(history);
  const rankByLabel = labels.map((l) => {
    const r = {}; rankStandings(history[l]).forEach((s) => (r[s.uid] = s.rank)); return r;
  });
  return players.map((p) => ({
    name: p.name,
    type: 'line',
    smooth: true,
    symbol: 'circle',
    symbolSize: 8,
    lineStyle: { width: 2, color: p.color },
    itemStyle: { color: p.color },
    emphasis: { focus: 'series', lineStyle: { width: 4 } },
    data: labels.map((l, i) =>
      mode === 'ranks' ? (rankByLabel[i][p.uid] ?? null) : (history[l][p.uid] ?? null)),
  }));
}

function baseOption(mode) {
  const labels = Object.keys(window.__WC.history);
  return {
    backgroundColor: 'transparent',
    textStyle: { color: '#cfd6f5' },
    tooltip: {
      trigger: 'axis',
      order: mode === 'ranks' ? 'valueAsc' : 'valueDesc',
      axisPointer: { type: 'line', lineStyle: { color: '#ffffff55' } },
      backgroundColor: '#141b3c', borderColor: '#ffffff33', textStyle: { color: '#fff' },
      valueFormatter: (v) => (v == null ? '—' : mode === 'ranks' ? ordinalFr(v) : v.toLocaleString('fr-FR')),
    },
    legend: { type: 'scroll', top: 0, textStyle: { color: '#cfd6f5' }, inactiveColor: '#555' },
    grid: { left: 44, right: 20, top: 40, bottom: 60 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#ffffff33' } } },
    yAxis: mode === 'ranks'
      ? {
          type: 'value', inverse: true, min: 1, max: 16, interval: 1,
          axisLabel: { formatter: ordinalFr },
          splitLine: { lineStyle: { color: '#ffffff12' } },
        }
      : {
          type: 'value',
          axisLabel: { formatter: (v) => v.toLocaleString('fr-FR') },
          splitLine: { lineStyle: { color: '#ffffff12' } },
        },
    dataZoom: [{ type: 'inside' }, { type: 'slider', bottom: 16, height: 18 }],
    series: seriesFor(mode),
    animationDuration: 700,
  };
}
const chartOptionRanks = () => baseOption('ranks');
const chartOptionPoints = () => baseOption('points');

let _chart;
function initChart() {
  _chart = window.echarts.init(document.getElementById('chart'), null, { renderer: 'canvas' });
  _chart.setOption(chartOptionRanks());
  // Scopé à [data-mode] : #playBtn porte aussi la classe .tab (même style)
  // mais ne doit pas être traité comme un onglet Rangs/Points.
  document.querySelectorAll('.tab[data-mode]').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-mode]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    _chart.setOption(btn.dataset.mode === 'ranks' ? chartOptionRanks() : chartOptionPoints(), true);
  }));
  window.addEventListener('resize', () => _chart.resize());
  initReplay();
}

// -- Curseur temporel + animation replay journée par journée ------------

function currentMode() {
  return document.querySelector('.tab.active[data-mode]')?.dataset.mode || 'ranks';
}
function applyUpTo(idx) {
  const labels = Object.keys(window.__WC.history);
  const clip = idx + 1;
  const opt = currentMode() === 'ranks' ? chartOptionRanks() : chartOptionPoints();
  opt.xAxis.data = labels.slice(0, clip);
  opt.series = opt.series.map((s) => ({ ...s, data: s.data.slice(0, clip) }));
  opt.dataZoom = opt.dataZoom.map((z) => ({ ...z, start: 0, end: 100 }));
  _chart.setOption(opt, true);
  document.getElementById('scrubLabel').textContent = labels[idx];
}
function initReplay() {
  const labels = Object.keys(window.__WC.history);
  const scrub = document.getElementById('scrub');
  const btn = document.getElementById('playBtn');
  scrub.max = String(labels.length - 1);
  scrub.value = String(labels.length - 1);
  document.getElementById('scrubLabel').textContent = labels[labels.length - 1];
  scrub.addEventListener('input', () => { pause(); applyUpTo(+scrub.value); });
  let timer = null;
  function pause() { if (timer) { clearInterval(timer); timer = null; btn.textContent = '▶︎ Rejouer'; } }
  function play() {
    let i = +scrub.value >= labels.length - 1 ? 0 : +scrub.value;
    btn.textContent = '⏸ Pause';
    timer = setInterval(() => {
      applyUpTo(i); scrub.value = String(i);
      if (i >= labels.length - 1) { pause(); return; }
      i++;
    }, 700);
  }
  btn.addEventListener('click', () => (timer ? pause() : play()));
}
