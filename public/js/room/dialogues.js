// Fenêtres : consultation d'une pile (recherche / défausse), ajustement du sac, dépense d'indices.

import { el } from "./dom.js";
import { CDN, JETONS_CHAOS, imgJetonChaos, libelleType } from "./cartes.js";
import { nomSiege } from "./lobby.js";

function dialogue(titre, corps, boutons) {
  const d = el("dialog", { class: "dialogue" },
    el("header", {}, el("h2", { text: titre }), ...boutons),
    corps,
  );
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return d;
}

/** Cartes d'une pile (message « peek ») : la pioche est remélangée à la fermeture. */
export function ouvrirDialogueCartes(ctx, pile, cartes) {
  const pioche = pile !== "encounterDiscard";
  const nomPile = pile === "encounter" ? "Pioche de rencontre" : pile === "encounterDiscard" ? "Défausse" : (ctx.scenario.piles?.find((p) => p.id === pile)?.label ?? pile);
  const moi = ctx.etat.moi.seat;
  const liste = el("div", { class: "grille-cartes" });
  const rendre = (restantes) => liste.replaceChildren(...restantes.map((c) => {
    const def = ctx.defs.get(c.code);
    return el("figure", { class: "carte-peek" },
      el("img", { src: `${CDN}${c.code}.webp`, alt: def?.name ?? c.code, loading: "lazy" }),
      el("figcaption", {}, el("span", { text: def?.name ?? c.code }),
        moi !== null ? el("button", { class: "lien-outil", type: "button", title: "Mettre dans votre zone de menace",
          onclick: () => { ctx.envoyer({ t: "moveCard", id: c.id, zone: `seat${moi}`, x: 9999, y: 0 }); rendre(restantes.filter((x) => x.id !== c.id)); } }, "Prendre") : null),
    );
  }));
  rendre(cartes);
  const d = dialogue(pioche ? `${nomPile} — ${cartes.length} cartes (du dessus au dessous)` : `${nomPile} — ${cartes.length} cartes (la plus récente d'abord)`,
    cartes.length ? liste : el("p", { class: "vide", text: "Aucune carte." }),
    [el("button", { class: "bouton", type: "button", onclick: () => d.close() }, pioche ? "Fermer et mélanger" : "Fermer")]);
  if (pioche) d.addEventListener("close", () => ctx.envoyer({ t: "shufflePile", pile }), { once: true });
}

export function ouvrirAjustementSac(ctx) {
  const comptes = () => {
    const m = new Map();
    for (const t of ctx.etat.state.chaos.bag) m.set(t, (m.get(t) ?? 0) + 1);
    return m;
  };
  const lignes = el("div", { class: "ajust-sac" });
  const rendre = () => {
    const m = comptes();
    lignes.replaceChildren(...Object.keys(JETONS_CHAOS).map((t) => el("div", { class: "ajust-ligne" },
      imgJetonChaos(t, 30), el("span", { class: "libelle", text: JETONS_CHAOS[t] }),
      el("button", { class: "pm", type: "button", disabled: !(m.get(t) > 0), onclick: () => ctx.envoyer({ t: "chaosAdjust", token: t, delta: -1 }) }, "−"),
      el("span", { class: "valeur", text: String(m.get(t) ?? 0) }),
      el("button", { class: "pm", type: "button", onclick: () => ctx.envoyer({ t: "chaosAdjust", token: t, delta: 1 }) }, "+"),
    )));
  };
  rendre();
  const d = dialogue("Ajuster le sac du chaos", lignes, [el("button", { class: "bouton", type: "button", onclick: () => d.close() }, "Fermer")]);
  const maj = () => rendre();
  document.addEventListener("ahwa:etat", maj);
  d.addEventListener("close", () => document.removeEventListener("ahwa:etat", maj));
}

