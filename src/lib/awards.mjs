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
