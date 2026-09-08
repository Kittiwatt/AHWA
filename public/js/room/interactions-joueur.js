// Interactions du board joueur (cahier §10.5, étape 2) : glisser-déposer entre pioche, main, défausse, en jeu,
// en cours, hors jeu et zone de menace ; clic sur la pioche = piocher ; sélection pour le mulligan ; menus des
// cartes et des piles ; fenêtre de consultation (recherche, regarder les premières, défausse).
// Tout passe par ctx.envoyer : un geste = un message. Seul le siège agit sur son board (ctx.peutAgir()).

import { el } from "./dom.js";
import { CDN, faceVisible, urlArkhamDB } from "./cartes.js";

import { libelleUses } from "./uses.js";

const LIBELLES_JETONS = { uses: "Uses", damage: "Dégât", horror: "Horreur", doom: "Doom", clue: "Indice", generic: "Marqueur" };
export { libelleUses };

export function initInteractionsJoueur(ctx) {
  let drag = null, menu = null, pressionLongue = null, dernierLacher = 0;
  const carteDe = (elem) => ctx.etat.state?.cards[elem?.dataset.id];
  const n = () => ctx.vue;
  const piles = () => ({ deck: `pdeck${n()}`, hand: `phand${n()}`, discard: `pdiscard${n()}`, weak: `pweak${n()}` });
  const zones = () => ({ play: `pplay${n()}`, event: `pevent${n()}`, commit: `pcommit${n()}`, aside: `paside${n()}`, seat: `seat${n()}` });

  // ---- Glisser-déposer ----
  document.addEventListener("pointerdown", (e) => {
    if (menu?.contains(e.target)) return;
    // Depuis la pioche : glisser la première carte, face cachée, vers une zone du board (p:drawTo).
    const dos = e.target.closest(".pioche-joueur .dos-bouton");
    if (dos && e.button === 0 && ctx.peutAgir() && !dos.disabled) {
      e.preventDefault();   // sinon le navigateur entame le glisser natif de l'image du dos (pointercancel)
      const r = dos.getBoundingClientRect();
      drag = { elem: dos, id: null, pioche: true, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, fantome: null };
      return;
    }
    const elem = e.target.closest(".carte");
    if (!elem || e.button !== 0 || elem.closest("dialog, .loupe") || e.target.closest("button, .chips")) return;
    if (!ctx.peutAgir() || !carteDe(elem)) return;
    e.preventDefault();
    window.getSelection?.()?.removeAllRanges();
    const r = elem.getBoundingClientRect();
    drag = { elem, id: elem.dataset.id, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, fantome: null };
    if (e.pointerType === "touch") pressionLongue = setTimeout(() => { if (drag && !drag.fantome) { drag = null; ouvrirMenu(elem, e.clientX, e.clientY); } }, 550);
  });
  document.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.fantome) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      clearTimeout(pressionLongue);
      const f = drag.elem.cloneNode(true);
      if (drag.pioche) { f.classList.add("carte", "retournee"); f.removeAttribute("disabled"); }
      f.classList.add("fantome");
      f.style.width = `${drag.w}px`; f.style.height = `${drag.h}px`;
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
    dernierLacher = Date.now();
    if (e.type === "pointercancel") return;
    const cible = cibleSous(e.clientX, e.clientY);
    if (cible && d.pioche) deposerDepuisPioche(d, cible, e);
    else if (cible) deposer(d, cible, e);
  };

  /** La première carte de la pioche, face cachée, dans une zone du board (en jeu à la position lâchée). */
  function deposerDepuisPioche(d, cible, e) {
    const drop = cible.dataset.drop;
    const z = zones();
    if (![z.play, z.event, z.commit, z.aside, z.seat].includes(drop)) return;
    const r = cible.getBoundingClientRect();
    const x = Math.max(0, Math.round(e.clientX - d.dx - r.left + cible.scrollLeft)), y = Math.max(0, Math.round(e.clientY - d.dy - r.top + cible.scrollTop));
    ctx.envoyer({ t: "p:drawTo", zone: drop, x, y });
  }
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
    if (drop === "none") return;
    const p = piles(), z = zones();
    const mienne = carte.player && carte.ownerSeat === n();
    if (drop === `pile:${p.hand}`) { if (mienne && carte.loc.pile !== p.hand) ctx.envoyer({ t: "p:toHand", id: carte.id }); return; }
    if (drop === `pile:${p.discard}`) { if (mienne) ctx.envoyer({ t: "p:discard", id: carte.id }); else ctx.envoyer({ t: "toPile", id: carte.id, pile: "encounterDiscard" }); return; }
    if (drop === `pile:${p.deck}`) { if (mienne) ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, top: true }); return; }
    if (drop.startsWith("pile:")) return;
    if (drop === z.play || drop === z.event || drop === z.commit || drop === z.aside) { if (!mienne) return; }
    else if (drop !== z.seat) return;
    // Depuis la main ou hors jeu : glisser = poser **sans payer** dans la zone visée (en jeu, Play ou Commit) ;
    // l'auto-pay se fait par le bouton « AP » de la carte en main (retour de test du 2026-09-09).
    if (carte.loc.pile === p.hand || carte.loc.zone === z.aside) {
      if (drop === z.play || drop === z.event || drop === z.commit) {
        const r0 = cible.getBoundingClientRect();
        const px = drop === z.play ? Math.max(0, Math.round(e.clientX - d.dx - r0.left + cible.scrollLeft)) : 9999;
        const py = drop === z.play ? Math.max(0, Math.round(e.clientY - d.dy - r0.top + cible.scrollTop)) : 0;
        ctx.envoyer({ t: "p:put", id: carte.id, zone: drop, x: px, y: py });
        return;
      }
    }
    if (drop === z.event) { ctx.envoyer({ t: "moveCard", id: carte.id, zone: drop, x: 0, y: 0 }); return; }
    const r = cible.getBoundingClientRect();
    let x, y = 0;
    if (drop === z.play) { x = e.clientX - d.dx - r.left + cible.scrollLeft; y = e.clientY - d.dy - r.top + cible.scrollTop; }
    else x = e.clientX - d.dx - r.left + cible.scrollLeft;
    x = Math.max(0, Math.round(x)); y = Math.max(0, Math.round(y));
    if (carte.loc.zone === drop && Math.abs(x - carte.loc.x) < 1 && Math.abs(y - carte.loc.y) < 1) return;
    ctx.envoyer({ t: "moveCard", id: carte.id, zone: drop, x, y });
  }

  /** Auto-pay (« AP ») : coût imprimé déduit (X demandé), refusé faute de ressources ; le serveur range la carte
   *  selon son type — soutien en jeu, événement dans Play, skill dans Commit (les skills n'ont pas de coût). */
  const jouer = (carte) => autoPay(ctx, carte);

  // ---- Clics : pioche = piocher ; main pendant le mulligan = sélection ; chips ±1 ; double-clic = épuiser ----
  document.addEventListener("click", (e) => {
    if (Date.now() - dernierLacher < 200) { e.stopPropagation(); return; }
    if (!ctx.peutAgir()) return;
    const dos = e.target.closest(".pioche-joueur .dos-bouton");
    if (dos) { ctx.envoyer({ t: "p:draw", n: 1 }); return; }
    const chip = e.target.closest(".chip");
    const pmj = e.target.closest(".jeton .pmj");
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe")) return;
    const carte = carteDe(elem);
    if (!carte) return;
    if (pmj) { e.preventDefault(); e.stopPropagation(); ctx.envoyer({ t: "addToken", id: carte.id, token: pmj.closest(".jeton").dataset.token, delta: pmj.classList.contains("moins") ? -1 : 1 }); return; }
    if (e.target.closest(".ap")) { e.preventDefault(); e.stopPropagation(); jouer(carte); return; }
    if (chip) {
      e.preventDefault();
      const bouton = e.target.closest(".chip-moins, .chip-plus");
      ctx.envoyer({ t: "addToken", id: carte.id, token: chip.dataset.token, delta: bouton ? Number(bouton.dataset.delta) : chip.dataset.inverse ? -1 : 1 });
      return;
    }
    const deck = ctx.etat.state.seats[n()].deck;
    if (elem.closest(".eventail") && deck?.board.setup === "mulligan") {
      if (ctx.selection.has(carte.id)) ctx.selection.delete(carte.id); else ctx.selection.add(carte.id);
      document.dispatchEvent(new CustomEvent("ahwa:selection"));
    }
  });
  document.addEventListener("dblclick", (e) => {
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe, .eventail, .dos-pile") || !ctx.peutAgir()) return;
    const carte = carteDe(elem);
    if (!carte || e.target.closest(".chip")) return;
    e.preventDefault();
    ctx.envoyer({ t: "exhaust", id: carte.id });
  });

  // ---- Menus ----
  document.addEventListener("contextmenu", (e) => {
    const elem = e.target.closest(".carte");
    const outil = e.target.closest("[data-outil]");
    // Sur la défausse ou la pile hors jeu, la carte du dessus est la pile : son clic droit ouvre le menu de la pile
    // (rechercher, reprendre la dernière…), sinon le menu de la pile serait inaccessible dès qu'elle contient une carte
    // (retour de test du 2026-09-09). La pioche garde le menu de la carte révélée dessus.
    const pileEntiere = outil && elem?.closest(".dos-pile") && [piles().discard, zones().aside].includes(outil.dataset.outil);
    if (outil && (pileEntiere || !(elem && carteDe(elem)))) { e.preventDefault(); ouvrirMenuOutil(outil.dataset.outil, e.clientX, e.clientY); return; }
    if (!elem || elem.closest("dialog, .loupe") || !carteDe(elem)) return;
    e.preventDefault();
    ouvrirMenu(elem, e.clientX, e.clientY);
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const outil = e.target.closest("[data-outil]");
    if (!outil) return;
    const t = setTimeout(() => ouvrirMenuOutil(outil.dataset.outil, e.clientX, e.clientY), 550);
    const annuler = () => clearTimeout(t);
    document.addEventListener("pointerup", annuler, { once: true });
    document.addEventListener("pointermove", annuler, { once: true });
  });
  document.addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target)) fermerMenu(); }, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") fermerMenu(); });
  document.addEventListener("ahwa:etat", () => {
    if (!menu) return;
    if (!menu.pos) { fermerMenu(); return; }
    const { elem, x, y } = menu.pos;
    if (document.contains(elem) && carteDe(elem)) ouvrirMenu(elem, x, y); else fermerMenu();
  });

  function fermerMenu() { menu?.remove(); menu = null; }
  function poser(items, x, y, pos) {
    menu = el("div", { class: "menu-carte", role: "menu" }, ...items);
    menu.pos = pos;
    document.body.append(menu);
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  }

  function ouvrirMenuOutil(outil, x, y) {
    fermerMenu();
    const state = ctx.etat.state;
    const peut = ctx.peutAgir();
    const p = piles();
    const item = (libelle, action, options = {}) => el("button", { type: "button", class: "item", disabled: !peut || options.off, onclick: () => { action(); fermerMenu(); } }, libelle);
    const items = [];
    if (outil === p.deck) {
      const nb = state.piles[p.deck]?.length ?? 0;
      items.push(el("p", { class: "titre-menu", text: `Pioche — ${nb}` }));
      for (const k of [1, 2, 3]) items.push(item(`Piocher ${k}`, () => ctx.envoyer({ t: "p:draw", n: k }), { off: !nb && !(state.piles[p.discard]?.length) }));
      items.push(item("Chercher (puis mélanger)", () => { ctx.derniereRecherche = { pile: p.deck, complete: true }; ctx.envoyer({ t: "p:search", pile: p.deck }); }, { off: !nb }));
      for (const k of [1, 2, 3, 5]) if (nb >= k) items.push(item(`Regarder les ${k} première${k > 1 ? "s" : ""}`, () => { ctx.derniereRecherche = { pile: p.deck, complete: false }; ctx.envoyer({ t: "p:search", pile: p.deck, n: k }); }));
      items.push(item("Poser la première carte face cachée (en jeu)", () => ctx.envoyer({ t: "p:drawTo", zone: zones().play, x: 9999, y: 0 }), { off: !nb }));
      items.push(item("Mélanger", () => ctx.envoyer({ t: "shufflePile", pile: p.deck }), { off: !nb }));
    } else if (outil === p.discard) {
      const ids = state.piles[p.discard] ?? [];
      items.push(el("p", { class: "titre-menu", text: `Défausse — ${ids.length}` }));
      items.push(item("Rechercher (sans mélanger)", () => { ctx.derniereRecherche = { pile: p.discard, complete: false }; ctx.envoyer({ t: "p:search", pile: p.discard }); }, { off: !ids.length }));
      items.push(item("Reprendre la dernière en main", () => ctx.envoyer({ t: "p:toHand", id: ids[0] }), { off: !ids.length }));
      items.push(item("Remettre la dernière sur la pioche", () => ctx.envoyer({ t: "toPile", id: ids[0], pile: p.deck, top: true }), { off: !ids.length }));
    } else if (outil === zones().aside) {
      const cote = Object.values(state.cards).filter((c) => c.loc.zone === outil).sort((a, b) => b.loc.x - a.loc.x || b.loc.z - a.loc.z);
      items.push(el("p", { class: "titre-menu", text: `Hors jeu — ${cote.length}` }));
      items.push(item("Chercher", () => ouvrirDialogueBoard(ctx, outil, cote.map((c) => ({ id: c.id, code: c.code }))), { off: !cote.length }));
    } else return;
    poser(items, x, y, null);
  }

  function ouvrirMenu(elem, x, y) {
    fermerMenu();
    const carte = carteDe(elem);
    if (!carte) return;
    const state = ctx.etat.state;
    const def = ctx.defs.get(carte.code);
    const peut = ctx.peutAgir();
    const p = piles(), z = zones();
    const mienne = carte.player && carte.ownerSeat === n();
    const item = (libelle, action, options = {}) => el("button", { type: "button", class: `item${options.danger ? " danger" : ""}`, disabled: !peut && !options.libre, onclick: () => { action(); fermerMenu(); } }, libelle);
    const jeton = (token, libelle) => el("div", { class: "item jetons-ligne" },
      el("span", { text: libelle ?? LIBELLES_JETONS[token] }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: -1 }) }, "−"),
      el("span", { class: "valeur", text: String(carte.tokens[token] ?? 0) }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: 1 }) }, "+"));
    const items = [];
    const nom = ctx.investigateurs.get(carte.code)?.name ?? faceVisible(carte, def).name ?? carte.code;
    items.push(el("p", { class: "titre-menu", text: nom }));
    const enMain = carte.loc.pile === p.hand;
    if (elem.dataset.loupe === "1" || (enMain && mienne)) items.push(item("Agrandir", () => document.dispatchEvent(new CustomEvent("ahwa:loupe", { detail: elem })), { libre: true }));
    // Page de la carte sur ArkhamDB, dans un nouvel onglet — pour une face visible du lecteur : carte face visible, carte de
    // sa main, carte révélée à tous (retour de test du 2026-09-09).
    const adb = carte.faceUp || carte.revealed === true || (enMain && (mienne || ctx.regarder)) ? urlArkhamDB(carte, def) : null;
    if (adb) items.push(item("Voir sur ArkhamDB", () => window.open(adb, "_blank", "noopener"), { libre: true }));
    if (mienne && enMain) {
      const cout = def?.cost;
      const libelleJouer = cout === -2 ? "Auto-pay : jouer (X…)" : typeof cout === "number" && cout > 0 ? `Auto-pay : jouer (payer ${cout})` : "Auto-pay : jouer";
      items.push(item(libelleJouer, () => jouer(carte)));
      const typeCarte = def?.type;
      items.push(item(typeCarte === "event" ? "Dans Play (sans payer)" : typeCarte === "skill" ? "Dans Commit" : "En jeu (sans payer)", () => ctx.envoyer({ t: "p:put", id: carte.id, zone: typeCarte === "event" ? z.event : typeCarte === "skill" ? z.commit : z.play, x: 9999, y: 0 })));
      items.push(item(carte.revealed ? "Masquer aux autres" : "Révéler à tous", () => ctx.envoyer({ t: "p:reveal", id: carte.id })));
      items.push(item("Défausser", () => ctx.envoyer({ t: "p:discard", id: carte.id })));
      items.push(item("Sur la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, top: true })));
      items.push(item("Sous la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, top: false })));
      items.push(item("Mélanger dans la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, shuffle: true })));
      items.push(item("Hors jeu (de côté)", () => ctx.envoyer({ t: "p:aside", id: carte.id })));
      items.push(item("Retirer de la partie", () => { if (confirm(`Retirer « ${nom} » de la partie ?`)) ctx.envoyer({ t: "p:exile", id: carte.id }); }, { danger: true }));
    } else if (mienne) {
      const enJeu = carte.loc.zone === z.play, enPlay = carte.loc.zone === z.event, enCours = carte.loc.zone === z.commit, cote = carte.loc.zone === z.aside, dansPile = "pile" in carte.loc;
      if (!dansPile) items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      // Retourner : une carte dont le verso est une autre carte (Sophie…) bascule de face ; les autres montrent leur dos.
      if (!dansPile) items.push(def?.backCode
        ? item(carte.side === "b" ? `Autre face (${def.name})` : `Autre face (${def.backName ?? "verso"})`, () => ctx.envoyer({ t: "toggleSide", id: carte.id }))
        : item(carte.faceUp ? "Retourner (face cachée)" : "Retourner (face visible)", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (!dansPile) {
        if (def?.uses) items.push(jeton("uses", `Uses (${libelleUses(def.uses.type)})`));
        if (def?.health !== undefined) items.push(jeton("damage"));
        if (def?.sanity !== undefined) items.push(jeton("horror"));
        items.push(jeton("generic"));
      }
      if (enJeu || enCours || enPlay) items.push(item("Poser sur mon lieu (tapis)", () => ctx.envoyer({ t: "p:toLocation", id: carte.id })));
      items.push(item("En main", () => ctx.envoyer({ t: "p:toHand", id: carte.id })));
      if (!enJeu) items.push(item(cote ? "Mettre en jeu (gratuit)" : "En jeu", () => ctx.envoyer(cote ? { t: "p:play", id: carte.id } : { t: "moveCard", id: carte.id, zone: z.play, x: 9999, y: 0 })));
      if (!enPlay) items.push(item("Play (événement)", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: z.event, x: 0, y: 0 })));
      if (!enCours) items.push(item("Commit (engagée au test)", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: z.commit, x: 9999, y: 0 })));
      if (carte.loc.pile !== p.discard) items.push(item("Défausser", () => ctx.envoyer({ t: "p:discard", id: carte.id })));
      items.push(item("Sur la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, top: true })));
      items.push(item("Sous la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, top: false })));
      items.push(item("Mélanger dans la pioche", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.deck, shuffle: true })));
      if (!cote) items.push(item("Hors jeu (de côté)", () => ctx.envoyer({ t: "p:aside", id: carte.id })));
      if (carte.loc.zone !== z.seat) items.push(item("Zone de menace", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: z.seat, x: 9999, y: 0 })));
      items.push(item("Retirer de la partie", () => { if (confirm(`Retirer « ${nom} » de la partie ?`)) ctx.envoyer({ t: "p:exile", id: carte.id }); }, { danger: true }));
    } else if (carte.kind !== "investigator") {
      // Carte de rencontre engagée (zone de menace) : gestes du tapis les plus utiles.
      items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      for (const t of carte.kind === "enemy" ? ["damage", "doom", "clue"] : ["damage", "horror", "doom", "clue", "generic"]) items.push(jeton(t));
      items.push(item("Défausser (rencontre)", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: "encounterDiscard" })));
      items.push(item("Sur le tapis", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "board", x: 737, y: 411 })));
    }
    poser(items, x, y, { elem, x, y });
  }
}

