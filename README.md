# Bennoo — Une cérémonie, toute la famille, un seul endroit.

Application web statique (HTML/CSS/JS, aucune étape de compilation) pour organiser les
événements familiaux : mariages, baptêmes / ngenté, communions, anniversaires, réunions.

## Structure
- `index.html` — page principale
- `css/styles.css` — tous les styles (d'après les maquettes)
- `js/app.js` — toute la logique de l'application
- `images/` — logo et illustrations
- `firestore.rules` — règles d'accès à coller dans la console Firebase
- `maquettes/` — maquettes de référence

## Ce qui fonctionne (étape 1)
Lancement et présentation, inscription par email (prénom, nom, conditions), connexion,
mot de passe oublié, vérification de l'email, accueil personnel, Family Hub (membres,
événements, invitation par lien WhatsApp), détail d'un membre, création d'un événement
en 5 étapes, tableau de bord de l'événement, participants et rôles, paramètres et profil.

Prochaines étapes : tâches, budget et contributions, invités et RSVP, album photos.

## Relier Firebase
1. Créer le projet Firebase « bennoo » (région Europe).
2. Authentication : activer « Adresse e-mail / Mot de passe ».
3. Firestore : créer la base, puis coller le contenu de `firestore.rules` dans l'onglet Règles et publier.
4. Firestore > Index : ajouter une exception sur le champ `uid` en portée « groupe de collections »
   pour `members` et pour `participants`.
5. Copier la configuration web (`firebaseConfig`) en haut de `js/app.js`.
6. Authentication > Paramètres > Domaines autorisés : ajouter le domaine du site.

Tant que Firebase n'est pas relié, les écrans s'affichent mais l'inscription et la connexion
indiquent qu'elles ne sont pas encore activées.

## Voir la page
- En local : ouvrir `index.html` dans le navigateur.
- En ligne : GitHub Pages (Settings → Pages, branche `main`, dossier `/ (root)`).
  Pour un dépôt privé, GitHub Pages demande un compte GitHub payant ; sinon, Firebase Hosting.
