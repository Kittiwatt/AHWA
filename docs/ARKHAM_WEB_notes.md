# Bibliothèque de scénarios AHLCG en ligne — Anofelis Web

Mémo de suivi du chantier. **Il fait foi** : conventions, décisions,
pièges, avancement. À lire en début de chaque session, à mettre à jour
à chaque livraison.

Objectif : un site public « bibliothèque » listant tous les scénarios
d'Horreur à Arkham JCE ; un clic ouvre une page « room » où n'importe qui
crée une table (code de room), invite des joueurs, et joue le scénario.
La mise en place est automatisée, certaines actions de jeu aussi
(indices sur les lieux, doom, transitions agenda/acte, enchaînement des
phases…) ; la résolution des effets de cartes reste aux joueurs, qui
déplacent leurs pions, révèlent les lieux, tirent rencontre et chaos.

Ce projet succède au projet « rooms playingcards.io » (Anofelis PCIO),
dont il reprend le savoir métier mais AUCUNE contrainte de plateforme.

## 0. État d'avancement

- 2026-09-03 : projet créé par migration. Hébergement décidé (§1).
  Kit importé : ce mémo, `scenarios_data.json` (10 scénarios extraits
  du pipeline PCIO), `AHLCG_livrets_regles_FFG.md`, jetons PNG.
- 2026-09-03 : **questionnaire des fonctionnalités déroulé et consigné**
  (§1 « Fonctionnalités décidées »). Les thèmes de §6 sont clos.
- 2026-09-03 : **cahier des charges + modèle d'état rédigés**
  (`CAHIER_DES_CHARGES.md`, fait foi pour le modèle et le protocole).
  Trois choix structurels tranchés (voir §1 « Choix du cahier des
  charges »).
- 2026-09-03 : **squelette v0 livré et commité** (dépôt
  `github.com/Kittiwatt/AHWA`) : accueil, bibliothèque (catalogue complet
  `public/data/library.json`, 8 disponibles / 2 en cours / reste prévu),
  `POST /api/rooms`, DO `Room` (partyserver, hibernation, snapshot SQLite,
  purge 7 j), page `/r/<code>` qui reçoit le `welcome`. Aucune action de
  jeu. Testé en local (`wrangler dev` + client WebSocket Node + captures).
- 2026-09-03 : **déployé** sur `https://ahwa.rivardlaudelex.workers.dev`
  (Workers Builds branché sur `main`, plan gratuit ; les previews sont
  sur `<hash>-ahwa.rivardlaudelex.workers.dev`). Vérifié en ligne :
  pages, `POST /api/rooms`, WebSocket hôte/spectateur, code inconnu 4404.
- 2026-09-03 : **agenda / acte refaits « physiques »** : une carte n'est
  rendue qu'à un seul endroit (le panneau Histoire n'affiche l'agenda,
  l'acte ou la carte de scénario que s'ils sont dans la zone `story`,
  sinon un emplacement vide « sur le tapis / hors de l'histoire » +
  « Ramener ici ») — cause des cartes qui « disparaissaient » (le même
  élément était réclamé par le tapis et le panneau, avec la position
  absolue du tapis). Avancer = l'ancienne carte part **de côté, hors
  jeu** (visible dans la zone floutée) au lieu de la pile invisible
  `removed` ; mettre de côté / en victoire / en pile l'agenda ou l'acte
  courant révèle automatiquement le suivant (`sortieHistoire`) ; posé sur
  le tapis il reste le courant (pour lire). Menu dédié : retourner (lire
  le verso), avancer, hors jeu, sur le tapis, ramener dans l'histoire,
  jeton. Le panneau Histoire est une cible de dépôt (`story`) pour
  agenda, acte et carte de scénario.
- 2026-09-03 : **remise à zéro des tables de test** par migration DO
  (`v2` `deleted_classes: ["Room"]` puis `v3` `new_sqlite_classes`) : tout
  objet Room et son stockage sont effacés au déploiement. Même recette si
  un jour il faut repartir de zéro (ajouter un couple de tags). Le lobby
  a maintenant « Supprimer la table » pour l'hôte (avant, seule la barre
  du tapis l'offrait). Rappel : purge automatique après 7 jours sans
  activité, et pas d'énumération possible des rooms (pas de registre).
- 2026-09-03 : **carte disparue à la défausse** (tapis → défausse) :
  l'élément DOM d'une carte est réutilisé d'une zone à l'autre et
  gardait la position absolue (`left/top/zIndex`) posée sur le tapis →
  décalée hors de sa pile. `carteEl` efface ces styles hors du tapis.
  Cas ajouté aux captures (tapis → défausse, carte visible dans la pile).
