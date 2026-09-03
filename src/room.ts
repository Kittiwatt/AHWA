// Durable Object « Room » : une instance par table (id = code de room).
// Squelette v0 : création, connexion WebSocket hibernante, welcome, sièges, purge.
// Aucune action de jeu n'est encore implémentée (voir cahier des charges §4.2).

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import { initialState, PURGE_DELAY_MS, type ClientMessage, type RoomState, type ServerMessage } from "./state";

type Meta = { code: string; scenarioId: string; hostToken: string };
type Attachment = { seat: number | null; isHost: boolean };

export class Room extends Server<Env> {
  // Hibernation : la connexion WebSocket ne maintient pas le DO en mémoire.
  static options = { hibernate: true };

  private meta: Meta | null = null;
  private state: RoomState | null = null;

  // ---- Persistance (1 snapshot par action, cf. §3) -----------------------

  async onStart() {
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS room (k TEXT PRIMARY KEY, json TEXT NOT NULL)"
    );
    const rows = this.ctx.storage.sql.exec<{ k: string; json: string }>("SELECT k, json FROM room").toArray();
    for (const r of rows) {
      if (r.k === "meta") this.meta = JSON.parse(r.json);
      if (r.k === "state") this.state = JSON.parse(r.json);
    }
  }

  private persist(k: "meta" | "state", value: unknown) {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO room (k, json) VALUES (?, ?)", k, JSON.stringify(value));
  }

  private touch() {
    if (!this.state) return;
    this.state.lastActivityAt = Date.now();
    this.persist("state", this.state);
    void this.ctx.storage.setAlarm(Date.now() + PURGE_DELAY_MS);
  }

  // ---- Création via le Worker (POST /api/rooms) ----------------------------

  async onRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "POST" && url.pathname.endsWith("/init")) {
      if (this.meta) return Response.json({ error: "déjà initialisée" }, { status: 409 });
      const meta = (await req.json()) as Meta;
      this.meta = meta;
      this.state = initialState(meta.code, meta.scenarioId);
      this.persist("meta", meta);
      this.touch();
      return Response.json({ ok: true });
    }
    if (req.method === "GET" && url.pathname.endsWith("/exists")) {
      return Response.json({ exists: this.meta !== null });
    }
    return new Response("Not found", { status: 404 });
  }

  // ---- WebSocket -------------------------------------------------------------

  async onConnect(conn: Connection<Attachment>, ctx: ConnectionContext) {
    if (!this.meta || !this.state) {
      conn.close(4404, "room inconnue");
      return;
    }
    const url = new URL(ctx.request.url);
    const isHost = url.searchParams.get("hostToken") === this.meta.hostToken;
    const seatParam = url.searchParams.get("seat");
    const name = (url.searchParams.get("name") ?? "").trim().slice(0, 40) || null;

    let seat: number | null = null;
    if (seatParam !== null && seatParam !== "spectator") {
      const n = Number(seatParam);
      if (!Number.isInteger(n) || n < 0 || n > 3 || this.state.seats[n].occupied) {
        this.send(conn, { t: "seatTaken" });
        conn.close(4409, "siège pris");
        return;
      }
      seat = n;
      this.state.seats[n].occupied = true;
      this.state.seats[n].name = name;
      if (isHost) this.state.hostSeat = n;
    }
    if (isHost) this.state.hostConnected = true;
    conn.setState({ seat, isHost });

    this.send(conn, { t: "welcome", state: this.state, you: { seat, isHost } });
    this.broadcastSeats();
    this.touch();
  }

  async onMessage(conn: Connection<Attachment>, message: WSMessage) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      this.send(conn, { t: "nack", reason: "message illisible" });
      return;
    }
    if (msg.t === "ping") return;
    // Squelette : aucune action de jeu n'est encore branchée.
    this.send(conn, { t: "nack", reason: `action « ${msg.t} » non implémentée` });
  }

  async onClose(conn: Connection<Attachment>) {
    if (!this.state) return;
    const a = conn.state;
    if (a?.seat !== null && a?.seat !== undefined) {
      this.state.seats[a.seat].occupied = false; // siège libéré dès la fermeture (§1)
      if (this.state.hostSeat === a.seat) this.state.hostSeat = null;
    }
    if (a?.isHost) {
      this.state.hostConnected = [...this.getConnections<Attachment>()]
        .some((c) => c !== conn && c.state?.isHost);
    }
    this.broadcastSeats();
    this.touch();
  }

  async onError(conn: Connection<Attachment>, error: unknown) {
    console.error("room ws error", error);
    await this.onClose(conn);
  }

  // ---- Purge après 7 jours sans activité -------------------------------------

  async onAlarm() {
    if (this.state && Date.now() - this.state.lastActivityAt >= PURGE_DELAY_MS) {
      for (const c of this.getConnections()) c.close(4410, "table purgée");
      await this.ctx.storage.deleteAll();
      this.meta = null;
      this.state = null;
    }
  }

  // ---- Utilitaires -------------------------------------------------------------

  private send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcastSeats() {
    if (!this.state) return;
    const msg: ServerMessage = {
      t: "seats",
      seats: this.state.seats.map(({ index, occupied, name, investigatorCode }) => ({ index, occupied, name, investigatorCode })),
      hostConnected: this.state.hostConnected,
    };
    this.broadcast(JSON.stringify(msg));
  }
}
