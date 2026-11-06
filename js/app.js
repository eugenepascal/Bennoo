/* =========================================================================
   Bennoo — Une cérémonie, toute la famille, un seul endroit.
   Application web statique (HTML/CSS/JS, aucune étape de compilation).
   Données : Firebase (Authentication par email + Firestore).
   ========================================================================= */
(() => {
"use strict";

/* ---------- Firebase ----------
   Projet Firebase « bennoo-4186e »
   (console Firebase > Paramètres du projet > Vos applications > Web).
   Ces valeurs ne sont pas secrètes : la sécurité repose sur les règles Firestore. */
const firebaseConfig = {
  apiKey: "AIzaSyAD0c71YrcmQiw26i7c3k97iC6ewSQ1gdo",
  // Sur Firebase Hosting, la connexion passe par la même adresse que le site (pas d'aller-retour
  // entre deux domaines, connexion Google fiable sur iPhone) ; ailleurs (GitHub Pages), par firebaseapp.com.
  authDomain: /(^|\.)bennoo-4186e\.(web\.app|firebaseapp\.com)$/.test(location.hostname) ? location.hostname : "bennoo-4186e.firebaseapp.com",
  projectId: "bennoo-4186e",
  storageBucket: "bennoo-4186e.firebasestorage.app",
  messagingSenderId: "746683819473",
  appId: "1:746683819473:web:ca389548bc75d44d68ecf0",
  measurementId: "G-HGJN04YFNE",
};
// Google Analytics n'est pas chargé : aucune mesure d'audience sans consentement.

let auth = null, db = null, FIREBASE_READY = false;
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId && window.firebase) {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    auth.languageCode = "fr";
    db = firebase.firestore();
    FIREBASE_READY = true;
  }
} catch (e) { console.warn("Firebase indisponible :", e); }

const NOT_READY = "Bennoo n'est pas encore relié à son projet Firebase : l'inscription et la connexion ne fonctionnent pas encore.";
function requireFirebase() { if (!FIREBASE_READY) throw new Error(NOT_READY); }
const serverTimestamp = () => firebase.firestore.FieldValue.serverTimestamp();
const Timestamp = { fromDate: (d) => firebase.firestore.Timestamp.fromDate(d), fromMillis: (ms) => firebase.firestore.Timestamp.fromMillis(ms) };

/* ---------- Authentification (petites fonctions d'appel) ---------- */
const createUserWithEmailAndPassword = (_a, email, pw) => { requireFirebase(); return auth.createUserWithEmailAndPassword(email, pw); };
const signInWithEmailAndPassword = (_a, email, pw) => { requireFirebase(); return auth.signInWithEmailAndPassword(email, pw); };
const signOut = () => (auth ? auth.signOut() : Promise.resolve());
const sendEmailVerification = (user) => user.sendEmailVerification();
const sendPasswordResetEmail = (_a, email) => { requireFirebase(); return auth.sendPasswordResetEmail(email); };
const updateProfile = (user, p) => user.updateProfile(p);

/* Connexion avec Google : fenêtre surgissante ; si le navigateur la bloque (fréquent sur
   téléphone), on bascule sur une redirection vers Google puis retour sur Bennoo. */
// Mémoire de session : "local" (IndexedDB, par défaut) ou "session" (sessionStorage) si le
// navigateur a refusé IndexedDB lors d'une tentative précédente. Réglée une seule fois au
// démarrage : la fenêtre Google doit s'ouvrir immédiatement au clic, sinon le navigateur la bloque.
const GOOGLE_PERSIST_KEY = "bennoo:auth-persistence";
function isStorageError(err) {
  return /closing|hidden|indexed ?db|database/i.test(String(err && err.message));
}
function applyPersistence() {
  if (!FIREBASE_READY) return;
  let mode = "local";
  try { mode = localStorage.getItem(GOOGLE_PERSIST_KEY) || "local"; } catch (_) { mode = "session"; }
  auth.setPersistence(mode === "session" ? firebase.auth.Auth.Persistence.SESSION : firebase.auth.Auth.Persistence.LOCAL)
    .catch(() => { /* navigation privée / ancien navigateur : valeur par défaut */ });
}
async function signInWithGoogle() {
  requireFirebase();
  const provider = new firebase.auth.GoogleAuthProvider();
  // Pas de « select_account » (comme Yond) : déjà connecté à Google, la fenêtre se referme seule.
  // Pour changer de compte Google : se déconnecter de Google ou utiliser une fenêtre privée.
  try {
    // Pas de redirection : sur github.io, la redirection Google revient sans session
    // (le navigateur isole le stockage de bennoo-4186e.firebaseapp.com).
    // Délai maximal : si la fenêtre Google reste sans réponse 2 minutes, on arrête d'attendre.
    await Promise.race([
      auth.signInWithPopup(provider),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "auth/timeout" })), 120000)),
    ]);
  } catch (err) {
    if (isStorageError(err)) {
      for (let i = 0; i < 20 && !auth.currentUser; i++) await new Promise((r) => setTimeout(r, 150));
      if (auth.currentUser) return;
      try { localStorage.setItem(GOOGLE_PERSIST_KEY, "session"); } catch (_) {}
      try { await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION); } catch (_) {}
      throw Object.assign(new Error("Le navigateur a bloqué la mémoire locale pendant la connexion Google. Cliquez de nouveau sur « Continuer avec Google » : Bennoo utilise maintenant une autre mémoire."), { code: undefined });
    }
    if (err.code === "auth/popup-blocked") {
      throw Object.assign(new Error("La fenêtre Google a été bloquée. Autorisez les fenêtres pop-up pour ce site, puis réessayez."), { code: undefined });
    }
    if (err.code === "auth/cancelled-popup-request") return; // un second clic a remplacé la première fenêtre
    throw err;
  }
}

/* Premier passage d'un compte Google : on crée son profil Bennoo à partir de son nom Google. */
async function ensureProfile(user) {
  try {
    const existing = await data.getProfile();
    if (existing) return;
    const fallback = (user.email || "Membre").split("@")[0];
    await data.saveProfile({ displayName: cleanName(user.displayName || fallback).slice(0, 80), phone: null });
  } catch (e) { console.warn("Profil non créé :", e); }
}

function googleButton(form) {
  const btn = h("button", { type: "button", class: "btn btn-block btn-google" },
    h("img", { src: "images/google.svg", alt: "", width: 20, height: 20 }), "Continuer avec Google");
  const status = h("p", { class: "muted small center", role: "status", "aria-live": "polite" });
  btn.addEventListener("click", () => withBusy(btn, async () => {
    showFormError(form, null);
    status.textContent = "Fenêtre Google ouverte : choisissez votre compte. La connexion peut prendre une dizaine de secondes, ne recliquez pas.";
    try {
      await signInWithGoogle();
    } catch (err) {
      // Sur un site hébergé hors de Firebase, la fenêtre Google peut se fermer avant que la
      // réponse arrive. On attend donc un peu la connexion avant d'annoncer un échec.
      const waitable = ["auth/popup-closed-by-user", "auth/network-request-failed", "auth/timeout"].includes(err?.code) || !err?.code;
      if (waitable && await waitForSignIn(GOOGLE_WAIT_SECONDS, (left) => {
        btn.textContent = `Connexion en cours… ${left} s`;
        status.textContent = "Nous attendons la réponse de Google, ne fermez pas la page.";
      })) { status.textContent = "Connecté(e) !"; return; }
      status.textContent = "";
      showFormError(form, waitable
        ? "La connexion Google n'a pas abouti. Cliquez de nouveau sur « Continuer avec Google » : le deuxième essai fonctionne en général."
        : errMsg(err));
    }
  }));
  return h("div", { class: "form" }, h("p", { class: "or" }, "Ou continuer avec"), btn, status);
}

const GOOGLE_WAIT_SECONDS = 15;
/** Attend jusqu'à `seconds` secondes qu'un utilisateur soit connecté ; vrai s'il l'est. */
function waitForSignIn(seconds, onTick) {
  if (auth?.currentUser) return Promise.resolve(true);
  return new Promise((resolve) => {
    let left = seconds;
    onTick(left);
    const stop = (ok) => { clearInterval(timer); unsubscribe(); resolve(ok); };
    const unsubscribe = auth.onAuthStateChanged((u) => { if (u) stop(true); });
    const timer = setInterval(() => {
      left -= 1;
      if (auth.currentUser) return stop(true);
      if (left <= 0) return stop(false);
      onTick(left);
    }, 1000);
  });
}

/* ---------- Données (Firestore) ----------
   Structure :
     users/{uid}                                     profil privé
     families/{fid}                                  famille
     families/{fid}/members/{uid}                    appartenance (owner | admin | member)
     families/{fid}/invites/{jeton}                  lien d'invitation (7 jours)
     families/{fid}/events/{eid}                     événement
     families/{fid}/events/{eid}/participants/{uid}  rôle (organizer | treasurer | member)
   Les règles Firestore (fichier firestore.rules) re-vérifient tout côté serveur. */
const data = (() => {
  const uid = () => {
    if (!auth || !auth.currentUser) throw Object.assign(new Error("Non connecté"), { code: "permission-denied" });
    return auth.currentUser.uid;
  };
  const fam = (fid) => db.collection("families").doc(fid);
  const ev = (fid, eid) => fam(fid).collection("events").doc(eid);

  async function getProfile() {
    const s = await db.collection("users").doc(uid()).get();
    return s.exists ? s.data() : null;
  }
  async function saveProfile({ displayName, phone }) {
    const ref = db.collection("users").doc(uid());
    const existing = await ref.get();
    await ref.set({
      displayName, phone, locale: "fr",
      createdAt: existing.exists ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  async function createFamily(name, displayName) {
    const me = uid();
    const ref = db.collection("families").doc();
    const batch = db.batch();
    batch.set(ref, { name, createdBy: me, createdAt: serverTimestamp() });
    batch.set(ref.collection("members").doc(me), { uid: me, role: "owner", displayName, joinedAt: serverTimestamp() });
    await batch.commit();
    return ref.id;
  }
  async function listMyFamilies() {
    const rows = await db.collectionGroup("members").where("uid", "==", uid()).get();
    const list = await Promise.all(rows.docs.map(async (m) => {
      const ref = m.ref.parent.parent;
      const f = await ref.get();
      return f.exists ? { id: ref.id, ...f.data(), myRole: m.data().role } : null;
    }));
    return list.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
  async function getFamily(fid) {
    const [f, me] = await Promise.all([fam(fid).get(), fam(fid).collection("members").doc(uid()).get()]);
    if (!f.exists || !me.exists) return null;
    return { id: fid, ...f.data(), myRole: me.data().role };
  }
  async function listFamilyMembers(fid) {
    const s = await fam(fid).collection("members").get();
    return s.docs.map((d) => d.data()).sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
  }
  const renameFamily = (fid, name) => fam(fid).update({ name });
  const setEventStatus = (fid, eid, status) => ev(fid, eid).update({ status, updatedAt: serverTimestamp() });
  const setFamilyRole = (fid, memberUid, role) => fam(fid).collection("members").doc(memberUid).update({ role });
  const removeFamilyMember = (fid, memberUid) => fam(fid).collection("members").doc(memberUid).delete();

  async function createInvite(fid, familyName) {
    const token = generateToken();
    await fam(fid).collection("invites").doc(token).set({
      familyName, createdBy: uid(), createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 86400000),
    });
    return token;
  }
  async function listInvites(fid) {
    const s = await fam(fid).collection("invites").get();
    return s.docs.map((d) => ({ token: d.id, ...d.data() }))
      .filter((i) => i.expiresAt.toMillis() > Date.now())
      .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis());
  }
  const revokeInvite = (fid, token) => fam(fid).collection("invites").doc(token).delete();
  async function getInvite(fid, token) {
    const s = await fam(fid).collection("invites").doc(token).get();
    if (!s.exists) return null;
    const d = s.data();
    return { ...d, expired: d.expiresAt.toMillis() <= Date.now() };
  }
  async function isFamilyMember(fid) { return (await fam(fid).collection("members").doc(uid()).get()).exists; }
  const joinFamily = (fid, token, displayName) => fam(fid).collection("members").doc(uid()).set({
    uid: uid(), role: "member", displayName, joinedAt: serverTimestamp(), inviteToken: token,
  });

  const payload = (e) => ({
    type: e.type, title: e.title, description: e.description || null,
    startsAt: e.startsAt ? Timestamp.fromDate(e.startsAt) : null,
    venue: e.venue || null, city: e.city || null, currency: e.currency,
    budgetPlanned: e.budgetPlanned, expectedGuests: e.expectedGuests ?? null, cover: e.cover || null,
  });
  async function createEvent(fid, e, displayName) {
    const me = uid();
    const ref = fam(fid).collection("events").doc();
    const batch = db.batch();
    batch.set(ref, { ...payload(e), status: "active", createdBy: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    batch.set(ref.collection("participants").doc(me), { uid: me, role: "organizer", displayName, addedAt: serverTimestamp() });
    await batch.commit();
    return ref.id;
  }
  const updateEvent = (fid, eid, e) => ev(fid, eid).update({ ...payload(e), updatedAt: serverTimestamp() });
  const toEvent = (fid, id, d, myRole) => ({ familyId: fid, id, ...d, startsAt: d.startsAt ? d.startsAt.toDate() : null, myRole });
  async function listMyEvents() {
    const rows = await db.collectionGroup("participants").where("uid", "==", uid()).get();
    const list = await Promise.all(rows.docs.map(async (p) => {
      const ref = p.ref.parent.parent;
      const fid = ref.parent.parent.id;
      const e = await ref.get();
      return e.exists ? toEvent(fid, ref.id, e.data(), p.data().role) : null;
    }));
    return list.filter(Boolean).sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity));
  }
  async function getEvent(fid, eid) {
    const [e, me] = await Promise.all([ev(fid, eid).get(), ev(fid, eid).collection("participants").doc(uid()).get()]);
    if (!e.exists || !me.exists) return null;
    return toEvent(fid, eid, e.data(), me.data().role);
  }
  async function listParticipants(fid, eid) {
    const s = await ev(fid, eid).collection("participants").get();
    const order = { organizer: 0, treasurer: 1, member: 2 };
    return s.docs.map((d) => d.data()).sort((a, b) => order[a.role] - order[b.role] || a.displayName.localeCompare(b.displayName, "fr"));
  }
  const addParticipant = (fid, eid, m, role) => ev(fid, eid).collection("participants").doc(m.uid).set({ uid: m.uid, role, displayName: m.displayName, addedAt: serverTimestamp() });
  const setParticipantRole = (fid, eid, pid, role) => ev(fid, eid).collection("participants").doc(pid).update({ role });
  const removeParticipant = (fid, eid, pid) => ev(fid, eid).collection("participants").doc(pid).delete();
  async function getMyFamilyDisplayName(fid) {
    const s = await fam(fid).collection("members").doc(uid()).get();
    return s.exists ? s.data().displayName : null;
  }

  return { renameFamily, setEventStatus, getProfile, saveProfile, createFamily, listMyFamilies, getFamily, listFamilyMembers, setFamilyRole, removeFamilyMember,
    createInvite, listInvites, revokeInvite, getInvite, isFamilyMember, joinFamily, createEvent, updateEvent, listMyEvents,
    getEvent, listParticipants, addParticipant, setParticipantRole, removeParticipant, getMyFamilyDisplayName };
})();


/* ---------- Données des étapes 2 à 4 : tâches, budget, contributions, invités ----------
   Sous chaque événement families/{fid}/events/{eid} :
     tasks/{tid}                              tâche (tous les participants la voient)
     expenses/{xid}                           dépense (organisateur et trésorier seulement)
     contributions/{cid}                      contribution (organisateur et trésorier ; le contributeur voit la sienne)
     contributions/{cid}/private/identity     qui a donné, si anonyme : contributeur et trésorier seulement
     participants/{uid}/myContributions/{cid} index personnel « mes contributions »
     summary/budget, summary/guests           totaux lisibles par tous les participants
     guests/{jeton}                           foyer invité ; le jeton (43 caractères) sert de lien personnel
     public/invitation                        carton d'invitation lisible sans compte (avec le lien)
   Les règles Firestore re-vérifient tout. */
const orga = (() => {
  const uid = () => {
    if (!auth || !auth.currentUser) throw Object.assign(new Error("Non connecté"), { code: "permission-denied" });
    return auth.currentUser.uid;
  };
  const ev = (fid, eid) => db.collection("families").doc(fid).collection("events").doc(eid);
  const ts = (d) => (d ? Timestamp.fromDate(d) : null);
  const toDate = (t) => (t && typeof t.toDate === "function" ? t.toDate() : null);
  const now = () => serverTimestamp();

  // ─── Tâches ───
  const taskPayload = (t) => ({
    title: t.title, notes: t.notes || null, dueAt: ts(t.dueAt), status: t.status,
    assigneeUid: t.assigneeUid || null, assigneeName: t.assigneeUid ? t.assigneeName : null,
  });
  const toTask = (d) => ({ id: d.id, ...d.data(), dueAt: toDate(d.data().dueAt) });
  async function listTasks(fid, eid) {
    const s = await ev(fid, eid).collection("tasks").get();
    return s.docs.map(toTask).sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || a.title.localeCompare(b.title, "fr"));
  }
  async function getTask(fid, eid, tid) {
    const d = await ev(fid, eid).collection("tasks").doc(tid).get();
    return d.exists ? toTask(d) : null;
  }
  async function createTask(fid, eid, t) {
    const ref = await ev(fid, eid).collection("tasks").add({ ...taskPayload(t), createdBy: uid(), createdAt: now(), updatedAt: now() });
    return ref.id;
  }
  async function createTasks(fid, eid, list) {
    const batch = db.batch();
    for (const t of list) batch.set(ev(fid, eid).collection("tasks").doc(), { ...taskPayload(t), createdBy: uid(), createdAt: now(), updatedAt: now() });
    await batch.commit();
  }
  const updateTask = (fid, eid, tid, t) => ev(fid, eid).collection("tasks").doc(tid).update({ ...taskPayload(t), updatedAt: now() });
  const setTaskStatus = (fid, eid, tid, status) => ev(fid, eid).collection("tasks").doc(tid).update({ status, updatedAt: now() });
  const deleteTask = (fid, eid, tid) => ev(fid, eid).collection("tasks").doc(tid).delete();

  // ─── Dépenses ───
  const expensePayload = (x) => ({ label: x.label, category: x.category, amount: x.amount, supplier: x.supplier || null, spentAt: ts(x.spentAt), status: x.status });
  const toExpense = (d) => ({ id: d.id, ...d.data(), spentAt: toDate(d.data().spentAt) });
  async function listExpenses(fid, eid) {
    const s = await ev(fid, eid).collection("expenses").get();
    return s.docs.map(toExpense).sort((a, b) => (b.spentAt?.getTime() ?? 0) - (a.spentAt?.getTime() ?? 0));
  }
  async function getExpense(fid, eid, xid) {
    const d = await ev(fid, eid).collection("expenses").doc(xid).get();
    return d.exists ? toExpense(d) : null;
  }
  const createExpense = (fid, eid, x) => ev(fid, eid).collection("expenses").add({ ...expensePayload(x), createdBy: uid(), createdAt: now(), updatedAt: now() });
  const updateExpense = (fid, eid, xid, x) => ev(fid, eid).collection("expenses").doc(xid).update({ ...expensePayload(x), updatedAt: now() });
  const deleteExpense = (fid, eid, xid) => ev(fid, eid).collection("expenses").doc(xid).delete();

  // ─── Contributions ───
  const contrib = (fid, eid, cid) => ev(fid, eid).collection("contributions").doc(cid);
  const mine = (fid, eid, cid) => ev(fid, eid).collection("participants").doc(uid()).collection("myContributions").doc(cid);
  /** Contribution d'un participant pour lui-même (promise ou déclarée), anonyme ou non. */
  async function createMyContribution(fid, eid, { amount, status, anonymous, note, kind, item, origin }, myName) {
    const ref = ev(fid, eid).collection("contributions").doc();
    const batch = db.batch();
    batch.set(ref, { amount, status, anonymous, displayName: anonymous ? null : myName, source: "self", note: note || null,
      kind, item: kind === "inkind" ? item : null, origin, createdAt: now(), updatedAt: now() });
    batch.set(ref.collection("private").doc("identity"), { uid: uid(), displayName: myName });
    batch.set(mine(fid, eid, ref.id), { createdAt: now() });
    await batch.commit();
  }
  /** Don reçu enregistré par le trésorier (par exemple d'un proche sans compte). */
  const recordContribution = (fid, eid, { amount, status, displayName, note, kind, item, origin }) => ev(fid, eid).collection("contributions").add({
    amount, status, anonymous: false, displayName, source: "treasurer", note: note || null,
    kind, item: kind === "inkind" ? item : null, origin, createdAt: now(), updatedAt: now(),
  });
  const toContribution = (d) => ({ id: d.id, ...d.data(), createdAt: toDate(d.data().createdAt) });
  async function listContributions(fid, eid) {
    const s = await ev(fid, eid).collection("contributions").get();
    return s.docs.map(toContribution).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }
  async function getIdentity(fid, eid, cid) {
    const d = await contrib(fid, eid, cid).collection("private").doc("identity").get();
    return d.exists ? d.data() : null;
  }
  async function listMyContributions(fid, eid) {
    const s = await ev(fid, eid).collection("participants").doc(uid()).collection("myContributions").get();
    const list = await Promise.all(s.docs.map(async (m) => {
      const d = await contrib(fid, eid, m.id).get().catch(() => null);
      return d && d.exists ? toContribution(d) : null; // supprimée par le trésorier : ignorée
    }));
    return list.filter(Boolean).sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
  }
  const setContributionStatus = (fid, eid, cid, status) => contrib(fid, eid, cid).update({ status, updatedAt: now() });
  const updateMyContribution = (fid, eid, cid, { amount, status, note, item, origin }) => contrib(fid, eid, cid).update({ amount, status, note: note || null, item: item ?? null, origin, updatedAt: now() });
  async function deleteMyContribution(fid, eid, cid) {
    const batch = db.batch();
    batch.delete(contrib(fid, eid, cid));
    batch.delete(contrib(fid, eid, cid).collection("private").doc("identity"));
    batch.delete(mine(fid, eid, cid));
    await batch.commit();
  }
  async function deleteContributionAsTreasurer(fid, eid, cid, source) {
    const batch = db.batch();
    batch.delete(contrib(fid, eid, cid));
    if (source === "self") batch.delete(contrib(fid, eid, cid).collection("private").doc("identity"));
    await batch.commit();
  }

  // ─── Totaux partagés (calculés par l'organisateur ou le trésorier, lus par tous) ───
  async function getSummary(fid, eid) {
    const [b, g] = await Promise.all([
      ev(fid, eid).collection("summary").doc("budget").get().catch(() => null),
      ev(fid, eid).collection("summary").doc("guests").get().catch(() => null),
    ]);
    const val = (d) => (d && d.exists ? { ...d.data(), updatedAt: toDate(d.data().updatedAt) } : null);
    return { budget: val(b), guests: val(g) };
  }
  /** Argent seulement dans les montants ; les dons en nature sont comptés à part. */
  function budgetTotals(expenses, contributions) {
    const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
    const money = contributions.filter((c) => c.kind !== "inkind");
    const confirmed = money.filter((c) => c.status === "confirmed");
    return {
      spent: sum(expenses), paid: sum(expenses.filter((x) => x.status === "paid")),
      confirmed: sum(confirmed), pending: sum(money.filter((c) => c.status !== "confirmed")),
      contributors: confirmed.length,
      inkind: contributions.filter((c) => c.kind === "inkind" && c.status === "confirmed").length,
    };
  }
  /** Contributions confirmées (argent) par provenance, pour l'anneau du budget. */
  function byOrigin(contributions) {
    const out = {};
    for (const c of contributions) if (c.kind !== "inkind" && c.status === "confirmed") out[c.origin ?? "OTHER"] = (out[c.origin ?? "OTHER"] ?? 0) + c.amount;
    return out;
  }
  function guestTotals(guests) {
    const t = { households: guests.length, invited: 0, yes: 0, no: 0, pending: 0, attending: 0 };
    for (const g of guests) {
      t.invited += g.seats;
      t[g.response] += 1;
      if (g.response === "yes") t.attending += g.attending;
    }
    return t;
  }
  /** Réécrit le total seulement s'il a changé (évite des écritures inutiles). */
  async function saveSummary(fid, eid, id, totals, previous) {
    if (previous && Object.keys(totals).every((k) => previous[k] === totals[k])) return;
    await ev(fid, eid).collection("summary").doc(id).set({ ...totals, updatedAt: now() });
  }

  // ─── Invités et carton d'invitation ───
  const toGuest = (d) => ({ token: d.id, ...d.data(), respondedAt: toDate(d.data().respondedAt) });
  async function listGuests(fid, eid) {
    const s = await ev(fid, eid).collection("guests").get();
    return s.docs.map(toGuest).sort((a, b) => a.household.localeCompare(b.household, "fr"));
  }
  async function createGuest(fid, eid, { household, phone, seats }) {
    const token = generateToken();
    await ev(fid, eid).collection("guests").doc(token).set({
      household, phone: phone || null, seats, response: "pending", attending: null, message: null, respondedAt: null,
      createdBy: uid(), createdAt: now(),
    });
    return token;
  }
  const updateGuest = (fid, eid, token, { household, phone, seats }) => ev(fid, eid).collection("guests").doc(token).update({ household, phone: phone || null, seats });
  const deleteGuest = (fid, eid, token) => ev(fid, eid).collection("guests").doc(token).delete();
  async function getGuest(fid, eid, token) {
    const d = await ev(fid, eid).collection("guests").doc(token).get();
    return d.exists ? toGuest(d) : null;
  }
  /** Réponse d'un invité, sans compte : seuls les champs de réponse changent. */
  const answerGuest = (fid, eid, token, { response, attending, message }) => ev(fid, eid).collection("guests").doc(token).update({
    response, attending, message: message || null, respondedAt: now(),
  });
  async function getInvitation(fid, eid) {
    const d = await ev(fid, eid).collection("public").doc("invitation").get();
    return d.exists ? { ...d.data(), startsAt: toDate(d.data().startsAt) } : null;
  }
  /** Publie (ou met à jour) le carton : reprend le titre, la date et le lieu de l'événement. */
  async function saveInvitation(fid, eid, event, { hosts, message, theme, cover }) {
    await ev(fid, eid).collection("public").doc("invitation").set({
      title: event.title, type: event.type, startsAt: ts(event.startsAt), venue: event.venue || null, city: event.city || null,
      hosts: hosts || null, message: message || null, theme: INVITE_THEMES[theme] ? theme : "royal",
      cover: PHOTOS[event.cover] ? event.cover : (PHOTOS[cover] ? cover : null), updatedAt: now(),
    });
  }
  /** Après modification de l'événement : le carton déjà publié suit (titre, date, lieu). */
  async function syncInvitation(fid, eid, event) {
    const current = await getInvitation(fid, eid).catch(() => null);
    if (current) await saveInvitation(fid, eid, event, current);
  }

  // ─── Comités ───
  async function listCommittees(fid, eid) {
    const s = await ev(fid, eid).collection("committees").get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }
  const createCommittee = (fid, eid, name, members) => ev(fid, eid).collection("committees").add({
    name, memberUids: members.map((m) => m.uid), memberNames: members.map((m) => m.displayName), createdBy: uid(), createdAt: now(), updatedAt: now(),
  });
  const deleteCommittee = (fid, eid, id) => ev(fid, eid).collection("committees").doc(id).delete();

  return {
    listCommittees, createCommittee, deleteCommittee, byOrigin,
    listTasks, getTask, createTask, createTasks, updateTask, setTaskStatus, deleteTask,
    listExpenses, getExpense, createExpense, updateExpense, deleteExpense,
    createMyContribution, recordContribution, listContributions, getIdentity, listMyContributions,
    setContributionStatus, updateMyContribution, deleteMyContribution, deleteContributionAsTreasurer,
    getSummary, budgetTotals, guestTotals, saveSummary,
    listGuests, createGuest, updateGuest, deleteGuest, getGuest, answerGuest, getInvitation, saveInvitation, syncInvitation,
  };
})();


/* ---------- Fonctions pures : validation, montants, dates, liens ---------- */
/**
 * Fonctions pures (sans Firebase ni DOM) : validation des saisies, montants, dates, liens.
 * Testées par tests/unit/format.test.js.
 */

const EVENT_TYPES = {
  WEDDING: "Mariage",
  NAMING_CEREMONY: "Baptême / Ngenté",
  COMMUNION: "Communion",
  BIRTHDAY: "Anniversaire",
  RELIGIOUS_CEREMONY: "Cérémonie religieuse",
  FAMILY_REUNION: "Réunion familiale",
  TRADITIONAL_CEREMONY: "Cérémonie traditionnelle",
  CUSTOM: "Événement personnalisé",
};

const FAMILY_ROLES = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
const EVENT_ROLES = { organizer: "Organisateur", treasurer: "Trésorier", member: "Membre" };
const CURRENCIES = { XOF: "FCFA", EUR: "Euro" };

/** Nom affiché : 1 à 80 caractères, espaces superflus retirés. */
function cleanName(input) {
  const v = String(input ?? "").replace(/\s+/g, " ").trim();
  if (v.length < 1) throw new Error("Le nom est obligatoire.");
  if (v.length > 80) throw new Error("Le nom ne doit pas dépasser 80 caractères.");
  return v;
}

/**
 * Téléphone au format international (+221…). Accepte « 77 123 45 67 » pour le Sénégal
 * et « 06 12 34 56 78 » pour la France. Chaîne vide = pas de téléphone (null).
 */
function normalizePhone(input) {
  const raw = String(input ?? "").replace(/[\s.\-()]/g, "");
  if (raw === "") return null;
  let v = raw;
  if (v.startsWith("00")) v = "+" + v.slice(2);
  else if (/^7[05678]\d{7}$/.test(v)) v = "+221" + v; // mobile sénégalais
  else if (/^0[67]\d{8}$/.test(v)) v = "+33" + v.slice(1); // mobile français
  if (!/^\+[1-9]\d{6,14}$/.test(v)) {
    throw new Error("Numéro invalide : utilisez le format international, par exemple +221 77 123 45 67.");
  }
  return v;
}

/** Montant saisi -> entier en unités mineures (FCFA : unité ; EUR : centimes). */
function parseAmount(input, currency) {
  const digits = currency === "EUR" ? 2 : 0;
  const s = String(input ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  if (s === "") return 0;
  const re = digits === 0 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!re.test(s)) {
    throw new Error(digits === 0 ? "Montant invalide : nombre entier en FCFA." : "Montant invalide : 2 décimales au plus.");
  }
  const [whole, frac = ""] = s.split(".");
  const value = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0") || 0);
  if (!Number.isSafeInteger(value) || value > 100_000_000_000) throw new Error("Montant trop élevé.");
  return value;
}

/** Montant court pour les cartes de chiffres : « 4 200 000 F » (FCFA) ou « 12 € ». */
function kpiAmount(minor, currency) {
  if (currency === "XOF") return `${new Intl.NumberFormat("fr-FR").format(minor)} F`;
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
}

/** Entier en unités mineures -> « 6 000 000 F CFA » / « 12,50 € ». */
function formatAmount(minor, currency) {
  const digits = currency === "EUR" ? 2 : 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Nombre de jours avant l'événement (calendrier, fuseau de l'appareil). Négatif si passé. */
function daysUntil(date, now = new Date()) {
  const startOfDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

function countdownLabel(date, now = new Date()) {
  if (!date) return "Date à fixer";
  const n = daysUntil(date, now);
  if (n > 1) return `J-${n}`;
  if (n === 1) return "Demain";
  if (n === 0) return "Aujourd'hui";
  return "Événement passé";
}

function formatDate(date) {
  if (!date) return "Date à fixer";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Jeton d'invitation : 32 octets aléatoires en base64url (43 caractères), impossible à deviner. */
function generateToken(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

const INVITE_DAYS = 7;

function inviteUrl(origin, familyId, token) {
  return `${origin}/#/rejoindre/${encodeURIComponent(familyId)}/${token}`;
}

/** Lien de partage WhatsApp (ouvre WhatsApp avec le message pré-rempli, sans API). */
function whatsappShareUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function inviteMessage(familyName, url) {
  return `Bonjour ! Rejoins « ${familyName} » sur Bennoo pour organiser nos événements en famille : ${url} (lien valable ${INVITE_DAYS} jours)`;
}

/** Messages d'erreur Firebase traduits pour l'utilisateur ; jamais de détail technique. */
function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "Adresse email invalide.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez le mot de passe.",
    "auth/weak-password": "Mot de passe trop faible : 8 caractères minimum.",
    "auth/invalid-credential": "Email ou mot de passe incorrect. Si vous avez créé votre compte avec Google, utilisez « Continuer avec Google » (ou « Mot de passe oublié ? » pour vous créer aussi un mot de passe).",
    "auth/wrong-password": "Email ou mot de passe incorrect.",
    "auth/user-not-found": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
    "auth/network-request-failed": "Pas de connexion internet. Vérifiez votre réseau.",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé dans Firebase.",
    "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase (domaines autorisés).",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet email : connectez-vous avec votre mot de passe.",
    "auth/popup-closed-by-user": "La fenêtre Google s'est fermée avant la fin de la connexion. Réessayez ; si elle ne s'ouvre pas, autorisez les fenêtres pop-up pour ce site.",
    "permission-denied": "Action non autorisée.",
    "unavailable": "Service momentanément indisponible. Réessayez.",
  };
  return map[code] ?? "Une erreur est survenue. Réessayez.";
}

function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new Error("Mot de passe trop court : 8 caractères minimum.");
  if (pw.length > 128) throw new Error("Mot de passe trop long.");
  return pw;
}


/* ---------- Outils DOM (tout le texte passe par textContent) ---------- */
/**
 * Petit utilitaire DOM. Tout le texte passe par textContent : aucune donnée saisie par
 * un utilisateur n'est jamais interprétée comme du HTML (protection contre le XSS).
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Champ de formulaire accessible : libellé relié, aide et message d'erreur annoncés. */
let fieldSeq = 0;
function field(label, inputAttrs = {}, help = null) {
  const id = inputAttrs.id ?? `f${++fieldSeq}`;
  const helpId = help ? `${id}-help` : null;
  const tag = inputAttrs.tag ?? "input";
  const { tag: _ignored, options, ...rest } = inputAttrs;
  const input = tag === "select"
    ? h("select", { id, ...rest, "aria-describedby": helpId }, (options ?? []).map(([value, text]) => h("option", { value }, text)))
    : h(tag, { id, ...rest, "aria-describedby": helpId });
  return h("div", { class: "field" },
    h("label", { for: id }, label),
    input,
    help ? h("p", { class: "help", id: helpId }, help) : null,
  );
}

function alertBox(message, kind = "error") {
  return h("p", { class: `alert alert-${kind}`, role: kind === "error" ? "alert" : "status" }, message);
}

/** Affiche une erreur dans un conteneur dédié d'un formulaire. */
function showFormError(form, message) {
  let box = form.querySelector(".form-error");
  if (!box) {
    box = h("div", { class: "form-error" });
    form.prepend(box);
  }
  box.replaceChildren(message ? alertBox(message) : "");
  if (message) box.scrollIntoView({ block: "nearest" });
}

/** Désactive le bouton pendant l'envoi pour éviter les doubles soumissions. */
async function withBusy(button, fn) {
  // On garde le contenu d'origine (texte ET icône, comme le logo Google) pour le remettre ensuite.
  const content = [...button.childNodes];
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Patientez…";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.replaceChildren(...content);
  }
}

