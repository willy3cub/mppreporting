import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { mapMatches, mapForecasts } from './lib/mpp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHALLENGE = 'mpp_challenge_UDMSMC8T';
const API = 'https://api.mpp.football';
const CHAMPIONSHIP = 8;
const EP = {
  standings: `${API}/challenge-standings/users-standings?challengeId=${CHALLENGE}&offset=0&limit=20`,
  matches: `${API}/championships-current-matches`,
  clubs: `${API}/championship-clubs`,
  calendar: `${API}/championship-calendar/${CHAMPIONSHIP}`,
  forecastsForMatch: (mid) => `${API}/user-match-forecasts/contest/${CHALLENGE}/match/${mid}`,
  championshipStats: (uid) => `${API}/user-championship-stats/championship/${CHAMPIONSHIP}?userId=${uid}&season=2025`,
};

const jpath = (p) => join(ROOT, p);
const readJson = (p) => JSON.parse(readFileSync(jpath(p), 'utf8'));
const writeJson = (p, o) => writeFileSync(jpath(p), JSON.stringify(o, null, 2) + '\n');

export function normalizeStandings(api) {
  const points = {}; let maxCalc = 0;
  for (const s of api.standings || []) {
    points[s.user.id] = s.ranking.points;
    maxCalc = Math.max(maxCalc, s.ranking.calculatedForecasts ?? 0);
  }
  return { points, maxCalc };
}
export function mergeHistory(existing, label, standings) {
  return { ...existing, [label]: { ...standings } };
}
export function mergeById(existing, incoming, idKey) {
  const map = new Map(existing.map((e) => [e[idKey], e]));
  for (const it of incoming) map.set(it[idKey], { ...map.get(it[idKey]), ...it });
  return [...map.values()];
}
export function mergeForecasts(existing, incoming) {
  const out = { ...existing };
  for (const [uid, byMatch] of Object.entries(incoming)) out[uid] = { ...out[uid], ...byMatch };
  return out;
}

function token() {
  if (process.env.MPP_TOKEN) return process.env.MPP_TOKEN.trim();
  if (existsSync(jpath('.mpp-token'))) return readFileSync(jpath('.mpp-token'), 'utf8').trim();
  throw new Error('Token MPP absent : renseigner .mpp-token ou MPP_TOKEN (voir CLAUDE.md).');
}
const HEADERS = {
  application: 'mppLfp', 'app-context': 'internationalEvent',
  'client-version': '11.12.0', 'client-language': 'fr-FR', platform: 'web',
  accept: 'application/json, text/plain, */*', origin: 'https://mpp.football',
};
async function get(url, tok) {
  const r = await fetch(url, { headers: { ...HEADERS, authorization: `Bearer ${tok}` } });
  if (r.status === 401) throw new Error('401 : token MPP expiré, le rafraîchir.');
  if (!r.ok) throw new Error(`${r.status} sur ${url}`);
  return r.json();
}

// Télécharge les avatars et les embarque en base64 dans data/avatars.json
// (page auto-suffisante : aucune requête réseau au chargement).
// Un même URL partagé par plusieurs joueurs = avatar par défaut → ignoré
// (le front retombe sur la pastille colorée avec l'initiale).
const AV_DIR = 'data/avatars';
const AV_EXTS = ['jpg', 'jpeg', 'png', 'webp'];

// Redimensionne une image à 96px (JPEG léger). Essaie plusieurs outils pour
// rester multi-plateforme : sips (macOS), puis ImageMagick (Ubuntu : magick/convert).
// Renvoie true si un outil a réussi.
function resizeAvatar(srcPath, dstJpgPath) {
  const attempts = [
    ['sips', ['-Z', '96', '-s', 'format', 'jpeg', '-s', 'formatOptions', '80', srcPath, '--out', dstJpgPath]],
    ['magick', [srcPath, '-resize', '96x96>', '-strip', '-quality', '80', dstJpgPath]],
    ['convert', [srcPath, '-resize', '96x96>', '-strip', '-quality', '80', dstJpgPath]],
  ];
  for (const [cmd, args] of attempts) {
    try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { /* outil suivant */ }
  }
  return false;
}

function removeAvatarFiles(uid) {
  for (const ext of AV_EXTS) {
    const f = jpath(`${AV_DIR}/${uid}.${ext}`);
    if (existsSync(f)) rmSync(f);
  }
}

