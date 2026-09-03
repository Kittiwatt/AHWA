// Durable Object « Room » : une instance par table (id = code de room).
// Étape 1 (2026-09-03) : lobby (sièges, investigateurs, difficulté, enquêteur principal), mise en
// place automatique, réinitialisation, clôture, transfert du rôle d'hôte. Les actions de jeu sur le
// tapis (déplacements, phases, doom, indices, rencontre, chaos) arrivent à l'étape 2.
//
// Serveur autoritaire : chaque action est validée puis appliquée à `state`, l'état est persisté en
// un snapshot SQLite et un delta JSON Patch est diffusé (cahier des charges §3, §4).

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  DIFFICULTIES, initialState, emptyPiles, PURGE_DELAY_MS,
  type ClientMessage, type Difficulty, type LogEntry, type RoomState, type ServerMessage,
} from "./state";
import { diff, clone } from "./patch";
import { getScenario } from "./scenario";
import { addLog, runSetup } from "./setup";
import { jouer, Refus, refuser } from "./actions";
import { newHostToken } from "./codes";
import investigatorsIndex from "../public/data/investigators.json";

type Meta = { code: string; scenarioId: string; hostToken: string };
type Attachment = { seat: number | null; isHost: boolean };

const INVESTIGATORS = new Map(investigatorsIndex.investigators.map((i) => [i.code, i]));


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
    if (this.state && !this.state.links) this.state.links = []; // tables créées avant le champ
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
      if (!getScenario(meta.scenarioId)) return Response.json({ error: "scénario inconnu" }, { status: 400 });
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
    const name = nomPropre(url.searchParams.get("name"));

    let seat: number | null = null;
    if (seatParam !== null && seatParam !== "spectator") {
      const n = Number(seatParam);
      if (!this.siegePrenable(n)) {
        conn.setState({ seat: null, isHost });
        this.send(conn, { t: "seatTaken" });
        conn.close(4409, "siège pris");
        return;
      }
      seat = n;
      this.asseoir(n, name, isHost);
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
    if (!this.state || !this.meta) { conn.close(4404, "room inconnue"); return; }
    if (msg.t === "ping") return;
    try {
      await this.appliquer(conn, msg);
    } catch (e) {
      if (e instanceof Refus) this.send(conn, { t: "nack", reason: e.message });
      else {
        console.error("room action error", e);
        this.send(conn, { t: "nack", reason: "erreur interne" });
      }
    }
  }

  async onClose(conn: Connection<Attachment>) {
    if (!this.state) return;
    this.liberer(conn);
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
      await this.detruire(4410, "table purgée");
    }
  }

  // ---- Actions ------------------------------------------------------------------

  private async appliquer(conn: Connection<Attachment>, msg: ClientMessage) {
    const state = this.state!;
    const a = conn.state ?? { seat: null, isHost: false };
    const seated = () => (a.seat === null ? refuser("il faut être assis pour agir") : a.seat);
    const host = () => (a.isHost ? true : refuser("réservé à l'hôte"));
    const lobby = () => (state.phase === "lobby" ? true : refuser("possible seulement au lobby"));

    switch (msg.t) {
      case "resync":
        this.send(conn, { t: "welcome", state, you: { seat: a.seat, isHost: a.isHost } });
        return;

      // ---- Sièges (hors rev : diffusés par le message « seats ») ----
      case "takeSeat": {
        if (a.seat !== null) refuser("vous êtes déjà assis");
        const n = Number(msg.seat);
        if (!this.siegePrenable(n)) refuser("ce siège n'est pas disponible");
        this.asseoir(n, nomPropre(msg.name), a.isHost);
        conn.setState({ seat: n, isHost: a.isHost });
        this.send(conn, { t: "you", seat: n, isHost: a.isHost });
        this.broadcastSeats();
        this.touch();
        return;
      }
      case "leaveSeat": {
        if (a.seat === null) return;
        this.liberer(conn);
        conn.setState({ seat: null, isHost: a.isHost });
        this.send(conn, { t: "you", seat: null, isHost: a.isHost });
        this.broadcastSeats();
        this.touch();
        return;
      }
      case "setName": {
        const s = seated();
        state.seats[s].name = nomPropre(msg.name);
        this.broadcastSeats();
        this.touch();
        return;
      }

      // ---- Lobby ----
      case "chooseInvestigator": {
        const s = seated(); lobby();
        const code = String(msg.code ?? "");
        const inv = INVESTIGATORS.get(code) ?? refuser("investigateur inconnu");
        const doublon = state.seats.find((x) => x.index !== s && x.investigatorCode === code);
        if (doublon) refuser(`${inv.name} est déjà choisi au siège ${doublon.index + 1}`);
        const before = clone(state);
        const seat = state.seats[s];
        seat.investigatorCode = code;
        seat.counters.health = inv.health;
        seat.counters.sanity = inv.sanity;
        if (state.lead === null) state.lead = s;
        this.commit(before);
        return;
      }
      case "clearInvestigator": {
        const s = seated(); lobby();
        const before = clone(state);
        this.viderSiege(s);
        this.commit(before);
        return;
      }
      case "setDifficulty": {
        seated(); lobby();
        const d = String(msg.d) as Difficulty;
        if (!DIFFICULTIES.includes(d)) refuser("difficulté inconnue");
        const before = clone(state);
        state.difficulty = d;
        this.commit(before);
        return;
      }
      case "setLead": {
        seated();
        const n = Number(msg.seat);
        if (!Number.isInteger(n) || n < 0 || n > 3 || !state.seats[n].investigatorCode) refuser("ce siège n'a pas d'enquêteur");
        const before = clone(state);
        state.lead = n;
        this.commit(before);
        return;
      }
      case "claimHost": {
        const s = seated();
        if (state.hostConnected) refuser("l'hôte est connecté");
        const before = clone(state);
        this.meta!.hostToken = newHostToken();
        this.persist("meta", this.meta);
        for (const c of this.getConnections<Attachment>()) {
          if (c.state?.isHost) c.setState({ seat: c.state.seat, isHost: false });
        }
        conn.setState({ seat: s, isHost: true });
        state.hostSeat = s;
        state.hostConnected = true;
        addLog(state, "system", `${this.nomSiege(s)} reprend le rôle d'hôte.`);
        this.send(conn, { t: "hostToken", token: this.meta!.hostToken });
        this.send(conn, { t: "you", seat: s, isHost: true });
        this.commit(before);
        this.broadcastSeats();
        return;
      }
      case "kick": {
        host();
        const n = Number(msg.seat);
        if (!Number.isInteger(n) || n < 0 || n > 3) refuser("siège invalide");
        const before = clone(state);
        for (const c of this.getConnections<Attachment>()) {
          if (c.state?.seat === n && c !== conn) {
            c.setState({ seat: null, isHost: c.state.isHost });
            this.send(c, { t: "you", seat: null, isHost: c.state?.isHost ?? false });
          }
        }
        if (a.seat === n) conn.setState({ seat: null, isHost: true });
        state.seats[n].occupied = false;
        if (state.hostSeat === n) state.hostSeat = null;
        if (state.phase === "lobby") this.viderSiege(n);
        this.commit(before);
        this.broadcastSeats();
        return;
      }

      // ---- Hôte : mise en place, réinitialisation, clôture ----
      case "startSetup": {
        host(); lobby();
        const def = getScenario(state.scenarioId) ?? refuser("scénario indisponible");
        if (!state.seats.some((s) => s.investigatorCode)) refuser("choisissez au moins un enquêteur");
        if (def.questions.length) refuser("questions de mise en place non prises en charge (v1)");
        const before = clone(state);
        const reminders = runSetup(state, def);
        this.commit(before, reminders);
        return;
      }
      case "reset": {
        host();
        if (state.phase === "lobby") refuser("la table est déjà au lobby");
        const before = clone(state);
        state.phase = "lobby";
        state.round = 0;
        state.playerCount = 0;
        state.cards = {};
        state.piles = emptyPiles();
        state.links = [];
        state.chaos = { bag: [], drawn: [], sealed: [] };
        state.counters = {};
        state.agendaId = null;
        state.actId = null;
        state.turn = { seat: null, done: [] };
        state.pendingQuestion = null;
        state.log = [];
        for (const s of state.seats) { s.counters.clues = 0; s.counters.actions = 3; }
        addLog(state, "system", "Table réinitialisée : retour au lobby, sièges et enquêteurs conservés.");
        this.commit(before);
        return;
      }
      case "close": {
        host();
        if (state.phase === "lobby") refuser("rien à clôturer");
        const before = clone(state);
        state.phase = "resolution";
        addLog(state, "system", "Partie terminée : le tapis reste consultable.");
        this.commit(before);
        return;
      }
      case "deleteRoom": {
        host();
        await this.detruire(4411, "table supprimée par l'hôte");
        return;
      }

      // ---- Actions de jeu (étape 2) : ouvertes à tout joueur assis ----
      default: {
        if (state.phase === "lobby") refuser("la partie n'est pas commencée");
        const def = getScenario(state.scenarioId) ?? refuser("scénario indisponible");
        const before = clone(state);
        const res = jouer(state, def, msg, a.seat, Math.random);
        if (res.peek) { this.send(conn, { t: "peek", pile: res.peek.pile, cards: res.peek.cards }); return; }
        this.commit(before, res.reminders ?? []);
      }
    }
  }

  /** Incrémente rev, persiste et diffuse le delta calculé par rapport au snapshot `before`. */
  private commit(before: RoomState, reminders: LogEntry[] = []) {
    const state = this.state!;
    state.rev++;
    state.lastActivityAt = Date.now();
    const patch = diff(before, state);
    this.persist("state", state);
    void this.ctx.storage.setAlarm(Date.now() + PURGE_DELAY_MS);
    this.broadcast(JSON.stringify({ t: "delta", rev: state.rev, patch } satisfies ServerMessage));
    for (const entry of reminders) this.broadcast(JSON.stringify({ t: "reminder", entry } satisfies ServerMessage));
  }

  private async detruire(code: number, raison: string) {
    // L'état est retiré d'abord : les onClose déclenchés par les fermetures ne doivent plus rien persister.
    this.meta = null;
    this.state = null;
    await this.ctx.storage.deleteAll();
    // Tableau figé : fermer une connexion pendant l'itération de getConnections() interrompt le parcours.
    for (const c of [...this.getConnections()]) {
      try { c.close(code, raison); } catch (e) { console.error("fermeture", e); }
    }
  }

  // ---- Sièges -------------------------------------------------------------------

  private siegePrenable(n: number): boolean {
    const state = this.state!;
    if (!Number.isInteger(n) || n < 0 || n > 3) return false;
    const seat = state.seats[n];
    if (seat.occupied) return false;
    // Après la mise en place, seul un siège déjà configuré peut être repris (cahier §1).
    if (state.phase !== "lobby" && !seat.investigatorCode) return false;
    return true;
  }

  private asseoir(n: number, name: string | null, isHost: boolean) {
    const seat = this.state!.seats[n];
    seat.occupied = true;
    seat.name = name;
    if (isHost) this.state!.hostSeat = n;
  }

  private liberer(conn: Connection<Attachment>) {
    const state = this.state!;
    const a = conn.state;
    if (a?.seat !== null && a?.seat !== undefined) {
      state.seats[a.seat].occupied = false; // siège libéré dès la fermeture (§1)
      if (state.hostSeat === a.seat) state.hostSeat = null;
    }
    if (a?.isHost) {
      state.hostConnected = [...this.getConnections<Attachment>()]
        .some((c) => c !== conn && c.state?.isHost);
    }
  }

  private viderSiege(n: number) {
    const seat = this.state!.seats[n];
    seat.investigatorCode = null;
    seat.counters = { health: 0, sanity: 0, clues: 0, actions: 3 };
    if (this.state!.lead === n) {
      const autre = this.state!.seats.find((s) => s.investigatorCode);
      this.state!.lead = autre ? autre.index : null;
    }
  }

  private nomSiege(n: number): string {
    const s = this.state!.seats[n];
    return s.name ?? INVESTIGATORS.get(s.investigatorCode ?? "")?.name ?? `Siège ${n + 1}`;
  }

  // ---- Utilitaires -------------------------------------------------------------

  private send(conn: Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcastSeats() {
    if (!this.state) return;
    const spectators = [...this.getConnections<Attachment>()].filter((c) => (c.state?.seat ?? null) === null).length;
    const msg: ServerMessage = {
      t: "seats",
      seats: this.state.seats.map(({ index, occupied, name, investigatorCode }) => ({ index, occupied, name, investigatorCode })),
      hostSeat: this.state.hostSeat,
      hostConnected: this.state.hostConnected,
      spectators,
    };
    this.broadcast(JSON.stringify(msg));
  }
}

function nomPropre(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, 40);
  return s || null;
}
