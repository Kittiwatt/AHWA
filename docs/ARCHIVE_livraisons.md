# Archive des livraisons — Anofelis Web (AHWA)

Récits complets des livraisons passées, sortis du §0 du mémo
(`ARKHAM_WEB_notes.md`) le 2026-09-10, dans leur ordre d'origine.
**Ne pas lire en entier** : le tableau du mémo §0 indexe chaque
entrée ; on vient ici chercher un récit précis (grep). Le durable de
chaque récit a été versé avant archivage (format → grammaire, pièges →
mémo §5, décisions → §1, points ouverts → §7). À chaque rotation, le
récit sortant s'ajoute **en tête** de ce fichier.

- 2026-09-10 : **Menu natif du navigateur neutralisé sur la table** —
  retour UX : sur certains objets du tapis, « parfois et selon le
  zoom », le clic droit ouvrait aussi le menu du navigateur. Reproduit
  en bac à sable (Playwright) : seuls les **lieux** fuyaient, et
  seulement sous Windows. Le menu d'un lieu s'ouvre au `pointerup`
  (un clic droit glissé trace un chemin) ; Windows envoie ensuite le
  `contextmenu` natif, dont le test de visée tombe — une fois sur deux,
  selon l'arrondi du pixel — sur le coin du menu qui vient d'être posé
  sous le curseur plutôt que sur la carte ; l'écouteur ne reconnaissait
  ni carte ni outil et ne faisait pas `preventDefault`. Correctif :
  `neutraliserMenuNatif(zone, sauf)` dans `dom.js` (menu natif
  neutralisé sur tout `#tapis` et sur `.menu-carte`, sauf champs de
  saisie, liens et `#journal` ; appelé aussi sur le board joueur avec
  `#board-joueur`) — décision de l'utilisateur : « on bloque tout » ;
  et le garde-fou des lieux devient adaptatif (`lien.menuVu` : la
  fenêtre de 400 ms ne s'arme que si la plateforme envoie le
  `contextmenu` après le relâchement, et ne vaut qu'une fois — un
  second clic droit rapide sur un autre objet n'était plus pris).
  Captures : bloc de régression qui rejoue l'ordre Windows par
  événements synthétiques (`clic_droit_windows`, `contextmenu_natif` :
  lieu, coin du menu, fond du tapis, pion, carte de côté, journal
  permis, board joueur).

- 2026-09-10 : **The Lair of Dagon (TIC VII) livré** — Setup + diagramme
  p. 31‑32 (pack `lod` ; sets The Lair of Dagon, Agents of Dagon,
  Flooded Caverns, Syzygy, **Dark Cult = code `pentagram`** sur
  arkham.build, Locked Doors ; pioche 27). Lobby : campagne / autonome,
  nombre de souvenirs en trois tranches (≤ 4 → 5 bénédictions, 5‑7 →
  2 malédictions, ≥ 8 → 5 malédictions — icônes lues sur l'image : la
  croix ornée est la bénédiction, le crochet la malédiction), trois
  souvenirs à cocher (secte → agenda 1 v. I, « stick together » →
  agenda 2 v. I + Dawson à prendre en main, « jailbreak » → suspect
  entouré de côté, choix parmi six + aucun), jetons retirés. Réutilisé :
  `when … remove` pour les versions, `pickRandom n:2 positions` pour
  les deux halls jumeaux de chaque étage (journal muet), clés visibles /
  cachées, pile « Tidal Tunnels », `aside` du recto pour Dagon et la
  statue (deux faces liées : « Autre face »), suspects et Dawson en
  `extraCards` retirés s'ils ne servent pas. Généralisé : **clés
  `after:<code>`** des effets d'étape (les versos des deux versions
  d'agenda diffèrent : + ou − 2 puis 4 malédictions), **ordre
  d'écriture des champs** = ordre d'application (le verso de l'acte 1
  retire les lieux, pose les tunnels, inonde tout, mélange — écrit dans
  cet ordre ; l'ancien ordre fixe aurait inondé avant de poser),
  effets `removeLocations {except}`, `spreadPile` (sept tunnels aux
  sept positions), `placeAt` (Lair of Dagon totalement inondé, révélé
  avec 3 indices par enquêteur), `chaosAdd` / `chaosRemove`. Reste
  manuel avec rappels : suspect en jeu au verso de l'agenda 1 (position
  et clé selon la version), Dawson au verso de l'agenda 2 v. II, retrait
  du suspect à l'acte 2, malédictions selon l'agenda courant à l'acte 3,
  clés dépensées (glissées de côté). Tests : 663 messages (bloc Lair :
  sac 22, versions, mises de côté, halls mélangés, clés, after:07275 →
  +2 malédictions, acte 2 complet dans l'ordre, acte 3, Dagon autre
  face ; autonome v. II sans suspect et retrait à vide ; ≤ 4 souvenirs
  → 5 bénédictions) ; captures 94‑96.

- 2026-09-10 : **A Light in the Fog (TIC VI) livré** — Setup + les deux
  diagrammes p. 27‑28 (pack `lif` ; sets A Light in the Fog, Creatures
  of the Deep, Flooded Caverns, Rising Tide, Syzygy, Striking Fear ;
  pioche 36). Lobby : campagne / autonome, reliques apportées au phare
  (cases → `aside` des trois relics du pack `def` en `extraCards`),
  mentions « after sunrise » / « tide has grown stronger » (cases →
  `addDoom` après `story`), jetons retirés. Réutilisé : clés visibles /
  cachées, `remove` des Underground River, carte histoire dans la zone
  `story` (Captured!, comme Finding Agent Harper), pile « Tidal
  Tunnels » `around` (comme au IV), grottes de côté non révélées (le dos
  d'Upper Depths s'appelle Lighthouse Basement). Généralisé : les
  **effets d'étape** deviennent un type `StageEffects` partagé par
  `agendaEffects` et le nouveau **`actEffects`** (fonction
  `appliquerEffets`, idempotente : l'acte 1 et l'agenda 1 ont des versos
  qui convergent, de même l'acte 2 et l'agenda 2 — chacun déclare les
  mêmes gestes, le second ne fait rien de plus), avec quatre effets de
  plus : `revealCodes`, `placeBelow` (Basement sous le Stairwell, Lower
  et Final Depths en colonne), `fillRows` (rangées complétées à quatre
  par les tunnels : diagramme de l'acte 3 obtenu d'un clic), `removeTrait`
  (lieux Falcon Point → victoire ou retrait à l'agenda 4) ; `spawnAside`
  accepte une carte déjà en jeu (Oceiros remonte à Upper Depths). Et
  **`toggleSide` change de nature** pour une carte histoire dont le dos
  est un lieu (Captured! → Holding Cells : kind `location`, indices de
  son verso la première fois ; menu « Autre face (Holding Cells) »
  ouvert aux cartes `story` à verso-lieu). Reste manuel (choix ou
  position selon le déclencheur) : Oceiros et la clé bleue au 2,
  capturés et clés sur Holding Cells au 3, pions et ennemis déplacés au
  4, inondation des quatre lieux les plus bas — rappels `agenda:2‑4`,
  `act:2‑3`. Tests : 642 messages (bloc Fog : doom du journal, rangée
  et Lantern Room, retraits, clés, Captured! bascule en lieu avec indices
  et retour, agenda 2, acte 2 idempotent, agenda 3 : descente complète
  et journal muet, acte 3 idempotent, agenda 4 : Oceiros et Falcon
  Point, autonome) ; captures 92‑93. Piège : un test qui pose une carte
  sur une rangée à compléter fausse `fillRows` — poser ailleurs.

- 2026-09-10 : **Horror in High Gear (TIC V) livré** — choix pris seul
  avec la consigne d'uniformisation. Setup + diagramme p. 24‑25 (pack
  `hhg` ; sets Horror in High Gear, Fog over Innsmouth, Malfunction,
  Shattered Memories, Ancient Evils ; pioche 28). Réutilisé : véhicule
  porteur de pions (les deux voitures `spawn` sur le lieu de tête
  `slot:route:2`, pions sur le lieu — la montée à bord, le conducteur
  et la voiture vide à retirer restent aux joueurs : choix), verso
  ennemi de l'agenda 1 v. I (07199 → 07199b), versions d'agenda par
  `when … remove` sur « The Terror of Devil Reef is dead », ligne de
  boutons du menu (« Road X (deck n, détours m) 1 2 3 », même forme
  que Inondation / Tidal Tunnels). Nouveau mais générique : op
  **`fromPile`** (les n premières cartes d'une pile construite en jeu
  aux positions données, slots `slot:<nom>:<i>`) — le Road deck est un
  `layeredPile` (fond = Falcon Point Approach + 2 au hasard, 12 au-
  dessus) dont les trois premières partent en ligne ; **`pickRandom
  rest:"keep"`** (les ennemis Vehicle non tirés restent au pool → pioche ;
  `rest:"pile" restPile:"encounter"` aurait été écrasé par
  `buildEncounter`) ; définition **`road {pile, longWay}`** + action
  **`roadAhead {id, n}`** (Road deck + Long Way Around de côté,
  mélangés, colonne devant le lieu, journal muet) ; **`toggleSide`
  offert aux soutiens à verso lié** (menu « Autre face (Stopped) » :
  le sous-titre du verso vient du build). Ennemis Vehicle : `branch
  players` 2‑3 → 1, 4 → 2, tirés parmi Pursuing Motorcar / Hit Van /
  Hybrid Assassin, posés à l'arrière (`positions` fixes 401 × 457).
  Piège attrapé par les captures : `state` n'est pas défini dans le
  menu des cartes d'`interactions.js` (passer par `ctx.etat.state`) ;
  et un menu ouvert se ferme par un clic hors menu, pas par Escape dans
  les captures. Tests : 619 messages (bloc Gear : sac, versions, Road
  deck 12 avec Falcon Point au fond, ligne de trois non révélés et
  journal muet, six Long Way Around de côté, voitures et pions, ennemi
  Vehicle à l'arrière et pioche 27, toggleSide, Road 2 puis Road 3,
  refus, verso ennemi, autonome v. I sans ennemi, quatre joueurs v. II
  deux ennemis) ; captures 89‑91.

- 2026-09-10 : **Devil Reef (TIC IV) livré** — première room du nouveau
  circuit (dépôt source de vérité, grammaire lue à la place du code,
  Setup + diagramme seulement, un commit unique). Choix laissés à Claude
  avec la consigne d'**uniformiser** : tout ce qui existait a été
  réutilisé — piles `around` et `placeAround` (étendu d'une direction
  `dir` : `below` / `left` / `right`, ligne « ↓ ← → ⟳ » du menu calquée
  sur la ligne Inondation), clés du I (`keys colors` face visible /
  cachée), inondation du I (`flood.onRevealByCode` : même sémantique
  que la règle de marée, appliquée par `revealLocation`, journal
  « (texte du lieu) »), verso-ennemi calqué sur le verso-lieu (l'agenda
  1 a deux versions dont le dos est un ennemi : à l'avancement la carte
  devient `enemy`, côté b, posée au centre avec le décalage d'un
  spawn), **véhicule** = porteur comme un lieu (`moveCard` : un soutien
  à trait Vehicle emmène ses pions et clés ; `minis` accepte un
  véhicule : les enquêteurs commencent à bord du Fishing Vessel posé sur
  Churning Waters). Setup p. 19‑20 : sets Devil Reef (`def`), Agents of
  Hydra, Creatures of the Deep, Flooded Caverns, Malfunction, Rising
  Tide ; pioche 33 ; Churning Waters révélé, totalement inondé
  (`addTokens flood n:2`) ; cinq îles « Devil Reef » `pickRandom n:5`
  aux positions du diagramme (737 × 0, 365 / 1109 × 173, 365 / 1109 ×
  649, journal muet sur l'ordre) ; Unfathomable Depths : trois
  `pickRandom n:1 rest:"pile"` (la tirée reste au pool → retirée sans
  être regardée, l'autre en pile) puis `toPile codes:[] shuffle` pour
  mélanger la pile (sinon l'ordre des paires serait connu) ; Tidal
  Tunnels `toPile` (07174a/b + Flooded Caverns) ; Mantle, Headdress,
  Idol et Thomas Dawson (`extraCards` 07082) de côté avec un journal
  selon « mission successful / failed » ; agenda 1 v. I / v. II par
  `when … remove` sur « a battle with a horrifying devil ». Lobby :
  campagne / autonome, mission, devil, jetons retirés (cases) — les
  flashbacks du guide hors scénario I ne retirent aucun jeton (vérifié
  par comptage de « Remove 1 » page par page, sans lecture). Données :
  agendas 07164 / 07165 liés à des ennemis `hidden` 07164b / 07165b
  (backKind enemy, backHealth 6 via `linked_card`) ; lieux 07174a/b,
  07175‑77 a/b (codes à suffixe). Tests : 602 messages (bloc Reef :
  sac, versions d'agenda, navire et pions, îles, profondeurs retirées
  sans regarder et journal muet, placeAround `dir` et refus, inondation
  par lieu, verso ennemi, autonome) ; captures 85‑88.

- 2026-09-10 : **Mémo scindé — le dépôt devient la source de vérité.**
  Le §0 passe au régime : un tableau (une ligne par livraison) + les
  derniers récits ; les 54 récits antérieurs partent tels quels dans
  `docs/ARCHIVE_livraisons.md`. Passe d'extraction faite avant
  archivage : le durable était déjà logé (format → grammaire, pièges →
  §5, décisions → §1, campagne et chantiers → §7) — rien à reloger.
  `docs/INSTRUCTIONS_PROJET.md` créé : la méthode vit dans le dépôt,
  les instructions du projet claude.ai se réduisent à une amorce
  (clone + token — jamais commité, le dépôt est public). Nouveau
  cycle : à chaque livraison, Claude met les docs à jour (récit +
  ligne de tableau, rotation du plus ancien récit récent vers
  l'archive après versement de son durable, grammaire si nouvelle op)
  et pousse **un commit unique** sur `main`, SHA communiqué,
  déploiement vérifié. Grammaire §9 alignée ; `appile_128/256.png`
  (source du bouton Auto-pay) conservés dans `docs/assets/`. Le mémo
  passe de 1908 à ~900 lignes et le §0 ne croît plus que d'une ligne
  par livraison.

- 2026-09-10 : **`docs/GRAMMAIRE_SCENARIOS.md` livré** — référence
  complète du format `*.src.json`, établie depuis le code (scenario.ts,
  setup.ts, actions.ts, build.mjs) : pipeline et contrôles du build,
  champs racine, trois types de questions, `branch`/`when`, les 31 ops
  de setup (sémantique exacte, slots, fin de setup implicite),
  comportements runtime déclarés (piles, flood, agendaEffects,
  seal/cardSeal, leads, bury, barriers…), grille du plateau (colonnes
  365 + k·186, lignes 173 + k·238, centre 737 × 411), jetons, checklist
  « nouvelle room » et squelette. **La grammaire fait foi pour le
  format** : toute nouvelle op ou option s'y documente à sa livraison —
  l'entrée §0 raconte le scénario, la grammaire décrit le format ; on
  la lit à la place d'une fouille du code et de l'historique. Constats
  de la passe : `startLocation` et `layout` ne sont consommés nulle
  part (informatifs, vérifiés par le build) ; `hook` lève une erreur en
  v1 (jamais l'utiliser) ; `branch` accepte aussi `on: "difficulty"` et
  un cas `"default"` ; rappels `round:N` disponibles ; port de dev par
  défaut 8787 (le « 8788 » du piège §5 venait d'un port décalé par une
  seconde instance).

- 2026-09-09 : **In Too Deep (TIC III) livré** (tous les choix A).
  Guide p. 15‑16 : 24 barrières relevées sur l'image du diagramme
  (arêtes : 4, 1, 3, 1 au nord ; 1 entre Railroad Station et Bookshop ;
  2, 2, 2, 1 au centre ; 1, 3, 1, 2 au sud) ; sac autonome = base ;
  aucun changement de sac au II ni à l'Interlude II (seuls les
  flashbacks du I retirent des jetons). Pack **`itd`** (44 cartes :
  07108‑22 joueur sans set, `in_too_deep` 07123‑51) : les quinze lieux
  d'Innsmouth ont leurs propres codes (07129‑43) avec traits
  `Coastal` / `Midtown` ; Desolate Coastline a des indices **fixes**
  (clues_fixed). **Questions à cocher** (`type: "multi"`, réponse =
  liste, cond `{q, has}`, journal « aucun » si vide, `reponseValide`
  vérifie les options et l'absence de doublons, lobby en checkboxes) :
  suspects « out for blood » et jetons retirés. **Barrières** :
  `state.barriers`, op `barriers`, action `setBarrier`, chip sur
  l'arête (`elsBarrieres`, z 200000, clic −1 / + au survol, exclue du
  pan du plateau — sinon `setPointerCapture` avale le clic), menu du
  lieu « +1 barrière vers… » (voisins orthogonaux à 186 / 238 px).
  **Suspects out for blood** : `spawn` au lieu de leur Révélation (lu
  sur les cartes, jamais affiché) sans indices, `remove` des autres
  avant `buildEncounter` (ils sont en `extraCards`, sinon ils iraient
  dans la pioche). **Clé noire** : `placeKey` sur la cachette entourée
  (branch sur la question) ou `atRandom` en autonome ; six autres clés
  cachées de côté. **Angry Mob** : `aside {side: "b"}` de 07062a.
  **Effets d'agenda** : 2 = inondation `Coastal` (tous, révélés ou non)
  + Ravager ×2 / Young Deep One ×2 + défausse dans la pioche ; 3 =
  `Midtown` + Angry Mob à Innsmouth Square + clé cachée au hasard
  dessus ; 4 = tout monte (la pioche de chacun reste manuelle, rappel).
  Tests : 595 messages (bloc Deep : option à cocher inconnue refusée,
  sac 18, quinze lieux, inondation initiale, 24 barrières sur 13 arêtes,
  clé noire, suspects out for blood sans indices et autres retirés,
  cartes de côté dont Angry Mob côté b, setBarrier −1 / +2 / à 0 /
  refus, agendas 2‑4) ; captures 82‑84.

- 2026-09-08 : **COB III — Blood Money livré, et correction tablette/cultiste
  sur toute la campagne.** En relisant les icônes pour le III (comparaison à
  600 dpi contre les SVG du projet : la capuche du cultiste a une POINTE
  sommitale, la tablette n'en a pas), la lecture de la session du I s'est
  révélée fausse : les sacs de base p. 5 contiennent une **TABLETTE** (pas de
  cultiste), l'ouverture du II ajoute **1 cultiste** (p. 12 — pas un sang),
  celle du III **1 cultiste** de plus (p. 23). Chaîne cohérente vérifiée :
  encart autonome II (p. 15) = base pure (tablette, 6 symboles) + sangs
  2/3/5, le cultiste d'ouverture s'ajoutant par-dessus ; encart III (p. 24)
  = base + cultiste du II (7 symboles : skull ×2, cultist, tablet,
  elder_thing, auto_fail, elder_sign) + sangs 3/4/6 (Difficile = Expert,
  9 nombres avec −6 sans −8), l'ouverture du III s'ajoutant par-dessus.
  Srcs I et II corrigés (sacs + branches), tests II ajustés (sac campagne
  standard 2 j = 16 + 2 sangs + 1 cultiste ; autonome difficile = encart
  20 + cultiste = 21 ; assertions tablet/cultist ajoutées).
  **Le III** : guide p. 21-24, codex p. 25-28. Quatre questions au lobby :
  mode campagne/autonome, sangs (numérique 0-12), « killed Julia Stern ? »
  (oui → les trois Julia 13087-89 retirées ; non → une par difficulté de
  côté), « defeated Zburamoarte ? » (agenda 2 = Feeding Frenzy v. II 13071
  sinon v. I 13070, l'autre retiré avant `story`). Campagne : base p. 5 +
  sangs (nFrom) + cultiste du II + cultiste d'ouverture (sac standard
  sang=2 → 20) ; autonome : `chaosSet` encart p. 24 + cultiste d'ouverture
  (difficile → 23). Sanguine Secrets : **seuls les ennemis rassemblés**
  (13112 ×3 + 13113, mis de côté) — Morbid Rituals 13114 ×2 `remove`
  (non rassemblées). Afflicted seulement à 3-4 joueurs. Lieux : Bureau-
  Étude-Salle à manger-Cuisine en enfilade (365/551/737/923, y=173),
  **Foyer 13076 posé révélé côté (Boring Party)** à (644,411) — lieu à
  deux faces de jeu, l'autre face au double-clic ; Master Bedroom de côté
  face cachée ; **Balcon de côté (E/S) mais RETIRÉ (H/E)**. Priscilla
  13083 à la Salle à manger ; Suspicious Guest ×6 : 1/2/3 spawns
  (Étude, +Bureau, +Salle à manger) et **retrait partiel** 2/1/0 — nouvel
  argument `n` sur l'op `remove` (un seul code, n exemplaires ;
  `retirer()` seul retire TOUTES les copies via `pool.takeAll`, piège
  découvert ici). Toujours 3 invités en pioche. De côté : les DEUX
  « Child of Blood » (13091 ×3 blood_money + 13103 ×3 children_of_blood
  — « each copy » = les six), Spawn of Zburamoarte 13097 ×3, Sanguine
  Rebirth 13092 ×2, Chosen of Zburamoarte 13093a (recto), Wilkes
  13084/85/86 par difficulté. Pioches : 21 (1-2 j) / 28 (3-4 j).
  **Scellage sur cartes (codex des invités)** : `cardSeal: true` au src →
  `CardState.sealed`, actions `chaosSealCard {id, token}` (pris des tirés,
  sinon du sac) et `chaosReleaseCard` ; libération automatique vers le sac
  quand la carte part en pile (`toPile`) ou en zone de victoire ; pastilles
  22 px en haut à droite de la carte (`.scelles`, images des jetons) ;
  menus « Sceller le jeton tiré « X » » (par type distinct de
  `chaos.drawn`) et « Libérer le jeton « X » scellé ». Piège corrigé :
  dans `ouvrirMenu` (menu des cartes), pas de variable locale `state` —
  utiliser `ctx.etat.state` (le `state` local n'existe que dans
  `ouvrirMenuOutil`) ; une ReferenceError dans ce handler avale le menu
  SANS erreur visible. **Pile « Invités sauvés »** (`piles` + `menuFor:
  ["enemy"]`, précédent Profondeurs du Pit) pour les Civilians placés
  « sous la carte de scénario » — l'envoi d'une carte scellée dans la pile
  libère d'abord ses jetons. Rappels : porteurs de campagne (Générer une
  carte 13029/13030/13066/13067/13105 Charlie Kane), marche à suivre du
  codex (tirer → lire le guide → sceller par le menu → Tout remettre),
  invités sauvés par le menu ennemi, Foyer double face, journal papier.
  Carte scénario 13068 : recto Easy/Standard, verso Hard/Expert. Tests :
  569 messages (campagne standard 2 j : sac 20 dont tablette 1 / cultistes
  2 / sangs 2, Foyer révélé side a, invités 2+1+3, Julia 13088 de côté,
  scellage complet — tiré, libéré, re-libération nack, depuis le sac,
  toPile saved libère ; autonome difficile 1 j : sac 23, Julia ×3
  retirées, agenda v. II, Balcon retiré, pioche 21 ; gate `cardSeal`
  refusé hors COB III). Captures bm_01-04 (lobby 4 questions, tapis,
  pastille scellée, autonome). **La campagne Children of Blood est
  complète (I-II-III).**

- 2026-09-08 : **COB II — New Horizons livré** (dans la foulée du I).
  Guide p. 12‑15 : choix de groupe jour (Setup v. I) / nuit (v. II) —
  ce n'est PAS la résolution du I qui décide. Trois questions au lobby :
  `mode` campagne/autonome, `sang` (numérique 0‑12, défaut 1 — le lobby
  rendait déjà `type: "number"`), `version` jour/nuit. **Campagne** :
  `chaosBag` du src = sacs p. 5 SANS leurs sangs imprimés, puis nouvel
  op `chaosAdd {token, nFrom, plus}` → sangs de fin du I + 1 (« for the
  remainder of the campaign » à l'ouverture du II). **Autonome** :
  nouvel op `chaosSet {byDifficulty}` remplace tout le sac par l'encart
  p. 15 (lu sur l'image : les 6 icônes de base, tablette comprise ; Facile 18
  jetons dont 2 sangs, Standard 19 dont 3, Difficile = Expert 20 dont
  5 — la question sang est ignorée). Version jour : lieux Jour
  13039‑43, agendas Busy Day 13032 (doom 5) + Digging Deeper v. I
  13034, spawn Factory Worker 13063 sur CHAQUE Factory Floor (2 en
  jeu, 2 en pioche), Night Watchman 13062 retiré, Javier 13061 de
  côté, sets de nuit retirés (children_of_blood, preyed_upon, stalked,
  reeking_decay) → pioche Standard 30. Version nuit : lieux Nuit
  13044‑48, Quiet Night 13033 (doom 6) + v. II 13035, Javier + les 4
  Factory Workers retirés, Night Watchman de côté, sets de jour
  retirés (blood_blight, bloodthirst, hunted, vermin) → pioche 32.
  Les agendas inutilisés sont `remove`s AVANT `story` (l'op ignore les
  retraits — précédent For the Greater Good). Difficulté : Zburamoarte
  13058 (Lethargic, Facile) / 13059 (Source, Standard) / 13060
  (Progenitor, Diff./Expert) de côté, autres retirés ; **grottes de
  côté FACE CACHÉE** (`aside faceUp: false` sur des lieux double face
  → le dos non révélé s'affiche : « Descending Tunnel », trois « Side
  Chamber » identiques — identités masquées comme en physique) ;
  Shallow Tunnels 13049 + 13051‑54 (E/S) ou Darkest Depths 13050 +
  13051 + 13055‑57 (H/E), l'autre jeu retiré. Asides communs :
  Blighted Worker ×4, Echoing in Darkness ×4, sets infected +
  flying_terrors, soutiens d'histoire Sanguine Song 13066 + Forged
  Permit 13067. **Départ au choix** (« a Factory Floor of their
  choice ») : aucun lieu révélé d'office, pions posés à l'Ouest,
  rappel « cliquez votre lieu de départ pour le révéler et déplacez
  votre pion ». Carte scénario 13031 : recto Easy/Standard, verso
  Hard/Expert (vérifié sur les images) → `scenarioCardSide` comme au
  I. `seal` + `seatCounters` reconduits (le scellage continue toute la
  campagne) ; pas de `bury` au II. Acte 1 13036 : seuil 3 indices
  affiché (`clues` fixes). Layout : Floors (551/923, 173), Bureau‑
  Quai‑Réserve (365/737/1109, 411), rangée du bas libre pour les
  grottes que les joueurs glissent depuis la zone de côté. Rappels :
  départ au choix, journal papier (« stole the manager's keys »
  verrouille le Bureau, « arcane symbols » / « forged permits »),
  grottes glissées sans les retourner, act:2/3 et agenda:2 via le
  panneau Histoire. Tests : 551 messages (questions obligatoires y
  compris la numérique ; v. I campagne standard 2 j : sac 19 = 16 +
  2 + 1, spawns W/E, pioche 30, grottes face cachée, asides exacts,
  retraits en pile removed, scellage actif ; v. II autonome difficile
  1 j : sac 20 dont 5 sangs — réponse 9 ignorée —, Quiet Night,
  pioche 32, Workers/Javier retirés). Captures nh_01‑03 (lobby avec
  la question numérique, tapis jour avec ouvriers, tapis nuit).

- 2026-09-08 : **Children of Blood — River of Blood (COB I) livré** (choix
  validés : source arkham.build pour tout A, enfouissement B, scellage
  option 2 C, `branch` par difficulté D, disposition losange E). Guide
  AHC106 p. 3‑11 lus (texte extrait + tableau des sacs p. 5 lu sur
  l'image, icône par icône — relecture du 2026-09-08 : le 3e symbole est la **tablette**, pas le cultiste ; Facile/Standard 16
  jetons, Difficile 18 dont 1 sang, Expert 20 dont 2). **Jeton `blood`**
  (`Token`, `CHAOS_TOKENS`, `JETONS_CHAOS`, recette `build_chaos_tokens
  .py` : dégradé 75 % #343433 → #1C1D1C, couches `token_blood_fill`
  #C22026 + overlay/highlight #353534 — glyphes déjà dans la police
  ArkhamCards). **Scellage** : `seal {token, label, counter, maxPerSeat,
  maxTotal}` du src → actions `chaosSeal`/`chaosRelease {seat}` (jeton
  pris des tirés d'abord, sinon du sac ; compteur de siège borné 3 ;
  `chaosAdjust` borne sac + scellés à 12) ; menu du sac « Sceller / 
  Libérer … (n/3) » + le chip du compteur passe par le sac (+ scelle,
  − libère). **`seatCounters` enfin rendus** (chips génériques tapis +
  board joueur, icône `/img/chaos/<icon>.svg`) — COB premier
  utilisateur (`bloodSealed`). **Enfouissement** : helper `enfouir()`
  (setup.ts, partagé setup/actions) — `avec` + `fromDeckTop` premières
  cartes (défausse remélangée au besoin), mélangées, réparties aussi
  également que possible sous les lieux du `trait` (« Lair »), jetons
  et épuisement effacés, x en éventail (+26/carte), y = lieu + 42,
  **z = z du lieu − 1** ; au rendu, une carte face cachée dans la bande
  sous un lieu rejoint la couche des lieux (détection par position,
  `rendrePlateau`) → glissée dessous, seul le bas dépasse. Op de setup
  `bury` (instances `with` prises de côté) + actions `bury` (menu de la
  pioche, libellé `bury.menuPile`) et `buryAt {id}` (menu des codes
  `bury.withAny` posés sur le tapis, refus hors d'un lieu du trait) ;
  journal nomme le lot (« dont Julia Stern »), jamais la répartition.
  **`branch on:"difficulty"`** et **`scenarioCardSide`** (COB : référence
  E/S au recto, H/E au verso). Src : lieux en paires Aube (codes pairs
  13008‑22, E/S) / Crépuscule (impairs 13009‑23, H/E), l'autre moitié
  retirée ; Julia par difficulté (13024/25/26, une de côté puis enfouie,
  les deux autres retirées) ; E/S retirent `agents_of_zburamoarte` +
  `mongrels`, H/E retirent `preyed_upon` + `vermin` ; Night Feeder ×3
  (E/S) ou Spawn ×3 (H/E) de côté ; civil 13027 à Main Street (+1 à
  Garrison à 3‑4 j, codes de lieu par difficulté), le reste de côté
  (×3 / ×2) ; `afflicted` retiré à 1‑2 j ; `infected` + Reynolds + Fang
  de côté ; `bury` final (Julia + 2). Grille 5 rangées : colonnes
  365/551/737/923, rangées 55/293/531/769/1007 (le plateau zoomable
  absorbe la hauteur, capture à l'appui). Bibliothèque : campagne `cob`
  (guide FFG), II New Horizons et III Blood Money `planned`. Tests :
  547 messages (bloc COB : Aube/Crépuscule, 3 Julia, sacs 16/18, côté
  de la carte scénario, civils et `afflicted` selon joueurs, pioche
  34/41, retraits en pile `removed`, enfouissement setup + `bury` +
  `buryAt` + refus hors repaire, scellage : refus sans jeton, borne 3,
  borne 12 d'Ajuster, libération, priorité aux tirés ; refus de
  `chaosSeal`/`bury` hors COB) ; captures cob_01‑06 (losange, glissé-
  dessous, menu du sac grisé à bon escient, chip Sang, sac 18). Aléa de
  synchronisation corrigé dans le bloc board joueur (drainage des
  diffusions avant l'action inter-sièges).
- 2026-09-08 : **Source de données du build : arkham.build pour tout**
  (décision utilisateur — les images venaient déjà de
  `cdn.arkham.build`, ce sont les métadonnées qui basculent). Deux
  fetchs mis en cache : `api.arkham.build/v1/cache/cards` (dump unique,
  6 606 entrées) et `/v1/cache/metadata` (noms des packs
  `pack[].real_name` et des sets `card_encounter_set[].real_name`).
  Couche `donnees()`/`traduire()` : garde `id === code` (élimine 559
  variantes taboo), `real_*` → champs ArkhamDB, `back_link_id` résolu
  en `linked_card` imbriqué (+ `linked_to_code/name` pour les cartes
  joueur), versos `hidden` écartés de la liste principale mais gardés
  dans `cards_index` (parité du générateur ; garde d'erreur si un verso
  n'a plus de recto), `imagesrc` ≈ `official`, `backimagesrc` ≈
  `double_sided || back_link_id`, **`bonded_to` reconstruit par regex
  `/^Bonded \((.+?)\)[.,]/m`** sur `real_text` et `bonded_count` =
  quantité sauf `{06025: 1, 06028: 1, 06283: 1}`. Diff complet contre
  l'existant : 13 scénarios identiques (ordre des `encounterSetNames`
  = ordre du src désormais) sauf **Josef 05085 natif** (plus de
  synthèse ; gagne `backCode 05085b`/`backKind story` — `storyBack` le
  protégeait déjà) ; `investigators.json` 89 entrées octet pour octet ;
  `player_cards.json` 1838 → 1867 (+29 cartes 60xxx du Core révisé avec
  images, 60154/60254 comprises — leur exclusion du tirage de faiblesse
  reste dans `joueur.ts`), 11 drapeaux `d` légitimes en plus (Sophie,
  Dream‑Gate, Disciplines, Flux Stabilizer…), **12032 Laboratory
  Assistant corrigé** (`sk {i:1}` → `{w:1}` : l'icône imprimée est la
  volonté, vérifiée sur la carte — erreur ArkhamDB) ; `cards_index`
  5 711 → 6 047 (versos en plus), seule perte `86024b` Hub Dimension
  (double face sans lien côté arkham.build, négligeable).

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
