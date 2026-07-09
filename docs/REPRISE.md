# Reprise — mppreporting (état au 2026-07-09 au soir)

> Fichier de passation pour reprendre demain. Résume l'état, le reste à faire, et comment relancer.

## En un coup d'œil

- **Projet** : `mppreporting` = page web statique unique (`dist/index.html`, auto-suffisante, ECharts inliné) qui fait le bilan du pool de pronostics MPP « CDM 2026 » (16 joueurs, ligue SHRS). Remplace l'ancien email.
- **Projet d'inspiration (NE PAS MODIFIER)** : `/home/willy/workspace/wc2026` (générateur d'email d'origine + données). Restauré à son état d'origine.
- **Page de base : TERMINÉE** et mergée dans `main`, poussée sur GitHub (`willy3cub/mppreporting`), en cours de déploiement Cloudflare Workers (assets-only, `wrangler.jsonc` → sert `dist/`).
- **En cours : branche `feat/api-reelle-et-features`** = câbler les vraies données API + 4 nouvelles features. **1 tâche sur 8 faite.**

## Branches / commits

- `main` (`0932214`) : page de base complète + `wrangler.jsonc` + poussée sur GitHub. Déploiement Cloudflare en cours (voir plus bas).
- `feat/api-reelle-et-features` (`eb6a41f`, branche courante) :
  - `7c92b9f` Doc (API + design/plan features)
  - `eb6a41f` Task 1 — `src/lib/mpp.mjs` (mappers purs, 6/6 tests, suite 21/21) ✅ committée, **revue non finalisée** (interrompue).

Tests : `npm test` → **21/21 vert**. Token API : `.mpp-token` présent (gitignoré, ~30 j, expire vers début août 2026).

## Docs de référence (tout est écrit)

- Plan en cours : [docs/superpowers/plans/2026-07-09-api-reelle-et-features.md](superpowers/plans/2026-07-09-api-reelle-et-features.md) — **les 8 tâches avec code concret**.
- Design : [docs/superpowers/specs/2026-07-09-api-reelle-et-features-design.md](superpowers/specs/2026-07-09-api-reelle-et-features-design.md)
- **API MPP** (endpoints + shapes, tout découvert) : [docs/mpp-api.md](mpp-api.md)
- Ledger de progression SDD : `.superpowers/sdd/progress.md` (gitignoré)
- Workflow de mise à jour : [../CLAUDE.md](../CLAUDE.md)

## RESTE À FAIRE — plan `feat/api-reelle-et-features`

Exécution en **subagent-driven** (implémenteur haiku pour transcription/TDD, sonnet pour visuel ; reviewer sonnet ; revue finale opus). Briefs via `scripts/task-brief PLAN N`.

- [x] **Task 1** — `src/lib/mpp.mjs` mappers purs (fait, revue à re-valider)
- [ ] **Task 2** — câbler `src/fetch.mjs` sur l'API réelle (en-têtes requis + endpoints matchs/clubs/calendrier/pronos)
- [ ] **Task 3** — lancer le fetch réel (`node src/fetch.mjs J23`) → peupler `data/*.json` (100 matchs, pronos des 16) + rebuild + commit des données réelles
- [ ] **Task 4** — `src/lib/awards.mjs` logique features (TDD) : headToHead, computeAwards (8 badges), topRareForecasts, groupConsensus
- [ ] **Task 5** — UI Comparateur 1v1 (`#compare`)
- [ ] **Task 6** — UI Carte joueur partageable (`?joueur=`, export SVG→PNG local)
- [ ] **Task 7** — UI Superlatifs / trophées (`#awards`, 8 badges)
- [ ] **Task 8** — UI Pronos rares (`#rares`) + compléter la nav sticky (ancres #compare/#awards/#rares) + `initNavScrollSpy()` appelé en dernier
- [ ] **Revue finale** whole-branch (opus) + vérif visuelle Chrome + `finishing-a-development-branch` (merge dans main)

### Pour reprendre l'exécution
1. `cd /home/willy/workspace/mppreporting && git branch --show-current` → doit être `feat/api-reelle-et-features`.
2. Relancer/valider la **revue de la Task 1** (package : `scripts/review-package 7c92b9f eb6a41f`), puis enchaîner Task 2.
3. Pour chaque tâche : `scripts/task-brief docs/superpowers/plans/2026-07-09-api-reelle-et-features.md <N>` → dispatch implémenteur → `review-package <BASE> <HEAD>` → dispatch reviewer → fix si besoin → ledger.
   (`scripts` = `/home/willy/.claude/plugins/cache/claudia/superpowers/6.1.1/skills/subagent-driven-development/scripts`)

## Découverte API (rappel — détail dans docs/mpp-api.md)

- Base `https://api.mpp.football`, challenge `mpp_challenge_UDMSMC8T`, championship CDM = **8**.
- En-têtes OBLIGATOIRES : `authorization: Bearer <token>`, `application: mppLfp`, `app-context: internationalEvent`, `client-version: 11.12.0`, `client-language: fr-FR`, `platform: web`.
- Matchs = `championships-current-matches` (100 matchs, 96 joués + 4 quarts à venir) ; équipes = `championship-clubs` ; phases = `championship-calendar/8` (roundType) ; **pronos des 16 = `GET /user-match-forecasts/contest/{CH}/match/{matchId}`** ; standings = `challenge-standings/users-standings`.
- Token : rafraîchir si 401 → copier `body.access_token` du localStorage (`@@auth0spajs@@…`) de https://mpp.football (connecté) dans `.mpp-token`.

## ⚠️ Points d'attention

1. **NE PAS déployer aux 16 joueurs** tant que la branche features n'est pas mergée : sur `main` actuel, matchs/pronos/bilan sont encore des **fixtures fictives**. Le vrai contenu arrive avec Tasks 2-3.
2. **Déploiement Cloudflare** : flux « Workers » lancé (repo GitHub connecté, `wrangler.jsonc` assets-only). À vérifier que le premier deploy a réussi (URL `https://mppreporting.<compte>.workers.dev`). Build command vide, deploy `npx wrangler deploy`.
3. **`data/bilan.json`** : encore le texte fictif (chambrage). À réécrire avec un vrai bilan une fois les vraies données en place.
4. **Flags** : la table `FLAGS` dans `src/lib/mpp.mjs` est une base ; au fetch réel (Task 3), vérifier qu'aucune équipe ne s'affiche en id brut `mpp_championship_club_…` et compléter la table avec les noms réels renvoyés par `championship-clubs`.
5. **wc2026** : source d'inspiration uniquement, restauré à `72f243b` — ne pas y toucher.

## Après la branche features
- Rebuild `dist/index.html`, commit, push `main`, redéploiement Cloudflare.
- Réécrire `data/bilan.json`. Puis partager le lien au groupe.
- Workflow récurrent (chaque journée) : `node src/fetch.mjs J<N>` → MàJ `data/bilan.json` → `npm run build` → `npm test` → commit → push (Cloudflare redeploy auto).
