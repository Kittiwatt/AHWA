// Application d'un delta JSON Patch (RFC 6902, sous-ensemble add/remove/replace) sur l'état local.

function segments(path) {
  return path.split("/").slice(1).map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

export function appliquerPatch(racine, ops) {
  for (const op of ops) {
    const segs = segments(op.path);
    const cle = segs.pop();
    let parent = racine;
    for (const s of segs) parent = parent[s];
    if (parent === undefined) throw new Error(`chemin introuvable : ${op.path}`);
    if (Array.isArray(parent)) {
      if (op.op === "add") {
        if (cle === "-") parent.push(op.value);
        else parent.splice(Number(cle), 0, op.value);
      } else if (op.op === "remove") parent.splice(Number(cle), 1);
      else parent[Number(cle)] = op.value;
    } else if (op.op === "remove") delete parent[cle];
    else parent[cle] = op.value;
  }
  return racine;
}
