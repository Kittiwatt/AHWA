// Bindings déclarés dans wrangler.jsonc (à régénérer avec `npm run types` si besoin).
import type { Room } from "./room";

declare global {
  interface Env {
    ASSETS: Fetcher;
    ROOM: DurableObjectNamespace<Room>;
  }
}
export {};
