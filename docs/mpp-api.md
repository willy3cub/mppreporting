# API MPP — endpoints découverts (CDM 2026)

> Reverse-engineeré depuis mpp.football (bundle JS + capture réseau), 2026-07-09.
> Base : `https://api.mpp.football` · Challenge : `mpp_challenge_UDMSMC8T` · Championship (CDM) : `8`

## Auth & en-têtes requis

Token Bearer = `localStorage['@@auth0spajs@@::…']`.`body.access_token` (récupéré une fois sur
`https://mpp.football` connecté, stocké dans `.mpp-token`, gitignoré). Expire ~30 j.

En-têtes **obligatoires** sur chaque appel :
```
authorization: Bearer <token>
application: mppLfp
app-context: internationalEvent      // ← contexte CDM (sans ça : mauvais championnat)
client-version: 11.12.0
client-language: fr-FR
platform: web
accept: application/json, text/plain, */*
origin: https://mpp.football
```

## Endpoints utiles

### Classement — `GET /challenge-standings/users-standings?challengeId={CH}&offset=0&limit=20`
```
{ standings: [ {
    user: { id:"user_XXX", firstName, username, avatarUrl },
    ranking: { points, rank, calculatedForecasts, goodForecasts, exactForecasts }
} ], usersQuantity, hasNext }
```
→ alimente `history.json` (points par joueur) + noms/pseudos.

### Matchs — `GET /championships-current-matches`
Objet indexé par matchId :
```
"mpp_championship_match_2608241": {
  matchId, championshipId:8, gameWeekNumber, date:"ISO",
  period:"fullTime"|"notStarted"|…,        // fullTime = match joué
  home: { clubId, score }, away: { clubId, score },
  userForecasts: { general:{…}, "mpp_challenge_UDMSMC8T":{ homeScore, awayScore, points } }  // ← MOI uniquement
}
```
→ détails + résultats des matchs. `period==="fullTime"` ⇒ `status:"played"`.

### Calendrier — `GET /championship-calendar/8`
```
{ id, type, gameWeeks: { "1": { gameWeekNumber, matchesIds:[…], startDate, endDate, roundType }, … }, rounds:{…} }
```
→ ordre des journées + rattachement match→journée + phases (rounds).

### Clubs (équipes) — `GET /championship-clubs`
```
{ championshipClubs: { "mpp_championship_club_659": {
    id, name:{ "fr-FR", "en-GB" }, shortName, defaultJerseyUrl } } }
```
→ `clubId → nom d'équipe` (équipes nationales pour la CDM). Pas d'emoji drapeau : à mapper
nom→drapeau côté build, ou utiliser `defaultJerseyUrl`.

### Pronostics de TOUS les joueurs pour un match ⭐
`GET /user-match-forecasts/contest/{CH}/match/{matchId}`
```
{ "user_8422848": { homeScore, awayScore, editedAt,
                    points:{ base, exact, extra, bonus, total, rarityLevel } }, … }  // les 16 uid
```
→ **la source des pronos** pour la grille/joueur/match. `total` = points gagnés ;
statut (exact/résultat/raté) recalculable via score prono vs `home/away.score` du match.

### Autres endpoints repérés (bundle)
- `GET /user-match-forecasts/contest/{CH}/game-week/{gw}?userId={uid}` — pronos d'un joueur sur une journée
- `GET /user-match-forecasts/championship/8/history?…` — historique pronos d'un joueur
- `GET /user-match-forecasts/{matchId}` — prono (perso) d'un match
- `PATCH /user-match-forecasts/entity/{entityId}/match/{matchId}` — poser un prono
- `GET /championship-available-predictions/8` → `{ clubsIds, players }` (favoris : vainqueur, buteur)

## Mapping vers les fichiers data/

- **history.json** ← standings (déjà en place ; le fetch ajoute la nouvelle journée).
- **matches.json** ← `championships-current-matches` (+ `championship-clubs` pour les noms,
  + `championship-calendar/8` pour l'ordre des journées et les phases). Reste à faire :
  mapper `clubId`→nom, nom→drapeau emoji, `gameWeekNumber`/rounds→phase.
- **forecasts.json** ← boucle sur les matchs : `user-match-forecasts/contest/{CH}/match/{id}`
  → `{ uid: { score1:homeScore, score2:awayScore, points:total, result: exact|result|miss } }`.
