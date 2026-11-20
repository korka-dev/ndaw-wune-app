# Ared Ndawune Mobile App

Ceci est l'application mobile pour le projet NDAW-WUNE, développée avec [React Native](https://reactnative.dev/) et [Expo](https://expo.dev/).

## Prérequis

- [Node.js](https://nodejs.org/) installé sur votre machine.
- L'application **Expo Go** installée sur votre téléphone physique (disponible sur iOS et Android) OU un émulateur Android / simulateur iOS configuré sur votre ordinateur.

## Installation

1. Placez-vous à la racine de ce dépôt (`ndaw-wune-app`, celui qui contient
   `package.json` et `app.json`) :
   ```bash
   git clone git@github.com:korka-dev/ndaw-wune-app.git
   cd ndaw-wune-app
   ```

2. Installez exactement les versions verrouillées (`package-lock.json`) :
   ```bash
   npm ci
   ```

3. Indiquez l'API à utiliser dans `.env.local` (jamais committé) :
   ```bash
   echo "EXPO_PUBLIC_API_URL=http://<ip-de-votre-poste>:8000/api/v1" > .env.local
   ```
   Pour les versions de recette et de production, voir `BUILD.md`.

## Lancer l'application

Pour démarrer le serveur de développement Expo, exécutez la commande suivante :

```bash
npm start
```

Une fois le serveur démarré, un **QR Code** s'affichera dans votre terminal.

### Options pour visualiser l'application :

- **Sur un téléphone physique (Android / iOS)** :
  1. Téléchargez l'application **Expo Go** depuis le Play Store ou l'App Store.
  2. Scannez le QR code affiché dans le terminal (utilisez l'appareil photo sur iOS, ou scannez directement depuis l'application Expo Go sur Android).

- **Sur un émulateur Android** :
  1. Assurez-vous que votre émulateur Android est lancé (via Android Studio).
  2. Appuyez sur la touche `a` dans le terminal où tourne Expo, ou lancez directement l'application avec :
     ```bash
     npm run android
     ```

- **Sur un simulateur iOS (Mac uniquement)** :
  1. Ouvrez l'application Simulateur depuis Spotlight.
  2. Appuyez sur la touche `i` dans le terminal où tourne Expo, ou lancez directement l'application avec :
     ```bash
     npm run ios
     ```

## Vérifier avant de livrer

```bash
npx tsc --noEmit -p .
npx jest
```

La CI GitHub (`.github/workflows/ci.yml`) rejoue ces deux contrôles et l'audit
des dépendances à chaque pull request.

## Synchronisation hors ligne

- Toute saisie est d'abord enregistrée sur le téléphone (SQLite), rattachée à
  son auteur, puis envoyée par la file `src/services/queue.ts`.
- Chaque envoi porte un identifiant stable (`client_op_id`, `client_seance_id`) :
  un renvoi après coupure ne crée jamais de doublon côté serveur.
- **Profil → Synchronisation** montre ce qui attend, ce qui a été refusé
  (Réessayer / Supprimer) et la date du dernier envoi. La déconnexion ne supprime
  jamais les saisies non envoyées.

## Structure du projet

- `app/` : Contient les routes et écrans principaux de l'application (basé sur Expo Router).
- `src/` : Contient les composants, services (comme Axios), le state management (Zustand), etc.
- `assets/` : Ressources statiques comme les images et les polices.
