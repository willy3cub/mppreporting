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
      <a href="#compare">Duel</a>
      <a href="#graphe">Évolution</a>
      <a href="#pronos">Pronostics</a>
      <a href="#awards">Superlatifs</a>
      <a href="#rares">Rares</a>
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
      <td class="pname-link" data-card-uid="${p.uid}" style="color:${p.color};font-weight:600">${p.name}</td>
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

// -- Logique features (réimplémentée depuis src/lib/awards.mjs, Node-only) --
// Réutilisée par la carte joueur, les superlatifs et les pronos rares.

function groupConsensus(matchId, forecasts) {
  const tally = new Map();
  for (const uid of Object.keys(forecasts)) {
    const f = forecasts[uid]?.[matchId];
    if (!f || f.score1 == null) continue;
    const k = `${f.score1}-${f.score2}`;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  let best = null, total = 0;
  for (const [k, c] of tally) { total += c; if (!best || c > best[1]) best = [k, c]; }
  if (!best) return null;
  const [s1, s2] = best[0].split('-').map(Number);
  return { score1: s1, score2: s2, count: best[1], total };
}

function topRareForecasts(matches, forecasts, players, n = 10) {
  const nameOf = Object.fromEntries(players.map((p) => [p.uid, p.name]));
  const rows = [];
  for (const uid of Object.keys(forecasts)) {
    for (const m of matches) {
      const f = forecasts[uid]?.[m.id];
      if (!f || (f.result !== 'exact' && f.result !== 'result')) continue;
      rows.push({ uid, name: nameOf[uid] || uid, matchId: m.id, score1: f.score1, score2: f.score2, rarity: f.rarity ?? 0, result: f.result });
    }
  }
  rows.sort((a, b) => b.rarity - a.rarity);
  return rows.slice(0, n);
}

function computeAwards(players, matches, forecasts) {
  const uids = players.map((p) => p.uid);
  const played = matches.filter((m) => m.status === 'played');
  const byGw = {};
  for (const m of played) (byGw[m.gameWeek] ||= []).push(m.id);
  const consensus = {};
  for (const m of played) consensus[m.id] = groupConsensus(m.id, forecasts);
  const stat = {};
  for (const uid of uids) {
    const f = forecasts[uid] || {};
    let exact = 0, zero = 0, rar = 0, rarN = 0, follow = 0, contrarianRight = 0, lateSum = 0, lateN = 0;
    let streak = 0, bestStreak = 0;
    for (const m of played) {
      const p = f[m.id]; if (!p) { streak = 0; continue; }
      if (p.result === 'exact') exact++;
      if ((p.points ?? 0) === 0) zero++;
      if (p.rarity != null) { rar += p.rarity; rarN++; }
      const c = consensus[m.id];
      const isConsensus = c && p.score1 === c.score1 && p.score2 === c.score2;
      if (isConsensus) follow++;
      if (!isConsensus && (p.result === 'exact' || p.result === 'result')) contrarianRight++;
      if (p.editedAt && m.date) { lateSum += (new Date(p.editedAt) - new Date(m.date)); lateN++; }
      if ((p.points ?? 0) > 0) { streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
    }
    let bestGw = 0;
    for (const ids of Object.values(byGw)) {
      const s = ids.reduce((acc, id) => acc + (f[id]?.points ?? 0), 0);
      bestGw = Math.max(bestGw, s);
    }
    stat[uid] = { exact, zero, rarAvg: rarN ? rar / rarN : 0, follow, contrarianRight,
      lateAvg: lateN ? lateSum / lateN : -Infinity, bestStreak, bestGw };
  }
  const pick = (metric, dir = 'max') => {
    let best = null;
    for (const uid of uids) {
      const v = stat[uid][metric];
      if (best === null || (dir === 'max' ? v > best.value : v < best.value)) best = { uid, value: v };
    }
    return best;
  };
  return {
    sniper: pick('exact'), serie: pick('bestStreak'), kamikaze: pick('rarAvg'),
    mouton: pick('follow'), visionnaire: pick('contrarianRight'), carton: pick('bestGw'),
    frileux: pick('zero'), dernier: pick('lateAvg'),
  };
}

// Libellés des 8 superlatifs (partagés carte + section awards).
const AWARD_LABELS = {
  sniper: ['🎯', 'Le Sniper', 'scores exacts'],
  serie: ['🔥', 'La Série', "matchs d'affilée avec des points"],
  kamikaze: ['🃏', 'Le Kamikaze', 'scores les plus rares'],
  mouton: ['🐑', 'Le Mouton', 'suit le groupe'],
  visionnaire: ['🧠', 'Le Visionnaire', 'juste à contre-courant'],
  carton: ['💥', 'Le Carton', 'record sur une journée'],
  frileux: ['🧊', 'Le Frileux', 'matchs à 0 point'],
  dernier: ['⏱️', 'Le Dernier', 'pronos tardifs'],
};

let _awardsCache;
function allAwards() {
  if (!_awardsCache) {
    const { players, matches, forecasts } = window.__WC;
    _awardsCache = computeAwards(players, matches, forecasts);
  }
  return _awardsCache;
}

// Badges gagnés par un joueur donné.
function awardsForPlayer(uid) {
  const aw = allAwards();
  return Object.entries(aw)
    .filter(([key, v]) => v && v.uid === uid && hasAward(key, v))
    .map(([key]) => AWARD_LABELS[key]);
}

// -- Carte joueur partageable (modale + export PNG local) ----------------

function playerCardStats(uid) {
  const { matches, forecasts } = window.__WC;
  const pf = forecasts[uid] || {};
  const cur = latestPoints();
  const rank = rankStandings(cur).find((s) => s.uid === uid)?.rank ?? null;
  const pts = cur[uid] ?? 0;
  let played = 0, exact = 0, best = null, worst = null;
  for (const m of matches) {
    const pr = pf[m.id]; const st = fStatus(pr, m);
    if (st === 'pending') continue;
    played++; if (st === 'exact') exact++;
    const pp = pr?.points ?? 0;
    if (!best || pp > best.pts) best = { m, pts: pp };
    if (!worst || pp < worst.pts) worst = { m, pts: pp };
  }
  return { rank, pts, played, exact, rate: played ? Math.round((exact / played) * 100) : 0, best, worst };
}

function renderPlayerCard(uid) {
  const p = playerByUid(uid);
  if (!p) return;
  const s = playerCardStats(uid);
  const badges = awardsForPlayer(uid);
  const badgeHtml = badges.length
    ? badges.map(([emo, title]) => `<span class="card-badge" title="${title}">${emo} ${title}</span>`).join('')
    : '<span class="muted">Aucun trophée… pour l’instant.</span>';
  const bestTxt = s.best ? `${matchLabel(s.best.m)} · ${s.best.pts} pts` : '—';
  const worstTxt = s.worst ? `${matchLabel(s.worst.m)} · ${s.worst.pts} pts` : '—';
  let overlay = document.getElementById('cardOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'cardOverlay';
    overlay.className = 'card-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }
  overlay.innerHTML = `
    <div class="pcard" style="--c:${p.color}">
      <button class="pcard-close" aria-label="Fermer">✕</button>
      <div class="pcard-head">
        <div class="pcard-avatar">${p.avatarUrl ? `<img src="${p.avatarUrl}" alt="">` : p.name.slice(0, 1)}</div>
        <div>
          <div class="pcard-name">${p.name}</div>
          <div class="muted">${p.pseudo}</div>
        </div>
        <div class="pcard-rank">${s.rank ? ordinalFr(s.rank) : '—'}</div>
      </div>
      <div class="pcard-stats">
        <div class="stat"><b>${s.pts.toLocaleString('fr-FR')}</b><span>points</span></div>
        <div class="stat"><b>${s.exact}</b><span>scores exacts</span></div>
        <div class="stat"><b>${s.rate}%</b><span>taux d'exacts</span></div>
      </div>
      <div class="pcard-line"><span class="muted">Meilleur prono</span> ${bestTxt}</div>
      <div class="pcard-line"><span class="muted">Pire prono</span> ${worstTxt}</div>
      <div class="pcard-badges">${badgeHtml}</div>
      <div class="pcard-actions">
        <button id="cardLink" class="tab">🔗 Copier le lien</button>
        <button id="cardImg" class="tab">⬇︎ Télécharger l'image</button>
      </div>
    </div>`;
  overlay.querySelector('.pcard-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#cardLink').addEventListener('click', (e) => {
    const url = location.origin + location.pathname + '?joueur=' + encodeURIComponent(p.name);
    navigator.clipboard?.writeText(url);
    e.target.textContent = '✓ Lien copié';
  });
  overlay.querySelector('#cardImg').addEventListener('click', () => exportCardImage(p, s));
}

// Export sans dépendance : SVG (texte/formes uniquement) → canvas → PNG.
function exportCardImage(p, s) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const W = 640, H = 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0a0e27"/><stop offset="1" stop-color="#141b3c"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="18" fill="none" stroke="${p.color}" stroke-width="3"/>
    <text x="40" y="66" fill="#fff" font-family="Arial" font-size="34" font-weight="bold">${esc(p.name)}</text>
    <text x="40" y="98" fill="#9aa3c7" font-family="Arial" font-size="18">${esc(p.pseudo)}</text>
    <text x="${W - 40}" y="80" text-anchor="end" fill="${p.color}" font-family="Arial" font-size="40" font-weight="bold">${s.rank ? esc(ordinalFr(s.rank)) : '—'}</text>
    <text x="40" y="180" fill="#FFD166" font-family="Arial" font-size="52" font-weight="bold">${esc(s.pts.toLocaleString('fr-FR'))}</text>
    <text x="40" y="208" fill="#9aa3c7" font-family="Arial" font-size="18">points</text>
    <text x="300" y="180" fill="#fff" font-family="Arial" font-size="40" font-weight="bold">${s.exact}</text>
    <text x="300" y="208" fill="#9aa3c7" font-family="Arial" font-size="18">scores exacts</text>
    <text x="480" y="180" fill="#fff" font-family="Arial" font-size="40" font-weight="bold">${s.rate}%</text>
    <text x="480" y="208" fill="#9aa3c7" font-family="Arial" font-size="18">taux d'exacts</text>
    <text x="40" y="300" fill="#dfe4ff" font-family="Arial" font-size="20">CDM 2026 — SHRS Football Club</text>
  </svg>`;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    canvas.getContext('2d').drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carte-${p.name}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// -- Superlatifs / trophées : 8 badges ----------------------------------

function awardValueText(key, value) {
  if (key === 'dernier') {
    // lateAvg = moyenne (editedAt - date du match) en ms ; on affiche en heures avant/après.
    const h = Math.round(value / 3600000);
    return h <= 0 ? `${-h} h avant le coup d'envoi` : `${h} h après le coup d'envoi`;
  }
  if (key === 'kamikaze') return `rareté moy. ${value.toFixed(1)}`;
  return String(value);
}

// Un badge est attribué si la valeur est significative. Pour « Le Dernier »
// (retard moyen), une valeur négative est normale (prono avant le match) :
// on masque seulement l'absence de donnée (-Infinity).
function hasAward(key, a) {
  if (!a || !a.uid) return false;
  if (key === 'dernier') return a.value !== -Infinity;
  return a.value > 0;
}

function renderAwards() {
  const aw = allAwards();
  const cards = Object.entries(AWARD_LABELS).map(([key, [emo, title, detail]]) => {
    const a = aw[key];
    const has = hasAward(key, a);
    const p = has ? playerByUid(a.uid) : null;
    const who = p ? `<div class="badge-who" style="color:${p.color}">${p.name}</div>` : '<div class="badge-who muted">—</div>';
    const val = has ? `<div class="badge-val">${awardValueText(key, a.value)}</div>` : '';
    return `<div class="badge">
      <div class="badge-emo">${emo}</div>
      <div class="badge-title">${title}</div>
      ${who}${val}
      <div class="badge-detail">${detail}</div>
    </div>`;
  }).join('');
  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="awards" class="card">
      <h2>🏅 Superlatifs</h2>
      <div class="badges-grid">${cards}</div>
    </section>`);
}

// -- Pronos rares + consensus vs réalité --------------------------------

function renderRares() {
  const { players, matches, forecasts } = window.__WC;
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  const top = topRareForecasts(matches, forecasts, players, 10);
  const p = playerByUid;
  const rareItems = top.length ? top.map((r) => {
    const m = byId[r.matchId];
    const pl = p(r.uid);
    const st = r.result === 'exact' ? 'exact' : 'result';
    return `<li class="rare-item">
      ${pastille(st)}
      <span style="color:${pl.color};font-weight:600">${pl.name}</span> a osé
      <b>${m.flag1} ${r.score1}-${r.score2} ${m.flag2}</b>
      <span class="muted">sur ${m.team1}–${m.team2}</span></li>`;
  }).join('') : '<li class="muted">Aucun prono rare pour l’instant.</li>';

  document.getElementById('app').insertAdjacentHTML('beforeend', `
    <section id="rares" class="card">
      <h2>💎 Pronos rares</h2>
      <h3 class="rare-sub">Les paris les plus gonflés (et justes)</h3>
      <ul class="rare-list">${rareItems}</ul>
    </section>`);
}

// Clic sur un nom de joueur (via [data-card-uid]) → ouvre sa carte.
function initCardTriggers() {
  document.getElementById('app').addEventListener('click', (e) => {
    const el = e.target.closest('[data-card-uid]');
    if (el) renderPlayerCard(el.dataset.cardUid);
  });
}
// Deep link ?joueur=<name> → ouvre la carte au chargement.
function openCardFromUrl() {
  const name = new URLSearchParams(location.search).get('joueur');
  if (!name) return;
  const p = window.__WC.players.find((x) => x.name === name);
  if (p) renderPlayerCard(p.uid);
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
  renderAwards();
  renderRares();
  renderBilan();
  initCardTriggers();
  openCardFromUrl();
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
