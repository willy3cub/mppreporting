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

function renderClassement() {
  const { history, players } = window.__WC;
  const labels = Object.keys(history);
  const cur = history[labels[labels.length - 1]];
  const prev = history[labels[labels.length - 2]] || cur;
  const rankPrev = {}; rankStandings(prev).forEach((s) => (rankPrev[s.uid] = s.rank));
  const rows = rankStandings(cur).map((s) => {
    const p = players.find((x) => x.uid === s.uid);
    const dp = s.pts - (prev[s.uid] ?? 0);
    const dr = (rankPrev[s.uid] ?? s.rank) - s.rank;
    const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[s.rank] || `${s.rank}.`;
    const arrow = dr > 0 ? `<span class="up">▲${dr}</span>`
      : dr < 0 ? `<span class="down">▼${-dr}</span>` : `<span class="flat">■</span>`;
    return `<tr>
      <td class="rk">${medal}</td>
      <td style="color:${p.color};font-weight:600">${p.name}</td>
      <td class="ps">${p.pseudo}</td>
      <td class="ev">${arrow}</td>
      <td class="dp">+${dp.toLocaleString('fr-FR')}</td>
      <td class="tot">${s.pts.toLocaleString('fr-FR')}</td>
    </tr>`;
  }).join('');
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="classement" class="card">
      <h2>🏆 Classement</h2>
      <div class="twrap"><table class="tbl">
        <thead><tr><th>#</th><th>Joueur</th><th>Pseudo</th><th>Évol</th><th>+pts</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
    </section>`);
}

// -- Comparateur 1v1 : duel entre deux joueurs --------------------------
// headToHead réimplémente src/lib/awards.mjs (Node-only) en <script> classique.

function headToHead(uidA, uidB, history) {
  const labels = Object.keys(history);
  let devA = 0, devB = 0;
  for (const l of labels) {
    const a = history[l][uidA] ?? 0, b = history[l][uidB] ?? 0;
    if (a > b) devA++; else if (b > a) devB++;
  }
  const last = labels[labels.length - 1] || null;
  return { ptsA: last ? (history[last][uidA] ?? 0) : 0, ptsB: last ? (history[last][uidB] ?? 0) : 0,
    journeesDevantA: devA, journeesDevantB: devB, journees: labels.length };
}

// Stats pronos d'un joueur (exacts / bons) sur les matchs joués.
function pronoTally(uid) {
  const { matches, forecasts } = window.__WC;
  const pf = forecasts[uid] || {};
  let exact = 0, good = 0;
  for (const m of matches) {
    const st = fStatus(pf[m.id], m);
    if (st === 'exact') { exact++; good++; }
    else if (st === 'result') good++;
  }
  return { exact, good };
}

let _cmpChart;
function renderCompare() {
  const { players } = window.__WC;
  const opts = (sel) => players.map((p) => `<option value="${p.uid}">${p.name}</option>`).join('');
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="compare" class="card">
      <h2>⚔️ Duel</h2>
      <div class="cmp-picks">
        <select id="cmpA" class="cmp-sel">${opts()}</select>
        <button id="cmpSwap" class="tab" title="Échanger">⇄</button>
        <select id="cmpB" class="cmp-sel">${opts()}</select>
      </div>
      <div id="cmpChart" style="height:300px"></div>
      <div id="cmpTable"></div>
    </section>`);
  const selA = document.getElementById('cmpA');
  const selB = document.getElementById('cmpB');
  selA.selectedIndex = 0;
  selB.selectedIndex = Math.min(1, players.length - 1);
  _cmpChart = window.echarts.init(document.getElementById('cmpChart'), null, { renderer: 'canvas' });
  selA.addEventListener('change', updateCompare);
  selB.addEventListener('change', updateCompare);
  document.getElementById('cmpSwap').addEventListener('click', () => {
    const a = selA.value; selA.value = selB.value; selB.value = a; updateCompare();
  });
  window.addEventListener('resize', () => _cmpChart && _cmpChart.resize());
  updateCompare();
}

