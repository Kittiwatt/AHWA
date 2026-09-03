// Connexion WebSocket à la room : welcome, deltas, sièges, reconnexion.

import { appliquerPatch } from "./patch.js";

export function creerConnexion({ code, hostToken, seat, name, on }) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let ws = null;
  let fermeVolontaire = false;
  let essais = 0;
  const etat = { state: null, moi: { seat: null, isHost: false }, spectateurs: 0, souhait: { seat, name } };

  function url() {
    const u = new URL(`${proto}://${location.host}/rooms/${code}/ws`);
    u.searchParams.set("seat", etat.souhait.seat === null ? "spectator" : String(etat.souhait.seat));
    if (etat.souhait.name) u.searchParams.set("name", etat.souhait.name);
    if (hostToken()) u.searchParams.set("hostToken", hostToken());
    return u;
  }

  function ouvrir() {
    ws = new WebSocket(url());
    ws.addEventListener("open", () => { essais = 0; on.ouvert?.(); });
    ws.addEventListener("message", (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      recevoir(msg);
    });
    ws.addEventListener("close", (ev) => {
      on.ferme?.(ev.code, ev.reason);
      if (fermeVolontaire) return;
      if ([4404, 4410, 4411].includes(ev.code)) return; // room inconnue, purgée, supprimée : pas de reprise
      if (ev.code === 4409) { etat.souhait.seat = null; }      // siège pris : on revient en spectateur
      const delai = Math.min(8000, 1000 * 2 ** Math.min(essais++, 3));
      setTimeout(ouvrir, delai);
    });
    ws.addEventListener("error", () => {});
  }

  function recevoir(msg) {
    switch (msg.t) {
      case "welcome":
        etat.state = msg.state;
        etat.moi = msg.you;
        etat.souhait.seat = msg.you.seat;
        on.etat?.("welcome");
        break;
      case "delta":
        if (!etat.state) return;
        if (msg.rev !== etat.state.rev + 1) { envoyer({ t: "resync" }); return; }
        try { appliquerPatch(etat.state, msg.patch); } catch { envoyer({ t: "resync" }); return; }
        on.etat?.("delta", msg.patch);
        break;
      case "seats":
        if (!etat.state) return;
        for (const s of msg.seats) Object.assign(etat.state.seats[s.index], s);
        etat.state.hostSeat = msg.hostSeat ?? null;
        etat.state.hostConnected = msg.hostConnected;
        etat.spectateurs = msg.spectators ?? 0;
        on.etat?.("seats");
        break;
      case "you":
        etat.moi = { seat: msg.seat, isHost: msg.isHost };
        etat.souhait.seat = msg.seat;
        on.etat?.("you");
        break;
      case "hostToken":
        on.hostToken?.(msg.token);
        break;
      case "reminder":
        on.rappel?.(msg.entry);
        break;
      case "peek":
        on.peek?.(msg.pile, msg.cards);
        break;
      case "nack":
        on.refus?.(msg.reason);
        break;
      case "seatTaken":
        etat.souhait.seat = null;
        on.refus?.("Ce siège vient d'être pris.");
        break;
    }
  }

  function envoyer(msg) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else on.refus?.("La connexion à la table est interrompue ; nouvelle tentative en cours.");
  }

  ouvrir();
  return {
    etat,
    envoyer,
    fermer() { fermeVolontaire = true; ws?.close(); },
    reconnecter() { fermeVolontaire = false; ws?.close(); },
  };
}
