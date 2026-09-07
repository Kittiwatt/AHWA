// Deck importé au lobby (board joueur, cahier §10.3) : champ de lien, résumé du deck, faiblesses à déterminer.

import { el, pluriel } from "./dom.js";
import { CDN, FACTIONS } from "./cartes.js";

const LIENS_ACCEPTES = "arkhamdb.com/deck/view/…, arkhamdb.com/decklist/view/… ou arkham.build/share/… (deck partagé)";

/** Champ « lien du deck » + bouton, sur le siège du joueur. */
export function champImportDeck(ctx, s) {
  const champ = el("input", {
    class: "champ-nom champ-deck", type: "url", maxlength: "300", placeholder: "Lien du deck (ArkhamDB ou arkham.build)",
    "aria-label": "Lien du deck", value: ctx.lienDeck ?? "",
    oninput: (e) => { ctx.lienDeck = e.target.value; },
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); importer(); } },
  });
  const bouton = el("button", { class: "bouton secondaire", type: "button", title: LIENS_ACCEPTES, onclick: () => importer() }, s.deck ? "Remplacer le deck" : "Importer le deck");
  const importer = () => {
    const url = champ.value.trim();
    if (!url) { champ.focus(); return; }
    bouton.disabled = true;
    bouton.textContent = "Import…";
    ctx.envoyer({ t: "importDeck", url });
    setTimeout(() => { bouton.disabled = false; bouton.textContent = s.deck ? "Remplacer le deck" : "Importer le deck"; }, 4000);
  };
  return el("div", { class: "import-deck" },
    champ, bouton,
    el("span", { class: "aide", text: "L'enquêteur est déduit du deck (recto parallèle compris)." }));
}

/** Résumé du deck d'un siège (visible de tous) ; boutons des faiblesses pour le siège lui-même. */
export function blocDeck(s, ctx, estMoi) {
  const d = s.deck;
  const nb = Object.values(d.slots).reduce((n, q) => n + q, 0);
  const liees = Object.values(d.bonded).reduce((n, q) => n + q, 0);
  const lignes = [
    el("p", { class: "deck-nom" },
      el("a", { href: d.url, target: "_blank", rel: "noopener", title: "Ouvrir le deck dans un nouvel onglet" }, d.name),
      el("span", { class: "sous", text: ` · ${d.source === "arkhamdb" ? "ArkhamDB" : "arkham.build"}` })),
    el("p", { class: "sous", text: `${pluriel(nb, "carte")}${liees ? `, ${pluriel(liees, "carte liée", "cartes liées")} hors jeu` : ""}${d.xp ? ` · ${d.xp} XP` : ""}${d.taboo ? " · taboo" : ""}${d.customizations && Object.keys(d.customizations).length ? " · custom" : ""}` }),
  ];
  if (d.weaknessAdded?.length) {
    lignes.push(el("p", { class: "sous", text: `Faiblesse${d.weaknessAdded.length > 1 ? "s" : ""} de base : ${d.weaknessAdded.map((c) => ctx.nomsFaiblesses?.get(c) ?? c).join(", ")}` }));
    chargerFaiblesses().then((liste) => {
      ctx.nomsFaiblesses = new Map(liste.map((f) => [f.c, f.n]));
      const texte = `Faiblesse${d.weaknessAdded.length > 1 ? "s" : ""} de base : ${d.weaknessAdded.map((c) => ctx.nomsFaiblesses.get(c) ?? c).join(", ")}`;
      const p = lignes[2];
      if (p && p.textContent !== texte) p.textContent = texte;
    }).catch(() => {});
  }
  if (d.unknown?.length) lignes.push(el("p", { class: "sous alerte", text: `${pluriel(d.unknown.length, "carte inconnue")} ignorée${d.unknown.length > 1 ? "s" : ""} : ${d.unknown.join(", ")}` }));
  if (d.weaknessPending > 0) {
    lignes.push(el("p", { class: "faiblesse-pending" },
      el("span", { text: `${pluriel(d.weaknessPending, "faiblesse de base aléatoire")} à déterminer` }),
      estMoi ? el("button", { class: "bouton petit", type: "button", onclick: () => ctx.envoyer({ t: "resolveWeakness", choice: "random" }) }, "Tirer au hasard") : null,
      estMoi ? el("button", { class: "bouton secondaire petit", type: "button", onclick: () => ouvrirChoixFaiblesse(ctx) }, "Choisir…") : null,
      estMoi ? null : el("span", { class: "sous", text: " (tirée au lancement si le joueur ne choisit pas)" })));
  }
  return el("div", { class: "bloc-deck" }, ...lignes);
}

let faiblesses = null;
async function chargerFaiblesses() {
  if (faiblesses) return faiblesses;
  const r = await fetch("/data/player_cards.json");
  const data = await r.json();
  faiblesses = data.cards.filter((c) => c.st === "basicweakness").sort((a, b) => a.n.localeCompare(b.n, "en"));
  return faiblesses;
}

/** Fenêtre : choisir une faiblesse de base dans la collection (au lieu du tirage au hasard). */
function ouvrirChoixFaiblesse(ctx) {
  const solo = ctx.etat.state.seats.filter((x) => x.investigatorCode).length <= 1;
  const liste = el("div", { class: "grille-cartes" }, el("p", { class: "vide", text: "Chargement…" }));
  const recherche = el("input", { type: "search", class: "recherche", placeholder: "Nom de la faiblesse…", "aria-label": "Rechercher une faiblesse" });
  const d = el("dialog", { class: "dialogue" },
    el("header", {}, el("h2", { text: "Choisir une faiblesse de base" }), recherche,
      el("button", { class: "bouton secondaire", type: "button", onclick: () => d.close() }, "Fermer")),
    el("div", { class: "generateur" },
      el("p", { class: "sous", text: `Faiblesses de base de la collection, pondérées par leur nombre d'exemplaires pour le tirage au hasard${solo ? " ; en solo, les quatre faiblesses multijoueur de The Dream-Eaters sont exclues" : ""}.` }),
      liste));
  const rendre = (toutes) => {
    const q = recherche.value.trim().toLowerCase();
    const res = toutes.filter((f) => !q || f.n.toLowerCase().includes(q)).filter((f) => !(solo && ["06035", "06036", "06037", "06038"].includes(f.c)));
    liste.replaceChildren(...res.map((f) => el("figure", { class: "carte-peek" },
      el("img", { src: `${CDN}${f.c}.webp`, alt: f.n, loading: "lazy" }),
      el("figcaption", {},
        el("span", {}, el("strong", { text: f.n }), el("span", { class: "meta", text: `${f.q} ex. · ${f.pk}` })),
        el("button", { class: "lien-outil", type: "button", onclick: () => { ctx.envoyer({ t: "resolveWeakness", choice: f.c }); d.close(); } }, "Prendre")))));
    if (!res.length) liste.append(el("p", { class: "vide", text: "Aucune faiblesse ne correspond." }));
  };
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  chargerFaiblesses().then((toutes) => { rendre(toutes); recherche.addEventListener("input", () => rendre(toutes)); recherche.focus(); })
    .catch(() => liste.replaceChildren(el("p", { class: "vide", text: "La liste des faiblesses n'a pas pu être chargée." })));
}

export { FACTIONS };
