/**
 * Tests des règles Firestore (émulateur). Lancer : npm run test:rules
 * Chaque test correspond à une règle de firestore.rules : ce qui doit passer passe,
 * ce qui doit être refusé est refusé.
 */
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp, collection, collectionGroup,
  query, where, getDocs, Timestamp,
} from "firebase/firestore";

let env;
const verifiedUser = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.sn`, email_verified: true }).firestore();
const unverifiedUser = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.sn`, email_verified: false }).firestore();
const anonymous = () => env.unauthenticatedContext().firestore();

const TOKEN = "A".repeat(43);

function createFamilyBatch(db, uid, fid, name = "Famille Diop") {
  const b = writeBatch(db);
  b.set(doc(db, "families", fid), { name, createdBy: uid, createdAt: serverTimestamp() });
  b.set(doc(db, "families", fid, "members", uid), { uid, role: "owner", displayName: uid, joinedAt: serverTimestamp() });
  return b;
}

function eventData(uid, over = {}) {
  return {
    type: "WEDDING", title: "Mariage Fatou & Mamadou", description: null,
    startsAt: Timestamp.fromDate(new Date("2027-06-12T16:00:00Z")), venue: "Salle des fêtes", city: "Dakar",
    currency: "XOF", budgetPlanned: 6000000, expectedGuests: 300, status: "active",
    createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
  };
}

function createEventBatch(db, uid, fid, eid, over = {}) {
  const b = writeBatch(db);
  b.set(doc(db, "families", fid, "events", eid), eventData(uid, over));
  b.set(doc(db, "families", fid, "events", eid, "participants", uid), { uid, role: "organizer", displayName: uid, addedAt: serverTimestamp() });
  return b;
}

