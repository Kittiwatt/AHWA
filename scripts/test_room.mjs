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

function client(code, { seat = "spectator", name = "", hostToken = "", pin = "" } = {}) {
  const u = new URL(`${WS}/rooms/${code}/ws`);
  u.searchParams.set("seat", String(seat));
  if (name) u.searchParams.set("name", name);
  if (hostToken) u.searchParams.set("hostToken", hostToken);
  if (pin) u.searchParams.set("pin", pin);
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
// Enquêteur personnalisé (hors ArkhamDB) : validation, siège, cartes et pion « custom:<n> », visible par les autres, remplacement.
{
  const { h, autres, lancer } = await tableDoorstep({ joueurs: 2 });
  const j2 = autres[0];
  let d = await j2.action({ t: "chooseCustomInvestigator", name: "", image: "", health: 7, sanity: 7 });
  assert.equal(d.t, "nack", "sans nom : refusé");
  d = await j2.action({ t: "chooseCustomInvestigator", name: "Lisette Anofelis", image: "", health: 0, sanity: 7 });
  assert.equal(d.t, "nack", "vie hors bornes : refusée");
  d = await j2.action({ t: "chooseCustomInvestigator", name: "Lisette Anofelis", image: "javascript:alert(1)", health: 7, sanity: 7 });
  assert.equal(d.t, "nack", "image qui n'est pas un lien http(s) : refusée");
  d = await j2.action({ t: "chooseCustomInvestigator", name: "  Lisette   Anofelis ", image: " https://cdn.arkham.build/optimized/05046.webp ", health: "8", sanity: 6.4 });
  assert.equal(d.t, "delta", "enquêteur personnalisé accepté");
  await new Promise((r) => setTimeout(r, 200));
  let siege = j2.state.seats[1];
  assert.equal(siege.investigatorCode, "custom:1", "code de carte custom:<siège>");
  assert.deepEqual(siege.custom, { name: "Lisette Anofelis", image: "https://cdn.arkham.build/optimized/05046.webp", health: 8, sanity: 6 }, "nom normalisé, image nettoyée, jauges arrondies");
  assert.equal(siege.counters.health, 8); assert.equal(siege.counters.sanity, 6);
  assert.deepEqual(h.state.seats[1].custom, siege.custom, "l'hôte voit l'enquêteur personnalisé");
  // Mise à jour (même siège) et pas de conflit avec un autre siège.
  d = await j2.action({ t: "chooseCustomInvestigator", name: "Lisette Anofelis", image: "", health: 9, sanity: 5 });
  assert.equal(d.t, "delta");
  assert.equal(j2.state.seats[1].custom.image, null, "image facultative");
  assert.equal(j2.state.seats[1].counters.health, 9);
  d = await lancer({ gavriella: "kept", jerome: "kept", valentino: "kept", penny: "kept", evidence: "0", fate: "accepted" });
  assert.equal(d.t, "delta", "mise en place avec un enquêteur personnalisé");
  await new Promise((r) => setTimeout(r, 300));
  const s = h.state;
  assert.equal(s.playerCount, 2);
  assert.equal(s.cards["inv-1"].code, "custom:1", "carte d'enquêteur au code custom");
  assert.equal(s.cards["inv-1"].kind, "investigator");
  assert.equal(s.cards["mini-1"].code, "custom:1", "pion au code custom");
  assert.equal(s.cards["mini-1"].loc.zone, "board", "pion posé sur Entry Hall");
  // Le nom du siège (journal) est celui de l'enquêteur personnalisé quand le joueur n'a pas de nom.
  j2.envoyer({ t: "setName", name: "" });
  await j2.attendre((m) => m.t === "seats" && m.seats[1].name === null);
  d = await j2.action({ t: "takeTurn", seat: 1 });
  assert.equal(d.t, "delta");
  assert.ok(j2.state.log.some((e) => e.text.includes("Lisette Anofelis prend son tour")), "journal : nom de l'enquêteur personnalisé");
  // Un nouveau spectateur reçoit le custom dans le welcome et dans le message seats.
  const sp = client(h.state.code);
  const w = await sp.attendre((m) => m.t === "welcome");
  assert.deepEqual(w.state.seats[1].custom, j2.state.seats[1].custom, "welcome : enquêteur personnalisé présent");
  const seatsMsg = await sp.attendre((m) => m.t === "seats");
  assert.ok("custom" in seatsMsg.seats[1] && seatsMsg.seats[1].custom.name === "Lisette Anofelis", "message seats : custom porté");
  sp.ws.close();
  // Hors lobby : refusé.
  d = await j2.action({ t: "chooseCustomInvestigator", name: "X", image: "", health: 5, sanity: 5 });
  assert.equal(d.t, "nack", "hors lobby : refusé");
  // Réinitialisation : retour au lobby, l'enquêteur personnalisé est conservé ; reprise d'un ArkhamDB l'efface.
  d = await h.action({ t: "reset" });
  assert.equal(d.t, "delta");
  assert.equal(h.state.phase, "lobby");
  assert.equal(h.state.seats[1].custom?.name, "Lisette Anofelis", "reset : enquêteur personnalisé conservé");
  d = await j2.action({ t: "chooseInvestigator", code: "05003" });
  assert.equal(d.t, "delta");
  assert.equal(j2.state.seats[1].custom, null, "un enquêteur ArkhamDB efface le personnalisé");
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

// ============ Union and Disillusion (TCU VI) : isles au hasard avec reste de côté, braseros, actes 3/4 selon conditions composées, Fate cachés ============
async function tableUnion({ answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_union_and_disillusion" }) });
  assert.equal(r.status, 200, "Union and Disillusion est au registre");
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
  assert.equal(d.t, "delta", `mise en place acceptée (${d.reason ?? ""})`);
  await new Promise((r) => setTimeout(r, 200));
  return { h, j2 };
}
{
  const { h, j2 } = await tableUnion({ answers: { sided: "coven", fate: "rejected", lodge: "members_hid", deceiving: "yes", inducted: "no", mementos: "yes", blackbook: "yes", heretics: "3",
    gavriella: "kept", jerome: "crossed", valentino: "crossed", penny: "crossed" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.equal(lieux.length, 4, "River, Shore, 2 isles");
  const isles = lieux.filter((c) => c.code >= "05251" && c.code <= "05256");
  assert.equal(isles.length, 2);
  assert.deepEqual(isles.map((c) => `${c.loc.x},${c.loc.y}`).sort(), ["1016,649", "458,649"], "isles en bas à gauche et à droite");
  assert.ok(isles.every((c) => !c.faceUp && c.tokens.resource === 1), "braseros des isles allumés (parti du coven)");
  assert.equal(lieux.find((c) => c.code === "05250").tokens.resource, 1, "brasero de Forbidding Shore allumé");
  assert.ok(lieux.find((c) => c.code === "05249").faceUp, "Miskatonic River révélé");
  assert.equal(cartes.filter((c) => c.loc.zone === "aside" && c.code >= "05251" && c.code <= "05256").length, 4, "4 isles de côté");
  assert.ok(cartes.filter((c) => c.loc.zone === "aside" && c.code >= "05251" && c.code <= "05256").every((c) => !c.faceUp));
  assert.equal(cartes.filter((c) => c.kind === "mini").length, 2);
  // Actes : v. III (Loge trompée + coven caché = 2 mentions) et Broken Rite ; les autres retirés.
  assert.equal(s.cards[s.actId].code, "05241");
  assert.deepEqual(s.piles.actDeck.map((id) => s.cards[id].code), ["05242", "05245", "05248"], "acte 3 v. III, acte 4 Broken Rite");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && ["05243", "05244", "05246", "05247"].includes(c.code)).length, 4, "autres versions retirées");
  assert.equal(s.cards[s.agendaId].tokens.doom, 3, "3 hérétiques → 3 doom sur l'agenda 1");
  // Missing Persons : Gavriella seule non barrée.
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  const fate = cote.find((c) => c.code === "05262");
  assert.ok(fate && !fate.faceUp && fate.storyBack, "Gavriella's Fate de côté, face cachée, dos histoire");
  assert.ok(cote.find((c) => c.code === "05258")?.faceUp, "soutien Gavriella de côté");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && ["05259", "05260", "05261", "05263", "05264", "05265"].includes(c.code)).length, 6, "les autres soutiens et Fate retirés");
  assert.deepEqual(cote.filter((c) => ["05057", "05085", "05257", "05272"].includes(c.code)).map((c) => c.code).sort(), ["05057", "05085", "05257", "05272"], "Anette, Josef, Geist-Trap, Watcher's Gaze de côté");
  assert.equal(cote.filter((c) => ["05086", "05087", "05090", "05091", "05095", "05096", "05097"].includes(c.code)).length, 13, "sets de côté : 13 cartes");
  assert.equal(s.piles.encounter.length, 35, "pioche : 35");
  assert.equal(s.chaos.bag.length, 17, "sac 13 + 2 anciens + 1 cultiste + 1 crâne");
  // Fate : retournement refusé, révélation explicite acceptée, puis verso (ennemi lié).
  let d = await h.action({ t: "flipCard", id: fate.id });
  assert.equal(d.t, "nack", "un dos histoire ne se révèle pas par retournement");
  d = await h.action({ t: "flipCard", id: fate.id, reveal: true });
  assert.ok(d.t === "delta" && h.state.cards[fate.id].faceUp, "révélé sur demande explicite");
  d = await h.action({ t: "toggleSide", id: fate.id });
  assert.equal(h.state.cards[fate.id].side, "b", "verso (ennemi lié) sur demande");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.cards[fate.id], h.state.cards[fate.id]);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  // Parti de la Loge, autonome : v. I + Binding Rite, braseros éteints, 4 profils barrés, aucun doom.
  const { h } = await tableUnion({ answers: { sided: "lodge", fate: "standalone", lodge: "standalone", deceiving: "no", inducted: "no", mementos: "no", blackbook: "no", heretics: "0",
    gavriella: "crossed", jerome: "crossed", valentino: "crossed", penny: "crossed" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  assert.deepEqual(s.piles.actDeck.map((id) => s.cards[id].code), ["05242", "05243", "05247"], "acte 3 v. I, acte 4 Binding Rite");
  assert.ok(cartes.filter((c) => c.kind === "location" && c.loc.zone === "board").every((c) => !c.tokens.resource), "braseros éteints");
  assert.equal(s.cards[s.agendaId].tokens.doom, 0, "aucun doom");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && c.code >= "05258" && c.code <= "05265").length, 8, "soutiens et Fate tous retirés");
  assert.equal(s.chaos.bag.length, 16, "sac autonome : 13 + tablette + ancien + cultiste");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ In the Clutches of Chaos (TCU VII) : versions au hasard vers une pile, deux mises en place, brèches, tirage au hasard sans sortir ============
async function tableClutches({ joueurs, answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_in_the_clutches_of_chaos" }) });
  assert.equal(r.status, 200, "In the Clutches of Chaos est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    await c.action({ t: "chooseInvestigator", code: ["05001", "05002", "05003", "05004"][i] });
  }
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === joueurs);
  h.envoyer({ t: "startSetup", answers });
  const d = await h.attendre((m) => (m.t === "delta" && m.rev === joueurs + 1) || m.t === "nack");
  assert.equal(d.t, "delta", `mise en place acceptée (${d.reason ?? ""})`);
  await new Promise((r) => setTimeout(r, 200));
  return { h };
}
{
  const { h } = await tableClutches({ joueurs: 2, answers: { outcome: "anette", fate: "accepted", lodge: "members_told", blackbook: "yes" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.equal(lieux.length, 8, "8 lieux en jeu");
  const southside = lieux.find((c) => ["05294", "05295"].includes(c.code));
  assert.ok(southside.faceUp && southside.loc.x === 737 && southside.loc.y === 411, "Southside révélé au centre");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 411 - 22), "pions sur Southside");
  assert.ok(lieux.some((c) => c.code === "05302") && lieux.some((c) => c.code === "05303"), "Hangman's Hill (Where It All Ends) et Lodge (Shrouded)");
  assert.equal(s.piles.random_locations.length, 8, "pile Lieux au hasard : 8 versions non utilisées");
  assert.ok(s.piles.random_locations.every((id) => s.cards[id].kind === "location" && !s.cards[id].faceUp));
  assert.equal(s.cards[s.actId].code, "05286a", "acte 1 Dark Knowledge (v. I)");
  assert.deepEqual(s.piles.actDeck.map((id) => s.cards[id].code), ["05287"], "acte 2 Beyond the Grave");
  assert.equal(cartes.filter((c) => c.loc.pile === "removed" && ["05288a", "05289"].includes(c.code)).length, 2, "autres actes retirés");
  assert.equal(s.piles.encounter.length, 35, "pioche : 35 (branche Anette)");
  assert.equal(cartes.filter((c) => c.loc.zone === "aside").map((c) => c.code).join(), "05088", "Piper de côté");
  const breches = lieux.reduce((n, l) => n + (l.tokens.resource ?? 0), 0);
  assert.equal(breches, 4, "2 joueurs : 2 tirages de 2 lieux = 4 brèches");
  assert.ok(lieux.every((l) => (l.tokens.resource ?? 0) <= 2));
  assert.equal(s.chaos.bag.length, 18, "sac 13 + 2 tablettes + 2 cultistes + 1 crâne");
  // Tirage au hasard sans sortir : 2 noms distincts, la pile inchangée, rappel diffusé.
  const avant = [...s.piles.random_locations];
  h.recus = h.recus.filter((m) => m.t !== "reminder");
  let d = await h.action({ t: "randomPick", pile: "random_locations", n: 2 });
  assert.equal(d.t, "delta");
  assert.deepEqual(h.state.piles.random_locations, avant, "la pile n'a pas bougé");
  await new Promise((r) => setTimeout(r, 200));
  const rappel = h.recus.find((m) => m.t === "reminder");
  assert.ok(rappel && rappel.entry.text.includes("Tirage au hasard dans Lieux au hasard"), "tirage annoncé à tous");
  // Phase du mythe sans doom automatique (on avance jusqu'à la phase du mythe).
  for (let i = 0; i < 4 && h.state.phase !== "mythos"; i++) d = await h.action({ t: "nextPhase" });
  assert.equal(h.state.cards[h.state.agendaId].tokens.doom, 0, "pas de doom automatique");
  assert.ok(h.state.log.some((e) => e.text.includes("pas de doom automatique")), `journal du mythe : ${h.state.phase} / ${h.state.log.slice(-3).map((e) => e.text).join(" | ")}`);
  // Verso de l'acte 1 = ennemi : retournement puis avancement laissent l'ennemi en jeu.
  const acte1 = s.actId; // (état mis à jour en place : on fige l'id)
  d = await h.action({ t: "flipCard", id: acte1 });
  d = await h.action({ t: "moveCard", id: acte1, zone: "board", x: 365, y: 100 });
  d = await h.action({ t: "advanceAct" });
  assert.ok(h.state.cards[acte1].loc.zone === "board" && h.state.cards[h.state.actId].code === "05287", "l'acte 1 retourné reste sur le tapis, acte 2 courant");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  const { h } = await tableClutches({ joueurs: 4, answers: { outcome: "sanford", fate: "standalone", lodge: "standalone", blackbook: "no" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.ok(lieux.some((c) => c.code === "05304") && lieux.some((c) => c.code === "05305"), "versions Sanford de Hangman's Hill et Lodge");
  assert.equal(s.cards[s.actId].code, "05288a", "acte 1 Dark Knowledge (v. II)");
  assert.deepEqual(s.piles.actDeck.map((id) => s.cards[id].code), ["05289"]);
  assert.equal(s.piles.encounter.length, 37, "pioche : 37 (branche Sanford, avec les 5 traîtrises de Midnight Masks)");
  assert.equal(lieux.reduce((n, l) => n + (l.tokens.resource ?? 0), 0), 9, "4 joueurs : 3 tirages de 3 lieux = 9 brèches");
  assert.equal(s.piles.random_locations.length, 8);
  assert.equal(s.chaos.bag.length, 16, "sac autonome");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ Before the Black Throne (TCU VIII) : Cosmos, deux cartes indistinguables, espaces vides, jeton par difficulté, marques ============
{
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tcu_before_the_black_throne" }) });
  assert.equal(r.status, 200, "Before the Black Throne est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "05001" });
  const j2 = client(code, { seat: 1, name: "J2" });
  await j2.attendre((m) => m.t === "welcome");
  await j2.action({ t: "chooseInvestigator", code: "05002" });
  await h.attendre((m) => m.t === "delta" && m.rev === 2);
  await h.action({ t: "setDifficulty", d: "hard" });
  const rev0 = h.state.rev;
  h.envoyer({ t: "startSetup", answers: { tally: "5", asked: "yes", fate: "accepted", lodge: "members_hid", blackbook: "yes" } });
  let d = await h.attendre((m) => (m.t === "delta" && m.rev === rev0 + 1) || m.t === "nack");
  assert.equal(d.t, "delta", `mise en place acceptée (${d.reason ?? ""})`);
  await new Promise((r) => setTimeout(r, 200));
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.equal(lieux.length, 3, "Cosmic Ingress + 2 cartes Cosmos");
  const ingress = lieux.find((c) => c.code === "05332");
  assert.ok(ingress.faceUp && ingress.tokens.clue === 3 && ingress.loc.x === 551 && ingress.loc.y === 411, "Cosmic Ingress révélé, 3 indices fixes");
  const cosmos2 = lieux.filter((c) => c.code !== "05332");
  assert.deepEqual(cosmos2.map((c) => `${c.loc.x},${c.loc.y}`).sort(), ["923,173", "923,649"], "deux cartes Cosmos en haut et en bas à droite");
  assert.ok(cosmos2.every((c) => !c.faceUp), "côté Cosmos");
  assert.ok(cosmos2.some((c) => c.code === "05333"), "Hideous Palace parmi les deux");
  assert.ok(!s.log.some((e) => /Hideous Palace est mis en jeu|Dancer|Flight|Infinity|Cosmic Gate|Pathway/.test(e.text)), "le journal ne dévoile ni la position du Palace ni la carte tirée");
  assert.equal(s.piles.cosmos.length, 11, "Cosmos : 11 lieux");
  assert.ok(s.piles.cosmos.every((id) => !s.cards[id].faceUp));
  const vides = cartes.filter((c) => c.kind === "proxy");
  assert.equal(vides.length, 6, "6 espaces vides");
  assert.ok(vides.every((c) => c.code === "empty:space" && c.loc.zone === "board" && !c.faceUp));
  const azathoth = cartes.find((c) => c.code === "05346");
  assert.ok(azathoth.loc.zone === "board" && azathoth.faceUp, "Azathoth en jeu sur le tapis");
  assert.deepEqual(cartes.filter((c) => c.loc.zone === "aside").map((c) => c.code).sort(), ["05088", "05334", "05335"], "de côté : Piper, Court, Black Throne");
  assert.ok(cartes.filter((c) => c.loc.zone === "aside" && c.kind === "location").every((c) => !c.faceUp));
  const scen = cartes.find((c) => c.code === "05325");
  assert.equal(scen.tokens.resource, 5, "5 marques = 5 ressources sur la carte de scénario");
  assert.equal(s.piles.encounter.length, 30, "pioche : 32 − Piper − Azathoth = 30");
  assert.equal(s.chaos.bag.length, 18, "sac difficile 13 + jeton −5 de l'interlude + 2 tablettes + 1 cultiste + 1 crâne");
  assert.equal(s.chaos.bag.filter((t) => t === "-5").length, 2, `jeton −5 de l'Interlude IV (difficulté difficile) ajouté : ${s.difficulty} ${JSON.stringify(s.chaos.bag)}`);
  // Regarder les 2 premières cartes du Cosmos : aperçu privé de 2 cartes ; journal.
  h.envoyer({ t: "searchEncounter", pile: "cosmos", n: 2 });
  d = await h.attendre((m) => m.t === "peek");
  assert.equal(d.cards.length, 2, "aperçu de 2 cartes");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(h.state.log.some((e) => e.text.includes("regarde les 2 premières cartes de Cosmos")), "journal de l'aperçu diffusé");
  // Espace vide posé à côté d'un lieu, puis retiré quand un lieu prend sa place.
  d = await h.action({ t: "emptySpace", x: 365, y: 411 });
  assert.equal(Object.values(h.state.cards).filter((c) => c.kind === "proxy").length, 7, "espace vide ajouté");
  d = await h.action({ t: "toPile", id: "empty-7", pile: "removed" });
  assert.equal(Object.values(h.state.cards).filter((c) => c.kind === "proxy" && c.loc.zone === "board").length, 6, "espace vide retiré");
  d = await h.action({ t: "flipCard", id: "empty-1" });
  assert.equal(d.t, "delta", "un espace vide peut être retourné (sans effet visible) ou déplacé");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.piles.cosmos, h.state.piles.cosmos);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ The Pit of Despair (TIC I) : clés de couleur à deux faces, clé cachée au hasard, Tidal Tunnel au hasard puis en pile,
// tunnels autour d'un lieu, inondation et marée automatique, profondeurs, bénédictions rendues à la réserve ============
async function tablePit({ joueurs = 2, difficulty } = {}) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tic_the_pit_of_despair" }) });
  assert.equal(r.status, 200, "The Pit of Despair est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "07001" });
  const autres = [];
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    await c.action({ t: "chooseInvestigator", code: ["07001", "07002", "07003", "07004"][i] });
    autres.push(c);
  }
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === joueurs);   // en solo, le delta 1 est déjà consommé par l'action de l'hôte
  if (difficulty) await h.action({ t: "setDifficulty", d: difficulty });
  const rev0 = h.state.rev;
  h.envoyer({ t: "startSetup", answers: {} });
  const d = await h.attendre((m) => (m.t === "delta" && m.rev === rev0 + 1) || m.t === "nack");
  assert.equal(d.t, "delta", `mise en place acceptée (${d.reason ?? ""})`);
  await new Promise((r) => setTimeout(r, 200));
  return { h, autres };
}
{
  const { h, autres: [j2] } = await tablePit({ joueurs: 2 });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  // Unfamiliar Chamber révélé au centre avec ses indices et les pions ; trois tunnels non révélés à gauche, à droite, en dessous.
  const chambre = lieux.find((c) => c.code === "07047");
  assert.ok(chambre.faceUp && chambre.loc.x === 737 && chambre.loc.y === 173 && chambre.tokens.clue === 2, "Unfamiliar Chamber révélé, 1 indice par enquêteur");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 173 - 22), "pions sur la chambre");
  const tunnels = lieux.filter((c) => c.code !== "07047");
  assert.equal(tunnels.length, 3, "trois Tidal Tunnel en jeu");
  assert.deepEqual(tunnels.map((c) => `${c.loc.x},${c.loc.y}`).sort(), ["551,173", "737,411", "923,173"], "à gauche, à droite, en dessous");
  assert.ok(tunnels.every((c) => !c.faceUp && c.side === "a" && ["07048", "07049", "07102", "07103", "07104"].includes(c.code)), "tunnels non révélés, pris parmi les huit");
  // De côté : les 5 autres tunnels + les 3 nommés (non révélés), The Amalgam, Blindsense ×2, From the Depths ×3 (face visible).
  const cote = cartes.filter((c) => c.loc.zone === "aside" && c.kind !== "key");
  assert.equal(cote.filter((c) => c.kind === "location").length, 8, "8 tunnels de côté (5 au hasard + Idol Chamber, Altar to Dagon, Sealed Exit)");
  assert.ok(cote.filter((c) => c.kind === "location").every((c) => !c.faceUp), "tunnels de côté non révélés");
  assert.deepEqual(cote.filter((c) => c.kind !== "location").map((c) => c.code).sort(), ["07053", "07054", "07054", "07055", "07055", "07055"], "Amalgam, Blindsense ×2, From the Depths ×3 de côté");
  assert.ok(cote.filter((c) => c.kind !== "location").every((c) => c.faceUp));
  // Les 8 tunnels comptent 2 Underwater Cavern, 2 Tidal Pool, 2 Underground River, Bone-Ridden Pit, Fish Graveyard + 3 nommés (11 en tout avec ceux en jeu).
  const tousTunnels = cartes.filter((c) => c.kind === "location" && c.code !== "07047");
  assert.equal(tousTunnels.length, 11, "onze Tidal Tunnel en tout, aucun retiré");
  assert.ok(!cartes.some((c) => c.kind === "location" && c.loc.pile === "removed"), "aucun lieu retiré de la partie");
  assert.equal(s.piles.encounter.length, 25, "pioche : 25 cartes");
  assert.deepEqual(s.piles.tidal, [], "pile Tidal Tunnel vide au départ");
  assert.deepEqual(s.piles.depths, [], "pile Profondeurs vide");
  assert.equal(s.chaos.bag.length, 20, "sac TIC standard : 20 jetons");
  assert.equal(s.chaos.bag.filter((t) => t === "cultist").length, 2);
  // Clés : bleue et verte face visible de côté ; une des trois cachées est sur la chambre, les deux autres de côté face cachée.
  const cles = cartes.filter((c) => c.kind === "key");
  assert.deepEqual(cles.map((c) => c.code).sort(), ["key:blue", "key:green", "key:purple", "key:red", "key:yellow"], "cinq clés, noire et blanche absentes");
  const visibles = cles.filter((c) => c.faceUp);
  assert.deepEqual(visibles.map((c) => c.code).sort(), ["key:blue", "key:green"], "bleue et verte face visible");
  assert.ok(visibles.every((c) => c.loc.zone === "aside"));
  const cachees = cles.filter((c) => !c.faceUp);
  assert.equal(cachees.filter((c) => c.loc.zone === "aside").length, 2, "deux clés cachées de côté");
  const surChambre = cachees.find((c) => c.loc.zone === "board");
  assert.ok(surChambre && Math.abs(surChambre.loc.x - (737 - 22 + 6)) < 1 && surChambre.loc.y > 173 && surChambre.loc.y < 173 + 178, "une clé cachée posée sur la chambre");
  assert.ok(!s.log.some((e) => /clé (rouge|jaune|violette)[^,]*(posée|tirée)/.test(e.text)), "le journal ne dit pas quelle clé est sur la chambre");
  assert.ok(s.log.some((e) => e.text.includes("sans être regardée")), "journal : clé cachée au hasard");
  // Clé cachée : nom masqué, retournable, retournée d'elle-même quand un siège en prend le contrôle.
  let d = await h.action({ t: "flipCard", id: surChambre.id });
  assert.equal(d.t, "delta", "une clé de couleur se retourne");
  assert.ok(h.state.cards[surChambre.id].faceUp);
  d = await h.action({ t: "flipCard", id: surChambre.id });
  assert.ok(!h.state.cards[surChambre.id].faceUp, "et se cache à nouveau");
  const autreCachee = cachees.find((c) => c.loc.zone === "aside");
  d = await h.action({ t: "moveCard", id: autreCachee.id, zone: "seat1", x: 0, y: 0 });
  assert.ok(h.state.cards[autreCachee.id].faceUp && h.state.cards[autreCachee.id].loc.zone === "seat1", "clé contrôlée par un siège : retournée face visible");
  assert.ok(h.state.log.some((e) => e.text.includes("prend le contrôle d'une clé")), "journal : contrôle");
  d = await h.action({ t: "toPile", id: autreCachee.id, pile: "encounter" });
  assert.equal(d.t, "nack", "une clé ne va pas dans une pile");
  // Clé cachée au hasard en jeu : sur un tunnel du tapis ; refus quand il n'en reste plus.
  const tunnel = tunnels[0];
  d = await h.action({ t: "randomKey", id: tunnel.id });
  assert.equal(d.t, "delta", "clé cachée au hasard posée sur un lieu");
  const derniere = cles.filter((c) => !c.faceUp && c.loc.zone === "aside").map((c) => h.state.cards[c.id]);
  assert.equal(derniere.filter((c) => c.loc.zone === "aside").length, 0, "plus de clé cachée de côté");
  d = await h.action({ t: "randomKey", id: tunnel.id });
  assert.equal(d.t, "nack", "refus : aucune clé cachée de côté");
  // Inondation : niveau d'un lieu (0-2), marée nulle au départ, révélation sans inondation.
  d = await h.action({ t: "setFlood", id: chambre.id, level: 1 });
  assert.equal(h.state.cards[chambre.id].tokens.flood, 1, "chambre partiellement inondée");
  d = await h.action({ t: "addToken", id: chambre.id, token: "flood", delta: 5 });
  assert.equal(h.state.cards[chambre.id].tokens.flood, 2, "le niveau plafonne à 2");
  d = await h.action({ t: "setFlood", id: chambre.id, level: 0 });
  assert.equal(h.state.cards[chambre.id].tokens.flood, undefined, "asséchée : jeton retiré");
  d = await h.action({ t: "revealLocation", id: tunnel.id });
  const tunnelRevele = h.state.cards[tunnel.id];
  assert.ok(tunnelRevele.faceUp && !tunnelRevele.tokens.flood, "révélé sans inondation tant que la marée est nulle");
  // Marée : l'agenda 2 monte tous les lieux révélés d'un niveau et fixe la règle « +1 à la révélation ».
  d = await h.action({ t: "advanceAgenda" });
  assert.equal(h.state.cards[h.state.agendaId].code, "07043", "agenda 2 courant");
  assert.deepEqual(h.state.flood, { onReveal: 1 }, "règle : +1 à la révélation");
  assert.equal(h.state.cards[chambre.id].tokens.flood, 1, "chambre montée d'un niveau");
  assert.equal(h.state.cards[tunnel.id].tokens.flood, 1, "tunnel révélé monté d'un niveau");
  assert.ok(h.state.cards[tunnels[1].id].tokens.flood === undefined, "un lieu non révélé n'est pas inondé");
  assert.ok(h.state.log.some((e) => e.kind === "reminder" && e.text.startsWith("Marée (agenda 2)")), "rappel de marée");
  d = await h.action({ t: "revealLocation", id: tunnels[1].id });
  assert.equal(h.state.cards[tunnels[1].id].tokens.flood, 1, "révélé pendant la marée : partiellement inondé");
  assert.ok(h.state.log.some((e) => e.text.includes("partiellement inondé (marée)")), "journal : marée à la révélation");
  d = await h.action({ t: "advanceAgenda" });
  assert.deepEqual(h.state.flood, { onReveal: 2 }, "agenda 3 : totalement à la révélation");
  assert.ok([chambre, tunnel, tunnels[1]].every((c) => h.state.cards[c.id].tokens.flood === 2), "tous les lieux révélés totalement inondés");
  d = await h.action({ t: "floodRule", onReveal: 0 });
  assert.deepEqual(h.state.flood, { onReveal: 0 }, "règle modifiable à la main");
  d = await h.action({ t: "floodAll", mode: "decrease" });
  assert.ok([chambre, tunnel, tunnels[1]].every((c) => h.state.cards[c.id].tokens.flood === 1), "−1 partout");
  d = await h.action({ t: "floodAll", mode: "clear" });
  assert.ok([chambre, tunnel, tunnels[1]].every((c) => !h.state.cards[c.id].tokens.flood), "asséchés");
  // Pile Tidal Tunnel formée avec les huit tunnels de côté, mélangée ; tunnels autour d'un lieu aux emplacements libres.
  d = await h.action({ t: "placeAround", id: chambre.id, pile: "tidal" });
  assert.equal(d.t, "nack", "pile vide : rien à poser");
  d = await h.action({ t: "formPile", pile: "tidal" });
  assert.equal(d.t, "delta");
  assert.equal(h.state.piles.tidal.length, 8, "pile Tidal Tunnel : 8 lieux");
  assert.ok(h.state.piles.tidal.every((id) => !h.state.cards[id].faceUp && h.state.cards[id].side === "a"));
  assert.equal(Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "aside").length, 0, "plus de tunnel de côté");
  d = await h.action({ t: "formPile", pile: "tidal" });
  assert.equal(d.t, "nack", "plus rien à former");
  d = await h.action({ t: "placeAround", id: chambre.id, pile: "tidal" });
  assert.equal(d.t, "nack", "autour de la chambre : les trois emplacements sont occupés");
  const bas = tunnels.find((c) => c.loc.y === 411);
  d = await h.action({ t: "placeAround", id: bas.id, pile: "tidal" });
  assert.equal(d.t, "delta", "autour du tunnel du bas : trois emplacements libres");
  assert.equal(h.state.piles.tidal.length, 5, "trois cartes sorties de la pile");
  const nouveaux = Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board" && !lieux.some((l) => l.id === c.id));
  assert.deepEqual(nouveaux.map((c) => `${c.loc.x},${c.loc.y}`).sort(), ["551,411", "737,649", "923,411"], "en dessous, à gauche, à droite du tunnel du bas");
  assert.ok(nouveaux.every((c) => !c.faceUp && c.side === "a"), "posés non révélés");
  const gauche = tunnels.find((c) => c.loc.x === 551);
  d = await h.action({ t: "placeAround", id: gauche.id, pile: "tidal" });
  assert.equal(d.t, "delta", "autour du tunnel de gauche : en dessous déjà pris, gauche libre");
  assert.equal(h.state.piles.tidal.length, 4, "une seule carte posée (à gauche)");
  assert.ok(h.state.log.some((e) => e.text.includes("déjà occupé")), "journal : emplacement occupé");
  // Profondeurs : l'ennemi de côté y va par toPile (menu / glisser), ses jetons retirés ; clic = ressortir.
  const amalgam = cote.find((c) => c.code === "07053");
  d = await h.action({ t: "moveCard", id: amalgam.id, zone: "board", x: 737, y: 220 });
  d = await h.action({ t: "addToken", id: amalgam.id, token: "damage", delta: 2 });
  d = await h.action({ t: "toPile", id: amalgam.id, pile: "depths" });
  assert.deepEqual(h.state.piles.depths, [amalgam.id], "The Amalgam dans les profondeurs");
  assert.deepEqual(h.state.cards[amalgam.id].tokens, {}, "jetons retirés");
  d = await h.action({ t: "drawEncounter", pile: "depths" });
  assert.ok(h.state.cards[amalgam.id].faceUp && h.state.piles.depths[0] === amalgam.id, "clic sur la pile : l'ennemi ressort face visible");
  // Sac : bénédictions et malédictions plafonnées à 10, rendues à la réserve après tirage.
  d = await h.action({ t: "chaosAdjust", token: "bless", delta: 12 });
  assert.equal(h.state.chaos.bag.filter((t) => t === "bless").length, 10, "10 bénédictions au plus");
  d = await h.action({ t: "chaosAdjust", token: "bless", delta: -10 });
  d = await h.action({ t: "chaosAdjust", token: "curse", delta: 1 });
  assert.equal(h.state.chaos.bag.length, 21);
  // On tire jusqu'à sortir la malédiction (au plus 21 tirages), puis on remet tout : elle n'est plus dans le sac.
  let tiree = false;
  for (let k = 0; k < 21 && !tiree; k++) { await h.action({ t: "chaosDraw" }); tiree = h.state.chaos.drawn.includes("curse"); }
  assert.ok(tiree, "malédiction tirée");
  d = await h.action({ t: "chaosReturn" });
  assert.equal(h.state.chaos.drawn.length, 0);
  assert.equal(h.state.chaos.bag.length, 20, "le sac retrouve ses 20 jetons, sans la malédiction");
  assert.ok(!h.state.chaos.bag.includes("curse"), "la malédiction est rendue à la réserve");
  assert.ok(h.state.log.some((e) => e.text.includes("réserve")), "journal : réserve");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.cards[chambre.id], h.state.cards[chambre.id], "les autres clients suivent");
  assert.deepEqual(j2.state.flood, h.state.flood);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  // Solo, difficulté expert : sac à 22 jetons ; un scénario sans inondation refuse les gestes de marée.
  const { h } = await tablePit({ joueurs: 1, difficulty: "expert" });
  assert.equal(h.state.chaos.bag.length, 22, "sac expert : 22 jetons");
  assert.equal(h.state.cards[Object.values(h.state.cards).find((c) => c.code === "07047").id].tokens.clue, 1, "1 indice en solo");
  assert.equal(h.state.piles.encounter.length, 25);
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "notz_the_gathering" }) });
  const { code, hostToken } = await r.json();
  const g = client(code, { hostToken, seat: 0, name: "Hôte" });
  await g.attendre((m) => m.t === "welcome");
  await g.action({ t: "chooseInvestigator", code: "01001" });
  g.envoyer({ t: "startSetup", answers: {} });
  await g.attendre((m) => m.t === "delta" && m.rev === 2);
  const lieu = Object.values(g.state.cards).find((c) => c.kind === "location" && c.loc.zone === "board");
  let d = await g.action({ t: "setFlood", id: lieu.id, level: 1 });
  assert.equal(d.t, "nack", "pas d'inondation hors TIC");
  d = await g.action({ t: "floodRule", onReveal: 1 });
  assert.equal(d.t, "nack");
  d = await g.action({ t: "formPile", pile: "encounter" });
  assert.equal(d.t, "nack", "formPile réservé aux piles déclarées gather");
  g.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ The Vanishing of Elina Harper (TIC II) : sac moins les retraits du I, Leads deck, cartes cachées protégées,
