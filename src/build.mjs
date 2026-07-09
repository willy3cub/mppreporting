import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

export function buildHtml({ players, history, matches, forecasts, bilan, echarts, appJs }) {
  const data = JSON.stringify({ players, history, matches, forecasts, bilan }).replace(/</g, '\\u003c');
  return read('src/template.html')
    .replace('/*__ECHARTS__*/', () => echarts)
    .replace('/*__DATA__*/', () => data)
    .replace('/*__APP__*/', () => appJs);
}

export function build() {
  const html = buildHtml({
    players: readJson('data/players.json'),
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
