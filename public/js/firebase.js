/**
 * Initialisation Firebase (SDK modulaire, chargé depuis le CDN officiel de Google :
 * pas d'étape de compilation).
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, sendEmailVerification, sendPasswordResetEmail,
  updateProfile, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore, connectFirestoreEmulator, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  collection, collectionGroup, query, where, writeBatch, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { firebaseConfig, emulatorConfig, useEmulators } from "./config.js";

const app = initializeApp(useEmulators ? emulatorConfig : firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = "fr";
export const db = initializeFirestore(app, {});

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
await setPersistence(auth, browserLocalPersistence);

export {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail, updateProfile,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where,
  writeBatch, serverTimestamp, Timestamp,
};
