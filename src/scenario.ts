// Contrat de scénario (cahier des charges §5) tel que produit par scripts/build.mjs.
// Une définition = source déclarative (data/scenarios/<id>.src.json) + cartes figées depuis ArkhamDB.

import type { CardKind, Difficulty, Token, ZoneId } from "./state";
import { SCENARIOS } from "./scenarios.generated";

export type ScenarioCard = {
  code: string;
  name: string;
  kind: CardKind;
  qty: number;
  set: string;
  back: "b" | "encounter";
  storyBack: boolean;
  clue?: { value: number; perInvestigator: boolean };
  doom?: number | null;
  stage?: number | null;
  victory?: number;
  health?: number;
  sanity?: number;
  healthPerInvestigator?: boolean;
  backCode?: string;      // carte liée : le verso est une autre carte (ex. agenda → ennemi)
  backKind?: CardKind;
  backName?: string;
  backHealth?: number;
  backHealthPerInvestigator?: boolean;
  backVictory?: number;
  backClue?: { value: number; perInvestigator: boolean };   // verso = lieu (ex. acte → lieu) : ses indices
};

// Les références « slot:<nom> » désignent une carte choisie plus tôt (pickRandom, setStart).
export type SetupStep =
  | { op: "place"; code: string; zone: ZoneId; x: number; y: number; reveal?: boolean; faceUp?: boolean; log?: string }
  | { op: "pickRandom"; from: string[]; n?: number; slot?: string; zone?: ZoneId; x?: number; y?: number; positions?: { x: number; y: number }[]; faceUp?: boolean; log?: string }
  | { op: "pickRandomSet"; from: string[]; n?: number; log?: string }   // garde n sets dans la pioche, retire les autres (sans révéler lesquels)
  | { op: "addDoom"; n: number; log?: string }                          // doom sur l'agenda courant (après « story »)
  | { op: "chaosAdd"; tokens: Token[]; log?: string }
  | { op: "reminder"; text: string }                                    // encart éphémère + journal
  | { op: "branch"; on: string; cases: Record<string, SetupStep[]>; log?: string }   // on = id de question ou "players"
  | { op: "remove"; codes: string[]; log?: string }
  | { op: "toPile"; pile: string; set?: string; codes?: string[]; shuffle?: boolean; log?: string }
  | { op: "spawn"; code: string; at: string; log?: string }
  | { op: "setStart"; code: string; log?: string }
  | { op: "minis"; code: string; log?: string }
  | { op: "aside"; codes?: string[]; sets?: string[]; faceUp?: boolean; log?: string }   // codes (répétés selon la quantité) ou sets entiers
  | { op: "dealToSeats"; from: string[]; n: number; rows: { x: number; y: number; dx?: number }[]; start?: boolean; log?: string }
    // n cartes tirées au hasard dans from, distribuées une à une aux enquêteurs dans l'ordre des joueurs
    // (principal d'abord) ; rangée i = i-ème enquêteur servi ; le reste est retiré ; start : chacun commence
    // sur l'une de ses cartes, tirée au hasard, révélée, avec son pion dessus
  | { op: "story"; log?: string }
  | { op: "buildEncounter"; log?: string }
  | { op: "addClues"; code: string; n: number; log?: string }                  // indices fixes sur un lieu en jeu (révélé ou non)
  | { op: "removeClues"; from: string[]; n?: number; nFrom?: string; log?: string }   // retire n indices (ou la réponse numérique nFrom) aussi également que possible
  | { op: "log"; text: string }
  | { op: "hook"; name: string; log?: string };

// Question au lobby : à choix (options) ou numérique (type "number", bornes min/max, valeur par défaut).
export type Question = {
  id: string; text: string;
  options?: { id: string; label: string }[];
  type?: "number"; min?: number; max?: number; default?: number;
};

/** Réponse valide ? (choix parmi les options, ou entier dans les bornes) */
export function reponseValide(q: Question, r: unknown): boolean {
  if (q.type === "number") {
    const n = Number(r);
    return Number.isInteger(n) && n >= (q.min ?? 0) && n <= (q.max ?? Number.MAX_SAFE_INTEGER);
  }
  return (q.options ?? []).some((o) => o.id === r);
}

export type Reminder = { when: string; text: string };

export type ScenarioDef = {
  id: string;
  title: string;
  campaign: string;
  campaignId: string;
  order: number;
  pack?: string;            // pack ArkhamDB unique…
  packs?: string[];         // …ou plusieurs (ex. tcu + core)
  encounterSets: string[];
  encounterSetNames: Record<string, string>;
  scenarioCard: string;
  agendaDeck: string[];
  actDeck: string[];
  startLocation?: string;
  extraCards?: string[];
  piles?: { id: string; label: string }[];   // piles supplémentaires (ex. « Cultist deck »)
  backPlacement?: Record<string, { x: number; y: number }>;   // où un verso-lieu entre en jeu quand l'acte/agenda avance (défaut : centre)
  chaosBag: Record<Difficulty, Token[]>;
  layout: { code: string; x: number; y: number }[];
  setup: SetupStep[];
  questions: Question[];
  swaps?: { pair: [string, string]; labels: [string, string] }[];   // lieux qui se remplacent (normal ↔ Spectral), avec le libellé de chaque version
  seatCounters: { key: string; label: string; icon?: string; initial: number }[];
  tableCounters: { key: string; label: string; icon?: string; initial: number }[];
  reminders: Reminder[];
  cards: ScenarioCard[];
  builtAt: string;
};

export function getScenario(id: string): ScenarioDef | null {
  const def = (SCENARIOS as Record<string, unknown>)[id];
  return def ? (def as ScenarioDef) : null;
}

export function scenarioIds(): string[] {
  return Object.keys(SCENARIOS);
}
