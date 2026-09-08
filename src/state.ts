// Modèle d'état d'une room — transcription du cahier des charges §3.
// Ce fichier ne contient que des types et l'état initial ; la logique de jeu est dans room.ts / setup.ts.

export type Phase =
  | "lobby"
  | "setup_questions"
  | "mythos"
  | "investigation"
  | "enemy"
  | "upkeep"
  | "resolution"
  | "deleted";

export type Difficulty = "easy" | "standard" | "hard" | "expert";
export const DIFFICULTIES: Difficulty[] = ["easy", "standard", "hard", "expert"];

export type CardId = string;
export type PileId = string;
export type SeatIndex = 0 | 1 | 2 | 3;
// Zones du tapis, plus les zones du board joueur de chaque siège (cahier §10.4) :
// pplay = en jeu (soutiens joués, coordonnées libres), pevent = Play (une carte : l'événement joué, à défausser
// une fois résolu), pcommit = Commit (cartes engagées au test), paside = hors jeu (cartes liées, mises de côté).
export type ZoneId = "board" | "seat0" | "seat1" | "seat2" | "seat3" | "story" | "aside" | "victory"
  | `pplay${SeatIndex}` | `pevent${SeatIndex}` | `pcommit${SeatIndex}` | `paside${SeatIndex}`;

export type CardKind =
  | "location" | "enemy" | "treachery" | "asset" | "story" | "agenda" | "act"
  | "scenario" | "investigator" | "mini" | "proxy"
  | "key"    // clé : jeton du chaos pris dans la collection (TCU For the Greater Good, code « key:<jeton> »), ou clé de couleur
             // à deux faces (The Innsmouth Conspiracy, code « key:<couleur> », face cachée = symbole universel) — petit jeton déplaçable
  | "event" | "skill";   // cartes joueur (board joueur)

export type Token =
  | "+1" | "0" | "-1" | "-2" | "-3" | "-4" | "-5" | "-6" | "-7" | "-8"
  | "skull" | "cultist" | "tablet" | "elder_thing" | "auto_fail" | "elder_sign"
  | "bless" | "curse" | "frost";

// Enquêteur personnalisé (hors ArkhamDB) : nom, image (URL, facultative) et jauges saisis au lobby.
// Son code de carte est « custom:<siège> » ; il ne figure dans aucun index.
export type CustomInvestigator = { name: string; image: string | null; health: number; sanity: number };

// Deck importé au lobby (cahier §10.3) : ArkhamDB ou arkham.build, enquêteur déduit ; les cartes sont créées
// à la mise en place de la table, le board du joueur se met en place à sa demande (« Mise en place »).
export type SeatDeck = {
  source: "arkhamdb" | "arkhambuild";
  url: string;
  id: string;
  name: string;
  investigatorCode: string;                 // code du deck (base) ; le siège porte le recto effectif (parallèle)
  slots: Record<string, number>;            // cartes du deck (ignoreDeckLimitSlots inclus, sideSlots exclus, placeholders retirés)
  bonded: Record<string, number>;           // cartes liées mises hors jeu à la création
  weaknessPending: number;                  // placeholders « faiblesse de base aléatoire » (01000) à déterminer
  weaknessAdded: string[];                  // faiblesses tirées ou choisies (codes)
  unknown: string[];                        // codes absents de l'index (ignorés, signalés)
  customizations?: Record<string, string>;  // meta cus_<code>, affichage seulement
  taboo?: number;
  xp?: number;
  board: { setup: "none" | "mulligan" | "done"; mulliganUsed: boolean };
  // Les faiblesses mises de côté pendant la mise en place sont dans la pile pweak<n>.
};

export type Seat = {
  index: SeatIndex;
  occupied: boolean;
  name: string | null;
  investigatorCode: string | null;
  custom?: CustomInvestigator | null; // renseigné quand investigatorCode = « custom:<n> »
  counters: Record<string, number>; // health, sanity, clues, actions, resources, + spécifiques
  pin: string | null;                // code de siège à 4 chiffres : rejoindre le siège depuis un second appareil (cahier §10.2)
  connections: number;               // connexions ouvertes sur le siège (hors rev, comme occupied)
  deck: SeatDeck | null;
};

export type CardState = {
  id: CardId;
  code: string;
  kind: CardKind;
  storyBack: boolean;
  loc: { zone: ZoneId; x: number; y: number; z: number } | { pile: PileId };
  faceUp: boolean;
  exhausted: boolean;
  side: "a" | "b";
  tokens: Partial<Record<"doom" | "clue" | "damage" | "horror" | "resource" | "generic" | "uses" | "flood", number>>;
    // flood : niveau d'inondation d'un lieu (The Innsmouth Conspiracy) — 1 = partiellement, 2 = totalement inondé
  ownerSeat?: number;
  player?: true;                     // carte d'un deck joueur (dos joueur, menus du board)
  revealed?: boolean;                // carte de la main montrée à tous (board joueur)
};

