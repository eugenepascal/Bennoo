/**
 * Configuration Firebase du projet Bennoo.
 *
 * Ces valeurs ne sont PAS secrètes : elles identifient le projet et sont visibles par
 * tout navigateur. La sécurité repose sur firestore.rules, jamais sur ce fichier.
 *
 * À compléter avec la configuration web du projet Firebase (console Firebase >
 * Paramètres du projet > Vos applications > Configuration).
 */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

/** En local (localhost), l'application utilise les émulateurs Firebase : aucune donnée réelle. */
export const useEmulators = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname ?? "");

export const emulatorConfig = {
  apiKey: "demo-key",
  authDomain: "demo-bennoo.firebaseapp.com",
  projectId: "demo-bennoo",
  appId: "demo-app",
};

export function isConfigured() {
  return useEmulators || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}
