/**
 * Écrans de l'étape 1, construits d'après les maquettes (dossier maquettes/ du dépôt).
 * Chaque bouton déclenche une vraie action ; aucune donnée d'exemple n'est affichée.
 * Les rubriques des étapes suivantes (tâches, budget, invités, album) n'apparaissent pas encore.
 */
import { h, field, alertBox, showFormError, withBusy, toast } from "./dom.js";
import { avatar, header, EVENT_ICONS } from "./ui.js";
import {
  auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification,
  sendPasswordResetEmail, updateProfile,
} from "./firebase.js";
import * as data from "./data.js";
import {
  EVENT_TYPES, FAMILY_ROLES, EVENT_ROLES, CURRENCIES, cleanName, normalizePhone, parseAmount, formatAmount,
  countdownLabel, daysUntil, formatDate, inviteUrl, whatsappShareUrl, inviteMessage, authErrorMessage,
  checkPassword, isToken,
} from "./lib/format.js";

const errMsg = (err) => (err?.code ? authErrorMessage(err.code) : err?.message || authErrorMessage());
const values = (form) => Object.fromEntries(new FormData(form).entries());
const enc = encodeURIComponent;
const firstName = (name) => String(name || "").trim().split(/\s+/)[0] || "";
const screen = (...children) => h("main", { class: "screen", id: "contenu" }, ...children);
const bare = (...children) => h("main", { class: "screen no-nav", id: "contenu" }, ...children);

function passwordField(label, name, autocomplete, help) {
  const input = h("input", { class: "input", type: "password", name, id: `f-${name}`, required: true, minlength: 8, autocomplete });
  const toggle = h("button", { type: "button", "aria-label": "Afficher", title: "Afficher les caractères", "aria-pressed": "false" }, "👁");
  toggle.addEventListener("click", () => {
    const visible = input.type === "password";
    input.type = visible ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(visible));
    toggle.setAttribute("aria-label", visible ? "Masquer" : "Afficher");
  });
  return h("div", { class: "field" },
    h("label", { for: `f-${name}` }, label),
    h("div", { class: "password" }, input, toggle),
    help ? h("p", { class: "help" }, help) : null);
}

// ─── 1. Écran de lancement ────────────────────────────────────────────────
export function launchScreen() {
  const node = h("main", { class: "launch", id: "contenu" },
    h("div", {},
      h("img", { src: "/img/logo.svg", alt: "", class: "logo", width: 108, height: 108 }),
      h("h1", {}, "Bennoo"),
      h("p", { class: "tag" }, "Ensemble pour vos moments précieux"),
    ),
    h("div", { class: "circle", "aria-hidden": "true" }, "👨‍👩‍👧‍👦"),
    h("div", { class: "actions" },
      h("a", { href: "#/decouvrir/0", class: "btn btn-primary btn-block" }, "Commencer"),
      h("a", { href: "#/connexion", class: "btn btn-light btn-block" }, "Se connecter"),
    ),
  );
  return { node, title: "Bienvenue" };
}

// ─── 2. Onboarding ────────────────────────────────────────────────────────
const SLIDES = [
  { art: "💍", title: "Organisez vos événements en famille", text: "Mariages, baptêmes, anniversaires et plus encore, en toute sérénité." },
  { art: "📋", title: "Une organisation plus simple", text: "Répartissez les rôles, invitez vos proches et suivez la préparation ensemble." },
  { art: "📸", title: "Des souvenirs pour toujours", text: "Gardez au même endroit les moments importants de votre famille." },
];
export function onboardingScreen(i) {
  const idx = Math.min(Math.max(i, 0), SLIDES.length - 1);
  const s = SLIDES[idx];
  const last = idx === SLIDES.length - 1;
  const node = h("main", { class: "onboard", id: "contenu" },
    h("div", { class: "art", "aria-hidden": "true" }, s.art),
    h("h1", {}, s.title),
    h("p", {}, s.text),
    h("div", { class: "dots", "aria-label": `Écran ${idx + 1} sur ${SLIDES.length}` }, SLIDES.map((_, k) => h("span", { class: k === idx ? "on" : "" }))),
    h("div", { class: "actions" },
      h("a", { href: last ? "#/inscription" : `#/decouvrir/${idx + 1}`, class: "btn btn-primary btn-block" }, last ? "Créer mon compte" : "Suivant"),
      h("a", { href: "#/inscription", class: "btn btn-ghost btn-block" }, "Passer"),
    ),
  );
  return { node, title: "Découvrir Bennoo" };
}

