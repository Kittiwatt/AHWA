// Mise en place automatique (cahier des charges §5 « SetupStep » et §1 « Setup »).
// runSetup() transforme l'état « lobby » en état de jeu : cartes créées, lieux posés, cartes de
// côté, agenda/acte, pioche de rencontre mélangée, sac du chaos, pions des enquêteurs, journal.
// Pure : ne dépend que de l'état, de la définition du scénario et d'une source d'aléa.

import type { CardId, CardState, LogEntry, RoomState, ZoneId } from "./state";
import { LOG_MAX } from "./state";
import type { ScenarioCard, ScenarioDef, SetupStep } from "./scenario";

export type Rng = () => number;

export const SEAT_ZONES: ZoneId[] = ["seat0", "seat1", "seat2", "seat3"];
export const CARD_W = 126;
export const CARD_H = 178;
export const MINI = 44;
const ASIDE_GAP = 10;

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function nextZ(state: RoomState): number {
  let z = 0;
  for (const c of Object.values(state.cards)) if ("zone" in c.loc && c.loc.z > z) z = c.loc.z;
  return z + 1;
}

export function addLog(state: RoomState, kind: LogEntry["kind"], text: string, seat?: number): LogEntry {
  const entry: LogEntry = { at: Date.now(), kind, text };
  if (seat !== undefined) entry.seat = seat;
  state.log.push(entry);
  if (state.log.length > LOG_MAX) state.log.splice(0, state.log.length - LOG_MAX);
  return entry;
}

function nomDe(def: ScenarioDef, code: string): string {
  return def.cards.find((c) => c.code === code)?.name ?? code;
}

export function clueValue(card: ScenarioCard | undefined, playerCount: number): number {
  if (!card?.clue) return 0;
  return card.clue.perInvestigator ? card.clue.value * playerCount : card.clue.value;
}

/** Révèle un lieu (face visible) et y pose ses indices selon le nombre d'enquêteurs. */
export function revealLocation(state: RoomState, def: ScenarioDef, card: CardState): number {
  card.faceUp = true;
  const n = clueValue(def.cards.find((c) => c.code === card.code), state.playerCount);
  if (n > 0) card.tokens.clue = (card.tokens.clue ?? 0) + n;
  return n;
}

class Pool {
  private byCode = new Map<string, CardId[]>();
  private defs = new Map<string, ScenarioCard>();
  constructor(def: ScenarioDef) {
    for (const c of def.cards) {
      this.defs.set(c.code, c);
      this.byCode.set(c.code, Array.from({ length: c.qty }, (_, i) => (c.qty === 1 ? c.code : `${c.code}-${i + 1}`)));
    }
  }
  def(code: string): ScenarioCard {
    const d = this.defs.get(code);
    if (!d) throw new Error(`setup : code ${code} inconnu du scénario`);
    return d;
  }
  take(code: string): CardId {
    const ids = this.byCode.get(code);
    if (!ids?.length) throw new Error(`setup : plus d'exemplaire de ${code}`);
    return ids.shift()!;
  }
  takeAll(code: string): CardId[] {
    const ids = this.byCode.get(code) ?? [];
    this.byCode.set(code, []);
    return ids;
  }
  remaining(): { code: string; ids: CardId[] }[] {
    return [...this.byCode.entries()].filter(([, ids]) => ids.length).map(([code, ids]) => ({ code, ids }));
  }
}

function newCard(pool: Pool, code: string, id: CardId, loc: CardState["loc"], faceUp: boolean): CardState {
  const d = pool.def(code);
  return { id, code, kind: d.kind, storyBack: d.storyBack, loc, faceUp, exhausted: false, side: "a", tokens: {} };
}

export type Answers = Record<string, string>;

