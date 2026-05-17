# Ared Ndawune Mobile App

Ceci est l'application mobile pour le projet NDAW-WUNE, développée avec [React Native](https://reactnative.dev/) et [Expo](https://expo.dev/).

## Prérequis

- [Node.js](https://nodejs.org/) installé sur votre machine.
- L'application **Expo Go** installée sur votre téléphone physique (disponible sur iOS et Android) OU un émulateur Android / simulateur iOS configuré sur votre ordinateur.

## Installation

1. Assurez-vous d'être dans le dossier `app-mobile` :
   ```bash
   cd app-mobile
   ```

2. Installez les dépendances du projet (en utilisant l'indicateur `--legacy-peer-deps` pour éviter les conflits liés aux dépendances paires) :
   ```bash
   npm install --legacy-peer-deps
   ```

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

## Structure du projet

- `app/` : Contient les routes et écrans principaux de l'application (basé sur Expo Router).
- `src/` : Contient les composants, services (comme Axios), le state management (Zustand), etc.
- `assets/` : Ressources statiques comme les images et les polices.
