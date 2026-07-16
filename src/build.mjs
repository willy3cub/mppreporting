import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

const AV_DIR = 'data/avatars';
const AV_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

// Avatars stockés en fichiers dans data/avatars/<uid>.<ext> → base64 data URI
// (embarqué au build pour garder la page auto-suffisante).
function avatarDataUris() {
  const dir = join(ROOT, AV_DIR);
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir)) {
    const dot = f.lastIndexOf('.');
    if (dot < 1) continue;
    const uid = f.slice(0, dot);
    const mime = AV_MIME[f.slice(dot + 1).toLowerCase()];
    if (!mime) continue;
    out[uid] = `data:${mime};base64,${readFileSync(join(dir, f)).toString('base64')}`;
  }
  return out;
}

const BADGE_DIR = 'assets/badges';

// Images des superlatifs (SVG dans assets/badges/<key>.svg) → base64 data URI.
function badgeDataUris() {
  const dir = join(ROOT, BADGE_DIR);
  if (!existsSync(dir)) return {};
  const out = {};
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.svg')) continue;
    const key = f.slice(0, -4);
    out[key] = `data:image/svg+xml;base64,${readFileSync(join(dir, f)).toString('base64')}`;
  }
  return out;
}

const FAV_DIR = 'data/favorites';
const IMG_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml' };

function imgDataUri(dir, base) {
  const f = join(ROOT, dir, base);
  if (!existsSync(f)) return null;
  const mime = IMG_MIME[base.split('.').pop().toLowerCase()];
  return mime ? `data:${mime};base64,${readFileSync(f).toString('base64')}` : null;
}

// Nations éliminées, déduites des résultats réels des phases finales (même logique
// que le bracket : le vaincu de chaque match KO joué). Le flag `eliminated` de l'API
// a du retard sur les éliminations récentes → on le recalcule ici.
function eliminatedNationsFrom(matches) {
  const PH = ['16es', '8es', 'Quarts', 'Demies', 'Finale'];
  const rounds = PH.map((ph) => matches.filter((m) => m.phase === ph)).filter((l) => l.length);
  const sets = rounds.map((l) => new Set(l.flatMap((m) => [m.team1, m.team2])));
  const elim = new Set();
  rounds.forEach((list, ri) => {
    for (const m of list) {
      if (m.status !== 'played') continue;
      let w = null;
      if (ri + 1 < rounds.length) {
        if (sets[ri + 1].has(m.team1)) w = m.team1;
        else if (sets[ri + 1].has(m.team2)) w = m.team2;
      }
      if (!w) {
        if (m.score1 == null || m.score2 == null || m.score1 === m.score2) continue;
        w = m.score1 > m.score2 ? m.team1 : m.team2;
      }
      elim.add(w === m.team1 ? m.team2 : m.team1);
    }
  });
  return elim;
}

// Nations qui ont encore au moins un match à disputer (statut != 'played') : finalistes
// ET équipes de la petite finale. Sert à la colonne Buteur — un joueur ne peut plus
// marquer une fois que son équipe a fini son parcours.
function activeNationsFrom(matches) {
  const s = new Set();
  for (const m of matches || []) {
    if (m.status !== 'played') { s.add(m.team1); s.add(m.team2); }
  }
  return s;
}

