# Données réelles MPP + 4 features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Remplacer les fixtures par les vraies données MPP (matchs, résultats, pronos des 16) et ajouter 4 features : comparateur 1v1, carte joueur partageable, superlatifs/trophées, pronos rares.

**Architecture:** Logique pure et testée dans `src/lib/mpp.mjs` (mapping API→data) et `src/lib/awards.mjs` (calculs features). `src/fetch.mjs` orchestre les appels HTTP et écrit `data/*.json`. Le front (`src/app.js` + `src/template.html`) ajoute 4 sections. Build inchangé (`dist/index.html` auto-suffisant).

**Tech Stack:** Node 24 ESM, `node --test`, ECharts inliné, vanilla JS.

## Global Constraints
- Réf. endpoints/shapes : `docs/mpp-api.md`. Base `https://api.mpp.football`, challenge `mpp_challenge_UDMSMC8T`, championship `8`.
- En-têtes API obligatoires : `authorization: Bearer <token>`, `application: mppLfp`, `app-context: internationalEvent`, `client-version: 11.12.0`, `client-language: fr-FR`, `platform: web`, `accept: application/json, text/plain, */*`, `origin: https://mpp.football`. Token lu depuis `.mpp-token` (gitignoré) — **jamais commité**.
- Page reste **auto-suffisante** (aucune requête réseau au chargement ; pas de librairie externe, y compris pour l'export image → SVG→canvas natif).
- Schémas data : matchs `{id, gameWeek, phase, date, team1, flag1, team2, flag2, score1, score2, status}` ; pronos `{score1, score2, points, result, rarity, editedAt}`. Champs existants conservés (rétro-compat `compute.mjs`).
- Tests `node --test` + `node:assert/strict`. Commits en français, **sans** `Co-Authored-By`. `dist/index.html` commité.
- Accessibilité : jamais l'info par la seule couleur ; contrastes suffisants ; thème « stade nocturne ».

---

## File Structure
| Fichier | Rôle |
|---|---|
| `src/lib/mpp.mjs` (+ `.test.mjs`) | Mapping pur API→data (phases, drapeaux, matchs, pronos) |
| `src/lib/awards.mjs` (+ `.test.mjs`) | Calculs features (comparateur, superlatifs, pronos rares) |
| `src/fetch.mjs` | Orchestration HTTP + écriture `data/*.json` (modifié) |
| `src/app.js` | + sections compare / card / awards / rares (modifié) |
| `src/template.html` | + CSS des nouvelles sections (modifié) |
| `data/{matches,forecasts,history,players}.json` | Données réelles (regénérées) |

---

## Task 1: `src/lib/mpp.mjs` — mappers purs (TDD)

**Files:** Create `src/lib/mpp.mjs`, `src/lib/mpp.test.mjs`

**Interfaces produced:**
- `phaseFor(roundType)` → string
- `flagFor(name)` → string (emoji ou "")
- `matchStatus(period)` → "played"|"pending"
- `resultOf(prono, match)` → "exact"|"result"|"miss"|"pending"
- `mapMatches(currentMatches, clubs, calendar)` → `Array<match>` trié par date
- `mapForecasts(byMatchId)` → `{ uid: { matchId: {score1,score2,points,result,rarity,editedAt} } }` (nécessite les matchs pour `result` → signature réelle : `mapForecasts(byMatchId, matchesById)`)

- [ ] **Step 1: Tests (échouent)**

Create `src/lib/mpp.test.mjs` :
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { phaseFor, flagFor, matchStatus, resultOf, mapMatches, mapForecasts } from './mpp.mjs';

test('phaseFor mappe les roundType', () => {
  assert.equal(phaseFor('round'), 'Poules');
  assert.equal(phaseFor('roundOf32'), '16es');
  assert.equal(phaseFor('roundOf16'), '8es');
  assert.equal(phaseFor('quarterFinals'), 'Quarts');
  assert.equal(phaseFor('semiFinals'), 'Demies');
  assert.equal(phaseFor('thirdAndFourthPlace'), 'Petite finale');
  assert.equal(phaseFor('final'), 'Finale');
  assert.equal(phaseFor('???'), 'Poules'); // fallback
});

test('flagFor connaît les nations et retombe sur ""', () => {
  assert.equal(flagFor('France'), '🇫🇷');
  assert.equal(flagFor('Argentine'), '🇦🇷');
  assert.equal(flagFor('Paysinconnu'), '');
});

test('matchStatus', () => {
  assert.equal(matchStatus('fullTime'), 'played');
  assert.equal(matchStatus('notStarted'), 'pending');
  assert.equal(matchStatus(undefined), 'pending');
});

test('resultOf: exact/result/miss/pending', () => {
  const m = { score1: 2, score2: 1, status: 'played' };
  assert.equal(resultOf({ score1: 2, score2: 1 }, m), 'exact');
  assert.equal(resultOf({ score1: 3, score2: 1 }, m), 'result');
  assert.equal(resultOf({ score1: 0, score2: 2 }, m), 'miss');
  assert.equal(resultOf({ score1: 2, score2: 1 }, { ...m, status: 'pending' }), 'pending');
});

test('mapMatches construit les matchs triés par date avec phase et drapeaux', () => {
  const clubs = { championshipClubs: {
    c1: { name: { 'fr-FR': 'France' } }, c2: { name: { 'fr-FR': 'Maroc' } },
    c3: { name: { 'fr-FR': 'Argentine' } }, c4: { name: { 'fr-FR': 'Égypte' } },
  } };
  const calendar = { gameWeeks: { '6': { roundType: 'quarterFinals' }, '1': { roundType: 'round' } } };
  const current = {
    mB: { matchId: 'mB', gameWeekNumber: 6, date: '2026-07-10T20:00:00Z', period: undefined,
          home: { clubId: 'c1', score: null }, away: { clubId: 'c2', score: null } },
    mA: { matchId: 'mA', gameWeekNumber: 1, date: '2026-06-11T19:00:00Z', period: 'fullTime',
          home: { clubId: 'c3', score: 3 }, away: { clubId: 'c4', score: 2 } },
  };
  const out = mapMatches(current, clubs, calendar);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 'mA'); // trié par date
  assert.deepEqual(
    { team1: out[0].team1, flag1: out[0].flag1, team2: out[0].team2, flag2: out[0].flag2,
      score1: out[0].score1, score2: out[0].score2, status: out[0].status, phase: out[0].phase, gameWeek: out[0].gameWeek },
    { team1: 'Argentine', flag1: '🇦🇷', team2: 'Égypte', flag2: '🇪🇬', score1: 3, score2: 2, status: 'played', phase: 'Poules', gameWeek: 1 });
  assert.equal(out[1].status, 'pending');
});

