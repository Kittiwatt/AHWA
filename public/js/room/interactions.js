// Interactions sur les cartes : glisser-déposer (message au lâcher), clic, double-clic, menu contextuel.

import { el } from "./dom.js";
import { faceVisible, cleDeCouleur, INONDATION, urlArkhamDB } from "./cartes.js";
import { vue, setAsideActif, cheminProvisoire, versTapis, centreLieu, journalLocal } from "./tapis.js";
import { nomSiege } from "./lobby.js";
import { libelleUses } from "./uses.js";
import { ouvrirAjustementSac } from "./dialogues.js";

const LIBELLES_JETONS = { clue: "Indice", doom: "Doom", damage: "Dégât", horror: "Horreur", resource: "Ressource", generic: "Marqueur", uses: "Uses" };

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
      if (carte.kind === "mini" || carte.kind === "key" || carte.kind === "investigator") return;
      ctx.envoyer({ t: "toPile", id: carte.id, pile: drop.slice(5) });
      return;
    }
    if (carte.kind === "investigator") return;
    if (carte.kind === "mini" && drop !== "board") return;
    // Une clé va sur le tapis (lieu, ennemi), sur un siège (l'enquêteur la contrôle) ou de côté.
    if (carte.kind === "key" && !(drop === "board" || drop === "aside" || drop.startsWith("seat"))) return;
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
    const chip = e.target.closest(".chip");
    const pmj = e.target.closest(".jeton .pmj");
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe")) return;
    const carte = carteDe(elem);
    if (!carte) return;
    if (pmj) {
      e.preventDefault(); e.stopPropagation();
      ctx.envoyer({ t: "addToken", id: carte.id, token: pmj.closest(".jeton").dataset.token, delta: pmj.classList.contains("moins") ? -1 : 1 });
      return;
    }
    if (chip) {
      e.preventDefault();
      const bouton = e.target.closest(".chip-moins, .chip-plus");
      ctx.envoyer({ t: "addToken", id: carte.id, token: chip.dataset.token, delta: bouton ? Number(bouton.dataset.delta) : chip.dataset.inverse ? -1 : 1 });
      return;
    }
    if (elem.closest(".dos-pile")) return; // carte révélée sur la pioche ou dessus de la défausse : glisser seulement
    if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") {
      ctx.envoyer({ t: "revealLocation", id: carte.id });
      derniereRevelation = { id: carte.id, at: Date.now() }; // un double-clic qui suit ne doit pas la retourner aussitôt
    }
  });
  let derniereRevelation = null;
  document.addEventListener("dblclick", (e) => {
    const elem = e.target.closest(".carte");
    if (!elem || elem.closest("dialog, .loupe") || !assis()) return;
    const carte = carteDe(elem);
    if (!carte) return;
    e.preventDefault();
    if (e.target.closest(".chip")) return;
    if (e.target.closest(".jeton-clue") && carte.kind === "location") { ctx.envoyer({ t: "takeClue", id: carte.id }); return; }
    if (elem.closest(".dos-pile")) return;
    if (carte.kind === "location" && carte.loc.zone === "board") {
      // Double-clic sur un lieu du tapis : le retourner (lieu à deux faces de jeu : basculer sa face). Si le premier clic
      // vient de le révéler, on ne le retourne pas dans la foulée.
      if (derniereRevelation && derniereRevelation.id === carte.id && Date.now() - derniereRevelation.at < 800) return;
      const def = ctx.defs.get(carte.code);
      const deuxFaces = !carte.storyBack && def?.backCode && def?.backKind === "location";
      if (deuxFaces && carte.faceUp) ctx.envoyer({ t: "toggleSide", id: carte.id });
      else if (carte.faceUp && !carte.storyBack) ctx.envoyer({ t: "flipCard", id: carte.id });
      else if (!carte.faceUp) ctx.envoyer({ t: "revealLocation", id: carte.id });
      return;
    }
    ctx.envoyer({ t: "exhaust", id: carte.id });
  });

  // ---- Menu contextuel ----
  document.addEventListener("contextmenu", (e) => {
    const elem = e.target.closest(".carte, .mini");
    // Une carte révélée sur une pile a son propre menu (défausser, mélanger…) ; ailleurs sur la pile, le menu de la pile.
    const outil = e.target.closest("[data-outil]");
    if (outil && !(elem && carteDe(elem))) { e.preventDefault(); ouvrirMenuOutil(outil.dataset.outil, e.clientX, e.clientY); return; }
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
      const L = ctx.scenario.leads;
      items.push(el("p", { class: "titre-menu", text: `${def?.label ?? id} — ${ids.length}` }));
      if (L && id === L.secret) {
        items.push(el("p", { class: "sous", text: "Un suspect et une cachette, face cachée : seule l'accusation (panneau Pistes) les révèle." }));
      } else if (def?.isDiscard) {
        // Défausse d'une seconde pioche : consulter, remélanger dans sa pioche.
        const pioche = ctx.scenario.piles?.find((p) => p.discard === id);
        items.push(item("Consulter", () => ctx.envoyer({ t: "searchEncounter", pile: id }), { off: !ids.length }));
        if (pioche) items.push(item(`Remélanger dans ${pioche.label}`, () => { if (confirm(`Remélanger les ${ids.length} cartes de ${def.label} dans ${pioche.label} ?`)) ctx.envoyer({ t: "reshuffleDiscard", deck: pioche.id }); }, { off: !ids.length }));
      } else {
        const defausse = def?.discard ? (state.piles[def.discard] ?? []) : [];
        // Pile qui se forme en cours de partie (TIC « Tidal Tunnel deck ») avec les lieux de côté au dos voulu, mélangés.
        if (def?.gather) {
          const dispo = Object.values(state.cards).filter((c) => c.kind === "location" && c.loc.zone === "aside" && ctx.defs.get(c.code)?.backName === def.gather.backName).length;
          items.push(item(`Former la pile (${dispo} « ${def.gather.backName} » de côté, mélangés)`, () => ctx.envoyer({ t: "formPile", pile: id }), { off: !dispo }));
        }
        // Parley (The Vanishing of Elina Harper) : révéler 1 à 3 pistes pour tous, en prendre une, remélanger le reste.
        if (L && id === L.pile) for (const n of [1, 2, 3]) if (ids.length >= n) items.push(item(`Parley : révéler ${n} piste${n > 1 ? "s" : ""}`, () => ctx.envoyer({ t: "leadsReveal", n }), { off: Boolean(state.piles[L.shown]?.length) }));
        // Enfouissement (COB) : Julia + les premières cartes de la pioche, réparties sous les repaires.
        if (ctx.scenario.bury && id === "encounter") {
          items.push(item(ctx.scenario.bury.menuPile, () => ctx.envoyer({ t: "bury" }), { off: !ids.length && !defausse.length }));
        }
        items.push(item("Piocher (retourner la première carte)", () => ctx.envoyer({ t: "drawEncounter", pile: id }), { off: Boolean(haut?.faceUp) || (!ids.length && !defausse.length) }));
        items.push(item("Chercher (puis mélanger)", () => ctx.envoyer({ t: "searchEncounter", pile: id }), { off: !ids.length }));
        items.push(item("Mélanger", () => ctx.envoyer({ t: "shufflePile", pile: id }), { off: !ids.length }));
        // Tirage au hasard sans sortir la carte (« choisir un lieu au hasard ») : le nom s'affiche pour tous.
        for (const n of [1, 2, 3]) if (ids.length >= n) items.push(item(`Tirer ${n} au hasard (sans sortir)`, () => ctx.envoyer({ t: "randomPick", pile: id, n })));
        // Regarder seulement les premières cartes (« regardez les X premières cartes du Cosmos ») : aperçu privé, puis on glisse celle qu'on garde.
        for (const n of [1, 2, 3, 4]) if (ids.length >= n) items.push(item(`Regarder les ${n} première${n > 1 ? "s" : ""}`, () => ctx.envoyer({ t: "searchEncounter", pile: id, n })));
      }
    } else if (outil === "sac") {
      items.push(el("p", { class: "titre-menu", text: `Sac du chaos — ${state.chaos.bag.length} jetons` }));
      items.push(item("Tirer un jeton", () => ctx.envoyer({ t: "chaosDraw" }), { off: !state.chaos.bag.length }));
      items.push(item("Tout remettre", () => ctx.envoyer({ t: "chaosReturn" }), { off: !state.chaos.drawn.length }));
      items.push(item("Composition", () => document.querySelector("#chaos .sac-popover")?.classList.toggle("epingle"), { off: false }));
      items.push(item("Ajuster…", () => ouvrirAjustementSac(ctx)));
      // Scellage déclaré par le scénario (COB : jetons sang scellés sur les enquêteurs).
      const sc = ctx.scenario.seal;
      if (sc) {
        const dispo = state.chaos.bag.filter((t) => t === sc.token).length + state.chaos.drawn.filter((t) => t === sc.token).length;
        for (const s of state.seats.filter((s) => s.investigatorCode)) {
          const n = s.counters[sc.counter] ?? 0;
          items.push(item(`Sceller un jeton ${sc.label} sur ${nomSiege(s, ctx)} (${n}/${sc.maxPerSeat})`,
            () => ctx.envoyer({ t: "chaosSeal", seat: s.index }), { off: !dispo || n >= sc.maxPerSeat }));
        }
        for (const s of state.seats.filter((s) => (s.counters[sc.counter] ?? 0) > 0)) {
          items.push(item(`Libérer un jeton ${sc.label} de ${nomSiege(s, ctx)} (retour au sac)`,
            () => ctx.envoyer({ t: "chaosRelease", seat: s.index })));
        }
      }
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
    const item = (libelle, action, options = {}) => el("button", { type: "button", class: `item${options.danger ? " danger" : ""}`, disabled: (!peut && !options.libre) || options.off,
      onclick: () => { action(); fermerMenu(); } }, libelle);
    const jeton = (token, libelle) => el("div", { class: "item jetons-ligne" },
      el("span", { text: libelle ?? LIBELLES_JETONS[token] ?? token }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: -1 }) }, "−"),
      el("span", { class: "valeur", text: String(carte.tokens[token] ?? 0) }),
      el("button", { class: "pm", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "addToken", id: carte.id, token, delta: 1 }) }, "+"));

    const items = [];
    const nom = ctx.investigateurs.get(carte.code)?.name ?? faceVisible(carte, def).name ?? carte.code;
    items.push(el("p", { class: "titre-menu", text: nom }));
    if (elem.dataset.loupe === "1") items.push(item("Agrandir", () => document.dispatchEvent(new CustomEvent("ahwa:loupe", { detail: elem })), { libre: true }));
    // Page de la carte sur ArkhamDB, dans un nouvel onglet — seulement pour une face visible (retour de test du 2026-09-09).
    const adb = carte.faceUp ? urlArkhamDB(carte, def) : null;
    if (adb) items.push(item("Voir sur ArkhamDB", () => window.open(adb, "_blank", "noopener"), { libre: true }));
    const rencontre = !carte.player && ["enemy", "treachery", "asset", "story"].includes(carte.kind);
    if (carte.player) {
      // Carte d'un deck joueur posée sur le tapis (« Poser sur mon lieu ») ou dans une zone de menace : retour sur le
      // board de son siège, gestes d'usage ; seul son siège peut la renvoyer sur son board ou la défausser.
      const proprio = carte.ownerSeat;
      const mienne = ctx.etat.moi.seat === proprio;
      const nomProprio = nomSiege(ctx.etat.state.seats[proprio], ctx);
      items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      if (def?.uses) items.push(jeton("uses", `Uses (${libelleUses(def.uses.type)})`));
      if (def?.health !== undefined) items.push(jeton("damage"));
      if (def?.sanity !== undefined) items.push(jeton("horror"));
      items.push(jeton("generic"));
      items.push(item(`Reprendre sur le board de ${nomProprio}`, () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: `pplay${proprio}`, x: 9999, y: 0 }), { off: !mienne }));
      items.push(item(`Défausse de ${nomProprio}`, () => ctx.envoyer({ t: "p:discard", id: carte.id }), { off: !mienne }));
      if (carte.loc.zone !== "board") items.push(item("Sur le tapis", () => ctx.envoiSurTapis(carte)));
      if (carte.loc.zone !== `seat${proprio}`) items.push(item(`Zone de menace de ${nomProprio}`, () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: `seat${proprio}`, x: 9999, y: 0 })));
    } else if (carte.kind === "agenda" || carte.kind === "act") {
      const agenda = carte.kind === "agenda";
      const courant = carte.id === (agenda ? ctx.etat.state.agendaId : ctx.etat.state.actId);
      items.push(item(carte.faceUp ? "Retourner (lire le verso)" : "Retourner (recto)", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (courant) items.push(item(agenda ? "Avancer l'agenda (celui-ci part hors jeu)" : "Avancer l'acte (celui-ci part hors jeu)", () => ctx.envoyer({ t: agenda ? "advanceAgenda" : "advanceAct" })));
      if (carte.loc.zone !== "aside") items.push(item(courant ? "Hors jeu (le suivant sort)" : "Hors jeu (de côté)", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "aside", x: 9999, y: 0 })));
      if (carte.loc.zone !== "board") items.push(item("Sur le tapis (pour lire)", () => ctx.envoiSurTapis(carte)));
      if (carte.loc.zone !== "story") items.push(item("Ramener dans l'histoire", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "story", x: 0, y: 0 })));
      for (const t of agenda ? ["doom"] : ["clue"]) items.push(jeton(t));
    } else if (carte.kind === "proxy") {
      items.push(item("Retirer (un lieu prend sa place)", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: "removed" }), { danger: true }));
    } else if (carte.kind === "key") {
      // Clé de couleur (TIC) : deux faces ; un enquêteur qui en prend le contrôle la retourne (le dépôt sur un siège le fait aussi).
      if (cleDeCouleur(carte)) items.push(item(carte.faceUp ? "Retourner (face cachée)" : "Retourner (regarder la couleur)", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      for (const s of ctx.etat.state.seats) {
        if (!s.investigatorCode || carte.loc.zone === `seat${s.index}`) continue;
        items.push(item(`Contrôlée par ${nomSiege(s, ctx)}`, () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: `seat${s.index}`, x: 9999, y: 0 })));
      }
      if (carte.loc.zone !== "aside") items.push(item("Mettre de côté", () => ctx.envoyer({ t: "moveCard", id: carte.id, zone: "aside", x: 9999, y: 0 })));
      if (carte.loc.zone !== "board") items.push(item("Sur le tapis", () => ctx.envoiSurTapis(carte)));
    } else if (carte.kind !== "mini") {
      items.push(item(carte.exhausted ? "Redresser" : "Épuiser", () => ctx.envoyer({ t: "exhaust", id: carte.id })));
      // Enfouissement (COB) : Julia, posée sur un repaire, s'enfouit dessous avec 1 carte de la pioche.
      if (ctx.scenario.bury?.withAny.includes(carte.code) && carte.loc.zone === "board") {
        items.push(item(ctx.scenario.bury.menuCard, () => ctx.envoyer({ t: "buryAt", id: carte.id })));
      }
      if (carte.kind === "location" && !carte.faceUp && carte.loc.zone === "board") items.push(item("Révéler (indices automatiques)", () => ctx.envoyer({ t: "revealLocation", id: carte.id })));
      if (carte.kind === "location" && (carte.tokens.clue ?? 0) > 0) items.push(item("Prendre 1 indice", () => ctx.envoyer({ t: "takeClue", id: carte.id })));
      if (carte.kind === "location" && carte.loc.zone === "board") {
        items.push(item("Relier à un autre lieu…", () => { modeLien = carte.id; document.body.classList.add("mode-lien"); journalLocal(ctx, "Relier : cliquez sur le lieu de destination (Échap pour annuler).", "system"); }));
        if ((ctx.etat.state.links ?? []).some((l) => l.a === carte.id || l.b === carte.id)) items.push(item("Effacer ses chemins", () => ctx.envoyer({ t: "unlink", id: carte.id })));
        // Lieux qui se remplacent (TCU « Replacing Locations ») : ce lieu, ou tous ceux du tapis.
        const paire = (ctx.scenario.swaps ?? []).find((p) => p.pair.includes(carte.code));
        if (paire) {
          const autre = paire.labels[1 - paire.pair.indexOf(carte.code)];
          items.push(item(`Remplacer par ${autre}`, () => ctx.envoyer({ t: "swapLocation", id: carte.id })));
          items.push(item("Tous les lieux → version jumelle", () => { if (confirm("Remplacer tous les lieux du tapis par leur version jumelle disponible (jetons et cartes conservés) ?")) ctx.envoyer({ t: "swapLocation", all: true }); }));
        }
        items.push(item("Retirer tous les indices des lieux", () => { if (confirm("Retirer tous les indices de tous les lieux en jeu ?")) ctx.envoyer({ t: "clearClues" }); }));
        items.push(item("Retirer de la partie tous les autres lieux", () => { if (confirm(`Retirer de la partie tous les lieux du tapis sauf ${nom} ?`)) ctx.envoyer({ t: "removeLocations", keep: carte.id }); }));
        if (ctx.scenario.emptySpace) {
          // Espace vide (dos de carte joueur) posé à côté de ce lieu, sur la grille du diagramme.
          for (const [lib, dx, dy] of [["au-dessus", 0, -238], ["au-dessous", 0, 238], ["à gauche", -186, 0], ["à droite", 186, 0]]) {
            items.push(item(`Espace vide ${lib}`, () => ctx.envoyer({ t: "emptySpace", x: carte.loc.x + dx, y: carte.loc.y + dy })));
          }
        }
        // Lieux d'une pile posés autour de ce lieu (TIC « Tidal Tunnel deck ») : en dessous, à gauche, à droite, aux emplacements libres.
        for (const p of (ctx.scenario.piles ?? []).filter((p) => p.around)) {
          const n = (ctx.etat.state.piles[p.id] ?? []).length;
          items.push(item(`${p.label} autour de ce lieu (dessous, gauche, droite)`, () => ctx.envoyer({ t: "placeAround", id: carte.id, pile: p.id }), { off: !n }));
        }
      }
      if (carte.kind === "location" && ctx.scenario.flood) {
        // Jeton d'inondation à deux faces (TIC) : sec, partiellement, totalement inondé.
        const niveau = carte.tokens.flood ?? 0;
        items.push(el("div", { class: "item jetons-ligne inondation-ligne" }, el("span", { text: "Inondation" }),
          ...[0, 1, 2].map((lv) => el("button", { class: `pm niveau${lv === niveau ? " actif" : ""}`, type: "button", disabled: !peut, title: lv ? `Lieu ${INONDATION[lv][1]}` : "Lieu sec (retirer le jeton)",
            onclick: () => ctx.envoyer({ t: "setFlood", id: carte.id, level: lv }) }, lv === 0 ? "sec" : lv === 1 ? "½" : "plein"))));
      }
      // Clé de côté face cachée (TIC) : une au hasard posée sur cette carte du tapis, sans être regardée.
      const cachees = Object.values(ctx.etat.state.cards).filter((k) => k.kind === "key" && !k.faceUp && k.loc.zone === "aside").length;
      if (cachees && carte.loc.zone === "board" && ["location", "enemy", "asset", "story"].includes(carte.kind)) {
        items.push(item(`Poser ici une clé cachée au hasard (${cachees} de côté, sans la regarder)`, () => ctx.envoyer({ t: "randomKey", id: carte.id })));
      }
      // Piles déclarées qui accueillent ce type de carte par leur menu (« Profondeurs » de The Pit of Despair).
      for (const p of (ctx.scenario.piles ?? []).filter((p) => p.menuFor?.includes(carte.kind))) {
        if (carte.loc.pile !== p.id) items.push(item(`Placer dans ${p.label}`, () => ctx.envoyer({ t: "toPile", id: carte.id, pile: p.id })));
      }
      // Carte dont les deux faces sont des faces de jeu (verso = lieu lié, ex. face Spectral ; ennemi à deux faces,
      // ex. Nathan Wick) : on bascule, on ne retourne pas.
      const deuxFaces = !carte.storyBack && def?.backCode && def?.backKind === carte.kind && (carte.kind === "location" || carte.kind === "enemy");
      if (deuxFaces && carte.faceUp) {
        const recto = def.subname ?? (carte.kind === "location" ? "normale" : "recto");
        const verso = def.backSubname ?? (def.backName === def.name ? (carte.kind === "location" ? "Spectral" : "verso") : def.backName);
        items.push(item(carte.side === "b" ? `Autre face (${recto})` : `Autre face (${verso})`, () => ctx.envoyer({ t: "toggleSide", id: carte.id })));
      }
      if (!carte.storyBack && carte.kind !== "investigator" && !deuxFaces) items.push(item("Retourner", () => ctx.envoyer({ t: "flipCard", id: carte.id })));
      if (carte.kind === "scenario" || carte.kind === "story") items.push(item("Autre face", () => ctx.envoyer({ t: "toggleSide", id: carte.id })));
      // Dos « histoire » : face cachée, la carte se révèle seulement sur demande explicite (une carte l'indique) ;
      // face visible, son verso (histoire, ou ennemi lié) se lit de même par le menu, jamais par retournement.
      if (carte.storyBack && !carte.faceUp) items.push(item("Révéler (quand une carte l'indique)", () => ctx.envoyer({ t: "flipCard", id: carte.id, reveal: true })));
      if (carte.storyBack && carte.faceUp && def?.back === "b") {
        const versoHistoire = !def.backKind || def.backKind === "story";
        items.push(item(carte.side === "b" ? "Revenir au recto" : versoHistoire ? "Lire le côté histoire (quand une carte l'indique)" : `Autre face (${def.backSubname ?? def.backName ?? "verso"}, quand une carte l'indique)`, () => ctx.envoyer({ t: "toggleSide", id: carte.id })));
      }
      const jetons = carte.kind === "investigator" ? ["damage", "horror", "resource"]
        : carte.kind === "location" ? ["clue", "doom", "generic"]
        : carte.kind === "enemy" ? ["damage", "doom", "clue", "generic"]
        : ["damage", "horror", "doom", "clue", "generic"];
      for (const t of jetons) items.push(jeton(t));
      if (rencontre) {
        // Seconde pioche de rencontre par trait (The Wages of Sin : les cartes Spectral vont dans la pioche et la
        // défausse spectrales) : la pioche et la défausse visées suivent les traits de la carte.
        const piocheTrait = (ctx.scenario.piles ?? []).find((p) => p.trait && !p.isDiscard && def?.traits?.includes(p.trait));
        const pioche = piocheTrait?.id ?? "encounter";
        const defausse = piocheTrait?.discard ?? "encounterDiscard";
        const nomPioche = piocheTrait ? piocheTrait.label : "la pioche";
        items.push(item(piocheTrait ? `Défausser (${ctx.scenario.piles.find((p) => p.id === defausse)?.label ?? "défausse"})` : "Défausser", () => ctx.envoyer({ t: "toPile", id: carte.id, pile: defausse })));
        items.push(item(`Sur ${nomPioche}`, () => ctx.envoyer({ t: "toPile", id: carte.id, pile: pioche, top: true })));
        items.push(item(`Sous ${nomPioche}`, () => ctx.envoyer({ t: "toPile", id: carte.id, pile: pioche, top: false })));
        items.push(item(`Mélanger dans ${nomPioche}`, () => ctx.envoyer({ t: "toPile", id: carte.id, pile: pioche, shuffle: true })));
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
