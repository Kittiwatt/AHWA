// Actions de jeu sur le tapis (étape 2) — fonctions pures sur l'état, appelées par le DO.
// Règle « rien n'est jamais bloqué » (cahier §8) : on ne refuse que pour intégrité (carte, pile,
// siège inconnus), jamais parce que « ce n'est pas le moment ».

import type { CardState, LogEntry, Phase, RoomState, Token, ZoneId } from "./state";
import type { ScenarioDef } from "./scenario";
import { addLog, nextZ, revealLocation, shuffle, type Rng, SEAT_ZONES, CARD_W, CARD_H, MINI } from "./setup";

export class Refus extends Error {}
export const refuser = (raison: string): never => { throw new Refus(raison); };

export type Resultat = { reminders?: LogEntry[]; peek?: { cards: { id: string; code: string }[]; pile: string } };

const PHASES: Phase[] = ["mythos", "investigation", "enemy", "upkeep"];
const NOMS_PHASES: Record<string, string> = {
  mythos: "phase du mythe", investigation: "phase des enquêteurs", enemy: "phase des ennemis", upkeep: "phase d'entretien",
};
const ZONES = new Set<string>(["board", "seat0", "seat1", "seat2", "seat3", "story", "aside", "victory"]);
const TOKENS = new Set(["doom", "clue", "damage", "horror", "resource", "generic"]);
const CHAOS_TOKENS = new Set<string>(["+1", "0", "-1", "-2", "-3", "-4", "-5", "-6", "-8", "skull", "cultist", "tablet", "elder_thing", "auto_fail", "elder_sign", "bless", "curse", "frost"]);

function carte(state: RoomState, id: unknown): CardState {
  const c = state.cards[String(id)];
  return c ?? refuser("carte inconnue");
}

function siege(state: RoomState, n: unknown): number {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > 3 || !state.seats[i].investigatorCode) refuser("siège sans enquêteur");
  return i;
}

function retirerDesPiles(state: RoomState, id: string) {
  for (const pile of Object.values(state.piles)) {
    const i = pile.indexOf(id);
    if (i >= 0) pile.splice(i, 1);
  }
}

function nomPile(def: ScenarioDef, pile: string): string {
  return def.piles?.find((p) => p.id === pile)?.label ?? pile;
}

function nomCarte(def: ScenarioDef, c: CardState): string {
  return def.cards.find((d) => d.code === c.code)?.name ?? c.code;
}

function nomSiege(state: RoomState, n: number, def: ScenarioDef): string {
  return state.seats[n].name ?? `Siège ${n + 1}`;
}

function rappels(state: RoomState, def: ScenarioDef, quand: string): LogEntry[] {
  return def.reminders.filter((r) => r.when === quand).map((r) => addLog(state, "reminder", r.text));
}

function doomTotal(state: RoomState): number {
  return Object.values(state.cards).reduce((n, c) => n + ("zone" in c.loc ? c.tokens.doom ?? 0 : 0), 0);
}

/** Bord droit de la zone de menace d'un siège (pour poser la prochaine carte). */
function boutDeMenace(state: RoomState, zone: ZoneId): number {
  let x = 0;
  for (const c of Object.values(state.cards)) {
    if ("zone" in c.loc && c.loc.zone === zone && c.kind !== "investigator") x = Math.max(x, c.loc.x + CARD_W + 10);
  }
  return x;
}

/** Défausse de rencontre → pioche (le tout mélangé, face cachée). */
function remelangerDefausse(state: RoomState, rng: Rng) {
  state.piles.encounter.push(...state.piles.encounterDiscard.splice(0));
  shuffle(state.piles.encounter, rng);
  for (const id of state.piles.encounter) state.cards[id].faceUp = false;
}

/** Bord droit de la zone « de côté » (pour y ranger une carte en fin de rangée). */
function boutDeCote(state: RoomState): number {
  let x = 0;
  for (const c of Object.values(state.cards)) if ("zone" in c.loc && c.loc.zone === "aside") x = Math.max(x, c.loc.x + CARD_W + 10);
  return x;
}

/**
 * Révèle l'agenda ou l'acte suivant. L'ancienne carte, si elle est encore dans l'histoire, part de côté
 * (hors jeu, lisible dans la zone floutée) ; un agenda qui avance retire tout le doom en jeu.
 */
