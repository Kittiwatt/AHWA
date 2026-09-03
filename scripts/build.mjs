#!/usr/bin/env node
// Build des données de jeu (à lancer avant un commit qui touche data/scenarios/*.src.json) :
//   node scripts/build.mjs
//
// 1. Pour chaque data/scenarios/<id>.src.json (déclaratif, écrit à la main), interroge ArkhamDB
//    (cache dans data/cache/) et écrit public/scenarios/<id>.json : source + liste des cartes
//    des sets de rencontre (codes, quantités, valeurs d'indices, seuils de doom), sans texte de carte.
// 2. Écrit public/data/investigators.json : index compact des investigateurs (lobby).
// 3. Écrit src/scenarios.generated.ts : registre des scénarios importé par le Worker.
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
const ARKHAMDB = "https://arkhamdb.com/api/public";

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

// Correspondance type ArkhamDB → kind du modèle d'état (cahier des charges §3.2).
const KIND = {
  location: "location", enemy: "enemy", treachery: "treachery", asset: "asset", story: "story",
  agenda: "agenda", act: "act", scenario: "scenario", investigator: "investigator", key: "proxy",
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
    // clues_fixed absent/false = valeur « par enquêteur » ; true = valeur fixe.
    out.clue = { value: c.clues ?? 0, perInvestigator: !c.clues_fixed };
  }
  // Verso = lieu (ex. acte dont le dos est un lieu) : ses indices, posés quand l'acte avance.
  if (c.linked_card?.type_code === "location") {
    out.backClue = { value: c.linked_card.clues ?? 0, perInvestigator: !c.linked_card.clues_fixed };
  }
  // Carte liée (ex. agenda dont le verso est un ennemi) : le verso est une autre carte ArkhamDB.
  if (c.linked_card) {
    out.back = "b";
    out.backCode = c.linked_card.code;
    out.backKind = KIND[c.linked_card.type_code] ?? "story";
    out.backName = c.linked_card.name;
    if (c.linked_card.health !== undefined && c.linked_card.health !== null) out.backHealth = c.linked_card.health;
    if (c.linked_card.health_per_investigator) out.backHealthPerInvestigator = true;
    if (c.linked_card.victory) out.backVictory = c.linked_card.victory;
  }
  if (kind === "enemy" || kind === "asset") {
    if (c.health !== undefined && c.health !== null) out.health = c.health;
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
  // Un pack ArkhamDB (`pack`) ou plusieurs (`packs`, ex. TCU + sets du Core).
  const packs = src.packs ?? [src.pack];
  const cartesPack = (await Promise.all(packs.map((p) => json(`${ARKHAMDB}/cards/${p}.json?encounter=1`, `${p}.json`)))).flat();
  const sets = new Set(src.encounterSets);
  const extra = new Set(src.extraCards ?? []);
  // Cartes dont ArkhamDB ne connaît que le verso (ex. 05085b « Josef's Plan », verso de l'ennemi 05085 Josef
  // Meiger absent de l'API) : le recto est synthétisé depuis `linked_card`, le verso n'est pas une carte à part.
  const codesPack = new Set(cartesPack.map((c) => c.code));
  const versosSeuls = cartesPack.filter((c) => c.linked_card && c.code === `${c.linked_card.code}b` && !codesPack.has(c.linked_card.code));
  const synthetises = versosSeuls.map((c) => ({ ...c.linked_card, quantity: c.linked_card.quantity ?? 1, double_sided: true, linked_card: null, _verso: c }));
  const exclus = new Set(versosSeuls.map((c) => c.code));
  const cards = [...cartesPack.filter((c) => !exclus.has(c.code)), ...synthetises]
    .filter((c) => sets.has(c.encounter_code) || extra.has(c.code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => carte(c, src));
  for (const c of synthetises) if (sets.has(c.encounter_code)) process.stdout.write(`  ${src.id} : ${c.code} ${c.name} synthétisé depuis le verso ${c._verso.code}\n`);
  for (const code of extra) if (!cards.some((c) => c.code === code)) throw new Error(`${src.id} : carte hors set ${code} introuvable dans le pack`);
  const encounterSetNames = {};
  for (const c of cartesPack) if (sets.has(c.encounter_code)) encounterSetNames[c.encounter_code] = c.encounter_name;

  // Contrôles de cohérence entre la source et ArkhamDB.
  const codes = new Set(cards.map((c) => c.code));
  const citesDe = (steps) => steps.flatMap((s) => [s.code, ...(s.codes ?? []), ...(s.op === "pickRandomSet" ? [] : (s.from ?? [])), s.at,
    ...(s.cases ? Object.values(s.cases).flatMap(citesDe) : [])]).filter((c) => c && !String(c).startsWith("slot:"));
  for (const s of src.setup.flatMap(function aplat(x) { return [x, ...(x.cases ? Object.values(x.cases).flat().flatMap(aplat) : [])]; })) {
    if (s.op === "pickRandomSet") for (const set of s.from) if (!src.encounterSets.includes(set)) throw new Error(`${src.id} : set ${set} absent de encounterSets`);
    if (s.op === "aside" || s.op === "toPile") for (const set of [...(s.sets ?? []), ...(s.set ? [s.set] : [])]) if (!src.encounterSets.includes(set)) throw new Error(`${src.id} : set ${set} absent de encounterSets`);
    if (s.op === "dealToSeats" && (!Array.isArray(s.rows) || !s.rows.length)) throw new Error(`${src.id} : dealToSeats sans rows`);
  }
  for (const code of Object.keys(src.backPlacement ?? {})) if (!cartesPack.some((c) => c.code === code && c.linked_card)) throw new Error(`${src.id} : backPlacement ${code} n'est pas une carte liée`);
  for (const p of src.swaps ?? []) {
    if (!Array.isArray(p.pair) || p.pair.length !== 2 || !Array.isArray(p.labels) || p.labels.length !== 2) throw new Error(`${src.id} : swaps mal formé`);
    for (const code of p.pair) if (!codes.has(code)) throw new Error(`${src.id} : swaps ${code} absent des sets de rencontre`);
  }
  for (const q of src.questions ?? []) {
    if (q.type === "number" ? !(Number.isInteger(q.min) && Number.isInteger(q.max)) : !(Array.isArray(q.options) && q.options.length)) throw new Error(`${src.id} : question ${q.id} mal formée`);
  }
  const cites = [src.scenarioCard, src.startLocation, ...src.agendaDeck, ...src.actDeck, ...(src.layout ?? []).map((l) => l.code), ...citesDe(src.setup)].filter(Boolean);
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

async function buildInvestigators() {
  const cartes = await json(`${ARKHAMDB}/cards/?encounter=0`, "player.json");
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
  const cartes = await json(`${ARKHAMDB}/cards/?encounter=1`, "all_encounter.json");
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
await buildRegistre(ids);
process.stdout.write("Build terminé.\n");
