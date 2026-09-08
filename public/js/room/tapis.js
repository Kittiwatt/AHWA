// Tapis : rendu de l'état de jeu (zones fixes + zone des lieux zoomable) et commandes.
// Règle « rien n'est jamais bloqué » : tous les boutons restent actifs pour un joueur assis ;
// les états (tour en cours, a joué, seuil atteint) sont des indications visuelles.

import { el, pluriel } from "./dom.js";
import { majCarte, majMini, majCle, urlImage, loupePermise, CARTE_L, CARTE_H, MINI, JETONS_CHAOS, FACTIONS, imgJetonChaos, COULEURS_CHEMINS, totauxCompetences, elTotauxCompetences, chipJauge } from "./cartes.js";
import { nomSiege } from "./lobby.js";
import { ouvrirDialogueCartes, ouvrirAjustementSac, ouvrirDepenseIndices, ouvrirGenerateur, ouvrirAccusation } from "./dialogues.js";

export const PHASES = {
  mythos: "Phase du mythe",
  investigation: "Phase des enquêteurs",
  enemy: "Phase des ennemis",
  upkeep: "Phase d'entretien",
  resolution: "Partie terminée",
};
const ORDRE_PHASES = ["mythos", "investigation", "enemy", "upkeep"];
// Flèche d'action (dessin original inspiré de l'icône du jeu).
const ICONE_ACTION = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5h9.5V3.5L21 12l-8.5 8.5v-5H3z" fill="currentColor"/></svg>';

const els = new Map();   // id de carte → élément DOM (réutilisé d'un rendu à l'autre)
let asideActif = false;  // zone « de côté » nette pendant qu'on y interagit
export function setAsideActif(v) { asideActif = v; document.querySelector("#aside .bande")?.classList.toggle("floue", !v); }
export const vue = { k: 1, tx: 0, ty: 0, ajustee: false };
let plateau = null, zoneBoard = null;

export function carteEl(carte, ctx) {
  const existant = els.get(carte.id);
  const e = carte.kind === "mini" ? majMini(existant, carte, ctx) : carte.kind === "key" ? majCle(existant, carte) : majCarte(existant, carte, ctx);
  // L'élément est réutilisé d'une zone à l'autre : hors du tapis, la position absolue posée par
  // rendrePlateau doit être effacée (sinon la carte est décalée hors de sa pile ou de sa zone).
  if (carte.loc.zone !== "board") { e.style.left = ""; e.style.top = ""; e.style.zIndex = ""; }
  els.set(carte.id, e);
  return e;
}

function nettoyer(ctx) {
  for (const id of [...els.keys()]) if (!ctx.etat.state.cards[id]) { els.get(id).remove(); els.delete(id); }
}

const assis = (ctx) => ctx.etat.moi.seat !== null;

