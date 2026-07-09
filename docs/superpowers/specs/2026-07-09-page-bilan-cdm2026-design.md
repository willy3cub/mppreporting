# Page bilan CDM 2026 — Design

> Transformer le reporting « email du jour » en une page web statique unique, vivante,
> interactive et pétillante, hébergée sur Cloudflare, qui fait le bilan du pool de
> pronostics MPP (SHRS Football Club, 16 joueurs) pendant toute la Coupe du Monde 2026.

**Date** : 2026-07-09
**Statut** : validé (design) — en attente de relecture spec avant plan d'implémentation

---

## 1. Objectif

Remplacer l'email HTML quotidien ([`gen_email_template.py`](../../../gen_email_template.py)) par
**une seule page HTML statique** qui :

- fait le bilan vivant de la compétition (podium, classement, faits marquants) ;
- offre des **graphes interactifs** d'évolution des classements sur toute la durée ;
- permet d'explorer **les pronostics des joueurs** (grille, par joueur, par match) ;
- est **redéployée à chaque journée** jusqu'au bilan final (~19 juillet 2026) ;
- tient dans un fichier statique hébergeable sur **Cloudflare Pages**.

### Non-objectifs (YAGNI)

- Pas de backend, pas de base de données, pas d'auth côté page publiée.
- Pas de mise à jour temps réel dans le navigateur (la donnée est figée au build).
- On ne conserve pas l'envoi d'email (le pipeline email peut rester dans le repo mais
  n'est plus le livrable ; la page le remplace).

---

## 2. Décisions validées

| Sujet | Décision |
|---|---|
| Cycle de vie | **Page vivante** — refetch + rebuild + redéploiement à chaque journée, devient le bilan final le 19 |
| Source données | **Appels HTTP directs** à l'API MPP (Node `fetch` + Bearer token), stockage JSON dans le repo, **fetch en delta**. Pas de navigateur piloté dans le script. |
| Déploiement | **Cloudflare Pages** (free tier) — méthode précise (drag & drop `dist/` ou repo connecté) à fixer au moment de publier |
| `dist/index.html` | **Versionné** (commité) |
| Vue pronos | **Les trois** : grille match × joueurs, fiche par joueur, focus par match |
| Graphe classement | **Bump chart (rangs)** + **courbe points cumulés** + **survol/isolement d'un joueur** + **curseur/animation « replay »** |
| Ambiance | **Stade nocturne électrique** — fond bleu nuit, couleurs joueurs vives, accents or, glows, micro-animations |
| Architecture | **Build → fichier `index.html` unique auto-suffisant** (données + CSS + JS inline), tout en Node |
| Graphes | **ECharts inline** (bump + tooltips + toggle légende + dataZoom + timeline animée) |

---

## 3. Architecture

```
wc2026/
├── data/                     # source de vérité versionnée (JSON)
│   ├── players.json          # 16 joueurs : uid, prénom, pseudo, couleur
│   ├── history.json          # points cumulés par journée (repris de historique_points.json)
│   ├── matches.json          # matchs : équipes, drapeaux, date, phase, score réel
│   └── forecasts.json        # par joueur × match : prono, points, statut
├── src/
│   ├── fetch.mjs             # HTTP direct (Node fetch + token) : standings + pronos + matchs (delta)
│   ├── build.mjs             # génère dist/index.html (données + template inline)
│   ├── template.html         # squelette HTML/CSS/JS de la page
│   └── app.js                # logique front (onglets, graphes ECharts, filtres)
├── vendor/
│   └── echarts.min.js        # ECharts figé localement (inliné au build)
├── dist/
│   └── index.html            # LIVRABLE — déployé sur Cloudflare
└── docs/superpowers/specs/…  # ce document
```

**Langage** : Node (ESM). `fetch.mjs` fait des appels HTTP directs à l'API MPP (Node
`fetch` natif), aucune dépendance navigateur au runtime du script. Script de build maison
pour l'inlining : il lit les fichiers, injecte les JSON et le JS/CSS dans `template.html`,
écrit `dist/index.html`. Pas de bundler lourd.

**Réutilisation de l'existant** : `players.json` et `history.json` sont initialisés depuis
la config du [`gen_email_template.py`](../../../gen_email_template.py) (couleurs, prénoms,
pseudos, uid) et [`historique_points.json`](../../../historique_points.json).

