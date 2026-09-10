#!/usr/bin/env python3
"""Génère public/img/campagnes/<id>.webp : le bandeau d'en‑tête de chaque campagne de la bibliothèque,
découpé dans une image d'un livret FFG (PDF : guide de campagne, à défaut livret de règles de la boîte —
liens dans docs/AHLCG_livrets_regles_FFG.md).
Dépendances : pymupdf, Pillow (avec WebP).

    python3 scripts/build_bandeaux.py [--refresh] [id…]

Les PDF sont mis en cache dans data/cache/guides/ (non commité) ; les WebP sont commités. Pour chaque
campagne, BANDEAUX donne la page du guide (1 = couverture), l'image à prendre sur cette page (la plus grande
par défaut, sinon son xref) et la boîte de découpe en pixels de cette image. Le CSS (site.css, `.bandeau`)
cadre ensuite le bandeau en `cover` : la boîte peut être un peu plus haute que le bandeau affiché, le
champ `banner.position` de library.json choisit alors la zone visible.
"""
import sys, urllib.request
from io import BytesIO
from pathlib import Path
import fitz  # pymupdf
from PIL import Image

RACINE = Path(__file__).resolve().parent.parent
CACHE = RACINE / "data" / "cache" / "guides"
OUT = RACINE / "public" / "img" / "campagnes"
QUALITE = 84

# id → guide (URL du livret FFG), page (1 = couverture), xref (None = la plus grande image de la page),
# crop (x0, y0, x1, y1) en pixels de l'image extraite. Toutes les découpes sont prises dans l'art de la boîte
# (panneau peint de la couverture du guide), sauf mention. Notes :
# - notz : le guide de campagne n'a aucune illustration (texte sur papier, ciel étoilé en couverture — l'essai
#   avec cette bande ressemblait à un dos de carte). Source retenue : la couverture du livret Learn to Play de la
#   boîte de base révisée (ahc60, image 935 × 1210 — l'art de la boîte, Night of the Zealot étant la campagne
#   de la boîte de base) ; bande sur Roland Banks, la lune et les nightgaunts.
# - boa, cob : couvertures « Chapitre 2 » (art dans un losange) ; bande prise à la largeur maximale du losange.
# - standalone : pas de guide commun ; vue d'Arkham la nuit, illustration p. 11 du même Learn to Play.
FFG = "https://images-cdn.fantasyflightgames.com/filer_public/"
LEARN_TO_PLAY = FFG + "dd/78/dd7818fe-0c9a-4a6c-b685-e32ab55b1702/ahc60_learn_to_play_web.pdf"
BANDEAUX = {
    "notz": {"guide": LEARN_TO_PLAY, "page": 1, "xref": None, "crop": (0, 455, 935, 610)},
    "tdl": {"guide": FFG + "2e/2e/2e2e9b07-e5e4-4538-8d04-b009e20efb50/ahc66_campaign_guide_v6-compressed.pdf",
            "page": 1, "xref": None, "crop": (0, 720, 1224, 980)},
    "tptc": {"guide": FFG + "58/cd/58cd918c-fdd0-4cee-99df-eb9b5fd43c13/ahc68_campaign_guide_v4-compressed.pdf",
             "page": 1, "xref": None, "crop": (0, 580, 1224, 840)},
    "tfa": {"guide": FFG + "2c/08/2c081137-f89f-4c53-b432-a513eecc466e/ahc73_campaign_guide_v2-compressed.pdf",
            "page": 1, "xref": None, "crop": (0, 740, 1229, 1000)},
    "tcu": {"guide": FFG + "7f/d8/7fd88e9d-a98d-42f9-9d15-56d4de0ac811/ahc75_campaign_guide-compressed.pdf",
            "page": 1, "xref": None, "crop": (0, 490, 939, 690)},
    "tde": {"guide": FFG + "32/db/32db52a4-73af-41c7-9a2c-56351115148e/ahc79_campaign_guide_a-web.pdf",
            "page": 1, "xref": None, "crop": (0, 400, 939, 600)},
    "tic": {"guide": FFG + "9d/71/9d71f59e-6ca6-469c-b00a-0a7c6d27b148/ahc82_campaign_guide-web_1.pdf",
            "page": 1, "xref": None, "crop": (0, 560, 939, 760)},
    "eote": {"guide": FFG + "3f/b5/3fb51dbf-2508-4a28-bf7d-fed5fea4905e/ahc64_edge_of_the_earth_campaign_guide-compressed.pdf",
             "page": 1, "xref": None, "crop": (0, 760, 1224, 1020)},
    "tsk": {"guide": FFG + "f0/f9/f0f98966-1063-420c-8e31-4d95f0142aa2/ahc70_the_scarlet_keys_campaign_guide-compressed.pdf",
            "page": 1, "xref": None, "crop": (0, 500, 939, 700)},
    "fhv": {"guide": FFG + "5e/db/5edb4588-8583-4dc8-941c-26e1b7cfba56/ahc77_campaign_guide_web-compressed.pdf",
            "page": 1, "xref": None, "crop": (0, 440, 820, 640)},
    "tdc": {"guide": FFG + "c1/3b/c13b0e74-62bb-49bc-bc85-036ab9d1ef10/ahc84_campaign_guide-web_1.pdf",
            "page": 1, "xref": None, "crop": (0, 440, 939, 640)},
    "boa": {"guide": FFG + "f0/22/f022ac7c-9c30-4521-ac16-1f74f00e1d31/ahc100_campaign_guide-web.pdf",
            "page": 1, "xref": None, "crop": (0, 400, 1109, 600)},
    "cob": {"guide": FFG + "a8/9c/a89c98b9-9de4-4b6c-8110-80fedbdcdb60/ahc106_campaign_guide-web.pdf",
            "page": 1, "xref": None, "crop": (0, 300, 830, 480)},
    "standalone": {"guide": LEARN_TO_PLAY, "page": 11, "xref": 1398, "crop": (0, 1060, 900, 1214)},
}


def pdf(url):
    CACHE.mkdir(parents=True, exist_ok=True)
    p = CACHE / url.rsplit("/", 1)[-1]
    if not p.exists() or "--refresh" in sys.argv:
        print("  ↓", url)
        urllib.request.urlretrieve(url, p)
    return p


def image(doc, page, xref):
    """L'image demandée (ou la plus grande) de la page, en RGB."""
    pg = doc[page - 1]
    if xref is None:
        xref = max(pg.get_images(full=True), key=lambda i: i[2] * i[3])[0]
    pix = fitz.Pixmap(doc, xref)
    if pix.n - pix.alpha > 3:  # CMYK → RGB
        pix = fitz.Pixmap(fitz.csRGB, pix)
    return Image.open(BytesIO(pix.tobytes("png"))).convert("RGB")


def main():
    voulus = [a for a in sys.argv[1:] if not a.startswith("--")] or list(BANDEAUX)
    OUT.mkdir(parents=True, exist_ok=True)
    for cid in voulus:
        b = BANDEAUX[cid]
        doc = fitz.open(pdf(b["guide"]))
        im = image(doc, b["page"], b["xref"])
        bande = im.crop(b["crop"])
        sortie = OUT / f"{cid}.webp"
        bande.save(sortie, "WEBP", quality=QUALITE, method=6)
        print(f"  {sortie.relative_to(RACINE)} : {bande.width} × {bande.height} px, {sortie.stat().st_size // 1024} Ko"
              f" (image {im.width} × {im.height} p. {b['page']})")


if __name__ == "__main__":
    main()
