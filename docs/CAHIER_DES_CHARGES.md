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
  investigatorCode: string | null;   // code ArkhamDB
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
            horror?: number; resource?: number; generic?: number };
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
enchaînement. `Seat.deck: null` — import de deck ArkhamDB.

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
| `clearInvestigator` | J (lobby) | retire l'investigateur de son siège |
| `setDifficulty {d}` | J (lobby) | difficulté |
| `setLead {seat}` | J | enquêteur principal (★) |
| `claimHost` | J si `!hostConnected` | transfert du rôle : nouveau jeton envoyé au demandeur (`{ t:"hostToken", token }`), ancien jeton invalidé |
| `resync` | tous | redemande un `welcome` |
| `startSetup` | H (lobby) | passe en `setup_questions` ou exécute le setup |
| `answerQuestion {id, option}` | H | répond à `pendingQuestion` |
| `reset` | H | retour lobby |
| `close` / `deleteRoom` | H | résolution / suppression |
| `kick {seat}` | H | libère un siège (au lobby : retire aussi son enquêteur) |
| `moveCard {id, zone, x, y}` | J | drop sur le tapis (au lâcher uniquement) |
| `toPile {id, pile, top?}` | J | met une carte dans une pile |
| `flipCard {id}` | J | retourne (refusé si `storyBack && !faceUp` — seul le setup/scénario peut révéler) |
| `revealLocation {id}` | J | face visible + indices auto (`clueValue × joueurs` ou `clueValue` si « per investigator » absent) |
| `toggleSide {id}` | J | lieux double face |
| `exhaust {id, v}` | J | épuiser / redresser |
| `addToken {id, token, delta}` | J | jetons ± sur une carte |
| `setSeatCounter {seat, key, delta}` | J | vie, santé mentale, indices, actions, spécifiques |
| `setCounter {key, delta}` | J | compteur de table |
| `drawEncounter {seat?}` | J | retourne la première carte de la pioche (elle y reste, le joueur la déplace) ; si une carte révélée est déjà dessus, elle part dans la zone de menace du siège et la suivante est retournée ; défausse remélangée si pioche vide |
| `takeClue {id, n?}` | J | déplace `n` (1) indice d'un lieu vers la réserve du siège (double-clic sur les indices) |
| `searchEncounter {pile?}` | J | envoie la pioche (ou la défausse) au demandeur (`peek`) ; le client remélange à la fermeture (`shufflePile`) et permet de prendre une carte (`moveCard`) |
| `shufflePile {pile}` | J | remélange |
| `nextPhase` | J | enchaîne les phases (§6) |
| `setPhase {phase}` | J | saut direct à une phase, sans automatisation |
| `takeTurn {seat?}` / `endTurn {seat?}` | J | tour en cours (`turn.seat`) / a joué (`turn.done`) ; indications, jamais des verrous |
| `advanceAgenda` / `advanceAct` | J | carte suivante de `agendaDeck`/`actDeck` ; agenda : retire tout le doom en jeu |
| `spendClues {n, from: {seat,n}[]}` | J | prélève sur les sièges ; le client demande la répartition si nécessaire |
| `chaosDraw` / `chaosReturn` | J | tirage (le jeton sort du sac vers `drawn`, cumulable) / tout remettre ; `onChaosDraw` (v1.1) pourra sceller |
| `chaosAdjust {token, delta}` | J | panneau du sac |
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
ArkhamDB + `scenarios_data.json`) + `scenarios/<id>.hooks.js` optionnel.
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
  seatCounters?: { key, label, icon, initial }[];
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

Implémentées à l'étape 1 (The Gathering) : `place`, `minis`, `aside`,
`story`, `buildEncounter`. Tout ce qui n'est ni posé ni mélangé va dans
`removed`. Après la mise en place, `round = 1` et `phase =
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
  (`nack`) n'a que deux motifs : rôle (action d'hôte) ou intégrité
  (siège pris, carte ou pile inconnue). Aucune action n'est refusée au
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
2. **Sac par difficulté** : à saisir pour TCU, TDC, TDE‑A et Film
   Fatale (section Setup / encart du guide).
3. **Compteurs spécifiques** : recensement dans les 10 scénarios (ex.
   clés FGG = proxys, pas compteurs).
4. **Texte des rappels** : granularité retenue = 1 rappel par étape de
   setup manuelle + 1 par phase + rappels ponctuels `round:n`.
5. ~~Geste ennemis et tailles/disposition~~ : double-clic ; disposition
   validée sur captures le 2026-09-03 (mémo §1 « Choix de la première
   table »).
6. ~~Ordre des sièges~~ : libre, avec « prendre mon tour » (mémo §1).