- 2026-09-03 : **troisième salve** : les lieux forment la couche du bas
  du tapis (z-index par kind : un pion ou une carte ne passe jamais sous
  un lieu, même déplacé après) ; défausse : tout le bloc (dos, compte,
  liens) est cible de dépôt, l'encart pioche/sac n'est plus le tapis
  (`data-drop="none"` → dépôt annulé au lieu d'une carte cachée sous
  l'encart, cause des « cartes qui disparaissent ») ; **compteurs
  dégâts/horreur sur les soutiens du scénario à jauges** (build : champs
  `health`, `sanity`, `healthPerInvestigator` des ennemis et soutiens ;
  chips `n/max`, `*` = par enquêteur).
- 2026-09-03 : **deuxième salve (UX tapis)** : un lieu déplacé sur le
  tapis emmène les pions à cheval sur ses bords et les cartes dont le
  centre est dessus (`moveCard`, 1 message) ; **chemins entre lieux** :
  clic droit enfoncé sur un lieu, glissé, relâché sur un autre = trait de
  couleur (palette de 10, première couleur libre) sur le calque SVG sous
  les cartes, partagé par tous (`state.links`, `linkLocations` bascule
  tracer/effacer, `unlink`) ; menu du lieu « Relier à un autre lieu… »
  (tactile) et « Effacer ses chemins » ; un lieu envoyé en pile perd ses
  chemins. Clic droit simple sur un lieu = menu, géré au relâchement
  (le `contextmenu` natif est neutralisé pendant le tracé).
- 2026-09-03 : **première salve de retours de jeu** appliquée :
  reprise automatique de son siège au rechargement (siège mémorisé
  `ahwa:siege:<code>`, repris dès que l'ancienne connexion est fermée,
  15 s max) + bouton « Reprendre ce siège » sur le tapis ; plus de
  sélection de texte résiduelle (`user-select: none`, `preventDefault`
  au début du glisser, sélection effacée au lâcher) ; **piocher =
  retourner la première carte de la pioche** (elle reste dessus, on la
  glisse ensuite ; un second clic l'envoie en zone de menace et retourne
  la suivante ; remise sous la pioche ou mélange = face cachée) ;
  « mettre de côté » → zone « De côté, hors jeu » (confirmé) ; zone de
  côté **floutée** (nette au clic, floue en la quittant ; pas de loupe
  tant qu'elle est floue) ; double-clic sur les indices d'un lieu =
  `takeClue` (−1 lieu, +1 réserve du joueur ; aussi dans le menu) ;
  **bouton d'action** (flèche) à droite du nom pendant son tour, −1
  action par clic, désactivé à 0 ; **compteurs dégâts/horreur sur les
  ennemis** en jeu (clic = +1, « − » au survol, menu pour le reste) ;
  une carte sortie d'une pile entre en jeu face visible.
- 2026-09-03 : **jetons du chaos** : SVG générés depuis la police
  d'icônes `tokens.ttf` d'Arkham Cards (zzorba, dépôt public, recette de
  `ChaosToken.tsx` : dégradé radial + couches fill/overlay/highlight) par
  `scripts/build_chaos_tokens.py` → `public/img/chaos/<jeton>.svg`
  (`+`→`p`, `-`→`m`). Utilisés dans la composition du sac, les jetons
  tirés et le panneau d'ajustement. Le dépôt Arkham Cards n'a pas de
  fichier LICENSE : crédit dans le README ; à retirer si l'auteur le
  demande.
- 2026-09-03 : **étape 2 livrée — le tapis est jouable** (The Gathering).
  Serveur (`src/actions.ts`, fonctions pures) : `takeTurn`/`endTurn`,
  `setPhase` (saut direct sans automatisation), `nextPhase` (mythe :
  manche +1, +1 doom, alerte au seuil ; entretien : redressement, 3
  actions ; rappels de phase et `round:n`), `setSeatCounter`,
  `setCounter`, `addToken`, `spendClues`, `moveCard` (engagement par
  dépôt en zone de menace), `toPile`, `flipCard` (refus des dos
  histoire), `revealLocation`, `toggleSide`, `exhaust`, `shufflePile`,
  `drawEncounter` (remélange auto de la défausse), `searchEncounter`
  (message `peek`, pioche ou défausse), `advanceAgenda` (retire tout le
  doom) / `advanceAct`, `chaosDraw`/`chaosReturn`/`chaosAdjust`. Front :
  glisser-déposer (1 message au lâcher) vers tapis, zones de menace, de
  côté, victoire, pioche et défausse ; clic sur un lieu caché = révélation
  + indices ; double-clic = épuiser ; clic droit / appui long = menu
  (agrandir, épuiser, retourner, autre face, jetons ±, défausser, sur/sous
  la pioche, victoire, de côté, sur le tapis, retirer) ; phases cliquables
  + « Phase suivante » ; « Prendre mon tour » / « Fin de mon tour » ;
  compteurs ± ; pioche (piocher, chercher, mélanger, consulter la
  défausse) ; sac (tirer, tirer un autre, tout remettre, ajuster) ;
  agenda/acte (avancer, dépenser des indices). Tests : 41 messages pour la
  séquence complète du test ; captures 07‑09 (menu, tapis, recherche).
- 2026-09-03 : **retours de l'utilisateur sur l'étape 1** appliqués :
  jetons PNG recadrés sur leur disque et rendus transparents (les
  originaux avaient un fond blanc), pions d'enquêteur 44 px avec
  portrait recadré de la carte, loupe dans le coin haut gauche de la
  zone des lieux, indices posés en bas à droite des lieux (sur la
  valeur imprimée), doom en bas à gauche des agendas, dégâts/horreur en
  bas à droite des enquêteurs ; règle « rien n'est jamais bloqué » (§2).
- 2026-09-03 : **première table, étape 1 (lobby + mise en place + tapis
  affiché)** livrée pour *Night of the Zealot I — The Gathering*.
  Pipeline `scripts/build.mjs` (ArkhamDB → `public/scenarios/<id>.json`,
  `public/data/investigators.json`, registre `src/scenarios.generated.ts`),
  source déclarative `data/scenarios/notz_the_gathering.src.json`
  (Setup p. 2 et sac du chaos p. 1 du guide FFG, rien d'autre lu).
  DO : sièges, lobby, `startSetup` (setup automatique), `reset`, `close`,
  `deleteRoom`, `claimHost`, `kick`, deltas JSON Patch. Front : lobby,
  choix d'enquêteur, tapis (zone des lieux zoomable, agenda/acte,
  pioche/défausse/sac en overlay, de côté, victoire, sièges, journal,
  encarts, loupe). Tests : `scripts/test_room.mjs` (bout en bout, 14
  messages entrants pour la séquence), `scripts/captures.py` (Playwright).
  Catalogue : The Gathering `available`, les 10 scénarios PCIO `wip`.
- **Prochaine étape** : retours de jeu réel sur The Gathering (2 navigateurs),
  puis The Midnight Masks (diagramme de placement, cartes de côté selon
  le journal → `pickRandom`, `questions`, `branch`) et The Devourer Below.
  À faire au fil de l'eau : pincer pour zoomer sur tablette, hook
  `onChaosDraw` (jetons scellés), pioches multiples (v2).

## 1. Décisions d'architecture (prises, ne pas rouvrir sans raison)

### Hébergement : Cloudflare Workers + Durable Objects

Choisi pour le modèle « n'importe qui crée une room avec un code et
invite des joueurs » :

- **1 Durable Object = 1 room** (id dérivé du code de room). C'est
  l'acteur qui détient l'état de partie, reçoit les actions des joueurs
  par WebSocket et rediffuse. Serveur autoritaire : les clients ne
  modifient jamais l'état directement, ils envoient des actions ;
  le DO valide, applique, persiste, broadcast.
- **Persistance** dans le stockage SQLite du DO (obligatoire sur le
  plan gratuit, recommandé de toute façon) : une room survit aux
  rafraîchissements, déconnexions et redémarrages ; reprise de partie
  possible via le code.
- **WebSocket Hibernation API** (via la lib PartyServer de Cloudflare,
  dépôt `cloudflare/partykit`, actif en 2026) : une room sans activité
  ne consomme pas de durée facturée.
- **Front statique** (bibliothèque + page room) servi par le même
  Worker (static assets) — un seul déploiement, une seule origine, pas
  de CORS entre front et backend.
- **Plan gratuit** au démarrage : 100 000 requêtes/jour (chaque message
  WebSocket entrant COMPTE comme une requête), 13 000 GB‑s/jour de
  durée, 5 Go de stockage, 100 000 lignes SQLite écrites/jour.
  Passage au plan payant (5 $/mois) si le site prend : aucune
  réarchitecture, juste un changement de plan.
- Conséquences de conception :
  - **Économiser les messages** : envoyer les déplacements de pion /
    de carte au lâcher (drop), pas à chaque mousemove ; grouper les
    actions d'un bouton en 1 message ; l'état complet n'est envoyé
    qu'à la connexion, ensuite des deltas.
  - **Économiser les écritures** : persister l'état par snapshot
    (1 ligne) après chaque action, pas une ligne par objet.
  - **Nettoyage** : alarme DO pour purger une room inactive (TTL à
    définir au questionnaire, ex. 7 jours) ; codes de room courts
    (6 caractères, alphabet sans ambiguïté), sans compte utilisateur ;
    jeton d'hôte stocké côté navigateur.
  - Dev local avec `wrangler dev`, déploiement `wrangler deploy`
    (GitHub → Cloudflare via Workers Builds ou GitHub Actions).

Alternatives écartées : Supabase/Firebase (règles d'accès anonymes à
maintenir, pas de modèle « acteur par room », deux services à câbler),
pair‑à‑pair WebRTC (pas de persistance, fragile aux NAT, pas d'autorité
d'état), GitHub Pages seul (statique : impossible de synchroniser deux
navigateurs).

### Données de jeu

- **Scénario = JSON déclaratif + hooks JS** pour les cas particuliers
  (tirages aléatoires, branches selon le journal, decks rencontre
  multiples…). Architecture commune, spécificités isolées par
  scénario. `scenarios_data.json` est le point de départ des 10 premiers.
- **Cartes** : données ArkhamDB (API publique) figées dans des JSON
  par scénario au moment du build (pipeline Python ou Node), PAS
  appelées en jeu — l'app doit fonctionner même si ArkhamDB est lent
  ou hors ligne. Seules les images sont chargées en jeu.
- **Images** : `https://cdn.arkham.build/optimized/<code>.webp`, dos
  `<code>b.webp` (sondé au build ; cache `ab_probe_webp.json`).
  Dos génériques (rencontre, joueur) embarqués dans l'app. Le CDN doit
  être joignable en jeu — dépendance assumée et documentée à l'écran.
- **Pas de spoiler** : pour construire un scénario on lit UNIQUEMENT la
  section Setup du guide de campagne + le diagramme de placement ; ni
  les résolutions, ni les interludes. Le texte des cartes n'est jamais
  reproduit dans le code (images seulement).

### Fonctionnalités décidées (questionnaire du 2026-09-03)

**Table.** Room de 1 à 4 joueurs. Trois rôles : hôte (créateur,
identifié par un jeton navigateur), joueurs, spectateurs. Sièges non
persistants : à chaque connexion un participant choisit un siège libre
ou entre en spectateur ; un siège est libéré dès la fermeture de la
connexion (événement close côté DO). Un spectateur peut prendre un
siège libre uniquement avant le setup ; le nombre d'enquêteurs est
figé au setup. Réservé à l'hôte : lancer le setup, réinitialiser la
partie, clôturer/supprimer la room ; tout le reste (phases,
agenda/acte, pions, cartes, compteurs) est ouvert à tous les joueurs.
Si l'hôte est déconnecté, tout joueur peut réclamer le rôle (bouton
« Reprendre le rôle d'hôte », transfert du jeton, sans délai). Purge
automatique après 7 jours sans activité (alarme DO). Codes de room :
6 caractères, alphabet sans ambiguïté. V1 = scénario isolé, journal de
campagne rappelé et saisi à la main ; le modèle d'état réserve la place
d'un journal persistant et de l'enchaînement de scénarios (campagne,
v2).

**Siège.** Une carte d'investigateur ArkhamDB choisie dans une liste
(index des investigateurs généré au build), avec compteurs vie, santé
mentale, indices, actions, plus les compteurs spécifiques déclarés par
le scénario ; une zone de menace pour traîtrises, ennemis et assets
histoire. Pas de deck ni de main de joueur en v1 ; ressources hors app.
(V2 possible : import du deck ArkhamDB — nécessiterait un index compact
de toutes les cartes joueur au build + logique de faiblesse aléatoire.)

**Setup.** Au clic de l'hôte : lieux posés selon le diagramme (face
cachée sauf mention), agenda/acte, pioche rencontre mélangée, cartes de
côté, sac du chaos construit d'après la difficulté choisie (lue dans la
section Setup du guide), ajustable ensuite dans un panneau. Les
décisions qui dépendent du journal ou d'un choix sont posées à l'hôte
sous forme de questions bloquantes AVANT l'exécution ; les rappels non
bloquants s'affichent ensuite en encart éphémère sur le tapis ET dans
un panneau « journal de bord » qui conserve l'historique. Indices posés
automatiquement sur un lieu à sa révélation, selon le nombre
d'enquêteurs.

