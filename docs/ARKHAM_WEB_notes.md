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
| 2026-09-10 | Standalone — Curse of the Rougarou | livret (encart FFG 2016, transcription Hall of Arkham) lu en entier ; question `mode` (indépendant / side-story 1 XP), sac p. 1 à deux niveaux ; set Curse of the Rougarou de côté ; **`pickGroups`** (quatre piles de lieux par trait : 1 retirée, 1 en jeu, 2 de côté, `slot`) + `reveal`/`minis` sur le Bayou tiré ; disposition déduite des icônes (Bayou en carré) ; acte 2 : **`placeAt ifAside`** (six lieux de côté), **`spawnAside at` en liste** (Lady Esprit au Bayou), set + défausse mélangés ; agenda 3 : **`shuffleFromDiscard`** (On the Prowl) |
| 2026-09-11 | Standalone — The Labyrinths of Lunacy | livret lu en entier : un scénario, deux modes (Single / Epic à trois groupes) et trois groupes A / B / C (+ variante The Shifting Labyrinth) → une room, questions `mode`, `group`, `jailor` ; deux sets par mode, `story` garde les versions présentes ; objectifs Timed en rappels ; **`enter:<code>`** (nouveau : effets de la carte qui devient courante → Act 2 Setup selon l'acte 2), **`minis randomTo`** (un enquêteur tiré au sort dans la Chamber of Rain), Chamber of Secrets sous la carte de scénario = pile **`hideEmpty`** (nouveau) alimentée par `toPile` sur slot ; sac à deux niveaux + deux jetons du groupe |
| 2026-09-11 | Standalone — Carnevale of Horrors | encart 2016 (transcription Hall of Arkham) lu en entier ; question `mode` (indépendant / side-story 3 XP), sac à deux niveaux ; cercle de huit lieux (Basilique en haut, un lieu retiré au hasard par `pickRandom include`), sept masques = versos liés posés face cachée, piles « Sous l'agenda » / « Sous l'acte », Cnidathqua au centre à l'acte 2, Baleful Reveler (verso-ennemi), Gondola (verso-lieu) avec **`minisTo`** (nouveau) et `removeLocations except` ; « Retourner » pour un soutien lié posé face cachée ; ressources au menu des lieux |
| 2026-09-11 | Standalone — Machinations Through Time | livret lu en entier : un scénario, trois façons (Single Group, Epic à trois groupes Passé / Présent / Futur, side-story) → une room, `mode` à cinq options + questions Machination / Plot (au hasard ou annoncée) ; Tindalos côté a / b, trois croix ou une ; textes de Setup des cartes histoire résolus par **`branch on:"slot:…"`** (nouveau), `spawn side b` d'Edwin soutien, `addTokens` négatif ; agenda 2 : **`flip`** (nouveau), `shuffleAside ifAside`, `spawnAside ifAt` (nouveau) ; menu ressources des cartes histoire ; sac à quatre niveaux |
| 2026-09-10 | Standalone — Fortune and Folly, Part II : The Heist | setup « from Scratch » : journal du Checkpoint en questions (jouée / sautée, tâches `multi`, Practiced `multi`, repos, indices `number`), deux hubs superposés, `place side:"b"` + `reveal` (Busy Night, indices du verso), `spawn side` (Isamara Crew), Wellspring `spawn` sur Relic Room, **`revealEffects`** (Hallway → Abarran Unleashed + cultistes ; Relic Room → **`moveTokens`**), effet **`seatCounter`** (+1 alerte), agendas 3-4 (Shambler, Plan in Shambles, Disfavor `drawAside`) ; **Fortune and Folly complet** |
| 2026-09-10 | Standalone — Fortune and Folly, Part I : The Stakeout | livret lu en entier : deux parties = **deux rooms** (bibliothèque scindée, Part II prévue) ; hub public en anneau, cartes liées Calm Night révélées, The Stakeout + Wellspring (Key → `asset`, `addTokens perInvestigator`) dans l'histoire, garde tiré par `spawn` sur slot, matériel de Part II retiré, **`seatCounters min/max` + icône en chemin** (niveau d'alerte 1‑10), **`discardTop`** (icônes de jeu, aperçu, remélange hors cartes défaussées) |
| 2026-09-10 | Standalone — The Blob That Ate Everything | livret lu en entier (consigne standalone) ; question `mode` (Single / Epic / side-story), losange par `pickRandom include` + billets = pool + op `reveal`, Subject 8L-08 dans la colonne Histoire (`place zone:"story"`, jauge 0/15*), pile « Dévorées » (`menuFor`), contremesures = ressources sur la carte de scénario, **`actCycle`** (deck d'acte réinitialisé), `shuffleAside ifAside`, `addClues` par trait plafonnés, `drawAside`, vie/indices négatifs (✱, X) sans maximum ; livret par scénario dans library.json ; **premier scénario indépendant** |
| 2026-09-10 | Générateur de cartes : board joueur + carte personnalisée en image | bouton dans `blocTour` du board ; `createCustomCard {name, image, imageBack?, kind?, health?, sanity?}` → `custom-card:<n>` dans `extraDefs` (`custom`, `image`, `imageBack`), `urlImage` étendu ; consigne du générateur sur une ligne (`.grille-cartes > .vide` sur toute la largeur) ; pas de téléversement |
| 2026-09-10 | UX : chips — bouton maintenu déployé, agenda / acte | `garderChipsDeployees` (dom.js, classe `ouverte` reposée après re-rendu, clé jeton + carte / siège / entête) : plusieurs clics sur le « − » / « + » sans bouger ; chips de l'agenda et de l'acte à 30 px ; ressources et marqueur génériques au menu de l'agenda et de l'acte |
| 2026-09-10 | UX : tous les jetons des cartes en chips | plus de pions ronds : indices, doom, ressources, générique = chips empilées en bas à droite avec le « − » qui se déploie ; indices d'un lieu = chip inverse (clic = prendre, « + » au survol) ; `elChip` + `clicChip` dans cartes.js, `.pmj` / `.jetons` supprimés |
| 2026-09-10 | UX : le « − » des jauges hors carte se déploie sans rien déplacer | pastille ancrée à gauche : marge négative + retrait au survol, `.chip-moins` en absolu (`.jauge-inv`, room.css) ; gouttières ≥ 1.1em + écart ; siège et entête du board |
| 2026-09-10 | BoA III — Queen of Ash | jetons p. 11 selon la difficulté (icônes vérifiées) + cultistes du II en campagne, tunnels mélangés, journal `multi` (doom, `seatCounter` indices, cultistes aux tunnels, Servant retiré / de côté), Elokoss à deux faces, `shuffleAside {code, n}`, `spawnAside ifAside` ; **campagne BoA complète** |
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

- 2026-09-11 : **The Labyrinths of Lunacy** (scénario indépendant, pack
  arkham.build `lol`, 70001‑70061, sets `in_the_labyrinths_of_lunacy`
  commun, `epic_multiplayer` et `single_group` — chaque mode a ses
  propres agendas 1‑2, The Levers, The Escape, Chamber of Sorrows,
  Chamber of Night, diagrammes, Eixodolon's Pet et Paradox Effect).
  Livret (24 p.) lu en entier : **un scénario, jamais side-story**, deux
  modes (Single Group : une partie comme groupe A, B ou C, ou
  mini-campagne de trois parties sans XP ; Epic : trois tables sans
  communication, fin de manche commune, 60 min par acte) et trois
  groupes aux setups et actes 1‑2 distincts, plus la variante The
  Shifting Labyrinth (p. 23, acte 1 et acte 2 tirés au hasard) → **une
  room**, questions `mode`, `group` (A / B / C / shifting) et `jailor`
  (Epic : ce groupe est-il celui tiré au sort qui mélange The Jailor à
  l'acte 2). Sac p. 2 à 600 dpi (deux niveaux : Facile = Standard,
  Expert = Difficile ; crâne ×2, auto-fail, elder sign, sans cultiste ni
  tablette ni ancien) puis **deux jetons du groupe** (p. 10 / 13 / 16 :
  A deux Ancien, B deux Tablette, C deux Cultiste) par `chaosAdd`. Le
  mode non joué est retiré ; `agendaDeck` et `actDeck` listent toutes
  les versions, `story` garde les présentes ; les actes 1‑2 se tirent
  par `pickRandom` nominal (`from` réduit au bon code, ou les trois
  pour la variante — `rest` par défaut retire alors les non tirés ; pour
  un groupe fixe les autres versions sont retirées explicitement, sinon
  `story` les aurait toutes mises dans le deck : piège attrapé au test
  de fumée) puis `branch on:"slot:act1"` pour la mise en place du
  groupe : A — une Chamber of Secrets au hasard révélée (les deux autres
  retirées), Key of Mysteries dedans en Single ; B — Chamber of Rain et
  Chamber of Sorrows révélées, **`minis randomTo`** (nouveau : un
  enquêteur tiré au sort commence ailleurs, journal nommé) ; C —
  Chamber of Night révélée, Chamber of Regret non révélée, et en Single
  une Chamber of Secrets tirée au sort « sous la carte de scénario » =
  pile déclarée **`hideEmpty`** (nouveau : pile non rendue tant qu'elle
  est vide, pour les autres groupes) remplie par `toPile` sur un slot
  (`toPile` résout désormais les slots) — « Regarder la première » = la
  regarder en privé ; les deux autres de côté face non révélée. Commun :
  Syringe, Eixodolon, Pet, diagrammes, deux Abductors, tous les autres
  lieux de côté face non révélée (Halls, Hunger, Decay, Rot, Poison,
  Warehouse, chambres des autres groupes — nécessaires à la variante et
  aux cartes histoire Epic) ; Epic : The Jailor gardé de côté si tiré
  ici sinon retiré, six cartes histoire de côté recto visible (`storyBack`
  : verso « Deep Within the Labyrinth… ») ; Eixodolon's Note posée dans
  la zone du siège 1 (`place zone:"seat0"`) ; pioche 24. **Objectifs
  Timed** (p. 3) : l'acte n'avance pas seul → rappels agenda:2 /
  agenda:3 (« avancez l'acte, lisez son verso ») et **`enter:<code>`**
  (nouveau : effets de la carte qui devient courante) pour l'Act 2 Setup
  de chaque version de l'acte 2 (Abductors + défausse + Jailor s'il est
  de côté `shuffleAside withDiscard`, `placeAt faceUp:false` des trois
  Halls et des chambres — piège : `placeAt` révèle par défaut — et du
  Pet près de la Chamber of Hunger, « locked away ») et l'Act 3 Setup
  (Warehouse révélé, `minisTo`, Eixodolon par `spawnAside`) —
  la variante Shifting suit ainsi le groupe de l'acte 2 sans rien de
  plus. Rappels : mini-campagne, Timed et doom volontaire en Single,
  paradoxes, Epic (annonces des cartes histoire par le meneur du groupe A
  en fin de manche, 60 min, échanges), agendas 2‑3, actes 2‑3 (Pet locked
  away, Eixodolon 6 + 6 par enquêteur non vaincu par les dégâts).
  Tests : bloc `test_room.mjs` (A Single 2 j. : sac 18 avec deux
  Ancien, chambre révélée 6 indices, Key dedans, Note au siège 1, decks
  par version, retraits, mises de côté, pioche 24, pile masquée ;
  agenda 2 + acte 2 → Halls, Decay non révélée, Abductors + défausse ;
  agenda 3 + acte 3 → Warehouse, Eixodolon, pions ; B Single Difficile
  3 j. : Tablette ×2, un pion tiré au sort dans Rain, Rot + Poison à
  l'acte 2 ; C Epic solo avec Jailor : versions Epic, cartes histoire
  dos histoire, trois Secrets de côté, Pet à côté de Hunger, Jailor dans
  la pioche ; C Single : pile secret à 1, journal muet ; Shifting :
  actes tirés, quatre autres retirées, Act 2 Setup du groupe de l'acte
  2) ; Playwright : lobby à trois questions, tapis du groupe C avec la
  pile « Sous la carte de scénario », acte 2 (Halls, Hunger, Pet), groupe
  A sans pile ; zéro erreur console ; `npm run check` zéro erreur ;
  régression `test_room.mjs` (881 messages) OK.
- 2026-09-11 : **Carnevale of Horrors** (scénario indépendant, pack
  arkham.build `coh`, set `venice`, 82001‑82037). Comme le Rougarou,
  **FFG ne publie pas l'encart** (2016, deux pages) : lu en entier sur la
  transcription Hall of Arkham `carnevalerules.pdf` (image de l'encart ;
  couche texte vide → pages rendues et lues, sac à 600 dpi : Standard
  +1 0 0 0 −1 −1 −1 −2 −3 −4 −6 crâne ×3 cultiste tablette ancien
  auto-fail elder sign ; Difficile +1 0 0 0 −1 −1 −3 −4 −5 −6 −7 + les
  mêmes icônes) ; lien `guide` vers cette transcription. Un scénario,
  deux façons (indépendant / side-story 3 XP) → question `mode`. Setup
  p. 1 : un lieu retiré au hasard sauf la Basilique et Canal-side, les
  huit autres « en cercle aléatoire » → la Basilique fixée en haut
  (révélée, Abbess et pions), `pickRandom n:6 include:[Canal-side]`
  parmi les sept autres aux sept positions d'un octogone (sens horaire =
  vers la droite depuis le haut, rappel ; le septième retiré, journal
  muet) ; **les sept Masked Carnevale-Goers sont un verso lié partagé**
  (82017b, une seule image) de quatre ennemis et des trois Innocent
  Reveler : `pickRandom n:7 faceUp:false` aux mêmes positions décalées
  → ils montrent le masque, aucune jauge ne trahit le recto
  (`faceVisible` lit le verso lié sans vie), « Retourner » révèle —
  correction du menu : un soutien lié de même kind posé face cachée
  (Innocent Reveler) n'avait pas de « Retourner » (`deuxFaces` ne
  l'offrait que face visible) ; Cnidathqua et les quatre masques
  (Mask) de côté ; pioche 26. Piles déclarées « Sous l'agenda » /
  « Sous l'acte » (`menuFor` asset) pour les Innocent Revelers — leurs
  badges servent au crâne et à l'objectif de l'acte 1. Versos lus dans
  le dump : acte 1b → `placeAt` de Cnidathqua au centre du cercle (à
  aucun lieu) ; agenda 1 = verso-ennemi (Baleful Reveler, `backPlacement`
  au centre, à déplacer : Spawn antihoraire, rappel) ; acte 2 =
  verso-lieu Gondola (`backPlacement` en haut) avec **`minisTo`**
  (nouveau : tous les pions sur un lieu) et `removeLocations {trait:
  "Venice", except: [Gondola]}` (ennemis et soutiens qui s'y trouvaient
  en rappel) ; acte 3 : ressources sur Gondola → « Ressource » ajoutée au
  menu des lieux ; agendas 2 et 3 « reviennent au recto » (boucles :
  Retourner sans avancer, doom retiré à la main — rappels) ; acte 1
  (regarder l'autre face contre des indices = Retourner deux fois) et
  acte 2 (un masque retourné à chaque phase du mythe) en rappels. Tests :
  bloc `test_room.mjs` (Standard 2 j. : sac, Basilique, sept positions,
  Canal-side présent, un retiré ni Basilique ni Canal-side et journal
  muet, Abbess, pions, sept masques face cachée dont trois Revelers, cinq
  de côté, pioche 26, piles ; Reveler retourné puis sous l'agenda ; acte
  2 → Cnidathqua au centre ; agenda 2 → Baleful Reveler sur le tapis ;
  acte 3 → Gondola en haut, pions dessus, neuf lieux retirés ; side-story
  Expert solo) ; Playwright : cercle, sept images de masque, menu
  Retourner, masque révélé, acte 2 ; zéro erreur console ; `npm run
  check` zéro erreur ; régression `test_room.mjs` (865 messages) OK.
- 2026-09-11 : **Machinations Through Time** (scénario indépendant
  demandé par l'utilisateur hors de l'ordre de la tâche planifiée ; pack
  arkham.build `mtt`, 87001‑87057, sets `machinations_through_time`,
  `…_single_group` — face a de Tindalos 87005a et Edwin 87036a/b —,
  `…_epic_multiplayer` — face b de Tindalos 87005b, même carte liée, et
  Edwin 87037a/b). Livret (24 p.) lu en entier : **un scénario, trois
  façons de jouer** (p. 2‑3) → une room, question `mode` à cinq
  options : Single Group (les trois ères ensemble), Epic groupe Passé /
  Présent / Futur (chaque table confinée à son ère ; le groupe Passé tire
  Machination et Plot au hasard et les **annonce**, les deux autres les
  choisissent au lobby → questions `machination` et `plot` « au hasard /
  annoncée »), side-story (2 XP). Sac p. 2 à **quatre niveaux** (icônes à
  600 dpi : Facile 18 jetons avec un seul crâne, Difficile / Expert deux
  anciens) ; carte de scénario recto Easy/Standard. Mise en place
  p. 11‑15 et diagrammes p. 16‑18 : une croix par ère (haut Gazette /
  Advertiser, gauche River Docks, centre Tindalos, droite O'Malley /
  Tick-Tock, dessous Miskatonic University, bas Childhood Home / Ye Olde
  Magick Shoppe) — en Single, « ignoring the placement for Tindalos » :
  les trois croix côte à côte (colonnes 179‑551 / 737‑1109 / 1295‑1667),
  Tindalos au centre du Présent, les deux autres centres vides ; en Epic
  la croix de l'ère centrée sur Tindalos côté b (`place side:"b"
  reveal`), le reste retiré ; Corrigan Industries de côté (entre en jeu
  sous la MU du Futur quand annoncé, rappel). **Cartes histoire à texte
  de Setup** (règle p. 4) : A Noble Legacy (une par ère) posées dans
  l'histoire déjà retournées (`place zone:"story" side:"b"`) après
  exécution de leur Setup (Tesla aux Docks du Passé, Ezra à l'Advertiser
  du Présent, Dimensional Beam Machine de côté) ; Machination et Plot :
  `pickRandom` nominal (au hasard, ou `from` réduit à la carte annoncée)
  puis **`branch on:"slot:…"`** (nouveau) qui exécute le Setup de la carte
  tirée (versos lus dans le dump, jamais recopiés) : A Bitter Rivalry
  (Thomas Past enlevé = de côté, Mary à la Gazette, Edwin ennemi de côté ;
  autres ères enlevées ; reste côté Setup), Redeem a Former Colleague
  (Mary enlevée, Thomas à Childhood Home ; Présent : Edwin ennemi apparaît
  à la MU ; retournée), Uneasy Alliance (Thomas et Mary placés, **Edwin
  soutien** = `spawn side:"b"` du verso lié, 12 indices moins 3 par
  enquêteur → `addTokens` **négatif** désormais admis, jamais sous zéro ;
  retournée), Anomalies in Spacetime (1 horreur par enquêteur = anomalies
  sur chaque MU, + Gazette / O'Malley ou Advertiser / Tick-Tock de l'ère
  en Epic ; Tyr'thrha, Sadie et Gang retirés ; retournée), Mob Troubles
  (Sadie + 3 Gang de côté, Tyr'thrha retiré, `seatCounter resources +2`
  pour les enquêteurs du Présent ; côté Setup), Unspeakable Abomination
  (Tyr'thrha de côté — vie ✱ = 6 par enquêteur tous groupes, jauge sans
  maximum ; côté Setup) ; les deux autres Machination / Plot retirées
  implicitement en fin de setup ; doom sur l'agenda 1a par
  `branch on:"difficulty"` (0 / 1 / 2 / 3) ; pioche 33. Agenda 1b (verso
  lu) → `agendaEffects["2"]` : **`flip`** (nouveau : les cartes en jeu de
  ces codes passent sur leur verso) des cartes histoire restées côté
  Setup, `shuffleAside ifAside` des trois Gang (sans la défausse),
  `spawnAside` d'Old Sadie au Tick-Tock du Présent avec **`ifAt`**
  (nouveau : seulement si le lieu est sur le tapis — un groupe Epic d'une
  autre ère ne le voit pas) et de Tyr'thrha à Tindalos (`ifAside`) ; les
  anomalies sur un River Docks et Edwin au lieu du meneur restent en
  rappel. Front : le menu des cartes histoire offre les ressources (et
  dégâts / horreur) — marqueurs des capacités déclenchées. Rappels : ères
  et connexions de Tindalos, cartes histoire et annonces p. 24, enlevé /
  secouru, Corrigan, Epic (annonces, valeurs globales, 180 min),
  patrouilles et Alert, agenda 2. Tests : bloc `test_room.mjs` (Single
  2 j. Uneasy Alliance + Mob Troubles : trois croix, Tesla / Ezra /
  machine, Edwin soutien 6 indices, enlevés de côté, cinq cartes histoire
  et leurs faces, Gang et Sadie de côté, retraits, +2 ressources, doom 1,
  pioche 33, agenda 2 → Mob Troubles retournée, 36 cartes, Sadie au
  Tick-Tock ; Epic Passé Expert solo au hasard : Tindalos côté b, croix
  centrée, tout le reste retiré, trois cartes histoire, doom 3, sac
  Expert, annonce demandée ; Epic Futur Facile 3 j. Redeem + Abomination :
  Corrigan de côté, Tyr'thrha de côté puis à Tindalos à l'agenda 2, aucun
  doom, sac de 18, aucun « à faire à la main » ; Epic Présent Difficile
  2 j. Rivalry + Anomalies : anomalies 2 / 2 / 2 / 0 / 0, doom 2, agenda 2
  = Rivalry retournée seulement) ; Playwright : lobby (trois questions),
  trois croix, colonne Histoire à cinq cartes, agenda 2 (Sadie, pioche
  36) ; zéro erreur console ; `npm run check` zéro erreur ; régression
  `test_room.mjs` (845 messages) OK.
- **Prochaine étape** : validation par l'utilisateur de **The Labyrinths
  of Lunacy** (mode / groupe / Jailor, chambres, Act 2 et Act 3 Setup,
  variante Shifting), de **Carnevale of
  Horrors** (cercle, masques, piles sous les decks, boucles des agendas 2
  et 3 en rappel, Gondola), de **Machinations
  Through Time** (mode à cinq options, cartes histoire et leurs textes de
  Setup, trois croix, agenda 2) et de **Curse of the
  Rougarou** (piles tirées au sort, disposition en carré déduite des
  icônes, Lady Esprit au Bayou de départ à l'acte 2, lien du livret vers
  la transcription Hall of Arkham faute de PDF FFG) et des deux rooms
  **Fortune and Folly** (Part I : anneau, niveau d'alerte, icônes de jeu
  par `discardTop`, Roles de côté ; Part II : questions du journal, deux
  hubs superposés, révélation du Hallway, Relic Room, agendas 3‑4), puis
  le **scénario indépendant suivant dans l'ordre de l'utilisateur**
  (tâche planifiée, une room par jour) — **Carnevale of Horrors et The
  Labyrinths of Lunacy sont faits** (2026-09-11, demandés par
  l'utilisateur) : Guardians of the Abyss (deux rooms déjà
  prévues), Murder at the Excelsior Hotel, War of the Outer Gods,
  Machinations Through Time, The Midwinter Gala, Film Fatale (pioche
  Reel, v2) — **Machinations Through Time est fait** (2026-09-11, demandé
  par l'utilisateur, à sauter dans l'ordre) ; puis les campagnes dans son ordre (Dunwich, Carcosa, TFA,
  TDE, TIC déjà complète, EotE — premier scénario à scinder en trois, à
  discuter —, TSK, FHV, TDC, BoA déjà complète). Toujours en attente :
  validation de The Blob That Ate Everything. Chantier connexe :
  rangement de la zone hors jeu (le Rougarou a 27 cartes de côté au
  setup). Toujours en attente : retours de l'utilisateur sur le
  générateur (board joueur, carte personnalisée en image — téléversement
  via un bucket R2 si le besoin se confirme), sur les chips (tous les
  jetons des cartes, bouton maintenu déployé, indices d'un lieu en chip
  inverse, agenda / acte à 30 px), sur le bandeau des sièges (jauges sur
  deux lignes, geste du « − », case Play compacte, ordre du board
  joueur) et sur la campagne **Brethren of Ash complète** (disposition
  sans diagramme, attache Fire!, versos automatisés, suspects enfouis,
  pile « Sous l'acte », tunnels mélangés, Elokoss à deux faces) ;
  **question ouverte** : les journaux du I et du II modifient-ils le sac
  au-delà des jetons lus dans les consignes (résolutions non lues —
  extrait de l'utilisateur, sinon le rappel « ajustez le sac » suffit).
  Toujours en attente : retours sur la campagne TIC complète (I‑VIII) ;
  visuels PNG des clés et du jeton d'inondation à générer dans le style
  des jetons du projet (choix B). En parallèle : la suite des retours de
  test du board joueur et les points ouverts du cahier §10.10
  (customisations, decks annexes, attaches). Ensuite le prologue
  Disappearance at the Twilight Estate (pack `tcu`, set
  `disappearance_at_the_twilight_estate` : choix des enquêteurs neutres
  05046‑49, lieux 05071‑77 / Spectral 05078‑84 à réutiliser), puis le
  chantier convenu avec l'utilisateur : **rangement de la zone hors
  jeu** (tri par groupes ou piles nommées ; VI atteint 26 cartes de
  côté). Après quoi : retours de jeu sur les huit tables TCU. Jetons de
  campagne : reportés par les questions d'introduction, de la Loge et de
  The Black Book ; à chaque nouveau scénario, relire les résolutions
  précédentes pour les ajouts. Chantier possible : un compteur de doom /
  une ligne de journal par pioche pour les scénarios à deux pioches. À
  faire au fil de l'eau : étiquette de rangée sur le tapis (« devant
  X »), pincer pour zoomer sur tablette, chemins pré-tracés depuis les
  connexions imprimées, hook `onChaosDraw` (jetons scellés), pioches
  multiples (v2), boutons scénario (`actions`, cahier §5, non
  implémentés).

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

### Scénarios indépendants (consigne de l'utilisateur, 2026-09-10)

Pour chaque standalone : lire le **livret en entier** avant de commencer
(la règle « Setup + diagramme seulement » des campagnes ne s'applique
pas ; le spoiler à éviter reste celui de l'utilisateur et de l'app) ;
si le livret contient en fait plusieurs scénarios, **une room par
scénario** et la bibliothèque adaptée (Guardians of the Abyss est déjà
scindé) ; les rooms se créent **une par une, un push par room**, et la
suivante attend la validation de l'utilisateur. Un scénario à plusieurs
modes (Single Group / Epic Multiplayer / side-story du Blob) reste une
seule room avec une question `mode` ; en Epic, une table de l'app est
un groupe et l'organisateur tient les valeurs globales (rappel). Chaque
scénario a son propre livret : champ `guide` du scénario dans
`library.json` (lien « livret », lien Guide de la table). Les cartes
mises de côté sont face visible sauf celles dont une face est à ne pas
lire (cartes histoire à Part 2 au verso → `storyBack`, face cachée).

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
les mêmes jauges dans le même ordre, sur une rangée. Partout, le « − »
d'une jauge se déploie **à gauche sans déplacer l'icône ni le nombre**,
comme sur les cartes (règle `.jauge-inv` de `room.css` : marge négative
= retrait gagné, bouton en absolu ; prévoir la gouttière à gauche).

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
- **Jetons** posés sur une carte (indices, doom, ressources, dégâts,
  horreur, uses, générique) : depuis le 2026-09-10, **tous des chips**
  (icône + nombre, clic = +1, « − » qui se déploie à gauche au survol
  sans rien déplacer) empilées **en bas à droite** de toute carte,
  jauges toujours visibles (dégâts des ennemis, dégâts / horreur des
  soutiens, uses) en bas de la pile, jetons posés au-dessus — plus de
  pions ronds ni de placement selon la valeur imprimée (décision
  précédente du 2026-09-03 : indices en bas à droite des lieux, doom en
  bas à gauche des agendas, sinon en haut à gauche). Chips **inverses**
  (clic = −1 / prendre, « + » qui se déploie) pour ce qu'on dépense
  plus qu'on n'ajoute : uses d'une carte joueur, **indices d'un lieu**
  (clic = 1 indice passe du lieu à la réserve du joueur qui clique —
  l'ancien double-clic). Le bouton déployé reste disponible pour
  plusieurs clics tant que la souris reste sur la chip (classe
  `ouverte` reposée après chaque re-rendu, `garderChipsDeployees`).
  Agenda et acte : chips à 30 px, doom / indices + ressources +
  marqueur au menu. **Pions** d'enquêteur (44 px, portrait
  recadré, cercle de la couleur de classe) en rangée à cheval sur le
  bord haut du lieu.
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

- **Livrets absents du site FFG** (Curse of the Rougarou et Carnevale of
  Horrors, encarts de 2016) : la page produit ne propose aucun PDF ; la
  transcription Hall of Arkham (`hallofarkham.com/wp-content/uploads/2021/01/curserules.pdf`,
  `…/carnevalerules.pdf` — celle-ci est une image sans couche texte :
  rendre les pages et les lire) reprend texte et icônes de l'encart — lire le sac sur l'image à
  600 dpi comme d'habitude ; BGG (fils « PDF rules ») répond 403 au
  bac à sable. Le lien `guide` pointe donc hors FFG : à remplacer si
  l'utilisateur fournit mieux.
- **Bac à sable sans CDN** (session planifiée) : `cdn.arkham.build` et
  les polices Google répondent `ERR_CONNECTION_RESET` dans Chromium →
  cartes vides dans les captures et `wait_for_load_state("networkidle")`
  qui n'aboutit jamais ; dans un bloc de captures, préférer une attente
  fixe et ignorer ces seules erreurs console. Le `curl` des images
  fonctionne, lui (vérification des versos).
- **Les lieux d'une pile retirée au setup n'existent que dans
  `removed`** : un `placeAt` d'acte qui liste tous les codes possibles
  doit porter `ifAside` pour ne pas semer des rappels « à poser à la
  main » (Rougarou : douze codes déclarés, six posés).
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
- **Consignes de mise en place hors section « Setup »** (BoA : jetons
  « pour le reste de la campagne » et doom conditionnel dans les intros
  p. 6 et p. 11) : `pdftotext -bbox` donne les coordonnées des puces ; ne
  recadrer que la zone des puces (`Æ` / `=`) pour lire les icônes, sans
  rendre les paragraphes narratifs. Les glyphes pâles (elder thing,
  tablette) demandent un seuil clair et une dilatation des composantes
  avant corrélation.
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
- Un re-rendu par `replaceChildren` (sièges, histoire, entête du board)
  remplace l'élément sous la souris : le nouveau n'est pas `:hover` tant
  que la souris ne bouge pas — tout état visuel « au survol » qui doit
  survivre à un clic (bouton d'une chip) se rejoue par classe après le
  rendu (`garderChipsDeployees`), ou en réutilisant l'élément comme
  `majCarte` sur le tapis.
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
  (2026-09-10, p. 2, icônes vérifiées par corrélation avec tokens.ttf),
  The Blob, Fortune and Folly et Curse of the Rougarou saisis (2026-09-10, p. 2 / p. 1 à 600 dpi, deux niveaux : Facile joue
  Standard, Expert joue Difficile — le lobby propose toujours les quatre ;
  un champ `difficulties` qui masquerait Facile / Expert reste possible
  si l'utilisateur le demande) ; reste TDC, TDE‑A et Film Fatale (section
  Setup / encart du guide).
- **Brethren of Ash** (campagne complète) : le II reporte le journal du
  I par deux questions (université, porteur d'Armitage) tirées du Setup
  p. 6 seul et ajoute les 2 cultistes du guide ; le III reporte ces
  cultistes par la question `mode` (campagne / isolé), ajoute les jetons
  de la p. 11 selon la difficulté et lit le journal par une question
  `multi` (quatre mentions). Les résolutions n'ont pas été lues — si
  elles modifient le sac ou le journal au-delà de ces mentions,
  l'utilisateur fournit l'extrait (sinon rappel « ajustez le sac »).
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
