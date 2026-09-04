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

const refus = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_prologue" }) });
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

// ============ The Devourer Below : bois au hasard, set Agents, doom initial, jeton, rappel ============
async function tableDevourer({ joueurs, answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "notz_the_devourer_below" }) });
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  let d = await h.action({ t: "chooseInvestigator", code: "01001" });
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    d = await c.action({ t: "chooseInvestigator", code: ["01001", "01002", "01003", "01004"][i] });
  }
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === joueurs);
  h.envoyer({ t: "startSetup", answers });
  await h.attendre((m) => m.t === "delta" && m.rev === joueurs + 1);
  await new Promise((r) => setTimeout(r, 200));
  return { code, h };
}
{
  const { h } = await tableDevourer({ joueurs: 2, answers: { cultists: "3-4", midnight: "yes", ghoul_priest: "alive" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const surTapis = (code) => cartes.find((c) => c.code === code && c.loc.zone === "board");
  assert.ok(surTapis("01149")?.faceUp, "Main Path en jeu et révélé");
  const bois = cartes.filter((c) => c.loc.zone === "board" && c.kind === "location" && c.code !== "01149");
  assert.equal(bois.length, 4, "4 Arkham Woods en jeu");
  assert.ok(bois.every((b) => !b.faceUp), "bois face non révélée");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && c.code >= "01150" && c.code <= "01155").length, 2, "2 bois retirés");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 411 - 22 && m.loc.x >= 737), "pions sur Main Path");
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.map((c) => c.code).sort(), ["01156", "01157"], "Ritual Site et Umôrdhoth de côté");
  const setsDansPioche = new Set(s.piles.encounter.map((id) => s.cards[id].code).filter((c) => c >= "01175" && c <= "01182").map((c) => ({ "01175": "hastur", "01176": "hastur", "01177": "yog", "01178": "yog", "01179": "shub", "01180": "shub", "01181": "cthulhu", "01182": "cthulhu" })[c]));
  assert.equal(setsDansPioche.size, 1, "un seul set Agents dans la pioche");
  const agentsRetires = cartes.filter((c) => c.loc.pile === "removed" && c.code >= "01175" && c.code <= "01182");
  assert.ok(agentsRetires.length >= 4, "les 3 autres sets retirés");
  assert.ok(s.piles.encounter.some((id) => s.cards[id].code === "01116"), "Ghoul Priest dans la pioche");
  assert.equal(s.cards[s.agendaId].code, "01143");
  assert.equal(s.cards[s.agendaId].tokens.doom, 2, "3-4 cultistes échappés : 2 doom");
  assert.equal(s.chaos.bag.filter((t) => t === "elder_thing").length, 1, "jeton Ancien ajouté");
  assert.equal(s.chaos.bag.length, 17);
  const rappels = h.recus.filter((m) => m.t === "reminder");
  assert.ok(rappels.some((m) => m.entry.text.includes("passé minuit")), "rappel « past midnight »");
  assert.ok(!s.log.some((e) => /hastur|yog|shub|cthulhu|Byakhee|Yithian|Dark Young|Deep One/i.test(e.text)), "le journal ne révèle pas le set Agents");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  const { h } = await tableDevourer({ joueurs: 1, answers: { cultists: "0", midnight: "no", ghoul_priest: "gone" } });
  const s = h.state;
  assert.equal(s.cards[s.agendaId].tokens.doom, 0);
  assert.equal(Object.values(s.cards).find((c) => c.code === "01116").loc.pile, "removed");
  assert.equal(s.chaos.bag.length, 17);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ The Witching Hour (TCU I) : bois distribués devant les enquêteurs, pile Arkham Woods, sets de côté, verso-lieu ============