**Tour de jeu.** Bouton « phase suivante » (ouvert à tous) qui exécute
les actions automatiques de chaque phase et affiche ses rappels.
Mythe : +1 doom sur l'agenda automatique ; doom total en jeu (agenda +
ennemis + lieux) compté et seuil signalé ; avancement de l'agenda au
clic, qui retire tout le doom en jeu ; chaque joueur tire sa carte
rencontre au clic dans sa zone de menace. Enquêteurs : compteur de
3 actions par joueur décrémenté au clic, actions supplémentaires
ajoutables. Entretien : remise à zéro des actions. Indices : bouton
« dépenser » sur l'acte qui prélève chez les joueurs (choix du
contributeur si la réserve dépasse le seuil), avancement au clic.
Pioche rencontre : remélange automatique de la défausse quand vide ;
bouton « chercher » qui montre la pioche puis la remélange. Sac du
chaos : clic sur le sac → jeton affiché à tous ; puis « tirer un
autre » (les jetons s'accumulent à l'écran) ou « tout remettre ». Hook
scénario `onChaosDraw` pour les jetons qui retournent au sac ou en
sont retirés une fois tirés.

**Interaction.** Glisser‑déposer des pions et cartes (message au
lâcher). Clic sur un lieu face cachée = révélation + indices. Un
ennemi glissé dans une zone de menace est engagé. Menu contextuel sur
les cartes (épuiser, retourner, défausser, jetons ±) + geste rapide
d'épuisement/redressement pour les ennemis (double‑clic ou bouton sur
la carte, à trancher sur maquette). Zones de table : pioche rencontre,
défausse consultable, cartes de côté, zone de victoire, sac du chaos,
agenda/acte. Loupe : agrandissement de la face visible seulement ; le
dos d'une carte marquée « histoire » n'est jamais affiché. Pas d'undo :
corrections à la main.