// ─── 3. Inscription ───────────────────────────────────────────────────────
export function signupScreen() {
  const form = h("form", { class: "form", novalidate: true },
    h("div", { class: "row-2" },
      field("Prénom", { name: "firstName", class: "input", autocomplete: "given-name", required: true, maxlength: 40 }),
      field("Nom", { name: "lastName", class: "input", autocomplete: "family-name", required: true, maxlength: 40 }),
    ),
    field("Email", { name: "email", type: "email", class: "input", autocomplete: "email", inputmode: "email", required: true }),
    passwordField("Mot de passe", "password", "new-password", "8 caractères minimum."),
    h("label", { class: "check" },
      h("input", { type: "checkbox", name: "terms", required: true }),
      h("span", {}, "J'accepte les ", h("a", { href: "#/conditions", target: "_blank" }, "conditions d'utilisation et la politique de confidentialité")),
    ),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Créer mon compte"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const displayName = cleanName(`${v.firstName ?? ""} ${v.lastName ?? ""}`);
        if (!v.firstName?.trim() || !v.lastName?.trim()) throw new Error("Le prénom et le nom sont obligatoires.");
        checkPassword(v.password);
        if (!v.terms) throw new Error("Vous devez accepter les conditions d'utilisation.");
        const cred = await createUserWithEmailAndPassword(auth, v.email.trim(), v.password);
        await updateProfile(cred.user, { displayName });
        await data.saveProfile({ displayName, phone: null });
        await sendEmailVerification(cred.user);
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  const node = bare(
    header("Créer un compte", "#/"),
    form,
    h("p", { class: "or" }, "Déjà un compte ? ", h("a", { href: "#/connexion" }, "Se connecter")),
  );
  return { node, title: "Créer un compte" };
}

// ─── Connexion ────────────────────────────────────────────────────────────
export function loginScreen() {
  const form = h("form", { class: "form", novalidate: true },
    field("Email", { name: "email", type: "email", class: "input", autocomplete: "email", inputmode: "email", required: true }),
    passwordField("Mot de passe", "password", "current-password"),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Se connecter"),
    h("p", { class: "or" }, h("a", { href: "#/mot-de-passe-oublie" }, "Mot de passe oublié ?")),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        await signInWithEmailAndPassword(auth, v.email.trim(), v.password);
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  const node = bare(
    h("a", { href: "#/", class: "back", "aria-label": "Retour" }, "‹"),
    h("div", { class: "auth-brand" },
      h("img", { src: "/img/logo.svg", alt: "", width: 64, height: 64 }),
      h("h1", {}, "Bienvenue sur Bennoo"),
      h("p", { class: "muted" }, "Connectez-vous pour retrouver votre famille."),
    ),
    form,
    h("p", { class: "or" }, "Pas encore de compte ? ", h("a", { href: "#/inscription" }, "S'inscrire")),
  );
  return { node, title: "Connexion" };
}

export function resetScreen() {
  const form = h("form", { class: "form", novalidate: true },
    field("Email du compte", { name: "email", type: "email", class: "input", autocomplete: "email", required: true }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Recevoir un lien"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = values(form).email.trim();
    await withBusy(form.querySelector("button"), async () => {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (err) {
        if (["auth/invalid-email", "auth/too-many-requests", "auth/missing-email"].includes(err.code)) return showFormError(form, errMsg(err));
      }
      // Même message que le compte existe ou non : on ne révèle pas qui est inscrit.
      form.replaceWith(alertBox("Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé. Pensez à regarder dans les courriers indésirables.", "info"));
    });
  });
  return { node: bare(header("Mot de passe oublié", "#/connexion"), form), title: "Mot de passe oublié" };
}

export function verifyScreen(user) {
  const status = h("div", { "aria-live": "polite" });
  const check = h("button", { type: "button", class: "btn btn-primary btn-block" }, "J'ai cliqué sur le lien");
  check.addEventListener("click", () => withBusy(check, async () => {
    await user.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true); // nouveau jeton portant « email vérifié »
      window.dispatchEvent(new Event("bennoo:refresh"));
    } else {
      status.replaceChildren(alertBox("L'adresse n'est pas encore vérifiée. Ouvrez le lien reçu par email, puis réessayez.", "info"));
    }
  }));
  const resend = h("button", { type: "button", class: "btn btn-block" }, "Renvoyer l'email");
  resend.addEventListener("click", () => withBusy(resend, async () => {
    try {
      await sendEmailVerification(auth.currentUser);
      status.replaceChildren(alertBox("Email renvoyé.", "info"));
    } catch (err) {
      status.replaceChildren(alertBox(errMsg(err)));
    }
  }));
  const out = h("button", { type: "button", class: "link-btn" }, "Utiliser un autre compte");
  out.addEventListener("click", () => signOut(auth));
  const node = bare(
    h("div", { class: "auth-brand" }, h("img", { src: "/img/logo.svg", alt: "", width: 64, height: 64 }), h("h1", {}, "Vérifiez votre adresse email")),
    h("p", { class: "muted" }, "Nous avons envoyé un lien à ", h("strong", {}, user.email), ". Cliquez dessus pour activer votre compte, puis revenez ici."),
    status, check, resend, h("p", { class: "or" }, out),
  );
  return { node, title: "Vérifiez votre email" };
}

// ─── 4. Accueil personnel ─────────────────────────────────────────────────
function eventCard(e, familyName) {
  return h("a", { href: `#/evenement/${enc(e.familyId)}/${enc(e.id)}`, class: "event-card" },
    h("span", { class: "thumb", "aria-hidden": "true" }, EVENT_ICONS[e.type] ?? "✨"),
    h("span", { class: "grow" },
      h("span", { class: "title" }, e.title),
      h("span", { class: "sub" }, [e.startsAt ? formatDate(e.startsAt) : "Date à fixer", e.city].filter(Boolean).join(" · ")),
      h("span", {}, h("span", { class: "chip chip-gold" }, countdownLabel(e.startsAt)), " ",
        h("span", { class: "chip chip-violet" }, EVENT_ROLES[e.myRole] ?? ""), familyName ? h("span", { class: "sub" }, ` · ${familyName}`) : null),
    ),
    h("span", { class: "chev", "aria-hidden": "true" }, "›"),
  );
}

