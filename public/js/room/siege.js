// Siège mémorisé dans le navigateur : siège + code de siège à 4 chiffres (cahier §10.2).
// Partagé par la page de table et la page joueur : un second onglet du même navigateur rejoint le siège sans saisie.

const cle = (code) => `ahwa:siege:${code}`;

export function lireSiegeMemorise(code) {
  const brut = localStorage.getItem(cle(code));
  if (brut === null) return null;
  if (/^[0-3]$/.test(brut)) return { seat: Number(brut), pin: null }; // ancien format (siège seul)
  try {
    const v = JSON.parse(brut);
    return Number.isInteger(v?.seat) && v.seat >= 0 && v.seat <= 3 ? { seat: v.seat, pin: typeof v.pin === "string" ? v.pin : null } : null;
  } catch { return null; }
}

/** À chaque message « you » ou « seats » : mémorise le siège courant et son code (le code arrive avec « seats »). */
export function memoriserSiege(code, etat) {
  const { moi, state } = etat;
  if (moi.seat === null) { localStorage.removeItem(cle(code)); return; }
  const pin = state?.seats[moi.seat]?.pin ?? lireSiegeMemorise(code)?.pin ?? null;
  localStorage.setItem(cle(code), JSON.stringify({ seat: moi.seat, pin }));
}
