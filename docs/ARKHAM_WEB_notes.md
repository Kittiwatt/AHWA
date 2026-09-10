# Bibliothèque de scénarios AHLCG en ligne — Anofelis Web

Mémo de suivi du chantier. **Il fait foi** : conventions, décisions,
pièges, avancement. À lire en début de chaque session, à mettre à jour
à chaque livraison. Le format des `*.src.json` est décrit dans
`docs/GRAMMAIRE_SCENARIOS.md`, **qui fait foi pour le format** ; la
méthode de travail est dans `docs/INSTRUCTIONS_PROJET.md` ; les récits
des livraisons passées sont dans `docs/ARCHIVE_livraisons.md`, indexée
par le tableau du §0 — à ne lire qu'au besoin.

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

Une ligne par livraison, la plus récente en tête ; récit complet dans
`docs/ARCHIVE_livraisons.md` (même ordre). Les derniers récits restent
ci-dessous ; à chaque livraison : nouvelle ligne + nouveau récit, et le
plus ancien des récits récents part **en tête de l'archive**, après
versement de son durable (format → grammaire, piège → §5, décision →
§1, point ouvert → §7).

| Date | Livraison | À retenir |
|---|---|---|
| 2026-09-10 | BoA II — Smoke and Mirrors | 2 cultistes au sac (icône vérifiée), versions Downtown / Uptown au hasard, suspect secret (`pickRandom zone:"aside"`), `bury fromPool` + `under` (cinq suspects + Servant sous six quartiers), pile « Sous l'acte », journal (université) et porteur d'Armitage au lobby |
| 2026-09-10 | UX : jauges des sièges sur deux lignes, case Play compacte | dégâts + horreur / ressources + indices, actions dessous ; case Play en `outline` + badge « Main N » ; même ordre de jauges sur le board joueur ; siège = hauteur de la carte, bandeau du bas 245 → 190 px (deck : 216 → 182), tapis central +55 px |
| 2026-09-10 | BoA I — Spreading Flames | pack `core_2026`, sacs 2026 (tablette, pas de cultiste), un seul lieu + tout de côté, disposition sans diagramme ; effets `discardEnemies` / `discardAside` / `setAside` / `discardAt` / `addClues`, `spawnAside` en liste, `removeLocations codes` ; **première table Brethren of Ash** |
| 2026-09-10 | Bibliothèque : bandeaux de campagne + liens vers les guides | `banner {src, position}` dans library.json, `scripts/build_bandeaux.py` (art de la boîte, découpe par campagne, WebP), libellé de boîte = lien `guide` (renseigné pour toutes les campagnes) |
| 2026-09-10 | TIC VIII — Into the Maelstrom | `keys fillAsideTo`, effets `byPlayers` + `spreadPile flood` (Act 2 Setup selon les joueurs) ; **campagne TIC complète** |
| 2026-09-10 | UX : menu natif du navigateur neutralisé sur la table | `neutraliserMenuNatif`, ordre `contextmenu` Windows (après le `pointerup`), garde `lien.menuVu` |
| 2026-09-10 | TIC VII — The Lair of Dagon | effets `after:<code>`, ordre d'écriture des effets, `removeLocations` / `spreadPile` / `placeAt` / `chaosAdd` / `chaosRemove` ; set Core Dark Cult = `pentagram` |
| 2026-09-10 | TIC VI — A Light in the Fog | `actEffects` + effets d'étape étendus (`revealCodes`, `placeBelow`, `fillRows`, `removeTrait`), Captured! histoire → lieu par `toggleSide` |
| 2026-09-10 | TIC V — Horror in High Gear | `fromPile`, `pickRandom rest:"keep"`, `road` + `roadAhead` (ligne Road X), voitures à deux faces (`toggleSide` sur soutien lié) |
| 2026-09-10 | TIC IV — Devil Reef | véhicule porteur de pions, `placeAround dir`, `flood.onRevealByCode`, verso-ennemi d'agenda, piles Tidal Tunnels / Unfathomable Depths |
| 2026-09-10 | Mémo scindé, dépôt source de vérité | tableau + archive, instructions dans docs/, cycle « un commit » |
| 2026-09-10 | GRAMMAIRE_SCENARIOS.md | référence du format `*.src.json`, fait foi |
| 2026-09-09 | TIC III — In Too Deep | `barriers`, question `multi`, agendaEffects complets, clé noire |
| 2026-09-08 | COB III — Blood Money (+ correction tablette/cultiste I‑II) | `cardSeal`, `remove n`, pile Invités sauvés ; **campagne COB complète** |
| 2026-09-08 | COB II — New Horizons | `chaosAdd nFrom`, `chaosSet`, jour/nuit, grottes de côté face cachée |
| 2026-09-08 | COB I — River of Blood | jeton `blood`, `seal`, `bury`/`enfouir()`, `branch difficulty`, `scenarioCardSide`, seatCounters rendus |
| 2026-09-08 | Build : migration vers arkham.build | dump unique en cache, `linked_card` reconstruit, Josef natif |
| 2026-09-09 | TIC II — The Vanishing of Elina Harper | `leadsDeck` + `leads` (Parley, accusation), `agendaEffects`, `chaosRemove` |
| 2026-09-09 | Sac sur Commit + Auto-pay depuis la défausse | popover du sac sans pointer-events |
| 2026-09-09 | « Voir sur ArkhamDB » au menu | jamais sur un dos |
| 2026-09-09 | Menu de pile sur la défausse du board | étiquettes de pile cliquables |
| 2026-09-09 | UX 2e salve board + tapis | jauges uniformisées (`chipJauge`), hors jeu en pile unique |
| 2026-09-09 | UX board joueur (deux retours) | « Rechercher (sans mélanger) », minis sur « Mon lieu » |
| 2026-09-09 | TIC I — The Pit of Despair | `keys colors`, inondation + marée (`flood`), `formPile`, `placeAround`, `menuFor`, `randomKey` |
| 2026-09-09 | Jauge d'Uses en chip + visuel Auto-pay | clic = −1, `chip-plus` = +1 |
| 2026-09-09 | UX 4e salve | AP au survol, `p:put` sans coût, fin des encarts plein écran |
| 2026-09-09 | UX 3e salve | sac en colonne droite, pions ± en pastille, loupe différée |
| 2026-09-09 | Pions d'utilisation par type | `uses_tokens.json`, 18 pions, repli `uses.png` |
| 2026-09-09 | UX 2e salve (Commit volant) | case Play au siège, totaux d'icônes de compétence, plein écran |
| 2026-09-09 | Colonnes latérales page joueur | largeur carte + 3 rem |
| 2026-09-08 | Correctif nomenclature Play/Commit | `pevent` = un événement joué, en jeu reste `pplay` |
| 2026-09-08 | Retours push 2 — mise en page joueur | cartes 113 × 160, entête compacte, colonne « Mon lieu » |
| 2026-09-08 | Retours push 1 — règles et nomenclature | ressources ≥ 0, « Autre face » cartes joueur liées, bandes Play/Commit |
| 2026-09-08 | Board joueur, étape 3 — jouer | `p:play/commit/resolve/toLocation`, badges de slot |
| 2026-09-07 | Board joueur, étape 2 — mise en place | `p:setup/mulligan/draw…`, entretien auto, pile `pweak` |
| 2026-09-07 | Board joueur, étape 1 — import du deck | `player_cards.json`, code de siège (pin), page joueur |
| 2026-09-05 | Double-clic sur un lieu = retourner | garde 800 ms après révélation |
| 2026-09-04 | Enquêteur personnalisé | `custom:<siège>`, formulaire au lobby |
| 2026-09-04 | TCU VIII — Before the Black Throne | `emptySpace`, pile Cosmos, `chaosAdd byDifficulty`, jeton −7 ; **campagne TCU complète** |
| 2026-09-04 | TCU VII — In the Clutches of Chaos | `randomTokens`, `mythosDoom: false`, `randomPick`, `rest: "pile"` |
| 2026-09-04 | TCU VI — Union and Disillusion | `when`/`Cond`, `addDoom nFrom`, douze questions |
| 2026-09-04 | TCU V — For the Greater Good | kind `key` (op `keys`), `story` ignore les retraits |
| 2026-09-04 | TCU IV — The Wages of Sin | `buildEncounter split`, deux pioches (`piles` trait/discard) |
| 2026-09-04 | TCU III — The Secret Name | `layeredPile`, `backName` partout, `removeLocations`, `swaps` |
| 2026-09-04 | TCU II — At Death's Doorstep | question `number`, `removeClues`, `swapLocation`, rappels `act/agenda:N` |
| 2026-09-04 | TCU I — The Witching Hour | `dealToSeats`, `aside sets`, verso-lieu + `backPlacement`, `packs` multiples |
| 2026-09-03 | Projet créé par migration | kit PCIO importé (mémo, scenarios_data, livrets, jetons) |
| 2026-09-03 | Questionnaire des fonctionnalités | consigné en §1 |
| 2026-09-03 | Cahier des charges + modèle d'état | `CAHIER_DES_CHARGES.md` fait foi (modèle, protocole) |
| 2026-09-03 | Squelette v0 | DO partyserver, hibernation, snapshot SQLite, purge 7 j |
| 2026-09-03 | Déployé | `ahwa.rivardlaudelex.workers.dev`, Workers Builds sur `main` |
| 2026-09-03 | NotZ III — The Devourer Below | `pickRandom positions`, `pickRandomSet`, `addDoom`, lien Guide ; **campagne NotZ complète** |
| 2026-09-03 | Outil « Générer une carte » | `cards_index.json`, `extraDefs` |
| 2026-09-03 | NotZ II — The Midnight Masks | `pickRandom` + `slot:`, `branch`, `spawn`, `toPile`, questions au lobby, cartes liées |
| 2026-09-03 | Ennemis : compteur de dégâts seulement | pas d'horreur sur les ennemis |
| 2026-09-03 | Encart pioche / défausse / sac compacté | gestes clic / clic droit / survol |
| 2026-09-03 | Pioche de rencontre, règle simplifiée | refus sans trace (snapshot `before`) |
| 2026-09-03 | Agenda / acte « physiques » | une carte, un seul endroit ; `sortieHistoire` |
| 2026-09-03 | Remise à zéro des tables : ÉCHEC, annulé | migrations DO refusées ; check-runs pour vérifier un déploiement |
| 2026-09-03 | Carte disparue à la défausse | styles absolus effacés hors tapis |
| 2026-09-03 | 3e salve tapis | z-index par kind, jauges des soutiens du scénario |
| 2026-09-03 | 2e salve tapis | un lieu emporte pions et cartes, chemins entre lieux |
| 2026-09-03 | 1re salve tapis | reprise de siège, piocher = retourner, `takeClue`, bouton d'action |
| 2026-09-03 | Jetons du chaos en SVG | `build_chaos_tokens.py`, police Arkham Cards |
| 2026-09-03 | Étape 2 — tapis jouable (The Gathering) | `actions.ts`, gestes du tapis, sac |
| 2026-09-03 | Retours sur l'étape 1 | jetons recadrés, règle « rien n'est jamais bloqué » |
| 2026-09-03 | Étape 1 — première table (The Gathering) | pipeline de build, lobby, tapis, tests + captures |

