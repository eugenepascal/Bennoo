/**
 * Validation des variables d'environnement au démarrage.
 * L'application refuse de démarrer si une variable obligatoire manque ou est invalide,
 * plutôt que d'échouer plus tard sur une requête d'utilisateur.
 * Volontairement sans dépendance : ce module est chargé avant tout le reste.
 */
export interface AppEnv {
  databaseUrl: string;
  appUrl: URL;
  betterAuthSecret: string;
  s3: { endpoint: URL; region: string; bucket: string; accessKeyId: string; secretAccessKey: string };
  smtp: { host: string; port: number; user: string; password: string; from: string };
  isProduction: boolean;
}

export class EnvError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Configuration invalide :\n- ${problems.join("\n- ")}`);
    this.name = "EnvError";
    this.problems = problems;
  }
}

type Source = Record<string, string | undefined>;

export function parseEnv(source: Source): AppEnv {
  const problems: string[] = [];
  const isProduction = source.NODE_ENV === "production";

  const required = (name: string): string => {
    const value = source[name]?.trim();
    if (!value) {
      problems.push(`${name} est obligatoire`);
      return "";
    }
    return value;
  };
  const url = (name: string): URL => {
    const raw = required(name);
    try {
      return new URL(raw || "http://invalid.local");
    } catch {
      problems.push(`${name} n'est pas une URL valide`);
      return new URL("http://invalid.local");
    }
  };

  const databaseUrl = required("DATABASE_URL");
  if (databaseUrl && !/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push("DATABASE_URL doit commencer par postgresql://");
  }

  const appUrl = url("APP_URL");
  if (isProduction && appUrl.protocol !== "https:") {
    problems.push("APP_URL doit être en https en production");
  }

  const betterAuthSecret = required("BETTER_AUTH_SECRET");
  if (betterAuthSecret && betterAuthSecret.length < 32) {
    problems.push("BETTER_AUTH_SECRET doit contenir au moins 32 caractères");
  }

  const s3 = {
    endpoint: url("S3_ENDPOINT"),
    region: required("S3_REGION"),
    bucket: required("S3_BUCKET"),
    accessKeyId: required("S3_ACCESS_KEY_ID"),
    secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
  };

  const portRaw = required("SMTP_PORT");
  const port = Number(portRaw);
  if (portRaw && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    problems.push("SMTP_PORT doit être un port entre 1 et 65535");
  }
  const smtp = {
    host: required("SMTP_HOST"),
    port,
    user: source.SMTP_USER?.trim() ?? "",
    password: source.SMTP_PASSWORD ?? "",
    from: required("EMAIL_FROM"),
  };

  if (problems.length > 0) {
    throw new EnvError(problems);
  }
  return { databaseUrl, appUrl, betterAuthSecret, s3, smtp, isProduction };
}