export function rendreTapis(ctx) {
  const { state } = ctx.etat;
  // Cartes générées par l'outil : leurs définitions voyagent dans l'état.
  for (const [code, def] of Object.entries(state.extraDefs ?? {})) if (!ctx.defs.has(code)) ctx.defs.set(code, def);
  nettoyer(ctx);
  rendreBarre(ctx);
  rendrePlateau(ctx);
  rendreHistoire(ctx);
  rendrePioches(ctx);
  rendreChaos(ctx);
  rendreBande(document.querySelector("#aside .bande"), "aside", ctx, "Rien de côté.");
  document.querySelector("#aside .bande").classList.toggle("floue", !asideActif);
  rendreBande(document.querySelector("#victory .bande"), "victory", ctx, "Aucune carte en zone de victoire.");
  rendreSieges(ctx);
  rendreCommitVolant(ctx);
  rendreJournal(ctx);
  if (!vue.ajustee && state.phase !== "lobby") { ajusterVue(ctx); vue.ajustee = true; }
  // Un lieu qui entre en jeu hors du cadre (verso-lieu d'un acte posé par le serveur, lieu sorti d'une pile…)
  // recadre la vue ; un lieu posé dans le cadre ne la bouge pas.
  const lieux = Object.values(state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board");
  if (vue.lieuxVus) {
    const W = zoneBoard.clientWidth, H = zoneBoard.clientHeight;
    const horsCadre = (c) => c.loc.x * vue.k + vue.tx < 0 || c.loc.y * vue.k + vue.ty < 0
      || (c.loc.x + CARTE_L) * vue.k + vue.tx > W || (c.loc.y + CARTE_H) * vue.k + vue.ty > H;
    if (lieux.some((c) => !vue.lieuxVus.has(c.id) && horsCadre(c)) && !document.querySelector(".fantome")) ajusterVue(ctx);
  }
  vue.lieuxVus = new Set(lieux.map((c) => c.id));
}

export function oublierVue() { vue.ajustee = false; vue.lieuxVus = null; }

// ---- Barre de phase ---------------------------------------------------------------

function rendreBarre(ctx) {
  const { state, moi } = ctx.etat;
  const peut = assis(ctx);
  document.getElementById("manche").textContent = state.round ? `Manche ${state.round}` : "";
  const phases = document.getElementById("phases");
  phases.replaceChildren(...ORDRE_PHASES.map((p) => el("button", {
    type: "button", class: `phase${state.phase === p ? " courante" : ""}`, disabled: !peut,
    title: state.phase === p ? "Phase en cours" : `Aller directement à la ${PHASES[p].toLowerCase()} (sans automatisation)`,
    onclick: () => { if (state.phase !== p) ctx.envoyer({ t: "setPhase", phase: p }); },
  }, { mythos: "Mythe", investigation: "Enquêteurs", enemy: "Ennemis", upkeep: "Entretien" }[p])));
  if (state.phase === "resolution") phases.append(el("span", { class: "phase courante", text: PHASES.resolution }));

  const tour = document.getElementById("tour");
  if (state.phase === "investigation") {
    const restants = state.seats.filter((s) => s.investigatorCode && !state.turn.done.includes(s.index));
    tour.textContent = state.turn.seat === null
      ? (restants.length ? `Tour libre — ${pluriel(restants.length, "enquêteur")} n'${restants.length > 1 ? "ont" : "a"} pas encore joué.` : "Tout le monde a joué : phase suivante.")
      : `Tour de ${nomSiege(state.seats[state.turn.seat], ctx)}.`;
  } else tour.textContent = "";

  const gen = document.getElementById("generer-carte");
  gen.disabled = !peut;
  gen.onclick = () => ouvrirGenerateur(ctx);

  const suivante = document.getElementById("phase-suivante");
  suivante.disabled = !peut || state.phase === "resolution";
  const prochaine = ORDRE_PHASES[(ORDRE_PHASES.indexOf(state.phase) + 1) % 4];
  suivante.title = {
    mythos: "Manche suivante : +1 doom sur l'agenda, puis chaque enquêteur pioche une carte rencontre",
    investigation: "Phase des enquêteurs : tours libres",
    enemy: "Phase des ennemis : chasseurs, puis attaques",
    upkeep: "Entretien : redresse les cartes, remet les actions à 3",
  }[prochaine] ?? "";
  suivante.onclick = () => ctx.envoyer({ t: "nextPhase" });

  const cmd = document.getElementById("hote-commandes");
  cmd.replaceChildren();
  if (moi.isHost) {
    cmd.append(
      el("button", { class: "bouton secondaire", type: "button", onclick: () => {
        if (confirm("Réinitialiser la table ? Le tapis est vidé, les sièges et enquêteurs sont conservés.")) ctx.envoyer({ t: "reset" });
      } }, "Réinitialiser"),
      state.phase !== "resolution"
        ? el("button", { class: "bouton secondaire", type: "button", onclick: () => { if (confirm("Déclarer la partie terminée ?")) ctx.envoyer({ t: "close" }); } }, "Clôturer")
        : null,
      el("button", { class: "bouton secondaire danger", type: "button", onclick: () => {
        if (confirm("Supprimer définitivement cette table ?")) ctx.envoyer({ t: "deleteRoom" });
      } }, "Supprimer"),
    );
  } else if (!state.hostConnected && moi.seat !== null) {
    cmd.append(el("button", { class: "bouton secondaire", type: "button", onclick: () => ctx.envoyer({ t: "claimHost" }) }, "Reprendre le rôle d'hôte"));
  }
}

// ---- Zone des lieux (zoomable) ----------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";
let couche = null;   // calque SVG des chemins, sous les cartes

export function initPlateau() {
  plateau = document.getElementById("plateau");
  zoneBoard = document.getElementById("board");
  couche = document.createElementNS(SVG, "svg");
  couche.setAttribute("class", "chemins");
  couche.setAttribute("width", "1");
  couche.setAttribute("height", "1");
  plateau.append(couche);
  appliquerVue();

  zoneBoard.addEventListener("wheel", (e) => {
    if (e.target.closest(".table-outils, .loupe")) return;
    e.preventDefault();
    const r = zoneBoard.getBoundingClientRect();
    zoomer(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let glisse = null;
  zoneBoard.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".carte, .mini, .barriere, button, .table-outils, .loupe, details")) return;   // .barriere : la capture du pointeur avalerait le clic
    glisse = { x: e.clientX, y: e.clientY, tx: vue.tx, ty: vue.ty };
    zoneBoard.setPointerCapture(e.pointerId);
    zoneBoard.classList.add("glisse");
  });
  zoneBoard.addEventListener("pointermove", (e) => {
    if (!glisse) return;
    vue.tx = glisse.tx + (e.clientX - glisse.x);
    vue.ty = glisse.ty + (e.clientY - glisse.y);
    appliquerVue();
  });
  const fin = () => { glisse = null; zoneBoard.classList.remove("glisse"); };
  zoneBoard.addEventListener("pointerup", fin);
  zoneBoard.addEventListener("pointercancel", fin);

  document.getElementById("zoom-plus").addEventListener("click", () => zoomer(1.25, zoneBoard.clientWidth / 2, zoneBoard.clientHeight / 2));
  document.getElementById("zoom-moins").addEventListener("click", () => zoomer(1 / 1.25, zoneBoard.clientWidth / 2, zoneBoard.clientHeight / 2));
  document.getElementById("zoom-recentrer").addEventListener("click", () => document.dispatchEvent(new CustomEvent("ahwa:recentrer")));
}

function zoomer(facteur, px, py) {
  const k2 = Math.min(2.5, Math.max(0.25, vue.k * facteur));
  const f = k2 / vue.k;
  vue.tx = px - (px - vue.tx) * f;
  vue.ty = py - (py - vue.ty) * f;
  vue.k = k2;
  appliquerVue();
}

function appliquerVue() {
  if (plateau) plateau.style.transform = `translate(${vue.tx}px, ${vue.ty}px) scale(${vue.k})`;
}