export function runSetup(state: RoomState, def: ScenarioDef, rng: Rng = Math.random, answers: Answers = {}): LogEntry[] {
  const seated = state.seats.filter((s) => s.investigatorCode);
  if (seated.length === 0) throw new Error("aucun enquêteur choisi");
  for (const q of def.questions) {
    if (!q.options.some((o) => o.id === answers[q.id])) throw new Error(`question sans réponse : ${q.id}`);
  }

  // Table vierge (une réinitialisation a pu laisser des cartes).
  state.cards = {};
  state.piles = { encounter: [], encounterDiscard: [], removed: [], agendaDeck: [], actDeck: [] };
  for (const p of def.piles ?? []) state.piles[p.id] = [];
  state.links = [];
  state.extraDefs = {};
  state.chaos = { bag: [...def.chaosBag[state.difficulty]], drawn: [], sealed: [] };
  state.counters = Object.fromEntries(def.tableCounters.map((c) => [c.key, c.initial]));
  state.agendaId = null;
  state.actId = null;
  state.log = [];
  state.turn = { seat: null, done: [] };
  state.playerCount = seated.length;
  if (state.lead === null || !state.seats[state.lead].investigatorCode) state.lead = seated[0].index;

  for (const s of state.seats) {
    s.counters.clues = 0;
    s.counters.actions = 3;
    for (const c of def.seatCounters) s.counters[c.key] = c.initial;
  }

  const pool = new Pool(def);
  let z = 1;
  const reminders: LogEntry[] = [];
  const slots = new Map<string, CardId>();   // « slot:<nom> » → carte choisie (pickRandom, setStart)
  const resoudre = (ref: string): CardId => {
    if (!ref.startsWith("slot:")) return ref;
    const id = slots.get(ref.slice(5));
    if (!id) throw new Error(`setup : ${ref} non défini`);
    return id;
  };
  const enJeu = (ref: string): CardState => {
    const id = resoudre(ref);
    const c = state.cards[id] ?? Object.values(state.cards).find((k) => k.code === id && "zone" in k.loc);
    if (!c || !("zone" in c.loc)) throw new Error(`setup : ${ref} n'est pas en jeu`);
    return c;
  };

  addLog(state, "setup", `Mise en place de « ${def.title} » pour ${state.playerCount} enquêteur${state.playerCount > 1 ? "s" : ""}, difficulté ${state.difficulty}.`);
  for (const q of def.questions) {
    const opt = q.options.find((o) => o.id === answers[q.id])!;
    addLog(state, "setup", `${q.text} ${opt.label}.`);
  }

  // Cartes et pions des enquêteurs.
  for (const s of seated) {
    const zone = SEAT_ZONES[s.index];
    state.cards[`inv-${s.index}`] = {
      id: `inv-${s.index}`, code: s.investigatorCode!, kind: "investigator", storyBack: false,
      loc: { zone, x: 0, y: 0, z: z++ }, faceUp: true, exhausted: false, side: "a", tokens: {}, ownerSeat: s.index,
    };
  }

  const placeMinis = (ref: string) => {
    const lieu = enJeu(ref);
    seated.forEach((s, i) => {
      state.cards[`mini-${s.index}`] = {
        id: `mini-${s.index}`, code: s.investigatorCode!, kind: "mini", storyBack: false,
        // Rangée de pions (44 px) à cheval sur le bord haut du lieu ; les indices restent visibles en bas à droite.
        loc: { zone: "board", x: (lieu.loc as { x: number }).x + 4 + i * MINI + i * 2, y: (lieu.loc as { y: number }).y - MINI / 2, z: z++ },
        faceUp: true, exhausted: false, side: "a", tokens: {}, ownerSeat: s.index,
      };
    });
  };

  const poser = (code: string, zone: ZoneId, x: number, y: number, faceUp: boolean, reveal: boolean | undefined, log: string | undefined) => {
    const id = pool.take(code);
    const card = newCard(pool, code, id, { zone, x, y, z: z++ }, faceUp);
    state.cards[id] = card;
    let texte = log ?? `${pool.def(code).name} est mis en jeu.`;
    if (reveal && card.kind === "location") {
      const n = revealLocation(state, def, card);
      if (n > 0) texte += ` ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}.`;
    }
    addLog(state, "setup", texte);
    return card;
  };
  const retirer = (code: string) => {
    for (const id of pool.takeAll(code)) {
      state.cards[id] = newCard(pool, code, id, { pile: "removed" }, false);
      state.piles.removed.push(id);
    }
  };

  const run = (step: SetupStep) => {
    switch (step.op) {
      case "place": {
        poser(resoudre(step.code), step.zone, step.x, step.y, step.faceUp ?? false, step.reveal, step.log);
        break;
      }
      case "pickRandom": {
        const n = step.n ?? 1;
        const choix = shuffle([...step.from], rng).slice(0, n);
        const noms = choix.map((c) => pool.def(c).name);
        for (const code of step.from) if (!choix.includes(code)) retirer(code);
        if (step.zone !== undefined && step.x !== undefined && step.y !== undefined) {
          choix.forEach((code, i) => {
            const card = poser(code, step.zone!, step.x! + i * (CARD_W + 32), step.y!, step.faceUp ?? false, false, step.log ?? `${pool.def(code).name} tiré au hasard et mis en jeu.`);
            if (step.slot && i === 0) slots.set(step.slot, card.id);
          });
        } else if (step.slot) {
          slots.set(step.slot, choix[0]);
          addLog(state, "setup", step.log ?? `Tirage au hasard : ${noms.join(", ")}.`);
        }
        break;
      }
      case "branch": {
        const cle = step.on === "players" ? String(state.playerCount) : answers[step.on];
        const suite = step.cases[cle] ?? step.cases["default"] ?? [];
        if (step.log) addLog(state, "setup", step.log);
        for (const sub of suite) run(sub);
        break;
      }
      case "remove": {
        for (const code of step.codes) retirer(code);
        addLog(state, "setup", step.log ?? `${step.codes.map((c) => pool.def(c).name).join(", ")} : retiré de la partie.`);
        break;
      }
      case "toPile": {
        if (!(step.pile in state.piles)) state.piles[step.pile] = [];
        const codes = step.codes ?? def.cards.filter((c) => c.set === step.set).map((c) => c.code);
        const ids: CardId[] = [];
        for (const code of codes) {
          for (const id of pool.takeAll(code)) {
            state.cards[id] = newCard(pool, code, id, { pile: step.pile }, false);
            ids.push(id);
          }
        }
        state.piles[step.pile].push(...(step.shuffle ? shuffle(ids, rng) : ids));
        addLog(state, "setup", step.log ?? `${ids.length} cartes dans la pile ${step.pile}.`);
        break;
      }
      case "spawn": {
        const lieu = enJeu(step.at);
        const lx = (lieu.loc as { x: number }).x, ly = (lieu.loc as { y: number }).y;
        const deja = Object.values(state.cards).filter((k) => k.kind !== "mini" && k.kind !== "location" && "zone" in k.loc && k.loc.zone === "board"
          && Math.abs(k.loc.x - lx) < CARD_W && Math.abs(k.loc.y - ly) < CARD_H).length;
        poser(step.code, "board", lx + 36 + deja * 18, ly + 46 + deja * 18, true, false,
          step.log ?? `${pool.def(step.code).name} apparaît à ${nomDe(def, lieu.code)}.`);
        break;
      }
      case "setStart": {
        slots.set("start", resoudre(step.code));
        break;
      }
      case "minis": {
        placeMinis(step.code);
        addLog(state, "setup", step.log ?? `Les pions des enquêteurs sont posés sur ${nomDe(def, enJeu(step.code).code)}.`);
        break;
      }
      case "log": {
        addLog(state, "setup", step.text);
        break;
      }
      case "aside": {
        const deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
        step.codes.forEach((code, i) => {
          const id = pool.take(code);
          state.cards[id] = newCard(pool, code, id, { zone: "aside", x: (deja + i) * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, step.faceUp ?? false);
        });
        addLog(state, "setup", step.log ?? `${step.codes.map((c) => pool.def(c).name).join(", ")} : de côté, hors jeu.`);
        break;
      }
      case "story": {
        const sc = pool.take(def.scenarioCard);
        const cs = newCard(pool, def.scenarioCard, sc, { zone: "story", x: 0, y: 0, z: z++ }, true);
        cs.side = "b"; // verso = référence des jetons du chaos, la face utile en jeu
        state.cards[sc] = cs;
        def.agendaDeck.forEach((code, i) => {
          const id = pool.take(code);
          if (i === 0) {
            state.cards[id] = newCard(pool, code, id, { zone: "story", x: 0, y: 0, z: z++ }, true);
            state.cards[id].tokens.doom = 0;
            state.agendaId = id;
          } else {
            state.cards[id] = newCard(pool, code, id, { pile: "agendaDeck" }, false);
            state.piles.agendaDeck.push(id);
          }
        });
        def.actDeck.forEach((code, i) => {
          const id = pool.take(code);
          if (i === 0) {
            state.cards[id] = newCard(pool, code, id, { zone: "story", x: 0, y: 0, z: z++ }, true);
            state.actId = id;
          } else {
            state.cards[id] = newCard(pool, code, id, { pile: "actDeck" }, false);
            state.piles.actDeck.push(id);
          }
        });
        addLog(state, "setup", step.log ?? `Agenda 1 et acte 1 sont en place.`);
        break;
      }
      case "buildEncounter": {
        const ids: CardId[] = [];
        for (const { code, ids: restants } of pool.remaining()) {
          const d = pool.def(code);
          if (d.kind === "enemy" || d.kind === "treachery") {
            for (const id of pool.takeAll(code)) {
              state.cards[id] = newCard(pool, code, id, { pile: "encounter" }, false);
              ids.push(id);
            }
          } else {
            void restants;
          }
        }
        state.piles.encounter = shuffle(ids, rng);
        addLog(state, "setup", step.log ?? `Pioche de rencontre mélangée : ${ids.length} cartes.`);
        break;
      }
      case "hook":
        throw new Error(`setup : hook « ${step.name} » non pris en charge en v1`);
    }
  };

  for (const step of def.setup) run(step);

  // Tout ce qui n'a pas été posé ni mélangé est retiré de la partie (jamais affiché).
  for (const { code, ids } of pool.remaining()) {
    for (const id of pool.takeAll(code)) {
      state.cards[id] = newCard(pool, code, id, { pile: "removed" }, false);
      state.piles.removed.push(id);
    }
  }

  addLog(state, "setup", `Sac du chaos (${state.difficulty}) : ${state.chaos.bag.length} jetons.`);

  // La partie commence : la phase du mythe est sautée à la première manche.
  state.round = 1;
  state.phase = "investigation";
  addLog(state, "phase", "Manche 1 : la phase du mythe est sautée, la partie commence par la phase des enquêteurs.");

  for (const r of def.reminders) if (r.when === "setup") reminders.push(addLog(state, "reminder", r.text));
  return reminders;
}
