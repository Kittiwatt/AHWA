// Page de table (placeholder) : ouvre le WebSocket et affiche le « welcome ».
const code = location.pathname.split("/").filter(Boolean)[1]?.toUpperCase() ?? "";
const $code = document.getElementById("code");
const $etat = document.getElementById("etat");
const $journal = document.getElementById("journal");

function note(texte) {
  $journal.append(Object.assign(document.createElement("p"), { textContent: texte }));
}

$code.textContent = code || "······";

if (!/^[A-Z2-9]{6}$/.test(code)) {
  $etat.textContent = "Ce code de table n’est pas valide.";
  $etat.classList.add("erreur");
} else {
  const hostToken = localStorage.getItem(`ahwa:host:${code}`) ?? "";
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const url = new URL(`${proto}://${location.host}/rooms/${code}/ws`);
  url.searchParams.set("seat", "spectator");
  if (hostToken) url.searchParams.set("hostToken", hostToken);

  const ws = new WebSocket(url);
  ws.addEventListener("open", () => note("Connexion ouverte."));
  ws.addEventListener("message", (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { note(`Message illisible : ${ev.data}`); return; }
    if (msg.t === "welcome") {
      const s = msg.state;
      document.title = `Table ${code} — Anofelis`;
      $etat.innerHTML = `Scénario <strong>${s.scenarioId ?? "inconnu"}</strong>, phase <strong>${s.phase}</strong>,`
        + ` révision ${s.rev}. Vous êtes ${msg.you.isHost ? "l’hôte" : "spectateur"}.`;
      note("État reçu (welcome).");
    } else if (msg.t === "nack") {
      note(`Refusé : ${msg.reason}`);
    } else if (msg.t === "seats") {
      note(`Sièges : ${msg.seats.filter((x) => x.occupied).length} occupé(s).`);
    } else {
      note(`Message ${msg.t}.`);
    }
  });
  ws.addEventListener("close", (ev) => {
    if (ev.code === 4404) {
      $etat.textContent = "Aucune table ne porte ce code. Vérifiez‑le, ou créez une table depuis la bibliothèque.";
      $etat.classList.add("erreur");
    } else {
      note(`Connexion fermée (${ev.code}).`);
    }
  });
  ws.addEventListener("error", () => note("Erreur de connexion."));
}
