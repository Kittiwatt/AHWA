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
  if (carte.faceUp) return `${CDN}${carte.code}${carte.side === "b" ? "b" : ""}.webp`;
  if (carte.kind === "investigator") return `${CDN}${carte.code}b.webp`;
  if (dos === "b" && !carte.storyBack) return `${CDN}${carte.code}b.webp`;
  return "/img/dos-rencontre.svg";
}

/** La face actuellement visible peut-elle être agrandie ? (jamais le dos d'une carte histoire) */
export function loupePermise(carte, def) {
  if (carte.faceUp) return true;
  if (carte.storyBack) return false;
  return (def?.back ?? "b") === "b" || carte.kind === "investigator";
}

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
  el.className = `carte kind-${carte.kind}${estPaysage(carte) ? " paysage" : ""}${carte.exhausted ? " epuisee" : ""}${carte.faceUp ? "" : " retournee"}`;
  const img = el.firstChild;
  const src = urlImage(carte, def);
  if (img.getAttribute("src") !== src) img.src = src;
  const nom = inv?.name ?? def?.name ?? carte.code;
  img.alt = carte.faceUp || loupePermise(carte, def) ? nom : "carte face cachée";
  el.title = nom;
  el.dataset.loupe = loupePermise(carte, def) ? "1" : "";
  const jetons = el.lastChild;
  jetons.replaceChildren(elJetons(carte.tokens));
  return el;
}

/** Pion d'enquêteur : disque aux couleurs de la classe, initiales du nom. */
export function majMini(el, carte, ctx) {
  const inv = ctx.investigateurs.get(carte.code);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
  }
  const faction = FACTIONS[inv?.faction] ?? FACTIONS.neutral;
  el.className = "mini";
  el.style.setProperty("--faction", faction.couleur);
  el.textContent = initiales(inv?.name ?? "?");
  el.title = inv ? `${inv.name} — siège ${carte.ownerSeat + 1}` : carte.code;
  return el;
}
