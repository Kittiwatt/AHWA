// Board joueur (cahier des charges §10) — étape 1 : import du deck au lobby (ArkhamDB / arkham.build),
// faiblesse de base aléatoire, création des cartes des decks à la mise en place de la table.
// Les actions `p:*` du board (mise en place du joueur, mulligan, pioche, jeu) arrivent aux étapes 2 et 3.
//
// Données : public/data/player_cards.json (index compact produit par scripts/build.mjs, lu par le DO depuis les
// assets) ; les définitions des cartes d'un deck voyagent ensuite dans state.extraDefs, comme celles de l'outil
// « Générer une carte ». Aucun texte de carte n'est reproduit : noms, chiffres et images seulement.

import type { CardId, CardKind, CardState, LogEntry, RoomState, Seat, SeatDeck, ZoneId } from "./state";
import { emptyBoard } from "./state";
import { addLog, shuffle, CARD_W, CARD_H, MINI, nextZ, type Rng } from "./setup";
import { Refus, refuser } from "./refus";

type Resultat = { reminders?: LogEntry[]; peek?: { cards: { id: string; code: string }[]; pile: string } };

/** Entrée de l'index des cartes joueur (clés courtes, voir buildPlayerCards dans scripts/build.mjs). */
export type FicheJoueur = {
  c: string; n: string; s?: string; t: string; st?: string; f: string; f2?: string;
  k?: number | null; x?: number; sl?: string; p?: 1; h?: number; m?: number;
  u?: { n: number; type: string }; b?: string; bc?: number; q: number; un?: 1; d?: 1; lk?: string; ln?: string; pk: string; tr?: string;
  sk?: { w?: number; i?: number; c?: number; a?: number; x?: number };
};
export type IndexJoueur = Map<string, FicheJoueur>;

/** Fiche d'un investigateur (public/data/investigators.json). */
export type FicheInvestigateur = {
  code: string; name: string; health: number; sanity: number; parallel?: boolean;
  startsInPlay?: ({ name: string } | { trait: string })[];
};

const KIND_JOUEUR: Record<string, CardKind> = {
  asset: "asset", event: "event", skill: "skill", treachery: "treachery", enemy: "enemy", story: "story", location: "location",
};

/** Les quatre faiblesses de base multijoueur de The Dream-Eaters : exclues du tirage en solo. */
const TDE_MULTI = new Set(["06035", "06036", "06037", "06038"]);
const PLACEHOLDER = "01000";   // « Random Basic Weakness »

// ---- Liens de deck --------------------------------------------------------------------

export type LienDeck = { source: "arkhamdb" | "arkhambuild"; genre: "decklist" | "deck" | "share" | "local"; id: string };

/** Reconnaît un lien ArkhamDB (decklist publiée, deck partageable) ou arkham.build (share, deck synchronisé, deck local). */
export function analyserLien(brut: string): LienDeck | null {
  const u = String(brut ?? "").trim();
  let m: RegExpExecArray | null;
  // « decklist » contient « deck » : tester decklist/view avant deck/view (mémo §3).
  if ((m = /arkhamdb\.com\/decklist\/view\/(\d+)/i.exec(u))) return { source: "arkhamdb", genre: "decklist", id: m[1] };
  if ((m = /arkhamdb\.com\/deck\/view\/(\d+)/i.exec(u))) return { source: "arkhamdb", genre: "deck", id: m[1] };
  if ((m = /arkham\.build\/share\/([A-Za-z0-9_-]+)/i.exec(u))) return { source: "arkhambuild", genre: "share", id: m[1] };
  if ((m = /arkham\.build\/deck\/view\/([A-Za-z0-9_-]+)/i.exec(u))) return { source: "arkhambuild", genre: /^\d+$/.test(m[1]) ? "deck" : "local", id: m[1] };
  return null;
}

export type DeckBrut = {
  id: number | string; name?: string; investigator_code: string;
  slots: Record<string, number>; sideSlots?: Record<string, number> | null; ignoreDeckLimitSlots?: Record<string, number> | null;
  meta?: string | Record<string, unknown> | null; taboo_id?: number | null; xp?: number | null;
};

const ENTETES = { "user-agent": "Mozilla/5.0 (compatible; AHWA/1.0; +https://github.com/Kittiwatt/AHWA)", accept: "application/json" };

async function lireJson(url: string, fetchFn: typeof fetch): Promise<DeckBrut | null> {
  let r: Response;
  try {
    r = await fetchFn(url, { headers: ENTETES, redirect: "manual", signal: AbortSignal.timeout(10000) });
  } catch {
    return null;
  }
  // Un deck ArkhamDB privé répond par une redirection (vers la connexion) : pas de JSON.
  if (r.status >= 300 && r.status < 400) refuser("ce deck ArkhamDB n'est pas partageable : rends-le partageable (« Share deck ») ou passe par arkham.build");
  if (!r.ok) return null;
  try {
    const data = (await r.json()) as DeckBrut;
    return data && typeof data === "object" && data.slots ? data : null;
  } catch {
    return null;
  }
}

