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
  | { op: "pickRandom"; from: string[]; n?: number; slot?: string; zone?: ZoneId; x?: number; y?: number; positions?: { x: number; y: number }[]; faceUp?: boolean; reveal?: boolean; rest?: "remove" | "aside" | "pile" | "keep"; restPile?: string; log?: string }
    // slot : « slot:<nom> » = première carte tirée, « slot:<nom>:<i> » = i-ème ; rest : sort des cartes non tirées (retirées par défaut, de côté, ou dans la pile restPile)
  | { op: "randomTokens"; token: "doom" | "clue" | "damage" | "horror" | "resource" | "generic"; n?: number; picks: number[]; rounds: number[]; log?: string }
    // jetons posés au hasard sur des lieux du tapis : à chaque manche (rounds[joueurs-1]), picks[joueurs-1] lieux distincts reçoivent n jetons (brèches d'In the Clutches of Chaos)
  | { op: "fromPile"; pile: string; n: number; zone: ZoneId; positions: { x: number; y: number }[]; faceUp?: boolean; reveal?: boolean; slot?: string; log?: string }
    // les n premières cartes d'une pile déjà construite entrent en jeu aux positions données (Road deck : « put the top 3 cards
    // into play ») ; `slot` mémorise `slot:<slot>:<i>` (0 = première tirée) et `slot:<slot>` (la première)
  | { op: "pickRandomSet"; from: string[]; n?: number; log?: string }   // garde n sets dans la pioche, retire les autres (sans révéler lesquels)
  | { op: "addDoom"; n?: number; nFrom?: string; log?: string }         // doom sur l'agenda courant (après « story ») ; nFrom = réponse numérique
  | { op: "addTokens"; at: string; token: "doom" | "clue" | "damage" | "horror" | "resource" | "generic" | "flood"; n?: number; nFrom?: string; log?: string }   // jetons sur une carte en jeu (code ou slot), ex. ressource = brasero allumé ; nFrom = réponse numérique
  | { op: "emptySpace"; positions: { x: number; y: number }[]; log?: string }   // espaces vides posés au setup (dos de carte joueur)
  | { op: "chaosAdd"; byDifficulty: Record<Difficulty, Token[]>; log?: string }   // jeton(s) selon la difficulté (Interlude IV de TCU)
  | { op: "when"; cond: Cond; then: SetupStep[]; else?: SetupStep[] }     // condition composée sur les réponses
  | { op: "chaosAdd"; tokens: Token[]; log?: string }
  | { op: "chaosAdd"; token: Token; nFrom: string; plus?: number; log?: string }   // n exemplaires d'un jeton, n = réponse numérique (+ plus fixes) — report des sangs de COB
  | { op: "chaosSet"; byDifficulty: Record<Difficulty, Token[]>; log?: string }    // remplace tout le sac (mode autonome de COB II : encart p. 15)
  | { op: "chaosRemove"; tokens: Token[]; log?: string }   // retire un exemplaire de chaque jeton listé (jetons retirés « pour le reste de la campagne »)
  | { op: "leadsDeck"; suspects: string[]; hideouts: string[]; secret: string; pile: string; log?: string }
    // The Vanishing of Elina Harper : un suspect et une cachette tirés au hasard vont face cachée dans la pile `secret`
    // (sous la carte de référence, sans être regardés) ; les autres forment la pile `pile` (Leads deck), mélangée
  | { op: "reminder"; text: string }                                    // encart éphémère + journal
  | { op: "branch"; on: string; cases: Record<string, SetupStep[]>; log?: string }   // on = id de question ou "players"
    | { op: "remove"; codes: string[]; n?: number; log?: string }   // retire de la partie — toutes les copies restantes de chaque code ; avec n (un seul code) : seulement n exemplaires (COB III : 2 des 6 Suspicious Guests)
  | { op: "toPile"; pile: string; set?: string; codes?: string[]; shuffle?: boolean; log?: string }
  | { op: "spawn"; code: string; at: string; log?: string }
  | { op: "setStart"; code: string; log?: string }
  | { op: "minis"; code: string; log?: string }   // pions de tous les enquêteurs sur une carte en jeu : un lieu, ou un véhicule (Fishing Vessel)
  | { op: "aside"; codes?: string[]; sets?: string[]; faceUp?: boolean; side?: "a" | "b"; log?: string }   // codes (répétés selon la quantité) ou sets entiers ; `side: "b"` = mise de côté sur son verso lié (Angry Mob)
  | { op: "barriers"; pairs: { a: string; b: string; n: number }[]; log?: string }   // barrières (jetons ressource) entre deux lieux adjacents (In Too Deep)
  | { op: "placeKey"; color: string; at?: string; atRandom?: string[]; faceUp?: boolean; log?: string }
    // une clé de couleur posée sur une carte en jeu (code) — ou sur un lieu tiré au hasard parmi `atRandom` (mode autonome)
  | { op: "dealToSeats"; from: string[]; n: number; rows: { x: number; y: number; dx?: number }[]; start?: boolean; log?: string }
    // n cartes tirées au hasard dans from, distribuées une à une aux enquêteurs dans l'ordre des joueurs
    // (principal d'abord) ; rangée i = i-ème enquêteur servi ; le reste est retiré ; start : chacun commence
    // sur l'une de ses cartes, tirée au hasard, révélée, avec son pion dessus
  | { op: "story"; log?: string }
  | { op: "buildEncounter"; split?: { trait: string; pile: string }[]; log?: string }   // split : les cartes portant le trait vont dans cette pile (mélangée)
  | { op: "layeredPile"; pile: string; pool: string[]; layers: { n?: number; with?: string[] }[]; log?: string }
    // pile construite par couches, du dessus vers le dessous : chaque couche prend les codes `with` (imposés) plus
    // `n` cartes tirées au hasard dans ce qui reste de `pool`, puis est mélangée ; tout le pool doit être consommé
  | { op: "keys"; tokens?: string[]; colors?: string[]; faceUp?: boolean; fillAsideTo?: number; log?: string }
    // clés mises de côté, cartes `key-<x>` déplaçables : `tokens` = jetons du chaos pris dans la collection (TCU), `colors` = clés de
    // couleur à deux faces (TIC : red, blue, green, yellow, purple, black, white) ; faceUp false = face cachée, ordre mélangé (on ne sait pas laquelle est laquelle) ;
    // `fillAsideTo: n` : parmi `colors`, tirées au hasard, juste assez pour que n clés face cachée soient de côté (les autres ne servent pas)
  | { op: "randomKey"; at: string; log?: string }   // une clé de côté face cachée, tirée au hasard, posée sur une carte en jeu sans être regardée (journal muet sur sa couleur)
  | { op: "addClues"; code: string; n: number; log?: string }                  // indices fixes sur un lieu en jeu (révélé ou non)
  | { op: "removeClues"; from: string[]; n?: number; nFrom?: string; log?: string }   // retire n indices (ou la réponse numérique nFrom) aussi également que possible
  | { op: "bury"; fromDeckTop?: number; with?: string[]; trait: string; dy?: number; log?: string }
    // cartes enfouies face cachée sous les lieux du trait donné (« Lair ») : les `with` (codes, prises où
    // qu'elles soient — de côté après un aside) + les `fromDeckTop` premières cartes de la pioche de
    // rencontre, mélangées puis réparties aussi également que possible ; journal muet sur qui va où
  | { op: "log"; text: string }
  | { op: "hook"; name: string; log?: string };

