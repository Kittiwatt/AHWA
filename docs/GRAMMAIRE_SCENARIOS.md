# Grammaire des scénarios — référence du format `*.src.json`

**Ce document fait foi pour le format des scénarios.** Il décrit tout ce
que le moteur sait faire ; il est établi d'après le code réel
(`src/scenario.ts`, `src/setup.ts`, `src/actions.ts`, `scripts/build.mjs`)
au 2026-09-10 (Spreading Flames compris). Règle de maintenance : **toute nouvelle op, tout nouveau
champ, toute nouvelle option se documente ICI à sa livraison** — l'entrée
« État d'avancement » du mémo raconte le scénario, ce document décrit le
format. À lire avant d'écrire ou de modifier un `*.src.json` ; il évite
de fouiller le code et l'historique du mémo.

Rappels absolus (inchangés) : jamais de spoiler (seule la section Setup
du guide et le diagramme de placement sont lus), jamais de texte de
carte reproduit — ni dans `_source`, ni dans les `log`, ni dans les
rappels (on décrit l'effet, on ne recopie pas).

## 1. Pipeline et commandes

`data/scenarios/<id>.src.json` (écrit à la main, déclaratif)
→ `node scripts/build.mjs` → `public/scenarios/<id>.json` (la source
+ `cards[]` figées + `encounterSetNames` + `builtAt`) et
`src/scenarios.generated.ts` (registre importé par le Worker). Le build
régénère aussi `public/data/investigators.json`, `cards_index.json` et
`player_cards.json`. **Les fichiers générés sont commités** (Workers
Builds ne relance pas le build).

Source des cartes : dump complet **arkham.build**
(`https://api.arkham.build/v1/cache/cards` + `metadata`), mis en cache
dans `data/cache/` — `node scripts/build.mjs --refresh` pour le
rafraîchir. Les images restent servies par `cdn.arkham.build` en jeu.
La couche de normalisation reconstruit la forme ArkhamDB : `real_*` →
champs nus, versos `hidden` réinjectés en `linked_card`, taboos écartés,
`bonded` relu dans le texte imprimé.

Commandes du cycle : `npm run build:data` · `npm run check`
(tsc + dry-run) · `npm run dev` (wrangler) ·
`node scripts/test_room.mjs [http://127.0.0.1:8787]` ·
`python3 scripts/captures.py [url] [dossier_sortie]`.

**Contrôles du build** (échec = message explicite, les faire passer
avant tout test) : tout code cité — `scenarioCard`, `startLocation`,
`agendaDeck`, `actDeck`, `layout`, tout le `setup` (branches et `when`
compris : `code`, `codes`, `from`, `at`, `atRandom`, `pool`), `leads`,
`agendaEffects` / `actEffects` (`shuffleAside`, `spawnAside`, `randomKeyOn`,
`discardAside`, `setAside`, `discardAt`, `addClues`, `removeLocations.codes`),
`barriers.pairs` — doit exister dans les sets retenus (ou `extraCards`)
des packs déclarés ; les sets cités par `pickRandomSet`, `aside`,
`toPile` doivent être dans `encounterSets` ; `dealToSeats` exige des
`rows` ; `layeredPile` : somme des couches = taille du `pool`, `with` ⊆
`pool` ; chaque `piles[].discard` doit désigner une pile déclarée
`isDiscard` ; `backPlacement` seulement sur une carte liée ; `swaps` :
paires et libellés par deux ; question `number` : `min` et `max`
entiers, sinon `options` non vide.

## 2. Champs racine du `*.src.json`

Le `.src.json` est la définition complète moins ce que le build ajoute
(`cards`, `encounterSetNames`, `builtAt`).

| Champ | Requis | Rôle |
|---|---|---|
| `_source` | conseillé | Traçabilité de la lecture du guide (pages, encadrés, diagrammes, choix retenus). **Retiré au build**, jamais servi. |
| `id` | oui | Slug du fichier (`tic_in_too_deep`). |
| `title`, `campaign`, `campaignId`, `order` | oui | Bibliothèque (titre, campagne, tri). |
| `pack` **ou** `packs` | oui | Pack(s) arkham.build filtrant les cartes (`["tic"]`, `["tcu","core"]`…). |
| `encounterSets` | oui | Sets de rencontre rassemblés (codes arkham.build). |
| `extraCards` | non | Cartes du pack hors sets retenus (ex. cartes joueur sans set, suspects d'un autre set). Elles n'entrent en jeu que citées par une op — mais **enemy/treachery restants au `buildEncounter` rejoignent la pioche** : les retirer avant si indésirables. |
| `scenarioCard` | oui | Code de la carte de scénario (posée par `story`). |
| `scenarioCardSide` | non | Face montrée par difficulté (`{"easy":"a",…}`), défaut `"b"` (COB : Easy/Standard au recto). |
| `agendaDeck`, `actDeck` | oui | Codes dans l'ordre. À `story`, les codes déjà retirés du pool (versions alternatives selon le journal) sont simplement sautés. |
| `startLocation` | non | **Informatif seulement** : consommé nulle part (vérifié par le build). |
| `layout` | oui (peut être court) | **Informatif seulement** : le placement réel vient des ops `place` du setup. Convention : y noter le(s) point(s) d'ancrage. Vérifié par le build. |
| `chaosBag` | oui | `{easy,standard,hard,expert: Token[]}` — sac de départ (voir §8 pour les jetons). |
| `questions` | oui (peut être `[]`) | Questions du lobby, §3. |
| `setup` | oui | Suite d'ops, §5 — exécutées dans l'ordre. |
| `reminders` | oui (peut être `[]`) | Rappels `{when, text}`, §6. |
| `seatCounters` / `tableCounters` | oui (souvent `[]`) | `{key,label,icon?,initial}`. `seatCounters` : chips rendues (tapis + board joueur), icône `/img/chaos/<icon>.svg`, la clé `seal.counter` est routée vers le sac. `tableCounters` : état seulement, **sans rendu en v1**. |
| `piles` | non | Piles supplémentaires, §6. |
| `backPlacement` | non | `{code:{x,y}}` — où le verso-lieu d'un agenda/acte lié entre en jeu (défaut : centre 737 × 411). |
| `storyBack` | non | `[codes]` à dos histoire — recensement manuel (les données ne les marquent pas uniformément). Le verso reste secret dans le journal. |
| `swaps`, `mythosDoom`, `emptySpace`, `barriers`, `flood`, `agendaEffects`, `leads`, `seal`, `cardSeal`, `bury` | non | Comportements runtime, §6. |

## 3. Questions du lobby

Trois formes ; la réponse de chaque question est loggée au setup avec
son libellé.

- **Choix** (défaut) : `{id, text, options:[{id,label}]}` — boutons
  radio, réponse = `id` de l'option.
- **Numérique** : `{id, text, type:"number", min, max, default?}` —
  champ nombre, réponse = entier borné (`min`/`max` exigés par le
  build). Consommée par `branch` (valeur en chaîne) ou par les `nFrom`.
- **Cases à cocher** : `{id, text, type:"multi", options:[…]}` —
  réponse = liste d'ids cochés, **éventuellement vide** (journal
  « aucun ») ; doublons et options inconnues refusés. Se teste avec
  `{q, has}` uniquement.

Accès aux réponses : `branch on:<id>` (égalité), `when` (conditions
composées), et les paramètres `nFrom:<id>` de `addDoom`, `addTokens`,
`removeClues`, `chaosAdd`.

## 4. Aiguillage

- `{"op":"branch", "on":X, "cases":{...}, "log"?}` — `on` = id de
  question, ou `"players"` (clés `"1"`…`"4"`), ou `"difficulty"` (clés
  `easy|standard|hard|expert`). Clé `"default"` possible ; cas absent =
  rien. `log` s'écrit avant les sous-ops.
- `{"op":"when", "cond":C, "then":[…], "else"?:[…]}` — condition
  composée : `{q,is}` (égalité, la réponse est comparée en chaîne),
  `{q,has}` (option cochée d'une `multi`), `{all:[C…]}`, `{any:[C…]}`,
  `{atLeast:n, of:[C…]}`, `{not:C}`.

Les deux s'imbriquent librement (le build vérifie les codes cités dans
toutes les branches).

## 5. Ops de setup — référence complète

Avant la première op : table vierge (cartes, piles, liens, chaos =
`chaosBag[difficulté]`, compteurs de table/sièges initialisés, journal
vide), cartes des enquêteurs posées dans `seat0…3`. Les ops s'exécutent
dans l'ordre du tableau. **Fin de setup implicite** : tout ce qui n'a
été ni posé ni mis en pile part dans `removed` (jamais affiché) ; le
sac est loggé ; manche 1, la phase du mythe est sautée, phase des
enquêteurs ; les rappels `when:"setup"` s'affichent.

**Slots** : `pickRandom` (avec `slot`) et `setStart` mémorisent des
cartes sous `slot:<nom>` (première tirée) et `slot:<nom>:<i>` (i-ème).
Toute référence de carte (`code`, `at`, `codes[0]` de `remove n`,
entrées de `from`…) accepte `slot:<nom>` ; dans `from`, un slot est
résolu en **code** (pas en instance).

**Pool** : chaque code existe en `qty` exemplaires (ids internes
`<code>-i` si qty > 1). Les ops consomment le pool ; `remove` ne touche
donc pas ce qui est déjà posé.

### Poser et placer

- `{"op":"place","code","zone","x","y","faceUp"?,"reveal"?,"log"?}` —
  pose un exemplaire. `zone` : presque toujours `"board"` (autres zones
  §7). `faceUp` défaut `false`. `reveal:true` sur un **lieu** : face
  visible + indices selon le nombre d'enquêteurs (`clue.perInvestigator`
  lu des données, `clues_fixed` → valeur fixe) + marée en cours (TIC).
  Le journal nomme la **face visible** : un lieu non révélé garde son
  secret (`backName`, ex. « Decrepit Door »).
