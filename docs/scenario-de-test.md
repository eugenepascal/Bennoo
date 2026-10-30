# Scénario de test de Bennoo — du compte à la réponse des invités

Objectif : vérifier de bout en bout, sur le vrai site (https://eugenepascal.github.io/Bennoo/) et le vrai
projet Firebase, que chaque écran fait ce qu'il annonce et que la confidentialité est respectée.
Chaque étape donne l'action puis le **résultat attendu** : si le résultat diffère, noter le numéro de
l'étape et le message affiché.

## Avant de commencer

| Besoin | Détail |
| --- | --- |
| Règles Firestore à jour | Console Firebase → Firestore → Règles : coller tout `firestore.rules`, puis **Publier** |
| Index | Exemptions `uid` (groupe de collections, croissant) sur `members` et `participants` : déjà faites |
| Compte A — « Awa », organisatrice | Votre compte Google (pasou1000@gmail.com) |
| Compte B — « Moussa », trésorier | Une **autre** adresse email (inscription par email, ou un autre compte Google), dans une fenêtre de navigation privée ou un autre navigateur |
| Invité sans compte | Une 3ᵉ fenêtre privée (ou un téléphone) : aucun compte |

Astuce : gardez A dans votre Chrome normal et B dans une fenêtre privée, côte à côte.

---

## Partie 1 — Comptes et famille

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 1 | A | Ouvrir le site, « Se connecter », **Continuer avec Google**, choisir le compte | Accueil « Bonjour … 👋 » |
| 2 | A | Si aucune famille : saisir « Famille Test Bennoo », **Créer la famille** | Page de la famille, 1 membre, rôle Propriétaire |
| 3 | A | Onglet Membres → **+ Inviter un membre** → **Créer un lien** | Un lien valable 7 jours, boutons WhatsApp et Copier |
| 4 | A | **Copier** le lien | Message « Lien copié » |
| 5 | B | Dans la fenêtre privée, coller le lien | Écran de lancement de Bennoo (le lien est gardé pour après la connexion) → **Commencer** puis **Passer** |
| 6 | B | **Créer un compte** (Prénom Moussa, Nom Test, email, mot de passe 8 caractères, accepter les conditions) | Écran « Vérifiez votre email » |
| 7 | B | Cliquer le lien reçu par email, revenir sur l'onglet Bennoo, puis **J'ai cliqué sur le lien** | Écran « Famille Test Bennoo — Vous êtes invité(e) », bouton **Rejoindre la famille** (sinon : rouvrir le lien d'invitation) |
| 8 | B | **Rejoindre la famille** | Page de la famille ; Moussa apparaît comme Membre |
| 9 | A | Recharger la page de la famille | 2 membres : vous (Propriétaire) et Moussa (Membre) |

## Partie 2 — Événement et participants

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 10 | A | Accueil → **+ Créer** | Assistant en 5 étapes |
| 11 | A | Type **Mariage** → Nom « Mariage de Fatou & Mamadou » → date dans ~2 mois, 16:00, lieu « Hôtel Terrou-Bi », ville « Dakar » → devise FCFA, budget **4 200 000**, 150 invités → cocher **Moussa** avec le rôle **Trésorier** → **Créer l'événement** | Tableau de bord : J - n, budget global 4 200 000 F CFA, onglets Aperçu, Tâches, Budget, Invités, Participants |
| 12 | A | Onglet **Participants** | Vous : Organisateur ; Moussa : Trésorier |
| 13 | B | Accueil (recharger) | L'événement apparaît avec le rôle Trésorier ; **pas** d'onglet Invités |

## Partie 3 — Tâches et calendrier (maquettes 8 et 9)

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 14 | A | Onglet **Tâches** | « Aucune tâche » et le bouton **Ajouter la checklist suggérée** (12 tâches pour un mariage) |
| 15 | A | **Ajouter la checklist suggérée** | 12 tâches avec des échéances calculées avant la date du mariage ; filtres « Toutes (12) », « À faire (12) »… |
| 16 | A | **+ Nouvelle tâche** : « Confirmer le traiteur avec Moussa », échéance dans 3 jours, statut En cours, responsable **Moussa** → **Créer la tâche** | La tâche apparaît, puce bleue « En cours », « Moussa Test » sous l'échéance |
| 17 | A | Cocher la case de « Réserver la salle » | Message « Tâche terminée », puce verte, compteur « Terminées (1) » |
| 18 | A | **Calendrier** | Mois en cours ; points sous les jours qui ont une tâche ; flèche › jusqu'au mois du mariage : jour en doré |
| 19 | A | Cliquer un jour avec un point | Seules les tâches de ce jour s'affichent |
| 20 | B | Ouvrir l'événement → Tâches | Les 13 tâches sont visibles ; seule la case de « Confirmer le traiteur… » est cochable |
| 21 | B | Ouvrir cette tâche → **Terminée** | « Statut : terminée » ; pas de formulaire de modification ni de suppression pour Moussa |
| 22 | A | **Aperçu** | Anneau « Organisation » à 15 % (2 tâches sur 13), « Tâches restantes : 11 », 3 prochaines tâches listées |

## Partie 4 — Budget, dépenses et contributions (maquette 10, planches 3 et 4)

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 23 | A | Onglet **Budget** | Budget global 4 200 000 F CFA, 0 % financé ; sous-onglets Dépenses / Contributions |
| 24 | A | **+ Ajouter une dépense** : 1 500 000, Payée, « Location de la salle », Salle et lieu, Terrou-Bi → **Ajouter** | Dépense listée avec puce « Payée » ; « Répartition des dépenses » : Salle et lieu 100 % |
| 25 | A | Ajouter : 800 000, À payer, « Traiteur », Traiteur et repas | Filtre **À payer** : seulement le traiteur ; répartition 65 % / 35 % ; « Dépenses engagées » 2 300 000, « Dont payées » 1 500 000 |
| 26 | A | Cliquer « Traiteur », passer en **Payée**, **Enregistrer** | « Dont payées » 2 300 000 |
| 27 | B | Budget → Contributions → **+ Ajouter ma contribution** : 500 000, « Déclarée : j'ai déjà donné », **cocher « Contribuer anonymement »** → **Déclarer** | Contribution listée « Moussa Test (anonyme) », puce bleue « Déclarée » |
| 28 | A | Budget → **Contributions** | La même contribution apparaît comme **« Contributeur anonyme »** (avatar « ? ») : l'organisatrice ne voit pas le nom |
| 29 | A | **+ Ajouter ma contribution** : 1 000 000, « Promise », sans anonymat | Ligne avec votre nom, puce dorée « Promise » ; pas de menu de statut pour vous (vous n'êtes pas trésorière) |
| 30 | B | Contributions → menu de statut de la contribution d'Awa → **Confirmée** ; idem pour sa propre contribution | Puces vertes « Confirmée » ; carte du budget : contributions confirmées 1 500 000, reste à financer 2 700 000, 36 % financé |
| 31 | B | **Enregistrer un don reçu d'un proche** : « Tonton Ali », 200 000, Confirmée | Ligne « Tonton Ali », « enregistrée par le trésorier » |
| 32 | A | Budget, sous-onglet Dépenses : regarder la carte du budget | Contributions confirmées 1 700 000, reste à financer 2 500 000, 40 % financé |
| 33 | A | **Aperçu** | Contributions : 1 700 000 F CFA, « 3 contributions confirmées » |

Option à 3 comptes (contrôle complet de la vue « simple membre ») : inviter un compte C, l'ajouter à
l'événement comme **Membre**, puis dans son onglet Budget vérifier qu'il voit **seulement les totaux**
et « Mes contributions », **jamais** la liste des dépenses ni les noms des contributeurs.

## Partie 5 — Invités et réponse sans compte (maquette 11)

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 34 | A | Onglet **Invités** → **Carton d'invitation** | Aperçu violet et doré avec le titre, le jour en grand, le mois, l'heure et le lieu ; mention « non publié » |
| 35 | A | « Qui invite ? » : Fatou & Mamadou ; message « Votre présence sera notre plus beau cadeau » → **Publier le carton** | « Carton publié » ; l'aperçu affiche les prénoms en italique doré |
| 36 | A | Onglet Invités : foyer « Famille Diallo », **4** places, téléphone vide → **Ajouter et obtenir le lien** | Ligne « Famille Diallo », « 4 places », puce « Sans réponse » ; compteurs 4 places · 1 foyer, 0 confirmée |
| 37 | A | Ajouter « Famille Ndiaye », 2 places, votre propre numéro au format +221… ou +33… | Le bouton WhatsApp ouvre une conversation avec ce numéro, message pré-rempli contenant le lien |
| 38 | A | Sur « Famille Diallo », **Copier le lien** | « Lien copié » |
| 39 | Invité | Fenêtre privée **sans compte** : coller le lien | Page « Vous êtes invités » : carton, « Famille Diallo · 4 places réservées », formulaire de réponse ; aucun menu, aucune donnée de la famille |
| 40 | Invité | **Oui**, 3 personnes, mot « Nous avons hâte ! » → **Envoyer ma réponse** | « Merci ! 3 personnes présentes, c'est noté. » |
| 41 | Invité | Essayer 5 personnes | Refus : « Indiquez entre 1 et 4 personnes » |
| 42 | A | Recharger l'onglet Invités | Famille Diallo : puce verte « Vient (3/4) », « « Nous avons hâte ! » » ; compteurs : 3 personnes confirmées, 1 sans réponse |
| 43 | A | **Aperçu** | « Invités confirmés : 3 » |
| 44 | A | **Modifier** l'événement : changer l'heure → Enregistrer, puis rouvrir le lien invité | Le carton affiche la nouvelle heure |
| 45 | A | Invités → **Retirer** Famille Ndiaye, puis ouvrir son lien | « Cette invitation n'existe plus » |

## Partie 6 — Contrôles de sécurité rapides

| # | Qui | Action | Résultat attendu |
| --- | --- | --- | --- |
| 46 | B | Taper à la main l'adresse `…/invites` de l'événement | « La liste des invités est réservée aux organisateurs » |
| 47 | Invité | Modifier une lettre du jeton dans le lien | « Cette invitation n'existe plus » ou « lien non valide » |
| 48 | B | Paramètres → **Se déconnecter**, puis rouvrir l'adresse de l'événement | Écran d'accueil : rien de l'événement n'est visible sans compte |

---

## Ce qui n'est pas encore à tester

Album photos et justificatifs (forfait Blaze), QR code des invitations, rappels automatiques,
installation sur téléphone, suppression de compte, plan de table, Diaspora Mode, assistant IA.

## Données de test

Les familles et événements ne peuvent pas être supprimés depuis l'application (choix de sécurité de
la V1). Après l'essai, ils peuvent être supprimés dans la console Firebase (Firestore → Données).
