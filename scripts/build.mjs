#!/usr/bin/env node
// Build des données de jeu (à lancer avant un commit qui touche data/scenarios/*.src.json) :
//   node scripts/build.mjs
//
// 1. Pour chaque data/scenarios/<id>.src.json (déclaratif, écrit à la main), lit le cache de cartes
//    d'arkham.build (mis en cache dans data/cache/) et écrit public/scenarios/<id>.json : source + liste
//    des cartes des sets de rencontre (codes, quantités, valeurs d'indices, seuils de doom), sans texte de carte.
// 2. Écrit public/data/investigators.json : index compact des investigateurs (lobby), avec les cartes
//    qu'ils commencent en jeu ; public/data/player_cards.json : index des cartes joueur (board joueur).
// 3. Écrit src/scenarios.generated.ts : registre des scénarios importé par le Worker.
//
// Source de données : arkham.build (décision 2026-09-08) — un seul dump de toutes les cartes
// (https://api.arkham.build/v1/cache/cards) + métadonnées (packs, noms des sets de rencontre),
// normalisés ici vers la forme ArkhamDB que le reste du build attend. ArkhamDB n'est plus interrogé
// au build ; les images restent servies par cdn.arkham.build en jeu, comme avant.
//
// Les fichiers générés sont commités : le déploiement Workers Builds ne relance pas ce script.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(racine, "data", "cache");
const SRC = path.join(racine, "data", "scenarios");
const OUT = path.join(racine, "public", "scenarios");
const ARKHAM_BUILD = "https://api.arkham.build/v1/cache";

