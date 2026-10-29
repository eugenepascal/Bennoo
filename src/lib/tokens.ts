import { createHash, randomBytes } from "node:crypto";

/**
 * Jetons des liens partagés (invitation d'un membre, RSVP d'un invité).
 *
 * Le jeton en clair n'existe que dans le lien envoyé ; la base ne stocke que son
 * empreinte SHA-256. Une fuite de la base ne permet donc pas de reconstruire les liens.
 * 32 octets aléatoires = 256 bits : impossible à deviner par essais successifs.
 */
export const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** Rejette d'emblée tout ce qui n'a pas la forme d'un jeton, sans interroger la base. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_RE.test(value);
}

export function hashToken(token: string): string {
  if (!isWellFormedToken(token)) {
    throw new TypeError("hashToken: jeton mal formé");
  }
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Date d'expiration d'un lien d'invitation de membre (7 jours par défaut). */
export function invitationExpiry(from: Date = new Date(), days = 7): Date {
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new RangeError("invitationExpiry: durée entre 1 et 30 jours");
  }
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
