/**
 * Point d'entrée : vérifie la configuration, suit l'état de connexion et affiche l'écran
 * correspondant à l'adresse (#/...). Routage par ancre : fonctionne sur tout hébergement statique.
 */
import { h, loading, alertBox } from "./dom.js";
import { isConfigured } from "./config.js";

const main = document.getElementById("main");
const nav = document.getElementById("nav");
// Lien d'évitement : un bouton, pour ne pas interférer avec le routage par ancre.
document.getElementById("skip")?.addEventListener("click", () => main.focus());

function setScreen(node, title) {
  main.replaceChildren(node);
  document.title = title ? `${title} · Bennoo` : "Bennoo";
  // Le focus va au titre de l'écran : les lecteurs d'écran annoncent le changement de page.
  const heading = main.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

if (!isConfigured()) {
  setScreen(h("div", { class: "card" },
    h("h1", {}, "Configuration manquante"),
    alertBox("Le projet Firebase n'est pas encore relié à ce site (fichier js/config.js)."),
  ), "Configuration");
} else {
  start().catch((err) => {
    console.error(err);
    setScreen(h("div", { class: "card" }, h("h1", {}, "Chargement impossible"),
      alertBox("Bennoo n'a pas pu se charger. Vérifiez votre connexion internet puis rechargez la page.")), "Erreur");
  });
}

async function start() {
  main.replaceChildren(loading());
  const fb = await import("./firebase.js");
  const views = await import("./views.js");

  let user = null;
  let ready = false;

  async function route() {
    if (!ready) return;
    const path = location.hash.replace(/^#/, "") || "/";
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);

    renderNav(user && user.emailVerified);

    // Un lien d'invitation ouvert sans être connecté est gardé pour après la connexion.
    if (!user) {
      if (parts[0] === "rejoindre") sessionStorage.setItem("bennoo:after-login", path);
      if (parts[0] === "mot-de-passe-oublie") return setScreen(views.resetScreen(), "Mot de passe oublié");
      return setScreen(views.authScreen(parts[0] === "inscription" ? "signup" : "signin"), "Connexion");
    }
    if (!user.emailVerified) return setScreen(views.verifyScreen(user), "Vérifiez votre email");

    // Déjà connecté : les pages de connexion ramènent à l'accueil.
    if (["connexion", "inscription", "mot-de-passe-oublie"].includes(parts[0])) {
      location.hash = "#/";
      return;
    }

    const pending = sessionStorage.getItem("bennoo:after-login");
    if (pending) {
      sessionStorage.removeItem("bennoo:after-login");
      location.hash = pending;
      return;
    }

    main.replaceChildren(loading());
    try {
      const [head, a, b] = parts;
      if (!head) return setScreen(await views.homeScreen(), "Accueil");
      if (head === "profil") return setScreen(await views.profileScreen(), "Mon profil");
      if (head === "famille" && a) return setScreen(await views.familyScreen(a), "Famille");
      if (head === "nouvel-evenement" && a) return setScreen(await views.newEventScreen(a), "Nouvel événement");
      if (head === "evenement" && a && b) return setScreen(await views.eventScreen(a, b), "Événement");
      if (head === "rejoindre" && a && b) return setScreen(await views.joinScreen(a, b), "Rejoindre une famille");
      return setScreen(views.notFoundScreen(), "Page introuvable");
    } catch (err) {
      console.error(err);
      setScreen(views.errorScreen(err), "Erreur");
    }
  }

  function renderNav(full) {
    nav.replaceChildren(...(full ? [
      h("a", { href: "#/" }, "Accueil"),
      h("a", { href: "#/profil" }, "Profil"),
      h("button", { type: "button", class: "link", onclick: async () => { await fb.signOut(fb.auth); location.hash = "#/"; } }, "Se déconnecter"),
    ] : []));
  }

  fb.onAuthStateChanged(fb.auth, (u) => {
    user = u;
    ready = true;
    route();
  });
  window.addEventListener("hashchange", route);
  // Après vérification de l'email dans un autre onglet, l'écran « vérifiez votre email »
  // demande un rafraîchissement : on relance le routage.
  window.addEventListener("bennoo:refresh", () => { user = fb.auth.currentUser; route(); });
}
