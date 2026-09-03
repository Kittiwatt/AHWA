// Delta d'état : diff structurel entre deux snapshots → opérations JSON Patch (RFC 6902).
// Règles (cahier des charges §4.3) : objets parcourus récursivement (add/remove/replace par clé) ;
// tableaux remplacés en bloc, sauf ajout en fin (journal de bord, piles) → une op « add » par élément.
// Le client applique le patch et vérifie rev = rev + 1 ; sinon il demande un resync.

import type { PatchOp } from "./state";

const escape = (k: string) => k.replace(/~/g, "~0").replace(/\//g, "~1");

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && same(a[k], b[k]));
  }
  return false;
}

export function diff(before: unknown, after: unknown, path = "", out: PatchOp[] = []): PatchOp[] {
  if (isObject(before) && isObject(after)) {
    for (const k of Object.keys(before)) {
      if (!(k in after)) out.push({ op: "remove", path: `${path}/${escape(k)}` });
    }
    for (const k of Object.keys(after)) {
      const p = `${path}/${escape(k)}`;
      if (!(k in before)) out.push({ op: "add", path: p, value: after[k] });
      else diff(before[k], after[k], p, out);
    }
    return out;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    if (same(before, after)) return out;
    const prefixe = after.length > before.length && before.every((v, i) => same(v, after[i]));
    if (prefixe) {
      for (let i = before.length; i < after.length; i++) out.push({ op: "add", path: `${path}/-`, value: after[i] });
    } else {
      out.push({ op: "replace", path, value: after });
    }
    return out;
  }
  if (!same(before, after)) out.push({ op: "replace", path, value: after });
  return out;
}

export function clone<T>(v: T): T {
  return structuredClone(v);
}