### Derniers récits

- 2026-09-10 : **Smoke and Mirrors (BoA II) livré** — Setup p. 6 +
  diagramme p. 7 (grille 3 × 3 : Northside, Downtown, Easttown /
  Miskatonic University, Merchant District, Waterfront District / Uptown,
  Southside, French Hill ; codex p. 8‑9 et résolutions p. 10 **non
  lus**). Sets `smoke_and_mirrors`, `arcane_lock`, `arkham_ch2`,
  `bad_weather`, `dead_ends`, `flying_terrors`, `gangs_of_arkham`,
  `people_of_arkham`, `whippoorwills_ch2` ; pioche 23. Le guide ajoute
  **2 cultistes au sac « pour le reste de la campagne »** (icône lue à
  600 dpi : capuche à pointe et visage — c'est bien le cultiste, absent
  du sac de base) : `chaosAdd` loggé, inconditionnel ; le journal du I
  n'est pas lu → rappel « ajustez le sac » si le journal l'exige.
  Lobby : deux questions du journal — université brûlée (12155 In
  Flames) ou sauvée (12156 Quiet Campus, +1 doom), porteur de Dr.
  Armitage (12115 en `extraCards` du set du I : de côté + rappel
  « glissez-le sur son siège », sinon retiré). Réutilisé :
  `pickRandom` + `slot` pour les deux versions de Downtown et d'Uptown
  (dos identiques, `nomVisible` ne donne pas le sous-titre : tirage
  secret, l'autre retirée), `place` révélé + `minis` pour l'université,
  `branch on:"players"` → `addDoom` (1 par enquêteur) puis `when` →
  +1, `aside` des 4 Mark of Elokoss, **pile déclarée `menuFor:
  ["enemy"]` = « Sous l'acte »** (suspects interrogés ; les vaincus en
  zone de victoire — l'objectif compte les deux). Nouveau : **`pickRandom
  zone:"aside"`** sans coordonnées (le suspect tiré au hasard est mis
  de côté face cachée sans être regardé, `rest:"keep"` laisse les cinq
  autres au pool) et **`bury fromPool` + `under`** (les cinq suspects
  restants + Servant of Flame « On the Run » pris au pool **avant**
  `buildEncounter`, mélangés, un sous chacun des six quartiers nommés —
  codes ou slots — avec la même mécanique que les repaires de COB :
  z sous le lieu, seul le bas dépasse, menu → Retourner). Rappels :
  cartes enfouies, codex (lien Guide, p. 8‑9), suspects et pile,
  mots-clés p. 7 (Alert, Aloof, Elusive), verso de l'agenda 1 (Mark of
  Elokoss à distribuer, porteurs au journal). Tests : 719 messages
  (bloc Smoke : sac 18 dont 2 cultistes, une version par paire et
  l'autre retirée, journal muet sur les versions et les suspects, MU
  révélée avec pions, une carte enfouie sous chacun des six quartiers
  et aucune sous les trois autres, codes enfouis = les cinq non tirés
  + Servant, pioche 23, doom 2, pile vide puis un suspect retourné et
  placé sous l'acte ; solo Expert université sauvée sans porteur : sac
  20, doom 2, Armitage retiré, agendas jusqu'au bout) ; captures
  103‑104 (bloc rejoué en autonome avec Spreading Flames en
  régression). Catalogue et README.


- 2026-09-10 : **UX : jauges des sièges sur deux lignes** — demande de
  l'utilisateur (capture à l'appui) : sur la page de table, la colonne
  de jauges à côté de la carte d'enquêteur (quatre chips empilées +
  ligne « Actions », 165 px) dépassait de 55 px la carte (110 px) et
  fixait seule la hauteur du bandeau du bas, au détriment du tapis
  central. Nouvelle disposition (`rendreSieges`, `room.css`) : la
  `.jauges-inv` du siège devient une grille à deux colonnes — première
  ligne **dégâts + horreur**, seconde **ressources + indices** (ordre
  des chips inversé dans `tapis.js`), compteurs du
  scénario à la suite (COB : « Sang scellé » seul sur une troisième
  ligne, colonne 129 px), et la ligne des actions en dessous, libellé
  resserré contre les pastilles (`.siege .compteur.actions`, colonnes
  `auto auto`). Colonnes en `minmax(5.4rem, max-content)` : le « − »
  qui apparaît au survol d'une chip tient dans sa colonne et ne décale
  ni sa voisine ni la ligne suivante (vérifié en capture). Deux
  compléments tranchés par Claude (l'utilisateur a laissé le choix) :
  **case Play compacte** — avec un deck importé, la case Play +
  « Main N » (143 px) redevenait l'élément le plus haut du bandeau ; la
  case fait désormais exactement la taille de la carte (`.play-siege`
  78 × 110), son cadre pointillé est dessiné en `outline` /
  `outline-offset: 3px` hors de la boîte et « Main N » devient un
  **badge de coin** (`.badge-main`, comme le compte des pioches,
  infobulle « N cartes en main ») ; et **même ordre de jauges sur le
  board joueur** (entête : dégâts, horreur, ressources, indices, puis
  compteurs du scénario) pour une seule logique partout. Mesures
  (1600 × 1000, The Gathering) : colonne 94 px, corps du siège 165 →
  110 px, bandeau `#sieges` 245 → 190 px (siège avec deck : 216 → 182),
  zone des lieux 662 → 716 px ; en 1366 × 768 : 437 → 492 px. Tests :
  régression `test_room.mjs` OK (694 puis 689 messages), `npm run
  check` zéro erreur ; captures par script autonome (avant / après,
  survol, COB, deck avant / après mise en place — badge « Main 5 »,
  entête du board, 1366 × 768), zéro erreur console.
- 2026-09-10 : **Spreading Flames (BoA I) livré — première table de la
  nouvelle boîte de base Brethren of Ash (ahc100, 2026)**. Guide : seules
  les p. 2 (Campaign Setup) et 3 (Setup du I) ont été lues ; **aucun
  diagramme de placement** pour ce scénario (un seul lieu en jeu, les
  cinq autres de côté). Sac par difficulté lu sur l'image à 600 dpi et
  **vérifié glyphe à glyphe contre tokens.ttf** (corrélation 0,985) :
  2 crânes, tablette, elder thing, auto-fail, elder sign — aucun
  cultiste, comme COB ; nombres du Core classique. Pack arkham.build
  **`core_2026`** (cycle `core_ch2`), sets `spreading_flames`,
  `miskatonic_university`, `ashen_pilgrims`, `bystanders`,
  `cosmic_evils`, `eldritch_lore`, **`fire_ch2`** (Fire! ×5 + Noxious
  Smoke ; le set `fire` est un autre set), `hallucinations`,
  `mad_science` ; pioche 24 ; images recto/verso vérifiées sur la CDN.
  Carte de scénario Easy/Standard au recto, Hard/Expert au verso
  (`scenarioCardSide` comme COB). Setup : Your Friend's Room révélée
  avec pions (365 × 411), cinq lieux de côté non révélés, Fire! ×5 +
  Dr. Armitage + Servant of Flame de côté face visible, pas de question
  (scénario I, sac de campagne). **Disposition déduite des icônes de
  connexion des cartes** (images CDN) : chambre → Dortoirs (551) →
  Quad (737, centre) → Science Hall / Warren Observatory / Orne Library
  en colonne à 923 (rangées 173 / 411 / 649) ; notée dans `_source` et
  un rappel. **Versos des actes 1‑3 et de l'agenda 2 appliqués par les
  effets d'étape** (lus dans le dump, jamais recopiés) avec `placeAt`,
  `spawnAside`, `removeLocations` et cinq effets génériques ajoutés :
  `discardEnemies` (ennemis de rencontre du tapis et des zones de menace
  → défausse, les ennemis de deck joueur restent), `discardAside {code,
  n?}` (copies de côté → défausse ; 4 au verso de l'agenda 2, toutes au
  verso de l'acte 1 après l'attache), `setAside` (le Servant revient de
  côté soigné d'où qu'il soit, zone de victoire comprise), `discardAt`
  (l'attache de la chambre défaussée avant son retrait), `addClues` par
  enquêteur (3 par enquêteur au Quad, révélé ou non) ; `spawnAside`
  accepte une **liste** et prend d'abord la copie **de côté** (jamais
  une Fire! de la défausse) ; `removeLocations {codes}` (la chambre
  seule, sans Victory → retirée) ; les liens d'un lieu retiré sont
  effacés. L'attache Fire! = `spawnAside` sur le lieu (elle suit le
  lieu). Reste manuel avec rappels : Armitage à glisser sur un siège
  (sans slot d'allié), recherche de Fire! par l'enquêteur principal,
  tests des versos d'agenda, effet Forcé de l'agenda 3, pions à sortir
  de la chambre retirée, mots-clés du guide p. 3 (Doomed, Peril, Prey,
  Retaliate, Surge). Tests : 705 messages (bloc Flames : sac 16 avec
  tablette, 12 de côté, pioche 24, acte 2 avec ennemis du tapis et de
  la zone de menace défaussés / Armitage épargné / lieux posés /
  Servant / Fire! attachée / 4 à la défausse, acte 3 avec Servant
  blessé en zone de victoire remis de côté soigné / attache défaussée /
  chambre retirée / bâtiments posés, acte 4 avec 6 indices au Quad ;
  solo Expert : sac 18, verso b, agenda 2 avancé d'abord → 4 Fire! à
  la défausse, la dernière s'attache ensuite) ; captures 100‑102 (le
  `captures.py` complet a tué `wrangler dev` : bloc rejoué en script
  autonome avec Maelstrom en régression). Catalogue : `boa` disponible
  avec lien guide ; README.


- **Prochaine étape** : retours de l'utilisateur sur le bandeau des
  sièges (jauges sur deux lignes, case Play compacte, ordre du board
  joueur) et sur Spreading Flames et Smoke and Mirrors (première
  campagne Core 2026 : disposition sans diagramme, attache Fire!, versos
  automatisés, suspects enfouis, pile « Sous l'acte ») ; **question ouverte** : le journal du I modifie-t-il
  le sac (résolutions non lues — l'utilisateur peut fournir un extrait,
  sinon le rappel « ajustez le sac » suffit). Puis **BoA III — Queen of
  Ash** (Setup p. 12, codex p. 13 à ne pas lire hors instruction ;
  Elokoss 12179 à verso lié `12179b`, sets `queen_of_ash`,
  `arkham_sewers`, `cultists_ch2`, `reeking_decay`, `torment`, Servant
  « A Willing Sacrifice » 12180 ; les 2 cultistes du II restent au
  sac ; questions de journal d'après le Setup seul — demander un extrait
  si un report l'exige ; **campagne BoA complète** ensuite). Toujours
  en attente : retours sur la campagne TIC complète (I‑VIII) ; visuels
  PNG des clés et du jeton d'inondation à générer dans le style des
  jetons du projet (choix B). En parallèle : la suite des retours de
  test du board joueur et les points ouverts du cahier §10.10
  (customisations, decks annexes, attaches).
  Ensuite le prologue
  Disappearance at the Twilight Estate (pack `tcu`, set
  `disappearance_at_the_twilight_estate` : choix des enquêteurs neutres
  05046‑49, lieux 05071‑77 / Spectral 05078‑84 à réutiliser), puis le
  chantier convenu avec l'utilisateur :
  **rangement de la zone hors jeu** (tri par groupes ou piles nommées ;
  VI atteint 26 cartes de côté). Après quoi : retours de jeu sur les
  huit tables TCU. Jetons de campagne : reportés par les questions
  d'introduction, de la Loge et de The Black Book ; à chaque nouveau
  scénario, relire les résolutions précédentes pour les ajouts.
  Chantier possible : un compteur de doom / une ligne de journal par
  pioche pour les scénarios à deux pioches. À faire au fil de
  l'eau : étiquette de rangée sur le tapis (« devant X »), pincer pour
  zoomer sur tablette, chemins pré-tracés depuis les connexions
  imprimées, hook `onChaosDraw` (jetons scellés), pioches multiples
  (v2), boutons scénario (`actions`, cahier §5, non implémentés).

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
- **Lecture du guide, spoiler** (règle changée le 2026-09-03 à la
  demande de l'utilisateur) : Claude lit l'INTÉGRALITÉ du guide de
  campagne (mise en place, résolutions, interludes, journal) pour
  anticiper les dépendances et automatisations d'un scénario au suivant
  (questions de journal, cartes conditionnelles, prochains scénarios).
  Le spoiler à éviter est celui de l'utilisateur : dans ses messages et
  dans l'application, Claude ne restitue ni le récit, ni les
  résolutions, ni les interludes ; seules apparaissent les questions et
  rappels que la mise en place exige, formulés sans dévoiler leur
  contexte. Claude prévient quand un résultat d'outil contient le texte
  du guide. Le texte des cartes n'est jamais reproduit dans le code
  (images seulement).

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
et disposition précise à trancher sur maquette. **Sièges** (bandeau du bas, décision
de l'utilisateur du 2026-09-10) : la colonne de jauges tient dans la
hauteur de la carte d'enquêteur — deux jauges par ligne (dégâts + horreur,
puis ressources + indices, compteurs du scénario à la suite), actions en
dessous, case Play à la taille de la carte avec « Main N » en badge ; la
hauteur du bandeau est réservée au tapis central. Le board joueur montre
les mêmes jauges dans le même ordre, sur une rangée.

**Bibliothèque.** Page d'accueil de présentation (avec champ
« rejoindre une room par code »), puis la bibliothèque : tous les
scénarios du jeu, groupés par campagne dans l'ordre de sortie,
scénarios dans l'ordre, chacun avec un état disponible / en cours /
prévu. Pas de liste publique des rooms actives. En‑tête de campagne =
bandeau (décision du 2026-09-10) : l'art de la boîte (couverture du
guide FFG, à défaut du livret de règles) découpé par
`scripts/build_bandeaux.py`, titre par‑dessus, bords fondus ; le libellé
de boîte est le lien vers le guide (`guide` de `library.json`).

### Board joueur (questionnaire du 2026-09-07, réponses de l'utilisateur)

Détail et modèle dans le cahier des charges §10 ; ici l'essentiel.

- **Structure** : page joueur `/r/<code>/j/<n>` sur la **même table**
  (même état, même DO), second onglet ou second appareil ; pas de room
  séparée. Main **masquée à l'affichage** chez les autres (dos +
  nombre, bouton « Regarder »), l'état reste partagé ; carte
  « révélée » possible. **Code de siège** à 4 chiffres (`Seat.pin`,
  affiché sur le tapis) pour joindre un siège déjà occupé depuis un
  second appareil : plusieurs connexions par siège, libéré à la
  dernière fermeture ; la reprise automatique mémorise siège + pin.
  Board d'un autre joueur = **lecture seule** (nouveau motif de refus
  `siege` pour les actions `p:*`, seule exception à « ouvert à tous »).
