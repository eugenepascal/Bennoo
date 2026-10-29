# ADR 0002 — Confidentialité et anonymat des contributions

Date : 2026-10-29 · Statut : accepté (décision du porteur du projet)

## Décision

1. Un simple membre (rôle MEMBER) ne reçoit que les **totaux** du budget et des contributions,
   plus sa propre contribution. Jamais le détail des autres.
2. Une contribution peut être marquée **anonyme**. Son nom n'est renvoyé qu'au contributeur
   lui-même et aux personnes qui peuvent la confirmer : les trésoriers, ou les organisateurs
   si l'événement n'a pas de trésorier. Tous les autres, organisateurs et co-organisateurs
   compris, reçoivent « Anonyme ».
3. Le filtrage est fait **côté serveur**, avant l'envoi de la réponse
   (`src/server/modules/contributions/visibility.ts`). L'interface ne reçoit jamais un nom masqué.

## Pourquoi le trésorier voit le nom

Confirmer une contribution, c'est attester qu'un versement a bien été reçu de quelqu'un.
Sans connaître l'identité, la confirmation serait invérifiable et ouvrirait la porte aux litiges.

## Limites

- L'anonymat ne protège pas contre un recoupement manuel (par exemple une seule contribution
  de 500 000 FCFA dans une petite famille). L'interface le rappellera au moment du choix.
- Les administrateurs techniques de la base peuvent techniquement lire les données ; l'accès
  à la production est donc restreint et journalisé.

## Tests

`tests/unit/permissions.test.ts` : membre simple, contributeur anonyme, organisateur avec et
sans trésorier, co-organisateur, trésorier, lecteur.