/** Cadre la vue sur les cartes présentes dans la zone des lieux. */
export function ajusterVue(ctx) {
  const cartes = Object.values(ctx.etat.state.cards).filter((c) => c.loc.zone === "board");
  const W = zoneBoard.clientWidth, H = zoneBoard.clientHeight;
  if (!cartes.length || !W) { vue.k = Math.min(W / 1600, H / 1000) || 1; vue.tx = 0; vue.ty = 0; appliquerVue(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of cartes) {
    const petit = c.kind === "mini" || c.kind === "key";
    const w = petit ? MINI : CARTE_L, h = petit ? MINI : CARTE_H;
    x0 = Math.min(x0, c.loc.x); y0 = Math.min(y0, c.loc.y); x1 = Math.max(x1, c.loc.x + w); y1 = Math.max(y1, c.loc.y + h);
  }
  // L'encart pioche/défausse/sac occupe le bas gauche : on cadre au-dessus de lui.
  const basReserve = Math.min(170, H * 0.25);
  const marge = 120;
  const Hu = H - basReserve;
  const k = Math.min(1.4, Math.max(0.3, Math.min(W / (x1 - x0 + marge * 2), Hu / (y1 - y0 + marge * 2))));
  vue.k = k;
  vue.tx = (W - (x1 - x0) * k) / 2 - x0 * k;
  vue.ty = (Hu - (y1 - y0) * k) / 2 - y0 * k;
  appliquerVue();
}

export function centreLieu(c) {
  return { x: c.loc.x + CARTE_L / 2, y: c.loc.y + CARTE_H / 2 };
}

function rendreChemins(ctx) {
  const { state } = ctx.etat;
  const temp = couche.querySelector(".temp");
  couche.replaceChildren(...(state.links ?? []).flatMap((l) => {
    const a = state.cards[l.a], b = state.cards[l.b];
    if (!a || !b || a.loc.zone !== "board" || b.loc.zone !== "board") return [];
    const p = centreLieu(a), q = centreLieu(b);
    const ligne = document.createElementNS(SVG, "line");
    ligne.setAttribute("x1", p.x); ligne.setAttribute("y1", p.y);
    ligne.setAttribute("x2", q.x); ligne.setAttribute("y2", q.y);
    ligne.setAttribute("stroke", COULEURS_CHEMINS[l.color % COULEURS_CHEMINS.length]);
    return [ligne];
  }));
  if (temp) couche.append(temp);
}

/** Trait provisoire pendant un tracé (client seul) ; null pour l'effacer. */
export function cheminProvisoire(depuis, vers) {
  let t = couche.querySelector(".temp");
  if (!depuis) { t?.remove(); return; }
  if (!t) {
    t = document.createElementNS(SVG, "line");
    t.setAttribute("class", "temp");
    couche.append(t);
  }
  t.setAttribute("x1", depuis.x); t.setAttribute("y1", depuis.y);
  t.setAttribute("x2", vers.x); t.setAttribute("y2", vers.y);
}

/** Convertit une position écran en coordonnées du tapis. */
export function versTapis(clientX, clientY) {
  const r = zoneBoard.getBoundingClientRect();
  return { x: (clientX - r.left - vue.tx) / vue.k, y: (clientY - r.top - vue.ty) / vue.k };
}

function rendrePlateau(ctx) {
  const { state } = ctx.etat;
  rendreChemins(ctx);
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === "board").sort((a, b) => a.loc.z - b.loc.z);
  // Cartes enfouies (COB) : face cachée dans la bande qui dépasse sous un lieu → couche des lieux,
  // juste sous leur repaire (glissées dessous, seul le bas visible). Détection par position, comme au serveur.
  const lieuxPlateau = cartes.filter((c) => c.kind === "location");
  const enfouie = (c) => c.kind !== "location" && c.kind !== "mini" && !c.faceUp
    && lieuxPlateau.some((L) => Math.abs(c.loc.y - (L.loc.y + 42)) < 30 && c.loc.x >= L.loc.x - 12 && c.loc.x < L.loc.x + CARTE_L);
  const vus = new Set([couche]);
  for (const c of cartes) {
    const e = carteEl(c, ctx);
    e.style.left = `${c.loc.x}px`;
    e.style.top = `${c.loc.y}px`;
    // Les lieux forment la couche du bas : un pion ou une carte ne passe jamais dessous — sauf une carte enfouie.
    e.style.zIndex = String((c.kind === "location" || enfouie(c) ? 0 : 100000) + c.loc.z);
    if (e.parentElement !== plateau) plateau.append(e);
    vus.add(e);
  }
  // Barrières (In Too Deep) : un jeton ressource au milieu de l'arête entre deux lieux adjacents, avec le nombre ;
  // clic = −1 (une barrière franchie), « + » au survol — même geste que la jauge Uses.
  const barrieres = new Map((state.barriers ?? []).map((b) => [`${b.a}|${b.b}`, b]));
  for (const [cle, b] of barrieres) {
    const a = state.cards[b.a], c = state.cards[b.b];
    if (!a || !c || a.loc.zone !== "board" || c.loc.zone !== "board") continue;
    const p = centreLieu(a), q = centreLieu(c);
    let e = elsBarrieres.get(cle);
    if (!e) {
      e = el("span", { class: "chip chip-barriere barriere", "data-a": b.a, "data-b": b.b, title: "Barrière : clic = −1 (franchie), + au survol" },
        el("button", { class: "chip-moins", type: "button", title: "−1 barrière" }, "−"),
        el("img", { src: "/img/tokens/tok_ressources.png", alt: "barrière", draggable: false }),
        el("b", { class: "chip-n" }),
        el("button", { class: "chip-plus", type: "button", title: "+1 barrière" }, "+"));
      elsBarrieres.set(cle, e);
    }
    e.querySelector(".chip-n").textContent = String(b.n);
    e.style.left = `${(p.x + q.x) / 2 - 30}px`;
    e.style.top = `${(p.y + q.y) / 2 - 18}px`;
    e.style.zIndex = String(200000);
    if (e.parentElement !== plateau) plateau.append(e);
    vus.add(e);
  }
  for (const [cle, e] of elsBarrieres) if (!barrieres.has(cle)) { e.remove(); elsBarrieres.delete(cle); }
  for (const e of [...plateau.children]) if (!vus.has(e)) e.remove();
}
const elsBarrieres = new Map();

// ---- Colonne gauche : histoire ---------------------------------------------------

