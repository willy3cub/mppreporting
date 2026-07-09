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
