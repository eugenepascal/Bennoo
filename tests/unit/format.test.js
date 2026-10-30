import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanName, normalizePhone, parseAmount, formatAmount, daysUntil, countdownLabel,
  generateToken, isToken, inviteUrl, whatsappShareUrl, inviteMessage, authErrorMessage, checkPassword, EVENT_TYPES,
} from "../../public/js/lib/format.js";

test("nom : espaces nettoyés, longueur bornée", () => {
  assert.equal(cleanName("  Awa   Diop "), "Awa Diop");
  assert.throws(() => cleanName("   "), /obligatoire/);
  assert.throws(() => cleanName("x".repeat(81)), /80/);
});

test("téléphone : formats sénégalais et français convertis en international", () => {
  assert.equal(normalizePhone("77 123 45 67"), "+221771234567");
  assert.equal(normalizePhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("00221 77 123 45 67"), "+221771234567");
  assert.equal(normalizePhone("+1 514 555 0199"), "+15145550199");
  assert.equal(normalizePhone(""), null);
  assert.throws(() => normalizePhone("12345"), /international/);
  assert.throws(() => normalizePhone("+221abc"), /international/);
});

test("montants FCFA : entiers uniquement", () => {
  assert.equal(parseAmount("6 000 000", "XOF"), 6_000_000);
  assert.equal(parseAmount("", "XOF"), 0);
  assert.throws(() => parseAmount("12,5", "XOF"), /entier/);
  assert.throws(() => parseAmount("-100", "XOF"));
  assert.throws(() => parseAmount("1e9", "XOF"));
});

test("montants EUR : centimes", () => {
  assert.equal(parseAmount("12,50", "EUR"), 1250);
  assert.equal(parseAmount("15000", "EUR"), 1_500_000);
  assert.throws(() => parseAmount("1,999", "EUR"), /décimales/);
  assert.throws(() => parseAmount("100000000001", "XOF"), /élevé/);
});

test("montants : affichage", () => {
  assert.match(formatAmount(6_000_000, "XOF"), /6[\s ]000[\s ]000/);
  assert.match(formatAmount(1250, "EUR"), /12,50/);
});

test("compte à rebours en jours calendaires", () => {
  const now = new Date(2026, 9, 29, 23, 30);
  assert.equal(daysUntil(new Date(2026, 9, 30, 0, 15), now), 1, "minuit franchi = 1 jour");
  assert.equal(countdownLabel(new Date(2026, 11, 14, 16), now), "J-46");
  assert.equal(countdownLabel(new Date(2026, 9, 29, 8), now), "Aujourd'hui");
  assert.equal(countdownLabel(new Date(2026, 9, 1), now), "Événement passé");
  assert.equal(countdownLabel(null, now), "Date à fixer");
});

test("jetons d'invitation : 43 caractères base64url, tous différents", () => {
  const set = new Set(Array.from({ length: 500 }, () => generateToken()));
  assert.equal(set.size, 500);
  for (const t of set) assert.ok(isToken(t), t);
  assert.equal(isToken("abc"), false);
  assert.equal(isToken("../".repeat(15)), false);
});

test("liens : invitation et partage WhatsApp encodés", () => {
  const t = "A".repeat(43);
  const url = inviteUrl("https://bennoo.web.app", "fam 1", t);
  assert.equal(url, `https://bennoo.web.app/#/rejoindre/fam%201/${t}`);
  const wa = whatsappShareUrl(inviteMessage("Famille Diop & Fall", url));
  assert.ok(wa.startsWith("https://wa.me/?text="));
  assert.ok(decodeURIComponent(wa).includes("Famille Diop & Fall"));
  assert.ok(!wa.includes(" "));
});

test("erreurs : messages compréhensibles, jamais techniques", () => {
  assert.match(authErrorMessage("auth/invalid-credential"), /incorrect/);
  assert.equal(authErrorMessage("auth/wrong-password"), authErrorMessage("auth/user-not-found"), "ne révèle pas si le compte existe");
  assert.match(authErrorMessage("code/inconnu"), /Réessayez/);
});

test("mot de passe : 8 caractères minimum", () => {
  assert.throws(() => checkPassword("1234567"), /8/);
  assert.equal(checkPassword("motdepasse"), "motdepasse");
});

test("types d'événements : les 8 du cahier des charges", () => {
  assert.equal(Object.keys(EVENT_TYPES).length, 8);
});