- `{"op":"spawn","code","at","log"?}` — pose révélée sur la carte `at`
  (code ou slot) avec décalage automatique (36/46 px + 18 par carte déjà
  présente). Pour les ennemis « mis en jeu à » un lieu.
- `{"op":"minis","code","log"?}` — pions de tous les enquêteurs sur la
  carte en jeu (rangée de 44 px à cheval sur le bord haut) : un lieu, ou
  un **véhicule** (Fishing Vessel : « chaque enquêteur commence dans le
  navire »).
- `{"op":"setStart","code"}` — définit `slot:start` (référence pure,
  aucun effet visuel).
- `{"op":"emptySpace","positions":[{x,y}…],"log"?}` — proxys « espace
  vide » (dos de carte joueur), ids `empty-i`, code `empty:space`.
  Nécessite `emptySpace:true` à la racine pour l'action runtime.
- `{"op":"barriers","pairs":[{"a","b","n"}…],"log"?}` — `n` barrières
  (jetons ressource) entre deux lieux **en jeu** ; cumule si l'arête
  existe, `n ≤ 0` ignoré. Nécessite `barriers:true` à la racine pour le
  rendu/menus.
- `{"op":"placeKey","color","at"?|"atRandom":[codes],"faceUp"?,"log"?}`
  — une clé de couleur posée à cheval sur le bord gauche d'une carte en
  jeu (`at` = journal ; `atRandom` = mode autonome, lieu tiré au
  hasard). Couleurs : red, blue, green, yellow, purple, black, white.
  Erreur si la clé existe déjà (une seule par couleur).