function updateCompare() {
  const { history, players } = window.__WC;
  const labels = Object.keys(history);
  const uidA = document.getElementById('cmpA').value;
  const uidB = document.getElementById('cmpB').value;
  const pA = playerByUid(uidA), pB = playerByUid(uidB);
  const serie = (uid, color, name) => ({
    name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 7,
    lineStyle: { width: 3, color }, itemStyle: { color },
    data: labels.map((l) => history[l][uid] ?? null),
  });
  _cmpChart.setOption({
    backgroundColor: 'transparent', textStyle: { color: '#cfd6f5' },
    tooltip: { trigger: 'axis', backgroundColor: '#141b3c', borderColor: '#ffffff33', textStyle: { color: '#fff' },
      valueFormatter: (v) => (v == null ? '—' : v.toLocaleString('fr-FR')) },
    legend: { top: 0, textStyle: { color: '#cfd6f5' } },
    grid: { left: 50, right: 20, top: 36, bottom: 30 },
    xAxis: { type: 'category', data: labels, axisLine: { lineStyle: { color: '#ffffff33' } } },
    yAxis: { type: 'value', axisLabel: { formatter: (v) => v.toLocaleString('fr-FR') }, splitLine: { lineStyle: { color: '#ffffff12' } } },
    series: [serie(uidA, pA.color, pA.name), serie(uidB, pB.color, pB.name)],
    animationDuration: 500,
  }, true);
  const h = headToHead(uidA, uidB, history);
  const tA = pronoTally(uidA), tB = pronoTally(uidB);
  const row = (label, va, vb) => {
    const aLead = va > vb, bLead = vb > va;
    return `<tr>
      <td class="cmp-a ${aLead ? 'lead' : ''}">${va}</td>
      <td class="cmp-mid">${label}</td>
      <td class="cmp-b ${bLead ? 'lead' : ''}">${vb}</td></tr>`;
  };
  document.getElementById('cmpTable').innerHTML = `
    <table class="tbl cmp-tbl">
      <thead><tr>
        <th class="cmp-a" style="color:${pA.color}">${pA.name}</th>
        <th class="cmp-mid"></th>
        <th class="cmp-b" style="color:${pB.color}">${pB.name}</th>
      </tr></thead>
      <tbody>
        ${row('points', h.ptsA.toLocaleString('fr-FR'), h.ptsB.toLocaleString('fr-FR'))}
        ${row('scores exacts', tA.exact, tB.exact)}
        ${row('bons pronos', tA.good, tB.good)}
        ${row(`journées devant / ${h.journees}`, h.journeesDevantA, h.journeesDevantB)}
      </tbody>
    </table>`;
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
  renderClassement();
  renderCompare();
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
  renderPronosShell();
  renderBilan();
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

// -- Pronostics : 3 vues (grille / par joueur / par match) --------------
// fStatus réimplémente forecastStatus() de src/lib/compute.mjs (Node-only,
// non importable ici car app.js s'exécute en <script> classique).

function outcome(a, b) { return a > b ? '1' : a < b ? '2' : 'N'; }
function fStatus(prono, m) {
  if (!prono || m.status !== 'played') return 'pending';
  if (prono.score1 === m.score1 && prono.score2 === m.score2) return 'exact';
  if (outcome(prono.score1, prono.score2) === outcome(m.score1, m.score2)) return 'result';
  return 'miss';
}
const PASTILLE = { exact: ['E', 'st-exact'], result: ['R', 'st-result'], miss: ['✗', 'st-miss'], pending: ['·', 'st-pending'] };
function pastille(st, label) {
  const [ch, cls] = PASTILLE[st];
  return `<span class="pill ${cls}" title="${label || ''}">${ch}</span>`;
}
function matchLabel(m) { return `${m.flag1} ${m.team1} ${m.score1 ?? '–'}-${m.score2 ?? '–'} ${m.team2} ${m.flag2}`; }

function renderPronosShell() {
  const { players, matches } = window.__WC;
  const playerOpts = players.map((p) => `<option value="${p.uid}">${p.name}</option>`).join('');
  const matchOpts = matches.map((m) => `<option value="${m.id}">${matchLabel(m)}</option>`).join('');
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="pronos" class="card">
      <h2>🎯 Pronostics</h2>
      <div class="tabs">
        <button class="pv active" data-view="grille">Grille</button>
        <button class="pv" data-view="joueur">Par joueur</button>
        <button class="pv" data-view="match">Par match</button>
      </div>
      <div class="pv-controls">
        <select id="selPlayer" hidden>${playerOpts}</select>
        <select id="selMatch" hidden>${matchOpts}</select>
      </div>
      <div id="pronoBody"></div>
    </section>`);
  document.querySelectorAll('.pv').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.pv').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    showView(b.dataset.view);
  }));
  document.getElementById('selPlayer').addEventListener('change', () => showView('joueur'));
  document.getElementById('selMatch').addEventListener('change', () => showView('match'));
  showView('grille');
}

function showView(view) {
  document.getElementById('selPlayer').hidden = view !== 'joueur';
  document.getElementById('selMatch').hidden = view !== 'match';
  const body = document.getElementById('pronoBody');
  if (view === 'grille') body.innerHTML = viewGrille();
  else if (view === 'joueur') body.innerHTML = viewJoueur(document.getElementById('selPlayer').value);
  else body.innerHTML = viewMatch(document.getElementById('selMatch').value);
}

function viewGrille() {
  const { players, matches, forecasts } = window.__WC;
  const head = `<th>Match</th>` + players.map((p) => `<th class="vth" style="color:${p.color}">${p.name}</th>`).join('');
  const rows = matches.map((m) => {
    const cells = players.map((p) => {
      const pr = forecasts[p.uid]?.[m.id];
      const st = fStatus(pr, m);
      const lbl = pr ? `${pr.score1}-${pr.score2}` : '—';
      return `<td>${pastille(st, lbl)}</td>`;
    }).join('');
    return `<tr><td class="mcol">${matchLabel(m)}</td>${cells}</tr>`;
  }).join('');
  return `<div class="twrap"><table class="tbl grid"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function viewJoueur(uid) {
  const { matches, forecasts } = window.__WC;
  const p = window.__WC.players.find((x) => x.uid === uid);
  const pf = forecasts[uid] || {};
  let played = 0, exact = 0, resu = 0, pts = 0;
  const rows = matches.map((m) => {
    const pr = pf[m.id]; const st = fStatus(pr, m);
    if (st !== 'pending') { played++; if (st === 'exact') exact++; if (st === 'result') resu++; pts += pr?.points || 0; }
    return `<tr><td class="mcol">${matchLabel(m)}</td>
      <td>${pr ? `${pr.score1}-${pr.score2}` : '—'}</td>
      <td>${pastille(st)}</td><td class="dp">${pr?.points ?? ''}</td></tr>`;
  }).join('');
  const rate = played ? Math.round((exact / played) * 100) : 0;
  return `<div class="stats">
      <div class="stat"><b style="color:${p.color}">${p.name}</b><span>${p.pseudo}</span></div>
      <div class="stat"><b>${pts.toLocaleString('fr-FR')}</b><span>points pronos</span></div>
      <div class="stat"><b>${exact}</b><span>scores exacts</span></div>
      <div class="stat"><b>${rate}%</b><span>taux d'exacts</span></div>
    </div>
    <div class="twrap"><table class="tbl"><thead><tr><th>Match</th><th>Prono</th><th>Statut</th><th>Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function viewMatch(id) {
  const { players, matches, forecasts } = window.__WC;
  const m = matches.find((x) => x.id === id);
  const rows = players.map((p) => {
    const pr = forecasts[p.uid]?.[id]; const st = fStatus(pr, m);
    return `<tr><td style="color:${p.color};font-weight:600">${p.name}</td>
      <td>${pr ? `${pr.score1}-${pr.score2}` : '—'}</td>
      <td>${pastille(st)}</td><td class="dp">${pr?.points ?? ''}</td></tr>`;
  }).join('');
  return `<p class="mhead">${matchLabel(m)} <span class="muted">(${m.phase})</span></p>
    <div class="twrap"><table class="tbl"><thead><tr><th>Joueur</th><th>Prono</th><th>Statut</th><th>Pts</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

// -- Bilan éditorial : mot du jour, ton chambreur ------------------------

function renderBilan() {
  const b = window.__WC.bilan || { html: '', updated: '' };
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="bilan" class="card">
      <h2>🔍 Le mot du bilan <span class="muted">${b.updated}</span></h2>
      <div class="prose">${b.html}</div>
    </section>
    <footer class="foot">SHRS Football Club — Coupe du Monde 2026 • généré statiquement</footer>`);
}
