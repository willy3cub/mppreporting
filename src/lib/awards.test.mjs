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