**Tapis.** Zones fixes : zone des lieux (seule zone avec
zoom/déplacement), sièges, pioches/défausse/sac, agenda/acte, cartes de
côté, zone de victoire, panneau des rappels. Cibles : ordinateur et
tablette (souris + tactile ; pas de mise en page téléphone). Images
anglaises depuis cdn.arkham.build, une seule langue. Tailles de cartes
et disposition précise à trancher sur maquette.

**Bibliothèque.** Page d'accueil de présentation (avec champ
« rejoindre une room par code »), puis la bibliothèque : tous les
scénarios du jeu, groupés par campagne dans l'ordre de sortie,
scénarios dans l'ordre, chacun avec un état disponible / en cours /
prévu. Pas de liste publique des rooms actives.

### Choix de la première table (2026-09-03, réponses de l'utilisateur)

- **Livraison en deux temps** : étape 1 = lobby + mise en place + tapis
  affiché (à valider visuellement) ; étape 2 = interactions.
- **Ordre des tours libre** : en phase des enquêteurs, le groupe décide
  qui joue ; pas de vote lourd. Mécanique retenue : bouton « Prendre mon
  tour » sur chaque siège (premier clic = tour en cours, mis en évidence),
  « Fin de mon tour » ; les sièges ayant joué sont grisés, `nextPhase`
  s'allume quand tous ont joué (étape 2). La marque ★ « enquêteur
  principal » est choisie au lobby (défaut : premier siège avec
  enquêteur) et n'impose aucun ordre. Réservé dans l'état :
  `lead`, `turn { seat, done[] }`.
