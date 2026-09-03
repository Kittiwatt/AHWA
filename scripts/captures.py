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
    alice.locator("#pioches .pile").nth(0).click(button="right")
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
    alice.locator("#pioches .pile").nth(1).click(button="right")
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
    alice.locator("#pioches .pile").nth(1).click(button="right")
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
    alice.wait_for_timeout(500)
    generee = alice.locator("#sieges .siege").nth(0).locator(".menace .carte[data-id^='gen-']")
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
    hote.locator("#histoire .carte.kind-agenda").hover(); hote.wait_for_timeout(400)
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
    browser.close()

if erreurs:
    print("MESSAGES CONSOLE :")
    for e in erreurs: print(" ", e)
print("captures dans", OUT)