let toastTimer;
function toast(message) {
  const region = document.getElementById("toast");
  if (!region) return;
  region.textContent = message;
  region.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => region.classList.remove("visible"), 3500);
}

function loading(text = "Chargement…") {
  return h("p", { class: "loading", role: "status" }, text);
}

function emptyState(title, text) {
  return h("div", { class: "empty" }, h("p", { class: "empty-title" }, title), text ? h("p", {}, text) : null);
}

function card(...children) {
  return h("section", { class: "card" }, ...children);
}


/* ---------- Interface commune : icônes, avatars, navigation ---------- */
/**
 * Éléments d'interface communs : icônes, avatars, en-têtes, barre de navigation.
 */

/* Photos d'illustration : banque Unsplash (licence Unsplash : usage gratuit, y compris commercial).
   Chargées depuis images.unsplash.com, recadrées à la taille d'affichage. Crédits : écran « Conditions ».
   Si une photo ne charge pas, le dégradé violet prévu dessous reste affiché. */
const PHOTOS = {
  wedding: ["photo-1661332517932-2d441bfb2994", "Tope. A Asokere", "Couple en tenue traditionnelle"],
  weddingHands: ["photo-1507650029083-5092f9b2b2e6", "Andrew Itaga", "Mains des mariés"],
  celebration: ["photo-1784202388318-a2caaeffe4b7", "Amari Shutters", "Soirée de fête"],
  reunion: ["photo-1628517290972-74a92219db50", "A n v e s h", "Famille réunie dehors"],
  family: ["photo-1516013474378-d6498f0d1434", "Gift Habeshaw", "Famille à table"],
  womenWax: ["photo-1542352526-48ef0a72c2f7", "Muhammad-Taha Ibrahim", "Femmes en tenues colorées"],
  naming: ["photo-1763368161231-3d1e91e48d08", "Emmanuel Black", "Père et bébé en boubou"],
  birthday: ["photo-1623244727304-54995b233b1c", "Gracious Adebayo", "Anniversaire"],
  womenTrad: ["photo-1737649507334-92c9fa4beb7c", "Eyo Archibong", "Femmes en tenue de cérémonie"],
  traditional: ["photo-1523689119443-df96632084a1", "Lee Pigott", "Tambours traditionnels"],
  religious: ["photo-1705051194814-e01d4b396057", "Fahim Junaid", "Mosquée"],
  communion: ["photo-1604072424771-7300bc5de457", "Danique Godwin", "Famille à l'église"],
};
/** Photos proposées en couverture selon le type (la première est celle par défaut). */
const COVERS = {
  WEDDING: ["wedding", "weddingHands", "celebration", "womenTrad"],
  NAMING_CEREMONY: ["naming", "family", "womenWax"],
  COMMUNION: ["communion", "family", "reunion"],
  BIRTHDAY: ["birthday", "celebration", "family"],
  RELIGIOUS_CEREMONY: ["religious", "womenWax", "reunion"],
  FAMILY_REUNION: ["reunion", "family", "womenWax"],
  TRADITIONAL_CEREMONY: ["traditional", "womenTrad", "celebration"],
  CUSTOM: ["celebration", "reunion", "womenTrad", "family"],
};
function photoUrl(key, w = 800, hgt = 500) {
  const p = PHOTOS[key];
  return p ? `https://images.unsplash.com/${p[0]}?auto=format&fit=crop&crop=faces,entropy&w=${w}&h=${hgt}&q=70` : "";
}
function coverOf(e) { return e && e.cover && PHOTOS[e.cover] ? e.cover : (COVERS[e?.type] ?? COVERS.CUSTOM)[0]; }
/** Image décorative (alt vide) ; disparaît proprement si elle ne charge pas. */
function photo(key, w, hgt, cls = "") {
  const img = h("img", { src: photoUrl(key, w, hgt), alt: "", class: `photo ${cls}`, loading: "lazy", decoding: "async", width: w, height: hgt });
  img.addEventListener("error", () => img.remove());
  return img;
}
/** Fond photo + voile violet, pour les bandeaux (événement, famille, lancement). */
function photoBackground(el, key, w, hgt, veil = "linear-gradient(180deg, rgba(46,16,101,.25), rgba(30,15,69,.88))") {
  el.style.backgroundImage = `${veil}, url("${photoUrl(key, w, hgt)}"), linear-gradient(135deg, #5b21b6, #1e0f45)`;
  el.style.backgroundSize = "cover";
  el.style.backgroundPosition = "center";
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  family: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6zm12.5 0c0-2-.6-3.8-1.7-5.2.9-.5 2-.8 3.2-.8 3.3 0 6 2.7 6 6z",
  more: "M5 12a2 2 0 1 0 0-.01zM12 12a2 2 0 1 0 0-.01zM19 12a2 2 0 1 0 0-.01z",
  tasks: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm4.6 12.6 7.7-7.7-1.4-1.4-6.3 6.3-2.9-2.9-1.4 1.4z",
  budget: "M3 7a3 3 0 0 1 3-3h12v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3zm3-1a1 1 0 0 0 0 2h10V6zm11 6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("fill-rule", "evenodd");
  const p = document.createElementNS(SVG_NS, "path");
  p.setAttribute("d", ICONS[name]);
  svg.append(p);
  return svg;
}

/** Barre de navigation : seules les rubriques déjà développées apparaissent (pas de lien mort). */
function tabbar(active) {
  const link = (href, name, label, key) =>
    h("a", { href, "aria-current": active === key ? "page" : null }, icon(name), h("span", {}, label));
  return h("nav", { class: "tabbar", "aria-label": "Navigation principale" },
    h("a", { href: "#/", class: "brand-side" }, h("img", { src: "images/logo.svg", alt: "" }), "Bennoo"),
    link("#/", "home", "Accueil", "home"),
    link("#/familles", "family", "Famille", "family"),
    link("#/taches", "tasks", "Tâches", "tasks"),
    link("#/budget", "budget", "Budget", "budget"),
    link("#/plus", "more", "Plus", "more"),
  );
}

// Tons des maquettes : violets et dorés en dégradé.
const AVATAR_COLORS = ["linear-gradient(135deg,#7c3aed,#4c1d95)", "linear-gradient(135deg,#d4a23a,#a16207)", "linear-gradient(135deg,#a855f7,#6d28d9)",
  "linear-gradient(135deg,#9d4edd,#5b21b6)", "linear-gradient(135deg,#c084fc,#7e22ce)", "linear-gradient(135deg,#b45309,#78350f)"];
function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
function avatar(name, cls = "") {
  let hash = 0;
  for (const c of String(name)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  const el = h("span", { class: `avatar ${cls}`, "aria-hidden": "true" }, initials(name));
  el.style.background = AVATAR_COLORS[hash % AVATAR_COLORS.length];
  return el;
}

function header(title, backHref) {
  return h("div", { class: "screen-head" },
    backHref ? h("a", { href: backHref, class: "back", "aria-label": "Retour" }, "‹") : null,
    h("h1", {}, title),
  );
}

const EVENT_ICONS = {
  WEDDING: "💍", NAMING_CEREMONY: "👶", COMMUNION: "🕊️", BIRTHDAY: "🎂",
  RELIGIOUS_CEREMONY: "🕌", FAMILY_REUNION: "👨‍👩‍👧‍👦", TRADITIONAL_CEREMONY: "🥁", CUSTOM: "✨",
};


/* ---------- Écrans (conformes aux maquettes du dossier maquettes/) ---------- */
/**
 * Écrans de l'étape 1, construits d'après les maquettes (dossier maquettes/ du dépôt).
 * Chaque bouton déclenche une vraie action ; aucune donnée d'exemple n'est affichée.
 * Tâches, budget, contributions et invités : voir la section « Étapes 2 à 4 ». L'album viendra plus tard.
 */





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
function launchScreen() {
  const node = h("main", { class: "launch", id: "contenu" },
    h("div", {},
      h("img", { src: "images/logo.svg", alt: "", class: "logo", width: 108, height: 108 }),
      h("h1", {}, "Bennoo"),
      h("p", { class: "tag" }, "Ensemble pour vos moments précieux"),
    ),
    h("div", { class: "actions" },
      h("a", { href: "#/decouvrir/0", class: "btn btn-primary btn-block btn-gold-ring" }, "Commencer"),
      h("p", { class: "launch-login" }, "Déjà un compte ? ", h("a", { href: "#/connexion" }, "Se connecter")),
      FIREBASE_READY ? null : h("p", { class: "small" }, "Aperçu : la connexion sera activée dès que le projet Firebase sera relié."),
    ),
  );
  photoBackground(node, "womenWax", 900, 1400, "linear-gradient(180deg, rgba(76,29,149,.82) 0%, rgba(46,16,101,.35) 45%, rgba(30,15,69,.92) 100%)");
  return { node, title: "Bienvenue" };
}

// ─── 2. Onboarding ────────────────────────────────────────────────────────
const SLIDES = [
  { art: "reunion", title: "Des événements qui nous rassemblent", text: "Organisez mariages, baptêmes, anniversaires et plus encore en famille." },
  { art: "womenTrad", title: "Une organisation plus simple", text: "Répartissez les tâches, suivez le budget et avancez ensemble." },
  { art: "wedding", title: "Des souvenirs pour toujours", text: "Gardez au même endroit les moments importants de votre famille." },
];
function onboardingScreen(i) {
  const idx = Math.min(Math.max(i, 0), SLIDES.length - 1);
  const s = SLIDES[idx];
  const last = idx === SLIDES.length - 1;
  const node = h("main", { class: "onboard", id: "contenu" },
    h("div", { class: "art", "aria-hidden": "true" }, photo(s.art, 900, 760)),
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
function signupScreen() {
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
    googleButton(form),
    h("p", { class: "or" }, "Déjà un compte ? ", h("a", { href: "#/connexion" }, "Se connecter")),
  );
  return { node, title: "Créer un compte" };
}

// ─── Connexion ────────────────────────────────────────────────────────────
function loginScreen() {
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
      h("img", { src: "images/logo.svg", alt: "", width: 64, height: 64 }),
      h("h1", {}, "Bienvenue sur Bennoo"),
      h("p", { class: "muted" }, "Connectez-vous pour retrouver votre famille."),
    ),
    form,
    googleButton(form),
    h("p", { class: "or" }, "Pas encore de compte ? ", h("a", { href: "#/inscription" }, "S'inscrire")),
  );
  return { node, title: "Connexion" };
}

function resetScreen() {
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

function verifyScreen(user) {
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
    h("div", { class: "auth-brand" }, h("img", { src: "images/logo.svg", alt: "", width: 64, height: 64 }), h("h1", {}, "Vérifiez votre adresse email")),
    h("p", { class: "muted" }, "Nous avons envoyé un lien à ", h("strong", {}, user.email), ". Cliquez dessus pour activer votre compte, puis revenez ici."),
    status, check, resend, h("p", { class: "or" }, out),
  );
  return { node, title: "Vérifiez votre email" };
}

