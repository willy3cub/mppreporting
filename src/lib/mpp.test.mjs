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