/** Télécharge le deck désigné par le lien. Lève un Refus lisible par le joueur en cas d'échec. */
export async function chargerDeck(lien: LienDeck, fetchFn: typeof fetch = fetch): Promise<DeckBrut> {
  if (lien.genre === "local") refuser("ce deck n'existe que dans ton navigateur : partage-le d'abord sur arkham.build (bouton « Share »)");
  if (lien.source === "arkhamdb") {
    const url = `https://arkhamdb.com/api/public/${lien.genre === "decklist" ? "decklist" : "deck"}/${lien.id}.json`;
    return (await lireJson(url, fetchFn)) ?? refuser("deck introuvable sur ArkhamDB");
  }
  // arkham.build : API de partage ; un deck synchronisé (id numérique) se lit aussi chez ArkhamDB.
  const partage = await lireJson(`https://api.arkham.build/v1/public/share/${lien.id}`, fetchFn);
  if (partage) return partage;
  if (lien.genre === "deck") {
    const db = await lireJson(`https://arkhamdb.com/api/public/deck/${lien.id}.json`, fetchFn);
    if (db) return db;
  }
  return refuser("deck introuvable sur arkham.build : vérifie le lien de partage");
}

// ---- Construction du deck du siège ---------------------------------------------------

function meta(brut: DeckBrut): Record<string, unknown> {
  if (!brut.meta) return {};
  if (typeof brut.meta === "object") return brut.meta;
  try { return JSON.parse(brut.meta) as Record<string, unknown>; } catch { return {}; }
}

/** Recto effectif : l'enquêteur parallèle (meta.alternate_front) s'il est renseigné, sinon celui du deck. */
export function rectoEffectif(brut: DeckBrut): string {
  const alt = meta(brut).alternate_front;
  return typeof alt === "string" && /^\d{5}$/.test(alt) ? alt : brut.investigator_code;
}