test('mapForecasts mappe uid→match→prono avec result et rarity', () => {
  const matchesById = { mA: { id: 'mA', score1: 3, score2: 2, status: 'played' } };
  const byMatchId = { mA: {
    u1: { homeScore: 3, awayScore: 2, editedAt: 'T1', points: { total: 69, rarityLevel: 3 } },
    u2: { homeScore: 1, awayScore: 0, editedAt: 'T2', points: { total: 16, rarityLevel: 0 } },
  } };
  const out = mapForecasts(byMatchId, matchesById);
  assert.deepEqual(out.u1.mA, { score1: 3, score2: 2, points: 69, result: 'exact', rarity: 3, editedAt: 'T1' });
  assert.equal(out.u2.mA.result, 'result'); // 1-0 même issue que 3-2
});
```

- [ ] **Step 2: Lancer → échec** — `node --test src/lib/mpp.test.mjs` (module absent).

- [ ] **Step 3: Implémenter `src/lib/mpp.mjs`**
```js
const PHASES = {
  round: 'Poules', roundOf32: '16es', roundOf16: '8es',
  quarterFinals: 'Quarts', semiFinals: 'Demies',
  thirdAndFourthPlace: 'Petite finale', final: 'Finale',
};
export function phaseFor(roundType) { return PHASES[roundType] || 'Poules'; }