function createFamilyForm(displayName) {
  const form = h("form", { class: "form", novalidate: true },
    field("Nom de la famille", { name: "name", class: "input", required: true, maxlength: 80, placeholder: "Ex. Famille Diop" }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Créer la famille"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const fid = await data.createFamily(cleanName(values(form).name), displayName);
        toast("Famille créée");
        location.hash = `#/famille/${enc(fid)}`;
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return form;
}

export async function homeScreen() {
  const [profile, families, events] = await Promise.all([data.getProfile(), data.listMyFamilies(), data.listMyEvents()]);
  const name = profile?.displayName ?? auth.currentUser.displayName ?? "";
  const famName = Object.fromEntries(families.map((f) => [f.id, f.name]));
  const upcoming = events.filter((e) => !e.startsAt || daysUntil(e.startsAt) >= 0);
  const past = events.filter((e) => e.startsAt && daysUntil(e.startsAt) < 0).reverse();
  const showFamily = families.length > 1;

  const node = screen(
    h("div", { class: "hello" },
      avatar(name),
      h("div", { class: "grow" }, h("h1", {}, `Bonjour ${firstName(name)} 👋`), h("p", { class: "muted" }, "Bon retour sur Bennoo !")),
    ),
    families.length === 0
      ? h("section", { class: "card" },
        h("h2", {}, "Créez votre famille"),
        h("p", { class: "muted small" }, "C'est l'espace où vous organiserez vos événements avec vos proches. Vous avez reçu un lien d'invitation ? Ouvrez-le pour rejoindre la famille."),
        h("div", { class: "form" }, createFamilyForm(name)))
      : null,
    h("section", {},
      h("div", { class: "section-head" }, h("h2", {}, "Mes événements"),
        families.length ? h("a", { href: "#/nouvel-evenement", class: "btn btn-primary btn-sm" }, "+ Créer") : null),
      h("div", { style: null }, upcoming.length
        ? upcoming.map((e) => eventCard(e, showFamily ? famName[e.familyId] : null))
        : h("div", { class: "card empty" }, h("strong", {}, "Aucun événement à venir."),
          h("span", {}, families.length ? "Créez-en un : vous en serez l'organisateur." : "Commencez par créer votre famille."))),
    ),
    past.length ? h("section", {}, h("h2", {}, "Événements passés"), h("div", {}, past.map((e) => eventCard(e, showFamily ? famName[e.familyId] : null)))) : null,
  );
  return { node, title: "Accueil", nav: "home" };
}

// ─── 5. Familles et Family Hub ────────────────────────────────────────────
export async function familiesScreen() {
  const [families, profile] = await Promise.all([data.listMyFamilies(), data.getProfile()]);
  if (families.length === 1) {
    location.hash = `#/famille/${enc(families[0].id)}`;
    return null;
  }
  const node = screen(
    header("Mes familles"),
    families.length
      ? h("ul", { class: "list card-flat" }, families.map((f) => h("li", {},
        h("a", { href: `#/famille/${enc(f.id)}`, class: "item" }, avatar(f.name),
          h("span", { class: "grow" }, h("span", { class: "title" }, f.name), h("span", { class: "sub" }, FAMILY_ROLES[f.myRole])),
          h("span", { class: "chev", "aria-hidden": "true" }, "›")))))
      : h("div", { class: "card empty" }, h("strong", {}, "Vous n'appartenez à aucune famille."), h("span", {}, "Créez la vôtre ou ouvrez le lien d'invitation reçu d'un proche.")),
    h("section", { class: "card" }, h("h2", {}, "Créer une famille"), h("div", { class: "form" }, createFamilyForm(profile?.displayName ?? auth.currentUser.displayName ?? "Moi"))),
  );
  return { node, title: "Mes familles", nav: "family" };
}

export async function familyScreen(fid, tab = "membres") {
  const family = await data.getFamily(fid);
  if (!family) return notFoundScreen();
  const [members, events] = await Promise.all([data.listFamilyMembers(fid), data.listMyEvents()]);
  const isAdmin = ["owner", "admin"].includes(family.myRole);
  const myUid = auth.currentUser.uid;
  const famEvents = events.filter((e) => e.familyId === fid);
  const current = tab === "evenements" ? "evenements" : tab === "inviter" ? "inviter" : "membres";

  const tabs = h("div", { class: "tabs", role: "tablist" },
    h("a", { href: `#/famille/${enc(fid)}/membres`, role: "tab", "aria-selected": String(current === "membres") }, "Membres"),
    h("a", { href: `#/famille/${enc(fid)}/evenements`, role: "tab", "aria-selected": String(current === "evenements") }, "Événements"),
  );

  let body;
  if (current === "evenements") {
    body = h("div", {},
      famEvents.length ? famEvents.map((e) => eventCard(e)) : h("div", { class: "card empty" }, h("strong", {}, "Aucun événement auquel vous participez."), h("span", {}, "Un événement n'est visible que de ses participants.")),
      h("a", { href: `#/nouvel-evenement/${enc(fid)}`, class: "btn btn-primary btn-block", style: null }, "+ Créer un événement"));
  } else if (current === "inviter") {
    body = isAdmin ? await invitePanel(fid, family.name) : h("div", { class: "card" }, h("p", {}, "Seul un administrateur de la famille peut créer un lien d'invitation."));
  } else {
    body = h("div", { class: "form" },
      h("ul", { class: "list card-flat" }, members.map((m) => h("li", {},
        h("a", { href: `#/famille/${enc(fid)}/membre/${enc(m.uid)}`, class: "item" }, avatar(m.displayName),
          h("span", { class: "grow" }, h("span", { class: "title" }, m.displayName + (m.uid === myUid ? " (vous)" : "")), h("span", { class: "sub" }, FAMILY_ROLES[m.role])),
          h("span", { class: "chev", "aria-hidden": "true" }, "›"))))),
      isAdmin
        ? h("a", { href: `#/famille/${enc(fid)}/inviter`, class: "btn btn-primary btn-block" }, "+ Inviter un membre")
        : h("p", { class: "muted small" }, "Pour inviter un proche, demandez un lien à un administrateur de la famille."));
  }

  const node = screen(
    h("section", { class: "family-hero" },
      h("div", { class: "band" }),
      h("div", { class: "id" }, avatar(family.name),
        h("div", {}, h("h1", {}, family.name), h("p", { class: "muted small" }, `${members.length} membre${members.length > 1 ? "s" : ""} · ${famEvents.length} événement${famEvents.length > 1 ? "s" : ""}`)))),
    current === "inviter" ? header("Inviter un membre", `#/famille/${enc(fid)}/membres`) : tabs,
    body,
  );
  return { node, title: family.name, nav: "family" };
}

async function invitePanel(fid, familyName) {
  const list = h("div", { class: "form" });
  async function refresh() {
    const invites = await data.listInvites(fid);
    list.replaceChildren(...(invites.length === 0 ? [h("p", { class: "muted" }, "Aucun lien actif.")] : invites.map((i) => {
      const url = inviteUrl(location.origin, fid, i.token);
      const revoke = h("button", { type: "button", class: "btn btn-sm" }, "Désactiver");
      revoke.addEventListener("click", () => withBusy(revoke, async () => { await data.revokeInvite(fid, i.token); toast("Lien désactivé"); await refresh(); }));
      const copy = h("button", { type: "button", class: "btn btn-sm" }, "Copier");
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); toast("Lien copié"); } catch { toast("Copie impossible : sélectionnez le lien à la main."); }
      });
      return h("div", { class: "card invite-box" },
        h("label", { class: "label muted small", for: `inv-${i.token.slice(0, 6)}` }, "Lien d'invitation"),
        h("input", { id: `inv-${i.token.slice(0, 6)}`, class: "input invite-url", readonly: true, value: url }),
        h("p", { class: "help" }, `Valable jusqu'au ${formatDate(i.expiresAt.toDate())}`),
        h("div", { class: "row-2" },
          h("a", { href: whatsappShareUrl(inviteMessage(familyName, url)), target: "_blank", rel: "noopener", class: "btn btn-sm btn-whatsapp" }, "Envoyer sur WhatsApp"),
          copy),
        revoke);
    })));
  }
  const create = h("button", { type: "button", class: "btn btn-primary btn-block" }, "Créer un lien d'invitation");
  create.addEventListener("click", () => withBusy(create, async () => {
    try { await data.createInvite(fid, familyName); toast("Lien créé"); await refresh(); } catch (err) { toast(errMsg(err)); }
  }));
  await refresh();
  return h("div", { class: "form" },
    h("p", { class: "muted" }, "Le lien est valable 7 jours. Toute personne qui le reçoit peut rejoindre la famille comme membre : partagez-le seulement avec vos proches."),
    create, list);
}

