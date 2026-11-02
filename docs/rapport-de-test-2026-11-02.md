# Rapport de test — 2 novembre 2026

Déroulé du [scénario de test](scenario-de-test.md) sur le site en ligne
(https://eugenepascal.github.io/Bennoo/) et le projet Firebase `bennoo-4186e`, règles Firestore
des étapes 1 à 4 publiées. Compte utilisé : le compte Google du propriétaire (rôle organisateur),
famille « Famille Ndour ». Les écritures sans compte ont été faites par l'API Firestore **sans
jeton de connexion**, comme le ferait un invité.

Données de test créées : l'événement « Mariage de Fatou & Mamadou » (1ᵉʳ janvier 2027), 13 tâches,
2 dépenses, 3 contributions, 1 comité, le carton et 1 foyer invité (« Famille Diallo »).

## Résultats

| Partie | Vérification | Résultat |
| --- | --- | --- |
| Événement | Assistant en 5 étapes, choix de la couverture (4 photos), lieu, budget 4 200 000 FCFA, 150 invités | ✅ |
| | Bandeau avec la photo choisie, J-60, onglets Aperçu / Tâches / Budget / Invités / Participants | ✅ |
| | Carte Google Maps du lieu au clic | ✅ |
| Tâches | Checklist mariage : 12 tâches ; tâche manuelle assignée, en cours | ✅ |
| | Case cochée → « Terminée », compteurs des filtres à jour | ✅ |
| | Calendrier : jours marqués, jour de l'événement doré | ✅ |
| | Calendrier : liste des tâches du jour choisi | ❌ puis ✅ **corrigé** |
| | Kanban : 3 colonnes, déplacement par bouton | ✅ |
| | Détail d'une tâche, changement de statut | ✅ |
| | Aperçu : 15 % (2 tâches sur 13), 11 tâches restantes | ✅ |
| | « Mes tâches » : liste « Toutes les tâches à faire » | ❌ puis ✅ **corrigé** |
| Budget | 2 dépenses : engagées 2 300 000, répartition 65 % / 35 %, filtre « À payer » | ✅ |
| | Passage d'une dépense en « Payée » | ✅ |
| | Formulaire de contribution | ❌ puis ✅ **corrigé** (ne s'ouvrait pas) |
| | Contribution promise, contribution **anonyme** déclarée, don **en nature** | ✅ |
| | L'organisateur voit « Contributeur anonyme » (nom vide dans la base) | ✅ |
| | L'organisateur ne peut pas confirmer une contribution | ✅ refusé par les règles |
| | Créer directement une contribution « confirmée » | ✅ refusé par les règles |
| | Totaux partagés : engagées 2 300 000, en attente 1 500 000, confirmées 0 | ✅ |
| Invités | Carton non publié puis publié (« Fatou & Mamadou », message) | ✅ |
| | 2 foyers ; compteurs ; WhatsApp vers le numéro saisi | ✅ |
| | Partager : QR code, lien, WhatsApp, e-mail, SMS, « Voir les réponses » | ✅ |
| | **Sans compte** : lecture du carton et de son invitation | ✅ |
| | **Sans compte** : lire la liste des invités, l'événement, les tâches | ✅ refusé |
| | **Sans compte** : répondre 5 personnes pour 4 places / changer le nombre de places | ✅ refusé |
| | **Sans compte** : répondre « oui, 3 personnes » avec un mot | ✅ |
| | Page de réponse : 5 personnes refusé avec message ; « Non » masque le nombre | ✅ |
| | Organisateur : « Vient (3/4) », 3 personnes confirmées ; aperçu « 3 invités confirmés » | ✅ |
| | Heure modifiée dans l'événement → carton à jour | ✅ |
| | Foyer retiré / jeton inventé → « Cette invitation n'existe plus » | ✅ |
| Comités | Création « Comité accueil », visible dans l'onglet Comités de la famille | ✅ |
| Accueil | Recherche, événement mis en avant, barre d'avancement, activité récente | ✅ |
| Budget (barre) | Anneau par événement, reste à financer | ✅ |

## Corrections faites pendant le test

1. **Calendrier et « Mes tâches »** : les tâches ne s'affichaient pas (liste ajoutée au mauvais format).
2. **Formulaire de contribution** : l'écran plantait (conflit de nom avec une fonction du navigateur).
3. **Checklist** : pour un événement proche, des échéances tombaient dans le passé (« en retard » dès la
   création) ; elles sont désormais ramenées à aujourd'hui. Les 4 tâches de l'événement de test créées
   avant ce correctif gardent leur date passée (modifiables dans chaque tâche).
4. **Vue téléphone** : « J-60 » sur une seule ligne ; bandeau de l'événement réduit dans les sous-pages
   (Tâches, Budget…) ; ornements du carton qui ne chevauchent plus les prénoms ; calendrier compact
   sur grand écran.

## Comparaison avec les maquettes

Conformes en structure, couleurs et contenu : tableau de bord (7), tâches (8), calendrier (9),
budget et contributions (10), invitation et partage (11), version ordinateur (14), planches 3 et 4.
Écarts restants : photos personnelles et album (forfait Blaze), plan de table, rôle « invité »
choisi par l'utilisateur, boutons Appeler / Message d'un membre (téléphone privé).

## Reste à tester (un second compte est nécessaire)

- Rejoindre la famille avec un lien d'invitation (parties 1 et 2).
- Le **trésorier** : confirmer les contributions, voir le nom du contributeur anonyme, enregistrer
  un don reçu, anneau et provenances avec des montants confirmés (partie 4).
- Le **simple membre** : ne voir que les totaux du budget ; changer seulement le statut de ses tâches.