// Résout les images des favoris en data URIs (page auto-suffisante) ET réconcilie le
// statut « éliminé » des deux colonnes avec les résultats réels. Les deux colonnes ont
// des sémantiques DIFFÉRENTES :
//   - Champion (nation) : barré dès que l'équipe ne peut plus gagner le titre, c.-à-d.
//     perdant d'un match KO — un demi-finaliste battu reste barré même s'il dispute la
//     petite finale (il ne sera jamais champion).
//   - Buteur (via data/scorer-nations.json) : barré seulement quand le joueur ne peut
//     plus marquer, c.-à-d. quand son équipe n'a plus aucun match à venir. Un buteur
//     d'une équipe encore en lice (finale OU petite finale) n'est donc PAS barré.
function resolveFavorites(matches) {
  if (!existsSync(join(ROOT, 'data/favorites.json'))) return {};
  const fav = readJson('data/favorites.json');
  const elim = eliminatedNationsFrom(matches || []);
  const active = activeNationsFrom(matches || []);
  const scorerNat = existsSync(join(ROOT, 'data/scorer-nations.json')) ? readJson('data/scorer-nations.json') : {};
  const out = {};
  for (const [uid, f] of Object.entries(fav)) {
    const r = {};
    if (f.team) {
      const gone = !!f.team.eliminated || elim.has(f.team.name);
      r.team = { ...f.team, eliminated: gone, img: f.team.img ? imgDataUri(FAV_DIR, f.team.img) : null };
    }
    if (f.scorer) {
      const nat = scorerNat[f.scorer.name];
      const gone = nat != null && !active.has(nat);
      r.scorer = { ...f.scorer, eliminated: gone, img: f.scorer.img ? imgDataUri(FAV_DIR, f.scorer.img) : null };
    }
    out[uid] = r;
  }
  return out;
}

const CAP_DIR = 'data/captains';

// Slug ASCII : "Côte d'Ivoire" → "cote-d-ivoire", "Brésil" → "bresil".
function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '-').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Auto-mappe chaque équipe du tableau à son avatar de capitaine (fichier slug),
// puis résout en data URI (page auto-suffisante). Match exact du slug, sinon préfixe
// (ex. "Bosnie" ↔ "bosnie-herzegovine").
function resolveCaptains(matches) {
  if (!existsSync(join(ROOT, CAP_DIR))) return {};
  const bySlug = {};
  for (const f of readdirSync(join(ROOT, CAP_DIR))) {
    if (!/\.(png|jpe?g|webp)$/i.test(f)) continue;
    bySlug[slugify(f.replace(/\.[^.]+$/, ''))] = f;
  }
  const teams = new Set();
  for (const m of matches) { teams.add(m.team1); teams.add(m.team2); }
  const out = {};
  for (const team of teams) {
    const ts = slugify(team);
    let file = bySlug[ts];
    if (!file) {
      const hit = Object.keys(bySlug).find((s) => s.startsWith(ts) || ts.startsWith(s));
      if (hit) file = bySlug[hit];
    }
    if (!file) continue;
    const img = imgDataUri(CAP_DIR, file);
    if (img) out[team] = { img };
  }
  return out;
}

export function buildHtml({ players, history, matches, forecasts, bilan, badges, favorites, captains, recap, echarts, appJs }) {
  const data = JSON.stringify({ players, history, matches, forecasts, bilan, badges, favorites, captains, recap }).replace(/</g, '\\u003c');
  return read('src/template.html')
    .replace('/*__ECHARTS__*/', () => echarts)
    .replace('/*__DATA__*/', () => data)
    .replace('/*__APP__*/', () => appJs);
}

export function build() {
  const avatars = avatarDataUris();
  const players = readJson('data/players.json').map((p) => ({ ...p, avatar: avatars[p.uid] || null }));
  const matches = readJson('data/matches.json');
  const html = buildHtml({
    players,
    history: readJson('data/history.json'),
    matches,
    forecasts: readJson('data/forecasts.json'),
    bilan: readJson('data/bilan.json'),
    badges: badgeDataUris(),
    favorites: resolveFavorites(matches),
    captains: resolveCaptains(matches),
    recap: existsSync(join(ROOT, 'data/recap.json')) ? readJson('data/recap.json') : null,
    echarts: read('node_modules/echarts/dist/echarts.min.js'),
    appJs: read('src/app.js'),
  });
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/index.html'), html);
  console.log(`OK  dist/index.html  (${(html.length / 1024) | 0} Ko)`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
