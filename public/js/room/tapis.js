// Tapis : rendu de l'état de jeu (zones fixes + zone des lieux zoomable) et commandes.
// Règle « rien n'est jamais bloqué » : tous les boutons restent actifs pour un joueur assis ;
// les états (tour en cours, a joué, seuil atteint) sont des indications visuelles.

import { el, pluriel } from "./dom.js";
import { majCarte, majMini, urlImage, loupePermise, CARTE_L, CARTE_H, MINI, JETONS_CHAOS, FACTIONS } from "./cartes.js";
import { nomSiege } from "./lobby.js";
import { ouvrirDialogueCartes, ouvrirAjustementSac, ouvrirDepenseIndices } from "./dialogues.js";

export const PHASES = {
  mythos: "Phase du mythe",
  investigation: "Phase des enquêteurs",
  enemy: "Phase des ennemis",
  upkeep: "Phase d'entretien",
  resolution: "Partie terminée",
};
const ORDRE_PHASES = ["mythos", "investigation", "enemy", "upkeep"];

const els = new Map();   // id de carte → élément DOM (réutilisé d'un rendu à l'autre)
export const vue = { k: 1, tx: 0, ty: 0, ajustee: false };
let plateau = null, zoneBoard = null;

export function carteEl(carte, ctx) {
  const existant = els.get(carte.id);
  const e = carte.kind === "mini" ? majMini(existant, carte, ctx) : majCarte(existant, carte, ctx);
  els.set(carte.id, e);
  return e;
}

function nettoyer(ctx) {
  for (const id of [...els.keys()]) if (!ctx.etat.state.cards[id]) { els.get(id).remove(); els.delete(id); }
}

const assis = (ctx) => ctx.etat.moi.seat !== null;

export function rendreTapis(ctx) {
  const { state } = ctx.etat;
  nettoyer(ctx);
  rendreBarre(ctx);
  rendrePlateau(ctx);
  rendreHistoire(ctx);
  rendrePioches(ctx);
  rendreChaos(ctx);
  rendreBande(document.querySelector("#aside .bande"), "aside", ctx, "Rien de côté.");
  rendreBande(document.querySelector("#victory .bande"), "victory", ctx, "Aucune carte en zone de victoire.");
  rendreSieges(ctx);
  rendreJournal(ctx);
  if (!vue.ajustee && state.phase !== "lobby") { ajusterVue(ctx); vue.ajustee = true; }
}

export function oublierVue() { vue.ajustee = false; }

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

export function initPlateau() {
  plateau = document.getElementById("plateau");
  zoneBoard = document.getElementById("board");
  appliquerVue();

  zoneBoard.addEventListener("wheel", (e) => {
    if (e.target.closest(".table-outils, .loupe")) return;
    e.preventDefault();
    const r = zoneBoard.getBoundingClientRect();
    zoomer(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let glisse = null;
  zoneBoard.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".carte, .mini, button, .table-outils, .loupe, details")) return;
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
    const w = c.kind === "mini" ? MINI : CARTE_L, h = c.kind === "mini" ? MINI : CARTE_H;
    x0 = Math.min(x0, c.loc.x); y0 = Math.min(y0, c.loc.y); x1 = Math.max(x1, c.loc.x + w); y1 = Math.max(y1, c.loc.y + h);
  }
  const marge = 160;
  const k = Math.min(1.4, Math.max(0.3, Math.min(W / (x1 - x0 + marge * 2), H / (y1 - y0 + marge * 2))));
  vue.k = k;
  vue.tx = (W - (x1 - x0) * k) / 2 - x0 * k;
  vue.ty = (H - (y1 - y0) * k) / 2 - y0 * k;
  appliquerVue();
}