function avancer(state: RoomState, def: ScenarioDef, agenda: boolean, ancienneDejaSortie = false) {
  const pile = agenda ? state.piles.agendaDeck : state.piles.actDeck;
  const courantId = agenda ? state.agendaId : state.actId;
  if (courantId && !ancienneDejaSortie) {
    const ancien = state.cards[courantId];
    ancien.loc = { zone: "aside", x: boutDeCote(state), y: 0, z: nextZ(state) };
    ancien.tokens = {};
    ancien.exhausted = false;
  }
  if (agenda) for (const k of Object.values(state.cards)) if (k.id !== courantId) delete k.tokens.doom;
  if (!pile.length) {
    if (agenda) state.agendaId = null; else state.actId = null;
    addLog(state, "action", agenda ? "Dernier agenda sorti de l'histoire." : "Dernier acte sorti de l'histoire.");
    return;
  }
  const id = pile.shift()!;
  const c = state.cards[id];
  c.loc = { zone: "story", x: 0, y: 0, z: nextZ(state) };
  c.faceUp = true;
  if (agenda) {
    state.agendaId = id;
    c.tokens.doom = 0;
    addLog(state, "action", `Agenda suivant : ${nomCarte(def, c)}. Tout le doom en jeu est retiré.`);
  } else {
    state.actId = id;
    addLog(state, "action", `Acte suivant : ${nomCarte(def, c)}.`);
  }
}

/** Si la carte quitte l'histoire pour sortir du jeu (de côté, victoire, pile), l'agenda/acte suivant est révélé. */
function sortieHistoire(state: RoomState, def: ScenarioDef, c: CardState) {
  const sortie = "pile" in c.loc || c.loc.zone === "aside" || c.loc.zone === "victory";
  if (!sortie) return;
  if (c.id === state.agendaId) avancer(state, def, true, true);
  else if (c.id === state.actId) avancer(state, def, false, true);
}