// ─── 4. Accueil personnel ─────────────────────────────────────────────────
function eventCard(e, familyName, progress = null) {
  let bar = null;
  if (progress !== null) {
    bar = h("span", { class: "mini-progress", role: "img", "aria-label": `Organisation : ${progress} %, ${countdownLabel(e.startsAt)}` }, h("span", { class: "bar" }, h("span", {})), h("span", { class: "pct" }, `${progress}%`));
    bar.querySelector(".bar span").style.width = `${progress}%`;
  }
  return h("a", { href: `#/evenement/${enc(e.familyId)}/${enc(e.id)}`, class: "event-card", dataset: { search: [e.title, e.city, EVENT_TYPES[e.type], familyName].filter(Boolean).join(" ").toLowerCase() } },
    h("span", { class: "thumb", "aria-hidden": "true" }, EVENT_ICONS[e.type] ?? "✨", photo(coverOf(e), 160, 160)),
    h("span", { class: "grow" },
      h("span", { class: "title" }, e.title),
      h("span", { class: "sub" }, [e.startsAt ? shortLongDate(e.startsAt) : "Date à fixer", e.city].filter(Boolean).join(" • ")),
      familyName ? h("span", { class: "sub" }, familyName) : null,
      bar ?? h("span", { class: "sub role" }, `${countdownLabel(e.startsAt)} · ${EVENT_ROLES[e.myRole] ?? ""}`),
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

// ─── 5. Familles et Family Hub ────────────────────────────────────────────
async function familiesScreen() {
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

async function familyScreen(fid, tab = "membres") {
  const family = await data.getFamily(fid);
  if (!family) return notFoundScreen();
  const [members, events] = await Promise.all([data.listFamilyMembers(fid), data.listMyEvents()]);
  const isAdmin = ["owner", "admin"].includes(family.myRole);
  const myUid = auth.currentUser.uid;
  const famEvents = events.filter((e) => e.familyId === fid);
  const current = tab === "evenements" ? "evenements" : tab === "inviter" ? "inviter" : tab === "comites" ? "comites" : "membres";

  const tabs = h("div", { class: "tabs", role: "tablist" },
    h("a", { href: `#/famille/${enc(fid)}/membres`, role: "tab", "aria-selected": String(current === "membres") }, "Membres"),
    h("a", { href: `#/famille/${enc(fid)}/evenements`, role: "tab", "aria-selected": String(current === "evenements") }, "Événements"),
    h("a", { href: `#/famille/${enc(fid)}/comites`, role: "tab", "aria-selected": String(current === "comites") }, "Comités"),
  );

  let body;
  if (current === "evenements") {
    body = h("div", {},
      famEvents.length ? famEvents.map((e) => eventCard(e)) : h("div", { class: "card empty" }, h("strong", {}, "Aucun événement auquel vous participez."), h("span", {}, "Un événement n'est visible que de ses participants.")),
      h("a", { href: `#/nouvel-evenement/${enc(fid)}`, class: "btn btn-primary btn-block", style: null }, "+ Créer un événement"));
  } else if (current === "comites") {
    body = await familyCommittees(famEvents);
  } else if (current === "inviter") {
    body = isAdmin ? await invitePanel(fid, family.name) : h("div", { class: "card" }, h("p", {}, "Seul un administrateur de la famille peut créer un lien d'invitation."));
  } else {
    body = h("div", { class: "form" },
      h("ul", { class: "list card-flat" }, members.map((m) => h("li", {},
        h("a", { href: `#/famille/${enc(fid)}/membre/${enc(m.uid)}`, class: "item" }, avatar(m.displayName),
          h("span", { class: "grow" }, h("span", { class: "title" }, m.displayName + (m.uid === myUid ? " (vous)" : "")), h("span", { class: `sub role-${m.role}` }, FAMILY_ROLES[m.role])),
          h("span", { class: "chev", "aria-hidden": "true" }, "›"))))),
      isAdmin
        ? h("div", { class: "form" }, h("a", { href: `#/famille/${enc(fid)}/inviter`, class: "btn btn-primary btn-block" }, "+ Inviter un membre"), renameFamilyButton(fid, family.name))
        : h("p", { class: "muted small" }, "Pour inviter un proche, demandez un lien à un administrateur de la famille."));
  }

  const node = screen(
    h("section", { class: "family-head" },
      h("span", { class: "family-photo", "aria-hidden": "true" }, initials(family.name), photo("reunion", 200, 200)),
      h("div", {}, h("h1", {}, family.name), h("p", { class: "muted" }, `${members.length} membre${members.length > 1 ? "s" : ""} • ${famEvents.length} événement${famEvents.length > 1 ? "s" : ""}`))),
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
      // Adresse complète du site (origine + chemin) : sur GitHub Pages, le site est sous /Bennoo/.
      const url = inviteUrl(location.origin + location.pathname.replace(/index\.html$/, "").replace(/\/$/, ""), fid, i.token);
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

function renameFamilyButton(fid, current) {
  const b = h("button", { type: "button", class: "btn btn-block" }, "Renommer la famille");
  b.addEventListener("click", () => withBusy(b, async () => {
    const name = prompt("Nouveau nom de la famille :", current);
    if (name === null) return;
    try { await data.renameFamily(fid, cleanName(name)); toast("Famille renommée"); window.dispatchEvent(new Event("hashchange")); } catch (err) { toast(errMsg(err)); }
  }));
  return b;
}

async function memberScreen(fid, uid) {
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
  }
  if (family.myRole === "owner" && !isMe) {
    const give = h("button", { type: "button", class: "btn btn-block" }, `Transmettre la famille à ${m.displayName}`);
    give.addEventListener("click", () => withBusy(give, async () => {
      if (!confirm(`${m.displayName} deviendra propriétaire de « ${family.name} » et vous deviendrez administrateur. Continuer ?`)) return;
      try { await transferOwnership(fid, uid); toast(`${m.displayName} est maintenant propriétaire`); location.hash = `#/famille/${enc(fid)}/membres`; } catch (err) { toast(errMsg(err)); }
    }));
    actions = h("div", { class: "form" }, actions, give,
      h("p", { class: "muted small" }, "Transmettre la famille est nécessaire avant de supprimer votre compte si d'autres membres restent."));
  }
  if (isMe && m.role !== "owner") {
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

async function joinScreen(fid, token) {
  if (!isToken(token)) return notFoundScreen("Ce lien d'invitation n'est pas valide.");
  // Déjà membre : on le dit clairement au lieu de rediriger sans explication
  // (cas fréquent : l'organisateur ouvre lui-même le lien qu'il vient de créer).
  if (await data.isFamilyMember(fid).catch(() => false)) {
    const out = h("button", { type: "button", class: "btn btn-block" }, "Me déconnecter pour utiliser un autre compte");
    out.addEventListener("click", async () => { sessionStorage.setItem("bennoo:after-login", `rejoindre/${fid}/${token}`.replace(/^/, "/")); await signOut(); });
    const node = bare(
      h("div", { class: "auth-brand" }, h("img", { src: "images/logo.svg", alt: "" }), h("h1", {}, "Vous êtes déjà membre")),
      h("section", { class: "card form" },
        h("p", {}, "Vous êtes connecté(e) avec ", h("strong", {}, auth.currentUser.email), ", qui fait déjà partie de cette famille."),
        h("p", { class: "muted small" }, "Ce lien sert à faire entrer une autre personne : envoyez-le-lui, ou ouvrez-le dans une fenêtre de navigation privée pour créer un autre compte."),
        h("a", { href: `#/famille/${enc(fid)}`, class: "btn btn-primary btn-block" }, "Aller à la famille"),
        out));
    return { node, title: "Déjà membre" };
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

async function newEventScreen(presetFid, presetType) {
  const families = await data.listMyFamilies();
  if (families.length === 0) {
    location.hash = "#/";
    return null;
  }
  const state = {
    step: 0, type: EVENT_TYPES[presetType] ? presetType : "WEDDING", familyId: families.some((f) => f.id === presetFid) ? presetFid : families[0].id,
    title: "", description: "", startsAt: "", venue: "", city: "", currency: "XOF", budget: "", guests: "", picks: {}, cover: null,
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
    if (state.step === 0) { if (v.type && v.type !== state.type) state.cover = null; state.type = v.type || state.type; }
    if (state.step === 1) {
      state.title = v.title.replace(/\s+/g, " ").trim();
      state.description = v.description.trim();
      if (v.familyId) state.familyId = v.familyId;
      if (v.cover && PHOTOS[v.cover]) state.cover = v.cover;
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
          field("Description (facultatif)", { name: "description", tag: "textarea", class: "input", maxlength: 2000 }),
          coverPicker(state.type, state.cover ?? COVERS[state.type][0])];
      case 2:
        return [h("h2", {}, "Lieu et date"),
          field("Date et heure", { name: "startsAt", type: "datetime-local", class: "input", value: state.startsAt }, "Facultatif : vous pourrez la fixer plus tard."),
          field("Lieu", { name: "venue", class: "input", maxlength: 200, value: state.venue, placeholder: "Ex. Salle des fêtes, domicile familial" }),
          field("Ville", { name: "city", class: "input", maxlength: 120, value: state.city, placeholder: "Ex. Dakar, Sénégal" }),
          mapBlock(() => { const f = body.querySelector("form"); return [f?.elements.venue?.value, f?.elements.city?.value]; })];
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
            expectedGuests: state.guests === "" ? null : Number(state.guests), cover: state.cover ?? COVERS[state.type][0],
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
  const me = participants.find((p) => p.uid === myUid);
  const otherOrganizer = participants.find((p) => p.uid !== myUid && p.role === "organizer");
  let leave = null;
  if (me && (me.role !== "organizer" || otherOrganizer)) {
    leave = h("button", { type: "button", class: "btn btn-block" }, "Quitter l'événement");
    leave.addEventListener("click", () => withBusy(leave, async () => {
      if (!confirm(me.role === "organizer" ? `Quitter l'événement ? ${otherOrganizer.displayName} reste organisateur.` : "Quitter l'événement ? Vous ne le verrez plus.")) return;
      try { await leaveEvent(fid, eid, me.role === "organizer" ? otherOrganizer.uid : null); toast("Vous avez quitté l'événement"); location.hash = "#/"; } catch (err) { toast(errMsg(err)); }
    }));
  }
  return h("div", { class: "form" },
    h("p", { class: "muted small" }, "Seuls les participants voient cet événement, même au sein de la famille."),
    list, add, leave,
    me?.role === "organizer" && !otherOrganizer && participants.length > 1 ? h("p", { class: "muted small" }, "Pour quitter l'événement, nommez d'abord un autre organisateur.") : null);
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
    coverPicker(e.type, coverOf(e)),
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
          cover: PHOTOS[v.cover] ? v.cover : coverOf(e),
        });
        await orga.syncInvitation(fid, eid, { title, type: v.type, startsAt: v.startsAt ? new Date(v.startsAt) : null, venue: v.venue.trim(), city: v.city.trim(), cover: PHOTOS[v.cover] ? v.cover : coverOf(e) });
        toast("Événement mis à jour");
        location.hash = base;
      } catch (err) {
        showFormError(form, errMsg(err));
      }
    });
  });
  return form;
}

/* ---------- Étapes 2 à 4 : libellés, checklists et écrans (maquettes 7 à 11, planches 3 à 5) ---------- */
const TASK_STATUS = { todo: "À faire", doing: "En cours", done: "Terminée" };
const TASK_CHIP = { todo: "chip-orange", doing: "chip-blue", done: "chip-green" };
const EXPENSE_CATEGORIES = {
  VENUE: ["Salle et lieu", "🏛️"], CATERING: ["Traiteur et repas", "🍲"], DECOR: ["Décoration", "💐"],
  OUTFITS: ["Tenues", "👗"], PHOTO: ["Photo et vidéo", "📷"], MUSIC: ["Animation et musique", "🥁"],
  TRANSPORT: ["Transport", "🚐"], GIFTS: ["Cadeaux et dons", "🎁"], OTHER: ["Divers", "📦"],
};
const EXPENSE_STATUS = { pending: "À payer", paid: "Payée" };
const EXPENSE_CHIP = { pending: "chip-orange", paid: "chip-green" };
const CONTRIB_STATUS = { promised: "Promise", declared: "Déclarée", confirmed: "Confirmée" };
const CONTRIB_CHIP = { promised: "chip-gold", declared: "chip-blue", confirmed: "chip-green" };
const CONTRIB_KIND = { money: "Argent", inkind: "En nature" };
const ORIGINS = {
  HOSTS: ["Les hôtes (mariés, parents…)", "#e11d48"], FAMILY: ["Famille", "#7c3aed"], FRIENDS: ["Amis et voisins", "#f59e0b"],
  DIASPORA: ["Diaspora", "#0ea5e9"], OTHER: ["Autres", "#16a34a"],
};
const GUEST_RESPONSE = { pending: "Sans réponse", yes: "Vient", no: "Ne vient pas" };
const GUEST_CHIP = { pending: "chip-violet", yes: "chip-green", no: "chip-red" };

/** Checklists proposées selon la cérémonie : [titre, jours avant l'événement]. */
const CHECKLISTS = {
  WEDDING: [["Fixer le budget avec la famille", 120], ["Réserver la salle", 110], ["Choisir le traiteur", 90], ["Préparer la liste des invités", 75],
    ["Commander les tenues", 60], ["Réserver le photographe", 60], ["Envoyer les invitations", 45], ["Organiser la cérémonie traditionnelle", 30],
    ["Prévoir l'hébergement des proches", 30], ["Confirmer le traiteur", 14], ["Finaliser la décoration", 3], ["Organiser le transport du jour J", 2]],
  NAMING_CEREMONY: [["Fixer la date avec l'imam ou la paroisse", 21], ["Choisir le prénom avec la famille", 14], ["Prévoir le repas et le mouton", 10],
    ["Prévenir les proches", 10], ["Préparer les tenues", 7], ["Prévoir l'accueil des invités", 2]],
  COMMUNION: [["Confirmer la date avec la paroisse", 45], ["Choisir les tenues", 30], ["Réserver le lieu du repas", 30], ["Envoyer les invitations", 21],
    ["Commander le gâteau", 7], ["Préparer la décoration", 2]],
  BIRTHDAY: [["Choisir le lieu", 30], ["Envoyer les invitations", 21], ["Commander le gâteau", 7], ["Prévoir l'animation", 7], ["Faire les courses", 2]],
  RELIGIOUS_CEREMONY: [["Fixer la date avec le guide religieux", 45], ["Prévoir le lieu et les nattes ou chaises", 30], ["Organiser le repas", 14],
    ["Prévenir la famille et les proches", 14], ["Prévoir l'accueil des invités", 2]],
};
const DEFAULT_CHECKLIST = [["Fixer la date et le lieu", 60], ["Établir le budget", 50], ["Préparer la liste des invités", 40], ["Envoyer les invitations", 30],
  ["Réserver le repas", 21], ["Organiser la décoration", 7], ["Confirmer les présences", 5], ["Préparer le jour J", 1]];

function checklistFor(event) {
  const list = CHECKLISTS[event.type] ?? DEFAULT_CHECKLIST;
  return list.map(([title, days]) => {
    let dueAt = null;
    if (event.startsAt) {
      dueAt = new Date(event.startsAt);
      dueAt.setDate(dueAt.getDate() - days);
      dueAt.setHours(10, 0, 0, 0);
      // Événement proche : une échéance déjà passée est ramenée à aujourd'hui (pas de tâche « en retard » dès la création).
      const today = new Date(); today.setHours(10, 0, 0, 0);
      if (dueAt < today) dueAt = today;
    }
    return { title, dueAt, status: "todo", notes: null, assigneeUid: null };
  });
}

/** En-tête de sous-page (titre de niveau 2 : le titre de l'événement reste le h1). */
function subHeader(title, backHref) {
  return h("div", { class: "screen-head sub-head" }, backHref ? h("a", { href: backHref, class: "back", "aria-label": "Retour" }, "‹") : null, h("h2", {}, title));
}
/** « 15 février 2025 » (maquettes), sans le jour de la semaine. */
const shortLongDate = (d) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(d);
const shortDate = (d) => (d ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d) : null);
const dateInput = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const fromDateInput = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 10, 0, 0); };
const amountInput = (minor, currency) => (minor ? String(currency === "EUR" ? minor / 100 : minor) : "");
const reload = () => window.dispatchEvent(new Event("hashchange"));
const pct = (part, total) => (total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0);
const chip = (cls, text) => h("span", { class: `chip ${cls}` }, text);
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;

function requiredAmount(input, currency) {
  const v = parseAmount(input, currency);
  if (v <= 0) throw new Error("Indiquez un montant supérieur à zéro.");
  return v;
}

/** Sous-onglets (Liste / Calendrier, Dépenses / Contributions…) : de vrais liens, pas de faux boutons. */
function subTabs(items, current) {
  return h("div", { class: "tabs", role: "tablist" }, items.map(([href, label, key]) =>
    h("a", { href, role: "tab", "aria-selected": String(current === key) }, label)));
}
function filterChips(items, current, onPick) {
  const wrap = h("div", { class: "filters", role: "group", "aria-label": "Filtrer" });
  for (const [key, label] of items) {
    const b = h("button", { type: "button", class: "filter", "aria-pressed": String(current === key) }, label);
    b.addEventListener("click", () => onPick(key));
    wrap.append(b);
  }
  return wrap;
}

// ─── Tableau de bord de l'événement (maquette 7) ──────────────────────────
function ring(percent, label) {
  const el = h("div", { class: "ring", role: "img", "aria-label": `${percent} % ${label}` }, h("span", {}, `${percent}%`));
  el.style.setProperty("--p", percent);
  return el;
}

function archiveButton(ctx) {
  const archived = ctx.event.status === "archived";
  const b = h("button", { type: "button", class: "btn btn-sm" }, archived ? "Réactiver" : "Archiver");
  b.addEventListener("click", () => withBusy(b, async () => {
    if (!archived && !confirm("Archiver l'événement ? Il passera dans « Événements archivés » sur l'accueil ; vous pourrez le réactiver.")) return;
    try { await data.setEventStatus(ctx.fid, ctx.eid, archived ? "active" : "archived"); toast(archived ? "Événement réactivé" : "Événement archivé"); reload(); } catch (err) { toast(errMsg(err)); }
  }));
  return b;
}

