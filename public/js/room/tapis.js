// Tapis : rendu de l'état de jeu (zones fixes + zone des lieux zoomable). Étape 1 : affichage seul.

import { el, pluriel } from "./dom.js";
import { majCarte, majMini, urlImage, loupePermise, CARTE_L, CARTE_H, JETONS_CHAOS, FACTIONS } from "./cartes.js";
import { nomSiege } from "./lobby.js";

export const PHASES = {
  mythos: "Phase du mythe",
  investigation: "Phase des enquêteurs",
  enemy: "Phase des ennemis",
  upkeep: "Phase d'entretien",
  resolution: "Partie terminée",
};

const els = new Map();   // id de carte → élément DOM (réutilisé d'un rendu à l'autre)
const vue = { k: 1, tx: 0, ty: 0, ajustee: false };
let plateau = null, zoneBoard = null;

function carteEl(carte, ctx) {
  const existant = els.get(carte.id);
  const e = carte.kind === "mini" ? majMini(existant, carte, ctx) : majCarte(existant, carte, ctx);
  els.set(carte.id, e);
  return e;
}

function nettoyer(ctx) {
  for (const id of [...els.keys()]) if (!ctx.etat.state.cards[id]) { els.get(id).remove(); els.delete(id); }
}

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
  document.getElementById("manche").textContent = state.round ? `Manche ${state.round}` : "";
  document.getElementById("phase-nom").textContent = PHASES[state.phase] ?? state.phase;
  const tour = document.getElementById("tour");
  if (state.phase === "investigation") {
    tour.textContent = state.turn.seat === null ? "Personne n'a pris son tour." : `Tour de ${nomSiege(state.seats[state.turn.seat], ctx)}`;
  } else tour.textContent = "";
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
    e.preventDefault();
    const r = zoneBoard.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const facteur = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomer(facteur, px, py);
  }, { passive: false });

  let glisse = null;
  zoneBoard.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".carte, .mini, button, .table-outils")) return;
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
    const w = c.kind === "mini" ? 30 : CARTE_L, h = c.kind === "mini" ? 30 : CARTE_H;
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

// ---- Colonne gauche : histoire, pioches, sac ---------------------------------------

function rendreHistoire(ctx) {
  const { state } = ctx.etat;
  const sect = document.getElementById("histoire");
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === "story");
  const scenario = cartes.find((c) => c.kind === "scenario");
  const agenda = state.agendaId ? state.cards[state.agendaId] : null;
  const acte = state.actId ? state.cards[state.actId] : null;
  const defAgenda = agenda ? ctx.defs.get(agenda.code) : null;
  const defActe = acte ? ctx.defs.get(acte.code) : null;
  const seuilActe = defActe?.clue ? (defActe.clue.perInvestigator ? defActe.clue.value * state.playerCount : defActe.clue.value) : null;
  const doomTotal = Object.values(state.cards).reduce((n, c) => n + (c.tokens.doom ?? 0), 0);
  const indicesJoueurs = state.seats.reduce((n, s) => n + (s.counters.clues ?? 0), 0);

  sect.replaceChildren(
    el("h2", { text: "Agenda et acte" }),
    el("div", { class: "histoire-cartes" },
      agenda ? el("div", { class: "bloc" }, carteEl(agenda, ctx),
        el("p", { class: "compte", html: `Doom <strong>${doomTotal}</strong> / ${defAgenda?.doom ?? "?"}` }),
        el("p", { class: "sous", text: `${state.piles.agendaDeck.length} agenda${state.piles.agendaDeck.length > 1 ? "s" : ""} à venir` })) : null,
      acte ? el("div", { class: "bloc" }, carteEl(acte, ctx),
        el("p", { class: "compte", html: `Indices des enquêteurs <strong>${indicesJoueurs}</strong>${seuilActe ? ` / ${seuilActe}` : ""}` }),
        el("p", { class: "sous", text: `${state.piles.actDeck.length} acte${state.piles.actDeck.length > 1 ? "s" : ""} à venir` })) : null,
      scenario ? el("div", { class: "bloc scenario" }, carteEl(scenario, ctx), el("p", { class: "sous", text: "Carte de scénario (verso : jetons)" })) : null,
    ),
  );
}

function rendrePioches(ctx) {
  const { state } = ctx.etat;
  const sect = document.getElementById("pioches");
  const pioche = state.piles.encounter;
  const defausse = state.piles.encounterDiscard;
  const dessus = defausse.length ? state.cards[defausse[0]] : null;
  sect.replaceChildren(
    el("div", { class: "pioches-cartes" },
      el("div", { class: "pile" },
        el("div", { class: `dos-pile${pioche.length ? "" : " vide"}` }, pioche.length ? el("img", { src: "/img/dos-rencontre.svg", alt: "pioche de rencontre" }) : null),
        el("p", { class: "compte", html: `Pioche <strong>${pioche.length}</strong>` })),
      el("div", { class: "pile" },
        el("div", { class: `dos-pile${dessus ? "" : " vide"}` }, dessus ? carteEl(dessus, ctx) : null),
        el("p", { class: "compte", html: `Défausse <strong>${defausse.length}</strong>` })),
    ),
  );
}

