# État des fonctionnalités

Mis à jour à chaque lot. Dernière mise à jour : 29/10/2026 (lot 0). Légende :
**Implémenté et testé** = code + tests automatisés au vert ·
**En cours** = code partiel, pas encore utilisable par un utilisateur ·
**Simulé** = affiché sans vraie logique derrière (aucun pour l'instant) ·
**Prévu** = pas encore commencé.

| Élément | Statut | Preuve |
| --- | --- | --- |
| Structure du projet, configuration TypeScript, ESLint, Tailwind | Implémenté et testé | CI GitHub Actions du 29/10 : install, typecheck, lint, build au vert |
| Environnement local Docker (PostgreSQL, MinIO, Mailpit) | En cours | `docker-compose.yml` ; pas encore testé sur une machine vierge |
| Validation des variables d'environnement | Implémenté et testé | `tests/unit/lib.test.ts` |
| Migration initiale : comptes, familles, événements, membres, comités, tâches, budget, audit | Implémenté et testé | `prisma migrate deploy` + `tests/db/migration.test.ts` (8 tests, local et CI) |
| Isolation entre familles en base (déclencheur) | Implémenté et testé | test « isolation » |
| Schéma Prisma aligné sur la migration | Implémenté et testé | étape CI `db:check` au vert (aucune différence) |
| Identifiants UUID v7, jetons d'invitation hachés, montants FCFA/EUR | Implémenté et testé | `tests/unit/lib.test.ts` |
| Matrice des rôles d'événement | Implémenté et testé (logique seule) | `tests/unit/permissions.test.ts` ; pas encore branchée sur une API |
| Confidentialité et anonymat des contributions | Implémenté et testé (logique seule) | `tests/unit/permissions.test.ts` ; branchée au lot 5 |
| Modèles de checklist par type de cérémonie | Implémenté et testé (logique seule) | `tests/unit/checklists.test.ts` ; écran au lot 3 |
| Page d'accueil | En cours | page d'information, sans bouton ni formulaire |
| Inscription et connexion par email (lot 1) | Prévu | — |
| Family Hub (lot 2), événements (lot 3) | Prévu | — |
| Lots 4 à 9 | Prévu | voir le backlog |
| Fichier `package-lock.json` versionné | Prévu | à ajouter : la CI installe pour l'instant les dernières versions compatibles |
| Paiements en ligne, WhatsApp automatisé, IA | Hors MVP | — |
