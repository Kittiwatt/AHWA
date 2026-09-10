// Mise en place automatique (cahier des charges §5 « SetupStep » et §1 « Setup »).
// runSetup() transforme l'état « lobby » en état de jeu : cartes créées, lieux posés, cartes de
// côté, agenda/acte, pioche de rencontre mélangée, sac du chaos, pions des enquêteurs, journal.
// Pure : ne dépend que de l'état, de la définition du scénario et d'une source d'aléa.

import type { CardId, CardState, LogEntry, RoomState, ZoneId } from "./state";
import { LOG_MAX } from "./state";
import type { ScenarioCard, ScenarioDef, SetupStep } from "./scenario";
import { evalCond, reponseValide } from "./scenario";

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

export const LIBELLES_CLES: Record<string, string> = {
  skull: "Crâne", cultist: "Cultiste", tablet: "Tablette", elder_thing: "Ancien",
  // Clés de couleur à deux faces (The Innsmouth Conspiracy).
  red: "rouge", blue: "bleue", green: "verte", yellow: "jaune", purple: "violette", black: "noire", white: "blanche",
};
export const COULEURS_CLES = ["red", "blue", "green", "yellow", "purple", "black", "white"];

/** Une clé de couleur (retournable) ou un jeton du chaos utilisé comme clé (jamais retourné) ? */
export function cleDeCouleur(card: CardState): boolean {
  return card.kind === "key" && COULEURS_CLES.includes(card.code.replace(/^key:/, ""));
}

/** Niveaux d'inondation d'un lieu (The Innsmouth Conspiracy) : 0 sec, 1 partiellement, 2 totalement inondé. */
export const LIBELLES_INONDATION = ["sec", "partiellement inondé", "totalement inondé"];

/** Applique la règle de marée en cours (state.flood.onReveal) à un lieu qui vient d'être révélé ; renvoie son nouveau niveau ou null. */
export function inonderALaRevelation(state: RoomState, card: CardState, def?: ScenarioDef): number | null {
  // Règle de marée en cours, ou règle imprimée sur ce lieu (`flood.onRevealByCode`) : la plus forte l'emporte.
  const regle = Math.max(state.flood?.onReveal ?? 0, def?.flood?.onRevealByCode?.[card.code] ?? 0);
  if (!regle) return null;
  const niveau = regle === 2 ? 2 : Math.min(2, (card.tokens.flood ?? 0) + 1);
  if (niveau === (card.tokens.flood ?? 0)) return null;
  card.tokens.flood = niveau;
  return niveau;
}

/** Nom de la face actuellement visible : le verso (backName) quand il est montré, sinon le recto.
 *  `extraDefs` (cartes générées, cartes des decks joueur) complète les cartes du scénario. */
export function nomVisible(def: ScenarioDef, card: CardState, extraDefs?: Record<string, unknown>): string {
  // Une clé de couleur face cachée garde son secret (toutes ont le même dos).
  if (card.kind === "key") return !card.faceUp && cleDeCouleur(card) ? "clé face cachée" : `clé ${LIBELLES_CLES[card.code.replace(/^key:/, "")] ?? card.code}`;
  if (card.kind === "proxy" && card.code === "empty:space") return "espace vide";
  const d = def.cards.find((c) => c.code === card.code) ?? (extraDefs?.[card.code] as ScenarioCard | undefined);
  if (!d) return card.code;
  const versoVisible = card.faceUp ? card.side === "b" : !card.storyBack;
  return versoVisible ? d.backName ?? d.name : d.name;
}

function nomSiege(state: RoomState, index: number): string {
  return state.seats[index].name ?? `Siège ${index + 1}`;
}

export function clueValue(card: ScenarioCard | undefined, playerCount: number): number {
  if (!card?.clue) return 0;
  return card.clue.perInvestigator ? card.clue.value * playerCount : card.clue.value;
}

/** Révèle un lieu (face visible) et y pose ses indices selon le nombre d'enquêteurs ; la marée en cours (TIC) s'applique. */
export function revealLocation(state: RoomState, def: ScenarioDef, card: CardState): number {
  card.faceUp = true;
  const n = clueValue(def.cards.find((c) => c.code === card.code), state.playerCount);
  if (n > 0) card.tokens.clue = (card.tokens.clue ?? 0) + n;
  inonderALaRevelation(state, card, def);
  return n;
}

/** Suffixe de journal quand la révélation vient d'inonder un lieu : marée en cours ou texte imprimé du lieu. */
export function texteMaree(state: RoomState, def: ScenarioDef, card: CardState): string {
  if (!card.tokens.flood) return "";
  if (def.flood?.onRevealByCode?.[card.code]) return `, ${LIBELLES_INONDATION[card.tokens.flood]} (texte du lieu)`;
  return state.flood?.onReveal ? `, ${LIBELLES_INONDATION[card.tokens.flood]} (marée)` : "";
}

