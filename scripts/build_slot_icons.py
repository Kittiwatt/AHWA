#!/usr/bin/env python3
"""Génère public/img/slots/<slot>.svg (badges de slot du board joueur, cahier §10.5) à partir de la police
d'icônes du projet Arkham Cards (github.com/zzorba/ArkhamCards, assets/arkhamicons.ttf +
assets/arkhamicons-config.json) : le glyphe du slot, en crème sur une pastille sombre. Dépendance : fonttools.

    python3 scripts/build_slot_icons.py [--refresh]

Les fichiers de la police sont mis en cache dans data/cache/arkhamcards/ (non commité) ; les SVG sont commités.
Arkham Cards n'a pas d'icône par type d'Uses (munitions, charges, secrets…) : ces jetons restent des jetons
ressource, comme dans la règle.
"""
import json, sys, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

RACINE = Path(__file__).resolve().parent.parent
CACHE = RACINE / "data" / "cache" / "arkhamcards"
OUT = RACINE / "public" / "img" / "slots"
RAW = "https://raw.githubusercontent.com/zzorba/ArkhamCards/master/assets/"

def fichier(nom):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / nom
    if not p.exists() or "--refresh" in sys.argv:
        print("  ↓", RAW + nom)
        urllib.request.urlretrieve(RAW + nom, p)
    return p

police = TTFont(fichier("arkhamicons.ttf"))
config = json.load(open(fichier("arkhamicons-config.json")))
codes = {ic["properties"]["name"]: ic["properties"]["code"] for ic in config["icons"]}
cmap = police.getBestCmap()
glyphes = police.getGlyphSet()

# Slots (ArkhamDB real_slot → glyphe), plus quelques icônes utiles au board.
ICONES = {
    "hand": "hand", "hand_x2": "hand_x2", "arcane": "arcane", "arcane_x2": "arcane_x2", "ally": "ally", "body": "body",
    "accessory": "accessory", "tarot": "tarot", "head": "head",
    "health": "health", "sanity": "sanity", "action": "action", "free": "free", "reaction": "reaction", "per_investigator": "per_investigator",
}
CREME, FOND = "#F1EBDB", "#1E2A33"
TAILLE = 64

def svg(nom_glyphe):
    g = glyphes[cmap[codes[nom_glyphe]]]
    bp = BoundsPen(glyphes); g.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    pen = SVGPathPen(glyphes); g.draw(pen)
    # Le glyphe est ramené dans une pastille de 64 px : mise à l'échelle uniforme sur 44 px, centré, y inversé.
    w, h = x1 - x0, y1 - y0
    s = 44 / max(w, h)
    tx = (TAILLE - w * s) / 2 - x0 * s
    ty = (TAILLE + h * s) / 2 + y0 * s
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {TAILLE} {TAILLE}" width="{TAILLE}" height="{TAILLE}">'
            f'<circle cx="{TAILLE/2}" cy="{TAILLE/2}" r="{TAILLE/2 - 1}" fill="{FOND}" stroke="{CREME}" stroke-opacity="0.55" stroke-width="2"/>'
            f'<path transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f} {-s:.4f})" d="{pen.getCommands()}" fill="{CREME}"/></svg>')

OUT.mkdir(parents=True, exist_ok=True)
for nom, glyphe in ICONES.items():
    (OUT / f"{nom}.svg").write_text(svg(glyphe), encoding="utf-8")
print(f"{len(ICONES)} icônes dans {OUT.relative_to(RACINE)}")

# Icônes de compétence (comptage des cartes engagées, cahier §10.5) : public/img/skills/<compétence>.svg.
COMPETENCES = {"willpower": "skill_willpower", "intellect": "skill_intellect", "combat": "skill_combat", "agility": "skill_agility", "wild": "skill_wild"}
OUT2 = RACINE / "public" / "img" / "skills"
OUT2.mkdir(parents=True, exist_ok=True)
for nom, glyphe in COMPETENCES.items():
    (OUT2 / f"{nom}.svg").write_text(svg(glyphe), encoding="utf-8")
print(f"{len(COMPETENCES)} icônes dans {OUT2.relative_to(RACINE)}")
