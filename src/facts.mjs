// Rassemble les faits d'une journée pour aider à écrire recap.json et bilan.json.
// Lecture seule (n'écrit rien) : sortie texte destinée au skill « maj-journee ».
// Usage : node src/facts.mjs
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rankStandings, computeDeltas } from './lib/compute.mjs';
import { computeAwards, topRareForecasts } from './lib/awards.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const API = 'https://api.mpp.football';
const HEADERS = {
  application: 'mppLfp', 'app-context': 'internationalEvent', 'client-version': '11.12.0',
  'client-language': 'fr-FR', platform: 'web', accept: 'application/json, text/plain, */*', origin: 'https://mpp.football',
};

function token() {
  if (process.env.MPP_TOKEN) return process.env.MPP_TOKEN.trim();
  const f = join(ROOT, '.mpp-token');
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : null;
}

const players = readJson('data/players.json');
const history = readJson('data/history.json');
const matches = readJson('data/matches.json');
const forecasts = readJson('data/forecasts.json');
const nameOf = Object.fromEntries(players.map((p) => [p.uid, p.name]));

function line(s = '') { console.log(s); }
function h(t) { line(); line(`### ${t}`); }

// 1) Mouvements au classement (deux derniers snapshots) -----------------
function classementFacts() {
  const labels = Object.keys(history);
  const cur = history[labels[labels.length - 1]];
  const prev = history[labels[labels.length - 2]] || cur;
  h(`CLASSEMENT — mouvements (${labels[labels.length - 2] || '?'} → ${labels[labels.length - 1]})`);
  const d = computeDeltas(cur, prev);
  const rows = rankStandings(cur).map((s) => ({ name: nameOf[s.uid], ...d[s.uid] }));
  for (const r of rows) {
    const mv = r.dr > 0 ? `▲${r.dr}` : r.dr < 0 ? `▼${-r.dr}` : '=';
    line(`${String(r.rankNow).padStart(2)}. ${r.name.padEnd(11)} ${String(r.pts).padStart(5)} pts  (+${r.dp}, ${mv})`);
  }
  const climbers = rows.filter((r) => r.dr > 0).sort((a, b) => b.dr - a.dr);
  const fallers = rows.filter((r) => r.dr < 0).sort((a, b) => a.dr - b.dr);
  const byDp = [...rows].sort((a, b) => b.dp - a.dp);
  line();
  line(`Leader : ${rows[0].name} (${rows[0].pts})`);
  if (climbers.length) line(`Plus grosse remontée : ${climbers[0].name} (${climbers[0].dr} places)`);
  if (fallers.length) line(`Plus grosse chute : ${fallers[0].name} (${fallers[0].dr} places)`);
  line(`Meilleur gain sur la journée : ${byDp[0].name} (+${byDp[0].dp})`);
  line(`Plus petit gain : ${byDp[byDp.length - 1].name} (+${byDp[byDp.length - 1].dp})`);
}

