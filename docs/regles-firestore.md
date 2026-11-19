# Règles de sécurité Firestore de Bennoo — explication détaillée

Ce document explique, règle par règle, le fichier [`firestore.rules`](../firestore.rules).
Il est écrit pour quelqu'un qui doit publier, relire ou modifier ces règles sans connaître le code.

> **Version décrite** : 476 lignes, 19/11/2026 (familles, événements, tâches, budget, contributions,
> invités, programme, album photos, livre d'or, messages de la famille).
> Si le fichier publié dans la console Firebase n'a pas le même nombre de lignes, ce n'est pas la bonne version.

## Sommaire

1. [Pourquoi ces règles sont la sécurité de Bennoo](#1-pourquoi-ces-règles-sont-la-sécurité-de-bennoo)
2. [Publier les règles](#2-publier-les-règles)
3. [Vocabulaire : lire, lister, créer, modifier, supprimer](#3-vocabulaire)
4. [Les fonctions d'aide (en haut du fichier)](#4-les-fonctions-daide)
5. [Tableau récapitulatif : qui peut faire quoi](#5-tableau-récapitulatif)
6. [Règle par règle](#6-règle-par-règle)
7. [Index nécessaires](#7-index-nécessaires)
8. [Limites connues et choix assumés](#8-limites-connues-et-choix-assumés)
9. [Tests à faire après chaque publication](#9-tests-à-faire-après-chaque-publication)
10. [Modifier les règles sans rien casser](#10-modifier-les-règles-sans-rien-casser)

---

## 1. Pourquoi ces règles sont la sécurité de Bennoo

Bennoo est un site statique (HTML, CSS, JavaScript) : tout son code est public, et n'importe qui peut
appeler la base Firestore directement avec la clé de configuration (qui n'est pas secrète).
**Ce n'est donc pas l'application qui protège les données, ce sont ces règles**, appliquées par les
serveurs de Google à chaque lecture et à chaque écriture.

Principes suivis partout :

- **Tout ce qui n'est pas autorisé est refusé.** Une collection absente des règles est inaccessible.
- **Liste fermée des champs** (`keys().hasOnly([...])`) : on ne peut pas ajouter un champ inattendu
  (par exemple `role: "owner"` glissé dans une fiche).
- **Dates fixées par le serveur** (`createdAt == request.time`) : impossible d'antidater.
- **Identité imposée** (`uid == me()`, `createdBy == me()`) : on ne crée rien au nom d'un autre.
- **Lots d'écriture vérifiés ensemble** (`getAfter`, `existsAfter`) : quand deux documents doivent
  naître ensemble (famille + propriétaire, événement + organisateur, photo + grande image),
  la règle vérifie l'état *après* le lot complet.
- **Email vérifié** (`verified()`) pour toute action dans une famille.

Les comptes, mots de passe et sessions ne sont pas dans Firestore : Firebase Authentication les gère.

## 2. Publier les règles

1. Ouvrir la [console Firebase](https://console.firebase.google.com/) → projet **bennoo-4186e**.
2. **Firestore Database** → onglet **Règles**.
3. Tout sélectionner, supprimer, coller le contenu complet de `firestore.rules`.
4. Cliquer sur **Publier**. La console signale les erreurs de syntaxe avant de publier.
5. Les nouvelles règles s'appliquent en moins d'une minute.

> Il n'y a **pas de migration de données** à faire : les règles décrivent ce qui est permis,
> elles ne modifient pas les documents existants. Les anciens documents restent valides
> (les nouveaux champs comme `photo`, `theme` ou `wish` sont facultatifs).

## 3. Vocabulaire

| Mot dans les règles | Ce que ça veut dire |
| --- | --- |
| `get` | lire **un** document dont on connaît l'adresse exacte |
| `list` | lister une collection (une requête qui renvoie plusieurs documents) |
| `read` | `get` + `list` |
| `create` | créer un document qui n'existe pas |
| `update` | modifier un document existant |
| `delete` | supprimer |
| `request.resource.data` (raccourci `data()`) | le document **tel qu'il sera** après l'écriture |
| `resource.data` | le document **tel qu'il est** avant l'écriture |
| `request.time` | l'heure du serveur Google au moment de la requête |

## 4. Les fonctions d'aide

En haut du fichier, des petites fonctions évitent de répéter les mêmes tests.

| Fonction | Rôle |
| --- | --- |
| `signedIn()` | la personne est connectée |
| `me()` | l'identifiant (uid) de la personne connectée |
| `verified()` | connectée **et** email vérifié (les comptes Google le sont d'office) |
| `data()` | le document après l'écriture |
| `changed()` | la liste des champs modifiés par une mise à jour |
| `text(v, min, max)` | `v` est un texte de `min` à `max` caractères |
| `optText(v, max)` | `v` est vide (`null`) ou un texte de `max` caractères au plus |
| `validPhoto(v)` | vide, ou petite image JPEG en base64 de moins de 70 000 caractères (photo de profil) |
| `validImage(v, max)` | image JPEG en base64 de moins de `max` caractères (album) |
| `isFamilyMember(fid)` | la personne a une fiche dans `families/{fid}/members` |
| `familyRole(fid)` | son rôle dans la famille : `owner`, `admin` ou `member` |
| `isFamilyAdmin(fid)` | propriétaire ou administrateur |
| `isParticipant(fid, eid)` | la personne a une fiche dans `…/events/{eid}/participants` |
| `eventRole(fid, eid)` | son rôle dans l'événement : `organizer`, `treasurer` ou `member` |
| `isOrganizer`, `isTreasurer`, `isManager` | organisateur ; trésorier ; organisateur **ou** trésorier |
| `nat(v)` / `money(v)` | entier de 0 (ou 1) à 100 milliards (montants en unités : FCFA, centimes d'euro) |
| `optDate(v)` | vide ou date |
| `coverKeys()` | les 12 photos de couverture proposées (clés de `PHOTOS` dans `js/app.js`) |
| `eventTypes()` | les 8 types d'événement |

> Si on ajoute une photo de couverture ou un type d'événement dans `js/app.js`, il faut l'ajouter
> **aussi** dans `coverKeys()` ou `eventTypes()`, sinon l'enregistrement sera refusé.

## 5. Tableau récapitulatif

« Participant » = personne ajoutée à l'événement. Un membre de la famille qui n'est pas participant
ne voit **rien** de l'événement.

| Données | Qui lit | Qui crée | Qui modifie | Qui supprime |
| --- | --- | --- | --- | --- |
| Profil `users/{uid}` | soi seul | soi | soi | soi |
| Famille | ses membres | tout compte vérifié (devient propriétaire) | admin (nom seulement) | personne |
| Membres | membres de la famille | soi, avec un lien valide | admin (rôles), soi (nom, photo), transmission | soi ou admin, jamais le propriétaire |
| Liens d'invitation | qui a le jeton ; liste : admins | admin | personne | admin |
| Messages de la famille | membres | membre (sous son nom) | personne | auteur ou admin |
| Événement | participants | membre de la famille (devient organisateur) | organisateur | personne (on archive) |
| Participants | participants | organisateur ; le créateur | organisateur (rôles des autres), soi (photo, départ) | organisateur (les autres), soi (sauf organisateur) |
| Tâches | participants | organisateur | organisateur ; responsable (statut) | organisateur |
| Dépenses | organisateur, trésorier | idem | idem | idem |
| Contributions | organisateur, trésorier ; chacun la sienne | participant (pour lui) ; trésorier (pour un proche) | trésorier ; auteur tant que non confirmée | trésorier ; auteur tant que non confirmée |
| Identité d'un contributeur | lui-même et le trésorier | lui-même | personne | lui-même ou trésorier |
| Totaux partagés | participants | organisateur/trésorier (budget), organisateur (invités) | idem | personne |
| Programme du jour J | participants | organisateur | personne (on supprime et recrée) | organisateur |
| Comités | participants | organisateur | organisateur | organisateur |
| Album photos | participants | participant | personne | auteur ou organisateur |
| Livre d'or | participants | participant ; organisateur (message d'invité validé) | personne | auteur ou organisateur |
| Invités (foyers) | organisateur ; chaque foyer lit **le sien** avec son lien | organisateur | foyer (réponse, message) ; organisateur | organisateur |
| Carton d'invitation | tout le monde avec le lien | organisateur | organisateur | personne |

## 6. Règle par règle

### 6.1 Profil — `users/{userId}`

Le profil contient le nom affiché, le téléphone (privé), la langue et la photo de profil.

- **Lecture** : seulement son propre profil (`me() == userId`). Personne d'autre ne voit le téléphone.
- **Liste** : interdite (on ne peut pas parcourir tous les profils).
- **Création / modification** : seulement le sien, avec :
  - champs autorisés : `displayName`, `phone`, `locale`, `photo`, `createdAt`, `updatedAt` ;
  - nom de 1 à 80 caractères ;
  - téléphone vide ou au format international (`+221771234567`) ;
  - `locale` = `fr` (la langue choisie est gardée sur l'appareil, pas dans le profil) ;
  - photo valide (`validPhoto`) ;
  - `updatedAt` = heure du serveur ; `createdAt` ne change jamais.
- **Suppression** : son propre profil, pour la suppression du compte.

### 6.2 Famille — `families/{fid}`

- **Lecture** : membres de la famille seulement. **Liste** interdite : on retrouve ses familles par
  ses propres fiches de membre (voir 6.19).
- **Création** : la famille et la fiche « propriétaire » de son créateur sont écrites **dans le même
  lot**. La règle vérifie avec `getAfter` qu'après le lot, le créateur est bien `owner`.
- **Modification** : un administrateur peut changer **le nom seulement**.
- **Suppression** : interdite (une famille ne disparaît pas ; elle peut rester vide).

### 6.3 Membres — `families/{fid}/members/{memberId}`

Champs : `uid`, `role`, `displayName`, `joinedAt`, `inviteToken`, `transferTo`, `photo`.
L'identifiant du document est l'uid du membre.

- **Lecture** : membres de la famille.
- **Création** (on s'ajoute **soi-même**, jamais quelqu'un d'autre) :
  - **fondateur** : rôle `owner`, la famille n'existait pas avant et naît dans le même lot ;
  - **invité** : rôle `member` seulement, avec un `inviteToken` qui existe et n'a pas expiré.
    Impossible d'entrer directement comme `admin` ou `owner`.
- **Modification** — quatre cas, et seulement ceux-là :
  1. un admin change le rôle d'un **autre** membre entre `admin` et `member` (jamais le propriétaire) ;
  2. chacun change **son** nom et **sa** photo ;
  3. **transmission de la famille**, étape 1 : le propriétaire se met `admin` et désigne `transferTo` ;
  4. **transmission**, étape 2 (même lot) : le membre désigné devient `owner`. La règle vérifie que
     l'ancien propriétaire est bien devenu `admin` **et** l'a bien désigné. Il y a donc toujours
     exactement un propriétaire.
- **Suppression** : on quitte la famille, ou un admin retire quelqu'un — **jamais le propriétaire**
  (il doit d'abord transmettre la famille).

### 6.4 Liens d'invitation — `families/{fid}/invites/{token}`

L'identifiant du document **est** le jeton secret : 32 octets aléatoires, 43 caractères, impossible
à deviner.

- **Lecture d'un lien** : tout compte vérifié qui connaît le jeton (c'est ce que fait la page
  « Rejoindre la famille »). **Liste** : admins seulement (pour voir et désactiver les liens).
- **Création** : admin, jeton de 43 caractères, nom de la famille, expiration entre maintenant et
  8 jours (7 demandés par l'application + 1 jour de tolérance pour l'horloge du téléphone).
- **Modification** : interdite. **Suppression** (désactiver) : admin.

### 6.5 Messages de la famille — `families/{fid}/posts/{postId}`

Champs : `text`, `authorName`, `authorPhoto`, `uid`, `createdAt`.

- **Lecture** : tous les membres de la famille (y compris ceux qui ne participent à aucun événement).
- **Création** : un membre, texte de 1 à 1 000 caractères, `uid` = soi. **Le nom et la photo de
  l'auteur doivent être ceux de sa fiche de membre** : impossible d'écrire sous le nom d'un autre.
- **Modification** : interdite (on supprime et on réécrit).
- **Suppression** : l'auteur, ou un administrateur de la famille (modération).

### 6.6 Événement — `families/{fid}/events/{eid}`

Champs : type, titre, description, date, lieu, ville, devise, budget prévu, invités prévus,
statut, couverture, créateur, dates.

- **Lecture** : **participants seulement**, même au sein de la famille. **Liste** interdite : on
  retrouve ses événements par ses propres fiches de participant (voir 6.19).
- **Validation** : type parmi les 8, titre 1–120, description ≤ 2 000, devise `XOF` ou `EUR`,
  budget entier de 0 à 100 milliards, invités prévus 0–100 000, statut `active` ou `archived`,
  couverture parmi `coverKeys()`.
- **Création** : tout membre de la famille ; l'événement et la fiche « organisateur » de son
  créateur naissent dans le même lot.
- **Modification** : organisateur (créateur et date de création inchangés). Archiver = passer
  `status` à `archived`.
- **Suppression** : interdite (on archive).

### 6.7 Participants — `…/events/{eid}/participants/{pid}`

Champs : `uid`, `role`, `displayName`, `addedAt`, `handoverTo`, `photo`.

- **Lecture** : participants.
- **Création** :
  - le créateur de l'événement s'ajoute comme organisateur, dans le même lot que l'événement ;
  - un organisateur ajoute un **membre de la famille** ; le nom et la photo doivent être recopiés
    exactement de sa fiche de membre (pas de faux nom).
- **Modification** — quatre cas :
  1. un organisateur change le rôle d'un **autre** participant (on ne peut pas se retirer son propre
     rôle d'organisateur : il reste donc toujours au moins un organisateur) ;
  2. **un organisateur qui part** se met `member` en désignant `handoverTo`, qui doit déjà être
     organisateur ;
  3. **suppression du compte** : le nom est remplacé par « Compte supprimé » quand la ligne doit rester ;
  4. chacun met à jour **sa** photo.
- **Suppression** : un organisateur retire un autre participant ; un participant non organisateur
  quitte l'événement.

#### Index personnel — `…/participants/{pid}/myContributions/{cid}`

Liste des contributions de la personne (pour « Mes contributions », sans révéler celles des autres).
Lecture, création et suppression par son seul propriétaire ; la création exige que l'identité de la
contribution (voir 6.10) soit bien la sienne.

### 6.8 Tâches — `…/events/{eid}/tasks/{tid}`

- **Lecture** : participants.
- **Validation** : titre 1–120, notes ≤ 1 000, statut `todo`/`doing`/`done`, responsable vide ou
  **participant existant** avec son nom.
- **Création / suppression** : organisateur.
- **Modification** : l'organisateur modifie tout ; **le responsable d'une tâche ne peut changer que
  son statut** (et la date de mise à jour).

### 6.9 Dépenses — `…/events/{eid}/expenses/{xid}`

- **Tout (lecture, création, modification, suppression)** : organisateur et trésorier seulement.
  Un simple membre ne voit jamais le détail des dépenses, seulement les totaux (6.11).
- **Validation** : libellé 1–120, catégorie parmi 9, montant > 0, fournisseur ≤ 120,
  statut `pending` (à payer) ou `paid`.

### 6.10 Contributions — `…/events/{eid}/contributions/{cid}`

C'est la partie la plus délicate, à cause de **l'anonymat** et de la règle « **pas de paiement
dans l'application** » (on déclare, le trésorier confirme).

Champs : `amount`, `status`, `anonymous`, `displayName`, `source`, `note`, `kind`, `item`, `origin`, dates.

- **Validation** :
  - argent (`money`) : montant > 0, pas d'objet ; en nature (`inkind`) : objet obligatoire,
    valeur estimée ≥ 0 ;
  - provenance parmi 5 (hôtes, famille, amis, diaspora, autre) ;
  - statut `promised`, `declared` ou `confirmed` ;
  - **anonyme ⇒ pas de nom** dans le document ; non anonyme ⇒ nom obligatoire.
- **Lecture** : organisateur et trésorier (liste complète) ; chacun peut lire **les siennes**
  (repérées par l'index personnel). Un simple membre ne liste pas les contributions des autres.
- **Création** :
  - **un participant pour lui-même** : statut promis ou déclaré (**jamais confirmé**), son vrai nom
    s'il n'est pas anonyme, et dans le même lot son identité (`private/identity`) et son index
    personnel ;
  - **le trésorier pour un proche sans compte** : non anonyme.
- **Modification** : source, date de création, anonymat, nom et type ne changent jamais. Ensuite :
  - le trésorier change le statut (c'est lui qui **confirme**), le montant, la note, l'objet, la provenance ;
  - l'auteur modifie sa contribution **tant qu'elle n'est pas confirmée**, sans pouvoir la confirmer.
- **Suppression** : trésorier ; ou l'auteur tant qu'elle n'est pas confirmée.

#### Identité — `…/contributions/{cid}/private/identity`

Qui a vraiment contribué : `uid` et nom. **Lisible par le contributeur et le trésorier seulement —
pas par l'organisateur.** C'est ce qui permet à une contribution anonyme de rester anonyme pour
tous sauf le trésorier. Créée par le contributeur lui-même, dans le même lot que la contribution ;
jamais listée ni modifiée.

### 6.11 Totaux partagés — `…/events/{eid}/summary/{budget|guests}`

- **Lecture** : tous les participants — c'est ce que voit un simple membre.
- **Écriture** : `budget` par l'organisateur ou le trésorier, `guests` par l'organisateur, avec
  uniquement des nombres entiers positifs et la date du serveur.
- Pas de Cloud Functions (offre gratuite) : ces totaux sont recalculés par l'application quand un
  responsable ouvre le budget ou les invités (voir limites, section 8).

### 6.12 Programme du jour J — `…/events/{eid}/programme/{pid}`

- **Lecture** : participants. **Création / suppression** : organisateur.
- **Validation** : heure au format `HH:MM` (00:00 à 23:59), moment 1–80, lieu ≤ 80.
- **Modification** interdite : on supprime la ligne et on la recrée.

### 6.13 Comités — `…/events/{eid}/committees/{cid}`

- **Lecture** : participants. **Création / modification / suppression** : organisateur.
- **Validation** : nom 1–80, au plus 50 membres, autant de noms que d'identifiants.

### 6.14 Album photos — `…/events/{eid}/photos/{photoId}` et `…/photos/{photoId}/full/image`

Les photos ne sont **pas** dans Cloud Storage (qui exige l'offre payante Blaze depuis février 2026).
Elles sont réduites dans le navigateur et rangées dans Firestore en **deux documents** :

| Document | Contenu | Taille maximale |
| --- | --- | --- |
| `photos/{id}` | miniature JPEG, légende, largeur, hauteur, auteur, date | 80 000 caractères pour la miniature |
| `photos/{id}/full/image` | grande image JPEG (≈ 1 600 px) | 900 000 caractères (limite Firestore : 1 Mo par document) |

- **Lecture** : participants (la grille ne lit que les miniatures ; la grande image n'est lue qu'à
  l'ouverture d'une photo).
- **Création** : un participant, dans **un seul lot** pour les deux documents :
  - miniature JPEG valide, légende ≤ 140, dimensions entières de 1 à 4 000 px ;
  - `uid` = soi et **nom de l'auteur = son nom de participant** ;
  - `existsAfter` / `getAfter` vérifient que la grande image existe et appartient au même auteur.
    Il ne peut donc pas y avoir de miniature sans image, ni d'image rattachée à la photo d'un autre.
- **Modification** : interdite.
- **Suppression** : l'auteur, ou l'organisateur (modération). L'application supprime les deux
  documents dans le même lot.

### 6.15 Livre d'or — `…/events/{eid}/messages/{messageId}`

Champs : `kind` (`participant` ou `guest`), `text`, `authorName`, `authorPhoto`, `uid`, `createdBy`, `createdAt`.

- **Lecture** : participants.
- **Création** :
  - **message d'un participant** : `uid` = soi, **nom et photo = ceux de sa fiche de participant** ;
  - **message d'un invité validé** : écrit par **l'organisateur** quand il clique « Publier »
    (`kind: guest`, pas d'`uid`, nom = le foyer). Les invités n'écrivent jamais directement ici.
  - Dans les deux cas : texte 1–1 000, `createdBy` = soi, date du serveur.
- **Modification** : interdite.
- **Suppression** : l'auteur d'un message de participant, ou l'organisateur (tous les messages).

### 6.16 Invités — `…/events/{eid}/guests/{token}`

Un document par **foyer** invité. L'identifiant est un **jeton secret de 43 caractères** qui figure
dans le lien personnel envoyé au foyer. Le foyer répond **sans compte**.

Champs : `household`, `phone`, `seats`, `response`, `attending`, `message`, `respondedAt`,
`createdBy`, `createdAt`, et pour le livre d'or : `wish`, `wishState`, `wishAt`.

- **Lecture d'un foyer** : ouverte à qui connaît le jeton (`allow get: if true`) — c'est le principe
  du lien personnel. **Liste** : organisateur seulement (on ne peut pas énumérer les invités).
- **Création** : organisateur, jeton de 43 caractères, réponse `pending`, nombre de places de 1 à 50,
  téléphone international facultatif.
- **Modification** — quatre cas :
  1. **le foyer répond** : seulement `response`, `attending`, `message`, `respondedAt` ;
     « oui » avec 1 à `seats` personnes, ou « non » avec 0 ;
  2. **le foyer laisse un message pour le livre d'or** : seulement `wish` (1–1 000 caractères),
     `wishState: pending` et `wishAt` ; possible **tant que le message n'est pas publié** ;
  3. **l'organisateur publie ou écarte** ce message : `wishState` → `published` ou `hidden` ;
  4. **l'organisateur corrige le foyer** : nom, téléphone, places (sans descendre sous le nombre de
     personnes déjà annoncées).
- **Suppression** : organisateur (le lien cesse de fonctionner).

### 6.17 Carton d'invitation — `…/events/{eid}/public/invitation`

- **Lecture** : ouverte (`docId == 'invitation'`) — la page de réponse l'affiche aux invités sans compte.
- **Création / modification** : organisateur ; titre, type, date, lieu, ville, « qui invite »,
  message ≤ 500, **thème** parmi `royal`, `photo`, `wax`, `ivoire`, couverture parmi `coverKeys()`.
- Le carton ne contient rien de privé : ni budget, ni liste d'invités, ni téléphones.

### 6.18 Ce qui n'est **pas** dans les règles (donc refusé)

Toute autre collection, toute liste des profils, des familles ou des événements, toute suppression
d'une famille ou d'un événement, toute modification d'un lien d'invitation, d'une photo, d'un
message ou d'une ligne du programme.

### 6.19 Les deux règles « mes familles » / « mes événements »

```
match /{path=**}/members/{memberId}      { allow list: if verified() && resource.data.uid == me(); }
match /{path=**}/participants/{pid}      { allow list: if verified() && resource.data.uid == me(); }
```

L'accueil a besoin de « toutes les familles dont je suis membre » et « tous les événements auxquels
je participe ». Ces deux règles autorisent une **requête sur toutes les familles à la fois**
(requête de groupe de collections), mais seulement si elle demande **ses propres lignes**
(`where uid == moi`). On ne peut pas s'en servir pour voir les membres des autres familles.

### 6.20 Suppression du compte

Elle combine plusieurs règles déjà décrites, dans cet ordre (voir `deleteAccount` dans `js/app.js`) :
photos et messages de la personne effacés (6.14, 6.15, 6.5), contributions non confirmées retirées
(6.10), départ des événements avec passage de main à un autre organisateur (6.7), départ des
familles (6.3), nom remplacé par « Compte supprimé » là où la ligne doit rester (6.7, 6.3),
profil effacé (6.1), puis compte de connexion (Firebase Authentication). Les blocages (propriétaire
d'une famille qui a d'autres membres, seul organisateur) sont affichés **avant** de commencer.

## 7. Index nécessaires

| Requête | Index | État |
| --- | --- | --- |
| « Mes familles » : groupe `members`, `where uid ==` | exemption d'index à champ unique `uid` sur le groupe de collections `members` | **déjà ajoutée** dans la console |
| « Mes événements » : groupe `participants`, `where uid ==` | idem sur `participants` | **déjà ajoutée** |
| Album, livre d'or, messages de la famille : `orderBy createdAt desc` | index automatique à champ unique | rien à faire |
| Suppression du compte : `where uid ==` dans `photos`, `messages`, `posts` d'une famille ou d'un événement | index automatique à champ unique | rien à faire |

## 8. Limites connues et choix assumés

- **Lecture d'un foyer invité ouverte à qui a le lien.** Quiconque obtient le lien voit le nom du
  foyer, son nombre de places, son téléphone s'il a été saisi et sa réponse. C'est le prix d'une
  réponse sans compte. Conseil affiché dans l'application : ne pas publier un lien personnel dans
  un groupe ouvert.
- **Message d'invité écarté** : le foyer peut en renvoyer un autre (il repasse « en attente »).
  L'organisateur peut l'écarter à nouveau ; il n'y a pas de blocage définitif.
- **Pas de limite du nombre de photos** par personne : les règles Firestore ne savent pas compter.
  Le quota gratuit est d'environ 1 Go (≈ 3 000 à 5 000 photos pour tout Bennoo). À surveiller dans
  la console (Firestore → Utilisation).
- **Totaux en léger retard** : sans Cloud Functions, un simple membre voit les totaux calculés lors
  de la dernière visite d'un organisateur ou du trésorier (la date est affichée).
- **Le contenu des totaux n'est pas recalculé par les règles** : un organisateur ou un trésorier
  malveillant pourrait y écrire de faux chiffres. Les rôles sont donnés par la famille, on leur fait
  confiance ; une vérification serveur demanderait des Cloud Functions (offre Blaze).
- **Nom de l'organisateur sur un message d'invité** : l'organisateur choisit le texte publié
  (normalement celui du foyer). On lui fait confiance pour la modération.
- **Langue** : le profil n'accepte que `fr` ; la langue choisie est gardée sur l'appareil.
- **Pas d'émulateur dans l'environnement de développement** : ces règles sont relues à la main et
  validées par la console au moment de publier, puis testées en vrai (section 9).

## 9. Tests à faire après chaque publication

Avec deux comptes (A = organisateur, B = simple participant) et un troisième membre de la famille C
qui ne participe pas à l'événement :

| # | Action | Résultat attendu |
| --- | --- | --- |
| 1 | A crée une famille et un événement | OK |
| 2 | B rejoint la famille avec un lien, A l'ajoute à l'événement | OK |
| 3 | C ouvre l'adresse de l'événement | « Cet événement n'existe pas, ou vous n'y participez pas » |
| 4 | B déclare une contribution anonyme | OK ; A ne voit pas son nom, le trésorier oui |
| 5 | B essaie de confirmer sa propre contribution | refusé |
| 6 | B ajoute 2 photos à l'album | OK, visibles par A |
| 7 | B essaie de retirer une photo de A | bouton absent ; refusé si forcé |
| 8 | A retire une photo de B | OK |
| 9 | B écrit dans le livre d'or | OK, visible par A |
| 10 | Un invité laisse un message depuis son lien | invisible pour B tant que A n'a pas cliqué « Publier » |
| 11 | C écrit dans les messages de la famille | OK, visible par A et B |
| 12 | A ajoute une photo de profil | elle apparaît sur sa fiche de membre et de participant |
| 13 | A publie le carton avec le thème Wax | OK, visible par l'invité |
| 14 | A ajoute une ligne au programme | OK, visible par B |

Un refus dans l'application s'affiche « Action non autorisée ». Dans la console du navigateur
(F12), l'erreur est `permission-denied` : c'est le signe qu'une règle manque ou n'est pas publiée.

## 10. Modifier les règles sans rien casser

1. Toute nouvelle collection doit avoir son bloc `match` — sinon elle est inaccessible.
2. Tout nouveau champ doit être ajouté à la liste `hasOnly([...])` du document concerné.
3. Préférer `data().get('champ', valeurParDéfaut)` pour un champ facultatif : les anciens documents
   qui ne l'ont pas restent valides.
4. Garder les écritures liées dans un **lot** et les vérifier avec `getAfter` / `existsAfter`.
5. Mettre à jour **ce document** et le compteur de lignes en tête.
6. Publier, puis refaire les tests de la section 9 qui concernent la modification.