export function construireDeck(brut: DeckBrut, lien: LienDeck, url: string, index: IndexJoueur): SeatDeck {
  const m = meta(brut);
  const slots: Record<string, number> = {};
  const unknown: string[] = [];
  let pending = 0;
  const ajouter = (code: string, n: number) => {
    if (!Number.isInteger(n) || n <= 0) return;
    if (code === PLACEHOLDER) { pending += n; return; }
    if (!index.has(code)) { if (!unknown.includes(code)) unknown.push(code); return; }
    slots[code] = (slots[code] ?? 0) + n;
  };
  for (const [code, n] of Object.entries(brut.slots ?? {})) ajouter(code, Number(n));
  for (const [code, n] of Object.entries(brut.ignoreDeckLimitSlots ?? {})) ajouter(code, Number(n));
  if (!Object.keys(slots).length) refuser("ce deck ne contient aucune carte connue");
  // Cartes liées : chaque nom distinct du deck qui est le « bonded_to » d'une carte de l'index apporte bonded_count exemplaires.
  const noms = new Set(Object.keys(slots).map((c) => index.get(c)!.n));
  const bonded: Record<string, number> = {};
  for (const f of index.values()) if (f.b && noms.has(f.b) && !(f.c in slots)) bonded[f.c] = f.bc ?? 1;
  const customizations: Record<string, string> = {};
  for (const [k, v] of Object.entries(m)) if (k.startsWith("cus_") && typeof v === "string" && v) customizations[k.slice(4)] = v;
  const deck: SeatDeck = {
    source: lien.source, url, id: String(brut.id ?? lien.id), name: String(brut.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "Deck",
    investigatorCode: brut.investigator_code, slots, bonded, weaknessPending: pending, weaknessAdded: [], unknown,
    board: emptyBoard(),
  };
  if (Object.keys(customizations).length) deck.customizations = customizations;
  if (brut.taboo_id) deck.taboo = Number(brut.taboo_id);
  if (Number.isFinite(Number(brut.xp))) deck.xp = Number(brut.xp);
  return deck;
}

export function nombreDeCartes(deck: SeatDeck): number {
  return Object.values(deck.slots).reduce((n, q) => n + q, 0);
}

// ---- Faiblesse de base aléatoire ------------------------------------------------------

/** Liste des faiblesses de base tirables (pondérées par leur quantité) ; en solo, sans les quatre TDE multijoueur. */
export function faiblessesTirables(index: IndexJoueur, solo: boolean): FicheJoueur[] {
  return [...index.values()].filter((f) => f.st === "basicweakness" && f.c !== PLACEHOLDER && !(solo && TDE_MULTI.has(f.c)));
}

export function tirerFaiblesse(index: IndexJoueur, rng: Rng, solo: boolean): string {
  const pool = faiblessesTirables(index, solo);
  const total = pool.reduce((n, f) => n + f.q, 0);
  let r = rng() * total;
  for (const f of pool) { r -= f.q; if (r < 0) return f.c; }
  return pool[pool.length - 1].c;
}

/** Détermine un placeholder : tirage au hasard (« random ») ou faiblesse de base choisie (code). */
export function resoudreFaiblesse(deck: SeatDeck, index: IndexJoueur, choix: string, rng: Rng, solo: boolean): string {
  if (deck.weaknessPending <= 0) refuser("aucune faiblesse à déterminer");
  let code: string;
  if (choix === "random") code = tirerFaiblesse(index, rng, solo);
  else {
    const f = index.get(choix) ?? refuser("faiblesse inconnue");
    if (f.st !== "basicweakness") refuser("cette carte n'est pas une faiblesse de base");
    code = f.c;
  }
  deck.slots[code] = (deck.slots[code] ?? 0) + 1;
  deck.weaknessAdded.push(code);
  deck.weaknessPending--;
  return code;
}

// ---- Définitions et création des cartes ---------------------------------------------

/** Définition (state.extraDefs) d'une carte joueur : ce que le client et les actions lisent, sans texte. */
export function defJoueur(f: FicheJoueur): Record<string, unknown> {
  const def: Record<string, unknown> = {
    code: f.c, name: f.n, kind: KIND_JOUEUR[f.t] ?? "asset", qty: f.q, set: "player", back: f.d || f.lk ? "b" : "player", storyBack: false,
    player: true, type: f.t, faction: f.f,
  };
  // Verso qui est une autre carte (Sophie ↔ In Loving Memory, Dream-Gate…) : « Autre face » bascule les deux côtés.
  if (f.lk) { def.backCode = f.lk; if (f.ln) def.backName = f.ln; def.backKind = KIND_JOUEUR[f.t] ?? "asset"; }
  if (f.s) def.subname = f.s;
  if (f.st) def.subtype = f.st;
  if (f.f2) def.faction2 = f.f2;
  if (f.k !== undefined) def.cost = f.k;
  if (f.x) def.xp = f.x;
  if (f.sl) def.slot = f.sl;
  if (f.p) def.permanent = true;
  if (f.h !== undefined) def.health = f.h;
  if (f.m !== undefined) def.sanity = f.m;
  if (f.u) def.uses = f.u;
  if (f.un) def.unique = true;
  if (f.tr) def.traits = f.tr.split(".").map((t) => t.trim()).filter(Boolean);
  if (f.sk) def.skills = { willpower: f.sk.w ?? 0, intellect: f.sk.i ?? 0, combat: f.sk.c ?? 0, agility: f.sk.a ?? 0, wild: f.sk.x ?? 0 };
  return def;
}

export const PILES_JOUEUR = (n: number) => ({ deck: `pdeck${n}`, hand: `phand${n}`, discard: `pdiscard${n}`, weak: `pweak${n}` });
export const ZONES_JOUEUR = (n: number) => ({ play: `pplay${n}` as ZoneId, event: `pevent${n}` as ZoneId, commit: `pcommit${n}` as ZoneId, aside: `paside${n}` as ZoneId });
/** Piles et zones d'un board joueur : le chiffre final est le siège. */
export const PILE_JOUEUR_RE = /^p(?:deck|hand|discard|weak|play|event|commit|aside)([0-3])$/;

function nomSiege(seat: Seat, invName?: string): string {
  return seat.name ?? seat.custom?.name ?? invName ?? `Siège ${seat.index + 1}`;
}

/**
 * Après runSetup : pour chaque siège dont le deck est importé, crée les cartes (pioche mélangée, face cachée),
 * met les cartes liées hors jeu (face visible) et inscrit les définitions. Le board du joueur reste « à mettre en
 * place » : c'est son bouton qui distribue permanents, ressources et main (étape 2).
 */
export function creerDecks(state: RoomState, index: IndexJoueur, investigateurs: Map<string, FicheInvestigateur>, rng: Rng, zPlus: () => number) {
  for (const seat of state.seats) {
    if (!seat.investigatorCode || !seat.deck) continue;
    const n = seat.index;
    const piles = PILES_JOUEUR(n), zones = ZONES_JOUEUR(n);
    state.piles[piles.deck] = [];
    state.piles[piles.hand] = [];
    state.piles[piles.discard] = [];
    state.piles[piles.weak] = [];
    const deck = seat.deck;
    deck.board = emptyBoard();
    seat.counters.resources = 0;
    const ids: CardId[] = [];
    const creer = (code: string, i: number, loc: CardState["loc"], faceUp: boolean): CardState => {
      const f = index.get(code) ?? refuser(`carte ${code} inconnue de l'index des cartes joueur`);
      if (!state.extraDefs[code]) state.extraDefs[code] = defJoueur(f);
      const id = `p${n}-${code}-${i}`;
      const card: CardState = { id, code, kind: KIND_JOUEUR[f.t] ?? "asset", storyBack: false, loc, faceUp, exhausted: false, side: "a", tokens: {}, ownerSeat: n, player: true };
      state.cards[id] = card;
      return card;
    };
    for (const [code, q] of Object.entries(deck.slots)) {
      for (let i = 1; i <= q; i++) ids.push(creer(code, i, { pile: piles.deck }, false).id);
    }
    state.piles[piles.deck] = shuffle(ids, rng);
    let k = 0;
    for (const [code, q] of Object.entries(deck.bonded)) {
      for (let i = 1; i <= q; i++) creer(code, i, { zone: zones.aside, x: k++ * (CARD_W + 10), y: 0, z: zPlus() }, true);
    }
    const nbLiees = Object.values(deck.bonded).reduce((a, b) => a + b, 0);
    const inv = investigateurs.get(seat.investigatorCode);
    addLog(state, "setup", `Deck de ${nomSiege(seat, inv?.name)} (« ${deck.name} ») : ${ids.length} cartes mélangées${nbLiees ? `, ${nbLiees} carte${nbLiees > 1 ? "s" : ""} liée${nbLiees > 1 ? "s" : ""} hors jeu` : ""}${deck.unknown.length ? ` ; ${deck.unknown.length} carte${deck.unknown.length > 1 ? "s" : ""} inconnue${deck.unknown.length > 1 ? "s" : ""} ignorée${deck.unknown.length > 1 ? "s" : ""}` : ""}. Le board se met en place à la demande du joueur.`, n);
  }
}

/** Cartes que l'enquêteur commence en jeu (permanents et « You begin the game with X in play »), parmi les cartes de sa pioche. */
export function commenceEnJeu(state: RoomState, seat: Seat, index: IndexJoueur, inv: FicheInvestigateur | undefined): CardId[] {
  const pile = state.piles[PILES_JOUEUR(seat.index).deck] ?? [];
  const criteres = inv?.startsInPlay ?? [];
  const nomsMax = new Map<string, number>();
  return pile.filter((id) => {
    const c = state.cards[id];
    const f = index.get(c.code);
    if (!f) return false;
    if (f.p) return true;
    for (const k of criteres) {
      if ("trait" in k) { if (f.tr?.split(".").map((t) => t.trim()).includes(k.trait)) return true; }
      else if (f.n === k.name) {
        // Un seul exemplaire d'une carte nommée (deux Duke n'entrent pas tous les deux).
        const deja = nomsMax.get(f.n) ?? 0;
        if (deja >= 1) return false;
        nomsMax.set(f.n, deja + 1);
        return true;
      }
    }
    return false;
  });
}

// ---- Actions du board (étape 2 : mise en place, mulligan, pioche, main, défausse) --------------------

export type ActionJoueur = { t: string; [k: string]: unknown };

function defDe(state: RoomState, code: string): Record<string, unknown> | undefined {
  return state.extraDefs[code] as Record<string, unknown> | undefined;
}

export function nomJoueur(state: RoomState, c: CardState): string {
  return (defDe(state, c.code)?.name as string | undefined) ?? c.code;
}

function estFaiblesse(state: RoomState, c: CardState): boolean {
  const st = defDe(state, c.code)?.subtype;
  return st === "weakness" || st === "basicweakness";
}

function nomSiegeEtat(state: RoomState, n: number): string {
  const s = state.seats[n];
  return s.name ?? s.custom?.name ?? (s.investigatorCode && (state.extraDefs[s.investigatorCode] as { name?: string } | undefined)?.name) ?? `Siège ${n + 1}`;
}

function retirerDesPiles(state: RoomState, id: string) {
  for (const pile of Object.values(state.piles)) {
    const i = pile.indexOf(id);
    if (i >= 0) pile.splice(i, 1);
  }
}

/** Une carte va dans une pile du board : face cachée sauf défausse, jetons et état effacés, propriétaire conservé. */
function versPile(state: RoomState, c: CardState, pile: string, top = true) {
  retirerDesPiles(state, c.id);
  state.links = state.links.filter((l) => l.a !== c.id && l.b !== c.id);
  c.loc = { pile };
  c.faceUp = /^pdiscard/.test(pile);
  c.exhausted = false;
  c.tokens = {};
  c.side = "a";
  delete c.revealed;
  if (top) state.piles[pile].unshift(c.id); else state.piles[pile].push(c.id);
}

function carteDuSiege(state: RoomState, id: unknown, n: number): CardState {
  const c = state.cards[String(id)] ?? refuser("carte inconnue");
  if (!c.player || c.ownerSeat !== n) refuser("cette carte n'est pas à ce siège");
  return c;
}

/** Bord droit d'une zone (rangée) du board, pour y ranger une carte en fin de rangée. */
function boutDeZone(state: RoomState, zone: string): number {
  let x = 0;
  for (const c of Object.values(state.cards)) if ("zone" in c.loc && c.loc.zone === zone) x = Math.max(x, c.loc.x + CARD_W + 10);
  return x;
}

/** Pose une carte en jeu (face visible) avec ses jetons Uses et à la fin de la rangée. */
function mettreEnJeu(state: RoomState, c: CardState, n: number) {
  retirerDesPiles(state, c.id);
  const zone = ZONES_JOUEUR(n).play;
  c.loc = { zone, x: boutDeZone(state, zone), y: 0, z: nextZ(state) };
  c.faceUp = true;
  c.exhausted = false;
  c.side = "a";
  delete c.revealed;
  const uses = defDe(state, c.code)?.uses as { n: number; type: string } | undefined;
  c.tokens = uses && uses.n > 0 ? { uses: uses.n } : {};
}

/**
 * Pioche `n` cartes de la pioche vers la main (fin de main, face cachée). Pioche vide : la défausse est remélangée
 * dans la pioche et le rappel « prends 1 horreur » est ajouté ; pioche et défausse vides : rappel « vaincu ».
 * Pendant la mise en place (`setup`), une faiblesse piochée est mise de côté (pile pweak) et remplacée.
 */
function piocher(state: RoomState, n: number, nb: number, rng: Rng, setup: boolean, reminders: LogEntry[]): { main: CardId[]; faiblesses: CardId[]; remelange: number } {
  const piles = PILES_JOUEUR(n);
  const main: CardId[] = [], faiblesses: CardId[] = [];
  let remelange = 0, vide = false;
  for (let i = 0; i < nb && !vide; ) {
    if (!state.piles[piles.deck].length) {
      if (state.piles[piles.discard].length) {
        remelange += state.piles[piles.discard].length;
        state.piles[piles.deck].push(...shuffle(state.piles[piles.discard].splice(0), rng));
        for (const id of state.piles[piles.deck]) { state.cards[id].faceUp = false; delete state.cards[id].revealed; }
        addLog(state, "action", `Pioche de ${nomSiegeEtat(state, n)} vide : sa défausse (${remelange} cartes) est remélangée.`, n);
        reminders.push(addLog(state, "reminder", `${nomSiegeEtat(state, n)} : la pioche était vide — prends 1 horreur (règle de la pioche vide).`, n));
      } else {
        reminders.push(addLog(state, "reminder", `${nomSiegeEtat(state, n)} : pioche et défausse vides — l'enquêteur est vaincu (1 traumatisme mental).`, n));
        vide = true;
        break;
      }
    }
    const id = state.piles[piles.deck].shift()!;
    const c = state.cards[id];
    if (setup && estFaiblesse(state, c)) { versPile(state, c, piles.weak, false); faiblesses.push(id); continue; }
    versPile(state, c, piles.hand, false);
    main.push(id);
    i++;
  }
  return { main, faiblesses, remelange };
}

function pl(n: number, s: string, p = `${s}s`): string { return `${n} ${n > 1 ? p : s}`; }

/** Entretien (nextPhase → upkeep) : pioche 1 et +1 ressource pour un board en place ; rappel si la main dépasse 8. */
export function entretienJoueur(state: RoomState, seat: Seat, rng: Rng): LogEntry[] {
  const reminders: LogEntry[] = [];
  const n = seat.index;
  piocher(state, n, 1, rng, false, reminders);
  seat.counters.resources = (seat.counters.resources ?? 0) + 1;
  const main = state.piles[PILES_JOUEUR(n).hand].length;
  addLog(state, "action", `${nomSiegeEtat(state, n)} pioche 1 carte et gagne 1 ressource (entretien).`, n);
  if (main > 8) reminders.push(addLog(state, "reminder", `${nomSiegeEtat(state, n)} a ${main} cartes en main : défausse jusqu'à 8.`, n));
  return reminders;
}

/** Actions `p:*`, réservées au siège (le DO a vérifié la connexion et l'existence du deck). */
export function jouerJoueur(state: RoomState, msg: ActionJoueur, n: number, index: IndexJoueur, investigateurs: Map<string, FicheInvestigateur>, rng: Rng): Resultat {
  const seat = state.seats[n];
  const deck = seat.deck!;
  const piles = PILES_JOUEUR(n), zones = ZONES_JOUEUR(n);
  const nom = nomSiegeEtat(state, n);
  const reminders: LogEntry[] = [];

  switch (msg.t) {
    // ---- Mise en place du joueur (cahier §10.6) ----
    case "p:setup": {
      if (deck.board.setup !== "none") refuser("le board est déjà en place");
      shuffle(state.piles[piles.deck], rng);
      const enJeu = commenceEnJeu(state, seat, index, investigateurs.get(seat.investigatorCode ?? ""));
      for (const id of enJeu) mettreEnJeu(state, state.cards[id], n);
      seat.counters.resources = (seat.counters.resources ?? 0) + 5;
      const tir = piocher(state, n, 5, rng, true, reminders);
      deck.board.setup = "mulligan";
      deck.board.mulliganUsed = false;
      const nomsJeu = enJeu.map((id) => nomJoueur(state, state.cards[id]));
      addLog(state, "action", `${nom} met son board en place : pioche mélangée, ${nomsJeu.length ? `${nomsJeu.join(", ")} en jeu, ` : ""}5 ressources, ${pl(tir.main.length, "carte")} en main${tir.faiblesses.length ? ` (${pl(tir.faiblesses.length, "faiblesse")} mise${tir.faiblesses.length > 1 ? "s" : ""} de côté, remélangée${tir.faiblesses.length > 1 ? "s" : ""} après le mulligan)` : ""}.`, n);
      return { reminders };
    }
    case "p:mulligan": {
      if (deck.board.setup !== "mulligan") refuser(deck.board.mulliganUsed ? "le mulligan a déjà été fait" : "le board n'est pas en cours de mise en place");
      const ids = Array.isArray(msg.ids) ? (msg.ids as unknown[]).map(String) : [];
      const main = state.piles[piles.hand];
      if (!ids.length || !ids.every((id) => main.includes(id))) refuser("choisissez des cartes de votre main");
      const rendues = [...new Set(ids)];
      for (const id of rendues) retirerDesPiles(state, id);
      const tir = piocher(state, n, rendues.length, rng, true, reminders);
      // Cartes rendues et faiblesses mises de côté retournent dans la pioche, mélangées.
      const retour = [...rendues, ...state.piles[piles.weak].splice(0)];
      for (const id of retour) { const c = state.cards[id]; c.loc = { pile: piles.deck }; c.faceUp = false; c.tokens = {}; delete c.revealed; state.piles[piles.deck].push(id); }
      shuffle(state.piles[piles.deck], rng);
      deck.board.mulliganUsed = true;
      deck.board.setup = "done";
      addLog(state, "action", `${nom} rend ${pl(rendues.length, "carte")} et en pioche ${tir.main.length} (mulligan) ; les cartes rendues${retour.length > rendues.length ? " et les faiblesses mises de côté" : ""} sont remélangées dans la pioche.`, n);
      return { reminders };
    }
    case "p:keep": {
      if (deck.board.setup !== "mulligan") refuser("le board n'est pas en cours de mise en place");
      const faiblesses = state.piles[piles.weak].splice(0);
      for (const id of faiblesses) { const c = state.cards[id]; c.loc = { pile: piles.deck }; c.faceUp = false; state.piles[piles.deck].push(id); }
      if (faiblesses.length) shuffle(state.piles[piles.deck], rng);
      deck.board.setup = "done";
      addLog(state, "action", `${nom} garde sa main${faiblesses.length ? ` ; ${pl(faiblesses.length, "faiblesse")} mise${faiblesses.length > 1 ? "s" : ""} de côté remélangée${faiblesses.length > 1 ? "s" : ""} dans la pioche` : ""}.`, n);
      return {};
    }

    // ---- Pioche, main, défausse ----
    case "p:draw": {
      const nb = Math.max(1, Math.min(10, Math.round(Number(msg.n) || 1)));
      const tir = piocher(state, n, nb, rng, false, reminders);
      if (tir.main.length) addLog(state, "action", `${nom} pioche ${pl(tir.main.length, "carte")}.`, n);
      return { reminders };
    }
    case "p:discard": {
      const c = carteDuSiege(state, msg.id, n);
      versPile(state, c, piles.discard);
      addLog(state, "action", `${nom} défausse ${nomJoueur(state, c)}.`, n);
      return {};
    }
    case "p:randomDiscard": {
      const nb = Math.max(1, Math.min(10, Math.round(Number(msg.n) || 1)));
      const main = state.piles[piles.hand];
      if (!main.length) refuser("la main est vide");
      const choix = shuffle([...main], rng).slice(0, nb);
      const noms: string[] = [];
      for (const id of choix) { const c = state.cards[id]; versPile(state, c, piles.discard); noms.push(nomJoueur(state, c)); }
      const entry = addLog(state, "action", `${nom} défausse au hasard : ${noms.join(", ")}.`, n);
      return { reminders: [entry] };
    }
    case "p:toHand": {
      const c = carteDuSiege(state, msg.id, n);
      const depuisPioche = "pile" in c.loc && c.loc.pile === piles.deck;
      const depuisMain = "pile" in c.loc && c.loc.pile === piles.hand;
      if (depuisMain) return {};
      versPile(state, c, piles.hand, false);
      addLog(state, "action", depuisPioche ? `${nom} prend une carte de sa pioche en main.` : `${nom} reprend ${nomJoueur(state, c)} en main.`, n);
      return {};
    }
    case "p:reveal": {
      const c = carteDuSiege(state, msg.id, n);
      if (!("pile" in c.loc) || c.loc.pile !== piles.hand) refuser("cette carte n'est pas dans la main");
      const v = msg.v === undefined ? !c.revealed : Boolean(msg.v);
      if (v) { c.revealed = true; addLog(state, "action", `${nom} montre ${nomJoueur(state, c)} (carte de sa main).`, n); }
      else delete c.revealed;
      return {};
    }
    case "p:search": {
      // {pile, n?} : pioche (les n premières dans l'ordre, ou toute la pioche — le client la remélange à la fermeture) ou défausse.
      const pile = String(msg.pile ?? piles.deck);
      if (pile !== piles.deck && pile !== piles.discard) refuser("pile inconnue");
      const total = state.piles[pile].length;
      const nb = Number(msg.n) > 0 ? Math.min(Number(msg.n), total) : total;
      if (pile === piles.deck) addLog(state, "action", Number(msg.n) > 0 ? `${nom} regarde les ${pl(nb, "première carte", "premières cartes")} de sa pioche.` : `${nom} cherche dans sa pioche.`, n);
      return { peek: { pile, cards: state.piles[pile].slice(0, nb).map((id) => ({ id, code: state.cards[id].code })) } };
    }
    case "p:drawTo": {
      // Pose la première carte de la pioche face cachée dans une zone du board ({zone, x?, y?}) : en jeu, Play,
      // Commit, hors jeu ou zone de menace (cartes placées face cachée par un effet).
      const zone = String(msg.zone ?? zones.play);
      if (![zones.play, zones.event, zones.commit, zones.aside, `seat${n}`].includes(zone as ZoneId)) refuser("zone inconnue");
      const id = state.piles[piles.deck][0] ?? refuser("la pioche est vide");
      const c = state.cards[id];
      retirerDesPiles(state, id);
      const x = zone === zones.play ? Math.max(0, Math.round(Number(msg.x) || 0)) : zone === zones.event ? 0 : boutDeZone(state, zone);
      const y = zone === zones.play ? Math.max(0, Math.round(Number(msg.y) || 0)) : 0;
      c.loc = { zone: zone as ZoneId, x, y, z: nextZ(state) };
      c.faceUp = false; c.exhausted = false; c.side = "a"; c.tokens = {}; delete c.revealed;
      addLog(state, "action", `${nom} pose la première carte de sa pioche face cachée${zone === zones.play ? " en jeu" : zone === zones.event ? " dans Play" : zone === zones.commit ? " dans Commit" : zone === zones.aside ? " hors jeu" : " dans sa zone de menace"}.`, n);
      return {};
    }
    case "p:exile": {
      const c = carteDuSiege(state, msg.id, n);
      versPile(state, c, "removed");
      c.faceUp = false;
      addLog(state, "action", `${nom} retire ${nomJoueur(state, c)} de la partie.`, n);
      return {};
    }
    case "p:aside": {
      // Hors jeu (mises de côté), en fin de rangée, face visible.
      const c = carteDuSiege(state, msg.id, n);
      retirerDesPiles(state, c.id);
      c.loc = { zone: zones.aside, x: boutDeZone(state, zones.aside), y: 0, z: nextZ(state) };
      c.faceUp = true; c.exhausted = false; c.tokens = {}; delete c.revealed;
      addLog(state, "action", `${nom} met ${nomJoueur(state, c)} hors jeu (de côté).`, n);
      return {};
    }
    // ---- Jouer (étape 3, cahier §10.6) ----
    case "p:play": {
      // Depuis la main (payée) ou hors jeu (cartes liées : gratuite) : asset → en jeu, événement → « en cours ».
      const c = carteDuSiege(state, msg.id, n);
      const def = defDe(state, c.code) ?? refuser("carte sans définition");
      const depuisMain = "pile" in c.loc && c.loc.pile === piles.hand;
      const depuisCote = "zone" in c.loc && c.loc.zone === zones.aside;
      if (!depuisMain && !depuisCote) refuser("jouez une carte de votre main (ou une carte mise de côté)");
      const libre = Boolean(msg.free) || depuisCote;
      const imprime = def.cost as number | null | undefined;
      let cout = 0, detail = "sans payer";
      if (!libre) {
        if (imprime === -2) { cout = Math.max(0, Math.round(Number(msg.cost) || 0)); detail = `X = ${cout}`; }
        else if (typeof imprime === "number" && imprime > 0) { cout = imprime; detail = `${cout} ressource${cout > 1 ? "s" : ""}`; }
        else detail = "coût 0";
      }
      // Les ressources ne passent jamais en négatif (retour de test du 2026-09-08) : refus explicite, le joueur
      // peut encore « Mettre en jeu sans payer » si un effet le permet.
      const dispo = seat.counters.resources ?? 0;
      if (cout > dispo) refuser(`pas assez de ressources pour jouer ${nomJoueur(state, c)} : ${cout} nécessaire${cout > 1 ? "s" : ""}, ${dispo} disponible${dispo > 1 ? "s" : ""}`);
      seat.counters.resources = dispo - cout;
      const type = String(def.type ?? c.kind);
      if (type === "event") {
        // Zone Play (une carte) : l'événement précédent, s'il y est encore, est résolu → défausse.
        const precedent = Object.values(state.cards).find((x) => "zone" in x.loc && x.loc.zone === zones.event);
        if (precedent) { versPile(state, precedent, piles.discard); addLog(state, "action", `${nom} défausse ${nomJoueur(state, precedent)} (événement résolu).`, n); }
        retirerDesPiles(state, c.id);
        c.loc = { zone: zones.event, x: 0, y: 0, z: nextZ(state) };
        c.faceUp = true; c.exhausted = false; c.side = "a"; c.tokens = {}; delete c.revealed;
      } else if (type === "skill") {
        // Un skill ne se joue pas : il s'engage (Commit).
        retirerDesPiles(state, c.id);
        c.loc = { zone: zones.commit, x: boutDeZone(state, zones.commit), y: 0, z: nextZ(state) };
        c.faceUp = true; c.exhausted = false; c.side = "a"; c.tokens = {}; delete c.revealed;
      } else mettreEnJeu(state, c, n);   // soutien (ou autre) : en jeu, avec ses Uses
      addLog(state, "action", `${nom} joue ${nomJoueur(state, c)} (${detail})${type === "event" ? " — Play" : type === "skill" ? " — Commit" : ""}.`, n);
      return {};
    }
    case "p:commit": {
      // Engager une carte de la main au test de compétence : zone Commit, sans coût.
      const c = carteDuSiege(state, msg.id, n);
      if (!("pile" in c.loc) || c.loc.pile !== piles.hand) refuser("engagez une carte de votre main");
      retirerDesPiles(state, c.id);
      c.loc = { zone: zones.commit, x: boutDeZone(state, zones.commit), y: 0, z: nextZ(state) };
      c.faceUp = true; c.exhausted = false; c.side = "a"; c.tokens = {}; delete c.revealed;
      addLog(state, "action", `${nom} engage ${nomJoueur(state, c)} au test.`, n);
      return {};
    }
    case "p:resolve": {
      // {zone: "commit" (défaut) | "play"} — test résolu : tout ce qui est engagé (Commit) va à la défausse ;
      // événement résolu : la zone Play est vidée dans la défausse (limbes → défausse, Grimoire p. 15).
      const zone = msg.zone === "play" ? zones.event : zones.commit;
      const cartes = Object.values(state.cards).filter((c) => "zone" in c.loc && c.loc.zone === zone).sort((a, b) => ("zone" in a.loc ? a.loc.z : 0) - ("zone" in b.loc ? b.loc.z : 0));
      if (!cartes.length) refuser(zone === zones.event ? "aucun événement dans Play" : "aucune carte engagée");
      const noms: string[] = [];
      for (const c of cartes) { noms.push(nomJoueur(state, c)); if (c.player && c.ownerSeat === n) versPile(state, c, piles.discard); else versPile(state, c, "encounterDiscard"); }
      addLog(state, "action", zone === zones.event ? `${nom} résout ${noms.join(", ")} → défausse.` : `${nom} — test résolu : ${noms.join(", ")} → défausse.`, n);
      return {};
    }
    case "p:toLocation": {
      // Pose une carte de son board sur le tapis, sur le lieu où se trouve son pion (sinon au centre).
      const c = carteDuSiege(state, msg.id, n);
      const mini = state.cards[`mini-${n}`];
      let cible: CardState | null = null;
      if (mini && "zone" in mini.loc && mini.loc.zone === "board") {
        const mx = mini.loc.x + MINI / 2, my = mini.loc.y + MINI / 2;
        let meilleur = Infinity;
        for (const l of Object.values(state.cards)) {
          if (l.kind !== "location" || !("zone" in l.loc) || l.loc.zone !== "board") continue;
          const d = Math.hypot(l.loc.x + CARD_W / 2 - mx, l.loc.y + 10 - my);
          if (d < meilleur) { meilleur = d; cible = l; }
        }
        if (cible && meilleur > CARD_W * 1.5) cible = null;
      }
      retirerDesPiles(state, c.id);
      const x = cible && "zone" in cible.loc ? cible.loc.x + 24 : 737 - CARD_W / 2;
      const y = cible && "zone" in cible.loc ? cible.loc.y + CARD_H - 70 : 411 - CARD_H / 2;
      c.loc = { zone: "board", x, y, z: nextZ(state) };
      c.faceUp = true; delete c.revealed;
      addLog(state, "action", `${nom} pose ${nomJoueur(state, c)} sur le tapis${cible ? " (sur son lieu)" : ""}.`, n);
      return {};
    }
    default:
      return refuser(`action « ${msg.t} » inconnue`);
  }
}

export { Refus };
