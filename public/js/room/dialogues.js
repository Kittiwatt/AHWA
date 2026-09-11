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

/** Cartes d'une pile (message « peek ») : une pioche est remélangée à la fermeture ; une défausse (rencontre ou seconde
 *  défausse du scénario) se consulte sans mélange, avec les mêmes gestes carte par carte que la défausse du board joueur
 *  (demande du 2026-09-11) : prendre en zone de menace, poser sur le tapis, remettre sur / sous la pioche ou la mélanger. */
export function ouvrirDialogueCartes(ctx, pile, cartes) {
  const declaree = ctx.scenario.piles?.find((p) => p.id === pile);
  const defausse = pile === "encounterDiscard" || Boolean(declaree?.isDiscard);
  const pioche = !defausse;
  // Pioche à laquelle une défausse renvoie ses cartes : la pioche de rencontre, ou celle du scénario dont c'est la défausse.
  const piocheDe = pile === "encounterDiscard" ? { id: "encounter", label: "la pioche" } : (() => { const q = ctx.scenario.piles?.find((p) => p.discard === pile); return q ? { id: q.id, label: q.label } : null; })();
  const nomPile = pile === "encounter" ? "Pioche de rencontre" : pile === "encounterDiscard" ? "Défausse" : (declaree?.label ?? pile);
  const moi = ctx.etat.moi.seat;
  const liste = el("div", { class: "grille-cartes" });
  const rendre = (restantes) => liste.replaceChildren(...restantes.map((c) => {
    const def = ctx.defs.get(c.code);
    const agir = (msg) => { ctx.envoyer(msg); rendre(restantes.filter((x) => x.id !== c.id)); };
    const boutons = [
      ["Prendre", { t: "moveCard", id: c.id, zone: `seat${moi}`, x: 9999, y: 0 }, "Mettre dans votre zone de menace"],
      ...(defausse ? [
        ["Sur le tapis", null, "Poser au centre du tapis", () => { ctx.envoiSurTapis({ id: c.id }); rendre(restantes.filter((x) => x.id !== c.id)); }],
        ...(piocheDe ? [
          ["Sur la pioche", { t: "toPile", id: c.id, pile: piocheDe.id, top: true }, `Remettre sur ${piocheDe.label}`],
          ["Sous la pioche", { t: "toPile", id: c.id, pile: piocheDe.id, top: false }, `Remettre sous ${piocheDe.label}`],
          ["Mélanger", { t: "toPile", id: c.id, pile: piocheDe.id, shuffle: true }, `Mélanger dans ${piocheDe.label}`],
        ] : []),
      ] : []),
    ];
    return el("figure", { class: "carte-peek" },
      el("img", { src: `${CDN}${c.code}.webp`, alt: def?.name ?? c.code, loading: "lazy" }),
      el("figcaption", {}, el("span", { text: def?.name ?? c.code }),
        moi !== null ? el("span", { class: "actions-peek" }, ...boutons.map(([lib, msg, titre, action]) =>
          el("button", { class: "lien-outil", type: "button", title: titre, onclick: () => (action ? action() : agir(msg)) }, lib))) : null),
    );
  }));
  rendre(cartes);
  const nb = `${cartes.length} carte${cartes.length > 1 ? "s" : ""}`;
  const d = dialogue(pioche ? `${nomPile} — ${nb} (du dessus au dessous)` : `${nomPile} — ${nb} (la plus récente d'abord, ordre conservé)`,
    cartes.length ? liste : el("p", { class: "vide", text: "Aucune carte." }),
    [el("button", { class: "bouton", type: "button", onclick: () => d.close() }, pioche ? "Fermer et mélanger" : "Fermer")]);
  if (pioche) d.addEventListener("close", () => ctx.envoyer({ t: "shufflePile", pile }), { once: true });
}

/** Accusation (The Vanishing of Elina Harper) : un suspect et une cachette parmi les douze ; les pistes rayées et les
 *  cartes déjà en jeu ou en victoire sont grisées (le guide les exclut), mais rien n'est bloqué. */