function rendreHistoire(ctx) {
  const { state } = ctx.etat;
  const peut = assis(ctx);
  const sect = document.getElementById("histoire");
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === "story");
  const scenario = cartes.find((c) => c.kind === "scenario");
  const agenda = state.agendaId ? state.cards[state.agendaId] : null;
  const acte = state.actId ? state.cards[state.actId] : null;
  const defAgenda = agenda ? ctx.defs.get(agenda.code) : null;
  const defActe = acte ? ctx.defs.get(acte.code) : null;
  const seuilActe = defActe?.clue ? (defActe.clue.perInvestigator ? defActe.clue.value * state.playerCount : defActe.clue.value) : null;
  const doomTotal = Object.values(state.cards).reduce((n, c) => n + (c.loc.zone ? c.tokens.doom ?? 0 : 0), 0);
  const indicesJoueurs = state.seats.reduce((n, s) => n + (s.counters.clues ?? 0), 0);
  const seuilDoom = defAgenda?.doom ?? null;

  // Une carte n'est rendue qu'à un seul endroit : ici seulement si elle est dans l'histoire.
  const emplacement = (c, quoi) => {
    if (!c) return el("p", { class: "vide", text: `Plus d'${quoi} : l'histoire est allée jusqu'au bout.` });
    if (c.loc.zone === "story") return carteEl(c, ctx);
    return el("div", { class: "carte paysage absente" },
      el("span", { text: `${quoi[0].toUpperCase() + quoi.slice(1)} ${c.loc.zone === "board" ? "sur le tapis" : "hors de l'histoire"}` }),
      peut ? el("button", { class: "lien-outil", type: "button", onclick: () => ctx.envoyer({ t: "moveCard", id: c.id, zone: "story", x: 0, y: 0 }) }, "Ramener ici") : null);
  };
  sect.dataset.drop = "story";
  sect.replaceChildren(
    el("h2", { text: "Agenda et acte" }),
    el("div", { class: "histoire-cartes" },
      el("div", { class: "bloc" }, emplacement(agenda, "agenda"),
        el("p", { class: `compte${seuilDoom && doomTotal >= seuilDoom ? " alerte" : ""}`, html: `Doom en jeu <strong>${doomTotal}</strong>${seuilDoom ? ` / ${seuilDoom}` : ""}` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut || (!agenda && !state.piles.agendaDeck.length), title: "L'agenda courant part de côté (hors jeu), tout le doom en jeu est retiré, l'agenda suivant est révélé",
            onclick: () => { if (confirm("Avancer l'agenda ? Tout le doom en jeu sera retiré.")) ctx.envoyer({ t: "advanceAgenda" }); } }, "Avancer l'agenda"),
          el("span", { class: "sous", text: `${state.piles.agendaDeck.length} à venir` }))),
      el("div", { class: "bloc" }, emplacement(acte, "acte"),
        el("p", { class: `compte${seuilActe && indicesJoueurs >= seuilActe ? " alerte" : ""}`, html: `Indices des enquêteurs <strong>${indicesJoueurs}</strong>${seuilActe ? ` / ${seuilActe}` : ""}` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ouvrirDepenseIndices(ctx, seuilActe) }, "Dépenser des indices"),
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut || (!acte && !state.piles.actDeck.length), title: "L'acte courant part de côté (hors jeu), l'acte suivant est révélé", onclick: () => ctx.envoyer({ t: "advanceAct" }) }, "Avancer l'acte"),
          el("span", { class: "sous", text: `${state.piles.actDeck.length} à venir` }))),
      scenario ? el("div", { class: "bloc scenario" }, scenario.loc.zone === "story" ? carteEl(scenario, ctx) : el("div", { class: "carte absente" }), el("p", { class: "sous", text: "Carte de scénario — clic droit : autre face. Retourner un agenda ou un acte (clic droit) pour lire son verso, puis « Hors jeu » : le suivant sort tout seul." })) : null,
      // Cartes de référence du scénario posées « à côté de la carte de scénario » (kind story dans la zone histoire, ex. Finding Agent Harper).
      ...cartes.filter((c) => c.kind === "story").map((c) => el("div", { class: "bloc reference" }, carteEl(c, ctx))),
      ctx.scenario.leads ? blocPistes(ctx, peut) : null,
      ctx.scenario.flood ? blocMaree(ctx, peut) : null,
    ),
    el("p", { class: "aide-depot", text: "Déposez ici un agenda ou un acte pour le ramener dans l'histoire." }),
  );
}

/** Pistes (The Vanishing of Elina Harper) : les six suspects et les six cachettes, rayés dès qu'ils sont vus dans la pile
 *  Leads ou entrés en jeu (ou à la main, clic) ; le bouton de l'accusation ouvre le choix suspect + cachette. */
function blocPistes(ctx, peut) {
  const { state } = ctx.etat;
  const L = ctx.scenario.leads;
  const rayes = new Set(state.leads?.eliminated ?? []);
  const enJeu = new Set(Object.values(state.cards).filter((c) => "zone" in c.loc && (c.loc.zone === "board" || c.loc.zone === "victory" || /^seat[0-3]$/.test(c.loc.zone))).map((c) => c.code));
  const nom = (code) => ctx.defs.get(code)?.name ?? code;
  const ligne = (code) => el("button", { type: "button", class: `piste${rayes.has(code) ? " rayee" : ""}${enJeu.has(code) ? " en-jeu" : ""}`, disabled: !peut,
    title: rayes.has(code) ? "Rayée — clic : rétablir" : "Clic : rayer à la main", onclick: () => ctx.envoyer({ t: "leadsToggle", code }) }, nom(code));
  const faite = state.leads?.accused;
  return el("div", { class: "bloc pistes" },
    el("h3", { text: "Pistes" }),
    el("div", { class: "listes-pistes" },
      el("div", {}, el("span", { class: "sous", text: "Suspects" }), ...L.suspects.map(ligne)),
      el("div", {}, el("span", { class: "sous", text: "Cachettes" }), ...L.hideouts.map(ligne))),
    faite
      ? el("p", { class: "sous", text: `Accusation faite : ${nom(faite.suspect)} / ${nom(faite.hideout)} — vérité : ${nom(state.leads.truth.suspect)} / ${nom(state.leads.truth.hideout)}.` })
      : el("button", { class: "bouton petit", type: "button", disabled: !peut, title: "Quand l'acte 1 le permet : choisir un suspect et une cachette, l'app applique l'interlude du guide", onclick: () => ouvrirAccusation(ctx) }, "Faire l'accusation"));
}

/** Marée (The Innsmouth Conspiracy) : la règle appliquée à chaque révélation de lieu (posée par les agendas, modifiable
 *  à la main) et les gestes de masse sur les lieux révélés — rien n'est bloqué, tout se corrige lieu par lieu (menu). */
