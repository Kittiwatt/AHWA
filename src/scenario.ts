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
  backName?: string;        // nom du verso : carte liée, ou côté non révélé d'un lieu/agenda/acte (« Decrepit Door », « Unknown Places »)
  traits?: string[];        // traits imprimés (« Spectral », « Witch »…)
  subname?: string;         // sous-titre du recto (ex. « Master of Initiation »)
  backSubname?: string;     // sous-titre du verso lié (ex. « Master of Indoctrination »)
  backHealth?: number;
  backHealthPerInvestigator?: boolean;
  backVictory?: number;
  backClue?: { value: number; perInvestigator: boolean };   // verso = lieu (ex. acte → lieu) : ses indices
};

// Les références « slot:<nom> » désignent une carte choisie plus tôt (pickRandom, setStart).
export type SetupStep =
  | { op: "place"; code: string; zone: ZoneId; x: number; y: number; reveal?: boolean; faceUp?: boolean; log?: string }
  | { op: "pickRandom"; from: string[]; n?: number; slot?: string; zone?: ZoneId; x?: number; y?: number; positions?: { x: number; y: number }[]; faceUp?: boolean; reveal?: boolean; log?: string }
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
  | { op: "buildEncounter"; split?: { trait: string; pile: string }[]; log?: string }   // split : les cartes portant le trait vont dans cette pile (mélangée)
  | { op: "layeredPile"; pile: string; pool: string[]; layers: { n?: number; with?: string[] }[]; log?: string }
    // pile construite par couches, du dessus vers le dessous : chaque couche prend les codes `with` (imposés) plus
    // `n` cartes tirées au hasard dans ce qui reste de `pool`, puis est mélangée ; tout le pool doit être consommé
  | { op: "keys"; tokens: string[]; log?: string }   // clés (jetons du chaos pris dans la collection), mises de côté : cartes `key-<jeton>` déplaçables
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
  piles?: { id: string; label: string; discard?: string; isDiscard?: boolean; trait?: string }[];
    // piles supplémentaires : pioche déclarée (ex. « Cultist deck »), ou seconde pioche de rencontre avec sa défausse
    // (`discard` = id de la défausse, `isDiscard` sur celle-ci) ; `trait` : les cartes portant ce trait vont dans
    // cette pioche/défausse par défaut (The Wages of Sin : pioche et défausse spectrales)
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
