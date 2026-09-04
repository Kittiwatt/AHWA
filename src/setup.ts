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

export const LIBELLES_CLES: Record<string, string> = { skull: "Crâne", cultist: "Cultiste", tablet: "Tablette", elder_thing: "Ancien" };

/** Nom de la face actuellement visible : le verso (backName) quand il est montré, sinon le recto. */
export function nomVisible(def: ScenarioDef, card: CardState): string {
  if (card.kind === "key") return `clé ${LIBELLES_CLES[card.code.replace(/^key:/, "")] ?? card.code}`;
  if (card.kind === "proxy" && card.code === "empty:space") return "espace vide";
  const d = def.cards.find((c) => c.code === card.code);
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
  has(code: string): boolean {
    return (this.byCode.get(code)?.length ?? 0) > 0;
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
    const libelle = q.type === "number" ? String(Number(answers[q.id])) : q.options!.find((o) => o.id === answers[q.id])!.label;
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
        const candidats = step.from.map(codeDe);
        const choix = shuffle([...candidats], rng).slice(0, n);
        const noms = choix.map((c) => pool.def(c).name);
        const restes = candidats.filter((code) => !choix.includes(code));
        if (step.rest === "pile") {
          // Les cartes non tirées forment (ou rejoignent) une pile, ex. lieux pour « choisir un lieu au hasard ».
          const pile = step.restPile ?? "rest";
          if (!(pile in state.piles)) state.piles[pile] = [];
          for (const code of restes) for (const id of pool.takeAll(code)) { state.cards[id] = newCard(pool, code, id, { pile }, false); state.piles[pile].push(id); }
        } else if (step.rest === "aside") {
          // Les cartes non tirées sont mises de côté, hors jeu (face cachée), au lieu d'être retirées.
          const deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
          restes.forEach((code, i) => {
            for (const id of pool.takeAll(code)) state.cards[id] = newCard(pool, code, id, { zone: "aside", x: (deja + i) * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, false);
          });
        } else for (const code of restes) retirer(code);
        if (step.zone !== undefined && (step.positions || (step.x !== undefined && step.y !== undefined))) {
          // Avec un `log` du scénario : une seule ligne pour le tirage, sinon une ligne par carte (nom de la face visible).
          if (step.log) addLog(state, "setup", step.log);
          choix.forEach((code, i) => {
            const pos = step.positions ? step.positions[i % step.positions.length] : { x: step.x! + i * (CARD_W + 32), y: step.y! };
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
      case "chaosAdd": {
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
      case "reminder": {
        reminders.push(addLog(state, "reminder", step.text));
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
        // Clés : jetons du chaos pris dans la collection (jamais dans le sac), mis de côté ; ils se posent sur
        // un lieu, un ennemi ou un enquêteur par glisser (cartes de kind « key », code « key:<jeton> »).
        const deja = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === "aside").length;
        step.tokens.forEach((t, i) => {
          const id = `key-${t}`;
          state.cards[id] = { id, code: `key:${t}`, kind: "key", storyBack: false, loc: { zone: "aside", x: (deja + i) * (CARD_W + ASIDE_GAP), y: 0, z: z++ }, faceUp: true, exhausted: false, side: "a", tokens: {} };
        });
        addLog(state, "setup", step.log ?? `Clés mises de côté : ${step.tokens.map((t) => LIBELLES_CLES[t] ?? t).join(", ")} (jetons pris dans la collection, pas dans le sac).`);
        break;
      }
      case "addClues": {
        const lieu = enJeu(step.code);
        lieu.tokens.clue = (lieu.tokens.clue ?? 0) + step.n;
        addLog(state, "setup", step.log ?? `${step.n} indice${step.n > 1 ? "s" : ""} posé${step.n > 1 ? "s" : ""} sur ${nomDe(def, lieu.code)}.`);
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
        });
        addLog(state, "setup", step.log ?? `${[...new Set(codes)].map((c) => pool.def(c).name).join(", ")} : de côté, hors jeu.`);
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
        cs.side = "b"; // verso = référence des jetons du chaos, la face utile en jeu
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
