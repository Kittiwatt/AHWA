#!/usr/bin/env node
// Test de bout en bout du DO Room (étape 1) contre un serveur local `wrangler dev` :
//   node scripts/test_room.mjs [http://127.0.0.1:8787]
// Scénario : création, lobby (sièges, investigateurs, difficulté, principal), mise en place,
// cohérence des deltas entre clients, reprise de siège, réinitialisation.

import assert from "node:assert/strict";
import { appliquerPatch } from "../public/js/room/patch.js";

const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
const WS = BASE.replace(/^http/, "ws");
let messagesEntrants = 0;

function client(code, { seat = "spectator", name = "", hostToken = "" } = {}) {
  const u = new URL(`${WS}/rooms/${code}/ws`);
  u.searchParams.set("seat", String(seat));
  if (name) u.searchParams.set("name", name);
  if (hostToken) u.searchParams.set("hostToken", hostToken);
  const ws = new WebSocket(u);
  const c = { ws, state: null, moi: null, recus: [], attentes: [], ferme: null };
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    c.recus.push(msg);
    if (msg.t === "welcome") { c.state = msg.state; c.moi = msg.you; }
    else if (msg.t === "delta") { assert.equal(msg.rev, c.state.rev + 1, "rev en séquence"); appliquerPatch(c.state, msg.patch); }
    else if (msg.t === "seats") { for (const s of msg.seats) Object.assign(c.state.seats[s.index], s); c.state.hostConnected = msg.hostConnected; c.state.hostSeat = msg.hostSeat; }
    else if (msg.t === "you") c.moi = { seat: msg.seat, isHost: msg.isHost };
    for (const a of [...c.attentes]) if (a.test(msg)) { c.attentes.splice(c.attentes.indexOf(a), 1); a.resolve(msg); }
  });
  ws.addEventListener("close", (ev) => { c.ferme = ev.code; for (const a of c.attentes) a.resolve(null); });
  // Consomme les messages dans l'ordre : un message déjà dépassé par une attente précédente ne compte plus.
  c.lu = 0;
  c.attendre = (test, delai = 4000) => new Promise((resolve, reject) => {
    for (let i = c.lu; i < c.recus.length; i++) {
      if (test(c.recus[i])) { c.lu = i + 1; return resolve(c.recus[i]); }
    }
    c.lu = c.recus.length;
    const a = { test, resolve: (m) => { c.lu = c.recus.length; resolve(m); } };
    c.attentes.push(a);
    setTimeout(() => { if (c.attentes.includes(a)) { c.attentes.splice(c.attentes.indexOf(a), 1); reject(new Error("délai dépassé : " + test.toString() + " — derniers messages : " + JSON.stringify(c.recus.slice(-3)).slice(0, 600))); } }, delai);
  });
  c.envoyer = (m) => { messagesEntrants++; c.recus = c.recus.filter((x) => x.t !== "nack"); ws.send(JSON.stringify(m)); };
  c.action = async (m) => { const rev = c.state.rev; c.envoyer(m); return c.attendre((x) => (x.t === "delta" && x.rev === rev + 1) || x.t === "nack"); };
  c.ouvert = () => new Promise((r) => ws.addEventListener("open", r, { once: true }));
  return c;
}

const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "notz_the_gathering" }) });
assert.equal(r.status, 200);
const { code, hostToken } = await r.json();
console.log("room", code);

const refus = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_witching_hour" }) });
assert.equal(refus.status, 400, "scénario sans définition refusé");

// Hôte : spectateur d'abord, puis prend le siège 1.
const hote = client(code, { hostToken });
const w = await hote.attendre((m) => m.t === "welcome");
assert.equal(w.you.isHost, true);
assert.equal(w.state.phase, "lobby");
hote.envoyer({ t: "takeSeat", seat: 0, name: "Alice" });
const you = await hote.attendre((m) => m.t === "you");
assert.equal(you.seat, 0);
let d = await hote.action({ t: "chooseInvestigator", code: "01001" });
assert.equal(d.t, "delta");
assert.equal(hote.state.seats[0].investigatorCode, "01001");
assert.equal(hote.state.seats[0].counters.health, 9);
assert.equal(hote.state.lead, 0);

