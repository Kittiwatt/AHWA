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
  "+1": "+1", "0": "0", "-1": "−1", "-2": "−2", "-3": "−3", "-4": "−4", "-5": "−5", "-6": "−6", "-7": "−7", "-8": "−8",
  skull: "Crâne", cultist: "Cultiste", tablet: "Tablette", elder_thing: "Ancien", auto_fail: "Échec auto",
  elder_sign: "Signe des anciens", bless: "Bénédiction", curse: "Malédiction", frost: "Givre", blood: "Sang",
};

/** URL de l'image à afficher pour une carte selon sa face et son côté. */
export function urlImage(carte, def) {
  if (carte.kind === "proxy" && carte.code === "empty:space") return "/img/dos-joueur.svg"; // espace vide (Before the Black Throne)
  if (def?.custom) return carte.faceUp && def.image ? def.image : "/img/dos-joueur.svg";   // enquêteur personnalisé : son image, dos joueur
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
  if (carte.kind === "key") return { kind: "key", name: nomCle(carte), liee: false };
  if (carte.kind === "proxy" && carte.code === "empty:space") return { kind: "proxy", name: "Espace vide", liee: false };
  if (versoVisible) return { kind: def.backKind ?? carte.kind, name: def.backName ?? def?.name, health: def.backHealth, sanity: undefined, healthPerInvestigator: def.backHealthPerInvestigator, liee: true };
  // Verso montré (lieu non révélé, agenda retourné…) : son propre nom s'il en a un (« Decrepit Door »), sans dévoiler le recto.
  const versoMontre = def?.backName && (carte.faceUp ? carte.side === "b" : !carte.storyBack);
  return { kind: carte.kind, name: versoMontre ? def.backName : def?.name, health: def?.health, sanity: def?.sanity, healthPerInvestigator: def?.healthPerInvestigator, liee: false };
}

/** Page ArkhamDB de la face visible d'une carte (menu « Voir sur ArkhamDB »), ou null : rien pour les clés, pions,
 *  espaces vides et enquêteurs personnalisés ; un verso lié visible (acte dont le dos est un lieu, Nathan Wick) renvoie
 *  à sa propre carte. Le dos ne mène jamais à la page (il révélerait le recto). */