- **Épuiser / redresser** : double-clic (double-tap) sur la carte, le
  menu contextuel en plus (étape 2).
- **Première manche** : la mise en place enchaîne directement sur la
  phase des enquêteurs (le mythe est sauté à la manche 1, règle générale).
- **Carte de scénario** posée côté « b » (référence des jetons du chaos).
- **Jetons** posés là où la carte imprime la valeur correspondante :
  indices en bas à droite des lieux, doom en bas à gauche des agendas,
  dégâts/horreur en bas à droite de l'enquêteur, sinon en haut à
  gauche. **Pions** d'enquêteur (44 px, portrait recadré, cercle de la
  couleur de classe) en rangée à cheval sur le bord haut du lieu.
- **Loupe** (survol) dans le coin haut gauche de la zone des lieux.
- **Statuts du catalogue** : `available` = définition présente dans le
  registre ; les 10 scénarios importés de PCIO sont `wip` tant qu'ils
  n'ont pas de `*.src.json` (le Worker refuse de créer une table pour un
  scénario hors registre, quel que soit le statut affiché).

### Pipeline de données (2026-09-03)

`python3 scripts/build_chaos_tokens.py` : jetons du chaos (police Arkham
Cards en cache `data/cache/arkhamcards/`), sorties commitées.

`node scripts/build.mjs` (option `--refresh` pour ignorer le cache
`data/cache/`, non commité) : lit `data/scenarios/*.src.json`, filtre le
pack ArkhamDB par `encounter_code`, écrit `public/scenarios/<id>.json`
(cartes : code, nom, kind, qty, set, dos `b`/`encounter`, `storyBack`,
`clue {value, perInvestigator}`, `doom`, `stage`, `victory`), l'index des
investigateurs (sans `duplicate_of_code` ni `hidden`, parallèles gardés
avec `parallel: true`) et `src/scenarios.generated.ts`. Les sorties sont
commitées (Workers Builds ne relance pas le script). Codes des sets du
Core sur ArkhamDB : The Gathering = `torch`, Midnight Masks = `arkham`,
Devourer Below = `tentacles`, Dark Cult = `cultists`, Cult of Umôrdhoth =
`pentagram` (nom d'icône, pas de titre).

### Choix du cahier des charges (2026-09-03)

- **Identité de siège** : nom optionnel saisi à la connexion ; à défaut
  nom de l'investigateur, sinon « Siège n ». Non persistant.
- **Pioche de rencontre unique en v1** : `piles` reste un dictionnaire
  extensible mais le client n'affiche que `encounter` /
  `encounterDiscard`. Wages of Sin (2 pioches) et Film Fatale (Reel
  deck) sont donc `wip` en v1.
- **Coordonnées libres** sur le tapis (référence 1600 × 1000, cartes
  126 × 178 comme PCIO → topologie des diagrammes réutilisable telle
  quelle), dans des zones fixes (`board` zoomable, `seat0..3`, `story`,
  `aside`, `victory`) ; les piles sont des listes ordonnées sans
  coordonnées. `z` = compteur monotone de la room.
- État = un objet `RoomState` versionné (`rev`), 1 snapshot SQLite par
  action, deltas JSON Patch, état complet au `welcome` seulement.

### Dépôt GitHub et push (2026-09-03)

Dépôt `github.com/Kittiwatt/AHWA`, branche `main`. Claude pousse avec un
token fine-grained (Contents : Read and write, ce seul dépôt, expiration
≈ 1 mois) que l'utilisateur colle **au début de chaque session** ; il
n'est jamais conservé ni écrit dans le dépôt. Commande :
`git push https://x-access-token:<TOKEN>@github.com/Kittiwatt/AHWA.git main`
(filtrer la sortie pour ne pas afficher le token). Un commit par
livraison, message en français.

### Structure du dépôt (2026-09-03)

`public/` (front statique : `index.html`, `scenarios.html`,
`room.html` + `css/site.css`, `css/room.css`, `js/room/*.js` modules ES,
`data/library.json`, `data/investigators.json`, `scenarios/<id>.json`,
`img/dos-rencontre.svg`, `img/tokens/`), `src/` (`index.ts` Worker,
`room.ts` DO, `state.ts` types, `setup.ts` mise en place, `patch.ts`
deltas, `scenario.ts` types du contrat, `scenarios.generated.ts`,
`codes.ts`), `data/` (`scenarios_data.json` source PCIO,
`scenarios/*.src.json` sources déclaratives, `cache/` ignoré), `scripts/`
(`build.mjs`, `test_room.mjs`, `captures.py`), `docs/` (ce mémo, cahier
des charges, règles). Front sans framework ni build : HTML + CSS + JS
vanille, polices Google (IM Fell English pour les titres, Alegreya Sans
pour le texte), palette nuit / papier / dorure. Codes de table affichés
en sans (les chiffres elzéviriens de Fell sont ambigus).

Commandes : `npm run dev`, `npm run check` (tsc + dry-run),
`npm run build:data`, `npm test` (serveur local requis),
`npm run captures` (Playwright/Chromium, captures dans
`/home/claude/captures`).

## 2. Conventions (héritées, toujours valables)

- Tout en français (UI, mémo, commentaires) ; typographie française :
  espaces insécables (U+00A0) avant `: ; ! ?` et à l'intérieur des
  guillemets « » pour éviter les retours à la ligne orphelins.
- Rooms de **1 à 4 joueurs** (nombre figé au setup). Ce qui dépend du journal de campagne ou d'un choix des joueurs
  reste MANUEL, mais l'app doit le RAPPELER au bon moment (message de
  setup, encart sur le tapis).