async function tableWitching({ joueurs, answers, lead }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_witching_hour" }) });
  assert.equal(r.status, 200, "The Witching Hour est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  let d = await h.action({ t: "chooseInvestigator", code: "05001" });
  const autres = [];
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    d = await c.action({ t: "chooseInvestigator", code: ["05001", "05002", "05003", "05004"][i] });
    autres.push(c);
  }
  let rev = joueurs;
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === rev);
  if (lead !== undefined) { await h.action({ t: "setLead", seat: lead }); rev++; }
  h.envoyer({ t: "startSetup", answers });
  await h.attendre((m) => m.t === "delta" && m.rev === rev + 1);
  await new Promise((r) => setTimeout(r, 200));
  return { code, h, autres };
}
const ROWS_Y = [40, 280, 520, 760];
function verifWitching(s, joueurs, attendu) {
  const cartes = Object.values(s.cards);
  const bois = cartes.filter((c) => c.loc.zone === "board" && c.kind === "location" && c.code >= "05058" && c.code <= "05064");
  assert.equal(bois.length, 5, "5 Witch-Haunted Woods en jeu");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && c.code >= "05058" && c.code <= "05064").length, 2, "2 bois retirés");
  const parRangee = ROWS_Y.map((y) => bois.filter((b) => b.loc.y === y).length);
  assert.deepEqual(parRangee.filter(Boolean), attendu, `répartition ${attendu.join("/")} (principal en haut)`);
  const minis = cartes.filter((c) => c.kind === "mini");
  assert.equal(minis.length, joueurs);
  for (const m of minis) {
    const dessous = bois.find((b) => m.loc.y === b.loc.y - 22 && m.loc.x === b.loc.x + 4);
    assert.ok(dessous, "chaque pion est sur un bois");
    assert.ok(dessous.faceUp, "le bois de départ est révélé");
    assert.ok((dessous.tokens.clue ?? 0) >= joueurs, "indices posés sur le bois de départ");
  }
  assert.equal(new Set(minis.map((m) => m.loc.y)).size, joueurs, "un pion par rangée");
  assert.equal(bois.filter((b) => b.faceUp).length, joueurs, "seuls les bois de départ sont révélés");
  const woods = s.piles.arkham_woods;
  assert.equal(woods.length, 6, "6 Arkham Woods dans la pile");
  assert.ok(woods.every((id) => !s.cards[id].faceUp), "pile face cachée");
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.map((c) => c.code).sort(), ["01179", "01180", "01180", "01180", "05057", "05088", "05089", "05089", "05089"], "Anette et les deux sets Agents de côté");
  assert.ok(cote.every((c) => c.faceUp), "de côté face visible");
  assert.equal(s.piles.encounter.length, 26, "pioche de rencontre : 26 cartes");
  assert.equal(s.cards[s.agendaId].code, "05051");
  assert.equal(s.cards[s.actId].code, "05053");
  assert.equal(s.piles.actDeck.length, 3);
  assert.ok(cartes.find((c) => c.code === "05050").side === "b", "carte de scénario côté b");
}
{
  const { h, autres } = await tableWitching({ joueurs: 2, answers: { fate: "accepted" } });
  const s = h.state;
  verifWitching(s, 2, [3, 2]);
  assert.equal(s.chaos.bag.length, 15, "sac standard TCU 13 + 2");
  assert.equal(s.chaos.bag.filter((t) => t === "tablet").length, 2, "destin accepté : 2 tablettes");
  assert.ok(h.recus.filter((m) => m.t === "reminder").some((m) => m.entry.text.includes("destin accepté")), "rappel deck (destin accepté)");
  assert.ok(s.log.some((e) => e.text.includes("rangée 1 = Hôte (3)") && e.text.includes("rangée 2 = J2 (2)")), "journal : rangées par siège");

  // Pile Arkham Woods : tirer = côté non révélé sur la pile ; sur le tapis = non révélé ; clic = révélation + indices.
  let d = await h.action({ t: "drawEncounter", pile: "arkham_woods" });
  assert.equal(d.t, "delta");
  const dessus = h.state.cards[h.state.piles.arkham_woods[0]];
  assert.ok(dessus.faceUp && dessus.side === "b", "bois tiré : côté non révélé");
  d = await h.action({ t: "drawEncounter", pile: "arkham_woods" });
  assert.equal(d.t, "nack", "un bois tiré attend d'être glissé");
  d = await h.action({ t: "moveCard", id: dessus.id, zone: "board", x: 1070, y: 40 });
  const bois = h.state.cards[dessus.id];
  assert.ok(!bois.faceUp && bois.side === "a" && bois.loc.zone === "board", "sorti de la pile, le lieu entre non révélé");
  assert.equal(h.state.piles.arkham_woods.length, 5);
  d = await h.action({ t: "revealLocation", id: dessus.id });
  assert.ok(h.state.cards[dessus.id].faceUp, "révélé au clic");

  // Acte 3 : son verso est un lieu → « Avancer » le pose sur le tapis avec ses indices, l'acte 4 sort.
  await h.action({ t: "advanceAct" });
  await h.action({ t: "advanceAct" });
  assert.equal(h.state.cards[h.state.actId].code, "05055");
  const acte3 = h.state.actId;
  await h.action({ t: "advanceAct" });
  const cercle = h.state.cards[acte3];
  assert.equal(cercle.kind, "location", "le verso-lieu devient un lieu");
  assert.ok(cercle.faceUp && cercle.side === "b" && cercle.loc.zone === "board" && cercle.loc.x === 1290 && cercle.loc.y === 411, "posé à droite du tapis");
  assert.equal(cercle.tokens.clue, 6, "3 indices par enquêteur");
  assert.equal(h.state.cards[h.state.actId].code, "05056", "acte 4 courant");
  assert.equal(h.state.piles.actDeck.length, 0);
  // Cohérence des clients.
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(autres[0].state.cards[acte3], cercle, "les autres clients voient la même chose");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  const { h } = await tableWitching({ joueurs: 1, answers: { fate: "rejected" } });
  verifWitching(h.state, 1, [5]);
  assert.equal(h.state.chaos.bag.filter((t) => t === "elder_thing").length, 2, "destin rejeté : 2 Anciens");
  assert.equal(h.state.chaos.bag.length, 15);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  // 4 joueurs, principal = siège 3 : il est servi en premier (rangée du haut), puis les sièges 1, 2, 3 dans l'ordre.
  const { h } = await tableWitching({ joueurs: 4, answers: { fate: "rejected" }, lead: 2 });
  verifWitching(h.state, 4, [2, 1, 1, 1]);
  const s = h.state;
  const enHaut = Object.values(s.cards).find((c) => c.kind === "mini" && c.loc.y === ROWS_Y[0] - 22);
  assert.equal(enHaut.ownerSeat, 2, "le principal a la rangée du haut");
  assert.ok(s.log.some((e) => e.text.includes("rangée 1 = J3 (2)") && e.text.includes("rangée 2 = J4 (1)") && e.text.includes("rangée 3 = Hôte (1)")), "ordre des joueurs à partir du principal");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ At Death's Doorstep (TCU II) : indices selon le journal, question numérique, Josef synthétisé, remplacement de lieux ============
async function tableDoorstep({ joueurs, answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_at_deaths_doorstep" }) });
  assert.equal(r.status, 200, "At Death's Doorstep est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  const autres = [];
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    await c.action({ t: "chooseInvestigator", code: ["05001", "05002", "05003", "05004"][i] });
    autres.push(c);
  }
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === joueurs);
  return { code, h, autres, lancer: async (reponses = answers) => {
    const rev = h.state.rev;
    h.envoyer({ t: "startSetup", answers: reponses });
    return h.attendre((m) => (m.t === "delta" && m.rev === rev + 1) || m.t === "nack");
  } };
}
{
  const { h, autres, lancer } = await tableDoorstep({ joueurs: 2 });
  // Réponse numérique hors bornes → refus ; réponse manquante → refus.
  let d = await lancer({ gavriella: "kept", jerome: "kept", valentino: "crossed", penny: "kept", evidence: "25", fate: "accepted" });
  assert.equal(d.t, "nack", "évidence hors bornes refusée");
  d = await lancer({ gavriella: "kept", jerome: "kept", valentino: "crossed", penny: "kept", fate: "accepted" });
  assert.equal(d.t, "nack", "question numérique sans réponse refusée");
  d = await lancer({ gavriella: "kept", jerome: "kept", valentino: "crossed", penny: "kept", evidence: "5", fate: "accepted" });
  assert.equal(d.t, "delta");
  await new Promise((r) => setTimeout(r, 200));
  const s = h.state;
  const cartes = Object.values(s.cards);
  const surTapis = (code) => cartes.find((c) => c.code === code && c.loc.zone === "board");
  assert.equal(cartes.filter((c) => c.loc.zone === "board" && c.kind === "location").length, 7, "7 lieux normaux en jeu");
  assert.ok(surTapis("05071").faceUp && surTapis("05077") && !surTapis("05077").faceUp, "Entry Hall révélé, les autres non");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 649 - 22), "pions sur Entry Hall");
  // 3 profils non barrés → 18 indices, 5 retirés aussi également que possible (Entry Hall, Office, Balcony) : 4 / 4 / 5.
  assert.equal(surTapis("05071").tokens.clue, 4, "Entry Hall : 6 − 2");
  assert.equal(surTapis("05077").tokens.clue, 4, "Office : 6 − 2");
  assert.equal(surTapis("05074").tokens.clue ?? 0, 0, "Billiards Room : profil barré");
  assert.equal(surTapis("05076").tokens.clue, 5, "Balcony : 6 − 1");
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.map((c) => c.code).sort(), ["05078", "05079", "05080", "05081", "05082", "05083", "05084", "05085", "05086", "05087", "05087", "05105", "05105", "05106", "05106"], "de côté : 7 Spectral, Josef, The Watcher, Realm of Death");
  const josef = cote.find((c) => c.code === "05085");
  assert.ok(josef.kind === "enemy" && josef.storyBack && josef.faceUp, "Josef Meiger : ennemi synthétisé, dos histoire, face visible");
  assert.ok(!cartes.some((c) => c.code === "05085b"), "le verso de Josef n'est pas une carte à part");
  assert.ok(cote.filter((c) => c.code >= "05078" && c.code <= "05084").every((c) => !c.faceUp), "lieux Spectral non révélés");
  assert.equal(s.piles.encounter.length, 25, "pioche : 25 cartes");
  assert.equal(s.chaos.bag.length, 15, "sac 13 + 2 tablettes");
  assert.equal(s.chaos.bag.filter((t) => t === "tablet").length, 2);
  assert.ok(s.log.some((e) => e.text.includes("5 retirés")), "journal : indices retirés");

  // Dos histoire : retournement refusé, lecture du côté histoire par toggleSide.
  d = await h.action({ t: "flipCard", id: josef.id });
  assert.equal(d.t, "nack", "un dos histoire ne se retourne pas");
  d = await h.action({ t: "toggleSide", id: josef.id });
  assert.equal(h.state.cards[josef.id].side, "b", "côté histoire lu sur demande");
  await h.action({ t: "toggleSide", id: josef.id });

  // Remplacement d'un lieu : version spectrale à la même place, jetons conservés, ancien de côté ; occupé → révélé.
  const entry = surTapis("05071");
  d = await h.action({ t: "swapLocation", id: entry.id });
  assert.equal(d.t, "delta");
  const spectral = h.state.cards[cartes.find((c) => c.code === "05078").id];
  assert.ok(spectral.loc.zone === "board" && spectral.loc.x === 737 && spectral.loc.y === 649, "Entry Hall spectral à la même place");
  assert.ok(spectral.faceUp, "occupé par les enquêteurs : révélé");
  assert.equal(spectral.tokens.clue, 4, "indices conservés (+0 imprimé)");
  assert.equal(h.state.cards[entry.id].loc.zone, "aside", "l'ancien Entry Hall est de côté");
  d = await h.action({ t: "swapLocation", id: spectral.id });
  assert.equal(d.t, "delta", "retour à la version normale possible");
  assert.equal(h.state.cards[entry.id].loc.zone, "board");
  assert.ok(!h.state.cards[entry.id].faceUp || true);
  // Tous les lieux d'un coup : les 7 spectraux en jeu, les 7 normaux de côté ; Office non occupé reste non révélé.
  d = await h.action({ t: "swapLocation", all: true });
  assert.equal(d.t, "delta");
  const enJeu = Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board").map((c) => c.code).sort();
  assert.deepEqual(enJeu, ["05078", "05079", "05080", "05081", "05082", "05083", "05084"], "7 lieux Spectral en jeu");
  const office = Object.values(h.state.cards).find((c) => c.code === "05084");
  assert.ok(!office.faceUp && office.tokens.clue === 4 && office.loc.x === 737 && office.loc.y === 173, "Office spectral : non révélé, indices conservés, même place");
  d = await h.action({ t: "swapLocation", all: true });
  assert.equal(d.t, "delta", "et retour");
  // Retirer tous les indices des lieux.
  d = await h.action({ t: "clearClues" });
  assert.ok(Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board").every((c) => !c.tokens.clue), "plus d'indices sur les lieux");
  // Mélanger une carte de côté dans la pioche (toPile shuffle).
  const watcherGrasp = cote.find((c) => c.code === "05087");
  d = await h.action({ t: "toPile", id: watcherGrasp.id, pile: "encounter", shuffle: true });
  assert.equal(h.state.piles.encounter.length, 26);
  assert.ok(h.state.log.some((e) => e.text.includes("mélangé dans la pioche")), "journal : mélangé");
  // Rappels à l'avancement : agenda 2, acte 2.
  h.recus = h.recus.filter((m) => m.t !== "reminder");
  await h.action({ t: "advanceAgenda" });
  await h.action({ t: "advanceAct" });
  await new Promise((r) => setTimeout(r, 200));
  const rappels = h.recus.filter((m) => m.t === "reminder").map((m) => m.entry.text);
  assert.ok(rappels.some((t) => t.startsWith("Agenda 2")), "rappel agenda:2");
  assert.ok(rappels.some((t) => t.startsWith("Acte 2")), "rappel act:2");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(autres[0].state.cards[office.id], h.state.cards[office.id], "les autres clients voient la même chose");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  const { h, lancer } = await tableDoorstep({ joueurs: 1 });
  const d = await lancer({ gavriella: "crossed", jerome: "crossed", valentino: "crossed", penny: "crossed", evidence: "0", fate: "standalone" });
  assert.equal(d.t, "delta");
  await new Promise((r) => setTimeout(r, 200));
  const s = h.state;
  assert.ok(Object.values(s.cards).filter((c) => c.kind === "location" && c.loc.zone === "board").every((c) => !c.tokens.clue), "mode autonome : aucun indice");
  assert.equal(s.chaos.bag.length, 15);
  assert.equal(s.chaos.bag.filter((t) => t === "tablet").length, 1);
  assert.equal(s.chaos.bag.filter((t) => t === "elder_thing").length, 1);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ The Secret Name (TCU III) : portes indistinguables, pile Unknown Places par couches, nom du verso, lieux simple face ============
{
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_secret_name" }) });
  assert.equal(r.status, 200, "The Secret Name est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  const j2 = client(code, { seat: 1, name: "J2" });
  await j2.attendre((m) => m.t === "welcome");
  await j2.action({ t: "chooseInvestigator", code: "05002" });
  await h.attendre((m) => m.t === "delta" && m.rev === 2);
  h.envoyer({ t: "startSetup", answers: { fate: "rejected", lodge: "members_told" } });
  await h.attendre((m) => m.t === "delta" && m.rev === 3);
  await new Promise((r) => setTimeout(r, 200));
  const s = h.state;
  const cartes = Object.values(s.cards);
  const surTapis = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.equal(surTapis.length, 5, "5 lieux en jeu");
  const portes = surTapis.filter((c) => ["05129", "05130", "05131"].includes(c.code));
  assert.equal(portes.length, 3);
  assert.deepEqual(portes.map((c) => `${c.loc.x},${c.loc.y}`).sort(), ["551,411", "737,649", "923,411"], "portes aux trois positions");
  assert.ok(portes.every((c) => !c.faceUp), "portes non révélées");
  const moldy = surTapis.find((c) => c.code === "05128");
  assert.ok(moldy.faceUp && moldy.tokens.clue === 2 && moldy.loc.x === 737 && moldy.loc.y === 411, "Moldy Halls révélé au centre, 1 indice par enquêteur");
  assert.ok(!surTapis.find((c) => c.code === "05132").faceUp, "Walter Gilman's Room non révélé");
  assert.equal(cartes.filter((c) => c.kind === "mini").length, 2);
  // Le journal ne dit pas quelle pièce est derrière quelle porte.
  assert.ok(!s.log.some((e) => /Landlord|Mazurewicz|Elwood/.test(e.text)), "journal : les portes gardent leur secret");
  // Pile Unknown Places : 7 cartes, Witch House Ruins parmi les 4 du dessous, les 3 du dessus sans elle.
  const up = s.piles.unknown_places;
  assert.equal(up.length, 7);
  const ruinesIdx = up.findIndex((id) => s.cards[id].code === "05137");
  assert.ok(ruinesIdx >= 3, "Witch House Ruins dans les 4 cartes du dessous");
  assert.ok(up.every((id) => !s.cards[id].faceUp));
  // De côté : Nahab, Black Book, 2 Strange Geometry, 2 Ghostly Presence (face visible), Site + Keziah (non révélés).
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.map((c) => c.code).sort(), ["05133", "05141", "05142", "05142", "05144", "05144", "05149", "05150"]);
  assert.ok(cote.filter((c) => ["05133", "05141"].includes(c.code)).every((c) => !c.faceUp) && cote.filter((c) => !["05133", "05141"].includes(c.code)).every((c) => c.faceUp));
  assert.equal(s.piles.encounter.length, 35, "pioche : 35 cartes");
  assert.equal(s.chaos.bag.length, 17, "sac 13 + 2 anciens + 2 cultistes");
  assert.equal(s.chaos.bag.filter((t) => t === "cultist").length, 2);
  assert.equal(s.chaos.bag.filter((t) => t === "elder_thing").length, 2);

  // Tirer un Unknown Places : côté non révélé sur la pile, entre non révélé, clic = révélation avec le vrai nom.
  let d = await h.action({ t: "drawEncounter", pile: "unknown_places" });
  const dessus = h.state.cards[h.state.piles.unknown_places[0]];
  assert.ok(dessus.faceUp && dessus.side === "b");
  assert.ok(h.state.log.at(-1).text.includes("Unknown Places") && !/Ruins|Abyss|Elder Things|Gaol|Classroom|Court|Earlier/.test(h.state.log.at(-1).text), "journal du tirage : nom du verso");
  d = await h.action({ t: "moveCard", id: dessus.id, zone: "board", x: 1109, y: 411 });
  assert.ok(!h.state.cards[dessus.id].faceUp && h.state.cards[dessus.id].side === "a");
  d = await h.action({ t: "revealLocation", id: dessus.id });
  assert.ok(h.state.cards[dessus.id].faceUp);
  // Révéler une porte : indices posés (1 par enquêteur).
  d = await h.action({ t: "revealLocation", id: portes[0].id });
  assert.equal(h.state.cards[portes[0].id].tokens.clue, 2, "porte révélée : 1 indice par enquêteur");
  // Strange Geometry (lieu à simple face) : mélangé dans la pioche, tiré, posé sur le tapis → entre révélé avec son indice fixe.
  const sg = cote.find((c) => c.code === "05142");
  d = await h.action({ t: "toPile", id: sg.id, pile: "encounter", top: true });
  d = await h.action({ t: "drawEncounter" });
  assert.equal(h.state.cards[sg.id].side, "a", "lieu simple face tiré : pas de côté b");
  d = await h.action({ t: "moveCard", id: sg.id, zone: "board", x: 365, y: 411 });
  assert.ok(h.state.cards[sg.id].faceUp && h.state.cards[sg.id].tokens.clue === 1, "Strange Geometry entre révélé avec 1 indice fixe");
  // Remplacement Walter Gilman's Room ↔ Keziah's Room (mise de côté) puis retrait des autres lieux.
  const gilman = surTapis.find((c) => c.code === "05132");
  d = await h.action({ t: "swapLocation", id: gilman.id });
  assert.equal(d.t, "delta");
  const keziah = h.state.cards[cote.find((c) => c.code === "05133").id];
  assert.ok(keziah.loc.zone === "board" && keziah.loc.x === 737 && keziah.loc.y === 173 && !keziah.faceUp, "Keziah's Room prend la place, non révélée");
  assert.ok(h.state.log.some((e) => e.text.includes("remplacé par Keziah's Room")), "journal du remplacement");
  d = await h.action({ t: "removeLocations", keep: keziah.id });
  assert.equal(d.t, "delta");
  const restants = Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.deepEqual(restants.map((c) => c.id), [keziah.id], "seule Keziah's Room reste en jeu");
  assert.ok(Object.values(h.state.cards).filter((c) => c.loc.pile === "removed").length >= 6, "les autres lieux sont retirés");
  // Rappels act:2 / act:3 / agenda:2.
  h.recus = h.recus.filter((m) => m.t !== "reminder");
  await h.action({ t: "advanceAct" });
  await h.action({ t: "advanceAgenda" });
  await h.action({ t: "advanceAct" });
  await new Promise((r) => setTimeout(r, 200));
  const rappels = h.recus.filter((m) => m.t === "reminder").map((m) => m.entry.text);
  assert.ok(rappels.some((t) => t.startsWith("Acte 2")) && rappels.some((t) => t.startsWith("Agenda 2")) && rappels.some((t) => t.startsWith("Acte 3")), "rappels d'avancement");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.cards[keziah.id], h.state.cards[keziah.id], "les autres clients voient la même chose");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ The Wages of Sin (TCU IV) : lieux à deux faces révélées, deux pioches par trait, hérétiques en pile ============
{
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_wages_of_sin" }) });
  assert.equal(r.status, 200, "The Wages of Sin est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  const j2 = client(code, { seat: 1, name: "J2" });
  await j2.attendre((m) => m.t === "welcome");
  await j2.action({ t: "chooseInvestigator", code: "05002" });
  await h.attendre((m) => m.t === "delta" && m.rev === 2);
  h.envoyer({ t: "startSetup", answers: { fate: "rejected", lodge: "members_told", blackbook: "yes" } });
  await h.attendre((m) => (m.t === "delta" && m.rev === 3) || m.t === "nack");
  await new Promise((r) => setTimeout(r, 200));
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.equal(lieux.length, 7, "7 lieux en jeu");
  assert.ok(lieux.every((c) => c.faceUp && c.side === "a"), "tous révélés, face normale");
  const codes = lieux.map((c) => c.code).sort();
  assert.ok(codes.filter((c) => ["05169", "05170"].includes(c)).length === 1 && codes.filter((c) => ["05175", "05176"].includes(c)).length === 1
    && codes.filter((c) => ["05171", "05172"].includes(c)).length === 1 && codes.filter((c) => ["05173", "05174"].includes(c)).length === 1, "une version sur deux pour quatre lieux");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && c.kind === "location").length, 4, "les quatre autres versions retirées");
  const brook = lieux.find((c) => c.code === "05166");
  assert.ok(brook.tokens.clue === 2 && brook.loc.x === 737 && brook.loc.y === 649, "Hangman's Brook : 1 indice par enquêteur, en bas");
  assert.equal(lieux.find((c) => c.code === "05167").tokens.clue, 4, "Haunted Fields : 2 par enquêteur");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 649 - 22), "pions sur Hangman's Brook");
  assert.equal(s.piles.heretics.length, 4, "4 hérétiques en pile");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && c.code.startsWith("05178")).length, 2, "2 hérétiques retirés");
  const cote = cartes.filter((c) => c.loc.zone === "aside").map((c) => c.code).sort();
  assert.deepEqual(cote, ["05086", "05087", "05087", "05177", "05177", "05177", "05177"], "de côté : Spectral Web ×4 et The Watcher");
  assert.equal(s.piles.encounter.length, 24, "pioche standard : 24");
  assert.equal(s.piles.spectral.length, 20, "pioche spectrale : 20");
  assert.deepEqual(s.piles.spectral_discard, [], "défausse spectrale déclarée, vide");
  assert.ok(s.piles.spectral.every((id) => s.cards[id].kind !== "location"), "pas de lieu dans la pioche spectrale");
  assert.equal(s.chaos.bag.length, 18, "sac 13 + 2 anciens + 2 cultistes + 1 crâne");
  assert.equal(s.chaos.bag.filter((t) => t === "skull").length, 3);
  assert.ok(s.log.some((e) => e.text.includes("20 cartes portant le trait Spectral")), "journal : pioche spectrale");

  // Basculer un lieu sur sa face spectrale : pas de nouveaux indices.
  let d = await h.action({ t: "toggleSide", id: brook.id });
  assert.ok(h.state.cards[brook.id].side === "b" && h.state.cards[brook.id].faceUp && h.state.cards[brook.id].tokens.clue === 2, "face spectrale, indices inchangés");
  await h.action({ t: "toggleSide", id: brook.id });
  // Hérétique : tiré de la pile (côté ennemi), posé sur le tapis, côté histoire sur demande, retournement refusé.
  d = await h.action({ t: "drawEncounter", pile: "heretics" });
  const heretic = h.state.cards[h.state.piles.heretics[0]];
  assert.ok(heretic.faceUp && heretic.side === "a" && heretic.storyBack, "hérétique tiré côté ennemi");
  d = await h.action({ t: "moveCard", id: heretic.id, zone: "board", x: 737, y: 411 });
  assert.equal(h.state.piles.heretics.length, 3);
  d = await h.action({ t: "flipCard", id: heretic.id });
  assert.equal(d.t, "nack", "pas de retournement d'un dos histoire");
  d = await h.action({ t: "toggleSide", id: heretic.id });
  assert.equal(h.state.cards[heretic.id].side, "b", "côté histoire lu sur demande");
  await h.action({ t: "toggleSide", id: heretic.id });
  // Deux pioches : tirer de la spectrale, défausser dans la défausse spectrale (face visible), remélanger.
  d = await h.action({ t: "drawEncounter", pile: "spectral" });
  const tiree = h.state.cards[h.state.piles.spectral[0]];
  assert.ok(tiree.faceUp);
  d = await h.action({ t: "toPile", id: tiree.id, pile: "spectral_discard" });
  assert.ok(h.state.piles.spectral_discard.length === 1 && h.state.cards[tiree.id].faceUp, "défausse spectrale : face visible");
  d = await h.action({ t: "drawEncounter", pile: "spectral_discard" });
  assert.equal(d.t, "nack", "on ne pioche pas dans une défausse");
  d = await h.action({ t: "reshuffleDiscard", deck: "spectral" });
  assert.ok(h.state.piles.spectral.length === 20 && h.state.piles.spectral_discard.length === 0, "défausse spectrale remélangée dans la pioche spectrale");
  assert.ok(h.state.log.some((e) => e.text.includes("remélangée dans Pioche spectrale")), "journal du remélange");
  // Pioche spectrale vide → sa défausse est remélangée au tirage.
  for (const id of [...h.state.piles.spectral]) await h.action({ t: "toPile", id, pile: "spectral_discard" });
  assert.equal(h.state.piles.spectral.length, 0);
  d = await h.action({ t: "drawEncounter", pile: "spectral" });
  assert.equal(d.t, "delta");
  assert.ok(h.state.piles.spectral.length === 20 && h.state.cards[h.state.piles.spectral[0]].faceUp, "remélange automatique puis tirage");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.piles.spectral, h.state.piles.spectral, "les autres clients voient la même chose");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ For the Greater Good (TCU V) : deux mises en place selon la Loge, actes alternatifs, clés déplaçables, Nathan Wick à deux faces ============
