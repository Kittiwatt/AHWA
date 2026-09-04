// Actions de jeu sur le tapis (étape 2) — fonctions pures sur l'état, appelées par le DO.
// Règle « rien n'est jamais bloqué » (cahier §8) : on ne refuse que pour intégrité (carte, pile,
// siège inconnus), jamais parce que « ce n'est pas le moment ».

import type { CardState, LogEntry, Phase, RoomState, Token, ZoneId } from "./state";
import type { ScenarioDef } from "./scenario";
import { addLog, nextZ, nomVisible, revealLocation, shuffle, type Rng, SEAT_ZONES, CARD_W, CARD_H, MINI } from "./setup";

export class Refus extends Error {}
export const refuser = (raison: string): never => { throw new Refus(raison); };

export type Resultat = { reminders?: LogEntry[]; peek?: { cards: { id: string; code: string }[]; pile: string } };

const PHASES: Phase[] = ["mythos", "investigation", "enemy", "upkeep"];
const NOMS_PHASES: Record<string, string> = {
  mythos: "phase du mythe", investigation: "phase des enquêteurs", enemy: "phase des ennemis", upkeep: "phase d'entretien",
};
const ZONES = new Set<string>(["board", "seat0", "seat1", "seat2", "seat3", "story", "aside", "victory"]);
const TOKENS = new Set(["doom", "clue", "damage", "horror", "resource", "generic"]);
const CHAOS_TOKENS = new Set<string>(["+1", "0", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "skull", "cultist", "tablet", "elder_thing", "auto_fail", "elder_sign", "bless", "curse", "frost"]);

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

/** Nom de la face visible (le verso d'un lieu non révélé garde son secret : « Decrepit Door »). */
function nomCarte(def: ScenarioDef, c: CardState): string {
  return nomVisible(def, c);
}