async function json(url, cacheName) {
  await mkdir(CACHE, { recursive: true });
  const fichier = path.join(CACHE, cacheName);
  if (existsSync(fichier) && !process.argv.includes("--refresh")) {
    return JSON.parse(await readFile(fichier, "utf8"));
  }
  process.stdout.write(`  ↓ ${url}\n`);
  const r = await fetch(url, { headers: { "user-agent": "ahwa-build (github.com/Kittiwatt/AHWA)" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const data = await r.json();
  await writeFile(fichier, JSON.stringify(data));
  return data;
}

// ---------------------------------------------------------------------------
// Couche arkham.build → forme ArkhamDB.
//
// Le dump `cards` liste TOUTES les cartes (joueur et rencontre) avec des champs `real_*`
// (real_name, real_traits…), les variantes taboo en entrées séparées (`id` = « code-taboo »),
// et les versos de cartes liées en entrées propres marquées `hidden` (05055b, 01121b…),
// référencées par `back_link_id`. On reconstruit ici l'objet `linked_card` imbriqué
// qu'ArkhamDB servait, et on écarte taboos et versos de la liste principale.
// ---------------------------------------------------------------------------

let _donnees = null;

async function donnees() {
  if (_donnees) return _donnees;
  const brut = (await json(`${ARKHAM_BUILD}/cards`, "arkham_build_cards.json")).data.all_card;
  const meta = (await json(`${ARKHAM_BUILD}/metadata`, "arkham_build_metadata.json")).data;
  const nomsPacks = Object.fromEntries(meta.pack.map((p) => [p.code, p.real_name]));
  const nomsSets = Object.fromEntries(meta.card_encounter_set.map((s) => [s.code, s.real_name]));
  // Entrées de base : une par code (les variantes taboo ont `id` ≠ `code`).
  const bases = brut.filter((c) => c.id === c.code);
  const parCode = new Map(bases.map((c) => [c.code, c]));
  const traduire = (c, avecLien = true) => {
    const o = {
      ...c,
      name: c.real_name,
      subname: c.real_subname,
      traits: c.real_traits,
      back_name: c.real_back_name,
      text: c.real_text,
      pack_name: nomsPacks[c.pack_code],
      encounter_name: nomsSets[c.encounter_code],
      // Tout le catalogue officiel a ses images sur cdn.arkham.build : l'ancien filtre
      // `imagesrc` d'ArkhamDB devient « carte officielle » (les exceptions connues,
      // 60154/60254, restent gérées côté serveur pour le tirage de faiblesse).
      imagesrc: c.official ? `cdn:${c.code}` : null,
      backimagesrc: c.double_sided || c.back_link_id ? `cdn:${c.code}b` : null,
    };
    // Le dump n'a pas bonded_to / bonded_count : le nom vient du mot-clé imprimé « Bonded (X). »
    // (début de ligne du texte), le compte vaut la quantité sauf trois exceptions héritées
    // d'ArkhamDB (cartes TDE imprimées ×2 mais liées ×1).
    const bonded = /^Bonded \((.+?)\)[.,]/m.exec(c.real_text ?? "");
    if (bonded) {
      o.bonded_to = bonded[1];
      o.bonded_count = { "06025": 1, "06028": 1, "06283": 1 }[c.code] ?? c.quantity ?? 1;
    }
    if (avecLien && c.back_link_id) {
      const verso = parCode.get(c.back_link_id);
      if (!verso) throw new Error(`${c.code} : verso lié ${c.back_link_id} introuvable dans le dump arkham.build`);
      o.linked_card = traduire(verso, false);
      // Cartes joueur liées (Sophie 03009 ↔ 03009b…) : ArkhamDB exposait linked_to_code/name.
      o.linked_to_code = verso.code;
      o.linked_to_name = verso.real_name;
    }
    return o;
  };
  _donnees = {
    // Liste principale : sans les versos (`hidden` + cible d'un back_link) ni les taboos.
    cartes: bases.filter((c) => !c.hidden).map((c) => traduire(c)),
    // Versos orphelins éventuels (recto absent du dump) : matière à synthèse, comme avant.
    versosCaches: bases.filter((c) => c.hidden).map((c) => traduire(c, false)),
    nomsSets,
  };
  process.stdout.write(`  arkham.build : ${_donnees.cartes.length} cartes (hors versos et taboos)\n`);
  return _donnees;
}

async function cartesRencontre() { return (await donnees()).cartes.filter((c) => c.encounter_code); }
async function cartesJoueur() { return (await donnees()).cartes.filter((c) => !c.encounter_code); }
// Pour l'index de l'outil « Générer une carte » : tout, versos cachés compris (on pouvait déjà
// générer un verso par son code — 01121b The Masked Hunter — avec l'ancienne source).
async function toutesCartes() { const d = await donnees(); return [...d.cartes, ...d.versosCaches]; }

// Correspondance type ArkhamDB → kind du modèle d'état (cahier des charges §3.2).
const KIND = {
  location: "location", enemy: "enemy", treachery: "treachery", asset: "asset", story: "story",
  // `key` (cartes Key de The Scarlet Keys, ex. The Wellspring of Fortune) : soutien à deux faces, porteur de jetons — comme KIND_INDEX du générateur.
  agenda: "agenda", act: "act", scenario: "scenario", investigator: "investigator", key: "asset",
};

function carte(c, src) {
  const kind = KIND[c.type_code];
  if (!kind) throw new Error(`type inconnu ${c.type_code} pour ${c.code}`);
  const out = {
    code: c.code,
    name: c.name,
    kind,
    qty: c.quantity ?? 1,
    set: c.encounter_code,
    // Dos : « b » = verso propre sur le CDN (lieux, agendas, actes, carte de scénario) ;
    // sinon dos générique de rencontre embarqué dans l'app.
    back: c.double_sided ? "b" : "encounter",
    storyBack: (src.storyBack ?? []).includes(c.code),
  };
  if (kind === "location" || kind === "act") {
    // clues_fixed absent/false = valeur « par enquêteur » ; true = valeur fixe. Valeur négative du dump = X (−2) ou ✱ (−3,
    // « voir les règles » : seuil global de l'acte 1 du Blob en Epic Multiplayer) → aucun seuil ni indice automatique.
    out.clue = { value: Math.max(0, c.clues ?? 0), perInvestigator: !c.clues_fixed };
  }
  // Verso = lieu (ex. acte dont le dos est un lieu) : ses indices, posés quand l'acte avance.
  if (c.linked_card?.type_code === "location") {
    out.backClue = { value: c.linked_card.clues ?? 0, perInvestigator: !c.linked_card.clues_fixed };
  }
  // Carte liée (ex. agenda dont le verso est un ennemi) : le verso est une autre carte ArkhamDB.
  // Sous-titre (ex. « Master of Initiation ») : distingue les faces ou versions d'une même carte dans les menus.
  if (c.subname) out.subname = c.subname;
  // Traits (« Spectral », « Witch »…) : servent à scinder les pioches (The Wages of Sin) et à choisir la défausse.
  if (c.traits) out.traits = c.traits.split(".").map((t) => t.trim()).filter(Boolean);
  // Nom du côté non révélé (« Decrepit Door », « Unknown Places », titre du verso d'un agenda) : affiché tant que le verso est montré.
  if (c.back_name && !c.linked_card) out.backName = c.back_name;
  if (c.linked_card) {
    out.back = "b";
    out.backCode = c.linked_card.code;
    out.backKind = KIND[c.linked_card.type_code] ?? "story";
    out.backName = c.linked_card.name;
    if (c.linked_card.subname) out.backSubname = c.linked_card.subname;
    if (c.linked_card.health !== undefined && c.linked_card.health !== null && c.linked_card.health >= 0) out.backHealth = c.linked_card.health;
    if (c.linked_card.health_per_investigator) out.backHealthPerInvestigator = true;
    if (c.linked_card.victory) out.backVictory = c.linked_card.victory;
  }
  if (kind === "enemy" || kind === "asset") {
    // Vie négative du dump = X (−2 : Cthulhu, Stalking Hybrid) ou ✱ (−3 : réserve de vie globale de Subject 8L-08 en Epic
    // Multiplayer) : pas de maximum, la jauge compte seulement les dégâts.
    if (c.health !== undefined && c.health !== null && c.health >= 0) out.health = c.health;
    if (c.sanity !== undefined && c.sanity !== null) out.sanity = c.sanity;
    if (c.health_per_investigator) out.healthPerInvestigator = true;
  }
  if (kind === "agenda") out.doom = c.doom ?? null;
  if (kind === "agenda" || kind === "act") out.stage = c.stage ?? null;
  if (c.victory) out.victory = c.victory;
  return out;
}

async function buildScenario(fichierSrc) {
  const src = JSON.parse(await readFile(fichierSrc, "utf8"));
  // Un pack (`pack`) ou plusieurs (`packs`, ex. TCU + sets du Core, COB + Core 2026).
  const packs = src.packs ?? [src.pack];
  const cartesPack = (await cartesRencontre()).filter((c) => packs.includes(c.pack_code));
  const sets = new Set(src.encounterSets);
  const extra = new Set(src.extraCards ?? []);
  // Le dump arkham.build a un recto pour toute carte liée (Josef Meiger 05085 compris : plus de
  // synthèse) ; si un verso caché se retrouvait un jour sans recto, on veut le savoir tout de suite.
  const lies = new Set(cartesPack.map((c) => c.back_link_id).filter(Boolean));
  for (const v of (await donnees()).versosCaches.filter((c) => packs.includes(c.pack_code) && sets.has(c.encounter_code))) {
    if (!lies.has(v.code)) throw new Error(`${src.id} : verso ${v.code} sans recto dans le dump arkham.build`);
  }
  const cards = cartesPack
    .filter((c) => sets.has(c.encounter_code) || extra.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => carte(c, src));
  for (const code of extra) if (!cards.some((c) => c.code === code)) throw new Error(`${src.id} : carte hors set ${code} introuvable dans le pack`);
  const encounterSetNames = {};
  const nomsSets = (await donnees()).nomsSets;
  for (const s of src.encounterSets) if (nomsSets[s]) encounterSetNames[s] = nomsSets[s];

  // Contrôles de cohérence entre la source et ArkhamDB.
  const codes = new Set(cards.map((c) => c.code));
  const citesDe = (steps) => steps.flatMap((s) => [s.code, ...(s.codes ?? []), ...(s.op === "pickRandomSet" ? [] : (s.from ?? [])), ...(s.include ?? []), s.at, s.randomTo, ...(s.atRandom ?? []), ...(s.pool ?? []),
    ...(s.op === "bury" ? [...(s.with ?? []), ...(s.fromPool ?? []), ...(s.under ?? [])] : []),
    ...(s.op === "pickGroups" ? s.groups.flatMap((g) => g.codes) : []),
    ...(s.cases ? Object.values(s.cases).flatMap(citesDe) : []), ...citesDe(s.then ?? []), ...citesDe(s.else ?? [])]).filter((c) => c && !String(c).startsWith("slot:"));
  for (const s of src.setup.flatMap(function aplat(x) { return [x, ...(x.cases ? Object.values(x.cases).flat().flatMap(aplat) : []), ...(x.then ?? []).flatMap(aplat), ...(x.else ?? []).flatMap(aplat)]; })) {
    if (s.op === "pickRandomSet") for (const set of s.from) if (!src.encounterSets.includes(set)) throw new Error(`${src.id} : set ${set} absent de encounterSets`);
    if (s.op === "aside" || s.op === "toPile") for (const set of [...(s.sets ?? []), ...(s.set ? [s.set] : [])]) if (!src.encounterSets.includes(set)) throw new Error(`${src.id} : set ${set} absent de encounterSets`);
    if (s.op === "dealToSeats" && (!Array.isArray(s.rows) || !s.rows.length)) throw new Error(`${src.id} : dealToSeats sans rows`);
    if (s.op === "bury" && !s.trait && !(Array.isArray(s.under) && s.under.length)) throw new Error(`${src.id} : bury sans trait ni under`);
    if (s.op === "pickGroups") {
      if (!Array.isArray(s.groups) || s.groups.some((g) => !g.label || !Array.isArray(g.codes) || !g.codes.length)) throw new Error(`${src.id} : pickGroups — chaque groupe a un label et des codes`);
      if ((s.remove ?? 0) + (s.play ?? 1) > s.groups.length) throw new Error(`${src.id} : pickGroups — plus de groupes demandés que déclarés`);
      for (const g of s.groups) if (g.positions && g.positions.length !== g.codes.length) throw new Error(`${src.id} : pickGroups — positions et codes du groupe ${g.label} en nombre différent`);
    }
    if (s.op === "layeredPile") {
      const total = s.layers.reduce((n, l) => n + (l.n ?? 0) + (l.with?.length ?? 0), 0);
      if (total !== s.pool.length) throw new Error(`${src.id} : layeredPile ${s.pile} — couches (${total}) ≠ pool (${s.pool.length})`);
      for (const l of s.layers) for (const code of l.with ?? []) if (!s.pool.includes(code)) throw new Error(`${src.id} : layeredPile ${code} hors pool`);
    }
  }
  for (const code of Object.keys(src.backPlacement ?? {})) if (!cartesPack.some((c) => c.code === code && c.linked_card)) throw new Error(`${src.id} : backPlacement ${code} n'est pas une carte liée`);
  for (const p of src.piles ?? []) {
    if (p.discard && !(src.piles ?? []).some((q) => q.id === p.discard && q.isDiscard)) throw new Error(`${src.id} : pile ${p.id} — défausse ${p.discard} non déclarée`);
  }
  for (const p of src.swaps ?? []) {
    if (!Array.isArray(p.pair) || p.pair.length !== 2 || !Array.isArray(p.labels) || p.labels.length !== 2) throw new Error(`${src.id} : swaps mal formé`);
    for (const code of p.pair) if (!codes.has(code)) throw new Error(`${src.id} : swaps ${code} absent des sets de rencontre`);
  }
  for (const q of src.questions ?? []) {
    if (q.type === "number" ? !(Number.isInteger(q.min) && Number.isInteger(q.max)) : !(Array.isArray(q.options) && q.options.length)) throw new Error(`${src.id} : question ${q.id} mal formée`);
  }
  // Leads deck (TIC II) et effets d'agenda : les codes cités doivent exister dans les sets.
  const citesLeads = src.leads ? [src.leads.reference, ...src.leads.suspects, ...src.leads.hideouts, src.leads.elina, src.leads.square, src.leads.act2, src.leads.agenda3] : [];
  const aplatEffets = (e) => [e, ...Object.values(e.byPlayers ?? {}).flatMap(aplatEffets), ...Object.values(e.byAnswer?.cases ?? {}).flatMap(aplatEffets)];
  const effets = [...Object.values(src.agendaEffects ?? {}), ...Object.values(src.actEffects ?? {}), ...Object.values(src.revealEffects ?? {})].flatMap(aplatEffets);
  const citesAgenda = effets.flatMap((e) => [...(e.shuffleAside ?? []).map((x) => (typeof x === "string" ? x : x.code)), ...(e.revealCodes ?? []), ...(e.placeBelow ?? []).flatMap((p) => [p.code, p.at]), ...(e.fillRows?.anchors ?? []), ...(e.removeLocations?.except ?? []), ...(e.placeAt ?? []).map((p) => p.code)]);
  for (const k of [...Object.keys(src.agendaEffects ?? {}), ...Object.keys(src.actEffects ?? {})]) if (k.startsWith("after:") && !codes.has(k.slice(6))) throw new Error(`${src.id} : effet after:${k.slice(6)} — code inconnu`);
  const citesSetup = src.setup.flatMap((s) => s.op === "leadsDeck" ? [...s.suspects, ...s.hideouts] : []);
  const citesBarrieres = src.setup.flatMap((s) => s.op === "barriers" ? s.pairs.flatMap((p) => [p.a, p.b]) : []);
  const citesAgendaPlus = effets.flatMap((e) => [
    ...(e.spawnAside ? (Array.isArray(e.spawnAside) ? e.spawnAside : [e.spawnAside]).flatMap((sa) => [sa.code, ...(Array.isArray(sa.at) ? sa.at : [sa.at])]) : []), e.randomKeyOn,
    ...(e.shuffleFromDiscard ?? []),
    ...(e.discardAside ?? []).map((d) => d.code), ...(e.setAside ?? []), ...(e.discardAt ?? []), ...(e.addClues ?? []).map((a) => a.code), ...(e.removeLocations?.codes ?? []),
    ...(Array.isArray(e.drawAside) ? e.drawAside : e.drawAside ? [e.drawAside] : []).flatMap((d) => d.codes), e.moveTokens?.from, e.moveTokens?.to, ...(e.flip ?? []), e.minisTo,
    ...(e.tokens ?? []).map((t) => t.code), e.drawPileTo?.at,
  ].filter(Boolean));
  for (const code of Object.keys(src.revealEffects ?? {})) if (!codes.has(code)) throw new Error(`${src.id} : revealEffects ${code} — code inconnu`);
  for (const e of effets) if (e.seatCounter && !(src.seatCounters ?? []).some((c) => c.key === e.seatCounter.key) && !["clues", "resources", "health", "sanity", "actions"].includes(e.seatCounter.key)) throw new Error(`${src.id} : effet seatCounter ${e.seatCounter.key} — compteur non déclaré`);
  for (const e of effets) for (const a of e.addClues ?? []) if (!a.code && !a.trait) throw new Error(`${src.id} : addClues sans code ni trait`);
  if (src.actCycle && !src.actDeck.length) throw new Error(`${src.id} : actCycle sans actDeck`);
  const cites = [src.scenarioCard, src.startLocation, ...src.agendaDeck, ...src.actDeck, ...(src.layout ?? []).map((l) => l.code), ...citesDe(src.setup), ...citesLeads, ...citesAgenda, ...citesSetup, ...citesBarrieres, ...citesAgendaPlus].filter(Boolean);
  for (const code of cites) if (!codes.has(code)) throw new Error(`${src.id} : code ${code} absent des sets de rencontre`);

  const { _source, ...reste } = src;
  const def = { ...reste, builtAt: new Date().toISOString().slice(0, 10), encounterSetNames, cards };
  await mkdir(OUT, { recursive: true });
  await writeFile(path.join(OUT, `${src.id}.json`), JSON.stringify(def, null, 1) + "\n");
  const nbRencontre = cards.filter((c) => c.kind === "enemy" || c.kind === "treachery").reduce((n, c) => n + c.qty, 0);
  process.stdout.write(`${src.id} : ${cards.length} cartes distinctes, ${nbRencontre} cartes de rencontre (avant mise de côté)\n`);
  return src.id;
}

const ORDRE_FACTIONS = ["guardian", "seeker", "rogue", "mystic", "survivor", "neutral"];

/** Cartes que l'enquêteur commence en jeu (« You begin the game with X in play »), lues dans son texte — jamais reproduit. */
function commenceEnJeu(c) {
  const m = /begins? the game with (.+?) in play/i.exec(c.real_text ?? c.text ?? "");
  if (!m) return [];
  const brut = m[1].replace(/<[^>]+>/g, "").replace(/\([^)]*\)/g, "").trim();
  // « each Discipline in your deck » (Lily Chen) : toutes les cartes du deck portant ce trait.
  const trait = /^each (\w+) in your deck$/i.exec(brut);
  if (trait) return [{ trait: trait[1] }];
  return brut.split(/\s*(?:,|\band\b)\s*/).map((s) => s.trim()).filter(Boolean).map((name) => ({ name }));
}

async function buildInvestigators() {
  const cartes = await cartesJoueur();
  const inv = cartes
    .filter((c) => c.type_code === "investigator" && !c.duplicate_of_code && !c.hidden && c.imagesrc)
    .map((c) => ({
      code: c.code,
      name: c.name,
      subname: c.subname ?? "",
      faction: c.faction_code,
      health: c.health,
      sanity: c.sanity,
      pack: c.pack_code,
      packName: c.pack_name,
      parallel: Boolean(c.alternate_of_code),
      ...(commenceEnJeu(c).length ? { startsInPlay: commenceEnJeu(c) } : {}),
    }))
    .sort((a, b) =>
      ORDRE_FACTIONS.indexOf(a.faction) - ORDRE_FACTIONS.indexOf(b.faction)
      || a.name.localeCompare(b.name, "en")
      || a.code.localeCompare(b.code));
  await mkdir(path.join(racine, "public", "data"), { recursive: true });
  await writeFile(path.join(racine, "public", "data", "investigators.json"),
    JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), investigators: inv }, null, 1) + "\n");
  process.stdout.write(`investigators.json : ${inv.length} investigateurs\n`);
}