function roleSelect(label, roles, current, onChange) {
  const select = h("select", { class: "input", "aria-label": label }, Object.entries(roles).map(([value, text]) => h("option", { value, selected: value === current }, text)));
  select.addEventListener("change", async () => {
    select.disabled = true;
    try { await onChange(select.value); } catch (err) { select.value = current; toast(errMsg(err)); } finally { select.disabled = false; }
  });
  return select;
}

export async function memberScreen(fid, uid) {
  const family = await data.getFamily(fid);
  if (!family) return notFoundScreen();
  const members = await data.listFamilyMembers(fid);
  const m = members.find((x) => x.uid === uid);
  if (!m) return notFoundScreen("Ce membre ne fait pas partie de la famille.");
  const isAdmin = ["owner", "admin"].includes(family.myRole);
  const isMe = uid === auth.currentUser.uid;
  const canManage = isAdmin && !isMe && m.role !== "owner";

  let actions = null;
  if (canManage) {
    const remove = h("button", { type: "button", class: "btn btn-block" }, "Retirer de la famille");
    remove.addEventListener("click", () => withBusy(remove, async () => {
      if (!confirm(`Retirer ${m.displayName} de la famille ?`)) return;
      try { await data.removeFamilyMember(fid, uid); toast("Membre retiré"); location.hash = `#/famille/${enc(fid)}/membres`; } catch (err) { toast(errMsg(err)); }
    }));
    actions = h("div", { class: "form" },
      h("div", { class: "field" }, h("span", { class: "label" }, "Rôle dans la famille"),
        roleSelect(`Rôle de ${m.displayName}`, { admin: FAMILY_ROLES.admin, member: FAMILY_ROLES.member }, m.role, async (role) => {
          await data.setFamilyRole(fid, uid, role); toast(`${m.displayName} : ${FAMILY_ROLES[role].toLowerCase()}`);
        })),
      remove);
  } else if (isMe && m.role !== "owner") {
    const leave = h("button", { type: "button", class: "btn btn-block" }, "Quitter la famille");
    leave.addEventListener("click", () => withBusy(leave, async () => {
      if (!confirm(`Quitter ${family.name} ?`)) return;
      try { await data.removeFamilyMember(fid, uid); toast("Vous avez quitté la famille"); location.hash = "#/"; } catch (err) { toast(errMsg(err)); }
    }));
    actions = leave;
  }

  const node = screen(
    header("Détail du membre", `#/famille/${enc(fid)}/membres`),
    h("section", { class: "card", }, h("div", { class: "auth-brand" }, avatar(m.displayName, "lg"), h("h2", {}, m.displayName), h("span", { class: "chip chip-violet" }, FAMILY_ROLES[m.role])),
      h("dl", { class: "facts", style: null }, h("dt", {}, "Famille"), h("dd", {}, family.name),
        h("dt", {}, "Membre depuis"), h("dd", {}, m.joinedAt?.toDate ? formatDate(m.joinedAt.toDate()) : "—"))),
    actions,
  );
  return { node, title: m.displayName, nav: "family" };
}

