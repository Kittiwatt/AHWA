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

/** Jetons posés sur une carte : image, libellé au singulier et au pluriel. `generic` est un disque doré sans image. */
const JETONS = {
  clue: ["/img/tokens/tok_indices.png", "indice", "indices"],
  doom: ["/img/tokens/tok_doom.png", "doom", "doom"],
  damage: ["/img/tokens/tok_degats.png", "dégât", "dégâts"],
  horror: ["/img/tokens/tok_horreur.png", "horreur", "horreur"],
  resource: ["/img/tokens/tok_ressources.png", "ressource", "ressources"],
  // Uses (munitions, charges, secrets…) : le pion du type de la carte (images fournies), à défaut le pion générique.
  uses: ["/img/tokens/uses/uses.png", "usage", "usages"],
  generic: [null, "jeton", "jetons"],
};
/** Ordre d'empilement (du haut vers le bas) : les pions posés d'abord, les jauges toujours visibles en dernier — la pile
 *  est ancrée en bas à droite, les jauges gardent donc leur place quand un pion arrive au-dessus. */
const ORDRE_JETONS = ["clue", "doom", "resource", "generic", "damage", "horror", "uses"];

/** Une chip de jeton : `[−] icône nombre` — clic sur la chip = +1, le « − » se déploie à gauche au survol sans rien
 *  déplacer (la pile est ancrée à droite). `inverse` : clic = −1 (ou « prendre »), le « + » se déploie à gauche —
 *  pour ce que l'on dépense plus souvent que l'on n'ajoute (uses d'une carte joueur, indices d'un lieu). */
function elChip({ token, img, libelle, pluriel, texte, inverse = false, prendre = null, titre = null }) {
  const chip = document.createElement("span");
  chip.className = `chip chip-${token}`;
  chip.dataset.token = token;
  if (inverse) chip.dataset.inverse = "1";
  if (prendre) chip.dataset.prendre = prendre;
  chip.title = titre ?? `${pluriel} : clic ${inverse ? "−1" : "+1"}`;
  const bouton = document.createElement("button");
  bouton.type = "button"; bouton.className = inverse ? "chip-plus" : "chip-moins"; bouton.dataset.token = token; bouton.dataset.delta = inverse ? "1" : "-1";
  bouton.title = `${inverse ? "+1" : "−1"} ${libelle}`; bouton.textContent = inverse ? "+" : "−";
  const visuel = img ? Object.assign(document.createElement("img"), { src: img, alt: pluriel, draggable: false })
    : Object.assign(document.createElement("span"), { className: "chip-disque" });
  const n = document.createElement("b");
  n.className = "chip-n"; n.textContent = texte;
  chip.append(bouton, visuel, n);
  return chip;
}

/** Clic sur la chip d'une carte (tapis et board joueur) : bouton déployé = son delta ; sinon +1, ou −1 pour une chip
 *  inverse — et « prendre » pour les indices d'un lieu (1 indice passe du lieu à la réserve du joueur qui clique). */
export function clicChip(ctx, carte, chip, bouton) {
  if (!bouton && chip.dataset.prendre === "clue") { ctx.envoyer({ t: "takeClue", id: carte.id }); return; }
  ctx.envoyer({ t: "addToken", id: carte.id, token: chip.dataset.token, delta: bouton ? Number(bouton.dataset.delta) : chip.dataset.inverse ? -1 : 1 });
}