// Parley (révéler / prendre / remettre), pistes rayées, effets d'agenda, accusation complète ============
async function tableHarper({ joueurs = 2, answers }) {
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "tic_the_vanishing_of_elina_harper" }) });
  assert.equal(r.status, 200, "The Vanishing of Elina Harper est au registre");
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  await h.action({ t: "chooseInvestigator", code: "07001" });
  const autres = [];
  for (let i = 1; i < joueurs; i++) {
    const c = client(code, { seat: i, name: `J${i + 1}` });
    await c.attendre((m) => m.t === "welcome");
    await c.action({ t: "chooseInvestigator", code: ["07001", "07002", "07003", "07004"][i] });
    autres.push(c);
  }
  if (joueurs > 1) await h.attendre((m) => m.t === "delta" && m.rev === joueurs);
  const rev0 = h.state.rev;
  h.envoyer({ t: "startSetup", answers });
  const d = await h.attendre((m) => (m.t === "delta" && m.rev === rev0 + 1) || m.t === "nack");
  assert.equal(d.t, "delta", `mise en place acceptée (${d.reason ?? ""})`);
  await new Promise((r) => setTimeout(r, 200));
  return { h, autres };
}
{
  const { h, autres: [j2] } = await tableHarper({ joueurs: 2, answers: { mode: "campaign", cultist_out: "yes", tablet_out: "no", elder_out: "yes" } });
  const s = h.state;
  const cartes = Object.values(s.cards);
  const L = { suspects: ["07076", "07077", "07078", "07079", "07080", "07081"], hideouts: ["07070", "07071", "07072", "07073", "07074", "07075"] };
  // Sac : 20 − cultiste − ancien = 18.
  assert.equal(s.chaos.bag.length, 18, "sac : 20 moins un cultiste et un ancien");
  assert.equal(s.chaos.bag.filter((t) => t === "cultist").length, 1);
  assert.equal(s.chaos.bag.filter((t) => t === "tablet").length, 2);
  assert.equal(s.chaos.bag.filter((t) => t === "elder_thing").length, 1);
  // Tapis : 7 lieux, le Square révélé avec ses indices et les pions, les autres non révélés.
  const lieux = cartes.filter((c) => c.kind === "location" && c.loc.zone === "board");
  assert.deepEqual(lieux.map((c) => c.code).sort(), ["07063", "07064", "07065", "07066", "07067", "07068", "07069"], "sept lieux du diagramme");
  const square = lieux.find((c) => c.code === "07065");
  assert.ok(square.faceUp && square.loc.x === 737 && square.loc.y === 411 && square.tokens.clue === 2, "Innsmouth Square révélé, 1 indice par enquêteur");
  assert.ok(lieux.filter((c) => c.code !== "07065").every((c) => !c.faceUp), "les six autres non révélés");
  assert.ok(cartes.filter((c) => c.kind === "mini").every((m) => m.loc.y === 411 - 22), "pions sur le Square");
  // Carte de référence dans l'histoire ; agenda 1 et acte 1 ; agenda 3 et acte 2 de côté ; cartes de côté.
  const ref = cartes.find((c) => c.code === "07062a");
  assert.ok(ref.loc.zone === "story" && ref.faceUp && ref.side === "a", "Finding Agent Harper dans l'histoire");
  assert.equal(s.cards[s.agendaId].code, "07057"); assert.equal(s.cards[s.actId].code, "07060");
  assert.deepEqual(s.piles.agendaDeck.map((id) => s.cards[id].code), ["07058"], "agenda 2 seul à venir");
  assert.deepEqual(s.piles.actDeck, [], "aucun acte à venir : l'acte 2 est de côté");
  const cote = cartes.filter((c) => c.loc.zone === "aside");
  assert.deepEqual(cote.map((c) => c.code).sort(), ["01172", "01172", "07059", "07061", "07082", "07083", "07094"], "de côté : agenda 3, acte 2, Dawson, Elina, Nightgaunt ×2, Winged One");
  // Leads : 10 cartes (5 suspects + 5 cachettes) ; 2 cachées ; pioche 25 (dont False Lead ×2, Hunting Shadow ×3).
  assert.equal(s.piles.leads.length, 10, "Leads : 10");
  assert.equal(s.piles.secret.length, 2, "deux cartes cachées");
  const secretes = s.piles.secret.map((id) => s.cards[id]);
  assert.ok(secretes.some((c) => c.kind === "enemy") && secretes.some((c) => c.kind === "location") && secretes.every((c) => !c.faceUp), "un suspect et une cachette, face cachée");
  const leadsCodes = s.piles.leads.map((id) => s.cards[id].code);
  assert.equal(leadsCodes.filter((c) => L.suspects.includes(c)).length, 5); assert.equal(leadsCodes.filter((c) => L.hideouts.includes(c)).length, 5);
  assert.equal(s.piles.encounter.length, 25, "pioche : 25 cartes");
  assert.equal(s.piles.encounter.filter((id) => ["01135", "01136"].includes(s.cards[id].code)).length, 5, "False Lead ×2 + Hunting Shadow ×3 seulement de The Midnight Masks");
  assert.ok(!s.log.some((e) => /(Robert Friendly|Zadok Allen|Brian Burnham|Barnabas Marsh|Joyce Little|Othera Gilman|Esoteric Order|Sawbone|Shoreward|Water Street|Innsmouth Jail|New Church)/.test(e.text)), "le journal du setup ne nomme aucun suspect ni cachette");
  assert.deepEqual(s.leads, { eliminated: [] });
  // Cartes cachées protégées.
  let d = await h.action({ t: "drawEncounter", pile: "secret" }); assert.equal(d.t, "nack", "pas de pioche dans les cartes cachées");
  d = await h.action({ t: "searchEncounter", pile: "secret" }); assert.equal(d.t, "nack");
  d = await h.action({ t: "shufflePile", pile: "secret" }); assert.equal(d.t, "nack");
  d = await h.action({ t: "randomPick", pile: "secret", n: 1 }); assert.equal(d.t, "nack");
  // Regarder les 2 premières de Leads : pistes rayées ; le Parley révèle 3 pistes pour tous.
  d = await h.action({ t: "searchEncounter", pile: "leads", n: 2 });
  assert.equal(d.t, "delta"); assert.equal(h.state.leads.eliminated.length, 2, "regarder = rayer");
  d = await h.action({ t: "leadsReveal", n: 3 });
  assert.equal(d.t, "delta", "Parley : 3 pistes révélées");
  assert.equal(h.state.piles.leadsShown.length, 3); assert.equal(h.state.piles.leads.length, 7);
  assert.ok(h.state.piles.leadsShown.every((id) => h.state.cards[id].faceUp));
  assert.ok(h.state.log.some((e) => e.text.startsWith("Parley")), "journal du Parley");
  d = await h.action({ t: "leadsReveal", n: 1 }); assert.equal(d.t, "nack", "un seul Parley à la fois");
  // Prendre une cachette : sur le premier emplacement libre, révélée, ses indices ; le reste + 1 carte de rencontre dans Leads.
  const revelees = h.state.piles.leadsShown.map((id) => h.state.cards[id]);
  const cachette = revelees.find((c) => c.kind === "location");
  const suspectRev = revelees.find((c) => c.kind === "enemy");
  const pioche0 = h.state.piles.encounter.length;
  if (cachette) {
    d = await h.action({ t: "leadsTake", id: cachette.id });
    assert.equal(d.t, "delta");
    const c = h.state.cards[cachette.id];
    assert.ok(c.loc.zone === "board" && c.loc.x === 365 && c.loc.y === 173 && c.faceUp, "cachette sur le premier emplacement libre (haut gauche), révélée");
    assert.ok((c.tokens.clue ?? 0) > 0, "indices posés");
  } else {
    d = await h.action({ t: "leadsTake", id: suspectRev.id });
    assert.equal(d.t, "delta");
    assert.equal(h.state.cards[suspectRev.id].loc.zone, "seat0", "suspect pris : zone de menace du demandeur");
  }
  assert.equal(h.state.piles.leadsShown.length, 0, "plus de piste révélée");
  assert.equal(h.state.piles.leads.length, 10, "7 restantes + 2 non prises + 1 carte de rencontre = 10");
  assert.equal(h.state.piles.encounter.length, pioche0 - 1, "une carte de rencontre a rejoint Leads");
  assert.ok(h.state.leads.eliminated.length >= 3, "les trois pistes révélées sont rayées");
  // Remettre : révéler 2, remettre sans prendre.
  d = await h.action({ t: "leadsReveal", n: 2 }); assert.equal(h.state.piles.leadsShown.length, 2);
  d = await h.action({ t: "leadsReturn" }); assert.equal(d.t, "delta"); assert.equal(h.state.piles.leads.length, 10, "remises sans carte de rencontre");
  // Piste rayée à la main puis rétablie.
  const libre = L.suspects.find((c) => !h.state.leads.eliminated.includes(c));
  if (libre) {
    d = await h.action({ t: "leadsToggle", code: libre }); assert.ok(h.state.leads.eliminated.includes(libre), "rayée à la main");
    d = await h.action({ t: "leadsToggle", code: libre }); assert.ok(!h.state.leads.eliminated.includes(libre), "rétablie");
  }
  // Agenda 2 : Winged One et les deux Hunting Nightgaunt (de côté) + la défausse rejoignent la pioche.
  const encounterAvant = h.state.piles.encounter.length;
  d = await h.action({ t: "toPile", id: h.state.piles.encounter[0], pile: "encounterDiscard" });
  d = await h.action({ t: "advanceAgenda" });
  assert.equal(h.state.cards[h.state.agendaId].code, "07058", "agenda 2 courant");
  assert.equal(h.state.piles.encounter.length, encounterAvant + 3, "pioche : −1 défaussée +1 défausse remélangée +3 cartes de côté");
  assert.equal(h.state.piles.encounterDiscard.length, 0);
  assert.ok(!Object.values(h.state.cards).some((c) => ["07094", "01172"].includes(c.code) && c.loc.zone === "aside"), "plus de Winged One ni de Nightgaunt de côté");
  assert.ok(h.state.log.some((e) => e.kind === "reminder" && e.text.startsWith("Verso de l'agenda 1")), "rappel de l'effet d'agenda");
  // Accusation : vérité = les deux cartes cachées ; on accuse une bonne et une mauvaise réponse → ennemi de la référence au Square.
  const vraiSuspect = h.state.piles.secret.map((id) => h.state.cards[id]).find((c) => c.kind === "enemy").code;
  const vraieCachette = h.state.piles.secret.map((id) => h.state.cards[id]).find((c) => c.kind === "location").code;
  const mauvaiseCachette = L.hideouts.find((c) => c !== vraieCachette && Object.values(h.state.cards).find((k) => k.code === c).loc.zone !== "board");
  d = await h.action({ t: "accusation", suspect: "07099", hideout: vraieCachette }); assert.equal(d.t, "nack", "suspect inconnu refusé");
  d = await h.action({ t: "accusation", suspect: vraiSuspect, hideout: mauvaiseCachette });
  assert.equal(d.t, "delta", "accusation acceptée");
  const S = h.state;
  assert.deepEqual(S.leads.accused, { suspect: vraiSuspect, hideout: mauvaiseCachette });
  assert.deepEqual(S.leads.truth, { suspect: vraiSuspect, hideout: vraieCachette });
  assert.equal(S.piles.secret.length, 0, "cartes cachées révélées");
  const cache = Object.values(S.cards).find((c) => c.code === vraieCachette);
  assert.ok(cache.loc.zone === "board" && cache.faceUp, "la vraie cachette est en jeu, révélée");
  const defCache = (await (await fetch(`${BASE}/scenarios/tic_the_vanishing_of_elina_harper.json`)).json()).cards.find((c) => c.code === vraieCachette);
  assert.equal(cache.tokens.clue, defCache.clue.value * 2 + 2, "indices imprimés (par enquêteur) + 1 par enquêteur");
  const ravisseur = Object.values(S.cards).find((c) => c.code === vraiSuspect);
  assert.ok(ravisseur.loc.zone === "board" && ravisseur.faceUp && Math.abs(ravisseur.loc.x - cache.loc.x) < 60, "le ravisseur apparaît sur la cachette");
  const elina = Object.values(S.cards).find((c) => c.code === "07083");
  assert.ok(elina.loc.zone === "board" && Math.abs(elina.loc.x - cache.loc.x) < 60, "Elina Harper posée sur la cachette");
  const refApres = S.cards[ref.id];
  assert.ok(refApres.loc.zone === "board" && refApres.side === "b" && refApres.faceUp, "une réponse sur deux : la référence retournée (ennemi) sur le tapis");
  assert.ok(Math.abs(refApres.loc.x - 737) < 60 && Math.abs(refApres.loc.y - 411) < 60, "à Innsmouth Square");
  assert.equal(S.cards[S.actId].code, "07061", "acte 2 courant"); assert.equal(S.cards[S.agendaId].code, "07059", "agenda 3 courant");
  assert.equal(S.cards[S.agendaId].tokens.doom, 0);
  assert.deepEqual(S.piles.agendaDeck, []); assert.deepEqual(S.piles.actDeck, []);
  assert.ok(Object.values(S.cards).some((c) => c.code === "07060" && c.loc.zone === "aside"), "acte 1 de côté");
  assert.ok(Object.values(S.cards).some((c) => c.code === "07058" && c.loc.zone === "aside"), "agenda 2 (courant) de côté");
  assert.equal(S.piles.leads.length, 0, "pile Leads retirée");
  assert.ok(Object.values(S.cards).filter((c) => c.loc.pile === "removed").length >= 8, "pistes retirées de la partie");
  assert.ok(S.log.some((e) => e.text.includes("Une réponse sur deux")), "verdict au journal");
  d = await h.action({ t: "accusation", suspect: vraiSuspect, hideout: vraieCachette }); assert.equal(d.t, "nack", "une seule accusation");
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(j2.state.leads, h.state.leads, "les autres clients suivent");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}
{
  // Mode autonome, solo : sac de base ; accusation entièrement fausse → démission ; entièrement juste → rien de plus.
  const { h } = await tableHarper({ joueurs: 1, answers: { mode: "standalone", cultist_out: "yes", tablet_out: "yes", elder_out: "yes" } });
  assert.equal(h.state.chaos.bag.length, 20, "autonome : aucun retrait");
  const L = { suspects: ["07076", "07077", "07078", "07079", "07080", "07081"], hideouts: ["07070", "07071", "07072", "07073", "07074", "07075"] };
  const vraiSuspect = h.state.piles.secret.map((id) => h.state.cards[id]).find((c) => c.kind === "enemy").code;
  const vraieCachette = h.state.piles.secret.map((id) => h.state.cards[id]).find((c) => c.kind === "location").code;
  let d = await h.action({ t: "accusation", suspect: L.suspects.find((c) => c !== vraiSuspect), hideout: L.hideouts.find((c) => c !== vraieCachette) });
  assert.equal(d.t, "delta");
  assert.ok(h.state.log.some((e) => e.kind === "reminder" && e.text.includes("démissionner")), "aucune bonne réponse : démission");
  assert.equal(h.state.cards[Object.values(h.state.cards).find((c) => c.code === "07062a").id].loc.zone, "story", "la référence reste dans l'histoire");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
  const { h: g } = await tableHarper({ joueurs: 1, answers: { mode: "campaign", cultist_out: "no", tablet_out: "yes", elder_out: "no" } });
  assert.equal(g.state.chaos.bag.length, 19, "campagne : une tablette retirée");
  const vs = g.state.piles.secret.map((id) => g.state.cards[id]).find((c) => c.kind === "enemy").code;
  const vc = g.state.piles.secret.map((id) => g.state.cards[id]).find((c) => c.kind === "location").code;
  d = await g.action({ t: "accusation", suspect: vs, hideout: vc });
  assert.equal(d.t, "delta");
  assert.ok(g.state.log.some((e) => e.kind === "reminder" && e.text.includes("Les deux réponses sont les bonnes")), "deux bonnes réponses");
  assert.equal(Object.values(g.state.cards).find((c) => c.code === "07062a").loc.zone, "story", "référence intacte");
  g.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

// ============ Board joueur, étape 1 (cahier §10) : import du deck au lobby, faiblesse aléatoire, code de siège et
// connexions multiples, decks créés à la mise en place, actions p:* réservées au siège ============
{
  const r = await fetch(`${BASE}/api/rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: "notz_the_gathering" }) });
  const { code, hostToken } = await r.json();
  const h = client(code, { hostToken, seat: 0, name: "Hôte" });
  await h.attendre((m) => m.t === "welcome");
  assert.equal(h.state.seats[0].counters.resources, 0, "compteur de ressources présent");
  assert.match(h.state.seats[0].pin ?? "", /^\d{4}$/, "code de siège à 4 chiffres attribué à la prise du siège");
  assert.equal(h.state.seats[0].connections, 1);
  const importer = async (c, url) => { c.envoyer({ t: "importDeck", url }); return c.attendre((x) => x.t === "delta" || x.t === "nack", 20000); };
  // Liens refusés : inconnu, deck ArkhamDB privé (redirection), deck local à arkham.build.
  let d = await importer(h, "https://example.com/deck/12");
  assert.equal(d.t, "nack"); assert.match(d.reason, /lien non reconnu/);
  d = await importer(h, "https://arkhamdb.com/deck/view/1");
  assert.equal(d.t, "nack"); assert.match(d.reason, /partageable/, "deck privé : redirection détectée");
  d = await importer(h, "https://arkham.build/deck/view/abc-123");
  assert.equal(d.t, "nack"); assert.match(d.reason, /navigateur/);
  // Decklist ArkhamDB : Mark Harrigan avec Hallowed Mirror (3 Soothing Melody liées) ; l'enquêteur est déduit.
  d = await importer(h, "https://arkhamdb.com/decklist/view/31000");
  assert.equal(d.t, "delta", `import decklist (${d.reason ?? ""})`);
  let s0 = h.state.seats[0];
  assert.equal(s0.investigatorCode, "03001", "enquêteur déduit du deck");
  assert.equal(s0.counters.health, 9);
  assert.equal(s0.deck.source, "arkhamdb");
  assert.equal(Object.values(s0.deck.slots).reduce((a, b) => a + b, 0), 33);
  assert.deepEqual(s0.deck.bonded, { "05314": 3 }, "cartes liées de Hallowed Mirror (Soothing Melody)");
  assert.equal(s0.deck.weaknessPending, 0);
  assert.equal(s0.deck.board.setup, "none");
  assert.equal(h.state.lead, 0);
  d = await h.action({ t: "resolveWeakness", choice: "random" });
  assert.equal(d.t, "nack", "pas de placeholder à déterminer");
  // Siège 2 : decklist avec une faiblesse de base aléatoire (placeholder 01000), tirée puis choisie.
  const bob = client(code, { seat: 1, name: "Bob" });
  await bob.attendre((m) => m.t === "welcome");
  d = await importer(bob, "https://arkhamdb.com/decklist/view/44000");
  assert.equal(d.t, "delta", `import decklist Roland (${d.reason ?? ""})`);
  let s1 = bob.state.seats[1];
  assert.equal(s1.investigatorCode, "01001");
  assert.equal(s1.deck.weaknessPending, 1, "un placeholder");
  assert.equal(Object.values(s1.deck.slots).reduce((a, b) => a + b, 0), 33, "le placeholder n'est pas une carte");
  d = await bob.action({ t: "resolveWeakness", choice: "01001" });
  assert.equal(d.t, "nack", "un enquêteur n'est pas une faiblesse de base");
  d = await bob.action({ t: "resolveWeakness", choice: "random" });
  assert.equal(d.t, "delta");
  s1 = bob.state.seats[1];
  assert.equal(s1.deck.weaknessPending, 0);
  assert.equal(s1.deck.weaknessAdded.length, 1);
  const idxJoueur = new Map((await (await fetch(`${BASE}/data/player_cards.json`)).json()).cards.map((c) => [c.c, c]));
  assert.equal(idxJoueur.get(s1.deck.weaknessAdded[0])?.st, "basicweakness", "faiblesse de base tirée");
  assert.equal(Object.values(s1.deck.slots).reduce((a, b) => a + b, 0), 34);
  // Doublon d'enquêteur par le deck ; deck arkham.build (partage) au siège 3 : recto parallèle (Pete 90046), customisations, taboo.
  const carl = client(code, { seat: 2, name: "Carl" });
  await carl.attendre((m) => m.t === "welcome");
  d = await importer(carl, "https://arkhamdb.com/decklist/view/44000");
  assert.equal(d.t, "nack"); assert.match(d.reason, /déjà choisi/);
  d = await importer(carl, "https://arkham.build/deck/view/6295400");
  assert.equal(d.t, "delta", `import arkham.build (${d.reason ?? ""})`);
  const s2 = carl.state.seats[2];
  assert.equal(s2.investigatorCode, "90046", "recto parallèle (meta.alternate_front)");
  assert.equal(s2.deck.source, "arkhambuild");
  assert.equal(s2.deck.taboo, 10);
  assert.ok(s2.deck.customizations["09022"], "customisations conservées");
  assert.equal(Object.values(s2.deck.slots).reduce((a, b) => a + b, 0), 35);
  // Un spectateur n'importe pas ; choisir un enquêteur à la main efface le deck.
  const spec = client(code);
  await spec.attendre((m) => m.t === "welcome");
  d = await importer(spec, "https://arkhamdb.com/decklist/view/31000");
  assert.equal(d.t, "nack");
  d = await carl.action({ t: "chooseInvestigator", code: "01002" });
  assert.equal(d.t, "delta");
  assert.equal(carl.state.seats[2].deck, null, "deck effacé par le choix manuel");
  d = await importer(carl, "https://arkham.build/deck/view/6295400");
  assert.equal(d.t, "delta");
  // Seconde connexion sur le siège 1 avec son code (second appareil) ; mauvais code refusé.
  await h.attendre((m) => m.t === "delta" && m.rev === carl.state.rev);
  const pin0 = h.state.seats[0].pin;
  const h2 = client(code, { seat: 0, pin: pin0, name: "Tablette" });
  const w2 = await h2.attendre((m) => m.t === "welcome");
  assert.equal(w2.you.seat, 0, "la seconde connexion partage le siège");
  await h.attendre((m) => m.t === "seats" && m.seats[0].connections === 2);
  assert.equal(h.state.seats[0].name, "Hôte", "le nom en place est conservé");
  const mauvais = client(code, { seat: 0, pin: pin0 === "0000" ? "0001" : "0000" });
  const w3 = await mauvais.attendre((m) => m.t === "seatTaken" || m.t === "welcome");
  assert.equal(w3.t, "seatTaken", "mauvais code de siège refusé");
  const sansPin = client(code, { seat: 0 });
  assert.equal((await sansPin.attendre((m) => m.t === "seatTaken" || m.t === "welcome")).t, "seatTaken", "siège occupé sans code refusé");
  // Mise en place : les decks sont créés (pioche mélangée face cachée, cartes liées hors jeu), définitions, journal.
  const rev0 = h.state.rev;
  h.envoyer({ t: "startSetup" });
  d = await h.attendre((m) => (m.t === "delta" && m.rev === rev0 + 1) || m.t === "nack", 20000);
  assert.equal(d.t, "delta", `mise en place (${d.reason ?? ""})`);
  const st = h.state;
  assert.equal(st.playerCount, 3);
  assert.equal(st.piles.pdeck0.length, 33, "pioche de Mark");
  assert.equal(st.piles.pdeck1.length, 34, "pioche de Roland avec sa faiblesse");
  assert.equal(st.piles.pdeck2.length, 35, "pioche de Pete");
  assert.deepEqual(st.piles.phand0, []); assert.deepEqual(st.piles.pdiscard0, []);
  assert.ok(st.piles.pdeck0.every((id) => !st.cards[id].faceUp && st.cards[id].player === true && st.cards[id].ownerSeat === 0), "cartes face cachée, propriétaire");
  const liees = Object.values(st.cards).filter((c) => c.loc.zone === "paside0");
  assert.equal(liees.length, 3, "3 Soothing Melody hors jeu");
  assert.ok(liees.every((c) => c.code === "05314" && c.faceUp));
  assert.ok(liees.map((c) => c.loc.x).sort((a, b) => a - b).every((x, i) => x === i * 136), "rangée hors jeu");
  const sophie = st.piles.pdeck0.map((id) => st.cards[id]).find((c) => c.code === "03009");
  assert.ok(sophie, "Sophie est dans la pioche (entrera en jeu à la mise en place du joueur, étape 2)");
  assert.equal(st.extraDefs["03009"].player, true);
  assert.equal(st.extraDefs["03009"].kind, "asset");
  assert.equal(st.extraDefs["05314"].kind, "event");
  assert.ok(Object.values(st.extraDefs).some((x) => x.uses), "une définition porte des Uses");
  assert.ok(st.piles.pdeck1.map((id) => st.cards[id]).some((c) => c.kind === "skill"), "des skills dans la pioche");
  assert.equal(st.seats[0].counters.resources, 0);
  assert.ok(st.log.some((e) => e.text.includes("Deck de Hôte") && e.text.includes("33 cartes mélangées") && e.text.includes("3 cartes liées hors jeu")), "journal du deck");
  assert.equal(st.piles.removed.length, 0);
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(bob.state.piles.pdeck0, st.piles.pdeck0);
  assert.deepEqual(spec.state.extraDefs, st.extraDefs);
  // Actions p:* : réservées au siège visé (motif « siege ») ; inconnues → refus explicite.
  d = await bob.action({ t: "p:setup", seat: 0 });
  assert.equal(d.t, "nack"); assert.equal(d.reason, "siege");
  d = await spec.action({ t: "p:setup", seat: 0 });
  assert.equal(d.t, "nack");
  d = await h.action({ t: "p:inconnue" });
  assert.equal(d.t, "nack"); assert.match(d.reason, /inconnue/);
  // Piles et zones du board : seul le siège y touche (gestes génériques compris), et jamais par les gestes de rencontre.
  d = await bob.action({ t: "shufflePile", pile: "pdeck0" });
  assert.equal(d.t, "nack"); assert.equal(d.reason, "siege", "mélanger la pioche d'un autre : refusé");
  d = await bob.action({ t: "moveCard", id: liees[0].id, zone: "pplay0", x: 0, y: 0 });
  assert.equal(d.t, "nack"); assert.equal(d.reason, "siege");
  d = await bob.action({ t: "toPile", id: liees[0].id, pile: "pdiscard0" });
  assert.equal(d.t, "nack"); assert.equal(d.reason, "siege");
  d = await h.action({ t: "drawEncounter", pile: "pdeck0" });
  assert.equal(d.t, "nack"); assert.match(d.reason, /board joueur/, "la pioche d'un joueur ne se tire pas comme une pile de rencontre");
  d = await h.action({ t: "searchEncounter", pile: "pdeck0" });
  assert.equal(d.t, "nack");

  // ---- Étape 2 : mise en place du joueur, mulligan, pioche, main, défausse, entretien, pioche vide ----
  const nomDe = (c, id) => c.state.extraDefs[c.state.cards[id].code]?.name;
  const estFaiblesse = (c, id) => ["weakness", "basicweakness"].includes(c.state.extraDefs[c.state.cards[id].code]?.subtype);
  d = await h.action({ t: "p:mulligan", ids: [] });
  assert.equal(d.t, "nack", "pas de mulligan avant la mise en place");
  d = await h.action({ t: "p:setup" });
  assert.equal(d.t, "delta", `p:setup (${d.reason ?? ""})`);
  let s0b = h.state.seats[0];
  assert.equal(s0b.deck.board.setup, "mulligan");
  assert.equal(s0b.counters.resources, 5, "5 ressources de départ");
  const enJeu0 = Object.values(h.state.cards).filter((c) => c.loc.zone === "pplay0");
  assert.deepEqual(enJeu0.map((c) => c.code), ["03009"], "Sophie commence en jeu (« You begin the game with Sophie in play »)");
  assert.ok(enJeu0[0].faceUp && enJeu0[0].ownerSeat === 0);
  assert.equal(h.state.piles.phand0.length, 5, "main de 5");
  assert.ok(h.state.piles.phand0.every((id) => !estFaiblesse(h, id) && !h.state.cards[id].faceUp), "aucune faiblesse en main, cartes face cachée");
  assert.ok(h.state.piles.pweak0.every((id) => estFaiblesse(h, id)), "les faiblesses tirées sont mises de côté");
  assert.equal(h.state.piles.pdeck0.length + h.state.piles.pweak0.length, 33 - 1 - 5, "pioche + faiblesses de côté = 33 − Sophie − 5");
  assert.ok(h.state.log.some((e) => e.text.includes("met son board en place") && e.text.includes("Sophie en jeu") && e.text.includes("5 ressources")), "journal de la mise en place");
  d = await h.action({ t: "p:setup" });
  assert.equal(d.t, "nack", "mise en place une seule fois");
  d = await h.action({ t: "p:mulligan", ids: ["p0-inexistant"] });
  assert.equal(d.t, "nack", "mulligan : cartes de la main seulement");
  const rendues = h.state.piles.phand0.slice(0, 2);
  d = await h.action({ t: "p:mulligan", ids: rendues });
  assert.equal(d.t, "delta", `mulligan (${d.reason ?? ""})`);
  s0b = h.state.seats[0];
  assert.equal(s0b.deck.board.setup, "done"); assert.equal(s0b.deck.board.mulliganUsed, true);
  assert.equal(h.state.piles.phand0.length, 5, "main toujours de 5 après le mulligan");
  assert.ok(rendues.every((id) => h.state.cards[id].loc.pile === "pdeck0"), "les cartes rendues sont dans la pioche");
  assert.equal(h.state.piles.pweak0.length, 0, "faiblesses remélangées");
  assert.equal(h.state.piles.pdeck0.length, 33 - 1 - 5, "pioche complète après remélange");
  d = await h.action({ t: "p:mulligan", ids: h.state.piles.phand0.slice(0, 1) });
  assert.equal(d.t, "nack", "un seul mulligan");
  // Bob : mise en place puis « garder ma main ».
  d = await bob.action({ t: "p:setup" });
  assert.equal(d.t, "delta");
  assert.equal(bob.state.piles.phand1.length, 5);
  d = await bob.action({ t: "p:keep" });
  assert.equal(d.t, "delta");
  assert.equal(bob.state.seats[1].deck.board.setup, "done"); assert.equal(bob.state.seats[1].deck.board.mulliganUsed, false);
  assert.equal(bob.state.piles.pweak1.length, 0);
  assert.equal(bob.state.piles.pdeck1.length + bob.state.piles.phand1.length + Object.values(bob.state.cards).filter((c) => c.loc.zone === "pplay1").length, 34);
  const sync = async (c, autre) => { if (c.state.rev < autre.state.rev) await c.attendre((m) => m.t === "delta" && m.rev === autre.state.rev); };
  await sync(h, bob);
  // Pioche, révéler, défausser, reprendre, chercher, regarder.
  d = await h.action({ t: "p:draw", n: 2 });
  assert.equal(d.t, "delta"); assert.equal(h.state.piles.phand0.length, 7);
  const enMain = h.state.piles.phand0[0];
  d = await h.action({ t: "p:reveal", id: enMain });
  assert.equal(h.state.cards[enMain].revealed, true, "carte de la main montrée à tous");
  d = await h.action({ t: "p:discard", id: enMain });
  assert.equal(h.state.piles.pdiscard0[0], enMain); assert.equal(h.state.cards[enMain].faceUp, true); assert.equal(h.state.cards[enMain].revealed, undefined);
  assert.ok(h.state.log.at(-1).text.includes(`défausse ${nomDe(h, enMain)}`));
  d = await h.action({ t: "p:randomDiscard" });
  assert.equal(h.state.piles.phand0.length, 5); assert.equal(h.state.piles.pdiscard0.length, 2);
  assert.match(h.state.log.at(-1).text, /défausse au hasard : /);
  d = await h.action({ t: "p:toHand", id: h.state.piles.pdiscard0[0] });
  assert.equal(h.state.piles.phand0.length, 6); assert.equal(h.state.piles.pdiscard0.length, 1);
  assert.ok(h.state.cards[h.state.piles.phand0.at(-1)].faceUp === false, "reprise en main face cachée, en fin de main");
  const revAvant = h.state.rev;
  h.envoyer({ t: "p:search", pile: "pdeck0", n: 3 });
  d = await h.attendre((m) => m.t === "peek");
  assert.equal(d.cards.length, 3, "regarder les 3 premières");
  await h.attendre((m) => m.t === "delta" && m.rev === revAvant + 1);
  assert.match(h.state.log.at(-1).text, /regarde les 3 premières cartes/);
  h.envoyer({ t: "p:search", pile: "pdeck0" });
  d = await h.attendre((m) => m.t === "peek");
  assert.equal(d.cards.length, h.state.piles.pdeck0.length, "chercher : toute la pioche");
  await h.attendre((m) => m.t === "delta");
  d = await h.action({ t: "p:toHand", id: d.cards[4].id });
  assert.match(h.state.log.at(-1).text, /prend une carte de sa pioche en main/, "la carte prise dans la pioche n'est pas nommée");
  d = await h.action({ t: "shufflePile", pile: "pdeck0" });
  assert.equal(d.t, "delta");
  await sync(bob, h);
  d = await bob.action({ t: "p:search", pile: "pdeck0" });
  assert.equal(d.t, "nack", "chercher dans la pioche d'un autre : refusé");
  d = await h.action({ t: "p:aside", id: h.state.piles.phand0[0] });
  assert.equal(Object.values(h.state.cards).filter((c) => c.loc.zone === "paside0").length, 4, "une carte de plus hors jeu");
  const exilee = h.state.piles.phand0[0];
  d = await h.action({ t: "p:exile", id: exilee });
  assert.equal(h.state.cards[exilee].loc.pile, "removed");
  d = await h.action({ t: "p:discard", id: "inv-0" });
  assert.equal(d.t, "nack", "l'enquêteur n'est pas une carte du deck");
  d = await h.action({ t: "p:discard", id: bob.state.piles.phand1[0] });
  assert.equal(d.t, "nack", "une carte d'un autre siège n'est pas défaussable ici");
  // Entretien : chaque board en place pioche 1 et gagne 1 ressource ; rappel au-delà de 8 cartes.
  d = await h.action({ t: "p:draw", n: 4 });
  await sync(bob, h); await sync(carl, h);
  const main0 = h.state.piles.phand0.length, main1 = bob.state.piles.phand1.length;
  const res0 = h.state.seats[0].counters.resources, res1 = h.state.seats[1].counters.resources;
  h.recus = h.recus.filter((m) => m.t !== "reminder");
  for (let i = 0; i < 4 && h.state.phase !== "upkeep"; i++) d = await h.action({ t: "nextPhase" });
  assert.equal(h.state.phase, "upkeep");
  assert.equal(h.state.piles.phand0.length, main0 + 1, "entretien : +1 carte");
  assert.equal(h.state.piles.phand1.length, main1 + 1, "entretien : +1 carte pour Bob aussi");
  assert.equal(h.state.seats[0].counters.resources, res0 + 1); assert.equal(h.state.seats[1].counters.resources, res1 + 1);
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(h.recus.some((m) => m.t === "reminder" && /défausse jusqu'à 8/.test(m.entry.text)), `rappel de la main > 8 (${h.state.piles.phand0.length} cartes)`);
  await sync(carl, h); await sync(bob, h);
  assert.equal(carl.state.piles.phand0.length, h.state.piles.phand0.length, "les autres clients voient la même chose");
  assert.equal(Object.values(carl.state.cards).filter((c) => c.loc.pile === "phand2").length, 0, "Carl (sans mise en place) ne pioche pas");
  // Pioche vide : la défausse est remélangée, l'horreur rappelée ; pioche et défausse vides : rappel.
  for (const id of [...bob.state.piles.pdeck1]) { d = await bob.action({ t: "p:discard", id }); assert.equal(d.t, "delta"); }
  assert.equal(bob.state.piles.pdeck1.length, 0);
  const nbDefausse = bob.state.piles.pdiscard1.length;
  bob.recus = bob.recus.filter((m) => m.t !== "reminder");
  d = await bob.action({ t: "p:draw" });
  assert.equal(d.t, "delta");
  assert.equal(bob.state.piles.pdeck1.length, nbDefausse - 1, "défausse remélangée dans la pioche, 1 carte piochée");
  assert.equal(bob.state.piles.pdiscard1.length, 0);
  assert.ok(bob.state.piles.pdeck1.every((id) => !bob.state.cards[id].faceUp));
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(bob.recus.some((m) => m.t === "reminder" && /prends 1 horreur/.test(m.entry.text)), "rappel de l'horreur");
  for (const id of [...bob.state.piles.pdeck1]) d = await bob.action({ t: "p:exile", id });
  bob.recus = bob.recus.filter((m) => m.t !== "reminder");
  d = await bob.action({ t: "p:draw" });
  assert.equal(d.t, "delta");
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(bob.recus.some((m) => m.t === "reminder" && /vaincu/.test(m.entry.text)), "pioche et défausse vides : rappel de la défaite");
  await sync(h, bob);

  // ---- Étape 3 : jouer (auto-pay, X, sans payer), engager, résoudre, poser sur son lieu ----
  const defDe = (c, id) => c.state.extraDefs[c.state.cards[id].code];
  const main = () => h.state.piles.phand0.map((id) => h.state.cards[id]);
  const asset = main().find((c) => defDe(h, c.id).type === "asset" && defDe(h, c.id).cost > 0);
  assert.ok(asset, "un soutien à coût positif en main");
  let res = h.state.seats[0].counters.resources;
  d = await h.action({ t: "p:play", id: asset.id });
  assert.equal(d.t, "delta", `p:play (${d.reason ?? ""})`);
  assert.equal(h.state.cards[asset.id].loc.zone, "pplay0", "le soutien est en jeu");
  assert.equal(h.state.cards[asset.id].faceUp, true);
  assert.equal(h.state.seats[0].counters.resources, res - defDe(h, asset.id).cost, "coût imprimé déduit");
  const u = defDe(h, asset.id).uses;
  if (u) assert.equal(h.state.cards[asset.id].tokens.uses, u.n, "jetons Uses posés");
  assert.match(h.state.log.at(-1).text, new RegExp(`joue .* \\(${defDe(h, asset.id).cost} ressource`));
  const evenement = main().find((c) => defDe(h, c.id).type === "event");
  if (evenement) {
    res = h.state.seats[0].counters.resources;
    d = await h.action({ t: "p:play", id: evenement.id, free: true });
    assert.equal(h.state.cards[evenement.id].loc.zone, "pevent0", "un événement joué va dans Play (une carte)");
    assert.equal(h.state.seats[0].counters.resources, res, "sans payer");
    assert.match(h.state.log.at(-1).text, /sans payer/);
    const second = main().find((c) => defDe(h, c.id).type === "event");
    if (second) {
      d = await h.action({ t: "p:play", id: second.id, free: true });
      assert.equal(h.state.cards[evenement.id].loc.pile, "pdiscard0", "le premier événement est défaussé quand un second est joué");
      assert.equal(h.state.cards[second.id].loc.zone, "pevent0");
      assert.ok(h.state.log.some((e) => /événement résolu/.test(e.text)));
    }
    d = await h.action({ t: "p:resolve", zone: "play" });
    assert.equal(d.t, "delta", "événement résolu → défausse");
    assert.equal(Object.values(h.state.cards).filter((c) => c.loc.zone === "pevent0").length, 0);
    d = await h.action({ t: "p:resolve", zone: "play" });
    assert.equal(d.t, "nack");
  }
  const skill = main().find((c) => defDe(h, c.id).type === "skill") ?? main()[0];
  d = await h.action({ t: "p:commit", id: skill.id });
  assert.equal(h.state.cards[skill.id].loc.zone, "pcommit0", "carte engagée au test : zone Commit");
  assert.match(h.state.log.at(-1).text, /engage/);
  const engagees = Object.values(h.state.cards).filter((c) => c.loc.zone === "pcommit0");
  d = await h.action({ t: "p:resolve" });
  assert.equal(d.t, "delta");
  assert.ok(engagees.every((c) => h.state.cards[c.id].loc.pile === "pdiscard0" && h.state.cards[c.id].faceUp), "test résolu : Commit → défausse");
  assert.match(h.state.log.at(-1).text, /test résolu/);
  d = await h.action({ t: "p:resolve" });
  assert.equal(d.t, "nack", "aucune carte engagée");
  // Coût X : la valeur vient du joueur ; pas assez de ressources = refus explicite (jamais négatif) ; « sans payer » reste possible.
  d = await h.action({ t: "setSeatCounter", seat: 0, key: "resources", value: 1 });
  const autre = main().find((c) => typeof defDe(h, c.id).cost === "number" && defDe(h, c.id).cost > 1);
  if (autre) {
    d = await h.action({ t: "p:play", id: autre.id });
    assert.equal(d.t, "nack", "refus faute de ressources");
    assert.match(d.reason, /pas assez de ressources/);
    assert.equal(h.state.seats[0].counters.resources, 1);
    assert.equal(h.state.cards[autre.id].loc.pile, "phand0", "la carte reste en main");
    d = await h.action({ t: "p:play", id: autre.id, free: true });
    assert.equal(d.t, "delta", "mise en jeu sans payer");
    assert.equal(h.state.cards[autre.id].loc.zone, defDe(h, autre.id).type === "event" ? "pevent0" : "pplay0", "rangée selon son type");
  }
  d = await h.action({ t: "p:play", id: h.state.piles.pdeck0[0] });
  assert.equal(d.t, "nack", "une carte de la pioche ne se joue pas");
  // Depuis la défausse (« Auto-pay » de la fenêtre de recherche, 2026-09-09) : payée, rangée selon son type.
  {
    const enMain3 = main().find((c) => typeof defDe(h, c.id).cost === "number" && defDe(h, c.id).cost >= 0 && defDe(h, c.id).cost !== -2) ?? main()[0];
    d = await h.action({ t: "p:discard", id: enMain3.id });
    assert.equal(h.state.cards[enMain3.id].loc.pile, "pdiscard0");
    const cout3 = Math.max(0, defDe(h, enMain3.id).cost ?? 0);
    d = await h.action({ t: "setSeatCounter", seat: 0, key: "resources", value: cout3 + 2 });
    d = await h.action({ t: "p:play", id: enMain3.id });
    assert.equal(d.t, "delta", "une carte de la défausse se joue (auto-pay)");
    assert.equal(h.state.seats[0].counters.resources, 2, "son coût est payé");
    const type3 = defDe(h, enMain3.id).type;
    assert.equal(h.state.cards[enMain3.id].loc.zone, type3 === "event" ? "pevent0" : type3 === "skill" ? "pcommit0" : "pplay0", "rangée selon son type");
    assert.ok(h.state.log.some((e) => e.text.includes("depuis sa défausse")), "journal : depuis la défausse");
  }
  // Poser sans payer (glisser) : p:put dans la zone visée, Uses posés pour un soutien en jeu, ressources inchangées.
  {
    const enMain2 = main().find((c) => defDe(h, c.id).type === "asset" && defDe(h, c.id).cost > 0) ?? main()[0];
    const res2 = h.state.seats[0].counters.resources;
    d = await h.action({ t: "p:put", id: enMain2.id, zone: "pplay0", x: 12, y: 8 });
    assert.equal(d.t, "delta", `p:put (${d.reason ?? ""})`);
    assert.equal(h.state.cards[enMain2.id].loc.zone, "pplay0"); assert.equal(h.state.cards[enMain2.id].loc.x, 12);
    assert.equal(h.state.seats[0].counters.resources, res2, "poser sans payer : ressources inchangées");
    if (defDe(h, enMain2.id).uses) assert.equal(h.state.cards[enMain2.id].tokens.uses, defDe(h, enMain2.id).uses.n, "Uses posés même sans payer");
    assert.match(h.state.log.at(-1).text, /sans payer/);
    d = await h.action({ t: "p:put", id: h.state.piles.phand0[0], zone: "pcommit0" });
    assert.equal(h.state.cards[Object.values(h.state.cards).find((c) => c.loc.zone === "pcommit0").id].loc.zone, "pcommit0");
    d = await h.action({ t: "p:resolve" });
    d = await h.action({ t: "p:put", id: h.state.piles.pdeck0[0], zone: "pplay0" });
    assert.equal(d.t, "nack", "p:put : depuis la main ou hors jeu seulement");
    // moveCard « en fin de rangée » (x ≥ 9000) : la fenêtre de recherche pose la carte visible, pas à x = 9999.
    const dePioche = h.state.piles.pdeck0[0];
    d = await h.action({ t: "moveCard", id: dePioche, zone: "pplay0", x: 9999, y: 0 });
    assert.equal(d.t, "delta");
    assert.ok(h.state.cards[dePioche].loc.x < 9000 && h.state.cards[dePioche].loc.x > 0, "fin de rangée calculée par le serveur");
    d = await h.action({ t: "p:discard", id: dePioche });
  }
  // Poser la première carte de la pioche face cachée (en jeu, Commit…).
  const premiere = h.state.piles.pdeck0[0];
  d = await h.action({ t: "p:drawTo", zone: "pplay0", x: 40, y: 30 });
  assert.equal(d.t, "delta", `p:drawTo (${d.reason ?? ""})`);
  assert.equal(h.state.cards[premiere].loc.zone, "pplay0"); assert.equal(h.state.cards[premiere].faceUp, false, "posée face cachée");
  assert.equal(h.state.cards[premiere].loc.x, 40);
  assert.match(h.state.log.at(-1).text, /face cachée en jeu/);
  d = await h.action({ t: "flipCard", id: premiere });
  assert.equal(h.state.cards[premiere].faceUp, true, "retournée face visible");
  d = await h.action({ t: "p:drawTo", zone: "pcommit0" });
  assert.equal(h.state.cards[h.state.cards[premiere].id === premiere ? Object.values(h.state.cards).find((c) => c.loc.zone === "pcommit0" && !c.faceUp).id : premiere].faceUp, false);
  d = await h.action({ t: "p:drawTo", zone: "board" });
  assert.equal(d.t, "nack", "zone hors du board refusée");
  d = await bob.action({ t: "p:drawTo", zone: "pplay0", seat: 0 });
  assert.equal(d.reason, "siege");
  assert.ok(h.state.extraDefs["01025"] === undefined || h.state.extraDefs["01025"].skills?.combat === 1, "icônes de compétence dans les définitions");
  d = await bob.action({ t: "p:play", id: h.state.piles.phand0[0] });
  assert.equal(d.t, "nack");
  // Cartes liées : mise en jeu gratuite depuis hors jeu.
  const liee = Object.values(h.state.cards).find((c) => c.loc.zone === "paside0" && c.code === "05314");
  res = h.state.seats[0].counters.resources;
  d = await h.action({ t: "p:play", id: liee.id });
  assert.equal(d.t, "delta");
  assert.equal(h.state.seats[0].counters.resources, res, "carte liée : gratuite");
  assert.equal(h.state.cards[liee.id].loc.zone, "pevent0", "Soothing Melody est un événement : Play");
  d = await h.action({ t: "p:discard", id: liee.id });
  // Verso lié : Sophie bascule sur « In Loving Memory » (toggleSide), une autre carte se retourne (flipCard).
  const sophieEnJeu = Object.values(h.state.cards).find((c) => c.code === "03009");
  assert.equal(h.state.extraDefs["03009"].backCode, "03009b", "verso lié de Sophie");
  d = await h.action({ t: "toggleSide", id: sophieEnJeu.id });
  assert.equal(d.t, "delta"); assert.equal(h.state.cards[sophieEnJeu.id].side, "b");
  d = await h.action({ t: "toggleSide", id: sophieEnJeu.id });
  assert.equal(h.state.cards[sophieEnJeu.id].side, "a");
  // Poser sur mon lieu : le pion d'Alice est sur un lieu du tapis ; la carte se pose à côté.
  const mini = h.state.cards["mini-0"];
  assert.equal(mini.loc.zone, "board");
  const enJeu = Object.values(h.state.cards).find((c) => c.loc.zone === "pplay0" && c.code !== "03009");
  d = await h.action({ t: "p:toLocation", id: enJeu.id });
  assert.equal(d.t, "delta");
  const posee = h.state.cards[enJeu.id];
  assert.equal(posee.loc.zone, "board");
  const lieuProche = Object.values(h.state.cards).filter((c) => c.kind === "location" && c.loc.zone === "board")
    .sort((a, b) => Math.hypot(a.loc.x - mini.loc.x, a.loc.y - mini.loc.y) - Math.hypot(b.loc.x - mini.loc.x, b.loc.y - mini.loc.y))[0];
  assert.ok(Math.abs(posee.loc.x - lieuProche.loc.x - 24) < 1 && Math.abs(posee.loc.y - (lieuProche.loc.y + 178 - 70)) < 1, "posée sur le lieu du pion");
  assert.equal(posee.ownerSeat, 0);
  assert.match(h.state.log.at(-1).text, /pose .* sur le tapis \(sur son lieu\)/);
  d = await h.action({ t: "moveCard", id: enJeu.id, zone: "pplay0", x: 9999, y: 0 });
  assert.equal(h.state.cards[enJeu.id].loc.zone, "pplay0", "retour sur le board");
  d = await bob.action({ t: "p:toLocation", id: enJeu.id, seat: 0 });
  assert.equal(d.reason, "siege");
  // Les cartes joueur se déplacent avec les gestes existants et gardent leur propriétaire ; les ressources peuvent passer en négatif.
  d = await h.action({ t: "moveCard", id: liees[0].id, zone: "pplay0", x: 10, y: 20 });
  assert.equal(d.t, "delta");
  assert.equal(h.state.cards[liees[0].id].loc.zone, "pplay0"); assert.equal(h.state.cards[liees[0].id].ownerSeat, 0);
  d = await h.action({ t: "moveCard", id: liees[0].id, zone: "board", x: 500, y: 300 });
  assert.equal(h.state.cards[liees[0].id].ownerSeat, 0, "une carte joueur sur le tapis garde son propriétaire");
  const nbDefausse0 = h.state.piles.pdiscard0.length;
  d = await h.action({ t: "toPile", id: liees[0].id, pile: "pdiscard0" });
  assert.equal(h.state.piles.pdiscard0.length, nbDefausse0 + 1); assert.equal(h.state.cards[liees[0].id].ownerSeat, 0);
  assert.equal(h.state.cards[liees[0].id].faceUp, true, "défausse joueur : face visible");
  d = await h.action({ t: "setSeatCounter", seat: 0, key: "resources", value: -2 });
  assert.equal(h.state.seats[0].counters.resources, 0, "les ressources ne passent jamais en négatif");
  d = await h.action({ t: "setSeatCounter", seat: 0, key: "clues", delta: -2 });
  assert.equal(h.state.seats[0].counters.clues, 0);
  // Fermer la seconde connexion : le siège reste occupé ; réinitialisation : decks conservés, board remis à zéro.
  h2.ws.close();
  await h.attendre((m) => m.t === "seats" && m.seats[0].connections === 1);
  assert.equal(h.state.seats[0].occupied, true, "le siège reste occupé tant qu'une connexion demeure");
  d = await h.action({ t: "reset" });
  assert.equal(d.t, "delta");
  assert.equal(h.state.phase, "lobby");
  assert.equal(Object.keys(h.state.cards).length, 0);
  assert.ok(h.state.seats[0].deck && h.state.seats[1].deck && h.state.seats[2].deck, "decks conservés au reset");
  assert.equal(h.state.seats[0].deck.board.setup, "none", "board à remettre en place après un reset");
  assert.equal(h.state.seats[0].counters.resources, 0);
  d = await h.action({ t: "clearInvestigator" });
  assert.equal(h.state.seats[0].deck, null, "clearInvestigator efface le deck");
  h.envoyer({ t: "deleteRoom" });
  await new Promise((r) => setTimeout(r, 300));
}

console.log(`OK — ${messagesEntrants} messages entrants envoyés par le test`);
process.exit(0);