// 2) Matchs de la dernière journée + buteurs ----------------------------
async function matchFacts(tok) {
  const played = matches.filter((m) => m.status === 'played');
  if (!played.length) { h('MATCHS'); line('Aucun match joué.'); return; }
  const day = (d) => String(d).slice(0, 10);
  const latest = played.map((m) => day(m.date)).sort().pop();
  const dayMatches = played.filter((m) => day(m.date) === latest);
  h(`MATCHS DU ${latest} (${dayMatches.length})`);
  for (const m of dayMatches) {
    line(`\n${m.flag1} ${m.team1} ${m.score1}-${m.score2} ${m.team2} ${m.flag2}  [${m.phase}]`);
    if (!tok) { line('  (buteurs indisponibles : pas de token)'); continue; }
    try {
      const j = await (await fetch(`${API}/championship-match/${m.id}`, { headers: { ...HEADERS, authorization: `Bearer ${tok}` } })).json();
      const asArr = (x) => (Array.isArray(x) ? x : Object.values(x || {}));
      const pl = {};
      for (const side of ['home', 'away']) for (const p of asArr(j[side]?.players)) if (p && p.id) pl[p.id] = `${p.firstName || ''} ${p.lastName || ''}`.trim();
      if (j.stadiumName) line(`  Stade : ${j.stadiumName}${j.matchTime ? ` · ${j.matchTime}` : ''}`);
      const goals = (j.eventsTimeline || []).filter((e) => e.eventType === 'goal');
      for (const g of goals) {
        const who = pl[g.playerId] || g.playerId;
        const assist = g.assistProviderId ? ` (passe ${pl[g.assistProviderId] || '?'})` : '';
        const og = g.goalType && g.goalType !== 'goal' ? ` [${g.goalType}]` : '';
        line(`  ⚽ ${g.time} ${g.side === 'home' ? m.team1 : m.team2} — ${who}${assist}${og}  → ${g.score}`);
      }
      if (j.manOfTheMatch?.playerId) line(`  ★ Homme du match : ${pl[j.manOfTheMatch.playerId] || j.manOfTheMatch.playerId}`);
    } catch (e) { line(`  (erreur détail match : ${e.message})`); }
  }

  // 3) Pronos notables sur ces matchs
  h('PRONOS NOTABLES sur ces matchs');
  for (const m of dayMatches) {
    const rows = [];
    for (const p of players) {
      const pr = forecasts[p.uid]?.[m.id];
      if (!pr) continue;
      rows.push({ name: nameOf[p.uid], score: `${pr.score1}-${pr.score2}`, pts: pr.points ?? 0, result: pr.result, rarity: pr.rarity ?? 0 });
    }
    rows.sort((a, b) => b.pts - a.pts);
    line(`\n${m.team1}–${m.team2} (${m.score1}-${m.score2}) :`);
    const exacts = rows.filter((r) => r.result === 'exact');
    const zeros = rows.filter((r) => r.pts === 0);
    if (exacts.length) line(`  Exacts : ${exacts.map((r) => `${r.name} (${r.pts}pts${r.rarity ? `, rareté ${r.rarity}` : ''})`).join(', ')}`);
    else line('  Exacts : aucun');
    if (rows[0]) line(`  Meilleur : ${rows[0].name} ${rows[0].score} = ${rows[0].pts}pts`);
    if (zeros.length) line(`  0 point : ${zeros.map((r) => r.name).join(', ')}`);
  }
}

// 4) Superlatifs actuels ------------------------------------------------
function awardFacts() {
  h('SUPERLATIFS actuels');
  const LABELS = { sniper: 'Sniper (exacts)', serie: 'Série (matchs de suite avec pts)', kamikaze: 'Kamikaze (rareté moy.)',
    mouton: 'Mouton (suit le groupe)', visionnaire: 'Visionnaire (contre-courant juste)', carton: 'Carton (record journée)',
    frileux: 'Frileux (matchs à 0)', dernier: 'Dernier (prono tardif)' };
  const aw = computeAwards(players, matches, forecasts);
  for (const [k, label] of Object.entries(LABELS)) {
    const a = aw[k];
    if (!a || !a.uid || a.value === -Infinity) { line(`- ${label} : —`); continue; }
    const v = k === 'kamikaze' ? a.value.toFixed(2) : k === 'dernier' ? `${Math.round(a.value / 3600000)}h` : a.value;
    line(`- ${label} : ${nameOf[a.uid]} (${v})`);
  }
}

// 5) Pronos rares (top) -------------------------------------------------
function rareFacts() {
  h('PRONOS RARES (top 8)');
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  const top = topRareForecasts(matches, forecasts, players, 8);
  for (const r of top) {
    const m = byId[r.matchId];
    line(`- ${r.name} : ${r.score1}-${r.score2} sur ${m.team1}–${m.team2} (rareté ${r.rarity}, ${r.result})`);
  }
}

const tok = token();
line('# FAITS DE LA JOURNÉE — pour recap.json et bilan.json');
if (!tok) line('(⚠ pas de token : buteurs des matchs indisponibles)');
classementFacts();
await matchFacts(tok);
awardFacts();
rareFacts();
line('\n# Fin des faits.');
