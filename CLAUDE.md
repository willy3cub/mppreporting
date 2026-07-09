# mppreporting

Page statique de bilan pour la ligue MPP « Coupe du Monde 2026 » (SHRS Football Club).
Ce livrable remplace l'ancien email de reporting : une unique page HTML auto-suffisante
(`dist/index.html`), sans backend, déployée sur Cloudflare Pages.

## Workflow de mise à jour à chaque journée

1. Rafraîchir le token si besoin : copier `body.access_token` depuis le localStorage
   (clé `auth0spajs`) de https://mpp.football dans `.mpp-token` (gitignoré).
2. `node src/fetch.mjs J<N>` — récupère standings (+ matchs/pronos si endpoints renseignés),
   met à jour `data/*.json` en delta.
3. Mettre à jour `data/bilan.json` (le mot du jour, ton chambreur).
4. `npm run build` — régénère `dist/index.html` (auto-suffisant).
5. `npm test` — vérifie la logique.
6. Commit `data/*.json` + `dist/index.html`.
7. Déployer `dist/index.html` sur Cloudflare Pages (glisser-déposer le dossier `dist/`
   dans le dashboard, ou repo Git connecté avec build command vide et output `dist`).

Endpoints matchs/pronos : à découvrir une fois via devtools réseau sur mpp.football,
puis renseigner `EP_MATCHES` / `EP_FORECASTS` dans `src/fetch.mjs`.

## Architecture

- `data/*.json` — sources de vérité (joueurs, historique de points, matchs, pronostics, bilan).
- `src/build.mjs` — assemble `src/template.html` + `data/*.json` + `src/app.js` + ECharts
  (vendoré depuis `node_modules`) en un unique `dist/index.html` sans dépendance externe.
- `src/app.js` — logique de rendu, exécutée en `<script>` classique dans la page générée
  (pas d'import/export : certains helpers dupliquent volontairement `src/lib/compute.mjs`
  pour éviter un bundler).
- `src/fetch.mjs` — récupère les données depuis mpp.football et met à jour `data/*.json`.
- `npm test` lance la suite complète (`compute` + `fetch` + `build`) via `node --test`.
