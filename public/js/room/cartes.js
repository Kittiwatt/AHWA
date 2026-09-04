// Cartes : URLs d'images (cdn.arkham.build), éléments DOM des cartes, pions et jetons.
// Aucun texte de carte : seules les images (et les noms, issus de l'index ArkhamDB) sont utilisés.

export const CDN = "https://cdn.arkham.build/optimized/";
export const CARTE_L = 126;   // unités de tapis (référence 1600 × 1000)
export const CARTE_H = 178;

export const FACTIONS = {
  guardian: { nom: "Gardien", couleur: "#3b6fb6" },
  seeker:   { nom: "Chercheur", couleur: "#d5892b" },
  rogue:    { nom: "Truand", couleur: "#3f8f5a" },
  mystic:   { nom: "Mystique", couleur: "#7b4fa6" },
  survivor: { nom: "Survivant", couleur: "#b8433a" },
  neutral:  { nom: "Neutre", couleur: "#7f8c88" },
};

export const JETONS_CHAOS = {
  "+1": "+1", "0": "0", "-1": "−1", "-2": "−2", "-3": "−3", "-4": "−4", "-5": "−5", "-6": "−6", "-8": "−8",
  skull: "Crâne", cultist: "Cultiste", tablet: "Tablette", elder_thing: "Ancien", auto_fail: "Échec auto",
  elder_sign: "Signe des anciens", bless: "Bénédiction", curse: "Malédiction", frost: "Givre",
};

/** URL de l'image à afficher pour une carte selon sa face et son côté. */
export function urlImage(carte, def) {
  const dos = def?.back ?? "b";
  const verso = def?.backCode ? `${CDN}${def.backCode}.webp` : `${CDN}${carte.code}b.webp`;
  if (carte.faceUp) return carte.side === "b" ? verso : `${CDN}${carte.code}.webp`;
  if (carte.kind === "investigator") return `${CDN}${carte.code}b.webp`;
  if (dos === "b" && !carte.storyBack) return verso;
  return dos === "player" ? "/img/dos-joueur.svg" : "/img/dos-rencontre.svg";
}

/** Face actuellement visible : la carte elle-même, ou la carte liée quand le verso en est une autre. */
export function faceVisible(carte, def) {
  const versoVisible = def?.backCode && (carte.faceUp ? carte.side === "b" : !carte.storyBack);
  if (versoVisible) return { kind: def.backKind ?? carte.kind, name: def.backName ?? def?.name, health: def.backHealth, sanity: undefined, healthPerInvestigator: def.backHealthPerInvestigator, liee: true };
  // Verso montré (lieu non révélé, agenda retourné…) : son propre nom s'il en a un (« Decrepit Door »), sans dévoiler le recto.
  const versoMontre = def?.backName && (carte.faceUp ? carte.side === "b" : !carte.storyBack);
  return { kind: carte.kind, name: versoMontre ? def.backName : def?.name, health: def?.health, sanity: def?.sanity, healthPerInvestigator: def?.healthPerInvestigator, liee: false };
}

/** La face actuellement visible peut-elle être agrandie ? (jamais le dos d'une carte histoire) */
export function loupePermise(carte, def) {
  if (carte.faceUp) return true;
  if (carte.storyBack) return false;
  return (def?.back ?? "b") === "b" || carte.kind === "investigator";
}

const TYPES_INDEX = { asset: "Soutien", event: "Événement", skill: "Compétence", key: "Clé", enemy: "Ennemi", enemy_location: "Lieu-ennemi", treachery: "Traîtrise",
  location: "Lieu", act: "Acte", agenda: "Agenda", story: "Histoire", scenario: "Scénario", investigator: "Investigateur" };
export const libelleType = (t) => TYPES_INDEX[t] ?? t;

export function estPaysage(carte) {
  return carte.kind === "agenda" || carte.kind === "act" || carte.kind === "investigator";
}