function nomSiege(state: RoomState, n: number, def: ScenarioDef): string {
  return state.seats[n].name ?? state.seats[n].custom?.name ?? `Siège ${n + 1}`;
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
/** Défausse associée à une pioche : encounterDiscard pour la pioche de rencontre, `discard` déclaré pour une seconde pioche. */
function defausseDe(def: ScenarioDef, pile: string): string | null {
  if (pile === "encounter") return "encounterDiscard";
  return def.piles?.find((p) => p.id === pile)?.discard ?? null;
}
function estDefausse(def: ScenarioDef, pile: string): boolean {
  return pile === "encounterDiscard" || Boolean(def.piles?.find((p) => p.id === pile)?.isDiscard);
}

function remelangerDefausse(state: RoomState, rng: Rng, pioche = "encounter", defausse = "encounterDiscard") {
  state.piles[pioche].push(...state.piles[defausse].splice(0));
  shuffle(state.piles[pioche], rng);
  for (const id of state.piles[pioche]) state.cards[id].faceUp = false;
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
function avancer(state: RoomState, def: ScenarioDef, agenda: boolean, ancienneDejaSortie = false): LogEntry[] {
  const pile = agenda ? state.piles.agendaDeck : state.piles.actDeck;
  const courantId = agenda ? state.agendaId : state.actId;
  if (courantId && !ancienneDejaSortie) {
    const ancien = state.cards[courantId];
    const d = def.cards.find((k) => k.code === ancien.code);
    if (d?.backCode && d.backKind === "location") {
      // Verso = lieu (ex. acte dont le dos est un lieu) : la carte entre en jeu sur le tapis comme un vrai lieu
      // (couche des lieux, chemins, pions emportés), révélée, avec les indices de son verso.
      const pos = def.backPlacement?.[ancien.code] ?? { x: 737, y: 411 };
      ancien.kind = "location";
      ancien.faceUp = true;
      ancien.side = "b";
      ancien.exhausted = false;
      ancien.tokens = {};
      ancien.loc = { zone: "board", x: pos.x, y: pos.y, z: nextZ(state) };
      const n = d.backClue ? (d.backClue.perInvestigator ? d.backClue.value * state.playerCount : d.backClue.value) : 0;
      if (n > 0) ancien.tokens.clue = n;
      addLog(state, "action", `${d.backName ?? "Le verso"} entre en jeu sur le tapis (verso de ${agenda ? "l'agenda" : "l'acte"})${n > 0 ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}.`);
    } else {
      ancien.loc = { zone: "aside", x: boutDeCote(state), y: 0, z: nextZ(state) };
      ancien.tokens = {};
      ancien.exhausted = false;
    }
  }
  if (agenda) for (const k of Object.values(state.cards)) if (k.id !== courantId) delete k.tokens.doom;
  if (!pile.length) {
    if (agenda) state.agendaId = null; else state.actId = null;
    addLog(state, "action", agenda ? "Dernier agenda sorti de l'histoire." : "Dernier acte sorti de l'histoire.");
    return [];
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
  // Rappels déclarés par le scénario pour cette étape (« act:2 », « agenda:2 »…).
  const stage = def.cards.find((k) => k.code === c.code)?.stage;
  return stage ? rappels(state, def, `${agenda ? "agenda" : "act"}:${stage}`) : [];
}

/** Si la carte quitte l'histoire pour sortir du jeu (de côté, victoire, pile), l'agenda/acte suivant est révélé. */
function sortieHistoire(state: RoomState, def: ScenarioDef, c: CardState): LogEntry[] {
  const sortie = "pile" in c.loc || c.loc.zone === "aside" || c.loc.zone === "victory";
  if (!sortie) return [];
  if (c.id === state.agendaId) return avancer(state, def, true, true);
  if (c.id === state.actId) return avancer(state, def, false, true);
  return [];
}

/** Pions posés sur un lieu (à cheval sur ses bords, comme au setup). */
function pionsSur(state: RoomState, lieu: CardState): CardState[] {
  if (!("zone" in lieu.loc)) return [];
  const lx = lieu.loc.x, ly = lieu.loc.y;
  return Object.values(state.cards).filter((k) => k.kind === "mini" && "zone" in k.loc && k.loc.zone === "board"
    && k.loc.x + MINI / 2 >= lx - MINI && k.loc.x + MINI / 2 <= lx + CARD_W + MINI
    && k.loc.y + MINI / 2 >= ly - MINI && k.loc.y + MINI / 2 <= ly + CARD_H + MINI);
}

/**
 * Remplacement d'un lieu par sa version jumelle (normal ↔ Spectral, TCU « Replacing Locations ») : la jumelle
 * prend sa place, ses jetons et ce qui est posé dessus (rien n'a bougé) ; elle entre non révélée, sauf si un
 * enquêteur s'y trouve (révélée, indices posés) ; l'ancien lieu part de côté, hors jeu.
 */
function remplacerLieu(state: RoomState, def: ScenarioDef, c: CardState): string {
  if (c.kind !== "location" || !("zone" in c.loc) || c.loc.zone !== "board") refuser("ce n'est pas un lieu en jeu");
  const paire = def.swaps?.find((p) => p.pair.includes(c.code)) ?? refuser("ce lieu n'a pas de version de remplacement");
  const autreCode = paire.pair[0] === c.code ? paire.pair[1] : paire.pair[0];
  const autre = Object.values(state.cards).find((k) => k.code === autreCode && !("zone" in k.loc && k.loc.zone === "board"))
    ?? refuser("la version de remplacement n'est pas disponible");
  retirerDesPiles(state, autre.id);
  const loc = c.loc as { x: number; y: number };
  autre.loc = { zone: "board", x: loc.x, y: loc.y, z: nextZ(state) };
  autre.tokens = c.tokens;
  autre.exhausted = c.exhausted;
  autre.faceUp = false;
  autre.side = "a";
  c.loc = { zone: "aside", x: boutDeCote(state), y: 0, z: nextZ(state) };
  c.tokens = {};
  c.exhausted = false;
  c.faceUp = false;
  for (const l of state.links) { if (l.a === c.id) l.a = autre.id; if (l.b === c.id) l.b = autre.id; }
  let texte = `${nomCarte(def, c)} est remplacé par ${paire.labels[paire.pair.indexOf(autreCode)]} (jetons et cartes conservés) ; l'ancien lieu part de côté.`;
  if (pionsSur(state, autre).length) {
    const n = revealLocation(state, def, autre);
    texte += ` Un enquêteur s'y trouve : lieu révélé${n ? `, ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}.`;
  }
  addLog(state, "action", texte);
  return autre.id;
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
          // Certains scénarios remplacent le doom de la phase du mythe par autre chose (brèches d'In the Clutches of Chaos) : mythosDoom: false.
          const doomAuto = def.mythosDoom !== false;
          if (agenda && doomAuto) agenda.tokens.doom = (agenda.tokens.doom ?? 0) + 1;
          const total = doomTotal(state);
          const seuil = agenda ? def.cards.find((c) => c.code === agenda.code)?.doom ?? null : null;
          addLog(state, "phase", `Manche ${state.round} — phase du mythe : ${doomAuto ? "1 doom ajouté sur l'agenda" : "pas de doom automatique (voir l'agenda)"} (${total} doom en jeu${seuil ? ` / seuil ${seuil}` : ""}).`);
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
      if (venaitDunePile) {
        // Une carte sortie d'une pile entre en jeu face visible ; un lieu à double face entre non révélé (clic =
        // révélation + indices) ; un lieu à simple face (ex. Strange Geometry) entre révélé, avec ses indices.
        c.faceUp = c.kind !== "location";
        if (c.kind === "location") {
          c.side = "a";
          if (def.cards.find((d) => d.code === c.code)?.back !== "b") {
            const n = revealLocation(state, def, c);
            addLog(state, "action", `${nomCarte(def, c)} entre en jeu révélé${n ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}.`);
          }
        }
      }
      const reminders = sortieHistoire(state, def, c);
      // Un lieu déplacé sur le tapis emmène ce qui est posé dessus : pions (à cheval sur le bord) et cartes dont le centre est sur le lieu.
      if (c.kind === "location" && avant?.zone === "board" && zone === "board") {
        const dx = x - avant.x, dy = y - avant.y;
        for (const k of Object.values(state.cards)) {
          if (k.id === c.id || !("zone" in k.loc) || k.loc.zone !== "board" || k.kind === "location") continue;
          const petit = k.kind === "mini" || k.kind === "key";
          const w = petit ? MINI : CARD_W, h = petit ? MINI : CARD_H;
          const cx = k.loc.x + w / 2, cy = k.loc.y + h / 2;
          const marge = petit ? MINI : 0;
          if (cx >= avant.x - marge && cx <= avant.x + CARD_W + marge && cy >= avant.y - marge && cy <= avant.y + CARD_H + marge) {
            k.loc = { ...k.loc, x: k.loc.x + dx, y: k.loc.y + dy };
          }
        }
      }
      const idx = SEAT_ZONES.indexOf(zone);
      if (c.kind === "enemy" || c.kind === "treachery" || c.kind === "asset" || c.kind === "story") {
        if (idx >= 0) c.ownerSeat = idx; else delete c.ownerSeat;
      }
      return reminders.length ? { reminders } : {};
    }
    case "toPile": {
      const c = carte(state, msg.id);
      if (c.kind === "key") refuser("une clé ne va pas dans une pile");
      const pile = String(msg.pile);
      if (!(pile in state.piles)) refuser("pile inconnue");
      retirerDesPiles(state, c.id);
      state.links = state.links.filter((l) => l.a !== c.id && l.b !== c.id);
      c.loc = { pile };
      c.faceUp = estDefausse(def, pile); // une défausse est consultable, face visible
      if (c.kind === "location") c.side = "a";
      c.exhausted = false;
      c.tokens = {};
      delete c.ownerSeat;
      if (msg.top === false) state.piles[pile].push(c.id); else state.piles[pile].unshift(c.id);
      if (msg.shuffle === true && !estDefausse(def, pile)) {
        shuffle(state.piles[pile], rng);
        addLog(state, "action", `${nomCarte(def, c)} mélangé dans ${pile === "encounter" ? "la pioche de rencontre" : nomPile(def, pile)}.`);
      } else if (pile === "encounterDiscard") addLog(state, "action", `${nomCarte(def, c)} défaussé.`);
      const reminders = sortieHistoire(state, def, c);
      return reminders.length ? { reminders } : {};
    }
    case "flipCard": {
      const c = carte(state, msg.id);
      if (c.kind === "key" || c.kind === "mini") refuser("ce jeton ne se retourne pas");
      // Un dos « histoire » ne se révèle pas par un simple retournement : seulement par une demande explicite
      // (menu « Révéler quand une carte l'indique », {reveal: true}).
      if (c.storyBack && !c.faceUp && msg.reveal !== true) refuser("cette carte a un dos « histoire » : révélez-la seulement quand une carte l'indique");
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
    case "randomPick": {
      // {pile, n} : nomme n cartes distinctes tirées au hasard dans la pile, sans la modifier (« choisir un lieu au hasard »).
      const pile = String(msg.pile);
      if (!(pile in state.piles) || pile === "removed") refuser("pile inconnue");
      const n = Math.max(1, Math.min(Number(msg.n) || 1, state.piles[pile].length));
      if (!state.piles[pile].length) refuser("cette pile est vide");
      const tires = shuffle([...state.piles[pile]], rng).slice(0, n).map((id) => nomCarte(def, state.cards[id]));
      const entry = addLog(state, "action", `Tirage au hasard dans ${nomPile(def, pile)} (sans la modifier) : ${tires.join(", ")}.`);
      return { reminders: [entry] };
    }
    case "shufflePile": {
      const pile = String(msg.pile);
      if (!(pile in state.piles)) refuser("pile inconnue");
      shuffle(state.piles[pile], rng);
      if (!estDefausse(def, pile)) for (const id of state.piles[pile]) { state.cards[id].faceUp = false; if (state.cards[id].kind === "location") state.cards[id].side = "a"; }
      addLog(state, "action", pile === "encounter" ? "Pioche de rencontre mélangée." : `${nomPile(def, pile)} : mélangée.`);
      return {};
    }
    case "drawEncounter": {
      // Piocher = retourner la première carte de la pile (pioche de rencontre par défaut, ou une pile
      // déclarée par le scénario), qui reste dessus ; le joueur la déplace ensuite à la main (glisser).
      // Tant qu'une carte révélée est dessus, la pile attend.
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      const pile = String(msg.pile ?? "encounter");
      if (!(pile in state.piles) || ["removed", "agendaDeck", "actDeck"].includes(pile) || estDefausse(def, pile)) refuser("pile inconnue");
      const dessus = state.piles[pile].length ? state.cards[state.piles[pile][0]] : null;
      if (dessus?.faceUp) refuser(`${nomCarte(def, dessus)} est déjà révélé : glissez-le où il faut avant de piocher`);
      if (!state.piles[pile].length) {
        const defausse = defausseDe(def, pile) ?? refuser("cette pile est vide");
        if (!state.piles[defausse]?.length) refuser("pioche et défausse vides");
        remelangerDefausse(state, rng, pile, defausse);
        addLog(state, "action", pile === "encounter" ? "Pioche de rencontre vide : la défausse est remélangée." : `${nomPile(def, pile)} vide : sa défausse est remélangée.`);
      }
      const c = state.cards[state.piles[pile][0]];
      c.faceUp = true;
      // Un lieu à double face tiré montre son côté non révélé (nom lisible, rien de dévoilé).
      if (c.kind === "location" && def.cards.find((d) => d.code === c.code)?.back === "b") c.side = "b";
      addLog(state, "action", `${nomSiege(state, s, def)} pioche ${nomCarte(def, c)}${pile === "encounter" ? "" : ` (${nomPile(def, pile)})`}.`, s);
      return {};
    }
    case "reshuffleDiscard": {
      // {deck?} : pioche de rencontre par défaut, ou une seconde pioche déclarée avec sa défausse.
      const pioche = String(msg.deck ?? "encounter");
      const defausse = defausseDe(def, pioche) ?? refuser("cette pioche n'a pas de défausse");
      if (!state.piles[defausse]?.length) refuser("la défausse est vide");
      const n = state.piles[defausse].length;
      remelangerDefausse(state, rng, pioche, defausse);
      addLog(state, "action", `${n} carte${n > 1 ? "s" : ""} de la défausse remélangée${n > 1 ? "s" : ""} dans ${pioche === "encounter" ? "la pioche" : nomPile(def, pioche)}.`);
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
      // {pile, n?} : consulte la pile (ou seulement ses n premières cartes : « regardez les X premières cartes du Cosmos »).
      const pile = String(msg.pile ?? "encounter");
      if (!(pile in state.piles) || pile === "removed") refuser("pile inconnue");
      const n = Number(msg.n) > 0 ? Math.min(Number(msg.n), state.piles[pile].length) : state.piles[pile].length;
      if (Number(msg.n) > 0) addLog(state, "action", `${moi !== null ? nomSiege(state, moi, def) : "Un joueur"} regarde les ${n} première${n > 1 ? "s" : ""} carte${n > 1 ? "s" : ""} de ${pile === "encounter" ? "la pioche" : nomPile(def, pile)}.`, moi ?? undefined);
      return { peek: { pile, cards: state.piles[pile].slice(0, n).map((id) => ({ id, code: state.cards[id].code })) } };
    }
    case "advanceAgenda":
    case "advanceAct": {
      const agenda = msg.t === "advanceAgenda";
      const pile = agenda ? state.piles.agendaDeck : state.piles.actDeck;
      const courantId = agenda ? state.agendaId : state.actId;
      if (!pile.length && !courantId) refuser(agenda ? "plus d'agenda" : "plus d'acte");
      const courant = courantId ? state.cards[courantId] : null;
      const reminders = avancer(state, def, agenda, !courant || !("zone" in courant.loc) || courant.loc.zone !== "story");
      return reminders.length ? { reminders } : {};
    }

    // ---- Lieux qui se remplacent (TCU), indices en masse ------------------------------
    case "swapLocation": {
      // {id} : ce lieu ; {all: true} : tous les lieux du tapis qui ont une version jumelle disponible.
      if (msg.all === true) {
        const lieux = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
          && def.swaps?.some((p) => p.pair.includes(k.code)));
        if (!lieux.length) refuser("aucun lieu à remplacer");
        let n = 0;
        for (const l of lieux) {
          try { remplacerLieu(state, def, l); n++; } catch (e) { if (!(e instanceof Refus)) throw e; }
        }
        if (!n) refuser("aucune version de remplacement disponible");
        addLog(state, "action", `${n} lieu${n > 1 ? "x" : ""} remplacé${n > 1 ? "s" : ""} par ${n > 1 ? "leur" : "sa"} version jumelle.`);
        return {};
      }
      remplacerLieu(state, def, carte(state, msg.id));
      return {};
    }
    case "removeLocations": {
      // Retire de la partie tous les lieux du tapis sauf {keep} (les cartes le demandent parfois d'un coup) : jetons et chemins effacés.
      const garde = carte(state, msg.keep);
      const lieux = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board" && k.id !== garde.id);
      if (!lieux.length) refuser("aucun autre lieu en jeu");
      for (const l of lieux) {
        l.loc = { pile: "removed" };
        l.tokens = {};
        l.exhausted = false;
        l.faceUp = false;
        state.links = state.links.filter((k) => k.a !== l.id && k.b !== l.id);
      }
      addLog(state, "action", `${lieux.length} lieu${lieux.length > 1 ? "x" : ""} retiré${lieux.length > 1 ? "s" : ""} de la partie ; ${nomCarte(def, garde)} reste en jeu.`);
      return {};
    }
    case "emptySpace": {
      // {x, y} : pose un « espace vide » (dos de carte joueur, kind proxy) sur le tapis — Before the Black Throne.
      if (!def.emptySpace) refuser("ce scénario n'utilise pas d'espace vide");
      const n = Object.keys(state.cards).filter((k) => k.startsWith("empty-")).length + 1;
      const id = `empty-${n}`;
      state.cards[id] = { id, code: "empty:space", kind: "proxy", storyBack: false, loc: { zone: "board", x: Math.round(Number(msg.x) || 0), y: Math.round(Number(msg.y) || 0), z: nextZ(state) }, faceUp: false, exhausted: false, side: "a", tokens: {} };
      addLog(state, "action", "Un espace vide est posé sur le tapis (dos de carte joueur : sortez-le de la partie quand un lieu prend sa place).");
      return {};
    }
    case "clearClues": {
      // Retire tous les indices des lieux en jeu (les cartes le demandent parfois d'un coup).
      let n = 0;
      for (const k of Object.values(state.cards)) {
        if (k.kind === "location" && "zone" in k.loc && k.loc.zone === "board" && k.tokens.clue) { n += k.tokens.clue; delete k.tokens.clue; }
      }
      addLog(state, "action", n ? `${n} indice${n > 1 ? "s" : ""} retiré${n > 1 ? "s" : ""} des lieux en jeu.` : "Aucun indice sur les lieux en jeu.");
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
