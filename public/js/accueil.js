// Accueil : champ « rejoindre par code ».
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const champ = document.getElementById("code");
const bouton = document.getElementById("rejoindre");
const aide = document.getElementById("aide-code");

function normaliser(v) {
  return v.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1")
          .split("").filter((c) => ALPHABET.includes(c)).join("").slice(0, 6);
}

champ.addEventListener("input", () => {
  champ.value = normaliser(champ.value);
  aide.classList.remove("erreur");
});

function rejoindre() {
  const code = normaliser(champ.value);
  if (code.length !== 6) {
    aide.textContent = "Le code doit faire six caractères (lettres et chiffres, sans O, I ni L).";
    aide.classList.add("erreur");
    champ.focus();
    return;
  }
  location.href = `/r/${code}`;
}

bouton.addEventListener("click", rejoindre);
champ.addEventListener("keydown", (e) => { if (e.key === "Enter") rejoindre(); });