/** Données de départ : awa (owner) et ibou (member) dans la famille f1 ; e1 organisé par awa. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();
    await setDoc(doc(db, "families/f1"), { name: "Famille Diop", createdBy: "awa", createdAt: now });
    await setDoc(doc(db, "families/f1/members/awa"), { uid: "awa", role: "owner", displayName: "Awa", joinedAt: now });
    await setDoc(doc(db, "families/f1/members/ibou"), { uid: "ibou", role: "member", displayName: "Ibou", joinedAt: now });
    await setDoc(doc(db, "families/f2"), { name: "Famille Ndiaye", createdBy: "out", createdAt: now });
    await setDoc(doc(db, "families/f2/members/out"), { uid: "out", role: "owner", displayName: "Externe", joinedAt: now });
    await setDoc(doc(db, "families/f1/events/e1"), { ...eventData("awa"), createdAt: now, updatedAt: now });
    await setDoc(doc(db, "families/f1/events/e1/participants/awa"), { uid: "awa", role: "organizer", displayName: "Awa", addedAt: now });
    await setDoc(doc(db, `families/f1/invites/${TOKEN}`), {
      familyName: "Famille Diop", createdBy: "awa", createdAt: now,
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
    });
    await setDoc(doc(db, `families/f1/invites/${"E".repeat(43)}`), {
      familyName: "Famille Diop", createdBy: "awa", createdAt: now, expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-bennoo",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});
beforeEach(async () => { await env.clearFirestore(); await seed(); });
after(async () => { await env.cleanup(); });

// ─── Profils ──────────────────────────────────────────────────────────────
test("profil : chacun crée et lit le sien, personne d'autre", async () => {
  const awa = verifiedUser("awa");
  const profile = { displayName: "Awa Diop", phone: "+221771234567", locale: "fr", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertSucceeds(setDoc(doc(awa, "users/awa"), profile));
  await assertSucceeds(getDoc(doc(awa, "users/awa")));
  await assertFails(getDoc(doc(verifiedUser("ibou"), "users/awa")));
  await assertFails(setDoc(doc(verifiedUser("ibou"), "users/awa"), profile));
  await assertFails(getDoc(doc(anonymous(), "users/awa")));
});

test("profil : téléphone au format international, champs inconnus refusés", async () => {
  const awa = verifiedUser("awa");
  const base = { displayName: "Awa", locale: "fr", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await assertFails(setDoc(doc(awa, "users/awa"), { ...base, phone: "77 123 45 67" }));
  await assertFails(setDoc(doc(awa, "users/awa"), { ...base, phone: null, isAdmin: true }));
  await assertSucceeds(setDoc(doc(awa, "users/awa"), { ...base, phone: null }));
});

// ─── Familles ─────────────────────────────────────────────────────────────
test("famille : création avec son fondateur propriétaire, email vérifié obligatoire", async () => {
  await assertSucceeds(createFamilyBatch(verifiedUser("moussa"), "moussa", "f-new").commit());
  await assertFails(createFamilyBatch(unverifiedUser("sans"), "sans", "f-x").commit());
  await assertFails(createFamilyBatch(anonymous(), "anon", "f-y").commit());
});

test("famille : impossible de créer une famille au nom de quelqu'un d'autre", async () => {
  const db = verifiedUser("moussa");
  const b = writeBatch(db);
  b.set(doc(db, "families/f-z"), { name: "X", createdBy: "awa", createdAt: serverTimestamp() });
  b.set(doc(db, "families/f-z/members/moussa"), { uid: "moussa", role: "owner", displayName: "M", joinedAt: serverTimestamp() });
  await assertFails(b.commit());
});

test("famille : invisible pour qui n'en est pas membre", async () => {
  await assertSucceeds(getDoc(doc(verifiedUser("ibou"), "families/f1")));
  await assertFails(getDoc(doc(verifiedUser("out"), "families/f1")));
  await assertFails(getDocs(collection(verifiedUser("out"), "families/f1/members")));
  await assertFails(getDocs(collection(verifiedUser("awa"), "families")));
});

test("famille : on ne peut pas s'ajouter soi-même sans lien valide", async () => {
  const out = verifiedUser("out");
  const m = { uid: "out", displayName: "Externe", joinedAt: serverTimestamp() };
  await assertFails(setDoc(doc(out, "families/f1/members/out"), { ...m, role: "member" }));
  await assertFails(setDoc(doc(out, "families/f1/members/out"), { ...m, role: "owner" }));
  await assertFails(setDoc(doc(out, "families/f1/members/out"), { ...m, role: "member", inviteToken: "E".repeat(43) }), "lien expiré");
  await assertFails(setDoc(doc(out, "families/f1/members/out"), { ...m, role: "admin", inviteToken: TOKEN }), "rôle trop élevé");
  await assertSucceeds(setDoc(doc(out, "families/f1/members/out"), { ...m, role: "member", inviteToken: TOKEN }));
  await assertSucceeds(getDoc(doc(out, "families/f1")));
});

test("famille : seul un admin crée un lien, valable exactement 7 jours", async () => {
  const mk = (db, uid) => setDoc(doc(db, `families/f1/invites/${"B".repeat(43)}`), {
    familyName: "Famille Diop", createdBy: uid, createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 365 * 86400000),
  });
  await assertFails(mk(verifiedUser("ibou"), "ibou"));
  await assertFails(mk(verifiedUser("awa"), "awa"), "durée non conforme");
  await assertFails(getDocs(collection(verifiedUser("ibou"), "families/f1/invites")), "liste réservée aux admins");
  await assertSucceeds(getDocs(collection(verifiedUser("awa"), "families/f1/invites")));
  await assertSucceeds(setDoc(doc(verifiedUser("awa"), `families/f1/invites/${"C".repeat(43)}`), {
    familyName: "Famille Diop", createdBy: "awa", createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
  }));
  await assertFails(setDoc(doc(verifiedUser("awa"), "families/f1/invites/court"), {
    familyName: "Famille Diop", createdBy: "awa", createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86400000),
  }), "jeton trop court, donc devinable");
});

test("famille : le propriétaire garde son rôle ; un admin gère les autres", async () => {
  const awa = verifiedUser("awa");
  await assertSucceeds(updateDoc(doc(awa, "families/f1/members/ibou"), { role: "admin" }));
  await assertFails(updateDoc(doc(awa, "families/f1/members/ibou"), { role: "owner" }));
  const ibou = verifiedUser("ibou");
  await assertFails(updateDoc(doc(ibou, "families/f1/members/awa"), { role: "member" }));
  await assertFails(deleteDoc(doc(ibou, "families/f1/members/awa")));
  await assertFails(updateDoc(doc(ibou, "families/f1/members/ibou"), { role: "owner" }), "pas d'auto-promotion");
  await assertSucceeds(deleteDoc(doc(ibou, "families/f1/members/ibou")), "on peut quitter la famille");
});

test("famille : un simple membre ne peut pas promouvoir", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "families/f1/members/fatou"), { uid: "fatou", role: "member", displayName: "Fatou", joinedAt: Timestamp.now() });
  });
  await assertFails(updateDoc(doc(verifiedUser("ibou"), "families/f1/members/fatou"), { role: "admin" }));
});

// ─── Événements ───────────────────────────────────────────────────────────
test("événement : un membre de la famille le crée et en devient organisateur", async () => {
  await assertSucceeds(createEventBatch(verifiedUser("ibou"), "ibou", "f1", "e-new").commit());
  await assertFails(createEventBatch(verifiedUser("out"), "out", "f1", "e-x").commit(), "hors famille");
});

test("événement : données invalides refusées", async () => {
  const ibou = verifiedUser("ibou");
  await assertFails(createEventBatch(ibou, "ibou", "f1", "e-a", { budgetPlanned: -5 }).commit());
  await assertFails(createEventBatch(ibou, "ibou", "f1", "e-b", { type: "PARTY" }).commit());
  await assertFails(createEventBatch(ibou, "ibou", "f1", "e-c", { title: "" }).commit());
  await assertFails(createEventBatch(ibou, "ibou", "f1", "e-d", { currency: "USD" }).commit());
  await assertFails(createEventBatch(ibou, "ibou", "f1", "e-e", { budgetPlanned: 12.5 }).commit());
  await assertSucceeds(createEventBatch(ibou, "ibou", "f1", "e-f", { startsAt: null, expectedGuests: null }).commit(), "date facultative");
});

test("événement : visible par ses seuls participants, même dans la famille", async () => {
  await assertSucceeds(getDoc(doc(verifiedUser("awa"), "families/f1/events/e1")));
  await assertFails(getDoc(doc(verifiedUser("ibou"), "families/f1/events/e1")), "membre de la famille non participant");
  await assertFails(getDoc(doc(verifiedUser("out"), "families/f1/events/e1")));
  await assertFails(getDocs(collection(verifiedUser("awa"), "families/f1/events")), "pas de liste globale");
});

test("événement : l'organisateur ajoute un membre de la famille, jamais un étranger", async () => {
  const awa = verifiedUser("awa");
  await assertSucceeds(setDoc(doc(awa, "families/f1/events/e1/participants/ibou"), { uid: "ibou", role: "treasurer", displayName: "Ibou", addedAt: serverTimestamp() }));
  await assertSucceeds(getDoc(doc(verifiedUser("ibou"), "families/f1/events/e1")));
  await assertFails(setDoc(doc(awa, "families/f1/events/e1/participants/out"), { uid: "out", role: "member", displayName: "Externe", addedAt: serverTimestamp() }));
});

test("événement : le nom d'un participant est celui de la famille, pas un nom inventé", async () => {
  await assertFails(setDoc(doc(verifiedUser("awa"), "families/f1/events/e1/participants/ibou"), { uid: "ibou", role: "member", displayName: "Faux nom", addedAt: serverTimestamp() }));
});

test("événement : un participant ne s'attribue pas de rôle", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "families/f1/events/e1/participants/ibou"), { uid: "ibou", role: "member", displayName: "Ibou", addedAt: Timestamp.now() });
  });
  const ibou = verifiedUser("ibou");
  await assertFails(updateDoc(doc(ibou, "families/f1/events/e1/participants/ibou"), { role: "organizer" }));
  await assertFails(updateDoc(doc(ibou, "families/f1/events/e1"), { title: "Piraté", updatedAt: serverTimestamp() }));
  await assertSucceeds(deleteDoc(doc(ibou, "families/f1/events/e1/participants/ibou")), "il peut se retirer");
});

test("événement : il reste toujours un organisateur", async () => {
  const awa = verifiedUser("awa");
  await assertFails(updateDoc(doc(awa, "families/f1/events/e1/participants/awa"), { role: "member" }));
  await assertFails(deleteDoc(doc(awa, "families/f1/events/e1/participants/awa")));
});

test("événement : l'organisateur modifie, sans toucher au créateur", async () => {
  const awa = verifiedUser("awa");
  await assertSucceeds(updateDoc(doc(awa, "families/f1/events/e1"), { title: "Mariage F & M", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(awa, "families/f1/events/e1"), { createdBy: "ibou", updatedAt: serverTimestamp() }));
});

// ─── Requêtes « mes familles » et « mes événements » ──────────────────────
test("requêtes : chacun ne liste que ses propres appartenances", async () => {
  const ibou = verifiedUser("ibou");
  await assertSucceeds(getDocs(query(collectionGroup(ibou, "members"), where("uid", "==", "ibou"))));
  await assertFails(getDocs(query(collectionGroup(ibou, "members"), where("uid", "==", "awa"))));
  await assertFails(getDocs(collectionGroup(ibou, "participants")));
  await assertSucceeds(getDocs(query(collectionGroup(verifiedUser("awa"), "participants"), where("uid", "==", "awa"))));
});
