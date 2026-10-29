import { getRandomValues } from "node:crypto";

/**
 * Génère un UUID v7 (RFC 9562) : 48 bits d'horodatage en millisecondes, puis de l'aléa.
 * Les identifiants sont donc triables par date de création sans exposer de compteur
 * séquentiel devinable (on ne peut pas énumérer les familles ou événements des autres).
 */
export function uuidv7(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError("uuidv7: horodatage invalide");
  }
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);

  // 48 bits de temps, poids fort en premier.
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // variante RFC

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Vérifie qu'une valeur reçue d'un client est bien un UUID v7 (avant toute requête en base). */
export function isUuidv7(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
