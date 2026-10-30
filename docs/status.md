# État des fonctionnalités

Légende : **Fait et testé** · **En cours** · **Simulé** (aucun) · **Prévu**.
Rien n'est déclaré fait sans test automatisé au vert.

| Étape | Fonctionnalité | Statut | Preuve |
| --- | --- | --- | --- |
| 1 | Écran de lancement et présentation (3 écrans) | En cours | maquettes 1 et 2 |
| 1 | Inscription (prénom, nom, conditions), connexion, déconnexion par email | En cours | tests/e2e/parcours.spec.js (CI) |
| 1 | Vérification de l'email obligatoire | En cours | tests e2e + règles |
| 1 | Mot de passe oublié (réponse neutre) | En cours | tests e2e |
| 1 | Profil (nom, téléphone) | En cours | règles testées ; écran sans test e2e dédié |
| 1 | Créer une famille, membres et rôles | En cours | tests règles + e2e |
| 1 | Lien d'invitation 7 jours, partage WhatsApp | En cours | tests règles + e2e |
| 1 | Créer un événement en 5 étapes, le modifier, tableau de bord | En cours | tests règles + e2e |
| 1 | Participants et rôles d'événement, confidentialité de l'événement | En cours | tests règles + e2e |
| 2 | Tâches et checklists | Prévu | |
| 3 | Budget, contributions, anonymat | Prévu | |
| 4 | Invités et RSVP | Prévu | |
| 5 | Tableau de bord, installation sur téléphone, mise en ligne | Prévu | |
| 6 | Album photos | Prévu | nécessite le forfait Firebase Blaze |

Les lignes « En cours » passent à « Fait et testé » quand la CI GitHub est au vert.
