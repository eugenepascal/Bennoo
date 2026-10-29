import { test } from "node:test";
import assert from "node:assert/strict";
import { uuidv7, isUuidv7 } from "../../src/lib/ids.ts";
import { generateToken, hashToken, isWellFormedToken, invitationExpiry } from "../../src/lib/tokens.ts";
import { parseAmount, formatAmount, sumAmounts } from "../../src/lib/money.ts";
import { parseEnv, EnvError } from "../../src/lib/env.ts";

test("uuidv7 : format, unicité et ordre chronologique", () => {
  const a = uuidv7(1_700_000_000_000);
  const b = uuidv7(1_700_000_000_001);
  assert.ok(isUuidv7(a) && isUuidv7(b));
  assert.ok(a < b, "un identifiant plus récent se trie après");
  const many = new Set(Array.from({ length: 1000 }, () => uuidv7()));
  assert.equal(many.size, 1000);
  assert.equal(isUuidv7("00000000-0000-4000-8000-000000000000"), false, "un UUID v4 est refusé");
  assert.equal(isUuidv7("1 OR 1=1"), false);
  assert.throws(() => uuidv7(-1), RangeError);
});

test("jetons : 256 bits aléatoires, seule l'empreinte est stockée", () => {
  const t = generateToken();
  assert.ok(isWellFormedToken(t));
  assert.notEqual(generateToken(), t);
  const h = hashToken(t);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(t), h, "empreinte déterministe pour retrouver l'invitation");
  assert.ok(!h.includes(t));
  assert.throws(() => hashToken("trop-court"), TypeError);
});

test("jetons : expiration à 7 jours, bornée", () => {
  const from = new Date("2026-10-29T12:00:00Z");
  assert.equal(invitationExpiry(from).toISOString(), "2026-11-05T12:00:00.000Z");
  assert.throws(() => invitationExpiry(from, 0), RangeError);
  assert.throws(() => invitationExpiry(from, 365), RangeError);
});

test("montants FCFA : entiers, espaces acceptés", () => {
  assert.equal(parseAmount("200 000", "XOF"), 200000n);
  assert.equal(parseAmount("200 000", "XOF"), 200000n);
  assert.throws(() => parseAmount("12,5", "XOF"), RangeError, "pas de centimes en FCFA");
  assert.throws(() => parseAmount("-500", "XOF"), RangeError);
  assert.throws(() => parseAmount("1e6", "XOF"), RangeError);
  assert.throws(() => parseAmount("", "XOF"), RangeError);
});

test("montants EUR : centimes, virgule ou point", () => {
  assert.equal(parseAmount("12,50", "EUR"), 1250n);
  assert.equal(parseAmount("12.5", "EUR"), 1250n);
  assert.equal(parseAmount("7", "EUR"), 700n);
  assert.throws(() => parseAmount("1,234", "EUR"), RangeError);
});

test("montants : affichage localisé sans flottant", () => {
  const xof = formatAmount(4_300_000n, "XOF");
  assert.match(xof, /4[\s ]300[\s ]000/);
  assert.match(xof, /CFA/);
  assert.match(formatAmount(1250n, "EUR"), /12,50[\s ]€/);
  // Au-delà de la précision des flottants (2^53), l'affichage reste exact.
  assert.match(formatAmount(9_007_199_254_740_993n, "XOF"), /993/);
  assert.equal(sumAmounts([1n, 2n, 3n]), 6n);
});

const validEnv = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  APP_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "x".repeat(32),
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "eu-west-3",
  S3_BUCKET: "b",
  S3_ACCESS_KEY_ID: "k",
  S3_SECRET_ACCESS_KEY: "s",
  SMTP_HOST: "localhost",
  SMTP_PORT: "1025",
  EMAIL_FROM: "Bennoo <no-reply@localhost>",
};

test("configuration : valide", () => {
  const env = parseEnv(validEnv);
  assert.equal(env.smtp.port, 1025);
  assert.equal(env.appUrl.origin, "http://localhost:3000");
});

test("configuration : toutes les erreurs sont listées ensemble", () => {
  try {
    parseEnv({ ...validEnv, DATABASE_URL: "mysql://x", BETTER_AUTH_SECRET: "court", SMTP_PORT: "99999", S3_BUCKET: "" });
    assert.fail("aurait dû échouer");
  } catch (e) {
    assert.ok(e instanceof EnvError);
    assert.equal(e.problems.length, 4, e.message);
  }
});

test("configuration : https obligatoire en production", () => {
  assert.throws(() => parseEnv({ ...validEnv, NODE_ENV: "production" }), /https/);
});