export async function joinScreen(fid, token) {
  if (!isToken(token)) return notFoundScreen("Ce lien d'invitation n'est pas valide.");
  if (await data.isFamilyMember(fid).catch(() => false)) {
    location.hash = `#/famille/${enc(fid)}`;
    return null;
  }
  const invite = await data.getInvite(fid, token);
  if (!invite) return notFoundScreen("Ce lien d'invitation n'existe pas ou a été désactivé.");
  if (invite.expired) return notFoundScreen("Ce lien d'invitation a expiré. Demandez-en un nouveau.");
  const profile = await data.getProfile();
  const join = h("button", { type: "button", class: "btn btn-primary btn-block" }, "Rejoindre la famille");
  const status = h("div", {});
  join.addEventListener("click", () => withBusy(join, async () => {
    try {
      await data.joinFamily(fid, token, profile?.displayName ?? auth.currentUser.displayName ?? "Membre");
      toast(`Bienvenue dans ${invite.familyName}`);
      location.hash = `#/famille/${enc(fid)}`;
    } catch (err) {
      status.replaceChildren(alertBox(errMsg(err)));
    }
  }));
  const node = bare(
    h("div", { class: "auth-brand" }, avatar(invite.familyName, "lg"), h("h1", {}, invite.familyName), h("p", { class: "muted" }, "Vous êtes invité(e) à rejoindre cette famille sur Bennoo.")),
    status, join, h("a", { href: "#/", class: "btn btn-ghost btn-block" }, "Plus tard"),
  );
  return { node, title: "Rejoindre une famille" };
}

// ─── 6. Création d'un événement (5 étapes) ────────────────────────────────
const WIZARD = ["Type d'événement", "Informations", "Lieu et date", "Budget", "Participants"];

export async function newEventScreen(presetFid) {
  const families = await data.listMyFamilies();
  if (families.length === 0) {
    location.hash = "#/";
    return null;
  }
  const state = {
    step: 0, type: "WEDDING", familyId: families.some((f) => f.id === presetFid) ? presetFid : families[0].id,
    title: "", description: "", startsAt: "", venue: "", city: "", currency: "XOF", budget: "", guests: "", picks: {},
  };
  const backHref = presetFid ? `#/famille/${enc(presetFid)}/evenements` : "#/";
  const body = h("div", { class: "form" });
  const titleEl = h("h1", {}, "Nouvel événement");
  const node = h("main", { class: "screen no-nav", id: "contenu" },
    h("div", { class: "screen-head" }, h("a", { href: backHref, class: "back", "aria-label": "Annuler" }, "‹"), titleEl), body);

  let members = [];
  async function loadMembers() {
    members = (await data.listFamilyMembers(state.familyId)).filter((m) => m.uid !== auth.currentUser.uid);
  }

  function saveStep(form) {
    const v = values(form);
    if (state.step === 0) state.type = v.type || state.type;
    if (state.step === 1) {
      state.title = v.title.replace(/\s+/g, " ").trim();
      state.description = v.description.trim();
      if (v.familyId) state.familyId = v.familyId;
      if (!state.title) throw new Error("Le nom de l'événement est obligatoire.");
      if (state.title.length > 120) throw new Error("Le nom ne doit pas dépasser 120 caractères.");
    }
    if (state.step === 2) {
      state.startsAt = v.startsAt;
      state.venue = v.venue.trim();
      state.city = v.city.trim();
      if (state.startsAt && Number.isNaN(new Date(state.startsAt).getTime())) throw new Error("Date invalide.");
    }
    if (state.step === 3) {
      state.currency = v.currency;
      state.budget = v.budget;
      state.guests = v.guests;
      parseAmount(state.budget, state.currency);
      if (state.guests !== "" && !(Number.isInteger(Number(state.guests)) && Number(state.guests) >= 0 && Number(state.guests) <= 100000)) throw new Error("Nombre d'invités invalide.");
    }
    if (state.step === 4) {
      state.picks = {};
      for (const m of members) if (v[`pick-${m.uid}`] === "on") state.picks[m.uid] = v[`role-${m.uid}`] || "member";
    }
  }

  function stepContent() {
    switch (state.step) {
      case 0:
        return [h("h2", {}, "Quel type d'événement ?"),
          h("fieldset", { class: "type-grid", style: null },
            h("legend", { class: "sr-only" }, "Type d'événement"),
            Object.entries(EVENT_TYPES).map(([value, label]) => h("label", {},
              h("input", { type: "radio", name: "type", value, checked: state.type === value }),
              h("span", { class: "tile" }, h("span", { class: "ico", "aria-hidden": "true" }, EVENT_ICONS[value]), label))))];
      case 1:
        return [h("h2", {}, "Informations de base"),
          families.length > 1 ? field("Famille", { name: "familyId", tag: "select", class: "input", options: families.map((f) => [f.id, f.name]) }) : null,
          field("Nom de l'événement", { name: "title", class: "input", required: true, maxlength: 120, value: state.title, placeholder: "Ex. Mariage de Fatou & Mamadou" }),
          field("Description (facultatif)", { name: "description", tag: "textarea", class: "input", maxlength: 2000 })];
      case 2:
        return [h("h2", {}, "Lieu et date"),
          field("Date et heure", { name: "startsAt", type: "datetime-local", class: "input", value: state.startsAt }, "Facultatif : vous pourrez la fixer plus tard."),
          field("Lieu", { name: "venue", class: "input", maxlength: 200, value: state.venue, placeholder: "Ex. Salle des fêtes, domicile familial" }),
          field("Ville", { name: "city", class: "input", maxlength: 120, value: state.city, placeholder: "Ex. Dakar, Sénégal" })];
      case 3:
        return [h("h2", {}, "Budget"),
          field("Devise", { name: "currency", tag: "select", class: "input", options: Object.entries(CURRENCIES) }),
          field("Budget prévu", { name: "budget", class: "input", inputmode: "decimal", value: state.budget, placeholder: "Ex. 4 200 000" }, "Montant total estimé. Vous pourrez le détailler plus tard."),
          field("Nombre d'invités prévu", { name: "guests", type: "number", class: "input", min: 0, max: 100000, inputmode: "numeric", value: state.guests })];
      default:
        return [h("h2", {}, "Participants"),
          h("p", { class: "muted small" }, "Choisissez les membres de la famille qui organiseront l'événement avec vous. Seuls les participants voient l'événement. Vous pourrez en ajouter plus tard."),
          members.length === 0
            ? h("div", { class: "card empty" }, h("strong", {}, "Vous êtes pour l'instant le seul membre de cette famille."), h("span", {}, "Invitez vos proches depuis la page Famille, puis ajoutez-les à l'événement."))
            : h("ul", { class: "list card-flat" }, members.map((m) => h("li", { class: "pick" },
              h("label", { class: "check grow" }, h("input", { type: "checkbox", name: `pick-${m.uid}`, checked: Boolean(state.picks[m.uid]) }), avatar(m.displayName), h("span", {}, m.displayName)),
              h("select", { class: "input", name: `role-${m.uid}`, "aria-label": `Rôle de ${m.displayName}` },
                ["member", "treasurer", "organizer"].map((r) => h("option", { value: r, selected: (state.picks[m.uid] ?? "member") === r }, EVENT_ROLES[r]))))))];
    }
  }

  function render() {
    titleEl.textContent = WIZARD[state.step];
    const form = h("form", { class: "form", novalidate: true },
      h("p", { class: "muted small" }, `Étape ${state.step + 1} sur ${WIZARD.length}`),
      h("div", { class: "progress-steps", "aria-hidden": "true" }, WIZARD.map((_, k) => h("span", { class: k <= state.step ? "on" : "" }))),
      ...stepContent(),
      h("div", { class: "wizard-foot" },
        state.step > 0 ? h("button", { type: "button", class: "btn", "data-prev": "1" }, "Précédent") : null,
        h("button", { type: "submit", class: "btn btn-primary btn-block" }, state.step === WIZARD.length - 1 ? "Créer l'événement" : "Suivant")),
    );
    if (form.elements.currency) form.elements.currency.value = state.currency;
    if (form.elements.description) form.elements.description.value = state.description;
    if (form.elements.familyId) form.elements.familyId.value = state.familyId;
    form.querySelector("[data-prev]")?.addEventListener("click", () => { try { saveStep(form); } catch { /* retour sans valider */ } state.step -= 1; render(); });
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      showFormError(form, null);
      await withBusy(form.querySelector("button[type=submit]"), async () => {
        try {
          saveStep(form);
          if (state.step === 1) await loadMembers();
          if (state.step < WIZARD.length - 1) { state.step += 1; render(); return; }
          const displayName = await data.getMyFamilyDisplayName(state.familyId);
          const eid = await data.createEvent(state.familyId, {
            type: state.type, title: state.title, description: state.description,
            startsAt: state.startsAt ? new Date(state.startsAt) : null, venue: state.venue, city: state.city,
            currency: state.currency, budgetPlanned: parseAmount(state.budget, state.currency),
            expectedGuests: state.guests === "" ? null : Number(state.guests),
          }, displayName);
          const failed = [];
          for (const [uid, role] of Object.entries(state.picks)) {
            const m = members.find((x) => x.uid === uid);
            try { await data.addParticipant(state.familyId, eid, m, role); } catch { failed.push(m.displayName); }
          }
          toast(failed.length ? `Événement créé ; non ajoutés : ${failed.join(", ")}` : "Événement créé");
          location.hash = `#/evenement/${enc(state.familyId)}/${enc(eid)}`;
        } catch (err) {
          showFormError(form, errMsg(err));
        }
      });
    });
    body.replaceChildren(form);
    form.querySelector("input, select, textarea")?.focus();
  }

  render();
  return { node, title: "Nouvel événement" };
}

