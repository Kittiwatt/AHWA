#!/usr/bin/env python3
"""Vérification visuelle de la page de table (lobby + tapis) avec Playwright/Chromium.
Usage : python3 scripts/captures.py [http://127.0.0.1:8787] [dossier_sortie]
Crée une table, fait asseoir deux joueurs (hôte Alice / Bob), lance la mise en place et capture.
"""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/home/claude/captures"

def creer(scenario):
    req = urllib.request.Request(f"{BASE}/api/rooms", data=json.dumps({"scenarioId": scenario}).encode(),
                                 headers={"content-type": "application/json", "user-agent": "Mozilla/5.0 (captures)"}, method="POST")
    room = json.load(urllib.request.urlopen(req))
    return room["code"], room["hostToken"]

code, token = creer("notz_the_gathering")
CODE, TOKEN = code, token
print("room", code)
erreurs = []

def page_pour(browser, nom, host=False, code=None, token=None):
    code = code or CODE; token = token or TOKEN
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, locale="fr-FR", ignore_https_errors=True)
    script = f"localStorage.setItem('ahwa:nom', {json.dumps(nom)});"
    if host:
        script += f"localStorage.setItem('ahwa:host:{code}', {json.dumps(token)});"
    ctx.add_init_script(script)
    page = ctx.new_page()
    page.on("dialog", lambda d: d.accept())
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
    alice.wait_for_timeout(900)   # la loupe arrive après 500 ms
    assert not alice.locator("#loupe").is_hidden(), "loupe au survol après le délai"
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

    # ---- Étape 2 : interactions dans le navigateur (Alice, siège 1) ----
    alice.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    alice.locator("#sieges .siege").nth(0).get_by_role("button", name="Prendre mon tour").click()
    alice.wait_for_selector("#sieges .siege.actif")
    alice.locator("#sieges .siege").nth(0).locator(".compteur.actions .pm").first.click()  # −1 action
    alice.wait_for_timeout(300)
    assert alice.locator("#sieges .siege").nth(0).locator(".pip.plein").count() == 2, "2 actions restantes"

    # Glisser le Hallway (de côté) sur le tapis, puis le révéler d'un clic.
    hallway = alice.locator("#aside .bande .carte").first
    board = alice.locator("#board").bounding_box()
    src = hallway.bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2)
    alice.mouse.down()
    alice.mouse.move(board["x"] + board["width"] * 0.7, board["y"] + board["height"] * 0.45, steps=12)
    alice.mouse.up()
    alice.wait_for_timeout(400)
    assert alice.locator("#plateau .carte").count() == 2, "Hallway déposé sur le tapis"
    assert alice.locator("#aside .bande .carte").count() == 5
    alice.locator("#plateau .carte.retournee").first.click()
    alice.wait_for_timeout(300)
    assert alice.locator("#plateau .carte.retournee").count() == 0, "Hallway révélé"

    # Déplacer le Study : les pions suivent. Clic droit glissé Study → Hallway : un chemin apparaît.
    study = alice.locator("#plateau .carte").first
    hallway_el = alice.locator("#plateau .carte").nth(1)
    b0 = study.bounding_box(); m0 = alice.locator("#plateau .mini").first.bounding_box()
    alice.mouse.move(b0["x"] + b0["width"] / 2, b0["y"] + b0["height"] * 0.7)
    alice.mouse.down()
    alice.mouse.move(b0["x"] + b0["width"] / 2 - 120, b0["y"] + b0["height"] * 0.7 - 60, steps=10)
    alice.mouse.up()
    alice.wait_for_timeout(400)
    m1 = alice.locator("#plateau .mini").first.bounding_box()
    assert abs((m1["x"] - m0["x"]) + 120) < 8 and abs((m1["y"] - m0["y"]) + 60) < 8, "le pion a suivi le lieu"
    b0 = study.bounding_box(); b1 = hallway_el.bounding_box()
    alice.mouse.move(b0["x"] + b0["width"] / 2, b0["y"] + b0["height"] / 2)
    alice.mouse.down(button="right")
    alice.mouse.move(b1["x"] + b1["width"] / 2, b1["y"] + b1["height"] / 2, steps=10)
    alice.mouse.up(button="right")
    alice.wait_for_timeout(400)
    assert alice.locator("#plateau .chemins line:not(.temp)").count() == 1, "un chemin tracé"
    assert alice.locator(".menu-carte").count() == 0, "pas de menu après un tracé"
    bob.wait_for_timeout(300)
    assert bob.locator("#plateau .chemins line:not(.temp)").count() == 1, "Bob voit le chemin"
    alice.screenshot(path=f"{OUT}/12_chemin.png")
    # Clic droit simple sur un lieu : menu.
    alice.mouse.move(b1["x"] + b1["width"] / 2, b1["y"] + b1["height"] / 2)
    alice.mouse.down(button="right"); alice.mouse.up(button="right")
    alice.wait_for_selector(".menu-carte")
    assert alice.locator(".menu-carte").get_by_role("button", name="Effacer ses chemins").count() == 1
    alice.keyboard.press("Escape")
    alice.wait_for_timeout(200)

    # Piocher = retourner la première carte de la pioche ; la glisser en zone de menace ; la défausser par le menu.
    alice.locator("#pioches .pioche-rencontre .dos-bouton").click()
    alice.wait_for_selector("#pioches .pioche-rencontre.revelee .carte")
    revelee = alice.locator("#pioches .pioche-rencontre .carte").first
    src = revelee.bounding_box()
    dst = alice.locator("#sieges .siege").nth(0).locator(".menace").bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2)
    alice.mouse.down()
    alice.mouse.move(dst["x"] + 60, dst["y"] + dst["height"] / 2, steps=12)
    alice.mouse.up()
    alice.wait_for_timeout(400)
    assert alice.locator("#sieges .siege").nth(0).locator(".menace .carte").count() == 1, "carte piochée en zone de menace"
    assert alice.locator("#pioches .pioche-rencontre.revelee").count() == 0, "la pioche est de nouveau face cachée"
    # Une carte révélée qui attend sur la pioche : un clic dessus ne pioche pas, « Piocher » est désactivé.
    alice.locator("#pioches .pioche-rencontre .dos-bouton").click()
    alice.wait_for_selector("#pioches .pioche-rencontre.revelee .carte")
    alice.locator("#pioches .pioche-rencontre .carte").first.click()
    alice.wait_for_timeout(300)
    assert alice.locator("#pioches .pioche-rencontre.revelee .carte").count() == 1, "toujours la même carte révélée"
    assert alice.locator("#sieges .siege").nth(0).locator(".menace .carte").count() == 1, "rien n'est parti en zone de menace"
    alice.locator("#pioches .pile").nth(0).dispatch_event("contextmenu")  # sur la pile elle-même (la carte révélée dessus a son propre menu)
    alice.wait_for_selector(".menu-carte")
    assert alice.locator(".menu-carte").get_by_role("button", name="Piocher (retourner la première carte)").is_disabled()
    alice.keyboard.press("Escape")
    src = alice.locator("#pioches .pioche-rencontre .carte").first.bounding_box()
    dst = alice.locator("#pioches .pile").nth(1).bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); alice.mouse.down()
    alice.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + 40, steps=10); alice.mouse.up()
    alice.wait_for_timeout(400)
    assert alice.locator("#pioches .pioche-rencontre.revelee").count() == 0
    assert alice.evaluate("[...document.querySelectorAll('#pioches .pioche-rencontre .carte')].length") == 0, "aucune carte révélée ne reste sur la pioche"
    alice.locator("#pioches .pile").nth(1).dispatch_event("contextmenu")  # la défausse elle-même (sa carte du dessus a son propre menu)
    alice.wait_for_selector(".menu-carte")
    alice.locator(".menu-carte").get_by_role("button", name="Remélanger dans la pioche").click()
    alice.wait_for_timeout(400)
    assert alice.locator("#pioches .pile").nth(1).locator(".badge").inner_text() == "0", "défausse remélangée"
    assert alice.evaluate("window.getSelection().toString()") == "", "aucune sélection de texte résiduelle"
    # Double-clic sur les indices du Study : 1 indice passe à Alice.
    alice.locator("#plateau .carte .jeton-clue").first.dblclick()
    alice.wait_for_timeout(400)
    assert "3" in alice.locator("#plateau .carte .jeton-clue").first.inner_text(), "3 indices restent sur le Study"
    assert "1" in alice.locator("#sieges .siege").nth(0).locator(".compteur").nth(2).locator(".valeur").inner_text(), "Alice a 1 indice"
    # Bouton d'action (flèche) : 2 → 1 → 0 puis désactivé.
    assert alice.locator("#sieges .siege").nth(0).locator(".bouton-action").count() == 1
    alice.locator("#sieges .siege").nth(0).screenshot(path=f"{OUT}/11_siege_bouton_action.png")
    alice.locator("#sieges .siege").nth(0).locator(".bouton-action").click()
    alice.wait_for_timeout(300)
    alice.locator("#sieges .siege").nth(0).locator(".bouton-action").click()
    alice.wait_for_timeout(300)
    assert alice.locator("#sieges .siege").nth(0).locator(".bouton-action").is_disabled(), "plus d'action : bouton désactivé"
    alice.locator("#sieges .siege").nth(0).locator(".menace .carte").first.click(button="right")
    alice.wait_for_selector(".menu-carte")
    alice.screenshot(path=f"{OUT}/07_menu_contextuel.png")
    alice.locator(".menu-carte").get_by_role("button", name="Défausser").click()
    alice.wait_for_timeout(400)
    assert alice.locator("#pioches .pile").nth(1).locator(".badge").inner_text() == "1", "défausse : 1"

    # Tirer un jeton du chaos, passer à la phase suivante.
    alice.locator("#chaos .sac-forme").click()
    alice.wait_for_selector("#chaos .tires .jeton-chaos-img")
    alice.get_by_role("button", name="Phase suivante").click()
    alice.wait_for_timeout(400)
    assert "Ennemis" in alice.locator("#phases .phase.courante").inner_text()
    bob.wait_for_timeout(600)
    assert "Ennemis" in bob.locator("#phases .phase.courante").inner_text(), "Bob voit la phase"
    alice.locator("#chaos .sac-forme").click()
    alice.wait_for_timeout(300)
    alice.locator("#chaos .sac-forme").hover()
    alice.wait_for_load_state("networkidle")
    alice.wait_for_timeout(300)
    assert alice.locator("#chaos .sac-popover").is_visible(), "composition au survol"
    alice.screenshot(path=f"{OUT}/08_tapis_apres_interactions.png")
    alice.mouse.move(10, 10)

    # Ennemi : chips dégâts / horreur (clic = +1, − au survol).
    alice.locator("#pioches .pile").nth(0).click(button="right")
    alice.wait_for_selector(".menu-carte")
    alice.locator(".menu-carte").get_by_role("button", name="Chercher (puis mélanger)").click()
    alice.wait_for_selector("dialog.dialogue[open]")
    ennemi = alice.locator("dialog .carte-peek").filter(has_text="Ghoul").first
    ennemi.get_by_role("button", name="Prendre").click()
    alice.get_by_role("button", name="Fermer et mélanger").click()
    alice.wait_for_timeout(500)
    chip = alice.locator("#sieges .siege").nth(0).locator(".menace .carte .chip-damage").first
    chip.click(); alice.wait_for_timeout(200); chip.click(); alice.wait_for_timeout(300)
    assert "2" in chip.locator(".chip-n").inner_text(), "2 dégâts sur l'ennemi"
    chip.hover(); chip.locator(".chip-moins").click(); alice.wait_for_timeout(300)
    assert "1" in chip.locator(".chip-n").inner_text(), "1 dégât après −"
    assert alice.locator("#sieges .siege").nth(0).locator(".menace .carte .chip-horror").count() == 0, "pas de compteur d'horreur sur un ennemi"
    alice.screenshot(path=f"{OUT}/10_ennemi_chips.png")

    # Défausse par glisser-déposer sur le bloc de la défausse, puis reprise depuis « Consulter ».
    carte_menace = alice.locator("#sieges .siege").nth(0).locator(".menace .carte").first
    src = carte_menace.bounding_box(); dst = alice.locator("#pioches .pile").nth(1).bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); alice.mouse.down()
    alice.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + dst["height"] - 10, steps=10); alice.mouse.up()
    alice.wait_for_timeout(400)
    assert alice.locator("#pioches .pile").nth(1).locator(".badge").inner_text() == "2", "défausse : 2 (dépôt sur le bloc)"
    assert alice.locator("#pioches .defausse-rencontre .carte").count() == 1, "la carte du dessus de la défausse est visible"
    alice.locator("#pioches .pile").nth(1).dispatch_event("contextmenu")  # la défausse elle-même (sa carte du dessus a son propre menu)
    alice.wait_for_selector(".menu-carte")
    alice.locator(".menu-carte").get_by_role("button", name="Consulter").click()
    alice.wait_for_selector("dialog.dialogue[open]")
    assert alice.locator("dialog .carte-peek").count() == 2
    alice.locator("dialog .carte-peek").first.get_by_role("button", name="Prendre").click()
    alice.locator("dialog header").get_by_role("button", name="Fermer", exact=True).click()
    alice.wait_for_timeout(400)
    assert alice.locator("#sieges .siege").nth(0).locator(".menace .carte").count() == 1, "carte reprise de la défausse en zone de menace"
    # Dépôt sur l'encart (hors piles) : annulé, la carte ne bouge pas.
    src = alice.locator("#sieges .siege").nth(0).locator(".menace .carte").first.bounding_box()
    sac = alice.locator("#chaos").bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); alice.mouse.down()
    alice.mouse.move(sac["x"] + sac["width"] / 2, sac["y"] + 10, steps=10); alice.mouse.up()
    alice.wait_for_timeout(400)
    assert alice.locator("#sieges .siege").nth(0).locator(".menace .carte").count() == 1, "dépôt sur l'encart annulé"

    # Depuis le tapis vers la défausse (ennemi sorti de la pioche) : la carte doit rester visible dans la défausse.
    alice.locator("#pioches .pioche-rencontre .dos-bouton").click()
    alice.wait_for_selector("#pioches .pioche-rencontre.revelee .carte")
    src = alice.locator("#pioches .pioche-rencontre .carte").first.bounding_box()
    board = alice.locator("#board").bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); alice.mouse.down()
    alice.mouse.move(board["x"] + board["width"] * 0.55, board["y"] + board["height"] * 0.25, steps=10); alice.mouse.up()
    alice.wait_for_timeout(400)
    tapis_cartes = alice.locator("#plateau .carte:not(.kind-location)")
    assert tapis_cartes.count() == 1, "carte de rencontre posée sur le tapis"
    src = tapis_cartes.first.bounding_box(); dst = alice.locator("#pioches .pile").nth(1).bounding_box()
    alice.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); alice.mouse.down()
    alice.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + 40, steps=10); alice.mouse.up()
    alice.wait_for_timeout(400)
    dessus = alice.locator("#pioches .defausse-rencontre .carte").first
    bb = dessus.bounding_box(); pile_bb = alice.locator("#pioches .defausse-rencontre").bounding_box()
    assert bb and abs(bb["x"] - pile_bb["x"]) < 3 and abs(bb["y"] - pile_bb["y"]) < 3, f"carte visible dans la défausse ({bb} vs {pile_bb})"
    assert alice.locator("#pioches .defausse-rencontre .carte").first.get_attribute("style") in (None, ""), "pas de position résiduelle du tapis"

    # Générer une carte : recherche par nom, par lien arkham.build.
    alice.locator("#generer-carte").click()
    alice.wait_for_selector("dialog.dialogue[open]")
    alice.fill("dialog .recherche.large", "https://arkham.build/card/01117")
    alice.wait_for_selector("dialog .carte-peek")
    assert alice.locator("dialog .carte-peek").count() == 1 and "Lita Chantler" in alice.locator("dialog .carte-peek").first.inner_text()
    alice.fill("dialog .recherche.large", "barric")
    alice.wait_for_timeout(300)
    assert "Barricade" in alice.locator("dialog .carte-peek").first.inner_text()
    alice.screenshot(path=f"{OUT}/19_generateur.png")
    alice.locator("dialog .carte-peek").first.get_by_role("button", name="Générer").click()
    # Première génération d'une table : le DO charge l'index des cartes (850 Ko) — attendre la carte, pas un délai fixe.
    generee = alice.locator("#sieges .siege").nth(0).locator(".menace .carte[data-id^='gen-']")
    generee.first.wait_for(timeout=10000)
    assert generee.count() == 1, "carte générée dans la zone de menace"
    assert "01038" in generee.first.locator("img").get_attribute("src")

    # Rechargement : Alice retrouve son siège automatiquement.
    alice.reload()
    alice.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    alice.wait_for_function("document.querySelector('#moi')?.textContent.includes('Siège 1')", timeout=8000)
    assert alice.locator("#sieges .siege.moi").count() == 1, "siège repris après rechargement"

    # Zone « de côté » floue, nette au clic.
    assert alice.locator("#aside .bande.floue").count() == 1
    alice.locator("#aside .bande").click(position={"x": 5, "y": 5})
    alice.wait_for_timeout(200)
    assert alice.locator("#aside .bande.floue").count() == 0, "zone nette après clic"

    # Recherche dans la pioche (clic droit).
    alice.locator("#pioches .pile").nth(0).click(button="right")
    alice.wait_for_selector(".menu-carte")
    alice.locator(".menu-carte").get_by_role("button", name="Chercher (puis mélanger)").click()
    alice.wait_for_selector("dialog.dialogue[open]")
    alice.wait_for_timeout(800)
    alice.screenshot(path=f"{OUT}/09_recherche_pioche.png")
    alice.get_by_role("button", name="Fermer et mélanger").click()
    alice.wait_for_timeout(300)

    # ---- The Midnight Masks : questions de journal au lobby, 9 lieux, Cultist deck ----
    code2, token2 = creer("notz_the_midnight_masks")
    print("room Masks", code2)
    hote = page_pour(browser, "Hôte", host=True, code=code2, token=token2)
    hote.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    hote.get_by_role("button", name="Choisir un enquêteur").click(); hote.wait_for_selector("dialog.dialogue-inv[open]")
    hote.locator("dialog .inv").first.click(); hote.wait_for_selector(".siege-lobby.moi .fiche")
    joueur = page_pour(browser, "Bob", code=code2, token=None)
    joueur.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    joueur.get_by_role("button", name="Choisir un enquêteur").click(); joueur.wait_for_selector("dialog.dialogue-inv[open]")
    joueur.fill("dialog .recherche", "daisy"); joueur.wait_for_timeout(300); joueur.locator("dialog .inv").first.click()
    joueur.wait_for_selector(".siege-lobby.moi .fiche")
    hote.wait_for_timeout(400)
    assert hote.get_by_role("button", name="Lancer la mise en place").is_disabled(), "questions sans réponse : lancement grisé"
    assert joueur.locator(".reglage.questions input").first.is_disabled(), "les autres joueurs voient les questions sans y répondre"
    hote.get_by_label("est encore debout").check()
    hote.get_by_label("est encore en vie").check()
    hote.wait_for_timeout(200)
    hote.screenshot(path=f"{OUT}/16_masks_lobby_questions.png")
    hote.get_by_role("button", name="Lancer la mise en place").click()
    hote.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    hote.wait_for_load_state("networkidle"); hote.wait_for_timeout(1500)
    assert hote.locator("#plateau .carte.kind-location").count() == 9, "9 lieux en jeu"
    assert hote.locator("#plateau .carte.kind-enemy").count() == 1, "2 enquêteurs : 1 Acolyte"
    assert hote.locator("#pioches .pile[data-outil='pile:cultist'] .badge").inner_text() == "5", "Cultist deck : 5"
    hote.screenshot(path=f"{OUT}/17_masks_tapis.png")
    # Agenda 1 retourné : son verso est un ennemi, avec compteur de dégâts.
    hote.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    hote.locator("#histoire .carte.kind-agenda").first.click(button="right"); hote.wait_for_selector(".menu-carte")
    hote.locator(".menu-carte").get_by_role("button", name="Retourner (lire le verso)").click(); hote.wait_for_timeout(500)
    assert hote.locator("#histoire .carte.kind-agenda .chip-damage").count() == 1, "verso ennemi : compteur de dégâts"
    assert "/4" in hote.locator("#histoire .carte.kind-agenda .chip-damage .chip-n").inner_text()
    hote.locator("#histoire .carte.kind-agenda").hover(); hote.wait_for_timeout(900)
    hote.screenshot(path=f"{OUT}/18_masks_agenda_verso.png")
    # Cultist deck : clic = retourner la première carte.
    hote.locator("#pioches .pile[data-outil='pile:cultist'] .dos-bouton").click()
    hote.wait_for_selector("#pioches .pile[data-outil='pile:cultist'] .revelee .carte")
    assert hote.locator("#lien-guide").is_visible() and "campaign_guide.pdf" in hote.locator("#lien-guide").get_attribute("href"), "lien vers le guide"

    # ---- The Devourer Below ----
    code3, token3 = creer("notz_the_devourer_below")
    print("room Devourer", code3)
    h3 = page_pour(browser, "Hôte", host=True, code=code3, token=token3)
    h3.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h3.get_by_role("button", name="Choisir un enquêteur").click(); h3.wait_for_selector("dialog.dialogue-inv[open]")
    h3.locator("dialog .inv").first.click(); h3.wait_for_selector(".siege-lobby.moi .fiche")
    h3.get_by_label("1 ou 2").check(); h3.get_by_label("est noté", exact=True).check(); h3.get_by_label("n'est pas noté comme en vie").check()
    h3.wait_for_timeout(200)
    h3.get_by_role("button", name="Lancer la mise en place").click()
    h3.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h3.wait_for_load_state("networkidle"); h3.wait_for_timeout(1500)
    assert h3.locator("#plateau .carte.kind-location").count() == 5, "Main Path + 4 bois"
    assert h3.locator("#plateau .carte.kind-location.retournee").count() == 4, "bois face non révélée"
    assert "1" in h3.locator("#histoire .carte.kind-agenda .jeton-doom").first.inner_text(), "1 doom de départ"
    assert h3.locator("#chaos .sac-forme").inner_text().strip() == "17", "sac : 16 + jeton Ancien"
    h3.screenshot(path=f"{OUT}/20_devourer_tapis.png")

    # ---- The Witching Hour (TCU I) : bois devant chaque enquêteur, pile Arkham Woods, verso-lieu ----
    code4, token4 = creer("tcu_witching_hour")
    print("room Witching", code4)
    h4 = page_pour(browser, "Hôte", host=True, code=code4, token=token4)
    h4.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h4.get_by_role("button", name="Choisir un enquêteur").click(); h4.wait_for_selector("dialog.dialogue-inv[open]")
    h4.fill("dialog .recherche", "carolyn"); h4.wait_for_timeout(300); h4.locator("dialog .inv").first.click()
    h4.wait_for_selector(".siege-lobby.moi .fiche")
    j4 = page_pour(browser, "Bob", code=code4, token=None)
    j4.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j4.get_by_role("button", name="Choisir un enquêteur").click(); j4.wait_for_selector("dialog.dialogue-inv[open]")
    j4.fill("dialog .recherche", "rita"); j4.wait_for_timeout(300); j4.locator("dialog .inv").first.click()
    j4.wait_for_selector(".siege-lobby.moi .fiche")
    h4.wait_for_timeout(400)
    h4.get_by_label("a accepté son destin").check()
    h4.wait_for_timeout(200)
    h4.screenshot(path=f"{OUT}/21_witching_lobby.png")
    h4.get_by_role("button", name="Lancer la mise en place").click()
    h4.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h4.wait_for_load_state("networkidle"); h4.wait_for_timeout(1500)
    assert h4.locator("#plateau .carte.kind-location").count() == 5, "5 Witch-Haunted Woods"
    assert h4.locator("#plateau .carte.kind-location.retournee").count() == 3, "2 bois de départ révélés, 3 non révélés"
    assert h4.locator("#pioches .pile[data-outil='pile:arkham_woods'] .badge").inner_text() == "6", "pile Arkham Woods : 6"
    assert h4.locator("#aside .carte").count() == 9, "Anette + 8 cartes Agents de côté"
    assert h4.locator("#chaos .sac-forme").inner_text().strip() == "15", "sac TCU 13 + 2 tablettes"
    assert "ahc75" in h4.locator("#lien-guide").get_attribute("href"), "lien vers le guide TCU"
    h4.screenshot(path=f"{OUT}/22_witching_tapis.png")
    # Pile Arkham Woods : clic = tirer (côté non révélé sur la pile).
    h4.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h4.locator("#pioches .pile[data-outil='pile:arkham_woods'] .dos-bouton").click()
    h4.wait_for_selector("#pioches .pile[data-outil='pile:arkham_woods'] .revelee .carte")
    src_tire = h4.locator("#pioches .pile[data-outil='pile:arkham_woods'] .revelee .carte img").get_attribute("src")
    assert src_tire.endswith("b.webp"), f"bois tiré montré côté non révélé : {src_tire}"
    h4.screenshot(path=f"{OUT}/23_witching_arkham_woods_tire.png")
    # Actes 1 et 2 avancés, puis l'acte 3 : son verso (un lieu) est posé sur le tapis avec ses indices.
    for _ in range(3):
        h4.get_by_role("button", name="Avancer l'acte").click(); h4.wait_for_timeout(400)
    h4.wait_for_timeout(600)
    assert h4.locator("#plateau .carte.kind-location").count() == 6, "le verso-lieu de l'acte 3 est sur le tapis"
    cercle = h4.locator("#plateau .carte.kind-location").filter(has_text="6").last
    h4.wait_for_load_state("networkidle"); h4.wait_for_timeout(800)
    h4.screenshot(path=f"{OUT}/24_witching_verso_lieu.png")

    # ---- At Death's Doorstep (TCU II) : questions (dont numérique), manoir, lieux qui se remplacent, dos histoire ----
    code5, token5 = creer("tcu_at_deaths_doorstep")
    print("room Doorstep", code5)
    h5 = page_pour(browser, "Hôte", host=True, code=code5, token=token5)
    h5.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h5.get_by_role("button", name="Choisir un enquêteur").click(); h5.wait_for_selector("dialog.dialogue-inv[open]")
    h5.fill("dialog .recherche", "joe"); h5.wait_for_timeout(300); h5.locator("dialog .inv").first.click()
    h5.wait_for_selector(".siege-lobby.moi .fiche")
    j5 = page_pour(browser, "Bob", code=code5, token=None)
    j5.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j5.get_by_role("button", name="Choisir un enquêteur").click(); j5.wait_for_selector("dialog.dialogue-inv[open]")
    j5.fill("dialog .recherche", "preston"); j5.wait_for_timeout(300); j5.locator("dialog .inv").first.click()
    j5.wait_for_selector(".siege-lobby.moi .fiche")
    h5.wait_for_timeout(400)
    assert h5.get_by_role("button", name="Lancer la mise en place").is_disabled(), "questions sans réponse : lancement grisé"
    for q in ("gavriella", "jerome", "valentino", "penny"):
        h5.locator(f"input[name='q-{q}'][value='{'crossed' if q == 'valentino' else 'kept'}']").check()
    h5.locator("input[name='q-evidence']").fill("5"); h5.locator("input[name='q-evidence']").dispatch_event("change")
    h5.locator("input[name='q-fate'][value='accepted']").check()
    h5.wait_for_timeout(200)
    assert j5.locator("input[name='q-evidence']").is_disabled(), "les autres voient la question numérique sans y répondre"
    h5.locator(".reglage.questions").screenshot(path=f"{OUT}/25_doorstep_lobby_questions.png")
    h5.get_by_role("button", name="Lancer la mise en place").click()
    h5.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h5.wait_for_load_state("networkidle"); h5.wait_for_timeout(1500)
    assert h5.locator("#plateau .carte.kind-location").count() == 7, "7 lieux"
    assert h5.locator("#plateau .carte.kind-location.retournee").count() == 6, "Entry Hall seul révélé"
    assert h5.locator("#aside .carte").count() == 15, "15 cartes de côté"
    assert h5.locator("#chaos .sac-forme").inner_text().strip() == "15", "sac 13 + 2"
    h5.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h5.screenshot(path=f"{OUT}/26_doorstep_tapis.png")
    # Menu d'un lieu : remplacement par la version spectrale (tous les lieux).
    h5.locator("#plateau .carte.kind-location").nth(3).click(button="right"); h5.wait_for_selector(".menu-carte")
    h5.screenshot(path=f"{OUT}/27_doorstep_menu_lieu.png")
    h5.locator(".menu-carte").get_by_role("button", name="Tous les lieux → version jumelle").click()
    h5.wait_for_timeout(700)
    assert h5.locator("#plateau .carte.kind-location").count() == 7, "toujours 7 lieux"
    assert h5.locator("#aside .carte").count() == 15, "15 de côté (les 7 normaux ont remplacé les 7 spectraux)"
    h5.wait_for_load_state("networkidle"); h5.wait_for_timeout(800)
    h5.screenshot(path=f"{OUT}/28_doorstep_spectral.png")
    # Josef : côté histoire lisible seulement par le menu.
    h5.locator("#aside").click()
    josef = h5.locator("#aside .carte.kind-enemy").filter(has=h5.locator("img[alt='Josef Meiger']")).first
    josef.click(button="right"); h5.wait_for_selector(".menu-carte")
    assert h5.locator(".menu-carte").get_by_role("button", name="Lire le côté histoire (quand une carte l'indique)").count() == 1, "menu : côté histoire"
    assert h5.locator(".menu-carte").get_by_role("button", name="Retourner", exact=True).count() == 0, "pas de retournement d'un dos histoire"
    h5.keyboard.press("Escape")

    # ---- The Secret Name (TCU III) : portes indistinguables (nom du verso), pile Unknown Places, question unique de la Loge ----
    code6, token6 = creer("tcu_secret_name")
    print("room Secret Name", code6)
    h6 = page_pour(browser, "Hôte", host=True, code=code6, token=token6)
    h6.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h6.get_by_role("button", name="Choisir un enquêteur").click(); h6.wait_for_selector("dialog.dialogue-inv[open]")
    h6.fill("dialog .recherche", "diana"); h6.wait_for_timeout(300); h6.locator("dialog .inv").first.click()
    h6.wait_for_selector(".siege-lobby.moi .fiche")
    j6 = page_pour(browser, "Bob", code=code6, token=None)
    j6.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j6.get_by_role("button", name="Choisir un enquêteur").click(); j6.wait_for_selector("dialog.dialogue-inv[open]")
    j6.fill("dialog .recherche", "marie"); j6.wait_for_timeout(300); j6.locator("dialog .inv").first.click()
    j6.wait_for_selector(".siege-lobby.moi .fiche")
    h6.wait_for_timeout(400)
    h6.locator("input[name='q-fate'][value='rejected']").check()
    h6.locator("input[name='q-lodge'][value='members_told']").check()
    h6.wait_for_timeout(200)
    h6.locator(".reglage.questions").screenshot(path=f"{OUT}/29_secret_lobby_questions.png")
    h6.get_by_role("button", name="Lancer la mise en place").click()
    h6.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h6.wait_for_load_state("networkidle"); h6.wait_for_timeout(1500)
    assert h6.locator("#plateau .carte.kind-location").count() == 5, "5 lieux"
    assert h6.locator("#plateau .carte.kind-location.retournee").count() == 4, "Moldy Halls seul révélé"
    assert h6.locator("#pioches .pile[data-outil='pile:unknown_places'] .badge").inner_text() == "6" or h6.locator("#pioches .pile[data-outil='pile:unknown_places'] .badge").inner_text() == "7", "pile Unknown Places"
    assert h6.locator("#chaos .sac-forme").inner_text().strip() == "17", "sac 13 + 2 + 2"
    portes = h6.locator("#plateau .carte.kind-location img[alt='Decrepit Door']")
    assert portes.count() == 3, f"les trois portes s'appellent Decrepit Door (vu {portes.count()})"
    assert h6.locator('#plateau .carte.kind-location img[alt="Landlord\'s Quarters"]').count() == 0, "pas de nom de pièce dévoilé"
    h6.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h6.screenshot(path=f"{OUT}/30_secret_tapis.png")
    # Menu d'une porte : titre « Decrepit Door ».
    portes.first.locator("xpath=..").click(button="right"); h6.wait_for_selector(".menu-carte")
    assert "Decrepit Door" in h6.locator(".menu-carte").inner_text(), "menu : nom du verso"
    h6.keyboard.press("Escape")
    # Tirer un Unknown Places : le côté « Unknown Places » est montré, pas la face.
    h6.locator("#pioches .pile[data-outil='pile:unknown_places'] .dos-bouton").click()
    h6.wait_for_selector("#pioches .pile[data-outil='pile:unknown_places'] .revelee .carte")
    src_tire = h6.locator("#pioches .pile[data-outil='pile:unknown_places'] .revelee .carte img").get_attribute("src")
    alt_tire = h6.locator("#pioches .pile[data-outil='pile:unknown_places'] .revelee .carte img").get_attribute("alt")
    assert src_tire.endswith("b.webp") and alt_tire == "Unknown Places", f"tirage : {src_tire} / {alt_tire}"
    h6.wait_for_load_state("networkidle"); h6.wait_for_timeout(600)
    h6.screenshot(path=f"{OUT}/31_secret_unknown_places_tire.png")

    # ---- The Wages of Sin (TCU IV) : lieux à deux faces, deux pioches avec défausses, hérétiques en pile ----
    code7, token7 = creer("tcu_wages_of_sin")
    print("room Wages", code7)
    h7 = page_pour(browser, "Hôte", host=True, code=code7, token=token7)
    h7.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h7.get_by_role("button", name="Choisir un enquêteur").click(); h7.wait_for_selector("dialog.dialogue-inv[open]")
    h7.fill("dialog .recherche", "zoey"); h7.wait_for_timeout(300); h7.locator("dialog .inv").first.click()
    h7.wait_for_selector(".siege-lobby.moi .fiche")
    j7 = page_pour(browser, "Bob", code=code7, token=None)
    j7.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j7.get_by_role("button", name="Choisir un enquêteur").click(); j7.wait_for_selector("dialog.dialogue-inv[open]")
    j7.fill("dialog .recherche", "rex"); j7.wait_for_timeout(300); j7.locator("dialog .inv").first.click()
    j7.wait_for_selector(".siege-lobby.moi .fiche")
    h7.wait_for_timeout(400)
    h7.locator("input[name='q-fate'][value='accepted']").check()
    h7.locator("input[name='q-lodge'][value='members_hid']").check()
    h7.locator("input[name='q-blackbook'][value='no']").check()
    h7.wait_for_timeout(200)
    h7.locator(".reglage.questions").screenshot(path=f"{OUT}/32_wages_lobby_questions.png")
    h7.get_by_role("button", name="Lancer la mise en place").click()
    h7.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h7.wait_for_load_state("networkidle"); h7.wait_for_timeout(1500)
    assert h7.locator("#plateau .carte.kind-location").count() == 7, "7 lieux"
    assert h7.locator("#plateau .carte.kind-location.retournee").count() == 0, "tous révélés"
    assert h7.locator("#pioches .pile[data-outil='pile:spectral'] .badge").inner_text() == "20", "pioche spectrale 20"
    assert h7.locator("#pioches .pile[data-outil='pile:spectral_discard'] .badge").inner_text() == "0", "défausse spectrale vide"
    assert h7.locator("#pioches .pile[data-outil='pile:heretics'] .badge").inner_text() == "4", "4 hérétiques"
    assert h7.locator("#chaos .sac-forme").inner_text().strip() == "16", "sac 13 + 2 + 1"
    h7.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h7.screenshot(path=f"{OUT}/33_wages_tapis.png")
    # Menu d'un lieu : « Autre face (Spectral) », pas de « Retourner ».
    h7.locator("#plateau .carte.kind-location").first.click(button="right"); h7.wait_for_selector(".menu-carte")
    assert h7.locator(".menu-carte").get_by_role("button", name="Autre face (Spectral)").count() == 1, "menu : autre face"
    assert h7.locator(".menu-carte").get_by_role("button", name="Retourner", exact=True).count() == 0, "pas de retournement"
    h7.locator(".menu-carte").get_by_role("button", name="Autre face (Spectral)").click()
    h7.wait_for_load_state("networkidle"); h7.wait_for_timeout(800)
    # Tirer de la pioche spectrale, menu de la carte : défausse spectrale.
    h7.locator("#pioches .pile[data-outil='pile:spectral'] .dos-bouton").click()
    h7.wait_for_selector("#pioches .pile[data-outil='pile:spectral'] .revelee .carte")
    h7.locator("#pioches .pile[data-outil='pile:spectral'] .revelee .carte").click(button="right"); h7.wait_for_selector(".menu-carte")
    assert h7.locator(".menu-carte").get_by_role("button", name="Défausser (Défausse spectrale)").count() == 1, "menu : défausse spectrale"
    assert h7.locator(".menu-carte").get_by_role("button", name="Mélanger dans Pioche spectrale").count() == 1, "menu : pioche spectrale"
    h7.screenshot(path=f"{OUT}/34_wages_menu_carte_spectrale.png")
    h7.locator(".menu-carte").get_by_role("button", name="Défausser (Défausse spectrale)").click()
    h7.wait_for_timeout(500)
    assert h7.locator("#pioches .pile[data-outil='pile:spectral_discard'] .badge").inner_text() == "1", "défausse spectrale 1"
    h7.wait_for_load_state("networkidle"); h7.wait_for_timeout(600)
    h7.screenshot(path=f"{OUT}/35_wages_piles.png")

    # ---- For the Greater Good (TCU V) : mise en place selon la Loge, clés déplaçables, Nathan Wick à deux faces ----
    code8, token8 = creer("tcu_for_the_greater_good")
    print("room Greater Good", code8)
    h8 = page_pour(browser, "Hôte", host=True, code=code8, token=token8)
    h8.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h8.get_by_role("button", name="Choisir un enquêteur").click(); h8.wait_for_selector("dialog.dialogue-inv[open]")
    h8.fill("dialog .recherche", "agnes"); h8.wait_for_timeout(300); h8.locator("dialog .inv").first.click()
    h8.wait_for_selector(".siege-lobby.moi .fiche")
    j8 = page_pour(browser, "Bob", code=code8, token=None)
    j8.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j8.get_by_role("button", name="Choisir un enquêteur").click(); j8.wait_for_selector("dialog.dialogue-inv[open]")
    j8.fill("dialog .recherche", "roland"); j8.wait_for_timeout(300); j8.locator("dialog .inv").first.click()
    j8.wait_for_selector(".siege-lobby.moi .fiche")
    h8.wait_for_timeout(400)
    h8.locator("input[name='q-fate'][value='rejected']").check()
    h8.locator("input[name='q-lodge'][value='enemies']").check()
    h8.locator("input[name='q-blackbook'][value='no']").check()
    h8.wait_for_timeout(200)
    h8.locator(".reglage.questions").screenshot(path=f"{OUT}/36_greater_lobby_questions.png")
    h8.get_by_role("button", name="Lancer la mise en place").click()
    h8.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h8.wait_for_load_state("networkidle"); h8.wait_for_timeout(1500)
    assert h8.locator("#plateau .carte.kind-location").count() == 5, "5 lieux"
    assert h8.locator("#aside .mini.cle").count() == 4, "4 clés de côté"
    assert h8.locator("#chaos .sac-forme").inner_text().strip() == "15", "sac 13 + 2 anciens (ennemis de la Loge)"
    h8.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h8.screenshot(path=f"{OUT}/37_greater_tapis.png")
    # Glisser une clé de la zone de côté sur le siège de l'hôte.
    h8.locator("#aside").click()
    cle = h8.locator("#aside .mini.cle").first
    src = cle.bounding_box(); dst = h8.locator("#sieges .siege").nth(0).locator(".menace").bounding_box()
    h8.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); h8.mouse.down()
    h8.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + dst["height"] / 2, steps=12); h8.mouse.up()
    h8.wait_for_timeout(500)
    assert h8.locator("#sieges .siege").nth(0).locator(".menace .mini.cle").count() == 1, "clé sur le siège"
    assert h8.locator("#aside .mini.cle").count() == 3
    # Nathan Wick : menu « Autre face (Master of Indoctrination) ».
    nathan = h8.locator("#aside .carte").filter(has=h8.locator("img[alt='Nathan Wick']")).first
    nathan.click(button="right"); h8.wait_for_selector(".menu-carte")
    assert h8.locator(".menu-carte").get_by_role("button", name="Autre face (Master of Indoctrination)").count() == 1, "menu : autre face de Nathan"
    h8.screenshot(path=f"{OUT}/38_greater_cle_siege_menu_nathan.png")
    h8.keyboard.press("Escape")

    # ---- Union and Disillusion (TCU VI) : douze questions de journal, isles au hasard, braseros, carte Fate cachée ----
    code9, token9 = creer("tcu_union_and_disillusion")
    print("room Union", code9)
    h9 = page_pour(browser, "Hôte", host=True, code=code9, token=token9)
    h9.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h9.get_by_role("button", name="Choisir un enquêteur").click(); h9.wait_for_selector("dialog.dialogue-inv[open]")
    h9.fill("dialog .recherche", "wendy"); h9.wait_for_timeout(300); h9.locator("dialog .inv").first.click()
    h9.wait_for_selector(".siege-lobby.moi .fiche")
    j9 = page_pour(browser, "Bob", code=code9, token=None)
    j9.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j9.get_by_role("button", name="Choisir un enquêteur").click(); j9.wait_for_selector("dialog.dialogue-inv[open]")
    j9.fill("dialog .recherche", "skids"); j9.wait_for_timeout(300); j9.locator("dialog .inv").first.click()
    j9.wait_for_selector(".siege-lobby.moi .fiche")
    h9.wait_for_timeout(400)
    for q, v in (("sided", "coven"), ("fate", "accepted"), ("lodge", "members_told"), ("deceiving", "yes"), ("inducted", "yes"), ("mementos", "no"), ("blackbook", "no"),
                 ("gavriella", "kept"), ("jerome", "kept"), ("valentino", "crossed"), ("penny", "crossed")):
        h9.locator(f"input[name='q-{q}'][value='{v}']").check()
    h9.locator("input[name='q-heretics']").fill("2"); h9.locator("input[name='q-heretics']").dispatch_event("change")
    h9.wait_for_timeout(200)
    h9.locator(".reglage.questions").screenshot(path=f"{OUT}/39_union_lobby_questions.png")
    h9.get_by_role("button", name="Lancer la mise en place").click()
    h9.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h9.wait_for_load_state("networkidle"); h9.wait_for_timeout(1500)
    assert h9.locator("#plateau .carte.kind-location").count() == 4, "4 lieux"
    assert h9.locator("#chaos .sac-forme").inner_text().strip() == "17", "sac 13 + 2 tablettes + 2 cultistes"
    h9.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h9.screenshot(path=f"{OUT}/40_union_tapis.png")
    # Carte Fate face cachée : menu « Révéler (quand une carte l'indique) », pas de « Retourner ».
    h9.locator("#aside").click()
    fate = h9.locator("#aside .carte.kind-story").first
    fate.click(button="right"); h9.wait_for_selector(".menu-carte")
    assert h9.locator(".menu-carte").get_by_role("button", name="Révéler (quand une carte l'indique)").count() == 1, "menu : révéler un dos histoire"
    assert h9.locator(".menu-carte").get_by_role("button", name="Retourner", exact=True).count() == 0
    h9.screenshot(path=f"{OUT}/41_union_menu_fate.png")
    h9.keyboard.press("Escape")

    # ---- In the Clutches of Chaos (TCU VII) : huit lieux dont versions au hasard, brèches, pile « Lieux au hasard » ----
    code10, token10 = creer("tcu_in_the_clutches_of_chaos")
    print("room Clutches", code10)
    h10 = page_pour(browser, "Hôte", host=True, code=code10, token=token10)
    h10.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h10.get_by_role("button", name="Choisir un enquêteur").click(); h10.wait_for_selector("dialog.dialogue-inv[open]")
    h10.fill("dialog .recherche", "daisy"); h10.wait_for_timeout(300); h10.locator("dialog .inv").first.click()
    h10.wait_for_selector(".siege-lobby.moi .fiche")
    j10 = page_pour(browser, "Bob", code=code10, token=None)
    j10.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j10.get_by_role("button", name="Choisir un enquêteur").click(); j10.wait_for_selector("dialog.dialogue-inv[open]")
    j10.fill("dialog .recherche", "roland"); j10.wait_for_timeout(300); j10.locator("dialog .inv").first.click()
    j10.wait_for_selector(".siege-lobby.moi .fiche")
    h10.wait_for_timeout(400)
    for q, v in (("outcome", "anette"), ("fate", "rejected"), ("lodge", "enemies"), ("blackbook", "no")):
        h10.locator(f"input[name='q-{q}'][value='{v}']").check()
    h10.wait_for_timeout(200)
    h10.locator(".reglage.questions").screenshot(path=f"{OUT}/42_clutches_lobby_questions.png")
    h10.get_by_role("button", name="Lancer la mise en place").click()
    h10.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h10.wait_for_load_state("networkidle"); h10.wait_for_timeout(1500)
    assert h10.locator("#plateau .carte.kind-location").count() == 8, "8 lieux"
    assert h10.locator("#pioches .pile[data-outil='pile:random_locations'] .badge").inner_text() == "8", "pile Lieux au hasard : 8"
    assert h10.locator("#chaos .sac-forme").inner_text().strip() == "15", "sac 13 + 2 anciens"
    h10.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h10.screenshot(path=f"{OUT}/43_clutches_tapis.png")
    # Menu de la pile : tirage au hasard sans sortir → encart pour tous.
    h10.locator("#pioches .pile[data-outil='pile:random_locations']").dispatch_event("contextmenu"); h10.wait_for_selector(".menu-carte")
    assert h10.locator(".menu-carte").get_by_role("button", name="Tirer 2 au hasard (sans sortir)").count() == 1, "menu : tirage au hasard"
    h10.locator(".menu-carte").get_by_role("button", name="Tirer 2 au hasard (sans sortir)").click()
    h10.wait_for_timeout(600)
    assert "Tirage au hasard dans Lieux au hasard" in h10.locator("#journal").inner_text(), "le tirage est consigné au journal (plus d'encart)"
    assert "Tirage au hasard dans Lieux au hasard" in j10.locator("#journal").inner_text(), "les autres le voient (journal)"
    h10.screenshot(path=f"{OUT}/44_clutches_tirage.png")

    # ---- Before the Black Throne (TCU VIII) : grille avec espaces vides, deux cartes Cosmos, pile Cosmos, Azathoth ----
    code11, token11 = creer("tcu_before_the_black_throne")
    print("room Black Throne", code11)
    h11 = page_pour(browser, "Hôte", host=True, code=code11, token=token11)
    h11.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h11.get_by_role("button", name="Choisir un enquêteur").click(); h11.wait_for_selector("dialog.dialogue-inv[open]")
    h11.fill("dialog .recherche", "agnes"); h11.wait_for_timeout(300); h11.locator("dialog .inv").first.click()
    h11.wait_for_selector(".siege-lobby.moi .fiche")
    j11 = page_pour(browser, "Bob", code=code11, token=None)
    j11.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j11.get_by_role("button", name="Choisir un enquêteur").click(); j11.wait_for_selector("dialog.dialogue-inv[open]")
    j11.fill("dialog .recherche", "wendy"); j11.wait_for_timeout(300); j11.locator("dialog .inv").first.click()
    j11.wait_for_selector(".siege-lobby.moi .fiche")
    h11.wait_for_timeout(400)
    h11.locator("input[name='q-tally']").fill("3"); h11.locator("input[name='q-tally']").dispatch_event("change")
    for q, v in (("asked", "yes"), ("fate", "accepted"), ("lodge", "members_told"), ("blackbook", "yes")):
        h11.locator(f"input[name='q-{q}'][value='{v}']").check()
    h11.wait_for_timeout(200)
    h11.locator(".reglage.questions").screenshot(path=f"{OUT}/45_throne_lobby_questions.png")
    h11.get_by_role("button", name="Lancer la mise en place").click()
    h11.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h11.wait_for_load_state("networkidle"); h11.wait_for_timeout(1500)
    assert h11.locator("#plateau .carte.kind-location").count() == 3, "3 lieux"
    assert h11.locator("#plateau .carte.kind-proxy").count() == 6, "6 espaces vides"
    assert h11.locator("#plateau .carte.kind-proxy img[src='/img/dos-joueur.svg']").count() == 6, "dos de carte joueur"
    assert h11.locator("#pioches .pile[data-outil='pile:cosmos'] .badge").inner_text() == "11", "Cosmos : 11"
    assert h11.locator("#chaos .sac-forme").inner_text().strip() == "19", "sac 13 + −4 + 2 tablettes + 2 cultistes + 1 crâne"
    assert h11.locator("#plateau .carte.kind-location img[alt='Cosmos']").count() == 2, "les deux cartes Cosmos s'appellent Cosmos"
    h11.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h11.screenshot(path=f"{OUT}/46_throne_tapis.png")
    # Menu de la pile Cosmos : regarder les 2 premières.
    h11.locator("#pioches .pile[data-outil='pile:cosmos']").dispatch_event("contextmenu"); h11.wait_for_selector(".menu-carte")
    assert h11.locator(".menu-carte").get_by_role("button", name="Regarder les 2 premières").count() == 1, "menu : regarder les premières"
    h11.locator(".menu-carte").get_by_role("button", name="Regarder les 2 premières").click()
    h11.wait_for_selector("dialog[open]", timeout=5000)
    h11.screenshot(path=f"{OUT}/47_throne_apercu_cosmos.png")
    h11.keyboard.press("Escape")

    # ---- The Pit of Despair (TIC I) : clés de couleur (dont cachées), tunnels au hasard, jeton d'inondation, panneau Marée, pile Tidal Tunnel ----
    code14, token14 = creer("tic_the_pit_of_despair")
    print("room Pit of Despair", code14)
    h14 = page_pour(browser, "Hôte", host=True, code=code14, token=token14)
    h14.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h14.get_by_role("button", name="Choisir un enquêteur").click(); h14.wait_for_selector("dialog.dialogue-inv[open]")
    h14.fill("dialog .recherche", "sister mary"); h14.wait_for_timeout(300); h14.locator("dialog .inv").first.click()
    h14.wait_for_selector(".siege-lobby.moi .fiche")
    j14 = page_pour(browser, "Bob", code=code14, token=None)
    j14.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j14.get_by_role("button", name="Choisir un enquêteur").click(); j14.wait_for_selector("dialog.dialogue-inv[open]")
    j14.fill("dialog .recherche", "silas"); j14.wait_for_timeout(300); j14.locator("dialog .inv").first.click()
    j14.wait_for_selector(".siege-lobby.moi .fiche")
    h14.wait_for_timeout(400)
    assert h14.locator(".reglage.questions").count() == 0 or h14.locator(".reglage.questions input").count() == 0, "pas de question au lobby"
    h14.screenshot(path=f"{OUT}/70_pit_lobby.png")
    h14.get_by_role("button", name="Lancer la mise en place").click()
    h14.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h14.wait_for_load_state("networkidle"); h14.wait_for_timeout(1500)
    assert h14.locator("#plateau .carte.kind-location").count() == 4, "chambre + 3 tunnels"
    assert h14.locator("#plateau .carte.kind-location img[alt='Tidal Tunnel']").count() == 3, "trois tunnels non révélés nommés Tidal Tunnel"
    assert h14.locator("#plateau .mini.cle.cachee").count() == 1, "une clé cachée sur la chambre"
    assert h14.locator("#aside .mini.cle").count() == 4, "quatre clés de côté"
    assert h14.locator("#aside .mini.cle.cachee").count() == 2, "dont deux cachées"
    assert h14.locator("#pioches .pile[data-outil='pile:tidal'] .badge").inner_text() == "0", "pile Tidal Tunnel vide"
    assert h14.locator("#pioches .pile[data-outil='pile:tidal'] .dos-bouton.vide").inner_text().strip() == "former", "bouton former"
    assert h14.locator("#chaos .sac-forme").inner_text().strip() == "20", "sac TIC standard : 20"
    assert h14.locator("#histoire .bloc.maree").count() == 1, "panneau Marée"
    h14.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h14.mouse.move(420, 520); h14.wait_for_timeout(300)   # la souris quitte le portrait du siège (sinon la loupe couvre le tapis)
    h14.screenshot(path=f"{OUT}/71_pit_tapis.png")
    # Menu de la chambre : inondation, tunnels autour (grisé : pile vide), clé cachée au hasard.
    chambre = h14.locator("#plateau .carte.kind-location[title='Unfamiliar Chamber']")
    chambre.dispatch_event("contextmenu"); h14.wait_for_selector(".menu-carte")
    assert h14.locator(".menu-carte .inondation-ligne").count() == 1, "ligne Inondation"
    assert h14.locator(".menu-carte").get_by_role("button", name="Tidal Tunnel autour de ce lieu (dessous, gauche, droite)").is_disabled(), "tunnels autour grisé : pile vide"
    assert h14.locator(".menu-carte").get_by_role("button", name="Poser ici une clé cachée au hasard (2 de côté, sans la regarder)").count() == 1, "clé cachée au hasard"
    h14.screenshot(path=f"{OUT}/72_pit_menu_lieu.png")
    h14.locator(".menu-carte .inondation-ligne .pm.niveau").nth(1).click(); h14.wait_for_timeout(500)
    h14.keyboard.press("Escape")
    assert h14.locator("#plateau .carte.kind-location[title='Unfamiliar Chamber'] img.inondation[alt='partiellement inondé']").count() == 1, "jeton partiellement inondé"
    # Agenda 2 : marée automatique (tous les lieux révélés +1, règle +1), panneau mis à jour.
    h14.locator("#histoire").get_by_role("button", name="Avancer l'agenda").click(); h14.wait_for_timeout(800)
    assert h14.locator("#plateau .carte.kind-location[title='Unfamiliar Chamber'] img.inondation[alt='totalement inondé']").count() == 1, "chambre montée d'un niveau par la marée"
    assert h14.locator("#histoire .bloc.maree .regle-maree .bouton.actif").inner_text().strip() == "+1", "règle +1 active"
    # Un tunnel révélé d'un clic pendant la marée : partiellement inondé.
    h14.locator("#plateau .carte.kind-location img[alt='Tidal Tunnel']").first.click(); h14.wait_for_timeout(700)
    assert h14.locator("#plateau .carte.kind-location img.inondation[alt='partiellement inondé']").count() == 1, "tunnel révélé inondé par la marée"
    h14.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h14.mouse.move(420, 520); h14.wait_for_timeout(300)
    h14.screenshot(path=f"{OUT}/73_pit_maree.png")
    h14.locator("#histoire").evaluate("(e) => e.scrollTo(0, e.scrollHeight)"); h14.wait_for_timeout(200)
    h14.locator("#histoire .bloc.maree").screenshot(path=f"{OUT}/76_pit_panneau_maree.png")
    h14.locator("#histoire").evaluate("(e) => e.scrollTo(0, 0)")
    # Pile Tidal Tunnel formée (bouton « former »), puis tunnels autour du tunnel du bas.
    h14.locator("#pioches .pile[data-outil='pile:tidal'] .dos-bouton.vide").click(); h14.wait_for_timeout(600)
    assert h14.locator("#pioches .pile[data-outil='pile:tidal'] .badge").inner_text() == "8", "pile formée : 8"
    assert h14.locator("#aside .carte.kind-location").count() == 0, "plus de tunnel de côté"
    bas = h14.locator("#plateau .carte.kind-location").filter(has=h14.locator("img[alt='Tidal Tunnel']")).first
    bas.dispatch_event("contextmenu"); h14.wait_for_selector(".menu-carte")
    h14.locator(".menu-carte").get_by_role("button", name="Tidal Tunnel autour de ce lieu (dessous, gauche, droite)").click(); h14.wait_for_timeout(800)
    assert h14.locator("#plateau .carte.kind-location").count() >= 6, "des tunnels posés autour"
    h14.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h14.mouse.move(420, 520); h14.wait_for_timeout(300)
    h14.screenshot(path=f"{OUT}/74_pit_tunnels_autour.png")
    # Clé cachée glissée sur un siège : retournée face visible chez tous les clients.
    cle = h14.locator("#aside .mini.cle.cachee").first
    cle.dispatch_event("contextmenu"); h14.wait_for_selector(".menu-carte")
    h14.locator(".menu-carte .item").filter(has_text="Contrôlée par").first.click(); h14.wait_for_timeout(700)
    assert h14.locator("#sieges .mini.cle:not(.cachee)").count() >= 1, "clé contrôlée, face visible"
    j14.wait_for_timeout(300)
    assert j14.locator("#sieges .mini.cle:not(.cachee)").count() >= 1, "vue par Bob aussi"
    h14.locator("#sieges .siege").nth(0).screenshot(path=f"{OUT}/75_pit_cle_siege.png")

    # ---- Enquêteur personnalisé (hors ArkhamDB) sur At Death's Doorstep : entrée « Hors collection », formulaire, lobby, tapis, sans image ----
    code12, token12 = creer("tcu_at_deaths_doorstep")
    print("room Doorstep (custom)", code12)
    IMG_CUSTOM = "https://cdn.arkham.build/optimized/05046.webp"
    h12 = page_pour(browser, "Hôte", host=True, code=code12, token=token12)
    h12.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h12.get_by_role("button", name="Choisir un enquêteur").click(); h12.wait_for_selector("dialog.dialogue-inv[open]")
    h12.fill("dialog .recherche", "joe"); h12.wait_for_timeout(300); h12.locator("dialog .inv").first.click()
    h12.wait_for_selector(".siege-lobby.moi .fiche")
    j12 = page_pour(browser, "", code=code12, token=None)
    j12.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j12.get_by_role("button", name="Choisir un enquêteur").click(); j12.wait_for_selector("dialog.dialogue-inv[open]")
    j12.wait_for_timeout(500)
    j12.screenshot(path=f"{OUT}/48_custom_entree.png")
    j12.locator("dialog .inv-custom").click(); j12.wait_for_selector("dialog .form-custom")
    j12.fill("#custom-nom", "Lisette Anofelis")
    j12.fill("#custom-image", IMG_CUSTOM); j12.locator("#custom-image").dispatch_event("change")
    j12.fill("#custom-vie", "8"); j12.fill("#custom-sante", "6")
    j12.wait_for_timeout(800)
    j12.screenshot(path=f"{OUT}/49_custom_formulaire.png")
    j12.get_by_role("button", name="Prendre cet enquêteur").click()
    j12.wait_for_selector(".siege-lobby.moi .fiche")
    h12.wait_for_timeout(600)
    assert "Lisette Anofelis" in h12.locator(".siege-lobby").nth(1).inner_text(), "l'hôte voit l'enquêteur personnalisé"
    h12.screenshot(path=f"{OUT}/50_custom_lobby.png")
    for q in ("gavriella", "jerome", "valentino", "penny"):
        h12.locator(f"input[name='q-{q}'][value='kept']").check()
    h12.locator("input[name='q-fate'][value='accepted']").check()
    h12.wait_for_timeout(200)
    h12.get_by_role("button", name="Lancer la mise en place").click()
    h12.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h12.wait_for_load_state("networkidle"); h12.wait_for_timeout(1500)
    assert h12.locator("#sieges .carte.kind-investigator.custom").count() == 1, "carte personnalisée au siège"
    assert h12.locator("#plateau .mini.custom").count() == 1, "pion personnalisé sur Entry Hall"
    h12.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h12.screenshot(path=f"{OUT}/51_custom_tapis.png")
    # Sans image : le nom sur la carte, les initiales sur le pion ; le formulaire est prérempli.
    h12.get_by_role("button", name="Réinitialiser").click()
    j12.wait_for_selector("#lobby:not([hidden])", timeout=8000)
    j12.wait_for_selector(".siege-lobby.moi", timeout=20000)
    j12.get_by_role("button", name="Changer d'enquêteur").click(); j12.wait_for_selector("dialog.dialogue-inv[open]")
    assert "Lisette" in j12.locator("dialog .inv-custom").inner_text(), "l'entrée rappelle l'enquêteur courant"
    j12.locator("dialog .inv-custom").click(); j12.wait_for_selector("dialog .form-custom")
    assert j12.locator("#custom-nom").input_value() == "Lisette Anofelis", "formulaire prérempli"
    j12.fill("#custom-image", ""); j12.locator("#custom-image").dispatch_event("change")
    j12.get_by_role("button", name="Mettre à jour").click()
    j12.wait_for_timeout(600)
    j12.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    assert j12.evaluate("getComputedStyle(document.querySelector('.siege-lobby.moi .vignette')).display") == "grid", "vignette sans image : nom centré"
    j12.locator(".siege-lobby.moi").screenshot(path=f"{OUT}/52_custom_sans_image_lobby.png")
    for q in ("gavriella", "jerome", "valentino", "penny"):
        h12.locator(f"input[name='q-{q}'][value='kept']").check()
    h12.locator("input[name='q-fate'][value='accepted']").check()
    h12.wait_for_timeout(200)
    h12.get_by_role("button", name="Lancer la mise en place").click()
    h12.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h12.wait_for_load_state("networkidle"); h12.wait_for_timeout(1200)
    assert h12.locator("#sieges .carte.kind-investigator.custom.sans-image").count() == 1, "carte sans image : nom affiché"
    assert h12.locator("#plateau .mini.custom.sans-image").count() == 1, "pion sans image : initiales"
    h12.locator("#sieges .siege").nth(1).screenshot(path=f"{OUT}/53_custom_sans_image_siege.png")

    # ---- Board joueur, étape 1 (cahier §10) : import du deck au lobby, faiblesse à déterminer, code de siège,
    #      page joueur (second onglet, lecture seule, rejoindre avec le code) ----
    def page_board(page, code, n, attendre="#board-joueur:not([hidden]), #attente:not([hidden])"):
        p = page.context.new_page()
        p.on("dialog", lambda d: d.accept())
        p.on("console", lambda m: erreurs.append(f"[board] console {m.type}: {m.text}") if m.type in ("error", "warning") else None)
        p.on("pageerror", lambda e: erreurs.append(f"[board] pageerror: {e}"))
        p.goto(f"{BASE}/r/{code}/j/{n}")
        p.wait_for_selector(attendre, timeout=8000)
        return p
    code13, token13 = creer("notz_the_gathering")
    print("room Gathering (board joueur)", code13)
    h13 = page_pour(browser, "Alice", host=True, code=code13, token=token13)
    h13.locator(".siege-lobby").nth(0).get_by_role("button", name="S'asseoir ici").click()
    h13.wait_for_selector(".siege-lobby.moi")
    h13.fill(".siege-lobby.moi .champ-deck", "https://arkhamdb.com/decklist/view/31000")
    h13.get_by_role("button", name="Importer le deck").click()
    h13.wait_for_selector(".siege-lobby.moi .bloc-deck", timeout=20000)
    assert "Mark Harrigan" in h13.locator(".siege-lobby.moi").inner_text(), "enquêteur déduit du deck"
    assert h13.locator(".siege-lobby.moi .code-siege strong").count() == 1, "code de siège affiché"
    j13 = page_pour(browser, "Bob", code=code13, token=None)
    j13.locator(".siege-lobby").nth(1).get_by_role("button", name="S'asseoir ici").click()
    j13.wait_for_selector(".siege-lobby.moi")
    j13.fill(".siege-lobby.moi .champ-deck", "https://arkhamdb.com/decklist/view/44000")
    j13.get_by_role("button", name="Importer le deck").click()
    j13.wait_for_selector(".siege-lobby.moi .faiblesse-pending", timeout=20000)
    h13.wait_for_timeout(600)
    h13.screenshot(path=f"{OUT}/54_deck_lobby.png")
    j13.get_by_role("button", name="Choisir…").click()
    j13.wait_for_selector("dialog[open] .carte-peek", timeout=10000)
    j13.wait_for_timeout(800)
    j13.screenshot(path=f"{OUT}/55_deck_choix_faiblesse.png")
    j13.keyboard.press("Escape")
    j13.get_by_role("button", name="Tirer au hasard").click()
    j13.wait_for_selector(".siege-lobby.moi .faiblesse-pending", state="detached", timeout=5000)
    assert "Faiblesse de base :" in j13.locator(".siege-lobby.moi .bloc-deck").inner_text(), "faiblesse tirée nommée"
    # Page joueur avant le lancement (même navigateur que Bob : le siège est rejoint sans saisie).
    b13 = page_board(j13, code13, 1, attendre="#attente:not([hidden])")
    b13.wait_for_selector("#moi:has-text('Siège 2')", timeout=8000)
    b13.wait_for_timeout(500)
    b13.screenshot(path=f"{OUT}/56_board_attente.png")
    assert "2 appareils" in h13.locator(".siege-lobby").nth(1).inner_text(), "deux connexions sur le siège 2"
    # Mise en place : le tapis montre les ressources, le code de siège et le bouton « Voir le board ».
    h13.get_by_role("button", name="Lancer la mise en place").click()
    h13.wait_for_selector("#tapis:not([hidden])", timeout=8000)
    h13.wait_for_load_state("networkidle"); h13.wait_for_timeout(1200)
    h13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    assert h13.locator("#sieges .siege").nth(0).get_by_role("link", name="Voir le board").count() == 1
    assert "Ressources" in h13.locator("#sieges .siege").nth(0).inner_text()
    h13.locator("#sieges").screenshot(path=f"{OUT}/57_tapis_sieges_board.png")
    # Board d'Alice dans un second onglet (siège rejoint automatiquement) : entête, piles, cartes liées hors jeu.
    a13 = page_board(h13, code13, 0, attendre="#board-joueur:not([hidden])")
    a13.wait_for_selector("#moi:has-text('Siège 1')", timeout=8000)
    a13.wait_for_load_state("networkidle"); a13.wait_for_timeout(1200)
    a13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    assert a13.locator("#onglets .onglet").count() == 2, "un onglet par siège avec enquêteur"
    assert a13.locator("#piles-joueur .pile").first.locator(".badge").inner_text() == "33", "pioche de 33 cartes"
    assert a13.locator("#piles-joueur .hors-jeu .carte").count() == 3, "3 Soothing Melody hors jeu"
    assert a13.locator(".entete-joueur:not(.lecture)").count() == 1, "board actif pour son siège"
    assert a13.locator("#entete .chip-compteur").count() == 4, "quatre compteurs compacts (ressources, indices, vie, santé)"
    assert a13.locator("#mon-lieu .lieu-carte .carte").count() == 1, "mon lieu : le lieu du pion"
    assert a13.locator("#mon-lieu .lieu-carte .pions-lieu .mini").count() == 2, "les deux pions sur le lieu, à cheval sur son bord haut"
    assert a13.locator("#piles-joueur .rechercher-defausse").is_disabled(), "défausse vide : bouton de recherche grisé"
    a13.screenshot(path=f"{OUT}/58_board_joueur.png")
    a13.locator("#mon-lieu").screenshot(path=f"{OUT}/58b_board_mon_lieu.png")
    # Le même board vu par Bob : lecture seule, main masquée.
    lb13 = page_board(j13, code13, 0, attendre="#board-joueur:not([hidden])")
    lb13.wait_for_load_state("networkidle"); lb13.wait_for_timeout(1000)
    lb13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    assert lb13.locator(".entete-joueur.lecture").count() == 1, "lecture seule chez l'autre joueur"
    assert lb13.locator("#entete .pm:enabled").count() == 0, "aucun compteur actif en lecture seule"
    lb13.wait_for_selector("#moi:has-text('Siège 2')", timeout=8000)
    assert lb13.locator(".rejoindre").get_by_role("button", name="Voir mon board").count() == 1, "Bob garde son siège : lien vers son board, pas de code à saisir"
    lb13.screenshot(path=f"{OUT}/59_board_lecture_seule.png")
    # Un nouvel appareil (autre navigateur) rejoint le siège 1 avec son code.
    ctx_t = browser.new_context(viewport={"width": 1600, "height": 1000}, locale="fr-FR", ignore_https_errors=True)
    t13 = ctx_t.new_page()
    t13.on("pageerror", lambda e: erreurs.append(f"[tablette] pageerror: {e}"))
    t13.goto(f"{BASE}/r/{code13}/j/0")
    t13.wait_for_selector(".rejoindre .champ-pin", timeout=8000)
    t13.wait_for_timeout(500)
    t13.screenshot(path=f"{OUT}/60_board_rejoindre.png")
    pin = h13.locator("#sieges .siege").nth(0).locator(".code-siege strong").inner_text()
    t13.fill(".rejoindre .champ-pin", pin)
    t13.get_by_role("button", name="Rejoindre ce siège").click()
    t13.wait_for_selector("#moi:has-text('Siège 1')", timeout=8000)
    t13.wait_for_timeout(600)
    assert t13.locator(".entete-joueur:not(.lecture)").count() == 1, "le second appareil agit sur le board"
    assert "3 appareils" in h13.locator("#sieges .siege").nth(0).inner_text(), "trois connexions sur le siège 1"
    ctx_t.close()

    # ---- Board joueur, étape 2 : mise en place, mulligan par sélection, pioche au clic, glisser vers la défausse et
    #      en jeu, révéler une carte, regarder les premières cartes, entretien automatique ----
    a13.get_by_role("button", name="Mise en place").click()
    a13.wait_for_selector(".mise-en-place.mulligan", timeout=8000); a13.wait_for_load_state("networkidle"); a13.wait_for_timeout(800)
    assert a13.locator("#main .eventail .carte").count() == 5, "main de 5"
    assert a13.locator(".zone-jeu .carte").count() == 1, "Sophie commence en jeu"
    assert a13.locator("#entete .chip-compteur").first.locator(".valeur").inner_text() == "5", "5 ressources"
    a13.locator("#main .eventail .carte").nth(0).click(); a13.locator("#main .eventail .carte").nth(2).click()
    a13.wait_for_timeout(300)
    assert a13.locator("#main .eventail .carte.choisie").count() == 2, "2 cartes choisies pour le mulligan"
    a13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    a13.screenshot(path=f"{OUT}/61_board_mulligan.png")
    a13.get_by_role("button", name="Mulligan (2)").click()
    a13.wait_for_selector(".mise-en-place.mulligan", state="detached", timeout=5000); a13.wait_for_timeout(500)
    assert "mulligan fait" in a13.locator("#entete").inner_text()
    assert a13.locator("#main .eventail .carte").count() == 5, "toujours 5 cartes après le mulligan"
    a13.locator(".pioche-joueur .dos-bouton").click(); a13.wait_for_timeout(400)
    assert a13.locator("#main .eventail .carte").count() == 6, "piocher au clic sur la pioche"
    src = a13.locator("#main .eventail .carte").first.bounding_box(); dst = a13.locator("#piles-joueur .pile[data-outil='pdiscard0']").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(dst["x"] + dst["width"] / 2, dst["y"] + dst["height"] / 2, steps=12); a13.mouse.up(); a13.wait_for_timeout(500)
    assert a13.locator("#main .eventail .carte").count() == 5, "carte défaussée par glisser"
    assert a13.locator("#piles-joueur .pile[data-outil='pdiscard0'] .carte").count() == 1, "dessus de la défausse visible"
    # Bouton « Rechercher (sans mélanger) » sous la défausse : fenêtre de la défausse, ordre conservé (retour de test du 2026-09-09).
    a13.locator("#piles-joueur .rechercher-defausse").click(); a13.wait_for_selector("dialog[open] .carte-peek", timeout=5000)
    assert "Défausse — 1 carte" in a13.locator("dialog[open] h2").inner_text(), "fenêtre de la défausse"
    a13.screenshot(path=f"{OUT}/62b_board_recherche_defausse.png")
    a13.keyboard.press("Escape"); a13.wait_for_timeout(300)
    assert a13.locator("#piles-joueur .pile[data-outil='pdiscard0'] .badge").inner_text() == "1", "la défausse n'a pas été mélangée ni vidée"
    a13.locator("#main .eventail .carte").first.dispatch_event("contextmenu"); a13.wait_for_selector(".menu-carte")
    a13.screenshot(path=f"{OUT}/62_board_menu_main.png")
    a13.locator(".menu-carte").get_by_role("button", name="Révéler à tous").click(); a13.wait_for_timeout(400)
    assert a13.locator("#main .eventail .carte.revelee").count() == 1, "carte montrée à tous"
    lb13.wait_for_timeout(300)
    assert lb13.locator("#main .eventail .carte.revelee:not(.retournee)").count() == 1, "Bob voit la carte montrée, les autres restent des dos"
    assert lb13.locator("#main .eventail .carte.retournee").count() == 4
    lb13.screenshot(path=f"{OUT}/63_board_vu_par_bob_carte_montree.png")
    a13.locator("#piles-joueur .pile[data-outil='pdeck0']").dispatch_event("contextmenu"); a13.wait_for_selector(".menu-carte")
    a13.locator(".menu-carte").get_by_role("button", name="Regarder les 3 premières").click()
    a13.wait_for_selector("dialog[open] .carte-peek", timeout=5000); a13.wait_for_timeout(600)
    assert a13.locator("dialog[open] .carte-peek").count() == 3
    a13.screenshot(path=f"{OUT}/64_board_regarder_premieres.png")
    a13.locator("dialog[open] .carte-peek").first.get_by_role("button", name="En main").click(); a13.wait_for_timeout(400)
    a13.keyboard.press("Escape"); a13.wait_for_timeout(300)
    assert a13.locator("#main .eventail .carte").count() == 6
    # Glisser un soutien de la main dans Play = le jouer (coût déduit) ; piocher jusqu'à en avoir un ; il faut assez de ressources.
    for _ in range(12):
        if a13.locator("#main .eventail .carte.kind-asset").count(): break
        a13.locator(".pioche-joueur .dos-bouton").click(); a13.wait_for_timeout(300)
    for _ in range(5): a13.locator("#entete .chip-compteur").first.locator(".pm").nth(1).click(); a13.wait_for_timeout(120)
    src = a13.locator("#main .eventail .carte.kind-asset").first.bounding_box(); zone = a13.locator(".zone-jeu").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(zone["x"] + 300, zone["y"] + 60, steps=12); a13.mouse.up(); a13.wait_for_timeout(500)
    assert a13.locator(".zone-jeu .carte").count() == 2, "soutien mis en jeu par glisser"
    # Entretien depuis la table : Alice pioche 1 et gagne 1 ressource.
    main_avant = a13.locator("#main .eventail .carte").count()
    res_avant = int(a13.locator("#entete .chip-compteur").first.locator(".valeur").inner_text())
    for _ in range(4):
        if "Entretien" in h13.locator("#phases .phase.courante").inner_text(): break
        h13.get_by_role("button", name="Phase suivante").click(); h13.wait_for_timeout(400)
    a13.wait_for_timeout(600)
    assert a13.locator("#main .eventail .carte").count() == main_avant + 1, "entretien : +1 carte"
    assert int(a13.locator("#entete .chip-compteur").first.locator(".valeur").inner_text()) == res_avant + 1, "entretien : +1 ressource"
    a13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    a13.screenshot(path=f"{OUT}/65_board_apres_entretien.png")

    # ---- Board joueur, étape 3 : jouer par glisser (coût déduit), engager au test (Commit), « Test résolu »,
    #      « Poser sur mon lieu » et retour depuis le tapis ----
    a13.on("dialog", lambda d: d.accept("1") if d.type == "prompt" else d.accept())
    for _ in range(12):
        if a13.locator("#main .eventail .carte.kind-asset").count(): break
        a13.locator(".pioche-joueur .dos-bouton").click(); a13.wait_for_timeout(300)
    soutien = a13.locator("#main .eventail .carte.kind-asset").first
    titre_soutien = soutien.get_attribute("title")
    nb_jeu = a13.locator(".zone-jeu .carte").count()
    for _ in range(5): a13.locator("#entete .chip-compteur").first.locator(".pm").nth(1).click(); a13.wait_for_timeout(120)
    src = soutien.bounding_box(); zone = a13.locator(".zone-jeu").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(zone["x"] + 420, zone["y"] + 40, steps=12); a13.mouse.up(); a13.wait_for_timeout(600)
    assert a13.locator(".zone-jeu .carte").count() == nb_jeu + 1, "soutien posé par glisser (sans payer)"
    assert "sans payer" in h13.locator("#journal").inner_text(), "le journal de la table consigne la pose sans paiement"
    # Auto-pay : le bouton « AP » d'une carte de la main paie et range la carte selon son type.
    for _ in range(12):
        if a13.locator("#main .eventail .carte.kind-asset").count(): break
        a13.locator(".pioche-joueur .dos-bouton").click(); a13.wait_for_timeout(300)
    ap_carte = a13.locator("#main .eventail .carte.kind-asset").first
    titre_ap = ap_carte.get_attribute("title")
    ap_carte.hover(); a13.wait_for_timeout(150)
    ap_carte.locator(".ap").click(); a13.wait_for_timeout(600)
    assert a13.locator(f".zone-jeu .carte[title='{titre_ap}']").count() == 1, "AP : la carte est en jeu"
    assert "joue" in h13.locator("#journal").inner_text(), "le journal de la table consigne le jeu de la carte (AP)"
    uses = a13.locator(f".zone-jeu .carte[title='{titre_soutien}'] .chip-uses")
    if uses.count():
        assert "/img/tokens/" in (uses.first.locator("img").get_attribute("src") or ""), "jauge Uses du type de la carte (images fournies)"
        avant_uses = int(uses.first.locator(".chip-n").inner_text())
        uses.first.click(); a13.wait_for_timeout(400)
        assert int(a13.locator(f".zone-jeu .carte[title='{titre_soutien}'] .chip-uses .chip-n").inner_text()) == avant_uses - 1, "clic sur la jauge Uses = −1"
    src = a13.locator("#main .eventail .carte").first.bounding_box(); cours = a13.locator(".bloc-cours .bande").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(cours["x"] + 60, cours["y"] + 40, steps=12); a13.mouse.up(); a13.wait_for_timeout(600)
    assert a13.locator(".bloc-cours .carte").count() == 1, "carte engagée au test (Commit)"
    h13.wait_for_timeout(400)
    assert not h13.locator("#commit-volant").is_hidden(), "le Commit volant apparaît sur le tapis dès qu'une carte est engagée"
    assert h13.locator("#commit-volant .carte").count() == 1, "la carte engagée est visible dans le Commit volant"
    assert h13.locator("#sieges .lien-board").first.get_attribute("target").startswith("ahwa-board-"), "un seul onglet par board"
    h13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h13.screenshot(path=f"{OUT}/69_tapis_commit_volant.png")
    # Un événement de la main dans la case Play (une carte), puis « Résolu » → défausse.
    for _ in range(12):
        if a13.locator("#main .eventail .carte.kind-event").count(): break
        a13.locator(".pioche-joueur .dos-bouton").click(); a13.wait_for_timeout(300)
    for _ in range(4): a13.locator("#entete .chip-compteur").first.locator(".pm").nth(1).click(); a13.wait_for_timeout(120)
    src = a13.locator("#main .eventail .carte.kind-event").first.bounding_box(); case = a13.locator(".case-play").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(case["x"] + 50, case["y"] + 60, steps=12); a13.mouse.up(); a13.wait_for_timeout(600)
    assert a13.locator(".case-play .carte").count() == 1, "événement posé dans Play (sans payer)"
    assert a13.locator("#mon-lieu .lieu-carte .carte").count() == 1, "mon lieu, à droite"
    h13.wait_for_timeout(400)
    assert h13.locator("#sieges .play-siege .case-play .carte").count() == 1, "la case Play du siège, à côté de la menace, montre l'événement"
    # Depuis la pioche : la première carte, face cachée, en jeu.
    src = a13.locator(".pioche-joueur .dos-bouton").bounding_box(); zone = a13.locator(".zone-jeu").bounding_box()
    a13.mouse.move(src["x"] + src["width"] / 2, src["y"] + src["height"] / 2); a13.mouse.down()
    a13.mouse.move(zone["x"] + 600, zone["y"] + 40, steps=12); a13.mouse.up(); a13.wait_for_timeout(500)
    assert a13.locator(".zone-jeu .carte.retournee").count() == 1, "carte de la pioche posée face cachée en jeu"
    a13.mouse.move(8, 8); a13.wait_for_timeout(200)
    a13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    a13.screenshot(path=f"{OUT}/66_board_jouer_engager.png")
    a13.get_by_role("button", name="Résolu", exact=True).click(); a13.wait_for_timeout(500)
    assert a13.locator(".case-play .carte").count() == 0, "événement résolu → défausse"
    a13.get_by_role("button", name="Test résolu").click(); a13.wait_for_timeout(500)
    assert a13.locator(".bloc-cours .carte").count() == 0, "test résolu : Commit → défausse"
    h13.wait_for_timeout(400)
    assert h13.locator("#commit-volant").is_hidden(), "le Commit volant disparaît une fois le test résolu"
    nb_avant_pose = a13.locator(".zone-jeu .carte").count()
    a13.locator(f".zone-jeu .carte[title='{titre_soutien}']").dispatch_event("contextmenu"); a13.wait_for_selector(".menu-carte")
    a13.locator(".menu-carte").get_by_role("button", name="Poser sur mon lieu (tapis)").click(); a13.wait_for_timeout(600)
    assert a13.locator(".zone-jeu .carte").count() == nb_avant_pose - 1, "la carte a quitté le board"
    h13.wait_for_timeout(400)
    assert h13.locator(f"#plateau .carte[title='{titre_soutien}']").count() == 1, "la carte est sur le tapis"
    h13.evaluate("document.querySelectorAll('#rappels .encart').forEach((e) => e.remove())")
    h13.screenshot(path=f"{OUT}/67_tapis_carte_joueur_posee.png")
    h13.locator(f"#plateau .carte[title='{titre_soutien}']").dispatch_event("contextmenu"); h13.wait_for_selector(".menu-carte")
    h13.screenshot(path=f"{OUT}/68_tapis_menu_carte_joueur.png")
    h13.locator(".menu-carte").get_by_role("button", name="Reprendre sur le board de Alice").click(); h13.wait_for_timeout(600)
    assert a13.locator(".zone-jeu .carte").count() == nb_avant_pose, "retour sur le board depuis le tapis"
    # Loupe sur une carte de la main (retour de test du 2026-09-08).
    a13.locator("#main .eventail .carte").first.hover(); a13.wait_for_timeout(200)
    assert a13.locator("#loupe").is_hidden(), "la loupe attend 500 ms"
    a13.wait_for_timeout(700)
    assert not a13.locator("#loupe").is_hidden(), "la loupe s'ouvre sur une carte de la main"
    # Pions des cartes joueur : pastille du nombre et ± au survol ; sac et « Phase suivante » sous « Mon lieu ».
    assert a13.locator(".mon-lieu #chaos .sac-forme").count() == 1 and a13.locator("#entete #phase-suivante").count() == 1, "sac à droite, Phase suivante dans l'entête"
    jauge = a13.locator(".zone-jeu .carte.joueur .chip-uses").first
    if jauge.count():
        avant = int(jauge.locator(".chip-n").inner_text())
        jauge.hover(); a13.wait_for_timeout(200)
        jauge.locator(".chip-plus").click(); a13.wait_for_timeout(400)
        assert int(a13.locator(".zone-jeu .carte.joueur .chip-uses").first.locator(".chip-n").inner_text()) == avant + 1, "« + » de la jauge Uses au survol"
    browser.close()

if erreurs:
    print("MESSAGES CONSOLE :")
    for e in erreurs: print(" ", e)
print("captures dans", OUT)
