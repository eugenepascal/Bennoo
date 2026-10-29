/**
 * Fonctions pures (sans Firebase ni DOM) : validation des saisies, montants, dates, liens.
 * Testées par tests/unit/format.test.js.
 */

export const EVENT_TYPES = {
  WEDDING: "Mariage",
  NAMING_CEREMONY: "Baptême / Ngenté",
  COMMUNION: "Communion",
  BIRTHDAY: "Anniversaire",
  RELIGIOUS_CEREMONY: "Cérémonie religieuse",
  FAMILY_REUNION: "Réunion familiale",
  TRADITIONAL_CEREMONY: "Cérémonie traditionnelle",
  CUSTOM: "Événement personnalisé",
};

export const FAMILY_ROLES = { owner: "Propriétaire", admin: "Administrateur", member: "Membre" };
export const EVENT_ROLES = { organizer: "Organisateur", treasurer: "Trésorier", member: "Membre" };
export const CURRENCIES = { XOF: "FCFA", EUR: "Euro" };

/** Nom affiché : 1 à 80 caractères, espaces superflus retirés. */
export function cleanName(input) {
  const v = String(input ?? "").replace(/\s+/g, " ").trim();
  if (v.length < 1) throw new Error("Le nom est obligatoire.");
  if (v.length > 80) throw new Error("Le nom ne doit pas dépasser 80 caractères.");
  return v;
}

/**
 * Téléphone au format international (+221…). Accepte « 77 123 45 67 » pour le Sénégal
 * et « 06 12 34 56 78 » pour la France. Chaîne vide = pas de téléphone (null).
 */
export function normalizePhone(input) {
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
export function parseAmount(input, currency) {
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
export function formatAmount(minor, currency) {
  const digits = currency === "EUR" ? 2 : 0;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

/** Nombre de jours avant l'événement (calendrier, fuseau de l'appareil). Négatif si passé. */
export function daysUntil(date, now = new Date()) {
  const startOfDay = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
}

export function countdownLabel(date, now = new Date()) {
  if (!date) return "Date à fixer";
  const n = daysUntil(date, now);
  if (n > 1) return `J-${n}`;
  if (n === 1) return "Demain";
  if (n === 0) return "Aujourd'hui";
  return "Événement passé";
}

export function formatDate(date) {
  if (!date) return "Date à fixer";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Jeton d'invitation : 32 octets aléatoires en base64url (43 caractères), impossible à deviner. */
export function generateToken(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(32);
  cryptoImpl.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export const INVITE_DAYS = 7;

export function inviteUrl(origin, familyId, token) {
  return `${origin}/#/rejoindre/${encodeURIComponent(familyId)}/${token}`;
}

/** Lien de partage WhatsApp (ouvre WhatsApp avec le message pré-rempli, sans API). */
export function whatsappShareUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function inviteMessage(familyName, url) {
  return `Bonjour ! Rejoins « ${familyName} » sur Bennoo pour organiser nos événements en famille : ${url} (lien valable ${INVITE_DAYS} jours)`;
}

/** Messages d'erreur Firebase traduits pour l'utilisateur ; jamais de détail technique. */
export function authErrorMessage(code) {
  const map = {
    "auth/invalid-email": "Adresse email invalide.",
    "auth/email-already-in-use": "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez le mot de passe.",
    "auth/weak-password": "Mot de passe trop faible : 8 caractères minimum.",
    "auth/invalid-credential": "Email ou mot de passe incorrect.",
    "auth/wrong-password": "Email ou mot de passe incorrect.",
    "auth/user-not-found": "Email ou mot de passe incorrect.",
    "auth/too-many-requests": "Trop de tentatives. Patientez quelques minutes puis réessayez.",
    "auth/network-request-failed": "Pas de connexion internet. Vérifiez votre réseau.",
    "permission-denied": "Action non autorisée.",
    "unavailable": "Service momentanément indisponible. Réessayez.",
  };
  return map[code] ?? "Une erreur est survenue. Réessayez.";
}

export function checkPassword(pw) {
  if (typeof pw !== "string" || pw.length < 8) throw new Error("Mot de passe trop court : 8 caractères minimum.");
  if (pw.length > 128) throw new Error("Mot de passe trop long.");
  return pw;
}
