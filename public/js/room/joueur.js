// Page joueur `/r/<code>/j/<siège>` (board d'un siège, cahier §10.5) — étape 1 : affichage.
// Même table, même état que le tapis : la connexion WebSocket est la même que celle de la page de table ;
// le siège se rejoint avec son code à 4 chiffres (second onglet ou second appareil). Le board d'un autre siège
// est en lecture seule, sa main masquée (dos + nombre, bouton « Regarder »).

import { creerConnexion } from "./net.js";
import { el, pluriel } from "./dom.js";
import { CDN, FACTIONS, urlImage } from "./cartes.js";
import { nomSiege } from "./lobby.js";
import { blocDeck } from "./deck.js";
import { carteEl, encart, PHASES, rendreChaos, initLoupe } from "./tapis.js";
import { lireSiegeMemorise, memoriserSiege } from "./siege.js";
import { initInteractionsJoueur, ouvrirDialogueBoard } from "./interactions-joueur.js";

const ICONE_ACTION = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8.5h9.5V3.5L21 12l-8.5 8.5v-5H3z" fill="currentColor"/></svg>';
const ORDRE_PHASES = ["mythos", "investigation", "enemy", "upkeep"];
// Slots d'un enquêteur (Grimoire p. 21 ; ArkhamDB nomme le slot de chaque carte) et leurs limites.
const SLOTS = [["hand", "Mains", 2], ["arcane", "Arcanes", 2], ["ally", "Allié", 1], ["body", "Corps", 1], ["accessory", "Accessoire", 1], ["tarot", "Tarot", 1], ["head", "Tête", 1]];

const parties = location.pathname.split("/").filter(Boolean);
const code = parties[1]?.toUpperCase() ?? "";
const siegeUrl = Number(parties[3]);
const $etat = document.getElementById("etat");
const $attente = document.getElementById("attente");
const $board = document.getElementById("board-joueur");
document.getElementById("code").textContent = code || "······";
document.getElementById("lien-table").href = `/r/${code}`;

function erreurFatale(texte) {
  $etat.hidden = false;
  $etat.textContent = texte;
  $etat.classList.add("erreur");
  $attente.hidden = true;
  $board.hidden = true;
}

if (!/^[A-Z2-9]{6}$/.test(code) || !Number.isInteger(siegeUrl) || siegeUrl < 0 || siegeUrl > 3) {
  erreurFatale("Ce lien de board n'est pas valide (code de table ou numéro de siège).");
} else {
  demarrer();
}