async function eventOverview(ctx) {
  const { fid, eid, event, family, isOrganizer, isManager, base } = ctx;
  const tasks = await orga.listTasks(fid, eid);
  let summary = await orga.getSummary(fid, eid);
  // L'organisateur et le trésorier rafraîchissent les totaux partagés à chaque visite.
  try {
    if (isManager) {
      const [x, c] = await Promise.all([orga.listExpenses(fid, eid), orga.listContributions(fid, eid)]);
      const totals = orga.budgetTotals(x, c);
      await orga.saveSummary(fid, eid, "budget", totals, summary.budget);
      summary.budget = { ...totals, updatedAt: new Date() };
    }
    if (isOrganizer) {
      const totals = orga.guestTotals(await orga.listGuests(fid, eid));
      await orga.saveSummary(fid, eid, "guests", totals, summary.guests);
      summary.guests = { ...totals, updatedAt: new Date() };
    }
  } catch (err) { console.warn("Totaux non mis à jour :", err); }

  const n = event.startsAt ? daysUntil(event.startsAt) : null;
  const done = tasks.filter((t) => t.status === "done").length;
  const left = tasks.length - done;
  const progress = pct(done, tasks.length);
  const next = tasks.filter((t) => t.status !== "done").slice(0, 3);
  const b = summary.budget;
  const g = summary.guests;
  const invitation = await orga.getInvitation(fid, eid).catch(() => null);
  const programme = await programmeSection(ctx);

  return h("div", { class: "form" },
    liveCountdown(event),
    h("div", { class: `kpis${event.startsAt ? " one" : ""}` },
      // Avec une date, le compte à rebours au-dessus remplace la carte « J-n ».
      event.startsAt ? null : h("div", { class: "kpi big" }, h("span", { class: "v" }, "—"), h("span", { class: "l" }, "Date à fixer")),
      h("div", { class: "kpi kpi-ring" }, ring(progress, "de l'organisation"),
        h("span", {}, h("strong", { class: "v" }, `${progress}%`), h("span", { class: "l" }, tasks.length ? "Organisation" : "Aucune tâche")))),
    h("div", { class: "kpi-row four" },
      h("div", { class: "kpi" }, h("span", { class: "v" }, g ? String(g.attending) : "—"), h("span", { class: "l" }, g ? "Invités confirmés" : "Invités confirmés (aucune liste)")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(left)), h("span", { class: "l" }, "Tâches restantes")),
      h("div", { class: "kpi" }, h("span", { class: "v sm" }, event.budgetPlanned ? kpiAmount(event.budgetPlanned, event.currency) : "—"), h("span", { class: "l" }, "Budget global")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, b ? String(b.contributors) : "—"), h("span", { class: "l" }, b ? `Contributions · ${kpiAmount(b.confirmed, event.currency)}` : "Contributions"))),
    h("section", { class: "card" },
      h("div", { class: "section-head" }, h("h2", {}, "Prochaines tâches"), h("a", { href: `${base}/taches`, class: "small" }, "Tout voir")),
      next.length ? h("ul", { class: "list" }, next.map((t) => taskItem(ctx, t, tasks))) :
        h("p", { class: "muted small" }, tasks.length ? "Toutes les tâches sont terminées. Bravo !" : "Aucune tâche. Ouvrez l'onglet Tâches pour commencer.")),
    programme,
    milestones(event, tasks, summary, Boolean(invitation)),
    saveTheDateCard(ctx, invitation),
    h("section", { class: "card" }, h("div", { class: "section-head" }, h("h2", {}, "Informations"),
      isOrganizer ? h("span", { class: "row-actions" }, archiveButton(ctx), h("a", { href: `${base}/modifier`, class: "btn btn-sm" }, "Modifier")) : null),
    h("dl", { class: "facts" },
      h("dt", {}, "Date"), h("dd", {}, event.startsAt ? `${formatDate(event.startsAt)} à ${event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "À fixer"),
      h("dt", {}, "Lieu"), h("dd", {}, [event.venue, event.city].filter(Boolean).join(", ") || "À préciser"),
      h("dt", {}, "Famille"), h("dd", {}, family.name),
      h("dt", {}, "Invités prévus"), h("dd", {}, event.expectedGuests ?? "—")),
    event.description ? h("p", { class: "muted" }, event.description) : null,
    event.venue || event.city ? mapBlock(() => [event.venue, event.city]) : null),
    h("p", { class: "muted small" }, "L'album photos arrivera dans une prochaine étape."),
  );
}

// ─── Tâches (maquettes 8 et 9, planche 4 « Planning et checklist ») ──────
function canChangeStatus(ctx, t) { return ctx.isOrganizer || t.assigneeUid === ctx.myUid; }

function taskItem(ctx, t) {
  const href = `${ctx.base}/tache/${enc(t.id)}`;
  const box = h("input", { type: "checkbox", class: "task-check", "aria-label": `Marquer « ${t.title} » comme terminée`, checked: t.status === "done", disabled: !canChangeStatus(ctx, t) });
  box.addEventListener("change", async () => {
    box.disabled = true;
    try { await orga.setTaskStatus(ctx.fid, ctx.eid, t.id, box.checked ? "done" : "todo"); toast(box.checked ? "Tâche terminée" : "Tâche rouverte"); reload(); }
    catch (err) { box.checked = !box.checked; box.disabled = false; toast(errMsg(err)); }
  });
  const late = t.dueAt && t.status !== "done" && daysUntil(t.dueAt) < 0;
  return h("li", { class: "item task" }, box,
    h("a", { href, class: "grow" },
      h("span", { class: "title" }, t.title),
      h("span", { class: `sub${late ? " danger" : ""}` }, [t.dueAt ? `Échéance : ${shortDate(t.dueAt)}${late ? " (en retard)" : ""}` : "Sans échéance", t.assigneeName].filter(Boolean).join(" · "))),
    chip(TASK_CHIP[t.status], TASK_STATUS[t.status]));
}

async function tasksPanel(ctx, view) {
  const { fid, eid, event, isOrganizer, base } = ctx;
  const tasks = await orga.listTasks(fid, eid);
  const head = h("div", { class: "section-head" }, h("h2", {}, "Tâches"),
    isOrganizer ? h("a", { href: `${base}/taches/nouvelle`, class: "btn btn-primary btn-sm" }, "+ Nouvelle tâche") : null);
  const switcher = subTabs([[`${base}/taches`, "Liste", "liste"], [`${base}/taches/etapes`, "Étapes", "etapes"], [`${base}/taches/calendrier`, "Calendrier", "calendrier"], [`${base}/taches/kanban`, "Kanban", "kanban"]],
    ["calendrier", "kanban", "etapes"].includes(view) ? view : "liste");

  if (tasks.length === 0) {
    const empty = h("div", { class: "card form photo-empty" },
      h("div", { class: "pe-photo", "aria-hidden": "true" }, photo("womenTrad", 640, 300)),
      h("p", {}, h("strong", {}, "Aucune tâche pour l'instant.")),
      isOrganizer ? h("p", { class: "muted small" }, `Bennoo peut ajouter une checklist adaptée (${EVENT_TYPES[event.type].toLowerCase()}) : ${plural(checklistFor(event).length, "tâche")}${event.startsAt ? ", avec des échéances calculées depuis la date de l'événement" : ", sans échéance tant que la date n'est pas fixée"}. Vous pourrez tout modifier.`)
        : h("p", { class: "muted small" }, "L'organisateur n'a pas encore créé de tâche."));
    if (isOrganizer) {
      const b = h("button", { type: "button", class: "btn btn-primary btn-block" }, "Ajouter la checklist suggérée");
      b.addEventListener("click", () => withBusy(b, async () => {
        try { await orga.createTasks(fid, eid, checklistFor(event)); toast("Checklist ajoutée"); reload(); } catch (err) { toast(errMsg(err)); }
      }));
      empty.append(b);
    }
    return h("div", { class: "form" }, head, empty);
  }

  if (view === "calendrier") return h("div", { class: "form" }, head, switcher, calendar(ctx, tasks));
  if (view === "kanban") return h("div", { class: "form" }, head, switcher, kanban(ctx, tasks));
  if (view === "etapes") return h("div", { class: "form" }, head, switcher, roadmap(ctx, tasks));

  const counts = { all: tasks.length, todo: 0, doing: 0, done: 0 };
  for (const t of tasks) counts[t.status] += 1;
  const listBox = h("div", {});
  let filter = "all";
  const draw = () => {
    const shown = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    listBox.replaceChildren(
      filterChips([["all", `Toutes (${counts.all})`], ["todo", `À faire (${counts.todo})`], ["doing", `En cours (${counts.doing})`], ["done", `Terminées (${counts.done})`]], filter, (k) => { filter = k; draw(); }),
      shown.length ? h("ul", { class: "list card-flat" }, shown.map((t) => taskItem(ctx, t))) : h("div", { class: "card empty" }, "Aucune tâche dans ce filtre."));
  };
  draw();
  return h("div", { class: "form" }, head, switcher, listBox,
    h("p", { class: "muted small" }, isOrganizer ? "Cochez une tâche pour la terminer. Le responsable d'une tâche peut aussi changer son statut." : "Vous pouvez changer le statut des tâches dont vous êtes responsable."));
}

/** Vue Kanban (planche 4 « Planning ») : trois colonnes, déplacement par boutons (utilisable au clavier). */
function kanban(ctx, tasks) {
  const order = ["todo", "doing", "done"];
  return h("div", { class: "kanban" }, order.map((st, i) => {
    const list = tasks.filter((t) => t.status === st);
    return h("section", { class: `kcol k-${st}`, "aria-label": TASK_STATUS[st] },
      h("h3", {}, TASK_STATUS[st], " ", h("span", { class: "muted" }, `(${list.length})`)),
      list.length ? list.map((t) => {
        const move = (to, label) => {
          const b = h("button", { type: "button", class: "btn btn-sm", "aria-label": `${label} : ${t.title}` }, label);
          b.addEventListener("click", () => withBusy(b, async () => {
            try { await orga.setTaskStatus(ctx.fid, ctx.eid, t.id, to); toast(`« ${t.title} » : ${TASK_STATUS[to].toLowerCase()}`); reload(); } catch (err) { toast(errMsg(err)); }
          }));
          return b;
        };
        const can = canChangeStatus(ctx, t);
        return h("article", { class: "kcard" },
          h("a", { href: `${ctx.base}/tache/${enc(t.id)}`, class: "title" }, t.title),
          h("span", { class: "sub" }, [t.dueAt ? shortDate(t.dueAt) : null, t.assigneeName].filter(Boolean).join(" · ") || "Sans échéance"),
          can ? h("div", { class: "kmove" }, i > 0 ? move(order[i - 1], "‹ " + TASK_STATUS[order[i - 1]]) : null, i < 2 ? move(order[i + 1], TASK_STATUS[order[i + 1]] + " ›") : null) : null);
      }) : h("p", { class: "muted small" }, "Aucune tâche"));
  }));
}

function calendar(ctx, tasks) {
  const { event } = ctx;
  const start = new Date();
  let month = new Date(start.getFullYear(), start.getMonth(), 1);
  let selected = null;
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const byDay = new Map();
  for (const t of tasks) if (t.dueAt) { const k = key(t.dueAt); byDay.set(k, [...(byDay.get(k) ?? []), t]); }
  const eventKey = event.startsAt ? key(event.startsAt) : null;
  const wrap = h("div", { class: "form" });

  const draw = () => {
    const title = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(month);
    const prev = h("button", { type: "button", class: "back", "aria-label": "Mois précédent" }, "‹");
    const nextB = h("button", { type: "button", class: "back", "aria-label": "Mois suivant" }, "›");
    prev.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); selected = null; draw(); });
    nextB.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); selected = null; draw(); });
    const grid = h("div", { class: "cal-grid", role: "grid" }, ["L", "M", "M", "J", "V", "S", "D"].map((d) => h("span", { class: "dow", "aria-hidden": "true" }, d)));
    const offset = (month.getDay() + 6) % 7;
    for (let i = 0; i < offset; i++) grid.append(h("span", {}));
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const date = new Date(month.getFullYear(), month.getMonth(), d);
      const k = key(date);
      const n = (byDay.get(k) ?? []).length;
      const cls = ["day", n ? "has" : "", k === eventKey ? "event" : "", k === key(start) ? "today" : "", selected === k ? "sel" : ""].filter(Boolean).join(" ");
      const label = `${formatDate(date)}${n ? `, ${plural(n, "tâche")}` : ""}${k === eventKey ? ", jour de l'événement" : ""}`;
      const b = h("button", { type: "button", class: cls, "aria-label": label, "aria-pressed": String(selected === k) }, String(d));
      b.addEventListener("click", () => { selected = selected === k ? null : k; draw(); });
      grid.append(b);
    }
    // Tâches du jour choisi, sinon celles du mois.
    const inMonth = tasks.filter((t) => t.dueAt && t.dueAt.getMonth() === month.getMonth() && t.dueAt.getFullYear() === month.getFullYear());
    const shown = selected ? (byDay.get(selected) ?? []) : inMonth;
    const groups = new Map();
    for (const t of shown) { const k = key(t.dueAt); groups.set(k, [...(groups.get(k) ?? []), t]); }
    wrap.replaceChildren(
      h("section", { class: "card" },
        h("div", { class: "cal-head" }, prev, h("h3", {}, title.charAt(0).toUpperCase() + title.slice(1)), nextB),
        grid,
        h("p", { class: "muted small cal-legend" }, h("span", { class: "dot" }), " tâche  ", h("span", { class: "dot gold" }), " jour de l'événement")),
      shown.length
        ? h("div", { class: "form" }, [...groups.values()].map((list) => h("section", {}, h("h3", { class: "cal-day" }, formatDate(list[0].dueAt)), h("ul", { class: "list card-flat" }, list.map((t) => taskItem(ctx, t))))))
        : h("p", { class: "muted small" }, selected ? "Aucune tâche ce jour-là." : "Aucune tâche avec une échéance ce mois-ci."),
      tasks.some((t) => !t.dueAt) ? h("p", { class: "muted small" }, `${plural(tasks.filter((t) => !t.dueAt).length, "tâche")} sans échéance (visibles dans la liste).`) : null,
    );
  };
  draw();
  return wrap;
}

function taskForm(ctx, task, participants) {
  const { fid, eid, base } = ctx;
  const form = h("form", { class: "card form", novalidate: true },
    field("Titre de la tâche", { name: "title", class: "input", required: true, maxlength: 120, value: task?.title ?? "", placeholder: "Ex. Confirmer le traiteur" }),
    field("Description (facultatif)", { name: "notes", tag: "textarea", class: "input", maxlength: 1000 }),
    h("div", { class: "row-2" },
      field("Échéance", { name: "dueAt", type: "date", class: "input", value: dateInput(task?.dueAt) }),
      field("Statut", { name: "status", tag: "select", class: "input", options: Object.entries(TASK_STATUS) })),
    field("Responsable", { name: "assignee", tag: "select", class: "input", options: [["", "Personne pour l'instant"], ...participants.map((p) => [p.uid, p.displayName])] },
      "Seuls les participants de l'événement peuvent être responsables. Le responsable peut changer le statut de sa tâche."),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, task ? "Enregistrer la tâche" : "Créer la tâche"));
  form.elements.notes.value = task?.notes ?? "";
  form.elements.status.value = task?.status ?? "todo";
  form.elements.assignee.value = task?.assigneeUid ?? "";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const title = v.title.replace(/\s+/g, " ").trim();
        if (!title) throw new Error("Le titre est obligatoire.");
        const who = participants.find((p) => p.uid === v.assignee);
        const t = { title, notes: v.notes.trim(), dueAt: fromDateInput(v.dueAt), status: v.status, assigneeUid: who?.uid ?? null, assigneeName: who?.displayName ?? null };
        if (task) await orga.updateTask(fid, eid, task.id, t); else await orga.createTask(fid, eid, t);
        toast(task ? "Tâche enregistrée" : "Tâche créée");
        location.hash = task ? `${base}/tache/${enc(task.id)}` : `${base}/taches`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  return form;
}

async function taskDetail(ctx, tid, participants) {
  const { fid, eid, isOrganizer, base } = ctx;
  const t = await orga.getTask(fid, eid, tid);
  if (!t) return h("div", { class: "card" }, "Cette tâche n'existe plus.");
  const statusButtons = canChangeStatus(ctx, t)
    ? h("div", { class: "status-pick", role: "group", "aria-label": "Changer le statut" }, Object.entries(TASK_STATUS).map(([k, label]) => {
      const b = h("button", { type: "button", class: `btn btn-sm${t.status === k ? " btn-primary" : ""}`, "aria-pressed": String(t.status === k) }, label);
      b.addEventListener("click", () => withBusy(b, async () => {
        try { await orga.setTaskStatus(fid, eid, t.id, k); toast(`Statut : ${label.toLowerCase()}`); reload(); } catch (err) { toast(errMsg(err)); }
      }));
      return b;
    }))
    : null;
  let del = null;
  if (isOrganizer) {
    del = h("button", { type: "button", class: "btn btn-block danger-btn" }, "Supprimer la tâche");
    del.addEventListener("click", () => withBusy(del, async () => {
      if (!confirm(`Supprimer « ${t.title} » ?`)) return;
      try { await orga.deleteTask(fid, eid, t.id); toast("Tâche supprimée"); location.hash = `${base}/taches`; } catch (err) { toast(errMsg(err)); }
    }));
  }
  return h("div", { class: "form" },
    subHeader("Détail de la tâche", `${base}/taches`),
    h("section", { class: "card form" },
      h("h2", {}, t.title), h("div", {}, chip(TASK_CHIP[t.status], TASK_STATUS[t.status])),
      h("dl", { class: "facts" },
        h("dt", {}, "Échéance"), h("dd", {}, t.dueAt ? formatDate(t.dueAt) : "Aucune"),
        h("dt", {}, "Assigné à"), h("dd", {}, t.assigneeName ?? "Personne")),
      t.notes ? h("div", {}, h("h3", {}, "Description"), h("p", { class: "muted" }, t.notes)) : null,
      statusButtons),
    isOrganizer ? h("h2", {}, "Modifier") : null,
    isOrganizer ? taskForm(ctx, t, participants) : null,
    del);
}

// ─── Budget, dépenses et contributions (maquette 10, planches 3 et 4) ─────
function budgetCard(event, totals, showDetail, origins = null) {
  const cur = event.currency;
  const budget = event.budgetPlanned;
  const toFinance = Math.max(0, budget - totals.confirmed);
  const line = (label, value, cls = "") => h("div", { class: `money-line ${cls}` }, h("span", {}, label), h("strong", {}, formatAmount(value, cur)));
  const share = (v) => (budget ? `${pct(v, budget)} %` : "");
  const originLines = origins && Object.keys(origins).length
    ? h("ul", { class: "origins" }, Object.entries(ORIGINS).filter(([k]) => origins[k]).map(([k, [label, color]]) => {
      const dot = h("span", { class: "odot", "aria-hidden": "true" }); dot.style.background = color;
      return h("li", {}, dot, h("span", { class: "grow" }, label), h("strong", {}, formatAmount(origins[k], cur)), h("span", { class: "muted" }, share(origins[k])));
    }), budget ? h("li", {}, h("span", { class: "odot rest", "aria-hidden": "true" }), h("span", { class: "grow" }, "Reste à financer"), h("strong", {}, formatAmount(toFinance, cur)), h("span", { class: "muted" }, share(toFinance))) : null)
    : null;
  return h("section", { class: "card form" },
    h("h2", {}, "Budget global"),
    budget ? donut(pct(totals.confirmed, budget), kpiAmount(totals.confirmed, cur), `/ ${kpiAmount(budget, cur)}`,
      origins ? Object.entries(ORIGINS).filter(([k]) => origins[k]).map(([k, [, color]]) => [color, (origins[k] / budget) * 100]) : null)
      : h("p", { class: "muted small" }, "Budget non défini : l'organisateur peut le fixer dans « Modifier »."),
    budget ? h("p", { class: "muted small center" }, `${pct(totals.confirmed, budget)} % financé par les contributions confirmées`) : null,
    originLines,
    line("Contributions confirmées", totals.confirmed, "ok"),
    line("Contributions en attente", totals.pending),
    showDetail ? line("Dépenses engagées", totals.spent) : null,
    showDetail ? line("Dont payées", totals.paid) : null,
    budget ? line("Reste à financer", toFinance, toFinance > 0 ? "warn" : "ok") : null,
    totals.inkind ? h("p", { class: "muted small" }, `+ ${plural(totals.inkind, "don")} en nature confirmé${totals.inkind > 1 ? "s" : ""}`) : null);
}

async function budgetPanel(ctx, view) {
  const { fid, eid, event, isManager, isTreasurer, base } = ctx;
  if (!isManager) return memberBudget(ctx);
  const [expenses, contributions] = await Promise.all([orga.listExpenses(fid, eid), orga.listContributions(fid, eid)]);
  const totals = orga.budgetTotals(expenses, contributions);
  const previous = (await orga.getSummary(fid, eid)).budget;
  await orga.saveSummary(fid, eid, "budget", totals, previous).catch((err) => console.warn(err));

  const current = view === "contributions" ? "contributions" : "depenses";
  const tabs = subTabs([[`${base}/budget`, "Dépenses", "depenses"], [`${base}/budget/contributions`, "Contributions", "contributions"]], current);
  let body;
  if (current === "contributions") {
    body = await contributionsList(ctx, contributions);
  } else {
    const byCat = {};
    for (const x of expenses) byCat[x.category] = (byCat[x.category] ?? 0) + x.amount;
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const listBox = h("div", {});
    let filter = "all";
    const draw = () => {
      const shown = filter === "all" ? expenses : expenses.filter((x) => x.status === filter);
      listBox.replaceChildren(
        filterChips([["all", "Toutes"], ["paid", "Payées"], ["pending", "À payer"]], filter, (k) => { filter = k; draw(); }),
        shown.length ? h("ul", { class: "list card-flat" }, shown.map((x) => h("li", {},
          h("a", { href: `${base}/budget/depense/${enc(x.id)}`, class: "item" },
            h("span", { class: "cat-ico", "aria-hidden": "true" }, EXPENSE_CATEGORIES[x.category][1]),
            h("span", { class: "grow" }, h("span", { class: "title" }, x.label),
              h("span", { class: "sub" }, [EXPENSE_CATEGORIES[x.category][0], x.supplier, shortDate(x.spentAt)].filter(Boolean).join(" · "))),
            h("span", { class: "amount" }, h("strong", {}, formatAmount(x.amount, event.currency)), chip(EXPENSE_CHIP[x.status], EXPENSE_STATUS[x.status]))))))
          : h("div", { class: "card empty" }, expenses.length ? "Aucune dépense dans ce filtre." : "Aucune dépense enregistrée."));
    };
    draw();
    body = h("div", { class: "form" },
      cats.length ? h("section", { class: "card" }, h("h2", {}, "Répartition des dépenses"), h("ul", { class: "list" }, cats.map(([c, v]) =>
        h("li", { class: "item" }, h("span", { class: "cat-ico", "aria-hidden": "true" }, EXPENSE_CATEGORIES[c][1]),
          h("span", { class: "grow" }, h("span", { class: "title" }, EXPENSE_CATEGORIES[c][0]), h("span", { class: "sub" }, formatAmount(v, event.currency))),
          h("strong", {}, `${pct(v, totals.spent)} %`))))) : null,
      listBox,
      h("a", { href: `${base}/budget/depense`, class: "btn btn-primary btn-block" }, "+ Ajouter une dépense"));
  }
  return h("div", { class: "form" },
    budgetCard(event, totals, true, orga.byOrigin(contributions)),
    h("p", { class: "muted small" }, isTreasurer
      ? "Vous êtes trésorier : vous confirmez les contributions et voyez le nom des contributeurs anonymes."
      : "Les simples membres ne voient que les totaux. Le nom d'un contributeur anonyme n'est visible que par lui et le trésorier."),
    tabs, body);
}

async function contributionsList(ctx, contributions) {
  const { fid, eid, event, isTreasurer, base } = ctx;
  const names = {};
  if (isTreasurer) {
    await Promise.all(contributions.filter((c) => c.anonymous).map(async (c) => {
      const id = await orga.getIdentity(fid, eid, c.id).catch(() => null);
      if (id) names[c.id] = id.displayName;
    }));
  }
  const listBox = h("div", {});
  let filter = "all";
  let kind = "money";
  const row = (c) => {
    const who = c.anonymous ? (names[c.id] ? `${names[c.id]} (anonyme)` : "Contributeur anonyme") : c.displayName;
    const controls = [];
    if (isTreasurer) {
      const sel = roleSelect(`Statut de la contribution de ${who}`, CONTRIB_STATUS, c.status, async (status) => {
        await orga.setContributionStatus(fid, eid, c.id, status); toast(`Contribution ${CONTRIB_STATUS[status].toLowerCase()}`); reload();
      });
      const del = h("button", { type: "button", class: "btn btn-sm" }, "Supprimer");
      del.addEventListener("click", () => withBusy(del, async () => {
        if (!confirm(`Supprimer la contribution de ${who} (${formatAmount(c.amount, event.currency)}) ?`)) return;
        try { await orga.deleteContributionAsTreasurer(fid, eid, c.id, c.source); toast("Contribution supprimée"); reload(); } catch (err) { toast(errMsg(err)); }
      }));
      controls.push(sel, del);
    }
    return h("li", { class: "item participant" }, c.anonymous && !names[c.id] ? h("span", { class: "avatar anon", "aria-hidden": "true" }, "?") : avatar(who),
      h("span", { class: "grow" }, h("span", { class: "title" }, who),
        h("span", { class: "sub" }, [c.kind === "inkind" ? `${c.item}${c.amount ? ` (≈ ${formatAmount(c.amount, event.currency)})` : ""}` : formatAmount(c.amount, event.currency),
          ORIGINS[c.origin]?.[0], c.source === "treasurer" ? "enregistrée par le trésorier" : null, c.note].filter(Boolean).join(" · "))),
      chip(CONTRIB_CHIP[c.status], CONTRIB_STATUS[c.status]),
      controls.length ? h("div", { class: "controls" }, controls) : null);
  };
  const draw = () => {
    const ofKind = contributions.filter((c) => (c.kind ?? "money") === kind);
    const counts = { all: ofKind.length, promised: 0, declared: 0, confirmed: 0 };
    for (const c of ofKind) counts[c.status] += 1;
    const shown = filter === "all" ? ofKind : ofKind.filter((c) => c.status === filter);
    const kindTabs = h("div", { class: "tabs", role: "tablist" }, Object.entries(CONTRIB_KIND).map(([k, label]) => {
      const b = h("button", { type: "button", role: "tab", "aria-selected": String(kind === k) }, label);
      b.addEventListener("click", () => { kind = k; filter = "all"; draw(); });
      return b;
    }));
    listBox.replaceChildren(kindTabs,
      filterChips([["all", `Toutes (${counts.all})`], ["promised", `Promises (${counts.promised})`], ["declared", `Déclarées (${counts.declared})`], ["confirmed", `Confirmées (${counts.confirmed})`]], filter, (k) => { filter = k; draw(); }),
      shown.length ? h("ul", { class: "list card-flat" }, shown.map(row)) : h("div", { class: "card empty" }, ofKind.length ? "Aucune contribution dans ce filtre." : kind === "inkind" ? "Aucun don en nature pour l'instant." : "Aucune contribution pour l'instant."));
  };
  draw();
  return h("div", { class: "form" }, listBox,
    !isTreasurer ? h("p", { class: "muted small" }, "Seul le trésorier confirme les contributions. Désignez-en un dans l'onglet Participants.") : null,
    h("a", { href: `${base}/budget/contribuer`, class: "btn btn-primary btn-block" }, "+ Ajouter ma contribution"),
    isTreasurer ? h("a", { href: `${base}/budget/don-recu`, class: "btn btn-block" }, "Enregistrer un don reçu d'un proche") : null);
}

async function memberBudget(ctx) {
  const { fid, eid, event, base } = ctx;
  const [summary, mine] = await Promise.all([orga.getSummary(fid, eid), orga.listMyContributions(fid, eid)]);
  const b = summary.budget;
  return h("div", { class: "form" },
    b ? budgetCard(event, b, false) : h("section", { class: "card" }, h("p", { class: "muted" }, "Les totaux du budget apparaîtront quand l'organisateur ou le trésorier aura ouvert le budget.")),
    b?.updatedAt ? h("p", { class: "muted small" }, `Totaux mis à jour le ${formatDate(b.updatedAt)}. Le détail des dépenses et des contributions est réservé à l'organisateur et au trésorier.`) : null,
    h("section", {}, h("h2", {}, "Mes contributions"),
      mine.length ? h("ul", { class: "list card-flat" }, mine.map((c) => h("li", {},
        h("a", { href: `${base}/budget/contribution/${enc(c.id)}`, class: "item" },
          h("span", { class: "grow" }, h("span", { class: "title" }, c.kind === "inkind" ? `En nature : ${c.item}` : formatAmount(c.amount, event.currency)),
            h("span", { class: "sub" }, [c.anonymous ? "Anonyme" : "Nom visible", c.note].filter(Boolean).join(" · "))),
          chip(CONTRIB_CHIP[c.status], CONTRIB_STATUS[c.status])))))
        : h("div", { class: "card empty" }, "Vous n'avez pas encore déclaré de contribution.")),
    h("a", { href: `${base}/budget/contribuer`, class: "btn btn-primary btn-block" }, "+ Ajouter ma contribution"),
    h("p", { class: "muted small" }, "Pas de paiement dans l'application : vous donnez comme d'habitude (espèces, Wave, Orange Money…), puis vous déclarez ici. Le trésorier confirme à réception."));
}

function expenseForm(ctx, x) {
  const { fid, eid, event, base } = ctx;
  const form = h("form", { class: "card form", novalidate: true },
    h("div", { class: "row-2" },
      field(`Montant (${CURRENCIES[event.currency]})`, { name: "amount", class: "input", inputmode: "decimal", required: true, value: amountInput(x?.amount, event.currency) }),
      field("Statut", { name: "status", tag: "select", class: "input", options: Object.entries(EXPENSE_STATUS) })),
    field("Libellé", { name: "label", class: "input", required: true, maxlength: 120, value: x?.label ?? "", placeholder: "Ex. Location de la salle" }),
    field("Catégorie", { name: "category", tag: "select", class: "input", options: Object.entries(EXPENSE_CATEGORIES).map(([k, [l]]) => [k, l]) }),
    field("Fournisseur (facultatif)", { name: "supplier", class: "input", maxlength: 120, value: x?.supplier ?? "" }),
    field("Date", { name: "spentAt", type: "date", class: "input", value: dateInput(x?.spentAt ?? new Date()) }),
    h("p", { class: "muted small" }, "Justificatifs (factures, photos) : prévus avec l'album, quand le stockage de fichiers sera activé."),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, x ? "Enregistrer la dépense" : "Ajouter la dépense"));
  form.elements.status.value = x?.status ?? "pending";
  form.elements.category.value = x?.category ?? "VENUE";
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const label = v.label.replace(/\s+/g, " ").trim();
        if (!label) throw new Error("Le libellé est obligatoire.");
        const payload = { label, category: v.category, amount: requiredAmount(v.amount, event.currency), supplier: v.supplier.trim(), spentAt: fromDateInput(v.spentAt), status: v.status };
        if (x) await orga.updateExpense(fid, eid, x.id, payload); else await orga.createExpense(fid, eid, payload);
        toast(x ? "Dépense enregistrée" : "Dépense ajoutée");
        location.hash = `${base}/budget`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  const parts = [subHeader(x ? "Modifier la dépense" : "Ajouter une dépense", `${base}/budget`), form];
  if (x) {
    const del = h("button", { type: "button", class: "btn btn-block danger-btn" }, "Supprimer la dépense");
    del.addEventListener("click", () => withBusy(del, async () => {
      if (!confirm(`Supprimer « ${x.label} » ?`)) return;
      try { await orga.deleteExpense(fid, eid, x.id); toast("Dépense supprimée"); location.hash = `${base}/budget`; } catch (err) { toast(errMsg(err)); }
    }));
    parts.push(del);
  }
  return h("div", { class: "form" }, parts);
}

function kindSwitch() {
  return h("fieldset", { class: "seg" }, h("legend", { class: "sr-only" }, "Type de contribution"),
    Object.entries(CONTRIB_KIND).map(([k, label], i) => h("label", {}, h("input", { type: "radio", name: "kind", value: k, checked: i === 0 }), h("span", {}, label))));
}
/** Argent : montant obligatoire. En nature : description obligatoire, valeur estimée facultative. */
function readContribution(kind, v, currency) {
  if (kind === "inkind") {
    const item = String(v.item ?? "").replace(/\s+/g, " ").trim();
    if (!item) throw new Error("Décrivez ce que vous apportez.");
    return { item, amount: parseAmount(v.amount, currency) };
  }
  return { item: null, amount: requiredAmount(v.amount, currency) };
}

function contributionForm(ctx, existing) {
  const { fid, eid, event, base, myName } = ctx;
  const kind = existing?.kind ?? "money";
  const form = h("form", { class: "card form", novalidate: true },
    existing ? h("p", {}, chip("chip-violet", CONTRIB_KIND[kind])) : kindSwitch(),
    field("Ce que vous apportez", { name: "item", class: "input", maxlength: 120, value: existing?.item ?? "", placeholder: "Ex. 2 sacs de riz de 50 kg, location des chaises" }),
    field(`Montant (${CURRENCIES[event.currency]})`, { name: "amount", class: "input", inputmode: "decimal", value: amountInput(existing?.amount, event.currency) }),
    field("Provenance", { name: "origin", tag: "select", class: "input", options: Object.entries(ORIGINS).map(([k, [l]]) => [k, l]) }, "Sert à la répartition du budget (anneau)."),
    field("Où en êtes-vous ?", { name: "status", tag: "select", class: "input", options: [["promised", "Promise : je compte donner"], ["declared", "Déclarée : j'ai déjà donné"]] }),
    field("Précision (facultatif)", { name: "note", class: "input", maxlength: 200, value: existing?.note ?? "", placeholder: "Ex. Wave le 12/01, remis à Awa" }),
    existing ? h("p", { class: "muted small" }, existing.anonymous ? "Contribution anonyme : seul le trésorier voit votre nom." : "Votre nom est visible de l'organisateur et du trésorier.")
      : h("label", { class: "check" }, h("input", { type: "checkbox", name: "anonymous" }),
        h("span", {}, h("strong", {}, "Contribuer anonymement"), h("br"), h("span", { class: "muted small" }, "Votre nom ne sera visible que par vous et le trésorier qui confirme. Les autres verront « Contributeur anonyme »."))),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, existing ? "Enregistrer" : "Déclarer ma contribution"));
  if (existing) form.elements.status.value = existing.status;
  form.elements.origin.value = existing?.origin ?? "FAMILY";
  const syncKind = () => {
    const k = existing ? kind : form.elements.kind.value;
    form.querySelector("[name=item]").closest(".field").style.display = k === "inkind" ? "" : "none";
    form.elements.amount.closest(".field").querySelector("label").textContent = k === "inkind" ? `Valeur estimée (${CURRENCIES[event.currency]}, facultatif)` : `Montant (${CURRENCIES[event.currency]})`;
  };
  form.addEventListener("change", syncKind);
  syncKind();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const k = existing ? kind : v.kind;
        const { amount, item } = readContribution(k, v, event.currency);
        if (existing) await orga.updateMyContribution(fid, eid, existing.id, { amount, item, status: v.status, note: v.note.trim(), origin: v.origin });
        else await orga.createMyContribution(fid, eid, { amount, kind: k, item, origin: v.origin, status: v.status, anonymous: Boolean(v.anonymous), note: v.note.trim() }, myName);
        toast("Contribution enregistrée");
        location.hash = `${base}/budget`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  const parts = [subHeader(existing ? "Ma contribution" : "Ajouter ma contribution", `${base}/budget`)];
  if (existing?.status === "confirmed") {
    parts.push(h("section", { class: "card form" }, h("p", { class: "big-amount" }, existing.kind === "inkind" ? existing.item : formatAmount(existing.amount, event.currency)), chip("chip-green", "Confirmée par le trésorier"),
      h("p", { class: "muted small" }, "Une contribution confirmée ne peut plus être modifiée. Contactez le trésorier en cas d'erreur.")));
  } else {
    parts.push(form);
    if (existing) {
      const del = h("button", { type: "button", class: "btn btn-block danger-btn" }, "Retirer ma contribution");
      del.addEventListener("click", () => withBusy(del, async () => {
        if (!confirm("Retirer cette contribution ?")) return;
        try { await orga.deleteMyContribution(fid, eid, existing.id); toast("Contribution retirée"); location.hash = `${base}/budget`; } catch (err) { toast(errMsg(err)); }
      }));
      parts.push(del);
    }
  }
  return h("div", { class: "form" }, parts);
}