function blocMaree(ctx, peut) {
  const { state } = ctx.etat;
  const regle = state.flood?.onReveal ?? 0;
  const inondes = Object.values(state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board" && c.tokens.flood).length;
  const bouton = (lib, titre, onclick, actif = false) => el("button", { class: `bouton secondaire petit${actif ? " actif" : ""}`, type: "button", disabled: !peut, title: titre, onclick }, lib);
  return el("div", { class: "bloc maree" },
    el("h3", { text: "Marée" }),
    el("p", { class: "sous", text: `À la révélation d'un lieu : ${["rien", "+1 niveau d'inondation", "totalement inondé"][regle]} — ${inondes} lieu${inondes > 1 ? "x" : ""} inondé${inondes > 1 ? "s" : ""}.` }),
    el("div", { class: "ligne-boutons regle-maree" },
      bouton("rien", "Un lieu révélé n'est pas inondé", () => ctx.envoyer({ t: "floodRule", onReveal: 0 }), regle === 0),
      bouton("+1", "Un lieu révélé monte d'un niveau d'inondation", () => ctx.envoyer({ t: "floodRule", onReveal: 1 }), regle === 1),
      bouton("plein", "Un lieu révélé est totalement inondé", () => ctx.envoyer({ t: "floodRule", onReveal: 2 }), regle === 2)),
    el("div", { class: "ligne-boutons" },
      bouton("+1 partout", "Tous les lieux révélés montent d'un niveau", () => ctx.envoyer({ t: "floodAll", mode: "increase" })),
      bouton("tout inonder", "Tous les lieux révélés totalement inondés", () => ctx.envoyer({ t: "floodAll", mode: "full" })),
      bouton("−1 partout", "Tous les lieux révélés baissent d'un niveau", () => ctx.envoyer({ t: "floodAll", mode: "decrease" })),
      bouton("assécher", "Retirer tous les jetons d'inondation", () => { if (confirm("Assécher tous les lieux révélés ?")) ctx.envoyer({ t: "floodAll", mode: "clear" }); })));
}

// ---- Outils de table : pioches, sac ------------------------------------------------

function rendrePioches(ctx) {
  const { state } = ctx.etat;
  const peut = assis(ctx);
  const sect = document.getElementById("pioches");
  const pioche = state.piles.encounter;
  const defausse = state.piles.encounterDiscard;
  const dessus = defausse.length ? state.cards[defausse[0]] : null;
  const premiere = pioche.length ? state.cards[pioche[0]] : null;
  sect.replaceChildren(
    el("div", { class: "pile", "data-drop": "pile:encounter", "data-outil": "pioche",
      title: premiere?.faceUp ? "Carte révélée : glissez-la où il faut. Clic droit : chercher, mélanger." : "Clic : piocher (retourne la première carte). Clic droit : chercher, mélanger." },
      el("div", { class: `dos-pile pioche-rencontre${pioche.length ? "" : " vide"}${premiere?.faceUp ? " revelee" : ""}` },
        premiere?.faceUp ? carteEl(premiere, ctx)
          : pioche.length ? el("button", { class: "dos-bouton", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "drawEncounter" }) }, el("img", { src: "/img/dos-rencontre.svg", alt: "pioche de rencontre" }))
          : el("button", { class: "dos-bouton vide", type: "button", disabled: !peut || !defausse.length, title: defausse.length ? "Pioche vide : clic pour remélanger la défausse et piocher" : "Pioche et défausse vides", onclick: () => ctx.envoyer({ t: "drawEncounter" }) }, el("span", { class: "sous", text: "vide" }))),
      el("span", { class: "badge", text: String(pioche.length) })),
    el("div", { class: "pile", "data-drop": "pile:encounterDiscard", "data-outil": "defausse", title: "Déposez ici pour défausser. Clic droit : consulter, remélanger dans la pioche." },
      el("div", { class: `dos-pile defausse-rencontre${dessus ? "" : " vide"}` }, dessus ? carteEl(dessus, ctx) : el("span", { class: "sous", text: "défausse" })),
      el("span", { class: "badge", text: String(defausse.length) })),
    // Piles déclarées par le scénario (ex. « Cultist deck ») : mêmes gestes que la pioche. Une seconde pioche de
    // rencontre peut avoir sa défausse (pile `isDiscard`), rendue comme la défausse principale.
    ...(ctx.scenario.piles ?? []).map((p) => {
      const ids = state.piles[p.id] ?? [];
      const haut = ids.length ? state.cards[ids[0]] : null;
      const L = ctx.scenario.leads;
      if (L && p.id === L.shown) {
        // Pistes révélées par le Parley : toutes visibles, « Prendre » sous chacune ; vide = rien d'affiché.
        if (!ids.length) return null;
        return el("div", { class: "pistes-revelees", title: "Pistes révélées : prenez-en une, le reste retournera dans Leads avec la première carte de la pioche" },
          ...ids.map((id) => el("div", { class: "piste-revelee" }, carteEl(state.cards[id], ctx),
            el("button", { class: "bouton petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "leadsTake", id }) }, "Prendre"))),
          el("button", { class: "lien-outil", type: "button", disabled: !peut, title: "Remettre les pistes révélées dans Leads sans en prendre", onclick: () => ctx.envoyer({ t: "leadsReturn" }) }, "Remettre"));
      }
      if (L && p.id === L.secret) {
        // Cartes cachées sous la carte de référence : dos, aucune consultation avant l'accusation.
        return el("div", { class: "pile secrete", "data-drop": "none", "data-outil": `pile:${p.id}`, title: `${p.label} — un suspect et une cachette, face cachée : révélés par l'accusation seulement` },
          el("div", { class: `dos-pile pile-scenario${ids.length ? "" : " vide"}` }, ids.length ? el("img", { src: "/img/dos-rencontre.svg", alt: p.label }) : el("span", { class: "sous", text: "révélées" })),
          el("span", { class: "badge", text: String(ids.length) }),
          el("span", { class: "etiquette-pile", text: p.label }));
      }
      if (p.isDiscard) {
        return el("div", { class: "pile", "data-drop": `pile:${p.id}`, "data-outil": `pile:${p.id}`, title: `${p.label} — déposez ici pour défausser. Clic droit : consulter, remélanger.` },
          el("div", { class: `dos-pile defausse-rencontre${haut ? "" : " vide"}` }, haut ? carteEl(haut, ctx) : el("span", { class: "sous", text: "défausse" })),
          el("span", { class: "badge", text: String(ids.length) }),
          el("span", { class: "etiquette-pile", text: p.label }));
      }
      const defausse = p.discard ? (state.piles[p.discard] ?? []) : [];
      return el("div", { class: "pile", "data-drop": `pile:${p.id}`, "data-outil": `pile:${p.id}`, title: `${p.label} — clic : retourner la première carte ; clic droit : chercher, mélanger.` },
        el("div", { class: `dos-pile pile-scenario${ids.length ? "" : " vide"}${haut?.faceUp ? " revelee" : ""}` },
          haut?.faceUp ? carteEl(haut, ctx)
            : ids.length ? el("button", { class: "dos-bouton", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "drawEncounter", pile: p.id }) }, el("img", { src: "/img/dos-rencontre.svg", alt: p.label }))
            : defausse.length ? el("button", { class: "dos-bouton vide", type: "button", disabled: !peut, title: "Pioche vide : clic pour remélanger sa défausse et piocher", onclick: () => ctx.envoyer({ t: "drawEncounter", pile: p.id }) }, el("span", { class: "sous", text: "vide" }))
            // Pile qui se forme en cours de partie avec les lieux de côté (TIC « Tidal Tunnel deck ») : un bouton tant qu'elle est vide.
            : p.gather ? el("button", { class: "dos-bouton vide", type: "button", disabled: !peut || !Object.values(state.cards).some((c) => c.kind === "location" && c.loc.zone === "aside" && ctx.defs.get(c.code)?.backName === p.gather.backName),
                title: `Former ${p.label} avec les lieux de côté « ${p.gather.backName} », mélangés`, onclick: () => ctx.envoyer({ t: "formPile", pile: p.id }) }, el("span", { class: "sous", text: "former" }))
            : el("span", { class: "sous", text: "vide" })),
        el("span", { class: "badge", text: String(ids.length) }),
        el("span", { class: "etiquette-pile", text: p.label }));
    }).filter(Boolean),
  );
}

export function rendreChaos(ctx) {
  const { state } = ctx.etat;
  const peut = assis(ctx);
  const sect = document.getElementById("chaos");
  const comptes = new Map();
  for (const t of state.chaos.bag) comptes.set(t, (comptes.get(t) ?? 0) + 1);
  const ordre = Object.keys(JETONS_CHAOS);
  const liste = [...comptes.entries()].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]));
  const epingle = sect.querySelector(".sac-popover.epingle") !== null;
  sect.replaceChildren(
    el("div", { class: "sac", "data-outil": "sac" },
      el("button", { class: "sac-forme", type: "button", disabled: !peut, "aria-label": "Sac du chaos : tirer un jeton",
        onclick: () => ctx.envoyer({ t: "chaosDraw" }) }, el("span", { text: String(state.chaos.bag.length) })),
      state.chaos.drawn.length
        ? el("div", { class: "tires" }, ...state.chaos.drawn.map((t) => imgJetonChaos(t, 40)),
          el("button", { class: "pm remettre", type: "button", disabled: !peut, title: "Tout remettre dans le sac", onclick: () => ctx.envoyer({ t: "chaosReturn" }) }, "↺"))
        : null,
      el("div", { class: `sac-popover${epingle ? " epingle" : ""}` },
        el("p", { class: "compte", text: `Sac du chaos — ${libelleDifficulte(state.difficulty)}, ${state.chaos.bag.length} jetons` }),
        el("ul", { class: "composition" }, ...liste.map(([t, n]) => el("li", { class: "jeton-chaos", title: JETONS_CHAOS[t] },
          imgJetonChaos(t, 26), el("span", { class: "nombre", text: `×${n}` })))),
        el("p", { class: "sous", text: "Clic : tirer un jeton. Clic droit : ajuster, composition." })),
    ),
  );
}

