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

Squelette v0 : accueil, bibliothèque (catalogue complet, 8 scénarios marqués
disponibles), création de table, connexion WebSocket et message `welcome`.
Aucune action de jeu n'est encore implémentée. Le cahier des charges et le mémo
de suivi sont dans `docs/` — **`docs/ARKHAM_WEB_notes.md` fait foi**, à lire
avant toute modification.

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
- `src/state.ts` — modèle d'état `RoomState` (cahier des charges §3).
- `data/scenarios_data.json` — savoir métier des 10 premiers scénarios
  (extrait du pipeline PCIO), source des futurs `scenarios/<id>.json`.

## Développement

```sh
npm install
npm run dev      # http://127.0.0.1:8787
npm run check    # tsc + wrangler deploy --dry-run
npm run deploy
```

Plan gratuit Cloudflare : chaque message WebSocket entrant compte comme une
requête ; voir le budget messages dans `docs/CAHIER_DES_CHARGES.md` §4.4.