---

## 4. Couche de données

### 4.1 Modèles

**`players.json`** — tableau d'objets :
```json
{ "uid": "user_10698233", "name": "JC", "pseudo": "JCBBBB", "color": "#e63946" }
```

**`history.json`** — objet `journée → { uid: points }` (format identique à l'actuel
`historique_points.json`, réutilisé tel quel).

**`matches.json`** — tableau d'objets :
```json
{
  "id": "match_xxx", "phase": "1/8", "date": "2026-07-07T18:00:00Z",
  "team1": "Argentine", "flag1": "🇦🇷", "team2": "Égypte", "flag2": "🇪🇬",
  "score1": 3, "score2": 2, "status": "played"
}
```

**`forecasts.json`** — objet `uid → { matchId → prono }` :
```json
{ "score1": 2, "score2": 2, "points": 16, "result": "result" }
```
`result` ∈ `exact` (score exact) · `result` (bon résultat) · `miss` (raté) · `pending`
(match non joué). Le calcul du statut/points suit le scoring MPP documenté dans le
[`CLAUDE.md`](../../../CLAUDE.md) (16 pts résultat + 8/but en poules, scoring majoré en
phase finale). On stocke les points renvoyés par l'API si disponibles, sinon on recalcule.

### 4.2 Fetch HTTP direct (`fetch.mjs`)

On **privilégie les appels API directs** (Node `fetch`) plutôt qu'un navigateur piloté.
Le navigateur n'intervient qu'en amont, manuellement et une seule fois, pour deux choses :
récupérer le token et repérer les endpoints.

**Prérequis (manuel, occasionnel)**
- **Token** : copié depuis le `localStorage` de `https://mpp.football` (clé `…auth0spajs…`,
  champ `body.access_token`) et placé dans un fichier local **gitignoré** (ex. `.mpp-token`)
  ou une variable d'env `MPP_TOKEN`. À rafraîchir quand il expire.
- **Endpoints pronos/fixtures** : identifiés une fois via l'onglet réseau des devtools en
  naviguant sur les pages « matchs » / « pronostics » du site, puis figés dans `fetch.mjs`.

**Déroulé de `fetch.mjs` (100 % HTTP)**
1. Lire le token (`MPP_TOKEN` / `.mpp-token`). Si absent/expiré → message clair invitant à
   le rafraîchir.
2. `GET api.mpp.football/challenge-standings/users-standings?challengeId=mpp_challenge_UDMSMC8T&offset=0&limit=20`
   (endpoint **confirmé**) → nouvelle journée dans `history.json` + base du classement.
3. `GET` fixtures/résultats → `matches.json` (endpoint à figer, cf. prérequis).
4. `GET` forecasts par joueur/challenge → `forecasts.json` (endpoint à figer).
5. **Delta** : comparer aux JSON existants ; n'ajouter que les nouveaux matchs / pronos /
   la nouvelle journée. Idempotent (rejouable sans doublon).

> **Point d'incertitude connu** : les chemins exacts des endpoints *forecasts* et
> *fixtures* ne sont pas encore figés (à capter une fois via devtools). Le host
> `api.mpp.football` et l'auth Bearer sont confirmés (401 sur l'endpoint standings sans
> token). Seul risque technique ; cerné.

---

## 5. Structure de la page (`index.html`)

Page unique, défilement vertical, **barre de navigation sticky** (ancres) + sélecteur de
sections. Sections dans l'ordre :

1. **Hero** — titre CDM 2026, **podium animé** (1/2/3 en or/argent/bronze, pétillant),
   date de dernière mise à jour, nb de matchs couverts.
2. **Le Grand Graphe** — bloc central :
   - onglets **Bump (rangs)** / **Points cumulés** ;
   - **légende cliquable** : clic sur un joueur → isole/met en avant sa courbe ;
   - **survol** → tooltip (rang/points, delta, place) ;
   - **curseur temporel + bouton Play** → rejoue la compétition journée par journée
     (timeline ECharts) ;
   - **dataZoom** pour zoomer sur une plage de journées.
3. **Classement** — tableau live : rang, joueur, pseudo, évolution (flèches), pts de la
   journée, total. Highlights podium. Repris de la logique de rangs/deltas actuelle.