function rendrePlateau(ctx) {
  const { state } = ctx.etat;
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === "board").sort((a, b) => a.loc.z - b.loc.z);
  const vus = new Set();
  for (const c of cartes) {
    const e = carteEl(c, ctx);
    e.style.left = `${c.loc.x}px`;
    e.style.top = `${c.loc.y}px`;
    e.style.zIndex = String(c.loc.z);
    if (e.parentElement !== plateau) plateau.append(e);
    vus.add(e);
  }
  for (const e of [...plateau.children]) if (!vus.has(e)) e.remove();
}

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

  sect.replaceChildren(
    el("h2", { text: "Agenda et acte" }),
    el("div", { class: "histoire-cartes" },
      agenda ? el("div", { class: "bloc" }, carteEl(agenda, ctx),
        el("p", { class: `compte${seuilDoom && doomTotal >= seuilDoom ? " alerte" : ""}`, html: `Doom en jeu <strong>${doomTotal}</strong> / ${seuilDoom ?? "?"}` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, title: "Retire tout le doom en jeu et révèle l'agenda suivant",
            onclick: () => { if (confirm("Avancer l'agenda ? Tout le doom en jeu sera retiré.")) ctx.envoyer({ t: "advanceAgenda" }); } }, "Avancer l'agenda"),
          el("span", { class: "sous", text: `${state.piles.agendaDeck.length} à venir` }))) : null,
      acte ? el("div", { class: "bloc" }, carteEl(acte, ctx),
        el("p", { class: `compte${seuilActe && indicesJoueurs >= seuilActe ? " alerte" : ""}`, html: `Indices des enquêteurs <strong>${indicesJoueurs}</strong>${seuilActe ? ` / ${seuilActe}` : ""}` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ouvrirDepenseIndices(ctx, seuilActe) }, "Dépenser des indices"),
          el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "advanceAct" }) }, "Avancer l'acte"),
          el("span", { class: "sous", text: `${state.piles.actDeck.length} à venir` }))) : null,
      scenario ? el("div", { class: "bloc scenario" }, carteEl(scenario, ctx), el("p", { class: "sous", text: "Carte de scénario — clic droit : autre face" })) : null,
    ),
  );
}

// ---- Outils de table : pioches, sac ------------------------------------------------

function rendrePioches(ctx) {
  const { state } = ctx.etat;
  const peut = assis(ctx);
  const sect = document.getElementById("pioches");
  const pioche = state.piles.encounter;
  const defausse = state.piles.encounterDiscard;
  const dessus = defausse.length ? state.cards[defausse[0]] : null;
  sect.replaceChildren(
    el("div", { class: "pioches-cartes" },
      el("div", { class: "pile" },
        el("button", { class: `dos-pile${pioche.length ? "" : " vide"}`, type: "button", "data-drop": "pile:encounter", disabled: !peut,
          title: "Piocher une carte rencontre dans votre zone de menace", onclick: () => ctx.envoyer({ t: "drawEncounter" }) },
          pioche.length ? el("img", { src: "/img/dos-rencontre.svg", alt: "" }) : el("span", { class: "sous", text: "vide" })),
        el("p", { class: "compte", html: `Pioche <strong>${pioche.length}</strong>` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "lien-outil", type: "button", disabled: !peut, title: "Regarder la pioche puis la mélanger", onclick: () => ctx.envoyer({ t: "searchEncounter", pile: "encounter" }) }, "Chercher"),
          el("button", { class: "lien-outil", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "shufflePile", pile: "encounter" }) }, "Mélanger"))),
      el("div", { class: "pile" },
        el("div", { class: `dos-pile${dessus ? "" : " vide"}`, "data-drop": "pile:encounterDiscard", title: "Déposez ici pour défausser" }, dessus ? carteEl(dessus, ctx) : null),
        el("p", { class: "compte", html: `Défausse <strong>${defausse.length}</strong>` }),
        el("div", { class: "ligne-boutons" },
          el("button", { class: "lien-outil", type: "button", disabled: !peut || !defausse.length, onclick: () => ctx.envoyer({ t: "searchEncounter", pile: "encounterDiscard" }) }, "Consulter"))),
    ),
  );
}

