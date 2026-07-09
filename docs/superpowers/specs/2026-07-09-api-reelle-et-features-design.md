# Données réelles MPP + 4 features — Design (addendum)

> Extension du design initial (`2026-07-09-page-bilan-cdm2026-design.md`). Deux volets :
> (1) remplacer les fixtures par les vraies données via l'API MPP, (2) ajouter 4 features.
> Réf. API : `docs/mpp-api.md`.

**Date** : 2026-07-09 · **Statut** : validé

---

## Volet 1 — Câblage des données réelles

`src/fetch.mjs` appelle l'API MPP (HTTP direct, token `.mpp-token`, en-têtes requis dont
`application:mppLfp` + `app-context:internationalEvent`) et écrit `data/*.json`. La logique
de transformation (pure, testable) vit dans un nouveau module `src/lib/mpp.mjs`.

### Sources → fichiers
- **history.json** : `challenge-standings/users-standings` → `{ [uid]: points }` pour la journée courante (merge delta, déjà en place).
- **players.json** : enrichi depuis les standings (`user.avatarUrl` ajouté ; nom/pseudo confirmés). Couleurs conservées (palette sombre existante).
- **matches.json** : `championships-current-matches` + `championship-clubs` (noms) + `championship-calendar/8` (phases). Champs : `{ id, gameWeek, phase, date, team1, flag1, team2, flag2, score1, score2, status }`.
- **forecasts.json** : boucle sur les matchs → `user-match-forecasts/contest/{CH}/match/{id}`. Champs par prono : `{ score1, score2, points, result, rarity, editedAt }`.

### Règles de mapping (dans `src/lib/mpp.mjs`, pur + testé)
- `phaseFor(roundType)` : `round`→"Poules", `roundOf32`→"16es", `roundOf16`→"8es", `quarterFinals`→"Quarts", `semiFinals`→"Demies", `thirdAndFourthPlace`→"Petite finale", `final`→"Finale".
- `flagFor(teamName)` : table nom (fr-FR) → emoji drapeau des nations CDM ; fallback `""` (le nom reste affiché).
- `matchStatus(period)` : `"fullTime"`→"played", sinon "pending".
- `resultOf(prono, match)` : réutilise la logique `forecastStatus` (exact / result / miss / pending).
- `mapMatches(currentMatches, clubs, calendar)` → `matches[]` triés par date.
- `mapForecasts(byMatchId)` → `{ uid: { matchId: {score1,score2,points,result,rarity,editedAt} } }`.

### Compatibilité
Les champs existants (`id, team1, flag1, team2, flag2, score1, score2, status` pour les matchs ;
`score1, score2, points, result` pour les pronos) sont conservés → `src/lib/compute.mjs` et les
vues actuelles continuent de marcher. On **ajoute** `gameWeek, phase` (matchs) et `rarity, editedAt` (pronos).

---

## Volet 2 — Les 4 features

Logique pure dans un nouveau module `src/lib/awards.mjs` (testé). Rendu dans `src/app.js`.

### F1 — Comparateur 1v1
Section `#compare` : 2 `<select>` (joueur A / B) + bouton échanger. Rendu : un mini-graphe
ECharts isolant les 2 courbes (points cumulés), + un tableau face-à-face
(`headToHead(a, b, history)` → `{ ptsA, ptsB, exactsA, exactsB, bonsA, bonsB, journeesDevantA }`).

### F2 — Carte joueur partageable
`renderPlayerCard(uid)` : carte (avatar, rang, points, % exacts, meilleur/pire prono, badges).
- **Deep link** : `?joueur=<name>` → au chargement, ouvre la carte de ce joueur.
- **Copier le lien** : `navigator.clipboard.writeText`.
- **Télécharger l'image** : la carte est aussi rendue en **SVG** (dimensions fixes) → dessinée sur un
  `<canvas>` → `toBlob` → download PNG. **100 % local, aucune librairie externe, aucune donnée envoyée.**

### F3 — Superlatifs / trophées
Section `#awards` : 8 badges calculés par `computeAwards(players, matches, forecasts)` →
`{ [key]: { uid, value, detail } }`. Chaque badge = titre + emoji + joueur + valeur.
- 🎯 **Le Sniper** — max scores exacts.
- 🔥 **La Série** — plus longue série de matchs consécutifs avec points > 0.
- 🃏 **Le Kamikaze** — moyenne de `rarity` la plus haute sur les pronos tentés (ose les scores rares).
- 🐑 **Le Mouton** — suit le plus souvent le prono majoritaire du groupe (score le + fréquent du match).
- 🧠 **Le Visionnaire** — le + de pronos **justes** (exact/result) contre le consensus du groupe.
- 💥 **Le Carton** — meilleur total de points sur une seule journée (gameWeek).
- 🧊 **Le Frileux** — le + de matchs joués à 0 pt.
- ⏱️ **Le Dernier** — pronos posés le + tard en moyenne (via `editedAt` vs `match.date`).

### F4 — Pronos rares (flex)
Section `#rares` :
- **Top pronos rares** : `topRareForecasts(matches, forecasts, players, n=10)` → les pronos **justes**
  (result≠miss/pending) triés par `rarity` décroissant → « qui a osé le X-Y que personne n'avait ».
- **Consensus vs réalité** : par match joué, le score le + pronostiqué du groupe vs le vrai score
  (`groupConsensus(match, forecasts)`), pour épingler les matchs où le groupe s'est planté ensemble.

---

## Décisions
- Drapeaux : table nom→emoji (nations CDM) ; fallback nom seul.
- Phases : dérivées du `roundType` du calendrier.
- Matchs inclus : **tous** (joués + à venir en `pending`).
- Partage d'image : **local** (SVG→canvas→PNG), rien n'est envoyé.
- Tous les superlatifs (8) sont retenus.

## Risques
- `championships-current-matches` pourrait ne pas contenir **tous** les matchs (nom « current ») → à
  vérifier au fetch ; si incomplet, compléter via les `matchesIds` du calendrier (endpoint par match).
- Volume : ~96 matchs × 1 appel pronos = ~96 requêtes au fetch (acceptable, séquentiel + petit délai).
- `editedAt` fiable seulement si MPP le renvoie pour tous ; sinon « Le Dernier » exclut les manquants.