function receivedGiftForm(ctx) {
  const { fid, eid, event, base } = ctx;
  const form = h("form", { class: "card form", novalidate: true },
    field("Nom du contributeur", { name: "name", class: "input", required: true, maxlength: 80, placeholder: "Ex. Tonton Ali, Famille Italie" }),
    kindSwitch(),
    field("Ce qui a été apporté", { name: "item", class: "input", maxlength: 120, placeholder: "Ex. 2 sacs de riz" }),
    field(`Montant ou valeur estimée (${CURRENCIES[event.currency]})`, { name: "amount", class: "input", inputmode: "decimal" }),
    field("Provenance", { name: "origin", tag: "select", class: "input", options: Object.entries(ORIGINS).map(([k, [l]]) => [k, l]) }),
    field("Statut", { name: "status", tag: "select", class: "input", options: [["confirmed", "Confirmée : reçue"], ["promised", "Promise"]] }),
    field("Précision (facultatif)", { name: "note", class: "input", maxlength: 200 }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Enregistrer le don"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const { amount, item } = readContribution(v.kind, v, event.currency);
        await orga.recordContribution(fid, eid, { displayName: cleanName(v.name), amount, item, kind: v.kind, origin: v.origin, status: v.status, note: v.note.trim() });
        toast("Don enregistré");
        location.hash = `${base}/budget/contributions`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  form.elements.origin.value = "FAMILY";
  const sync = () => { form.querySelector("[name=item]").closest(".field").style.display = form.elements.kind.value === "inkind" ? "" : "none"; };
  form.addEventListener("change", sync);
  sync();
  return h("div", { class: "form" }, subHeader("Don reçu d'un proche", `${base}/budget/contributions`),
    h("p", { class: "muted small" }, "Pour un proche qui n'a pas de compte Bennoo : le trésorier enregistre son don."), form);
}

// ─── Invités et RSVP (maquette 11, planche 3) ─────────────────────────────
function rsvpUrl(fid, eid, token) {
  return `${location.origin}${location.pathname}#/rsvp/${enc(fid)}/${enc(eid)}/${token}`;
}
function rsvpMessage(event, household, url) {
  return `Bonjour ${household} ! Vous êtes invités à « ${event.title} »${event.startsAt ? ` le ${formatDate(event.startsAt)}` : ""}. Merci de nous répondre ici : ${url}`;
}

/* ─── Cartons d'invitation : 4 modèles au choix de l'organisateur ───────── */
const INVITE_THEMES = {
  royal: ["Royal", "Violet nuit et or, ornements dorés"],
  photo: ["Photo", "Votre photo de couverture en tête"],
  wax: ["Wax", "Motifs géométriques terre et or"],
  ivoire: ["Ivoire", "Crème et or, sobre et élégant"],
};
/** Formule d'invitation selon la cérémonie (avec ou sans hôtes nommés). */
const INVITE_LEAD = {
  WEDDING: ["ont la joie de vous convier à leur mariage", "Vous êtes conviés au mariage"],
  NAMING_CEREMONY: ["ont la joie de vous convier au baptême de leur enfant", "Vous êtes conviés au baptême"],
  COMMUNION: ["ont la joie de vous convier à la communion", "Vous êtes conviés à la communion"],
  BIRTHDAY: ["vous invitent à fêter l'anniversaire", "Vous êtes invités à l'anniversaire"],
  RELIGIOUS_CEREMONY: ["vous convient à la cérémonie religieuse", "Vous êtes conviés à la cérémonie religieuse"],
  FAMILY_REUNION: ["vous invitent à la réunion de famille", "Vous êtes invités à la réunion de famille"],
  TRADITIONAL_CEREMONY: ["vous convient à la cérémonie traditionnelle", "Vous êtes conviés à la cérémonie traditionnelle"],
  CUSTOM: ["ont le plaisir de vous inviter", "Vous êtes invités"],
};

function ornamentDivider() {
  return h("div", { class: "inv-divider", "aria-hidden": "true" }, h("span", {}), h("i", {}, "❖"), h("span", {}));
}

function invitationCard(inv, guest) {
  const theme = INVITE_THEMES[inv.theme] ? inv.theme : "royal";
  const date = inv.startsAt;
  const [withHosts, without] = INVITE_LEAD[inv.type] ?? INVITE_LEAD.CUSTOM;
  const place = [inv.venue, inv.city].filter(Boolean).join(", ");
  const weekday = date ? new Intl.DateTimeFormat("fr-FR", { weekday: "long" }).format(date) : null;
  const card = h("section", { class: `invitation theme-${theme}`, "aria-label": `Carton d'invitation : ${inv.title}` },
    theme === "photo" ? photoBackground(h("div", { class: "inv-photo", "aria-hidden": "true" }), inv.cover && PHOTOS[inv.cover] ? inv.cover : (COVERS[inv.type] ?? COVERS.CUSTOM)[0], 900, 560,
      "linear-gradient(180deg, rgba(30,15,69,0) 40%, rgba(30,15,69,.55))") : null,
    theme === "royal" || theme === "ivoire" ? [h("span", { class: "orn orn-tl", "aria-hidden": "true" }), h("span", { class: "orn orn-br", "aria-hidden": "true" })] : null,
    h("div", { class: "inv-inner" },
      h("p", { class: "inv-kicker" }, EVENT_TYPES[inv.type] ?? "Invitation"),
      inv.hosts ? h("p", { class: "inv-hosts" }, inv.hosts) : null,
      h("p", { class: "inv-lead" }, inv.hosts ? withHosts : without),
      h("p", { class: "inv-title" }, inv.title),
      ornamentDivider(),
      date ? h("div", { class: "inv-date" },
        h("span", { class: "inv-side" }, weekday),
        h("span", { class: "inv-day" }, String(date.getDate())),
        h("span", { class: "inv-side" }, new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date)))
        : h("p", { class: "inv-month" }, "Date à confirmer"),
      date ? h("p", { class: "inv-time" }, `à ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ")}`) : null,
      place ? h("p", { class: "inv-place" }, h("span", { "aria-hidden": "true" }, "📍 "), place) : null,
      inv.message ? [ornamentDivider(), h("p", { class: "inv-message" }, `« ${inv.message} »`)] : null,
      guest ? h("p", { class: "inv-guest" }, h("span", {}, guest.household), h("span", {}, `${plural(guest.seats, "place")} réservée${guest.seats > 1 ? "s" : ""}`)) : null));
  return card;
}

/** Choix du modèle : vignettes cliquables, aperçu mis à jour aussitôt. */
function themePicker(current, onPick) {
  return h("fieldset", { class: "field" }, h("legend", { class: "label" }, "Modèle du carton"),
    h("div", { class: "theme-grid" }, Object.entries(INVITE_THEMES).map(([k, [label, sub]]) => {
      const input = h("input", { type: "radio", name: "theme", value: k, checked: k === current });
      input.addEventListener("change", () => onPick(k));
      return h("label", {}, input, h("span", { class: `theme-tile swatch-${k}` }, h("strong", {}, label), h("span", {}, sub)));
    })));
}

async function guestsPanel(ctx, view) {
  const { fid, eid, event, isOrganizer, base } = ctx;
  if (!isOrganizer) return h("div", { class: "card" }, "La liste des invités est réservée aux organisateurs.");
  const [guests, invitation, previous] = await Promise.all([orga.listGuests(fid, eid), orga.getInvitation(fid, eid), orga.getSummary(fid, eid)]);
  const totals = orga.guestTotals(guests);
  await orga.saveSummary(fid, eid, "guests", totals, previous.guests).catch((err) => console.warn(err));
  const current = view === "carton" ? "carton" : "liste";
  const tabs = subTabs([[`${base}/invites`, "Invités", "liste"], [`${base}/invites/carton`, "Carton d'invitation", "carton"]], current);

  if (current === "carton") {
    const base0 = invitation ?? { title: event.title, type: event.type, startsAt: event.startsAt, venue: event.venue, city: event.city, hosts: null, message: null };
    const draft = { ...base0, cover: coverOf(event), theme: invitation?.theme ?? "royal" };
    const previewBox = h("div", {}, invitationCard(draft));
    const redraw = () => previewBox.replaceChildren(invitationCard(draft));
    const form = h("form", { class: "card form", novalidate: true },
      themePicker(draft.theme, (k) => { draft.theme = k; redraw(); }),
      field("Qui invite ?", { name: "hosts", class: "input", maxlength: 120, value: invitation?.hosts ?? "", placeholder: "Ex. Fatou & Mamadou" }, "Affiché en grand sur le carton. Laissez vide pour afficher le nom de l'événement."),
      field("Message (facultatif)", { name: "message", tag: "textarea", class: "input", maxlength: 500 }),
      h("button", { type: "submit", class: "btn btn-primary btn-block" }, invitation ? "Mettre à jour le carton" : "Publier le carton"));
    form.elements.message.value = invitation?.message ?? "";
    form.addEventListener("input", () => { draft.hosts = form.elements.hosts.value.trim() || null; draft.message = form.elements.message.value.trim() || null; redraw(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values(form);
      await withBusy(form.querySelector("button[type=submit]"), async () => {
        try { await orga.saveInvitation(fid, eid, event, { hosts: v.hosts.replace(/\s+/g, " ").trim(), message: v.message.trim(), theme: draft.theme }); toast("Carton publié"); reload(); }
        catch (err) { showFormError(form, errMsg(err)); }
      });
    });
    return h("div", { class: "form" }, tabs,
      h("p", { class: "muted small" }, invitation ? "Aperçu du carton tel que vos invités le voient. Changez de modèle ou de texte : l'aperçu suit, puis « Mettre à jour le carton »." : "Aperçu (non publié). Choisissez un modèle et publiez ; sinon il est publié en « Royal » à l'ajout du premier invité."),
      previewBox, form);
  }

  const form = h("form", { class: "card form", novalidate: true },
    h("h2", {}, "Ajouter un foyer"),
    field("Nom du foyer", { name: "household", class: "input", required: true, maxlength: 120, placeholder: "Ex. Famille Diallo" }),
    h("div", { class: "row-2" },
      field("Places", { name: "seats", type: "number", class: "input", min: 1, max: 50, value: 2, required: true }),
      field("Téléphone (facultatif)", { name: "phone", type: "tel", class: "input", inputmode: "tel", placeholder: "+221 77…" })),
    h("p", { class: "muted small" }, "Le téléphone sert seulement à ouvrir WhatsApp vers ce foyer. Chaque foyer reçoit un lien personnel ; il répond sans créer de compte."),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Ajouter et obtenir le lien"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const household = v.household.replace(/\s+/g, " ").trim();
        if (!household) throw new Error("Le nom du foyer est obligatoire.");
        const seats = Number(v.seats);
        if (!Number.isInteger(seats) || seats < 1 || seats > 50) throw new Error("Nombre de places : entre 1 et 50.");
        const phone = normalizePhone(v.phone);
        if (!invitation) await orga.saveInvitation(fid, eid, event, { hosts: null, message: null });
        await orga.createGuest(fid, eid, { household, phone, seats });
        toast(`${household} ajouté`);
        reload();
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });

  const row = (g) => {
    const url = rsvpUrl(fid, eid, g.token);
    const msg = rsvpMessage(event, g.household, url);
    const wa = g.phone ? `https://wa.me/${g.phone.replace("+", "")}?text=${encodeURIComponent(msg)}` : whatsappShareUrl(msg);
    const copy = h("button", { type: "button", class: "btn btn-sm" }, "Copier le lien");
    copy.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(url); toast("Lien copié"); } catch { prompt("Copiez ce lien :", url); }
    });
    const del = h("button", { type: "button", class: "btn btn-sm" }, "Retirer");
    del.addEventListener("click", () => withBusy(del, async () => {
      if (!confirm(`Retirer ${g.household} de la liste ? Son lien ne fonctionnera plus.`)) return;
      try { await orga.deleteGuest(fid, eid, g.token); toast("Invité retiré"); reload(); } catch (err) { toast(errMsg(err)); }
    }));
    const answer = g.response === "yes" ? `${GUEST_RESPONSE.yes} (${g.attending}/${g.seats})` : GUEST_RESPONSE[g.response];
    return h("li", { class: "item participant" }, avatar(g.household),
      h("span", { class: "grow" }, h("span", { class: "title" }, g.household),
        h("span", { class: "sub" }, [plural(g.seats, "place"), g.phone, g.message ? `« ${g.message} »` : null].filter(Boolean).join(" · "))),
      chip(GUEST_CHIP[g.response], answer),
      h("div", { class: "controls" }, h("a", { href: `${base}/invites/partager/${g.token}`, class: "btn btn-sm btn-primary" }, "Partager"),
        h("a", { href: wa, target: "_blank", rel: "noopener", class: "btn btn-sm btn-whatsapp" }, "WhatsApp"), copy, del));
  };

  return h("div", { class: "form" }, tabs,
    h("div", { class: "kpi-row four" },
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.invited)), h("span", { class: "l" }, `places · ${plural(totals.households, "foyer")}`)),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.attending)), h("span", { class: "l" }, "personnes confirmées")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.no)), h("span", { class: "l" }, "foyers absents")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.pending)), h("span", { class: "l" }, "sans réponse"))),
    guests.length ? h("ul", { class: "list card-flat" }, guests.map(row)) : photoEmpty("celebration", "Aucun invité pour l'instant.", "Ajoutez vos foyers invités ci-dessous : chacun recevra son lien personnel et répondra sans créer de compte."),
    form,
    h("p", { class: "muted small" }, "« Partager » affiche le QR code et le lien du foyer. Rappels automatiques : prévus plus tard."));
}