// Nations CDM 2026 (fr-FR) → emoji. Complété à l'implémentation avec les noms réels
// renvoyés par championship-clubs (voir data). Fallback "".
const FLAGS = {
  'France': '🇫🇷', 'Argentine': '🇦🇷', 'Maroc': '🇲🇦', 'Égypte': '🇪🇬', 'Suisse': '🇨🇭',
  'Colombie': '🇨🇴', 'Brésil': '🇧🇷', 'Espagne': '🇪🇸', 'Angleterre': '🏴', 'Portugal': '🇵🇹',
  'Allemagne': '🇩🇪', 'Pays-Bas': '🇳🇱', 'Italie': '🇮🇹', 'Belgique': '🇧🇪', 'Croatie': '🇭🇷',
  'Uruguay': '🇺🇾', 'États-Unis': '🇺🇸', 'Mexique': '🇲🇽', 'Canada': '🇨🇦', 'Japon': '🇯🇵',
  'Corée du Sud': '🇰🇷', 'Sénégal': '🇸🇳', 'Nigeria': '🇳🇬', 'Ghana': '🇬🇭', 'Cameroun': '🇨🇲',
  'Australie': '🇦🇺', 'Danemark': '🇩🇰', 'Serbie': '🇷🇸', 'Pologne': '🇵🇱', 'Suède': '🇸🇪',
  'Équateur': '🇪🇨', 'Pérou': '🇵🇪', 'Chili': '🇨🇱', 'Tunisie': '🇹🇳', 'Algérie': '🇩🇿',
  'Côte d’Ivoire': '🇨🇮', 'Autriche': '🇦🇹', 'Norvège': '🇳🇴', 'Écosse': '🏴', 'Turquie': '🇹🇷',
  'Iran': '🇮🇷', 'Arabie saoudite': '🇸🇦', 'Qatar': '🇶🇦', 'Ukraine': '🇺🇦', 'Grèce': '🇬🇷',
  'Paraguay': '🇵🇾', 'Costa Rica': '🇨🇷', 'Panama': '🇵🇦',
};
export function flagFor(name) { return FLAGS[name] || ''; }

export function matchStatus(period) { return period === 'fullTime' ? 'played' : 'pending'; }

function outcome(a, b) { return a > b ? '1' : a < b ? '2' : 'N'; }
export function resultOf(prono, match) {
  if (!prono || !match || match.status !== 'played') return 'pending';
  if (prono.score1 === match.score1 && prono.score2 === match.score2) return 'exact';
  if (outcome(prono.score1, prono.score2) === outcome(match.score1, match.score2)) return 'result';
  return 'miss';
}

