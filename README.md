# Bennoo

**Une cérémonie, toute la famille, un seul endroit.**

Bennoo aide les familles du Sénégal et de la diaspora à organiser ensemble leurs événements :
mariages, baptêmes / ngenté, communions, anniversaires, réunions familiales.

## Principe technique

- Site web statique (HTML, CSS, JavaScript sans étape de compilation) dans `public/`.
- **Firebase** : Authentication (email + mot de passe), Firestore (données), Hosting.
- La sécurité est assurée par [`firestore.rules`](firestore.rules), testées automatiquement.

Voir [`docs/decisions.md`](docs/decisions.md) pour les choix et [`docs/status.md`](docs/status.md)
pour l'état exact de chaque fonctionnalité.

## Structure

```
public/index.html        page unique de l'application
public/js/app.js         démarrage et navigation (#/…)
public/js/screens.js     écrans (conformes aux maquettes du dossier maquettes/)
public/js/ui.js          barre de navigation, avatars, icônes
public/js/data.js        lectures et écritures Firestore
public/js/lib/format.js  fonctions pures (validation, montants, dates, liens)
public/js/config.js      configuration du projet Firebase (à compléter)
firestore.rules          règles d'accès
tests/unit               tests des fonctions pures
tests/rules              tests des règles d'accès (émulateur Firestore)
tests/e2e                parcours complet dans un navigateur (émulateurs + Playwright)
```

## Lancer en local

Prérequis : Node.js 22, Java 21 (pour les émulateurs Firebase).

```bash
npm install
npm run serve          # site + émulateurs sur http://127.0.0.1:5000 (aucune donnée réelle)
npm run test:unit
npm run test:rules
npm run test:e2e       # nécessite : npx playwright install chromium
```

## Mettre en ligne

1. Créer un projet sur console.firebase.google.com (région Europe), activer
   Authentication > Email/Mot de passe, et Firestore.
2. Copier la configuration web dans `public/js/config.js`.
3. `npx firebase login` puis `npx firebase deploy --only firestore,hosting --project <id-du-projet>`.