export function urlArkhamDB(carte, def) {
  if (!carte || carte.kind === "key" || carte.kind === "mini" || carte.kind === "proxy" || def?.custom) return null;
  const code = def?.backCode && carte.faceUp && carte.side === "b" ? def.backCode : carte.code;
  return /^[0-9a-z]+$/i.test(code) ? `https://arkhamdb.com/card/${code}` : null;
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

import { imageUses } from "./uses.js";

const JETONS = [
  ["clue", "/img/tokens/tok_indices.png", "indice"],
  ["doom", "/img/tokens/tok_doom.png", "doom"],
  ["damage", "/img/tokens/tok_degats.png", "dégât"],
  ["horror", "/img/tokens/tok_horreur.png", "horreur"],
  ["resource", "/img/tokens/tok_ressources.png", "ressource"],
  // Uses (munitions, charges, secrets…) : des jetons ressource posés sur la carte (Grimoire p. 24) — image des ressources, cerclée.
  ["uses", "/img/tokens/tok_ressources.png", "use"],
];

export function elJetons(tokens = {}, usesType = null, pastille = false) {
  const frag = document.createDocumentFragment();
  for (const [cle, img0, libelle0] of JETONS) {
    const n = tokens[cle] ?? 0;
    if (n <= 0) continue;
    // Uses : le pion du type de la carte (munitions, charges, secrets… ; images fournies), pas un jeton ressource.
    const [img, libelle] = cle === "uses" && usesType ? imageUses(usesType) : [img0, libelle0];
    const j = document.createElement("span");
    j.className = `jeton jeton-${cle}`;
    j.dataset.token = cle;
    j.title = cle === "uses" && usesType ? `${n} ${libelle}` : `${n} ${libelle}${n > 1 ? "s" : ""}`;
    j.style.backgroundImage = `url(${img})`;
    if (pastille) {
      // Cartes joueur : le nombre dans une pastille au coin du pion (le visuel reste lisible) et ± au survol.
      const nb = document.createElement("b"); nb.className = "n"; nb.textContent = String(n);
      const moins = document.createElement("button"); moins.type = "button"; moins.className = "pmj moins"; moins.title = `−1 ${libelle}`; moins.textContent = "−";
      const plus = document.createElement("button"); plus.type = "button"; plus.className = "pmj plus"; plus.title = `+1 ${libelle}`; plus.textContent = "+";
      j.append(moins, nb, plus);
    } else j.textContent = String(n);
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
  el.className = `carte kind-${carte.kind}${paysage ? " paysage" : ""}${carte.exhausted ? " epuisee" : ""}${carte.faceUp ? "" : " retournee"}${def?.custom ? " custom" : ""}${def?.player ? " joueur" : ""}`;
  // Enquêteur personnalisé sans image (ou image injoignable) : son nom sur un fond uni.
  if (def?.custom) {
    let etiquette = el.querySelector(".nom-custom");
    if (!etiquette) {
      etiquette = document.createElement("span");
      etiquette.className = "nom-custom";
      el.append(etiquette);
      el.firstChild.addEventListener("error", () => { el.dataset.imgErreur = "1"; el.classList.add("sans-image"); });
    }
    etiquette.textContent = def.name;
  } else el.querySelector(".nom-custom")?.remove();
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
  // Cartes joueur : la jauge d'utilisations (charges, munitions…) est une chip comme les dégâts et l'horreur,
  // mais inversée : clic = −1 (on dépense), « + » à gauche pour en ajouter (retour de test du 2026-09-09).
  const usesType = def?.player && def?.uses && enJeu && visible ? def.uses.type : null;
  if (usesType) jauges.push("uses");
  if (jauges.length) {
    const attendu = jauges.join(" ") + (usesType ? `:${usesType}` : "");
    if (!chips || chips.dataset.jauges !== attendu) {
      chips?.remove();
      chips = document.createElement("div");
      chips.className = "chips";
      chips.dataset.jauges = attendu;
      const lib = { damage: ["/img/tokens/tok_degats.png", "dégâts"], horror: ["/img/tokens/tok_horreur.png", "horreur"], uses: usesType ? imageUses(usesType) : ["/img/tokens/uses/uses.png", "usages"] };
      chips.innerHTML = jauges.map((t) => t === "uses"
        ? `<span class="chip chip-uses" data-token="uses" data-inverse="1" title="${lib.uses[1]} : clic −1"><button type="button" class="chip-plus" data-token="uses" data-delta="1" title="+1 ${lib.uses[1]}">+</button>` +
          `<img src="${lib.uses[0]}" alt="${lib.uses[1]}" draggable="false"><b class="chip-n"></b></span>`
        : `<span class="chip chip-${t}" data-token="${t}" title="${lib[t][1]} : clic +1"><button type="button" class="chip-moins" data-token="${t}" data-delta="-1" title="−1 ${lib[t][1]}">−</button>` +
          `<img src="${lib[t][0]}" alt="${lib[t][1]}" draggable="false"><b class="chip-n"></b></span>`).join("");
      el.append(chips);
    }
    for (const t of jauges) {
      const n = carte.tokens[t] ?? 0;
      const max = t === "damage" ? face.health : t === "horror" ? face.sanity : 0;
      chips.querySelector(`.chip-${t} .chip-n`).textContent = max ? `${n}/${max}${face.healthPerInvestigator && t === "damage" ? "*" : ""}` : String(n);
    }
  } else if (chips) chips.remove();
  const img = el.firstChild;
  const src = urlImage(carte, def);
  if (img.getAttribute("src") !== src) { delete el.dataset.imgErreur; img.src = src; }
  el.classList.toggle("sans-image", !!def?.custom && carte.faceUp && (!def.image || el.dataset.imgErreur === "1"));
  const nom = inv?.name ?? face.name ?? carte.code;
  img.alt = carte.faceUp || loupePermise(carte, def) ? nom : "carte face cachée";
  el.title = nom;

  el.dataset.loupe = loupePermise(carte, def) ? "1" : "";
  // Lieu inondé (TIC) : le jeton d'inondation, à deux faces, en haut à gauche — indépendant des autres pions.
  const inondation = carte.kind === "location" && INONDATION[carte.tokens.flood ?? 0];
  let jetonInondation = el.querySelector(".inondation");
  if (inondation) {
    if (!jetonInondation) { jetonInondation = document.createElement("img"); jetonInondation.className = "inondation"; jetonInondation.draggable = false; el.append(jetonInondation); }
    if (jetonInondation.getAttribute("src") !== inondation[0]) jetonInondation.src = inondation[0];
    jetonInondation.alt = inondation[1]; jetonInondation.title = `Lieu ${inondation[1]}`;
  } else jetonInondation?.remove();
  const jetons = el.querySelector(".jetons");
  const tokens = jauges.length ? { ...carte.tokens, ...Object.fromEntries(jauges.map((t) => [t, 0])) } : carte.tokens;
  // Les utilisations d'une carte joueur en jeu sont dans sa chip : pas de pion « uses » en plus.
  jetons.replaceChildren(elJetons(usesType ? { ...tokens, uses: 0 } : tokens, def?.uses?.type ?? null, Boolean(def?.player)));
  return el;
}

export const MINI = 44;

/** Jauges d'un enquêteur (ressources, indices, dégâts, horreur) hors carte : la même chip que sur les cartes
 *  (clic sur la chip = +1, bouton « − » au survol), pour que tout se manipule pareil (retour de test du 2026-09-09).
 *  `texte` est ce qui s'affiche (« 2/9 » pour les dégâts, « 5 » pour les ressources). */
export function chipJauge({ token, libelle, img, texte, peut, onDelta, unite = libelle.toLowerCase() }) {
  const chip = document.createElement("span");
  chip.className = `chip chip-${token} jauge-inv${peut ? "" : " inactive"}`;
  chip.dataset.token = token;
  chip.title = peut ? `${libelle} : clic +1` : libelle;
  const moins = document.createElement("button");
  moins.type = "button"; moins.className = "chip-moins"; moins.dataset.token = token; moins.dataset.delta = "-1";
  moins.title = `−1 ${unite}`; moins.textContent = "−"; moins.disabled = !peut;
  const image = document.createElement("img");
  image.src = img; image.alt = libelle; image.draggable = false;
  const n = document.createElement("b");
  n.className = "chip-n"; n.textContent = texte;
  chip.append(moins, image, n);
  if (peut) chip.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    onDelta(e.target.closest(".chip-moins") ? -1 : 1);
  });
  return chip;
}

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