function rendreChaos(ctx) {
  const { state } = ctx.etat;
  const sect = document.getElementById("chaos");
  const comptes = new Map();
  for (const t of state.chaos.bag) comptes.set(t, (comptes.get(t) ?? 0) + 1);
  const ordre = Object.keys(JETONS_CHAOS);
  const liste = [...comptes.entries()].sort((a, b) => ordre.indexOf(a[0]) - ordre.indexOf(b[0]));
  const ouvert = sect.querySelector("details")?.open ?? false;
  sect.replaceChildren(
    el("div", { class: "sac" },
      el("div", { class: "sac-forme", title: `${state.chaos.bag.length} jetons dans le sac` }, el("span", { text: String(state.chaos.bag.length) })),
      el("div", { class: "sac-info" },
        el("p", { class: "compte", text: "Sac du chaos" }),
        el("p", { class: "sous", text: `Difficulté ${libelleDifficulte(state.difficulty)}` }),
        el("p", { class: "sous", text: state.chaos.drawn.length ? `Tirés : ${state.chaos.drawn.map((t) => JETONS_CHAOS[t]).join(", ")}` : "Aucun jeton tiré." }),
      ),
    ),
    el("details", { class: "composition-details", open: ouvert },
      el("summary", { text: "Composition" }),
      el("ul", { class: "composition" }, ...liste.map(([t, n]) => el("li", { class: `jeton-chaos j-${t.replace(/[+]/g, "p").replace(/-/g, "m")}` },
        el("span", { class: "glyphe", text: glypheChaos(t) }), el("span", { class: "nombre", text: `×${n}` })))),
    ),
  );
}

export function libelleDifficulte(d) {
  return { easy: "facile", standard: "standard", hard: "difficile", expert: "expert" }[d] ?? d;
}

function glypheChaos(t) {
  return { skull: "☠", cultist: "✝", tablet: "▤", elder_thing: "✺", auto_fail: "✕", elder_sign: "✶", bless: "☼", curse: "☾", frost: "❄" }[t] ?? JETONS_CHAOS[t];
}

// ---- Colonne droite : de côté, victoire, journal ----------------------------------

function rendreBande(bande, zone, ctx, vide) {
  const { state } = ctx.etat;
  const cartes = Object.values(state.cards).filter((c) => c.loc.zone === zone).sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
  const vus = new Set();
  for (const c of cartes) {
    const e = carteEl(c, ctx);
    if (e.parentElement !== bande) bande.append(e);
    vus.add(e);
  }
  for (const e of [...bande.children]) if (!vus.has(e) && !e.classList.contains("vide")) e.remove();
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
    return el("article", { class: `siege${moi.seat === s.index ? " moi" : ""}${state.turn.seat === s.index ? " actif" : ""}`, style: { "--faction": faction.couleur } },
      el("header", {},
        el("span", { class: `etat-siege ${s.occupied ? "connecte" : "libre"}`, title: s.occupied ? "connecté" : "déconnecté" }),
        state.lead === s.index ? el("span", { class: "etoile", title: "enquêteur principal", text: "★" }) : null,
        el("strong", { text: nomSiege(s, ctx) }),
        s.name && inv ? el("span", { class: "sous", text: inv.name }) : null,
        moi.seat === s.index ? el("span", { class: "vous", text: "vous" }) : null,
      ),
      el("div", { class: "siege-corps" },
        carteInv ? carteEl(carteInv, ctx) : el("div", { class: "carte paysage vide" }),
        el("dl", { class: "compteurs" },
          compteur("Vie", `${Math.max(0, s.counters.health - degats)} / ${s.counters.health}`, "/img/tokens/tok_degats.png", degats ? `${degats} dégâts` : ""),
          compteur("Santé", `${Math.max(0, s.counters.sanity - horreur)} / ${s.counters.sanity}`, "/img/tokens/tok_horreur.png", horreur ? `${horreur} horreur` : ""),
          compteur("Indices", String(s.counters.clues ?? 0), "/img/tokens/tok_indices.png"),
          el("div", { class: "actions-pips", title: `${s.counters.actions} actions` }, ...[0, 1, 2].map((i) => el("span", { class: `pip${i < (s.counters.actions ?? 0) ? " plein" : ""}` })),
            (s.counters.actions ?? 0) > 3 ? el("span", { class: "plus", text: `+${s.counters.actions - 3}` }) : null),
        ),
        el("div", { class: "menace" }, ...(menace.length ? menace.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Zone de menace" })])),
      ),
    );
  }));
}

function compteur(libelle, valeur, icone, detail) {
  return el("div", { class: "compteur" },
    el("dt", {}, el("img", { src: icone, alt: "" }), el("span", { text: libelle })),
    el("dd", { text: valeur }),
    detail ? el("dd", { class: "detail", text: detail }) : null,
  );
}

// ---- Loupe ------------------------------------------------------------------------

export function initLoupe(ctx) {
  const loupe = document.getElementById("loupe");
  const img = loupe.querySelector("img");
  let courant = null;
  const montrer = (e) => {
    const cible = e.target.closest?.(".carte");
    if (!cible || cible.dataset.loupe !== "1") return;
    const carte = ctx.etat.state?.cards[cible.dataset.id];
    if (!carte || !loupePermise(carte, ctx.defs.get(carte.code))) return;
    courant = cible;
    img.src = urlImage(carte, ctx.defs.get(carte.code));
    loupe.classList.toggle("paysage", cible.classList.contains("paysage"));
    loupe.hidden = false;
  };
  const cacher = (e) => {
    if (courant && (!e.relatedTarget || !courant.contains(e.relatedTarget))) { courant = null; loupe.hidden = true; }
  };
  document.addEventListener("pointerover", montrer);
  document.addEventListener("pointerout", cacher);
}

// ---- Encarts éphémères -------------------------------------------------------------

export function encart(texte, genre = "rappel") {
  const zone = document.getElementById("rappels");
  const n = el("div", { class: `encart ${genre}`, role: "status" }, el("span", { text: texte }),
    el("button", { type: "button", class: "fermer", "aria-label": "Fermer", onclick: () => n.remove() }, "×"));
  zone.append(n);
  setTimeout(() => n.remove(), genre === "rappel" ? 12000 : 6000);
}

export { pluriel };
