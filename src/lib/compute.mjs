export function rankStandings(points) {
  return Object.entries(points)
    .sort((a, b) => b[1] - a[1])
    .map(([uid, pts], i) => ({ uid, pts, rank: i + 1 }));
}

export function ranksOf(points) {
  const out = {};
  for (const { uid, rank } of rankStandings(points)) out[uid] = rank;
  return out;
}

export function computeDeltas(current, previous) {
  const rNow = ranksOf(current);
  const rPrev = ranksOf(previous);
  const out = {};
  for (const [uid, pts] of Object.entries(current)) {
    const rankNow = rNow[uid];
    const rankPrev = rPrev[uid] ?? rankNow;
    out[uid] = {
      pts,
      dp: pts - (previous[uid] ?? 0),
      rankNow,
      rankPrev,
      dr: rankPrev - rankNow,
    };
  }
  return out;
}

export function labelsOf(history) {
  return Object.keys(history);
}

export function seriesPoints(history, uids) {
  const labels = labelsOf(history);
  const out = {};
  for (const uid of uids) {
    out[uid] = labels.map((l) => (uid in history[l] ? history[l][uid] : null));
  }
  return out;
}

export function seriesRanks(history, uids) {
  const labels = labelsOf(history);
  const rankByLabel = labels.map((l) => ranksOf(history[l]));
  const out = {};
  for (const uid of uids) {
    out[uid] = rankByLabel.map((r) => r[uid] ?? null);
  }
  return out;
}

export function outcome(s1, s2) {
  if (s1 > s2) return '1';
  if (s1 < s2) return '2';
  return 'N';
}

export function forecastStatus(prono, match) {
  if (!prono || !match || match.status !== 'played') return 'pending';
  if (prono.score1 === match.score1 && prono.score2 === match.score2) return 'exact';
  if (outcome(prono.score1, prono.score2) === outcome(match.score1, match.score2)) return 'result';
  return 'miss';
}

export function playerStats(uid, forecasts, matches) {
  const pf = forecasts[uid] || {};
  let played = 0, exact = 0, result = 0, miss = 0, points = 0;
  let best = null, worst = null;
  for (const m of matches) {
    const prono = pf[m.id];
    const st = forecastStatus(prono, m);
    if (st === 'pending') continue;
    played++;
    if (st === 'exact') exact++;
    else if (st === 'result') result++;
    else miss++;
    const pts = prono?.points ?? 0;
    points += pts;
    if (!best || pts > best.points) best = { matchId: m.id, points: pts };
    if (!worst || pts < worst.points) worst = { matchId: m.id, points: pts };
  }
  return {
    played, exact, result, miss, points,
    exactRate: played ? exact / played : 0,
    resultRate: played ? (exact + result) / played : 0,
    ptsPerMatch: played ? points / played : 0,
    best, worst,
  };
}
