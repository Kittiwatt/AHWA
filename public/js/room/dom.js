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