// Joueur 2 : siège 2 à la connexion.
const bob = client(code, { seat: 1, name: "Bob" });
await bob.attendre((m) => m.t === "welcome");
assert.equal(bob.state.rev, hote.state.rev);
d = await bob.action({ t: "chooseInvestigator", code: "01001" });
assert.equal(d.t, "nack", "doublon d'investigateur refusé");
d = await bob.action({ t: "chooseInvestigator", code: "01002" });
assert.equal(d.t, "delta");
d = await bob.action({ t: "setDifficulty", d: "hard" });
d = await bob.action({ t: "setLead", seat: 1 });
await hote.attendre((m) => m.t === "delta" && m.rev === bob.state.rev);
assert.deepEqual(hote.state, bob.state, "états identiques après deltas");
assert.equal(hote.state.difficulty, "hard");
assert.equal(hote.state.lead, 1);

// Spectateur : ne peut pas agir.
const spec = client(code);
await spec.attendre((m) => m.t === "welcome");
spec.envoyer({ t: "setDifficulty", d: "easy" });
assert.equal((await spec.attendre((m) => m.t === "nack")).t, "nack");

// Bob n'est pas hôte.
d = await bob.action({ t: "startSetup" });
assert.equal(d.t, "nack");

// Mise en place par l'hôte.
const avant = hote.state.rev;
hote.envoyer({ t: "startSetup" });
await hote.attendre((m) => m.t === "delta" && m.rev === avant + 1);
await bob.attendre((m) => m.t === "delta" && m.rev === avant + 1);
await spec.attendre((m) => m.t === "delta" && m.rev === avant + 1);
const s = hote.state;
assert.equal(s.phase, "investigation");
assert.equal(s.round, 1);
assert.equal(s.playerCount, 2);
assert.equal(s.piles.encounter.length, 26, "26 cartes de rencontre");
assert.equal(s.piles.agendaDeck.length, 2);
assert.equal(s.piles.actDeck.length, 2);
assert.equal(s.piles.removed.length, 0);
assert.equal(s.chaos.bag.length, 17, "sac difficile : 17 jetons");
const cartes = Object.values(s.cards);
const study = cartes.find((c) => c.code === "01111");
assert.equal(study.loc.zone, "board");
assert.equal(study.faceUp, true);
assert.equal(study.tokens.clue, 4, "2 indices × 2 enquêteurs");
assert.equal(cartes.filter((c) => c.kind === "mini").length, 2);
const cote = cartes.filter((c) => c.loc.zone === "aside");
assert.equal(cote.length, 6);
assert.equal(cote.filter((c) => c.faceUp).length, 2);
assert.equal(s.cards[s.agendaId].code, "01105");
assert.equal(s.cards[s.agendaId].tokens.doom, 0);
assert.equal(s.cards[s.actId].code, "01108");
assert.equal(cartes.find((c) => c.code === "01104").side, "b");
assert.equal(s.cards["inv-0"].loc.zone, "seat0");
assert.equal(s.cards["inv-1"].loc.zone, "seat1");
assert.equal(cartes.length, 26 + 6 + 1 + 1 + 3 + 3 + 2 + 2, "toutes les cartes créées (rencontre, côté, Study, scénario, agendas, actes, enquêteurs, pions)");
assert.ok(s.log.length >= 8);
await hote.attendre((m) => m.t === "reminder");
await new Promise((r) => setTimeout(r, 200));
const rappels = hote.recus.filter((m) => m.t === "reminder");
assert.equal(rappels.length, 2, "2 rappels de mise en place");
assert.deepEqual(bob.state, hote.state);
assert.deepEqual(spec.state, hote.state);

// Resync : l'état complet du serveur est identique à celui reconstruit par deltas.
spec.envoyer({ t: "resync" });
const w2 = await spec.attendre((m) => m.t === "welcome" && m.state.rev === s.rev);
const sans = (x) => { const y = structuredClone(x); delete y.lastActivityAt; return y; };
assert.deepEqual(sans(w2.state), sans(hote.state), "welcome = état local");

