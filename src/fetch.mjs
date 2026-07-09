import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHALLENGE = 'mpp_challenge_UDMSMC8T';
const API = 'https://api.mpp.football';
const EP_STANDINGS = `${API}/challenge-standings/users-standings?challengeId=${CHALLENGE}&offset=0&limit=20`;
// À renseigner après découverte devtools (cf. étape préalable) :
const EP_MATCHES = null;   // ex: `${API}/...`
const EP_FORECASTS = null; // ex: `${API}/...`

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
async function get(url, tok) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (r.status === 401) throw new Error('401 : token MPP expiré, le rafraîchir.');
  if (!r.ok) throw new Error(`${r.status} sur ${url}`);
  return r.json();
}

async function main() {
  const tok = token();
  const nextLabel = process.argv[2] || `J${Object.keys(readJson('data/history.json')).length + 1}`;

  const std = normalizeStandings(await get(EP_STANDINGS, tok));
  writeJson('data/history.json', mergeHistory(readJson('data/history.json'), nextLabel, std.points));
  console.log(`OK  history ${nextLabel} (maxCalc=${std.maxCalc})`);

  if (EP_MATCHES) {
    const raw = await get(EP_MATCHES, tok);
    // TODO découverte : mapper raw → [{id,phase,date,team1,flag1,team2,flag2,score1,score2,status}]
    // writeJson('data/matches.json', mergeById(readJson('data/matches.json'), mapped, 'id'));
  } else console.log('… EP_MATCHES non renseigné (voir étape de découverte)');

  if (EP_FORECASTS) {
    const raw = await get(EP_FORECASTS, tok);
    // TODO découverte : mapper raw → {uid:{matchId:{score1,score2,points,result}}}
    // writeJson('data/forecasts.json', mergeForecasts(readJson('data/forecasts.json'), mapped));
  } else console.log('… EP_FORECASTS non renseigné (voir étape de découverte)');
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
