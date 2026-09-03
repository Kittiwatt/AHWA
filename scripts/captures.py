#!/usr/bin/env python3
"""Vérification visuelle de la page de table (lobby + tapis) avec Playwright/Chromium.
Usage : python3 scripts/captures.py [http://127.0.0.1:8787] [dossier_sortie]
Crée une table, fait asseoir deux joueurs (hôte Alice / Bob), lance la mise en place et capture.
"""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/captures"

req = urllib.request.Request(f"{BASE}/api/rooms", data=json.dumps({"scenarioId": "notz_the_gathering"}).encode(),
                             headers={"content-type": "application/json"}, method="POST")
room = json.load(urllib.request.urlopen(req))
code, token = room["code"], room["hostToken"]
print("room", code)
erreurs = []

def page_pour(browser, nom, host=False):
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, locale="fr-FR", ignore_https_errors=True)
    script = f"localStorage.setItem('ahwa:nom', {json.dumps(nom)});"
    if host:
        script += f"localStorage.setItem('ahwa:host:{code}', {json.dumps(token)});"
    ctx.add_init_script(script)
    page = ctx.new_page()
    page.on("console", lambda m: erreurs.append(f"[{nom}] console {m.type}: {m.text}") if m.type in ("error", "warning") else None)
    page.on("pageerror", lambda e: erreurs.append(f"[{nom}] pageerror: {e}"))
    page.goto(f"{BASE}/r/{code}")
    page.wait_for_selector("#lobby:not([hidden])", timeout=8000)
    return page

with sync_playwright() as p:
    browser = p.chromium.launch()
    alice = page_pour(browser, "Alice", host=True)
    alice.screenshot(path=f"{OUT}/01_lobby_vide.png")

    # Alice prend le siège 1 et choisit Roland Banks.
    alice.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    alice.wait_for_selector(".siege-lobby.moi")
    alice.get_by_role("button", name="Choisir un enquêteur").click()
    alice.wait_for_selector("dialog.dialogue-inv[open]")
    alice.fill("dialog .recherche", "roland")
    alice.wait_for_timeout(300)
    alice.screenshot(path=f"{OUT}/02_choix_investigateur.png")
    alice.locator("dialog .inv").first.click()
    alice.wait_for_selector(".siege-lobby.moi .fiche")

    bob = page_pour(browser, "Bob")
    bob.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    bob.wait_for_selector(".siege-lobby.moi")
    bob.get_by_role("button", name="Choisir un enquêteur").click()
    bob.wait_for_selector("dialog.dialogue-inv[open]")
    bob.fill("dialog .recherche", "daisy")
    bob.wait_for_timeout(300)
    bob.locator("dialog .inv").first.click()
    bob.wait_for_selector(".siege-lobby.moi .fiche")
    bob.get_by_label("Difficile", exact=False).first.check()
    alice.wait_for_timeout(600)
    alice.screenshot(path=f"{OUT}/03_lobby_deux_joueurs.png")

    # Mise en place par l'hôte.
    alice.get_by_role("button", name="Lancer la mise en place").click()
    alice.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    bob.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    alice.wait_for_load_state("networkidle")
    alice.wait_for_timeout(1500)
    alice.screenshot(path=f"{OUT}/04_tapis_hote.png")
    # Loupe sur le Study.
    alice.hover("#plateau .carte")
    alice.wait_for_timeout(400)
    alice.screenshot(path=f"{OUT}/05_tapis_loupe.png")
    bob.wait_for_load_state("networkidle")
    bob.wait_for_timeout(800)
    bob.screenshot(path=f"{OUT}/06_tapis_bob.png")

    # Quelques contrôles DOM.
    assert alice.locator("#plateau .carte").count() == 1, "un seul lieu sur le tapis"
    assert alice.locator("#plateau .mini").count() == 2, "deux pions"
    assert alice.locator("#aside .bande .carte").count() == 6, "six cartes de côté"
    assert alice.locator("#sieges .siege").count() == 2, "deux sièges"
    assert "17" in alice.locator("#chaos .sac-forme").inner_text(), "sac difficile : 17 jetons"
    assert "Manche 1" in alice.locator("#manche").inner_text()
    assert alice.locator("#journal .entree").count() >= 8
    print("encarts affichés :", alice.locator("#rappels .encart").count())
    browser.close()

if erreurs:
    print("MESSAGES CONSOLE :")
    for e in erreurs: print(" ", e)
print("captures dans", OUT)