// Condition composée sur les réponses du lobby (op « when ») : réponse égale, tout, au moins un, au moins n, non.
export type Cond =
  | { q: string; is: string }
  | { q: string; has: string }   // question à cases à cocher (type "multi") : l'option est cochée
  | { all: Cond[] }
  | { any: Cond[] }
  | { atLeast: number; of: Cond[] }
  | { not: Cond };

export type Answers = Record<string, string | string[]>;

/** Effets mécaniques déclarés d'un changement d'étape (agenda ou acte), appliqués dans l'ordre des champs ci-dessous ;
 *  chaque effet est idempotent (une carte déjà en jeu n'est pas reposée) — la part qui dépend d'un choix reste un rappel. */
export type StageEffects = {
  flood?: { trait?: string; mode: "increase" | "full"; scope?: "all" | "revealed" };   // inondation des lieux (du trait, tous ou révélés)
  shuffleAside?: string[]; withDiscard?: boolean;                       // cartes de côté (et la défausse) mélangées dans la pioche
  revealCodes?: string[];                                               // lieux du tapis révélés (indices, marée)
  placeBelow?: { code: string; at: string }[];                          // une carte de côté posée non révélée juste en dessous d'un lieu du tapis
  fillRows?: { pile: string; anchors: string[]; columns: number[]; count: number };
    // rangée de chaque lieu-ancre complétée à `count` lieux avec les premières cartes de la pile, aux colonnes libres, non révélées
  removeTrait?: string;                                                 // les lieux de ce trait quittent la partie (victoire si Victory X sans indice)
  removeLocations?: { trait?: string; except?: string[]; codes?: string[] };   // idem, par trait et/ou sauf ces codes (« chaque lieu autre que… »), ou ces seuls codes
  spreadPile?: { pile: string; positions: { x: number; y: number }[]; flood?: 1 | 2 };   // les cartes d'une pile entrent en jeu non révélées aux positions données (une par position), inondées si demandé
  byPlayers?: Record<string, StageEffects>;                             // variante selon le nombre de joueurs ("1"…"4"), appliquée à sa place dans l'ordre
  placeAt?: { code: string; x: number; y: number; faceUp?: boolean; flood?: 1 | 2 }[];   // une carte de côté posée à une position (révélée ou non, inondée)
  chaosAdd?: Token[]; chaosRemove?: Token[];                            // jetons ajoutés au sac / retirés (un exemplaire chacun)
  spawnAside?: SpawnAside | SpawnAside[];                               // une carte (de côté d'abord, sinon déjà en jeu) apparaît sur un lieu (code) — ou plusieurs
  randomKeyOn?: string;                                                 // une clé cachée au hasard posée sur cette carte
  discardEnemies?: true;                                                // « chaque ennemi en jeu est défaussé » : ennemis de rencontre du tapis et des zones de menace → défausse
  discardAside?: { code: string; n?: number }[];                        // copies de côté de ce code placées dans la défausse de rencontre (n au plus, toutes par défaut)
  setAside?: string[];                                                  // ces cartes, où qu'elles soient (jeu, défausse, victoire), reviennent de côté soignées (« set aside, out of play »)
  discardAt?: string[];                                                 // les cartes de rencontre posées sur ces lieux du tapis (attaches, traîtrises, ennemis) vont à la défausse — à écrire avant un removeLocations
  addClues?: { code: string; n: number; perInvestigator?: boolean }[];   // indices posés sur un lieu du tapis (n, ou n par enquêteur)
  log?: string;
};
export type SpawnAside = { code: string; at: string; side?: "a" | "b" };

