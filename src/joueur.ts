// Board joueur (cahier des charges §10) — étape 1 : import du deck au lobby (ArkhamDB / arkham.build),
// faiblesse de base aléatoire, création des cartes des decks à la mise en place de la table.
// Les actions `p:*` du board (mise en place du joueur, mulligan, pioche, jeu) arrivent aux étapes 2 et 3.
//
// Données : public/data/player_cards.json (index compact produit par scripts/build.mjs, lu par le DO depuis les
// assets) ; les définitions des cartes d'un deck voyagent ensuite dans state.extraDefs, comme celles de l'outil
// « Générer une carte ». Aucun texte de carte n'est reproduit : noms, chiffres et images seulement.

import type { CardId, CardKind, CardState, RoomState, Seat, SeatDeck, ZoneId } from "./state";
import { emptyBoard } from "./state";
import { addLog, shuffle, CARD_W, type Rng } from "./setup";
import { Refus, refuser, type Resultat } from "./actions";

/** Entrée de l'index des cartes joueur (clés courtes, voir buildPlayerCards dans scripts/build.mjs). */
export type FicheJoueur = {
  c: string; n: string; s?: string; t: string; st?: string; f: string; f2?: string;
  k?: number | null; x?: number; sl?: string; p?: 1; h?: number; m?: number;
  u?: { n: number; type: string }; b?: string; bc?: number; q: number; un?: 1; d?: 1; pk: string; tr?: string;
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
    code: f.c, name: f.n, kind: KIND_JOUEUR[f.t] ?? "asset", qty: f.q, set: "player", back: f.d ? "b" : "player", storyBack: false,
    player: true, type: f.t, faction: f.f,
  };
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
  return def;
}

export const PILES_JOUEUR = (n: number) => ({ deck: `pdeck${n}`, hand: `phand${n}`, discard: `pdiscard${n}` });
export const ZONES_JOUEUR = (n: number) => ({ play: `pplay${n}` as ZoneId, limbo: `plimbo${n}` as ZoneId, aside: `paside${n}` as ZoneId });

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

// ---- Actions du board (étapes 2 et 3) ---------------------------------------------------

export type ActionJoueur = { t: string; [k: string]: unknown };

/** Actions `p:*`, réservées au siège (le DO a déjà vérifié la connexion). Étape 1 : aucune action encore. */
export function jouerJoueur(_state: RoomState, msg: ActionJoueur, _siege: number, _index: IndexJoueur, _rng: Rng): Resultat {
  return refuser(`action « ${msg.t} » inconnue (board joueur : étape 2)`);
}

export { Refus };