export function jouer(state: RoomState, def: ScenarioDef, msg: { t: string; [k: string]: unknown }, moi: number | null, rng: Rng): Resultat {
  const monSiege = () => (moi === null ? refuser("il faut être assis pour agir") : moi);

  switch (msg.t) {
    // ---- Tour et phases ---------------------------------------------------------
    case "takeTurn": {
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      state.turn.seat = s;
      addLog(state, "action", `${nomSiege(state, s, def)} prend son tour.`, s);
      return {};
    }
    case "endTurn": {
      const s = msg.seat === undefined ? (state.turn.seat ?? monSiege()) : siege(state, msg.seat);
      if (!state.turn.done.includes(s)) state.turn.done.push(s);
      if (state.turn.seat === s) state.turn.seat = null;
      addLog(state, "action", `${nomSiege(state, s, def)} termine son tour.`, s);
      return {};
    }
    case "setPhase": {
      const p = String(msg.phase) as Phase;
      if (!PHASES.includes(p)) refuser("phase inconnue");
      state.phase = p;
      addLog(state, "phase", `Passage manuel à la ${NOMS_PHASES[p]} (sans automatisation).`);
      return {};
    }
    case "nextPhase": {
      if (state.phase === "resolution") refuser("partie clôturée : réinitialisez la table pour rejouer");
      const i = PHASES.indexOf(state.phase);
      const suivante = PHASES[(i + 1) % PHASES.length];
      state.phase = suivante;
      const reminders: LogEntry[] = [];
      switch (suivante) {
        case "mythos": {
          state.round++;
          const agenda = state.agendaId ? state.cards[state.agendaId] : null;
          if (agenda) agenda.tokens.doom = (agenda.tokens.doom ?? 0) + 1;
          const total = doomTotal(state);
          const seuil = agenda ? def.cards.find((c) => c.code === agenda.code)?.doom ?? null : null;
          addLog(state, "phase", `Manche ${state.round} — phase du mythe : 1 doom ajouté sur l'agenda (${total} doom en jeu${seuil ? ` / seuil ${seuil}` : ""}).`);
          if (seuil !== null && total >= seuil) reminders.push(addLog(state, "reminder", `Le doom en jeu (${total}) atteint le seuil de l'agenda (${seuil}) : avancez l'agenda.`));
          reminders.push(...rappels(state, def, "mythos"), ...rappels(state, def, `round:${state.round}`));
          break;
        }
        case "investigation":
          state.turn = { seat: null, done: [] };
          addLog(state, "phase", "Phase des enquêteurs.");
          reminders.push(...rappels(state, def, "investigation"));
          break;
        case "enemy":
          state.turn.seat = null;
          addLog(state, "phase", "Phase des ennemis.");
          reminders.push(...rappels(state, def, "enemy"));
          break;
        case "upkeep":
          for (const s of state.seats) s.counters.actions = 3;
          for (const c of Object.values(state.cards)) c.exhausted = false;
          addLog(state, "phase", "Phase d'entretien : cartes redressées, actions remises à 3.");
          reminders.push(...rappels(state, def, "upkeep"));
          break;
      }
      return { reminders };
    }

    // ---- Compteurs ---------------------------------------------------------------
    case "setSeatCounter": {
      const s = siege(state, msg.seat);
      const key = String(msg.key);
      const seat = state.seats[s];
      if (!(key in seat.counters)) refuser("compteur inconnu");
      const v = msg.value !== undefined ? Number(msg.value) : seat.counters[key] + Number(msg.delta ?? 0);
      if (!Number.isFinite(v)) refuser("valeur invalide");
      seat.counters[key] = Math.max(0, Math.round(v));
      return {};
    }
    case "setCounter": {
      const key = String(msg.key);
      if (!(key in state.counters)) refuser("compteur inconnu");
      const v = msg.value !== undefined ? Number(msg.value) : state.counters[key] + Number(msg.delta ?? 0);
      if (!Number.isFinite(v)) refuser("valeur invalide");
      state.counters[key] = Math.max(0, Math.round(v));
      return {};
    }
    case "addToken": {
      const c = carte(state, msg.id);
      const token = String(msg.token) as keyof CardState["tokens"];
      if (!TOKENS.has(token)) refuser("jeton inconnu");
      const v = Math.max(0, (c.tokens[token] ?? 0) + Number(msg.delta ?? 0));
      if (v === 0) delete c.tokens[token]; else c.tokens[token] = v;
      return {};
    }
    case "spendClues": {
      const from = Array.isArray(msg.from) ? (msg.from as { seat: number; n: number }[]) : [];
      let total = 0;
      for (const f of from) {
        const s = siege(state, f.seat);
        const n = Math.max(0, Math.min(state.seats[s].counters.clues ?? 0, Math.round(Number(f.n) || 0)));
        state.seats[s].counters.clues -= n;
        total += n;
      }
      if (total > 0) addLog(state, "action", `${total} indice${total > 1 ? "s" : ""} dépensé${total > 1 ? "s" : ""} sur l'acte.`);
      return {};
    }

    // ---- Cartes --------------------------------------------------------------------
    case "moveCard": {
      const c = carte(state, msg.id);
      const zone = String(msg.zone) as ZoneId;
      if (!ZONES.has(zone)) refuser("zone inconnue");
      const venaitDunePile = "pile" in c.loc;
      const avant = "zone" in c.loc ? { ...c.loc } : null;
      retirerDesPiles(state, c.id);
      const x = Math.round(Number(msg.x) || 0), y = Math.round(Number(msg.y) || 0);
      c.loc = { zone, x, y, z: nextZ(state) };
      if (venaitDunePile) c.faceUp = true; // une carte sortie d'une pile entre en jeu face visible
      sortieHistoire(state, def, c);
      // Un lieu déplacé sur le tapis emmène ce qui est posé dessus : pions (à cheval sur le bord) et cartes dont le centre est sur le lieu.
      if (c.kind === "location" && avant?.zone === "board" && zone === "board") {
        const dx = x - avant.x, dy = y - avant.y;
        for (const k of Object.values(state.cards)) {
          if (k.id === c.id || !("zone" in k.loc) || k.loc.zone !== "board" || k.kind === "location") continue;
          const w = k.kind === "mini" ? MINI : CARD_W, h = k.kind === "mini" ? MINI : CARD_H;
          const cx = k.loc.x + w / 2, cy = k.loc.y + h / 2;
          const marge = k.kind === "mini" ? MINI : 0;
          if (cx >= avant.x - marge && cx <= avant.x + CARD_W + marge && cy >= avant.y - marge && cy <= avant.y + CARD_H + marge) {
            k.loc = { ...k.loc, x: k.loc.x + dx, y: k.loc.y + dy };
          }
        }
      }
      const idx = SEAT_ZONES.indexOf(zone);
      if (c.kind === "enemy" || c.kind === "treachery" || c.kind === "asset" || c.kind === "story") {
        if (idx >= 0) c.ownerSeat = idx; else delete c.ownerSeat;
      }
      return {};
    }
    case "toPile": {
      const c = carte(state, msg.id);
      const pile = String(msg.pile);
      if (!(pile in state.piles)) refuser("pile inconnue");
      retirerDesPiles(state, c.id);
      state.links = state.links.filter((l) => l.a !== c.id && l.b !== c.id);
      c.loc = { pile };
      c.faceUp = pile === "encounterDiscard"; // la défausse est consultable, face visible
      c.exhausted = false;
      c.tokens = {};
      delete c.ownerSeat;
      if (msg.top === false) state.piles[pile].push(c.id); else state.piles[pile].unshift(c.id);
      if (pile === "encounterDiscard") addLog(state, "action", `${nomCarte(def, c)} défaussé.`);
      sortieHistoire(state, def, c);
      return {};
    }
    case "flipCard": {
      const c = carte(state, msg.id);
      if (c.storyBack && !c.faceUp) refuser("cette carte a un dos « histoire » : seul le scénario peut la révéler");
      if (c.storyBack && c.faceUp) refuser("cette carte a un dos « histoire » : elle ne se retourne pas");
      c.faceUp = !c.faceUp;
      return {};
    }
    case "revealLocation": {
      const c = carte(state, msg.id);
      if (c.kind !== "location") refuser("ce n'est pas un lieu");
      if (c.faceUp) return {};
      const n = revealLocation(state, def, c);
      addLog(state, "action", `${nomCarte(def, c)} révélé${n ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}.`);
      return {};
    }
    case "toggleSide": {
      const c = carte(state, msg.id);
      c.side = c.side === "a" ? "b" : "a";
      return {};
    }
    case "exhaust": {
      const c = carte(state, msg.id);
      c.exhausted = msg.v === undefined ? !c.exhausted : Boolean(msg.v);
      return {};
    }
    case "shufflePile": {
      const pile = String(msg.pile);
      if (!(pile in state.piles)) refuser("pile inconnue");
      shuffle(state.piles[pile], rng);
      if (pile !== "encounterDiscard") for (const id of state.piles[pile]) state.cards[id].faceUp = false;
      addLog(state, "action", pile === "encounter" ? "Pioche de rencontre mélangée." : `${nomPile(def, pile)} : mélangée.`);
      return {};
    }
    case "drawEncounter": {
      // Piocher = retourner la première carte de la pile (pioche de rencontre par défaut, ou une pile
      // déclarée par le scénario), qui reste dessus ; le joueur la déplace ensuite à la main (glisser).
      // Tant qu'une carte révélée est dessus, la pile attend.
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      const pile = String(msg.pile ?? "encounter");
      if (!(pile in state.piles) || ["encounterDiscard", "removed", "agendaDeck", "actDeck"].includes(pile)) refuser("pile inconnue");
      const dessus = state.piles[pile].length ? state.cards[state.piles[pile][0]] : null;
      if (dessus?.faceUp) refuser(`${nomCarte(def, dessus)} est déjà révélé : glissez-le où il faut avant de piocher`);
      if (!state.piles[pile].length) {
        if (pile !== "encounter" || !state.piles.encounterDiscard.length) refuser(pile === "encounter" ? "pioche et défausse vides" : "cette pile est vide");
        remelangerDefausse(state, rng);
        addLog(state, "action", "Pioche de rencontre vide : la défausse est remélangée.");
      }
      const c = state.cards[state.piles[pile][0]];
      c.faceUp = true;
      addLog(state, "action", `${nomSiege(state, s, def)} pioche ${nomCarte(def, c)}${pile === "encounter" ? "" : ` (${nomPile(def, pile)})`}.`, s);
      return {};
    }
    case "reshuffleDiscard": {
      if (!state.piles.encounterDiscard.length) refuser("la défausse est vide");
      const n = state.piles.encounterDiscard.length;
      remelangerDefausse(state, rng);
      addLog(state, "action", `${n} carte${n > 1 ? "s" : ""} de la défausse remélangée${n > 1 ? "s" : ""} dans la pioche.`);
      return {};
    }
    case "takeClue": {
      // Double-clic sur les indices d'un lieu : 1 indice passe du lieu à la réserve du joueur.
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      const c = carte(state, msg.id);
      const n = Math.max(1, Math.round(Number(msg.n) || 1));
      const pris = Math.min(n, c.tokens.clue ?? 0);
      if (pris <= 0) return {};
      c.tokens.clue = (c.tokens.clue ?? 0) - pris;
      if (c.tokens.clue === 0) delete c.tokens.clue;
      state.seats[s].counters.clues = (state.seats[s].counters.clues ?? 0) + pris;
      addLog(state, "action", `${nomSiege(state, s, def)} prend ${pris} indice${pris > 1 ? "s" : ""} sur ${nomCarte(def, c)}.`, s);
      return {};
    }
    case "searchEncounter": {
      const pile = String(msg.pile ?? "encounter");
      if (!(pile in state.piles) || pile === "removed") refuser("pile inconnue");
      return { peek: { pile, cards: state.piles[pile].map((id) => ({ id, code: state.cards[id].code })) } };
    }
    case "advanceAgenda":
    case "advanceAct": {
      const agenda = msg.t === "advanceAgenda";
      const pile = agenda ? state.piles.agendaDeck : state.piles.actDeck;
      const courantId = agenda ? state.agendaId : state.actId;
      if (!pile.length && !courantId) refuser(agenda ? "plus d'agenda" : "plus d'acte");
      const courant = courantId ? state.cards[courantId] : null;
      avancer(state, def, agenda, !courant || !("zone" in courant.loc) || courant.loc.zone !== "story");
      return {};
    }

    // ---- Chemins entre lieux --------------------------------------------------------
    case "linkLocations": {
      const a = carte(state, msg.a), b = carte(state, msg.b);
      if (a.id === b.id) return {};
      if (a.kind !== "location" || b.kind !== "location") refuser("un chemin relie deux lieux");
      const i = state.links.findIndex((l) => (l.a === a.id && l.b === b.id) || (l.a === b.id && l.b === a.id));
      if (i >= 0) {
        state.links.splice(i, 1);
        addLog(state, "action", `Chemin effacé entre ${nomCarte(def, a)} et ${nomCarte(def, b)}.`);
      } else {
        const utilisees = new Set(state.links.map((l) => l.color));
        let color = 0;
        while (utilisees.has(color) && color < 100) color++;
        state.links.push({ a: a.id, b: b.id, color });
        addLog(state, "action", `Chemin tracé entre ${nomCarte(def, a)} et ${nomCarte(def, b)}.`);
      }
      return {};
    }
    case "unlink": {
      if (msg.id === undefined) { state.links = []; addLog(state, "action", "Tous les chemins sont effacés."); return {}; }
      const c = carte(state, msg.id);
      state.links = state.links.filter((l) => l.a !== c.id && l.b !== c.id);
      return {};
    }

    // ---- Sac du chaos ---------------------------------------------------------------
    case "chaosDraw": {
      if (!state.chaos.bag.length) refuser("le sac est vide");
      const i = Math.floor(rng() * state.chaos.bag.length);
      const [t] = state.chaos.bag.splice(i, 1);
      state.chaos.drawn.push(t);
      addLog(state, "action", `Jeton tiré : ${t}${state.chaos.drawn.length > 1 ? ` (${state.chaos.drawn.join(", ")})` : ""}.`);
      return {};
    }
    case "chaosReturn": {
      state.chaos.bag.push(...state.chaos.drawn.splice(0));
      return {};
    }
    case "chaosAdjust": {
      const t = String(msg.token) as Token;
      if (!CHAOS_TOKENS.has(t)) refuser("jeton inconnu");
      const delta = Math.round(Number(msg.delta) || 0);
      if (delta > 0) for (let k = 0; k < delta; k++) state.chaos.bag.push(t);
      else for (let k = 0; k < -delta; k++) { const i = state.chaos.bag.indexOf(t); if (i < 0) break; state.chaos.bag.splice(i, 1); }
      return {};
    }
    default:
      return refuser(`action « ${msg.t} » inconnue`);
  }
}