- **Rien n'est jamais bloqué** (règle posée le 2026-09-03) : les
  automatisations exécutent des actions, mais les joueurs peuvent tout
  modifier à la main, tout le temps, en plus. Le serveur ne refuse une
  action que pour une raison de rôle (hôte) ou d'intégrité (siège pris,
  carte inconnue), jamais parce que « ce n'est pas le moment » :
  « Phase suivante » reste cliquable même si tout le monde n'a pas
  joué, un compteur se modifie dans les deux sens, une carte se
  retourne ou se déplace à tout moment. Les états « tour en cours /
  a joué » sont des indications visuelles, pas des verrous.
- Ordre de mise en place = ordre du diagramme « Suggested Location
  Placement » du guide. Les lieux entrent en jeu face cachée (non
  révélés) sauf mention contraire du Setup.
- Toute livraison : build, tests, vérification visuelle, régression sur
  un scénario existant, mise à jour de ce mémo.

## 3. Acquis ArkhamDB / arkham.build (portables tels quels)

- API : `/api/public/cards/<pack>.json` (filtrer par `encounter_code`),
  `/api/public/card/<code>`, `/api/public/decklist/<id>`,
  `/api/public/deck/<id>` (deck perso : seulement s'il est partageable).
  Sets du Core dans le pack `core`. Cache local systématique.
- CORS : les endpoints publics envoient `access-control-allow-origin: *` ;
  un deck privé/inexistant renvoie une 302 SANS en‑têtes CORS → vu
  comme erreur réseau depuis le navigateur. `cdn.arkham.build` n'a pas
  de CORS : sonder une image avec `new Image()` onload/onerror, jamais
  `fetch`.
- Regex des URLs : « decklist » contient « deck » — tester
  `decklist/view` AVANT `deck/view`. Les URLs `arkham.build/deck/view/<id>`
  d'un deck synchronisé marchent aussi.
- Réimpressions servies sous leur propre code (60108 = 01017 vérifié) :
  pas de mapping.
- Trous ArkhamDB connus : dos absents (sonder `<code>b` : Central Lot
  72008b, Allosaurus 72044b…) ; entrée manquante Josef Meiger 05085
  (synthétiser) ; 60154/60254 sans `imagesrc`.
- Placeholder 01000 « Random Basic Weakness » fréquent : tirage =
  subtype `basicweakness` pondéré par `quantity`, en solo exclure les
  4 multijoueur TDE (06035‑06038) et 60154/60254.
- `taboo_id` d'un deck : informatif seulement (les images montrent le
  texte imprimé).
