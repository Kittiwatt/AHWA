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

- 2026-09-09 : **The Vanishing of Elina Harper (TIC II) livré** (choix
  validés : lobby A, pile Leads A, référence et cartes cachées OK,
  liste des pistes A, accusation A, verso de l'agenda 1 A, disposition
  sans pointillés). Guide p. 9‑11 + flashbacks p. 6 lus (retraits :
  Flashback II = cultiste, III = tablette, IV = ancien — jamais cités
  au lobby : trois oui/non « jeton X retiré du sac au scénario I ? »,
  plus « campagne / autonome », sac autonome = sac de base). Sets :
  `the_vanishing_of_elina_harper` (07056‑83), `agents_of_dagon`
  (07084‑85), `fog_over_innsmouth` (07094‑95), `the_locals` (07105‑07)
  + Core `chilling_cold`, `locked_doors`, `nightgaunts` et **seulement
  False Lead 01136 ×2 + Hunting Shadow 01135 ×3** du set Core `arkham`
  (The Midnight Masks) via `extraCards` ; pioche 25. **Finding Agent
  Harper 07062a** : story dont le verso lié 07062b (Angry Mob, ennemi)
  n'existe pas comme carte API — le build lit `linked_card` (backCode
  / backKind enemy / backName / backHealth) ; posée par `place` dans la
  zone `story` et rendue dans la colonne Agenda et acte (cartes de kind
  story de la zone histoire). **Leads deck** : op `leadsDeck` (un
  suspect + une cachette au hasard → pile `secret` face cachée, ordre
  mélangé ; dix autres → pile `leads`), pile secrète protégée
  (`pileSecrete` : drawEncounter / searchEncounter / shufflePile /
  randomPick refusés, `data-drop="none"`), **Parley** = `leadsReveal
  {n}` (menu de la pile « Parley : révéler 1/2/3 pistes », cartes dans
  la pile `leadsShown` rendue en éventail avec « Prendre » et
  « Remettre ») → `leadsTake {id}` (cachette sur le premier
  emplacement libre des six `spots`, révélée avec ses indices ; ennemi
  ou carte de rencontre → zone de menace du demandeur ; reste + première
  carte de la pioche de rencontre remélangés dans Leads — défausse
  remélangée d'abord si la pioche est vide) / `leadsReturn`.
  **Pistes** (`state.leads.eliminated`) : rayées à la pioche, au
  « regarder les premières » (le regard est privé, la rature est
  publique : c'est l'esprit du guide), au Parley ; `leadsToggle
  {code}` à la main ; panneau « Pistes » (douze noms, rayés, ● = en
  jeu). **Accusation** (`accusation {suspect, hideout}`, dialogue
  `ouvrirAccusation` : rayés et cartes en jeu grisés, rien de bloqué,
  une seule accusation) : cartes cachées révélées, verdict (0 →
  rappel « démissionner », 1 → référence côté verso posée à Innsmouth
  Square, 2 → rien), cachette en jeu sur un emplacement libre avec
  indices imprimés + 1 par enquêteur, Elina dessus, ravisseur dessus,
  acte 2 et agenda 3 depuis la zone de côté (acte 1 et agenda courant
  de côté, agenda 2 restant retiré, doom retiré), piles Leads et
  pistes révélées retirées, rappels act:2 / agenda:3, journal complet
  nommant la vérité ; `state.leads.accused` / `truth` affichés dans le
  panneau. **`agendaEffects`** : `{"2": {shuffleAside: [Winged One,
  Hunting Nightgaunt], withDiscard: true}}` appliqué dans `avancer`
  (comme la marée). **`chaosRemove`**. Layout : colonnes 365 / 551 /
  737 / 923 / 1109, rangées 173 / 411 / 649, Grocery et Refinery à
  292, Gilman et Bridge à 530 ; Square révélé au centre, six autres non
  révélés (leur dos montre nom et illustration : normal). Tests : 499
  messages (bloc Harper : sac 18/19/20 selon réponses, Leads 10 / secret
  2, journal muet, pile secrète refusée, regarder = rayer, Parley
  révéler / prendre / remettre et comptes, rayer à la main, agenda 2
  = 3 cartes de côté + défausse dans la pioche, accusation 1/2 (référence
  à Innsmouth Square, indices + 1 par enquêteur, ravisseur et Elina sur
  la cachette, acte 2 / agenda 3, Leads retirée), 0/2 (démission), 2/2)
  ; captures 77‑81.
- 2026-09-09 : **sac du chaos en bas à gauche de Commit** (`.sac-joueur`
  : `bottom: 0.5rem`, jetons tirés alignés en bas vers la droite) et
  **« Auto-pay » dans la fenêtre de la défausse** du board : `p:play`
  accepte désormais une carte de la défausse (payée, journal « depuis sa
  défausse ») ; le client partage `autoPay()` / `titreAutoPay()`
  (`interactions-joueur.js`) entre le bouton AP de la main et la
  fenêtre. Au passage, correction d'un vrai piège : la **composition du
  sac** (popover au survol) captait le pointeur — une carte glissée
  au-dessus du sac l'ouvrait et le lâcher tombait dessus, hors de toute
  zone de dépôt ; `.sac-popover:not(.epingle) { pointer-events: none }`
  (room.css, tapis et board). Test : `p:play` depuis la défausse payé et
  rangé selon le type ; captures relatives (l'auto-pay peut avoir mis un
  soutien en jeu ou un skill dans Commit avant les pas suivants).
- 2026-09-09 : **« Voir sur ArkhamDB »** dans le menu (clic droit) de
  toute carte, tapis et board joueur : ouvre `https://arkhamdb.com/card/
  <code>` dans un nouvel onglet (`urlArkhamDB()` de `cartes.js`). Rien
  pour les clés, pions, espaces vides et enquêteurs personnalisés ;
  jamais pour un dos (un lieu non révélé, une carte de rencontre face
  cachée : la page montrerait le recto) ; sur le board, les cartes de sa
  main (ou d'une main regardée) et les cartes révélées à tous l'ont ; un
  verso lié visible (verso-lieu, Nathan Wick) mène à sa propre carte.
  Vérifié par script : lieu non révélé sans entrée, lieu révélé → onglet
  `/card/07047`, clé sans entrée, enquêteur avec.
- 2026-09-09 : **défausse du board : menu de la pile même sur la carte du
  dessus** — dès qu'une carte était dans la défausse, le clic droit
  ouvrait le menu de cette carte et « Rechercher (sans mélanger) »
  devenait inaccessible. Sur la défausse et la pile hors jeu, le clic
  droit sur la carte du dessus ouvre désormais le menu de la pile
  (`pileEntiere` dans `interactions-joueur.js` ; la pioche garde le menu
  de la carte révélée dessus), et les étiquettes « Défausse » / « Hors
  jeu » sont des boutons qui ouvrent la recherche (`.etiquette-pile
  .cliquable`, soulignés en pointillé).
- 2026-09-09 : **retours d'UX, deuxième salve** (board joueur et tapis).
  **Jauges d'enquêteur uniformisées** : ressources, indices, dégâts et
  horreur sont les mêmes chips que sur les cartes (clic = +1, « − » au
  survol), via `chipJauge()` de `cartes.js` — dans l'entête du board
  (`.jauges-inv`, plus grandes) et dans les sièges du tapis (colonne
  `.jauges-col`, `ligneCompteur` supprimée ; dégâts et horreur affichés
  « subis/max » comme sur les cartes). Les pips d'actions restent (le
  « + » donne une action supplémentaire). **Board joueur** : le bouton
  qui dépense une action (`.bouton-action`, le même que sur le tapis),
  « Fin de mon tour » / « Prendre mon tour » et « Phase suivante » sont
  **au-dessus de la main**, à droite de l'aide (`blocTour`, `.tour-main`) ;
  le **sac du chaos** est **juste à droite de Play, par-dessus la bande
  Commit** (`.sac-joueur` absolu dans `.bloc-cours`, `#chaos` persistant
  déplacé à chaque `rendreJeu` pour garder la composition épinglée ;
  `padding-left` de la bande pour le sac, les jetons tirés recouvrent
  les cartes engagées) ; **hors jeu = une seule pile** (dernière carte
  arrivée visible, badge, clic ou menu « Chercher » → fenêtre locale
  avec En jeu / En main / Défausser / Sur la pioche — pas d'aller-retour
  serveur, les cartes sont déjà connues) ; le bouton « Rechercher (sans
  mélanger) » de la veille est retiré au profit de l'entrée du **clic
  droit sur la défausse** (remplace « Consulter »). Captures : le
  dépôt d'une carte dans Commit se fait à droite du sac (le sac
  intercepte les pointeurs). Captures 70b‑70d.
