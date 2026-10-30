# Bennoo — Une cérémonie, toute la famille, un seul endroit.

Bennoo (anciennement **NioFar**) est une application web qui permet aux familles d'organiser
ensemble leurs événements : mariage, baptême / ngenté, communion, anniversaire, cérémonie
religieuse, réunion familiale, cérémonie traditionnelle ou événement personnalisé.

Elle s'adresse aux familles du **Sénégal et de la diaspora** (France, Belgique, Italie, Espagne,
Canada, États-Unis…) qui organisent elles-mêmes, sans organisateur professionnel.

**Parcours :** Créer → Organiser → Financer → Inviter → Coordonner → Célébrer → Conserver.

---

## Sommaire

1. [État d'avancement](#1-état-davancement)
2. [Fonctionnement de l'application](#2-fonctionnement-de-lapplication)
3. [Rôles et confidentialité](#3-rôles-et-confidentialité)
4. [Technique](#4-technique)
5. [Données stockées](#5-données-stockées)
6. [Règles de sécurité Firestore expliquées](#6-règles-de-sécurité-firestore-expliquées)
7. [Mise en place de Firebase](#7-mise-en-place-de-firebase)
8. [Voir et mettre en ligne l'application](#8-voir-et-mettre-en-ligne-lapplication)
9. [Feuille de route](#9-feuille-de-route)
10. [Décisions prises](#10-décisions-prises)
11. [Limites connues](#11-limites-connues)
12. [Maquettes et suivi](#12-maquettes-et-suivi)

---

## 1. État d'avancement

| Élément | État |
| --- | --- |
| Étape 1 : comptes (email et Google), familles, invitations, événements | **Codée et essayée** sur le projet Firebase réel (connexion Google, accueil) |
| Étapes 2 à 4 : tâches et calendrier, budget, dépenses, contributions, invités et réponses | **Codées** d'après les maquettes (30/10/2026) ; **à essayer** avec le [scénario de test](docs/scenario-de-test.md) |
| Règles de sécurité Firestore | Étape 1 testée sur l'émulateur (18 tests) ; étapes 2 à 4 **écrites, non testées sur émulateur** (indisponible dans l'environnement de développement) : à vérifier avec le scénario de test |
| Liaison avec le projet Firebase | **Faite** : projet `bennoo-4186e`, configuration en haut de `js/app.js` (sans Google Analytics) |
| Étapes 5 et 6 (installation sur téléphone, pages légales, album photos) | **Prévues** |

Aucune donnée d'exemple n'est présentée comme réelle : tout ce qui s'affiche vient du projet Firebase.

---

## 2. Fonctionnement de l'application

### Écrans disponibles (étape 1)

| Écran | Ce que l'on peut faire | Maquette |
| --- | --- | --- |
| Lancement | Découvrir Bennoo, commencer ou se connecter | Planche 1 — écran 1 |
| Présentation (3 écrans) | Comprendre l'application ; « Suivant » ou « Passer » | Planche 1 — écran 2 |
| Inscription | Prénom, nom, email, mot de passe (8 caractères min.), acceptation des conditions, ou **Continuer avec Google** | Planche 1 — écran 3 |
| Vérification de l'email | Lien reçu par email, bouton « J'ai cliqué sur le lien », renvoi de l'email | — |
| Connexion | Email et mot de passe, afficher / masquer le mot de passe, ou **Continuer avec Google** | Écrans principaux — 2 |
| Mot de passe oublié | Réception d'un lien de réinitialisation (réponse identique que le compte existe ou non) | — |
| Accueil personnel | « Bonjour Awa 👋 », événements à venir et passés, bouton « + Créer » ; création de la première famille | Planche 1 — écran 4 |
| Family Hub | Nom de la famille, nombre de membres et d'événements, onglets Membres / Événements | Planche 2 — écran 1 |
| Inviter un membre | Lien valable 7 jours, envoi sur WhatsApp, copie, désactivation | Écrans principaux — 5 |
| Rejoindre une famille | Ouvrir le lien reçu, créer son compte ou se connecter, rejoindre | — |
| Détail d'un membre | Rôle, date d'arrivée ; un administrateur change le rôle ou retire le membre ; quitter la famille | Planche 2 — écran 2 |
| Créer un événement (5 étapes) | 1. Type · 2. Nom et description · 3. Date, lieu, ville · 4. Devise, budget prévu, invités prévus · 5. Participants choisis parmi la famille | Écrans principaux — 6 |
| Tableau de bord de l'événement | J - n, avancement de l'organisation (tâches terminées), invités confirmés, tâches restantes, budget global, contributions confirmées, prochaines tâches | Écrans principaux — 7 |
| Tâches (liste) | Filtres Toutes / À faire / En cours / Terminées avec compteurs, case à cocher, échéance, responsable ; checklist proposée selon la cérémonie | Écrans principaux — 8 |
| Calendrier | Mois par mois, jours avec tâches marqués, jour de l'événement en doré, tâches du jour choisi | Écrans principaux — 9 |
| Détail / création d'une tâche | Statut (À faire, En cours, Terminée), échéance, responsable, description ; modification et suppression par l'organisateur | Planche 4 — « Détail d'une tâche » |
| Budget | Budget global, part financée, contributions confirmées et en attente, dépenses engagées et payées, reste à financer ; répartition par catégorie | Écrans principaux — 10, planche 4 |
| Dépenses | Filtres Toutes / Payées / À payer ; ajout, modification, suppression (montant, catégorie, fournisseur, date, statut) | Planche 3 — 3 |
| Contributions | Filtres Promises / Déclarées / Confirmées ; déclaration par chacun, anonyme ou non ; confirmation par le trésorier ; don reçu d'un proche sans compte | Planche 3 — 4 |
| Invités | Foyers, nombre de places, téléphone ; lien personnel par WhatsApp ou copie ; réponses et compteurs | Écrans principaux — 11 |
| Carton d'invitation | Qui invite, message ; aperçu violet et doré tel que l'invité le voit | Écrans principaux — 11 « Aperçu » |
| Réponse d'un invité (RSVP) | Page ouverte depuis le lien personnel, **sans compte** : oui / non, nombre de personnes, petit mot | — |
| Participants | Liste avec rôles ; l'organisateur ajoute, change le rôle ou retire | — |
| Modifier l'événement | Réservé à l'organisateur ; le carton d'invitation publié suit automatiquement | — |
| Paramètres | Profil, familles, confidentialité, langue, déconnexion | Écrans principaux — 13 |
| Mon profil | Nom affiché, téléphone au format international | — |
| Conditions et confidentialité | Ce que voient les autres, où sont les données | — |

Sur téléphone, la navigation est une barre en bas (Accueil, Famille, Plus). Sur ordinateur,
elle devient une barre latérale violette, comme la maquette « Version desktop ».
Seules les rubriques déjà développées apparaissent : pas de bouton sans action.

### Types d'événements

Mariage · Baptême / Ngenté · Communion · Anniversaire · Cérémonie religieuse ·
Réunion familiale · Cérémonie traditionnelle · Événement personnalisé.

### Montants

Les montants sont saisis en **FCFA** (sans centimes) ou en **euros** (avec centimes) et stockés
en nombres entiers, sans arrondi. Exemple : « 4 200 000 » FCFA ; « 12,50 » €.

---

## 3. Rôles et confidentialité

### Rôles dans une famille

| Rôle | Droits |
| --- | --- |
| Propriétaire | Créateur de la famille ; ce rôle ne peut ni changer ni être retiré |
| Administrateur | Crée les liens d'invitation, change le rôle des membres (admin / membre), retire un membre |
| Membre | Voit les membres de la famille, crée des événements, peut quitter la famille |

### Rôles dans un événement

| Rôle | Droits |
| --- | --- |
| Organisateur | Modifie l'événement, gère les participants, crée et attribue les tâches, gère les dépenses, gère les invités et le carton ; voit les contributions **sans** le nom des anonymes |
| Trésorier | Gère les dépenses, **confirme les contributions**, enregistre les dons reçus, voit le nom des contributeurs anonymes |
| Membre | Voit les tâches, change le statut de celles dont il est responsable, voit les **totaux** du budget, déclare ses propres contributions |

Il reste **toujours au moins un organisateur** : un organisateur ne peut changer que le rôle des autres.

### Confidentialité (décisions du 29/10/2026)

- **Un événement n'est visible que de ses participants**, même à l'intérieur de la famille.
- **Le profil** (dont le téléphone) n'est visible que par son propriétaire.
- **Un simple membre ne voit que les totaux** du budget et des contributions, plus ses propres contributions.
- **Une contribution peut être anonyme** : nom visible du seul contributeur et du trésorier ; l'organisateur
  voit « Contributeur anonyme ».
- **La page d'un invité** n'affiche que le carton et son propre foyer ; la liste des invités est réservée
  aux organisateurs.
- **Pas de paiement dans l'application** : on donne comme d'habitude, on déclare, le trésorier confirme.
- Ces protections sont appliquées par **Firebase lui-même** (règles Firestore) : masquer un bouton
  dans l'écran n'est jamais considéré comme une protection suffisante.

---

## 4. Technique

Application web **statique** : HTML, CSS et JavaScript, sans étape de compilation, comme les
applications Lumen et Yond. Elle fonctionne sur téléphone et ordinateur.

```
index.html        page principale (charge Firebase depuis cdnjs et la police Poppins)
css/styles.css    tous les styles (violet profond, lavande, blanc, doré — d'après les maquettes)
js/app.js         toute la logique : Firebase, données, écrans, navigation
images/logo.svg   logo Bennoo
firestore.rules   règles de sécurité à coller dans la console Firebase
maquettes/        maquettes de référence (voir maquettes/README.md)
```

**Services utilisés**

| Service | Rôle | Coût |
| --- | --- | --- |
| Firebase Authentication | Comptes, mots de passe, sessions, emails de vérification et de réinitialisation | Gratuit |
| Cloud Firestore (édition Standard) | Base de données en ligne | Gratuit jusqu'à 1 Gio, 50 000 lectures et 20 000 écritures par jour |
| GitHub Pages ou Firebase Hosting | Mise en ligne du site | Gratuit (GitHub Pages sur dépôt privé : compte payant) |
| Firebase Cloud Storage (étape 6) | Photos de l'album | Forfait Blaze (carte bancaire) obligatoire |

**Navigation** : adresses de la forme `#/famille/<id>`, `#/evenement/<famille>/<événement>`… ;
elles fonctionnent sur tout hébergement statique et en ouvrant simplement `index.html`.

**Sécurité côté écran** : tout texte saisi est affiché comme du texte (jamais interprété comme du
code), les jetons d'invitation sont tirés au hasard (32 octets, impossibles à deviner), les messages
d'erreur ne révèlent jamais si un compte existe.

---

## 5. Données stockées

Les **mots de passe et sessions** sont gérés par Firebase Authentication : Bennoo ne les voit jamais.
Firestore contient uniquement :

```
users/{uid}                                       profil : nom affiché, téléphone, langue
families/{famille}                                nom, créateur, date de création
families/{famille}/members/{uid}                  rôle (owner, admin, member), nom, date d'arrivée
families/{famille}/invites/{jeton}                lien d'invitation : nom de la famille, expiration
families/{famille}/events/{événement}             type, titre, description, date, lieu, ville,
                                                  devise, budget prévu, invités prévus, statut
families/{famille}/events/{événement}/participants/{uid}   rôle (organizer, treasurer, member), nom
  …/participants/{uid}/myContributions/{id}       index personnel « mes contributions »
  …/tasks/{id}                                    titre, description, échéance, statut, responsable
  …/expenses/{id}                                 libellé, catégorie, montant, fournisseur, date, statut
  …/contributions/{id}                            montant, statut, anonyme, nom (vide si anonyme), origine, précision
  …/contributions/{id}/private/identity           qui a contribué (contributeur et trésorier seulement)
  …/summary/budget, …/summary/guests              totaux partagés avec tous les participants
  …/guests/{jeton}                                foyer, téléphone, places, réponse, nombre présent, mot
  …/public/invitation                             carton : titre, type, date, lieu, qui invite, message
```

Les totaux partagés (`summary`) sont recalculés par l'organisateur ou le trésorier chaque fois qu'il
ouvre l'aperçu, le budget ou les invités : un simple membre voit donc les chiffres de la dernière visite
d'un responsable (la date de mise à jour est affichée).

---

## 6. Règles de sécurité Firestore expliquées

Le fichier [`firestore.rules`](firestore.rules) est **la** sécurité de Bennoo : le site est public,
c'est Firebase qui décide, à chaque lecture et chaque écriture, si elle est autorisée.
**Principe de base : tout ce qui n'est pas explicitement autorisé est refusé.**

### Conditions communes

| Condition | Signification |
| --- | --- |
| Connecté | La personne a un compte et est connectée |
| Email vérifié | La personne a cliqué sur le lien de vérification ; **obligatoire pour toute action dans une famille**, pour qu'un lien transféré ne permette pas d'agir sous une fausse adresse |
| Données valides | Seuls les champs prévus sont acceptés, avec des longueurs et valeurs bornées (ex. nom de 1 à 80 caractères, budget entier positif, devise FCFA ou EUR) |
| Dates du serveur | Les dates de création et de modification sont celles du serveur, pas celles du téléphone |

### Règle par règle

**Profil (`users`)**
- Chacun lit, crée et modifie **uniquement son propre profil**.
- Téléphone au format international (`+221…`, `+33…`) ou vide.
- Personne ne peut lister les profils ni en supprimer.

**Famille (`families`)**
- Visible uniquement par **ses membres**.
- Création : la famille et l'appartenance « propriétaire » de son créateur sont enregistrées
  ensemble ; impossible de créer une famille au nom de quelqu'un d'autre.
- Seuls le propriétaire et les administrateurs peuvent renommer la famille.
- Impossible de lister toutes les familles ou d'en supprimer une depuis l'application.

**Membres (`members`)**
- Visibles uniquement par les membres de la même famille.
- On ne peut s'ajouter soi-même à une famille **qu'avec un lien d'invitation valide et non expiré**,
  et seulement avec le rôle « membre » (jamais administrateur ni propriétaire).
- Un administrateur peut passer un autre membre d'administrateur à membre et inversement ;
  **le propriétaire ne peut jamais être modifié ni retiré**.
- Chacun peut modifier son propre nom affiché et quitter la famille.

**Liens d'invitation (`invites`)**
- L'identifiant du lien **est** un jeton secret de 43 caractères : seul qui possède le lien peut le lire.
- Seuls le propriétaire et les administrateurs créent, listent et désactivent les liens.
- Durée : 7 jours (au plus 8 jours acceptés, pour tolérer une horloge de téléphone décalée).
- Un lien ne peut pas être modifié après sa création.

**Événements (`events`)**
- Visibles **uniquement par leurs participants**, même pour les autres membres de la famille.
- Tout membre de la famille peut créer un événement ; il en devient automatiquement organisateur.
- Seul un organisateur peut le modifier ; le créateur et la date de création ne changent jamais.
- Pas de liste globale des événements, pas de suppression depuis l'application.

**Participants (`participants`)**
- Visibles par les participants du même événement.
- Un organisateur ajoute **uniquement un membre de la famille**, avec le nom qu'il porte dans la famille.
- Un organisateur change le rôle **des autres** uniquement : il reste donc toujours un organisateur.
- Un participant peut se retirer lui-même, sauf s'il est organisateur.

**Listes « Mes familles » et « Mes événements »**
- Chacun ne peut lister, à travers toutes les familles, **que ses propres** appartenances et participations.

### Ce qui n'est pas dans Firestore

Comptes, mots de passe, sessions, emails de vérification et de réinitialisation : gérés et protégés
par **Firebase Authentication**, sans règle à écrire.

**Tâches (`tasks`)**
- Visibles par tous les participants de l'événement.
- Créées, modifiées et supprimées par un organisateur ; le responsable doit être un participant.
- Le responsable d'une tâche peut **seulement** changer son statut.

**Dépenses (`expenses`)**
- Lues et gérées **uniquement par l'organisateur et le trésorier**. Montant entier strictement positif,
  catégorie et statut dans les listes prévues.

**Contributions (`contributions`)**
- Lues par l'organisateur et le trésorier ; chacun lit **les siennes**.
- Un participant déclare pour lui-même (« promise » ou « déclarée », jamais « confirmée »), sous son
  propre nom ou anonymement ; il peut la modifier ou la retirer tant qu'elle n'est pas confirmée.
- **Seul le trésorier confirme**, corrige ou supprime, et peut enregistrer le don d'un proche sans compte.
- L'identité d'un contributeur anonyme est dans un document séparé (`private/identity`) que seuls
  le contributeur et le trésorier peuvent lire.

**Totaux (`summary`)**
- Lus par tous les participants ; écrits par l'organisateur ou le trésorier (budget) et l'organisateur
  (invités), uniquement avec des nombres entiers positifs.

**Invités (`guests`) et carton (`public/invitation`)**
- La liste des invités est réservée aux organisateurs.
- Chaque foyer a un jeton secret de 43 caractères : avec son lien, on lit **son** invitation et on y
  répond (oui avec 1 à « places » personnes, ou non), sans compte, sans pouvoir changer autre chose.
- Le carton est lisible avec le lien ; seul un organisateur le publie.

---

## 7. Mise en place de Firebase

1. **Créer le projet** « bennoo » sur [console.firebase.google.com](https://console.firebase.google.com),
   séparé des projets Lumen et Yond.
2. **Authentication → Méthode de connexion** : activer « Adresse e-mail / Mot de passe » et **« Google »**
   (choisir l'adresse email d'assistance du projet).
   Dans les paramètres : mot de passe de 8 caractères minimum, protection contre l'énumération
   des emails activée.
3. **Firestore Database → Créer** : édition **Standard**, mode **production**, région en **Europe**
   (`eur3` ou `europe-west1` — ce choix est définitif). Une seule base (celle par défaut).
4. **Firestore → Règles** : remplacer tout le contenu par celui de `firestore.rules`, puis **Publier**.
5. **Firestore → Index → Champ unique** : ajouter deux exceptions sur le champ `uid`,
   portée « Groupe de collections », ordre croissant : une pour `members`, une pour `participants`.
   Sans elles, « Mes familles » et « Mes événements » restent vides.
6. **Paramètres du projet → Vos applications → Web** : créer l'application et copier le bloc
   `firebaseConfig` en haut de `js/app.js`. Ces valeurs ne sont pas secrètes.
7. **Authentication → Paramètres → Domaines autorisés** : ajouter le domaine du site
   (par exemple `eugenepascal.github.io`).

---

## 8. Voir et mettre en ligne l'application

- **Sur son ordinateur** : télécharger le dépôt et ouvrir `index.html` dans le navigateur.
- **GitHub Pages** : Settings → Pages → branche `main`, dossier `/ (root)`. Pour un dépôt privé,
  GitHub demande un compte payant ; sinon rendre le dépôt public, comme Lumen et Yond.
- **Firebase Hosting** : `npx firebase login`, puis `npx firebase init hosting` (dossier public : `.`),
  puis `npx firebase deploy --only hosting`. Adresse obtenue : `https://<projet>.web.app`.

---

## 9. Feuille de route

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Comptes, familles, invitations, création d'événement, tableau de bord simple | Codée et essayée |
| 2 | Tâches : responsable, échéance, statut, checklist selon la cérémonie, calendrier | Codée — à essayer |
| 3 | Budget, dépenses, contributions (promise → déclarée → confirmée), anonymat, totaux | Codée — à essayer |
| 4 | Invités par foyer, lien personnel WhatsApp, réponse (RSVP) sans compte ; QR code plus tard | Codée — à essayer |
| 5 | Tableau de bord complet, installation sur téléphone, pages légales, mise en ligne | Prévue |
| 6 | Album photos de l'événement (forfait Firebase Blaze) | Prévue |
| — | Avant l'ouverture au public : tests avec 5 familles, avis juridique (CDP Sénégal, RGPD) | Prévue |

**Après la V1** : connexion par téléphone et Apple · paiements en ligne (Wave, Orange Money,
carte, via un prestataire agréé) · notifications automatiques (push, email, WhatsApp) · Diaspora Mode
(voyage, hébergement, accueil des proches) · plan de table · documents partagés · Family Passport et
arbre familial · Bennoo Copilot (assistant IA) · Yond Live (jour J, programme, carte, gamification) ·
version en wolof · Bennoo Pro (prestataires et devis).

---

## 10. Décisions prises

| Date | Décision | Raison |
| --- | --- | --- |
| 27/10/2026 | NioFar devient **Bennoo** | Nouveau nom du produit |
| 29/10/2026 | Connexion **par email** d'abord ; téléphone, Google, Apple plus tard | Simplicité ; les SMS sont payants |
| 29/10/2026 | Un simple membre ne voit que **les totaux** ; contributions **anonymes** possibles | Confidentialité au sein des familles |
| 29/10/2026 | **Aucun paiement** dans l'application en V1 : le membre déclare, le trésorier confirme | Bennoo ne détient jamais d'argent |
| 29/10/2026 | **Firebase** plutôt que Supabase pour la V1 | Pas de serveur à gérer, gratuit au départ, déjà utilisé pour Lumen et Yond |
| 30/10/2026 | Application **statique** (index.html + css + js), comme Lumen et Yond | Simple à lire, à modifier et à mettre en ligne |
| 30/10/2026 | Firestore **édition Standard**, région Europe | Gratuit au départ ; règles et index prévus pour cette édition |
| 30/10/2026 | Ajout de la **connexion avec Google** | Demandée par le porteur du projet ; gratuite, email déjà vérifié par Google |

---

## 11. Limites connues

- **Sans Cloud Functions** (offre gratuite), les totaux visibles des simples membres sont recalculés quand
  l'organisateur ou le trésorier ouvre l'aperçu, le budget ou les invités : ils peuvent avoir un peu de
  retard (la date de mise à jour est affichée).
- **Trésorier obligatoire pour confirmer** : l'organisateur ne confirme pas les contributions (décision
  sur l'anonymat). Il faut désigner un trésorier dans l'onglet Participants.
- **Justificatifs de dépenses, QR code des invitations, rappels automatiques** : prévus plus tard.
- **Photos** : le stockage de fichiers Firebase exige le forfait Blaze (carte bancaire) depuis février 2026.
- **Illustrations** : les maquettes utilisent des photos de familles ; l'application utilise pour
  l'instant des dégradés, le logo et des emojis. Des photos haute définition libres de droits peuvent
  être ajoutées dans `images/`.
- **Suppression de compte** : pas encore disponible depuis l'application (prévue à l'étape 5).
- **Téléphone des membres** : le téléphone reste privé ; les boutons « Appeler » et « Message » des
  maquettes demanderont l'accord explicite de chaque membre pour partager son numéro.
- **Conditions d'utilisation** : texte provisoire de la phase de test, à valider juridiquement.
- **Données personnelles** : obligations auprès de la CDP (Sénégal, loi 2008-12) et RGPD à faire valider.

---

## 12. Maquettes et suivi

- Maquettes : dossier [`maquettes/`](maquettes/) (écrans principaux, 6 planches thématiques,
  écrans complémentaires NioFar) et son [README](maquettes/README.md).
- Suivi des tâches : tableau Trello « BENNOO 💜 — Développement & Roadmap ».