/** Page publique de réponse (RSVP) : ouverte depuis le lien personnel, sans compte. */
async function rsvpScreen(fid, eid, token) {
  if (!isToken(token)) return notFoundScreen("Ce lien d'invitation n'est pas valide.");
  const [inv, guest] = await Promise.all([orga.getInvitation(fid, eid).catch(() => null), orga.getGuest(fid, eid, token).catch(() => null)]);
  if (!inv || !guest) return notFoundScreen("Cette invitation n'existe plus. Contactez la personne qui vous l'a envoyée.");
  const form = h("form", { class: "card form", novalidate: true },
    h("h2", {}, guest.response === "pending" ? "Serez-vous présents ?" : "Modifier votre réponse"),
    h("fieldset", { class: "form" }, h("legend", { class: "sr-only" }, "Votre réponse"),
      h("label", { class: "check" }, h("input", { type: "radio", name: "response", value: "yes", checked: guest.response !== "no" }), h("span", {}, "Oui, nous serons là")),
      h("label", { class: "check" }, h("input", { type: "radio", name: "response", value: "no", checked: guest.response === "no" }), h("span", {}, "Non, nous ne pourrons pas venir"))),
    field("Nombre de personnes présentes", { name: "attending", type: "number", class: "input", min: 1, max: guest.seats, value: guest.attending || guest.seats }, `${plural(guest.seats, "place")} réservée${guest.seats > 1 ? "s" : ""} pour vous.`),
    field("Un petit mot (facultatif)", { name: "message", tag: "textarea", class: "input", maxlength: 500 }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Envoyer ma réponse"));
  form.elements.message.value = guest.message ?? "";
  const count = form.querySelector("[name=attending]").closest(".field");
  const sync = () => { count.style.display = form.elements.response.value === "no" ? "none" : ""; };
  form.addEventListener("change", sync);
  sync();
  const status = h("div", {}, guest.response === "pending" ? null :
    alertBox(guest.response === "yes" ? `Réponse enregistrée : ${plural(guest.attending, "personne")} présente${guest.attending > 1 ? "s" : ""}. Merci !` : "Réponse enregistrée : vous ne pourrez pas venir. Merci de nous avoir prévenus.", "info"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button"), async () => {
      try {
        const attending = v.response === "no" ? 0 : Number(v.attending);
        if (v.response === "yes" && !(Number.isInteger(attending) && attending >= 1 && attending <= guest.seats)) throw new Error(`Indiquez entre 1 et ${guest.seats} personne${guest.seats > 1 ? "s" : ""}.`);
        await orga.answerGuest(fid, eid, token, { response: v.response, attending, message: v.message.trim() });
        status.replaceChildren(alertBox(v.response === "yes" ? `Merci ! ${plural(attending, "personne")} présente${attending > 1 ? "s" : ""}, c'est noté.` : "Merci de nous avoir prévenus.", "info"));
        status.scrollIntoView({ block: "nearest" });
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  const node = bare(
    h("div", { class: "auth-brand" }, h("img", { src: "images/logo.svg", alt: "" }), h("h1", {}, "Vous êtes invités")),
    invitationCard(inv, guest), status, form,
    h("p", { class: "muted small" }, "Votre réponse est transmise aux seuls organisateurs. Pas besoin de compte."));
  return { node, title: `Invitation · ${inv.title}` };
}

// ─── Événement : écran principal et onglets ──────────────────────────────
async function eventScreen(fid, eid, tab, sub, extra) {
  const [event, family] = await Promise.all([data.getEvent(fid, eid), data.getFamily(fid)]);
  if (!event || !family) return notFoundScreen("Cet événement n'existe pas, ou vous n'y participez pas.");
  const participants = await data.listParticipants(fid, eid);
  const myUid = auth.currentUser.uid;
  const me = participants.find((p) => p.uid === myUid);
  const ctx = {
    fid, eid, event, family, participants, myUid, myName: me?.displayName ?? "Moi",
    isOrganizer: event.myRole === "organizer", isTreasurer: event.myRole === "treasurer",
    isManager: ["organizer", "treasurer"].includes(event.myRole),
    base: `#/evenement/${enc(fid)}/${enc(eid)}`,
  };
  const { base, isOrganizer } = ctx;
  const active = ["taches", "tache"].includes(tab) ? "taches" : tab === "budget" ? "budget" : tab === "invites" ? "invites" : tab === "participants" ? "participants" : "apercu";
  const tabs = h("nav", { class: "tabs scroll", "aria-label": "Rubriques de l'événement" },
    [[base, "Aperçu", "apercu"], [`${base}/taches`, "Tâches", "taches"], [`${base}/budget`, "Budget", "budget"],
      isOrganizer ? [`${base}/invites`, "Invités", "invites"] : null, [`${base}/participants`, "Participants", "participants"]]
      .filter(Boolean).map(([href, label, key]) => h("a", { href, "aria-current": active === key ? "page" : null, "aria-selected": String(active === key) }, label)));

  let body;
  if (tab === "participants") body = h("div", { class: "form" }, await participantsPanel(fid, eid, participants, isOrganizer, myUid), await committeesSection(ctx));
  else if (tab === "modifier" && isOrganizer) body = h("div", { class: "form" }, subHeader("Modifier l'événement", base), editEventForm(fid, eid, event, base));
  else if (tab === "taches" && sub === "nouvelle" && isOrganizer) body = h("div", { class: "form" }, subHeader("Nouvelle tâche", `${base}/taches`), taskForm(ctx, null, participants));
  else if (tab === "taches") body = await tasksPanel(ctx, sub);
  else if (tab === "tache" && sub) body = await taskDetail(ctx, sub, participants);
  else if (tab === "budget" && sub === "depense" && ctx.isManager) body = expenseForm(ctx, extra ? await orga.getExpense(fid, eid, extra) : null);
  else if (tab === "budget" && sub === "contribuer") body = contributionForm(ctx, null);
  else if (tab === "budget" && sub === "contribution" && extra) {
    const mine = (await orga.listMyContributions(fid, eid)).find((c) => c.id === extra);
    body = mine ? contributionForm(ctx, mine) : h("div", { class: "card" }, "Contribution introuvable.");
  } else if (tab === "budget" && sub === "don-recu" && ctx.isTreasurer) body = receivedGiftForm(ctx);
  else if (tab === "budget") body = await budgetPanel(ctx, sub);
  else if (tab === "invites" && sub === "partager" && extra && isOrganizer) body = await shareGuestPanel(ctx, extra);
  else if (tab === "invites") body = await guestsPanel(ctx, sub);
  else body = await eventOverview(ctx);

  const node = screen(
    h("a", { href: `#/famille/${enc(fid)}/evenements`, class: "back", "aria-label": `Retour à ${family.name}` }, "‹"),
    h("section", { class: `event-head${active === "apercu" && !tab ? "" : " compact"}` },
      photoBackground(h("div", { class: "event-photo", "aria-hidden": "true" }), coverOf(event), 1200, 500, "linear-gradient(180deg, rgba(46,16,101,0), rgba(46,16,101,.15))"),
      h("div", { class: "event-title" },
        h("div", { class: "grow" },
          h("h1", {}, event.title),
          h("p", { class: "muted" }, [event.startsAt ? shortLongDate(event.startsAt) : "Date à fixer", event.city].filter(Boolean).join(" • "))),
        h("span", { class: "chip chip-violet" }, EVENT_ROLES[event.myRole]))),
    tabs, body,
  );
  return { node, title: event.title, nav: "home" };
}

// ─── Écarts avec les maquettes comblés le 30/10/2026 ──────────────────────
/** Choix de la photo de couverture (maquette 6, « Photo de couverture »). */
function coverPicker(type, current) {
  const keys = [...new Set([...(COVERS[type] ?? COVERS.CUSTOM), current].filter((k) => PHOTOS[k]))];
  return h("fieldset", { class: "field" },
    h("legend", { class: "label" }, "Photo de couverture"),
    h("div", { class: "cover-grid" }, keys.map((k) => h("label", {},
      h("input", { type: "radio", name: "cover", value: k, checked: k === current }),
      h("span", { class: "cover-tile" }, photo(k, 320, 200), h("span", { class: "sr-only" }, PHOTOS[k][2]))))),
    h("p", { class: "help" }, "Photos d'illustration libres de droits. L'envoi de vos propres photos viendra avec l'album."));
}

/** Carte du lieu (maquette 6 « Lieu et date ») : chargée seulement au clic, pour ne rien envoyer à Google sans action. */
function mapBlock(getPlace) {
  const box = h("div", { class: "map-box" });
  const show = h("button", { type: "button", class: "btn btn-block" }, "📍 Afficher la carte du lieu");
  show.addEventListener("click", () => {
    const [venue, city] = getPlace();
    const q = [venue, city].map((x) => String(x || "").trim()).filter(Boolean).join(", ");
    if (!q) { toast("Indiquez d'abord un lieu ou une ville."); return; }
    box.replaceChildren(
      h("iframe", { src: `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`, title: `Carte : ${q}`, loading: "lazy", referrerpolicy: "no-referrer-when-downgrade" }),
      h("a", { href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`, target: "_blank", rel: "noopener", class: "small" }, "Ouvrir dans Google Maps"));
  });
  box.append(show, h("p", { class: "help" }, "La carte est fournie par Google Maps et ne se charge que si vous cliquez."));
  return box;
}

/** Anneau (planche 4) : un segment de couleur par provenance si elles sont connues. */
function donut(percent, big, small, segments = null) {
  const el = h("div", { class: "donut", role: "img", "aria-label": `${percent} %` },
    h("div", { class: "donut-in" }, h("strong", {}, big), small ? h("span", {}, small) : null, h("b", {}, `${percent}%`)));
  el.style.setProperty("--p", percent);
  if (segments && segments.length) {
    let at = 0;
    const stops = segments.map(([color, part]) => { const from = at; at = Math.min(100, at + part); return `${color} ${from}% ${at}%`; });
    el.style.background = `conic-gradient(${stops.join(", ")}, #ede9fe ${at}% 100%)`;
  }
  return el;
}

/** Statistiques d'un événement pour l'accueil, « Mes tâches » et « Budget ». */
async function eventStats(e) {
  const tasks = await orga.listTasks(e.familyId, e.id).catch(() => []);
  const summary = await orga.getSummary(e.familyId, e.id).catch(() => ({ budget: null, guests: null }));
  const done = tasks.filter((t) => t.status === "done").length;
  return { e, tasks, summary, done, left: tasks.length - done, progress: tasks.length ? Math.round((done / tasks.length) * 100) : null };
}

const relTime = (d) => {
  if (!d) return "";
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  if (min < 1440) return `il y a ${Math.round(min / 60)} h`;
  const days = Math.round(min / 1440);
  return days === 1 ? "hier" : days < 7 ? `il y a ${days} jours` : shortDate(d);
};

/** Activité récente (maquette 14) : tirée des vraies données que la personne a le droit de voir. */
async function recentActivity(stats) {
  const items = [];
  await Promise.all(stats.map(async ({ e, tasks }) => {
    const base = `#/evenement/${enc(e.familyId)}/${enc(e.id)}`;
    for (const t of tasks) {
      const when = t.updatedAt?.toDate?.();
      if (t.status === "done" && when) items.push({ when, icon: "✅", text: `Tâche terminée : ${t.title}`, sub: e.title, href: `${base}/tache/${enc(t.id)}` });
    }
    if (e.myRole === "organizer") {
      const guests = await orga.listGuests(e.familyId, e.id).catch(() => []);
      for (const g of guests) if (g.respondedAt) items.push({ when: g.respondedAt, icon: g.response === "yes" ? "💌" : "✉️", text: g.response === "yes" ? `${g.household} vient (${g.attending})` : `${g.household} ne viendra pas`, sub: e.title, href: `${base}/invites` });
    }
    if (["organizer", "treasurer"].includes(e.myRole)) {
      const list = await orga.listContributions(e.familyId, e.id).catch(() => []);
      for (const c of list) if (c.createdAt) items.push({ when: c.createdAt, icon: "💰", text: `Contribution ${CONTRIB_STATUS[c.status].toLowerCase()} : ${c.kind === "inkind" ? c.item : formatAmount(c.amount, e.currency)}`, sub: `${c.anonymous ? "Anonyme" : c.displayName} · ${e.title}`, href: `${base}/budget/contributions` });
    }
  }));
  return items.sort((a, b) => b.when - a.when).slice(0, 6);
}

async function homeScreen() {
  const [profile, families, events] = await Promise.all([data.getProfile(), data.listMyFamilies(), data.listMyEvents()]);
  const name = profile?.displayName ?? auth.currentUser.displayName ?? "";
  const me = auth.currentUser.uid;
  const famName = Object.fromEntries(families.map((f) => [f.id, f.name]));
  const archivedList = events.filter((e) => e.status === "archived");
  const live = events.filter((e) => e.status !== "archived");
  const upcoming = live.filter((e) => !e.startsAt || daysUntil(e.startsAt) >= 0);
  const past = live.filter((e) => e.startsAt && daysUntil(e.startsAt) < 0).reverse();
  const showFamily = families.length > 1;
  const stats = await Promise.all(events.map(eventStats));
  const byId = Object.fromEntries(stats.map((x) => [x.e.id, x]));
  const next = upcoming[0] ? byId[upcoming[0].id] : null; // le prochain événement non archivé
  const others = upcoming.slice(1);
  const cards = (list) => list.map((e) => eventCard(e, showFamily ? famName[e.familyId] : null, byId[e.id]?.progress ?? 0));

  // Mes prochaines tâches, tous événements confondus (celles qui me sont confiées).
  const myTasks = stats.filter((x) => x.e.status !== "archived").flatMap(({ e, tasks }) => tasks
    .filter((t) => t.status !== "done" && t.assigneeUid === me)
    .map((t) => ({ t, ctx: { fid: e.familyId, eid: e.id, base: `#/evenement/${enc(e.familyId)}/${enc(e.id)}`, isOrganizer: e.myRole === "organizer", myUid: me }, title: e.title })))
    .sort((a, b) => (a.t.dueAt?.getTime() ?? Infinity) - (b.t.dueAt?.getTime() ?? Infinity));

  const search = events.length ? h("input", { type: "search", class: "input search desk-only", placeholder: "Rechercher…", "aria-label": "Rechercher un événement" }) : null;
  search?.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    for (const c of document.querySelectorAll(".event-card, .next-event")) c.hidden = q !== "" && !c.dataset.search.includes(q);
  });

  // ─── En-tête : salutation, date du jour ───
  const today = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const hour = new Date().getHours();
  const hello = hour < 5 || hour >= 18 ? "Bonsoir" : "Bonjour";
  const head = h("div", { class: "hello home-hello" },
    avatar(name, "sq"),
    h("div", { class: "grow" }, h("p", { class: "muted small today" }, today), h("h1", {}, `${hello} ${firstName(name)} 👋`)),
    search);

  // ─── Nouveau venu : bienvenue illustrée et création de la famille ───
  if (families.length === 0) {
    const node = screen(head,
      photoBackground(h("section", { class: "home-hero" },
        h("h2", {}, "Organisons ensemble vos moments précieux"),
        h("p", {}, "Mariage, baptême, anniversaire, cérémonie… Toute la famille au même endroit.")), "reunion", 1000, 520,
        "linear-gradient(180deg, rgba(46,16,101,.15), rgba(30,15,69,.88))"),
      h("section", { class: "card form" },
        h("h2", {}, "1. Créez votre famille"),
        h("p", { class: "muted small" }, "C'est l'espace commun de vos proches. Vous avez reçu un lien d'invitation ? Ouvrez-le simplement pour rejoindre la famille."),
        createFamilyForm(name)),
      h("ol", { class: "welcome-steps" },
        h("li", { class: "welcome-step" }, h("span", { class: "n" }, "2"), h("div", {}, h("h3", {}, "Invitez vos proches"), h("p", { class: "muted" }, "Un lien à envoyer sur WhatsApp."))),
        h("li", { class: "welcome-step" }, h("span", { class: "n" }, "3"), h("div", {}, h("h3", {}, "Créez votre premier événement"), h("p", { class: "muted" }, "Avec sa checklist adaptée à la cérémonie.")))));
    return { node, title: "Accueil", nav: "home" };
  }

  // ─── Le prochain événement, en grand ───
  let hero = null;
  if (next) {
    const { e, summary, left, progress } = next;
    const base = `#/evenement/${enc(e.familyId)}/${enc(e.id)}`;
    const bar = h("span", { class: "bar" }, h("span", {})); bar.firstChild.style.width = `${progress ?? 0}%`;
    const financed = summary.budget && e.budgetPlanned ? pct(summary.budget.confirmed, e.budgetPlanned) : null;
    const stat = (v, l) => h("span", { class: "ne-stat" }, h("strong", {}, v), h("span", {}, l));
    hero = h("a", { href: base, class: "next-event", dataset: { search: [e.title, e.city, EVENT_TYPES[e.type]].filter(Boolean).join(" ").toLowerCase() } },
      photoBackground(h("span", { class: "ne-photo" },
        h("span", { class: "chip chip-gold" }, countdownLabel(e.startsAt)),
        h("span", { class: "ne-type" }, EVENT_ICONS[e.type], " ", EVENT_TYPES[e.type])), coverOf(e), 1000, 560,
        "linear-gradient(180deg, rgba(30,15,69,.05), rgba(30,15,69,.55))"),
      h("span", { class: "ne-body" },
        h("span", { class: "ne-kicker" }, "Votre prochain événement"),
        h("strong", { class: "ne-title" }, e.title),
        h("span", { class: "muted small" }, [e.startsAt ? formatDate(e.startsAt) : "Date à fixer", e.city].filter(Boolean).join(" · ")),
        h("span", { class: "ne-progress" }, bar, h("span", {}, `${progress ?? 0} % organisé`)),
        h("span", { class: "ne-stats" },
          stat(String(left), `tâche${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""}`),
          stat(summary.guests ? String(summary.guests.attending) : "—", "invités confirmés"),
          stat(financed === null ? "—" : `${financed} %`, "du budget financé"))));
  }

  // ─── Raccourcis ───
  const firstFamily = families[0];
  const tile = (href, ico, label, sub) => h("a", { href, class: "quick" }, h("span", { class: "q-ico", "aria-hidden": "true" }, ico), h("strong", {}, label), sub ? h("span", {}, sub) : null);
  const quick = h("nav", { class: "quick-grid", "aria-label": "Raccourcis" },
    tile("#/nouvel-evenement", "✨", "Nouvel événement", "avec checklist"),
    ["owner", "admin"].includes(firstFamily.myRole)
      ? tile(`#/famille/${enc(firstFamily.id)}/inviter`, "💌", "Inviter un proche", "lien WhatsApp")
      : tile(`#/famille/${enc(firstFamily.id)}`, "👨‍👩‍👧", "Ma famille", firstFamily.name),
    tile("#/taches", "✅", "Mes tâches", myTasks.length ? `${myTasks.length} à faire` : "à jour"),
    tile("#/budget", "💰", "Budget", plural(live.length, "événement")));

  // ─── Mes prochaines tâches ───
  const tasksBox = myTasks.length ? h("section", {},
    h("div", { class: "section-head" }, h("h2", {}, "Mes prochaines tâches"), h("a", { href: "#/taches", class: "small" }, "Tout voir")),
    h("ul", { class: "list task-cards" }, myTasks.slice(0, 3).map(({ t, ctx }) => taskItem(ctx, t)))) : null;

  // ─── Version ordinateur : chiffres clés du prochain événement (maquette 14) ───
  let spotlight = null;
  if (next) {
    const { e, summary, left } = next;
    const kpi = (v, l) => h("div", { class: "kpi" }, h("span", { class: "v sm" }, v), h("span", { class: "l" }, l));
    spotlight = h("div", { class: "kpi-row four desk-only" },
      kpi(summary.guests ? String(summary.guests.attending) : "—", "Invités confirmés"),
      kpi(String(left), "Tâches restantes"),
      kpi(e.budgetPlanned ? kpiAmount(e.budgetPlanned, e.currency) : "—", "Budget global"),
      kpi(summary.budget ? String(summary.budget.contributors) : "—", "Contributions"));
  }

  const listBox = upcoming.length === 0
    ? photoEmpty("celebration", "Aucun événement à venir.", "Créez-en un : vous en serez l'organisateur, avec une checklist adaptée à la cérémonie.",
      h("a", { href: "#/nouvel-evenement", class: "btn btn-primary btn-block" }, "+ Créer un événement"))
    : others.length ? h("section", {},
      h("div", { class: "section-head" }, h("h2", {}, "Mes autres événements"), h("a", { href: "#/nouvel-evenement", class: "btn btn-primary btn-sm" }, "+ Créer")),
      h("div", {}, cards(others))) : null;
  const pastBox = past.length || archivedList.length ? h("div", { class: "form" },
    past.length ? h("section", {}, h("h2", {}, "Événements récents"), h("div", {}, cards(past))) : null,
    archivedList.length ? h("details", { class: "archived" }, h("summary", {}, `Événements archivés (${archivedList.length})`), h("div", {}, cards(archivedList))) : null) : null;

  // ─── Activité récente : chargée après l'affichage, sur grand écran ───
  const activityBox = h("div", {}, loading("Chargement de l'activité…"));
  const aside = h("aside", { class: "card activity desk-only", "aria-labelledby": "act-title" }, h("h2", { id: "act-title" }, "Activité récente"), activityBox);
  if (events.length && window.matchMedia("(min-width: 900px)").matches) {
    recentActivity(stats).then((activity) => activityBox.replaceChildren(activity.length
      ? h("ul", { class: "list" }, activity.map((a) => h("li", {}, h("a", { href: a.href, class: "item" },
        h("span", { class: "act-ico", "aria-hidden": "true" }, a.icon),
        h("span", { class: "grow" }, h("span", { class: "title wrap" }, a.text), h("span", { class: "sub" }, `${a.sub} · ${relTime(a.when)}`))))))
      : h("p", { class: "muted small" }, "Rien pour l'instant : les tâches terminées, réponses d'invités et contributions apparaîtront ici.")))
      .catch(() => activityBox.replaceChildren(h("p", { class: "muted small" }, "Activité momentanément indisponible.")));
  }

  const node = screen(head,
    h("div", { class: "home-grid" },
      h("div", { class: "home-main" }, hero, spotlight, quick, tasksBox, listBox, inspirations(), pastBox),
      events.length ? aside : null));
  return { node, title: "Accueil", nav: "home" };
}

// ─── Rubrique « Tâches » de la barre (toutes mes tâches) ─────────────────
async function myTasksScreen() {
  const events = (await data.listMyEvents()).filter((e) => !e.startsAt || daysUntil(e.startsAt) >= -1);
  const stats = await Promise.all(events.map(eventStats));
  const me = auth.currentUser.uid;
  const box = h("div", { class: "form" });
  let mode = "mine";
  const draw = () => {
    const sections = stats.map(({ e, tasks }) => {
      const base = `#/evenement/${enc(e.familyId)}/${enc(e.id)}`;
      const ctx = { fid: e.familyId, eid: e.id, base, isOrganizer: e.myRole === "organizer", myUid: me };
      const shown = tasks.filter((t) => t.status !== "done" && (mode === "all" || t.assigneeUid === me));
      if (!shown.length) return null;
      return h("section", {}, h("div", { class: "section-head" }, h("h2", {}, e.title), h("a", { href: `${base}/taches`, class: "small" }, "Ouvrir")),
        h("ul", { class: "list card-flat" }, shown.map((t) => taskItem(ctx, t))));
    }).filter(Boolean);
    box.replaceChildren(
      filterChips([["mine", "Assignées à moi"], ["all", "Toutes les tâches à faire"]], mode, (k) => { mode = k; draw(); }),
      sections.length ? h("div", { class: "form" }, sections) : h("div", { class: "card empty" }, h("strong", {}, mode === "mine" ? "Aucune tâche ne vous est assignée." : "Aucune tâche à faire."),
        h("span", {}, events.length ? "Les tâches se créent dans chaque événement (onglet Tâches)." : "Créez ou rejoignez un événement pour commencer.")));
  };
  draw();
  return { node: screen(rubricBanner("womenWax", "Mes tâches", "Ce qui vous attend dans vos prochains événements."), box), title: "Mes tâches", nav: "tasks" };
}

// ─── Rubrique « Budget » de la barre (budget de chaque événement) ────────
async function myBudgetScreen() {
  const events = await data.listMyEvents();
  const stats = await Promise.all(events.map(eventStats));
  const cards = stats.map(({ e, summary }) => {
    const b = summary.budget;
    const base = `#/evenement/${enc(e.familyId)}/${enc(e.id)}`;
    const p = b && e.budgetPlanned ? pct(b.confirmed, e.budgetPlanned) : 0;
    return h("a", { href: `${base}/budget`, class: "card budget-row" },
      donut(p, b ? kpiAmount(b.confirmed, e.currency) : "—", e.budgetPlanned ? `/ ${kpiAmount(e.budgetPlanned, e.currency)}` : "budget à fixer"),
      h("span", { class: "grow" }, h("strong", {}, e.title), h("span", { class: "sub" }, [e.startsAt ? shortDate(e.startsAt) : "Date à fixer", EVENT_ROLES[e.myRole]].join(" · ")),
        h("span", { class: "sub" }, b ? `Reste à financer : ${formatAmount(Math.max(0, e.budgetPlanned - b.confirmed), e.currency)}` : "Totaux pas encore calculés (l'organisateur ou le trésorier doit ouvrir le budget)")),
      h("span", { class: "chev", "aria-hidden": "true" }, "›"));
  });
  return {
    node: screen(rubricBanner("weddingHands", "Budget", "Où en est le financement de chacun de vos événements."), cards.length ? h("div", { class: "form" }, cards, h("p", { class: "muted small" }, "Contributions confirmées par rapport au budget prévu de chaque événement."))
      : h("div", { class: "card empty" }, h("strong", {}, "Aucun événement."), h("span", {}, "Le budget se gère dans chaque événement."))),
    title: "Budget", nav: "budget",
  };
}

// ─── Comités (planche 2, écran 4) ────────────────────────────────────────
async function committeesSection(ctx) {
  const { fid, eid, isOrganizer, participants } = ctx;
  const list = await orga.listCommittees(fid, eid);
  const rows = list.map((c) => {
    let del = null;
    if (isOrganizer) {
      del = h("button", { type: "button", class: "btn btn-sm" }, "Supprimer");
      del.addEventListener("click", () => withBusy(del, async () => {
        if (!confirm(`Supprimer le comité « ${c.name} » ?`)) return;
        try { await orga.deleteCommittee(fid, eid, c.id); toast("Comité supprimé"); reload(); } catch (err) { toast(errMsg(err)); }
      }));
    }
    return h("li", { class: "item" }, h("span", { class: "cat-ico", "aria-hidden": "true" }, "👥"),
      h("span", { class: "grow" }, h("span", { class: "title" }, c.name), h("span", { class: "sub" }, `${plural(c.memberNames.length, "membre")}${c.memberNames.length ? ` : ${c.memberNames.join(", ")}` : ""}`)), del);
  });
  let form = null;
  if (isOrganizer) {
    form = h("form", { class: "card form", novalidate: true }, h("h3", {}, "Créer un comité"),
      field("Nom du comité", { name: "name", class: "input", required: true, maxlength: 80, placeholder: "Ex. Comité accueil" }),
      h("fieldset", { class: "form" }, h("legend", { class: "label" }, "Membres du comité"),
        participants.map((p) => h("label", { class: "check" }, h("input", { type: "checkbox", name: "m", value: p.uid }), h("span", {}, p.displayName)))),
      h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Créer le comité"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showFormError(form, null);
      await withBusy(form.querySelector("button[type=submit]"), async () => {
        try {
          const name = cleanName(form.elements.name.value);
          const uids = [...form.querySelectorAll("input[name=m]:checked")].map((i) => i.value);
          const members = participants.filter((p) => uids.includes(p.uid));
          await orga.createCommittee(fid, eid, name, members);
          toast("Comité créé"); reload();
        } catch (err) { showFormError(form, errMsg(err)); }
      });
    });
  }
  return h("section", { class: "form" }, h("h2", {}, "Comités de l'événement"),
    rows.length ? h("ul", { class: "list card-flat" }, rows) : h("p", { class: "muted small" }, "Aucun comité. Un comité regroupe quelques participants autour d'une mission (accueil, décoration, restauration…)."),
    form);
}

async function familyCommittees(famEvents) {
  const blocks = await Promise.all(famEvents.map(async (e) => {
    const list = await orga.listCommittees(e.familyId, e.id).catch(() => []);
    if (!list.length) return null;
    return h("section", {}, h("h2", {}, e.title), h("ul", { class: "list card-flat" }, list.map((c) => h("li", {},
      h("a", { href: `#/evenement/${enc(e.familyId)}/${enc(e.id)}/participants`, class: "item" }, h("span", { class: "cat-ico", "aria-hidden": "true" }, "👥"),
        h("span", { class: "grow" }, h("span", { class: "title" }, c.name), h("span", { class: "sub" }, plural(c.memberNames.length, "membre"))),
        h("span", { class: "chev", "aria-hidden": "true" }, "›"))))));
  }));
  const shown = blocks.filter(Boolean);
  return h("div", { class: "form" }, shown.length ? shown : h("div", { class: "card empty" }, h("strong", {}, "Aucun comité."),
    h("span", {}, "Les comités se créent dans l'onglet Participants d'un événement.")));
}

// ─── Partager l'invitation d'un foyer (maquette 11, « Partager l'invitation ») ──
let qrLib = null;
function loadQrLib() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLib ??= new Promise((resolve, reject) => {
    const sc = document.createElement("script");
    sc.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    sc.onload = () => resolve(window.qrcode);
    sc.onerror = () => { qrLib = null; reject(new Error("QR code indisponible (pas de connexion ?)")); };
    document.head.append(sc);
  });
  return qrLib;
}

async function shareGuestPanel(ctx, token) {
  const { fid, eid, event, base } = ctx;
  const g = await orga.getGuest(fid, eid, token);
  if (!g) return h("div", { class: "card" }, "Cet invité n'existe plus.");
  const guests = await orga.listGuests(fid, eid);
  const answered = guests.filter((x) => x.response !== "pending").length;
  const url = rsvpUrl(fid, eid, token);
  const msg = rsvpMessage(event, g.household, url);
  const qrBox = h("div", { class: "qr", role: "img", "aria-label": `QR code de l'invitation de ${g.household}` }, loading("QR code…"));
  loadQrLib().then((qrcode) => {
    const qr = qrcode(0, "M");
    qr.addData(url);
    qr.make();
    qrBox.replaceChildren(h("img", { src: qr.createDataURL(6, 8), alt: "", width: 220, height: 220 }));
  }).catch((err) => qrBox.replaceChildren(h("p", { class: "muted small" }, err.message)));
  const copy = h("button", { type: "button", class: "btn btn-primary btn-sm" }, "Copier");
  copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(url); toast("Lien copié"); } catch { prompt("Copiez ce lien :", url); } });
  const share = (href, ico, label) => h("a", { href, class: "share-btn", target: href.startsWith("http") ? "_blank" : null, rel: "noopener" }, h("span", { "aria-hidden": "true" }, ico), label);
  const more = navigator.share ? h("button", { type: "button", class: "share-btn" }, h("span", { "aria-hidden": "true" }, "⋯"), "Plus") : null;
  more?.addEventListener("click", () => navigator.share({ title: event.title, text: msg, url }).catch(() => {}));
  return h("div", { class: "form" },
    subHeader(`Partager l'invitation · ${g.household}`, `${base}/invites`),
    h("section", { class: "card form center" }, qrBox,
      h("div", { class: "copy-row" }, h("input", { class: "input", value: url, readonly: true, "aria-label": "Lien personnel" }), copy)),
    h("section", { class: "card" }, h("h3", {}, "Partager sur"),
      h("div", { class: "share-row" },
        share(g.phone ? `https://wa.me/${g.phone.replace("+", "")}?text=${encodeURIComponent(msg)}` : whatsappShareUrl(msg), "🟢", "WhatsApp"),
        share(`mailto:?subject=${encodeURIComponent(`Invitation : ${event.title}`)}&body=${encodeURIComponent(msg)}`, "✉️", "E-mail"),
        share(`sms:${g.phone ?? ""}?&body=${encodeURIComponent(msg)}`, "💬", "SMS"),
        more)),
    h("a", { href: `${base}/invites`, class: "btn btn-primary btn-block" }, `Voir les réponses (${answered})`));
}

/* ---------- Aide intégrée : un paragraphe explicatif par page, et la page de bienvenue ----------
   Chaque page affiche en haut un encadré « À quoi sert cette page ? » que l'on peut replier ;
   le choix est mémorisé sur l'appareil. Les textes sont rassemblés ici pour être relus facilement. */
const HELP = {
  home: ["Votre accueil", [
    "En haut, votre prochain événement : sa photo, le temps restant, l'avancement de l'organisation, les tâches restantes, les invités confirmés et la part du budget financée. Touchez-le pour l'ouvrir.",
    "Dessous : des raccourcis (nouvel événement, inviter un proche, mes tâches, budget), les tâches qui vous sont confiées, vos autres événements et des idées « Préparer… ». Sur ordinateur, la colonne « Activité récente » résume les dernières nouvelles."]],
  families: ["Vos familles", [
    "Une famille est l'espace commun où vos proches se retrouvent. Chaque événement appartient à une famille, et seuls ses membres peuvent y être ajoutés.",
    "Vous pouvez appartenir à plusieurs familles (par exemple côté père et côté mère) et en créer une nouvelle ici."]],
  "family-members": ["Les membres de la famille", [
    "La liste des personnes qui ont rejoint la famille, avec leur rôle : le propriétaire (qui l'a créée), les administrateurs (qui invitent et gèrent les membres) et les membres.",
    "Pour faire entrer un proche, un administrateur crée un lien d'invitation et le lui envoie, par WhatsApp par exemple. Le lien est valable 7 jours."]],
  "family-events": ["Les événements de la famille", [
    "Les événements de cette famille auxquels vous participez. Un événement n'est visible que par ses participants : il peut exister d'autres événements que vous ne voyez pas.",
    "Tout membre peut créer un événement ; il en devient l'organisateur."]],
  "family-committees": ["Les comités", [
    "Un comité regroupe quelques participants autour d'une mission : accueil, décoration, restauration, logistique…",
    "Les comités se créent dans l'onglet « Participants » de chaque événement ; cette page les rassemble pour toute la famille."]],
  "family-invite": ["Inviter un proche", [
    "Créez un lien personnel, puis envoyez-le par WhatsApp ou copiez-le. La personne l'ouvre, crée son compte (ou se connecte) et rejoint la famille comme simple membre.",
    "Un lien sert à plusieurs personnes pendant 7 jours. Vous pouvez le désactiver à tout moment s'il a été transmis par erreur."]],
  member: ["Fiche d'un membre", [
    "Le rôle du membre dans la famille et sa date d'arrivée. Un administrateur peut changer son rôle ou le retirer ; le propriétaire ne peut être ni modifié ni retiré.",
    "Le numéro de téléphone de chacun reste privé : il n'est pas affiché ici."]],
  "new-event": ["Créer un événement", [
    "Cinq étapes : le type de cérémonie, le nom et la photo de couverture, la date et le lieu, le budget et le nombre d'invités prévus, puis les membres de la famille qui organiseront avec vous.",
    "Rien n'est définitif : tout se modifie ensuite. Vous en serez l'organisateur, et seuls les participants choisis verront l'événement."]],
  overview: ["Le tableau de bord de l'événement", [
    "L'essentiel en un coup d'œil : le nombre de jours avant le grand jour, l'avancement de l'organisation (tâches terminées), les invités confirmés, les tâches restantes, le budget et les contributions confirmées.",
    "Les onglets donnent accès au détail : Tâches, Budget, Invités (organisateurs) et Participants. L'organisateur modifie les informations avec « Modifier ».",
    "Plus bas : le programme heure par heure du jour J, les étapes franchies (badges qui se débloquent au fil de l'organisation) et « Save the date », une image à partager sur WhatsApp pour annoncer la date."]],
  tasks: ["Les tâches", [
    "La liste de tout ce qu'il reste à faire, avec son échéance, son responsable et son statut (À faire, En cours, Terminée). Cochez une tâche pour la terminer.",
    "L'organisateur crée et attribue les tâches ; il peut ajouter d'un clic une checklist adaptée à la cérémonie. Le responsable d'une tâche peut changer son statut. Les vues Calendrier et Kanban montrent les mêmes tâches autrement."]],
  calendar: ["Le calendrier", [
    "Les tâches placées à leur date d'échéance, mois par mois. Un point signale un jour avec des tâches, le jour de l'événement est en doré.",
    "Touchez un jour pour n'afficher que ses tâches ; touchez-le à nouveau pour revoir tout le mois."]],
  kanban: ["La vue Kanban", [
    "Les tâches rangées en trois colonnes : À faire, En cours, Terminée. Utilisez les boutons de chaque carte pour la faire passer d'une colonne à l'autre.",
    "Pratique pour voir d'un coup ce qui avance et ce qui bloque."]],
  roadmap: ["La feuille de route", [
    "Les tâches rangées par période avant le jour J : plus de 2 mois, 1 à 2 mois, le dernier mois, la dernière semaine, le jour J. Chaque période montre son avancement.",
    "Idéal pour voir si l'on est en avance ou en retard sur le calendrier de la cérémonie."]],
  "task-new": ["Nouvelle tâche", [
    "Donnez un titre clair, une échéance si possible et un responsable parmi les participants. Le responsable verra la tâche dans « Mes tâches » et pourra changer son statut."]],
  task: ["Détail d'une tâche", [
    "Tout sur une tâche : échéance, responsable, description et statut. Le responsable et l'organisateur changent le statut avec les trois boutons.",
    "Seul l'organisateur peut modifier ou supprimer la tâche."]],
  "budget-expenses": ["Le budget et les dépenses", [
    "L'anneau montre la part du budget déjà financée par les contributions confirmées, et d'où viennent ces fonds (hôtes, famille, amis, diaspora…). Dessous : contributions en attente, dépenses engagées, dépenses payées et reste à financer.",
    "Les dépenses (salle, traiteur, tenues…) sont visibles et modifiables par l'organisateur et le trésorier seulement. Un simple membre ne voit que les totaux et ses propres contributions."]],
  "budget-contributions": ["Les contributions", [
    "Chaque participant déclare ce qu'il donne : une promesse (« je compte donner ») ou un don déjà fait, en argent ou en nature (riz, chaises, transport…). Le trésorier confirme à réception.",
    "Bennoo ne gère aucun paiement : on donne comme d'habitude (espèces, Wave, Orange Money…), puis on déclare ici. Une contribution anonyme n'affiche son nom qu'au contributeur et au trésorier."]],
  expense: ["Une dépense", [
    "Indiquez le montant, la catégorie, le fournisseur et la date, puis si la dépense est déjà payée ou encore à payer. Elle compte aussitôt dans les dépenses engagées du budget."]],
  contribution: ["Votre contribution", [
    "Choisissez Argent ou En nature, le montant (ou une description et une valeur estimée), la provenance et où vous en êtes : promise ou déjà donnée.",
    "Cochez « anonymement » pour que seul le trésorier voie votre nom. Tant que le trésorier ne l'a pas confirmée, vous pouvez la modifier ou la retirer."]],
  gift: ["Don reçu d'un proche", [
    "Pour un proche qui n'a pas de compte Bennoo (un oncle, une famille de la diaspora…) : le trésorier enregistre directement son don, en argent ou en nature."]],
  guests: ["Les invités", [
    "Ajoutez chaque foyer invité avec son nombre de places. Chaque foyer reçoit un lien personnel ; il répond oui ou non, et combien de personnes viendront, sans créer de compte.",
    "Les compteurs se mettent à jour avec les réponses. La liste n'est visible que des organisateurs : les numéros de téléphone ne servent qu'à ouvrir WhatsApp."]],
  card: ["Le carton d'invitation", [
    "C'est ce que voient vos invités en ouvrant leur lien : qui invite, le nom de l'événement, la date, l'heure, le lieu et votre message.",
    "La date et le lieu suivent automatiquement l'événement : si vous les modifiez, le carton est mis à jour."]],
  share: ["Partager une invitation", [
    "Le lien personnel de ce foyer, son QR code (à scanner avec un téléphone) et des boutons pour l'envoyer par WhatsApp, e-mail ou SMS.",
    "Chaque lien est propre à un foyer : ne le publiez pas sur un groupe ouvert."]],
  participants: ["Les participants et les comités", [
    "Les membres de la famille qui organisent l'événement, avec leur rôle : organisateur (gère tout), trésorier (gère l'argent et confirme les contributions) ou membre (suit et participe).",
    "Seuls les participants voient l'événement. Dessous, l'organisateur peut créer des comités pour répartir les missions."]],
  edit: ["Modifier l'événement", [
    "Corrigez le nom, la date, le lieu, le budget, le nombre d'invités prévu ou la photo de couverture. Les participants voient aussitôt les changements, et le carton d'invitation suit."]],
  "my-tasks": ["Mes tâches", [
    "Les tâches qui vous sont confiées, dans tous vos événements à venir. « Toutes les tâches à faire » montre aussi celles des autres, pour avoir une vue d'ensemble."]],
  "my-budget": ["Le budget de mes événements", [
    "Pour chaque événement : la part du budget financée par les contributions confirmées et le reste à financer. Touchez un événement pour voir son budget en détail."]],
  settings: ["Paramètres", [
    "Votre profil, vos familles, ce que voient les autres membres, la langue et la déconnexion. « Guide de Bennoo » réaffiche la page de bienvenue."]],
  profile: ["Mon profil", [
    "Le nom affiché aux autres membres et votre téléphone, au format international (+221…, +33…). Le téléphone reste visible de vous seul."]],
  join: ["Rejoindre une famille", [
    "Un proche vous a invité. En rejoignant la famille, vous verrez ses membres et pourrez être ajouté à ses événements. Vous entrez comme simple membre."]],
  rsvp: ["Répondre à l'invitation", [
    "Dites aux organisateurs si vous serez présents, et combien de personnes viendront avec vous. Pas besoin de compte : ce lien vous est personnel.",
    "Vous pouvez revenir sur ce lien pour modifier votre réponse."]],
};

/** Quelle aide pour l'adresse affichée ? */
function helpKeyFor(path) {
  const p = path.split("/").filter(Boolean);
  const [head, , , t, sub] = p;
  if (!head) return "home";
  if (head === "familles") return "families";
  if (head === "famille") {
    const tab = p[2];
    return tab === "membre" ? "member" : tab === "evenements" ? "family-events" : tab === "comites" ? "family-committees" : tab === "inviter" ? "family-invite" : "family-members";
  }
  if (head === "nouvel-evenement") return "new-event";
  if (head === "evenement") {
    if (!t) return "overview";
    if (t === "taches") return sub === "calendrier" ? "calendar" : sub === "kanban" ? "kanban" : sub === "etapes" ? "roadmap" : sub === "nouvelle" ? "task-new" : "tasks";
    if (t === "tache") return "task";
    if (t === "budget") return sub === "contributions" ? "budget-contributions" : sub === "depense" ? "expense" : ["contribuer", "contribution"].includes(sub) ? "contribution" : sub === "don-recu" ? "gift" : "budget-expenses";
    if (t === "invites") return sub === "carton" ? "card" : sub === "partager" ? "share" : "guests";
    if (t === "participants") return "participants";
    if (t === "modifier") return "edit";
  }
  return { taches: "my-tasks", budget: "my-budget", plus: "settings", profil: "profile", rejoindre: "join", rsvp: "rsvp" }[head] ?? null;
}

// Aide ouverte à la première visite de la page, repliée ensuite (sauf si la personne la rouvre).
const helpStore = {
  closed(key) {
    try {
      const v = localStorage.getItem(`bennoo:help:${key}`);
      if (v === null) { localStorage.setItem(`bennoo:help:${key}`, "seen"); return false; }
      return v !== "open";
    } catch { return false; }
  },
  set(key, closed) { try { localStorage.setItem(`bennoo:help:${key}`, closed ? "closed" : "open"); } catch { /* stockage indisponible */ } },
  reset() { try { Object.keys(localStorage).filter((k) => k.startsWith("bennoo:help:")).forEach((k) => localStorage.removeItem(k)); } catch { /* idem */ } },
};

function helpBox(key) {
  const entry = HELP[key];
  if (!entry) return null;
  const [title, paragraphs] = entry;
  const box = h("details", { class: "help-box", open: !helpStore.closed(key) },
    h("summary", { "aria-label": `À quoi sert cette page ? ${title}` }, h("span", { class: "help-ico", "aria-hidden": "true" }, "i"), h("span", {}, `${title} : à quoi sert cette page ?`)),
    h("div", { class: "help-body" }, paragraphs.map((t) => h("p", {}, t))));
  box.addEventListener("toggle", () => helpStore.set(key, !box.open));
  return box;
}

/** Place l'aide juste sous l'en-tête de la page (titre, bandeau d'événement et onglets). */
function insertHelp(node, path) {
  const box = helpBox(helpKeyFor(path));
  if (!box || !node.querySelector) return;
  const anchor = node.querySelector(":scope > nav.tabs") ?? node.querySelector(":scope > .screen-head, :scope > .hello, :scope > .family-head, :scope > .auth-brand, :scope > .rubric-banner");
  if (anchor) anchor.after(box); else node.prepend(box);
}

// ─── Page de bienvenue : s'affiche une fois après la première connexion ──
const welcomeSeen = {
  get(uid) { try { return localStorage.getItem(`bennoo:welcome:${uid}`) === "1"; } catch { return true; } },
  set(uid) { try { localStorage.setItem(`bennoo:welcome:${uid}`, "1"); } catch { /* idem */ } },
};

async function welcomeScreen() {
  const [profile, families] = await Promise.all([data.getProfile(), data.listMyFamilies()]);
  welcomeSeen.set(auth.currentUser.uid);
  const name = firstName(profile?.displayName ?? auth.currentUser.displayName ?? "");
  const step = (n, ico, title, text) => h("li", { class: "welcome-step" }, h("span", { class: "n", "aria-hidden": "true" }, String(n)),
    h("div", {}, h("h3", {}, `${ico} ${title}`), h("p", { class: "muted" }, text)));
  const reset = h("button", { type: "button", class: "link-btn" }, "Réafficher les aides repliées sur toutes les pages");
  reset.addEventListener("click", () => { helpStore.reset(); toast("Les aides sont de nouveau affichées"); });
  const hero = photoBackground(h("section", { class: "welcome-hero" },
    h("img", { src: "images/logo.svg", alt: "", width: 64, height: 64 }),
    h("h1", {}, name ? `Bienvenue sur Bennoo, ${name} !` : "Bienvenue sur Bennoo !"),
    h("p", {}, "Ensemble pour vos moments précieux")), "womenTrad", 1200, 700,
    "linear-gradient(180deg, rgba(76,29,149,.55), rgba(30,15,69,.9))");
  const node = bare(
    hero,
    h("section", { class: "card form" },
      h("h2", {}, "Le but de Bennoo"),
      h("p", {}, "Un mariage, un baptême, une communion, un anniversaire, une cérémonie religieuse ou une réunion de famille demandent beaucoup d'organisation, souvent entre Dakar, les régions et la diaspora. Les informations se perdent dans les groupes WhatsApp, les cahiers et les appels."),
      h("p", {}, "Bennoo réunit tout au même endroit, pour toute la famille : qui fait quoi et pour quand, combien coûte l'événement et qui y contribue, qui est invité et qui a répondu. Chacun voit où en est la préparation, où qu'il se trouve.")),
    h("section", {},
      h("h2", {}, "Comment ça marche"),
      h("ol", { class: "welcome-steps" },
        step(1, "👨‍👩‍👧", "Créez ou rejoignez votre famille", "C'est l'espace commun de vos proches. Invitez-les avec un lien envoyé par WhatsApp."),
        step(2, "💍", "Créez un événement", "Choisissez la cérémonie, la date, le lieu et le budget. Désignez les participants : organisateurs, trésorier, membres."),
        step(3, "✅", "Répartissez les tâches", "Une checklist adaptée à la cérémonie est proposée. Chacun suit les tâches qui lui sont confiées."),
        step(4, "💰", "Suivez le budget et les contributions", "Les dépenses, les dons promis et reçus, en argent ou en nature, et le reste à financer. Le trésorier confirme."),
        step(5, "💌", "Invitez et recevez les réponses", "Un carton d'invitation et un lien personnel par foyer : vos invités répondent sans créer de compte."))),
    h("section", { class: "card form" },
      h("h2", {}, "Votre vie privée"),
      h("ul", { class: "welcome-list" },
        h("li", {}, "Un événement n'est visible que de ses participants, même au sein de la famille."),
        h("li", {}, "Un simple membre voit les totaux du budget, pas le détail des dons de chacun."),
        h("li", {}, "Une contribution peut être anonyme : seul le trésorier connaît le nom."),
        h("li", {}, "Aucun paiement ne passe par Bennoo, et vos données ne sont ni vendues ni utilisées pour de la publicité."))),
    h("p", { class: "muted small" }, "Sur chaque page, l'encadré « À quoi sert cette page ? » explique ce que vous pouvez y faire. Vous pouvez le replier, et revoir ce guide depuis Plus → Guide de Bennoo."),
    reset,
    families.length
      ? h("a", { href: "#/", class: "btn btn-primary btn-block" }, "Aller à mon accueil")
      : h("a", { href: "#/familles", class: "btn btn-primary btn-block" }, "Commencer : créer ma famille"),
  );
  return { node, title: "Bienvenue" };
}

/* ---------- Étape 5 : application installable, pages légales, suppression de compte ---------- */

// ─── Installation sur l'écran d'accueil (PWA) ───────────────────────────
let installPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installPrompt = e; });
window.addEventListener("appinstalled", () => { installPrompt = null; toast("Bennoo est installé sur cet appareil"); });
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker non enregistré :", err)));
}
const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function installScreen() {
  const steps = (items) => h("ol", { class: "install-steps" }, items.map((t) => h("li", {}, t)));
  let main;
  if (isInstalled()) {
    main = h("section", { class: "card form" }, h("h2", {}, "✅ Bennoo est déjà installé"), h("p", { class: "muted" }, "Vous utilisez l'application installée : elle s'ouvre depuis l'icône Bennoo de votre écran d'accueil."));
  } else if (installPrompt) {
    const b = h("button", { type: "button", class: "btn btn-primary btn-block" }, "Installer Bennoo");
    b.addEventListener("click", async () => {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      installPrompt = null;
      toast(outcome === "accepted" ? "Installation en cours…" : "Installation annulée");
    });
    main = h("section", { class: "card form" }, h("h2", {}, "Installer en un clic"), h("p", { class: "muted" }, "Votre navigateur peut ajouter Bennoo à votre écran d'accueil."), b);
  } else if (isIOS()) {
    main = h("section", { class: "card form" }, h("h2", {}, "Sur iPhone ou iPad (Safari)"),
      steps(["Ouvrez Bennoo dans Safari (pas dans WhatsApp ni Instagram).", "Touchez le bouton Partager (le carré avec une flèche vers le haut), en bas de l'écran.",
        "Faites défiler et choisissez « Sur l'écran d'accueil ».", "Touchez « Ajouter » : l'icône Bennoo apparaît avec vos applications."]));
  } else {
    main = h("section", { class: "card form" },
      h("h2", {}, "Sur Android (Chrome)"), steps(["Touchez le menu ⋮ en haut à droite.", "Choisissez « Installer l'application » (ou « Ajouter à l'écran d'accueil »).", "Confirmez : l'icône Bennoo apparaît avec vos applications."]),
      h("h2", {}, "Sur ordinateur (Chrome ou Edge)"), steps(["Cliquez sur l'icône d'installation à droite de la barre d'adresse (un écran avec une flèche).", "Confirmez « Installer »."]));
  }
  const node = screen(header("Installer l'application", "#/plus"),
    h("section", { class: "card install-hero" }, h("img", { src: "images/icon-192.png", alt: "", width: 72, height: 72 }),
      h("div", {}, h("h2", {}, "Bennoo sur votre écran d'accueil"), h("p", { class: "muted" }, "Une icône comme une vraie application, en plein écran, qui s'ouvre vite même avec un réseau faible. Rien à télécharger depuis un magasin d'applications."))),
    main,
    h("p", { class: "muted small" }, "Vos données restent en ligne et synchronisées : vous retrouvez les mêmes informations sur le téléphone et l'ordinateur."));
  return { node, title: "Installer", nav: "more" };
}