- **Import** au lobby seulement, par lien ArkhamDB (deck partageable ou
  decklist) ou arkham.build (share ou deck synchronisé) ; l'enquêteur
  est **déduit** (recto parallèle via `meta.alternate_front`). Fetch
  côté DO. Placeholder 01000 → « Tirer au hasard » (pondéré, solo sans
  06035‑38) ou « Choisir… » ; non résolu au Lancer → tirage. Cartes
  liées (`bonded_to` = nom, `bonded_count`) créées hors jeu ;
  permanents et « You begin the game with X in play » (texte de
  l'enquêteur, regex au build) en jeu à la mise en place. Index
  `public/data/player_cards.json` au build, lu par le DO à l'import ;
  définitions dans `state.extraDefs`.
- **Mise en place** : rien ne part tout seul — bouton « Mise en place »
  sur la page joueur (mélange, permanents, +5 ressources, main de 5,
  faiblesses mises de côté puis remélangées), puis **mulligan par
  sélection, une seule fois** (ou « Garder ma main »).
- **Zones** par siège : pioche (`pdeck`, « réserve »), main (`phand`),
  en jeu (`pplay`, libre, badge de slot + occupation dans la barre), en
  cours / limbes (`plimbo`, bouton « Résolu » → défausse, menu « Garder
  en jeu »), défausse (`pdiscard`), **hors jeu = mises de côté**
  (`paside`), zone de menace = `seat<n>` partagé ; exil → `removed`.
- **Jeu** : auto-pay au dépôt main → en jeu (X demandé, **jamais
  bloqué**, négatif surligné, « Mettre en jeu sans payer ») ; jetons
  Uses (chip générique, images plus tard) et jauges des alliés posés à
  l'entrée en jeu ; **entretien automatique** par `nextPhase` de la
  table (pioche 1, +1 ressource, redressement, rappel main > 8) ; pioche
  vide = défausse remélangée + **rappel** « 1 horreur » ; boutons :
  piocher 1 / N (clic sur la pioche = en main), mélanger, sur / sous la
  pioche, chercher, regarder les n premières, défausser au hasard,
  révéler, défausse consultable ; faiblesse piochée = comme une carte,
  le joueur fait tout ; « Poser sur mon lieu » / « Reprendre ».
- **Page joueur** reprend de la table : sac du chaos, barre de phase et
  « Phase suivante », tour et actions, zone de menace (pas le journal).
  Sur le tapis : compteur **ressources** sur le siège, bouton « Voir le
  board », rien d'autre. PC et tablette seulement.
- **Livraison** en trois étapes : page et import ; mise en place et
  mulligan ; jeu (limbes, auto-pay, entretien, boutons).

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
  menu contextuel en plus (étape 2). Exception demandée par l'utilisateur
  le 2026-09-05 : sur un **lieu du tapis**, le double-clic le **retourne**
  (face révélée ↔ face non révélée ; lieu à deux faces de jeu → bascule
  de face ; lieu caché → révélation avec indices). Un clic simple qui
  vient de révéler le lieu neutralise le double-clic qui le suit (garde
  de 800 ms), sinon le second clic le retournerait aussitôt.
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
Devourer Below = `tentacles`, Dark Cult = `pentagram` (Acolyte, Wizard
of the Order, Mysterious Chanting), Cult of Umôrdhoth = `cultists` (les
5 cultistes nommés) — noms d'icône, pas de titre ; vérifiés le
2026-09-03. L'agenda 01121a a une `linked_card` 01121b (son verso).

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
livraison, message en français, auteur `Claude (Anofelis)
<claude@anofelis.local>` (même identité pour tous les commits).

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

- Arkham Cards (github.com/zzorba/ArkhamCards) : polices d'icônes
  `assets/arkhamicons.ttf` (+ `arkhamicons-config.json` : slots, vie /
  santé mentale, factions, compétences, action / réaction / libre,
  per_investigator, chiffres), `tokens.ttf` (jetons du chaos, déjà
  utilisée), `cardicons.ttf` ; aucune image par type d'Uses. Recette de
  rendu : glyphe SVG via fontTools, centré dans une pastille
  (`scripts/build_slot_icons.py`).

- **Le build lit arkham.build, plus ArkhamDB** (2026-09-08) :
  `api.arkham.build/v1/cache/cards` (dump unique de toutes les cartes,
  champs `real_*`, ~5,4 Mo) + `/v1/cache/metadata` (`pack[].real_name`,
  `card_encounter_set[].real_name`, cycles, campagnes). Particularités
  du dump : variantes taboo en entrées séparées (`id` = « code-taboo »,
  filtrer `id === code`) ; versos de cartes liées en entrées `hidden`
  référencées par `back_link_id` du recto (01121a → 01121b, 05055 →
  05055b, Josef 05085 → 05085b : le recto existe toujours) ; pas de
  `bonded_to`/`bonded_count` (reconstruits : regex sur `real_text` +
  trois exceptions), pas d'`imagesrc` (`official` fait foi, le CDN a
  tout, versos compris) ; `cost -2` = X comme ArkhamDB ; `clues_fixed`,
  `duplicate_of_code`, `alternate_of_code`, `subtype_code`,
  `skill_*`, `permanent`, `restrictions` présents.
