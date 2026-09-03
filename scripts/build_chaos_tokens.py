#!/usr/bin/env python3
"""Génère public/img/chaos/<jeton>.svg à partir de la police d'icônes du projet Arkham Cards
(github.com/zzorba/ArkhamCards, assets/tokens.ttf + tokens.json), en reprenant sa recette de
composition (fond en dégradé radial + couches fill / overlay / highlight colorées,
src/components/chaos/ChaosToken.tsx). Dépendance : fonttools.

    python3 scripts/build_chaos_tokens.py [--refresh]

Les fichiers de la police sont mis en cache dans data/cache/arkhamcards/ (non commité) ;
les SVG produits sont commités.
"""
import json, os, sys, urllib.request
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

RACINE = Path(__file__).resolve().parent.parent
CACHE = RACINE / "data" / "cache" / "arkhamcards"
OUT = RACINE / "public" / "img" / "chaos"
RAW = "https://raw.githubusercontent.com/zzorba/ArkhamCards/master/assets/"

def fichier(nom):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / nom
    if not p.exists() or "--refresh" in sys.argv:
        print("  ↓", RAW + nom)
        urllib.request.urlretrieve(RAW + nom, p)
    return p

police = TTFont(fichier("tokens.ttf"))
config = json.load(open(fichier("tokens.json")))
codes = {ic["properties"]["name"]: ic["properties"]["code"] for ic in config["icons"]}
cmap = police.getBestCmap()
glyphes = police.getGlyphSet()
ASCENT = police["hhea"].ascent   # 960 : y SVG = ASCENT − y police

def chemin(nom):
    pen = SVGPathPen(glyphes)
    glyphes[cmap[codes[nom]]].draw(pen)
    return pen.getCommands()

# Recette Arkham Cards (ChaosToken.tsx) : couches (glyphe, couleur) du bas vers le haut.
CREME, BLANC = "#E6E1D3", "#FFFBF2"
SPECIAUX = {"skull": "#552D2D", "cultist": "#314629", "tablet": "#294146", "elder_thing": "#442946"}
DEGRADE_DEFAUT = [("60%", "#FFFBF2"), ("100%", "#D6CFB9")]
DEGRADES = {
    "frost": [("66%", "#3D3A63"), ("100%", "#495483")],
    "auto_fail": [("75%", "#8D181E"), ("100%", "#6A0B10")],
    "elder_sign": [("0%", "#33A1FB"), ("50%", "#3C8AC9"), ("100%", "#457398")],
    "bless": [("25%", "#9C702A"), ("100%", "#695823")],
    "curse": [("25%", "#362330"), ("100%", "#3B224A")],
}

def couches(jeton):
    if jeton == "+1":
        return [("token_symbol_fill", "#394852"), ("token_number_overlay", "#ECBA59"), ("token_1_highlight", BLANC)]
    if jeton in ("0", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8"):
        return [("token_symbol_fill", "#394852"), ("token_number_overlay", CREME), (f"token_{jeton}_highlight", BLANC)]
    if jeton in SPECIAUX:
        base = "token_symbol_fill" if jeton == "skull" else f"token_{jeton}_fill"
        return [(base, SPECIAUX[jeton]), (f"token_{jeton}_overlay", CREME), (f"token_{jeton}_highlight", BLANC)]
    if jeton == "auto_fail":
        return [("token_auto_fail_overlay", CREME), ("token_auto_fail_highlight", "#8D181E")]
    if jeton == "elder_sign":
        return [("token_elder_sign_overlay", CREME), ("token_elder_sign_fill", "#427DAD"), ("token_elder_sign_highlight", CREME)]
    if jeton == "frost":
        return [("token_number_fill", "#3D3A63"), ("token_frost_overlay", CREME), ("token_frost_highlight", BLANC)]
    if jeton == "bless":
        return [("token_bless_fill", "#9D702A"), ("token_bless_overlay", CREME)]
    if jeton == "curse":
        return [("token_curse_fill", "#35232F"), ("token_curse_overlay", CREME)]
    raise KeyError(jeton)

JETONS = ["+1", "0", "-1", "-2", "-3", "-4", "-5", "-6", "-7", "-8",
          "skull", "cultist", "tablet", "elder_thing", "auto_fail", "elder_sign", "bless", "curse", "frost"]

def nom_fichier(jeton):
    return jeton.replace("+", "p").replace("-", "m") + ".svg"

OUT.mkdir(parents=True, exist_ok=True)
for jeton in JETONS:
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in DEGRADES.get(jeton, DEGRADE_DEFAUT))
    corps = "".join(f'<path d="{chemin(g)}" fill="{c}"/>' for g, c in couches(jeton))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
           f'<defs><radialGradient id="g" cx="512" cy="512" r="512" gradientUnits="userSpaceOnUse">{stops}</radialGradient>'
           f'<clipPath id="c"><circle cx="512" cy="512" r="512"/></clipPath></defs>'
           f'<circle cx="512" cy="512" r="512" fill="url(#g)"/>'
           f'<g clip-path="url(#c)" transform="translate(0 {ASCENT}) scale(1 -1)">{corps}</g></svg>')
    (OUT / nom_fichier(jeton)).write_text(svg)
print(f"{len(JETONS)} jetons écrits dans {OUT.relative_to(RACINE)}")
