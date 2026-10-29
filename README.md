# Bennoo

**Une cérémonie, toute la famille, un seul endroit.**

Bennoo (anciennement NioFar) aide les familles du Sénégal et de la diaspora à organiser ensemble
leurs événements : mariages, baptêmes / ngenté, communions, anniversaires, réunions familiales.
Parcours : Créer → Organiser → Financer → Inviter → Coordonner → Célébrer → Conserver.

## État d'avancement

Voir [`docs/status.md`](docs/status.md) : chaque fonctionnalité y est classée
**Implémenté et testé**, **En cours**, **Simulé** ou **Prévu**. Rien n'est déclaré terminé sans test.

## Démarrer

Voir [`docs/install.md`](docs/install.md).

```bash
npm run check      # typecheck + lint + tests + build
npm run test:unit  # tests unitaires (sans base)
npm run test:db    # tests des migrations sur PostgreSQL (psql requis)
```

## Architecture

Monolithe modulaire Next.js 16 + PostgreSQL 16 (Prisma 7). Décisions documentées dans
[`docs/adr/`](docs/adr). Plan complet et backlog : document « Bennoo — Architecture et backlog du MVP ».

```
prisma/            schéma et migrations SQL versionnées
src/app/           pages (App Router) et routes d'API
src/lib/           utilitaires purs : identifiants, jetons, montants, configuration
src/server/modules logique métier par module (règles d'accès, services)
tests/unit         tests sans base de données
tests/db           tests des contraintes PostgreSQL
```

## Confidentialité

Un simple membre ne voit que les totaux du budget et des contributions. Une contribution
peut être anonyme : seuls le contributeur et le trésorier qui la confirme voient le nom.
Ce filtrage est fait côté serveur. Détails : [`docs/adr/0002-confidentialite-contributions.md`](docs/adr/0002-confidentialite-contributions.md).