- API ArkhamDB (encore utilisée à l'exécution pour l'import de deck) :
  `/api/public/cards/<pack>.json` (filtrer par `encounter_code`),
  `/api/public/card/<code>`, `/api/public/decklist/<id>`,
  `/api/public/deck/<id>` (deck perso : seulement s'il est partageable).
  Sets du Core dans le pack `core`. Cache local systématique.
- CORS : les endpoints publics envoient `access-control-allow-origin: *` ;
  un deck privé/inexistant renvoie une 302 SANS en‑têtes CORS → vu
  comme erreur réseau depuis le navigateur. `cdn.arkham.build` n'a pas
  de CORS : sonder une image avec `new Image()` onload/onerror, jamais
  `fetch`.
- Deck joueur (vérifié le 2026-09-07) : `/api/public/deck/<id>.json`
  et `api.arkham.build/v1/public/share/<id>` renvoient les mêmes
  champs ; `meta` est une chaîne JSON (`alternate_front` = recto
  parallèle, `cus_<code>` = customisations « index|xp,… ») ;
  `ignoreDeckLimitSlots` peut être `null`. Cartes : `cost` `null` = —,
  `-2` = X ; `bonded_to` (NOM) + `bonded_count` sur la carte liée
  seulement ; « Uses (n type) » et « You begin the game with X in play »
  n'existent que dans `real_text` ; `permanent`, `real_slot`
  (« Hand », « Hand x2 », « Arcane », « Ally », « Body »,
  « Accessory », « Tarot », « Head », « Hand. Arcane »…),
  `subtype_code` `weakness` / `basicweakness`, `health` / `sanity`
  des alliés, `alternate_of_code` des parallèles, `hidden` pour 01000.
  `/api/public/cards/?encounter=0` = 1 983 cartes joueur (dont 105
  enquêteurs), pas 3 500. `arkham.build/deck/view/<id>` non numérique =
  deck local au navigateur, injoignable (demander « Share »). Deck
  ArkhamDB privé : l'API répond par une redirection (fetch avec
  `redirect: "manual"` pour la voir). Decklists utiles aux tests :
  31000 (Mark Harrigan, Hallowed Mirror → 3 Soothing Melody 05314
  liées), 44000 (Roland, un placeholder 01000), deck 6295400
  (Pete parallèle 90046, customisations, taboo 10).
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
- Codes des sets TCU sur ArkhamDB (pack `tcu`, vérifiés le 2026-09-04) :
  `the_witching_hour` (05050‑64), `disappearance_at_the_twilight_estate`
  (05043‑49), `at_deaths_doorstep` (05065‑85), `the_watcher`,
  `agents_of_azathoth` (05088‑89), `anettes_coven` (05090‑91),
  `witchcraft` (05092‑94), `silver_twilight_lodge` (05095‑97),
  `city_of_sins` (05098‑99), `spectral_predators`, `trapped_spirits`,
  `realm_of_death` ; sets du Core : `ancient_evils`, `striking_fear`,
  `agents_of_shub` (01179‑80), Arkham Woods 01150‑55 (set `tentacles`).
  L'acte 05055 a une `linked_card` 05055b de type location (verso-lieu) ;
  05085b (Josef's Plan) est listé comme carte à part.
- The Innsmouth Conspiracy (vérifié le 2026-09-08) : pack **`tic`**
  (107 cartes de rencontre, `?encounter=1`) ; packs Mythos `itd`, `def`,
  `hhg`, `lif`, `lod`, `itm` ; `ticp` / `ticc` = rééditions
  Investigator / Campaign Expansion. Sets du pack `tic` :
  `the_pit_of_despair` (07041‑55), `the_vanishing_of_elina_harper`
  (07056‑83), `agents_of_dagon`, `agents_of_hydra`,
  `creatures_of_the_deep` (07088‑90), `rising_tide` (07091‑93),
  `fog_over_innsmouth`, `shattered_memories` (07096‑98), `malfunction`,
  `syzygy`, `flooded_caverns` (07102‑04, lieux ×2), `the_locals` ; Agents
  of Cthulhu = `agents_of_cthulhu` (Core, 01181‑82), Rats = `rats`. Les
  lieux « Tidal Tunnel » sont `double_sided` avec `back_name: "Tidal
  Tunnel"` (donc `backName`, nom masqué tant qu'ils ne sont pas
  révélés). Enquêteurs TIC 07001‑07005 présents dans
  `investigators.json`. Images recto/verso de tout le scénario I
  vérifiées sur la CDN (200).
- **Core Set 2026 / Brethren of Ash** (vérifié le 2026-09-10) : pack
  arkham.build **`core_2026`** (cycle `core_ch2`, `rcore` = Revised Core,
  `core` = Core 2016), 92 entrées de rencontre 12105‑12195. Sets :
  `spreading_flames` (12105‑15 : scénario, agendas 12106‑08, actes
  12109‑12, Your Friend's Room 12113, Servant of Flame 12114 « Raging
  Fury », Dr. Henry Armitage 12115 asset), `miskatonic_university`
  (12116‑20), `ashen_pilgrims`, `bystanders`, `cosmic_evils`,
  `eldritch_lore`, **`fire_ch2`** (12129 Fire! ×5, 12130 Noxious Smoke
  ×2 — le set `fire` est un autre set), `hallucinations`,
  `mad_science` ; II : `smoke_and_mirrors` (12133‑38 dont Mark of
  Elokoss ×4 subtype weakness, Servant « On the Run » 12138),
  `people_of_arkham` (six personnages Elite 12139‑44), `arkham_ch2`
  (douze lieux d'Arkham 12145‑56, MU « In Flames » / « Quiet Campus »
  en paire), `arcane_lock`, `bad_weather`, `dead_ends`, `flying_terrors`,
  `gangs_of_arkham`, `whippoorwills_ch2` ; III : `queen_of_ash` (12168‑81,
  **Elokoss 12179 à verso lié `12179b`** « Mother of Flame », Servant
  « A Willing Sacrifice » 12180, Collector ×2 asset), `arkham_sewers`
  (12182‑87), `cultists_ch2`, `reeking_decay`, `torment`. Aucun
  `clues_fixed` sur ces lieux (tout par enquêteur ; Miskatonic Quad et
  Sewer Culvert n'impriment aucun indice). Images recto/verso de tout
  le scénario I vérifiées sur la CDN (200 ; les cartes à dos de
  rencontre n'ont pas de `b`). Guide ahc100 : 16 pages, Campaign Setup
  p. 2, Setup I p. 3 (sans diagramme), II p. 6‑7 (diagramme p. 7,
  codex p. 8‑9), III p. 12 (codex p. 13), journal p. 15.

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

- **Dump arkham.build** (2026-09-08) : ne jamais déduire le recto d'un
  verso par le code (`01121b` ↔ recto `01121a`, pas `01121`) — passer
  par l'ensemble des `back_link_id` ; `bonded_count` ≠ quantité pour
  06025 / 06028 / 06283 (imprimées ×2, liées ×1) ; `86024b` Hub
  Dimension est le seul verso sans entrée (double face sans lien) ;
  **12032** y est correct (volonté) là où ArkhamDB dit intellect — en
  cas de divergence, trancher sur l'image de la carte.
- **Sacs COB (p. 5)** : aucun jeton tablette, à aucune difficulté — ne
  pas le supposer par habitude ; les jetons sang ne figurent qu'en
  Difficile (1) et Expert (2) et se conservent de scénario en scénario.
- **Sacs Core 2026 / BoA (guide p. 2)** : crâne ×2, **tablette**, elder
  thing, auto-fail, elder sign à toutes les difficultés — aucun cultiste ;
  vérifié le 2026-09-10 par corrélation de pixels entre l'image à 600 dpi
  et les glyphes `token_<x>_sealed` de tokens.ttf (recette : segmenter
  la ligne par colonnes d'encre, normaliser chaque icône en 96 × 96 et
  comparer aux six silhouettes — 0,985 pour la tablette contre 0,63 pour
  le cultiste). Réutilisable pour tout nouveau guide.
- **Icônes bénédiction / malédiction des guides** (The Lair of Dagon,
  p. 31) : la croix ornée est la bénédiction, le crochet la
  malédiction — lues sur l'image, jamais d'après le texte extrait.
- **`pkill -f` tue la commande courante** si son motif apparaît dans la
  ligne de commande du shell : `pkill -f "wrangler dev"` (connu) mais
  aussi `pkill -f workerd` — écrire `worker[d]` / `wrangler d[e]v`, et
  **ne jamais relancer `wrangler dev` dans la même commande que le
  `pkill`** (le motif entre crochets matche alors la ligne qui contient
  le vrai `wrangler dev`) : tuer dans une commande, relancer dans la
  suivante.
- **Le dépôt peut avancer pendant la session** (une autre session a
  poussé f26eaf3 — bandeaux de la bibliothèque — entre le clone et le
  push) : `git fetch` + `git rebase FETCH_HEAD` avant le push ; les
  conflits du mémo se résolvent en gardant **les deux** lignes de
  tableau et **les deux** récits (le plus récent en tête) et en
  rejouant la rotation (un récit récent de plus → un de plus vers
  l'archive) ; relancer build, check et tests après le rebase.
- **Une carte d'agenda ou d'acte sortie de l'histoire va « de côté »** :
  dans les captures, `#aside .carte` compte aussi les anciens actes /
  agendas (Spreading Flames : 12 de côté au setup, 5 après l'acte 2 —
  trois lieux, Armitage, l'acte 1).
- **`retirer()` du setup instancie en pile `removed`** (via
  `pool.takeAll`) : les cartes « retirées de la partie » existent dans
  `state.cards` avec `loc.pile === "removed"` — les tests doivent
  vérifier la pile, pas l'absence ; répéter un code dans `remove`
  (quantités) est inoffensif (`takeAll` prend tout au premier passage).
- **Rendu du plateau : les non-lieux sont à `+100000`** au‑dessus des
  lieux (`rendrePlateau`) — toute mécanique « sous un lieu » (cartes
  enfouies COB) doit être détectée au rendu pour rejoindre la couche
  des lieux, et côté serveur poser un z inférieur à celui du lieu.
- **Ne JAMAIS supposer l'icône d'un « Add 1 ? token »** : l'extraction
  texte perd les glyphes. Les lire sur l'image à 600 dpi et les comparer
  aux SVG du projet — la capuche du cultiste a une pointe sommitale, la
  tablette (fragments) n'en a pas. La confusion des deux a faussé les
  sacs des scénarios I et II pendant une session entière (corrigé le
  2026-09-08 en livrant le III).
- **`aside faceUp: false` sur un lieu double face** montre son dos non
  révélé — c'est le bon outil pour les identités masquées (grottes de
  COB II : « Side Chamber » ×3 indistinguables) ; `faceUp: true`
  révélerait le nom secret (« Zburamoarte's Lair »).
- **Encart autonome COB II (p. 15)** : ses courbes de nombres diffèrent
  des sacs de campagne (Difficile = Expert, 9 nombres, −6 sans −8) — ne
  pas les reconstruire de tête, relire l'image.
- **Glyphes du jeton sang** : `token_blood_fill/overlay/highlight`
  sont déjà dans `tokens.ttf` d'ArkhamCards (relancer
  `build_chaos_tokens.py --refresh` si le cache local est ancien).
- **Banc de test multi-clients** : une action d'un client B juste après
  une action d'un client A peut consommer la diffusion de A comme si
  c'était sa réponse — drainer avec `attendre(rev >= h.state.rev)`
  avant l'action (corrigé dans le bloc board joueur le 2026-09-08).

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
  `pointerup` sans mouvement. Sous Windows, le `contextmenu` arrive
  alors **après** ce `pointerup` et son test de visée tombe une fois sur
  deux sur le coin du menu tout juste posé sous le curseur (arrondi du
  pixel, donc « parfois, selon le zoom ») : tout écouteur qui décide de
  `preventDefault` d'après la cible laisse passer le menu natif. D'où
  `neutraliserMenuNatif` (dom.js) : neutralisé sur toute la table et sur
  `.menu-carte`, sauf saisie, liens et journal ; et le garde `lien.menuVu`
  (fenêtre de 400 ms armée seulement si aucun `contextmenu` n'est venu
  pendant l'appui, consommée une fois). Playwright/Chromium Linux ne
  reproduit pas l'ordre Windows : le rejouer par événements synthétiques
  (`captures.py`, `clic_droit_windows`).
- `state` n'est pas défini dans le menu des cartes d'`interactions.js` :
  passer par `ctx.etat.state`.
- Constat du récit High Gear : dans les captures, un menu ouvert s'est
  fermé par un clic hors menu, pas par Escape (Escape ferme pourtant le
  menu ailleurs dans `captures.py` — en cas de doute, cliquer à côté).
- Les cartes du tapis peuvent passer sous l'overlay pioche/sac (bas
  gauche) : elles restent accessibles en déplaçant la vue.
- Une action qui mute l'état puis `refuser()` laisse une divergence
  serveur/clients : toujours valider avant de muter, et de toute façon
  le DO restaure `before` sur refus (filet de sécurité en place).
- Éléments de carte réutilisés entre zones : toute propriété de style
  posée par un rendu (position absolue du tapis) doit être effacée par
  les autres rendus, sinon elle « fuit » (carte décalée, invisible).
- **Vérifier le build après chaque push** (check-run GitHub « Workers
  Builds ») : un push accepté ne veut pas dire un site à jour. Une
  fausse vérification (tester une table que le test avait lui-même
  supprimée) a fait croire à tort qu'une migration avait réussi.
- Cloudflare bloque les clients non-navigateur sans user-agent
  (403 sur `POST /api/rooms` depuis urllib) : envoyer un user-agent de
  navigateur ; Chromium headless est aussi filtré sur la page.
- Menu contextuel : ne pas fermer le menu dans un `pointerdown` global
  sans vérifier `menu.contains(target)` — le bouton est détaché avant
  que son `click` ne parte.
- Défausse de rencontre : `toPile` y laisse la carte face visible (les
  autres piles la retournent).
- Le mémo PCIO listait 4 scénarios livrés alors que le script en
  contenait 10 : ne jamais inférer l'avancement, le tenir à jour ici.
- Étiquettes : DejaVu ne rend pas ①②③ ; en web, préférer les glyphes
  système ou des SVG.
- Compter les messages WebSocket dès le premier prototype ; nuance
  relevée le 2026-09-07 sur la tarification DO : les messages entrants
  sont comptés **20 pour 1 requête** (sortants gratuits), et le stockage
  SQLite se facture **en lignes écrites** (1 snapshot = 1 ligne, 2 Mo max
  par ligne ; l'unité de 4 Ko ne vaut que pour le backend clé-valeur du
  plan payant). Le principe « un geste = un message, un snapshot par
  action » reste.
- Test WebSocket à plusieurs acteurs : `c.action` attend le delta
  `rev + 1` du *client* ; si un autre client vient d'agir, ce delta est
  celui de l'autre et l'attente rend la main trop tôt → synchroniser
  (`sync(c, autre)`) avant de changer d'acteur. Un aperçu `peek` est
  précédé d'un `delta` (journal) qu'il faut consommer aussi.
- Board joueur : tout champ de siège mis à jour hors `commit` (occupé,
  code de siège, connexions) doit l'être **avant** l'envoi de
  `welcome` / `you`, sinon l'état local reconstruit par `seats` diffère
  du `welcome` (test « welcome = état local »). Un élément `.carte`
  d'une main masquée est rendu depuis une copie `{...carte, faceUp}` :
  le cache d'éléments par id est partagé avec le tapis, ne pas y
  stocker d'état de vue. Le sac du chaos de la page joueur vit dans la
  barre de phase (dans l'entête il passait à la ligne et le
  triplait en hauteur).
- `pdftotext` perd les icônes des jetons du chaos dans les guides FFG
  (« +1, 0, …, , , , . ») : rendre la page en image (`pdftoppm -r
  220`) et lire les glyphes avant de saisir un sac ou un ajout de jeton.
- Un scénario qui mélange plusieurs packs ArkhamDB (TCU + sets du Core)
  déclare `packs` ; `extraCards` sert à ne prendre que quelques cartes
  d'un set (les 6 Arkham Woods sans le reste de Devourer Below).
- Le test `test_room.mjs` utilise un scénario **hors registre** pour
  vérifier le refus 400 : le changer quand ce scénario est livré (fait
  pour `tcu_witching_hour` → `tcu_prologue`).
- Le set Core « Dark Cult » s'appelle **`pentagram`** chez ArkhamDB.
- Ne jamais `grep` un cache ArkhamDB (fichier d'une seule ligne : tout
  le pack sort dans la console).
- Codes ArkhamDB des packs Mythos de TCU : `tsn`, **`wos`** (et non
  `twos`), `fgg`, `uad`, `icc`, `bbt` (`GET /api/public/packs/`).
- Codes à lettre (05178a…k) : la CDN a bien `05178a.webp` et le verso
  `05178b.webp` ; le build les traite comme des cartes liées (`back:
  "b"`, `backCode`), et `storyBack` protège le dos.
- Les lieux « à deux faces révélées » d'ArkhamDB sont des cartes liées
  (`linked_card` de type location) : `backClue` vaut 0, et le clic droit
  ne doit pas proposer « Retourner » (face cachée = image du verso,
  trompeuse).
- Un clic droit sur la carte révélée d'une pile ouvre le menu de la
  carte ; pour viser la pile dans Playwright, `dispatch_event
  ("contextmenu")` sur l'élément de la pile.
- Lieux dont le dos cache l'identité (Decrepit Door, Unknown Places) :
  c'est `back_name` d'ArkhamDB ; sans `nomVisible`/`faceVisible`, le
  journal (« X est mis en jeu ») et l'attribut `alt` dévoilaient la
  pièce. Toute nouvelle sortie qui nomme une carte doit passer par ces
  fonctions.
- `layeredPile` : réserver les cartes imposées de toutes les couches
  avant les tirages au hasard, sinon la couche du dessus peut prendre la
  carte imposée du dessous.
- Un lieu à simple face (`back: "encounter"`, ex. Strange Geometry) n'a
  pas de côté b : ne pas lui mettre `side: "b"` au tirage (image
  inexistante) et le faire entrer révélé.
- ArkhamDB ne liste pas Josef Meiger 05085 : seul son verso 05085b
  (story) existe, avec `linked_card` → le build synthétise le recto
  (`versosSeuls`) et exclut le verso ; règle générale pour tout
  `<code>b` dont le recto manque. Vérifier `health_per_investigator`
  sur la carte réelle (ArkhamDB dit non pour Josef).
- Un champ de saisie dans un rendu reconstruit par `replaceChildren` :
  ne pas relancer le rendu depuis son `change` (blur → rendu imbriqué).
- L'entrée « Enquêteur personnalisé » de la fenêtre de choix a la classe
  `.inv-custom`, pas `.inv` : les tests et captures prennent
  `dialog .inv` first pour choisir un enquêteur ArkhamDB (la première
  version avec `.inv.custom` ouvrait le formulaire à leur place).
- Un élément DOM dont la classe est réécrite à chaque rendu perd ce
  qu'un gestionnaire d'événement (`error` d'image) y a ajouté : mémoriser
  l'état dans `dataset` et le rejouer au rendu (`sans-image` des cartes
  et pions personnalisés).
- Cartes liées : le front rend le verso d'après `backKind` ; un verso-lieu
  ne devient un lieu pour le moteur (couche, pions emportés, chemins)
  que par le changement de `kind` fait dans `avancer` — retourner l'acte
  à la main le laisse « acte » (lisible, sans indices automatiques).
- `test_room.mjs` : en solo, le delta 1 est consommé par l'action de
  l'hôte — un `attendre(delta rev === joueurs)` ne résout jamais (ne
  l'attendre qu'à partir de deux joueurs).
- Workers Builds peut échouer **sans cause dans le dépôt** (5d9325a :
  `completed/failure`, aucun changement de configuration, `npm run check`
  au vert en local) : relancer par un commit vide (`--allow-empty`)
  avant de chercher plus loin — la relance 8ed2a43 est passée. Vérifier
  ensuite que le site sert bien le nouveau code (`curl` d'un fichier
  modifié), pas seulement le statut du check.
- `wrangler dev` (4.128‑4.130) meurt parfois au milieu d'une longue
  série de captures (« Network connection lost » côté ProxyWorker,
  aucun rapport avec le code) : les blocs suivants échouent en
  « Connection refused » ou par timeout ; relancer le serveur et rejouer
  le bloc concerné (script autonome extrait de `captures.py`), ne pas
  chercher de cause dans le dépôt.
- `ss` n'existe pas dans le bac à sable : vérifier `wrangler dev` par
  `curl http://127.0.0.1:8788/` ; deux `wrangler dev` sur le même port
  → le second meurt sans bruit.
- Un jeton posé par une règle du scénario (inondation) est un champ de
  `tokens` comme les autres : `addToken` le borne (2), le dépôt dans une
  pile l'efface (`tokens = {}`) — pour un jeton qui doit survivre au
  passage en pile, il faudrait un champ à part.
- `python3 -m py_compile scripts/captures.py` crée `scripts/__pycache__/`,
  qu'un `git add -A` a commité une fois (75909e9) : désormais dans le
  `.gitignore` ; préférer `git add` des fichiers nommés.
- `pkill -f "wrangler dev"` tue aussi la commande courante (son propre
  motif) : utiliser `pkill -f "wrangler d[e]v"`.
- `replaceChildren(...liste.map(...))` : un `null` dans la liste lève
  une exception — filtrer (`.filter(Boolean)`) quand un élément peut ne
  pas être rendu (pile des pistes révélées vide).
- Une clé de couleur face cachée ne doit être nommée nulle part : passer
  par `nomVisible` / `nomCle` (journal, `alt`, infobulles, menus) ; le
  test vérifie que le journal du setup ne cite aucune couleur des clés
  cachées.

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
7. Board joueur (2026-09-07, salves A‑G) : structure et visibilité,
   import du deck, mise en place et mulligan, jouer les cartes,
   entretien / pioche / défausse, synchro et observation, plateforme et
   livraison. Réponses en §1 « Board joueur » et cahier §10.

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
- **Composition du sac par difficulté** : TCU saisi (2026-09-04), TIC
  saisi (2026-09-08, p. 3 du guide lue sur l'image), COB saisi
  (2026-09-08, p. 5, jetons sang compris), BoA / Core 2026 saisi
  (2026-09-10, p. 2, icônes vérifiées par corrélation avec tokens.ttf) ;
  reste TDC, TDE‑A et Film Fatale (section Setup / encart du guide).
- **Brethren of Ash** : le II reporte le journal du I par deux questions
  (université, porteur d'Armitage) tirées du Setup p. 6 seul, et ajoute
  les 2 cultistes du guide ; les résolutions du I n'ont pas été lues —
  si elles modifient le sac, l'utilisateur fournit l'extrait (sinon
  rappel « ajustez le sac »). Le III devra reporter les 2 cultistes
  (sac du II) et ce que sa section Setup p. 12 demande.
- **Jetons de campagne TIC** : les flashbacks retirent des jetons du sac
  « pour le reste de la campagne » (icônes p. 6, à lire sur l'image) et
  la résolution du I remplit « Memories Recovered » → questions au lobby
  de TIC II à concevoir (report des jetons retirés, mode autonome p. 9).
- **Jetons de campagne** (TCU III et suivants) : les jetons ajoutés au
  sac par les résolutions précédentes ne sont pas connus d'une table
  isolée → TCU II les reporte par la question d'introduction (+ option
  autonome) ; pour la suite, question à choix multiple ou rappel
  « ajustez le sac », à trancher avec l'utilisateur (COB II tranche pour
  les sangs : question numérique + `chaosAdd nFrom`).
- **Compteurs spécifiques par scénario** : `seatCounters` /
  `tableCounters` du `*.src.json` — `seatCounters` rendus depuis COB
  (chips génériques tapis + board joueur, icône `/img/chaos/<icon>.svg`,
  routage `seal` vers le sac) ; `tableCounters` toujours sans rendu —
  recenser ceux des 10 scénarios PCIO à leur migration.
- (v2) **Pioches multiples** : `piles` extensible déclaré par le
  scénario (`shuffleable`, `discardPile`) — Wages of Sin, Film Fatale,
  Unknown Places.
- **Board joueur** (2026-09-07, cahier §10.10) : customisations (badge +
  titres des cases cochées dans la loupe, jamais le texte — à valider) ;
  code de siège visible de toute la table ou du seul siège ; images des
  jetons Uses par type (chip générique d'abord) ; decks annexes (hunch
  deck, Underworld Market) et cartes sous l'enquêteur en v2 ; attaches
  entre cartes joueur = empilement visuel ; enquêteur personnalisé +
  deck non prévu (un deck impose son enquêteur) ; réimport entre
  scénarios avec la campagne (v2) ; « Uses (X) » variable = 0 ;
  onglet d'un siège dont le nom de deck répète le nom de l'enquêteur.
