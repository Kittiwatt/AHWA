// Interactions sur les cartes : glisser-déposer (message au lâcher), clic, double-clic, menu contextuel.

import { el } from "./dom.js";
import { vue } from "./tapis.js";

const LIBELLES_JETONS = { clue: "Indice", doom: "Doom", damage: "Dégât", horror: "Horreur", resource: "Ressource", generic: "Marqueur" };

export function initInteractions(ctx) {
  let drag = null;
  let dernierLacher = 0;
  let menu = null;
  let pressionLongue = null;

  const assis = () => ctx.etat.moi.seat !== null;
  const carteDe = (elem) => ctx.etat.state?.cards[elem?.dataset.id];

  // ---- Glisser-déposer ----
  document.addEventListener("pointerdown", (e) => {
    if (menu?.contains(e.target)) return;
    const elem = e.target.closest(".carte, .mini");
    if (!elem || e.button !== 0 || elem.closest("dialog, .loupe, .dos-pile")) return;
    if (!assis() || !carteDe(elem)) return;
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
    cible?.classList.add("depot-ok");
  });
  const finDrag = (e) => {
    clearTimeout(pressionLongue);
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.fantome) return;
    d.fantome.remove();
    d.elem.classList.remove("en-deplacement");
    for (const z of document.querySelectorAll(".depot-ok")) z.classList.remove("depot-ok");
    dernierLacher = Date.now();
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
    if (drop.startsWith("pile:")) {
      if (carte.kind === "mini" || carte.kind === "investigator") return;
      ctx.envoyer({ t: "toPile", id: carte.id, pile: drop.slice(5) });
      return;
    }
    if (carte.kind === "investigator") return;
    if (carte.kind === "mini" && drop !== "board") return;
    const r = cible.getBoundingClientRect();
    let x, y;
    if (drop === "board") {
      x = (e.clientX - d.dx - r.left - vue.tx) / vue.k;
      y = (e.clientY - d.dy - r.top - vue.ty) / vue.k;
    } else {
      x = e.clientX - d.dx - r.left + cible.scrollLeft;
      y = 0;
    }
    if (carte.loc.zone === drop && Math.abs(x - carte.loc.x) < 1 && Math.abs(y - carte.loc.y) < 1) return;
    ctx.envoyer({ t: "moveCard", id: carte.id, zone: drop, x: Math.round(x), y: Math.round(y) });
  }

  // ---- Clic : lieu face cachée = révélation ; double-clic : épuiser / redresser ----
  document.addEventListener("click", (e) => {
    if (Date.now() - dernierLacher < 200) { e.stopPropagation(); return; }
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .dos-pile, .loupe") || !assis()) return;
    const carte = carteDe(elem);
    if (!carte) return;
    if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") ctx.envoyer({ t: "revealLocation", id: carte.id });
  });
  document.addEventListener("dblclick", (e) => {
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .dos-pile, .loupe") || !assis()) return;
    const carte = carteDe(elem);
    if (!carte) return;
    e.preventDefault();
    ctx.envoyer({ t: "exhaust", id: carte.id });
  });

  // ---- Menu contextuel ----
  document.addEventListener("contextmenu", (e) => {
    const elem = e.target.closest(".carte, .mini");
    if (!elem || elem.closest("dialog, .loupe") || !carteDe(elem)) return;
    e.preventDefault();
    ouvrirMenu(elem, e.clientX, e.clientY);
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
    if (carte.kind !== "mini") {
      items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") items.push(item("Révéler (indices automatiques)", () => ctx.envoyer({ t: "revealLocation", id: carte.id })));
      if (!carte.storyBack && carte.kind !== "investigator") items.push(item("Retourner", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (carte.kind === "scenario" || carte.kind === "story") items.push(item("Autre face", () => ctx.envoyer({ t: "toggleSide", id: carte.id })));
      const jetons = carte.kind === "investigator" ? ["damage", "horror", "resource"]
        : carte.kind === "location" ? ["clue", "doom", "generic"]
        : carte.kind === "agenda" ? ["doom"]
        : carte.kind === "act" ? ["clue"]
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
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerMenu(); });

  // Les lignes ± du menu restent ouvertes : le menu est reconstruit à chaque delta.
  document.addEventListener("ahwa:etat", () => {
    if (!menu) return;
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
