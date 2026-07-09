---
name: maj-journee
description: Met à jour la page bilan MPP après une journée de Coupe du Monde — récupère scores/joueurs/pronos depuis l'API, rédige le résumé des matchs de la veille (data/recap.json) et le mot du bilan (data/bilan.json) au ton chambreur, rafraîchit superlatifs & pronos rares, rebuild + tests + commit. À lancer quand l'utilisateur veut « mettre à jour la journée », « faire le bilan du jour », ou après des matchs joués.
---

# Mise à jour d'une journée (MPP CDM 2026)

Objectif : produire une page `dist/index.html` à jour et son contenu éditorial, en une passe. Tu orchestres des scripts existants **et** tu rédiges le contenu (recap + bilan). Travaille dans le repo `mppreporting`, branche courante.

## Ton éditorial (règle d'or)
Décontracté, **humoristique et très chambreur**, vocabulaire foot. **Éloge appuyé des joueurs français** dans les résumés de match. Une **pointe complotiste** bienvenue (arbitrage, hors-jeu fantôme, temps additionnel suspect…), sans méchanceté. Chaque idée = **3-4 phrases max**. Jamais d'insulte ; on chambre, on ne blesse pas.

## Étapes

### 1. Prérequis — token
- Vérifie `.mpp-token` (gitignoré) : `test -f .mpp-token`. Absent → demande à l'utilisateur de le rafraîchir (copier `body.access_token` du localStorage `@@auth0spajs@@…` sur https://mpp.football connecté) et arrête-toi.
- Si un fetch renvoie `401`, le token a expiré : demande de le rafraîchir, ne continue pas.

### 2. Récupérer les données réelles
- Label de journée : par défaut auto (max des numéros + 1). L'utilisateur peut en imposer un via l'argument du skill (ex. `J23`).
- Lance : `node src/fetch.mjs <label>` (ou sans argument pour l'auto).
  Cela met à jour `data/history.json` (standings), `data/matches.json`, `data/forecasts.json`, les avatars (`data/avatars/`) et les favoris (`data/favorites/`).
- **Doublon** : si la nouvelle journée est identique à la précédente (aucun match joué depuis, deltas tous à 0), retire-la de `data/history.json` (comme un doublon) et signale-le — inutile de polluer le graphe.
- Cohérence : `node -e "const m=require('./data/matches.json');console.log('joués',m.filter(x=>x.status==='played').length,'/',m.length)"` et vérifie qu'aucune équipe n'apparaît en id brut `mpp_championship_club_…` (sinon compléter la table `FLAGS` dans `src/lib/mpp.mjs`).

### 3. Rassembler les faits
- Lance `node src/facts.mjs` et **lis toute la sortie**. Elle te donne :
  - les mouvements au classement (deux derniers snapshots) : leader, remontées, chutes, meilleurs/pires gains ;
  - les matchs de la dernière journée avec **buteurs, passeurs, homme du match, stade** (via l'API) ;
  - les pronos notables sur ces matchs (exacts, meilleurs, 0 point) ;
  - les superlatifs actuels et le top des pronos rares.
- Ces faits sont ta seule source de vérité : **ne jamais inventer** un buteur ou un score.

### 4. Rédiger `data/recap.json` — résumé des matchs de la veille
Pour **chaque** match de la dernière journée (section « MATCHS DU … » des faits), un bloc. Structure :
```json
{
  "matches": [
    { "match": "🇫🇷 France 2 - 0 Maroc 🇲🇦", "phase": "Quart de finale · 9 juillet · Boston Stadium",
      "html": "<p>…3-4 phrases…</p>" }
  ]
}
```
(Un seul match → tu peux garder `{"matches":[{…}]}` ; le front accepte aussi un objet unique.)
Consignes par match :
- Commence par **le match et le score final**, puis raconte le **déroulé avec les buteurs** (minute, passeur si dispo, homme du match).
- **Éloge des Français** s'il y en a (buteur/passeur/MOTM tricolore → on encense).
- Ton chambreur + pointe complotiste si l'occasion se présente. Noms en `<b>`.

### 5. Rédiger `data/bilan.json` — le mot du bilan
```json
{ "updated": "J23 · <date/contexte>", "html": "<p>…</p><p>…</p>…" }
```
- **Plusieurs paragraphes**, chacun **3-4 phrases max**, ton humoristique et très chambreur :
  1. **Mouvements au classement** : qui grimpe, qui plonge, le leader, l'écart en tête.
  2. **Bons pronos** : les coups de génie (exacts, pronos rares réussis) — cite les joueurs.
  3. **Mauvais pronos** : les fours, les 0 pointés, les paris long terme qui sombrent (équipe/buteur éliminé).
  4. **Piques ciblées** sur 1-2 joueurs (superlatifs : Sniper, Mouton, Frileux, Dernier…).
  5. Clôture avec les **matchs à venir** si pertinent.
- Appuie-toi sur les faits (classement, superlatifs, rares, favoris éliminés). Reste factuel sous l'humour.

### 6. Superlatifs & pronos rares
Ils sont **recalculés automatiquement** côté front à partir de `data/forecasts.json` au build — aucun fichier à éditer. Vérifie juste, dans la sortie de `facts.mjs`, que les détenteurs ont du sens, et n'hésite pas à en citer dans le bilan.

### 7. Build + tests
- `npm run build` → doit afficher `OK dist/index.html (…Ko)`.
- `npm test` → **tout vert** (26 tests actuellement).

### 8. Vérification visuelle (recommandé)
- Ouvre `dist/index.html` (double-clic / file://, ou via le skill `/run` / Chrome MCP) et contrôle : bannière recap en haut, classement (colonnes Champion/Buteur + éliminés), superlatifs, pronos rares, bilan. Aucune erreur console.

### 9. Commit
- `git add data/ dist/index.html` (inclut `data/avatars/`, `data/favorites/` si modifiés) puis commit en **français, sans** trailer `Co-Authored-By`, message type :
  `data: journée <label> (scores, pronos, recap, bilan)`.
- **Ne pousse pas** sans accord explicite : `git push` déclenche le redéploiement Cloudflare (visible par les 16 joueurs). Propose-le à la fin.

## Rappels
- Scripts : `src/fetch.mjs` (récup + delta), `src/facts.mjs` (faits, lecture seule), `src/build.mjs` (assemble `dist/`).
- Endpoint détail match (buteurs) : `GET /championship-match/{matchId}` → `eventsTimeline` + `manOfTheMatch` (noms résolus via `home.players`/`away.players`).
- Page **auto-suffisante** : toute image (avatars, favoris, badges) est embarquée en base64 au build — ne mets jamais d'URL externe.