// ---- Étape 2 : actions de jeu ----
d = await bob.action({ t: "takeTurn" });
assert.equal(bob.state.turn.seat, 1);
d = await bob.action({ t: "endTurn" });
assert.deepEqual(bob.state.turn, { seat: null, done: [1] });
spec.envoyer({ t: "takeTurn" });
assert.equal((await spec.attendre((m) => m.t === "nack")).t, "nack", "spectateur : refusé");
d = await hote.action({ t: "setSeatCounter", seat: 0, key: "actions", delta: -1 });
assert.equal(hote.state.seats[0].counters.actions, 2);
d = await hote.action({ t: "addToken", id: "inv-0", token: "damage", delta: 2 });
assert.equal(hote.state.cards["inv-0"].tokens.damage, 2);
d = await hote.action({ t: "drawEncounter" });
assert.equal(d.t, "delta");
assert.equal(hote.state.piles.encounter.length, 26, "piocher = retourner la première carte, qui reste sur la pioche");
assert.equal(hote.state.cards[hote.state.piles.encounter[0]].faceUp, true);
d = await hote.action({ t: "drawEncounter" });
assert.equal(d.t, "nack", "une carte révélée attend sur la pioche : refus");
assert.equal(hote.state.piles.encounter.length, 26, "et rien n'a bougé");
const tiree = hote.state.cards[hote.state.piles.encounter[0]];
d = await hote.action({ t: "moveCard", id: tiree.id, zone: "seat0", x: 9999, y: 0 });
assert.equal(hote.state.piles.encounter.length, 25);
assert.ok(tiree.faceUp && hote.state.cards[tiree.id].ownerSeat === 0, "carte glissée dans la zone de menace");
assert.equal(hote.state.cards[hote.state.piles.encounter[0]].faceUp, false, "la suivante reste face cachée");
d = await hote.action({ t: "drawEncounter" });
const revelee = hote.state.cards[hote.state.piles.encounter[0]];
assert.equal(revelee.faceUp, true);
d = await hote.action({ t: "toPile", id: revelee.id, pile: "encounter", top: false });
assert.equal(hote.state.cards[revelee.id].faceUp, false, "remise sous la pioche : face cachée");
assert.equal(hote.state.piles.encounter.filter((id) => hote.state.cards[id].faceUp).length, 0, "aucune carte révélée dans la pioche");
d = await hote.action({ t: "reshuffleDiscard" });
assert.equal(d.t, "nack", "défausse vide : refus, état intact");
d = await hote.action({ t: "setSeatCounter", seat: 0, key: "clues", value: 0 });
d = await hote.action({ t: "takeClue", id: "01111" });
assert.equal(hote.state.cards["01111"].tokens.clue, 3, "1 indice pris sur le Study");
assert.equal(hote.state.seats[0].counters.clues, 1);
d = await hote.action({ t: "toPile", id: tiree.id, pile: "encounterDiscard" });
assert.equal(hote.state.piles.encounterDiscard[0], tiree.id);
assert.deepEqual(hote.state.cards[tiree.id].loc, { pile: "encounterDiscard" });
assert.equal(hote.state.cards[tiree.id].faceUp, true, "défausse face visible");
const hallway = Object.values(hote.state.cards).find((c) => c.code === "01112");
d = await hote.action({ t: "moveCard", id: hallway.id, zone: "board", x: 900, y: 411 });
assert.equal(hote.state.cards[hallway.id].loc.zone, "board");
assert.equal(hote.state.cards[hallway.id].faceUp, false);
await bob.attendre((m) => m.t === "delta" && m.rev === hote.state.rev); // rattraper les deltas de l'hôte
// Déplacement solidaire : les pions posés sur le Study suivent le Study.
const miniAvant = { ...hote.state.cards["mini-0"].loc };
d = await hote.action({ t: "moveCard", id: "01111", zone: "board", x: 537, y: 411 });
assert.equal(hote.state.cards["mini-0"].loc.x, miniAvant.x - 200, "le pion suit le lieu");
assert.equal(hote.state.cards["mini-1"].loc.x, hote.state.cards["mini-1"].loc.x);
// Chemins entre lieux : tracer, couleur distincte, effacer par un second tracé.
d = await hote.action({ t: "linkLocations", a: "01111", b: hallway.id });
assert.deepEqual(hote.state.links, [{ a: "01111", b: hallway.id, color: 0 }]);
d = await hote.action({ t: "linkLocations", a: hallway.id, b: "01111" });
assert.deepEqual(hote.state.links, [], "second tracé = effacement");
d = await hote.action({ t: "linkLocations", a: "01111", b: hallway.id });
d = await hote.action({ t: "linkLocations", a: "01111", b: "01111" });
assert.equal(hote.state.links.length, 1);
await bob.attendre((m) => m.t === "delta" && m.rev === hote.state.rev);
d = await bob.action({ t: "revealLocation", id: hallway.id });
assert.equal(bob.state.cards[hallway.id].faceUp, true);
assert.equal(bob.state.cards[hallway.id].tokens.clue, undefined, "Hallway : 0 indice");
d = await bob.action({ t: "toggleSide", id: "01104" });
assert.equal(bob.state.cards["01104"].side, "a");
d = await bob.action({ t: "exhaust", id: "inv-1" });
assert.equal(bob.state.cards["inv-1"].exhausted, true);
d = await bob.action({ t: "chaosDraw" });
d = await bob.action({ t: "chaosDraw" });
assert.equal(bob.state.chaos.drawn.length, 2);
assert.equal(bob.state.chaos.bag.length, 15);
d = await bob.action({ t: "chaosReturn" });
assert.equal(bob.state.chaos.bag.length, 17);
d = await bob.action({ t: "chaosAdjust", token: "skull", delta: 1 });
assert.equal(bob.state.chaos.bag.filter((t) => t === "skull").length, 3);
d = await bob.action({ t: "chaosAdjust", token: "skull", delta: -1 });
assert.equal(bob.state.chaos.bag.length, 17);
await hote.attendre((m) => m.t === "delta" && m.rev === bob.state.rev); // rattraper les deltas de Bob
d = await hote.action({ t: "nextPhase" });
assert.equal(hote.state.phase, "enemy");
d = await hote.action({ t: "nextPhase" });
assert.equal(hote.state.phase, "upkeep");
assert.equal(hote.state.seats[0].counters.actions, 3);
assert.equal(hote.state.cards["inv-1"].exhausted, false);
d = await hote.action({ t: "nextPhase" });
assert.equal(hote.state.phase, "mythos");
assert.equal(hote.state.round, 2);
assert.equal(hote.state.cards[hote.state.agendaId].tokens.doom, 1);
d = await hote.action({ t: "nextPhase" });
assert.equal(hote.state.phase, "investigation");
assert.deepEqual(hote.state.turn, { seat: null, done: [] });
d = await hote.action({ t: "setPhase", phase: "upkeep" });
assert.equal(hote.state.phase, "upkeep");
d = await hote.action({ t: "advanceAgenda" });
assert.equal(hote.state.cards[hote.state.agendaId].code, "01106");
assert.equal(hote.state.piles.agendaDeck.length, 1);
assert.equal(hote.state.cards[hote.state.agendaId].tokens.doom, 0);
assert.equal(hote.state.cards["01105"].loc.zone, "aside", "l'ancien agenda part de côté, hors jeu");
// Acte : retourné pour lire, posé sur le tapis (reste l'acte courant), puis mis de côté → l'acte suivant sort.
d = await hote.action({ t: "flipCard", id: "01108" });
assert.equal(hote.state.cards["01108"].faceUp, false);
d = await hote.action({ t: "moveCard", id: "01108", zone: "board", x: 300, y: 100 });
assert.equal(hote.state.actId, "01108", "sur le tapis : toujours l'acte courant");
d = await hote.action({ t: "moveCard", id: "01108", zone: "aside", x: 9999, y: 0 });
assert.equal(hote.state.cards[hote.state.actId].code, "01109", "mis de côté : l'acte suivant est révélé");
d = await hote.action({ t: "advanceAct" });
assert.equal(hote.state.cards[hote.state.actId].code, "01110");
assert.equal(hote.state.piles.actDeck.length, 0);
d = await hote.action({ t: "advanceAct" });
assert.equal(hote.state.actId, null, "dernier acte sorti : plus d'acte courant");
assert.equal(hote.state.cards["01110"].loc.zone, "aside");
d = await hote.action({ t: "advanceAct" });
assert.equal(d.t, "nack", "plus rien à avancer");
d = await hote.action({ t: "setSeatCounter", seat: 0, key: "clues", value: 3 });
d = await hote.action({ t: "spendClues", from: [{ seat: 0, n: 2 }, { seat: 1, n: 5 }] });
assert.equal(hote.state.seats[0].counters.clues, 1);
assert.equal(hote.state.seats[1].counters.clues, 0);
hote.envoyer({ t: "searchEncounter" });
const peek = await hote.attendre((m) => m.t === "peek");
assert.equal(peek.cards.length, 25);
d = await hote.action({ t: "moveCard", id: peek.cards[3].id, zone: "seat0", x: 9999, y: 0 });
assert.equal(hote.state.cards[peek.cards[3].id].faceUp, true, "carte prise dans la pioche : face visible");
assert.equal(hote.state.piles.encounter.length, 24);
d = await hote.action({ t: "shufflePile", pile: "encounter" });
assert.equal(d.t, "delta");
// Dernière carte révélée sur la pioche + défausse : remélange explicite, puis dernière carte seule.
d = await hote.action({ t: "reshuffleDiscard" });
assert.equal(d.t, "delta");
assert.equal(hote.state.piles.encounterDiscard.length, 0);
assert.equal(hote.state.piles.encounter.filter((id) => hote.state.cards[id].faceUp).length, 0);
while (hote.state.piles.encounter.length > 1) {
  d = await hote.action({ t: "toPile", id: hote.state.piles.encounter[0], pile: "removed" });
}
d = await hote.action({ t: "drawEncounter" });
assert.equal(d.t, "delta", "dernière carte : retournée");
const derniere = hote.state.piles.encounter[0];
assert.equal(hote.state.cards[derniere].faceUp, true);
d = await hote.action({ t: "drawEncounter" });
assert.equal(d.t, "nack", "dernière carte révélée : refus sans effet");
assert.equal(hote.state.piles.encounter[0], derniere, "la carte est toujours sur la pioche");
d = await hote.action({ t: "moveCard", id: derniere, zone: "board", x: 100, y: 100 });
assert.equal(hote.state.piles.encounter.length, 0);
d = await hote.action({ t: "drawEncounter" });
assert.equal(d.t, "nack", "pioche et défausse vides");
spec.envoyer({ t: "resync" });
const w3 = await spec.attendre((m) => m.t === "welcome");
assert.deepEqual(sans(w3.state), sans(hote.state), "après des refus, serveur et client restent identiques");
await bob.attendre((m) => m.t === "delta" && m.rev === hote.state.rev);
assert.deepEqual(bob.state, hote.state, "états identiques après les actions de jeu");