export function ouvrirDepenseIndices(ctx, seuil) {
  const { state } = ctx.etat;
  const sieges = state.seats.filter((s) => s.investigatorCode);
  const champs = new Map();
  const corps = el("div", { class: "depense" },
    el("p", { class: "sous", text: seuil ? `Seuil de l'acte : ${seuil} indice${seuil > 1 ? "s" : ""}.` : "" }),
    ...sieges.map((s) => {
      const champ = el("input", { type: "number", min: "0", max: String(s.counters.clues ?? 0), value: "0" });
      champs.set(s.index, champ);
      return el("label", { class: "ajust-ligne" }, el("span", { class: "libelle", text: `${nomSiege(s, ctx)} (${s.counters.clues ?? 0})` }), champ);
    }),
  );
  const d = dialogue("Dépenser des indices sur l'acte", corps, [
    el("button", { class: "bouton", type: "button", onclick: () => {
      const from = [...champs.entries()].map(([seat, c]) => ({ seat, n: Number(c.value) || 0 })).filter((f) => f.n > 0);
      if (from.length) ctx.envoyer({ t: "spendClues", from });
      d.close();
    } }, "Dépenser"),
    el("button", { class: "bouton secondaire", type: "button", onclick: () => d.close() }, "Annuler"),
  ]);
}


// ---- Générer une carte (outil générique, identique dans toutes les tables) ----
let indexCartes = null;
const normaliser = (t) => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

async function chargerIndex() {
  if (indexCartes) return indexCartes;
  const r = await fetch("/data/cards_index.json");
  indexCartes = (await r.json()).cards;
  return indexCartes;
}

export function ouvrirGenerateur(ctx) {
  const champ = el("input", { type: "search", class: "recherche large", placeholder: "Nom de carte, code (01117) ou lien arkham.build/card/…", "aria-label": "Rechercher une carte", autofocus: true });
  const liste = el("div", { class: "grille-cartes" }, el("p", { class: "vide", text: "Chargement de l'index…" }));
  const d = dialogue("Générer une carte", el("div", { class: "generateur" }, champ, liste),
    [el("button", { class: "bouton secondaire", type: "button", onclick: () => d.close() }, "Fermer")]);
  const rendre = (cartes) => {
    const q = champ.value.trim();
    const code = q.match(/arkham\.build\/card\/([0-9a-z]+)/i)?.[1] ?? (/^[0-9]{5}[a-z]?$/i.test(q) ? q : null);
    let res;
    if (code) res = cartes.filter((c) => c.c.toLowerCase() === code.toLowerCase());
    else {
      const nq = normaliser(q);
      if (nq.length < 2) { liste.replaceChildren(el("p", { class: "vide", text: "Tapez au moins deux lettres du nom, un code ou un lien arkham.build." })); return; }
      const debut = [], dedans = [];
      for (const c of cartes) {
        const nom = normaliser(c.n), sous = normaliser(c.s);
        if (nom.startsWith(nq)) debut.push(c);
        else if (nom.includes(nq) || sous.includes(nq)) dedans.push(c);
      }
      res = [...debut, ...dedans];
    }
    const total = res.length;
    res = res.slice(0, 40);
    liste.replaceChildren(...res.map((c) => el("figure", { class: "carte-peek" },
      el("img", { src: `${CDN}${c.c}.webp`, alt: c.n, loading: "lazy" }),
      el("figcaption", {},
        el("span", {}, el("strong", { text: c.n }), c.s ? el("span", { class: "sous", text: ` ${c.s}` }) : null,
          el("span", { class: "meta", text: `${libelleType(c.t)} · ${c.pn || c.p} · ${c.c}` })),
        el("button", { class: "lien-outil", type: "button", title: "Créer cette carte dans votre zone de menace",
          onclick: () => { ctx.envoyer({ t: "createCard", code: c.c }); d.close(); } }, "Générer")),
    )));
    if (!res.length) liste.append(el("p", { class: "vide", text: "Aucune carte ne correspond." }));
    else if (total > res.length) liste.append(el("p", { class: "vide", text: `${total} résultats, les 40 premiers affichés : précisez.` }));
  };
  chargerIndex().then((cartes) => { rendre(cartes); champ.addEventListener("input", () => rendre(cartes)); champ.focus(); })
    .catch(() => liste.replaceChildren(el("p", { class: "vide", text: "L'index des cartes n'a pas pu être chargé." })));
}
