import test from 'node:test';
import assert from 'node:assert/strict';
import { rankStandings, ranksOf, computeDeltas, labelsOf, seriesPoints, seriesRanks, forecastStatus, outcome, playerStats } from './compute.mjs';

test('rankStandings trie par points décroissants et numérote', () => {
  const out = rankStandings({ a: 100, b: 300, c: 200 });
  assert.deepEqual(out, [
    { uid: 'b', pts: 300, rank: 1 },
    { uid: 'c', pts: 200, rank: 2 },
    { uid: 'a', pts: 100, rank: 3 },
  ]);
});

test('ranksOf renvoie un rang par uid', () => {
  assert.deepEqual(ranksOf({ a: 100, b: 300, c: 200 }), { b: 1, c: 2, a: 3 });
});

test('computeDeltas calcule dp et dr (dr>0 = monte)', () => {
  const prev = { a: 100, b: 300, c: 200 }; // rangs: b1 c2 a3
  const cur  = { a: 400, b: 320, c: 210 }; // rangs: a1 b2 c3
  const d = computeDeltas(cur, prev);
  assert.equal(d.a.dp, 300);
  assert.equal(d.a.rankPrev, 3);
  assert.equal(d.a.rankNow, 1);
  assert.equal(d.a.dr, 2);      // 3 -> 1 : +2 places
  assert.equal(d.b.dr, -1);     // 1 -> 2 : -1 place
});

const HIST = {
  J1: { a: 10, b: 20 },
  J2: { a: 50, b: 30 },
};

test('labelsOf conserve l\'ordre', () => {
  assert.deepEqual(labelsOf(HIST), ['J1', 'J2']);
});

test('seriesPoints aligne les points par journee', () => {
  assert.deepEqual(seriesPoints(HIST, ['a', 'b']), { a: [10, 50], b: [20, 30] });
});

test('seriesRanks donne le rang par journee', () => {
  // J1: b(20)=1, a(10)=2 | J2: a(50)=1, b(30)=2
  assert.deepEqual(seriesRanks(HIST, ['a', 'b']), { a: [2, 1], b: [1, 2] });
});

test('seriesPoints met null si le joueur manque une journee', () => {
  const h = { J1: { a: 10 }, J2: { a: 20, b: 5 } };
  assert.deepEqual(seriesPoints(h, ['a', 'b']), { a: [10, 20], b: [null, 5] });
});

test('outcome donne l\'issue', () => {
  assert.equal(outcome(2, 0), '1');
  assert.equal(outcome(1, 1), 'N');
  assert.equal(outcome(0, 3), '2');
});

test('forecastStatus: exact / result / miss / pending', () => {
  const m = { score1: 2, score2: 1, status: 'played' };
  assert.equal(forecastStatus({ score1: 2, score2: 1 }, m), 'exact');
  assert.equal(forecastStatus({ score1: 3, score2: 1 }, m), 'result');
  assert.equal(forecastStatus({ score1: 0, score2: 2 }, m), 'miss');
  assert.equal(forecastStatus({ score1: 2, score2: 1 }, { ...m, status: 'pending' }), 'pending');
  assert.equal(forecastStatus(null, m), 'pending');
});

test('playerStats agrège les pronos joués', () => {
  const matches = [
    { id: 'm1', score1: 2, score2: 1, status: 'played' },
    { id: 'm2', score1: 0, score2: 0, status: 'played' },
    { id: 'm3', score1: 1, score2: 1, status: 'pending' },
  ];
  const forecasts = { u: {
    m1: { score1: 2, score2: 1, points: 24 }, // exact
    m2: { score1: 1, score2: 2, points: 0 },  // miss
    m3: { score1: 1, score2: 1, points: 0 },  // pending (match non joué)
  } };
  const s = playerStats('u', forecasts, matches);
  assert.equal(s.played, 2);
  assert.equal(s.exact, 1);
  assert.equal(s.miss, 1);
  assert.equal(s.points, 24);
  assert.equal(s.best.matchId, 'm1');
  assert.equal(s.exactRate, 0.5);
});