export function evalCond(c: Cond, answers: Answers): boolean {
  if ("q" in c && "has" in c) { const r = answers[c.q]; return Array.isArray(r) && r.includes(c.has); }
  if ("q" in c) return String(answers[c.q]) === c.is;
  if ("all" in c) return c.all.every((k) => evalCond(k, answers));
  if ("any" in c) return c.any.some((k) => evalCond(k, answers));
  if ("atLeast" in c) return c.of.filter((k) => evalCond(k, answers)).length >= c.atLeast;
  return !evalCond(c.not, answers);
}

// Question au lobby : à choix (options), numérique (type "number", bornes min/max, valeur par défaut) ou à cases à cocher
// (type "multi" : la réponse est la liste des options cochées, éventuellement vide — cond `{ q, has }`).
export type Question = {
  id: string; text: string;
  options?: { id: string; label: string }[];
  type?: "number" | "multi"; min?: number; max?: number; default?: number;
};

/** Réponse valide ? (choix parmi les options, entier dans les bornes, ou liste d'options cochées) */
export function reponseValide(q: Question, r: unknown): boolean {
  if (q.type === "number") {
    const n = Number(r);
    return Number.isInteger(n) && n >= (q.min ?? 0) && n <= (q.max ?? Number.MAX_SAFE_INTEGER);
  }
  if (q.type === "multi") return Array.isArray(r) && r.every((x) => (q.options ?? []).some((o) => o.id === x)) && new Set(r).size === r.length;
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
  scenarioCardSide?: Record<Difficulty, "a" | "b">;   // face de la carte de scénario selon la difficulté (COB : référence Easy/Standard au recto, Hard/Expert au verso) ; défaut « b »
  extraCards?: string[];
  piles?: { id: string; label: string; discard?: string; isDiscard?: boolean; trait?: string; gather?: { backName: string }; around?: boolean; menuFor?: CardKind[] }[];
    // piles supplémentaires : pioche déclarée (ex. « Cultist deck »), ou seconde pioche de rencontre avec sa défausse
    // (`discard` = id de la défausse, `isDiscard` sur celle-ci) ; `trait` : les cartes portant ce trait vont dans
    // cette pioche/défausse par défaut (The Wages of Sin : pioche et défausse spectrales) ;
    // `gather` : la pile se forme en cours de partie (action formPile) avec les lieux de côté dont le côté non révélé porte ce nom
    // (« Tidal Tunnel ») ; `around` : ses lieux se posent autour d'un lieu du tapis (action placeAround : dessous, gauche, droite) ;
    // `menuFor` : le menu de ces cartes propose « Placer dans <label> » (« Profondeurs » de The Pit of Despair)
  backPlacement?: Record<string, { x: number; y: number }>;   // où un verso-lieu entre en jeu quand l'acte/agenda avance (défaut : centre)
  chaosBag: Record<Difficulty, Token[]>;
  layout: { code: string; x: number; y: number }[];
  setup: SetupStep[];
  questions: Question[];
  swaps?: { pair: [string, string]; labels: [string, string] }[];   // lieux qui se remplacent (normal ↔ Spectral), avec le libellé de chaque version
  mythosDoom?: boolean;     // false : la phase du mythe n'ajoute pas de doom automatiquement (brèches d'In the Clutches of Chaos)
  emptySpace?: boolean;     // le scénario pose des « espaces vides » (dos de carte joueur) : action emptySpace, menu des lieux (Before the Black Throne)
  barriers?: boolean;       // barrières entre lieux adjacents (In Too Deep) : action setBarrier, jetons sur les arêtes, menu des lieux « +1 barrière vers… »
  road?: { pile: string; longWay: string };
    // Road X (Horror in High Gear) : action roadAhead {id, n} — la première carte de la pile `pile` + (n − 1) cartes de côté de code
    // `longWay`, mélangées, entrent en jeu non révélées dans une nouvelle colonne devant le lieu ; menu du lieu « Road X : 1 2 3 »
  flood?: { byAgenda?: Record<string, { all?: "increase" | "full"; onReveal?: 0 | 1 | 2 }>; onRevealByCode?: Record<string, 1 | 2> };
    // `onRevealByCode[code]` : ce lieu monte d'un niveau (1) ou est totalement inondé (2) à sa révélation — texte imprimé du lieu
    // (Devil Reef), même sémantique que la règle de marée `onReveal`
  agendaEffects?: Record<string, StageEffects>;   // clé "<stage>" : quand l'agenda `stage` devient courant ; clé "after:<code>" : quand la carte
  actEffects?: Record<string, StageEffects>;      // <code> quitte l'histoire (son verso résolu) — utile quand deux versions d'un agenda diffèrent
  leads?: {
    pile: string; secret: string; shown: string;   // piles : Leads deck, cartes cachées sous la référence, pistes révélées par le Parley
    reference: string;                              // carte de référence (story) : Finding Agent Harper
    suspects: string[]; hideouts: string[];         // codes des six suspects et des six cachettes
    spots: { x: number; y: number }[];              // emplacements des cachettes sur la grille (ordre de lecture)
    elina: string; square: string; act2: string; agenda3: string;   // cartes de l'accusation : Elina Harper, lieu de l'ennemi, acte et agenda de côté
  };
    // jetons d'inondation (The Innsmouth Conspiracy) : menus des lieux, panneau « Marée » ; `byAgenda[stage]` = quand cet agenda devient
    // courant, tous les lieux révélés montent d'un niveau (`increase`) ou sont totalement inondés (`full`), et `onReveal` devient la règle
    // appliquée à chaque révélation de lieu (0 rien, 1 + un niveau, 2 totalement)
  seal?: { token: Token; label: string; counter: string; maxPerSeat: number; maxTotal?: number };
    // scellage de jetons du chaos sur les enquêteurs (COB : jetons sang) : actions chaosSeal / chaosRelease —
    // le jeton passe du sac (ou des tirés) au compteur de siège `counter` et inversement ; `maxPerSeat` borne
    // le compteur (règle imprimée), `maxTotal` borne sac + scellés pour chaosAdjust
  bury?: { withAny: string[]; fromDeckTop: number; trait: string; dy?: number; menuPile: string; menuCard: string };
  cardSeal?: boolean;
    // scellage de jetons du chaos SUR les cartes (COB III, codex des invités) : actions chaosSealCard /
    // chaosReleaseCard — le jeton tiré (ou du sac) se pose sur la carte et y reste jusqu'à libération ;
    // défausser la carte ou l'envoyer en zone de victoire rend ses jetons au sac
    // enfouissement en cours de partie (COB) : action `bury` sur la pioche de rencontre (les `withAny`
    // présentes en jeu/de côté + fromDeckTop cartes, réparties sous les lieux du trait) et action `buryAt`
    // sur une carte de `withAny` (elle + 1 carte de la pioche, sous son lieu) ; libellés des menus du front
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
