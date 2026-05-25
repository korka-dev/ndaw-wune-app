# Build & déploiement — ARED NdawWune Mobile

## Prérequis

- Node.js installé
- Expo CLI + EAS CLI installés globalement :
  ```bash
  npm install -g expo-cli eas-cli
  ```
- Être connecté à ton compte Expo :
  ```bash
  eas login
  ```

---

## 1. Installation des dépendances

À faire une fois après un `git pull` ou en cas de changement dans `package.json` :

```bash
npm install
```

---

## 2. Builder l'APK (première fois ou changement natif)

Un nouveau build APK est nécessaire uniquement si :
- C'est la première installation sur un appareil
- Tu as ajouté un nouveau module natif (ex: une nouvelle lib `expo-*`)
- Tu as ajouté une permission Android
- Tu as mis à jour la version d'Expo SDK

```bash
# Build APK pour distribution interne (Android uniquement)
eas build --profile preview --platform android
```

Le build se lance sur les serveurs Expo. Une fois terminé (10-20 min), tu reçois un lien de téléchargement de l'APK.

---

## 3. Mettre à jour l'app sans nouvel APK (OTA)

Pour tous les changements JavaScript/TypeScript (nouvelles fonctionnalités, corrections de bugs, changements d'API…), pas besoin de rebuilder. Lance simplement :

```bash
eas update --branch preview --message "description du changement"
```

Les utilisateurs reçoivent la mise à jour automatiquement au prochain lancement de l'app.

---

## 4. Vulnérabilités npm (postcss / ws)

Ne jamais lancer `npm audit fix --force` — cela upgraderait Expo et casserait l'app.

Les dépendances `postcss` et `ws` sont déjà patchées via `overrides` dans `package.json`. Un simple `npm install` suffit.

---

## Résumé rapide

| Situation | Commande |
|---|---|
| Premier build / nouveau module natif | `eas build --profile preview --platform android` |
| Mise à jour JS/TS (bugfix, feature…) | `eas update --branch preview --message "..."` |
| Après git pull / changement package.json | `npm install` |
