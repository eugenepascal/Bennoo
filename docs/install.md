# Installation locale

Prérequis : Node.js 22 LTS, Docker, client `psql` (pour les tests de base).

```bash
git clone https://github.com/eugenepascal/bennoo.git
cd bennoo
cp .env.example .env              # puis renseigner BETTER_AUTH_SECRET (32 caractères minimum)
docker compose up -d              # PostgreSQL :5432, MinIO :9000 (console :9001), Mailpit :8025
npm install
npm run db:migrate                # applique prisma/migrations
npm run dev                       # http://localhost:3000
```

## Vérifications

```bash
npm run typecheck
npm run lint
npm run test:unit
PGHOST=localhost PGUSER=bennoo PGPASSWORD=bennoo npm run test:db   # crée puis supprime une base temporaire
npm run db:check                  # le schéma Prisma doit correspondre aux migrations
npm run build
```

`npm run check` enchaîne typecheck, lint, tests et build.

## Modifier la base

1. Écrire une nouvelle migration dans `prisma/migrations/<horodatage>_<nom>/migration.sql`
   (ou la générer avec `npx prisma migrate dev --create-only`, puis la relire).
2. Mettre à jour `prisma/schema.prisma` pour qu'il corresponde.
3. Ajouter les tests de contraintes dans `tests/db/`.
4. Ne jamais modifier une migration déjà appliquée en production.