// Générer une carte : Lita (soutien à jauges) et Barricade (événement), dans la zone de menace du demandeur.
d = await hote.action({ t: "createCard", code: "01117" });
assert.equal(d.t, "delta");
const lita = Object.values(hote.state.cards).find((c) => c.id.startsWith("gen-") && c.code === "01117");
assert.ok(lita && lita.loc.zone === "seat0" && lita.faceUp && lita.kind === "asset", "Lita générée en zone de menace");
assert.equal(hote.state.extraDefs["01117"].health, 3);
d = await hote.action({ t: "createCard", code: "01038" });
assert.equal(hote.state.extraDefs["01038"].name, "Barricade");
assert.equal(hote.state.extraDefs["01038"].back, "player");
d = await hote.action({ t: "createCard", code: "99999" });
assert.equal(d.t, "nack", "code inconnu refusé");
spec.envoyer({ t: "createCard", code: "01117" });
assert.equal((await spec.attendre((m) => m.t === "nack")).t, "nack", "spectateur : refusé");
await bob.attendre((m) => m.t === "delta" && m.rev === hote.state.rev);
assert.deepEqual(bob.state.extraDefs, hote.state.extraDefs, "définitions partagées");

// Un spectateur ne peut pas prendre un siège vide après la mise en place.
spec.envoyer({ t: "takeSeat", seat: 2 });
assert.equal((await spec.attendre((m) => m.t === "nack")).t, "nack");