/** Pose une clé sur une carte du tapis : à cheval sur son bord gauche, la i-ème sous les précédentes. */
export function poserCleSur(state: RoomState, key: CardState, cible: CardState, z: number) {
  const loc = cible.loc as { x: number; y: number };
  const deja = Object.values(state.cards).filter((k) => k.kind === "key" && k.id !== key.id && "zone" in k.loc && k.loc.zone === "board"
    && Math.abs(k.loc.x - (loc.x - MINI / 2 + 6)) < 4 && k.loc.y >= loc.y && k.loc.y < loc.y + CARD_H).length;
  key.loc = { zone: "board", x: loc.x - MINI / 2 + 6, y: loc.y + 40 + deja * (MINI + 2), z };
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
  has(code: string): boolean {
    return (this.byCode.get(code)?.length ?? 0) > 0;
  }
  count(code: string): number {
    return this.byCode.get(code)?.length ?? 0;
  }
  takeAll(code: string): CardId[] {
    const ids = this.byCode.get(code) ?? [];
    this.byCode.set(code, []);
    return ids;
  }
  /** Rend des exemplaires pris (dans l'ordre), en tête de leur code : le prochain take les reprend. */
  giveBack(cards: { code: string; id: CardId }[]) {
    for (const { code, id } of [...cards].reverse()) this.byCode.get(code)!.unshift(id);
  }
  remaining(): { code: string; ids: CardId[] }[] {
    return [...this.byCode.entries()].filter(([, ids]) => ids.length).map(([code, ids]) => ({ code, ids }));
  }
}

/** Enfouit face cachée « sous » des lieux (COB) : les instances `avec` + les `fromDeckTop` premières cartes de
 *  la pioche de rencontre (défausse remélangée si besoin), mélangées, puis réparties aussi également que
 *  possible entre les lieux en jeu portant `trait` — ou toutes sous `cible` (effet Forcé). La carte enfouie
 *  dépasse du bas du lieu (elle le suit s'il est déplacé : son centre est dessus) ; jetons et épuisement
 *  effacés ; le journal reste muet sur qui va où. Renvoie le nombre de cartes enfouies. */
export function enfouir(state: RoomState, def: ScenarioDef, rng: Rng,
  opts: { avec: string[]; fromDeckTop: number; trait: string; dy?: number; cible?: CardState; cibles?: CardState[] }): number {
  const DY = opts.dy ?? 42;
  const traitsDe = (code: string) => def.cards.find((k) => k.code === code)?.traits ?? [];
  const lieux = opts.cible ? [opts.cible] : (opts.cibles ?? Object.values(state.cards)
    .filter((c) => c.kind === "location" && "zone" in c.loc && c.loc.zone === "board" && traitsDe(c.code).includes(opts.trait)))
    .sort((a, b) => (a.loc as { y: number }).y - (b.loc as { y: number }).y || (a.loc as { x: number }).x - (b.loc as { x: number }).x);
  if (!lieux.length) throw new Error(`aucun lieu « ${opts.trait} » en jeu`);
  const enfouisA = (L: CardState) => Object.values(state.cards).filter((c) =>
    c.kind !== "location" && c.kind !== "mini" && !c.faceUp && "zone" in c.loc && c.loc.zone === "board"
    && Math.abs(c.loc.y - ((L.loc as { y: number }).y + DY)) < 30
    && c.loc.x >= (L.loc as { x: number }).x - 12 && c.loc.x < (L.loc as { x: number }).x + CARD_W).length;
  const pris: string[] = [];
  for (let k = 0; k < opts.fromDeckTop; k++) {
    if (!state.piles.encounter.length && state.piles.encounterDiscard?.length) {
      const d = state.piles.encounterDiscard.splice(0);
      for (const id of d) state.cards[id].faceUp = false;
      state.piles.encounter.push(...shuffle(d, rng));
      addLog(state, "action", "Pioche de rencontre vide : la défausse est remélangée.");
    }
    const id = state.piles.encounter.shift();
    if (!id) break;   // plus rien à piocher : on enfouit ce qu'on a
    pris.push(id);
  }
  for (const id of shuffle([...opts.avec, ...pris], rng)) {
    const c = state.cards[id];
    for (const pile of Object.values(state.piles)) { const i = pile.indexOf(id); if (i >= 0) pile.splice(i, 1); }
    const L = opts.cible ?? lieux.slice().sort((a, b) => enfouisA(a) - enfouisA(b))[0];
    const k = enfouisA(L);
    c.tokens = {}; c.exhausted = false; c.faceUp = false;
    // Sous le lieu au sens propre : z juste inférieur à celui du repaire, la carte glisse dessous et seul son bas dépasse.
    c.loc = { zone: "board", x: (L.loc as { x: number }).x + 10 + k * 26, y: (L.loc as { y: number }).y + DY, z: Math.max(0, ((L.loc as { z?: number }).z ?? 1) - 1) };
  }
  return opts.avec.length + pris.length;
}

function newCard(pool: Pool, code: string, id: CardId, loc: CardState["loc"], faceUp: boolean): CardState {
  const d = pool.def(code);
  return { id, code, kind: d.kind, storyBack: d.storyBack, loc, faceUp, exhausted: false, side: "a", tokens: {} };
}

export type Answers = Record<string, string | string[]>;

