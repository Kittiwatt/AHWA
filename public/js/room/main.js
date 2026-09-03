// Page de table : connexion à la room, chargement des données figées, rendu lobby / tapis.

import { creerConnexion } from "./net.js";
import { rendreLobby, copierLien } from "./lobby.js";
import { rendreTapis, initPlateau, initLoupe, ajusterVue, oublierVue, encart, PHASES } from "./tapis.js";
import { CDN } from "./cartes.js";

const code = location.pathname.split("/").filter(Boolean)[1]?.toUpperCase() ?? "";
const $etat = document.getElementById("etat");
const $lobby = document.getElementById("lobby");
const $tapis = document.getElementById("tapis");
const $code = document.getElementById("code");
const $titre = document.getElementById("titre-scenario");
const $moi = document.getElementById("moi");

$code.textContent = code || "······";

function erreurFatale(texte) {
  $etat.hidden = false;
  $etat.textContent = texte;
  $etat.classList.add("erreur");
  $lobby.hidden = true;
  $tapis.hidden = true;
}

if (!/^[A-Z2-9]{6}$/.test(code)) {
  erreurFatale("Ce code de table n'est pas valide.");
} else {
  demarrer();
}

async function demarrer() {
  const ctx = {
    etat: null,
    envoyer: null,
    scenario: null,
    defs: new Map(),
    investigateurs: new Map(),
    listeInvestigateurs: [],
    campagneBoite: "",
  };

  // Index des investigateurs (figé au build) — nécessaire au lobby comme au tapis.
  try {
    const r = await fetch("/data/investigators.json");
    const data = await r.json();
    ctx.listeInvestigateurs = data.investigators;
    for (const i of data.investigators) ctx.investigateurs.set(i.code, i);
  } catch {
    encart("L'index des enquêteurs n'a pas pu être chargé ; rechargez la page.", "erreur");
  }

  let scenarioCharge = null;
  async function chargerScenario(id) {
    if (scenarioCharge === id) return;
    const [r, lib] = await Promise.all([fetch(`/scenarios/${id}.json`), fetch("/data/library.json")]);
    ctx.scenario = await r.json();
    for (const c of ctx.scenario.cards) ctx.defs.set(c.code, c);
    try {
      const data = await lib.json();
      const camp = data.campaigns.find((c) => c.id === ctx.scenario.campaignId);
      ctx.campagneBoite = camp?.box ?? "";
    } catch { /* étiquette facultative */ }
    scenarioCharge = id;
    $titre.textContent = ctx.scenario.title;
    document.title = `${ctx.scenario.title} · table ${code} — Anofelis`;
  }

  const hostToken = () => localStorage.getItem(`ahwa:host:${code}`) ?? "";
  const nom = localStorage.getItem("ahwa:nom") ?? "";

  const cnx = creerConnexion({
    code, hostToken, seat: null, name: nom,
    on: {
      ouvert() { $etat.hidden = true; },
      async etat(genre) {
        await chargerScenario(ctx.etat.state.scenarioId);
        rendre();
        if (genre === "welcome") verifierCdn();
      },
      hostToken(token) { localStorage.setItem(`ahwa:host:${code}`, token); encart("Vous êtes maintenant l'hôte de la table.", "info"); },
      rappel(entry) { encart(entry.text, "rappel"); },
      refus(raison) { encart(raison, "erreur"); },
      ferme(codeFermeture) {
        if (codeFermeture === 4404) erreurFatale("Aucune table ne porte ce code. Vérifiez-le, ou créez une table depuis la bibliothèque.");
        else if (codeFermeture === 4410) erreurFatale("Cette table a été purgée après sept jours sans activité.");
        else if (codeFermeture === 4411) erreurFatale("Cette table a été supprimée par son hôte.");
        else if (![1000, 1001].includes(codeFermeture)) { $etat.hidden = false; $etat.textContent = "Connexion interrompue, nouvelle tentative…"; }
      },
    },
  });
  ctx.etat = cnx.etat;
  ctx.envoyer = cnx.envoyer;

  initPlateau();
  initLoupe(ctx);
  document.addEventListener("ahwa:recentrer", () => ajusterVue(ctx));
  document.addEventListener("ahwa:info", (e) => encart(e.detail, "info"));
  document.getElementById("copier").addEventListener("click", copierLien);
  window.addEventListener("resize", () => { if (!$tapis.hidden) ajusterVue(ctx); });

  let phasePrecedente = null;
  function rendre() {
    const { state, moi } = ctx.etat;
    $moi.textContent = moi.seat === null ? (moi.isHost ? "Hôte (spectateur)" : "Spectateur") : `Siège ${moi.seat + 1}${moi.isHost ? " · hôte" : ""}`;
    const auLobby = state.phase === "lobby";
    if (auLobby) {
      $tapis.hidden = true;
      $lobby.hidden = false;
      rendreLobby($lobby, ctx);
      oublierVue();
    } else {
      $lobby.hidden = true;
      $tapis.hidden = false;
      rendreTapis(ctx);
    }
    if (phasePrecedente !== null && phasePrecedente !== state.phase && !auLobby) {
      encart(PHASES[state.phase] ?? state.phase, "info");
    }
    phasePrecedente = state.phase;
  }

  // Le CDN d'images doit être joignable en jeu : sondé avec une image, jamais avec fetch (pas de CORS).
  function verifierCdn() {
    const img = new Image();
    img.onerror = () => { document.getElementById("bandeau-cdn").hidden = false; };
    img.src = `${CDN}01111b.webp`;
  }
}