export function libelleDifficulte(d) {
  return { easy: "facile", standard: "standard", hard: "difficile", expert: "expert" }[d] ?? d;
}


// ---- Colonne droite : de côté, victoire, journal ----------------------------------

function rendreBande(bande, zone, ctx, vide) {
  const { state } = ctx.etat;
  bande.dataset.drop = zone;
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === zone).sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
  const vus = new Set();
  for (const c of cartes) {
    const e = carteEl(c, ctx);
    if (e.parentElement !== bande) bande.append(e);
    vus.add(e);
  }
  for (const e of [...bande.children]) if (!vus.has(e) && !e.classList.contains("vide")) e.remove();
  // Ordre visuel = ordre des x.
  cartes.forEach((c) => bande.append(els.get(c.id)));
  let v = bande.querySelector(".vide");
  if (!cartes.length && !v) bande.append(el("p", { class: "vide", text: vide }));
  if (cartes.length && v) v.remove();
}

function rendreJournal(ctx) {
  const { state } = ctx.etat;
  const ol = document.querySelector("#journal ol");
  // Les refus et informations propres à ce client (ctx.journalLocal) s'intercalent dans le journal — plus de
  // notifications plein écran (retour de test du 2026-09-09).
  const entrees = [...state.log, ...(ctx.journalLocal ?? [])].sort((a, b) => a.at - b.at);
  ol.replaceChildren(...entrees.map((e) => el("li", { class: `entree ${e.kind}${e.local ? " locale" : ""}` },
    el("time", { text: heure(e.at) }), el("span", { text: e.text }))));
  ol.scrollTop = ol.scrollHeight;
}

/** Ligne de journal locale (refus, information) : visible de ce client seulement, rendue au prochain rendu. */
export function journalLocal(ctx, texte, kind = "reminder") {
  ctx.journalLocal = [...(ctx.journalLocal ?? []).slice(-30), { at: Date.now(), kind, text: texte, local: true }];
  if (document.querySelector("#journal ol")) rendreJournal(ctx);
}

