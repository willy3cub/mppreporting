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
