// Actions de jeu sur le tapis (étape 2) — fonctions pures sur l'état, appelées par le DO.
// Règle « rien n'est jamais bloqué » (cahier §8) : on ne refuse que pour intégrité (carte, pile,
// siège inconnus), jamais parce que « ce n'est pas le moment ».

import type { CardState, LogEntry, Phase, RoomState, Token, ZoneId } from "./state";
import type { StageEffects, ScenarioDef } from "./scenario";
import { addLog, nextZ, nomVisible, revealLocation, shuffle, type Rng, SEAT_ZONES, CARD_W, CARD_H, MINI, cleDeCouleur, LIBELLES_INONDATION, poserCleSur, texteMaree, enfouir } from "./setup";
import { Refus, refuser } from "./refus";
import { entretienJoueur, PILE_JOUEUR_RE } from "./joueur";

export { Refus, refuser };

export type Resultat = { reminders?: LogEntry[]; peek?: { cards: { id: string; code: string }[]; pile: string } };

const PHASES: Phase[] = ["mythos", "investigation", "enemy", "upkeep"];
const NOMS_PHASES: Record<string, string> = {
  mythos: "phase du mythe", investigation: "phase des enquêteurs", enemy: "phase des ennemis", upkeep: "phase d'entretien",
};
const ZONES = new Set<string>(["board", "seat0", "seat1", "seat2", "seat3", "story", "aside", "victory",
  ...[0, 1, 2, 3].flatMap((n) => [`pplay${n}`, `pevent${n}`, `pcommit${n}`, `paside${n}`])]);   // zones du board joueur (cahier §10.4)
