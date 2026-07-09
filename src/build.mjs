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

export function buildHtml({ players, history, matches, forecasts, bilan, echarts, appJs }) {
  const data = JSON.stringify({ players, history, matches, forecasts, bilan }).replace(/</g, '\\u003c');
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
    echarts: read('node_modules/echarts/dist/echarts.min.js'),
    appJs: read('src/app.js'),
  });
  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist/index.html'), html);
  console.log(`OK  dist/index.html  (${(html.length / 1024) | 0} Ko)`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
