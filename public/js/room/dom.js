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