/** Index compact de TOUTES les cartes (joueur et rencontre) pour l'outil « Générer une carte ». */
async function buildCardsIndex() {
  const cartes = await toutesCartes();
  const idx = cartes
    .filter((c) => c.imagesrc)
    .map((c) => ({
      c: c.code, n: c.name, s: c.subname ?? "", t: c.type_code, p: c.pack_code, pn: c.pack_name ?? "",
      f: c.faction_code ?? "", h: c.health ?? null, m: c.sanity ?? null, d: c.double_sided ? 1 : 0, e: c.encounter_code ? 1 : 0,
      ...(c.linked_card ? { lc: c.linked_card.code, lt: c.linked_card.type_code, ln: c.linked_card.name, lh: c.linked_card.health ?? null } : {}),
    }))
    .sort((a, b) => a.c.localeCompare(b.c));
  await writeFile(path.join(racine, "public", "data", "cards_index.json"), JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), cards: idx }));
  process.stdout.write(`cards_index.json : ${idx.length} cartes\n`);
}

/**
 * Index compact des cartes joueur (board joueur, cahier §10.3) : ce qu'il faut pour importer un deck et jouer
 * ses cartes — coût, slot, permanent, jauges des alliés, « Uses (n type) », cartes liées, faiblesses — sans texte.
 * Clés courtes : c code, n nom, s sous-titre, t type, st sous-type (weakness / basicweakness), f faction,
 * f2 seconde faction, k coût (null = —, -2 = X), x xp, sl slot, p permanent, h vie, m santé mentale,
 * u {n, type} uses, b bonded_to (nom), bc bonded_count, q quantité, un unique, d double face, lk/ln carte liée au verso
 * (code / nom), sk icônes de compétence {w, i, c, a, x}, pk pack, tr traits.
 */
