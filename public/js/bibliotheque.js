// Bibliothèque : rend public/data/library.json et crée les rooms.
const LIBELLES = { available: "disponible", wip: "en cours", planned: "prévu" };
const conteneur = document.getElementById("catalogue");

function el(tag, attrs = {}, ...enfants) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const e of enfants) n.append(e);
  return n;
}

async function creerRoom(scenario, bouton) {
  bouton.disabled = true;
  bouton.textContent = "Création…";
  try {
    const r = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenarioId: scenario.id }),
    });
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    const { code, hostToken } = await r.json();
    localStorage.setItem(`ahwa:host:${code}`, hostToken);
    location.href = `/r/${code}`;
  } catch (err) {
    bouton.disabled = false;
    bouton.textContent = "Créer une table";
    alert(`La table n’a pas pu être créée (${err.message}). Réessayez dans un instant.`);
  }
}

function ligneScenario(s) {
  const action = el("span", { class: "action" });
  if (s.status === "available") {
    const b = el("button", { class: "bouton", type: "button" }, "Créer une table");
    b.addEventListener("click", () => creerRoom(s, b));
    action.append(b);
  }
  const titre = el("span", { class: "titre" }, s.title);
  if (s.note) titre.append(el("span", { class: "note" }, s.note));
  return el("li", { class: `scenario ${s.status}` },
    el("span", { class: "num" }, s.num),
    titre,
    el("span", { class: `statut ${s.status}` }, LIBELLES[s.status] ?? s.status),
    action,
  );
}

function sectionCampagne(c) {
  const liste = el("ol");
  for (const s of c.scenarios) liste.append(ligneScenario(s));
  return el("section", { class: "campagne", "aria-labelledby": `c-${c.id}` },
    el("header", {}, el("h2", { id: `c-${c.id}` }, c.title), el("span", { class: "boite" }, c.box)),
    liste,
  );
}

(async () => {
  try {
    const r = await fetch("/data/library.json");
    if (!r.ok) throw new Error(`réponse ${r.status}`);
    const data = await r.json();
    conteneur.replaceChildren(...data.campaigns.map(sectionCampagne));
  } catch (err) {
    conteneur.textContent = `Le catalogue n’a pas pu être chargé (${err.message}). Rechargez la page.`;
    conteneur.classList.add("erreur");
  }
})();