export function initiales(nom) {
  return nom.replace(/["“”]/g, "").split(/[\s-]+/).filter(Boolean).map((m) => m[0]).slice(0, 2).join("").toUpperCase();
}

const JETONS = [
  ["clue", "/img/tokens/tok_indices.png", "indice"],
  ["doom", "/img/tokens/tok_doom.png", "doom"],
  ["damage", "/img/tokens/tok_degats.png", "dégât"],
  ["horror", "/img/tokens/tok_horreur.png", "horreur"],
  ["resource", "/img/tokens/tok_ressources.png", "ressource"],
];

export function elJetons(tokens = {}) {
  const frag = document.createDocumentFragment();
  for (const [cle, img, libelle] of JETONS) {
    const n = tokens[cle] ?? 0;
    if (n <= 0) continue;
    const j = document.createElement("span");
    j.className = `jeton jeton-${cle}`;
    j.title = `${n} ${libelle}${n > 1 ? "s" : ""}`;
    j.style.backgroundImage = `url(${img})`;
    j.textContent = String(n);
    frag.append(j);
  }
  if ((tokens.generic ?? 0) > 0) {
    const j = document.createElement("span");
    j.className = "jeton jeton-generic";
    j.textContent = String(tokens.generic);
    frag.append(j);
  }
  return frag;
}

/** Crée (ou met à jour) l'élément DOM d'une carte. */
export function majCarte(el, carte, ctx) {
  const def = ctx.defs.get(carte.code);
  const inv = ctx.investigateurs.get(carte.code);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
    el.append(document.createElement("img"), Object.assign(document.createElement("div"), { className: "jetons" }));
    el.firstChild.draggable = false;
  }
  const face0 = faceVisible(carte, def);
  const paysage = face0.liee ? ["agenda", "act", "investigator"].includes(face0.kind) : estPaysage(carte);
  el.className = `carte kind-${carte.kind}${paysage ? " paysage" : ""}${carte.exhausted ? " epuisee" : ""}${carte.faceUp ? "" : " retournee"}`;
  // Ennemis : compteurs de dégâts et d'horreur toujours visibles (clic = +1, − au survol, menu pour le reste).
  let chips = el.querySelector(".chips");
  const enJeu = "zone" in carte.loc;
  const face = faceVisible(carte, def);
  // Ennemis : dégâts seulement (pas de santé mentale) ; soutiens du scénario : selon leurs jauges
  // (vie → dégâts, santé mentale → horreur). Une carte liée montrant son verso ennemi compte comme ennemi.
  const visible = carte.faceUp || face.liee;
  const jauges = !visible || !enJeu ? []
    : face.kind === "enemy" ? ["damage"]
    : face.kind === "asset" ? [face.health !== undefined ? "damage" : null, face.sanity !== undefined ? "horror" : null].filter(Boolean)
    : [];
  if (jauges.length) {
    const attendu = jauges.join(" ");
    if (!chips || chips.dataset.jauges !== attendu) {
      chips?.remove();
      chips = document.createElement("div");
      chips.className = "chips";
      chips.dataset.jauges = attendu;
      const lib = { damage: ["/img/tokens/tok_degats.png", "dégâts"], horror: ["/img/tokens/tok_horreur.png", "horreur"] };
      chips.innerHTML = jauges.map((t) =>
        `<span class="chip chip-${t}" data-token="${t}" title="${lib[t][1]} : clic +1"><button type="button" class="chip-moins" data-token="${t}" data-delta="-1" title="−1 ${lib[t][1]}">−</button>` +
        `<img src="${lib[t][0]}" alt="${lib[t][1]}" draggable="false"><b class="chip-n"></b></span>`).join("");
      el.append(chips);
    }
    for (const t of jauges) {
      const n = carte.tokens[t] ?? 0;
      const max = t === "damage" ? face.health : face.sanity;
      chips.querySelector(`.chip-${t} .chip-n`).textContent = max ? `${n}/${max}${face.healthPerInvestigator && t === "damage" ? "*" : ""}` : String(n);
    }
  } else if (chips) chips.remove();
  const img = el.firstChild;
  const src = urlImage(carte, def);
  if (img.getAttribute("src") !== src) img.src = src;
  const nom = inv?.name ?? face.name ?? carte.code;
  img.alt = carte.faceUp || loupePermise(carte, def) ? nom : "carte face cachée";
  el.title = nom;
  el.dataset.loupe = loupePermise(carte, def) ? "1" : "";
  const jetons = el.querySelector(".jetons");
  const tokens = jauges.length ? { ...carte.tokens, ...Object.fromEntries(jauges.map((t) => [t, 0])) } : carte.tokens;
  jetons.replaceChildren(elJetons(tokens));
  return el;
}

export const MINI = 44;

/** Couleurs des chemins tracés entre lieux (une par chemin, dans l'ordre). */
export const COULEURS_CHEMINS = ["#e0c07a", "#5aa9e6", "#7bd389", "#e07a7a", "#c98ce0", "#f0a35e", "#6ee0d6", "#e8e87a", "#b0b0ff", "#ff9ecb"];

/** Image d'un jeton du chaos (SVG générés par scripts/build_chaos_tokens.py). */
export function imgJetonChaos(t, taille = 28) {
  const img = document.createElement("img");
  img.src = `/img/chaos/${t.replace(/[+]/g, "p").replace(/-/g, "m")}.svg`;
  img.alt = JETONS_CHAOS[t] ?? t;
  img.title = JETONS_CHAOS[t] ?? t;
  img.width = taille; img.height = taille;
  img.className = "jeton-chaos-img";
  img.draggable = false;
  return img;
}

/** Pion d'enquêteur : portrait recadré dans un disque cerclé de la couleur de classe ; initiales si l'image manque. */
export function majMini(el, carte, ctx) {
  const inv = ctx.investigateurs.get(carte.code);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.addEventListener("error", () => el.classList.add("sans-image"));
    el.append(img, document.createElement("span"));
  }
  const faction = FACTIONS[inv?.faction] ?? FACTIONS.neutral;
  el.className = "mini";
  el.style.setProperty("--faction", faction.couleur);
  const src = `${CDN}${carte.code}.webp`;
  if (el.firstChild.getAttribute("src") !== src) el.firstChild.src = src;
  el.lastChild.textContent = initiales(inv?.name ?? "?");
  el.title = inv ? `${inv.name} — siège ${carte.ownerSeat + 1}` : carte.code;
  return el;
}