// ─── 7. Tableau de bord de l'événement ────────────────────────────────────
export async function eventScreen(fid, eid, tab) {
  const [event, family] = await Promise.all([data.getEvent(fid, eid), data.getFamily(fid)]);
  if (!event || !family) return notFoundScreen("Cet événement n'existe pas, ou vous n'y participez pas.");
  const participants = await data.listParticipants(fid, eid);
  const isOrganizer = event.myRole === "organizer";
  const myUid = auth.currentUser.uid;
  const base = `#/evenement/${enc(fid)}/${enc(eid)}`;
  const n = event.startsAt ? daysUntil(event.startsAt) : null;

  const tabs = h("div", { class: "tabs", role: "tablist" },
    h("a", { href: base, role: "tab", "aria-selected": String(!tab) }, "Aperçu"),
    h("a", { href: `${base}/participants`, role: "tab", "aria-selected": String(tab === "participants") }, "Participants"),
    isOrganizer ? h("a", { href: `${base}/modifier`, role: "tab", "aria-selected": String(tab === "modifier") }, "Modifier") : null,
  );

  let body;
  if (tab === "participants") {
    body = await participantsPanel(fid, eid, participants, isOrganizer, myUid);
  } else if (tab === "modifier" && isOrganizer) {
    body = editEventForm(fid, eid, event, base);
  } else {
    body = h("div", { class: "form" },
      h("div", { class: "kpis" },
        h("div", { class: "kpi big" }, h("span", { class: "v" }, n === null ? "—" : n >= 0 ? (n === 0 ? "Jour J" : `J - ${n}`) : "Passé"),
          h("span", { class: "l" }, n === null ? "Date à fixer" : n > 0 ? "avant le grand jour" : n === 0 ? "c'est aujourd'hui !" : "événement passé")),
        h("div", { class: "kpi" }, h("span", { class: "v sm" }, event.budgetPlanned ? formatAmount(event.budgetPlanned, event.currency) : "—"), h("span", { class: "l" }, "Budget prévu")),
        h("div", { class: "kpi" }, h("span", { class: "v" }, event.expectedGuests ?? "—"), h("span", { class: "l" }, "Invités prévus")),
        h("div", { class: "kpi" }, h("span", { class: "v" }, String(participants.length)), h("span", { class: "l" }, `participant${participants.length > 1 ? "s" : ""} à l'organisation`))),
      h("section", { class: "card" }, h("h2", {}, "Informations"),
        h("dl", { class: "facts", style: null },
          h("dt", {}, "Date"), h("dd", {}, event.startsAt ? `${formatDate(event.startsAt)} à ${event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "À fixer"),
          h("dt", {}, "Lieu"), h("dd", {}, [event.venue, event.city].filter(Boolean).join(", ") || "À préciser"),
          h("dt", {}, "Famille"), h("dd", {}, family.name)),
        event.description ? h("p", { class: "muted", style: null }, event.description) : null),
      h("p", { class: "muted small" }, "Tâches, budget détaillé, contributions, invités et album arrivent dans les prochaines étapes du développement."),
    );
  }

  const node = screen(
    h("a", { href: `#/famille/${enc(fid)}/evenements`, class: "back", "aria-label": `Retour à ${family.name}` }, "‹"),
    h("section", { class: "event-hero" },
      h("span", { class: "type" }, EVENT_ICONS[event.type], " ", EVENT_TYPES[event.type]), " ",
      h("span", { class: "type" }, `Votre rôle : ${EVENT_ROLES[event.myRole]}`),
      h("h1", {}, event.title),
      h("p", { class: "sub" }, [event.startsAt ? formatDate(event.startsAt) : "Date à fixer", event.city].filter(Boolean).join(" · "))),
    tabs, body,
  );
  return { node, title: event.title, nav: "home" };
}

async function participantsPanel(fid, eid, participants, isOrganizer, myUid) {
  const list = h("ul", { class: "list card-flat" }, participants.map((p) => {
    const editable = isOrganizer && p.uid !== myUid;
    const remove = editable ? h("button", { type: "button", class: "btn btn-sm" }, "Retirer") : null;
    remove?.addEventListener("click", () => withBusy(remove, async () => {
      if (!confirm(`Retirer ${p.displayName} de l'événement ?`)) return;
      try { await data.removeParticipant(fid, eid, p.uid); toast("Participant retiré"); window.dispatchEvent(new Event("hashchange")); } catch (err) { toast(errMsg(err)); }
    }));
    return h("li", { class: "item participant" }, avatar(p.displayName),
      h("span", { class: "grow" }, h("span", { class: "title" }, p.displayName + (p.uid === myUid ? " (vous)" : "")),
        editable ? null : h("span", { class: "sub" }, EVENT_ROLES[p.role])),
      editable ? h("div", { class: "controls" },
        roleSelect(`Rôle de ${p.displayName}`, EVENT_ROLES, p.role, async (role) => { await data.setParticipantRole(fid, eid, p.uid, role); toast(`${p.displayName} : ${EVENT_ROLES[role].toLowerCase()}`); }),
        remove) : null);
  }));

  let add = null;
  if (isOrganizer) {
    const members = await data.listFamilyMembers(fid);
    const inEvent = new Set(participants.map((p) => p.uid));
    const candidates = members.filter((m) => !inEvent.has(m.uid));
    if (candidates.length === 0) {
      add = h("p", { class: "muted small" }, "Tous les membres de la famille participent déjà. Invitez d'autres proches depuis la page Famille.");
    } else {
      const form = h("form", { class: "card form", novalidate: true },
        h("h2", {}, "Ajouter un participant"),
        field("Membre de la famille", { name: "member", tag: "select", class: "input", options: candidates.map((m) => [m.uid, m.displayName]) }),
        field("Rôle", { name: "role", tag: "select", class: "input", options: [["member", EVENT_ROLES.member], ["treasurer", EVENT_ROLES.treasurer], ["organizer", EVENT_ROLES.organizer]] }),
        h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Ajouter"));
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const v = values(form);
        const member = candidates.find((m) => m.uid === v.member);
        await withBusy(form.querySelector("button"), async () => {
          try { await data.addParticipant(fid, eid, member, v.role); toast(`${member.displayName} ajouté(e)`); window.dispatchEvent(new Event("hashchange")); } catch (err) { showFormError(form, errMsg(err)); }
        });
      });
      add = form;
    }
  }
  return h("div", { class: "form" },
    h("p", { class: "muted small" }, "Seuls les participants voient cet événement, même au sein de la famille."),
    list, add);
}

function editEventForm(fid, eid, e, base) {
  const toInput = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const amount = e.budgetPlanned ? String(e.currency === "EUR" ? e.budgetPlanned / 100 : e.budgetPlanned) : "";
  const form = h("form", { class: "card form", novalidate: true },
    field("Type d'événement", { name: "type", tag: "select", class: "input", options: Object.entries(EVENT_TYPES) }),
    field("Nom de l'événement", { name: "title", class: "input", required: true, maxlength: 120, value: e.title }),
    field("Date et heure", { name: "startsAt", type: "datetime-local", class: "input", value: toInput(e.startsAt) }),
    field("Lieu", { name: "venue", class: "input", maxlength: 200, value: e.venue ?? "" }),
    field("Ville", { name: "city", class: "input", maxlength: 120, value: e.city ?? "" }),
    field("Devise", { name: "currency", tag: "select", class: "input", options: Object.entries(CURRENCIES) }),
    field("Budget prévu", { name: "budget", class: "input", inputmode: "decimal", value: amount }),
    field("Nombre d'invités prévu", { name: "guests", type: "number", class: "input", min: 0, max: 100000, value: e.expectedGuests ?? "" }),
    field("Description", { name: "description", tag: "textarea", class: "input", maxlength: 2000 }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Enregistrer les modifications"));
  form.elements.type.value = e.type;
  form.elements.currency.value = e.currency;
  form.elements.description.value = e.description ?? "";
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const title = v.title.replace(/\s+/g, " ").trim();
        if (!title) throw new Error("Le nom de l'événement est obligatoire.");
        const guests = v.guests === "" ? null : Number(v.guests);
        if (guests !== null && !(Number.isInteger(guests) && guests >= 0 && guests <= 100000)) throw new Error("Nombre d'invités invalide.");
        await data.updateEvent(fid, eid, {
          type: v.type, title, description: v.description.trim(), startsAt: v.startsAt ? new Date(v.startsAt) : null,
          venue: v.venue.trim(), city: v.city.trim(), currency: v.currency, budgetPlanned: parseAmount(v.budget, v.currency), expectedGuests: guests,
        });
        toast("Événement mis à jour");
        location.hash = base;
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return form;
}

// ─── 13. Paramètres et profil ─────────────────────────────────────────────
export async function settingsScreen() {
  const profile = await data.getProfile();
  const name = profile?.displayName ?? auth.currentUser.displayName ?? "";
  const out = h("button", { type: "button", class: "item link-row danger" }, h("span", { class: "ico", "aria-hidden": "true" }, "⎋"), h("span", { class: "grow" }, h("span", { class: "title danger" }, "Se déconnecter")));
  out.addEventListener("click", async () => { await signOut(auth); location.hash = "#/"; });
  const row = (href, ico, title, sub) => h("li", {}, h("a", { href, class: "item" }, h("span", { class: "ico", "aria-hidden": "true" }, ico),
    h("span", { class: "grow" }, h("span", { class: "title" }, title), sub ? h("span", { class: "sub" }, sub) : null), h("span", { class: "chev", "aria-hidden": "true" }, "›")));
  const node = screen(
    header("Paramètres"),
    h("section", { class: "card hello" }, avatar(name), h("div", { class: "grow" }, h("h2", {}, name), h("p", { class: "muted small" }, auth.currentUser.email))),
    h("ul", { class: "list card-flat settings" },
      row("#/profil", "👤", "Mon profil", "Nom et téléphone"),
      row("#/familles", "👨‍👩‍👧", "Familles et permissions", "Membres, rôles, invitations"),
      row("#/conditions", "🔒", "Confidentialité", "Ce que voient les autres membres"),
      h("li", {}, h("div", { class: "item" }, h("span", { class: "ico", "aria-hidden": "true" }, "🌐"), h("span", { class: "grow" }, h("span", { class: "title" }, "Langue"), h("span", { class: "sub" }, "Français (wolof prévu plus tard)")))),
      h("li", {}, out)),
  );
  return { node, title: "Paramètres", nav: "more" };
}

export async function profileScreen() {
  const profile = (await data.getProfile()) ?? { displayName: auth.currentUser.displayName ?? "", phone: null };
  const form = h("form", { class: "card form", novalidate: true },
    field("Nom affiché", { name: "displayName", class: "input", required: true, maxlength: 80, value: profile.displayName, autocomplete: "name" }),
    field("Téléphone (facultatif)", { name: "phone", type: "tel", class: "input", value: profile.phone ?? "", autocomplete: "tel", inputmode: "tel" }, "Format international, par exemple +221 77 123 45 67. Visible par vous seul pour l'instant."),
    h("p", { class: "muted small" }, `Email : ${auth.currentUser.email}`),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Enregistrer"));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const v = values(form);
        const displayName = cleanName(v.displayName);
        await data.saveProfile({ displayName, phone: normalizePhone(v.phone) });
        await updateProfile(auth.currentUser, { displayName });
        toast("Profil enregistré");
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return { node: screen(header("Mon profil", "#/plus"), form), title: "Mon profil", nav: "more" };
}

export function termsScreen() {
  const p = (t) => h("p", {}, t);
  const node = bare(header("Conditions et confidentialité", "#/"),
    h("section", { class: "card form" },
      h("h2", {}, "En bref"),
      p("Bennoo aide votre famille à organiser ses événements. Vos données servent uniquement à faire fonctionner l'application ; elles ne sont ni vendues ni utilisées pour de la publicité."),
      h("h2", {}, "Qui voit quoi"),
      p("Un événement n'est visible que de ses participants, même au sein de la famille. Votre profil (téléphone compris) n'est visible que par vous. Les membres d'une famille voient le nom et le rôle des autres membres."),
      h("h2", {}, "Vos données"),
      p("Les données sont hébergées par Google Firebase, dans une région européenne. Vous pouvez modifier votre profil à tout moment et quitter une famille. Pour supprimer votre compte, contactez l'administrateur de Bennoo."),
      h("p", { class: "muted small" }, "Version provisoire de la phase de test, à valider juridiquement avant l'ouverture au public.")));
  return { node, title: "Conditions" };
}

// ─── Erreurs ──────────────────────────────────────────────────────────────
export function notFoundScreen(message = "Cette page n'existe pas, ou vous n'y avez pas accès.") {
  return { node: bare(h("section", { class: "card form" }, h("h1", {}, "Introuvable"), h("p", {}, message), h("a", { href: "#/", class: "btn btn-primary btn-block" }, "Retour à l'accueil"))), title: "Introuvable" };
}

export function errorScreen(err) {
  return { node: bare(h("section", { class: "card form" }, h("h1", {}, "Une erreur est survenue"), alertBox(errMsg(err)), h("a", { href: "#/", class: "btn btn-primary btn-block" }, "Retour à l'accueil"))), title: "Erreur" };
}