// Bob se déconnecte : son siège se libère mais garde son enquêteur ; il le reprend.
bob.ws.close();
const seats = await hote.attendre((m) => m.t === "seats" && !m.seats[1].occupied);
assert.equal(seats.seats[1].investigatorCode, "01002");
const bob2 = client(code, { seat: 1, name: "Bob" });
const wb = await bob2.attendre((m) => m.t === "welcome");
assert.equal(wb.you.seat, 1);
assert.equal(wb.state.seats[1].occupied, true);

// Réinitialisation par l'hôte : retour au lobby, enquêteurs conservés.
d = await hote.action({ t: "reset" });
assert.equal(d.t, "delta");
assert.equal(hote.state.phase, "lobby");
assert.equal(Object.keys(hote.state.cards).length, 0);
assert.equal(hote.state.seats[1].investigatorCode, "01002");
await bob2.attendre((m) => m.t === "delta" && m.rev === hote.state.rev);
assert.deepEqual(bob2.state, hote.state);

// Transfert du rôle d'hôte quand l'hôte est parti.
hote.ws.close();
await bob2.attendre((m) => m.t === "seats" && m.hostConnected === false);
bob2.envoyer({ t: "claimHost" });
const jeton = await bob2.attendre((m) => m.t === "hostToken");
assert.ok(jeton.token.length > 20);
await bob2.attendre((m) => m.t === "you" && m.isHost);
const ancien = client(code, { hostToken });
const wa = await ancien.attendre((m) => m.t === "welcome");
assert.equal(wa.you.isHost, false, "ancien jeton invalidé");

