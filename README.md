# AHWA — Anofelis Web

Tables en ligne pour les scénarios d'*Horreur à Arkham : le jeu de cartes*.
Une bibliothèque publique liste les scénarios ; un clic crée une table avec un
code à six caractères que l'on partage aux joueurs. La mise en place est
automatisée, la résolution des effets de cartes reste aux joueurs.

Projet indépendant, sans lien avec Fantasy Flight Games. Aucun texte de carte
n'est reproduit : seules les images (cdn.arkham.build) sont affichées en jeu.

## Site

https://ahwa.rivardlaudelex.workers.dev — Cloudflare Workers, plan gratuit,
redéployé automatiquement à chaque push sur `main` (Workers Builds).

## État

Tables jouables : la campagne *Night of the Zealot* complète (I — The
Gathering, II — The Midnight Masks, III — The Devourer Below), avec les
questions de journal au lobby, les tirages au hasard et les piles propres à
chaque scénario. Outil « Générer une carte » et lien vers le livret de
campagne dans chaque table. Lobby
(sièges, enquêteurs, difficulté, enquêteur principal), mise en place
automatique par l'hôte, tapis complet : glisser-déposer des cartes et des
pions, révélation des lieux avec indices, phases et tours, doom et agenda,
indices et acte, pioche de rencontre, sac du chaos, journal de bord. Le cahier des charges et le mémo de suivi sont dans `docs/` —
**`docs/ARKHAM_WEB_notes.md` fait foi**, à lire avant toute modification.

## Crédits

Les icônes des jetons du chaos (`public/img/chaos/`) sont générées par
`scripts/build_chaos_tokens.py` à partir de la police `assets/tokens.ttf` du
projet open source [Arkham Cards](https://github.com/zzorba/ArkhamCards)
(zzorba), en reprenant sa recette de composition. Merci à ses auteurs.

## Architecture

Cloudflare Workers, un seul déploiement :

- `public/` — front statique servi par le Worker (assets).
  `index.html` accueil, `scenarios.html` bibliothèque, `room.html` page de
  table (servie pour `/r/<code>`), `data/library.json` catalogue.
- `src/index.ts` — Worker d'entrée : `POST /api/rooms`, `GET /rooms/<code>/ws`,
  route `/r/<code>`, sinon assets.
- `src/room.ts` — Durable Object `Room` (une instance par table) : WebSocket
  hibernant via [partyserver](https://github.com/cloudflare/partykit),
  snapshot d'état en SQLite, purge après 7 jours sans activité.
- `src/state.ts` — modèle d'état `RoomState` (cahier des charges §3) ;
  `src/setup.ts` mise en place ; `src/patch.ts` deltas JSON Patch.
- `data/scenarios/<id>.src.json` — source déclarative d'un scénario (sets,
  setup, sac du chaos, rappels), `scripts/build.mjs` la complète depuis
  ArkhamDB en `public/scenarios/<id>.json` (commité).
- `data/scenarios_data.json` — savoir métier des 10 scénarios PCIO, à
  transcrire en `*.src.json`.

## Développement

```sh
npm install
npm run dev      # http://127.0.0.1:8787
npm run check    # tsc + wrangler deploy --dry-run
npm run build:data   # régénère public/scenarios, investigators.json, le registre
npm test         # bout en bout contre le serveur local (node scripts/test_room.mjs)
npm run captures # captures Playwright de la page de table
npm run deploy
```

Plan gratuit Cloudflare : chaque message WebSocket entrant compte comme une
requête ; voir le budget messages dans `docs/CAHIER_DES_CHARGES.md` §4.4.