// ─── Pages légales (version de travail, à faire valider) ─────────────────
const TODO = (label) => h("mark", { class: "todo" }, `[à compléter : ${label}]`);
const LEGAL = {
  cgu: ["Conditions d'utilisation", () => [
    h("p", { class: "muted small" }, "Version du 5 novembre 2026 — phase de test."),
    h("h2", {}, "1. Objet"), h("p", {}, "Bennoo est une application web qui aide les familles à organiser ensemble leurs événements (mariages, baptêmes, communions, anniversaires, cérémonies religieuses ou traditionnelles, réunions de famille) : tâches, budget, contributions, invités. Les présentes conditions encadrent son utilisation."),
    h("h2", {}, "2. Accès"), h("p", {}, "L'accès est gratuit pendant la phase de test. Il nécessite un compte, créé avec une adresse email ou un compte Google. Les invités qui reçoivent un lien de réponse n'ont pas besoin de compte. L'utilisation est réservée aux personnes de 16 ans et plus, ou plus jeunes avec l'accord d'un parent."),
    h("h2", {}, "3. Votre compte"), h("p", {}, "Vous êtes responsable de la confidentialité de votre mot de passe et des actions faites avec votre compte. Vous pouvez modifier votre profil et supprimer votre compte à tout moment depuis Plus → Supprimer mon compte."),
    h("h2", {}, "4. Familles, rôles et contenus"), h("p", {}, "Chaque famille et chaque événement sont gérés par leurs membres selon leurs rôles (propriétaire, administrateur, organisateur, trésorier, membre). Vous êtes responsable des informations que vous ajoutez (noms, téléphones d'invités, montants…) et vous vous engagez à n'y mettre que des informations exactes, et des données de tiers avec leur accord. Tout contenu illicite, injurieux ou portant atteinte à la vie privée est interdit."),
    h("h2", {}, "5. Pas de paiement"), h("p", {}, "Bennoo ne traite aucun paiement. Les contributions sont déclarées par les membres et confirmées par le trésorier ; les échanges d'argent se font en dehors de l'application, sous la seule responsabilité des personnes concernées."),
    h("h2", {}, "6. Disponibilité"), h("p", {}, "Le service est fourni « en l'état » pendant la phase de test, sans garantie de disponibilité permanente. Pensez à garder vos informations importantes (contrats, reçus) par ailleurs."),
    h("h2", {}, "7. Suspension"), h("p", {}, "En cas de non-respect de ces conditions, l'éditeur peut suspendre un compte, après en avoir informé la personne sauf urgence."),
    h("h2", {}, "8. Modification et droit applicable"), h("p", {}, "Ces conditions peuvent évoluer ; la date de version est indiquée en haut. Droit applicable et juridiction compétente : ", TODO("droit sénégalais ou français, à préciser"), "."),
    h("h2", {}, "9. Contact"), h("p", {}, "Pour toute question : ", TODO("adresse email de contact"), "."),
  ]],
  confidentialite: ["Politique de confidentialité", () => [
    h("p", { class: "muted small" }, "Version du 5 novembre 2026 — phase de test."),
    h("h2", {}, "Responsable du traitement"), h("p", {}, TODO("nom de la personne ou de la société qui édite Bennoo, adresse, email"), "."),
    h("h2", {}, "Données collectées"),
    h("ul", {},
      h("li", {}, "Compte : adresse email, nom affiché, et le fait que l'email est vérifié (géré par Firebase Authentication ; les mots de passe ne sont jamais visibles)."),
      h("li", {}, "Profil : téléphone, facultatif, visible de vous seul."),
      h("li", {}, "Familles et événements : noms, rôles, dates, lieux, tâches, dépenses, contributions (montant, provenance, statut), comités."),
      h("li", {}, "Invités : nom du foyer, nombre de places, téléphone facultatif, réponse et petit mot.")),
    h("h2", {}, "Pourquoi"), h("p", {}, "Uniquement pour faire fonctionner l'application : afficher à chaque membre ce que son rôle lui permet de voir, calculer l'avancement et les totaux, envoyer les liens d'invitation. Aucune publicité, aucune revente, aucun profilage. Base légale : l'exécution du service que vous demandez."),
    h("h2", {}, "Qui voit vos données"),
    h("ul", {},
      h("li", {}, "Un événement n'est visible que de ses participants ; un simple membre ne voit que les totaux du budget ; une contribution anonyme n'est nominative que pour le contributeur et le trésorier ; la liste des invités est réservée aux organisateurs."),
      h("li", {}, "Hébergement : Google Firebase (Google Ireland Ltd), base de données dans une région européenne. Site : GitHub Pages (GitHub Inc.)."),
      h("li", {}, "Services chargés par votre navigateur : photos d'illustration (Unsplash), carte du lieu (Google Maps, seulement si vous cliquez), polices (Google Fonts). Ils voient votre adresse IP, comme tout site web.")),
    h("h2", {}, "Durée de conservation"), h("p", {}, "Tant que votre compte existe. À la suppression du compte, votre profil, vos appartenances et vos participations sont effacés ; votre nom est remplacé par « Compte supprimé » là où il doit rester pour la cohérence d'une famille ou d'un événement (par exemple une contribution confirmée dans les comptes du trésorier)."),
    h("h2", {}, "Stockage sur votre appareil"), h("p", {}, "Bennoo garde sur votre appareil votre session de connexion et quelques préférences (aides repliées, page de bienvenue vue). Pas de cookie publicitaire ni de mesure d'audience."),
    h("h2", {}, "Vos droits"), h("p", {}, "Accès, rectification, suppression (directement dans l'application), opposition, portabilité : écrivez à ", TODO("adresse email de contact"), ". Vous pouvez aussi saisir la CDP (Commission de protection des données personnelles, Sénégal) ou la CNIL (France)."),
    h("h2", {}, "Sécurité"), h("p", {}, "Les accès sont contrôlés par des règles de sécurité appliquées par Firebase lui-même ; les liens d'invitation utilisent des jetons aléatoires impossibles à deviner ; les connexions sont chiffrées (HTTPS)."),
  ]],
  mentions: ["Mentions légales", () => [
    h("h2", {}, "Éditeur"), h("p", {}, TODO("nom ou raison sociale, forme juridique, adresse, numéro d'immatriculation (NINEA / SIREN) le cas échéant"), "."),
    h("h2", {}, "Directeur de la publication"), h("p", {}, TODO("nom"), "."),
    h("h2", {}, "Contact"), h("p", {}, TODO("adresse email"), "."),
    h("h2", {}, "Hébergement"),
    h("ul", {},
      h("li", {}, "Site : GitHub Pages — GitHub Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis."),
      h("li", {}, "Données et connexion : Google Firebase — Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irlande.")),
    h("h2", {}, "Crédits photos"), h("p", {}, "Photos d'illustration : Unsplash (licence Unsplash)."),
    h("ul", { class: "credits" }, Object.values(PHOTOS).map(([, author, what]) => h("li", {}, `${what} : ${author}`))),
  ]],
};

function legalScreen(which = "cgu") {
  const key = LEGAL[which] ? which : "cgu";
  const [title, body] = LEGAL[key];
  const tabs = h("div", { class: "tabs", role: "tablist" }, Object.entries(LEGAL).map(([k, [t]]) =>
    h("a", { href: `#/conditions/${k}`, role: "tab", "aria-selected": String(k === key), "aria-label": t }, { cgu: "Conditions", confidentialite: "Confidentialité", mentions: "Mentions" }[k])));
  const node = (currentUser ? screen : bare)(header(title, currentUser ? "#/plus" : "#/"),
    h("p", { class: "alert alert-info" }, "Version de travail de la phase de test, à faire valider juridiquement avant l'ouverture au public. Les mentions surlignées sont à compléter."),
    tabs, h("section", { class: "card form legal" }, body()));
  return { node, title, nav: currentUser ? "more" : null };
}

// ─── Transmettre un rôle avant de partir ─────────────────────────────────
/** Le propriétaire transmet la famille à un autre membre (il devient administrateur). */
async function transferOwnership(fid, toUid) {
  const me = auth.currentUser.uid;
  const members = db.collection("families").doc(fid).collection("members");
  const batch = db.batch();
  batch.update(members.doc(me), { role: "admin", transferTo: toUid });
  batch.update(members.doc(toUid), { role: "owner" });
  await batch.commit();
}
/** Un organisateur quitte l'événement en laissant la main à un autre organisateur. */
async function leaveEvent(fid, eid, handoverTo) {
  const me = auth.currentUser.uid;
  const ref = db.collection("families").doc(fid).collection("events").doc(eid).collection("participants").doc(me);
  if (handoverTo) await ref.update({ role: "member", handoverTo });
  await ref.delete();
}

// ─── Suppression du compte ───────────────────────────────────────────────
const DELETED_NAME = "Compte supprimé";

