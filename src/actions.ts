// Actions de jeu sur le tapis (étape 2) — fonctions pures sur l'état, appelées par le DO.
// Règle « rien n'est jamais bloqué » (cahier §8) : on ne refuse que pour intégrité (carte, pile,
// siège inconnus), jamais parce que « ce n'est pas le moment ».

import type { CardState, LogEntry, Phase, RoomState, Token, ZoneId } from "./state";
import type { ScenarioDef } from "./scenario";
import { addLog, nextZ, revealLocation, shuffle, type Rng, SEAT_ZONES, CARD_W } from "./setup";

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
      retirerDesPiles(state, c.id);
      const x = Math.round(Number(msg.x) || 0), y = Math.round(Number(msg.y) || 0);
      c.loc = { zone, x, y, z: nextZ(state) };
      if (venaitDunePile) c.faceUp = true; // une carte sortie d'une pile entre en jeu face visible
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
      c.loc = { pile };
      c.faceUp = pile === "encounterDiscard"; // la défausse est consultable, face visible
      c.exhausted = false;
      c.tokens = {};
      delete c.ownerSeat;
      if (msg.top === false) state.piles[pile].push(c.id); else state.piles[pile].unshift(c.id);
      if (pile === "encounterDiscard") addLog(state, "action", `${nomCarte(def, c)} défaussé.`);
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
      if (pile === "encounter") for (const id of state.piles.encounter) state.cards[id].faceUp = false;
      addLog(state, "action", pile === "encounter" ? "Pioche de rencontre mélangée." : `Pile ${pile} mélangée.`);
      return {};
    }
    case "drawEncounter": {
      // Piocher = retourner la première carte de la pioche, qui reste dessus ; le joueur la déplace
      // ensuite à la main. Si une carte révélée est déjà dessus, elle part dans la zone de menace du
      // demandeur et la suivante est retournée (rien n'est bloqué).
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      const dessus = state.piles.encounter.length ? state.cards[state.piles.encounter[0]] : null;
      if (dessus?.faceUp) {
        state.piles.encounter.shift();
        const zone = SEAT_ZONES[s];
        dessus.loc = { zone, x: boutDeMenace(state, zone), y: 0, z: nextZ(state) };
        if (dessus.kind === "enemy" || dessus.kind === "treachery") dessus.ownerSeat = s;
      }
      if (!state.piles.encounter.length) {
        if (!state.piles.encounterDiscard.length) refuser("pioche et défausse vides");
        state.piles.encounter = shuffle(state.piles.encounterDiscard.splice(0), rng);
        for (const id of state.piles.encounter) state.cards[id].faceUp = false;
        addLog(state, "action", "Pioche de rencontre vide : la défausse est remélangée.");
      }
      const c = state.cards[state.piles.encounter[0]];
      c.faceUp = true;
      addLog(state, "action", `${nomSiege(state, s, def)} pioche ${nomCarte(def, c)}.`, s);
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
      if (!pile.length) refuser(agenda ? "c'est le dernier agenda" : "c'est le dernier acte");
      if (courantId) {
        const ancien = state.cards[courantId];
        ancien.loc = { pile: "removed" };
        ancien.tokens = {};
        state.piles.removed.push(courantId);
      }
      const id = pile.shift()!;
      const c = state.cards[id];
      c.loc = { zone: "story", x: 0, y: 0, z: nextZ(state) };
      c.faceUp = true;
      if (agenda) {
        state.agendaId = id;
        c.tokens.doom = 0;
        for (const k of Object.values(state.cards)) if (k.id !== id) delete k.tokens.doom;
        addLog(state, "action", `Agenda suivant : ${nomCarte(def, c)}. Tout le doom en jeu est retiré.`);
      } else {
        state.actId = id;
        addLog(state, "action", `Acte suivant : ${nomCarte(def, c)}.`);
      }
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
