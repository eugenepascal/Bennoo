# ADR 0001 — Monolithe modulaire Next.js

Date : 2026-10-29 · Statut : accepté

## Décision

Une seule application Next.js 16 (TypeScript strict) contient les pages et l'API REST `/api/v1`.
Les deux appellent les mêmes modules métier dans `src/server/modules`, seuls autorisés à accéder
à la base (règle ESLint). PostgreSQL 16, Prisma 7, Better Auth 1.6.

## Avantages

Un seul déploiement et un seul langage ; types partagés sans paquet commun ; coût d'hébergement minimal.

## Limites

Moins de structure imposée qu'avec NestJS : la séparation des couches repose sur la discipline et sur le lint.

## Alternatives

NestJS + Next.js en deux applications : pertinent si une application mobile native ou une équipe
backend dédiée arrive. Les modules métier ne dépendant pas de Next.js, l'extraction resterait mécanique.

## Note sur les migrations

La migration initiale est écrite en SQL pour porter des garanties que Prisma ne sait pas exprimer
(contraintes CHECK, déclencheur d'isolation entre familles). La CI vérifie que `schema.prisma`
correspond exactement à la base obtenue (`npm run db:check`).