- `{"op":"randomKey","at","log"?}` — une clé **face cachée de côté**,
  tirée au hasard, posée sur `at` sans être regardée (journal muet sur
  la couleur).
- `{"op":"keys","tokens"?:[…]|"colors"?:[…],"faceUp"?,"fillAsideTo"?,"log"?}`
  — clés mises de côté (cartes `key:<x>` déplaçables). `tokens` =
  jetons du chaos pris dans la **collection** (jamais dans le sac —
  TCU) ; `colors` = clés de couleur à deux faces (TIC). `faceUp:false` :
  posées face cachée **et mélangées** (personne ne sait laquelle est
  laquelle) — ne jamais nommer une clé cachée ensuite. `fillAsideTo:n` :
  parmi `colors`, tirées au hasard, juste assez pour que `n` clés face
  cachée soient de côté ; les autres n'existent pas dans la table
  (Into the Maelstrom : « until there are no more than 4 set-aside
  keys »). Une clé « contrôlée par un enquêteur » d'après le journal se
  pose de côté face visible avec un rappel « glissez-la sur son siège »
  (le choix de l'enquêteur reste aux joueurs).

### Tirages au hasard

- `{"op":"pickRandom","from":[codes],"n"?,"slot"?,"zone"?,"x","y"|"positions":[{x,y}…],"faceUp"?,"reveal"?,"rest"?,"restPile"?,"log"?}`
  — tire `n` (défaut 1) parmi `from` (un code présent en plusieurs
  exemplaires peut sortir plusieurs fois). Avec `zone` + position(s) :
  les tirées sont posées (`positions[i % len]`, ou `x + i·158`) ; avec
  `log`, une seule ligne de journal pour tout le tirage, sinon une par
  carte. Sans zone : tirage nominal seulement (slot/journal). **Sort
  des restes** (codes non tirés + copies restantes des codes tirés) :
  `rest` absent = retirés ; `"aside"` = de côté face cachée ; `"pile"` =
  dans la pile `restPile` (créée au besoin) ; `"keep"` = laissés au
  pool (ils rejoindront la pioche de rencontre au `buildEncounter` —
  ennemis Vehicle non tirés de Horror in High Gear). `slot` : voir
  Slots.
- `{"op":"fromPile","pile","n","zone","positions":[{x,y}…],"faceUp"?,"reveal"?,"slot"?,"log"?}`
  — les `n` premières cartes d'une pile **déjà construite** entrent en
  jeu aux positions données (Road deck : « put the top 3 cards into
  play in a straight line »), non révélées par défaut ; `slot`
  mémorise `slot:<slot>:<i>` (0 = première) et `slot:<slot>` — pour un
  `spawn` ou des `minis` sur le lieu de tête. Le journal nomme la face
  visible (dos commun : rien de dévoilé).
- `{"op":"pickRandomSet","from":[sets],"n"?,"log"?}` — garde `n` sets
  entiers dans le pool, retire les autres, **sans dire lesquels**
  (journal générique).
- `{"op":"dealToSeats","from":[codes],"n","rows":[{x,y,dx?}…],"start"?,"log"?}`
  — `n` cartes tirées, distribuées une à une dans l'ordre des joueurs
  (principal d'abord) ; rangée i = i-ème enquêteur servi (`dx` défaut
  190) ; le reste de `from` est retiré. `start:true` : chacun révèle un
  de ses lieux au hasard (indices posés) et son pion s'y pose.
- `{"op":"layeredPile","pile","pool":[codes],"layers":[{n?,with?}…],"log"?}`
  — pile construite par couches, **du dessus vers le dessous** ; les
  `with` de toutes les couches sont réservées avant les tirages (piège :
  sinon une couche du dessus prendrait la carte imposée du dessous) ;
  chaque couche est mélangée ; tout le pool doit être consommé. Journal
  muet sur qui est où.
- `{"op":"leadsDeck","suspects":[6],"hideouts":[6],"secret","pile","log"?}`
  — Elina Harper : un suspect + une cachette au hasard, face cachée
  dans la pile `secret` (ordre mélangé, personne ne regarde) ; les dix
  autres forment `pile`, mélangée ; initialise `state.leads`.
- `{"op":"randomTokens","token","n"?,"picks":[…],"rounds":[…],"log"?}`
  — jetons posés au hasard sur les lieux du tapis : `rounds[j-1]`
  tirages de `picks[j-1]` lieux distincts (j = nombre de joueurs),
  chaque lieu tiré reçoit `n` (défaut 1) jetons. `token` :
  doom/clue/damage/horror/resource/generic. (Brèches d'In the Clutches
  of Chaos.)

### Retirer, mettre de côté, piles

- `{"op":"remove","codes":[…],"n"?,"log"?}` — sans `n` : **toutes les
  copies restantes** de chaque code partent dans `removed`. Avec `n`
  (un seul code) : retrait partiel de n exemplaires. À faire **avant**
  `buildEncounter` pour ce qui ne doit pas finir dans la pioche.
- `{"op":"aside","codes":[…]|"sets":[…],"faceUp"?,"side"?,"log"?}` —
  hors jeu, zone de côté (rangée sous le tapis), face cachée par
  défaut. `sets` : chaque carte du set autant que sa quantité.
  `side:"b"` : mise de côté sur son **verso lié** (Angry Mob = verso de
  07062) — interdit sur une carte à simple face (image inexistante).
- `{"op":"toPile","pile","set"?|"codes"?,"shuffle"?,"log"?}` — envoie
  dans une pile (créée au besoin) le set entier ou les codes (toutes les
  copies restantes de chaque code) ; `shuffle` mélange **toute** la
  pile, y compris son contenu antérieur — `"codes":[]` + `shuffle`
  mélange donc une pile déjà remplie (les Unfathomable Depths versées
  une à une par des `pickRandom rest:"pile"` : sans ce mélange, l'ordre
  des paires serait connu).
- `{"op":"bury","with"?:[codes],"fromDeckTop"?,"trait","dy"?,"log"?}` —
  **après `buildEncounter`** : les instances de `with` mises de côté
  plus tôt + les `fromDeckTop` premières cartes de la pioche (défausse
  remélangée au besoin), mélangées puis réparties face cachée aussi
  également que possible **sous** les lieux en jeu portant `trait`
  (elles glissent dessous, z inférieur, seul le bas dépasse). Journal
  muet sur qui va où.

### Jetons et sac du chaos

- `{"op":"addDoom","n"?|"nFrom"?,"log"?}` — doom sur l'agenda courant :
  **exige `story` avant** (erreur sinon). `nFrom` = id de question
  numérique ; 0 avec `nFrom` est loggé « aucun ».
- `{"op":"addTokens","at","token","n"?|"nFrom"?,"log"?}` — jetons sur
  une carte en jeu (`at` = code ou slot). `token` : doom, clue, damage,
  horror, resource, generic, **flood** (0–2).
- `{"op":"addClues","code","n","log"?}` — indices fixes sur un lieu,
  révélé ou non (Desolate Coastline).
- `{"op":"removeClues","from":[refs],"n"?|"nFrom"?,"log"?}` — retire n
  indices « aussi également que possible » : un à la fois, à tour de
  rôle, dans l'ordre donné.
- `{"op":"chaosAdd", …}` — trois formes exclusives :
  `{"tokens":[…]}` (liste fixe) ; `{"byDifficulty":{easy:[…],…}}`
  (selon la difficulté, liste vide possible) ;
  `{"token","nFrom","plus"?}` (n exemplaires, n = réponse numérique
  + `plus` fixes — report des sangs de COB).
- `{"op":"chaosSet","byDifficulty":{…},"log"?}` — **remplace tout le
  sac** (encarts « Standalone Mode »).
- `{"op":"chaosRemove","tokens":[…],"log"?}` — retire **un** exemplaire
  de chaque jeton listé ; les absents sont ignorés (journal liste ce
  qui est parti, « aucun » sinon).

### Histoire et pioche de rencontre

- `{"op":"story","log"?}` — pose la carte de scénario (face selon
  `scenarioCardSide`/difficulté, défaut `"b"`), l'agenda 1 et l'acte 1
  (doom à 0) ; le reste des deux decks va en piles `agendaDeck` /
  `actDeck`. Les codes retirés plus tôt (versions alternatives) sont
  sautés : le premier restant devient courant. Précède `addDoom`.
- `{"op":"buildEncounter","split"?:[{trait,pile}…],"log"?}` — **tous**
  les enemy/treachery restants du pool : ceux qui portent un `trait` de
  `split` forment la pile correspondante (mélangée, sa défausse
  déclarée est créée) ; le reste devient la pioche `encounter`,
  mélangée. Donc : `remove`/`aside`/`spawn` d'abord, `buildEncounter`
  ensuite, `bury` après.

### Journal et rappels

- `{"op":"log","text"}` — ligne de journal de setup.
- `{"op":"reminder","text"}` — encart éphémère + journal (comme un
  rappel `when:"setup"`, mais placé dans le flux du setup).

### Non implémenté

- `{"op":"hook","name"}` — **lève une erreur en v1**. Ne pas l'utiliser :
  une mécanique qui manque = nouvelle op typée dans `scenario.ts`,
  implémentée dans `setup.ts`, contrôlée par le build, testée — puis
  documentée ici.

## 6. Comportements runtime déclarés à la racine

Ces champs n'agissent pas au setup : ils activent des actions, menus et
rendus pendant la partie.

- **`piles`** : `[{id, label, discard?, isDiscard?, trait?, gather?, around?, menuFor?}]`.
  Toute pile déclarée existe dès le setup (même vide). `discard` = id de
  sa défausse (déclarée `isDiscard:true`) ; `trait` : les cartes portant
  ce trait vont dans cette pioche/défausse par défaut (pioche spectrale
  de Wages of Sin, avec `buildEncounter.split`) ; `gather:{backName}` :
  la pile se forme en cours de partie (action `formPile`) avec les
  lieux de côté dont le côté non révélé porte ce nom (« Tidal
  Tunnel ») ; `around:true` : ses lieux se posent à côté d'un lieu du
  tapis (action `placeAround {id, pile, dir?}` : `dir` = `below` /
  `left` / `right` pour une seule carte à cet emplacement, sans `dir`
  les trois emplacements libres — pas de grille 186/238 ; menu du lieu :
  une ligne « <label> (n) ↓ ← → ⟳ » par pile, même ligne de boutons que
  l'inondation) ; `menuFor:[kinds]` : le menu de ces cartes propose
  « Placer dans <label> » (Invités sauvés, Profondeurs).
- **`swaps`** : `[{pair:[a,b], labels:[la,lb]}]` — lieux jumeaux
  (normal ↔ Spectral) ; action `swapLocation` (un lieu, ou `all`).
- **`mythosDoom: false`** — la phase du mythe n'ajoute pas le doom
  automatique (le rappel de phase reste).
- **`emptySpace: true`** — action `emptySpace` + entrée de menu des
  lieux (Before the Black Throne).
- **`road`** : `{pile, longWay}` — Road X (Horror in High Gear) :
  action `roadAhead {id, n}` — la première carte de la pile `pile`
  (Road deck) + (n − 1) cartes de côté de code `longWay` (Long Way
  Around), mélangées, entrent en jeu non révélées dans une nouvelle
  colonne devant le lieu (x + 186 ; 1 = en face, 2 = en face + dessous,
  3 = dessus + en face + dessous, case prise → plus bas) ; journal muet
  sur lequel est lequel ; menu du lieu : ligne « Road X (deck n,
  détours m) 1 2 3 ».
- **`barriers: true`** — rendu des chips sur les arêtes (clic = −1,
  « + » au survol) et menu du lieu « +1 barrière vers… » (voisins
  orthogonaux à 186/238 px). L'action serveur `setBarrier {a,b,delta}`
  existe toujours ; le flag gate le front.
- **`flood`** : `{byAgenda?:{"<stage>":{all?:"increase"|"full", onReveal?:0|1|2}}, onRevealByCode?:{"<code>":1|2}}`
  — `byAgenda` : quand cet agenda devient courant, tous les lieux
  révélés montent d'un niveau (`increase`) ou sont totalement inondés
  (`full`), et `onReveal` devient la règle appliquée à chaque révélation
  (0 rien, 1 +1 niveau, 2 totalement) ; `onRevealByCode` : règle
  imprimée sur un lieu précis (Devil Reef : îles et profondeurs qui
  s'inondent à leur révélation), même sémantique, la plus forte des deux
  règles l'emporte (journal « (texte du lieu) »). `flood: {}` suffit à
  activer menus « Inondation » et panneau Marée. Niveaux : 0 sec,
  1 partiellement, 2 totalement.
- **`agendaEffects`** / **`actEffects`** : `{"<stage>" | "after:<code>": StageEffects}`
  — clé `"<stage>"` : appliqués quand l'agenda (ou l'acte) `stage`
  devient courant ; clé `"after:<code>"` : quand la carte `code` quitte
  l'histoire (son verso résolu — utile quand deux versions d'un agenda
  ont des versos différents, The Lair of Dagon). Les effets s'appliquent
  **dans l'ordre d'écriture des champs** (celui du verso de la carte) et
  sont **idempotents** (une carte déjà en jeu n'est pas reposée :
  l'acte et l'agenda peuvent déclarer les mêmes gestes quand les deux
  versos convergent — A Light in the Fog) :
  `flood {mode, trait?, scope?:"all"|"revealed"}` (inonde les lieux du
  trait, tous ou révélés) ; `shuffleAside` (ces codes de côté rejoignent
  la pioche, `withDiscard:true` remélange aussi la défausse) ;
  `revealCodes` (lieux du tapis révélés, indices et marée) ;
  `placeBelow [{code, at}]` (une carte de côté posée non révélée juste
  sous un lieu, case prise → plus bas) ; `fillRows {pile, anchors,
  columns, count}` (la rangée de chaque lieu-ancre est complétée à
  `count` lieux avec les premières cartes de la pile, aux colonnes
  libres, non révélés) ; `removeTrait` (les lieux du trait quittent le
  tapis : victoire si Victory X sans indice, retirés sinon — ce qui s'y
  trouvait est laissé, rappel) ; `spawnAside {code, at, side?}` (une
  carte de côté **ou déjà en jeu** apparaît sur un lieu ; objet ou liste) ;
  `randomKeyOn` (clé cachée au hasard posée dessus) ;
  `removeLocations {trait?, except?, codes?}` (comme `removeTrait`, ou
  « chaque lieu autre que… », ou ces seuls codes) ; `spreadPile {pile, positions, flood?}` (les
  cartes d'une pile entrent en jeu non révélées aux positions libres
  données, une par position, inondées si demandé — le reste de la pile
  reste de côté) ; `byPlayers {"1"…"4": StageEffects}` (variante selon
  le nombre de joueurs, appliquée à sa place dans l'ordre — Act 2 Setup
  d'Into the Maelstrom : positions différentes par nombre
  d'enquêteurs ; un objet n'ayant qu'un champ de chaque nom, une
  seconde pile ou un second `spawnAside` se déclarent dans une variante
  imbriquée) ;
  `placeAt [{code, x, y, faceUp?, flood?}]` (une carte de côté posée à
  une position, révélée par défaut, inondée si demandé) ; `chaosAdd` /
  `chaosRemove` (jetons du sac, un exemplaire chacun) ;
  `discardEnemies: true` (« chaque ennemi en jeu est défaussé » : les
  ennemis de rencontre du tapis et des zones de menace vont dans la
  défausse de rencontre — un ennemi venu d'un deck joueur reste, sa
  défausse est celle de son propriétaire) ; `discardAside [{code, n?}]`
  (copies **de côté** de ce code placées dans la défausse de rencontre,
  `n` au plus, toutes par défaut — Fire! de Spreading Flames) ;
  `setAside [codes]` (ces cartes, où qu'elles soient — jeu, zone de
  menace, défausse, victoire —, reviennent de côté face visible, sans
  jeton ni chemin : « heal all damage… and set them aside ») ;
  `discardAt [codes]` (les cartes de rencontre posées sur ces lieux du
  tapis — attaches, traîtrises, ennemis, centre de la carte sur le lieu
  comme pour le porteur d'un lieu déplacé — vont à la défausse : « discard
  all attachments from X », à écrire **avant** le `removeLocations` du
  même lieu) ; `addClues [{code, n, perInvestigator?}]` (indices posés
  sur un lieu du tapis, révélé ou non, `n` ou `n` par enquêteur). Cible
  introuvable → rappel « à faire à la main », jamais d'erreur ; rien à
  faire → pas de ligne.
  `spawnAside` accepte un objet **ou une liste** (deux apparitions dans
  un même verso : Servant of Flame aux dortoirs et une Fire! attachée à
  la chambre) ; il prend d'abord une copie **de côté**, sinon une copie
  en jeu, jamais une copie de la pioche, de la défausse ou de la zone
  de victoire — une carte à cinq exemplaires (Fire!) n'« apparaît »
  donc jamais depuis la défausse. `removeLocations` accepte aussi
  `{codes: [...]}` (ces seuls lieux, par code : « remove Your Friend's
  Room from the game »). Une **attache** (traîtrise attachée à un lieu)
  n'a pas de modèle propre : c'est une carte posée sur le lieu (elle le
  suit s'il est déplacé) — `spawnAside` la pose, `discardAt` la
  défausse.
- **`leads`** : `{pile, secret, shown, reference, suspects, hideouts, spots, elina, square, act2, agenda3}`
  — toute la mécanique d'Elina Harper (actions `leadsReveal`,
  `leadsTake`, `leadsReturn`, `leadsToggle`, `accusation` ;
  l'accusation déclenche aussi les rappels `act:2` et `agenda:3`).
- **`seal`** : `{token, label, counter, maxPerSeat, maxTotal?}` —
  scellage de jetons **sur les enquêteurs** (sangs de COB) : actions
  `chaosSeal`/`chaosRelease` (le jeton passe des tirés ou du sac au
  compteur de siège `counter`, et retour) ; `maxPerSeat` borne le
  compteur, `maxTotal` borne sac + scellés pour `chaosAdjust`.
- **`cardSeal: true`** — scellage de jetons **sur les cartes** (codex
  des invités, COB III) : actions `chaosSealCard`/`chaosReleaseCard
  {id, token}` (jeton pris des tirés, sinon du sac), pastilles 22 px en
  haut à droite ; défausser la carte ou l'envoyer en zone de victoire
  libère ses jetons vers le sac.
- **`bury`** (racine) : `{withAny, fromDeckTop, trait, dy?, menuPile, menuCard}`
  — enfouissement **en cours de partie** : action `bury` sur la pioche
  de rencontre (libellé `menuPile`) et `buryAt` sur une carte de
  `withAny` (libellé `menuCard` : elle + 1 carte de la pioche, sous son
  lieu).
- **`backPlacement`** : `{code:{x,y}}` — position d'entrée du verso
  quand l'agenda/acte lié avance (défaut 737 × 411) : **verso-lieu**
  (la carte devient un lieu : couche des lieux, indices de son verso)
  ou **verso-ennemi** (Devil Reef : la carte devient un ennemi posé au
  centre avec le décalage d'un `spawn`, à déplacer là où sa carte
  l'envoie). Le verso ne change de nature pour le moteur que par
  l'avancement — le retourner à la main le laisse « acte » ou
  « agenda » (lisible, sans indices ni jauges).
- **`reminders`** : `{when, text}` avec `when` ∈ `"setup"`, phases
  (`"mythos"`, `"investigation"`, `"enemy"`, `"upkeep"` — au début de
  chaque phase concernée), `"act:N"` / `"agenda:N"` (quand l'étape
  devient courante), `"round:N"` (au mythe de la manche N). Un rappel
  par étape de setup manuelle + un par phase qui a une règle spéciale.

## 7. Conventions de plateau et de nommage

- **Grille des diagrammes** : pas de 186 px en x, 238 px en y (cartes
  126 × 178 + marges). Colonnes usuelles : 365, 551, 737, 923, 1109… ;
  lignes : 173, 411, 649, 887… ; **centre = 737 × 411** (défaut
  `backPlacement`, position du lieu unique de départ). Des demi-pas
  existent quand le diagramme quinconce (293, 531…). `placeAround` et
  le menu des barrières utilisent le même pas.
- **Autres constantes** : minis 44 px (rangée bord haut des lieux),
  clés 44 px (bord gauche, empilées vers le bas), cartes de côté
  espacées de 136 px.
- **Porteurs** : un lieu déplacé emmène pions, clés et cartes posés
  dessus ; un **véhicule** (soutien à trait `Vehicle` : Fishing Vessel,
  voitures de Horror in High Gear) emmène ses pions et clés seulement —
  un pion à cheval sur le véhicule est « dedans » (règle du guide), posé
  sur le lieu il n'y est pas. Un soutien à verso lié de même kind
  (voitures : `07211a` → `07211b` « Stopped ») se bascule par « Autre
  face (<sous-titre du verso>) » (`toggleSide`), comme un lieu Spectral
  ou Nathan Wick. Une **carte histoire dont le dos est un lieu**
  (Captured! → Holding Cells, posée par `place` dans la zone `story`)
  se bascule aussi par « Autre face (<nom du verso>) » : elle **change
  de nature** pour le moteur (kind `location` côté b, indices de son
  verso la première fois ; retour à `story` côté a) — à glisser sur le
  tapis d'abord.
- **Zones** : `board` (tapis), `story` (agenda/acte/scénario), `aside`
  (de côté), `victory`, `seat0–3` (postes), zones du board joueur
  (`pplay/pevent/pcommit/paside` + n° de siège) — le setup n'écrit
  quasi que dans `board`.
- **Références** : codes arkham.build à 5 chiffres ; exemplaires
  internes `<code>-i` ; clés `key:<couleur|jeton>` ; espace vide
  `empty:space` ; enquêteur custom `custom:<siège>` ; slots
  `slot:<nom>`.
- **Faces** : `side:"b"` seulement si un verso existe (carte
  `double_sided` ou liée) — un lieu `back:"encounter"` (Strange
  Geometry) n'a pas de côté b et entre révélé. `clues_fixed` des
  données → indices fixes ; sinon par enquêteur. Vérifier
  `health_per_investigator` sur la carte réelle en cas de doute.
- **Journal** : toujours la face visible (`nomVisible`) — dos histoire,
  versos non révélés et clés cachées gardent leur secret ; les tests le
  vérifient (aucune couleur de clé cachée citée).

## 8. Jetons

- **Sac du chaos** (`Token`) : `"+1"`, `"0"`, `"-1"`…`"-8"`, `skull`,
  `cultist`, `tablet`, `elder_thing`, `auto_fail`, `elder_sign`,
  `bless`, `curse`, `frost`, `blood`. Fichiers `/img/chaos/` : nombres
  = `p1.svg`, `0.svg`, `m1.svg`…`m8.svg`, le reste par nom. `bless` /
  `curse` : 10 max chacun, révélés ils retournent à la **réserve**, pas
  dans le sac. `blood` : reste dans le sac de scénario en scénario
  (COB). Icônes lues à 600 dpi en cas de doute : la capuche du cultiste
  a une pointe sommitale, la tablette n'en a pas.
- **Jetons de carte** (`tokens`) : doom, clue, damage, horror,
  resource, generic, uses, flood. Bornés par `addToken` (flood ≤ 2) ;
  le passage en pile les efface — un jeton qui doit survivre à la pile
  demanderait un champ à part.
- **Compteurs** : icône `/img/chaos/<icon>.svg` ; jetons Uses du board
  joueur : `/img/tokens/uses/<type>.png` (types dans
  `data/uses_tokens.json`).

## 9. Nouvelle room — les étapes (condensé)

1. **Fiche scénario** : pages Setup + diagramme du guide (images),
   pack et sets, choix A/B, particularités — consignées dans
   `_source`. Sans diagramme (Spreading Flames : un seul lieu en jeu,
   les autres de côté), la disposition se déduit des icônes de
   connexion des cartes (images CDN) et se note dans `_source` et un
   rappel `setup`.
2. **Écrire le `.src.json`** avec les ops de ce document. Une mécanique
   absente = concevoir la nouvelle op (question à l'utilisateur si
   choix structurel), l'implémenter, la contrôler au build, **puis la
   documenter ici**.
3. `node scripts/build.mjs` — corriger jusqu'à zéro erreur de
   cohérence.
4. `npm run check`.
5. `npx wrangler dev` (vérifier par `curl http://127.0.0.1:8787/`,
   jamais `ss` ; si le port est pris, wrangler en choisit un autre —
   le passer en argument aux scripts) puis
   `node scripts/test_room.mjs` — ajouter le bloc de
   tests du scénario (sac par difficulté, questions, mises de côté,
   pièges du scénario).
6. `python3 scripts/captures.py` — vérification visuelle.
7. Régression sur un scénario déjà livré.
8. Docs dans le même commit : récit + ligne de tableau au mémo §0 ;
   rotation du plus ancien récit récent vers
   `docs/ARCHIVE_livraisons.md` (durable versé d'abord) ; grammaire si
   nouvelle op ou option.
9. **Un commit unique** (code + données + docs) poussé sur `main` ;
   SHA communiqué ; déploiement vérifié (check-runs du commit via
   l'API GitHub, ou `curl` d'un fichier modifié une fois le build
   passé).

## 10. Squelette minimal

```json
{
  "_source": "Guide de campagne X (FFG, année) : Setup p. N, diagramme p. M, encart Standalone p. K ; choix retenus.",
  "id": "xxx_mon_scenario",
  "title": "Mon scénario",
  "campaign": "Ma campagne",
  "campaignId": "xxx",
  "order": 1,
  "packs": ["xxx"],
  "encounterSets": ["set_principal", "set_annexe"],
  "extraCards": [],
  "scenarioCard": "13068",
  "agendaDeck": ["13069", "13070"],
  "actDeck": ["13072", "13073"],
  "startLocation": "13076",
  "layout": [{ "code": "13076", "x": 737, "y": 411 }],
  "chaosBag": {
    "easy": ["+1", "+1", "0", "0", "0", "-1", "-1", "-1", "-2", "-2", "skull", "skull", "cultist", "tablet", "auto_fail", "elder_sign"],
    "standard": ["…"], "hard": ["…"], "expert": ["…"]
  },
  "questions": [],
  "setup": [
    { "op": "place", "code": "13076", "zone": "board", "x": 737, "y": 411, "reveal": true },
    { "op": "minis", "code": "13076" },
    { "op": "aside", "codes": ["13097"] },
    { "op": "story" },
    { "op": "buildEncounter" }
  ],
  "seatCounters": [],
  "tableCounters": [],
  "reminders": [
    { "when": "setup", "text": "Hors application : 5 ressources, main de départ (mulligan possible), deck à portée ou importé sur le board joueur." }
  ]
}
```

Ajouts fréquents : questions campagne/autonome + `branch`/`when` sur le
sac (`chaosAdd`/`chaosSet`), `remove` selon le journal, `pickRandom`
avec `slot` pour un lieu de départ variable, `storyBack`, rappels
`act:N`/`agenda:N`.