- Investigateurs neutres TCU (05046‑05049) : cartes de départ parsées
  depuis `back_text` (« 2 copies of X (Core 16 / TCU 21) ») — totaux
  attendus Gavriella 9, Jerome 10, Valentino 8, Penny 11.
- TCU : lieux Spectral 05078‑84 (trait « Spectral. »), normaux 05071‑77.

## 4. Savoir métier déjà encodé (voir `scenarios_data.json`)

10 scénarios avec codes par rôle, sets de rencontre avec quantités,
topologie des diagrammes, tirages aléatoires, branches, et les étapes
restées manuelles en PCIO (= candidates à l'automatisation ici) :

- Standalone : Film Fatale (hub + 3 films, Reel deck).
- The Circle Undone : Prologue, I Witching Hour, II At Death's
  Doorstep, III Secret Name, IV Wages of Sin, V For the Greater Good,
  VI Union and Disillusion. Restent VII In the Clutches of Chaos et
  VIII Before the Black Throne.
- The Drowned City : Prologue « One Last Job ».
- The Dream‑Eaters A : 1‑A Beyond the Gates of Sleep.

Motifs récurrents à modéliser génériquement : lieux tirés au hasard
parmi N ; paires de lieux (1 version sur 2) ; lieux double face
(normal/Spectral) ; deux pioches rencontre ; setup à branches selon le
journal (2 boutons START) ; « stations » d'assets à trier selon le
journal ; cartes de côté (aside) ; ennemis dont le dos est une carte
histoire (ne pas montrer) ; pioche construite avec ordre imposé
(Unknown Places) ; enchaînement de sets (films).

## 5. Pièges connus (à enrichir)

- Assets Workers avec `html_handling: auto-trailing-slash` : demander
  `/room.html` au binding ASSETS renvoie une 307 vers `/room` → toujours
  fetcher l'URL sans extension.
- `partyserver` 0.5 exige `@cloudflare/workers-types` v5 (v4 refusée par
  npm) ; `tsconfig` pointe sur `@cloudflare/workers-types` sans sous-version.
- `wrangler dev` lancé en arrière-plan meurt au premier rechargement si
  son stdin est fermé : le lancer avec `setsid … < /dev/null`.
- Fermeture d'une connexion : le DO libère le siège et recalcule
  `hostConnected` dans `onClose` ; ne pas se fier à `conn.state` après
  la fermeture ailleurs.

- **workerd local** : un WebSocket fermé côté DO (`conn.close(code)`)
  n'achève pas sa fermeture TCP en `wrangler dev` — le client reste en
  `CLOSING` sans événement `close` (Node comme `ws`). En production le
  code (4404, 4411…) arrive immédiatement (vérifié). Les tests locaux
  acceptent `readyState ≥ 2` comme fermeture.
- Fermer une connexion pendant l'itération de `getConnections()`
  interrompt le parcours : figer la liste (`[...this.getConnections()]`)
  avant de fermer ; retirer l'état avant les fermetures (les `onClose`
  ne doivent plus persister).
- `hostSeat` doit voyager dans le message `seats` (les prises de siège
  sont hors `rev`), sinon les états divergent entre clients.
- `hidden` est annulé par un `display: grid` : `[hidden] { display:
  none !important }` sur la page de table.