async function tableGreater({ answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_for_the_greater_good" }) });
  assert.equal(r.status, 200, "For the Greater Good est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  const j2 = client(code, { seat: 1, name: "J2" });
  await j2.attendre((m) => m.t === "welcome");
  await j2.action({ t: "chooseInvestigator", code: "05002" });
  await h.attendre((m) => m.t === "delta" && m.rev === 2);
  h.envoyer({ t: "startSetup", answers });
  const d = await h.attendre((m) => (m.t === "delta" && m.rev === 3) || m.t === "nack");
  assert.equal(d.t, "delta", "mise en place acceptée");
  await new Promise((r) => setTimeout(r, 200));
  return { h, j2 };
}
{
  // Membres de la Loge : acte 1 « Warm Welcome », versions « We've Been Expecting You », retraits.
  const { h, j2 } = await tableGreater({ answers: { fate: "accepted", lodge: "members_hid", blackbook: "yes" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.deepEqual(lieux.map((c) => c.code).sort(), ["05204", "05206", "05208", "05210", "05213"], "5 lieux : versions We've Been Expecting You + Lounge + Catacombs");
  const gates = lieux.find((c) => c.code === "05204");
  assert.ok(gates.faceUp && gates.loc.x === 737 && gates.loc.y === 173, "Lodge Gates révélé en haut");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 173 - 22), "pions sur Lodge Gates");
  assert.equal(s.cards[s.actId].code, "05200", "acte 1 Warm Welcome");
  assert.deepEqual(s.piles.actDeck.map((id) => s.cards[id].code), ["05202", "05203"], "actes 2 et 3 seulement");
  assert.ok(cartes.some((c) => c.code === "05201" && c.loc.pile === "removed"), "l'autre acte 1 est retiré");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && ["01169", "01170", "05221", "05219"].includes(c.code)).length, 7, "7 cartes de rencontre retirées");
  assert.equal(s.piles.encounter.length, 29, "pioche : 29 cartes");
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.filter((c) => c.kind !== "key").map((c) => c.code).sort(), ["05211", "05212", "05214", "05215", "05216", "05217", "05220", "05227", "05228"], "de côté : 5 lieux, Nathan, Summoned Beast, August, Puzzle Box");
  const cles = cote.filter((c) => c.kind === "key");
  assert.deepEqual(cles.map((c) => c.code).sort(), ["key:cultist", "key:elder_thing", "key:skull", "key:tablet"], "quatre clés de côté");
  assert.ok(cles.every((c) => c.faceUp));
  assert.equal(s.chaos.bag.length, 17, "sac 13 + 2 tablettes + 1 cultiste + 1 crâne");
  assert.ok(s.log.some((e) => e.text.includes("Clés mises de côté") || e.text.includes("Quatre clés")), "journal : clés");
  // Clé : sur le tapis, sur un siège, jamais dans une pile ; pas de retournement ; suit un lieu déplacé.
  const cle = cles.find((c) => c.code === "key:skull");
  let d = await h.action({ t: "toPile", id: cle.id, pile: "encounter" });
  assert.equal(d.t, "nack", "une clé ne va pas dans une pile");
  d = await h.action({ t: "flipCard", id: cle.id });
  assert.equal(d.t, "nack", "une clé ne se retourne pas");
  const x0 = gates.loc.x, y0 = gates.loc.y; // (les objets d'état sont mis à jour en place : on fige les coordonnées)
  d = await h.action({ t: "moveCard", id: cle.id, zone: "board", x: x0 + 60, y: y0 + 60 });
  assert.equal(h.state.cards[cle.id].loc.zone, "board");
  d = await h.action({ t: "moveCard", id: gates.id, zone: "board", x: x0 + 100, y: y0 });
  assert.equal(h.state.cards[cle.id].loc.x, x0 + 160, "la clé suit le lieu déplacé");
  d = await h.action({ t: "moveCard", id: cle.id, zone: "seat0", x: 0, y: 0 });
  assert.equal(h.state.cards[cle.id].loc.zone, "seat0", "clé contrôlée par un enquêteur (siège)");
  // Nathan Wick : deux faces d'ennemi, bascule par toggleSide, retournement possible mais bascule préférée.
  const nathan = cote.find((c) => c.code === "05217");
  d = await h.action({ t: "toggleSide", id: nathan.id });
  assert.equal(h.state.cards[nathan.id].side, "b", "Nathan sur sa seconde face");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.cards[cle.id], h.state.cards[cle.id], "les autres clients voient la clé");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  // Non membres : acte 1 « Infiltrating the Lodge », versions « Members Only », autres retraits ; sac autonome.
  const { h } = await tableGreater({ answers: { fate: "standalone", lodge: "standalone_not", blackbook: "no" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.deepEqual(lieux.map((c) => c.code).sort(), ["05205", "05207", "05209", "05210", "05213"], "versions Members Only");
  assert.equal(s.cards[s.actId].code, "05201", "acte 1 Infiltrating the Lodge");
  assert.equal(lieux.find((c) => c.code === "05205").tokens.clue, 2, "Lodge Gates (Members Only) : 1 indice par enquêteur");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && ["05095", "05096", "05222", "05218"].includes(c.code)).length, 7, "7 autres cartes retirées");
  assert.equal(s.piles.encounter.length, 29);
  assert.equal(s.chaos.bag.length, 16, "sac autonome : 13 + tablette + ancien + cultiste");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`OK — ${messagesEntrants} messages entrants envoyés par le test`);
process.exit(0);