// Télécharge les avatars dans data/avatars/<uid>.jpg (fichiers versionnés).
// Le build les ré-encode en base64 → page auto-suffisante.
// Un URL partagé par plusieurs joueurs = avatar par défaut → ignoré
// (le front retombe sur la pastille colorée avec l'initiale).
export async function updateAvatars(standingsRaw) {
  const entries = (standingsRaw.standings || [])
    .map((s) => [s.user.id, s.user.avatarUrl])
    .filter(([, url]) => url);
  const count = {};
  for (const [, url] of entries) count[url] = (count[url] || 0) + 1;
  mkdirSync(jpath(AV_DIR), { recursive: true });
  let n = 0;
  for (const [uid, url] of entries) {
    removeAvatarFiles(uid); // repart propre (évite doublons d'extension)
    if (count[url] > 1) continue; // placeholder par défaut
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      const ext = /\.jpe?g($|\?)/i.test(url) ? 'jpg' : /\.webp($|\?)/i.test(url) ? 'webp' : 'png';
      const tmp = join(tmpdir(), `mpp-avatar-src.${ext}`);
      writeFileSync(tmp, buf);
      if (resizeAvatar(tmp, jpath(`${AV_DIR}/${uid}.jpg`))) n++;
      else { writeFileSync(jpath(`${AV_DIR}/${uid}.${ext}`), buf); n++; } // pas d'outil : image brute
    } catch { /* avatar indisponible : on garde l'existant */ }
  }
  console.log(`OK  avatars (${n} persos → ${AV_DIR}/)`);
}

// Paris long terme : équipe championne + buteur pronostiqués par chaque joueur.
// Images (logos équipes, photos buteurs) téléchargées dans data/favorites/,
// dédupliquées par id source, redimensionnées (format conservé → transparence PNG ok).
const FAV_DIR = 'data/favorites';

function resizeKeepFormat(srcPath, dstPath) {
  const attempts = [
    ['sips', ['-Z', '120', srcPath, '--out', dstPath]],
    ['magick', [srcPath, '-resize', '120x120>', dstPath]],
    ['convert', [srcPath, '-resize', '120x120>', dstPath]],
  ];
  for (const [cmd, args] of attempts) {
    try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { /* outil suivant */ }
  }
  return false;
}

// Télécharge une image → data/favorites/<name>.<ext> (dédup via `seen`). Renvoie le basename.
async function fetchFavImage(url, name, seen) {
  const ext = /\.jpe?g($|\?)/i.test(url) ? 'jpg' : /\.webp($|\?)/i.test(url) ? 'webp' : 'png';
  const base = `${name}.${ext}`;
  if (seen.has(base)) return base;
  seen.add(base);
  const r = await fetch(url);
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const tmp = join(tmpdir(), `mpp-fav-src.${ext}`);
  writeFileSync(tmp, buf);
  const dst = jpath(`${FAV_DIR}/${base}`);
  if (!resizeKeepFormat(tmp, dst)) writeFileSync(dst, buf);
  return base;
}

export async function updateFavorites(tok) {
  const players = readJson('data/players.json');
  mkdirSync(jpath(FAV_DIR), { recursive: true });
  const seen = new Set();
  const out = {};
  for (const p of players) {
    try {
      const j = await get(EP.championshipStats(p.uid), tok);
      const t = j.favorites?.selection, s = j.favorites?.player;
      const fav = {};
      if (t?.id) {
        fav.team = { name: t.name?.['fr-FR'] || t.name?.['en-GB'] || '', points: t.points ?? 0, eliminated: !!t.eliminated,
          img: t.imageUrl ? await fetchFavImage(t.imageUrl, `team-${t.id.split('_').pop()}`, seen) : null };
      }
      if (s?.id && (s.firstName || s.lastName)) {
        fav.scorer = { name: `${s.firstName || ''} ${s.lastName || ''}`.trim(), points: s.points ?? 0, eliminated: !!s.eliminated,
          img: s.imageUrl ? await fetchFavImage(s.imageUrl, `scorer-${s.id.split('_').pop()}`, seen) : null };
      }
      out[p.uid] = fav;
    } catch (e) { console.log(`  favoris ${p.name}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 40));
  }
  writeJson('data/favorites.json', out);
  console.log(`OK  favoris (${Object.keys(out).length} joueurs, ${seen.size} images → ${FAV_DIR}/)`);
}

async function main() {
  const tok = token();

  // 1) Standings → history (delta) + avatars
  const standingsRaw = await get(EP.standings, tok);
  const std = normalizeStandings(standingsRaw);
  const nextLabel = process.argv[2] || `J${Object.keys(readJson('data/history.json')).length + 1}`;
  writeJson('data/history.json', mergeHistory(readJson('data/history.json'), nextLabel, std.points));
  console.log(`OK  history ${nextLabel} (maxCalc=${std.maxCalc})`);
  await updateAvatars(standingsRaw);
  await updateFavorites(tok);

  // 2) Matchs (matchs courants + clubs + calendrier des phases)
  const [current, clubs, calendar] = await Promise.all([
    get(EP.matches, tok), get(EP.clubs, tok), get(EP.calendar, tok),
  ]);
  const matches = mapMatches(current, clubs, calendar);
  writeJson('data/matches.json', matches);
  console.log(`OK  matches (${matches.length})`);

  // 3) Pronos de tous les joueurs, match par match (séquentiel, léger délai)
  const matchesById = Object.fromEntries(matches.map((m) => [m.id, m]));
  const byMatchId = {};
  for (const m of matches) {
    try { byMatchId[m.id] = await get(EP.forecastsForMatch(m.id), tok); }
    catch (e) { console.log(`  pronos ${m.id}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 60));
  }
  writeJson('data/forecasts.json', mapForecasts(byMatchId, matchesById));
  console.log(`OK  forecasts (${Object.keys(byMatchId).length} matchs)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