export function mapMatches(currentMatches, clubs, calendar) {
  const cc = clubs.championshipClubs || {};
  const name = (id) => cc[id]?.name?.['fr-FR'] || cc[id]?.shortName || id;
  const rt = (gw) => calendar?.gameWeeks?.[gw]?.roundType;
  return Object.values(currentMatches).map((m) => {
    const t1 = name(m.home.clubId), t2 = name(m.away.clubId);
    return {
      id: m.matchId, gameWeek: m.gameWeekNumber, phase: phaseFor(rt(m.gameWeekNumber)),
      date: m.date, team1: t1, flag1: flagFor(t1), team2: t2, flag2: flagFor(t2),
      score1: m.home?.score ?? null, score2: m.away?.score ?? null, status: matchStatus(m.period),
    };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function mapForecasts(byMatchId, matchesById) {
  const out = {};
  for (const [matchId, byUid] of Object.entries(byMatchId)) {
    const match = matchesById[matchId];
    for (const [uid, f] of Object.entries(byUid)) {
      const prono = { score1: f.homeScore, score2: f.awayScore };
      (out[uid] ||= {})[matchId] = {
        score1: f.homeScore, score2: f.awayScore,
        points: f.points?.total ?? 0, result: resultOf(prono, match),
        rarity: f.points?.rarityLevel ?? 0, editedAt: f.editedAt ?? null,
      };
    }
  }
  return out;
}
```

- [ ] **Step 4: Lancer → succès** (`node --test src/lib/mpp.test.mjs`, 6/6).
- [ ] **Step 5: Commit** — `git commit -m "mpp: mappers purs API→data (phases, drapeaux, matchs, pronos)"`

---

## Task 2: Câbler `src/fetch.mjs` sur l'API réelle

**Files:** Modify `src/fetch.mjs`

**Interfaces consumed:** `mpp.mjs` (mapMatches, mapForecasts), merge helpers existants.

Contexte : `src/fetch.mjs` a déjà `normalizeStandings`, `mergeHistory`, `token()`, `get()`. On étend `main()` et `get()` (en-têtes complets) pour produire les 4 fichiers.

- [ ] **Step 1: Ajouter les en-têtes requis dans `get()`**
Remplacer l'objet headers de `get()` par :
```js
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
```

- [ ] **Step 2: Constantes d'endpoints**
```js
const CH = 'mpp_challenge_UDMSMC8T';
const EP = {
  standings: `${API}/challenge-standings/users-standings?challengeId=${CH}&offset=0&limit=20`,
  matches: `${API}/championships-current-matches`,
  clubs: `${API}/championship-clubs`,
  calendar: `${API}/championship-calendar/8`,
  forecastsForMatch: (mid) => `${API}/user-match-forecasts/contest/${CH}/match/${mid}`,
};
```

- [ ] **Step 3: Étendre `main()`**
```js
import { mapMatches, mapForecasts } from './lib/mpp.mjs';
// ...
async function main() {
  const tok = token();
  // 1) Standings → history (delta) + players enrichis
  const std = normalizeStandings(await get(EP.standings, tok));
  const nextLabel = process.argv[2] || `J${Object.keys(readJson('data/history.json')).length + 1}`;
  writeJson('data/history.json', mergeHistory(readJson('data/history.json'), nextLabel, std.points));
  console.log(`OK history ${nextLabel} (maxCalc=${std.maxCalc})`);

  // 2) Matchs
  const [current, clubs, calendar] = await Promise.all([
    get(EP.matches, tok), get(EP.clubs, tok), get(EP.calendar, tok),
  ]);
  const matches = mapMatches(current, clubs, calendar);
  writeJson('data/matches.json', matches);
  console.log(`OK matches (${matches.length})`);

  // 3) Pronos de tous les joueurs, match par match (séquentiel, léger délai)
  const matchesById = Object.fromEntries(matches.map((m) => [m.id, m]));
  const byMatchId = {};
  for (const m of matches) {
    try { byMatchId[m.id] = await get(EP.forecastsForMatch(m.id), tok); }
    catch (e) { console.log(`  pronos ${m.id}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 60));
  }
  writeJson('data/forecasts.json', mapForecasts(byMatchId, matchesById));
  console.log(`OK forecasts (${Object.keys(byMatchId).length} matchs)`);
}
```
> Note : `normalizeStandings` renvoie `{points, maxCalc}` (déjà testé Task 12 du plan initial). Les tests unitaires de merge restent valides ; l'appel réseau réel est validé au Step 4.

- [ ] **Step 4: Vérifier les tests existants** — `node --test` (les tests de `fetch.test.mjs` sur les merges doivent toujours passer ; ne pas casser leurs imports).
Run: `node --test` → tout vert.

- [ ] **Step 5: Commit** — `git commit -m "fetch: câblage API réelle (standings, matchs, clubs, calendrier, pronos)"`

---

## Task 3: Récupérer les vraies données et rebuild

**Files:** `data/*.json`, `dist/index.html` (regénérés)

Prérequis : `.mpp-token` présent et valide (déjà en place).

- [ ] **Step 1: Lancer le fetch réel**
Run: `node src/fetch.mjs J23`
Expected: `OK history J23 …`, `OK matches (100)`, `OK forecasts (100 matchs)`. Si 401 → rafraîchir `.mpp-token`.

- [ ] **Step 2: Vérifs de cohérence**
```bash
node -e "const m=require('./data/matches.json');console.log('matchs',m.length,'joués',m.filter(x=>x.status==='played').length);const f=require('./data/forecasts.json');console.log('joueurs avec pronos',Object.keys(f).length)"
```
Expected : ~100 matchs, ~96 joués, 16 joueurs. Vérifier qu'aucun `team1/team2` n'est un id brut (`mpp_championship_club_…`) — sinon compléter la table `FLAGS`/noms.

- [ ] **Step 3: Rebuild + tests** — `npm run build && node --test` (tout vert).
- [ ] **Step 4: Commit** — `git add data/ dist/index.html && git commit -m "data: données réelles CDM 2026 (matchs, résultats, pronos des 16)"`

---

## Task 4: `src/lib/awards.mjs` — logique des features (TDD)

**Files:** Create `src/lib/awards.mjs`, `src/lib/awards.test.mjs`

**Interfaces produced:**
- `headToHead(uidA, uidB, history)` → `{ ptsA, ptsB, journeesDevantA, journeesDevantB, journees }`
- `groupConsensus(matchId, forecasts)` → `{ score1, score2, count, total } | null` (score le + fréquent)
- `topRareForecasts(matches, forecasts, players, n)` → `Array<{uid, name, matchId, score1, score2, rarity}>` (pronos justes triés rareté desc)
- `computeAwards(players, matches, forecasts)` → `{ sniper, serie, kamikaze, mouton, visionnaire, carton, frileux, dernier }`, chaque valeur `{ uid, value, detail }` (ou null si indéterminable)

- [ ] **Step 1: Tests (échouent)** — Create `src/lib/awards.test.mjs` :
```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { headToHead, groupConsensus, topRareForecasts, computeAwards } from './awards.mjs';

const history = { J1: { a: 10, b: 5 }, J2: { a: 20, b: 40 } };

test('headToHead compte points et journées devant', () => {
  const h = headToHead('a', 'b', history);
  assert.equal(h.ptsA, 20); assert.equal(h.ptsB, 40);
  assert.equal(h.journeesDevantA, 1); // J1 a>b
  assert.equal(h.journeesDevantB, 1); // J2 b>a
  assert.equal(h.journees, 2);
});

test('groupConsensus renvoie le score le plus fréquent', () => {
  const forecasts = { a: { m1: { score1: 1, score2: 0 } }, b: { m1: { score1: 1, score2: 0 } }, c: { m1: { score1: 2, score2: 2 } } };
  const gc = groupConsensus('m1', forecasts);
  assert.deepEqual({ s1: gc.score1, s2: gc.score2, count: gc.count }, { s1: 1, s2: 0, count: 2 });
});

test('topRareForecasts ne garde que les pronos justes, triés par rareté', () => {
  const matches = [{ id: 'm1', status: 'played' }, { id: 'm2', status: 'played' }];
  const players = [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }];
  const forecasts = {
    a: { m1: { score1: 3, score2: 2, result: 'exact', rarity: 5 }, m2: { score1: 0, score2: 1, result: 'miss', rarity: 9 } },
    b: { m1: { score1: 1, score2: 0, result: 'result', rarity: 2 } },
  };
  const top = topRareForecasts(matches, forecasts, players, 10);
  assert.equal(top.length, 2);         // le miss (rarity 9) est exclu
  assert.equal(top[0].uid, 'a');       // rarity 5 en tête
  assert.equal(top[0].rarity, 5);
});

test('computeAwards: sniper = plus de scores exacts', () => {
  const players = [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }];
  const matches = [{ id: 'm1', gameWeek: 1, status: 'played' }, { id: 'm2', gameWeek: 1, status: 'played' }];
  const forecasts = {
    a: { m1: { result: 'exact', points: 60, rarity: 3, editedAt: '2026-06-11T05:00:00Z' }, m2: { result: 'exact', points: 60, rarity: 2, editedAt: '2026-06-11T05:00:00Z' } },
    b: { m1: { result: 'miss', points: 0, rarity: 0, editedAt: '2026-06-11T05:00:00Z' }, m2: { result: 'result', points: 16, rarity: 0, editedAt: '2026-06-11T05:00:00Z' } },
  };
  const aw = computeAwards(players, matches, forecasts);
  assert.equal(aw.sniper.uid, 'a');
  assert.equal(aw.sniper.value, 2);
  assert.equal(aw.frileux.uid, 'b'); // b a 1 match à 0 pt
});
```

- [ ] **Step 2: Lancer → échec.**

- [ ] **Step 3: Implémenter `src/lib/awards.mjs`** (fonctions pures) :
```js
export function headToHead(uidA, uidB, history) {
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

export function groupConsensus(matchId, forecasts) {
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

export function topRareForecasts(matches, forecasts, players, n = 10) {
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

export function computeAwards(players, matches, forecasts) {
  const uids = players.map((p) => p.uid);
  const played = matches.filter((m) => m.status === 'played');
  const byGw = {};
  for (const m of played) (byGw[m.gameWeek] ||= []).push(m.id);

  // consensus par match (pour mouton / visionnaire)
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
    // meilleur total sur une journée
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
```

- [ ] **Step 4: Lancer → succès** (`node --test src/lib/awards.test.mjs`).
- [ ] **Step 5: Commit** — `git commit -m "awards: comparateur, superlatifs, pronos rares (logique pure testée)"`

---

## Task 5: Section Comparateur 1v1 (UI)

**Files:** Modify `src/app.js`, `src/template.html`

**Consumes:** `headToHead` (réimplémenté localement en classic script), `window.__WC.history/players`, ECharts.

- [ ] **Step 1** : Ajouter dans `initApp()` (après la section classement) une section `#compare` :
  - un titre « ⚔️ Duel », 2 `<select>` (`#cmpA`, `#cmpB`) peuplés des joueurs, un bouton « ⇄ ».
  - un conteneur `#cmpChart` (hauteur 300) et un `#cmpTable`.
- [ ] **Step 2** : `renderCompare()` + `updateCompare()` :
  - graphe ECharts (2 séries points cumulés des joueurs A/B, couleurs joueurs, tooltip axis, légende).
  - tableau face-à-face : points totaux (dernière journée), nb scores exacts (depuis forecasts), nb bons, « X journées devant / Y » via un `headToHead` local.
  - le bouton ⇄ échange A/B ; changement de select → `updateCompare()`.
- [ ] **Step 3** : CSS `.cmp-*` (2 colonnes, accent couleur de chaque joueur), cohérent thème.
- [ ] **Step 4** : `npm run build` ; `node --test` (vert) ; vérif structurelle (`#compare`, `#cmpA/#cmpB`, `#cmpChart`) dans `dist/index.html`.
- [ ] **Step 5** : Commit `"page: section comparateur 1v1"`.

---

## Task 6: Carte joueur partageable (UI + export image)

**Files:** Modify `src/app.js`, `src/template.html`

**Consumes:** `window.__WC` (players, history, matches, forecasts), stats joueur (réutilise la logique de `viewJoueur`).

- [ ] **Step 1** : `renderPlayerCard(uid)` : ouvre une carte (modale ou section `#card`) avec avatar (`player.avatarUrl` si présent, sinon pastille couleur), rang, points, % exacts, meilleur/pire prono, et les badges gagnés par ce joueur (depuis `computeAwards`, réutilisée globalement une fois). Deux boutons : **Copier le lien** (`navigator.clipboard.writeText(location.origin+location.pathname+'?joueur='+encodeURIComponent(name))`) et **Télécharger l'image**.
- [ ] **Step 2** : Export image **sans dépendance** : construire une chaîne **SVG** (largeur 640, hauteur ~360) reprenant les infos de la carte (texte, couleurs) → `new Image()` avec `src = 'data:image/svg+xml;utf8,'+encodeURIComponent(svg)` → `drawImage` sur un `<canvas>` 640×360 → `canvas.toBlob` → lien de téléchargement `carte-<name>.png`. Aucune donnée envoyée (tout local). (Note : n'inclure dans le SVG que du texte/formes, pas l'avatar distant, pour éviter le canvas « tainted ».)
- [ ] **Step 3** : Deep link : dans `initApp()`, lire `new URLSearchParams(location.search).get('joueur')` ; si présent et correspond à un joueur, ouvrir sa carte au chargement.
- [ ] **Step 4** : CSS `.card-*` (thème nuit, glow couleur joueur). Un clic sur un nom de joueur (classement / grille) ouvre la carte.
- [ ] **Step 5** : `npm run build` ; `node --test` ; vérif structurelle (`renderPlayerCard`, `?joueur`, `toBlob`) + noter la vérif visuelle/téléchargement déférée au contrôleur.
- [ ] **Step 6** : Commit `"page: carte joueur partageable (lien + export PNG local)"`.

---

## Task 7: Section Superlatifs / trophées (UI)

**Files:** Modify `src/app.js`, `src/template.html`

**Consumes:** `computeAwards(players, matches, forecasts)` (réimplémenté localement OU exposé — voir note).

> Note : `awards.mjs` est un module ESM testé (Node). `app.js` étant un `<script>` classique, on
> **réimplémente `computeAwards` et helpers en local dans app.js** (comme `compute.mjs`↔app.js),
> périmètre assumé. La version testée reste la référence de comportement.

- [ ] **Step 1** : Section `#awards` : une grille de 8 cartes-badge. Table des libellés :
  `sniper` 🎯 « Le Sniper » (scores exacts) · `serie` 🔥 « La Série » (matchs d'affilée avec points) · `kamikaze` 🃏 « Le Kamikaze » (scores les + rares) · `mouton` 🐑 « Le Mouton » (suit le groupe) · `visionnaire` 🧠 « Le Visionnaire » (juste à contre-courant) · `carton` 💥 « Le Carton » (record sur une journée) · `frileux` 🧊 « Le Frileux » (matchs à 0 pt) · `dernier` ⏱️ « Le Dernier » (pronos tardifs).
- [ ] **Step 2** : `renderAwards()` : chaque badge = emoji + titre + nom du joueur (couleur joueur) + valeur/detail. Gérer `null` (afficher « — »).
- [ ] **Step 3** : CSS `.badge-*` (cartes, glow, responsive grille).
- [ ] **Step 4** : `npm run build` ; `node --test` ; vérif structurelle (`#awards`, les 8 clés).
- [ ] **Step 5** : Commit `"page: section superlatifs / trophées"`.

---

## Task 8: Section Pronos rares (UI)

**Files:** Modify `src/app.js`, `src/template.html`

**Consumes:** `topRareForecasts`, `groupConsensus` (réimplémentés localement), matches/forecasts/players.

- [ ] **Step 1** : Section `#rares` :
  - **Top pronos rares** : liste des ~10 pronos justes au plus haut `rarity` → « <Joueur> a osé <flag1> <score> <flag2> sur <match> » avec pastille exact/result.
  - **Consensus vs réalité** : pour les matchs joués, afficher le score consensus du groupe vs le vrai score, en épinglant ceux où le groupe s'est trompé (consensus ≠ résultat).
- [ ] **Step 2** : `renderRares()` (listes rendues depuis les helpers locaux).
- [ ] **Step 3** : CSS `.rare-*`.
- [ ] **Step 4** : Ajouter les ancres nav manquantes (`#compare`, `#awards`, `#rares`) dans la nav sticky, et **appeler `initNavScrollSpy()` en dernier** (après toutes les sections).
- [ ] **Step 5** : `npm run build` ; `node --test` ; vérif structurelle.
- [ ] **Step 6** : Commit `"page: section pronos rares + nav complétée"`.

---

## Notes d'exécution
- Ordre : 1→2→3 (données réelles d'abord), puis 4 (logique features), puis 5→8 (UI). La vérif visuelle Chrome finale valide l'ensemble.
- `app.js` (classic script) réimplémente localement la logique testée de `mpp.mjs`/`awards.mjs`/`compute.mjs` — périmètre assumé (pas de bundler).
- Après Task 8 : revue finale whole-branch + finishing-a-development-branch.
