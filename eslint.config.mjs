import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Règle d'architecture : seul le code serveur (src/server) accède à la base.
    files: ["src/app/**", "src/components/**", "src/lib/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/generated/prisma*", "@prisma/client*"], message: "Accès base réservé à src/server/modules." }] },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "src/generated/**", "next-env.d.ts"]),
]);
