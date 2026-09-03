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
  | { op: "aside"; codes: string[]; faceUp?: boolean; log?: string }
  | { op: "story"; log?: string }
  | { op: "buildEncounter"; log?: string }
  | { op: "log"; text: string }
  | { op: "hook"; name: string; log?: string };

export type Reminder = { when: string; text: string };

export type ScenarioDef = {
  id: string;
  title: string;
  campaign: string;
  campaignId: string;
  order: number;
  pack: string;
  encounterSets: string[];
  encounterSetNames: Record<string, string>;
  scenarioCard: string;
  agendaDeck: string[];
  actDeck: string[];
  startLocation?: string;
  extraCards?: string[];
  piles?: { id: string; label: string }[];   // piles supplémentaires (ex. « Cultist deck »)
  chaosBag: Record<Difficulty, Token[]>;
  layout: { code: string; x: number; y: number }[];
  setup: SetupStep[];
  questions: { id: string; text: string; options: { id: string; label: string }[] }[];
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
