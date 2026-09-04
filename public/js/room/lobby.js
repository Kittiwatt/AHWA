// Lobby : sièges, nom, investigateur, difficulté, enquêteur principal, lancement par l'hôte.

import { el, pluriel } from "./dom.js";
import { CDN, FACTIONS } from "./cartes.js";

const DIFFICULTES = [
  ["easy", "Facile", "je veux vivre l'histoire"],
  ["standard", "Standard", "je veux un défi"],
  ["hard", "Difficile", "un vrai cauchemar"],
  ["expert", "Expert", "je veux Arkham Horror"],
];

export function rendreLobby(conteneur, ctx) {
  const { state, moi, spectateurs } = ctx.etat;
  const nomMemo = localStorage.getItem("ahwa:nom") ?? "";
  const moiAssis = moi.seat !== null;

  const champNom = el("input", {
    class: "champ-nom", type: "text", maxlength: "40", placeholder: "Votre nom (facultatif)", value: nomMemo,
    "aria-label": "Votre nom", onchange: (e) => {
      const nom = e.target.value.trim();
      localStorage.setItem("ahwa:nom", nom);
      if (moiAssis) ctx.envoyer({ t: "setName", name: nom });
    },
  });

  const sieges = state.seats.map((s) => siegeLobby(s, ctx, champNom));

  const difficulte = el("fieldset", { class: "reglage" },
    el("legend", { text: "Difficulté" }),
    ...DIFFICULTES.map(([id, libelle, sous]) => el("label", { class: `choix${state.difficulty === id ? " actif" : ""}` },
      el("input", { type: "radio", name: "difficulte", value: id, checked: state.difficulty === id, disabled: !moiAssis,
        onchange: () => ctx.envoyer({ t: "setDifficulty", d: id }) }),
      el("span", { class: "libelle", text: libelle }),
      el("span", { class: "sous", text: sous }),
    )),
  );

  const avecInv = state.seats.filter((s) => s.investigatorCode);
  const principal = el("fieldset", { class: "reglage" },
    el("legend", { text: "Enquêteur principal" }),
    avecInv.length === 0
      ? el("p", { class: "vide", text: "Choisissez d'abord un enquêteur." })
      : el("div", { class: "choix-ligne" }, ...avecInv.map((s) => el("label", { class: `choix${state.lead === s.index ? " actif" : ""}` },
        el("input", { type: "radio", name: "principal", value: String(s.index), checked: state.lead === s.index, disabled: !moiAssis,
          onchange: () => ctx.envoyer({ t: "setLead", seat: s.index }) }),
        el("span", { class: "libelle", text: nomSiege(s, ctx) }),
      ))),
    el("p", { class: "aide", text: "Marque ★ sur le tapis. L'ordre des tours reste libre : chaque joueur annonce quand il prend le sien." }),
  );

  // Questions de mise en place (journal de campagne) : l'hôte répond, tout le monde les voit.
  const questions = ctx.scenario.questions ?? [];
  ctx.reponses ??= {};
  const blocQuestions = questions.length ? el("fieldset", { class: "reglage questions" },
    el("legend", { text: "Journal de campagne" }),
    el("p", { class: "aide", text: moi.isHost ? "Ces points du journal déterminent la mise en place." : "L'hôte renseigne ces points du journal avant de lancer." }),
    ...questions.map((q) => {
      if (q.type === "number") {
        // Question numérique : valeur par défaut préremplie (toujours répondue), bornes min/max.
        ctx.reponses[q.id] ??= String(q.default ?? q.min ?? 0);
        return el("div", { class: "question" },
          el("label", { class: "libelle" }, q.text, " ",
            el("input", { type: "number", class: "nombre", name: `q-${q.id}`, min: String(q.min ?? 0), max: String(q.max ?? 99), value: ctx.reponses[q.id], disabled: !moi.isHost,
              // Pas de nouveau rendu du lobby (la réponse existe toujours) : un rendu pendant le blur du champ provoquerait un rendu imbriqué.
              onchange: (e) => { const v = Math.min(q.max ?? 99, Math.max(q.min ?? 0, Math.round(Number(e.target.value) || 0))); ctx.reponses[q.id] = String(v); e.target.value = String(v); } })));
      }
      return el("div", { class: "question" },
        el("p", { class: "libelle", text: q.text }),
        el("div", { class: "choix-ligne" }, ...q.options.map((o) => el("label", { class: `choix${ctx.reponses[q.id] === o.id ? " actif" : ""}` },
          el("input", { type: "radio", name: `q-${q.id}`, value: o.id, checked: ctx.reponses[q.id] === o.id, disabled: !moi.isHost,
            onchange: () => { ctx.reponses[q.id] = o.id; rendreLobby(conteneur, ctx); } }),
          el("span", { class: "libelle", text: o.label })))));
    }),
  ) : null;
  const toutesRepondues = questions.every((q) => ctx.reponses[q.id]);

  const lancement = el("div", { class: "lancement" });
  if (moi.isHost) {
    const pret = avecInv.length > 0 && toutesRepondues;
    lancement.append(
      el("button", { class: "bouton grand", type: "button", disabled: !pret, onclick: () => ctx.envoyer({ t: "startSetup", answers: ctx.reponses }) },
        "Lancer la mise en place"),
      el("p", { class: "aide", text: pret
        ? `${pluriel(avecInv.length, "enquêteur")} — le nombre est figé au lancement ; les lieux, la pioche et le sac du chaos sont préparés automatiquement.`
        : avecInv.length === 0 ? "Il faut au moins un siège avec un enquêteur." : "Répondez d'abord aux points du journal de campagne." }),
      el("button", { class: "bouton secondaire danger", type: "button", onclick: () => {
        if (confirm("Supprimer définitivement cette table ?")) ctx.envoyer({ t: "deleteRoom" });
      } }, "Supprimer la table"),
    );
  } else {
    lancement.append(el("p", { class: "attente", text: state.hostConnected
      ? "L'hôte lancera la mise en place quand tout le monde sera prêt."
      : "L'hôte est déconnecté." }));
    if (!state.hostConnected && moiAssis) {
      lancement.append(el("button", { class: "bouton", type: "button", onclick: () => ctx.envoyer({ t: "claimHost" }) },
        "Reprendre le rôle d'hôte"));
    }
  }

  conteneur.replaceChildren(
    el("header", { class: "lobby-entete" },
      el("div", {},
        el("p", { class: "surtitre", text: `${ctx.scenario.campaign} · ${ctx.campagneBoite ?? ""}`.replace(/ · $/, "") }),
        el("h1", { text: ctx.scenario.title }),
      ),
      el("div", { class: "partage" },
        el("p", { class: "etiquette", text: "Code de la table" }),
        el("p", { class: "code-table", text: state.code }),
        el("button", { class: "bouton secondaire", type: "button", onclick: copierLien }, "Copier le lien"),
      ),
    ),
    el("section", { class: "sieges-lobby", "aria-label": "Sièges" }, ...sieges),
    el("section", { class: "reglages" }, difficulte, principal),
    blocQuestions,
    lancement,
    el("p", { class: "spectateurs", text: spectateurs > 0 ? pluriel(spectateurs, "spectateur") : "" }),
  );
}

