// Petit utilitaire de création d'éléments.
export function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k in n && typeof v === "boolean") n[k] = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const e of enfants) if (e !== null && e !== undefined && e !== false) n.append(e);
  return n;
}

export function pluriel(n, sing, plur = sing + "s") {
  return `${n} ${n > 1 ? plur : sing}`;
}


/** Sur une table, le clic droit n'ouvre que les menus de l'appli : le menu contextuel du navigateur est neutralisé
 *  partout dans `zone` et sur nos propres menus (`.menu-carte`). Ce second point compte sous Windows, où le
 *  navigateur déclenche `contextmenu` au relâchement, donc APRÈS le `pointerup` qui a pu ouvrir un menu à la position
 *  du curseur : le test de visée tombe alors, selon l'arrondi du pixel, sur le coin de ce menu tout neuf plutôt que
 *  sur la carte — et un écouteur qui ne reconnaît ni carte ni outil laissait passer le menu natif (retour de test du
 *  2026-09-10). Exceptions : champs de saisie, liens et blocs de texte listés dans `sauf` (copier-coller).
 *  Les écouteurs des menus restent maîtres (ils décident d'ouvrir ou non) ; ici on ne fait qu'empêcher le natif. */
export function neutraliserMenuNatif(zone, sauf = "") {
  const exceptions = ["input, textarea, select, [contenteditable]", "a[href]", sauf].filter(Boolean).join(", ");
  document.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t.closest(exceptions)) return;
    if (t.closest(`${zone}, .menu-carte`)) e.preventDefault();
  });
}

/** Plein écran (F11) : la fenêtre remplit l'écran → classe `plein-ecran` sur <html> (la barre du haut s'efface). */
export function surveillerPleinEcran() {
  // Le mode plein écran du navigateur (F11) et l'API Fullscreen font correspondre `display-mode: fullscreen` ;
  // pas d'heuristique sur la taille de la fenêtre (elle se déclenche à tort en mode kiosque ou sans tests).
  const mq = window.matchMedia("(display-mode: fullscreen)");
  const maj = () => document.documentElement.classList.toggle("plein-ecran", mq.matches || Boolean(document.fullscreenElement));
  mq.addEventListener("change", maj);
  document.addEventListener("fullscreenchange", maj);
  maj();
}

/** Le bouton déployé d'une chip (« − » ou « + » au survol) reste disponible pour plusieurs clics : chaque clic fait
 *  re-rendre la carte, le siège ou l'entête, et la chip sous la souris est souvent un élément neuf, plus étroit, que le
 *  navigateur ne considère pas survolé tant que la souris ne bouge pas — le bouton se repliait après un seul clic
 *  (retour de test du 2026-09-10). On mémorise la chip survolée par une clé stable (jeton + carte / siège / entête /
 *  barrière) et on repose la classe `ouverte` (même rendu que `:hover`) sur son remplaçant dès qu'il apparaît ; la
 *  classe tombe quand la souris quitte la chip ou qu'on appuie ailleurs. */
export function garderChipsDeployees() {
  let cle = null;
  const cleDe = (chip) => {
    const porteur = chip.closest(".carte, [data-seat], .entete-joueur");
    const id = porteur?.dataset.id ?? porteur?.dataset.seat ?? (porteur ? "entete" : "");
    return `${chip.dataset.token ?? ""}@${id}@${chip.dataset.a ?? ""}/${chip.dataset.b ?? ""}`;
  };
  const fermer = () => { for (const c of document.querySelectorAll(".chip.ouverte")) c.classList.remove("ouverte"); cle = null; };
  const chipSous = (e) => (e.target instanceof Element ? e.target.closest(".chip") : null);
  document.addEventListener("pointermove", (e) => {
    const chip = chipSous(e);
    if (!chip) { if (cle) fermer(); return; }
    const k = cleDe(chip);
    if (k !== cle) { fermer(); cle = k; }
    chip.classList.add("ouverte");
  }, true);
  document.addEventListener("pointerdown", (e) => { if (cle && !chipSous(e)) fermer(); }, true);
  document.addEventListener("pointerleave", () => fermer());
  new MutationObserver(() => {
    if (!cle || document.querySelector(".chip.ouverte")) return;
    for (const chip of document.querySelectorAll(".chip")) if (cleDe(chip) === cle) { chip.classList.add("ouverte"); return; }
  }).observe(document.body, { childList: true, subtree: true });
}
