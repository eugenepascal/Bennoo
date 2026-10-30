/**
 * Point d'entrée : vérifie la configuration, suit l'état de connexion et affiche l'écran
 * correspondant à l'adresse (#/...). Le routage par ancre fonctionne sur tout hébergement statique.
 *
 * Chaque écran renvoie { node, title, nav } : nav indique l'onglet actif de la barre de
 * navigation (null = écran sans barre, comme la connexion ou la création d'événement).
 */
import { h } from "./dom.js";
import { isConfigured } from "./config.js";
import { tabbar } from "./ui.js";

const root = document.getElementById("app");
document.getElementById("skip")?.addEventListener("click", () => root.querySelector("h1")?.focus());

function show({ node, title, nav = null }) {
  document.body.classList.toggle("with-nav", Boolean(nav));
  root.replaceChildren(node, nav ? tabbar(nav) : "");
  document.title = title ? `${title} · Bennoo` : "Bennoo";
  // Le focus va au titre de l'écran : les lecteurs d'écran annoncent le changement de page.
  const heading = root.querySelector("h1");
  if (heading) {
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }
  window.scrollTo(0, 0);
}

function message(title, text) {
  return { node: h("main", { class: "screen no-nav" }, h("div", { class: "card" }, h("h1", {}, title), h("p", { class: "muted" }, text))), title };
}

if (!isConfigured()) {
  show(message("Configuration manquante", "Le projet Firebase n'est pas encore relié à ce site (fichier js/config.js)."));
} else {
  start().catch((err) => {
    console.error(err);
    show(message("Chargement impossible", "Bennoo n'a pas pu se charger. Vérifiez votre connexion internet puis rechargez la page."));
  });
}

async function start() {
  const fb = await import("./firebase.js");
  const screens = await import("./screens.js");
  let user = null;
  let ready = false;
  let seq = 0;

  async function route() {
    if (!ready) return;
    const mySeq = ++seq;
    const path = location.hash.replace(/^#/, "") || "/";
    const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
    const [head, a, b] = parts;

    const render = async (promise) => {
      try {
        const result = await promise;
        if (mySeq === seq && result) show(result); // un écran plus récent a déjà été demandé
      } catch (err) {
        console.error(err);
        if (mySeq === seq) show(screens.errorScreen(err));
      }
    };

    if (head === "conditions") return render(screens.termsScreen());

    if (!user) {
      // Un lien d'invitation ouvert sans être connecté est gardé pour après la connexion.
      if (head === "rejoindre") sessionStorage.setItem("bennoo:after-login", path);
      if (head === "inscription") return render(screens.signupScreen());
      if (head === "connexion") return render(screens.loginScreen());
      if (head === "mot-de-passe-oublie") return render(screens.resetScreen());
      if (head === "decouvrir") return render(screens.onboardingScreen(Number(a) || 0));
      return render(screens.launchScreen());
    }
    if (!user.emailVerified) return render(screens.verifyScreen(user));

    if (["connexion", "inscription", "mot-de-passe-oublie", "decouvrir"].includes(head)) {
      location.hash = "#/";
      return;
    }
    const pending = sessionStorage.getItem("bennoo:after-login");
    if (pending) {
      sessionStorage.removeItem("bennoo:after-login");
      location.hash = pending;
      return;
    }

    if (!head) return render(screens.homeScreen());
    if (head === "familles") return render(screens.familiesScreen());
    if (head === "famille" && a && b === "membre" && parts[3]) return render(screens.memberScreen(a, parts[3]));
    if (head === "famille" && a) return render(screens.familyScreen(a, b));
    if (head === "nouvel-evenement") return render(screens.newEventScreen(a));
    if (head === "evenement" && a && b) return render(screens.eventScreen(a, b, parts[3]));
    if (head === "rejoindre" && a && b) return render(screens.joinScreen(a, b));
    if (head === "plus") return render(screens.settingsScreen());
    if (head === "profil") return render(screens.profileScreen());
    return render(screens.notFoundScreen());
  }

  fb.onAuthStateChanged(fb.auth, (u) => {
    user = u;
    ready = true;
    route();
  });
  window.addEventListener("hashchange", route);
  // Après vérification de l'email, l'écran « vérifiez votre email » demande un nouveau routage.
  window.addEventListener("bennoo:refresh", () => {
    user = fb.auth.currentUser;
    route();
  });
}