export function nomSiege(s, ctx) {
  if (s.name) return s.name;
  const inv = ctx.investigateurs.get(s.investigatorCode);
  return inv ? inv.name : `Siège ${s.index + 1}`;
}

function siegeLobby(s, ctx, champNom) {
  const { state, moi } = ctx.etat;
  const inv = ctx.investigateurs.get(s.investigatorCode);
  const estMoi = moi.seat === s.index;
  const prenable = !s.occupied && moi.seat === null && (state.phase === "lobby" || s.investigatorCode);

  const entete = el("header", {},
    el("span", { class: `etat-siege ${s.occupied ? "connecte" : "libre"}`, title: s.occupied ? "connecté" : "libre" }),
    el("h2", { text: `Siège ${s.index + 1}` }),
    s.occupied && s.name ? el("span", { class: "nom", text: s.name }) : null,
    estMoi ? el("span", { class: "vous", text: "vous" }) : null,
    state.lead === s.index && s.investigatorCode ? el("span", { class: "etoile", title: "enquêteur principal", text: "★" }) : null,
  );

  const corps = el("div", { class: "corps" });
  if (inv) {
    const faction = FACTIONS[inv.faction] ?? FACTIONS.neutral;
    corps.append(
      inv.custom && !inv.image
        ? el("div", { class: "vignette sans-image", text: inv.name })
        : el("img", { class: `vignette${inv.custom ? " custom" : ""}`, src: inv.custom ? inv.image : `${CDN}${inv.code}.webp`, alt: inv.name, loading: "lazy" }),
      el("div", { class: "fiche", style: { "--faction": faction.couleur } },
        el("strong", { text: inv.name }),
        el("span", { class: "sous", text: `${inv.subname}${inv.parallel ? " (parallèle)" : ""}` }),
        inv.custom ? null : el("span", { class: "classe", text: faction.nom }),
        el("span", { class: "stats", text: `${inv.health} vie · ${inv.sanity} santé mentale` }),
      ),
    );
  } else {
    corps.append(el("p", { class: "vide", text: s.occupied ? "Choisit son enquêteur…" : "Personne à ce siège." }));
  }

  const actions = el("footer", { class: "actions" });
  if (estMoi) {
    actions.append(
      el("button", { class: "bouton", type: "button", onclick: () => ouvrirChoixInvestigateur(ctx) }, inv ? "Changer d'enquêteur" : "Choisir un enquêteur"),
      el("button", { class: "bouton secondaire", type: "button", onclick: () => ctx.envoyer({ t: "leaveSeat" }) }, "Quitter le siège"),
    );
  } else if (prenable) {
    actions.append(
      champNom,
      el("button", { class: "bouton", type: "button", onclick: () => {
        const nom = champNom.value.trim();
        localStorage.setItem("ahwa:nom", nom);
        ctx.envoyer({ t: "takeSeat", seat: s.index, name: nom });
      } }, s.investigatorCode && !s.occupied && state.phase !== "lobby" ? "Reprendre ce siège" : "S'asseoir ici"),
    );
  } else if (moi.isHost && (s.occupied || s.investigatorCode)) {
    actions.append(el("button", { class: "bouton secondaire", type: "button", title: "Libère le siège et son enquêteur",
      onclick: () => { if (confirm(`Libérer le siège ${s.index + 1} ?`)) ctx.envoyer({ t: "kick", seat: s.index }); } }, "Libérer"));
  } else if (!s.occupied && s.investigatorCode && state.phase === "lobby") {
    actions.append(el("span", { class: "aide", text: "Le joueur s'est déconnecté." }));
  }

  return el("article", { class: `siege-lobby${estMoi ? " moi" : ""}${s.occupied ? " occupe" : ""}` }, entete, corps, actions);
}