function heure(t) {
  return new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ---- Sièges ------------------------------------------------------------------------

function rendreSieges(ctx) {
  const { state, moi } = ctx.etat;
  const peut = assis(ctx);
  const pied = document.getElementById("sieges");
  const sieges = state.seats.filter((s) => s.investigatorCode);
  pied.replaceChildren(...sieges.map((s) => {
    const inv = ctx.investigateurs.get(s.investigatorCode);
    const carteInv = state.cards[`inv-${s.index}`];
    const menace = Object.values(state.cards)
      .filter((c) => c.loc.zone === `seat${s.index}` && c.kind !== "investigator")
      .sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
    const degats = carteInv?.tokens.damage ?? 0, horreur = carteInv?.tokens.horror ?? 0;
    const faction = FACTIONS[inv?.faction] ?? FACTIONS.neutral;
    const enTour = state.turn.seat === s.index, aJoue = state.turn.done.includes(s.index);
    const jeton = (token, delta) => ctx.envoyer({ t: "addToken", id: `inv-${s.index}`, token, delta });
    const compteur = (key, delta) => ctx.envoyer({ t: "setSeatCounter", seat: s.index, key, delta });
    const reprendre = !s.occupied && moi.seat === null
      ? el("button", { class: "bouton petit", type: "button", onclick: () => ctx.envoyer({ t: "takeSeat", seat: s.index, name: localStorage.getItem("ahwa:nom") ?? "" }) }, "Reprendre ce siège")
      : null;
    const actionsRestantes = s.counters.actions ?? 0;
    const boutonAction = enTour && moi.seat === s.index
      ? el("button", { class: "bouton-action", type: "button", disabled: actionsRestantes <= 0,
          title: actionsRestantes > 0 ? `Dépenser une action (${actionsRestantes} restante${actionsRestantes > 1 ? "s" : ""})` : "Plus d'action ce tour",
          onclick: () => compteur("actions", -1) },
          el("span", { class: "fleche", html: ICONE_ACTION }), el("span", { class: "n", text: String(actionsRestantes) }))
      : null;
    const boutonTour = state.phase === "resolution" ? null : enTour
      ? el("button", { class: "bouton petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "endTurn", seat: s.index }) }, "Fin de mon tour")
      : el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "takeTurn", seat: s.index }) },
          aJoue ? "Rejouer" : (moi.seat === s.index ? "Prendre mon tour" : "Prend son tour"));
    // Board joueur (cahier §10.7) : lien vers la page du siège (lecture seule pour les autres), code de siège pour
    // rejoindre le siège depuis un second appareil, nombre de connexions.
    const lienBoard = el("a", { class: "bouton secondaire petit lien-board", href: `/r/${state.code}/j/${s.index}`, target: `ahwa-board-${state.code}-${s.index}`, rel: "noopener",
      title: s.deck ? "Ouvrir le board de ce siège (deck, main, cartes en jeu) dans un nouvel onglet" : "Ouvrir la page de ce siège dans un nouvel onglet (pas de deck importé)" }, "Voir le board");
    return el("article", { class: `siege${moi.seat === s.index ? " moi" : ""}${enTour ? " actif" : ""}${aJoue && !enTour ? " joue" : ""}`, "data-seat": s.index, style: { "--faction": faction.couleur } },
      el("header", {},
        el("span", { class: `etat-siege ${s.occupied ? "connecte" : "libre"}`, title: s.occupied ? (s.connections > 1 ? `${s.connections} connexions` : "connecté") : "déconnecté" }),
        state.lead === s.index ? el("span", { class: "etoile", title: "enquêteur principal", text: "★" }) : null,
        el("strong", { text: nomSiege(s, ctx) }),
        s.name && inv ? el("span", { class: "sous", text: inv.name }) : null,
        moi.seat === s.index ? el("span", { class: "vous", text: "vous" }) : null,
        s.occupied && s.pin ? el("span", { class: "code-siege", title: "Code de siège : à saisir pour rejoindre ce siège depuis un autre appareil" }, el("span", { text: "code " }), el("strong", { text: s.pin })) : null,
        s.occupied && s.connections > 1 ? el("span", { class: "sous", text: `${s.connections} appareils` }) : null,
        boutonAction,
        aJoue && !enTour ? el("span", { class: "sous", text: "a joué" }) : null,
        el("span", { class: "espace" }),
        reprendre,
        lienBoard,
        boutonTour,
      ),
      el("div", { class: "siege-corps" },
        carteInv ? carteEl(carteInv, ctx) : el("div", { class: "carte paysage vide" }),
        // Jauges de l'enquêteur : les mêmes chips que sur les cartes (clic = +1, « − » au survol) — uniformisées le 2026-09-09.
        el("div", { class: "jauges-col" },
          el("div", { class: "jauges-inv" },
            chipJauge({ token: "resource", libelle: "Ressources", unite: "ressource", img: "/img/tokens/tok_ressources.png", texte: String(s.counters.resources ?? 0), peut, onDelta: (d) => compteur("resources", d) }),
            chipJauge({ token: "clue", libelle: "Indices", unite: "indice", img: "/img/tokens/tok_indices.png", texte: String(s.counters.clues ?? 0), peut, onDelta: (d) => compteur("clues", d) }),
            chipJauge({ token: "damage", libelle: `Dégâts (vie ${s.counters.health})`, unite: "dégât", img: "/img/tokens/tok_degats.png", texte: `${degats}/${s.counters.health}`, peut, onDelta: (d) => jeton("damage", d) }),
            chipJauge({ token: "horror", libelle: `Horreur (santé mentale ${s.counters.sanity})`, unite: "horreur", img: "/img/tokens/tok_horreur.png", texte: `${horreur}/${s.counters.sanity}`, peut, onDelta: (d) => jeton("horror", d) }),
            // Compteurs propres au scénario (COB : jetons sang scellés — le chip passe par le sac).
            ...(ctx.scenario.seatCounters ?? []).map((sc) => chipJauge({
              token: sc.key, libelle: sc.label + (ctx.scenario.seal?.counter === sc.key ? " (+ : sceller depuis le sac, − : libérer vers le sac)" : ""), unite: sc.label.toLowerCase(),
              img: sc.icon ? `/img/chaos/${sc.icon}.svg` : "/img/tokens/tok_ressources.png", texte: String(s.counters[sc.key] ?? 0), peut,
              onDelta: (d) => ctx.scenario.seal?.counter === sc.key
                ? ctx.envoyer({ t: d > 0 ? "chaosSeal" : "chaosRelease", seat: s.index })
                : compteur(sc.key, d),
            }))),
        el("dl", { class: "compteurs" },
          el("div", { class: "compteur actions" },
            el("dt", {}, el("span", { text: "Actions" })),
            el("dd", { class: "actions-pips" },
              el("button", { class: "pm", type: "button", disabled: !peut, title: "Dépenser une action", onclick: () => compteur("actions", -1) }, "−"),
              ...[0, 1, 2].map((i) => el("span", { class: `pip${i < (s.counters.actions ?? 0) ? " plein" : ""}` })),
              (s.counters.actions ?? 0) > 3 ? el("span", { class: "plus", text: `+${s.counters.actions - 3}` }) : null,
              el("button", { class: "pm", type: "button", disabled: !peut, title: "Action supplémentaire", onclick: () => compteur("actions", 1) }, "+"))),
        )),
        el("div", { class: "menace", "data-drop": `seat${s.index}` }, ...(menace.length ? menace.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Zone de menace — déposez ici les ennemis engagés et les traîtrises" })])),
        // Board joueur partagé : la case Play (l'événement joué) à côté de la menace ; Commit est volant (rendreCommitVolant).
        s.deck ? casePlay(state, s, ctx) : null,
      ),
    );
  }));
}

function casePlay(state, s, ctx) {
  const n = s.index;
  const play = Object.values(state.cards).filter((c) => c.loc.zone === `pevent${n}`).sort((a, b) => a.loc.z - b.loc.z);
  const main = (state.piles[`phand${n}`] ?? []).length;
  return el("div", { class: "play-siege" },
    el("div", { class: `case-play${play.length ? "" : " vide"}`, title: "Play : l'événement joué par ce siège (zone Play de son board)" },
      ...(play.length ? play.map((c) => carteEl(c, ctx)) : [el("span", { class: "sous", text: "Play" })])),
    el("span", { class: "sous", text: `Main ${main}` }));
}

/** Commit volant (retour de test du 2026-09-09) : au-dessus des pioches de rencontre dès qu'un siège a engagé des
 *  cartes au test ; les icônes de compétence engagées sont totalisées sur son côté. */
function rendreCommitVolant(ctx) {
  const { state } = ctx.etat;
  const zone = document.getElementById("commit-volant");
  if (!zone) return;
  const tri = (a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z;
  const parSiege = state.seats.filter((s) => s.investigatorCode).map((s) => ({ s, cartes: Object.values(state.cards).filter((c) => c.loc.zone === `pcommit${s.index}`).sort(tri) })).filter((x) => x.cartes.length);
  if (!parSiege.length) { zone.hidden = true; zone.replaceChildren(); return; }
  zone.hidden = false;
  const toutes = parSiege.flatMap((x) => x.cartes);
  zone.replaceChildren(
    el("h2", { text: "Commit — cartes engagées au test" }),
    el("div", { class: "commit-corps" },
      el("div", { class: "commit-groupes" }, ...parSiege.map(({ s, cartes }) => el("div", { class: "commit-groupe" },
        el("span", { class: "etiquette" }, el("span", { text: nomSiege(s, ctx) }),
          // « Test résolu » : réservé au siège concerné (action p:* de son board).
          el("button", { class: "bouton petit", type: "button", disabled: ctx.etat.moi.seat !== s.index, title: ctx.etat.moi.seat === s.index ? "Les cartes engagées vont à votre défausse" : `Seul ${nomSiege(s, ctx)} peut résoudre son test`,
            onclick: () => ctx.envoyer({ t: "p:resolve" }) }, "Test résolu")),
        el("div", { class: "commit-cartes" }, ...cartes.map((c) => carteEl(c, ctx)))))),
      elTotauxCompetences(totauxCompetences(toutes, ctx.defs))),
  );
  // Posé juste au-dessus des outils de table (pioches, sac).
  const outils = zone.parentElement?.querySelector(".table-outils");
  if (outils) zone.style.bottom = `${outils.offsetHeight + 20}px`;
}


// ---- Loupe ------------------------------------------------------------------------

const LOUPE_DELAI = 500;

export function initLoupe(ctx) {
  const loupe = document.getElementById("loupe");
  const img = loupe.querySelector("img");
  let courant = null, fixe = false;
  const montrerCarte = (cible) => {
    const enEtat = ctx.etat.state?.cards[cible.dataset.loupeId ?? cible.dataset.id];
    if (!enEtat) return false;
    // L'élément fait foi pour la face montrée : une carte de la main (face cachée dans l'état) est rendue
    // face visible pour son joueur et pour une carte révélée (page joueur).
    const carte = !enEtat.faceUp && !cible.classList.contains("retournee") ? { ...enEtat, faceUp: true } : enEtat;
    if (!loupePermise(carte, ctx.defs.get(carte.code))) return false;
    courant = cible;
    img.src = urlImage(carte, ctx.defs.get(carte.code));
    loupe.classList.toggle("paysage", cible.classList.contains("paysage"));
    loupe.hidden = false;
    return true;
  };
  // Survol : la loupe arrive après un délai d'une seconde (retour de test du 2026-09-09) et se place à l'écart de
  // la carte survolée (à droite si sa place habituelle la recouvrirait).
  let attente = null;
  const placer = (cible) => {
    const r = cible.getBoundingClientRect(), l = loupe.getBoundingClientRect();
    const recouvre = r.left < l.right && r.right > l.left && r.top < l.bottom && r.bottom > l.top;
    loupe.classList.toggle("a-droite", recouvre);
  };
  document.addEventListener("pointerover", (e) => {
    if (fixe || e.pointerType === "touch") return;
    const cible = e.target.closest?.(".carte, [data-loupe-id]");
    if (!cible || cible.dataset.loupe !== "1" || cible.closest(".fantome, .bande.floue")) return;
    clearTimeout(attente);
    attente = setTimeout(() => { if (montrerCarte(cible)) { loupe.classList.remove("a-droite"); placer(cible); } }, LOUPE_DELAI);
  });
  // Image directe (verso de l'enquêteur…) : loupe épinglée jusqu'au prochain toucher.
  document.addEventListener("ahwa:loupe-image", (e) => {
    clearTimeout(attente);
    img.src = e.detail.src;
    loupe.classList.toggle("paysage", Boolean(e.detail.paysage));
    loupe.classList.remove("a-droite");
    loupe.hidden = false;
    fixe = true; courant = null;
    setTimeout(() => document.addEventListener("pointerdown", () => { fixe = false; loupe.hidden = true; }, { once: true }), 50);
  });
  document.addEventListener("pointerout", (e) => {
    if (fixe) return;
    const cible = e.target.closest?.(".carte, [data-loupe-id]");
    if (cible && (!e.relatedTarget || !cible.contains(e.relatedTarget))) clearTimeout(attente);
    if (courant && (!e.relatedTarget || !courant.contains(e.relatedTarget))) { courant = null; loupe.hidden = true; }
  });
  // Tactile / menu : loupe épinglée jusqu'au prochain toucher.
  document.addEventListener("ahwa:loupe", (e) => {
    const cible = e.detail;
    clearTimeout(attente);
    fixe = montrerCarte(cible);
    if (fixe) { loupe.classList.remove("a-droite"); placer(cible); }
    if (fixe) setTimeout(() => document.addEventListener("pointerdown", () => { fixe = false; courant = null; loupe.hidden = true; }, { once: true }), 50);
  });
}

// ---- Encarts éphémères -------------------------------------------------------------

export function encart(texte, genre = "rappel") {
  const zone = document.getElementById("rappels");
  const n = el("div", { class: `encart ${genre}`, role: "status" }, el("span", { text: texte }),
    el("button", { type: "button", class: "fermer", "aria-label": "Fermer", onclick: () => n.remove() }, "×"));
  zone.append(n);
  setTimeout(() => n.remove(), genre === "rappel" ? 12000 : 6000);
}

export { pluriel, ouvrirDialogueCartes };
