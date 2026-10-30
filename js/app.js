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
  authDomain: "bennoo-4186e.firebaseapp.com",
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
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    // Pas de redirection : sur github.io, la redirection Google revient sans session
    // (le navigateur isole le stockage de bennoo-4186e.firebaseapp.com).
    await auth.signInWithPopup(provider);
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
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
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
  btn.addEventListener("click", () => withBusy(btn, async () => {
    showFormError(form, null);
    try { await signInWithGoogle(); } catch (err) { showFormError(form, errMsg(err)); }
  }));
  return h("div", { class: "form" }, h("p", { class: "or" }, "Ou continuer avec"), btn);
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
    budgetPlanned: e.budgetPlanned, expectedGuests: e.expectedGuests ?? null,
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

  return { getProfile, saveProfile, createFamily, listMyFamilies, getFamily, listFamilyMembers, setFamilyRole, removeFamilyMember,
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
  async function createMyContribution(fid, eid, { amount, status, anonymous, note }, myName) {
    const ref = ev(fid, eid).collection("contributions").doc();
    const batch = db.batch();
    batch.set(ref, { amount, status, anonymous, displayName: anonymous ? null : myName, source: "self", note: note || null, createdAt: now(), updatedAt: now() });
    batch.set(ref.collection("private").doc("identity"), { uid: uid(), displayName: myName });
    batch.set(mine(fid, eid, ref.id), { createdAt: now() });
    await batch.commit();
  }
  /** Don reçu enregistré par le trésorier (par exemple d'un proche sans compte). */
  const recordContribution = (fid, eid, { amount, status, displayName, note }) => ev(fid, eid).collection("contributions").add({
    amount, status, anonymous: false, displayName, source: "treasurer", note: note || null, createdAt: now(), updatedAt: now(),
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
  const updateMyContribution = (fid, eid, cid, { amount, status, note }) => contrib(fid, eid, cid).update({ amount, status, note: note || null, updatedAt: now() });
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
  function budgetTotals(expenses, contributions) {
    const sum = (list) => list.reduce((s, x) => s + x.amount, 0);
    const confirmed = contributions.filter((c) => c.status === "confirmed");
    return {
      spent: sum(expenses), paid: sum(expenses.filter((x) => x.status === "paid")),
      confirmed: sum(confirmed), pending: sum(contributions.filter((c) => c.status !== "confirmed")),
      contributors: confirmed.length,
    };
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
  async function saveInvitation(fid, eid, event, { hosts, message }) {
    await ev(fid, eid).collection("public").doc("invitation").set({
      title: event.title, type: event.type, startsAt: ts(event.startsAt), venue: event.venue || null, city: event.city || null,
      hosts: hosts || null, message: message || null, updatedAt: now(),
    });
  }
  /** Après modification de l'événement : le carton déjà publié suit (titre, date, lieu). */
  async function syncInvitation(fid, eid, event) {
    const current = await getInvitation(fid, eid).catch(() => null);
    if (current) await saveInvitation(fid, eid, event, current);
  }

  return {
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
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/wrong-password": "Email ou mot de passe incorrect.",
    "auth/user-not-found": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
    "auth/network-request-failed": "Pas de connexion internet. Vérifiez votre réseau.",
    "auth/operation-not-allowed": "Ce mode de connexion n'est pas encore activé dans Firebase.",
    "auth/unauthorized-domain": "Ce site n'est pas encore autorisé dans Firebase (domaines autorisés).",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet email : connectez-vous avec votre mot de passe.",
    "auth/popup-closed-by-user": "Connexion Google annulée.",
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
  const label = button.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  button.textContent = "Patientez…";
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
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

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  family: "M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6zm12.5 0c0-2-.6-3.8-1.7-5.2.9-.5 2-.8 3.2-.8 3.3 0 6 2.7 6 6z",
  more: "M5 12a2 2 0 1 0 0-.01zM12 12a2 2 0 1 0 0-.01zM19 12a2 2 0 1 0 0-.01z",
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "currentColor");
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
    link("#/plus", "more", "Plus", "more"),
  );
}

const AVATAR_COLORS = ["#6d28d9", "#b7791f", "#0e7490", "#be185d", "#4d7c0f", "#1d4ed8", "#9333ea", "#c2410c"];
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
    h("div", { class: "circle", "aria-hidden": "true" }, "👨‍👩‍👧‍👦"),
    h("div", { class: "actions" },
      h("a", { href: "#/decouvrir/0", class: "btn btn-primary btn-block" }, "Commencer"),
      h("a", { href: "#/connexion", class: "btn btn-light btn-block" }, "Se connecter"),
      FIREBASE_READY ? null : h("p", { class: "small" }, "Aperçu : la connexion sera activée dès que le projet Firebase sera relié."),
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
function onboardingScreen(i) {
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

async function homeScreen() {
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

async function joinScreen(fid, token) {
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

async function newEventScreen(presetFid) {
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
        await orga.syncInvitation(fid, eid, { title, type: v.type, startsAt: v.startsAt ? new Date(v.startsAt) : null, venue: v.venue.trim(), city: v.city.trim() });
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
    }
    return { title, dueAt, status: "todo", notes: null, assigneeUid: null };
  });
}

/** En-tête de sous-page (titre de niveau 2 : le titre de l'événement reste le h1). */
function subHeader(title, backHref) {
  return h("div", { class: "screen-head sub-head" }, backHref ? h("a", { href: backHref, class: "back", "aria-label": "Retour" }, "‹") : null, h("h2", {}, title));
}
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

  return h("div", { class: "form" },
    h("div", { class: "kpis" },
      h("div", { class: "kpi big" }, h("span", { class: "v" }, n === null ? "—" : n > 0 ? `J - ${n}` : n === 0 ? "Jour J" : "Passé"),
        h("span", { class: "l" }, n === null ? "Date à fixer" : n > 0 ? "avant le grand jour" : n === 0 ? "c'est aujourd'hui !" : "événement passé")),
      h("div", { class: "kpi kpi-ring" }, ring(progress, "de l'organisation"),
        h("span", { class: "l" }, tasks.length ? "Organisation (tâches terminées)" : "Aucune tâche pour l'instant"))),
    h("div", { class: "kpi-row four" },
      h("div", { class: "kpi" }, h("span", { class: "v" }, g ? String(g.attending) : "—"), h("span", { class: "l" }, g ? "Invités confirmés" : "Invités confirmés (aucune liste)")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(left)), h("span", { class: "l" }, "Tâches restantes")),
      h("div", { class: "kpi" }, h("span", { class: "v sm" }, event.budgetPlanned ? formatAmount(event.budgetPlanned, event.currency) : "—"), h("span", { class: "l" }, "Budget global")),
      h("div", { class: "kpi" }, h("span", { class: "v sm" }, b ? formatAmount(b.confirmed, event.currency) : "—"), h("span", { class: "l" }, b ? plural(b.contributors, "contribution") + " confirmée" + (b.contributors > 1 ? "s" : "") : "Contributions"))),
    h("section", { class: "card" },
      h("div", { class: "section-head" }, h("h2", {}, "Prochaines tâches"), h("a", { href: `${base}/taches`, class: "small" }, "Tout voir")),
      next.length ? h("ul", { class: "list" }, next.map((t) => taskItem(ctx, t, tasks))) :
        h("p", { class: "muted small" }, tasks.length ? "Toutes les tâches sont terminées. Bravo !" : "Aucune tâche. Ouvrez l'onglet Tâches pour commencer.")),
    h("section", { class: "card" }, h("div", { class: "section-head" }, h("h2", {}, "Informations"),
      isOrganizer ? h("a", { href: `${base}/modifier`, class: "btn btn-sm" }, "Modifier") : null),
    h("dl", { class: "facts" },
      h("dt", {}, "Date"), h("dd", {}, event.startsAt ? `${formatDate(event.startsAt)} à ${event.startsAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}` : "À fixer"),
      h("dt", {}, "Lieu"), h("dd", {}, [event.venue, event.city].filter(Boolean).join(", ") || "À préciser"),
      h("dt", {}, "Famille"), h("dd", {}, family.name),
      h("dt", {}, "Invités prévus"), h("dd", {}, event.expectedGuests ?? "—")),
    event.description ? h("p", { class: "muted" }, event.description) : null),
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
  const switcher = subTabs([[`${base}/taches`, "Liste", "liste"], [`${base}/taches/calendrier`, "Calendrier", "calendrier"]], view === "calendrier" ? "calendrier" : "liste");

  if (tasks.length === 0) {
    const empty = h("div", { class: "card form" },
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
        ? [...groups.values()].map((list) => h("section", {}, h("h3", { class: "cal-day" }, formatDate(list[0].dueAt)), h("ul", { class: "list card-flat" }, list.map((t) => taskItem(ctx, t)))))
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
function budgetCard(event, totals, showDetail) {
  const cur = event.currency;
  const budget = event.budgetPlanned;
  const toFinance = Math.max(0, budget - totals.confirmed);
  const bar = h("div", { class: "bar", role: "img", "aria-label": `${pct(totals.confirmed, budget)} % du budget financé` }, h("span", {}));
  bar.firstChild.style.width = `${pct(totals.confirmed, budget)}%`;
  const line = (label, value, cls = "") => h("div", { class: `money-line ${cls}` }, h("span", {}, label), h("strong", {}, formatAmount(value, cur)));
  return h("section", { class: "card form" },
    h("div", {}, h("p", { class: "muted small" }, "Budget global"), h("p", { class: "big-amount" }, budget ? formatAmount(budget, cur) : "Non défini")),
    budget ? h("div", {}, bar, h("p", { class: "muted small" }, `${pct(totals.confirmed, budget)} % financé par les contributions confirmées`)) : h("p", { class: "muted small" }, "L'organisateur peut fixer le budget dans « Modifier »."),
    line("Contributions confirmées", totals.confirmed, "ok"),
    line("Contributions en attente", totals.pending),
    showDetail ? line("Dépenses engagées", totals.spent) : null,
    showDetail ? line("Dont payées", totals.paid) : null,
    budget ? line("Reste à financer", toFinance, toFinance > 0 ? "warn" : "ok") : null);
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
    budgetCard(event, totals, true),
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
        h("span", { class: "sub" }, [formatAmount(c.amount, event.currency), c.source === "treasurer" ? "enregistrée par le trésorier" : null, c.note].filter(Boolean).join(" · "))),
      chip(CONTRIB_CHIP[c.status], CONTRIB_STATUS[c.status]),
      controls.length ? h("div", { class: "controls" }, controls) : null);
  };
  const counts = { all: contributions.length, promised: 0, declared: 0, confirmed: 0 };
  for (const c of contributions) counts[c.status] += 1;
  const draw = () => {
    const shown = filter === "all" ? contributions : contributions.filter((c) => c.status === filter);
    listBox.replaceChildren(
      filterChips([["all", `Toutes (${counts.all})`], ["promised", `Promises (${counts.promised})`], ["declared", `Déclarées (${counts.declared})`], ["confirmed", `Confirmées (${counts.confirmed})`]], filter, (k) => { filter = k; draw(); }),
      shown.length ? h("ul", { class: "list card-flat" }, shown.map(row)) : h("div", { class: "card empty" }, contributions.length ? "Aucune contribution dans ce filtre." : "Aucune contribution pour l'instant."));
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
          h("span", { class: "grow" }, h("span", { class: "title" }, formatAmount(c.amount, event.currency)),
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

function contributionForm(ctx, existing) {
  const { fid, eid, event, base, myName } = ctx;
  const form = h("form", { class: "card form", novalidate: true },
    field(`Montant (${CURRENCIES[event.currency]})`, { name: "amount", class: "input", inputmode: "decimal", required: true, value: amountInput(existing?.amount, event.currency) }),
    field("Où en êtes-vous ?", { name: "status", tag: "select", class: "input", options: [["promised", "Promise : je compte donner"], ["declared", "Déclarée : j'ai déjà donné"]] }),
    field("Précision (facultatif)", { name: "note", class: "input", maxlength: 200, value: existing?.note ?? "", placeholder: "Ex. Wave le 12/01, remis à Awa" }),
    existing ? h("p", { class: "muted small" }, existing.anonymous ? "Contribution anonyme : seul le trésorier voit votre nom." : "Votre nom est visible de l'organisateur et du trésorier.")
      : h("label", { class: "check" }, h("input", { type: "checkbox", name: "anonymous" }),
        h("span", {}, h("strong", {}, "Contribuer anonymement"), h("br"), h("span", { class: "muted small" }, "Votre nom ne sera visible que par vous et le trésorier qui confirme. Les autres verront « Contributeur anonyme »."))),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, existing ? "Enregistrer" : "Déclarer ma contribution"));
  if (existing) form.elements.status.value = existing.status;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button[type=submit]"), async () => {
      try {
        const amount = requiredAmount(v.amount, event.currency);
        if (existing) await orga.updateMyContribution(fid, eid, existing.id, { amount, status: v.status, note: v.note.trim() });
        else await orga.createMyContribution(fid, eid, { amount, status: v.status, anonymous: Boolean(v.anonymous), note: v.note.trim() }, myName);
        toast("Contribution enregistrée");
        location.hash = `${base}/budget`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
  const parts = [subHeader(existing ? "Ma contribution" : "Ajouter ma contribution", `${base}/budget`)];
  if (existing?.status === "confirmed") {
    parts.push(h("section", { class: "card form" }, h("p", { class: "big-amount" }, formatAmount(existing.amount, event.currency)), chip("chip-green", "Confirmée par le trésorier"),
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
    field(`Montant (${CURRENCIES[event.currency]})`, { name: "amount", class: "input", inputmode: "decimal", required: true }),
    field("Statut", { name: "status", tag: "select", class: "input", options: [["confirmed", "Confirmée : reçue"], ["promised", "Promise"]] }),
    field("Précision (facultatif)", { name: "note", class: "input", maxlength: 200 }),
    h("button", { type: "submit", class: "btn btn-primary btn-block" }, "Enregistrer le don"));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showFormError(form, null);
    const v = values(form);
    await withBusy(form.querySelector("button"), async () => {
      try {
        await orga.recordContribution(fid, eid, { displayName: cleanName(v.name), amount: requiredAmount(v.amount, event.currency), status: v.status, note: v.note.trim() });
        toast("Don enregistré");
        location.hash = `${base}/budget/contributions`;
      } catch (err) { showFormError(form, errMsg(err)); }
    });
  });
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

function invitationCard(inv, guest) {
  const date = inv.startsAt;
  return h("section", { class: "invitation" },
    h("p", { class: "inv-hosts" }, inv.hosts || inv.title),
    h("p", { class: "inv-lead" }, inv.hosts ? "ont le plaisir de vous inviter" : "Vous êtes invités"),
    inv.hosts ? h("p", { class: "inv-title" }, inv.title) : null,
    date ? h("p", { class: "inv-day" }, String(date.getDate())) : null,
    date ? h("p", { class: "inv-month" }, new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(date).toUpperCase()) : h("p", { class: "inv-month" }, "DATE À CONFIRMER"),
    date ? h("p", { class: "inv-time" }, date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }).replace(":", " h ")) : null,
    [inv.venue, inv.city].filter(Boolean).length ? h("p", { class: "inv-place" }, `À ${[inv.venue, inv.city].filter(Boolean).join(", ")}`) : null,
    inv.message ? h("p", { class: "inv-message" }, inv.message) : null,
    guest ? h("p", { class: "inv-guest" }, `${guest.household} · ${plural(guest.seats, "place")} réservée${guest.seats > 1 ? "s" : ""}`) : null);
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
    const form = h("form", { class: "card form", novalidate: true },
      field("Qui invite ?", { name: "hosts", class: "input", maxlength: 120, value: invitation?.hosts ?? "", placeholder: "Ex. Fatou & Mamadou" }, "Affiché en grand sur le carton. Laissez vide pour afficher le nom de l'événement."),
      field("Message (facultatif)", { name: "message", tag: "textarea", class: "input", maxlength: 500 }),
      h("button", { type: "submit", class: "btn btn-primary btn-block" }, invitation ? "Mettre à jour le carton" : "Publier le carton"));
    form.elements.message.value = invitation?.message ?? "";
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values(form);
      await withBusy(form.querySelector("button"), async () => {
        try { await orga.saveInvitation(fid, eid, event, { hosts: v.hosts.replace(/\s+/g, " ").trim(), message: v.message.trim() }); toast("Carton publié"); reload(); }
        catch (err) { showFormError(form, errMsg(err)); }
      });
    });
    const preview = invitation ?? { title: event.title, type: event.type, startsAt: event.startsAt, venue: event.venue, city: event.city, hosts: null, message: null };
    return h("div", { class: "form" }, tabs,
      h("p", { class: "muted small" }, invitation ? "Aperçu du carton tel que vos invités le voient. Le titre, la date et le lieu suivent automatiquement l'événement." : "Aperçu (non publié). Le carton est publié automatiquement à l'ajout du premier invité."),
      invitationCard(preview), form);
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
      h("div", { class: "controls" }, h("a", { href: wa, target: "_blank", rel: "noopener", class: "btn btn-sm btn-whatsapp" }, "WhatsApp"), copy, del));
  };

  return h("div", { class: "form" }, tabs,
    h("div", { class: "kpi-row four" },
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.invited)), h("span", { class: "l" }, `places · ${plural(totals.households, "foyer")}`)),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.attending)), h("span", { class: "l" }, "personnes confirmées")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.no)), h("span", { class: "l" }, "foyers absents")),
      h("div", { class: "kpi" }, h("span", { class: "v" }, String(totals.pending)), h("span", { class: "l" }, "sans réponse"))),
    guests.length ? h("ul", { class: "list card-flat" }, guests.map(row)) : h("div", { class: "card empty" }, "Aucun invité pour l'instant."),
    form,
    h("p", { class: "muted small" }, "QR code et rappels automatiques : prévus plus tard."));
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
  if (tab === "participants") body = await participantsPanel(fid, eid, participants, isOrganizer, myUid);
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
  else if (tab === "invites") body = await guestsPanel(ctx, sub);
  else body = await eventOverview(ctx);

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
      row("#/profil", "👤", "Mon profil", "Nom et téléphone"),
      row("#/familles", "👨‍👩‍👧", "Familles et permissions", "Membres, rôles, invitations"),
      row("#/conditions", "🔒", "Confidentialité", "Ce que voient les autres membres"),
      h("li", {}, h("div", { class: "item" }, h("span", { class: "ico", "aria-hidden": "true" }, "🌐"), h("span", { class: "grow" }, h("span", { class: "title" }, "Langue"), h("span", { class: "sub" }, "Français (wolof prévu plus tard)")))),
      h("li", {}, out)),
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

function termsScreen() {
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

  if (head === "conditions") return render(termsScreen());
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

  if (!head) return render(homeScreen());
  if (head === "familles") return render(familiesScreen());
  if (head === "famille" && a && b === "membre" && parts[3]) return render(memberScreen(a, parts[3]));
  if (head === "famille" && a) return render(familyScreen(a, b));
  if (head === "nouvel-evenement") return render(newEventScreen(a));
  if (head === "evenement" && a && b) return render(eventScreen(a, b, parts[3], parts[4], parts[5]));
  if (head === "rejoindre" && a && b) return render(joinScreen(a, b));
  if (head === "plus") return render(settingsScreen());
  if (head === "profil") return render(profileScreen());
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
