/**
 * Montants : toujours des entiers (bigint) dans l'unité mineure de la devise de l'événement.
 * - XOF (FCFA) n'a pas de subdivision : 200 000 FCFA est stocké 200000n.
 * - EUR est stocké en centimes : 12,50 € est stocké 1250n.
 * Aucun calcul en nombres flottants : pas d'erreur d'arrondi sur les totaux.
 */
export const CURRENCIES = ["XOF", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];

const MINOR_DIGITS: Record<Currency, number> = { XOF: 0, EUR: 2 };

/** Plafond de sécurité : 10 milliards d'unités, bien au-delà d'un budget familial réel. */
export const MAX_MINOR_AMOUNT = 10_000_000_000n * 100n;

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

/**
 * Convertit une saisie utilisateur (« 200 000 », « 12,50 », « 12.5 ») en unités mineures.
 * Refuse les négatifs, les décimales en trop et tout caractère inattendu.
 */
export function parseAmount(input: string, currency: Currency): bigint {
  const digits = MINOR_DIGITS[currency];
  const cleaned = input.replace(/[\s  ]/g, "").replace(",", ".");
  const re = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${digits}})?$`);
  if (!re.test(cleaned)) {
    throw new RangeError(
      digits === 0 ? "Montant invalide : nombre entier positif attendu" : `Montant invalide : au plus ${digits} décimales`,
    );
  }
  const [whole = "0", frac = ""] = cleaned.split(".");
  const minor = BigInt(whole) * 10n ** BigInt(digits) + BigInt(frac.padEnd(digits, "0") || "0");
  if (minor > MAX_MINOR_AMOUNT) {
    throw new RangeError("Montant trop élevé");
  }
  return minor;
}

/** Affichage localisé : « 200 000 F CFA », « 12,50 € ». */
export function formatAmount(minor: bigint, currency: Currency, locale = "fr-FR"): string {
  const digits = MINOR_DIGITS[currency];
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const unit = 10n ** BigInt(digits);
  const whole = abs / unit;
  const frac = abs % unit;
  // Intl accepte une chaîne décimale exacte : pas de passage par un flottant.
  const decimal = digits === 0 ? whole.toString() : `${whole}.${frac.toString().padStart(digits, "0")}`;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return formatter.format(`${negative ? "-" : ""}${decimal}` as `${number}`);
}

export function sumAmounts(values: readonly bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}