- 2026-09-09 : **retours d'UX sur le board joueur** (deux) — bouton
  **« Rechercher (sans mélanger) »** sous la défausse de la page joueur
  (même fenêtre que « Consulter » du clic droit : ordre conservé,
  reprendre en main / sur ou sous la pioche / mélanger ; grisé si la
  défausse est vide) ; dans **« Mon lieu »**, les enquêteurs présents
  sont posés **sur le lieu**, à cheval sur son bord haut, comme sur le
  tapis (mêmes éléments `.mini` via `carteEl`, 35 px, `.pions-lieu`), au
  lieu d'une rangée de portraits en dessous. Au passage : titre de la
  fenêtre de défausse au singulier (« 1 carte »), import `urlImage`
  inutilisé retiré de `joueur.js` (attention : un `export { urlImage }`
  orphelin en fin de fichier cassait le module — la page joueur restait
  sur « Connexion à la table… » ; toujours ouvrir la page après un
  changement d'import). Captures 58b et 62b.
- 2026-09-09 : **The Pit of Despair (TIC I) livré** — première table de
  The Innsmouth Conspiracy (choix validés par l'utilisateur : clés OK,
  inondation A avec B en secours, pile Tidal Tunnel OK, profondeurs A,
  chambre de départ A, visuels A puis B plus tard). Guide TIC lu en
  entier (Setup p. 4‑5, règles clés / inondation / bénédiction p. 2‑3,
  sac p. 3 lu sur l'image de la page). **Clés de couleur à deux faces** :
  `keys {colors, faceUp}` (bleue et verte face visible ; rouge, jaune,
  violette face cachée, ordre mélangé, nom masqué « clé face cachée »
  côté serveur `nomVisible` et client `nomCle`), `cleDeCouleur()`,
  retournables (`flipCard`), retournées d'elles-mêmes quand un siège en
  prend le contrôle (`moveCard` vers `seat<n>`), menus « Retourner » et
  « Contrôlée par… » ; op de setup et action **`randomKey`** (une clé
  cachée de côté tirée au hasard, posée sur une carte sans être regardée,
  `poserCleSur` à cheval sur le bord gauche) ; images SVG originales
  `public/img/keys/<couleur>.svg` + `back.svg` (dos commun, anneau
  pointillé), classe `.mini.cle.couleur` / `.cachee`. **Inondation** :
  `tokens.flood` 1/2 sur les lieux (image `.inondation` en haut à
  gauche, `flood_partial.svg` / `flood_full.svg`), menu du lieu
  « Inondation sec / ½ / plein » (`setFlood`), `addToken flood` borné
  à 2 ; **marée automatique** : `flood.byAgenda[stage] = {all,
  onReveal}` du `*.src.json` — `avancer` inonde les lieux révélés
  (`inonderTout`) et pose `state.flood.onReveal`, appliqué par
  `revealLocation` (`inonderALaRevelation`, suffixe de journal
  `texteMaree`) ; panneau **« Marée »** dans la colonne Agenda et acte
  (règle rien / +1 / plein, boutons +1 partout, tout inonder, −1
  partout, assécher → `floodRule` / `floodAll`). **Pile « Tidal
  Tunnel »** (`gather {backName}`, vide au départ, bouton « former » et
  menu → `formPile` : tous les lieux de côté au dos « Tidal Tunnel »,
  mélangés) et **`placeAround`** (`around: true` : menu « Tidal Tunnel
  autour de ce lieu » → dessous / gauche / droite aux cases libres de
  la grille 186 × 238, journal muet sur l'identité). **Pile
  « Profondeurs »** (`menuFor: ["enemy"]` → « Placer dans
  Profondeurs », clic = ressortir). **Sac TIC** (20 jetons en standard,
  crâne / cultiste / tablette / ancien ×2) ; `chaosReturn` rend
  bénédictions et malédictions à la réserve (jamais au sac),
  `chaosAdjust` les plafonne à 10. **`pickRandom` multi-exemplaires** :
  `from` accepte des codes répétés (Underwater Cavern ×2…) — les tirés
  sont pris dans le pool puis rendus (`pool.giveBack`), et les copies
  restantes de tous les codes candidats suivent `rest` (aside / pile /
  retrait) ; Before the Black Throne inchangé au test (les copies du
  lieu tiré vont dans le Cosmos dès le tirage, le `toPile` suivant les
  mélange). Setup : chambre révélée avec pions et indices + clé cachée
  au hasard posée dessus (journal muet) ; Idol Chamber, Altar to Dagon,
  Sealed Exit de côté non révélés ; 3 tunnels au hasard parmi 8 à
  gauche / droite / dessous, 5 de côté ; The Amalgam, Blindsense ×2,
  From the Depths ×3 de côté face visible ; pioche 25. Sets :
  `the_pit_of_despair`, `creatures_of_the_deep`, `flooded_caverns`,
  `rising_tide`, `shattered_memories` (pack **`tic`**) +
  `agents_of_cthulhu`, `rats` (Core) → `packs: ["tic", "core"]`. Lien
  du guide TIC (ahc82) au catalogue. Tests : 468 messages, douze
  scénarios (bloc Pit : clés, retournements, contrôle, clé au hasard et
  refus, inondation bornée, marée par agenda 2 puis 3, règle et masse,
  pile formée, tunnels autour avec cases occupées, profondeurs, sac
  bénédiction/malédiction, solo expert 22 jetons, refus hors TIC) ;
  captures 70‑75. Visuels : SVG à remplacer plus tard par des PNG
  générés dans le style des jetons du projet (choix B différé).
- 2026-09-09 (nuit) : **jauge d'Uses en chip** sur les cartes joueur en
  jeu : même mécanisme que les jauges dégâts / horreur (`majCarte`,
  `jauges` + `uses` quand `def.player && def.uses`), inversée — clic sur
  la chip = −1, bouton `.chip-plus` à gauche au survol = +1
  (`data-inverse`, delta lu sur `data-delta` dans les deux gestionnaires
  de clic) ; image 44 px sur le board (30 sur le tapis) ; le pion
  `uses` n'est plus rendu dans `.jetons` pour ces cartes. **Bouton
  Auto-pay** : visuel de l'utilisateur (`appile_256.png`, blanc rendu
  transparent → `public/img/autopay.png`) sur la pastille dorée, sans
  texte. Attention : Hallowed Mirror n'a pas d'Uses (il cherche ses
  cartes liées) — ne pas s'en servir pour tester les jauges.
- 2026-09-09 (soir) : **quatrième salve de retours**. **Auto-pay
  révisé** : glisser de la main (ou de hors jeu) vers en jeu, Play ou
  Commit = `p:put {id, zone, x, y}` sans coût (Uses posés pour un
  soutien en jeu ; menu « En jeu / Dans Play / Dans Commit (sans
  payer) ») ; bouton **« AP »** au survol d'une carte en main → `p:play`
  (coût, X, refus faute de ressources, rangée selon le type) ; l'élément
  de carte est réutilisé d'une zone à l'autre → `carteSansAP()` retire
  le bouton hors de la main. **Recherche → « En jeu »** corrigée : les
  menus posaient à x = 9999, hors de la zone visible ; `moveCard` vers
  `pplay<n>` avec x ≥ 9000 calcule maintenant la fin de rangée côté
  serveur. **« Phase suivante »** à côté de « Prendre mon tour » dans
  l'entête ; le sac reste à droite, ses jetons tirés en grille 1,7 rem,
  bornée (`max-height` 8 rem, défilement) — douze tirages ne cassent
  plus la page. **Loupe à 500 ms**. **Plus de notifications plein
  écran** : les rappels ne sont plus affichés en encart (ils sont dans
  le journal) ; sur le tapis, refus et informations deviennent des
  lignes **locales** du journal (`journalLocal(ctx, texte)`,
  `ctx.journalLocal` fusionné à `state.log` par date) ; sur la page
  joueur, ligne de statut `#statut` dans la barre de phase (6 s). Tests
  417 messages, captures relues.
- 2026-09-09 (suite) : **troisième salve de retours**. Page joueur :
  sac du chaos et « Phase suivante » déplacés dans la colonne de droite
  sous « Mon lieu » (`.outils-joueur`, popover du sac vers le haut ;
  l'aside passe en `overflow: visible`, seul `#mon-lieu` défile, sinon
  le popover serait rogné) ; **pions des cartes joueur** : 46 px sur le
  board (34 sur le tapis), visuel dégagé, nombre dans une **pastille**
  au coin (`.jeton .n`), boutons **±** au survol (`.pmj`, `elJetons(…,
  pastille)`, clic géré dans les deux interactions). **Loupe** : délai
  d'une seconde (`LOUPE_DELAI`, timer annulé au pointerout) et classe
  `a-droite` quand la loupe recouvrirait la carte survolée (la carte
  tout à gauche restait cachée). Tapis : **« Test résolu »** dans le
  Commit volant, actif pour le siège concerné (`p:resolve` agit sur le
  siège de la connexion). Captures : les survols attendent 1,4 s.
- 2026-09-09 : **pions d'utilisation par type**. Images fournies par
  l'utilisateur (conversation du projet) copiées dans
  `public/img/tokens/uses/` (18 pions 140 × 140, disque inscrit, coins
  blancs rognés par le `border-radius`), table `data/uses_tokens.json`
  (type ArkhamDB et alias → fichier, libellé ; `resources` = jeton
  ressource ; repli `uses.png` pour tries, whistles, durability…) →
  `public/js/room/uses.js` (`imageUses`, `libelleUses`). `elJetons`
  choisit l'image du pion `uses` d'après `def.uses.type` ; classe
  `joueur` sur les cartes joueur ; leur pile de pions est placée **en
  bas sur le texte, à 56 % de la largeur** (`.carte.joueur .jetons`),
  plus en haut à gauche sur le coût. Les jetons `tok_*` du projet
  (versions à marge) ne remplacent pas ceux du dépôt.
- 2026-09-09 : **deuxième salve de retours**. Tapis : la **case Play**
  du siège passe à côté de la zone de menace (grille `.siege-corps` à
  quatre colonnes, `casePlay`), les bandes sous le siège disparaissent ;
  **Commit volant** (`#commit-volant`, dans `.plateau-zone`, posé au
  dessus de `.table-outils` par `offsetHeight`) : visible dès qu'un
  siège a des cartes dans `pcommit<n>`, groupées par siège, **total des
  icônes de compétence** sur le côté. Données : `skill_*` d'ArkhamDB →
  `sk {w,i,c,a,x}` dans l'index → `def.skills` ; icônes
  `public/img/skills/*.svg` (glyphes `skill_*` d'arkhamicons,
  `build_slot_icons.py`) ; helpers `totauxCompetences` /
  `elTotauxCompetences` dans `cartes.js` (cartes face cachée non
  comptées). Board : mêmes totaux sur le côté de Commit ; **glisser
  depuis la pioche** = `p:drawTo {zone, x, y}` (première carte, face
  cachée, en jeu / Play / Commit / hors jeu / menace ; menu « Poser la
  première carte face cachée ») — piège : `preventDefault()` au
  pointerdown sur le dos, sinon le glisser natif de l'image déclenche
  `pointercancel`. **Plein écran** : `@media (display-mode:
  fullscreen)` + classe `plein-ecran` posée par `surveillerPleinEcran()`
  (matchMedia, pas d'heuristique de taille : elle se déclenchait à tort
  en headless) → `.barre` cachée, hauteurs à 100vh. Tests 411 messages,
  captures 69 ajoutée.
- 2026-09-09 : retour de test — colonnes latérales de la page joueur
  (pioche / défausse / hors jeu à gauche, « Mon lieu » à droite) élargies
  à `carte + 3rem` avec `overflow-x: hidden` et `box-sizing:
  border-box` : plus de barre de défilement horizontale sous ces
  colonnes à 1920 × 1080 (mesuré : `scrollWidth` = `clientWidth`).
- 2026-09-08 (nuit) : **correctif de nomenclature** (l'utilisateur
  s'était mal expliqué) : la zone board des soutiens **reste « en
  jeu »** (`pplay<n>`) ; **Play** est une **nouvelle case d'une carte**
  (`pevent<n>`) où l'on joue un événement (payé) jusqu'à « Résolu » →
  défausse (jouer un second événement défausse le premier) ; **Commit**
  (`pcommit<n>`) pour les skills engagés. `p:play` range par type
  (soutien → en jeu, événement → Play, skill → Commit) ; `p:resolve
  {zone: "play"}` vide la case Play. Sur le tapis, **seules Play et
  Commit** sont visibles (bandes sous le siège), pas la zone en jeu.
  **« Mon lieu » passe à droite** (l'utilisateur avait dit gauche par
  erreur). Tests 406 messages, captures relues.
- 2026-09-08 (soir) : **retours de test, push 2 — mise en page**. Page
  joueur : cartes **113 × 160** (`--carte-l/h` redéfinies sur
  `.board-joueur`), chips et jetons agrandis, sac du chaos et jetons
  tirés plus grands, police 1,05 rem ; **entête compacte** sur une
  rangée (portrait + nom + ★, compteurs en chips icône / valeur / ±,
  actions et tour, main et slots en icônes, mise en place) — 104 px au
  lieu de 110‑184 ; en lecture seule le formulaire « Rejoindre ce
  siège » et l'étiquette « lecture seule » passent dans la barre
  d'onglets ; colonne **« Mon lieu »** (à droite depuis le correctif
  suivant ; lieu du pion par la
  même règle que « Poser sur mon lieu », rendu `carteEl` = même état
  que le tapis, pions présents, « Prendre 1 indice », « Révéler »,
  cartes posées dessus) ; Commit et zone de menace côte à côte sous
  Play ; hors jeu en colonne. Piège : `replaceChildren(null)` insère le
  texte « null » — helper `remplir()` qui filtre. Captures relues.
- 2026-09-08 (soir) : **retours de test, push 1 — règles et
  nomenclature**. Zones renommées **Play** (`pplay<n>` : tout ce qui est
  joué et payé, événements compris, à défausser une fois résolus) et
  **Commit** (`pcommit<n>`, ex-`plimbo` : cartes engagées au test,
  bouton « Test résolu ») ; migration `plimbo` → `pcommit` dans
  `onStart`. **Ressources jamais négatives** : `p:play` refuse faute de
  ressources (nack lisible → encart), `setSeatCounter` borne tout à 0
  (décision D1 révisée). Cartes en jeu retournables : « Autre face »
  (`toggleSide`) pour les versos liés (`linked_to_code` d'ArkhamDB : Sophie
  ↔ 03009b, Dream-Gate 06015a ↔ 06015b, Disciplines, Ravenous, Flux
  Stabilizer, The Great Work → `lk`/`ln` dans l'index, `backCode` /
  `backName` dans la définition ; ArkhamDB ne renseigne pas
  `double_sided` pour les cartes joueur), « Retourner » (`flipCard`, dos
  joueur) pour les autres. Badges de slot **retirés des cartes**,
  **icônes de slot dans la barre** à la place des noms. Loupe sur le
  portrait de l'enquêteur (`[data-loupe-id]`) et bouton « verso »
  (`ahwa:loupe-image`, loupe épinglée). « Voir le board » cible une
  fenêtre nommée (`ahwa-board-<code>-<n>`) : un seul onglet par board.
  Sur le tapis, **bandes Play / Commit** sous chaque siège avec deck
  (cartes à 70 %, loupe, menu, main comptée) — décision F1 révisée par
  l'utilisateur (« visibles et partagées avec la page scénario »). Tests
  404 messages, captures relues. Reste le push 2 (mise en page : tout
  plus grand, barre compacte, zone « mon lieu »).
- 2026-09-08 : **board joueur, étape 3 livrée** (cahier §10.9) — jouer.
  Serveur (`src/joueur.ts`) : `p:play {id, cost?, free?}` (main → en
  jeu pour un soutien avec ses Uses, → « en cours » pour un événement ou
  un skill ; coût imprimé, X fourni par le joueur, gratuit si `free` ou
  depuis hors jeu ; ressources jamais bloquées), `p:commit` (engager au
  test, sans coût), `p:resolve` (tout « en cours » → défausse ; une
  carte de rencontre égarée là → défausse de rencontre), `p:toLocation`
  (sur le tapis, sur le lieu le plus proche du pion du siège — `MINI`
  est un nombre, 44 — sinon au centre). Front : dépôt main → en jeu =
  jouer (prompt pour X), main → en cours = engager, hors jeu → en jeu =
  gratuit ; menus « Jouer (payer n) », « Engager au test », « Mettre en
  jeu sans payer », « Poser sur mon lieu » ; bouton « Résolu » ;
  ressources négatives surlignées ; **badges de slot** sur les soutiens
  joueur face visible (`.badge-slot` dans `majCarte`, icônes
  `public/img/slots/*.svg` générées par `scripts/build_slot_icons.py`
  depuis `arkhamicons.ttf` d'Arkham Cards : hand, hand_x2, arcane,
  arcane_x2, ally, body, accessory, tarot, head + health, sanity,
  action, free, reaction, per_investigator) ; sur le tapis, menu des
  cartes joueur (reprendre sur le board, défausse du joueur, menace,
  jetons). **Retour de test corrigé** : la loupe ne s'ouvrait pas sur
  les cartes de la main (l'état les dit face cachée, l'élément est rendu
  face visible : `initLoupe` se fie désormais à la classe `retournee`
  de l'élément). Tests : 400 messages (jouer, X, gratuit, engager,
  résoudre, cartes liées gratuites, poser sur son lieu et retour,
  gardes) ; captures 66‑68. Arkham Cards n'a **pas** d'icône par type
  d'Uses : ces jetons restent l'image ressource cerclée.
- 2026-09-07 : **board joueur, étape 2 livrée** (cahier §10.9) — mise en
  place du joueur, mulligan, pioche / main / défausse, entretien
  automatique, pioche vide. Serveur (`src/joueur.ts`) : `p:setup`
  (mélange, permanents et `startsInPlay` → en jeu avec leurs Uses,
  +5 ressources, main de 5 ; une faiblesse tirée va dans la pile
  **`pweak<n>`** et est remplacée), `p:mulligan {ids}` (rendues +
  `pweak` remélangées, une seule fois), `p:keep`, `p:draw {n}` (pioche
  vide : défausse remélangée + rappel « prends 1 horreur » ; les deux
  vides : rappel « vaincu »), `p:discard`, `p:randomDiscard` (journal
  nomme), `p:toHand` (depuis la pioche : sans nommer), `p:reveal`
  (`revealed`), `p:search {pile, n?}` (`peek` ; le client remélange
  après une recherche complète), `p:exile`, `p:aside` ; `entretienJoueur`
  appelé par `nextPhase` → entretien (pioche 1, +1 ressource, rappel si
  main > 8). Gardes : `toPile` / `moveCard` / `shufflePile` sur une pile
  ou zone d'un autre board → `siege` ; `drawEncounter` / `randomPick` /
  `searchEncounter` / `reshuffleDiscard` refusés sur les piles de board ;
  `pdiscard<n>` traité comme défausse (face visible) ; `nomVisible` lit
  `extraDefs` pour nommer les cartes joueur. `Refus` / `refuser` dans
  `src/refus.ts` (évite le cycle actions ↔ joueur). Front :
  `interactions-joueur.js` (glisser-déposer main ↔ en jeu / en cours /
  hors jeu / menace, sur la défausse et la pioche ; clic sur la pioche =
  piocher ; sélection pour le mulligan ; menus des cartes et des piles ;
  fenêtre de consultation avec boutons par carte), `joueur.js` (boutons
  « Mise en place », « Mulligan (n) » / « Garder ma main », « Piocher »,
  « Défausser au hasard », faiblesses mises de côté comptées, badge
  « montrée »), jeton `uses` rendu avec l'image ressource cerclée
  (règle : ce sont des jetons ressource). Tests : 386 messages (bloc
  board joueur étendu : mise en place, Sophie en jeu, faiblesses de
  côté, mulligan une seule fois, gardes, pioche / défausse / recherche,
  entretien pour tous les boards, pioche vide, défaite) ; captures
  61‑65. Reste pour l'étape 3 : `p:play` (auto-pay, X, sans payer),
  limbes « Résolu » / « Garder en jeu », badge de slot, exil par menu
  déjà là, « Poser sur mon lieu » et retour, journal ; images des Uses.
- 2026-09-07 : **board joueur, étape 1 livrée** (cahier §10.9) — import
  du deck au lobby, code de siège et connexions multiples, page joueur
  affichée. Build : `scripts/build.mjs` produit **`public/data/
  player_cards.json`** (1 838 cartes joueur avec image, 74 faiblesses de
  base ; 230 Ko, 40 Ko gzip : coût, slot, permanent, jauges, « Uses (n
  type) » par regex, `bonded_to`/`bonded_count`, sous-type faiblesse,
  traits) et ajoute **`startsInPlay`** aux enquêteurs (« You begin the
  game with X in play » : Duke, Sophie, Gate Box, Pete's Guitar,
  Darrell's Kodak, Ravenous ; « each Discipline in your deck » → trait).
  Serveur : `src/joueur.ts` (liens : `decklist/view` avant `deck/view`,
  `arkham.build/share/<id>` et `deck/view/<id numérique>` via
  `api.arkham.build/v1/public/share/<id>` avec repli ArkhamDB, deck
  local refusé ; fetch côté DO avec `redirect: "manual"` — un deck
  ArkhamDB privé = redirection → message « rends-le partageable » ;
  recto parallèle `meta.alternate_front` ; `ignoreDeckLimitSlots`
  ajoutés, `sideSlots` ignorés ; cartes liées par nom ; codes inconnus
  ignorés et signalés ; faiblesse pondérée par `quantity`, solo sans
  06035‑38 ; `creerDecks` après `runSetup` : piles `pdeck<n>`,
  `phand<n>`, `pdiscard<n>`, zones `pplay<n>`/`plimbo<n>`/`paside<n>`,
  cartes `player: true` + `ownerSeat`, définitions dans `extraDefs`) ;
  `room.ts` : `Seat.pin` (4 chiffres, `crypto.getRandomValues`),
  `Seat.connections` (tenu à jour avant `welcome`/`you` — un test
  « welcome = état local » l'exige), `takeSeat {pin}` et `?pin=`,
  libération à la dernière fermeture, `importDeck`, `resolveWeakness`,
  tirage automatique des placeholders au « Lancer », compteur
  `resources` (seul compteur qui peut être négatif), garde **`siege`**
  sur les `p:*` (encore aucune action : étape 2), migration des tables
  existantes dans `onStart`. Route `/r/<code>/j/<n>` → `joueur.html`.
  Front : `siege.js` (siège + code mémorisés en JSON, ancien format
  lu), `net.js` (`pin`), `deck.js` (champ d'import, résumé, « Tirer au
  hasard » / « Choisir… » avec la liste des faiblesses), `lobby.js`,
  `tapis.js` (ressources, code de siège, « n appareils », lien « Voir le
  board »), **`joueur.js`** + `joueur.css` (onglets des sièges, entête
  compteurs / tour / slots / mise en place, sac dans la barre de phase,
  pioche, défausse, hors jeu, en jeu, en cours, menace, main masquée
  chez les autres avec « Regarder », formulaire « Rejoindre ce siège »
  par code). Tests : 301 messages, bloc board joueur (deux decklists
  ArkhamDB dont une avec placeholder, deck arkham.build parallèle +
  customisations + taboo, refus, doublon, pin, seconde connexion, mise
  en place, déplacements, reset, clearInvestigator) ; captures 54‑60.
  Sans tests unitaires ni régression cassée : les onze tables passent.
- 2026-09-05 : **double-clic sur un lieu du tapis = le retourner**
  (demande de l'utilisateur) : `flipCard` sur un lieu révélé, `toggleSide`
  sur un lieu à deux faces de jeu, `revealLocation` sur un lieu caché ;
  garde de 800 ms après une révélation au clic (`derniereRevelation`)
  pour que clic + double-clic ne retourne pas ce qu'on vient de révéler.
  Double-clic sur le jeton d'indice = prendre un indice, inchangé ;
  double-clic sur les autres cartes = épuiser, inchangé. Vérifié en
  navigateur (NotZ I et II).
- 2026-09-04 : **enquêteur personnalisé** (demande) : dans la fenêtre
  « Choisir un enquêteur », section « Hors collection » en tête avec
  l'entrée « Enquêteur personnalisé » (toujours visible, même quand la
  recherche ne trouve rien ; rappelle le nom courant), qui ouvre dans la
  même fenêtre un formulaire nom / lien d'image (facultatif, aperçu) /
  vie / santé mentale, prérempli si le siège en a déjà un. Serveur :
  message `chooseCustomInvestigator` → `seat.custom {name, image, health,
  sanity}` et `investigatorCode = "custom:<siège>"` (unique par siège,
  donc pas de doublon) ; nom normalisé ≤ 40, jauges entières 1‑99
  arrondies, image = lien http(s) sans espace ≤ 600 (tout autre schéma
  refusé) ; `custom` voyage dans `welcome`, les deltas et `seats`
  (`SeatSummary`) ; effacé par `chooseInvestigator` / `viderSiege`,
  conservé au `reset` ; `nomSiege` (room.ts et actions.ts) l'utilise. Front :
  `inscrireCustoms` (main.js) inscrit à chaque rendu les customs dans
  `ctx.investigateurs` (fiche neutre, `custom: true`, `image`) et
  `ctx.defs` (`kind investigator`, `back player`) → lobby, cartes, pions,
  menus, loupe et journal les résolvent comme les autres ; `urlImage`
  rend l'image du custom (dos joueur au verso) ; carte `.custom` = image
  entière (`contain`), pion `.mini.custom` = image en rond ; sans image
  ou lien mort (`error` mémorisé en `data-img-erreur`) : nom sur la carte
  (`.nom-custom`), initiales sur le pion. Classe affichée : neutre.
  Tests : 276 messages (bloc Doorstep : refus, normalisation, cartes
  `custom:1`, spectateur, reset) ; captures 48‑53 (Doorstep).
- 2026-09-04 : **Before the Black Throne (TCU VIII) livré — la campagne
  est complète (hors prologue)**. Guide p. 36‑37 : Cosmic Ingress révélé
  (3 indices fixes, pions), **le Cosmos** = pile « Cosmos » des lieux
  restants (11), côté « Cosmos » (`backName`) ; **deux cartes
  indistinguables** en haut et en bas à droite (Hideous Palace + la
  première du Cosmos : `pickRandom` sans zone → `slot:cosmosTop`, puis
  `pickRandom from: ["05333", "slot:cosmosTop"]` — `from` accepte un
  slot —, journal muet sur leur identité) ; **six espaces vides** (op
  `emptySpace`, cartes `empty:space` de kind `proxy` rendues avec
  `/img/dos-joueur.svg`, menu « Retirer ») ; en jeu, l'action
  `emptySpace {x, y}` par le menu des lieux (« Espace vide au-dessus… »)
  quand `emptySpace: true`. Court of the Great Old Ones et The Black
  Throne de côté (côté Cosmos), Piper de côté, **Azathoth** posé à gauche
  du tapis (en jeu, à aucun lieu). **Marques du journal** (question
  numérique 0‑8) → jetons ressource sur la carte de scénario (`addTokens
  {nFrom}`) ; **Interlude IV** : aide demandée → jeton par difficulté
  (`chaosAdd {byDifficulty}` : −3 / −4 / −5 / −7 ; jeton **−7** ajouté
  au type Token, à CHAOS_TOKENS et aux libellés du front, image m7.svg
  existante). Menu de pile « Regarder les n premières » (`searchEncounter
  {n}`, journal diffusé même sans changement d'état : room.ts commet si
  le journal a grandi). Sets : `before_the_black_throne` (pack **`bbt`**),
  `agents_of_azathoth`, `inexorable_fate`, `ancient_evils`, `pentagram`.
  Pioche : 30. Tests : 262 messages, onze scénarios (difficulté
  « difficile » via `setDifficulty {d}`) ; captures 45‑47.
- 2026-09-04 : **In the Clutches of Chaos (TCU VII) livré** (choix
  laissés à Claude). Guide p. 30‑32 : **une version sur deux** pour six
  lieux (`pickRandom` par paire, `rest: "pile"` → les versions non
  utilisées, plus celles de Hangman's Hill / Silver Twilight Lodge de
  l'autre branche, forment la **pile « Lieux au hasard »**, mélangée),
  Southside révélé (`slot:southside`, pions) ; **deux mises en place
  selon la résolution du VI** (question « Anette possédée / Sanford
  détenteur des secrets ») : sets additionnels et actes 1‑2 (Music of
  the Damned ou Secrets of the Universe, actes 05286a/05287 ou
  05288a/05289 — verso de l'acte 1 = ennemi lié Anette / Sanford, santé
  6, flux « Retourner » puis « Avancer »), versions de Hangman's Hill et
  de la Loge, retraits par codes (les 5 traîtrises de The Midnight Masks
  01135 ×3 / 01136 ×2 via `extraCards` ; Nightgaunts = `nightgaunts`,
  Music/Secrets = `music_of_the_damned` / `secrets_of_the_universe`
  dans le pack **`icc`**). Piper of Azathoth de côté. **Brèches** :
  `randomTokens {token: resource, picks: [2,2,2,3], rounds: [1,2,3,3]}`
  au setup ; **`mythosDoom: false`** (la phase du mythe n'ajoute pas de
  doom, journal explicite) ; nouvelle action **`randomPick {pile, n}`**
  (menu de pile « Tirer 1/2/3 au hasard (sans sortir) » → noms dans le
  journal et encart pour tous) pour « choisir un lieu au hasard ».
  Rappels : brèches/incursions paraphrasés (jeton ressource = brèche,
  chemins pour les lieux reliés), verso-ennemi de l'acte 1. Pioche : 35
  (Anette) / 37 (Sanford). Tests : 253 messages, dix scénarios (2 et 4
  joueurs) ; captures 42‑44. Piège : le serveur local peut mourir
  pendant une longue série de captures (≈ 10 tables) — relancer et
  passer les captures en arrière-plan (`setsid`, journal dans
  /tmp/captures.log).
- 2026-09-04 : **Union and Disillusion (TCU VI) livré** (choix laissés
  à Claude). Guide p. 26‑27 : Miskatonic River (révélé, pions) et
  Forbidding Shore, **deux Unvisited Isle sur six au hasard** en bas
  (`pickRandom` avec `rest: "aside"` — les quatre autres de côté — et
  `slot:isle:i`), **braseros** : si les enquêteurs ont pris le parti du
  coven, un jeton ressource sur Forbidding Shore et les deux isles
  (`addTokens`), rappel « Circle / Braziers » paraphrasé (jeton
  ressource = allumé, Marqueur ± pour l'éteindre). De côté : Geist-Trap
  (non révélé), Watcher's Gaze, Anette Mason et Josef Meiger tirés de
  la collection (`extraCards` du pack `tcu`, Josef synthétisé + dos
  histoire), sets Anette's Coven / Silver Twilight Lodge / The Watcher
  face visible ; **Missing Persons** (4 questions) : soutien de côté +
  carte **Fate** de côté face cachée (`storyBack`, verso lié = ennemi),
  sinon retirés. **Douze questions** au lobby : parti (Loge / coven,
  introduction), introduction du I, Loge, « trompent la Loge »,
  « Cercle intérieur », « souvenirs cachés », Black Book, hérétiques
  (numérique 0‑4 → `addDoom {nFrom}` sur l'agenda 1), quatre profils.
  **Actes 3 et 4 à quatre versions** selon des conditions composées :
  nouvelle op **`when {cond, then, else}`** (`Cond` : `{q, is}`, `all`,
  `any`, `atLeast n of`, `not`, `evalCond` dans scenario.ts) — Loge →
  v. I + Binding Rite ; coven + trompent + Cercle → v. II ; coven + au
  moins deux de (trompent, coven caché = `members_hid`, souvenirs
  cachés) → v. III ; sinon v. IV (+ Broken Rite), `story` ignorant les
  versions retirées. **Dos histoire** : `flipCard {reveal: true}`
  révèle une carte face cachée sur demande explicite (menu « Révéler
  (quand une carte l'indique) »), le verso lié s'affiche ensuite par
  « Autre face (…) » (label selon `backKind`). Build : `citesDe` et
  l'aplatissement parcourent `then`/`else`. Pack **`uad`** ; pioche 35
  cartes ; sac autonome p. 27 = tablette + ancien + cultiste. Tests :
  236 messages, neuf scénarios ; captures 39‑41.
- 2026-09-04 : **For the Greater Good (TCU V) livré** (choix laissés à
  Claude). Guide p. 22 : **deux mises en place selon la Loge** — question
  « Loge » à 7 réponses (cinq formules du journal + « partie autonome —
  membres / non membres ») ; membres : acte 1 Warm Welcome, Lodge Gates /
  Lobby / Lodge Cellar « We've Been Expecting You », retrait d'Acolyte ×3,
  Wizard of the Order, Knight of the Inner Circle ×2, Cell Keeper ; sinon
  acte 1 Infiltrating the Lodge, versions « Members Only », retrait de
  Lodge Neophyte ×3, Keeper of Secrets, Knight of the Outer Void ×2,
  Lodge Jailor — via `remove` dans chaque branche, et **`story` ignore
  désormais un agenda/acte retiré** (`pool.has`). Lounge et Lodge
  Catacombs en jeu (diagramme : Gates en haut, Lobby / Cellar, Lounge /
  Catacombs), pions sur Lodge Gates. De côté : Library, Vault, Inner
  Sanctum, les deux Sanctum Doorway (dos « Sanctum Doorway » =
  `backName`), Puzzle Box, Summoned Beast, August Lindquist, **Nathan
  Wick** (verso lié = second ennemi 05217b : menu « Autre face (Master of
  Indoctrination) », sous-titres exportés `subname`/`backSubname`,
  « Retourner » masqué). **Clés** : nouveau kind `key` (op `keys`,
  cartes `key:<jeton>` rendues avec `/img/chaos/<jeton>.svg` en petit
  pion), déplaçables sur le tapis (suivent un lieu), sur un siège ou de
  côté, refusées dans les piles et au retournement ; `nomVisible` les
  nomme « clé Crâne »… Sac : introduction I + Loge (cultistes) + Black
  Book (crâne) ; sac autonome p. 22 = tablette + ancien + cultiste.
  Sets : `for_the_greater_good` (pack **`fgg`**), `city_of_sins`,
  `silver_twilight_lodge` (tcu), `ancient_evils`, **`pentagram`** (= Dark
  Cult), `locked_doors` (Core). Pioche : 29 cartes dans les deux cas.
  Tests : 225 messages, huit scénarios ; captures 36‑38.
- 2026-09-04 : **The Wages of Sin (TCU IV) livré** (pile « Hérétiques »
  et défausse par trait validées par l'utilisateur). Guide p. 19‑20 :
  sept lieux selon le diagramme (Gallows / Chapel Attic en haut,
  Heretics' Graves / Haunted Fields / Abandoned Chapel / Chapel Crypt au
  milieu, Hangman's Brook en bas avec les pions) ; **une version sur
  deux** tirée au hasard pour quatre d'entre eux (`pickRandom` avec
  `reveal`, l'autre retirée), tous posés révélés face normale avec
  indices. Chez ArkhamDB ces lieux (05166‑76) sont des **cartes liées**
  dont le verso est la version Spectral (`<code>b`) : menu « Autre face
  (Spectral) » (`toggleSide`, sans révélation ni indices), « Retourner »
  masqué pour ces cartes. **Deux pioches de rencontre** : le build
  exporte `traits`, `buildEncounter {split}` scinde par trait (pioche
  spectrale 20, standard 24), `piles` déclare pioche + défausse
  (`discard`/`isDiscard`/`trait`), serveur (`defausseDe`, `estDefausse`,
  `remelangerDefausse` généralisé, `reshuffleDiscard {deck}`, tirage
  refusé sur une défausse, remélange automatique de la défausse
  spectrale quand sa pioche se vide) et client (rendu de la défausse
  déclarée, menus « Défausser (Défausse spectrale) » / « Sur / Sous /
  Mélanger dans Pioche spectrale » choisis d'après les traits, glisser
  libre). **Heretics** 05178a/c/e/g/i/k (codes à lettre, verso
  05178b… = carte histoire, `storyBack`) : quatre tirés au hasard
  (`pickRandom` sans zone, avec `log`), deux retirés, pile
  « Hérétiques » mélangée (clic = tirer côté ennemi, côté histoire par
  le menu). Spectral Web ×4 et The Watcher de côté face visible.
  Questions : introduction du scénario I, Loge (+ « partie autonome » :
  1 cultiste, sac autonome p. 19 vérifié = tablette + ancien +
  cultiste), **The Black Book** (résolution du III : +1 Crâne, icône
  vérifiée). Pack ArkhamDB **`wos`** (pas `twos`). Clic droit sur la
  carte révélée d'une pile → menu de la carte (captures NotZ adaptées :
  `dispatch_event("contextmenu")` sur la pile). Tests : 211 messages,
  sept scénarios ; captures 32‑35. Régression au vert.
- 2026-09-04 : **The Secret Name (TCU III) livré** (question unique de
  la Loge validée par l'utilisateur, le reste laissé à Claude). Guide
  p. 17 : Walter Gilman's Room en haut (non révélé), Moldy Halls au
  centre (révélé, pions), **trois Decrepit Door** = trois pièces
  différentes (05129‑31) au même dos, placées par `pickRandom` à des
  positions tirées au hasard ; **nom du verso** : le build exporte
  `backName` (ArkhamDB `back_name`) pour toute carte à double face, et
  serveur (`nomVisible`) comme client (`faceVisible`) nomment la face
  visible — journal, infobulles, menus disent « Decrepit Door » /
  « Unknown Places » tant que le lieu n'est pas révélé ; `pickRandom`
  avec `log` n'écrit plus une ligne par carte. **Unknown Places Deck** :
  nouvelle op `layeredPile` (couches du dessus vers le dessous, cartes
  imposées réservées avant les tirages — piège corrigé), pile
  « Unknown Places » : clic = tirer (côté non révélé), glisser = entre
  non révélé, clic = révélation. **Lieux à simple face** (Strange
  Geometry) : tirés sans côté b, ils entrent révélés avec leurs indices
  fixes. De côté : Nahab, The Black Book, Strange Geometry ×2, Ghostly
  Presence ×2 (face visible), Site of the Sacrifice et Keziah's Room
  (non révélés). `swaps` Walter Gilman's Room ↔ Keziah's Room (libellés
  complets après « Remplacer par », TCU II passé à « sa version
  spectrale ») ; nouvelle action **`removeLocations {keep}`** (« Retirer
  de la partie tous les autres lieux »). Questions : introduction du
  scénario I (comme TCU II) + **question unique de la Loge** (cinq
  formules du journal : membres + coven dévoilé → 2 cultistes, membres →
  1, ennemis / rien appris / jamais revus → 0 ; icônes vérifiées : Intro 2
  et Interlude II ajoutent chacun 1 Cultiste ; sac autonome p. 18 =
  tablette + ancien, sans cultiste). Sets : `the_secret_name` (pack
  **`tsn`**, premier pack Mythos), `city_of_sins`, `inexorable_fate`,
  `realm_of_death`, `witchcraft` (tcu), `rats` (Core) → `packs: ["tsn",
  "tcu", "core"]`. Pioche : 35 cartes. Rappels `act:2` (remplacement,
  retrait des autres lieux, mélange, Black Book), `act:3`, `agenda:2`.
  Tests : 175 messages, six scénarios ; captures 29‑31. Régression au
  vert (les agendas/actes des scénarios livrés gagnent un `backName` =
  titre du verso, sans effet de jeu).
- 2026-09-04 : **At Death's Doorstep (TCU II) livré** (choix laissés à
  Claude, utilisateur absent : à valider par ses retours). Guide p. 11 :
  sept lieux normaux selon le diagramme (Office en haut, rangée
  Billiards / Trophy / Victorian Halls / Master Bedroom / Balcony,
  Entry Hall en bas, révélé, pions), **questions au lobby** : les 4
  profils de « Missing Persons » (barré / non barré → 6 indices sur
  Entry Hall, Office, Billiards Room, Balcony via `addClues`), le
  nombre de « pieces of evidence » (**question numérique**, nouveau
  type `number` avec bornes et défaut ; `removeClues` retire autant
  d'indices, un à un à tour de rôle dans l'ordre du guide), et le
  choix d'introduction du scénario I (2 tablettes / 2 anciens) avec une
  option « partie autonome » (1 + 1, sac du mode autonome p. 11). De
  côté : les 7 lieux Spectral (non révélés), **Josef Meiger** (recto
  **synthétisé au build** depuis le verso 05085b « Josef's Plan », seul
  connu d'ArkhamDB ; `storyBack` : face cachée = dos générique, pas de
  retournement, **côté histoire lisible par `toggleSide`** — menu
  « Lire le côté histoire (quand une carte l'indique) »), sets Realm of
  Death et The Watcher face visible. **Lieux qui se remplacent**
  (`swaps` + action `swapLocation {id | all}`) : la jumelle prend la
  place, les jetons, les chemins et ce qui est posé, entre non révélée
  sauf si un pion s'y trouve (révélée, indices), l'ancien lieu part de
  côté ; menu du lieu « Remplacer par sa version spectrale » / « Tous
  les lieux → version jumelle ». Aussi : `clearClues` (« Retirer tous
  les indices des lieux »), `toPile {shuffle}` (« Mélanger dans la
  pioche » sur toute carte de rencontre), **rappels `act:<n>` /
  `agenda:<n>`** déclenchés quand l'acte/agenda devient courant
  (`avancer` renvoie les rappels ; moveCard/toPile/advance les
  propagent). Sets : `at_deaths_doorstep`, `silver_twilight_lodge`,
  `spectral_predators`, `trapped_spirits`, `inexorable_fate`
  (05107‑08), `chilling_cold` (Core) + de côté `realm_of_death`,
  `the_watcher`. Pioche : 25 cartes. Tests : 159 messages, cinq
  scénarios (TCU II : refus hors bornes / sans réponse, 3 profils +
  5 preuves = 4/4/0/5, swap simple et retour, swap de tous, indices
  effacés, mélange, rappels agenda:2 et act:2 ; solo autonome) ;
  captures 25‑28. Régression au vert. Piège corrigé : un rendu du
  lobby déclenché dans le `change` d'un champ numérique provoquait un
  rendu imbriqué (`replaceChildren` en erreur) → le champ ne rerend pas.
- 2026-09-04 : **The Witching Hour (TCU I) livré** — première table de
  The Circle Undone (le prologue viendra plus tard, à la demande de
  l'utilisateur ; choix structurels laissés à Claude, à valider par ses
  retours). Guide TCU lu en entier (Setup p. 8, « Lost and Separated »,
  sac p. 4, choix de l'introduction p. 8) ; pas de diagramme de
  placement pour ce scénario. Nouveau dans le moteur : **`dealToSeats`**
  (5 bois hantés tirés au hasard, distribués un à un dans l'ordre des
  joueurs — principal d'abord, puis les sièges en boucle —, une rangée
  du tapis par enquêteur servi : x = 120 + 190 j, y = 40 / 280 / 520 /
  760 ; les 2 autres retirés ; chacun commence sur l'un de ses bois tiré
  au hasard, révélé, pion posé), **`aside {sets}`** (sets Agents of
  Azathoth et Agents of Shub-Niggurath de côté, face visible : face
  cachée ils seraient indistinguables), **pile « Arkham Woods »**
  (`toPile` des 6 bois du Core, mélangée : clic = tirer un bois au
  hasard), **lieux sortis d'une pile** : `drawEncounter` montre le côté
  non révélé d'un lieu (`side: "b"`, rien de dévoilé), `moveCard` d'une
  pile au tapis le fait entrer **non révélé** (clic = révélation +
  indices ; les autres cartes entrent toujours face visible),
  **verso-lieu** : quand l'acte courant est une carte liée dont le dos
  est un lieu (acte 3, 05055 → 05055b), « Avancer » ne le met pas de
  côté : il devient un lieu (`kind`), face visible côté `b`, posé sur le
  tapis à `backPlacement` (ici x 1290, y 411, droite du tapis) avec les
  indices de son verso (`backClue` × enquêteurs, lu au build depuis
  `linked_card`), puis l'acte suivant sort ; le client **recadre la vue**
  quand un lieu entre en jeu hors du cadre (pas pendant un glisser).
  **Question au lobby** « l'enquêteur principal a accepté / rejeté son
  destin » (formulation du journal) → 2 jetons Tablette ou 2 jetons
  Ancien ajoutés au sac (vérifié sur les icônes du PDF, pdftotext les
  perd) + rappel deck hors application dans le premier cas. Sac TCU
  saisi (13 jetons en standard, sans cultiste ni tablette). Build :
  **`packs: ["tcu", "core"]`** (sets Ancient Evils, Striking Fear,
  Agents of Shub-Niggurath et les 6 Arkham Woods en `extraCards` — seuls
  ces 6 lieux sont pris dans le set Devourer Below, comme le demande le
  guide). Lien du guide TCU (ahc75) dans le catalogue. Tests : 139
  messages, quatre scénarios (2, 1 et 4 joueurs avec principal au siège
  3 pour l'ordre de distribution ; le test « scénario sans définition »
  utilise désormais `tcu_prologue`) ; captures 21-24 (lobby, tapis à
  deux, bois tiré, verso-lieu). Régression NotZ au vert.
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
- 2026-09-03 : **The Devourer Below (NotZ III) livré** — la campagne
  Night of the Zealot est complète. Moteur : `pickRandom` avec
  `positions` (4 des 6 Arkham Woods posés face non révélée, 2
  retirés), `pickRandomSet` (un des 4 sets Agents mélangé **sans être
  nommé** dans le journal — vérifié par test), `addDoom` (doom de
  départ selon la question « Cultists Who Got Away »), `chaosAdd`
  (jeton Elder Thing), `reminder` conditionnel (« past midnight » →
  défausse hors application), Ghoul Priest via question. Pas de
  diagramme dans le guide : Main Path au centre, bois aux quatre
  coins. **Lien « Guide »** discret dans la barre de la table vers le
  livret PDF, porté par `campaigns[].guide` dans `library.json` (à
  renseigner pour chaque campagne à venir, adresses dans
  `docs/AHLCG_livrets_regles_FFG.md`). Tests : 118 messages, trois
  scénarios ; captures 20.
- 2026-09-03 : **outil « Générer une carte »** (demande) : bouton ⊞ dans
  la barre de phase, identique dans toutes les tables. Fenêtre de
  recherche par nom (insensible à la casse et aux accents, préfixe
  d'abord), par code (01117) ou par lien arkham.build/card/<code> ;
  40 résultats max avec vignette, type, extension, code. La carte
  apparaît dans la zone de menace du demandeur (`createCard {code}`,
  joueur assis, partie commencée) et se manipule comme les autres.
  Données : `public/data/cards_index.json` (toutes les cartes ArkhamDB
  avec image, 5 711, ~630 Ko / 86 Ko gzip, chargé à la première
  ouverture) ; côté DO l'index est lu depuis les assets à la première
  demande (`env.ASSETS.fetch`) — pas dans le bundle. Les définitions
  des cartes générées voyagent dans `state.extraDefs` (nom, dos,
  jauges, verso lié). Dos « joueur » original (`img/dos-joueur.svg`).
- 2026-09-03 : **The Midnight Masks (NotZ II) livré**, deuxième table.
  Nouveau dans le moteur de setup : `pickRandom` (versions de Downtown
  et Southside tirées au hasard, l'autre retirée ; `slot:` pour y
  faire référence), `branch` sur une **question de journal** ou sur
  `players`, `remove`, `toPile` (le set Cult of Umôrdhoth devient la
  pile « Cultist deck »), `spawn` (Acolytes de départ selon le nombre
  d'enquêteurs), `setStart`, `log`. `extraCards` (Ghoul Priest hors
  sets, mélangé si « encore en vie »), `piles` déclarées (rendues dans
  l'encart avec badge et étiquette, mêmes gestes que la pioche :
  `drawEncounter {pile}`). **Questions au lobby** : l'hôte répond avant
  « Lancer » (grisé sinon), les autres les voient ; réponses envoyées
  dans `startSetup {answers}` et consignées au journal. **Cartes
  liées** (agenda 1 dont le verso est un ennemi) : `backCode/backKind/
  backHealth` au build, image et compteur de dégâts du verso, format
  portrait quand le verso l'est ; posé sur le tapis retourné, l'agenda
  reste courant et « Avancer » le laisse en place. Vue cadrée au-dessus
  de l'encart. Tests : 107 messages ; captures 16-18. Régression
  Gathering au vert. Pas encore : lieux à connexions imprimées,
  Devourer Below (jeton chaos supplémentaire, doom selon le journal).
- 2026-09-03 : **ennemis : compteur de dégâts seulement** (correction
  de l'utilisateur : pas de jauge de santé mentale sur les ennemis) ; les
  soutiens du scénario gardent dégâts et horreur selon leurs jauges. Le
  menu d'un ennemi ne propose plus l'horreur.
- 2026-09-03 : **encart pioche / défausse / sac compacté** (demande) :
  trois objets alignés à gauche avec badge de compte ; clic sur la
  pioche = piocher ; clic droit sur la pioche = chercher, mélanger ;
  clic droit sur la défausse = consulter, remélanger dans la pioche ;
  sac : clic = tirer, jetons tirés à côté avec « ↺ » tout remettre,
  survol = difficulté + composition, clic droit = ajuster, composition
  épinglée. Appui long tactile = même menu. Plus de liens texte.
- 2026-09-03 : **pioche de rencontre, règle simplifiée** (bug signalé :
  les cartes suivantes se retrouvaient révélées) : cliquer sur la pioche
  retourne la première carte ; tant qu'elle est là, la pioche refuse
  (« glissez-la d'abord ») et un clic sur la carte révélée ne fait rien —
  seul le glisser la déplace. Le « second clic = zone de menace » que
  j'avais ajouté seul est retiré. `reshuffleDiscard` (« Remélanger dans
  la pioche » sur la défausse). **Refus sans trace** : le DO restaure le
  snapshot `before` quand une action est refusée en cours de route
  (avant, la dernière carte révélée partait en zone de menace *puis* le
  refus « pioche vide » laissait un état modifié non diffusé → serveur
  et clients divergeaient).
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
- 2026-09-03 : **remise à zéro des tables : ÉCHEC, annulé.** Deux
  tentatives de migration DO ont fait échouer Workers Builds (build
  « failure », site non redéployé) : `v2 deleted_classes: ["Room"]` +
  `v3 new_sqlite_classes: ["Room"]`, puis `v2 { deleted_classes:
  ["Room"], new_sqlite_classes: ["RoomV2"] }` avec le binding sur
  `RoomV2`. Les deux ont été annulées (`1874850`, `b5d1811`), la config
  reste `v1`. Les journaux d'erreur ne sont visibles que dans le tableau
  de bord Cloudflare (lien « details » du check GitHub) : à lire avant
  toute nouvelle tentative. **Les anciennes tables existent toujours** ;
  elles s'effacent d'elles-mêmes après 7 jours sans activité, ou une à
  une par « Supprimer » (hôte ; ajouté au lobby). Le contrôle de
  déploiement se fait avec l'API GitHub `commits/<sha>/check-runs`
  (jeton requis, le quota anonyme est vite épuisé) — à faire après
  chaque push, un push n'est pas une livraison.
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
  + indices ; double-clic = épuiser (sur un lieu du tapis : le retourner,
  ou basculer sa face s'il en a deux) ; clic droit / appui long = menu
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
  (Setup p. 2 et sac du chaos p. 1 du guide FFG ; à l'époque la règle
  limitait la lecture au Setup).
  DO : sièges, lobby, `startSetup` (setup automatique), `reset`, `close`,
  `deleteRoom`, `claimHost`, `kick`, deltas JSON Patch. Front : lobby,
  choix d'enquêteur, tapis (zone des lieux zoomable, agenda/acte,
  pioche/défausse/sac en overlay, de côté, victoire, sièges, journal,
  encarts, loupe). Tests : `scripts/test_room.mjs` (bout en bout, 14
  messages entrants pour la séquence), `scripts/captures.py` (Playwright).
  Catalogue : The Gathering `available`, les 10 scénarios PCIO `wip`.
- **Prochaine étape** : retours de l'utilisateur sur TIC I et II, puis
  **TIC III In Too Deep** (guide p. 15 sq. : relire les résolutions du
  II — « out for blood », ravisseur, Elina Harper — et les reports au
  lobby ; jetons retirés par les flashbacks à reconduire par oui/non),
  puis la suite de la campagne ; visuels PNG des clés et du jeton d'inondation à générer
  dans le style des jetons du projet (choix B). En parallèle : la suite
  des retours de test du board joueur et les points ouverts du cahier
  §10.10 (customisations, decks annexes, attaches).
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
et disposition précise à trancher sur maquette.

**Bibliothèque.** Page d'accueil de présentation (avec champ
« rejoindre une room par code »), puis la bibliothèque : tous les
scénarios du jeu, groupés par campagne dans l'ordre de sortie,
scénarios dans l'ordre, chacun avec un état disponible / en cours /
prévu. Pas de liste publique des rooms actives.

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

- API : `/api/public/cards/<pack>.json` (filtrer par `encounter_code`),
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
- `ss` n'existe pas dans le bac à sable : vérifier `wrangler dev` par
  `curl http://127.0.0.1:8788/` ; deux `wrangler dev` sur le même port
  → le second meurt sans bruit.
- Un jeton posé par une règle du scénario (inondation) est un champ de
  `tokens` comme les autres : `addToken` le borne (2), le dépôt dans une
  pile l'efface (`tokens = {}`) — pour un jeton qui doit survivre au
  passage en pile, il faudrait un champ à part.
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
  saisi (2026-09-08, p. 3 du guide lue sur l'image) ; reste TDC, TDE‑A
  et Film Fatale (section Setup / encart du guide).
- **Jetons de campagne TIC** : les flashbacks retirent des jetons du sac
  « pour le reste de la campagne » (icônes p. 6, à lire sur l'image) et
  la résolution du I remplit « Memories Recovered » → questions au lobby
  de TIC II à concevoir (report des jetons retirés, mode autonome p. 9).
- **Jetons de campagne** (TCU III et suivants) : les jetons ajoutés au
  sac par les résolutions précédentes ne sont pas connus d'une table
  isolée → TCU II les reporte par la question d'introduction (+ option
  autonome) ; pour la suite, question à choix multiple ou rappel
  « ajustez le sac », à trancher avec l'utilisateur.
- **Compteurs spécifiques par scénario** : `seatCounters` /
  `tableCounters` du `*.src.json` (vides pour NotZ I) — recenser ceux
  des 10 scénarios PCIO à leur migration.
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
