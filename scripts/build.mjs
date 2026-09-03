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
  if (kind === "agenda") out.doom = c.doom ?? null;
  if (kind === "agenda" || kind === "act") out.stage = c.stage ?? null;
  if (c.victory) out.victory = c.victory;
  return out;
}

async function buildScenario(fichierSrc) {
  const src = JSON.parse(await readFile(fichierSrc, "utf8"));
  const cartesPack = await json(`${ARKHAMDB}/cards/${src.pack}.json?encounter=1`, `${src.pack}.json`);
  const sets = new Set(src.encounterSets);
  const cards = cartesPack
    .filter((c) => sets.has(c.encounter_code))
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => carte(c, src));
  const encounterSetNames = {};
  for (const c of cartesPack) if (sets.has(c.encounter_code)) encounterSetNames[c.encounter_code] = c.encounter_name;

  // Contrôles de cohérence entre la source et ArkhamDB.
  const codes = new Set(cards.map((c) => c.code));
  const cites = [
    src.scenarioCard, src.startLocation, ...src.agendaDeck, ...src.actDeck,
    ...src.layout.map((l) => l.code),
    ...src.setup.flatMap((s) => [s.code, ...(s.codes ?? [])]).filter(Boolean),
  ];
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
await buildRegistre(ids);
process.stdout.write("Build terminé.\n");
