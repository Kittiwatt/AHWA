# Instructions de travail — Anofelis Web (AHWA)

Application web publique pour jouer aux scénarios d'Horreur à Arkham
JCE : une bibliothèque de scénarios et, pour chacun, une room
multijoueur créée avec un code et partagée aux joueurs. La mise en
place est automatisée, certaines actions de jeu aussi ; la résolution
des effets de cartes reste aux joueurs. Front statique + Cloudflare
Workers, un Durable Object par room (état serveur autoritaire,
WebSocket hibernant, persistance SQLite), plan gratuit.

**Le dépôt est la source de vérité.** Début de session : cloner
`github.com/Kittiwatt/AHWA`, lire `docs/ARKHAM_WEB_notes.md` (le mémo
— il fait foi : conventions, décisions, pièges, avancement, points
ouverts). Avant d'écrire ou de modifier un `*.src.json` :
`docs/GRAMMAIRE_SCENARIOS.md` (fait foi pour le format).
`docs/ARCHIVE_livraisons.md` (récits des livraisons passées) ne se lit
qu'au besoin — le tableau du mémo §0 l'indexe.

## Règles

- Tout en français. **Jamais de spoiler** : d'un guide de campagne, ne
  lire que la section Setup et le diagramme de placement — ni
  résolutions ni interludes, sauf instruction explicite de
  l'utilisateur quand un report au lobby l'exige. **Scénarios
  indépendants** (consigne du 2026-09-10) : lire le livret **en
  entier** avant de commencer ; s'il contient plusieurs scénarios, une
  room par scénario et la bibliothèque adaptée ; une room par push, la
  suivante après validation de l'utilisateur (mémo §1). Ne jamais
  reproduire le texte des cartes (ni dans les `log`, ni dans `_source`).
- Ce qui dépend du journal de campagne ou d'un choix reste manuel :
  question au lobby ou rappel au bon moment.
- Poser ses questions avant de coder quand un choix structurel se
  présente ; proposer, ne pas trancher seul. Vérifier toute
  proposition contre le code réel avant de la présenter comme viable.
- Règle « rien n'est jamais bloqué » (cahier §8) : on ne refuse une
  action que pour intégrité, jamais parce que « ce n'est pas le
  moment ».
- Économiser les messages WebSocket et les écritures (limites du plan
  gratuit) dès le premier prototype.

## Cycle de livraison

1. `node scripts/build.mjs` puis `npm run check` — zéro erreur.
2. `npx wrangler dev` (vérifier par `curl`, jamais `ss`) +
   `node scripts/test_room.mjs` avec le bloc de tests de la livraison ;
   `python3 scripts/captures.py` (vérification visuelle) ; régression
   sur un scénario déjà livré.
3. Docs mis à jour **dans le même commit** : entrée de récit + ligne
   de tableau au mémo §0 ; rotation du plus ancien récit récent vers
   l'archive (son durable versé d'abord : format → grammaire, piège →
   mémo §5, décision → §1, point ouvert → §7) ; grammaire si nouvelle
   op ou option.
4. **Un commit unique** (code + données + docs) poussé sur `main` ;
   communiquer le SHA à l'utilisateur. Vérifier le déploiement :
   check-runs du commit via l'API GitHub (avec le token — le quota
   anonyme s'épuise vite), ou `curl` d'un fichier modifié sur le site.
   Un push n'est pas une livraison tant que le site ne sert pas le
   nouveau code ; Workers Builds peut échouer sans cause dans le dépôt
   (mémo §5 : relancer par un commit vide).

## Token GitHub

Fourni par les instructions du projet claude.ai (fine-grained, limité
au dépôt AHWA, Contents : Read and write). **Ne jamais l'écrire dans
le dépôt** — il est public, le secret scanning de GitHub le
révoquerait — ni dans aucun fichier commité ou livré. Si le push
échoue (token expiré, réseau) : mode dégradé — livrer les fichiers
modifiés avec leurs chemins, l'utilisateur committera.
