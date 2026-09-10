# Cahier des charges v1 — Anofelis Web (rooms AHLCG)

Déduit du mémo `ARKHAM_WEB_notes.md` §1 « Fonctionnalités décidées »
(questionnaire du 2026-09-03) et des trois choix structurels du
2026-09-03 (identité de siège, pioche unique, coordonnées libres).
Ce document décrit **ce que fait l'application** et **le modèle d'état**
qui le porte ; il ne préjuge pas du code. Toute divergence future se
tranche ici puis se reporte dans le mémo.

Périmètre v1 : **scénario isolé**, 1‑4 joueurs, une seule pioche de
rencontre, pas de deck joueur, pas d'undo, pas de mise en page
téléphone. Les extensions prévues (campagne, pioches multiples, decks
joueurs) sont réservées dans le modèle mais non implémentées.
**Version 1.1 (2026-09-07)** : le board joueur (deck importé, page
joueur par siège) est spécifié en §10 ; étape 1 livrée le 2026-09-07.

---

## 1. Acteurs et rôles

| Rôle | Comment on l'obtient | Droits exclusifs |
|---|---|---|
| **Hôte** | Créateur de la room ; jeton `hostToken` en `localStorage`. Réclamable par tout joueur si l'hôte est déconnecté. | Lancer le setup, réinitialiser la partie, clôturer/supprimer la room. |
| **Joueur** | Prend un siège libre à la connexion (avant le setup) ou reprend un siège libéré (après le setup, siège déjà configuré). | Toutes les actions de jeu. |
| **Spectateur** | Connexion sans siège. | Aucune action ; voit tout ce qu'un joueur voit (mêmes règles de visibilité). |

Un siège porte un **nom optionnel** saisi à la connexion ; à défaut,
l'app affiche le nom de l'investigateur choisi, ou « Siège n » tant
qu'aucun investigateur n'est choisi. Le nom n'est pas persistant entre
connexions (pas de jeton joueur en v1).

Cycle d'un siège : `libre` → `occupé` (connexion) → `libre` (close WS).
Après le setup, un siège libéré garde son investigateur et ses
compteurs : le prochain arrivant le reprend tel quel.

## 2. Cycle de vie d'une room

1. **Création** : `POST /api/rooms` avec `{ scenarioId }` → code de
   6 caractères (alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, 31 symboles),
   `hostToken`. Le DO est créé à la première connexion.
2. **Lobby** (`phase = "lobby"`) : choix des sièges, des investigateurs,
   de la difficulté ; l'hôte lance le setup quand au moins 1 siège est
   occupé avec un investigateur.
3. **Questions de setup** (`phase = "setup_questions"`) : le DO pose à
   l'hôte, une par une, les questions bloquantes déclarées par le
   scénario ; la partie ne commence qu'une fois toutes répondues.
4. **Jeu** (`phase = "mythos" | "investigation" | "enemy" | "upkeep"`).
5. **Clôture** : `resolution` (l'hôte déclare la partie finie ; le
   tapis reste consultable) ou `deleted` (suppression immédiate).
6. **Purge** : alarme DO reprogrammée à chaque action ; à 7 jours sans
   action, l'état est effacé.

`reset` (hôte) ramène en `lobby` en conservant sièges, noms et
investigateurs.

## 3. Modèle d'état (autoritaire, dans le DO)

Un seul objet `RoomState` sérialisé JSON, persisté en **un snapshot**
(1 ligne SQLite `state(json)`) après chaque action appliquée. Version
d'état `rev` incrémentée à chaque mutation ; sert aux deltas et à la
détection de désynchronisation.

```ts
type RoomState = {
  rev: number;
  code: string;
  scenarioId: string;
  createdAt: number; lastActivityAt: number;
  phase: Phase;
  round: number;                     // n° de manche (0 avant setup)
  difficulty: "easy"|"standard"|"hard"|"expert";
  playerCount: number;               // figé au setup (sièges occupés)
  seats: Seat[];                     // toujours 4 entrées
  hostSeat: number | null;           // siège de l'hôte s'il est assis
  hostConnected: boolean;
  lead: number | null;               // enquêteur principal (marque ★), choisi au lobby
  turn: { seat: number|null; done: number[] };  // tour en cours en phase des enquêteurs (étape 2)
  cards: Record<CardId, CardState>;  // toutes les cartes de la partie
  piles: Record<PileId, CardId[]>;   // ordre = dessus → dessous
  chaos: ChaosState;
  counters: Record<string, number>;  // compteurs de table (scénario)
  agendaId: CardId | null; actId: CardId | null;
  log: LogEntry[];                   // journal de bord (rappels)
  pendingQuestion: Question | null;  // question bloquante en cours
  campaign: CampaignSlot;            // réservé v2 (voir §3.6)
};
```

### 3.1 Siège

```ts
type Seat = {
  index: 0|1|2|3;
  occupied: boolean;                 // connexion WS ouverte sur ce siège
  name: string | null;               // saisi à la connexion, optionnel
  investigatorCode: string | null;   // code ArkhamDB, ou « custom:<index> » pour un enquêteur personnalisé
  custom?: { name, image: string | null, health, sanity } | null; // enquêteur hors ArkhamDB saisi au lobby (2026-09-04)
  counters: { health, sanity, clues, actions, ...specific };
  // dégâts/horreur sont des jetons sur la carte investigateur (§3.2)
};
```

Vie et santé mentale sont initialisées depuis l'index des
investigateurs (généré au build). `actions` = 3 à chaque entretien.
Les compteurs spécifiques déclarés par le scénario s'ajoutent à
`counters` avec leur valeur initiale.

### 3.2 Carte

Une **carte** est toute chose posée sur la table : lieu, ennemi,
traîtrise, asset histoire, agenda/acte, carte de scénario, carte
investigateur, ainsi que les **proxys** dessinés (clés, marqueurs)
déclarés par le scénario. Les **pions** d'investigateur sont des cartes
de type `mini`.

```ts
type CardState = {
  id: CardId;                        // unique dans la room (code + suffixe)
  code: string;                      // code ArkhamDB (image)
  kind: "location"|"enemy"|"treachery"|"asset"|"story"|"agenda"|"act"
       |"scenario"|"investigator"|"mini"|"proxy";
  storyBack: boolean;                // dos = carte histoire, jamais montré
  loc: { zone: ZoneId; x: number; y: number; z: number }  // sur le tapis
     | { pile: PileId };                                    // dans une pile
  faceUp: boolean;
  exhausted: boolean;
  side: "a"|"b";                     // lieux double face (WOS)
  tokens: { doom?: number; clue?: number; damage?: number;
            horror?: number; resource?: number; generic?: number;
            uses?: number; flood?: number };   // flood : 1 partiellement, 2 totalement inondé (TIC)
  ownerSeat?: number;                // mini, investigateur, engagement
};
```

**Coordonnées libres** : `x, y` sont en unités de tapis (référence
1600 × 1000, cartes 126 × 178 — mêmes proportions que PCIO pour
réutiliser la topologie des diagrammes), relatives à l'origine de la
zone. `z` est un compteur monotone de la room : toute carte lâchée
passe au‑dessus. Une carte dans une pile n'a pas de coordonnées ; en
sortir lui en donne (drop) ; y entrer les efface.

### 3.3 Zones et piles

Zones du tapis (régions fixes, seule `board` est zoomable) :

| ZoneId | Contenu | Particularité |
|---|---|---|
| `board` | lieux, ennemis non engagés, minis, proxys | zoom/pan ; drop d'un lieu face cachée = pas de révélation ; clic = révélation + indices |
| `seat0..seat3` | investigateur + zone de menace du siège | un ennemi lâché ici prend `ownerSeat` (engagé) |
| `story` | agenda + acte courants + carte de scénario | agenda/acte avancés par bouton |
| `aside` | cartes de côté (face cachée ou visible selon `faceUp`) | libre |
| `victory` | zone de victoire | libre |

Piles (ordonnées, sans coordonnées) :

| PileId | Rôle v1 |
|---|---|
| `encounter` | pioche de rencontre (unique en v1) |
| `encounterDiscard` | défausse, consultable |
| `removed` | retiré de la partie (versions non tirées, branches non choisies) — jamais affiché |
| `agendaDeck`, `actDeck` | suites d'agendas/actes, dans l'ordre |

Extension réservée : `piles` est un dictionnaire, un scénario pourra
déclarer d'autres piles (`encounterSpectral`, `unknownPlaces`, `reel`)
avec `shuffleable` et `discardPile` ; le client v1 n'affiche que
`encounter` / `encounterDiscard`. **Non implémenté en v1.**

### 3.4 Sac du chaos

```ts
type ChaosState = {
  bag: Token[];                      // contenu courant
  drawn: Token[];                    // jetons sortis, affichés à tous
  sealed: Token[];                   // retirés du sac (hook onChaosDraw)
};
type Token = "+1"|"0"|"-1"|"-2"|"-3"|"-4"|"-5"|"-6"|"-8"
           |"skull"|"cultist"|"tablet"|"elder_thing"|"auto_fail"|"elder_sign"|"bless"|"curse"|"frost";
```

Composition initiale = `scenario.chaosBag[difficulty]` (§5). Panneau
d'ajustement ± par jeton, ouvert à tous.

### 3.5 Journal de bord et questions

```ts
type LogEntry = { at: number; kind: "setup"|"phase"|"reminder"|"action"|"system";
                  text: string; seat?: number };
type Question = { id: string; text: string;
                  options: { id: string; label: string }[] };
```

Le journal garde les rappels (encart éphémère côté client + historique)
et une trace courte des actions structurantes (setup, changements de
phase, avancements, tirages chaos). Il est tronqué aux 200 dernières
entrées.

### 3.6 Réservé v2 (présent, vide)

`campaign: { log: null, nextScenarioId: null }` — journal persistant et
enchaînement. `Seat.deck` : import de deck ArkhamDB / arkham.build,
spécifié en §10 (board joueur, 2026-09-07).

## 4. Protocole client ↔ DO