const TOKENS = new Set(["doom", "clue", "damage", "horror", "resource", "generic", "uses", "flood"]);
const JETONS_RESERVE = new Set<Token>(["bless", "curse"]);   // révélés, ils retournent à la réserve, pas dans le sac (TIC) ; 10 au plus chacun
// Grille des diagrammes de placement (cartes 126 × 178 avec leurs marges) : « en dessous, à gauche, à droite » d'un lieu.
const PAS_X = 186, PAS_Y = 238;
const AUTOUR: [string, number, number, string][] = [["en dessous", 0, PAS_Y, "below"], ["à gauche", -PAS_X, 0, "left"], ["à droite", PAS_X, 0, "right"]];
const CHAOS_TOKENS = new Set<string>(["+1", "0", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8", "skull", "cultist", "tablet", "elder_thing", "auto_fail", "elder_sign", "bless", "curse", "frost", "blood"]);

function carte(state: RoomState, id: unknown): CardState {
  const c = state.cards[String(id)];
  return c ?? refuser("carte inconnue");
}

function siege(state: RoomState, n: unknown): number {
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0 || i > 3 || !state.seats[i].investigatorCode) refuser("siège sans enquêteur");
  return i;
}

export function retirerDesPiles(state: RoomState, id: string) {
  for (const pile of Object.values(state.piles)) {
    const i = pile.indexOf(id);
    if (i >= 0) pile.splice(i, 1);
  }
}

function nomPile(def: ScenarioDef, pile: string): string {
  return def.piles?.find((p) => p.id === pile)?.label ?? pile;
}

/** Nom de la face visible (le verso d'un lieu non révélé garde son secret : « Decrepit Door ») ; une carte
 *  joueur ou générée est nommée d'après state.extraDefs (état courant de l'action en cours). */
let etatCourant: RoomState | null = null;
function nomCarte(def: ScenarioDef, c: CardState): string {
  return nomVisible(def, c, etatCourant?.extraDefs);
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
  return pile === "encounterDiscard" || /^pdiscard[0-3]$/.test(pile) || Boolean(def.piles?.find((p) => p.id === pile)?.isDiscard);
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
    } else if (d?.backCode && d.backKind === "enemy") {
      // Verso = ennemi (agenda de Devil Reef) : la carte entre en jeu sur le tapis comme un ennemi, révélée,
      // au centre (ou `backPlacement`) — à déplacer là où sa carte l'envoie.
      const pos = def.backPlacement?.[ancien.code] ?? { x: 737, y: 411 };
      ancien.kind = "enemy";
      ancien.faceUp = true;
      ancien.side = "b";
      ancien.exhausted = false;
      ancien.tokens = {};
      ancien.loc = { zone: "board", x: pos.x + 36, y: pos.y + 46, z: nextZ(state) };
      addLog(state, "action", `${d.backName ?? "Le verso"} entre en jeu sur le tapis (verso de ${agenda ? "l'agenda" : "l'acte"}) : déplacez-le là où sa carte l'envoie.`);
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
  const reminders = stage ? rappels(state, def, `${agenda ? "agenda" : "act"}:${stage}`) : [];
  // Effets déclarés par le scénario quand cette étape devient courante (verso de l'agenda ou de l'acte précédent) :
  // inondation, mélange, révélation, lieux posés, rangées complétées, retrait par trait, apparition, clé — idempotents.
  const effet = stage ? (agenda ? def.agendaEffects : def.actEffects)?.[String(stage)] : undefined;
  if (effet) {
    const parties = appliquerEffets(state, def, effet);
    if (parties.length) reminders.push(addLog(state, "reminder", `${effet.log ?? `${agenda ? "Agenda" : "Acte"} ${stage}`} : ${parties.join(" ; ")}.`));
  }
  // Marée (TIC) : l'agenda qui devient courant inonde les lieux révélés et fixe la règle appliquée à chaque révélation.
  const maree = agenda && stage ? def.flood?.byAgenda?.[String(stage)] : undefined;
  if (maree) {
    const parties: string[] = [];
    if (maree.all) parties.push(inonderTout(state, maree.all));
    if (maree.onReveal !== undefined) { state.flood = { onReveal: maree.onReveal }; parties.push(`désormais chaque lieu révélé ${LIBELLE_REGLE[maree.onReveal]}`); }
    reminders.push(addLog(state, "reminder", `Marée (agenda ${stage}) : ${parties.join(" ; ")}. Corrigez à la main les lieux qui font exception (menu → Inondation).`));
  }
  return reminders;
}

const LIBELLE_REGLE = ["n'est pas inondé à sa révélation", "monte d'un niveau d'inondation à sa révélation", "est totalement inondé à sa révélation"];

/** Pistes (The Vanishing of Elina Harper) : les codes vus dans la pile Leads ou entrés en jeu sont rayés ; renvoie les noms nouvellement rayés. */
function rayerPistes(state: RoomState, def: ScenarioDef, codes: string[]): string[] {
  if (!def.leads || !state.leads) return [];
  const candidats = new Set([...def.leads.suspects, ...def.leads.hideouts]);
  const nouveaux = [...new Set(codes)].filter((c) => candidats.has(c) && !state.leads!.eliminated.includes(c));
  state.leads.eliminated.push(...nouveaux);
  return nouveaux.map((c) => def.cards.find((k) => k.code === c)?.name ?? c);
}

/** Premier emplacement de cachette libre sur la grille (ordre de lecture), sinon null. */
function emplacementLibre(state: RoomState, def: ScenarioDef): { x: number; y: number } | null {
  for (const spot of def.leads?.spots ?? []) {
    const pris = Object.values(state.cards).some((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
      && Math.abs(k.loc.x - spot.x) < PAS_X / 2 && Math.abs(k.loc.y - spot.y) < PAS_Y / 2);
    if (!pris) return spot;
  }
  return null;
}

/** Pile qui ne se pioche, ne se consulte ni ne se mélange : les cartes cachées sous la carte de référence. */
function pileSecrete(def: ScenarioDef, pile: string): boolean {
  return Boolean(def.leads && pile === def.leads.secret);
}

/** Applique les effets déclarés d'une étape (StageEffects) ; renvoie les morceaux de journal. Chaque effet est idempotent. */
function appliquerEffets(state: RoomState, def: ScenarioDef, effet: StageEffects): string[] {
  const parties: string[] = [];
  const surTapis = (code: string) => Object.values(state.cards).find((c) => c.code === code && "zone" in c.loc && c.loc.zone === "board");
  const lieuLibre = (x: number, y: number) => !Object.values(state.cards).some((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
    && Math.abs(k.loc.x - x) < PAS_X / 2 && Math.abs(k.loc.y - y) < PAS_Y / 2);
  if (effet.flood) parties.push(inonderLieux(state, def, effet.flood.mode, effet.flood.trait, effet.flood.scope ?? "all"));
  if (effet.shuffleAside?.length) {
    const cartes = Object.values(state.cards).filter((k) => "zone" in k.loc && k.loc.zone === "aside" && effet.shuffleAside!.includes(k.code));
    for (const k of cartes) { k.loc = { pile: "encounter" }; k.faceUp = false; k.tokens = {}; k.exhausted = false; state.piles.encounter.push(k.id); }
    let defausse = 0;
    if (effet.withDiscard) { defausse = state.piles.encounterDiscard.length; remelangerDefausse(state, Math.random); }
    else shuffle(state.piles.encounter, Math.random);
    for (const id of state.piles.encounter) state.cards[id].faceUp = false;
    if (cartes.length || effet.withDiscard) parties.push(`${cartes.length} carte${cartes.length > 1 ? "s" : ""} de côté (${[...new Set(cartes.map((k) => nomCarte(def, k)))].join(", ") || "aucune"})${effet.withDiscard ? ` et les ${defausse} de la défausse` : ""} mélangée${cartes.length + defausse > 1 ? "s" : ""} dans la pioche de rencontre`);
  }
  for (const code of effet.revealCodes ?? []) {
    const l = surTapis(code);
    if (l && l.kind === "location" && !l.faceUp) { const n = revealLocation(state, def, l); parties.push(`${nomCarte(def, l)} révélé${n ? ` (${n} indice${n > 1 ? "s" : ""})` : ""}`); }
  }
  for (const pb of effet.placeBelow ?? []) {
    if (surTapis(pb.code)) continue;   // déjà en jeu : rien (l'acte et l'agenda peuvent déclarer le même geste)
    const k = Object.values(state.cards).find((c) => c.code === pb.code && ("pile" in c.loc ? c.loc.pile !== "removed" : c.loc.zone === "aside"));
    const at = surTapis(pb.at);
    if (!k || !at) { parties.push(`${def.cards.find((d) => d.code === pb.code)?.name ?? pb.code} ou ${def.cards.find((d) => d.code === pb.at)?.name ?? pb.at} introuvable : à poser à la main`); continue; }
    const { x: ax, y: ay } = at.loc as { x: number; y: number };
    let y = ay + PAS_Y;
    while (!lieuLibre(ax, y)) y += PAS_Y;
    retirerDesPiles(state, k.id);
    k.loc = { zone: "board", x: ax, y, z: nextZ(state) }; k.faceUp = false; k.side = "a";
    parties.push(`${nomCarte(def, k)} posé en dessous de ${nomCarte(def, at)}`);
  }
  if (effet.fillRows) {
    const { pile, anchors, columns, count } = effet.fillRows;
    let poses = 0;
    for (const code of anchors) {
      const a = surTapis(code);
      if (!a) continue;
      const ay = (a.loc as { y: number }).y;
      for (const x of columns) {
        const surRangee = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board" && Math.abs(k.loc.y - ay) < PAS_Y / 2).length;
        if (surRangee >= count) break;
        if (!lieuLibre(x, ay)) continue;
        const id = state.piles[pile]?.shift();
        if (!id) break;
        const k = state.cards[id];
        k.loc = { zone: "board", x, y: ay, z: nextZ(state) }; k.faceUp = false; k.side = "a";
        poses++;
      }
    }
    if (poses) parties.push(`${poses} lieu${poses > 1 ? "x" : ""} de ${nomPile(def, pile)} posé${poses > 1 ? "s" : ""} non révélé${poses > 1 ? "s" : ""} pour compléter les rangées à ${count} (reste ${state.piles[pile]?.length ?? 0})`);
  }
  if (effet.removeTrait) {
    const lieux = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
      && (def.cards.find((d) => d.code === k.code)?.traits ?? []).includes(effet.removeTrait!));
    let victoire = 0, retires = 0;
    for (const l of lieux) {
      const d = def.cards.find((x) => x.code === l.code);
      if (d?.victory && !(l.tokens.clue ?? 0)) { l.loc = { zone: "victory", x: 0, y: 0, z: nextZ(state) }; victoire++; }
      else { l.loc = { pile: "removed" }; state.piles.removed.push(l.id); retires++; }
      l.tokens = {};
    }
    if (lieux.length) parties.push(`lieux « ${effet.removeTrait} » : ${retires} retiré${retires > 1 ? "s" : ""} de la partie${victoire ? `, ${victoire} en zone de victoire` : ""} — déplacez ce qui s'y trouvait comme la carte l'indique`);
  }
  if (effet.spawnAside) {
    const k = Object.values(state.cards).find((c) => c.code === effet.spawnAside!.code && !("pile" in c.loc && (c.loc.pile === "removed" || c.loc.pile === "encounter")) && !("zone" in c.loc && c.loc.zone === "victory"));
    const lieu = Object.values(state.cards).find((c) => c.code === effet.spawnAside!.at && c.kind === "location" && "zone" in c.loc && c.loc.zone === "board");
    if (k && lieu) {
      const { x: lx, y: ly } = lieu.loc as { x: number; y: number };
      retirerDesPiles(state, k.id);
      k.loc = { zone: "board", x: lx + 36, y: ly + 46, z: nextZ(state) };
      k.faceUp = true; k.side = effet.spawnAside.side ?? k.side; k.exhausted = false;
      parties.push(`${nomCarte(def, k)} apparaît à ${nomCarte(def, lieu)}`);
    } else parties.push(`${effet.spawnAside.code} introuvable (ou lieu absent) : à faire à la main`);
  }
  if (effet.randomKeyOn) {
    const cible = surTapis(effet.randomKeyOn);
    const cachees = Object.values(state.cards).filter((k) => k.kind === "key" && !k.faceUp && "zone" in k.loc && k.loc.zone === "aside");
    if (cible && cachees.length) {
      const cle = cachees[Math.floor(Math.random() * cachees.length)];
      poserCleSur(state, cle, cible, nextZ(state));
      parties.push(`une clé face cachée, tirée au hasard parmi les ${cachees.length} de côté, est posée sur ${nomCarte(def, cible)} sans être regardée`);
    } else parties.push("aucune clé cachée de côté (ou cible absente) : clé à poser à la main");
  }
  return parties;
}

/** Inonde les lieux du tapis d'un trait donné (ou tous), révélés ou non selon `scope` : « increase » (+1, plafond 2) ou « full ». */
function inonderLieux(state: RoomState, def: ScenarioDef, mode: "increase" | "full", trait?: string, scope: "all" | "revealed" = "all"): string {
  const lieux = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
    && (scope === "all" || k.faceUp) && (!trait || (def.cards.find((d) => d.code === k.code)?.traits ?? []).includes(trait)));
  let n = 0;
  for (const l of lieux) {
    const avant = l.tokens.flood ?? 0;
    const apres = mode === "full" ? 2 : Math.min(2, avant + 1);
    if (apres !== avant) { l.tokens.flood = apres; n++; }
  }
  return `${n} lieu${n > 1 ? "x" : ""}${trait ? ` « ${trait} »` : ""} ${mode === "full" ? "totalement inondé" : "monte d'un niveau d'inondation"}${n > 1 ? "s" : ""} (sur ${lieux.length})`;
}

/** Inonde tous les lieux révélés du tapis : « increase » (+1 niveau, plafond 2), « full » (niveau 2), « decrease », « clear ». */
function inonderTout(state: RoomState, mode: string): string {
  const lieux = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board" && k.faceUp);
  let n = 0;
  for (const l of lieux) {
    const avant = l.tokens.flood ?? 0;
    const apres = mode === "full" ? 2 : mode === "increase" ? Math.min(2, avant + 1) : mode === "decrease" ? Math.max(0, avant - 1) : 0;
    if (apres === avant) continue;
    if (apres) l.tokens.flood = apres; else delete l.tokens.flood;
    n++;
  }
  const quoi = mode === "full" ? "totalement inondés" : mode === "increase" ? "montent d'un niveau d'inondation" : mode === "decrease" ? "baissent d'un niveau d'inondation" : "asséchés";
  return `${n} lieu${n > 1 ? "x" : ""} révélé${n > 1 ? "s" : ""} ${quoi} (sur ${lieux.length})`;
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
  etatCourant = state;
  // Les piles d'un board joueur (pioche, main, défausse, faiblesses mises de côté) ne se tirent, ne se consultent
  // et ne se remélangent que par les actions du board (`p:*`, réservées au siège) : refus des gestes de rencontre.
  if (["drawEncounter", "randomPick", "searchEncounter", "reshuffleDiscard"].includes(msg.t) && PILE_JOUEUR_RE.test(String(msg.pile ?? msg.deck ?? ""))) refuser("cette pile appartient à un board joueur");

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
          // Boards joueur en place : chacun pioche 1 carte et gagne 1 ressource ; rappel si la main dépasse 8 (cahier §10.6).
          for (const s of state.seats) if (s.investigatorCode && s.deck?.board.setup === "done") reminders.push(...entretienJoueur(state, s, rng));
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
      seat.counters[key] = Math.max(0, Math.round(v));   // jamais négatif (ressources comprises : retour de test 2026-09-08)
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
      if (token === "flood" && !def.flood) refuser("ce scénario n'utilise pas de jeton d'inondation");
      const v = Math.min(token === "flood" ? 2 : Infinity, Math.max(0, (c.tokens[token] ?? 0) + Number(msg.delta ?? 0)));
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
      let x = Math.round(Number(msg.x) || 0);
      const y = Math.round(Number(msg.y) || 0);
      // Board joueur : « en fin de rangée » (x ≥ 9000, menus et fenêtres de recherche) se calcule ici.
      if (/^pplay[0-3]$/.test(zone) && x >= 9000) x = Object.values(state.cards).reduce((m, o) => ("zone" in o.loc && o.loc.zone === zone && o.id !== c.id ? Math.max(m, o.loc.x + CARD_W + 10) : m), 0);
      if (zone === "victory" && c.sealed?.length) {
        // COB III : une carte qui part en zone de victoire libère ses jetons scellés vers le sac.
        state.chaos.bag.push(...c.sealed);
        addLog(state, "action", `Les jetons scellés sur ${nomCarte(def, c)} retournent au sac : ${c.sealed.join(", ")}. Sac : ${state.chaos.bag.length} jetons.`);
        c.sealed = [];
      }
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
      // Un véhicule (soutien à trait Vehicle, Fishing Vessel) emmène ses pions et clés : un pion à cheval sur le véhicule est dedans.
      const vehicule = c.kind === "asset" && (def.cards.find((d) => d.code === c.code)?.traits ?? []).includes("Vehicle");
      if ((c.kind === "location" || vehicule) && avant?.zone === "board" && zone === "board") {
        const dx = x - avant.x, dy = y - avant.y;
        for (const k of Object.values(state.cards)) {
          if (k.id === c.id || !("zone" in k.loc) || k.loc.zone !== "board" || k.kind === "location") continue;
          const petit = k.kind === "mini" || k.kind === "key";
          if (vehicule && !petit) continue;
          const w = petit ? MINI : CARD_W, h = petit ? MINI : CARD_H;
          const cx = k.loc.x + w / 2, cy = k.loc.y + h / 2;
          const marge = petit ? MINI : 0;
          if (cx >= avant.x - marge && cx <= avant.x + CARD_W + marge && cy >= avant.y - marge && cy <= avant.y + CARD_H + marge) {
            k.loc = { ...k.loc, x: k.loc.x + dx, y: k.loc.y + dy };
          }
        }
      }
      const idx = SEAT_ZONES.indexOf(zone);
      // Une clé de couleur dont un enquêteur prend le contrôle (lâchée sur son siège) est retournée face visible (guide TIC).
      if (idx >= 0 && cleDeCouleur(c) && !c.faceUp) { c.faceUp = true; addLog(state, "action", `${nomSiege(state, idx, def)} prend le contrôle d'une clé : ${nomCarte(def, c)}.`, idx); }
      // Une carte d'un deck joueur garde son propriétaire où qu'elle aille ; une carte de rencontre est engagée
      // (ownerSeat) quand elle est lâchée dans une zone de menace.
      if (!c.player && (c.kind === "enemy" || c.kind === "treachery" || c.kind === "asset" || c.kind === "story")) {
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
      if (c.sealed?.length) {
        // COB III : une carte défaussée libère ses jetons scellés vers le sac.
        state.chaos.bag.push(...c.sealed);
        addLog(state, "action", `Les jetons scellés sur ${nomCarte(def, c)} retournent au sac : ${c.sealed.join(", ")}. Sac : ${state.chaos.bag.length + 0} jetons.`);
        c.sealed = [];
      }
      c.loc = { pile };
      c.faceUp = estDefausse(def, pile); // une défausse est consultable, face visible
      if (c.kind === "location") c.side = "a";
      c.exhausted = false;
      c.tokens = {};
      if (!c.player) delete c.ownerSeat;
      delete c.revealed;
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
      if ((c.kind === "key" && !cleDeCouleur(c)) || c.kind === "mini") refuser("ce jeton ne se retourne pas");
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
      addLog(state, "action", `${nomCarte(def, c)} révélé${n ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}${texteMaree(state, def, c)}.`);
      return {};
    }
    case "toggleSide": {
      const c = carte(state, msg.id);
      c.side = c.side === "a" ? "b" : "a";
      // Verso d'une autre nature (carte histoire dont le dos est un lieu : Captured! → Holding Cells) : la carte change de
      // kind pour le moteur, comme un verso-lieu qui avance ; le lieu prend les indices de son verso la première fois.
      const d = def.cards.find((k) => k.code === c.code);
      if (d?.backCode && d.backKind && d.backKind !== d.kind && (d.kind === "story" || d.backKind === "story")) {
        c.kind = c.side === "b" ? d.backKind : d.kind;
        c.faceUp = true;
        if (c.side === "b" && d.backKind === "location" && d.backClue && !(c.tokens.clue ?? 0)) {
          const n = d.backClue.perInvestigator ? d.backClue.value * state.playerCount : d.backClue.value;
          if (n > 0) c.tokens.clue = n;
        }
        addLog(state, "action", `${nomCarte(def, c)} : ${c.side === "b" ? `verso — devient ${d.backKind === "location" ? "un lieu" : d.backKind}` : "recto"}${c.side === "b" && c.tokens.clue ? ` (${c.tokens.clue} indice${c.tokens.clue > 1 ? "s" : ""})` : ""}.`);
      }
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
      if (pileSecrete(def, pile)) refuser("ces cartes ne se révèlent qu'à l'accusation");
      const n = Math.max(1, Math.min(Number(msg.n) || 1, state.piles[pile].length));
      if (!state.piles[pile].length) refuser("cette pile est vide");
      const tires = shuffle([...state.piles[pile]], rng).slice(0, n).map((id) => nomCarte(def, state.cards[id]));
      const entry = addLog(state, "action", `Tirage au hasard dans ${nomPile(def, pile)} (sans la modifier) : ${tires.join(", ")}.`);
      return { reminders: [entry] };
    }
    case "shufflePile": {
      const pile = String(msg.pile);
      if (!(pile in state.piles)) refuser("pile inconnue");
      if (pileSecrete(def, pile)) refuser("ces cartes ne se révèlent qu'à l'accusation");
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
      if (pileSecrete(def, pile)) refuser("ces cartes ne se révèlent qu'à l'accusation");
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
      // Une carte vue dans la pile Leads n'est pas la bonne : piste rayée.
      if (def.leads && pile === def.leads.pile) { const r = rayerPistes(state, def, [c.code]); if (r.length) addLog(state, "action", `Piste rayée : ${r.join(", ")}.`); }
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
      if (pileSecrete(def, pile)) refuser("ces cartes ne se révèlent qu'à l'accusation");
      const n = Number(msg.n) > 0 ? Math.min(Number(msg.n), state.piles[pile].length) : state.piles[pile].length;
      if (Number(msg.n) > 0) addLog(state, "action", `${moi !== null ? nomSiege(state, moi, def) : "Un joueur"} regarde les ${n} première${n > 1 ? "s" : ""} carte${n > 1 ? "s" : ""} de ${pile === "encounter" ? "la pioche" : nomPile(def, pile)}.`, moi ?? undefined);
      // Regarder des cartes de la pile Leads les élimine (elles ne sont pas la bonne réponse) : pistes rayées pour tous.
      if (def.leads && pile === def.leads.pile) { const r = rayerPistes(state, def, state.piles[pile].slice(0, n).map((id) => state.cards[id].code)); if (r.length) addLog(state, "action", `Piste${r.length > 1 ? "s" : ""} rayée${r.length > 1 ? "s" : ""} : ${r.join(", ")}.`); }
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

    // ---- Inondation et marée (The Innsmouth Conspiracy) ---------------------------------
    case "setFlood": {
      // {id, level} : niveau d'inondation d'un lieu (0 sec, 1 partiellement, 2 totalement).
      if (!def.flood) refuser("ce scénario n'utilise pas de jeton d'inondation");
      const c = carte(state, msg.id);
      if (c.kind !== "location") refuser("ce n'est pas un lieu");
      const niveau = Math.max(0, Math.min(2, Math.round(Number(msg.level) || 0)));
      if ((c.tokens.flood ?? 0) === niveau) return {};
      if (niveau) c.tokens.flood = niveau; else delete c.tokens.flood;
      addLog(state, "action", `${nomCarte(def, c)} : ${LIBELLES_INONDATION[niveau]}.`);
      return {};
    }
    case "floodAll": {
      // {mode} : tous les lieux révélés du tapis — increase, full, decrease, clear (boutons de masse du panneau Marée).
      if (!def.flood) refuser("ce scénario n'utilise pas de jeton d'inondation");
      const mode = String(msg.mode);
      if (!["increase", "full", "decrease", "clear"].includes(mode)) refuser("mode inconnu");
      addLog(state, "action", `Marée : ${inonderTout(state, mode)}.`);
      return {};
    }
    case "floodRule": {
      // {onReveal} : 0 rien, 1 + un niveau, 2 totalement — ce que subit chaque lieu à sa révélation.
      if (!def.flood) refuser("ce scénario n'utilise pas de jeton d'inondation");
      const r = Math.round(Number(msg.onReveal));
      if (![0, 1, 2].includes(r)) refuser("règle inconnue");
      state.flood = { onReveal: r as 0 | 1 | 2 };
      addLog(state, "action", `Marée : désormais chaque lieu révélé ${LIBELLE_REGLE[r]}.`);
      return {};
    }

    // ---- Clés cachées, piles formées en cours de partie, lieux autour d'un lieu (TIC) --------
    case "randomKey": {
      // {id} : une clé de côté face cachée, tirée au hasard, est posée sur cette carte du tapis sans être regardée.
      const c = carte(state, msg.id);
      if (!("zone" in c.loc) || c.loc.zone !== "board" || c.kind === "mini" || c.kind === "key") refuser("visez une carte du tapis");
      const cachees = Object.values(state.cards).filter((k) => k.kind === "key" && !k.faceUp && "zone" in k.loc && k.loc.zone === "aside");
      if (!cachees.length) refuser("aucune clé face cachée de côté");
      const cle = cachees[Math.floor(rng() * cachees.length)];
      poserCleSur(state, cle, c, nextZ(state));
      addLog(state, "action", `Une clé face cachée, tirée au hasard parmi les ${cachees.length} de côté, est posée sur ${nomCarte(def, c)} sans être regardée.`);
      return {};
    }
    case "formPile": {
      // {pile} : la pile déclarée `gather` se forme avec les lieux de côté dont le côté non révélé porte le nom voulu, mélangés.
      const pile = String(msg.pile);
      const decl = def.piles?.find((p) => p.id === pile && p.gather) ?? refuser("cette pile ne se forme pas ainsi");
      const cartes = Object.values(state.cards).filter((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "aside"
        && def.cards.find((d) => d.code === k.code)?.backName === decl.gather!.backName);
      if (!cartes.length) refuser(`aucun lieu « ${decl.gather!.backName} » de côté`);
      if (!(pile in state.piles)) state.piles[pile] = [];
      for (const k of cartes) {
        k.loc = { pile };
        k.faceUp = false;
        k.side = "a";
        k.exhausted = false;
        k.tokens = {};
        state.piles[pile].push(k.id);
      }
      shuffle(state.piles[pile], rng);
      addLog(state, "action", `${nomPile(def, pile)} : ${cartes.length} lieux de côté forment la pile, mélangée (${state.piles[pile].length} au total).`);
      return {};
    }
    case "placeAround": {
      // {id, pile} : les premières cartes de la pile déclarée `around` entrent en jeu, non révélées, en dessous, à gauche et à
      // droite de ce lieu — seulement aux emplacements libres de la grille ; le journal ne dit pas quel lieu va où (dos identiques).
      const c = carte(state, msg.id);
      if (c.kind !== "location" || !("zone" in c.loc) || c.loc.zone !== "board") refuser("ce n'est pas un lieu du tapis");
      const pile = String(msg.pile);
      if (!def.piles?.some((p) => p.id === pile && p.around)) refuser("cette pile ne se pose pas ainsi");
      if (!state.piles[pile]?.length) refuser(`${nomPile(def, pile)} est vide`);
      const { x: lx, y: ly } = c.loc as { x: number; y: number };
      const occupe = (x: number, y: number) => Object.values(state.cards).some((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
        && Math.abs(k.loc.x - x) < PAS_X / 2 && Math.abs(k.loc.y - y) < PAS_Y / 2);
      // {dir} facultatif : une seule direction (below / left / right) — une carte ; sinon les trois emplacements libres.
      const dir = msg.dir === undefined ? null : String(msg.dir);
      const directions = dir ? AUTOUR.filter(([, , , cle]) => cle === dir) : AUTOUR;
      if (dir && !directions.length) refuser("direction inconnue");
      const poses: string[] = [], pris: string[] = [];
      for (const [lib, dx, dy] of directions) {
        if (occupe(lx + dx, ly + dy)) { pris.push(lib); continue; }
        const id = state.piles[pile].shift();
        if (!id) break;
        const k = state.cards[id];
        k.loc = { zone: "board", x: lx + dx, y: ly + dy, z: nextZ(state) };
        k.faceUp = false;
        k.side = "a";
        poses.push(lib);
      }
      if (!poses.length) refuser(pris.length === directions.length ? (dir ? "cet emplacement est déjà occupé" : "les trois emplacements sont déjà occupés") : "rien à poser");
      addLog(state, "action", `${poses.length} lieu${poses.length > 1 ? "x" : ""} de ${nomPile(def, pile)} posé${poses.length > 1 ? "s" : ""} non révélé${poses.length > 1 ? "s" : ""} ${poses.join(", ")} de ${nomCarte(def, c)}${pris.length ? ` (déjà occupé : ${pris.join(", ")})` : ""}${state.piles[pile].length ? "" : " ; la pile est vide"}.`);
      return {};
    }

    // ---- Pistes, Parley et accusation (The Vanishing of Elina Harper) ------------------------
    case "leadsReveal": {
      // {n} : Parley de l'acte 1 — les n premières cartes de la pile Leads (1 à 3) sont révélées pour tous (pile « pistes
      // révélées ») ; le demandeur en prend une (leadsTake), le reste retourne dans Leads avec la première carte de la pioche.
      const L = def.leads ?? refuser("ce scénario n'a pas de pile Leads");
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      if (state.piles[L.shown]?.length) refuser("terminez d'abord le Parley en cours (prenez une piste ou remettez-les)");
      const n = Math.max(1, Math.min(3, Math.round(Number(msg.n) || 1), state.piles[L.pile].length));
      if (!state.piles[L.pile].length) refuser("la pile Leads est vide");
      if (!(L.shown in state.piles)) state.piles[L.shown] = [];
      const ids = state.piles[L.pile].splice(0, n);
      for (const id of ids) { const c = state.cards[id]; c.loc = { pile: L.shown }; c.faceUp = true; state.piles[L.shown].push(id); }
      const rayees = rayerPistes(state, def, ids.map((id) => state.cards[id].code));
      const entry = addLog(state, "action", `Parley — ${nomSiege(state, s, def)} révèle ${n} piste${n > 1 ? "s" : ""} : ${ids.map((id) => nomCarte(def, state.cards[id])).join(", ")}${rayees.length ? ` (rayée${rayees.length > 1 ? "s" : ""} : ${rayees.join(", ")})` : ""}. Prenez-en une, le reste retournera dans Leads avec la première carte de la pioche.`, s);
      return { reminders: [entry] };
    }
    case "leadsTake": {
      // {id} : la piste choisie entre en jeu — un lieu sur le premier emplacement de cachette libre (révélé, ses indices),
      // le reste va dans la zone de menace du demandeur ; les autres pistes révélées + la première carte de la pioche de
      // rencontre sont remélangées dans Leads.
      const L = def.leads ?? refuser("ce scénario n'a pas de pile Leads");
      const s = msg.seat === undefined ? monSiege() : siege(state, msg.seat);
      const c = carte(state, msg.id);
      if (!("pile" in c.loc) || c.loc.pile !== L.shown) refuser("cette carte n'est pas une piste révélée");
      retirerDesPiles(state, c.id);
      let texte: string;
      if (c.kind === "location") {
        const spot = emplacementLibre(state, def) ?? { x: 737, y: 649 + PAS_Y };
        c.loc = { zone: "board", x: spot.x, y: spot.y, z: nextZ(state) };
        c.side = "a";
        const n = revealLocation(state, def, c);
        texte = `${nomCarte(def, c)} entre en jeu sur un emplacement de cachette${n ? ` : ${n} indice${n > 1 ? "s" : ""} posé${n > 1 ? "s" : ""}` : ""}`;
      } else {
        c.loc = { zone: SEAT_ZONES[s], x: boutDeMenace(state, SEAT_ZONES[s]), y: 0, z: nextZ(state) };
        c.faceUp = true;
        if (c.kind === "enemy" || c.kind === "treachery" || c.kind === "asset" || c.kind === "story") c.ownerSeat = s;
        texte = `${nomCarte(def, c)} va dans la zone de menace de ${nomSiege(state, s, def)} (à résoudre comme une carte piochée)`;
      }
      const restes = state.piles[L.shown].splice(0);
      for (const id of restes) { const k = state.cards[id]; k.loc = { pile: L.pile }; k.faceUp = false; state.piles[L.pile].push(id); }
      let rencontre: string | null = null;
      if (!state.piles.encounter.length && state.piles.encounterDiscard.length) remelangerDefausse(state, rng);
      const dessus = state.piles.encounter.shift();
      if (dessus) { const k = state.cards[dessus]; k.loc = { pile: L.pile }; k.faceUp = false; state.piles[L.pile].push(dessus); rencontre = "la première carte de la pioche de rencontre"; }
      shuffle(state.piles[L.pile], rng);
      addLog(state, "action", `${texte}. ${restes.length ? `${restes.length} piste${restes.length > 1 ? "s" : ""} non prise${restes.length > 1 ? "s" : ""}` : "Aucune autre piste"}${rencontre ? ` et ${rencontre}` : ""} : mélangée${restes.length + (rencontre ? 1 : 0) > 1 ? "s" : ""} dans Leads (${state.piles[L.pile].length}).`, s);
      return {};
    }
    case "leadsReturn": {
      // Les pistes révélées retournent dans Leads sans être prises (mélangées) — rien n'est bloqué.
      const L = def.leads ?? refuser("ce scénario n'a pas de pile Leads");
      const restes = state.piles[L.shown]?.splice(0) ?? [];
      if (!restes.length) refuser("aucune piste révélée");
      for (const id of restes) { const k = state.cards[id]; k.loc = { pile: L.pile }; k.faceUp = false; state.piles[L.pile].push(id); }
      shuffle(state.piles[L.pile], rng);
      addLog(state, "action", `${restes.length} piste${restes.length > 1 ? "s" : ""} révélée${restes.length > 1 ? "s" : ""} remélangée${restes.length > 1 ? "s" : ""} dans Leads sans être prise${restes.length > 1 ? "s" : ""}.`);
      return {};
    }
    case "leadsToggle": {
      // {code} : rayer / rétablir une piste à la main.
      const L = def.leads ?? refuser("ce scénario n'a pas de pistes");
      const code = String(msg.code);
      if (![...L.suspects, ...L.hideouts].includes(code)) refuser("piste inconnue");
      state.leads ??= { eliminated: [] };
      const i = state.leads.eliminated.indexOf(code);
      if (i >= 0) state.leads.eliminated.splice(i, 1); else state.leads.eliminated.push(code);
      addLog(state, "action", `Piste ${i >= 0 ? "rétablie" : "rayée"} à la main : ${def.cards.find((k) => k.code === code)?.name ?? code}.`);
      return {};
    }
    case "accusation": {
      // {suspect, hideout} : l'interlude « The Accusation » du guide — révélation des deux cartes cachées, comparaison,
      // mise en place de la fin du scénario (acte 2 et agenda 3 de côté, cachette en jeu avec ses indices + 1 par
      // enquêteur, Elina Harper dessous, le ravisseur dessus, pile Leads retirée) ; journal et rappels.
      const L = def.leads ?? refuser("ce scénario n'a pas d'accusation");
      const suspect = String(msg.suspect), hideout = String(msg.hideout);
      if (!L.suspects.includes(suspect)) refuser("choisissez un suspect");
      if (!L.hideouts.includes(hideout)) refuser("choisissez une cachette");
      if (state.leads?.accused) refuser("l'accusation a déjà été faite");
      const secretIds = state.piles[L.secret] ?? [];
      const verite = { suspect: secretIds.map((id) => state.cards[id]).find((k) => k.kind === "enemy") ?? refuser("cartes cachées introuvables"),
        hideout: secretIds.map((id) => state.cards[id]).find((k) => k.kind === "location") ?? refuser("cartes cachées introuvables") };
      const nom = (code: string) => def.cards.find((k) => k.code === code)?.name ?? code;
      const bons = (suspect === verite.suspect.code ? 1 : 0) + (hideout === verite.hideout.code ? 1 : 0);
      state.leads = { ...(state.leads ?? { eliminated: [] }), accused: { suspect, hideout }, truth: { suspect: verite.suspect.code, hideout: verite.hideout.code } };
      const reminders: LogEntry[] = [];
      addLog(state, "action", `Accusation : ${nom(suspect)} et ${nom(hideout)}. Les cartes cachées sont révélées — le ravisseur est ${verite.suspect.code === suspect ? "bien" : "en fait"} ${nom(verite.suspect.code)}, la cachette est ${verite.hideout.code === hideout ? "bien" : "en fait"} ${nom(verite.hideout.code)}.`);
      // La cachette entre en jeu, révélée, avec ses indices + 1 par enquêteur ; Elina Harper dessous ; le ravisseur dessus.
      const spot = emplacementLibre(state, def) ?? { x: 737, y: 649 + PAS_Y };
      retirerDesPiles(state, verite.hideout.id);
      verite.hideout.loc = { zone: "board", x: spot.x, y: spot.y, z: nextZ(state) };
      verite.hideout.side = "a";
      const nIndices = revealLocation(state, def, verite.hideout);
      verite.hideout.tokens.clue = (verite.hideout.tokens.clue ?? 0) + state.playerCount;
      const elina = Object.values(state.cards).find((k) => k.code === L.elina && "zone" in k.loc && k.loc.zone === "aside");
      if (elina) { elina.loc = { zone: "board", x: spot.x + 24, y: spot.y + 60, z: nextZ(state) }; elina.faceUp = true; }
      retirerDesPiles(state, verite.suspect.id);
      verite.suspect.loc = { zone: "board", x: spot.x + 36, y: spot.y + 30, z: nextZ(state) };
      verite.suspect.faceUp = true;
      addLog(state, "action", `${nom(verite.hideout.code)} entre en jeu sur un emplacement de cachette : ${nIndices} indice${nIndices > 1 ? "s" : ""} + ${state.playerCount} (1 par enquêteur)${elina ? ` ; Elina Harper y est retenue (posée sur la cachette)` : ""} ; ${nom(verite.suspect.code)} — le ravisseur — y apparaît, sa capacité de Révélation ignorée.`);
      // Verdict : 0 bonne réponse = démission ; 1 = la référence se retourne (ennemi) et apparaît à Innsmouth Square ; 2 = rien.
      if (bons === 0) reminders.push(addLog(state, "reminder", "Aucune des deux réponses n'est la bonne : les enquêteurs font fausse route et doivent démissionner immédiatement (bouton « Clôturer »)."));
      else if (bons === 1) {
        const ref = Object.values(state.cards).find((k) => k.code === L.reference);
        const square = Object.values(state.cards).find((k) => k.code === L.square && "zone" in k.loc && k.loc.zone === "board");
        if (ref && square) {
          const sq = square.loc as { x: number; y: number };
          ref.loc = { zone: "board", x: sq.x + 36, y: sq.y + 46, z: nextZ(state) };
          ref.faceUp = true; ref.side = "b"; ref.tokens = {};
          reminders.push(addLog(state, "reminder", `Une réponse sur deux : les habitants sont en colère — ${nomCarte(def, ref)} (verso de la carte de référence) apparaît à ${nomCarte(def, square)}.`));
        }
      } else reminders.push(addLog(state, "reminder", "Les deux réponses sont les bonnes : la partie continue avec l'acte 2 et l'agenda 3."));
      // Acte 2 et agenda 3 depuis la zone de côté ; l'acte et l'agenda courants partent de côté ; l'agenda 2 inutilisé est retiré.
      const acte2 = Object.values(state.cards).find((k) => k.code === L.act2 && "zone" in k.loc && k.loc.zone === "aside");
      const agenda3 = Object.values(state.cards).find((k) => k.code === L.agenda3 && "zone" in k.loc && k.loc.zone === "aside");
      if (state.actId && state.cards[state.actId]) { const a = state.cards[state.actId]; a.loc = { zone: "aside", x: boutDeCote(state), y: 0, z: nextZ(state) }; a.tokens = {}; a.exhausted = false; }
      if (acte2) { acte2.loc = { zone: "story", x: 0, y: 0, z: nextZ(state) }; acte2.faceUp = true; acte2.side = "a"; state.actId = acte2.id; }
      state.piles.actDeck = [];
      if (state.agendaId && state.cards[state.agendaId]) { const a = state.cards[state.agendaId]; a.loc = { zone: "aside", x: boutDeCote(state), y: 0, z: nextZ(state) }; a.tokens = {}; a.exhausted = false; }
      for (const id of state.piles.agendaDeck.splice(0)) { state.cards[id].loc = { pile: "removed" }; state.piles.removed.push(id); }
      for (const k of Object.values(state.cards)) delete k.tokens.doom;
      if (agenda3) { agenda3.loc = { zone: "story", x: 0, y: 0, z: nextZ(state) }; agenda3.faceUp = true; agenda3.side = "a"; agenda3.tokens.doom = 0; state.agendaId = agenda3.id; }
      // Pile Leads (et pistes révélées) retirée de la partie.
      for (const pile of [L.pile, L.shown]) for (const id of state.piles[pile]?.splice(0) ?? []) { state.cards[id].loc = { pile: "removed" }; state.cards[id].faceUp = false; state.piles.removed.push(id); }
      addLog(state, "action", `Acte 2 et agenda 3 entrent dans l'histoire (l'acte 1 et l'agenda courant partent de côté, l'agenda 2 inutilisé est retiré, tout le doom est retiré) ; la pile Leads est retirée de la partie.`);
      reminders.push(addLog(state, "reminder", `Journal de campagne (papier) : entourez ${nom(verite.suspect.code)} et ${nom(verite.hideout.code)} sous « Possible Suspects / Possible Hideouts ».`));
      reminders.push(...rappels(state, def, "act:2"), ...rappels(state, def, "agenda:3"));
      return { reminders };
    }

    // ---- Road X (Horror in High Gear) ---------------------------------------------------
    case "roadAhead": {
      // {id, n} : n lieux entrent en jeu non révélés dans une nouvelle colonne devant ce lieu — la première carte de la pile
      // Road deck + (n − 1) « Long Way Around » de côté, mélangés : le journal ne dit pas lequel est lequel.
      const R = def.road ?? refuser("ce scénario n'a pas de Road deck");
      const c = carte(state, msg.id);
      if (c.kind !== "location" || !("zone" in c.loc) || c.loc.zone !== "board") refuser("ce n'est pas un lieu du tapis");
      const n = Math.max(1, Math.min(3, Math.round(Number(msg.n) || 1)));
      const tete = state.piles[R.pile]?.[0];
      if (!tete) refuser(`${nomPile(def, R.pile)} est vide`);
      const longs = Object.values(state.cards).filter((k) => k.code === R.longWay && "zone" in k.loc && k.loc.zone === "aside").slice(0, n - 1);
      const ids = shuffle([tete, ...longs.map((k) => k.id)], rng);
      state.piles[R.pile].shift();
      const { x: lx, y: ly } = c.loc as { x: number; y: number };
      const occupe = (x: number, y: number) => Object.values(state.cards).some((k) => k.kind === "location" && "zone" in k.loc && k.loc.zone === "board"
        && Math.abs(k.loc.x - x) < PAS_X / 2 && Math.abs(k.loc.y - y) < PAS_Y / 2);
      // Colonne devant le lieu (à droite) : 1 carte en face, 2 = en face + dessous, 3 = dessus + en face + dessous ; case prise → plus bas.
      const decalages = ids.length === 1 ? [0] : ids.length === 2 ? [0, PAS_Y] : [-PAS_Y, 0, PAS_Y];
      ids.forEach((id, i) => {
        let y = ly + decalages[i];
        while (occupe(lx + PAS_X, y)) y += PAS_Y;
        const k = state.cards[id];
        retirerDesPiles(state, id);
        k.loc = { zone: "board", x: lx + PAS_X, y, z: nextZ(state) };
        k.faceUp = false; k.side = "a";
      });
      addLog(state, "action", `Road ${n} : ${ids.length} lieu${ids.length > 1 ? "x" : ""} posé${ids.length > 1 ? "s" : ""} non révélé${ids.length > 1 ? "s" : ""} devant ${nomCarte(def, c)} (la première carte du Road deck${longs.length ? ` et ${longs.length} Long Way Around` : ""}, mélangé${ids.length > 1 ? "s" : ""})${longs.length < n - 1 ? " — plus assez de Long Way Around de côté" : ""} ; Road deck : ${state.piles[R.pile].length}.`);
      return {};
    }

    // ---- Barrières entre lieux adjacents (In Too Deep) --------------------------------
    case "setBarrier": {
      // {a, b, delta} : +1 / −1 barrière entre deux lieux du tapis (0 = plus de barrière, l'entrée disparaît).
      const a = carte(state, msg.a), b = carte(state, msg.b);
      if (a.id === b.id || a.kind !== "location" || b.kind !== "location") refuser("une barrière sépare deux lieux");
      state.barriers ??= [];
      const delta = Math.round(Number(msg.delta) || 0);
      const i = state.barriers.findIndex((k) => (k.a === a.id && k.b === b.id) || (k.a === b.id && k.b === a.id));
      const avant = i >= 0 ? state.barriers[i].n : 0;
      const apres = Math.max(0, avant + delta);
      if (apres === avant) return {};
      if (i >= 0) { if (apres) state.barriers[i].n = apres; else state.barriers.splice(i, 1); }
      else state.barriers.push({ a: a.id, b: b.id, n: apres });
      addLog(state, "action", `Barrière${apres > 1 ? "s" : ""} entre ${nomCarte(def, a)} et ${nomCarte(def, b)} : ${apres} (${delta > 0 ? "+" : ""}${apres - avant}).`);
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
      // Bénédiction et malédiction révélées retournent à la réserve, pas dans le sac (règle TIC).
      const tires = state.chaos.drawn.splice(0);
      const reserve = tires.filter((t) => JETONS_RESERVE.has(t));
      state.chaos.bag.push(...tires.filter((t) => !JETONS_RESERVE.has(t)));
      if (reserve.length) addLog(state, "action", `${reserve.length > 1 ? "Jetons" : "Jeton"} ${reserve.join(", ")} rendu${reserve.length > 1 ? "s" : ""} à la réserve (pas au sac).`);
      return {};
    }
    case "chaosAdjust": {
      const t = String(msg.token) as Token;
      if (!CHAOS_TOKENS.has(t)) refuser("jeton inconnu");
      let delta = Math.round(Number(msg.delta) || 0);
      // Au plus 10 bénédictions et 10 malédictions entre le sac et les cartes qui en scellent.
      if (delta > 0 && JETONS_RESERVE.has(t)) delta = Math.min(delta, 10 - state.chaos.bag.filter((k) => k === t).length - state.chaos.sealed.filter((k) => k === t).length);
      // Jeton scellable du scénario (COB : sang, 12 au plus entre le sac et les enquêteurs).
      if (delta > 0 && def.seal?.token === t && def.seal.maxTotal) {
        delta = Math.min(delta, def.seal.maxTotal - state.chaos.bag.filter((k) => k === t).length - state.chaos.sealed.filter((k) => k === t).length);
      }
      if (delta > 0) for (let k = 0; k < delta; k++) state.chaos.bag.push(t);
      else for (let k = 0; k < -delta; k++) { const i = state.chaos.bag.indexOf(t); if (i < 0) break; state.chaos.bag.splice(i, 1); }
      return {};
    }
    case "chaosSeal": {
      // Sceller un jeton (COB : sang) sur un enquêteur : le jeton quitte les tirés (celui qu'on vient de
      // révéler) ou le sac, et le compteur de siège déclaré par le scénario monte de 1 (borné par la règle).
      const sc = def.seal ?? refuser("pas de jeton à sceller dans ce scénario");
      const n = siege(state, msg.seat);
      const compteur = state.seats[n].counters[sc.counter] ?? 0;
      if (compteur >= sc.maxPerSeat) refuser(`au plus ${sc.maxPerSeat} jetons ${sc.label} scellés par enquêteur`);
      let source = "des jetons tirés";
      let i = state.chaos.drawn.indexOf(sc.token);
      if (i >= 0) state.chaos.drawn.splice(i, 1);
      else {
        i = state.chaos.bag.indexOf(sc.token);
        if (i < 0) refuser(`aucun jeton ${sc.label} dans le sac ni parmi les tirés`);
        state.chaos.bag.splice(i, 1);
        source = "du sac";
      }
      state.chaos.sealed.push(sc.token);
      state.seats[n].counters[sc.counter] = compteur + 1;
      addLog(state, "action", `Un jeton ${sc.label} est scellé sur ${nomSiege(state, n, def)} (pris ${source} ; ${compteur + 1}/${sc.maxPerSeat}). Sac : ${state.chaos.bag.length} jetons.`);
      return {};
    }
    case "chaosRelease": {
      // Libérer un jeton scellé : il retourne dans le sac.
      const sc = def.seal ?? refuser("pas de jeton à sceller dans ce scénario");
      const n = siege(state, msg.seat);
      const compteur = state.seats[n].counters[sc.counter] ?? 0;
      if (compteur <= 0) refuser(`aucun jeton ${sc.label} scellé sur ce siège`);
      state.seats[n].counters[sc.counter] = compteur - 1;
      const i = state.chaos.sealed.indexOf(sc.token);
      if (i >= 0) state.chaos.sealed.splice(i, 1);
      state.chaos.bag.push(sc.token);
      addLog(state, "action", `${nomSiege(state, n, def)} libère un jeton ${sc.label} : il retourne dans le sac (${state.chaos.bag.length} jetons).`);
      return {};
    }
    case "bury": {
      // COB : « mélangez les 2 premières cartes de la pioche avec Julia, une face cachée sous chaque repaire ».
      const b = def.bury ?? refuser("pas d'enfouissement dans ce scénario");
      const codes = new Set(b.withAny);
      const avec = Object.entries(state.cards)
        .filter(([, c]) => codes.has(c.code) && "zone" in c.loc && ["board", "aside", ...SEAT_ZONES].includes((c.loc as { zone: string }).zone))
        .map(([id]) => id);
      const enJeuTrait = Object.values(state.cards).some((c) => c.kind === "location" && "zone" in c.loc && c.loc.zone === "board"
        && (def.cards.find((k) => k.code === c.code)?.traits ?? []).includes(b.trait));
      if (!enJeuTrait) refuser(`aucun lieu « ${b.trait} » en jeu`);
      if (!avec.length && !state.piles.encounter.length && !state.piles.encounterDiscard?.length) refuser("rien à enfouir");
      const n = enfouir(state, def, rng, { avec, fromDeckTop: b.fromDeckTop, trait: b.trait, dy: b.dy });
      addLog(state, "action", `${n} cartes${avec.length ? ` (dont ${avec.map((id) => nomVisible(def, { ...state.cards[id], faceUp: true } as CardState, state.extraDefs)).join(", ")})` : ""} mélangées et enfouies face cachée sous les lieux « ${b.trait} » — personne ne sait laquelle est où.`);
      return {};
    }
    case "buryAt": {
      // COB, effet Forcé : la carte (Julia) est retournée face cachée sous le lieu où elle se trouve,
      // avec la première carte de la pioche de rencontre.
      const b = def.bury ?? refuser("pas d'enfouissement dans ce scénario");
      const c = carte(state, msg.id);
      if (!b.withAny.includes(c.code)) refuser("cette carte ne s'enfouit pas");
      if (!("zone" in c.loc) || c.loc.zone !== "board") refuser("posez d'abord la carte sur son lieu");
      const { x, y } = c.loc as { x: number; y: number };
      const lieu = Object.values(state.cards)
        .filter((L) => L.kind === "location" && "zone" in L.loc && L.loc.zone === "board"
          && (def.cards.find((k) => k.code === L.code)?.traits ?? []).includes(b.trait))
        .find((L) => Math.abs(x + CARD_W / 2 - ((L.loc as { x: number }).x + CARD_W / 2)) < CARD_W
          && Math.abs(y + CARD_H / 2 - ((L.loc as { y: number }).y + CARD_H / 2)) < CARD_H)
        ?? refuser(`${nomVisible(def, c, state.extraDefs)} n'est pas sur un lieu « ${b.trait} »`);
      const nom = nomVisible(def, c, state.extraDefs);
      const n = enfouir(state, def, rng, { avec: [String(msg.id)], fromDeckTop: 1, trait: b.trait, cible: lieu, dy: b.dy });
      addLog(state, "action", `${nom} est retourné face cachée et enfoui sous ${nomVisible(def, lieu, state.extraDefs)}, avec ${n - 1 ? "la première carte de la pioche, mélangées — personne ne sait laquelle est laquelle" : "rien d'autre (pioche vide)"}.`);
      return {};
    }
    case "chaosSealCard": {
      // COB III (codex des invités) : le jeton révélé se scelle sur l'ennemi visité.
      if (!def.cardSeal) refuser("pas de scellage sur les cartes dans ce scénario");
      const c = carte(state, msg.id);
      const t = String(msg.token) as Token;
      if (!CHAOS_TOKENS.has(t)) refuser("jeton inconnu");
      let source = "des jetons tirés";
      let i = state.chaos.drawn.indexOf(t);
      if (i >= 0) state.chaos.drawn.splice(i, 1);
      else {
        i = state.chaos.bag.indexOf(t);
        if (i < 0) refuser(`aucun jeton ${t} parmi les tirés ni dans le sac`);
        state.chaos.bag.splice(i, 1);
        source = "du sac";
      }
      (c.sealed ??= []).push(t);
      addLog(state, "action", `Jeton ${t} scellé sur ${nomVisible(def, c, state.extraDefs)} (pris ${source}). Sac : ${state.chaos.bag.length} jetons.`);
      return {};
    }
    case "chaosReleaseCard": {
      const c = carte(state, msg.id);
      const t = String(msg.token) as Token;
      const i = (c.sealed ?? []).indexOf(t);
      if (i < 0) refuser("ce jeton n'est pas scellé sur cette carte");
      c.sealed!.splice(i, 1);
      state.chaos.bag.push(t);
      addLog(state, "action", `Le jeton ${t} scellé sur ${nomVisible(def, c, state.extraDefs)} retourne au sac (${state.chaos.bag.length} jetons).`);
      return {};
    }
    default:
      return refuser(`action « ${msg.t} » inconnue`);
  }
}