/** Ce que la suppression va faire, et ce qui la bloque (avec la marche à suivre). */
async function deletionPlan() {
  const me = auth.currentUser.uid;
  const [families, events] = await Promise.all([data.listMyFamilies(), data.listMyEvents()]);
  const plan = { blockers: [], families: [], events: [] };
  for (const f of families) {
    const members = await data.listFamilyMembers(f.id);
    const others = members.filter((m) => m.uid !== me);
    if (f.myRole === "owner" && others.length) plan.blockers.push({ text: `Vous êtes propriétaire de « ${f.name} », qui a d'autres membres : transmettez-la d'abord à l'un d'eux.`, href: `#/famille/${enc(f.id)}/membres`, action: "Ouvrir les membres" });
    plan.families.push({ ...f, alone: others.length === 0 });
  }
  for (const e of events) {
    const parts = await data.listParticipants(e.familyId, e.id);
    const others = parts.filter((p) => p.uid !== me);
    const otherOrganizer = others.find((p) => p.role === "organizer");
    if (e.myRole === "organizer" && others.length && !otherOrganizer) plan.blockers.push({ text: `Vous êtes le seul organisateur de « ${e.title} » : nommez un autre organisateur parmi les participants.`, href: `#/evenement/${enc(e.familyId)}/${enc(e.id)}/participants`, action: "Ouvrir les participants" });
    plan.events.push({ ...e, alone: others.length === 0, handoverTo: otherOrganizer?.uid ?? null });
  }
  return plan;
}

async function deleteAccount(plan, onStep) {
  const me = auth.currentUser.uid;
  const fam = (fid) => db.collection("families").doc(fid);
  for (const e of plan.events) {
    onStep(`Événement « ${e.title} »…`);
    const evRef = fam(e.familyId).collection("events").doc(e.id);
    for (const c of await orga.listMyContributions(e.familyId, e.id)) {
      if (c.status !== "confirmed") await orga.deleteMyContribution(e.familyId, e.id, c.id);
      else { // confirmée : elle reste dans les comptes du trésorier, sans lien vers votre compte
        await evRef.collection("contributions").doc(c.id).collection("private").doc("identity").delete().catch(() => {});
        await evRef.collection("participants").doc(me).collection("myContributions").doc(c.id).delete().catch(() => {});
      }
    }
    if (e.myRole !== "organizer") await leaveEvent(e.familyId, e.id, null);
    else if (e.handoverTo) await leaveEvent(e.familyId, e.id, e.handoverTo);
    else await evRef.collection("participants").doc(me).update({ displayName: DELETED_NAME }); // seul participant : l'événement n'est plus visible de personne
  }
  for (const f of plan.families) {
    onStep(`Famille « ${f.name} »…`);
    const ref = fam(f.id).collection("members").doc(me);
    if (f.myRole !== "owner") await ref.delete();
    else await ref.update({ displayName: DELETED_NAME }); // seul membre : la famille reste vide
  }
  onStep("Profil…");
  await db.collection("users").doc(me).delete();
  onStep("Compte de connexion…");
  await auth.currentUser.delete();
}

async function deleteAccountScreen() {
  const plan = await deletionPlan();
  const status = h("div", { role: "status", "aria-live": "polite" });
  let body;
  if (plan.blockers.length) {
    body = h("section", { class: "card form" }, h("h2", {}, "Avant de supprimer votre compte"),
      h("p", { class: "muted" }, "Pour que vos familles et vos événements gardent un responsable, il reste à faire :"),
      h("ul", { class: "list blockers" }, plan.blockers.map((b) => h("li", {}, h("p", {}, b.text), h("a", { href: b.href, class: "btn btn-sm" }, b.action)))),
      h("p", { class: "muted small" }, "Revenez ensuite sur cette page."));
  } else {
    const form = h("form", { class: "card form", novalidate: true },
      h("h2", {}, "Supprimer définitivement mon compte"),
      h("ul", {},
        h("li", {}, "Votre profil et votre compte de connexion sont effacés."),
        h("li", {}, `Vous quittez ${plural(plan.families.length, "famille")} et ${plural(plan.events.length, "événement")}.`),
        h("li", {}, "Vos contributions non confirmées sont retirées ; les contributions déjà confirmées restent dans les comptes du trésorier, sans lien avec votre compte."),
        h("li", {}, `Là où votre nom doit rester (famille ou événement dont vous êtes le seul membre), il est remplacé par « ${DELETED_NAME} ».`)),
      h("p", { class: "alert alert-error" }, "C'est définitif : rien ne pourra être récupéré."),
      field("Pour confirmer, tapez SUPPRIMER", { name: "confirm", class: "input", autocomplete: "off" }),
      h("button", { type: "submit", class: "btn btn-block danger-btn" }, "Supprimer mon compte"), status);
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      showFormError(form, null);
      if (values(form).confirm.trim().toUpperCase() !== "SUPPRIMER") { showFormError(form, "Tapez SUPPRIMER pour confirmer."); return; }
      await withBusy(form.querySelector("button[type=submit]"), async () => {
        try {
          await deleteAccount(plan, (t) => { status.textContent = t; });
          location.hash = "#/";
          toast("Votre compte a été supprimé");
        } catch (err) {
          status.textContent = "";
          showFormError(form, err?.code === "auth/requires-recent-login"
            ? "Vos données ont été effacées, mais Google ou Firebase demande une connexion récente pour supprimer le compte lui-même : déconnectez-vous, reconnectez-vous, puis revenez sur cette page."
            : errMsg(err));
        }
      });
    });
    body = form;
  }
  return { node: screen(header("Supprimer mon compte", "#/plus"), body), title: "Supprimer mon compte", nav: "more" };
}

/* ---------- Fonctionnalités originales (06/11/2026) : compte à rebours vivant, étapes franchies,
   « Save the date » à partager, programme du jour J, feuille de route, inspirations ---------- */

// ─── Compte à rebours vivant ─────────────────────────────────────────────
function liveCountdown(event) {
  if (!event.startsAt) return null;
  const parts = { d: h("strong", {}), h: h("strong", {}), m: h("strong", {}), s: h("strong", {}) };
  const unit = (el, label) => h("span", { class: "cd-unit" }, el, h("span", {}, label));
  const caption = h("p", { class: "cd-caption" });
  const box = photoBackground(h("section", { class: "countdown", "aria-label": "Compte à rebours avant l'événement" },
    h("p", { class: "cd-title" }, "Le grand jour approche"),
    h("div", { class: "cd-row", "aria-hidden": "true" }, unit(parts.d, "jours"), unit(parts.h, "heures"), unit(parts.m, "min"), unit(parts.s, "s")),
    caption), coverOf(event), 1000, 420, "linear-gradient(135deg, rgba(76,29,149,.88), rgba(30,15,69,.82))");
  const tick = () => {
    if (!box.isConnected && box.dataset.started) return clearInterval(timer);
    box.dataset.started = "1";
    let ms = event.startsAt.getTime() - Date.now();
    if (ms <= 0) {
      box.querySelector(".cd-row").replaceChildren(h("span", { class: "cd-today" }, daysUntil(event.startsAt) === 0 ? "C'est aujourd'hui ! 🎉" : "Événement passé"));
      caption.textContent = formatDate(event.startsAt);
      return clearInterval(timer);
    }
    const d = Math.floor(ms / 86400000); ms -= d * 86400000;
    const hh = Math.floor(ms / 3600000); ms -= hh * 3600000;
    const mm = Math.floor(ms / 60000); ms -= mm * 60000;
    parts.d.textContent = d; parts.h.textContent = String(hh).padStart(2, "0"); parts.m.textContent = String(mm).padStart(2, "0"); parts.s.textContent = String(Math.floor(ms / 1000)).padStart(2, "0");
    caption.textContent = `${formatDate(event.startsAt)} à ${event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}${event.city ? ` · ${event.city}` : ""}`;
  };
  const timer = setInterval(tick, 1000);
  tick();
  return box;
}

// ─── Étapes franchies : badges calculés à partir des vraies données ─────
function milestones(event, tasks, summary, hasInvitation) {
  const done = tasks.filter((t) => t.status === "done").length;
  const progress = tasks.length ? done / tasks.length : 0;
  const b = summary.budget, g = summary.guests;
  const list = [
    ["🎬", "C'est parti", "Événement créé", true],
    ["📅", "Date fixée", "La date est choisie", Boolean(event.startsAt)],
    ["📝", "Plan d'action", "Au moins 5 tâches prévues", tasks.length >= 5],
    ["✅", "Premier pas", "Une tâche terminée", done >= 1],
    ["🌓", "À mi-chemin", "La moitié des tâches faites", progress >= 0.5],
    ["🏁", "Tout est prêt", "Toutes les tâches terminées", tasks.length > 0 && done === tasks.length],
    ["🤝", "Solidarité", "Première contribution confirmée", Boolean(b && b.contributors >= 1)],
    ["💰", "À moitié financé", "50 % du budget couvert", Boolean(b && event.budgetPlanned && b.confirmed >= event.budgetPlanned / 2)],
    ["💌", "Invitations prêtes", "Carton publié", hasInvitation],
    ["🎉", "Ils viennent !", "Premiers invités confirmés", Boolean(g && g.attending >= 1)],
  ];
  const got = list.filter((x) => x[3]).length;
  return h("section", { class: "card" },
    h("div", { class: "section-head" }, h("h2", {}, "Étapes franchies"), h("span", { class: "chip chip-gold" }, `${got} / ${list.length}`)),
    h("ul", { class: "badges" }, list.map(([ico, title, sub, ok]) => h("li", { class: ok ? "on" : "", title: sub },
      h("span", { class: "b-ico", "aria-hidden": "true" }, ico), h("strong", {}, title), h("span", {}, ok ? sub : `À venir : ${sub.toLowerCase()}`)))));
}

// ─── « Save the date » : une image à partager sur WhatsApp ───────────────
async function makeSaveTheDate(event, hosts) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const img = await new Promise((resolve) => {
    const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => resolve(i); i.onerror = () => resolve(null);
    i.src = photoUrl(coverOf(event), W, H);
  });
  if (img) x.drawImage(img, 0, 0, W, H);
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(46,16,101,.55)"); grad.addColorStop(.5, "rgba(46,16,101,.72)"); grad.addColorStop(1, "rgba(30,15,69,.95)");
  x.fillStyle = grad; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(240,195,90,.85)"; x.lineWidth = 6; x.strokeRect(48, 48, W - 96, H - 96);
  x.lineWidth = 2; x.strokeRect(66, 66, W - 132, H - 132);
  await document.fonts?.ready;
  x.textAlign = "center"; x.fillStyle = "#fbe7b5";
  x.font = "600 44px Poppins, sans-serif"; x.fillText("SAVE THE DATE", W / 2, 230);
  x.fillStyle = "#f0c35a"; x.font = "italic 92px Georgia, serif";
  wrapText(x, hosts || event.title, W / 2, 400, W - 220, 104);
  x.fillStyle = "#ffffff"; x.font = "500 40px Poppins, sans-serif";
  x.fillText(EVENT_TYPES[event.type], W / 2, 640);
  if (event.startsAt) {
    x.fillStyle = "#f0c35a"; x.font = "800 220px Poppins, sans-serif"; x.fillText(String(event.startsAt.getDate()), W / 2, 900);
    x.fillStyle = "#ffffff"; x.font = "700 64px Poppins, sans-serif";
    x.fillText(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(event.startsAt).toUpperCase(), W / 2, 1000);
  } else {
    x.fillStyle = "#ffffff"; x.font = "700 64px Poppins, sans-serif"; x.fillText("Date à venir", W / 2, 940);
  }
  if (event.city) { x.fillStyle = "#ede9fe"; x.font = "500 46px Poppins, sans-serif"; x.fillText(event.city, W / 2, 1090); }
  x.fillStyle = "rgba(255,255,255,.75)"; x.font = "500 30px Poppins, sans-serif"; x.fillText("Invitation à suivre · organisé avec Bennoo", W / 2, 1220);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.9));
}
function wrapText(x, text, cx, y, maxW, lh) {
  const words = String(text).split(/\s+/); let line = ""; const lines = [];
  for (const w of words) { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  lines.push(line);
  lines.slice(0, 3).forEach((l, i) => x.fillText(l, cx, y + i * lh));
}
function saveTheDateCard(ctx, invitation) {
  const { event } = ctx;
  const preview = h("div", { class: "std-preview" }, h("p", { class: "muted small" }, "Une image à partager sur WhatsApp ou en statut, avec la photo de couverture, la date et la ville."));
  const make = h("button", { type: "button", class: "btn btn-primary btn-block" }, "✨ Créer mon « Save the date »");
  make.addEventListener("click", () => withBusy(make, async () => {
    const blob = await makeSaveTheDate(event, invitation?.hosts);
    if (!blob) { toast("Image impossible à créer sur ce navigateur."); return; }
    const url = URL.createObjectURL(blob);
    const file = new File([blob], "save-the-date-bennoo.jpg", { type: "image/jpeg" });
    const share = h("button", { type: "button", class: "btn btn-primary btn-sm" }, "Partager");
    share.addEventListener("click", async () => {
      try {
        if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: event.title, text: `Save the date : ${event.title}` });
        else toast("Partage direct non disponible : téléchargez l'image puis envoyez-la.");
      } catch { /* partage annulé */ }
    });
    preview.replaceChildren(h("img", { src: url, alt: `Save the date : ${event.title}`, class: "std-img" }),
      h("div", { class: "row-actions" }, share, h("a", { href: url, download: "save-the-date-bennoo.jpg", class: "btn btn-sm" }, "Télécharger")));
  }));
  return h("section", { class: "card form" }, h("h2", {}, "Annoncer la date"), preview, make);
}

// ─── Programme du jour J (planche 6) ─────────────────────────────────────
const progRef = (fid, eid) => db.collection("families").doc(fid).collection("events").doc(eid).collection("programme");
async function listProgramme(fid, eid) {
  const s = await progRef(fid, eid).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.time.localeCompare(b.time));
}
async function programmeSection(ctx) {
  const { fid, eid, isOrganizer } = ctx;
  const items = await listProgramme(fid, eid).catch(() => []);
  const list = h("ol", { class: "timeline" }, items.map((p) => {
    let del = null;
    if (isOrganizer) {
      del = h("button", { type: "button", class: "link-btn small", "aria-label": `Retirer ${p.title}` }, "Retirer");
      del.addEventListener("click", async () => { try { await progRef(fid, eid).doc(p.id).delete(); reload(); } catch (err) { toast(errMsg(err)); } });
    }
    return h("li", {}, h("span", { class: "tl-time" }, p.time.replace(":", " h ")),
      h("div", { class: "tl-body" }, h("strong", {}, p.title), p.place ? h("span", { class: "muted small" }, `📍 ${p.place}`) : null), del);
  }));
  let form = null;
  if (isOrganizer) {
    form = h("form", { class: "prog-form", novalidate: true },
      h("input", { name: "time", type: "time", class: "input", required: true, "aria-label": "Heure" }),
      h("input", { name: "title", class: "input", maxlength: 80, required: true, placeholder: "Ex. Accueil des invités", "aria-label": "Moment" }),
      h("input", { name: "place", class: "input", maxlength: 80, placeholder: "Lieu (facultatif)", "aria-label": "Lieu" }),
      h("button", { type: "submit", class: "btn btn-primary btn-sm" }, "Ajouter"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values(form);
      const title = v.title.replace(/\s+/g, " ").trim();
      if (!/^\d{2}:\d{2}$/.test(v.time) || !title) { toast("Indiquez une heure et un moment."); return; }
      await withBusy(form.querySelector("button"), async () => {
        try { await progRef(fid, eid).add({ time: v.time, title, place: v.place.trim() || null, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() }); reload(); } catch (err) { toast(errMsg(err)); }
      });
    });
  }
  return h("section", { class: "card form" },
    h("div", { class: "section-head" }, h("h2", {}, "Programme du jour J"), items.length ? h("span", { class: "chip chip-violet" }, plural(items.length, "moment")) : null),
    items.length ? list : h("p", { class: "muted small" }, isOrganizer ? "Déroulez la journée heure par heure : accueil, cérémonie, repas, sabar… Tous les participants le verront." : "L'organisateur n'a pas encore établi le programme."),
    form);
}

// ─── Feuille de route : les tâches par période avant le jour J ──────────
function roadmap(ctx, tasks) {
  const { event } = ctx;
  if (!event.startsAt) return h("div", { class: "card empty" }, "La feuille de route apparaît dès que la date de l'événement est fixée.");
  const phases = [
    ["Plus de 2 mois avant", "🌱", (d) => d > 60], ["1 à 2 mois avant", "📋", (d) => d > 30 && d <= 60],
    ["Le dernier mois", "⏳", (d) => d > 7 && d <= 30], ["La dernière semaine", "🔥", (d) => d > 0 && d <= 7],
    ["Le jour J et après", "🎉", (d) => d <= 0],
  ];
  const before = (t) => Math.round((event.startsAt - t.dueAt) / 86400000);
  const blocks = phases.map(([title, ico, test]) => {
    const list = tasks.filter((t) => t.dueAt && test(before(t)));
    if (!list.length) return null;
    const done = list.filter((t) => t.status === "done").length;
    const bar = h("div", { class: "bar" }, h("span", {})); bar.firstChild.style.width = `${pct(done, list.length)}%`;
    return h("section", { class: `phase${done === list.length ? " complete" : ""}` },
      h("div", { class: "phase-head" }, h("span", { class: "phase-ico", "aria-hidden": "true" }, ico),
        h("div", { class: "grow" }, h("h3", {}, title), h("span", { class: "muted small" }, `${done} / ${list.length} terminée${done > 1 ? "s" : ""}`)), bar),
      h("ul", { class: "list" }, list.map((t) => taskItem(ctx, t))));
  }).filter(Boolean);
  const noDate = tasks.filter((t) => !t.dueAt);
  return h("div", { class: "roadmap" }, blocks.length ? blocks : h("div", { class: "card empty" }, "Aucune tâche avec une échéance."),
    noDate.length ? h("p", { class: "muted small" }, `${plural(noDate.length, "tâche")} sans échéance (visibles dans la liste).`) : null);
}

// ─── Inspirations : préparer un événement à partir d'une photo ───────────
function inspirations() {
  const items = [["WEDDING", "Un mariage"], ["NAMING_CEREMONY", "Un baptême"], ["BIRTHDAY", "Un anniversaire"], ["FAMILY_REUNION", "Une réunion de famille"],
    ["RELIGIOUS_CEREMONY", "Une cérémonie religieuse"], ["TRADITIONAL_CEREMONY", "Une cérémonie traditionnelle"], ["COMMUNION", "Une communion"]];
  return h("section", { class: "inspire" },
    h("div", { class: "section-head" }, h("h2", {}, "Préparer…"), h("span", { class: "muted small" }, "checklist adaptée incluse")),
    h("div", { class: "inspire-row" }, items.map(([type, label]) => h("a", { href: `#/nouvel-evenement/type/${type}`, class: "inspire-card" },
      photo(COVERS[type][0], 360, 460), h("span", { class: "inspire-label" }, h("span", { "aria-hidden": "true" }, EVENT_ICONS[type]), label)))));
}

/** Bandeau photo en tête des rubriques « Mes tâches » et « Budget ». */
function rubricBanner(key, title, text) {
  return photoBackground(h("section", { class: "rubric-banner" }, h("h1", {}, title), h("p", {}, text)), key, 1000, 360,
    "linear-gradient(90deg, rgba(46,16,101,.9), rgba(46,16,101,.35))");
}

/** État vide illustré. */
function photoEmpty(key, title, text, action = null) {
  return h("div", { class: "card photo-empty" }, h("div", { class: "pe-photo", "aria-hidden": "true" }, photo(key, 640, 300)),
    h("div", { class: "form" }, h("strong", {}, title), text ? h("p", { class: "muted small" }, text) : null, action));
}

// ─── 13. Paramètres et profil ─────────────────────────────────────────────
async function settingsScreen() {
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
      row("#/bienvenue", "📖", "Guide de Bennoo", "À quoi sert Bennoo et comment s'en servir"),
      row("#/profil", "👤", "Mon profil", "Nom et téléphone"),
      row("#/familles", "👨‍👩‍👧", "Familles et permissions", "Membres, rôles, invitations"),
      row("#/installer", "📲", "Installer l'application", isInstalled() ? "Déjà installée sur cet appareil" : "Icône Bennoo sur l'écran d'accueil"),
      row("#/conditions/confidentialite", "🔒", "Confidentialité", "Ce que voient les autres, vos droits"),
      row("#/conditions/cgu", "📄", "Conditions d'utilisation et mentions légales", null),
      h("li", {}, h("div", { class: "item" }, h("span", { class: "ico", "aria-hidden": "true" }, "🌐"), h("span", { class: "grow" }, h("span", { class: "title" }, "Langue"), h("span", { class: "sub" }, "Français (wolof prévu plus tard)")))),
      h("li", {}, out),
      h("li", {}, h("a", { href: "#/supprimer-compte", class: "item danger" }, h("span", { class: "ico", "aria-hidden": "true" }, "🗑"),
        h("span", { class: "grow" }, h("span", { class: "title danger" }, "Supprimer mon compte"), h("span", { class: "sub" }, "Définitif")), h("span", { class: "chev", "aria-hidden": "true" }, "›")))),
  );
  return { node, title: "Paramètres", nav: "more" };
}

async function profileScreen() {
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

// ─── Erreurs ──────────────────────────────────────────────────────────────
function notFoundScreen(message = "Cette page n'existe pas, ou vous n'y avez pas accès.") {
  return { node: bare(h("section", { class: "card form" }, h("h1", {}, "Introuvable"), h("p", {}, message), h("a", { href: "#/", class: "btn btn-primary btn-block" }, "Retour à l'accueil"))), title: "Introuvable" };
}

function errorScreen(err) {
  return { node: bare(h("section", { class: "card form" }, h("h1", {}, "Une erreur est survenue"), alertBox(errMsg(err)), h("a", { href: "#/", class: "btn btn-primary btn-block" }, "Retour à l'accueil"))), title: "Erreur" };
}


/* ---------- Navigation ----------
   Routage par ancre (#/...) : fonctionne sur GitHub Pages et en ouvrant simplement index.html.
   Chaque écran renvoie { node, title, nav } ; nav = onglet actif (null : écran sans barre). */
const root = document.getElementById("app");
document.getElementById("skip")?.addEventListener("click", () => root.querySelector("h1")?.focus());

function show({ node, title, nav = null }) {
  document.body.classList.toggle("with-nav", Boolean(nav));
  // Aide : sur les pages de l'application connectée, et sur les pages ouvertes depuis un lien (invitation, réponse).
  const path = location.hash.replace(/^#/, "") || "/";
  if (!["Introuvable", "Erreur"].includes(title) && (nav || /^\/(rsvp|rejoindre)\//.test(path))) insertHelp(node, path);
  root.replaceChildren(node, nav ? tabbar(nav) : "");
  document.title = title ? `${title} · Bennoo` : "Bennoo";
  const heading = root.querySelector("h1");
  if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}

let currentUser = null;
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
      if (mySeq === seq) show(errorScreen(err));
    }
  };

  if (head === "conditions") return render(legalScreen(a));
  if (head === "installer") return render(installScreen());
  // Réponse d'un invité (RSVP) : accessible sans compte, avec le lien personnel.
  if (head === "rsvp" && a && b && parts[3]) return render(rsvpScreen(a, b, parts[3]));
  if (!currentUser) {
    // Un lien d'invitation ouvert sans être connecté est gardé pour après la connexion.
    if (head === "rejoindre") sessionStorage.setItem("bennoo:after-login", path);
    if (head === "inscription") return render(signupScreen());
    if (head === "connexion") return render(loginScreen());
    if (head === "mot-de-passe-oublie") return render(resetScreen());
    if (head === "decouvrir") return render(onboardingScreen(Number(a) || 0));
    return render(launchScreen());
  }
  if (!currentUser.emailVerified) return render(verifyScreen(currentUser));
  if (["connexion", "inscription", "mot-de-passe-oublie", "decouvrir"].includes(head)) { location.hash = "#/"; return; }
  const pending = sessionStorage.getItem("bennoo:after-login");
  if (pending) { sessionStorage.removeItem("bennoo:after-login"); location.hash = pending; return; }

  // Première connexion sur cet appareil : page de bienvenue qui explique Bennoo.
  if (!head && !welcomeSeen.get(currentUser.uid)) { location.hash = "#/bienvenue"; return; }
  if (head === "bienvenue") return render(welcomeScreen());
  if (!head) return render(homeScreen());
  if (head === "familles") return render(familiesScreen());
  if (head === "famille" && a && b === "membre" && parts[3]) return render(memberScreen(a, parts[3]));
  if (head === "famille" && a) return render(familyScreen(a, b));
  if (head === "nouvel-evenement") return render(a === "type" ? newEventScreen(null, b) : newEventScreen(a));
  if (head === "evenement" && a && b) return render(eventScreen(a, b, parts[3], parts[4], parts[5]));
  if (head === "rejoindre" && a && b) return render(joinScreen(a, b));
  if (head === "taches") return render(myTasksScreen());
  if (head === "budget") return render(myBudgetScreen());
  if (head === "plus") return render(settingsScreen());
  if (head === "profil") return render(profileScreen());
  if (head === "supprimer-compte") return render(deleteAccountScreen());
  return render(notFoundScreen());
}

window.addEventListener("hashchange", route);
// Après vérification de l'email, l'écran « vérifiez votre email » relance le routage.
window.addEventListener("bennoo:refresh", () => { currentUser = auth.currentUser; route(); });

if (FIREBASE_READY) {
  applyPersistence();
  auth.getRedirectResult().catch((err) => { if (err.code !== "auth/no-auth-event") toast(errMsg(err)); });
  auth.onAuthStateChanged(async (u) => {
    if (u && u.emailVerified) await ensureProfile(u); // comptes Google : email déjà vérifié par Google
    currentUser = u; ready = true; route();
  });
} else {
  ready = true;
  route();
}
})();