Transport : une connexion WebSocket par onglet, hibernante (PartyServer).
Un message = une action ; le DO valide (rôle, phase, cohérence), applique,
persiste, diffuse.

### 4.1 Connexion

`GET /rooms/<code>/ws?seat=<n|spectator>&name=<...>&hostToken=<...>`

Réponse initiale : `{ t:"welcome", state: RoomState, you: { seat, isHost } }`
(seul message contenant l'état complet ; renvoyé aussi sur `resync`). Si
le siège demandé n'est plus libre : `{ t:"seatTaken" }` et fermeture ; le
client repropose. En pratique le client se connecte en spectateur puis
prend un siège par l'action `takeSeat` (une seule connexion) ; le
paramètre `seat` sert à la reconnexion automatique sur son ancien siège.
Un spectateur ne peut prendre un siège après la mise en place que si ce
siège a déjà un enquêteur (siège libéré par une déconnexion).

### 4.2 Actions client → DO

Format `{ t: string, ...args }`. Colonne « Qui » : H = hôte, J = joueur.

| t | Qui | Effet |
|---|---|---|
| `takeSeat {seat, name?}` / `leaveSeat` / `setName {name}` | spectateur / J | prise et libération d'un siège, nom ; hors `rev` (diffusés par `seats`), réponse `{ t:"you", seat, isHost }` |
| `chooseInvestigator {code}` | J (lobby) | fixe l'investigateur du siège (refusé si un autre siège l'a déjà), initialise vie/santé mentale |
| `chooseCustomInvestigator {name, image, health, sanity}` | J (lobby) | enquêteur personnalisé : nom (≤ 40), image facultative (lien http(s) ≤ 600 car.), jauges entières 1‑99 ; code `custom:<siège>`, `custom` porté par le siège (welcome, deltas, `seats`) |
| `clearInvestigator` | J (lobby) | retire l'investigateur de son siège |
| `setDifficulty {d}` | J (lobby) | difficulté |
| `setLead {seat}` | J | enquêteur principal (★) |
| `claimHost` | J si `!hostConnected` | transfert du rôle : nouveau jeton envoyé au demandeur (`{ t:"hostToken", token }`), ancien jeton invalidé |
| `resync` | tous | redemande un `welcome` |
| `startSetup {answers}` | H | exécute le setup ; `answers` = réponses aux `questions` du scénario (posées au lobby, refus si une manque) |
| `answerQuestion {id, option}` | H | répond à `pendingQuestion` |
| `reset` | H | retour lobby |
| `close` / `deleteRoom` | H | résolution / suppression |
| `kick {seat}` | H | libère un siège (au lobby : retire aussi son enquêteur) |
| `moveCard {id, zone, x, y}` | J | drop sur le tapis (au lâcher uniquement) ; une carte sortie d'une pile entre en jeu face visible, sauf un lieu à double face, qui entre non révélé (clic = révélation + indices) ; un lieu à simple face (Strange Geometry) entre révélé avec ses indices |
| `toPile {id, pile, top?, shuffle?}` | J | met une carte dans une pile ; `shuffle` remélange la pile ensuite (« Mélanger dans la pioche ») |
| `flipCard {id}` | J | retourne (refusé pour un dos histoire : face cachée il montre le dos générique ; son côté histoire se lit par `toggleSide`, menu « Lire le côté histoire », quand une carte l'indique). Geste : double-clic sur un lieu du tapis (lieu à deux faces de jeu → `toggleSide` ; lieu caché → `revealLocation`) |
| `revealLocation {id}` | J | face visible + indices auto (`clueValue × joueurs` ou `clueValue` si « per investigator » absent) |
| `toggleSide {id}` | J | lieux double face |
| `exhaust {id, v}` | J | épuiser / redresser |
| `addToken {id, token, delta}` | J | jetons ± sur une carte |
| `setSeatCounter {seat, key, delta}` | J | vie, santé mentale, indices, actions, spécifiques |
| `setCounter {key, delta}` | J | compteur de table |
| `drawEncounter {seat?, pile?}` | J | retourne la première carte de la pioche ou d'une pile déclarée (elle y reste, le joueur la glisse ensuite) ; un lieu à double face tiré montre son côté non révélé ; refusé tant qu'une carte révélée est dessus, et sur une défausse ; pioche vide : sa défausse (encounterDiscard, ou `discard` déclaré) est remélangée |
| `reshuffleDiscard {deck?}` | J | remélange la défausse d'une pioche dans celle-ci (`encounter` par défaut, ou une seconde pioche déclarée) |
| `reshuffleDiscard` | J | toute la défausse de rencontre retourne dans la pioche, mélangée, face cachée |
| `takeClue {id, n?}` | J | déplace `n` (1) indice d'un lieu vers la réserve du siège (double-clic sur les indices) |
| `linkLocations {a, b}` / `unlink {id?}` | J | chemin entre deux lieux (`state.links`, bascule) / efface les chemins d'un lieu ou tous |
| `swapLocation {id}` / `swapLocation {all}` | J | lieux qui se remplacent (`swaps`) : la version jumelle prend la place, les jetons, les chemins et ce qui est posé ; elle entre non révélée, sauf si un pion s'y trouve (révélée, indices) ; l'ancien lieu part de côté. `all` : tous les lieux du tapis qui ont une jumelle disponible |
| `clearClues` | J | retire tous les indices des lieux en jeu |
| `randomPick {pile, n}` | J | nomme n cartes distinctes tirées au hasard dans une pile sans la modifier (journal + encart pour tous) — « choisir un lieu au hasard » |
| `removeLocations {keep}` | J | retire de la partie tous les lieux du tapis sauf un (jetons et chemins effacés) |
| `createCard {code}` | J | génère n'importe quelle carte du jeu (index `cards_index.json`) dans la zone de menace du demandeur ; définition dans `state.extraDefs` |
| `searchEncounter {pile?}` | J | envoie la pioche (ou la défausse) au demandeur (`peek`) ; le client remélange à la fermeture (`shufflePile`) et permet de prendre une carte (`moveCard`) |
| `shufflePile {pile}` | J | remélange |
| `nextPhase` | J | enchaîne les phases (§6) |
| `setPhase {phase}` | J | saut direct à une phase, sans automatisation |
| `takeTurn {seat?}` / `endTurn {seat?}` | J | tour en cours (`turn.seat`) / a joué (`turn.done`) ; indications, jamais des verrous |
| `advanceAgenda` / `advanceAct` | J | la carte courante part de côté (hors jeu), la suivante de `agendaDeck`/`actDeck` entre dans l'histoire ; agenda : retire tout le doom en jeu. Même effet quand la carte courante est mise de côté, en victoire ou en pile (`sortieHistoire`) ; posée sur le tapis, elle reste courante. **Verso-lieu** (carte liée dont le dos est un lieu, ex. acte 3 de The Witching Hour) : au lieu de partir de côté, la carte devient un lieu (`kind`), face visible côté `b`, posée sur le tapis à `backPlacement` (défaut : centre) avec les indices de son verso (`backClue` × enquêteurs) |
| `spendClues {n, from: {seat,n}[]}` | J | prélève sur les sièges ; le client demande la répartition si nécessaire |
| `chaosDraw` / `chaosReturn` | J | tirage (le jeton sort du sac vers `drawn`, cumulable) / tout remettre — bénédictions et malédictions retournent à la réserve, pas au sac (TIC) ; `onChaosDraw` (v1.1) pourra sceller |
| `chaosAdjust {token, delta}` | J | panneau du sac ; bénédictions et malédictions plafonnées à 10 chacune (sac + scellées) ; le jeton scellable déclaré par `seal` (sang COB) plafonné à `maxTotal` (sac + scellés) |
| `chaosSeal {seat}` / `chaosRelease {seat}` | J | scénarios déclarant `seal` (COB) : scelle un jeton sur un enquêteur — pris des tirés d'abord, sinon du sac, compteur de siège `seal.counter` +1 borné à `maxPerSeat` — / le libère vers le sac ; menu du sac et chip du compteur (+ scelle, − libère) |
| `chaosSealCard {id, token}` / `chaosReleaseCard {id, token}` | J | scénarios déclarant `cardSeal` (COB III, codex) : scelle un jeton du chaos SUR une carte — pris des tirés d'abord, sinon du sac — / le rend au sac (libération toujours disponible) ; pastilles sur la carte, menus « Sceller le jeton tiré… » / « Libérer… » ; les jetons scellés sont rendus au sac automatiquement quand la carte part en pile (`toPile`) ou en zone de victoire |
| `bury` / `buryAt {id}` | J | scénarios déclarant `bury` (COB) : les `withAny` en jeu ou de côté + les `fromDeckTop` premières cartes de la pioche, mélangées et réparties face cachée sous les lieux du `trait` (« Lair »), aussi également que possible / cette carte (posée sur un lieu du trait) + 1 carte de la pioche sous ce lieu ; jetons et épuisement effacés, z sous celui du lieu (rendu glissé‑dessous), journal muet sur la répartition |
| `setFlood {id, level}` / `floodAll {mode}` / `floodRule {onReveal}` | J | inondation d'un lieu (0‑2) / de tous les lieux révélés (increase, full, decrease, clear) / règle appliquée à chaque révélation (`state.flood`) — scénarios déclarant `flood` (TIC) |
| `randomKey {id}` | J | une clé de côté face cachée, tirée au hasard, posée sur cette carte du tapis sans être regardée |
| `setBarrier {a, b, delta}` | J | In Too Deep : barrières entre deux lieux du tapis (chip sur l'arête, menu du lieu) |
| `leadsReveal {n}` / `leadsTake {id}` / `leadsReturn` / `leadsToggle {code}` / `accusation {suspect, hideout}` | J | The Vanishing of Elina Harper : Parley (révéler 1‑3 pistes pour tous, en prendre une, remise), pistes rayées à la main, accusation complète (interlude du guide) |
| `formPile {pile}` / `placeAround {id, pile}` | J | forme une pile déclarée `gather` avec les lieux de côté au dos voulu, mélangés / pose ses premières cartes non révélées en dessous, à gauche, à droite d'un lieu (emplacements libres) |
| `scenarioAction {id, args}` | J | bouton déclaré par le scénario (branches, transitions) |
| `ping` | tous | maintien (hibernation compatible : pas nécessaire côté DO, réservé au client) |

Toute action refusée renvoie `{ t:"nack", reason }` au seul émetteur.

### 4.3 Diffusion DO → clients

- `{ t:"delta", rev, patch }` : liste d'opérations JSON Patch (RFC 6902)
  minimales ; le client applique et vérifie `rev = rev+1`, sinon
  demande `{ t:"resync" }` → `welcome`.
- `{ t:"seats", seats, hostSeat, hostConnected, spectators }` :
  occupation, noms, investigateurs, siège de l'hôte, nombre de
  spectateurs (fréquent, hors `rev`).
- `{ t:"you", seat, isHost }` : rôle de la connexion après `takeSeat`,
  `leaveSeat`, `kick`, `claimHost`.
- `{ t:"hostToken", token }` : au nouvel hôte seulement.
- `{ t:"reminder", entry }` : rappel à afficher en encart (déjà dans
  `log` du patch ; message séparé pour la mise en avant).
- `{ t:"question", question }` : à l'hôte seulement.
- `{ t:"peek", pile, cards: {id, code}[] }` : au demandeur seulement (recherche, consultation de la défausse).

### 4.4 Budget messages (plan gratuit)

Objectif : **< 300 messages entrants par manche à 4 joueurs**.
Mesures : déplacement au drop ; un bouton = une action ; `nextPhase`
regroupe toutes les automatisations d'une phase en un message ; pas de
ping applicatif (l'hibernation gère le keep‑alive) ; l'état complet
seulement au `welcome`. Écritures : 1 snapshot par action (≈ 1 ligne),
donc < 100 000/jour tant qu'il y a moins de ~300 manches jouées par jour
sur tout le site.

## 5. Contrat de scénario (données)

Un scénario = `scenarios/<id>.json` (déclaratif, produit au build depuis
le dump arkham.build — source unique des métadonnées depuis le
2026-09-08, images `cdn.arkham.build` comme avant — +
`scenarios_data.json`) + `scenarios/<id>.hooks.js` optionnel.
**Aucun texte de carte** ; les rappels paraphrasent le guide.

```ts
type ScenarioDef = {
  id, title, campaign, order, status: "available"|"wip"|"planned";
  cards: { code, kind, qty, storyBack?, aside?, faceUp? }[];   // tout ce qui existe
  encounterSets: string[];                                     // pour affichage
  layout: { code|slot: string, x, y }[];                       // diagramme (topologie)
  agendaDeck: string[]; actDeck: string[];                     // ordre
  chaosBag: Record<Difficulty, Token[]>;
  clueValues: Record<code, { value, perInvestigator }>;        // index ArkhamDB
  scenarioCardSide?: Record<Difficulty, "a"|"b">;              // face de la carte scénario par difficulté (défaut "b")
  seal?: { token, label, counter, maxPerSeat, maxTotal? };     // scellage sur les enquêteurs (COB : sang)
  bury?: { withAny, fromDeckTop, trait, dy?, menuPile, menuCard };  // enfouissement en cours de partie (COB)
  seatCounters?: { key, label, icon, initial }[];              // rendus en chips (tapis + board joueur) depuis COB
  tableCounters?: { key, label, icon, initial }[];
  questions?: Question[];                                      // bloquantes, avant setup
  setup: SetupStep[];                                          // exécutées dans l'order
  reminders: { when: "setup"|"mythos"|"investigation"|"enemy"|"upkeep"|"round:<n>"; text }[];
  actions?: { id, label, confirm? }[];                         // boutons scénario
};
type SetupStep =
  | { op:"place", code, zone, x, y, reveal?, faceUp?, log? }    // reveal : face visible + indices
  | { op:"minis", code, log? }                                  // pions des enquêteurs sur le lieu
  | { op:"aside", codes, faceUp?, log? }                        // cartes de côté, en rangée
  | { op:"story", log? }                                        // carte de scénario (côté b), agenda 1, acte 1, suites en piles
  | { op:"buildEncounter", log? }                               // ennemis + traîtrises restants → pioche mélangée
  | { op:"pickRandom", from: string[], n, then: SetupStep[] }   // (v1.1) lieux au hasard, paires
  | { op:"branch", on: questionId, cases: Record<optionId, SetupStep[]> }   // (v1.1)
  | { op:"hook", name };                                        // délègue à hooks.js (v1.1)
```

Implémentées : `place`, `minis`, `aside`, `story`, `buildEncounter`
(The Gathering) ; `pickRandom {from, n, slot, zone, x, y}` (les non
choisis sont retirés), `branch {on: questionId | "players", cases}`,
`remove {codes}`, `toPile {set | codes, pile, shuffle}`, `spawn {code,
at}`, `setStart {code}`, `log {text}` (The Midnight Masks) ;
`pickRandom {positions}`, `pickRandomSet {from: sets, n}` (sans révéler
le set retenu), `addDoom {n}`, `chaosAdd {tokens}`, `reminder {text}`
(The Devourer Below) ; `dealToSeats {from, n, rows, start}` (n cartes
tirées au hasard, distribuées une à une dans l'ordre des joueurs —
principal d'abord —, une rangée du tapis par enquêteur servi, le reste
retiré ; `start` : chacun commence sur l'une de ses cartes, tirée au
hasard, révélée, pion posé), `aside {sets}` (sets entiers de côté), le
tout pour The Witching Hour. Une
référence `slot:<nom>` désigne la carte choisie par `pickRandom` ou
`setStart` (`slot:start`). `extraCards` ajoute des codes hors sets ;
`packs` (liste) remplace `pack` quand les sets viennent de plusieurs
packs ArkhamDB ; `piles` déclare des piles supplémentaires ;
`backPlacement {code: {x, y}}` dit où entre en jeu le verso-lieu d'un
acte ou d'un agenda (voir `advanceAct`). Une carte liée dont le verso
est un lieu reçoit `backClue` au build. `addClues {code, n}` (indices
fixes sur un lieu, révélé ou non) et `removeClues {from, n | nFrom}`
(retrait aussi égal que possible, `nFrom` = réponse numérique) servent
aux traces du journal (At Death's Doorstep). `swaps [{pair, labels}]`
déclare les lieux qui se remplacent (normal ↔ Spectral, voir
`swapLocation`). `storyBack` (codes) marque les cartes dont le dos est
une carte histoire. `layeredPile {pile, pool, layers: [{n, with}]}`
construit une pile par couches, du dessus vers le dessous, chaque
couche prenant ses cartes imposées plus `n` au hasard, mélangée (le
« Unknown Places Deck » de The Secret Name). Le build exporte
`backName` (nom du verso : « Decrepit Door », « Unknown Places », titre
du verso d'un agenda) ; serveur et client nomment toujours **la face
visible** (`nomVisible` / `faceVisible`), si bien qu'un lieu non révélé
garde son secret dans le journal, les infobulles et les menus. Le build
exporte aussi `traits` ; `buildEncounter {split: [{trait, pile}]}`
envoie les cartes portant un trait dans une seconde pioche (The Wages
of Sin : pioche spectrale). `piles` déclare alors la pioche avec sa
défausse (`{id, label, discard, trait}` et `{id, label, isDiscard}`) ;
le client choisit pioche et défausse d'après les traits de la carte
dans les menus « Défausser » / « Sur… » / « Mélanger dans… » ; le
glisser-déposer reste libre. `pickRandom {reveal}` pose un lieu tiré au
hasard révélé (indices posés). Un lieu dont le verso est un lieu lié
(deux faces révélées, ex. face Spectral) se bascule par `toggleSide`
(menu « Autre face »), sans révélation ni nouveaux indices ;
« Retourner » n'est pas proposé pour ces cartes ; même chose pour un
ennemi dont le verso lié est un autre ennemi (Nathan Wick), les menus
utilisant les sous-titres (`subname`, `backSubname` exportés au build).
`keys {tokens}` crée des **clés** (kind `key`, code `key:<jeton>`) :
jetons du chaos pris dans la collection, rendus comme de petits pions,
déplaçables sur le tapis (ils suivent un lieu déplacé), sur un siège
(l'enquêteur les contrôle) ou de côté ; jamais dans une pile, jamais
retournés (For the Greater Good). Dans `story`, un agenda ou un acte
retiré plus tôt par la mise en place est ignoré (actes 1 alternatifs
selon le journal). `when {cond, then, else}` évalue une condition
composée sur les réponses (`{q, is}`, `all`, `any`, `atLeast n of`,
`not`) — versions des actes 3 et 4 d'Union and Disillusion.
`pickRandom {rest: "aside"}` met de côté les cartes non tirées au lieu
de les retirer, et `slot:<nom>:<i>` désigne la i-ème carte tirée ;
`addTokens {at, token, n}` pose des jetons de carte au setup (braseros
allumés = ressource) ; `addDoom {nFrom}` lit une réponse numérique. Un
dos histoire face cachée se révèle par `flipCard {reveal: true}` (menu
« Révéler (quand une carte l'indique) »), jamais par simple
retournement. `pickRandom {rest: "pile", restPile}` envoie les cartes
non tirées dans une pile (les huit versions non utilisées d'In the
Clutches of Chaos, pile « Lieux au hasard ») ; `randomTokens {token,
picks, rounds}` pose des jetons sur des lieux du tapis tirés au hasard
selon le nombre de joueurs (brèches initiales) ; `mythosDoom: false`
supprime le doom automatique de la phase du mythe. Before the Black
Throne : `pickRandom` accepte `slot:<nom>` dans `from` (code tiré plus
tôt sans zone), `toPile {shuffle}` mélange toute la pile, `emptySpace
{positions}` et l'action `emptySpace {x, y}` posent des **espaces vides**
(kind `proxy`, code `empty:space`, dos de carte joueur, menu « Espace
vide au-dessus/au-dessous/à gauche/à droite » d'un lieu si
`emptySpace: true`), `addTokens {nFrom}` lit une réponse numérique,
`chaosAdd {byDifficulty}` ajoute des jetons selon la difficulté (jeton
−7 ajouté aux jetons connus), `searchEncounter {n}` ne montre que les n
premières cartes (menu « Regarder les n premières » ; le journal en
garde la trace et le serveur diffuse ce delta même pour un aperçu). Le build synthétise le recto d'une carte dont
ArkhamDB ne connaît que le verso (`<code>b` avec `linked_card`, ex.
Josef Meiger 05085).

**The Innsmouth Conspiracy (The Pit of Despair, 2026-09-09).** `keys
{colors, faceUp}` crée des **clés de couleur** à deux faces (code
`key:<couleur>`, red / blue / green / yellow / purple / black / white,
images `public/img/keys/*.svg`, dos commun `back.svg`) : face cachée,
leur ordre est mélangé et leur nom masqué (« clé face cachée ») ; elles
se retournent (`flipCard`), et une clé lâchée sur un siège est retournée
d'elle-même (l'enquêteur en prend le contrôle). `randomKey {at}` (op de
setup) et l'action `randomKey {id}` posent sur une carte du tapis une
clé de côté face cachée tirée au hasard, sans la regarder (journal
muet). **Inondation** : jeton `tokens.flood` (1 partiellement, 2
totalement inondé) sur les lieux, rendu en haut à gauche (jeton à deux
faces `flood_partial.svg` / `flood_full.svg`) ; actions `setFlood {id,
level}`, `floodAll {mode: increase|full|decrease|clear}` (lieux révélés
du tapis) et `floodRule {onReveal: 0|1|2}` (`state.flood.onReveal`, ce
que subit chaque lieu à sa révélation, appliqué par `revealLocation`),
refusées si le scénario ne déclare pas `flood`. `flood.byAgenda[stage]
= {all, onReveal}` : quand cet agenda devient courant, `avancer` inonde
les lieux révélés et fixe la règle (rappel dans le journal) ; panneau
« Marée » dans la colonne Agenda et acte (règle et gestes de masse).
`pickRandom` accepte des codes en plusieurs exemplaires dans `from`
(les copies restantes d'un code tiré suivent le sort `rest`, via
`pool.giveBack`). Piles déclarées : `gather {backName}` = pile formée
en cours de partie par l'action `formPile {pile}` avec les lieux de
côté dont le côté non révélé porte ce nom, mélangés (« Tidal Tunnel »,
bouton « former » sur la pile vide) ; `around: true` = action
`placeAround {id, pile}` qui pose ses premières cartes non révélées en
dessous, à gauche et à droite d'un lieu du tapis, aux emplacements
libres de la grille 186 × 238 (menu « <pile> autour de ce lieu ») ;
`menuFor: [kinds]` = le menu de ces cartes propose « Placer dans
<label> » (pile « Profondeurs » de The Amalgam). Sac : `chaosReturn`
rend bénédictions et malédictions à la réserve au lieu du sac, et
`chaosAdjust` en plafonne chacune à 10 (sac + scellées).

**The Vanishing of Elina Harper (2026-09-09).** `chaosRemove {tokens}`
retire un exemplaire de chaque jeton listé (retraits « pour le reste
de la campagne » du scénario I, demandés au lobby par des oui/non
jeton par jeton). `leadsDeck {suspects, hideouts, secret, pile}` tire
au hasard un suspect et une cachette vers la pile `secret` (face
cachée, ordre mélangé, journal muet) et mélange les dix autres dans la
pile `pile` (Leads deck). La définition `leads` (piles `pile` /
`secret` / `shown`, `reference`, `suspects`, `hideouts`, `spots`,
`elina`, `square`, `act2`, `agenda3`) active : la pile secrète
(aucune pioche, consultation ni mélange : `pileSecrete`), le
**Parley** — `leadsReveal {n}` (1 à 3 premières cartes de Leads vers
`shown`, face visible pour tous, pistes rayées), `leadsTake {id}`
(un lieu sur le premier emplacement de cachette libre, révélé avec ses
indices ; le reste dans la zone de menace du demandeur ; les pistes
non prises et la première carte de la pioche de rencontre remélangées
dans Leads), `leadsReturn` (remise sans prise) — les **pistes rayées**
(`state.leads.eliminated` : cartes vues dans Leads par Parley,
« regarder les premières » ou pioche, ou rayées à la main par
`leadsToggle {code}`) et l'**accusation** `accusation {suspect,
hideout}` : révélation des deux cartes cachées, verdict (0 bonne
réponse → rappel de démission ; 1 → la carte de référence passe côté
verso — ennemi lié — et va sur le tapis à `square` ; 2 → rien), cachette
en jeu sur un emplacement libre avec ses indices + 1 par enquêteur,
`elina` posée dessus, le suspect posé dessus, `act2` et `agenda3`
depuis la zone de côté (acte et agenda courants de côté, agendas
restants retirés, doom retiré), piles Leads et pistes révélées
retirées ; `state.leads.accused` / `truth`. `agendaEffects[stage] =
{shuffleAside, withDiscard, log}` : quand cet agenda devient courant,
les cartes de côté portant ces codes (et la défausse) sont mélangées
dans la pioche de rencontre (verso de l'agenda 1). Les cartes de kind
`story` posées dans la zone `story` (carte de référence) sont rendues
dans la colonne Agenda et acte, sous la carte de scénario, avec le
panneau « Pistes » (douze noms, rayés, bouton « Faire l'accusation »
→ dialogue suspect + cachette, rayés et cartes en jeu grisés).

**In Too Deep (2026-09-09).** Questions au lobby de type **`multi`**
(cases à cocher : réponse = liste d'options, éventuellement vide ;
cond `{ q, has: id }`) pour les suspects « out for blood » et les
jetons retirés du sac. **Barrières** : `state.barriers = [{a, b, n}]`
entre deux lieux du tapis, op de setup `barriers {pairs}` (les 24 du
diagramme), action `setBarrier {a, b, delta}` (0 = l'entrée
disparaît), rendues comme une chip « jeton ressource + nombre » au
milieu de l'arête (clic = −1, « + » au survol ; exclues du pan du
plateau), menu d'un lieu « +1 barrière vers <voisin orthogonal> »
(définition `barriers: true`). `placeKey {color, at | atRandom}` pose
une clé de couleur sur une carte en jeu (clé noire sur la cachette
entourée, au hasard en mode autonome) ; `aside {side: "b"}` met une
carte de côté sur son verso lié (Angry Mob) ; `addTokens` accepte le
jeton `flood`. `agendaEffects[stage]` s'enrichit de `flood {trait?,
mode, scope}` (lieux du trait, tous ou révélés), `spawnAside {code,
at, side?}` et `randomKeyOn` (clé cachée au hasard posée dessus),
appliqués dans l'ordre inondation, mélange, apparition, clé.

**Devil Reef (2026-09-10).** `placeAround {id, pile, dir?}` : `dir`
(`below` / `left` / `right`) pose une seule carte à cet emplacement
(refus s'il est occupé) ; menu du lieu : ligne « <pile> (n) ↓ ← → ⟳ »
par pile `around`. `flood.onRevealByCode[code] = 1|2` : inondation
imprimée d'un lieu appliquée à sa révélation (journal « (texte du
lieu) »). Verso-ennemi : à l'avancement, un agenda/acte dont le verso
lié est un ennemi devient `enemy`, côté b, posé au centre (ou
`backPlacement`) avec le décalage d'un spawn. Véhicule : un soutien à
trait `Vehicle` déplacé emmène ses pions et clés (`moveCard`) ; l'op
`minis` accepte un véhicule.

**Horror in High Gear (2026-09-10).** Op `fromPile {pile, n, zone,
positions, faceUp?, reveal?, slot?}` (premières cartes d'une pile en
jeu) ; `pickRandom rest:"keep"` (restes laissés au pool) ; définition
`road {pile, longWay}` et action `roadAhead {id, n}` (Road deck + Long
Way Around mélangés dans une colonne devant le lieu) ; « Autre face »
(`toggleSide`) offert aux soutiens à verso lié de même kind (voitures
Running / Stopped).

**A Light in the Fog (2026-09-10).** Effets d'étape partagés
(`StageEffects`) par `agendaEffects` et `actEffects`, idempotents,
avec `revealCodes`, `placeBelow`, `fillRows`, `removeTrait` en plus ;
`spawnAside` accepte une carte déjà en jeu. `toggleSide` change la
nature d'une carte histoire à verso-lieu (Captured! → Holding Cells).

**The Lair of Dagon (2026-09-10).** Effets d'étape : clés
`after:<code>` (à la sortie d'une carte précise), application dans
l'ordre d'écriture des champs, `removeLocations {trait?, except?}`,
`spreadPile`, `placeAt`, `chaosAdd`, `chaosRemove`.

**Into the Maelstrom (2026-09-10).** `keys fillAsideTo` (clés tirées
au hasard pour compléter les clés cachées de côté) ; effets d'étape
`byPlayers` (variante par nombre de joueurs) et `spreadPile.flood`.

**Spreading Flames (2026-09-10).** Effets d'étape `discardEnemies`
(ennemis de rencontre en jeu → défausse), `discardAside {code, n?}`
(copies de côté → défausse), `setAside` (retour de côté soigné, d'où
que ce soit), `discardAt` (attaches d'un lieu → défausse), `addClues
{code, n, perInvestigator?}` ; `spawnAside` en liste, copie de côté
d'abord ; `removeLocations {codes}`. Une attache = carte posée sur le
lieu.

**Smoke and Mirrors (2026-09-10).** `pickRandom zone:"aside"` (tirage
mis de côté sans être regardé, en fin de rangée) ; `bury fromPool`
(copies prises au pool avant `buildEncounter`) et `bury under` (lieux
cibles par code ou slot) ; pile déclarée `menuFor` réutilisée pour
« Sous l'acte ».

**River of Blood (2026-09-08).** `branch` accepte `on: "difficulty"`
(cas `easy` / `standard` / `hard` / `expert`) — la ville de COB se joue
côté Aube ou Crépuscule selon la difficulté, avec la Julia et les sets
assortis. `scenarioCardSide` choisit la face de la carte de scénario
par difficulté (référence Easy/Standard au recto). Op de setup `bury
{fromDeckTop, with, trait, dy?, log?}` : après `buildEncounter`, les
instances des codes `with` mises de côté + les `fromDeckTop` premières
cartes de la pioche, mélangées et réparties face cachée sous les lieux
en jeu portant `trait` — même moteur (`enfouir()`) que les actions
`bury` / `buryAt` du tableau §4.2. `seal` déclare le jeton scellable
(sang) : compteur de siège dédié (chips `seatCounters` rendues depuis
cette livraison, tapis et board joueur), bornes `maxPerSeat` (3) et
`maxTotal` (12, appliquée aussi par `chaosAdjust`). Nouveau jeton du
chaos `blood` (SVG généré par la recette ArkhamCards) ; il reste dans
le sac de scénario en scénario (« Tout remettre » le rend au sac,
contrairement aux bénédictions/malédictions).

**New Horizons (2026-09-08).** `chaosAdd {token, nFrom, plus?}` ajoute
n exemplaires d'un jeton, n = réponse numérique du lobby (+ `plus`
fixes) — report des sangs de la campagne, +1 de l'ouverture du II.
`chaosSet {byDifficulty}` remplace tout le sac (mode autonome, encart
p. 15). Les questions numériques (`type: "number"`, min/max/default)
étaient déjà rendues au lobby. Un `aside` avec `faceUp: false` sur des
lieux double face affiche leur dos non révélé : identités masquées
(trois « Side Chamber » indistinguables). Les agendas de la version
non jouée sont retirés avant `story`, qui ignore les retraits.

**Blood Money (2026-09-08).** `remove` accepte `n` (un seul code) pour un
retrait partiel — n exemplaires seulement (2 des 6 Suspicious Guests) ;
sans `n`, il retire toutes les copies restantes. `cardSeal: true` active
le scellage de jetons du chaos sur les cartes (codex des invités) :
pastilles en haut à droite, menus Sceller/Libérer, libération automatique
à la défausse et en zone de victoire. La pile déclarée `saved` (« Invités
sauvés », `menuFor: ["enemy"]`) matérialise les Civilians placés sous la
carte de scénario de référence. Deux vérifications du journal en
questions de lobby (Julia tuée ?, Zburamoarte vaincu ?) choisissent les
versions d'ennemis et l'agenda 2. Correction du même jour : les sacs de
base p. 5 contiennent une tablette (pas de cultiste) — les cultistes
arrivent aux ouvertures des II et III ; icônes tranchées à 600 dpi.

Questions du lobby : à choix (`options`) ou **numériques** (`type:
"number"`, `min`, `max`, `default`) ; la réponse voyage en chaîne dans
`startSetup {answers}` et est validée par `reponseValide`. Rappels
`when` : `setup`, phases, `round:<n>`, et **`act:<n>` / `agenda:<n>`**
(déclenchés quand cet acte ou agenda devient courant). Tout ce qui n'est ni posé ni
mélangé va dans `removed`. Après la mise en place, `round = 1` et `phase =
"investigation"` (la phase du mythe est sautée à la première manche).
La source déclarative est `data/scenarios/<id>.src.json` ; le build y
ajoute `cards[]` et `encounterSetNames` depuis ArkhamDB.

Hooks JS (signature `(state, api, args) => void`) : `onSetup`,
`onChaosDraw(token)`, `onPhase(phase)`, `onAction(id)`,
`onRevealLocation(card)`. `api` expose uniquement des mutations
validées (`place`, `toPile`, `shuffle`, `addToken`, `remind`, `ask`).

Motifs de `scenarios_data.json` couverts par les ops : lieux au hasard
(`pickRandom`), paires 1 sur 2 (`pickRandom n=1` + `removeRest`),
double face (`side`), branches journal (`questions` + `branch`), cartes
de côté (`aside`), dos histoire (`storyBack`), ordre imposé (hook).
Deux pioches et Reel deck : hors v1 (Wages of Sin et Film Fatale
passent en `wip`).

## 6. Automatisations par phase (`nextPhase`)

| Passage vers | Automatique | Rappel |
|---|---|---|
| `mythos` | `round++` ; +1 doom sur l'agenda ; calcul du doom total (agenda + cartes en jeu) et alerte si ≥ seuil de l'agenda | « Chaque enquêteur tire une carte rencontre » (bouton dans chaque zone de menace) ; rappels `round:n` |
| `investigation` | — | ordre libre : bouton « Prendre mon tour » sur chaque siège (`turn.seat`), « Fin de mon tour » (`turn.done`) ; `nextPhase` proposé quand tous ont joué |
| `enemy` | — | « Ennemis chasseurs se déplacent, puis attaquent » |
| `upkeep` | `actions = 3` sur tous les sièges ; redressement de toutes les cartes | « Défausse jusqu'à 8, pioche 1, +1 ressource » (hors app) |

Le seuil de doom et d'indices est lu dans l'index ArkhamDB au build ;
l'avancement reste au clic.

## 7. Bibliothèque et accueil

- `/` : présentation, champ « rejoindre par code », bouton vers la
  bibliothèque.
- `/scenarios` : campagnes dans l'ordre de sortie, scénarios dans
  l'ordre, badge `available / wip / planned`, bouton « Créer une room »
  sur les `available`.
- `/r/<code>` : page room (lobby puis tapis). Pas de liste publique.

## 8. Contraintes transverses

- **Rien n'est jamais bloqué** : les automatisations agissent, les
  joueurs peuvent tout modifier à la main à tout moment. Un refus
  (`nack`) n'a que trois motifs : rôle (action d'hôte), intégrité
  (siège pris, carte ou pile inconnue) et, depuis le board joueur, siège
  (une action `p:*` venue d'une autre connexion que celles du siège,
  §10.2). Aucune action n'est refusée au
  motif de la phase ou du tour ; les indications « tour en cours »,
  « a joué », « seuil atteint » sont visuelles.

- Français partout, typographie française (espaces insécables).
- Images `cdn.arkham.build` sondées avec `new Image()` ; bandeau si
  le CDN est injoignable.
- Loupe : face visible seulement ; `storyBack` jamais agrandi ni
  retourné par un joueur.
- Ordinateur + tablette (pointeur + tactile) ; largeur mini 1024 px.
- Aucune donnée personnelle stockée (noms de siège en mémoire du DO
  seulement, purgés avec la room).

## 9. Points restant ouverts (hors modèle, à traiter avant le code)

1. **Dos histoire** : `scenarios_data.json` ne les marque pas
   uniformément (WOS hérétiques, FGG `FGG_STORY`, TDE Nasht/Kaman‑Thah,
   ADD/UAD Josef) → recensement manuel → champ `storyBack`.
2. **Sac par difficulté** : TCU saisi (p. 4 du guide, 13 jetons en
   standard ; les jetons ajoutés au fil de la campagne restent à
   reporter par les joueurs — question au lobby ou panneau du sac) ;
   reste TDC, TDE‑A et Film Fatale.
3. **Compteurs spécifiques** : recensement dans les 10 scénarios (ex.
   clés FGG = proxys, pas compteurs).
4. **Texte des rappels** : granularité retenue = 1 rappel par étape de
   setup manuelle + 1 par phase + rappels ponctuels `round:n`.
5. ~~Geste ennemis et tailles/disposition~~ : double-clic ; disposition
   validée sur captures le 2026-09-03 (mémo §1 « Choix de la première
   table »).
6. ~~Ordre des sièges~~ : libre, avec « prendre mon tour » (mémo §1).

---

## 10. Board joueur (v1.1) — décisions du 2026-09-07

Chaque siège peut jouer **son propre deck** sur une **page joueur**
dédiée, `/r/<code>/j/<n>`, ouverte dans un second onglet ou sur un
second appareil. Elle appartient à la **même table** (même code, même
`RoomState`, même Durable Object) : la synchronisation avec le tapis et
l'observation par les autres sont gratuites, aucun protocole entre deux
rooms. Un seul joueur à la fois est visé par le chantier (« 1 joueur pour
l'instant ») mais le modèle est par siège dès le départ.

Règles vérifiées dans l'Arkham Grimoire v1.1 (juillet 2026) : mise en
place p. 31 (5 ressources, main de 5, un mulligan, faiblesses de la main
de départ mises de côté sans être résolues puis remélangées), mulligan
p. 17, entretien p. 29 (redresser, piocher 1, +1 ressource, main
maximale 8 vérifiée seulement à ce moment), pioche vide p. 10
(remélanger la défausse, piocher, 1 horreur), Uses (X) p. 24,
permanents p. 18, limbes p. 15, slots p. 21.

### 10.1 Décisions du questionnaire (salves A à G)

| # | Question | Décision |
|---|---|---|
| A1 | Où vit le board | Même table, page dédiée (second onglet / écran) |
| A2 | Main cachée ? | Masquée **à l'affichage** chez les autres (dos + nombre, bouton « Regarder ») ; l'état reste partagé |
| A3 | Un siège sur deux appareils | Oui, avec un **code de siège** à 4 chiffres affiché sur le tapis |
| B1 | Sources de deck | Lien ArkhamDB (deck partageable ou decklist) et lien arkham.build (share ou deck synchronisé). Pas de texte collé, pas de saisie carte par carte |
| B2 | Quand importer | **Au lobby seulement** ; le lien remplace le choix d'enquêteur (déduit, recto parallèle compris) |
| B3 | Faiblesse aléatoire | Celle du deck si elle y figure ; pour un placeholder 01000 : tirage au hasard ou choix dans une liste |
| C1 | Au « Lancer » | Rien ne part tout seul côté joueur : bouton **« Mise en place »** sur la page joueur, puis attente du mulligan ; tout reste manualisable |
| C2 | Mulligan | Sélection des cartes à rendre, bouton « Mulligan » : remplacement puis remélange, **une seule fois** (grisé ensuite) |
| C3 | Zones | pioche (= « réserve »), main, **en jeu** (board des soutiens), **Play** (une carte : l'événement joué), **Commit** (cartes engagées au test), défausse, **hors jeu = mises de côté** (cartes liées…), zone de menace *(révisé le 2026-09-08 : Play et Commit remplacent la zone « en cours »)* |
| D1 | Auto-pay | *Révisé le 2026-09-09* : glisser une carte de la main vers en jeu, Play ou Commit la **pose sans payer** (`p:put`, Uses posés pour un soutien en jeu) ; l'auto-pay se fait par le bouton **Auto-pay** (visuel fourni : pile de jetons et flèche, sur pastille dorée) qui apparaît au survol d'une carte en main : coût déduit (X demandé, les skills n'ont pas de coût), **refusé faute de ressources** (jamais négatif), carte rangée selon son type (soutien → en jeu, événement → Play, skill → Commit) |
| D2 | Événements et skills | Un **événement** joué (payé) occupe la case **Play** (une carte) jusqu'à « Résolu » → défausse (jouer un second événement défausse le premier) ; un **skill** s'engage dans **Commit**, bouton « Test résolu » → défausse *(révisé le 2026-09-08)* |
| D3 | Assets en jeu | Rangement libre ; **icônes de slot et compteur d'occupation dans la barre** (les badges sur les cartes ont été retirés le 2026-09-08) ; jetons Uses et jauges des alliés posés automatiquement |
| E1 | Entretien | **Automatique** au passage en entretien sur la table : pioche 1, +1 ressource, redressement ; rappel si main > 8 |
| E2 | Pioche vide | Remélange automatique de la défausse ; l'horreur est **rappelée**, le joueur l'ajoute |
| E3 | Boutons | Piocher 1 / N, mélanger, sur / sous la pioche, chercher, regarder les n premières, défausser au hasard, révéler une carte à tous, défausse consultable (reprendre, sur la pioche, mélanger dans la pioche) ; **clic sur la pioche = piocher en main** |
| F1 | Sur le tapis | Bouton « Voir le board » sur le siège (un seul onglet par board) + compteur de ressources + **case Play** (l'événement joué) à côté de la zone de menace du siège ; **Commit volant** au-dessus des pioches de rencontre dès qu'un siège a engagé des cartes, avec le **total des icônes de compétence** (*révisé le 2026-09-09*) |
| F2 | Faiblesse piochée | Reste dans la main, le joueur fait tout (glisser vers la menace, la défausse…) |
| F3 | La page joueur reprend | Sac du chaos, barre de phase / « Phase suivante » / tour / actions, « Poser sur mon lieu », zone de menace. Pas le journal |
| G1 | Téléphone | Non : PC et tablette seulement |
| G2 | Board d'un autre | **Lecture seule**, main masquée ; seul le siège agit sur son board |
| G3 | Livraison | Trois étapes : page et import ; mise en place et mulligan ; jeu |

### 10.2 Sièges : code de siège et connexions multiples

- `Seat.pin` : code à 4 chiffres généré à la prise du siège, affiché sur
  le siège du tapis (petit, sous le nom) et dans la page joueur. Le
  cahier ne le cache à personne à la table (décision A3) ; le restreindre
  au seul siège est une variante possible (§10.10).
- `takeSeat {seat, name?, pin?}` (et `?seat=<n>&pin=<code>` à la
  connexion) : siège libre → prise, nouveau `pin` ; siège occupé →
  refusé (`seatTaken` / nack) sauf `pin` exact → **connexion
  supplémentaire** sur le même siège, le nom en place est conservé.
  `occupied` = au moins une connexion ; le siège n'est libéré (et son
  code effacé) qu'à la fermeture de la dernière. `Seat.connections`
  (hors `rev`, comme `occupied`) voyage dans `seats` pour l'indicateur
  « n appareils ».
- Reprise automatique : `ahwa:siege:<code>` mémorise siège **et** pin ;
  un second onglet du même navigateur reprend sans saisie, une
  reconnexion n'attend plus la fermeture de l'ancienne connexion
  (l'attente de 15 s disparaît).
- Nouveau motif de refus **`siege`** : les actions `p:*` (§10.6) ne sont
  acceptées que des connexions du siège visé (décision G2). C'est la
  seule exception à « tout est ouvert à tous les joueurs » (§8) ; les
  cartes joueur posées dans une zone partagée (tapis, menace) restent
  manipulables par tous via `moveCard` et consorts.

### 10.3 Import du deck (lobby)

`importDeck {url}` (joueur, lobby, son siège). Le DO fait la requête
(user-agent de navigateur, délai 10 s) et lit un objet deck ArkhamDB ou
arkham.build — mêmes champs, vérifiés le 2026-09-07 sur le deck 6295400.

Liens reconnus (tester `decklist/view` **avant** `deck/view`) :

| Lien | Source lue |
|---|---|
| `arkhamdb.com/decklist/view/<id>[/slug]` | `arkhamdb.com/api/public/decklist/<id>.json` |
| `arkhamdb.com/deck/view/<id>` | `arkhamdb.com/api/public/deck/<id>.json` (302 sans CORS si le deck n'est pas partageable → message « rends ton deck partageable ou utilise arkham.build ») |
| `arkham.build/deck/view/<id numérique>` | deck synchronisé : `api.arkham.build/v1/public/share/<id>`, repli ArkhamDB `deck/<id>` |
| `arkham.build/share/<id>` | `api.arkham.build/v1/public/share/<id>` |
| `arkham.build/deck/view/<id non numérique>` | deck local au navigateur : refus « partage-le d'abord (bouton Share) » |

Lecture du deck :

- `investigator_code`, puis `meta.alternate_front` s'il est renseigné :
  c'est le **recto effectif** (enquêteur parallèle, présent dans l'index
  des investigateurs avec `parallel: true`). `alternate_back` ne concerne
  que la construction du deck : ignoré.
- `slots` + `ignoreDeckLimitSlots` = les cartes du deck ; `sideSlots`
  ignorés ; `xp`, `name` affichés ; `taboo_id` = badge informatif (les
  images montrent le texte imprimé) ; `meta.cus_<code>` = customisations,
  conservées pour l'affichage, sans effet.
- **Placeholder 01000** : chaque exemplaire est une faiblesse « à
  déterminer » ; le lobby propose « Tirer au hasard » (`resolveWeakness
  {choice: "random"}` : tirage pondéré par `quantity` parmi les
  `basicweakness` de l'index, hors 01000, hors 60154 / 60254 sans image,
  et hors 06035‑38 — les quatre TDE multijoueur — en solo) ou
  « Choisir… » (`resolveWeakness {choice: <code>}`, liste triée par nom).
  Non résolue au « Lancer » : tirée au hasard, ligne de journal. Une
  faiblesse explicitement listée dans le deck est prise telle quelle.
- **Cartes liées** : pour chaque carte du deck dont le nom est le
  `bonded_to` d'une carte de l'index, `bonded_count` exemplaires de cette
  carte liée sont créés **hors jeu** (mises de côté). `bonded_to` est un
  nom : Occult Lexicon niveau 0 comme niveau 3 y donnent droit.
- **Commence en jeu** : cartes `permanent` et cartes citées par le texte
  de l'enquêteur effectif (« You begin the game with X in play », lu au
  build par regex, jamais reproduit ; le recto parallèle a son propre
  texte, Pete's Guitar).
- Enquêteur **déduit** : mêmes règles que `chooseInvestigator` (refus si
  un autre siège l'a déjà ; refus si le code manque à l'index, avec
  message). `clearInvestigator` efface aussi le deck ; un nouvel import
  remplace l'ancien ; `reset` conserve enquêteur et deck.
- Résumé affiché au lobby (visible de tous) : nom du deck, enquêteur,
  nombre de cartes, cartes liées et permanents, faiblesses à déterminer,
  badges taboo / custom, lien vers le deck.

Données de cartes : le build produit **`public/data/player_cards.json`**
(cartes joueur hors `hidden` : code, nom, sous-titre, type, sous-type
(`weakness` / `basicweakness`), faction, coût (`null` = —, `-2` = X),
xp, slot, permanent, vie / santé mentale, `uses {n, type}` (regex
« Uses (n type) » sur le texte ; X → 0), `bonded_to` / `bonded_count`,
unique, `back: "b"` si double face, `alternate_of`, `quantity`) — de
l'ordre de 3 500 cartes, ~400 Ko (~60 Ko gzip). Le DO le lit depuis les
assets au moment de l'import (comme `cards_index.json` pour
`createCard`) ; les définitions des codes du deck voyagent dans
`state.extraDefs` (mécanisme existant), si bien que le client n'a besoin
de l'index que pour la liste des faiblesses, chargée à la demande.

### 10.4 Modèle d'état

```ts
type Seat = {
  // … champs existants (index, occupied, name, investigatorCode, custom, counters) …
  pin: string | null;                        // code de siège à 4 chiffres
  counters: { health, sanity, clues, actions, resources, ...specific };
  deck: null | {
    source: "arkhamdb" | "arkhambuild"; url: string; id: string; name: string;
    investigatorCode: string;                // code du deck (base) ; le siège porte le recto effectif
    slots: Record<string, number>;           // cartes importées (ignoreDeckLimitSlots inclus)
    weaknessPending: number;                 // placeholders 01000 restants
    customizations?: Record<string, string>; // meta cus_<code>, affichage seulement
    taboo?: number; xp?: number;
    board: { setup: "none" | "mulligan" | "done"; mulliganUsed: boolean };
  };                                         // faiblesses mises de côté pendant la mise en place : pile pweak<n>
};
```

`Seat.connections` (nombre de connexions du siège) est tenu à jour à
chaque connexion et fermeture, hors `rev`, comme `occupied`.
`resources` est un compteur de siège ordinaire (±, initial 0, jamais
négatif comme les autres — révisé le 2026-09-08), affiché aussi sur le
siège du tapis. `deck.bonded`, `deck.weaknessAdded` (faiblesses tirées ou
choisies) et `deck.unknown` (codes ignorés) complètent le modèle livré.

Cartes : les cartes du deck sont des `CardState` ordinaires (`ownerSeat`
= le siège, `kind` étendu à `"event" | "skill"`, `player: true` pour le
dos joueur et les menus). Ajouts : `revealed?: boolean` (carte de la main
montrée à tous ; effacé dès qu'elle quitte la main) et `tokens.uses?:
number` (le **type** d'uses vient de la définition : `extraDefs[code]
.uses.type` ; rendu en chip générique, images par type plus tard). Les
jauges des alliés utilisent `health` / `sanity` de la définition, comme
les soutiens du scénario. Une carte à double face garde `side` et
« Retourner ».

Piles et zones par siège `n` :

| Id | Nature | Contenu |
|---|---|---|
| `pdeck<n>` | pile, face cachée | la pioche (« réserve ») |
| `phand<n>` | pile ordonnée (ordre de pioche) | la main |
| `pdiscard<n>` | pile, face visible | la défausse, consultable |
| `pweak<n>` | pile, face cachée | faiblesses mises de côté pendant la mise en place (remélangées après le mulligan) |
| `pplay<n>` | zone, coordonnées libres | **en jeu** : soutiens joués et payés (avec leurs Uses), permanents, attaches |
| `pevent<n>` | zone, une carte | **Play** : l'événement joué (payé), jusqu'à « Résolu » |
| `pcommit<n>` | zone, rangée | **Commit** : cartes engagées au test de compétence |
| `paside<n>` | zone, rangée | hors jeu : cartes liées, mises de côté |
| `seat<n>` | zone existante | enquêteur + zone de menace (partagée avec le tapis) |
| `removed` | pile existante | exil / retiré de la partie, jamais affiché |

### 10.5 Page joueur `/r/<code>/j/<n>`

Ordinateur et tablette seulement, mêmes gestes que le tapis (glisser au
lâcher, clic droit / appui long = menu, double-clic = épuiser / redresser,
loupe). Cartes à 113 × 160 (0,9 × la carte du tapis ; retour de test :
tout était trop petit), Commit et zone de menace côte à côte sous Play.
Disposition validée sur captures :

- **Barre du haut** (compacte, une rangée — révisée le 2026-09-08) :
  portrait de l'enquêteur (loupe au survol, bouton « verso »), nom et
  ★ principal, compteurs en chips (icône, valeur, ±) : ressources,
  indices, vie et santé mentale avec dégâts et horreur ; actions et
  « Prendre mon tour » / « Fin de mon tour » ; main et **occupation des
  slots** en icônes Arkham Cards (dépassement surligné, jamais bloqué) ;
  mise en place / mulligan ; « Phase suivante » est à côté de « Prendre
  mon tour » (même style). La barre de phase porte la phase courante et
  la ligne de statut (refus, informations : plus de notifications
  plein écran) ; le **sac du chaos** est dans la colonne de droite sous
  « Mon lieu », ses jetons tirés en grille bornée ; la barre d'onglets
  porte le formulaire « Rejoindre ce siège » et l'étiquette « lecture
  seule ».
- **Mon lieu** (colonne de droite, ajout du 2026-09-08) : le lieu où
  se trouve le pion du siège (le plus proche du pion, comme « Poser sur
  mon lieu »), dans l'état du tapis (indices, jetons, révélé ou non), les
  pions présents, « Prendre 1 indice », « Révéler », et les cartes
  posées sur ce lieu.
- **Gauche** : pioche (dos, compte ; clic = piocher 1 en main ;
  **glisser = poser la première carte face cachée** dans une zone du
  board, `p:drawTo` ; menu : piocher N, chercher, regarder les n
  premières, poser face cachée, mélanger ; depuis la fenêtre de
  recherche, « En jeu » pose la carte en fin de rangée), défausse
  (dernière carte visible, compte ; menu : consulter → reprendre en
  main / sur la pioche / sous la pioche / mélanger dans la pioche),
  hors jeu (rangée de vignettes, glisser vers la main ou en jeu).
- **Centre** : **en jeu** (zone libre des soutiens : jauge d'Uses du bon
  type et en bonne quantité posée au jeu de la carte — même chip que
  les dégâts et l'horreur, mais **inversée : clic = −1, « + » à gauche au
  survol** (révisé le 2026-09-09) —, jauges
  des alliés, épuisé = rotation, « Autre face » pour les cartes à verso
  lié comme Sophie, « Retourner » pour les autres) ; dessous, côte à
  côte : **Play** (case d'une carte : l'événement joué, bouton
  « Résolu »), **Commit** (rangée, **total des icônes de compétence**
  des cartes engagées sur son côté — icône + nombre, données ArkhamDB
  `skill_*`, icônes Arkham Cards — bouton « Test résolu ») et la
  **zone de menace** = le contenu de `seat<n>` (ennemis engagés,
  traîtrises, assets histoire), cible de dépôt.
- **Bas** : la main en éventail dans l'ordre de pioche ; cases de
  sélection pendant le mulligan ; menu par carte : jouer (payer), mettre
  en jeu sans payer, engager au test, défausser, sur / sous la pioche,
  révéler à tous, poser sur mon lieu, retirer de la partie (exil).
- **Mise en place** : bouton visible dès que la partie est lancée et
  tant que `board.setup = "none"` ; ensuite l'état `mulligan` affiche
  les cases sur la main, « Mulligan (n) » et « Garder ma main » ; puis
  le bouton disparaît (`done`). Avant le lancement, la page montre
  l'état du lobby (« en attente du lancement », résumé du deck).
- **Autres sièges** : onglets en haut (un par siège avec deck) →
  même page en **lecture seule** : main rendue en dos + nombre, bouton
  « Regarder » (révélation locale, rien n'est envoyé), cartes `revealed`
  face visible. Les spectateurs ont la même vue.

**Retours du 2026-09-09 (UX)** : les jauges d'enquêteur (ressources,
indices, dégâts, horreur) sont des chips identiques à celles des cartes
(clic = +1, « − » au survol) dans l'entête du board comme dans les
sièges du tapis ; le bouton qui dépense une action, « Fin de mon tour /
Prendre mon tour » et « Phase suivante » sont au-dessus de la main ; le
sac du chaos est à droite de Play, par-dessus la bande Commit (les
jetons tirés recouvrent les cartes engagées) ; « Hors jeu » est une
pile (clic = chercher : En jeu / En main / Défausser / Sur la pioche) ;
la défausse se cherche par le clic droit (« Rechercher (sans
mélanger) », ordre conservé) ; dans « Mon lieu », les pions des
enquêteurs présents sont posés sur le lieu. Le menu de toute carte
(tapis et board) propose « Voir sur ArkhamDB » (nouvel onglet), sauf
pour un dos, une clé, un pion ou un enquêteur personnalisé.

### 10.6 Actions `p:*` (réservées aux connexions du siège)

| t | Effet |
|---|---|
| `importDeck {url}` / `resolveWeakness {choice}` | lobby, voir §10.3 |
| `p:setup` | mélange `pdeck` ; permanents et « commence en jeu » → `pplay` face visible (Uses posés) ; `resources += 5` ; pioche 5 en main, chaque faiblesse tirée va dans `pweak` et est remplacée ; `board.setup = "mulligan"` ; journal |
| `p:mulligan {ids}` | `ids` ⊂ main : mis de côté, autant de cartes piochées (faiblesses idem) ; puis cartes rendues + `pweak` remélangées dans `pdeck` ; `mulliganUsed = true`, `setup = "done"` |
| `p:keep` | `pweak` remélangé dans `pdeck` ; `setup = "done"` |
| `p:draw {n = 1}` | pioche n (≤ 10) en main ; pioche vide → `pdiscard` remélangée dans `pdeck` puis pioche, **rappel « prends 1 horreur »** (encart + journal) ; pioche et défausse vides → rappel « enquêteur vaincu » (rien de plus) |
| `p:aside {id}` | → hors jeu (`paside`), en fin de rangée, face visible |
| `p:play {id, cost?, free?}` | main → selon le type : soutien → **en jeu** (`pplay`, avec `tokens.uses = def.uses.n`, jauges des alliés), événement → **Play** (`pevent`, l'événement précédent y est défaussé), skill → **Commit** ; `resources −= coût imprimé`, ou `cost` fourni quand le coût est X (`-2`), ou 0 si `free` ; une carte **hors jeu** (liée) se joue gratuitement ; **refusé** (nack, alerte) si les ressources manquent ; journal « X joue Y (2 ressources / X = 3 / sans payer) » ; depuis la **défausse** aussi (« Auto-pay » de la fenêtre de recherche, payée, journal « depuis sa défausse ») |
| `p:put {id, zone, x?, y?}` | glisser : main (ou hors jeu) → en jeu (position lâchée, Uses posés), Play (l'événement précédent y est défaussé) ou Commit, **sans coût** ; journal « X pose Y … (sans payer) » |
| `p:commit {id}` | carte de la main → **Commit** (`pcommit`) sans coût (engagée au test) |
| `p:resolve {zone?}` | `commit` (défaut) : test résolu, tout `pcommit` → `pdiscard` ; `play` : l'événement de `pevent` → `pdiscard` (une carte de rencontre égarée là → défausse de rencontre), face visible |
| `p:discard {id}` / `p:randomDiscard {n = 1}` | → `pdiscard` ; le tirage au hasard nomme la carte au journal |
| `p:toHand {id}` | défausse, pioche (après recherche), en jeu ou hors jeu → fin de main |
| `p:reveal {id, v}` | bascule `revealed` sur une carte de la main |
| `p:search {pile, n?}` | `peek` au demandeur : les n premières dans l'ordre (regarder) ou toute la pile (chercher) ; à la fermeture d'une recherche complète le client envoie `shufflePile` ; journal « X regarde les n premières cartes » |
| `p:drawTo {zone, x?, y?}` | la première carte de la pioche, **face cachée**, dans une zone du board (en jeu à la position lâchée, Play, Commit, hors jeu, menace) ; se retourne ensuite par le menu |
| `p:exile {id}` | → `removed`, journal (exil, retrait de la partie) |
| `p:toLocation {id}` | → `board`, posée sur le lieu où se trouve le pion du siège (lieu le plus proche du pion, à moins d'une carte et demie ; décalée vers le bas), sinon au centre ; depuis le tapis, menu « Reprendre sur le board de X » = `moveCard` vers `pplay` (réservé au siège), « Défausse de X » = `p:discard` |

Réutilisés tels quels : `moveCard` (glisser entre zones, y compris la
menace), `toPile {top, shuffle}` (sur / sous / mélanger dans la pioche),
`shufflePile`, `flipCard`, `exhaust`, `addToken {token: "uses"}`,
`setSeatCounter {resources}`, `chaosDraw` / `chaosReturn`, `nextPhase`,
`takeTurn` / `endTurn`. Un refus de siège renvoie `{ t: "nack", reason:
"siege" }` — aussi pour un geste générique (`toPile`, `moveCard`,
`shufflePile`) visant une pile ou une zone d'un autre board
(`/^p(deck|hand|discard|weak|play|event|commit|aside)[0-3]$/`) ; les gestes de
rencontre (`drawEncounter`, `randomPick`, `searchEncounter`,
`reshuffleDiscard`) ne s'appliquent jamais à une pile de board. Les
journaux nomment les cartes joueur d'après `state.extraDefs`
(`nomVisible(def, card, extraDefs)`).

**Entretien** (table, dans `nextPhase` → `upkeep`, un seul message) :
pour chaque siège dont `board.setup = "done"`, pioche 1 (règle de la
pioche vide ci-dessus, rappel d'horreur inclus), `resources += 1`, et
rappel « main de n cartes : défausse jusqu'à 8 » si n > 8 ; le
redressement général existant couvre les cartes joueur.

**Visibilité** : tous les clients reçoivent les mêmes deltas (les codes
de la main compris) ; le masquage est un choix d'affichage (A2). `revealed`
sert à montrer une carte à tous sans la sortir de la main.

### 10.7 Ce qui change sur le tapis

- Siège : compteur **ressources** (±) ; bouton **« Voir le board »**
  (ouvre `/r/<code>/j/<n>` dans une fenêtre nommée : un seul onglet par
  board) ; code de siège ; indicateur de connexions ; **case Play**
  (l'événement joué) à côté de la zone de menace, main comptée ;
  **Commit volant** au-dessus des pioches de rencontre dès qu'un siège
  a engagé des cartes (groupées par siège, loupe et menu), avec le total
  des icônes de compétence sur son côté — la zone en jeu des soutiens
  n'y figure pas.
- **Plein écran** (F11, `display-mode: fullscreen`) : la barre du haut
  s'efface sur les deux pages.
- **Loupe** (toutes les pages) : au survol après **500 ms**, et déportée
  à droite quand sa place habituelle recouvrirait la carte survolée. Le
  Commit volant porte un bouton **« Test résolu »** actif pour le siège
  concerné.
- **Notifications** : plus d'encarts plein écran. Sur le tapis, les
  refus et informations propres au client s'intercalent dans le journal
  de bord (lignes locales) ; sur la page joueur, une ligne de statut
  dans la barre de phase.
- `nextPhase` → entretien : automatisations joueur (§10.6).
- Cartes joueur posées sur le tapis par « Poser sur mon lieu » : rendues
  comme les autres (dos joueur, menu « Reprendre sur mon board ») ; une
  faiblesse ennemie glissée dans la zone de menace depuis la page joueur
  apparaît engagée sur le siège.
- Lobby : champ « lien du deck » à côté du choix d'enquêteur ; résumé du
  deck ; boutons des faiblesses à déterminer.

### 10.8 Budget et taille

- Messages : environ 15 gestes de plus par joueur et par manche →
  objectif **< 400 entrants par manche à 4 joueurs**. Les messages
  WebSocket entrants sont comptés 20 pour 1 requête sur le plan gratuit
  (vérifié le 2026-09-07 ; les sortants sont gratuits) : la marge est
  large, le principe « un geste = un message » reste.
- Snapshot : quatre decks ajoutent ~180 cartes et leurs définitions,
  soit moins de 60 Ko ; la facturation SQLite se fait **en lignes
  écrites** (1 snapshot = 1 ligne, 2 Mo maximum par ligne), pas en Ko.
- `player_cards.json` n'est lu que par le DO à l'import ; le client ne le
  charge que pour la liste des faiblesses.

### 10.9 Livraison en trois étapes (G3)

1. **Page et import** — *livrée le 2026-09-07* : `player_cards.json` au build ; `importDeck`,
   `resolveWeakness`, enquêteur déduit, résumé au lobby ; code de siège
   et connexions multiples ; page joueur affichée avec toutes ses zones
   (pioche face cachée, compteurs, menace, sac, phases), onglets des
   sièges en lecture seule ; ressources et « Voir le board » sur le
   tapis. Tests bout en bout (import des deux sources, deck privé refusé,
   placeholder, cartes liées, pin juste / faux, deux connexions, refus
   `siege`), captures.
2. **Mise en place et mulligan** — *livrée le 2026-09-07* : `p:setup`,
   `p:mulligan`, `p:keep`, pioche / main / défausse et tous les boutons
   d'E3, main masquée chez les autres, `revealed`, hors jeu, entretien
   automatique, pioche vide. Tests (mulligan une seule fois, faiblesse
   en main de départ, deck vide) et captures 61‑65.
3. **Jeu** — *livrée le 2026-09-08* : `p:play` (coût, X, sans payer),
   Commit et « Test résolu », Uses et jauges, icônes de slot (Arkham
   Cards, `scripts/build_slot_icons.py`) et occupation, exil, « Poser
   sur mon lieu » et retour, journal. Régression sur les tables
   existantes ; captures 66‑68.

**Retours de test du 2026-09-08 (première série)** : tout plus grand
(main, cartes, pioche, menace, sac, jauges, icônes) ; nomenclature
Play / Commit ; zone « mon lieu » à gauche de la page joueur (le lieu du
pion, dans l'état du tapis) ; loupe sur l'enquêteur et son verso ; barre
d'enquêteur plus compacte (pire en lecture seule) ; cartes en jeu
retournables (versos non basiques) ; « Voir le board » ne rouvre pas un
second onglet ; badges de slot déplacés dans la barre ; ressources
jamais négatives avec alerte. Traités en deux pushes : règles et
nomenclature, puis mise en page.

### 10.10 Points ouverts et v2

- **Customisations** : proposition = badge « custom » sur la carte et,
  dans la loupe, la liste des cases cochées par leur **titre** seulement
  (jamais le texte) — à valider.
- **Code de siège** : visible de toute la table (décision A3) ou du seul
  siège — à confirmer à l'usage.
- **Images des jetons Uses** : *réglé le 2026-09-09* — pions fournis par
  l'utilisateur pour chaque type (`public/img/tokens/uses/`, table
  `data/uses_tokens.json` : charges, munitions, provisions, secrets,
  offrandes, lignes telluriques, renommée, clés, preuves, inspiration,
  rumeurs, chances, verrous, primes, tickets, flèches, obus ; ressources
  = jeton ressource ; repli `uses.png`). Posés automatiquement au jeu
  d'un soutien, dans la bonne quantité, **en bas de la carte sur le
  texte, un peu à droite du milieu** (le coût reste visible).
- **Decks annexes** (hunch deck de Joe Diamond, Underworld Market,
  cartes sous l'enquêteur) : piles supplémentaires par siège, v2.
- **Attaches** entre cartes joueur : empilement visuel seulement (v1).
- Options de deck sans effet en jeu (`deck_size_selected`,
  `option_selected`) : ignorées ; « Uses (X) » variable : 0, à la main.
- **Enquêteur personnalisé + deck** : un deck impose son enquêteur ; un
  deck dont l'enquêteur manque à l'index est refusé — à revoir si le
  besoin apparaît.
- Réimport entre scénarios et journal de campagne : v2 (campagne).

## 11. Children of Blood (v1.2) — décisions du 2026-09-08

- **Source de données** : arkham.build devient la source n° 1 pour tout
  le build (métadonnées ; les images venaient déjà de
  `cdn.arkham.build`). Diff complet validé contre l'existant ; ArkhamDB
  reste utilisé à l'exécution pour l'import de decks par lien.
- **Enfouissement** : cartes face cachée qui dépassent du bas des
  repaires, suivent leur lieu, se révèlent par le menu « Retourner » ;
  journal muet sur les identités. Menus : pioche de rencontre
  (`bury.menuPile`) et carte de Julia posée sur un repaire
  (`bury.menuCard`).
- **Scellage** : option 2 retenue — une action du sac (ou le chip du
  siège) retire un sang du sac (ou des tirés) et incrémente le compteur
  en un geste ; l'inverse pour libérer.
- **Difficulté** : `branch on:"difficulty"` + `scenarioCardSide` ;
  sacs saisis depuis le tableau p. 5 du guide (pas de tablette ; sang
  en Difficile/Expert uniquement).
- **Disposition** : losange sur 5 rangées (colonnes 365/551/737/923,
  rangées 55/293/531/769/1007), le plateau zoomable absorbe la hauteur.
- **II New Horizons livré le même jour** : choix de groupe jour/nuit au
  lobby (ce n'est pas la résolution du I qui décide), report du sac par
  question numérique (`chaosAdd nFrom` + 1) ou encart autonome p. 15
  (`chaosSet`), grottes de côté face cachée, départ au choix des deux
  Factory Floors (aucun lieu révélé d'office).
- **III Blood Money livré le 2026-09-08** — campagne complète. Codex des
  invités (scellage de jetons sur les cartes, `cardSeal`), pile « Invités
  sauvés », questions de journal (Julia, Zburamoarte), retrait partiel
  (`remove` + `n`), et correction tablette/cultiste des sacs I/II (icônes
  vérifiées à 600 dpi contre les SVG).