async function demarrer() {
  const ctx = { etat: null, envoyer: null, scenario: null, defs: new Map(), investigateurs: new Map(), listeInvestigateurs: [], campagneBoite: "",
    vue: siegeUrl, regarder: false, selection: new Set(), derniereRecherche: null };
  // Seul le siège agit sur son board : le board consulté est le sien et la connexion y est assise.
  ctx.peutAgir = () => ctx.etat?.moi.seat !== null && ctx.etat?.moi.seat === ctx.vue && ctx.etat.state?.phase !== "lobby";

  try {
    const r = await fetch("/data/investigators.json");
    const data = await r.json();
    ctx.listeInvestigateurs = data.investigators;
    for (const i of data.investigators) ctx.investigateurs.set(i.code, i);
  } catch {
    encart("L'index des enquêteurs n'a pas pu être chargé ; rechargez la page.", "erreur");
  }

  let scenarioCharge = null;
  async function chargerScenario(id) {
    if (scenarioCharge === id) return;
    const [r, lib] = await Promise.all([fetch(`/scenarios/${id}.json`), fetch("/data/library.json")]);
    ctx.scenario = await r.json();
    for (const c of ctx.scenario.cards) ctx.defs.set(c.code, c);
    try {
      const data = await lib.json();
      ctx.campagneBoite = data.campaigns.find((c) => c.id === ctx.scenario.campaignId)?.box ?? "";
    } catch { /* facultatif */ }
    scenarioCharge = id;
    document.getElementById("titre-scenario").textContent = ctx.scenario.title;
    document.title = `Siège ${siegeUrl + 1} · ${ctx.scenario.title} · ${code} — Anofelis`;
  }

  const hostToken = () => localStorage.getItem(`ahwa:host:${code}`) ?? "";
  const nom = localStorage.getItem("ahwa:nom") ?? "";
  // Siège mémorisé par la page de table (siège + code) : la page joueur reprend son propre siège sans saisie,
  // quel que soit le board consulté (un autre board reste en lecture seule).
  const memo = lireSiegeMemorise(code);
  let reprise = memo;
  function tenterReprise() {
    if (!reprise || ctx.etat.moi.seat !== null) return;
    const s = ctx.etat.state.seats[reprise.seat];
    if (s.occupied && !(reprise.pin && s.pin === reprise.pin)) { reprise = null; return; }
    if (ctx.etat.state.phase !== "lobby" && !s.investigatorCode) { reprise = null; return; }
    ctx.envoyer({ t: "takeSeat", seat: reprise.seat, name: localStorage.getItem("ahwa:nom") ?? "", pin: s.occupied ? reprise.pin : undefined });
    reprise = null;
  }

  const cnx = creerConnexion({
    code, hostToken, seat: null, name: nom,
    on: {
      ouvert() { $etat.hidden = true; },
      async etat(genre) {
        await chargerScenario(ctx.etat.state.scenarioId);
        rendre();
        if (genre === "welcome") verifierCdn();
        if (genre === "welcome" || genre === "seats") tenterReprise();
        if (genre === "you" || genre === "seats") memoriserSiege(code, ctx.etat);
      },
      hostToken(token) { localStorage.setItem(`ahwa:host:${code}`, token); },
      rappel(entry) { encart(entry.text, "rappel"); },
      peek(pile, cards) { ouvrirDialogueBoard(ctx, pile, cards); },
      refus(raison) { encart(raison === "siege" ? "Seul le siège agit sur son board (lecture seule ici)." : raison, "erreur"); },
      ferme(codeFermeture) {
        if (codeFermeture === 4404) erreurFatale("Aucune table ne porte ce code.");
        else if (codeFermeture === 4410) erreurFatale("Cette table a été purgée après sept jours sans activité.");
        else if (codeFermeture === 4411) erreurFatale("Cette table a été supprimée par son hôte.");
        else if (![1000, 1001].includes(codeFermeture)) { $etat.hidden = false; $etat.textContent = "Connexion interrompue, nouvelle tentative…"; }
      },
    },
  });
  ctx.etat = cnx.etat;
  ctx.envoyer = cnx.envoyer;
  initLoupe(ctx);
  initInteractionsJoueur(ctx);
  document.addEventListener("ahwa:info", (e) => encart(e.detail, "info"));
  document.addEventListener("ahwa:selection", () => rendre());

  function inscrireCustoms(state) {
    for (const s of state.seats) {
      const c = `custom:${s.index}`;
      if (s.custom && s.investigatorCode === c) {
        const fiche = { code: c, name: s.custom.name, subname: "Enquêteur personnalisé", faction: "neutral", health: s.custom.health, sanity: s.custom.sanity, image: s.custom.image ?? null, packName: "Personnalisé", custom: true };
        ctx.investigateurs.set(c, fiche);
        ctx.defs.set(c, { code: c, name: s.custom.name, kind: "investigator", back: "player", image: fiche.image, custom: true });
      } else { ctx.investigateurs.delete(c); ctx.defs.delete(c); }
    }
  }

  let phasePrecedente = null;
  function rendre() {
    const { state, moi } = ctx.etat;
    inscrireCustoms(state);
    for (const [c, def] of Object.entries(state.extraDefs ?? {})) if (!ctx.defs.has(c)) ctx.defs.set(c, def);
    document.getElementById("moi").textContent = moi.seat === null ? (moi.isHost ? "Hôte (spectateur)" : "Spectateur") : `Siège ${moi.seat + 1}${moi.isHost ? " · hôte" : ""}`;
    if (state.phase === "lobby") {
      $board.hidden = true;
      $attente.hidden = false;
      rendreAttente(state, moi);
    } else {
      $attente.hidden = true;
      $board.hidden = false;
      rendreBoard(state, moi);
    }
    if (phasePrecedente !== null && phasePrecedente !== state.phase && state.phase !== "lobby") encart(PHASES[state.phase] ?? state.phase, "info");
    phasePrecedente = state.phase;
    document.dispatchEvent(new CustomEvent("ahwa:etat"));
  }

  // ---- Rejoindre le siège (code de siège) --------------------------------------------

  function blocRejoindre(state, moi, n = ctx.vue, court = false) {
    const s = state.seats[n];
    if (moi.seat === n) return null;
    if (moi.seat !== null) {
      return el("div", { class: "rejoindre" },
        el("p", { text: `Vous occupez le siège ${moi.seat + 1} sur cette connexion : ce board est en lecture seule.` }),
        el("button", { class: "bouton secondaire", type: "button", onclick: () => { ctx.vue = moi.seat; history.replaceState(null, "", `/r/${code}/j/${moi.seat}`); rendre(); } }, "Voir mon board"));
    }
    if (s.occupied) {
      const champ = el("input", { class: "champ-nom champ-pin", type: "text", inputmode: "numeric", pattern: "[0-9]{4}", maxlength: "4", placeholder: "Code du siège (4 chiffres)", "aria-label": "Code du siège" });
      const rejoindre = () => {
        const pin = champ.value.trim();
        if (!/^\d{4}$/.test(pin)) { champ.focus(); return; }
        ctx.envoyer({ t: "takeSeat", seat: n, name: localStorage.getItem("ahwa:nom") ?? "", pin });
      };
      champ.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); rejoindre(); } });
      return el("div", { class: "rejoindre" },
        el("p", { text: court ? `Pour agir ici, entrez le code de siège affiché sur le tapis :` : `Le siège ${n + 1} est occupé (${nomSiege(s, ctx)}). Pour agir sur ce board depuis cet appareil, entrez le code de siège affiché sur le tapis ; sinon il reste en lecture seule.` }),
        el("div", { class: "ligne-boutons" }, champ, el("button", { class: "bouton", type: "button", onclick: rejoindre }, "Rejoindre ce siège")));
    }
    const prenable = state.phase === "lobby" || s.investigatorCode;
    return el("div", { class: "rejoindre" },
      el("p", { text: prenable ? `Le siège ${n + 1} est libre.` : `Le siège ${n + 1} n'a pas d'enquêteur : il ne peut plus être pris pendant la partie.` }),
      prenable ? el("button", { class: "bouton", type: "button", onclick: () => ctx.envoyer({ t: "takeSeat", seat: n, name: localStorage.getItem("ahwa:nom") ?? "" }) }, s.investigatorCode && state.phase !== "lobby" ? "Reprendre ce siège" : "S'asseoir ici") : null);
  }

  // ---- Avant le lancement -------------------------------------------------------------

  function rendreAttente(state, moi) {
    const s = state.seats[siegeUrl];
    const inv = ctx.investigateurs.get(s.investigatorCode);
    $attente.replaceChildren(
      el("header", { class: "lobby-entete" },
        el("div", {},
          el("p", { class: "surtitre", text: `${ctx.scenario.campaign} · ${ctx.campagneBoite ?? ""}`.replace(/ · $/, "") }),
          el("h1", { text: `Siège ${siegeUrl + 1} — ${nomSiege(s, ctx)}` })),
        el("div", { class: "partage" }, el("p", { class: "etiquette", text: "Table" }), el("p", { class: "code-table", text: state.code }))),
      el("section", { class: "attente-corps" },
        el("p", { class: "attente", text: "En attente du lancement de la mise en place par l'hôte (sur la page de la table). Le board apparaîtra ici." }),
        inv ? el("p", { class: "sous", text: `${inv.name}${inv.subname ? ` — ${inv.subname}` : ""}` }) : el("p", { class: "vide", text: "Pas d'enquêteur à ce siège : choisissez-le ou importez un deck sur la page de la table." }),
        s.deck ? blocDeck(s, ctx, false) : el("p", { class: "vide", text: "Pas de deck importé : ce siège jouera sans board de cartes (compteurs et zone de menace seulement)." }),
        blocRejoindre(state, moi, siegeUrl)),
    );
  }

  // ---- Board -----------------------------------------------------------------------

  function rendreBoard(state, moi) {
    const vue = state.seats[ctx.vue]?.investigatorCode ? ctx.vue : (state.seats.find((x) => x.investigatorCode)?.index ?? ctx.vue);
    ctx.vue = vue;
    const s = state.seats[vue];
    const mien = moi.seat === vue;
    const peut = mien;   // seul le siège agit sur son board (cahier §10.2)
    rendreBarre(state, moi);
    rendreOnglets(state, moi);
    rendreEntete(state, moi, s, peut);
    rendrePiles(state, s, peut);
    rendreJeu(state, s, peut);
    rendreMain(state, s, mien);
  }

  function rendreBarre(state, moi) {
    const peut = moi.seat !== null;
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
      const restants = state.seats.filter((x) => x.investigatorCode && !state.turn.done.includes(x.index));
      tour.textContent = state.turn.seat === null
        ? (restants.length ? `Tour libre — ${pluriel(restants.length, "enquêteur")} n'${restants.length > 1 ? "ont" : "a"} pas encore joué.` : "Tout le monde a joué : phase suivante.")
        : `Tour de ${nomSiege(state.seats[state.turn.seat], ctx)}.`;
    } else tour.textContent = "";
    const suivante = document.getElementById("phase-suivante");
    suivante.disabled = !peut || state.phase === "resolution";
    suivante.onclick = () => ctx.envoyer({ t: "nextPhase" });
  }

  function rendreOnglets(state, moi) {
    const nav = document.getElementById("onglets");
    nav.replaceChildren(...state.seats.filter((x) => x.investigatorCode).map((x) => el("button", {
      type: "button", class: `onglet${ctx.vue === x.index ? " courant" : ""}${moi.seat === x.index ? " moi" : ""}`,
      title: moi.seat === x.index ? "Votre board" : `Board de ${nomSiege(x, ctx)} (lecture seule)`,
      onclick: () => { ctx.vue = x.index; ctx.regarder = false; history.replaceState(null, "", `/r/${code}/j/${x.index}`); rendre(); },
    }, el("span", { class: "nom", text: nomSiege(x, ctx) }), x.deck ? el("span", { class: "sous", text: ` · ${x.deck.name}` }) : el("span", { class: "sous", text: " · sans deck" }),
      moi.seat === x.index ? el("span", { class: "vous", text: "vous" }) : null)));
  }

  function compteurLigne(libelle, valeur, icone, peut, moins, plus, unite) {
    return el("div", { class: "compteur" },
      el("dt", {}, icone ? el("img", { src: icone, alt: "" }) : null, el("span", { text: libelle })),
      el("dd", {},
        el("button", { class: "pm", type: "button", disabled: !peut, title: `−1 ${unite}`, onclick: moins }, "−"),
        el("span", { class: "valeur", text: valeur }),
        el("button", { class: "pm", type: "button", disabled: !peut, title: `+1 ${unite}`, onclick: plus }, "+")));
  }

  /** Occupation des slots d'après les cartes en jeu (ArkhamDB : « Hand », « Hand x2 », « Ally. Arcane »…). */
  function occupationSlots(state, n) {
    const comptes = Object.fromEntries(SLOTS.map(([k]) => [k, 0]));
    for (const c of Object.values(state.cards)) {
      if (c.loc.zone !== `pplay${n}` || c.kind !== "asset") continue;
      const slot = ctx.defs.get(c.code)?.slot;
      if (!slot) continue;
      for (const part of slot.split(".").map((t) => t.trim()).filter(Boolean)) {
        const m = /^(\w+)(?: x(\d))?$/.exec(part);
        if (!m) continue;
        const k = m[1].toLowerCase();
        if (k in comptes) comptes[k] += Number(m[2] ?? 1);
      }
    }
    return comptes;
  }

  function rendreEntete(state, moi, s, peut) {
    const n = s.index;
    const inv = ctx.investigateurs.get(s.investigatorCode);
    const carteInv = state.cards[`inv-${n}`];
    const degats = carteInv?.tokens.damage ?? 0, horreur = carteInv?.tokens.horror ?? 0;
    const faction = FACTIONS[inv?.faction] ?? FACTIONS.neutral;
    const jeton = (token, delta) => ctx.envoyer({ t: "addToken", id: `inv-${n}`, token, delta });
    const compteur = (key, delta) => ctx.envoyer({ t: "setSeatCounter", seat: n, key, delta });
    const enTour = state.turn.seat === n, aJoue = state.turn.done.includes(n);
    const actions = s.counters.actions ?? 0;
    const occ = occupationSlots(state, n);
    const main = (state.piles[`phand${n}`] ?? []).length;
    const deck = s.deck;
    const portrait = inv?.custom ? (inv.image ? el("img", { class: "portrait", src: inv.image, alt: "" }) : el("div", { class: "portrait sans-image", text: inv.name }))
      : el("img", { class: "portrait", src: `${CDN}${s.investigatorCode}.webp`, alt: "" });
    const entete = document.getElementById("entete");
    entete.style.setProperty("--faction", faction.couleur);
    entete.classList.toggle("lecture", !peut);
    entete.replaceChildren(
      el("div", { class: "identite" },
        portrait,
        el("div", { class: "fiche" },
          el("strong", { text: nomSiege(s, ctx) }),
          inv && s.name ? el("span", { class: "sous", text: inv.name }) : null,
          inv?.subname ? el("span", { class: "sous", text: inv.subname }) : null,
          el("span", { class: "sous", text: peut ? "Votre board" : "Lecture seule — seul le siège agit sur son board" }),
          state.lead === n ? el("span", { class: "sous", text: "★ enquêteur principal" }) : null),
        peut ? null : blocRejoindre(state, moi, n, true)),
      el("dl", { class: "compteurs" },
        compteurLigne("Ressources", String(s.counters.resources ?? 0), "/img/tokens/tok_ressources.png", peut, () => compteur("resources", -1), () => compteur("resources", 1), "ressource"),
        compteurLigne("Indices", String(s.counters.clues ?? 0), "/img/tokens/tok_indices.png", peut, () => compteur("clues", -1), () => compteur("clues", 1), "indice"),
        compteurLigne("Vie", `${Math.max(0, s.counters.health - degats)} / ${s.counters.health}`, "/img/tokens/tok_degats.png", peut, () => jeton("damage", -1), () => jeton("damage", 1), "dégât"),
        compteurLigne("Santé", `${Math.max(0, s.counters.sanity - horreur)} / ${s.counters.sanity}`, "/img/tokens/tok_horreur.png", peut, () => jeton("horror", -1), () => jeton("horror", 1), "horreur")),
      el("div", { class: "tour-actions" },
        el("div", { class: "actions-pips" },
          el("span", { class: "libelle", text: "Actions" }),
          el("button", { class: "pm", type: "button", disabled: !peut, title: "Dépenser une action", onclick: () => compteur("actions", -1) }, "−"),
          ...[0, 1, 2].map((i) => el("span", { class: `pip${i < actions ? " plein" : ""}` })),
          actions > 3 ? el("span", { class: "plus", text: `+${actions - 3}` }) : null,
          el("button", { class: "pm", type: "button", disabled: !peut, title: "Action supplémentaire", onclick: () => compteur("actions", 1) }, "+")),
        enTour && peut ? el("button", { class: "bouton-action", type: "button", disabled: actions <= 0, title: actions > 0 ? `Dépenser une action (${actions} restante${actions > 1 ? "s" : ""})` : "Plus d'action ce tour", onclick: () => compteur("actions", -1) },
          el("span", { class: "fleche", html: ICONE_ACTION }), el("span", { class: "n", text: String(actions) })) : null,
        state.phase === "resolution" ? null : enTour
          ? el("button", { class: "bouton petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "endTurn", seat: n }) }, "Fin de mon tour")
          : el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut, onclick: () => ctx.envoyer({ t: "takeTurn", seat: n }) }, aJoue ? "Rejouer" : "Prendre mon tour"),
        aJoue && !enTour ? el("span", { class: "sous", text: "a joué" }) : null),
      el("div", { class: "slots", title: "Occupation des slots d'après les cartes en jeu (dépassement surligné, jamais bloqué)" },
        el("span", { class: "libelle", text: `Main ${main}` }),
        ...SLOTS.map(([k, lib, max]) => el("span", { class: `slot${occ[k] > max ? " depasse" : ""}${occ[k] ? " occupe" : ""}`, text: `${lib} ${occ[k]}/${max}` }))),
      blocMiseEnPlace(state, s, peut),
    );
    rendreChaos(ctx);
  }

  /** Mise en place du joueur, puis mulligan par sélection (cahier §10.5) ; faiblesses mises de côté comptées. */
  function blocMiseEnPlace(state, s, peut) {
    const deck = s.deck;
    if (!deck) return el("div", { class: "mise-en-place" }, el("span", { class: "sous", text: "Sans deck importé" }));
    const n = s.index;
    const faiblesses = (state.piles[`pweak${n}`] ?? []).length;
    if (deck.board.setup === "none") {
      if (!peut) ctx.selection.clear();
      return el("div", { class: "mise-en-place" },
        el("span", { class: "ligne-boutons" },
          el("button", { class: "bouton", type: "button", disabled: !peut, title: "Mélange la pioche, pose les permanents et les cartes qui commencent en jeu, +5 ressources, main de 5 (les faiblesses sont mises de côté), puis mulligan",
            onclick: () => ctx.envoyer({ t: "p:setup" }) }, "Mise en place"),
          el("span", { class: "sous", text: peut ? "mélange, permanents, 5 ressources, main de 5, puis mulligan" : "à la demande du joueur" })));
    }
    if (deck.board.setup === "mulligan") {
      const k = ctx.selection.size;
      return el("div", { class: "mise-en-place mulligan" },
        el("span", { class: "libelle", text: peut ? `Mulligan : cliquez les cartes de votre main à rendre (${k}), une seule fois.` : "Mulligan en cours…" }),
        el("span", { class: "ligne-boutons" },
          el("button", { class: "bouton", type: "button", disabled: !peut || k === 0, title: "Les cartes choisies sont remplacées, puis remélangées dans la pioche avec les faiblesses mises de côté",
            onclick: () => { ctx.envoyer({ t: "p:mulligan", ids: [...ctx.selection] }); ctx.selection.clear(); } }, `Mulligan (${k})`),
          el("button", { class: "bouton secondaire", type: "button", disabled: !peut, onclick: () => { ctx.envoyer({ t: "p:keep" }); ctx.selection.clear(); } }, "Garder ma main"),
          faiblesses ? el("span", { class: "sous", text: `${pluriel(faiblesses, "faiblesse")} mise${faiblesses > 1 ? "s" : ""} de côté, remélangée${faiblesses > 1 ? "s" : ""} ensuite` }) : null));
    }
    ctx.selection.clear();
    return el("div", { class: "mise-en-place" }, el("span", { class: "sous", text: `Board en place${deck.board.mulliganUsed ? " (mulligan fait)" : " (main gardée)"}` }));
  }

  function rendrePiles(state, s, peut) {
    const n = s.index;
    const pioche = state.piles[`pdeck${n}`] ?? [];
    const defausse = state.piles[`pdiscard${n}`] ?? [];
    const dessus = defausse.length ? state.cards[defausse[0]] : null;
    const cote = Object.values(state.cards).filter((c) => c.loc.zone === `paside${n}`).sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
    const sect = document.getElementById("piles-joueur");
    sect.replaceChildren(
      el("div", { class: "pile", "data-drop": `pile:pdeck${n}`, "data-outil": `pdeck${n}`, title: s.deck ? "Pioche (réserve) — clic : piocher en main ; clic droit : piocher plusieurs, chercher, regarder les premières, mélanger ; déposez ici pour mettre une carte dessus" : "Pas de deck" },
        el("div", { class: `dos-pile pioche-joueur${pioche.length ? "" : " vide"}` },
          pioche.length
            ? el("button", { class: "dos-bouton", type: "button", disabled: !peut, title: "Piocher 1 carte" }, el("img", { src: "/img/dos-joueur.svg", alt: "pioche" }))
            : defausse.length
              ? el("button", { class: "dos-bouton vide", type: "button", disabled: !peut, title: "Pioche vide : clic pour remélanger la défausse et piocher (prends 1 horreur)" }, el("span", { class: "sous", text: "vide" }))
              : el("span", { class: "sous", text: "vide" })),
        el("span", { class: "badge", text: String(pioche.length) }), el("span", { class: "etiquette-pile", text: "Pioche" })),
      el("div", { class: "pile", "data-drop": `pile:pdiscard${n}`, "data-outil": `pdiscard${n}`, title: "Défausse — déposez ici pour défausser ; clic droit : consulter, reprendre" },
        el("div", { class: `dos-pile defausse-rencontre${dessus ? "" : " vide"}` }, dessus ? carteEl(dessus, ctx) : el("span", { class: "sous", text: "défausse" })),
        el("span", { class: "badge", text: String(defausse.length) }), el("span", { class: "etiquette-pile", text: "Défausse" })),
      el("section", { class: "hors-jeu" },
        el("h2", { text: "Hors jeu" }),
        el("div", { class: "bande", "data-drop": `paside${n}` }, ...(cote.length ? cote.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Cartes liées et mises de côté." })]))),
    );
  }

  function rendreJeu(state, s, peut) {
    const n = s.index;
    const enJeu = Object.values(state.cards).filter((c) => c.loc.zone === `pplay${n}`).sort((a, b) => a.loc.z - b.loc.z);
    const enCours = Object.values(state.cards).filter((c) => c.loc.zone === `plimbo${n}`).sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
    const menace = Object.values(state.cards).filter((c) => c.loc.zone === `seat${n}` && c.kind !== "investigator").sort((a, b) => a.loc.x - b.loc.x || a.loc.z - b.loc.z);
    const sect = document.getElementById("jeu");
    const zone = el("div", { class: "zone-jeu", "data-drop": `pplay${n}` });
    for (const c of enJeu) {
      const e = carteEl(c, ctx);
      e.style.left = `${c.loc.x}px`; e.style.top = `${c.loc.y}px`; e.style.zIndex = String(c.loc.z);
      zone.append(e);
    }
    if (!enJeu.length) zone.append(el("p", { class: "vide", text: "En jeu — assets, permanents, attaches." }));
    sect.replaceChildren(
      el("section", { class: "bloc-jeu" }, el("h2", { text: "En jeu" }), zone),
      el("section", { class: "bloc-cours" },
        el("h2", {}, "En cours ", el("span", { class: "sous", text: "(événements joués, cartes engagées au test)" })),
        el("div", { class: "bande", "data-drop": `plimbo${n}` }, ...(enCours.length ? enCours.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Rien en cours." })]),
          enCours.length ? el("button", { class: "bouton petit", type: "button", disabled: true, title: "Résolu → défausse : étape 3" }, "Résolu") : null)),
      el("section", { class: "bloc-menace" },
        el("h2", { text: "Zone de menace" }),
        el("div", { class: "menace", "data-drop": `seat${n}` }, ...(menace.length ? menace.map((c) => carteEl(c, ctx)) : [el("p", { class: "vide", text: "Ennemis engagés, traîtrises et soutiens histoire — les mêmes que sur le tapis." })]))),
    );
  }

  function rendreMain(state, s, mien) {
    const n = s.index;
    const ids = state.piles[`phand${n}`] ?? [];
    const pied = document.getElementById("main");
    const visible = mien || ctx.regarder;
    const peut = mien && ctx.peutAgir();
    const cartes = ids.map((id) => state.cards[id]).filter(Boolean);
    const mulligan = mien && s.deck?.board.setup === "mulligan";
    pied.replaceChildren(
      el("header", {},
        el("h2", { text: `Main — ${pluriel(cartes.length, "carte")}` }),
        !mien && cartes.length ? el("button", { class: "bouton secondaire petit", type: "button", onclick: () => { ctx.regarder = !ctx.regarder; rendre(); } }, ctx.regarder ? "Masquer" : "Regarder") : null,
        !mien ? el("span", { class: "sous", text: "main masquée : dos et nombre" }) : null,
        mien ? el("span", { class: "sous", text: mulligan ? "cliquez les cartes à rendre" : "glissez vers en jeu, la défausse ou la pioche ; clic droit : révéler, défausser…" }) : null,
        mien ? el("span", { class: "espace" }) : null,
        mien ? el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut || !s.deck, title: "Piocher 1 carte", onclick: () => ctx.envoyer({ t: "p:draw", n: 1 }) }, "Piocher") : null,
        mien ? el("button", { class: "bouton secondaire petit", type: "button", disabled: !peut || !cartes.length, title: "Défausser une carte de la main au hasard (nommée dans le journal)", onclick: () => ctx.envoyer({ t: "p:randomDiscard", n: 1 }) }, "Défausser au hasard") : null),
      el("div", { class: "eventail", "data-drop": mien ? `pile:phand${n}` : null },
        ...(cartes.length ? cartes.map((c) => {
          const e = carteEl({ ...c, faceUp: visible || c.revealed === true }, ctx);
          e.classList.toggle("choisie", mulligan && ctx.selection.has(c.id));
          e.classList.toggle("revelee", c.revealed === true);
          return e;
        }) : [el("p", { class: "vide", text: s.deck ? (s.deck.board.setup === "none" ? "Aucune carte en main : lancez la mise en place." : "Main vide.") : "Pas de deck." })])),
    );
  }

  function verifierCdn() {
    const img = new Image();
    img.onerror = () => { document.getElementById("bandeau-cdn").hidden = false; };
    img.src = `${CDN}01111b.webp`;
  }
}

export { urlImage };
