// Interactions sur les cartes : glisser-déposer (message au lâcher), clic, double-clic, menu contextuel.

import { el } from "./dom.js";
import { vue, setAsideActif, cheminProvisoire, versTapis, centreLieu, encart } from "./tapis.js";
import { ouvrirAjustementSac } from "./dialogues.js";

const LIBELLES_JETONS = { clue: "Indice", doom: "Doom", damage: "Dégât", horror: "Horreur", resource: "Ressource", generic: "Marqueur" };

export function initInteractions(ctx) {
  let drag = null;
  let dernierLacher = 0;
  let menu = null;
  let pressionLongue = null;

  const assis = () => ctx.etat.moi.seat !== null;
  const carteDe = (elem) => ctx.etat.state?.cards[elem?.dataset.id];
  let lien = null;          // tracé en cours au clic droit glissé : { depuis, bouge }
  let ignorerMenuAvant = 0; // le contextmenu qui suit un pointerup droit est déjà traité
  let modeLien = null;      // « Relier à un autre lieu… » (menu, tactile) : id du lieu de départ

  const lieuSous = (x, y) => {
    const e = document.elementFromPoint(x, y)?.closest("#plateau .carte.kind-location");
    return e ? carteDe(e) : null;
  };

  // ---- Chemins : clic droit enfoncé sur un lieu, glissé, relâché sur un autre lieu ----
  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 2 || !assis()) return;
    const elem = e.target.closest("#plateau .carte.kind-location");
    const carte = carteDe(elem);
    if (!carte) return;
    e.preventDefault();
    lien = { depuis: carte, x0: e.clientX, y0: e.clientY, bouge: false };
  });
  document.addEventListener("pointermove", (e) => {
    if (!lien) return;
    if (!lien.bouge && Math.hypot(e.clientX - lien.x0, e.clientY - lien.y0) < 8) return;
    lien.bouge = true;
    cheminProvisoire(centreLieu(lien.depuis), versTapis(e.clientX, e.clientY));
  });
  document.addEventListener("pointerup", (e) => {
    if (!lien || e.button !== 2) return;
    const l = lien; lien = null;
    cheminProvisoire(null);
    ignorerMenuAvant = Date.now() + 400;
    if (!l.bouge) { const elem = document.querySelector(`#plateau .carte[data-id="${l.depuis.id}"]`); if (elem) ouvrirMenu(elem, e.clientX, e.clientY); return; }
    const cible = lieuSous(e.clientX, e.clientY);
    if (cible && cible.id !== l.depuis.id) ctx.envoyer({ t: "linkLocations", a: l.depuis.id, b: cible.id });
  });

  // ---- Glisser-déposer ----
  document.addEventListener("pointerdown", (e) => {
    if (menu?.contains(e.target)) return;
    // Zone « de côté » : nette dès qu'on y touche, floue à nouveau quand on la quitte.
    if (e.target.closest("#aside")) setAsideActif(true);
    const elem = e.target.closest(".carte, .mini");
    if (!elem || e.button !== 0 || elem.closest("dialog, .loupe") || e.target.closest("button, .chips")) return;
    if (!assis() || !carteDe(elem)) return;
    e.preventDefault(); // pas de sélection de texte ni de glisser natif d'image
    window.getSelection?.()?.removeAllRanges();
    const r = elem.getBoundingClientRect();
    drag = { elem, id: elem.dataset.id, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, fantome: null };
    if (e.pointerType === "touch") {
      pressionLongue = setTimeout(() => { if (drag && !drag.fantome) { drag = null; ouvrirMenu(elem, e.clientX, e.clientY); } }, 550);
    }
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.fantome) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      clearTimeout(pressionLongue);
      const f = drag.elem.cloneNode(true);
      f.classList.add("fantome");
      f.style.width = `${drag.w}px`;
      f.style.height = `${drag.h}px`;
      document.body.append(f);
      drag.fantome = f;
      drag.elem.classList.add("en-deplacement");
    }
    drag.fantome.style.left = `${e.clientX - drag.dx}px`;
    drag.fantome.style.top = `${e.clientY - drag.dy}px`;
    const cible = cibleSous(e.clientX, e.clientY);
    for (const z of document.querySelectorAll(".depot-ok")) if (z !== cible) z.classList.remove("depot-ok");
    if (cible && cible.dataset.drop !== "none") cible.classList.add("depot-ok");
  });
  const finDrag = (e) => {
    clearTimeout(pressionLongue);
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.fantome) return;
    d.fantome.remove();
    d.elem.classList.remove("en-deplacement");
    for (const z of document.querySelectorAll(".depot-ok")) z.classList.remove("depot-ok");
    window.getSelection?.()?.removeAllRanges();
    dernierLacher = Date.now();
    if (!document.getElementById("aside").matches(":hover")) setAsideActif(false);
    if (e.type === "pointercancel") return;
    const cible = cibleSous(e.clientX, e.clientY);
    if (cible) deposer(d, cible, e);
  };
  document.addEventListener("pointerup", finDrag);
  document.addEventListener("pointercancel", finDrag);

  function cibleSous(x, y) {
    const sous = document.elementFromPoint(x, y);
    return sous?.closest("[data-drop]") ?? null;
  }

  function deposer(d, cible, e) {
    const carte = carteDe(d.elem);
    if (!carte) return;
    const drop = cible.dataset.drop;
    if (drop === "none") return; // l'encart pioche/sac n'est pas le tapis : dépôt annulé
    if (drop.startsWith("pile:")) {
      if (carte.kind === "mini" || carte.kind === "investigator") return;
      ctx.envoyer({ t: "toPile", id: carte.id, pile: drop.slice(5) });
      return;
    }
    if (carte.kind === "investigator") return;
    if (carte.kind === "mini" && drop !== "board") return;
    const r = cible.getBoundingClientRect();
    let x, y;
    if (drop === "story") {
      if (!["agenda", "act", "scenario"].includes(carte.kind)) return;
      x = 0; y = 0;
    } else if (drop === "board") {
      x = (e.clientX - d.dx - r.left - vue.tx) / vue.k;
      y = (e.clientY - d.dy - r.top - vue.ty) / vue.k;
    } else {
      x = e.clientX - d.dx - r.left + cible.scrollLeft;
      y = 0;
    }
    if (carte.loc.zone === drop && Math.abs(x - carte.loc.x) < 1 && Math.abs(y - carte.loc.y) < 1) return;
    ctx.envoyer({ t: "moveCard", id: carte.id, zone: drop, x: Math.round(x), y: Math.round(y) });
  }

  document.getElementById("aside").addEventListener("pointerleave", () => { if (!drag) setTimeout(() => { if (!drag) setAsideActif(false); }, 300); });

  // ---- Clic : lieu face cachée = révélation ; carte révélée sur la pioche = la prendre ;
  //      chips d'ennemi = ±1 ; double-clic : épuiser / redresser ; double-clic sur les indices = en prendre un ----
  document.addEventListener("click", (e) => {
    if (Date.now() - dernierLacher < 200) { e.stopPropagation(); return; }
    if (!assis()) return;
    if (modeLien) {
      const cible = e.target.closest("#plateau .carte.kind-location");
      const carte = carteDe(cible);
      if (carte && carte.id !== modeLien) ctx.envoyer({ t: "linkLocations", a: modeLien, b: carte.id });
      modeLien = null;
      document.body.classList.remove("mode-lien");
      return;
    }
    const chipMoins = e.target.closest(".chip-moins");
    const chip = e.target.closest(".chip");
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe")) return;
    const carte = carteDe(elem);
    if (!carte) return;
    if (chip) {
      e.preventDefault();
      ctx.envoyer({ t: "addToken", id: carte.id, token: chip.dataset.token, delta: chipMoins ? -1 : 1 });
      return;
    }
    if (elem.closest(".dos-pile")) return; // carte révélée sur la pioche ou dessus de la défausse : glisser seulement
    if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") ctx.envoyer({ t: "revealLocation", id: carte.id });
  });
  document.addEventListener("dblclick", (e) => {
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe") || !assis()) return;
    const carte = carteDe(elem);
    if (!carte) return;
    e.preventDefault();
    if (e.target.closest(".chip")) return;
    if (e.target.closest(".jeton-clue") && carte.kind === "location") { ctx.envoyer({ t: "takeClue", id: carte.id }); return; }
    if (elem.closest(".dos-pile")) return;
    ctx.envoyer({ t: "exhaust", id: carte.id });
  });

  // ---- Menu contextuel ----
  document.addEventListener("contextmenu", (e) => {
    const outil = e.target.closest("[data-outil]");
    if (outil) { e.preventDefault(); ouvrirMenuOutil(outil.dataset.outil, e.clientX, e.clientY); return; }
    const elem = e.target.closest(".carte, .mini");
    if (!elem || elem.closest("dialog, .loupe") || !carteDe(elem)) return;
    e.preventDefault();
    if (lien || Date.now() < ignorerMenuAvant) return; // clic droit sur un lieu : géré au pointerup (tracé ou menu)
    ouvrirMenu(elem, e.clientX, e.clientY);
  });
  // Appui long (tactile) sur un outil de table.
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const outil = e.target.closest("[data-outil]");
    if (!outil) return;
    const t = setTimeout(() => ouvrirMenuOutil(outil.dataset.outil, e.clientX, e.clientY), 550);
    const annuler = () => clearTimeout(t);
    document.addEventListener("pointerup", annuler, { once: true });
    document.addEventListener("pointermove", annuler, { once: true });
  });

  function ouvrirMenuOutil(outil, x, y) {
    fermerMenu();
    const state = ctx.etat.state;
    const peut = assis();
    const item = (libelle, action, options = {}) => el("button", { type: "button", class: `item${options.danger ? " danger" : ""}`, disabled: !peut || options.off,
      onclick: () => { action(); fermerMenu(); } }, libelle);
    const items = [];
    if (outil === "pioche") {
      const premiere = state.piles.encounter.length ? state.cards[state.piles.encounter[0]] : null;
      items.push(el("p", { class: "titre-menu", text: `Pioche de rencontre — ${state.piles.encounter.length}` }));
      items.push(item("Piocher (retourner la première carte)", () => ctx.envoyer({ t: "drawEncounter" }), { off: Boolean(premiere?.faceUp) || (!state.piles.encounter.length && !state.piles.encounterDiscard.length) }));
      items.push(item("Chercher (puis mélanger)", () => ctx.envoyer({ t: "searchEncounter", pile: "encounter" }), { off: !state.piles.encounter.length }));
      items.push(item("Mélanger", () => ctx.envoyer({ t: "shufflePile", pile: "encounter" }), { off: !state.piles.encounter.length }));
    } else if (outil === "defausse") {
      const n = state.piles.encounterDiscard.length;
      items.push(el("p", { class: "titre-menu", text: `Défausse de rencontre — ${n}` }));
      items.push(item("Consulter", () => ctx.envoyer({ t: "searchEncounter", pile: "encounterDiscard" }), { off: !n }));
      items.push(item("Remélanger dans la pioche", () => { if (confirm(`Remélanger les ${n} cartes de la défausse dans la pioche ?`)) ctx.envoyer({ t: "reshuffleDiscard" }); }, { off: !n }));
    } else if (outil.startsWith("pile:")) {
      const id = outil.slice(5);
      const def = ctx.scenario.piles?.find((p) => p.id === id);
      const ids = state.piles[id] ?? [];
      const haut = ids.length ? state.cards[ids[0]] : null;
      items.push(el("p", { class: "titre-menu", text: `${def?.label ?? id} — ${ids.length}` }));
      items.push(item("Piocher (retourner la première carte)", () => ctx.envoyer({ t: "drawEncounter", pile: id }), { off: Boolean(haut?.faceUp) || !ids.length }));
      items.push(item("Chercher (puis mélanger)", () => ctx.envoyer({ t: "searchEncounter", pile: id }), { off: !ids.length }));
      items.push(item("Mélanger", () => ctx.envoyer({ t: "shufflePile", pile: id }), { off: !ids.length }));
    } else if (outil === "sac") {
      items.push(el("p", { class: "titre-menu", text: `Sac du chaos — ${state.chaos.bag.length} jetons` }));
      items.push(item("Tirer un jeton", () => ctx.envoyer({ t: "chaosDraw" }), { off: !state.chaos.bag.length }));
      items.push(item("Tout remettre", () => ctx.envoyer({ t: "chaosReturn" }), { off: !state.chaos.drawn.length }));
      items.push(item("Composition", () => document.querySelector("#chaos .sac-popover")?.classList.toggle("epingle"), { off: false }));
      items.push(item("Ajuster…", () => ouvrirAjustementSac(ctx)));
    }
    menu = el("div", { class: "menu-carte", role: "menu" }, ...items);
    menu.pos = null;
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }
  // Composition épinglée : un clic ailleurs la referme.
  document.addEventListener("pointerdown", (e) => {
    const pop = document.querySelector("#chaos .sac-popover.epingle");
    if (pop && !e.target.closest("#chaos, .menu-carte")) pop.classList.remove("epingle");
  });

  function fermerMenu() { menu?.remove(); menu = null; }

  function ouvrirMenu(elem, x, y) {
    fermerMenu();
    const carte = carteDe(elem);
    if (!carte) return;
    const def = ctx.defs.get(carte.code);
    const peut = assis();
    const item = (libelle, action, options = {}) => el("button", { type: "button", class: `item${options.danger ? " danger" : ""}`, disabled: !peut && !options.libre,
      onclick: () => { action(); fermerMenu(); } }, libelle);
    const jeton = (token) => el("div", { class: "item jetons-ligne" },
      el("span", { text: LIBELLES_JETONS[token] }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: -1 }) }, "−"),
      el("span", { class: "valeur", text: String(carte.tokens[token] ?? 0) }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: 1 }) }, "+"));

    const items = [];
    const nom = ctx.investigateurs.get(carte.code)?.name ?? def?.name ?? carte.code;
    items.push(el("p", { class: "titre-menu", text: nom }));
    if (elem.dataset.loupe === "1") items.push(item("Agrandir", () => document.dispatchEvent(new CustomEvent("ahwa:loupe", { detail: elem })), { libre: true }));
    const rencontre = ["enemy", "treachery", "asset", "story"].includes(carte.kind);
    if (carte.kind === "agenda" || carte.kind === "act") {
      const agenda = carte.kind === "agenda";
      const courant = carte.id === (agenda ? ctx.etat.state.agendaId : ctx.etat.state.actId);
      items.push(item(carte.faceUp ? "Retourner (lire le verso)" : "Retourner (recto)", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (courant) items.push(item(agenda ? "Avancer l'agenda (celui-ci part hors jeu)" : "Avancer l'acte (celui-ci part hors jeu)", () => ctx.envoyer({ t: agenda ? "advanceAgenda" : "advanceAct" })));
      if (carte.loc.zone !== "aside") items.push(item(courant ? "Hors jeu (le suivant sort)" : "Hors jeu (de côté)", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "aside", x: 9999, y: 0 })));
      if (carte.loc.zone !== "board") items.push(item("Sur le tapis (pour lire)", () => ctx.envoiSurTapis(carte)));
      if (carte.loc.zone !== "story") items.push(item("Ramener dans l'histoire", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "story", x: 0, y: 0 })));
      for (const t of agenda ? ["doom"] : ["clue"]) items.push(jeton(t));
    } else if (carte.kind !== "mini") {
      items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") items.push(item("Révéler (indices automatiques)", () => ctx.envoyer({ t: "revealLocation", id: carte.id })));
      if (carte.kind === "location" && (carte.tokens.clue ?? 0) > 0) items.push(item("Prendre 1 indice", () => ctx.envoyer({ t: "takeClue", id: carte.id })));
      if (carte.kind === "location" && carte.loc.zone === "board") {
        items.push(item("Relier à un autre lieu…", () => { modeLien = carte.id; document.body.classList.add("mode-lien"); encart("Cliquez sur le lieu de destination (Échap pour annuler).", "info"); }));
        if ((ctx.etat.state.links ?? []).some((l) => l.a === carte.id || l.b === carte.id)) items.push(item("Effacer ses chemins", () => ctx.envoyer({ t: "unlink", id: carte.id })));
      }
      if (!carte.storyBack && carte.kind !== "investigator") items.push(item("Retourner", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (carte.kind === "scenario" || carte.kind === "story") items.push(item("Autre face", () => ctx.envoyer({ t: "toggleSide", id: carte.id })));
      const jetons = carte.kind === "investigator" ? ["damage", "horror", "resource"]
        : carte.kind === "location" ? ["clue", "doom", "generic"]
        : carte.kind === "enemy" ? ["damage", "doom", "clue", "generic"]
        : ["damage", "horror", "doom", "clue", "generic"];
      for (const t of jetons) items.push(jeton(t));
      if (rencontre) {
        items.push(item("Défausser", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: "encounterDiscard" })));
        items.push(item("Sur la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: "encounter", top: true })));
        items.push(item("Sous la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: "encounter", top: false })));
      }
      if (carte.kind !== "investigator" && carte.kind !== "agenda" && carte.kind !== "act" && carte.kind !== "scenario") {
        if (carte.loc.zone !== "victory") items.push(item("Zone de victoire", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "victory", x: 9999, y: 0 })));
        if (carte.loc.zone !== "aside") items.push(item("Mettre de côté", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "aside", x: 9999, y: 0 })));
        if (carte.loc.zone !== "board") items.push(item("Sur le tapis", () => ctx.envoiSurTapis(carte)));
        items.push(item("Retirer de la partie", () => { if (confirm(`Retirer « ${nom} » de la partie ?`)) ctx.envoyer({ t: "toPile", id: carte.id, pile: "removed" }); }, { danger: true }));
      }
    }
    menu = el("div", { class: "menu-carte", role: "menu" }, ...items);
    menu.pos = { elem, x, y };
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }
  document.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target)) fermerMenu(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { fermerMenu(); modeLien = null; document.body.classList.remove("mode-lien"); } });

  // Les lignes ± du menu restent ouvertes : le menu est reconstruit à chaque delta.
  document.addEventListener("ahwa:etat", () => {
    if (!menu) return;
    if (!menu.pos) { fermerMenu(); return; }
    const { elem, x, y } = menu.pos;
    if (document.contains(elem) && carteDe(elem)) ouvrirMenu(elem, x, y); else fermerMenu();
  });
  ctx.envoiSurTapis = (carte) => {
    // Pose au centre de la vue courante de la zone des lieux.
    const board = document.getElementById("board");
    const x = (board.clientWidth / 2 - vue.tx) / vue.k - 63, y = (board.clientHeight / 2 - vue.ty) / vue.k - 89;
    ctx.envoyer({ t: "moveCard", id: carte.id, zone: "board", x: Math.round(x), y: Math.round(y) });
  };
}
