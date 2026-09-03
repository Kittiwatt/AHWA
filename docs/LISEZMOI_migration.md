# Kit de migration → nouveau projet « Anofelis Web »

Contenu à déposer dans les connaissances du nouveau projet :

1. `ARKHAM_WEB_notes.md` — mémo faisant foi (hébergement décidé,
   conventions, acquis ArkhamDB, pièges, thèmes du questionnaire).
2. `INSTRUCTIONS_PROJET.md` — à coller dans « Instructions du projet ».
3. `scenarios_data.json` — 10 scénarios extraits de Build_Scenario.py :
   codes par rôle, sets de rencontre, topologie des diagrammes,
   résumé du setup, popups (= étapes manuelles à automatiser),
   commentaires du code. Coordonnées PCIO marquées `layout_pcio`.
4. `AHLCG_livrets_regles_FFG.md` — règles (inchangé).
5. `tokens/` — les 5 jetons PNG (Doom, Indices, Dégâts, Horreur,
   Ressources), extraits de tokens_data.py.

Non migrés (spécifiques PCIO) : Build_Scenario.py, build_room.py,
validate_pcio.py, tokens_data.py, index.html/test_core.js/
build_deck_csv.py (fabrique de CSV PCIO ; ses fonctions ArkhamDB/CDN
sont résumées dans le mémo §3 et pourront être reportées à la demande).