const LIBELLES_CLES = {
  skull: "Crâne", cultist: "Cultiste", tablet: "Tablette", elder_thing: "Ancien",
  // Clés de couleur à deux faces (The Innsmouth Conspiracy) : face cachée, toutes ont le même dos.
  red: "rouge", blue: "bleue", green: "verte", yellow: "jaune", purple: "violette", black: "noire", white: "blanche",
};
export const COULEURS_CLES = ["red", "blue", "green", "yellow", "purple", "black", "white"];

/** Clé de couleur (retournable, TIC) plutôt qu'un jeton du chaos utilisé comme clé (TCU) ? */
export function cleDeCouleur(carte) {
  return carte.kind === "key" && COULEURS_CLES.includes(carte.code.replace(/^key:/, ""));
}

/** Nom d'une clé tel qu'on le voit : « Clé bleue », ou « Clé face cachée » (une clé de couleur non retournée garde son secret). */
export function nomCle(carte) {
  const jeton = carte.code.replace(/^key:/, "");
  if (cleDeCouleur(carte) && !carte.faceUp) return "Clé face cachée";
  return `Clé ${LIBELLES_CLES[jeton] ?? jeton}`;
}

/** Clé : petit jeton rond déplaçable comme un pion — jeton du chaos pris dans la collection (TCU, sans face cachée)
 *  ou clé de couleur à deux faces (TIC : dos commun tant qu'elle n'est pas retournée). */