function rendreChaos(ctx) {
  const { state } = ctx.etat;
  const peut = assis(ctx);
  const sect = document.getElementById("chaos");
  const comptes = new Map();
  for (const t of state.chaos.bag) comptes.set(t, (comptes.get(t) ?? 0) + 1);
  const ordre = Object.keys(JETONS_CHAOS);
  const liste = [...comptes.entries()].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]));
  const ouvert = sect.querySelector("details")?.open ?? false;
  sect.replaceChildren(
    el("div", { class: "sac" },
      el("button", { class: "sac-forme", type: "button", disabled: !peut, title: state.chaos.drawn.length ? "Tirer un autre jeton" : "Tirer un jeton du chaos",
        onclick: () => ctx.envoyer({ t: "chaosDraw" }) }, el("span", { text: String(state.chaos.bag.length) })),
      el("div", { class: "sac-info" },
        el("p", { class: "compte", text: "Sac du chaos" }),
        el("p", { class: "sous", text: `Difficulté ${libelleDifficulte(state.difficulty)}` }),
        state.chaos.drawn.length
          ? el("div", { class: "tires" }, ...state.chaos.drawn.map((t) => el("span", { class: `jeton-chaos tire j-${cls(t)}`, title: JETONS_CHAOS[t] },
              el("span", { class: "glyphe", text: glypheChaos(t) }))),
            el("button", { class: "lien-outil", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "chaosReturn" }) }, "Tout remettre"))
          : el("p", { class: "sous", text: "Cliquez le sac pour tirer." }),
      ),
    ),
    el("div", { class: "ligne-boutons" },
      el("details", { class: "composition-details", open: ouvert },
        el("summary", { text: "Composition" }),
        el("ul", { class: "composition" }, ...liste.map(([t, n]) => el("li", { class: `jeton-chaos j-${cls(t)}`, title: JETONS_CHAOS[t] },
          el("span", { class: "glyphe", text: glypheChaos(t) }), el("span", { class: "nombre", text: `×${n}` }))))),
      el("button", { class: "lien-outil", type: "button", disabled: !peut, onclick: () => ouvrirAjustementSac(ctx) }, "Ajuster"),
    ),
  );
}

const cls = (t) => t.replace(/[+]/g, "p").replace(/-/g, "m");

export function libelleDifficulte(d) {
  return { easy: "facile", standard: "standard", hard: "difficile", expert: "expert" }[d] ?? d;
}

