/**
 * Accès aux données Firestore. Les écrans n'appellent que ces fonctions.
 * Les règles d'accès (firestore.rules) re-vérifient tout côté serveur : ce module ne
 * fait que formuler des demandes valides.
 */
import {
  auth, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where,
  writeBatch, serverTimestamp, Timestamp,
} from "./firebase.js";
import { generateToken, INVITE_DAYS } from "./lib/format.js";

const uid = () => {
  const u = auth.currentUser;
  if (!u) throw Object.assign(new Error("Non connecté"), { code: "permission-denied" });
  return u.uid;
};

// ─── Profil ───────────────────────────────────────────────────────────────
export async function getProfile() {
  const snap = await getDoc(doc(db, "users", uid()));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile({ displayName, phone }) {
  const ref = doc(db, "users", uid());
  const existing = await getDoc(ref);
  await setDoc(ref, {
    displayName, phone, locale: "fr",
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

// ─── Familles ─────────────────────────────────────────────────────────────
export async function createFamily(name, displayName) {
  const me = uid();
  const familyRef = doc(collection(db, "families"));
  const batch = writeBatch(db);
  batch.set(familyRef, { name, createdBy: me, createdAt: serverTimestamp() });
  batch.set(doc(familyRef, "members", me), { uid: me, role: "owner", displayName, joinedAt: serverTimestamp() });
  await batch.commit();
  return familyRef.id;
}

/** Mes familles : mes lignes d'appartenance, puis chaque famille. */
export async function listMyFamilies() {
  const rows = await getDocs(query(collectionGroup(db, "members"), where("uid", "==", uid())));
  const families = await Promise.all(rows.docs.map(async (m) => {
    const familyRef = m.ref.parent.parent;
    const f = await getDoc(familyRef);
    return f.exists() ? { id: familyRef.id, ...f.data(), myRole: m.data().role } : null;
  }));
  return families.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export async function getFamily(fid) {
  const [f, me] = await Promise.all([getDoc(doc(db, "families", fid)), getDoc(doc(db, "families", fid, "members", uid()))]);
  if (!f.exists() || !me.exists()) return null;
  return { id: fid, ...f.data(), myRole: me.data().role };
}

export async function listFamilyMembers(fid) {
  const snap = await getDocs(collection(db, "families", fid, "members"));
  return snap.docs.map((d) => d.data()).sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"));
}

export async function setFamilyRole(fid, memberUid, role) {
  await updateDoc(doc(db, "families", fid, "members", memberUid), { role });
}

// ─── Invitations ──────────────────────────────────────────────────────────
export async function createInvite(fid, familyName) {
  const token = generateToken();
  await setDoc(doc(db, "families", fid, "invites", token), {
    familyName, createdBy: uid(), createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + INVITE_DAYS * 86_400_000),
  });
  return token;
}

export async function listInvites(fid) {
  const snap = await getDocs(collection(db, "families", fid, "invites"));
  return snap.docs.map((d) => ({ token: d.id, ...d.data() }))
    .filter((i) => i.expiresAt.toMillis() > Date.now())
    .sort((a, b) => b.expiresAt.toMillis() - a.expiresAt.toMillis());
}

export async function revokeInvite(fid, token) {
  await deleteDoc(doc(db, "families", fid, "invites", token));
}

export async function getInvite(fid, token) {
  const snap = await getDoc(doc(db, "families", fid, "invites", token));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { ...data, expired: data.expiresAt.toMillis() <= Date.now() };
}

export async function isFamilyMember(fid) {
  return (await getDoc(doc(db, "families", fid, "members", uid()))).exists();
}

export async function joinFamily(fid, token, displayName) {
  await setDoc(doc(db, "families", fid, "members", uid()), {
    uid: uid(), role: "member", displayName, joinedAt: serverTimestamp(), inviteToken: token,
  });
}

// ─── Événements ───────────────────────────────────────────────────────────
function eventPayload(e) {
  return {
    type: e.type, title: e.title, description: e.description || null,
    startsAt: e.startsAt ? Timestamp.fromDate(e.startsAt) : null,
    venue: e.venue || null, city: e.city || null, currency: e.currency,
    budgetPlanned: e.budgetPlanned, expectedGuests: e.expectedGuests ?? null,
  };
}

export async function createEvent(fid, e, displayName) {
  const me = uid();
  const eventRef = doc(collection(db, "families", fid, "events"));
  const batch = writeBatch(db);
  batch.set(eventRef, {
    ...eventPayload(e), status: "active", createdBy: me, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  batch.set(doc(eventRef, "participants", me), { uid: me, role: "organizer", displayName, addedAt: serverTimestamp() });
  await batch.commit();
  return eventRef.id;
}

export async function updateEvent(fid, eid, e) {
  await updateDoc(doc(db, "families", fid, "events", eid), { ...eventPayload(e), updatedAt: serverTimestamp() });
}

const toEvent = (fid, id, data, myRole) => ({
  familyId: fid, id, ...data, startsAt: data.startsAt ? data.startsAt.toDate() : null, myRole,
});

/** Mes événements, toutes familles confondues, du plus proche au plus lointain. */
export async function listMyEvents() {
  const rows = await getDocs(query(collectionGroup(db, "participants"), where("uid", "==", uid())));
  const events = await Promise.all(rows.docs.map(async (p) => {
    const eventRef = p.ref.parent.parent;
    const fid = eventRef.parent.parent.id;
    const e = await getDoc(eventRef);
    return e.exists() ? toEvent(fid, eventRef.id, e.data(), p.data().role) : null;
  }));
  return events.filter(Boolean).sort((a, b) => (a.startsAt?.getTime() ?? Infinity) - (b.startsAt?.getTime() ?? Infinity));
}

export async function getEvent(fid, eid) {
  const [e, me] = await Promise.all([
    getDoc(doc(db, "families", fid, "events", eid)),
    getDoc(doc(db, "families", fid, "events", eid, "participants", uid())),
  ]);
  if (!e.exists() || !me.exists()) return null;
  return toEvent(fid, eid, e.data(), me.data().role);
}

export async function listParticipants(fid, eid) {
  const snap = await getDocs(collection(db, "families", fid, "events", eid, "participants"));
  const order = { organizer: 0, treasurer: 1, member: 2 };
  return snap.docs.map((d) => d.data())
    .sort((a, b) => order[a.role] - order[b.role] || a.displayName.localeCompare(b.displayName, "fr"));
}

export async function addParticipant(fid, eid, member, role) {
  await setDoc(doc(db, "families", fid, "events", eid, "participants", member.uid), {
    uid: member.uid, role, displayName: member.displayName, addedAt: serverTimestamp(),
  });
}

export async function setParticipantRole(fid, eid, pid, role) {
  await updateDoc(doc(db, "families", fid, "events", eid, "participants", pid), { role });
}

export async function removeParticipant(fid, eid, pid) {
  await deleteDoc(doc(db, "families", fid, "events", eid, "participants", pid));
}

export async function getMyFamilyDisplayName(fid) {
  const snap = await getDoc(doc(db, "families", fid, "members", uid()));
  return snap.exists() ? snap.data().displayName : null;
}