4. **Pronostics** — sélecteur **3 vues** :
   - **Grille** : matchs (lignes) × joueurs (colonnes), pastille couleur exact/résultat/
     raté, score pronostiqué au survol ;
   - **Joueur** : fiche d'un joueur + stats (nb exacts, % de bons résultats, pts/match,
     meilleur & pire prono, forme récente) ;
   - **Match** : un match sélectionné + ce que les 16 ont pronostiqué, qui a eu juste.
5. **Bilan / faits marquants** — texte d'analyse (ton chambreur), repris/porté depuis le
   pipeline actuel (`ANALYSE_CUSTOM` / `make_analysis`).

**Responsive** : mobile-first pour le classement et le bilan (lecture sur téléphone) ; la
grille pronos scrolle horizontalement dans un conteneur `overflow-x:auto`.

---

## 6. Graphes (ECharts)

- **Bump chart** : axe Y = rang inversé (1 en haut), une série par joueur, lignes lissées,
  gros point sur la dernière journée, symboles au survol.
- **Points cumulés** : axe Y = points, mêmes séries, même code couleur.
- **Interactions** : toggle par série via légende (isolement = griser les autres),
  tooltip riche, `dataZoom` horizontal, **timeline** pour l'animation « replay ».
- **Couleurs** : palette joueurs existante, ajustée pour contraster sur fond nuit
  (certaines couleurs actuelles sont sombres → éclaircies/neon pour lisibilité).
- ECharts figé dans `vendor/echarts.min.js`, **inliné** dans `index.html` au build
  (aucune dépendance CDN au runtime).

---

## 7. Ambiance visuelle (stade nocturne électrique)

- Fond : dégradé bleu nuit profond (`#0a0e27` → `#141b3c`), léger vignettage.
- Couleurs joueurs : vives / néon, glow subtil sur les éléments actifs.
- Accents or (`#FFD166`) pour le trophée / le leader / le podium.
- Typo : sportive et lisible, hiérarchie marquée.
- Micro-animations : apparition en fondu/monté au scroll, pulsation douce du podium,
  transitions sur les graphes. Sobre, jamais clinquant au point de gêner la lecture.
- Accessibilité : contrastes suffisants, taille de police confortable, pas d'info portée
  par la seule couleur (les pastilles pronos ont aussi une icône/lettre).

---

## 8. Workflow de mise à jour

Trois étapes, documentées dans le `CLAUDE.md` du projet :

```bash
node src/fetch.mjs     # récupère le delta (standings + matchs + pronos) → data/*.json
node src/build.mjs     # génère dist/index.html (données + assets inline)
# déploiement Cloudflare (Pages / wrangler) — commande à fixer selon le compte
```

Les `data/*.json` sont **commités** (source de vérité, historique). `dist/index.html` est
**commité** lui aussi (versionné, pour garder une trace de chaque bilan déployé).

---

## 9. Découpage en unités

| Unité | Rôle | Dépend de |
|---|---|---|
| `data/*.json` | Donnée figée versionnée | — |
| `fetch.mjs` | Remplit/actualise les JSON (delta) via MPP | API MPP (HTTP), token MPP |
| `build.mjs` | Assemble `index.html` | `template.html`, `app.js`, `data/*`, `vendor/echarts` |
| `template.html` | Structure + styles de la page | — |
| `app.js` | Interactions, graphes, filtres, calcul des stats pronos | ECharts, données injectées |

Chaque unité est testable/compréhensible isolément : `fetch` (I/O réseau), `build`
(transformation fichiers), `app.js` (rendu/interaction à partir d'un objet de données).

---

## 10. Risques & points ouverts

- **Endpoints pronos/fixtures inconnus** → à figer une fois via devtools (risque cerné,
  host + auth confirmés).
- **Expiration du token MPP** → token stocké en local gitignoré, à rafraîchir manuellement
  quand il expire ; `fetch.mjs` doit le détecter et le signaler clairement.
- **Poids d'ECharts inline** (~1 Mo) → acceptable pour une page statique ; à mesurer.
- **Déploiement Cloudflare Pages (gratuit)** → méthode exacte à fixer au moment de publier
  (drag & drop du dossier `dist/` dans le dashboard, ou repo Git connecté).