export function majCle(el, carte) {
  const jeton = carte.code.replace(/^key:/, "");
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
    const img = document.createElement("img");
    img.draggable = false;
    el.append(img);
  }
  const couleur = cleDeCouleur(carte);
  el.className = `mini cle${couleur ? " couleur" : ""}${couleur && !carte.faceUp ? " cachee" : ""}`;
  const src = couleur ? `/img/keys/${carte.faceUp ? jeton : "back"}.svg` : `/img/chaos/${jeton}.svg`;
  if (el.firstChild.getAttribute("src") !== src) el.firstChild.src = src;
  const nom = nomCle(carte);
  el.firstChild.alt = nom;
  el.title = couleur && !carte.faceUp
    ? "Clé face cachée — glissez-la sur un lieu, un ennemi ou un enquêteur ; posée sur un siège, elle se retourne (clic droit : retourner)"
    : `${nom} — glissez-la sur un lieu, un ennemi ou un enquêteur`;
  return el;
}

/** Niveaux d'inondation d'un lieu (TIC) : image du jeton à deux faces et libellé. */
export const INONDATION = [null, ["/img/tokens/flood_partial.svg", "partiellement inondé"], ["/img/tokens/flood_full.svg", "totalement inondé"]];

export function majMini(el, carte, ctx) {
  const inv = ctx.investigateurs.get(carte.code);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.addEventListener("error", () => { el.dataset.imgErreur = "1"; el.classList.add("sans-image"); });
    el.append(img, document.createElement("span"));
  }
  const faction = FACTIONS[inv?.faction] ?? FACTIONS.neutral;
  el.className = `mini${inv?.custom ? " custom" : ""}`;
  el.style.setProperty("--faction", faction.couleur);
  // Enquêteur personnalisé : son image (entière, recadrée en rond) ou ses initiales.
  const src = inv?.custom ? (inv.image ?? "") : `${CDN}${carte.code}.webp`;
  if (el.firstChild.getAttribute("src") !== src) { delete el.dataset.imgErreur; if (src) el.firstChild.src = src; else el.firstChild.removeAttribute("src"); }
  el.classList.toggle("sans-image", !src || el.dataset.imgErreur === "1");
  el.lastChild.textContent = initiales(inv?.name ?? "?");
  el.title = inv ? `${inv.name} — siège ${carte.ownerSeat + 1}` : carte.code;
  return el;
}


// ---- Icônes de compétence des cartes engagées (Commit) ----------------------------------------

export const COMPETENCES = [["willpower", "Volonté"], ["intellect", "Intellect"], ["combat", "Combat"], ["agility", "Agilité"], ["wild", "Joker"]];

/** Somme des icônes de compétence d'un ensemble de cartes (définitions joueur : def.skills). */
export function totauxCompetences(cartes, defs) {
  const t = { willpower: 0, intellect: 0, combat: 0, agility: 0, wild: 0 };
  for (const c of cartes) {
    const sk = defs.get(c.code)?.skills;
    if (!sk || !c.faceUp) continue;
    for (const k of Object.keys(t)) t[k] += sk[k] ?? 0;
  }
  return t;
}

/** Colonne « icône + total » des compétences présentes (aucune → null). */
export function elTotauxCompetences(totaux) {
  const lignes = COMPETENCES.filter(([k]) => totaux[k] > 0);
  if (!lignes.length) return null;
  const col = document.createElement("div");
  col.className = "totaux-competences";
  col.title = "Icônes de compétence engagées au test";
  for (const [k, lib] of lignes) {
    const l = document.createElement("span");
    l.className = `total-competence ${k}`;
    const img = document.createElement("img"); img.src = `/img/skills/${k}.svg`; img.alt = lib; img.title = lib;
    const n = document.createElement("strong"); n.textContent = String(totaux[k]);
    l.append(img, n);
    col.append(l);
  }
  return col;
}