export function glypheChaos(t) {
  return { skull: "☠", cultist: "✝", tablet: "▤", elder_thing: "✺", auto_fail: "✕", elder_sign: "✶", bless: "☼", curse: "☾", frost: "❄" }[t] ?? JETONS_CHAOS[t];
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
  ol.replaceChildren(...state.log.map((e) => el("li", { class: `entree ${e.kind}` },
    el("time", { text: heure(e.at) }), el("span", { text: e.text }))));
  ol.scrollTop = ol.scrollHeight;
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
    const boutonTour = state.phase === "resolution" ? null : enTour
      ? el("button", { class: "bouton petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "endTurn", seat: s.index }) }, "Fin de mon tour")
      : el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "takeTurn", seat: s.index }) },
          aJoue ? "Rejouer" : (moi.seat === s.index ? "Prendre mon tour" : "Prend son tour"));
    return el("article", { class: `siege${moi.seat === s.index ? " moi" : ""}${enTour ? " actif" : ""}${aJoue && !enTour ? " joue" : ""}`, "data-seat": s.index, style: { "--faction": faction.couleur } },
      el("header", {},
        el("span", { class: `etat-siege ${s.occupied ? "connecte" : "libre"}`, title: s.occupied ? "connecté" : "déconnecté" }),
        state.lead === s.index ? el("span", { class: "etoile", title: "enquêteur principal", text: "★" }) : null,
        el("strong", { text: nomSiege(s, ctx) }),
        s.name && inv ? el("span", { class: "sous", text: inv.name }) : null,
        moi.seat === s.index ? el("span", { class: "vous", text: "vous" }) : null,
        aJoue && !enTour ? el("span", { class: "sous", text: "a joué" }) : null,
        el("span", { class: "espace" }),
        boutonTour,
      ),
      el("div", { class: "siege-corps" },
        carteInv ? carteEl(carteInv, ctx) : el("div", { class: "carte paysage vide" }),
        el("dl", { class: "compteurs" },
          ligneCompteur("Vie", `${Math.max(0, s.counters.health - degats)} / ${s.counters.health}`, "/img/tokens/tok_degats.png", peut,
            () => jeton("damage", -1), () => jeton("damage", 1), "dégât"),
          ligneCompteur("Santé", `${Math.max(0, s.counters.sanity - horreur)} / ${s.counters.sanity}`, "/img/tokens/tok_horreur.png", peut,
            () => jeton("horror", -1), () => jeton("horror", 1), "horreur"),
          ligneCompteur("Indices", String(s.counters.clues ?? 0), "/img/tokens/tok_indices.png", peut,
            () => compteur("clues", -1), () => compteur("clues", 1), "indice"),
          el("div", { class: "compteur actions" },
            el("dt", {}, el("span", { text: "Actions" })),
            el("dd", { class: "actions-pips" },
              el("button", { class: "pm", type: "button", disabled: !peut, title: "Dépenser une action", onclick: () => compteur("actions", -1) }, "−"),
              ...[0, 1, 2].map((i) => el("span", { class: `pip${i < (s.counters.actions ?? 0) ? " plein" : ""}` })),
              (s.counters.actions ?? 0) > 3 ? el("span", { class: "plus", text: `+${s.counters.actions - 3}` }) : null,
              el("button", { class: "pm", type: "button", disabled: !peut, title: "Action supplémentaire", onclick: () => compteur("actions", 1) }, "+"))),
        ),
        el("div", { class: "menace", "data-drop": `seat${s.index}` }, ...(menace.length ? menace.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Zone de menace — déposez ici les ennemis engagés et les traîtrises" })])),
      ),
    );
  }));
}

function ligneCompteur(libelle, valeur, icone, peut, moins, plus, unite) {
  return el("div", { class: "compteur" },
    el("dt", {}, el("img", { src: icone, alt: "" }), el("span", { text: libelle })),
    el("dd", {},
      el("button", { class: "pm", type: "button", disabled: !peut, title: `−1 ${unite}`, onclick: moins }, "−"),
      el("span", { class: "valeur", text: valeur }),
      el("button", { class: "pm", type: "button", disabled: !peut, title: `+1 ${unite}`, onclick: plus }, "+")),
  );
}

// ---- Loupe ------------------------------------------------------------------------

export function initLoupe(ctx) {
  const loupe = document.getElementById("loupe");
  const img = loupe.querySelector("img");
  let courant = null, fixe = false;
  const montrerCarte = (cible) => {
    const carte = ctx.etat.state?.cards[cible.dataset.id];
    if (!carte || !loupePermise(carte, ctx.defs.get(carte.code))) return false;
    courant = cible;
    img.src = urlImage(carte, ctx.defs.get(carte.code));
    loupe.classList.toggle("paysage", cible.classList.contains("paysage"));
    loupe.hidden = false;
    return true;
  };
  document.addEventListener("pointerover", (e) => {
    if (fixe || e.pointerType === "touch") return;
    const cible = e.target.closest?.(".carte");
    if (!cible || cible.dataset.loupe !== "1" || cible.closest(".fantome")) return;
    montrerCarte(cible);
  });
  document.addEventListener("pointerout", (e) => {
    if (fixe) return;
    if (courant && (!e.relatedTarget || !courant.contains(e.relatedTarget))) { courant = null; loupe.hidden = true; }
  });
  // Tactile / menu : loupe épinglée jusqu'au prochain toucher.
  document.addEventListener("ahwa:loupe", (e) => {
    const cible = e.detail;
    fixe = montrerCarte(cible);
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
