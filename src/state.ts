// Modèle d'état d'une room — transcription du cahier des charges §3.
// Ce fichier ne contient que des types et l'état initial ; aucune logique de jeu.

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

export type CardId = string;
export type PileId = string;
export type ZoneId = "board" | "seat0" | "seat1" | "seat2" | "seat3" | "story" | "aside" | "victory";

export type CardKind =
  | "location" | "enemy" | "treachery" | "asset" | "story" | "agenda" | "act"
  | "scenario" | "investigator" | "mini" | "proxy";

export type Token =
  | "+1" | "0" | "-1" | "-2" | "-3" | "-4" | "-5" | "-6" | "-8"
  | "skull" | "cultist" | "tablet" | "elder_thing" | "auto_fail" | "elder_sign"
  | "bless" | "curse" | "frost";

export type Seat = {
  index: 0 | 1 | 2 | 3;
  occupied: boolean;
  name: string | null;
  investigatorCode: string | null;
  counters: Record<string, number>; // health, sanity, clues, actions, + spécifiques
  deck: null;                        // réservé v2
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
  tokens: Partial<Record<"doom" | "clue" | "damage" | "horror" | "resource" | "generic", number>>;
  ownerSeat?: number;
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
  cards: Record<CardId, CardState>;
  piles: Record<PileId, CardId[]>;
  chaos: ChaosState;
  counters: Record<string, number>;
  agendaId: CardId | null;
  actId: CardId | null;
  log: LogEntry[];
  pendingQuestion: Question | null;
  campaign: { log: null; nextScenarioId: null }; // réservé v2
};

export const LOG_MAX = 200;
export const PURGE_DELAY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours sans activité

export function initialState(code: string, scenarioId: string, now = Date.now()): RoomState {
  const seats: Seat[] = ([0, 1, 2, 3] as const).map((index) => ({
    index,
    occupied: false,
    name: null,
    investigatorCode: null,
    counters: { health: 0, sanity: 0, clues: 0, actions: 3 },
    deck: null,
  }));
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
    seats,
    hostSeat: null,
    hostConnected: false,
    cards: {},
    piles: { encounter: [], encounterDiscard: [], removed: [], agendaDeck: [], actDeck: [] },
    chaos: { bag: [], drawn: [], sealed: [] },
    counters: {},
    agendaId: null,
    actId: null,
    log: [],
    pendingQuestion: null,
    campaign: { log: null, nextScenarioId: null },
  };
}

// Messages du protocole (cahier des charges §4) — seuls ceux du squelette sont typés ici.
export type ServerMessage =
  | { t: "welcome"; state: RoomState; you: { seat: number | null; isHost: boolean } }
  | { t: "seats"; seats: Pick<Seat, "index" | "occupied" | "name" | "investigatorCode">[]; hostConnected: boolean }
  | { t: "seatTaken" }
  | { t: "nack"; reason: string };

export type ClientMessage = { t: string; [k: string]: unknown };