// ---- Choix d'un investigateur (fenêtre) --------------------------------------------

function ouvrirChoixInvestigateur(ctx) {
  const { state } = ctx.etat;
  const dejaPris = new Set(state.seats.filter((s) => s.index !== ctx.etat.moi.seat).map((s) => s.investigatorCode));
  const liste = el("div", { class: "liste-inv" });
  const recherche = el("input", { type: "search", class: "recherche", placeholder: "Nom, classe ou extension…", "aria-label": "Rechercher un enquêteur", autofocus: true });
  const dialogue = el("dialog", { class: "dialogue-inv" },
    el("header", {}, el("h2", { text: "Choisir un enquêteur" }), recherche,
      el("button", { class: "bouton secondaire", type: "button", onclick: () => dialogue.close() }, "Fermer")),
    liste,
  );

  // Enquêteur personnalisé (hors ArkhamDB) : nom, image et jauges saisis à la main ; toujours proposé en tête de liste.
  const moi = state.seats[ctx.etat.moi.seat];
  const entreeCustom = () => el("button", { class: "inv-custom", type: "button", style: { "--faction": FACTIONS.neutral.couleur },
    onclick: () => rendreFormulaire() },
    el("span", { class: "icone", text: "✎" }),
    el("span", { class: "nom" }, "Enquêteur personnalisé", el("span", { class: "sous", text: moi?.custom ? ` · ${moi.custom.name}` : "" })),
    el("span", { class: "meta", text: "Nom, image et jauges de votre choix" }));

  const rendre = () => {
    const q = recherche.value.trim().toLowerCase();
    liste.replaceChildren();
    recherche.disabled = false;
    if (!q) liste.append(el("h3", { style: { "--faction": FACTIONS.neutral.couleur }, text: "Hors collection" }), entreeCustom());
    let faction = null;
    for (const inv of ctx.listeInvestigateurs) {
      const cible = `${inv.name} ${inv.subname} ${FACTIONS[inv.faction]?.nom ?? ""} ${inv.packName}`.toLowerCase();
      if (q && !cible.includes(q)) continue;
      if (inv.faction !== faction) {
        faction = inv.faction;
        liste.append(el("h3", { style: { "--faction": FACTIONS[faction]?.couleur }, text: FACTIONS[faction]?.nom ?? faction }));
      }
      const pris = dejaPris.has(inv.code);
      liste.append(el("button", { class: "inv", type: "button", disabled: pris, style: { "--faction": FACTIONS[inv.faction]?.couleur },
        onclick: () => { ctx.envoyer({ t: "chooseInvestigator", code: inv.code }); dialogue.close(); } },
        el("img", { src: `${CDN}${inv.code}.webp`, alt: "", loading: "lazy" }),
        el("span", { class: "nom" }, inv.name, el("span", { class: "sous", text: ` ${inv.subname}${inv.parallel ? " · parallèle" : ""}` })),
        el("span", { class: "meta", text: `${inv.packName} · ${inv.health} vie · ${inv.sanity} santé${pris ? " · déjà pris" : ""}` }),
      ));
    }
    if (!liste.childElementCount) liste.append(el("p", { class: "vide", text: "Aucun enquêteur ne correspond." }), entreeCustom());
  };

  const rendreFormulaire = () => {
    const c = moi?.custom ?? { name: "", image: "", health: 7, sanity: 7 };
    recherche.disabled = true;
    const champ = (id, libelle, attrs, aide) => {
      const input = el("input", { id: `custom-${id}`, name: id, ...attrs });
      return [input, el("label", { class: "champ", for: `custom-${id}` }, el("span", { class: "libelle", text: libelle }), input, aide ? el("span", { class: "aide", text: aide }) : null)];
    };
    const [nom, lNom] = champ("nom", "Nom", { type: "text", maxlength: "40", required: true, value: c.name, placeholder: "Nom de l'enquêteur" });
    const [image, lImage] = champ("image", "Image (lien)", { type: "url", maxlength: "600", value: c.image ?? "", placeholder: "https://…" },
      "Facultatif. Lien direct vers l'image de la carte (jpg, png, webp) ; sans image, le nom est affiché sur la carte et le pion.");
    const [vie, lVie] = champ("vie", "Vie", { type: "number", min: "1", max: "99", required: true, value: String(c.health) });
    const [sante, lSante] = champ("sante", "Santé mentale", { type: "number", min: "1", max: "99", required: true, value: String(c.sanity) });
    const apercu = el("div", { class: "apercu-custom" });
    const majApercu = () => {
      const u = image.value.trim();
      apercu.replaceChildren(u ? el("img", { src: u, alt: "" , onerror: (e) => e.target.replaceWith(el("span", { class: "vide", text: "Image introuvable à ce lien." })) })
        : el("span", { class: "vide", text: nom.value.trim() || "Aperçu" }));
    };
    image.addEventListener("change", majApercu);
    nom.addEventListener("input", () => { if (!image.value.trim()) majApercu(); });
    majApercu();
    const erreur = el("p", { class: "erreur-form", hidden: true });
    const valider = () => {
      const name = nom.value.trim();
      const health = Math.round(Number(vie.value)), sanity = Math.round(Number(sante.value));
      const url = image.value.trim();
      const bornes = (n) => Number.isFinite(n) && n >= 1 && n <= 99;
      if (!name) { erreur.textContent = "Donnez un nom à l'enquêteur."; erreur.hidden = false; nom.focus(); return; }
      if (!bornes(health) || !bornes(sanity)) { erreur.textContent = "Vie et santé mentale : un entier de 1 à 99."; erreur.hidden = false; return; }
      if (url && !/^https?:\/\/\S+$/i.test(url)) { erreur.textContent = "Le lien de l'image doit commencer par http(s)://."; erreur.hidden = false; image.focus(); return; }
      ctx.envoyer({ t: "chooseCustomInvestigator", name, image: url, health, sanity });
      dialogue.close();
    };
    liste.replaceChildren(el("form", { class: "form-custom", onsubmit: (e) => { e.preventDefault(); valider(); } },
      el("h3", { style: { "--faction": FACTIONS.neutral.couleur }, text: "Enquêteur personnalisé" }),
      el("p", { class: "aide", text: "Pour un enquêteur absent d'ArkhamDB (création, épreuve, version maison). Ses jauges deviennent la vie et la santé mentale du siège." }),
      el("div", { class: "champs" }, lNom, lImage, el("div", { class: "jauges" }, lVie, lSante)),
      apercu,
      erreur,
      el("div", { class: "boutons" },
        el("button", { class: "bouton", type: "submit" }, moi?.custom ? "Mettre à jour" : "Prendre cet enquêteur"),
        el("button", { class: "bouton secondaire", type: "button", onclick: () => { recherche.value = ""; rendre(); } }, "Retour à la liste")),
    ));
    nom.focus();
  };

  recherche.addEventListener("input", rendre);
  rendre();
  document.body.append(dialogue);
  dialogue.addEventListener("close", () => dialogue.remove());
  dialogue.showModal();
}

export function copierLien() {
  const lien = location.origin + location.pathname;
  navigator.clipboard?.writeText(lien).then(
    () => signaler("Lien copié."),
    () => signaler(lien),
  );
}

export function signaler(texte) {
  document.dispatchEvent(new CustomEvent("ahwa:info", { detail: texte }));
}