export function runSetup(state: RoomState, def: ScenarioDef, rng: Rng = Math.random, answers: Answers = {}): LogEntry[] {
  const seated = state.seats.filter((s) => s.investigatorCode);
  if (seated.length === 0) throw new Error("aucun enquêteur choisi");
  for (const q of def.questions) {
    if (!reponseValide(q, answers[q.id])) throw new Error(`question sans réponse : ${q.id}`);
  }

  // Table vierge (une réinitialisation a pu laisser des cartes).
  state.cards = {};
  state.piles = { encounter: [], encounterDiscard: [], removed: [], agendaDeck: [], actDeck: [] };
  for (const p of def.piles ?? []) state.piles[p.id] = []; // piles déclarées, même vides (défausse spectrale…)
  for (const p of def.piles ?? []) state.piles[p.id] = [];
  state.links = [];
  state.extraDefs = {};
  state.chaos = { bag: [...def.chaosBag[state.difficulty]], drawn: [], sealed: [] };
  state.counters = Object.fromEntries(def.tableCounters.map((c) => [c.key, c.initial]));
  state.agendaId = null;
  state.actId = null;
  delete state.leads;
  delete state.flood;
  delete state.barriers;
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
    const r = answers[q.id];
    const libelle = q.type === "number" ? String(Number(r))
      : q.type === "multi" ? ((Array.isArray(r) ? r : []).map((id) => q.options!.find((o) => o.id === id)?.label ?? id).join(", ") || "aucun")
      : q.options!.find((o) => o.id === r)!.label;
    addLog(state, "setup", `${q.text} ${libelle}.`);
  }

  // Cartes et pions des enquêteurs.
  for (const s of seated) {
    const zone = SEAT_ZONES[s.index];
    state.cards[`inv-${s.index}`] = {
      id: `inv-${s.index}`, code: s.investigatorCode!, kind: "investigator", storyBack: false,
      loc: { zone, x: 0, y: 0, z: z++ }, faceUp: true, exhausted: false, side: "a", tokens: {}, ownerSeat: s.index,
    };
  }

  // Pion d'un siège sur un lieu : rangée de pions (44 px) à cheval sur le bord haut du lieu, i-ème position ;
  // les indices restent visibles en bas à droite.
  const placeMini = (s: (typeof seated)[number], lieu: CardState, i: number) => {
    state.cards[`mini-${s.index}`] = {
      id: `mini-${s.index}`, code: s.investigatorCode!, kind: "mini", storyBack: false,
      loc: { zone: "board", x: (lieu.loc as { x: number }).x + 4 + i * MINI + i * 2, y: (lieu.loc as { y: number }).y - MINI / 2, z: z++ },
      faceUp: true, exhausted: false, side: "a", tokens: {}, ownerSeat: s.index,
    };
  };
  const placeMinis = (ref: string) => {
    const lieu = enJeu(ref);
    seated.forEach((s, i) => placeMini(s, lieu, i));
  };
  // Ordre des joueurs : l'enquêteur principal d'abord, puis les sièges dans l'ordre, en boucle.
  const ordreJoueurs = (): typeof seated => {
    const k = Math.max(0, seated.findIndex((s) => s.index === state.lead));
    return [...seated.slice(k), ...seated.slice(0, k)];
  };

  const poser = (code: string, zone: ZoneId, x: number, y: number, faceUp: boolean, reveal: boolean | undefined, log: string | undefined) => {
    const id = pool.take(code);
    const card = newCard(pool, code, id, { zone, x, y, z: z++ }, faceUp);
    state.cards[id] = card;
    let texte = log;
    if (reveal && card.kind === "location") {
      const n = revealLocation(state, def, card);
      texte ??= `${nomVisible(def, card)} est mis en jeu.`;
      if (n > 0) texte += ` ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}.`;
    }
    // Le journal nomme la face visible : un lieu posé face non révélée garde son secret (« Decrepit Door »).
    addLog(state, "setup", texte ?? `${nomVisible(def, card)} est mis en jeu.`);
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
        // « slot:<nom> » dans from = le code de la carte désignée par ce slot (tirage antérieur sans zone → code ; avec zone → carte).
        const codeDe = (ref: string): string => {
          if (!ref.startsWith("slot:")) return ref;
          const v = slots.get(ref.slice(5)) ?? "";
          return state.cards[v]?.code ?? v;
        };
        const candidats = [...new Set(step.from.map(codeDe))];
        // Un billet par exemplaire encore au pool de chaque code candidat : un code en plusieurs exemplaires peut sortir plusieurs
        // fois, et des tirages successifs sur les mêmes codes (anneaux du Blob) ne demandent jamais un exemplaire qui n'existe plus.
        const billets = candidats.flatMap((code) => Array.from({ length: pool.count(code) }, () => code));
        if (billets.length < n) throw new Error(`setup : pickRandom — ${n} carte${n > 1 ? "s" : ""} demandée${n > 1 ? "s" : ""}, ${billets.length} exemplaire${billets.length > 1 ? "s" : ""} au pool parmi ${candidats.join(", ")}`);
        // `include` : cartes imposées, mélangées avec les n tirées (« Research Site, Temporary HQ et 2 Quarantine Zones, mélangées »).
        const choix = shuffle([...(step.include ?? []).map(codeDe), ...shuffle(billets, rng).slice(0, n)], rng);
        const noms = choix.map((c) => pool.def(c).name);
        // Les cartes tirées sont prises dans le pool d'abord ; tout ce qui reste des codes candidats — non tirés, ou copies
        // restantes d'un code tiré — suit le sort `rest` (les cartes `include` n'en font pas partie).
        const tires = choix.map((code) => ({ code, id: pool.take(code) }));
        const restes = candidats.filter((code) => !(step.include ?? []).map(codeDe).includes(code));
        if (step.rest === "pile") {
          // Les cartes non tirées forment (ou rejoignent) une pile, ex. lieux pour « choisir un lieu au hasard ».
          const pile = step.restPile ?? "rest";
          if (!(pile in state.piles)) state.piles[pile] = [];
          for (const code of restes) for (const id of pool.takeAll(code)) { state.cards[id] = newCard(pool, code, id, { pile }, false); state.piles[pile].push(id); }
        } else if (step.rest === "aside") {
          // Les cartes non tirées sont mises de côté, hors jeu (face cachée), au lieu d'être retirées.
          let deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
          for (const code of restes) for (const id of pool.takeAll(code)) state.cards[id] = newCard(pool, code, id, { zone: "aside", x: deja++ * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, false);
        } else if (step.rest !== "keep") for (const code of restes) retirer(code);   // "keep" : les restes restent au pool (pioche de rencontre)
        // Les cartes tirées reprennent leur place dans le pool pour être posées par `poser` (ou rester tirables par un slot).
        pool.giveBack(tires);
        if (step.zone !== undefined && (step.positions || (step.x !== undefined && step.y !== undefined) || step.zone === "aside")) {
          // Avec un `log` du scénario : une seule ligne pour le tirage, sinon une ligne par carte (nom de la face visible).
          // Zone « aside » sans coordonnées : en fin de rangée de côté (« choose one at random and set it aside, without looking at it »).
          if (step.log) addLog(state, "setup", step.log);
          const dejaDeCote = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
          choix.forEach((code, i) => {
            const pos = step.positions ? step.positions[i % step.positions.length]
              : step.zone === "aside" && step.x === undefined ? { x: (dejaDeCote + i) * (CARD_W + ASIDE_GAP), y: 0 }
              : { x: step.x! + i * (CARD_W + 32), y: step.y! };
            const card = poser(code, step.zone!, pos.x, pos.y, step.faceUp ?? false, step.reveal, step.log ? "" : undefined);
            const derniere = state.log[state.log.length - 1];
            if (step.log) state.log.pop(); // ligne vide non conservée (les indices posés sont comptés dans revealLocation)
            else derniere.text = `${nomVisible(def, card)} tiré au hasard et mis en jeu.${derniere.text.replace(/^[^.]*\./, "")}`;
            if (step.slot) { if (i === 0) slots.set(step.slot, card.id); slots.set(`${step.slot}:${i}`, card.id); }
          });
        } else {
          if (step.slot) slots.set(step.slot, choix[0]);
          if (step.slot || step.log) addLog(state, "setup", step.log ?? `Tirage au hasard : ${noms.join(", ")}.`);
        }
        break;
      }
      case "fromPile": {
        // Les n premières cartes d'une pile déjà construite entrent en jeu aux positions données (Road deck : les trois
        // premières en ligne), non révélées par défaut ; slots `slot:<nom>:<i>` pour y référer ensuite.
        if (!state.piles[step.pile]?.length) throw new Error(`setup : pile ${step.pile} vide ou inconnue`);
        const n = Math.min(step.n, state.piles[step.pile].length);
        const noms: string[] = [];
        for (let i = 0; i < n; i++) {
          const id = state.piles[step.pile].shift()!;
          const c = state.cards[id];
          const pos = step.positions[i % step.positions.length];
          c.loc = { zone: step.zone, x: pos.x, y: pos.y, z: z++ };
          c.faceUp = step.faceUp ?? false;
          c.side = "a";
          if (step.reveal && c.kind === "location") revealLocation(state, def, c);
          if (step.slot) { slots.set(`${step.slot}:${i}`, id); if (i === 0) slots.set(step.slot, id); }
          noms.push(nomVisible(def, c));
        }
        addLog(state, "setup", step.log ?? `${n} carte${n > 1 ? "s" : ""} de la pile ${step.pile} en jeu : ${noms.join(", ")}.`);
        break;
      }
      case "pickRandomSet": {
        // Sans révéler le set retenu : le journal ne cite ni les gardés ni les retirés.
        const n = step.n ?? 1;
        const gardes = new Set(shuffle([...step.from], rng).slice(0, n));
        for (const set of step.from) if (!gardes.has(set)) for (const c of def.cards) if (c.set === set) retirer(c.code);
        addLog(state, "setup", step.log ?? `${n} des ${step.from.length} sets candidats rejoignent la pioche, sans être regardés ; les autres sont retirés de la partie.`);
        break;
      }
      case "addDoom": {
        const agenda = state.agendaId ? state.cards[state.agendaId] : null;
        if (!agenda) throw new Error("setup : addDoom avant « story »");
        const n = step.nFrom !== undefined ? Number(answers[step.nFrom]) : step.n ?? 0;
        if (n > 0) {
          agenda.tokens.doom = (agenda.tokens.doom ?? 0) + n;
          addLog(state, "setup", step.log ? `${step.log} ${n} doom placé${n > 1 ? "s" : ""} sur l'agenda de départ.` : `${n} doom placé${n > 1 ? "s" : ""} sur l'agenda de départ.`);
        } else if (step.nFrom !== undefined) addLog(state, "setup", `${step.log ?? "Doom selon le journal :"} aucun.`);
        break;
      }
      case "seatCounter": {
        // « Each investigator begins the game with 1 clue (from the token pool) » : n de plus au compteur `key` de chaque siège occupé.
        const sieges = state.seats.filter((se) => se.investigatorCode);
        for (const se of sieges) se.counters[step.key] = (se.counters[step.key] ?? 0) + step.n;
        addLog(state, "setup", step.log ?? `Chaque enquêteur commence avec ${step.n} ${step.key} de plus (${sieges.length} siège${sieges.length > 1 ? "s" : ""}).`);
        break;
      }
      case "randomTokens": {
        // Brèches et semblables : à chaque manche, des lieux distincts du tapis tirés au hasard reçoivent des jetons.
        const idx = Math.min(Math.max(state.playerCount, 1), 4) - 1;
        const manches = step.rounds[idx] ?? step.rounds[step.rounds.length - 1];
        const parManche = step.picks[idx] ?? step.picks[step.picks.length - 1];
        const lieux = Object.values(state.cards).filter((c) => c.kind === "location" && "zone" in c.loc && c.loc.zone === "board");
        const bilan: string[] = [];
        for (let m = 0; m < manches; m++) {
          const choisis = shuffle([...lieux], rng).slice(0, parManche);
          for (const l of choisis) l.tokens[step.token] = (l.tokens[step.token] ?? 0) + (step.n ?? 1);
          bilan.push(choisis.map((l) => nomVisible(def, l)).join(" + "));
        }
        addLog(state, "setup", `${step.log ?? `Jetons ${step.token} posés au hasard`} : ${manches} tirage${manches > 1 ? "s" : ""} de ${parManche} lieux — ${bilan.join(" ; ")}.`);
        break;
      }
      case "addTokens": {
        const c = enJeu(step.at);
        const n = step.nFrom !== undefined ? Number(answers[step.nFrom]) : step.n ?? 0;
        if (n > 0) c.tokens[step.token] = (c.tokens[step.token] ?? 0) + n;
        if (n > 0 || step.nFrom !== undefined) addLog(state, "setup", `${step.log ?? `Jetons ${step.token} sur ${nomVisible(def, c)}`} : ${n}.`);
        break;
      }
      case "emptySpace": {
        // Espaces vides (Before the Black Throne) : dos de carte joueur, kind proxy, sans définition ArkhamDB.
        step.positions.forEach((pos, i) => {
          const id = `empty-${i + 1}`;
          state.cards[id] = { id, code: "empty:space", kind: "proxy", storyBack: false, loc: { zone: "board", x: pos.x, y: pos.y, z: z++ }, faceUp: false, exhausted: false, side: "a", tokens: {} };
        });
        addLog(state, "setup", step.log ?? `${step.positions.length} espaces vides posés sur le tapis (dos de carte joueur).`);
        break;
      }
      case "when": {
        for (const sub of (evalCond(step.cond, answers) ? step.then : step.else ?? [])) run(sub);
        break;
      }
      case "chaosSet": {
        state.chaos.bag = [...(step.byDifficulty[state.difficulty] ?? [])];
        addLog(state, "setup", `${step.log ?? "Sac du chaos remplacé"} : ${state.chaos.bag.length} jetons.`);
        break;
      }
      case "chaosAdd": {
        if ("nFrom" in step) {
          const n = Math.max(0, Number(answers[step.nFrom]) || 0) + (step.plus ?? 0);
          for (let i = 0; i < n; i++) state.chaos.bag.push(step.token);
          addLog(state, "setup", `${step.log ?? `Jetons ajoutés au sac`} : ${n} × ${step.token}. Sac : ${state.chaos.bag.length} jetons.`);
          break;
        }
        if ("byDifficulty" in step) {
          const tokens = step.byDifficulty[state.difficulty] ?? [];
          state.chaos.bag.push(...tokens);
          addLog(state, "setup", `${step.log ?? "Jeton(s) ajouté(s) au sac selon la difficulté"} : ${tokens.join(", ") || "aucun"}.`);
          break;
        }
        state.chaos.bag.push(...step.tokens);
        addLog(state, "setup", step.log ?? `Jeton${step.tokens.length > 1 ? "s" : ""} ajouté${step.tokens.length > 1 ? "s" : ""} au sac du chaos : ${step.tokens.join(", ")}.`);
        break;
      }
      case "chaosRemove": {
        // Un exemplaire de chaque jeton listé quitte le sac (retraits « pour le reste de la campagne » des scénarios précédents).
        const retires: string[] = [];
        for (const t of step.tokens) {
          const i = state.chaos.bag.indexOf(t);
          if (i >= 0) { state.chaos.bag.splice(i, 1); retires.push(t); }
        }
        addLog(state, "setup", `${step.log ?? "Jeton(s) retiré(s) du sac"} : ${retires.join(", ") || "aucun"}.`);
        break;
      }
      case "leadsDeck": {
        // Leads deck (The Vanishing of Elina Harper) : un suspect et une cachette au hasard, face cachée dans la pile
        // `secret` (personne ne regarde, ordre mélangé) ; les dix autres forment la pile `pile`, mélangée. Journal muet.
        const [suspect] = shuffle([...step.suspects], rng);
        const [hideout] = shuffle([...step.hideouts], rng);
        for (const pile of [step.secret, step.pile]) if (!(pile in state.piles)) state.piles[pile] = [];
        for (const code of shuffle([suspect, hideout], rng)) {
          const id = pool.take(code);
          state.cards[id] = newCard(pool, code, id, { pile: step.secret }, false);
          state.piles[step.secret].push(id);
        }
        for (const code of [...step.suspects, ...step.hideouts]) {
          if (code === suspect || code === hideout) continue;
          const id = pool.take(code);
          state.cards[id] = newCard(pool, code, id, { pile: step.pile }, false);
          state.piles[step.pile].push(id);
        }
        shuffle(state.piles[step.pile], rng);
        state.leads = { eliminated: [] };
        addLog(state, "setup", step.log ?? `Un suspect et une cachette, tirés au hasard, sont posés face cachée sous la carte de référence sans être regardés ; les ${state.piles[step.pile].length} autres forment la pile Leads, mélangée.`);
        break;
      }
      case "reminder": {
        reminders.push(addLog(state, "reminder", step.text));
        break;
      }
      case "branch": {
        const cle = step.on === "players" ? String(state.playerCount) : step.on === "difficulty" ? state.difficulty : String(answers[step.on]);
        const suite = step.cases[cle] ?? step.cases["default"] ?? [];
        if (step.log) addLog(state, "setup", step.log);
        for (const sub of suite) run(sub);
        break;
      }
      case "remove": {
        if (step.n !== undefined) {
          // Retrait partiel : n exemplaires du (seul) code listé — les autres copies restent en jeu/pioche.
          const code = resoudre(step.codes[0]);
          for (let i = 0; i < step.n; i++) {
            const id = pool.take(code);
            state.cards[id] = newCard(pool, code, id, { pile: "removed" }, false);
            state.piles.removed.push(id);
          }
          addLog(state, "setup", step.log ?? `${step.n} exemplaire${step.n > 1 ? "s" : ""} de ${pool.def(code).name} : retiré${step.n > 1 ? "s" : ""} de la partie.`);
          break;
        }
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
        state.piles[step.pile].push(...ids);
        if (step.shuffle) shuffle(state.piles[step.pile], rng); // toute la pile, y compris ce qui s'y trouvait déjà
        addLog(state, "setup", step.log ?? `${ids.length} cartes dans la pile ${step.pile}${step.shuffle ? ", mélangée" : ""}.`);
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
      case "layeredPile": {
        // Pile construite par couches (du dessus vers le dessous), ex. « Unknown Places Deck » : dessous = une carte
        // imposée + 3 au hasard, dessus = les 3 autres, chaque couche mélangée ; le journal ne dit pas qui est où.
        if (!(step.pile in state.piles)) state.piles[step.pile] = [];
        // Les cartes imposées de toutes les couches sont réservées d'abord, pour que les tirages ne les prennent pas.
        const imposes = step.layers.flatMap((l) => l.with ?? []);
        for (const code of imposes) if (!step.pool.includes(code)) throw new Error(`layeredPile : ${code} hors pool`);
        let restant = step.pool.filter((c) => !imposes.includes(c));
        const ids: CardId[] = [];
        for (const layer of step.layers) {
          const impose = layer.with ?? [];
          const tires = shuffle(restant, rng).slice(0, layer.n ?? 0);
          restant = restant.filter((c) => !tires.includes(c));
          const couche = shuffle([...impose, ...tires], rng).map((code) => ({ code, id: pool.take(code) }));
          for (const { code, id } of couche) state.cards[id] = newCard(pool, code, id, { pile: step.pile }, false);
          ids.push(...couche.map((c) => c.id));
        }
        if (restant.length) throw new Error(`layeredPile : ${restant.length} carte(s) non placée(s)`);
        state.piles[step.pile].push(...ids);
        addLog(state, "setup", step.log ?? `${ids.length} cartes dans la pile ${step.pile}, par couches.`);
        break;
      }
      case "keys": {
        // Clés mises de côté (cartes de kind « key », code « key:<x> ») : jetons du chaos pris dans la collection (jamais dans
        // le sac, TCU), ou clés de couleur à deux faces (TIC) — face cachée, leur ordre est mélangé : personne ne sait laquelle
        // est laquelle. Elles se posent sur un lieu, un ennemi ou un enquêteur par glisser.
        const deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
        const faceUp = step.faceUp ?? true;
        for (const c of step.colors ?? []) if (!COULEURS_CLES.includes(c)) throw new Error(`setup : couleur de clé inconnue ${c}`);
        let couleurs = [...(step.colors ?? [])];
        if (step.fillAsideTo !== undefined) {
          // Juste assez de clés, tirées au hasard, pour que n clés face cachée soient de côté (Into the Maelstrom) ; les autres ne servent pas.
          const cacheesDeja = Object.values(state.cards).filter((k) => k.kind === "key" && !k.faceUp && "zone" in k.loc && k.loc.zone === "aside").length;
          couleurs = shuffle(couleurs, rng).slice(0, Math.max(0, step.fillAsideTo - cacheesDeja));
        }
        const noms = [...(step.tokens ?? []), ...couleurs];
        const ordre = faceUp ? noms : shuffle([...noms], rng);
        ordre.forEach((t, i) => {
          const id = `key-${t}`;
          state.cards[id] = { id, code: `key:${t}`, kind: "key", storyBack: false, loc: { zone: "aside", x: (deja + i) * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, faceUp, exhausted: false, side: "a", tokens: {} };
        });
        addLog(state, "setup", step.log ?? (step.fillAsideTo !== undefined
          ? `${noms.length} clé${noms.length > 1 ? "s" : ""} tirée${noms.length > 1 ? "s" : ""} au hasard parmi ${(step.colors ?? []).map((t) => LIBELLES_CLES[t] ?? t).join(", ")} rejoi${noms.length > 1 ? "gnent" : "nt"} les clés de côté face cachée (${step.fillAsideTo} au total) ; les autres ne servent pas.`
          : step.colors
          ? `Clés mises de côté ${faceUp ? "face visible" : "face cachée, mélangées"} : ${noms.map((t) => LIBELLES_CLES[t] ?? t).join(", ")}.`
          : `Clés mises de côté : ${noms.map((t) => LIBELLES_CLES[t] ?? t).join(", ")} (jetons pris dans la collection, pas dans le sac).`));
        break;
      }
      case "barriers": {
        // Barrières (In Too Deep) : n jetons ressource entre deux lieux adjacents en jeu, selon le diagramme du guide.
        state.barriers ??= [];
        let total = 0;
        for (const p of step.pairs) {
          const a = enJeu(p.a), b = enJeu(p.b);
          if (p.n <= 0) continue;
          const ex = state.barriers.find((k) => (k.a === a.id && k.b === b.id) || (k.a === b.id && k.b === a.id));
          if (ex) ex.n += p.n; else state.barriers.push({ a: a.id, b: b.id, n: p.n });
          total += p.n;
        }
        addLog(state, "setup", step.log ?? `${total} barrières (jetons ressource) posées entre les lieux, selon le diagramme du guide : elles bloquent le déplacement des enquêteurs entre deux lieux tant qu'il en reste une.`);
        break;
      }
      case "placeKey": {
        // Une clé de couleur posée sur une carte en jeu : celle du journal (`at`) ou un lieu au hasard parmi `atRandom` (mode autonome).
        if (!COULEURS_CLES.includes(step.color)) throw new Error(`setup : couleur de clé inconnue ${step.color}`);
        const cibleCode = step.at ?? (step.atRandom ? step.atRandom[Math.floor(rng() * step.atRandom.length)] : undefined);
        if (!cibleCode) throw new Error("setup : placeKey sans cible");
        const cible = enJeu(cibleCode);
        const id = `key-${step.color}`;
        if (state.cards[id]) throw new Error(`setup : la clé ${step.color} existe déjà`);
        const cle: CardState = { id, code: `key:${step.color}`, kind: "key", storyBack: false, loc: { zone: "board", x: 0, y: 0, z: 0 }, faceUp: step.faceUp ?? true, exhausted: false, side: "a", tokens: {} };
        state.cards[id] = cle;
        poserCleSur(state, cle, cible, z++);
        addLog(state, "setup", step.log ?? `Clé ${LIBELLES_CLES[step.color]} posée sur ${nomVisible(def, cible)}${step.at ? "" : " (tiré au hasard)"}.`);
        break;
      }
      case "randomKey": {
        // Une clé de côté face cachée, tirée au hasard, posée sur une carte en jeu sans être regardée (journal muet sur sa couleur).
        const cible = enJeu(step.at);
        const cachees = Object.values(state.cards).filter((k) => k.kind === "key" && !k.faceUp && "zone" in k.loc && k.loc.zone === "aside");
        if (!cachees.length) throw new Error("setup : aucune clé face cachée de côté");
        const cle = cachees[Math.floor(rng() * cachees.length)];
        poserCleSur(state, cle, cible, z++);
        addLog(state, "setup", step.log ?? `Une clé face cachée, tirée au hasard parmi celles de côté, est posée sur ${nomVisible(def, cible)} sans être regardée.`);
        break;
      }
      case "addClues": {
        const lieu = enJeu(step.code);
        lieu.tokens.clue = (lieu.tokens.clue ?? 0) + step.n;
        addLog(state, "setup", step.log ?? `${step.n} indice${step.n > 1 ? "s" : ""} posé${step.n > 1 ? "s" : ""} sur ${nomDe(def, lieu.code)}.`);
        break;
      }
      case "reveal": {
        // Révèle un lieu déjà en jeu (posé non révélé par un tirage, ex. Temporary HQ du Blob) : indices selon les enquêteurs, marée.
        const lieu = enJeu(step.code);
        if (lieu.kind !== "location") throw new Error(`setup : reveal ${step.code} n'est pas un lieu`);
        const n = lieu.faceUp ? 0 : revealLocation(state, def, lieu);
        addLog(state, "setup", `${step.log ?? `${nomDe(def, lieu.code)} est révélé.`}${n > 0 ? ` ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}.` : ""}`);
        break;
      }
      case "removeClues": {
        // Retrait « aussi également que possible » : un indice à la fois, à tour de rôle, dans l'ordre donné.
        let n = step.nFrom !== undefined ? Number(answers[step.nFrom]) : step.n ?? 0;
        const lieux = step.from.map((ref) => enJeu(ref));
        const demande = n;
        let retires = 0;
        while (n > 0 && lieux.some((l) => (l.tokens.clue ?? 0) > 0)) {
          for (const l of lieux) {
            if (n <= 0) break;
            if ((l.tokens.clue ?? 0) > 0) { l.tokens.clue!--; n--; retires++; if (l.tokens.clue === 0) delete l.tokens.clue; }
          }
        }
        if (demande > 0) {
          const etat = lieux.map((l) => `${nomDe(def, l.code)} ${l.tokens.clue ?? 0}`).join(", ");
          addLog(state, "setup", `${step.log ?? `${demande} indice${demande > 1 ? "s" : ""} à retirer, aussi également que possible`} : ${retires} retiré${retires > 1 ? "s" : ""} (${etat}).`);
        }
        break;
      }
      case "log": {
        addLog(state, "setup", step.text);
        break;
      }
      case "aside": {
        const deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
        // Sets entiers : chaque carte autant de fois que sa quantité.
        const codes = step.codes ?? def.cards.filter((c) => step.sets?.includes(c.set)).flatMap((c) => Array.from({ length: c.qty }, () => c.code));
        codes.forEach((code, i) => {
          const id = pool.take(code);
          state.cards[id] = newCard(pool, code, id, { zone: "aside", x: (deja + i) * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, step.faceUp ?? false);
          if (step.side) state.cards[id].side = step.side;   // mise de côté sur son verso lié (Angry Mob = verso de Finding Agent Harper)
        });
        addLog(state, "setup", step.log ?? `${[...new Set(codes)].map((c) => step.side === "b" ? (pool.def(c).backName ?? pool.def(c).name) : pool.def(c).name).join(", ")} : de côté, hors jeu.`);
        break;
      }
      case "dealToSeats": {
        // Distribution « devant » chaque enquêteur (Lost and Separated) : n cartes tirées au hasard, données une à une
        // dans l'ordre des joueurs ; une rangée du tapis par enquêteur servi ; le reste est retiré de la partie.
        const ordre = ordreJoueurs();
        const choix = shuffle([...step.from], rng).slice(0, step.n);
        for (const code of step.from) if (!choix.includes(code)) retirer(code);
        const parSiege = new Map<number, CardState[]>();
        choix.forEach((code, i) => {
          const s = ordre[i % ordre.length];
          const r = ordre.indexOf(s);
          const row = step.rows[r % step.rows.length];
          const j = parSiege.get(s.index)?.length ?? 0;
          const id = pool.take(code);
          const card = newCard(pool, code, id, { zone: "board", x: row.x + j * (row.dx ?? CARD_W + 64), y: row.y, z: z++ }, false);
          state.cards[id] = card;
          parSiege.set(s.index, [...(parSiege.get(s.index) ?? []), card]);
        });
        const details = ordre.filter((s) => parSiege.has(s.index)).map((s, r) => {
          const cartes = parSiege.get(s.index)!;
          return `rangée ${r + 1} = ${nomSiege(state, s.index)} (${cartes.length})`;
        });
        const retirees = step.from.length - choix.length;
        addLog(state, "setup", `${step.log ?? `${choix.length} cartes tirées au hasard parmi ${step.from.length} sont réparties devant les enquêteurs, une à une dans l'ordre des joueurs${retirees > 0 ? ` ; ${retirees === 1 ? "l'autre est retirée" : `les ${retirees} autres sont retirées`} de la partie` : ""}.`} Sur le tapis : ${details.join(", ")}.`);
        if (step.start) {
          for (const s of ordre) {
            const cartes = parSiege.get(s.index);
            if (!cartes?.length) continue;
            const depart = cartes[Math.floor(rng() * cartes.length)];
            const n = revealLocation(state, def, depart);
            placeMini(s, depart, 0);
            addLog(state, "setup", `${nomSiege(state, s.index)} commence sur ${pool.def(depart.code).name} (rangée ${ordre.indexOf(s) + 1}), tiré au hasard parmi ses lieux et révélé${n > 0 ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}.`);
          }
        }
        break;
      }
      case "story": {
        const sc = pool.take(def.scenarioCard);
        const cs = newCard(pool, def.scenarioCard, sc, { zone: "story", x: 0, y: 0, z: z++ }, true);
        cs.side = def.scenarioCardSide?.[state.difficulty] ?? "b"; // référence des jetons du chaos : la face utile en jeu (COB : recto en Easy/Standard)
        state.cards[sc] = cs;
        // Un agenda ou un acte retiré plus tôt par la mise en place (versions alternatives selon le journal,
        // ex. deux actes 1 de For the Greater Good) est simplement ignoré : le premier restant devient courant.
        def.agendaDeck.filter((code) => pool.has(code)).forEach((code, i) => {
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
        def.actDeck.filter((code) => pool.has(code)).forEach((code, i) => {
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
        const scindees = new Map<string, CardId[]>();
        for (const { code, ids: restants } of pool.remaining()) {
          const d = pool.def(code);
          if (d.kind === "enemy" || d.kind === "treachery") {
            // Seconde pioche par trait (ex. pioche spectrale) : les cartes portant le trait y vont.
            const cible = step.split?.find((sp) => d.traits?.includes(sp.trait))?.pile;
            for (const id of pool.takeAll(code)) {
              state.cards[id] = newCard(pool, code, id, { pile: cible ?? "encounter" }, false);
              if (cible) scindees.set(cible, [...(scindees.get(cible) ?? []), id]); else ids.push(id);
            }
          } else {
            void restants;
          }
        }
        for (const [pile, cartes] of scindees) {
          if (!(pile in state.piles)) state.piles[pile] = [];
          state.piles[pile].push(...shuffle(cartes, rng));
          const decl = def.piles?.find((p) => p.id === pile);
          if (decl?.discard && !(decl.discard in state.piles)) state.piles[decl.discard] = [];
          addLog(state, "setup", `${cartes.length} cartes portant le trait ${step.split!.find((sp) => sp.pile === pile)!.trait} forment ${decl?.label ?? pile}, mélangée.`);
        }
        state.piles.encounter = shuffle(ids, rng);
        addLog(state, "setup", step.log ?? `Pioche de rencontre mélangée : ${ids.length} cartes.`);
        break;
      }
      case "bury": {
        // Après buildEncounter : les instances des codes `with` (mises de côté plus tôt) + les copies encore au pool des
        // codes `fromPool` (Smoke and Mirrors : les suspects restants et le Servant, avant buildEncounter) + les premières
        // cartes de la pioche, mélangées et réparties face cachée sous les lieux du trait donné — ou sous les lieux `under`
        // (codes ou slots), une par lieu quand les comptes s'y prêtent.
        const codes = new Set(step.with ?? []);
        const avec = Object.entries(state.cards)
          .filter(([, c]) => codes.has(c.code) && "zone" in c.loc && c.loc.zone === "aside")
          .map(([id]) => id);
        for (const code of step.fromPool ?? []) for (const id of pool.takeAll(code)) { state.cards[id] = newCard(pool, code, id, { zone: "aside", x: 0, y: 0, z: z++ }, false); avec.push(id); }
        const cibles = step.under?.map((ref) => { const c = enJeu(ref); if (c.kind !== "location") throw new Error(`setup : bury under ${ref} n'est pas un lieu`); return c; });
        const n = enfouir(state, def, rng, { avec, fromDeckTop: step.fromDeckTop ?? 0, trait: step.trait ?? "", dy: step.dy, cibles });
        addLog(state, "setup", step.log ?? `${n} cartes mélangées et enfouies face cachée sous ${cibles ? `${cibles.length} lieux` : `les lieux « ${step.trait} »`} — personne ne sait laquelle est où.`);
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