- Bac à sable de test : Chromium refuse le certificat du proxy pour les
  ressources externes (CDN, polices) → `ignore_https_errors=True`.
- Attentes de messages dans un test WebSocket : consommer dans l'ordre
  (curseur) — chercher « le premier message qui correspond » retombe
  sur d'anciens `seats`, n'attendre que les futurs manque les
  broadcasts déjà reçus par les autres clients.
- `contextmenu` se déclenche à l'enfoncement (Linux/Mac) ou au
  relâchement (Windows) : pour un clic droit glissé, ouvrir le menu au
  `pointerup` sans mouvement et ignorer le `contextmenu` natif pendant
  le tracé et 400 ms après.
- Les cartes du tapis peuvent passer sous l'overlay pioche/sac (bas
  gauche) : elles restent accessibles en déplaçant la vue.
- Éléments de carte réutilisés entre zones : toute propriété de style
  posée par un rendu (position absolue du tapis) doit être effacée par
  les autres rendus, sinon elle « fuit » (carte décalée, invisible).
- Menu contextuel : ne pas fermer le menu dans un `pointerdown` global
  sans vérifier `menu.contains(target)` — le bouton est détaché avant
  que son `click` ne parte.
- Défausse de rencontre : `toPile` y laisse la carte face visible (les
  autres piles la retournent).
- Le mémo PCIO listait 4 scénarios livrés alors que le script en
  contenait 10 : ne jamais inférer l'avancement, le tenir à jour ici.
- Étiquettes : DejaVu ne rend pas ①②③ ; en web, préférer les glyphes
  système ou des SVG.
- Compter les messages WebSocket dès le premier prototype (plan gratuit
  = 100 k/jour tous joueurs confondus).

## 6. Questionnaire des fonctionnalités — thèmes couverts

Déroulé le 2026-09-03, réponses consignées en §1 « Fonctionnalités
décidées ». Liste conservée pour mémoire :

1. Table : nombre de joueurs (1‑4), rôles (hôte/joueur/spectateur),
   codes, durée de vie d'une room, reprise de partie, campagne
   (journal, enchaînement des scénarios) ou scénario isolé.
2. Setup automatisé : ce qui est fait au clic (lieux, agenda/acte,
   rencontre, indices, cartes de côté, sac du chaos par difficulté),
   ce qui est demandé au joueur (journal, choix), affichage des rappels.
3. Actions de jeu automatisées : phases d'un tour (mythe, investigateurs,
   ennemis, entretien), doom et avancement d'agenda, indices et
   avancement d'acte, pioche/défausse/recherche rencontre, tirage
   chaos, compteurs des joueurs (ressources, actions, dégâts/horreur).
4. Interaction : déplacement des pions et des cartes, révélation des
   lieux, zones de menace, engagement, main des joueurs et decks
   joueurs (import ArkhamDB dans la room ? room joueur séparée ?),
   visibilité (cartes cachées, dos histoire), annulation (undo).
5. Tapis : vue (zoom/pan), tailles de cartes, mobile ou non, langue
   des cartes (images ArkhamDB anglaises vs françaises).
6. Bibliothèque : périmètre (campagnes/standalone/rétro), tri, état
   « disponible / en cours / prévu », page d'accueil.

## 7. Points ouverts (à traiter avant le code)

Tranchés le 2026-09-03 : identité de siège, pioches multiples (hors
v1), position des cartes → §1 « Choix du cahier des charges ».

Tranchés le 2026-09-03 (première table) : geste ennemis = double-clic,
ordre des sièges = libre avec « prendre mon tour », disposition des
zones = celle de `room.html`/`room.css` (validée sur captures ; à
ajuster à l'usage), sac par difficulté = champ `chaosBag` du
`*.src.json` (NotZ saisi), rappels = 1 par étape de setup manuelle + 1
par phase (`reminders[]` du `*.src.json`).

- **Marquage « dos histoire »** : `scenarios_data.json` ne les marque
  PAS uniformément (WOS hérétiques via patch b/d/f/h/j/l, `FGG_STORY`,
  TDE Nasht/Kaman-Thah, Josef dans ADD/UAD) → recensement manuel →
  champ `storyBack: [codes]` du `*.src.json` (déjà pris en charge par
  le build).
- **Composition du sac par difficulté** : reste à saisir pour TCU, TDC,
  TDE‑A et Film Fatale (section Setup / encart du guide).
- **Compteurs spécifiques par scénario** : `seatCounters` /
  `tableCounters` du `*.src.json` (vides pour NotZ I) — recenser ceux
  des 10 scénarios PCIO à leur migration.
- (v2) **Pioches multiples** : `piles` extensible déclaré par le
  scénario (`shuffleable`, `discardPile`) — Wages of Sin, Film Fatale,
  Unknown Places.
