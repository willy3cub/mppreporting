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
  initNavScrollSpy();
}