export type ChaosState = { bag: Token[]; drawn: Token[]; sealed: Token[] };

export type LogEntry = {
  at: number;
  kind: "setup" | "phase" | "reminder" | "action" | "system";
  text: string;
  seat?: number;
};

export type Question = { id: string; text: string; options: { id: string; label: string }[] };

export type RoomState = {
  rev: number;
  code: string;
  scenarioId: string;
  createdAt: number;
  lastActivityAt: number;
  phase: Phase;
  round: number;
  difficulty: Difficulty;
  playerCount: number;
  seats: Seat[];
  hostSeat: number | null;
  hostConnected: boolean;
  lead: number | null;                       // enquêteur principal (marque ★), choisi au lobby
  turn: { seat: number | null; done: number[] }; // tour en cours de la phase des enquêteurs (étape 2)
  cards: Record<CardId, CardState>;
  piles: Record<PileId, CardId[]>;
  links: { a: CardId; b: CardId; color: number }[];   // chemins tracés entre lieux (couleur = index de palette)
  extraDefs: Record<string, unknown>;                  // définitions des cartes générées (outil « Générer une carte »)
  chaos: ChaosState;
  counters: Record<string, number>;
  agendaId: CardId | null;
  actId: CardId | null;
  flood?: { onReveal: 0 | 1 | 2 };   // marée (The Innsmouth Conspiracy) : ce qu'un lieu subit à sa révélation — rien, +1 niveau, totalement inondé
  leads?: { eliminated: string[]; accused?: { suspect: string; hideout: string }; truth?: { suspect: string; hideout: string } };
    // The Vanishing of Elina Harper : pistes rayées (codes vus dans la pile Leads ou en jeu), accusation faite, vérité révélée
  log: LogEntry[];
  pendingQuestion: Question | null;
  campaign: { log: null; nextScenarioId: null }; // réservé v2
};

export const LOG_MAX = 200;
export const PURGE_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours sans activité

export function emptySeat(index: SeatIndex): Seat {
  return { index, occupied: false, name: null, investigatorCode: null, custom: null, counters: { health: 0, sanity: 0, clues: 0, actions: 3, resources: 0 }, pin: null, connections: 0, deck: null };
}

export function emptyBoard(): SeatDeck["board"] {
  return { setup: "none", mulliganUsed: false };
}

export function emptyPiles(): Record<PileId, CardId[]> {
  return { encounter: [], encounterDiscard: [], removed: [], agendaDeck: [], actDeck: [] };
}

export function initialState(code: string, scenarioId: string, now = Date.now()): RoomState {
  return {
    rev: 0,
    code,
    scenarioId,
    createdAt: now,
    lastActivityAt: now,
    phase: "lobby",
    round: 0,
    difficulty: "standard",
    playerCount: 0,
    seats: ([0, 1, 2, 3] as const).map(emptySeat),
    hostSeat: null,
    hostConnected: false,
    lead: null,
    turn: { seat: null, done: [] },
    cards: {},
    piles: emptyPiles(),
    links: [],
    extraDefs: {},
    chaos: { bag: [], drawn: [], sealed: [] },
    counters: {},
    agendaId: null,
    actId: null,
    log: [],
    pendingQuestion: null,
    campaign: { log: null, nextScenarioId: null },
  };
}

// ---- Protocole (cahier des charges §4) ------------------------------------------

export type SeatSummary = Pick<Seat, "index" | "occupied" | "name" | "investigatorCode" | "custom" | "pin" | "connections">;

export type PatchOp = { op: "add" | "remove" | "replace"; path: string; value?: unknown };

export type ServerMessage =
  | { t: "welcome"; state: RoomState; you: { seat: number | null; isHost: boolean } }
  | { t: "you"; seat: number | null; isHost: boolean }
  | { t: "hostToken"; token: string }
  | { t: "seats"; seats: SeatSummary[]; hostSeat: number | null; hostConnected: boolean; spectators: number }
  | { t: "delta"; rev: number; patch: PatchOp[] }
  | { t: "reminder"; entry: LogEntry }
  | { t: "peek"; pile: string; cards: { id: string; code: string }[] }
  | { t: "seatTaken" }
  | { t: "nack"; reason: string };

export type ClientMessage = { t: string; [k: string]: unknown };