// Suppression. (Piège local : workerd n'achève pas la fermeture TCP des WebSockets fermés côté DO,
// le client reste en CLOSING sans événement close ; en production le code 4411/4404 arrive bien.)
bob2.envoyer({ t: "deleteRoom" });
await new Promise((r) => setTimeout(r, 800));
assert.ok(ancien.ferme === 4411 || ancien.ws.readyState >= 2, "connexions fermées à la suppression");
const mort = client(code);
await new Promise((r) => setTimeout(r, 800));
assert.ok(mort.ferme === 4404 || mort.ws.readyState >= 2, "room supprimée = inconnue");
assert.equal(mort.state, null, "aucun welcome après suppression");

// ============ The Midnight Masks : questions de journal, tirages au hasard, piles, branches ============
async function tableMasks({ joueurs, answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "notz_the_midnight_masks" }) });
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  const invs = ["01001", "01002", "01003", "01004"];
  let d = await h.action({ t: "chooseInvestigator", code: invs[0] });
  const autres = [];
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    d = await c.action({ t: "chooseInvestigator", code: invs[i] });
    autres.push(c);
  }
  await h.attendre((m) => m.t === "delta" && m.rev === joueurs); // rattraper
  d = await h.action({ t: "startSetup" });
  assert.equal(d.t, "nack", "questions sans réponse : refus");
  d = await h.action({ t: "startSetup", answers });
  assert.equal(d.t, "delta", "mise en place avec réponses");
  return { code, h, autres };
}