/** Auto-pay : paie le coût (X demandé) et range la carte selon son type (en jeu / Play / Commit) — depuis la main, la
 *  défausse ou hors jeu. Renvoie false si le joueur a annulé la saisie de X. */
export function autoPay(ctx, carte) {
  const def = ctx.defs.get(carte.code);
  if (def?.cost === -2) {
    const v = prompt("Cette carte coûte X : combien de ressources ?", "0");
    if (v === null) return false;
    ctx.envoyer({ t: "p:play", id: carte.id, cost: Math.max(0, Number(v) || 0) });
  } else ctx.envoyer({ t: "p:play", id: carte.id });
  return true;
}

/** Libellé de l'auto-pay d'une carte : coût et destination selon son type. */
export function titreAutoPay(def) {
  const cout = def?.cost;
  return `Auto-pay : ${cout === -2 ? "payer X et jouer" : typeof cout === "number" && cout > 0 ? `payer ${cout} et jouer` : "jouer (sans coût)"} — ${def?.type === "event" ? "dans Play" : def?.type === "skill" ? "dans Commit" : "en jeu"}`;
}

/** Fenêtre de consultation d'une pile du board (recherche, premières cartes, défausse) : agir carte par carte. */
export function ouvrirDialogueBoard(ctx, pile, cartes) {
  const n = ctx.vue;
  const pioche = pile === `pdeck${n}`;
  const horsJeu = pile === `paside${n}`;   // zone hors jeu montrée comme une pile : les cartes sont déjà connues du client
  const complete = Boolean(ctx.derniereRecherche?.complete) && ctx.derniereRecherche?.pile === pile;
  const liste = el("div", { class: "grille-cartes" });
  const rendre = (restantes) => liste.replaceChildren(...restantes.map((c) => {
    const def = ctx.defs.get(c.code);
    const agir = (msg) => { ctx.envoyer(msg); rendre(restantes.filter((x) => x.id !== c.id)); };
    // Défausse : « Auto-pay » paie le coût et joue la carte selon son type (retour de test du 2026-09-09).
    const auto = !pioche && !horsJeu ? [["Auto-pay", null, () => { const etat = ctx.etat.state.cards[c.id]; if (etat && autoPay(ctx, etat)) rendre(restantes.filter((x) => x.id !== c.id)); }, titreAutoPay(def)]] : [];
    const boutons = pioche
      ? [["En main", { t: "p:toHand", id: c.id }], ["Défausser", { t: "p:discard", id: c.id }], ["En jeu", { t: "moveCard", id: c.id, zone: `pplay${n}`, x: 9999, y: 0 }]]
      : horsJeu
        ? [["En jeu", { t: "moveCard", id: c.id, zone: `pplay${n}`, x: 9999, y: 0 }], ["En main", { t: "p:toHand", id: c.id }], ["Défausser", { t: "p:discard", id: c.id }], ["Sur la pioche", { t: "toPile", id: c.id, pile: `pdeck${n}`, top: true }]]
        : [...auto, ["En main", { t: "p:toHand", id: c.id }], ["Sur la pioche", { t: "toPile", id: c.id, pile: `pdeck${n}`, top: true }], ["Sous la pioche", { t: "toPile", id: c.id, pile: `pdeck${n}`, top: false }], ["Mélanger", { t: "toPile", id: c.id, pile: `pdeck${n}`, shuffle: true }]];
    return el("figure", { class: "carte-peek" },
      el("img", { src: `${CDN}${c.code}.webp`, alt: def?.name ?? c.code, loading: "lazy" }),
      el("figcaption", {}, el("span", { text: def?.name ?? c.code }),
        ctx.peutAgir() ? el("span", { class: "actions-peek" }, ...boutons.map(([lib, msg, action, titre]) => el("button", { class: `lien-outil${lib === "Auto-pay" ? " auto-pay" : ""}`, type: "button", title: titre ?? null, onclick: () => (action ? action() : agir(msg)) }, lib))) : null));
  }));
  rendre(cartes);
  const nb = `${cartes.length} carte${cartes.length > 1 ? "s" : ""}`;
  const titre = pioche ? (complete ? `Pioche — ${nb} (du dessus au dessous)` : `Pioche — les ${cartes.length} première${cartes.length > 1 ? "s" : ""} (ordre conservé)`)
    : horsJeu ? `Hors jeu — ${nb} (la dernière arrivée d'abord)` : `Défausse — ${nb} (la plus récente d'abord, ordre conservé)`;
  const d = el("dialog", { class: "dialogue" },
    el("header", {}, el("h2", { text: titre }), el("button", { class: "bouton", type: "button", onclick: () => d.close() }, pioche && complete ? "Fermer et mélanger" : "Fermer")),
    cartes.length ? liste : el("p", { class: "vide", text: "Aucune carte." }));
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  if (pioche && complete) d.addEventListener("close", () => { if (ctx.peutAgir()) ctx.envoyer({ t: "shufflePile", pile }); }, { once: true });
  d.showModal();
}
