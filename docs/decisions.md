# Décisions

## 2026-10-29 — Firebase pour la première version

**Choix :** site statique + Firebase (Authentication, Firestore, Hosting), sans serveur à gérer.

- **Avantages :** rien à héberger ni maintenir ; gratuit au démarrage (forfait Spark) ; outil déjà connu
  du porteur du projet (application Yond).
- **Limites :** toute la sécurité repose sur les règles Firestore ; sans Cloud Functions (forfait payant),
  les totaux visibles par les membres seront tenus à jour par le trésorier ; le stockage de photos exige
  le forfait Blaze (carte bancaire) depuis février 2026.
- **Alternative écartée pour la V1 :** Supabase (PostgreSQL, calculs de totaux côté base), plus adapté
  à la confidentialité des montants mais nouveau pour le porteur, et payant (≈ 25 $/mois) en production.

## 2026-10-29 — Confidentialité

- Un simple membre ne voit que les totaux du budget et des contributions.
- Une contribution peut être anonyme : seuls le contributeur et le trésorier voient le nom.
- Un événement n'est visible que de ses participants, même à l'intérieur de la famille.

## 2026-10-29 — Connexion par email d'abord

Email + mot de passe avec vérification obligatoire de l'adresse avant toute action dans une famille.
Le téléphone (OTP) viendra après la V1.

## Rôles

- Famille : propriétaire (créateur, rôle non transférable), administrateur, membre.
- Événement : organisateur, trésorier, membre. Un organisateur ne peut modifier que le rôle des autres :
  il reste donc toujours au moins un organisateur.