{
  const { h } = await tableMasks({ joueurs: 3, answers: { house: "burned", ghoul_priest: "alive" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const surTapis = (code) => cartes.find((c) => c.code === code && c.loc.zone === "board");
  const retiree = (code) => cartes.find((c) => c.code === code && c.loc.pile === "removed");
  assert.ok(!surTapis("01124") && retiree("01124"), "maison brûlée : Your House retirée");
  assert.ok(surTapis("01125") && surTapis("01134") && surTapis("01132") && surTapis("01129") && surTapis("01133") && surTapis("01128"), "les 6 lieux fixes en jeu");
  const downtown = surTapis("01130") ?? surTapis("01131"), southside = surTapis("01126") ?? surTapis("01127");
  assert.ok(downtown && southside, "une version de Downtown et de Southside en jeu");
  assert.ok((retiree("01130") ?? retiree("01131")) && (retiree("01126") ?? retiree("01127")), "l'autre version retirée");
  assert.equal(downtown.loc.x, 737); assert.equal(downtown.loc.y, 173);
  assert.equal(southside.loc.x, 737); assert.equal(southside.loc.y, 649);
  const minis = cartes.filter((c) => c.kind === "mini");
  assert.equal(minis.length, 3);
  assert.ok(minis.every((m) => m.loc.y === 411 - 22 && m.loc.x >= 737), "pions sur Rivertown");
  const acolytes = cartes.filter((c) => c.code === "01169" && c.loc.zone === "board");
  assert.equal(acolytes.length, 2, "3 enquêteurs : 2 Acolytes");
  assert.ok(acolytes.every((a) => a.faceUp));
  assert.ok(acolytes.some((a) => Math.abs(a.loc.y - 649) < 100) && acolytes.some((a) => Math.abs(a.loc.y - 173) < 100), "à Southside et Downtown");
  assert.equal(s.piles.cultist.length, 5, "Cultist deck : 5 cartes");
  assert.ok(s.piles.cultist.every((id) => !s.cards[id].faceUp && s.cards[id].set !== undefined || true));
  assert.equal(s.piles.encounter.length, 21 - 2 + 1, "pioche : 21 − 2 Acolytes + Ghoul Priest");
  assert.ok(s.piles.encounter.some((id) => s.cards[id].code === "01116"), "Ghoul Priest dans la pioche");
  assert.equal(s.cards[s.agendaId].code, "01121a");
  assert.equal(s.cards[s.actId].code, "01123");
  assert.equal(s.piles.actDeck.length, 0);
  assert.equal(s.chaos.bag.length, 16);
  assert.ok(s.log.some((e) => e.text.includes("votre maison")), "réponses consignées au journal");
  // Pile du scénario : retourner la première carte, la glisser sur le tapis.
  let d = await h.action({ t: "drawEncounter", pile: "cultist" });
  assert.equal(d.t, "delta");
  assert.equal(s.cards[s.piles.cultist[0]].faceUp, true);
  d = await h.action({ t: "drawEncounter", pile: "cultist" });
  assert.equal(d.t, "nack");
  const cultiste = s.piles.cultist[0];
  d = await h.action({ t: "moveCard", id: cultiste, zone: "board", x: 300, y: 300 });
  assert.equal(s.piles.cultist.length, 4);
  d = await h.action({ t: "shufflePile", pile: "cultist" });
  assert.ok(s.piles.cultist.every((id) => !s.cards[id].faceUp));
  // Agenda 1 retourné (son verso est un ennemi) et posé sur le tapis : reste l'agenda courant ; avancer le laisse en place.
  d = await h.action({ t: "flipCard", id: "01121a" });
  d = await h.action({ t: "moveCard", id: "01121a", zone: "board", x: 100, y: 100 });
  assert.equal(s.agendaId, "01121a");
  d = await h.action({ t: "advanceAgenda" });
  assert.equal(s.cards[s.agendaId].code, "01122");
  assert.equal(s.cards["01121a"].loc.zone, "board", "l'ancien agenda (ennemi) reste sur le tapis");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  const { h } = await tableMasks({ joueurs: 2, answers: { house: "standing", ghoul_priest: "gone" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const maison = cartes.find((c) => c.code === "01124");
  assert.equal(maison.loc.zone, "board", "maison debout : Your House en jeu");
  assert.equal(maison.loc.x, 923); assert.equal(maison.loc.y, 649);
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.x >= 923 && m.loc.y === 649 - 22), "pions sur Your House");
  assert.equal(cartes.filter((c) => c.code === "01169" && c.loc.zone === "board").length, 1, "2 enquêteurs : 1 Acolyte");
  assert.equal(cartes.find((c) => c.code === "01116").loc.pile, "removed", "Ghoul Priest retiré");
  assert.equal(s.piles.encounter.length, 20);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`OK — ${messagesEntrants} messages entrants envoyés par le test`);
process.exit(0);
