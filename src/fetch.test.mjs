import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistory, mergeById, mergeForecasts, normalizeStandings } from './fetch.mjs';

test('mergeHistory ajoute/réécrit une journée (idempotent)', () => {
  const h0 = { J1: { a: 10 } };
  const h1 = mergeHistory(h0, 'J2', { a: 20, b: 5 });
  assert.deepEqual(h1.J2, { a: 20, b: 5 });
  const h2 = mergeHistory(h1, 'J2', { a: 21, b: 5 }); // rejoue J2
  assert.deepEqual(h2.J2, { a: 21, b: 5 });
  assert.equal(Object.keys(h2).length, 2);
});

test('mergeById remplace par id et ajoute les nouveaux', () => {
  const cur = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
  const inc = [{ id: 'b', v: 9 }, { id: 'c', v: 3 }];
  assert.deepEqual(mergeById(cur, inc, 'id'), [{ id: 'a', v: 1 }, { id: 'b', v: 9 }, { id: 'c', v: 3 }]);
});

test('mergeForecasts fusionne par joueur puis par match', () => {
  const cur = { u: { m1: { score1: 1, score2: 0, points: 16 } } };
  const inc = { u: { m2: { score1: 2, score2: 2, points: 0 } }, v: { m1: { score1: 0, score2: 0, points: 8 } } };
  const out = mergeForecasts(cur, inc);
  assert.equal(out.u.m1.points, 16);
  assert.equal(out.u.m2.score1, 2);
  assert.equal(out.v.m1.points, 8);
});

test('normalizeStandings extrait uid→points et maxCalc', () => {
  const api = { standings: [
    { user: { id: 'user_1' }, ranking: { points: 100, calculatedForecasts: 5 } },
    { user: { id: 'user_2' }, ranking: { points: 80, calculatedForecasts: 4 } },
  ] };
  const { points, maxCalc } = normalizeStandings(api);
  assert.deepEqual(points, { user_1: 100, user_2: 80 });
  assert.equal(maxCalc, 5);
});