/** Crée (ou met à jour) l'élément DOM d'une carte. */
export function majCarte(el, carte, ctx) {
  const def = ctx.defs.get(carte.code);
  const inv = ctx.investigateurs.get(carte.code);
  if (!el) {
    el = document.createElement("div");
    el.dataset.id = carte.id;
    el.append(document.createElement("img"));
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
  // Jetons et jauges de la carte : tous des chips empilées en bas à droite (uniformisé le 2026-09-10 à la demande de
  // l'utilisateur — plus de pions ronds). Jauges toujours visibles en jeu : dégâts des ennemis (pas d'horreur), dégâts /
  // horreur des soutiens qui en ont (vie → dégâts, santé mentale → horreur ; une carte liée montrant son verso ennemi
  // compte comme ennemi), uses des cartes joueur (chip inverse : clic = −1, « + » au survol — retour du 2026-09-09).
  // Les autres jetons (indices, doom, ressources, générique…) n'apparaissent que posés.
  let chips = el.querySelector(".chips");
  const enJeu = "zone" in carte.loc;
  const face = faceVisible(carte, def);
  const visible = carte.faceUp || face.liee;
  const jauges = !visible || !enJeu ? []
    : face.kind === "enemy" ? ["damage"]
    : face.kind === "asset" ? [face.health !== undefined ? "damage" : null, face.sanity !== undefined ? "horror" : null].filter(Boolean)
    : [];
  const usesType = def?.player && def?.uses && enJeu && visible ? def.uses.type : null;
  if (usesType) jauges.push("uses");
  const poses = ORDRE_JETONS.filter((t) => !jauges.includes(t) && (carte.tokens[t] ?? 0) > 0);
  const liste = [...poses, ...jauges];
  // Indices d'un lieu : ce qu'on fait le plus souvent, c'est en prendre un (clic = 1 indice passe du lieu à sa réserve,
  // l'ancien double-clic) ; le « + » qui se déploie en ajoute un.
  const inverse = (t) => t === "uses" || (t === "clue" && carte.kind === "location");
  if (liste.length) {
    const attendu = liste.map((t) => t + (inverse(t) ? "!" : "")).join(" ") + (usesType ? `:${usesType}` : "") + (def?.uses?.type ? `/${def.uses.type}` : "");
    if (!chips || chips.dataset.jauges !== attendu) {
      chips?.remove();
      chips = document.createElement("div");
      chips.className = "chips";
      chips.dataset.jauges = attendu;
      for (const t of liste) {
        const [img0, libelle, pluriel] = JETONS[t];
        const [img, lib] = t === "uses" && (usesType ?? def?.uses?.type) ? imageUses(usesType ?? def.uses.type) : [img0, null];
        const prendre = t === "clue" && carte.kind === "location" ? "clue" : null;
        chips.append(elChip({ token: t, img, libelle: lib ?? libelle, pluriel: lib ?? pluriel, texte: "", inverse: inverse(t), prendre,
          titre: prendre ? "Indices du lieu : clic = en prendre un (dans votre réserve), « + » au survol = en poser un" : null }));
      }
      el.append(chips);
    }
    for (const t of liste) {
      const n = carte.tokens[t] ?? 0;
      const max = jauges.includes(t) ? (t === "damage" ? face.health : t === "horror" ? face.sanity : 0) : 0;
      chips.querySelector(`.chip-${t} .chip-n`).textContent = max ? `${n}/${max}${face.healthPerInvestigator && t === "damage" ? "*" : ""}` : String(n);
    }
  } else if (chips) chips.remove();
  // Jetons du chaos scellés sur la carte (COB III, codex des invités) : pastilles en haut à droite,
  // libération par le menu de la carte.
  let scelles = el.querySelector(".scelles");
  const attenduScelles = (carte.sealed ?? []).join(",");
  if (attenduScelles) {
    if (!scelles || scelles.dataset.jetons !== attenduScelles) {
      scelles?.remove();
      scelles = document.createElement("div");
      scelles.className = "scelles";
      scelles.dataset.jetons = attenduScelles;
      scelles.innerHTML = carte.sealed.map((t) => `<img src="/img/chaos/${t}.svg" alt="${JETONS_CHAOS[t] ?? t}" title="Jeton ${JETONS_CHAOS[t] ?? t} scellé — menu de la carte pour le libérer" draggable="false">`).join("");
      el.append(scelles);
    }
  } else if (scelles) scelles.remove();
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
  return el;
}

export const MINI = 44;

/** Jauges d'un enquêteur (ressources, indices, dégâts, horreur) hors carte : la même chip que sur les cartes
 *  (clic sur la chip = +1, bouton « − » au survol), pour que tout se manipule pareil (retour de test du 2026-09-09).
 *  `texte` est ce qui s'affiche (« 2/9 » pour les dégâts, « 5 » pour les ressources). */
export function chipJauge({ token, libelle, img, texte, peut, onDelta, unite = libelle.toLowerCase() }) {
  const chip = elChip({ token, img, libelle: unite, pluriel: libelle, texte, titre: peut ? `${libelle} : clic +1` : libelle });
  chip.classList.add("jauge-inv");
  if (!peut) chip.classList.add("inactive");
  chip.querySelector(".chip-moins").disabled = !peut;
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