export function ouvrirAccusation(ctx) {
  const { state } = ctx.etat;
  const L = ctx.scenario.leads;
  const rayes = new Set(state.leads?.eliminated ?? []);
  const exclus = new Set(Object.values(state.cards).filter((c) => "zone" in c.loc && (c.loc.zone === "board" || c.loc.zone === "victory" || /^seat[0-3]$/.test(c.loc.zone))).map((c) => c.code));
  const nom = (code) => ctx.defs.get(code)?.name ?? code;
  const choix = { suspect: null, hideout: null };
  const colonne = (titre, codes, cle) => el("div", { class: "colonne-accusation" }, el("h3", { text: titre }),
    ...codes.map((code) => el("label", { class: `choix-piste${rayes.has(code) || exclus.has(code) ? " grise" : ""}` },
      el("input", { type: "radio", name: `acc-${cle}`, value: code, onchange: () => { choix[cle] = code; valider.disabled = !(choix.suspect && choix.hideout); } }),
      el("span", { text: nom(code) }),
      rayes.has(code) ? el("span", { class: "sous", text: " (rayé)" }) : exclus.has(code) ? el("span", { class: "sous", text: " (en jeu)" }) : null)));
  const valider = el("button", { class: "bouton", type: "button", disabled: true, onclick: () => { d.close(); ctx.envoyer({ t: "accusation", suspect: choix.suspect, hideout: choix.hideout }); } }, "Accuser");
  const corps = el("div", { class: "accusation" },
    el("p", { class: "sous", text: "Le guide exclut un suspect en jeu ou en victoire et une cachette en jeu. L'app révèle ensuite les cartes cachées et applique l'interlude : c'est définitif." }),
    el("div", { class: "colonnes-accusation" }, colonne("Suspect", L.suspects, "suspect"), colonne("Cachette", L.hideouts, "hideout")));
  const d = dialogue("Faire l'accusation", corps, [el("button", { class: "bouton secondaire", type: "button", onclick: () => d.close() }, "Annuler"), valider]);
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

/** Outil « Générer une carte » (table et board joueur) : une carte du jeu par nom, code ou lien arkham.build, ou une
 *  carte personnalisée à partir d'une image en lien (recto, verso facultatif, nature, jauges) — 2026-09-10. */
export function ouvrirGenerateur(ctx) {
  const champ = el("input", { type: "search", class: "recherche large", placeholder: "Nom de carte, code (01117) ou lien arkham.build/card/…", "aria-label": "Rechercher une carte", autofocus: true });
  const liste = el("div", { class: "grille-cartes" }, el("p", { class: "vide", text: "Chargement de l'index…" }));
  const d = dialogue("Générer une carte", el("div", { class: "generateur" }, champ, liste, formulaireCartePerso(ctx, () => d.close())),
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

/** Carte personnalisée : formulaire sous la recherche — nom, image du recto (lien https), verso facultatif, nature,
 *  vie / santé mentale (soutien) ou vie (ennemi) ; aperçu de l'image dès que le lien répond. Pas de téléversement : les
 *  images restent chez leur hébergeur, la table ne garde que le lien (comme l'enquêteur personnalisé). */
function formulaireCartePerso(ctx, fermer) {
  const nom = el("input", { type: "text", class: "champ-nom", maxlength: "40", placeholder: "Nom de la carte", "aria-label": "Nom de la carte personnalisée" });
  const image = el("input", { type: "url", class: "champ-nom", maxlength: "600", placeholder: "Lien https de l'image du recto", "aria-label": "Image du recto" });
  const verso = el("input", { type: "url", class: "champ-nom", maxlength: "600", placeholder: "Lien de l'image du verso (facultatif)", "aria-label": "Image du verso" });
  const nature = el("select", { class: "champ-nom", "aria-label": "Nature de la carte" },
    ...[["asset", "Soutien"], ["enemy", "Ennemi"], ["treachery", "Traîtrise"], ["location", "Lieu"], ["story", "Histoire"]].map(([v, l]) => el("option", { value: v, text: l })));
  const vie = el("input", { type: "number", class: "nombre", min: "1", max: "99", placeholder: "vie", "aria-label": "Vie (facultatif)" });
  const sante = el("input", { type: "number", class: "nombre", min: "1", max: "99", placeholder: "santé", "aria-label": "Santé mentale (facultatif)" });
  const apercu = el("img", { class: "apercu", alt: "", hidden: true });
  const erreur = el("p", { class: "vide erreur", hidden: true });
  const majJauges = () => { vie.hidden = !["asset", "enemy"].includes(nature.value); sante.hidden = nature.value !== "asset"; };
  nature.addEventListener("change", majJauges); majJauges();
  image.addEventListener("input", () => {
    const u = image.value.trim();
    if (/^https?:\/\/\S+$/i.test(u)) { apercu.src = u; apercu.hidden = false; } else apercu.hidden = true;
  });
  apercu.addEventListener("error", () => { apercu.hidden = true; });
  const generer = () => {
    erreur.hidden = true;
    if (!nom.value.trim()) { erreur.textContent = "Donnez un nom à la carte."; erreur.hidden = false; nom.focus(); return; }
    if (!/^https?:\/\/\S+$/i.test(image.value.trim())) { erreur.textContent = "Le lien de l'image du recto doit commencer par https:// (ou http://)."; erreur.hidden = false; image.focus(); return; }
    ctx.envoyer({ t: "createCustomCard", name: nom.value.trim(), image: image.value.trim(), imageBack: verso.value.trim() || undefined, kind: nature.value,
      health: vie.hidden || !vie.value ? undefined : Number(vie.value), sanity: sante.hidden || !sante.value ? undefined : Number(sante.value) });
    fermer();
  };
  for (const c of [nom, image, verso, vie, sante]) c.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generer(); } });
  return el("section", { class: "carte-perso" },
    el("h3", { text: "Carte personnalisée (image en lien)" }),
    el("div", { class: "carte-perso-corps" },
      el("div", { class: "carte-perso-champs" },
        nom, image, verso,
        el("div", { class: "ligne-boutons" }, nature, vie, sante,
          el("button", { class: "bouton petit", type: "button", onclick: generer, title: "Créer cette carte dans votre zone de menace" }, "Générer")),
        el("p", { class: "aide", text: "Lien direct vers une image (png, jpg, webp) hébergée en https ; la table ne garde que le lien. Le verso sert au retournement, sinon un dos générique." }),
        erreur),
      apercu));
}
