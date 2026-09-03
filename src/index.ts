// Worker d'entrée : routes API + WebSocket vers le Durable Object, front statique sinon.
//   POST /api/rooms            → crée une room { code, hostToken }
//   GET  /rooms/<code>/ws      → WebSocket vers la room (hibernante)
//   GET  /r/<code>             → page de table (public/room.html)
//   tout le reste              → assets statiques (public/)

import { getServerByName } from "partyserver";
import { newCode, newHostToken, normalizeCode } from "./codes";
import { getScenario } from "./scenario";

import { Room } from "./room";

// Classe liée au binding ROOM. Le nom change à chaque remise à zéro complète des tables
// (migration : suppression de l'ancienne classe = suppression de tous ses objets, création de la nouvelle).
export class RoomV2 extends Room {}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Création d'une room.
    if (path === "/api/rooms" && request.method === "POST") {
      let body: { scenarioId?: string };
      try { body = await request.json(); } catch { return Response.json({ error: "JSON attendu" }, { status: 400 }); }
      // Seuls les scénarios dont la définition est figée dans le registre sont jouables
      // (le statut affiché dans library.json est purement informatif).
      if (!body.scenarioId || !getScenario(body.scenarioId)) {
        return Response.json({ error: "scénario inconnu ou indisponible" }, { status: 400 });
      }
      // Tirage d'un code libre (collision improbable : 31^6 ≈ 887 M).
      for (let i = 0; i < 5; i++) {
        const code = newCode();
        const stub = await getServerByName(env.ROOM, code);
        const exists = await stub.fetch("https://room/exists").then((r) => r.json<{ exists: boolean }>());
        if (exists.exists) continue;
        const hostToken = newHostToken();
        const init = await stub.fetch("https://room/init", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code, scenarioId: body.scenarioId, hostToken }),
        });
        if (init.ok) return Response.json({ code, hostToken });
      }
      return Response.json({ error: "impossible d'attribuer un code" }, { status: 503 });
    }

    // WebSocket d'une room.
    const ws = path.match(/^\/rooms\/([^/]+)\/ws$/);
    if (ws) {
      const code = normalizeCode(ws[1]);
      if (!code) return new Response("code invalide", { status: 400 });
      const stub = await getServerByName(env.ROOM, code);
      return stub.fetch(request);
    }

    // Page de table : même HTML quel que soit le code (le JS lit l'URL).
    if (/^\/r\/[^/]+\/?$/.test(path)) {
      return env.ASSETS.fetch(new Request(new URL("/room", url), request));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
