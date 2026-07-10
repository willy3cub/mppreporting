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

// Résout les basenames d'images des favoris en data URIs (page auto-suffisante).
function resolveFavorites() {
  if (!existsSync(join(ROOT, 'data/favorites.json'))) return {};
  const fav = readJson('data/favorites.json');
  const out = {};
  for (const [uid, f] of Object.entries(fav)) {
    const r = {};
    if (f.team) r.team = { ...f.team, img: f.team.img ? imgDataUri(FAV_DIR, f.team.img) : null };
    if (f.scorer) r.scorer = { ...f.scorer, img: f.scorer.img ? imgDataUri(FAV_DIR, f.scorer.img) : null };
    out[uid] = r;
  }
  return out;
}

const CAP_DIR = 'data/captains';

// Résout les avatars des capitaines (par nom d'équipe) en data URIs — page auto-suffisante.
function resolveCaptains() {
  if (!existsSync(join(ROOT, 'data/captains.json'))) return {};
  const cap = readJson('data/captains.json');
  const out = {};
  for (const [team, c] of Object.entries(cap)) {
    const img = c.file ? imgDataUri(CAP_DIR, c.file) : null;
    if (img) out[team] = { img, captain: c.captain || '' };
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
  const html = buildHtml({
    players,
    history: readJson('data/history.json'),
    matches: readJson('data/matches.json'),
    forecasts: readJson('data/forecasts.json'),
    bilan: readJson('data/bilan.json'),
    badges: badgeDataUris(),
    favorites: resolveFavorites(),
    captains: resolveCaptains(),
    recap: existsSync(join(ROOT, 'data/recap.json')) ? readJson('data/recap.json') : null,
    echarts: read('node_modules/echarts/dist/echarts.min.js'),
    appJs: read('src/app.js'),
  });
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/index.html'), html);
  console.log(`OK  dist/index.html  (${(html.length / 1024) | 0} Ko)`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
