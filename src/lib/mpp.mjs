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
  'Côte d\'Ivoire': '🇨🇮', 'Autriche': '🇦🇹', 'Norvège': '🇳🇴', 'Écosse': '🏴', 'Turquie': '🇹🇷',
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
