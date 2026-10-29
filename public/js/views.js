/**
 * Écrans de l'étape 1 : connexion, profil, familles, invitations, événements.
 * Chaque bouton déclenche une vraie action enregistrée dans Firestore ; aucune donnée fictive.
 */
import { h, field, alertBox, showFormError, withBusy, toast, emptyState, card } from "./dom.js";
import {
  auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification,
  sendPasswordResetEmail, updateProfile,
} from "./firebase.js";
import * as data from "./data.js";
import {
  EVENT_TYPES, FAMILY_ROLES, EVENT_ROLES, CURRENCIES, cleanName, normalizePhone, parseAmount, formatAmount,
  countdownLabel, formatDate, inviteUrl, whatsappShareUrl, inviteMessage, authErrorMessage, checkPassword, isToken,
} from "./lib/format.js";

const errMsg = (err) => (err?.code ? authErrorMessage(err.code) : err?.message || authErrorMessage());
const formValues = (form) => Object.fromEntries(new FormData(form).entries());

function backLink(href, label) {
  return h("a", { href, class: "back" }, `← ${label}`);
}

// ─── Connexion / inscription ──────────────────────────────────────────────
export function authScreen(mode) {
  const signup = mode === "signup";
  const form = h("form", { novalidate: true },
    signup ? field("Votre nom", { name: "displayName", autocomplete: "name", required: true, maxlength: 80 }) : null,
    field("Email", { name: "email", type: "email", autocomplete: "email", required: true, inputmode: "email" }),
    field("Mot de passe", {
      name: "password", type: "password", required: true, minlength: 8,
      autocomplete: signup ? "new-password" : "current-password",
    }, signup ? "8 caractères minimum." : null),
    h("button", { type: "submit", class: "btn btn-primary" }, signup ? "Créer mon compte" : "Se connecter"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    const v = formValues(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        if (signup) {
          const displayName = cleanName(v.displayName);
          checkPassword(v.password);
          const cred = await createUserWithEmailAndPassword(auth, v.email.trim(), v.password);
          await updateProfile(cred.user, { displayName });
          await data.saveProfile({ displayName, phone: null });
          await sendEmailVerification(cred.user);
        } else {
          await signInWithEmailAndPassword(auth, v.email.trim(), v.password);
        }
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return h("div", { class: "auth" },
    h("p", { class: "tagline" }, "Une cérémonie, toute la famille, un seul endroit."),
    card(
      h("h1", {}, signup ? "Créer un compte" : "Se connecter"),
      form,
      h("p", { class: "switch" }, signup
        ? ["Déjà un compte ? ", h("a", { href: "#/connexion" }, "Se connecter")]
        : ["Pas encore de compte ? ", h("a", { href: "#/inscription" }, "Créer un compte")]),
      signup ? null : h("p", { class: "switch" }, h("a", { href: "#/mot-de-passe-oublie" }, "Mot de passe oublié ?")),
    ),
  );
}

export function resetScreen() {
  const form = h("form", { novalidate: true },
    field("Email du compte", { name: "email", type: "email", autocomplete: "email", required: true }),
    h("button", { type: "submit", class: "btn btn-primary" }, "Recevoir un lien"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const email = formValues(form).email.trim();
    await withBusy(form.querySelector("button"), async () => {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (err) {
        if (err.code === "auth/invalid-email" || err.code === "auth/too-many-requests") return showFormError(form, errMsg(err));
      }
      // Même message que le compte existe ou non : on ne révèle pas qui est inscrit.
      form.replaceWith(alertBox("Si un compte existe pour cette adresse, un email de réinitialisation vient d'être envoyé. Pensez à vérifier les courriers indésirables.", "info"));
    });
  });
  return h("div", { class: "auth" }, card(h("h1", {}, "Mot de passe oublié"), form, h("p", { class: "switch" }, h("a", { href: "#/connexion" }, "Retour à la connexion"))));
}

export function verifyScreen(user) {
  const status = h("div", { "aria-live": "polite" });
  const check = h("button", { type: "button", class: "btn btn-primary" }, "J'ai cliqué sur le lien");
  check.addEventListener("click", () => withBusy(check, async () => {
    await user.reload();
    if (auth.currentUser.emailVerified) {
      await auth.currentUser.getIdToken(true); // nouveau jeton portant « email vérifié »
      window.dispatchEvent(new Event("bennoo:refresh"));
    } else {
      status.replaceChildren(alertBox("L'adresse n'est pas encore vérifiée. Ouvrez le lien reçu par email, puis réessayez.", "info"));
    }
  }));
  const resend = h("button", { type: "button", class: "btn" }, "Renvoyer l'email");
  resend.addEventListener("click", () => withBusy(resend, async () => {
    try {
      await sendEmailVerification(auth.currentUser);
      status.replaceChildren(alertBox("Email renvoyé.", "info"));
    } catch (err) {
      status.replaceChildren(alertBox(errMsg(err)));
    }
  }));
  return card(
    h("h1", {}, "Vérifiez votre adresse email"),
    h("p", {}, "Nous avons envoyé un lien à ", h("strong", {}, user.email), ". Cliquez dessus pour activer votre compte, puis revenez ici."),
    status,
    h("div", { class: "actions" }, check, resend),
  );
}

// ─── Accueil ──────────────────────────────────────────────────────────────
export async function homeScreen() {
  const [families, events, profile] = await Promise.all([data.listMyFamilies(), data.listMyEvents(), data.getProfile()]);
  const familyNames = Object.fromEntries(families.map((f) => [f.id, f.name]));

  const form = h("form", { class: "inline-form", novalidate: true },
    field("Nom de la famille", { name: "name", required: true, maxlength: 80, placeholder: "Ex. Famille Diop" }),
    h("button", { type: "submit", class: "btn btn-primary" }, "Créer la famille"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    await withBusy(form.querySelector("button"), async () => {
      try {
        const name = cleanName(formValues(form).name);
        const fid = await data.createFamily(name, profile?.displayName ?? auth.currentUser.displayName ?? "Moi");
        toast("Famille créée");
        location.hash = `#/famille/${encodeURIComponent(fid)}`;
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });

  return h("div", { class: "stack" },
    h("h1", {}, `Bonjour ${profile?.displayName ?? ""}`.trim()),
    card(
      h("h2", {}, "Mes événements"),
      events.length === 0
        ? emptyState("Aucun événement pour l'instant.", families.length ? "Ouvrez une famille pour créer un événement." : "Commencez par créer votre famille.")
        : h("ul", { class: "list" }, events.map((e) => h("li", {},
          h("a", { href: `#/evenement/${encodeURIComponent(e.familyId)}/${encodeURIComponent(e.id)}`, class: "row-link" },
            h("span", { class: "badge badge-gold" }, countdownLabel(e.startsAt)),
            h("span", { class: "row-main" }, h("strong", {}, e.title), h("small", {}, `${EVENT_TYPES[e.type]} · ${familyNames[e.familyId] ?? "Famille"} · ${EVENT_ROLES[e.myRole]}`)),
          )))),
    ),
    card(
      h("h2", {}, "Mes familles"),
      families.length === 0
        ? emptyState("Vous n'appartenez à aucune famille.", "Créez la vôtre ci-dessous, ou ouvrez le lien d'invitation reçu d'un proche.")
        : h("ul", { class: "list" }, families.map((f) => h("li", {},
          h("a", { href: `#/famille/${encodeURIComponent(f.id)}`, class: "row-link" },
            h("span", { class: "row-main" }, h("strong", {}, f.name), h("small", {}, FAMILY_ROLES[f.myRole])))))),
      h("h3", {}, "Créer une famille"),
      form,
    ),
  );
}

// ─── Profil ───────────────────────────────────────────────────────────────
export async function profileScreen() {
  const profile = (await data.getProfile()) ?? { displayName: auth.currentUser.displayName ?? "", phone: null };
  const form = h("form", { novalidate: true },
    field("Nom affiché", { name: "displayName", required: true, maxlength: 80, value: profile.displayName, autocomplete: "name" }),
    field("Téléphone (facultatif)", { name: "phone", type: "tel", value: profile.phone ?? "", autocomplete: "tel", inputmode: "tel" }, "Format international, par exemple +221 77 123 45 67. Visible par vous seul pour l'instant."),
    h("p", { class: "muted" }, `Email : ${auth.currentUser.email}`),
    h("button", { type: "submit", class: "btn btn-primary" }, "Enregistrer"),
  );
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const v = formValues(form);
        const displayName = cleanName(v.displayName);
        await data.saveProfile({ displayName, phone: normalizePhone(v.phone) });
        await updateProfile(auth.currentUser, { displayName });
        toast("Profil enregistré");
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return h("div", { class: "stack" }, backLink("#/", "Accueil"), card(h("h1", {}, "Mon profil"), form));
}

// ─── Famille ──────────────────────────────────────────────────────────────
export async function familyScreen(fid) {
  const family = await data.getFamily(fid);
  if (!family) return notFoundScreen();
  const [members, events] = await Promise.all([data.listFamilyMembers(fid), data.listMyEvents()]);
  const isAdmin = ["owner", "admin"].includes(family.myRole);
  const myUid = auth.currentUser.uid;

  const memberList = h("ul", { class: "list" }, members.map((m) => {
    const canChange = isAdmin && m.uid !== myUid && m.role !== "owner";
    const roleCell = canChange
      ? roleSelect(`Rôle de ${m.displayName}`, { admin: FAMILY_ROLES.admin, member: FAMILY_ROLES.member }, m.role, async (role) => {
        await data.setFamilyRole(fid, m.uid, role);
        toast(`${m.displayName} est maintenant ${FAMILY_ROLES[role].toLowerCase()}`);
      })
      : h("span", { class: "badge" }, FAMILY_ROLES[m.role]);
    return h("li", { class: "row" }, h("span", { class: "row-main" }, m.displayName, m.uid === myUid ? h("small", {}, " (vous)") : null), roleCell);
  }));

  const familyEvents = events.filter((e) => e.familyId === fid);

  return h("div", { class: "stack" },
    backLink("#/", "Accueil"),
    h("h1", {}, family.name),
    card(
      h("div", { class: "card-head" }, h("h2", {}, "Événements"),
        h("a", { href: `#/nouvel-evenement/${encodeURIComponent(fid)}`, class: "btn btn-primary" }, "Nouvel événement")),
      familyEvents.length === 0
        ? emptyState("Aucun événement auquel vous participez.", "Créez-en un : vous en serez l'organisateur.")
        : h("ul", { class: "list" }, familyEvents.map((e) => h("li", {},
          h("a", { href: `#/evenement/${encodeURIComponent(fid)}/${encodeURIComponent(e.id)}`, class: "row-link" },
            h("span", { class: "badge badge-gold" }, countdownLabel(e.startsAt)),
            h("span", { class: "row-main" }, h("strong", {}, e.title), h("small", {}, formatDate(e.startsAt))))))),
    ),
    card(h("h2", {}, `Membres (${members.length})`), memberList),
    isAdmin ? await invitePanel(fid, family.name) : card(h("h2", {}, "Inviter un proche"), h("p", { class: "muted" }, "Demandez à un administrateur de la famille de créer un lien d'invitation.")),
  );
}

function roleSelect(label, roles, current, onChange) {
  const select = h("select", { "aria-label": label }, Object.entries(roles).map(([value, text]) =>
    h("option", { value, selected: value === current }, text)));
  select.addEventListener("change", async () => {
    select.disabled = true;
    try {
      await onChange(select.value);
    } catch (err) {
      select.value = current;
      toast(errMsg(err));
    } finally {
      select.disabled = false;
    }
  });
  return select;
}

async function invitePanel(fid, familyName) {
  const list = h("div", {});
  async function refresh() {
    const invites = await data.listInvites(fid);
    list.replaceChildren(invites.length === 0
      ? h("p", { class: "muted" }, "Aucun lien actif.")
      : h("ul", { class: "list" }, invites.map((i) => {
        const url = inviteUrl(location.origin, fid, i.token);
        const revoke = h("button", { type: "button", class: "btn btn-small" }, "Désactiver");
        revoke.addEventListener("click", () => withBusy(revoke, async () => {
          await data.revokeInvite(fid, i.token);
          toast("Lien désactivé");
          await refresh();
        }));
        const copy = h("button", { type: "button", class: "btn btn-small" }, "Copier");
        copy.addEventListener("click", async () => {
          try { await navigator.clipboard.writeText(url); toast("Lien copié"); } catch { toast("Copie impossible : sélectionnez le lien à la main."); }
        });
        return h("li", { class: "invite" },
          h("input", { type: "text", readonly: true, value: url, "aria-label": "Lien d'invitation", class: "invite-url" }),
          h("small", {}, `Valable jusqu'au ${formatDate(i.expiresAt.toDate())}`),
          h("div", { class: "actions" },
            h("a", { href: whatsappShareUrl(inviteMessage(familyName, url)), target: "_blank", rel: "noopener", class: "btn btn-small btn-whatsapp" }, "Envoyer sur WhatsApp"),
            copy, revoke),
        );
      })));
  }
  const create = h("button", { type: "button", class: "btn btn-primary" }, "Créer un lien d'invitation");
  create.addEventListener("click", () => withBusy(create, async () => {
    try {
      await data.createInvite(fid, familyName);
      toast("Lien créé");
      await refresh();
    } catch (err) {
      toast(errMsg(err));
    }
  }));
  await refresh();
  return card(
    h("h2", {}, "Inviter un proche"),
    h("p", { class: "muted" }, "Le lien est valable 7 jours. Toute personne qui le reçoit peut rejoindre la famille comme membre : partagez-le seulement avec vos proches."),
    create, list,
  );
}

// ─── Rejoindre ────────────────────────────────────────────────────────────
export async function joinScreen(fid, token) {
  if (!isToken(token)) return notFoundScreen("Ce lien d'invitation n'est pas valide.");
  if (await data.isFamilyMember(fid).catch(() => false)) {
    location.hash = `#/famille/${encodeURIComponent(fid)}`;
    return h("div", {});
  }
  const invite = await data.getInvite(fid, token);
  if (!invite) return notFoundScreen("Ce lien d'invitation n'existe pas ou a été désactivé.");
  if (invite.expired) return notFoundScreen("Ce lien d'invitation a expiré. Demandez-en un nouveau.");
  const profile = await data.getProfile();
  const join = h("button", { type: "button", class: "btn btn-primary" }, "Rejoindre la famille");
  const status = h("div", {});
  join.addEventListener("click", () => withBusy(join, async () => {
    try {
      await data.joinFamily(fid, token, profile?.displayName ?? auth.currentUser.displayName ?? "Membre");
      toast(`Bienvenue dans ${invite.familyName}`);
      location.hash = `#/famille/${encodeURIComponent(fid)}`;
    } catch (err) {
      status.replaceChildren(alertBox(errMsg(err)));
    }
  }));
  return card(h("h1", {}, invite.familyName), h("p", {}, "Vous êtes invité(e) à rejoindre cette famille sur Bennoo."), status, join);
}

// ─── Événements ───────────────────────────────────────────────────────────
function eventForm(fid, initial, submitLabel, onSave) {
  const v = initial ?? {};
  const toInputDate = (d) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
  const amountInput = (minor, currency) => (minor ? String(currency === "EUR" ? minor / 100 : minor) : "");
  const form = h("form", { novalidate: true },
    field("Type de cérémonie", { name: "type", tag: "select", required: true, options: Object.entries(EVENT_TYPES) }),
    field("Nom de l'événement", { name: "title", required: true, maxlength: 120, value: v.title ?? "", placeholder: "Ex. Mariage de Fatou et Mamadou" }),
    field("Date et heure", { name: "startsAt", type: "datetime-local", value: toInputDate(v.startsAt) }, "Facultatif : vous pourrez la fixer plus tard."),
    field("Lieu", { name: "venue", maxlength: 200, value: v.venue ?? "" }),
    field("Ville", { name: "city", maxlength: 120, value: v.city ?? "" }),
    field("Devise", { name: "currency", tag: "select", options: Object.entries(CURRENCIES) }),
    field("Budget prévu", { name: "budgetPlanned", inputmode: "decimal", value: amountInput(v.budgetPlanned, v.currency ?? "XOF") }, "Montant total estimé. Laissez vide si vous ne le connaissez pas encore."),
    field("Nombre d'invités prévu", { name: "expectedGuests", type: "number", min: 0, max: 100000, inputmode: "numeric", value: v.expectedGuests ?? "" }),
    field("Description", { name: "description", tag: "textarea", maxlength: 2000, rows: 3 }),
    h("button", { type: "submit", class: "btn btn-primary" }, submitLabel),
  );
  form.elements.type.value = v.type ?? "WEDDING";
  form.elements.currency.value = v.currency ?? "XOF";
  form.elements.description.value = v.description ?? "";
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    showFormError(form, null);
    const f = formValues(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const title = f.title.replace(/\s+/g, " ").trim();
        if (!title) throw new Error("Le nom de l'événement est obligatoire.");
        const guests = f.expectedGuests === "" ? null : Number(f.expectedGuests);
        if (guests !== null && (!Number.isInteger(guests) || guests < 0 || guests > 100000)) throw new Error("Nombre d'invités invalide.");
        const startsAt = f.startsAt ? new Date(f.startsAt) : null;
        if (startsAt && Number.isNaN(startsAt.getTime())) throw new Error("Date invalide.");
        await onSave({
          type: f.type, title, startsAt, venue: f.venue.trim(), city: f.city.trim(), currency: f.currency,
          budgetPlanned: parseAmount(f.budgetPlanned, f.currency), expectedGuests: guests,
          description: f.description.trim(),
        });
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return form;
}

export async function newEventScreen(fid) {
  const family = await data.getFamily(fid);
  if (!family) return notFoundScreen();
  const form = eventForm(fid, null, "Créer l'événement", async (e) => {
    const displayName = await data.getMyFamilyDisplayName(fid);
    const eid = await data.createEvent(fid, e, displayName);
    toast("Événement créé");
    location.hash = `#/evenement/${encodeURIComponent(fid)}/${encodeURIComponent(eid)}`;
  });
  return h("div", { class: "stack" }, backLink(`#/famille/${encodeURIComponent(fid)}`, family.name),
    card(h("h1", {}, "Nouvel événement"), h("p", { class: "muted" }, `Famille : ${family.name}. Vous en serez l'organisateur.`), form));
}

export async function eventScreen(fid, eid) {
  const [event, family] = await Promise.all([data.getEvent(fid, eid), data.getFamily(fid)]);
  if (!event || !family) return notFoundScreen("Cet événement n'existe pas, ou vous n'y participez pas.");
  const isOrganizer = event.myRole === "organizer";
  const participants = await data.listParticipants(fid, eid);
  const myUid = auth.currentUser.uid;

  const facts = h("dl", { class: "facts" },
    h("dt", {}, "Type"), h("dd", {}, EVENT_TYPES[event.type]),
    h("dt", {}, "Date"), h("dd", {}, event.startsAt ? `${formatDate(event.startsAt)} à ${event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "À fixer"),
    h("dt", {}, "Lieu"), h("dd", {}, [event.venue, event.city].filter(Boolean).join(", ") || "À préciser"),
    h("dt", {}, "Invités prévus"), h("dd", {}, event.expectedGuests ?? "Non renseigné"),
    h("dt", {}, "Budget prévu"), h("dd", {}, event.budgetPlanned ? formatAmount(event.budgetPlanned, event.currency) : "Non renseigné"),
  );

  const participantList = h("ul", { class: "list" }, participants.map((p) => {
    const editable = isOrganizer && p.uid !== myUid;
    const roleCell = editable
      ? roleSelect(`Rôle de ${p.displayName}`, EVENT_ROLES, p.role, async (role) => {
        await data.setParticipantRole(fid, eid, p.uid, role);
        toast(`${p.displayName} : ${EVENT_ROLES[role].toLowerCase()}`);
      })
      : h("span", { class: "badge" }, EVENT_ROLES[p.role]);
    const remove = editable ? h("button", { type: "button", class: "btn btn-small" }, "Retirer") : null;
    remove?.addEventListener("click", () => withBusy(remove, async () => {
      if (!confirm(`Retirer ${p.displayName} de l'événement ?`)) return;
      await data.removeParticipant(fid, eid, p.uid);
      toast("Participant retiré");
      window.dispatchEvent(new Event("hashchange"));
    }));
    return h("li", { class: "row" }, h("span", { class: "row-main" }, p.displayName, p.uid === myUid ? h("small", {}, " (vous)") : null), roleCell, remove);
  }));

  let addPanel = null;
  if (isOrganizer) {
    const members = await data.listFamilyMembers(fid);
    const inEvent = new Set(participants.map((p) => p.uid));
    const candidates = members.filter((m) => !inEvent.has(m.uid));
    if (candidates.length === 0) {
      addPanel = h("p", { class: "muted" }, "Tous les membres de la famille participent déjà. Invitez d'autres proches depuis la page de la famille.");
    } else {
      const form = h("form", { class: "inline-form", novalidate: true },
        field("Membre de la famille", { name: "member", tag: "select", options: candidates.map((m) => [m.uid, m.displayName]) }),
        field("Rôle", { name: "role", tag: "select", options: [["member", EVENT_ROLES.member], ["treasurer", EVENT_ROLES.treasurer], ["organizer", EVENT_ROLES.organizer]] }),
        h("button", { type: "submit", class: "btn btn-primary" }, "Ajouter"),
      );
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const f = formValues(form);
        const member = candidates.find((m) => m.uid === f.member);
        await withBusy(form.querySelector("button"), async () => {
          try {
            await data.addParticipant(fid, eid, member, f.role);
            toast(`${member.displayName} ajouté(e)`);
            window.dispatchEvent(new Event("hashchange"));
          } catch (err) {
            showFormError(form, errMsg(err));
          }
        });
      });
      addPanel = h("div", {}, h("h3", {}, "Ajouter un participant"), form);
    }
  }

  let editPanel = null;
  if (isOrganizer) {
    const details = h("details", {}, h("summary", {}, "Modifier l'événement"),
      eventForm(fid, event, "Enregistrer les modifications", async (e) => {
        await data.updateEvent(fid, eid, e);
        toast("Événement mis à jour");
        window.dispatchEvent(new Event("hashchange"));
      }));
    editPanel = card(details);
  }

  return h("div", { class: "stack" },
    backLink(`#/famille/${encodeURIComponent(fid)}`, family.name),
    h("div", { class: "event-hero" },
      h("p", { class: "countdown", "aria-label": "Compte à rebours" }, countdownLabel(event.startsAt)),
      h("h1", {}, event.title),
      h("p", {}, `Votre rôle : ${EVENT_ROLES[event.myRole]}`),
    ),
    card(h("h2", {}, "Informations"), facts, event.description ? h("p", { class: "description" }, event.description) : null),
    card(h("h2", {}, `Participants (${participants.length})`),
      h("p", { class: "muted" }, "Seuls les participants voient cet événement, même au sein de la famille."),
      participantList, addPanel),
    editPanel,
    card(h("h2", {}, "Bientôt"), h("p", { class: "muted" }, "Tâches, budget et contributions, invités : prochaines étapes du développement.")),
  );
}

// ─── Écrans d'erreur ──────────────────────────────────────────────────────
export function notFoundScreen(message = "Cette page n'existe pas, ou vous n'y avez pas accès.") {
  return card(h("h1", {}, "Introuvable"), h("p", {}, message), h("a", { href: "#/", class: "btn" }, "Retour à l'accueil"));
}

export function errorScreen(err) {
  return card(h("h1", {}, "Une erreur est survenue"), alertBox(errMsg(err)), h("a", { href: "#/", class: "btn" }, "Retour à l'accueil"));
}