async function buildPlayerCards() {
  const cartes = await cartesJoueur();
  const TYPES = new Set(["asset", "event", "skill", "treachery", "enemy", "story", "location"]);
  const idx = cartes
    .filter((c) => TYPES.has(c.type_code) && !c.hidden && c.imagesrc)
    .map((c) => {
      const o = { c: c.code, n: c.name, t: c.type_code, f: c.faction_code ?? "neutral", q: c.quantity ?? 1, pk: c.pack_code };
      if (c.subname) o.s = c.subname;
      if (c.subtype_code) o.st = c.subtype_code;
      if (c.faction2_code) o.f2 = c.faction2_code;
      if (c.type_code === "asset" || c.type_code === "event") o.k = c.cost ?? null;
      if (c.xp) o.x = c.xp;
      if (c.real_slot) o.sl = c.real_slot;
      if (c.permanent) o.p = 1;
      if (c.health !== undefined && c.health !== null) o.h = c.health;
      if (c.sanity !== undefined && c.sanity !== null) o.m = c.sanity;
      const uses = /Uses \((\d+|X) ([a-z]+)\)/i.exec(c.real_text ?? "");
      if (uses) o.u = { n: uses[1] === "X" ? 0 : Number(uses[1]), type: uses[2].toLowerCase() };
      if (c.bonded_to) { o.b = c.bonded_to; o.bc = c.bonded_count ?? 1; }
      if (c.is_unique) o.un = 1;
      if (c.double_sided || c.backimagesrc) o.d = 1;
      // Verso qui est une autre carte (ArkhamDB : linked_to_code) : Sophie ↔ 03009b, Dream-Gate 06015a ↔ 06015b…
      if (c.linked_to_code) { o.lk = c.linked_to_code; if (c.linked_to_name) o.ln = c.linked_to_name; }
      // Icônes de compétence (engagement aux tests) : w volonté, i intellect, c combat, a agilité, x joker.
      const sk = { w: c.skill_willpower, i: c.skill_intellect, c: c.skill_combat, a: c.skill_agility, x: c.skill_wild };
      const skf = Object.fromEntries(Object.entries(sk).filter(([, v]) => v > 0));
      if (Object.keys(skf).length) o.sk = skf;
      if (c.real_traits) o.tr = c.real_traits;
      return o;
    })
    .sort((a, b) => a.c.localeCompare(b.c));
  await writeFile(path.join(racine, "public", "data", "player_cards.json"), JSON.stringify({ builtAt: new Date().toISOString().slice(0, 10), cards: idx }));
  const faiblesses = idx.filter((c) => c.st === "basicweakness").length;
  process.stdout.write(`player_cards.json : ${idx.length} cartes joueur, ${faiblesses} faiblesses de base\n`);
}

async function buildRegistre(ids) {
  const lignes = [
    "// GÉNÉRÉ par scripts/build.mjs — ne pas modifier à la main.",
    "// Registre des scénarios jouables (définitions figées dans public/scenarios/).",
    ...ids.map((id, i) => `import s${i} from "../public/scenarios/${id}.json";`),
    "",
    "export const SCENARIOS = {",
    ...ids.map((id, i) => `  "${id}": s${i},`),
    "} as const;",
    "",
    "export type ScenarioId = keyof typeof SCENARIOS;",
    "",
  ];
  await writeFile(path.join(racine, "src", "scenarios.generated.ts"), lignes.join("\n"));
}

const fichiers = (await readdir(SRC)).filter((f) => f.endsWith(".src.json")).sort();
const ids = [];
for (const f of fichiers) ids.push(await buildScenario(path.join(SRC, f)));
await buildInvestigators();
await buildCardsIndex();
await buildPlayerCards();
await buildRegistre(ids);
process.stdout.write("Build terminé.\n");
