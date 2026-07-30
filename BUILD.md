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
- **Tu changes `app.json` → `expo.updates` ou `expo.version`** (ces champs
  sont figés dans le binaire à la compilation — ex: le passage d'un ancien
  APK sans URL `updates` configurée vers la configuration OTA actuelle
  nécessite un nouveau build, une seule fois)

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

Comment ça se passe côté utilisateur, une fois l'APK à jour (voir point 2)
installé au moins une fois :
- **Automatique** : `expo.updates.checkAutomatically = "ON_LOAD"` (déjà
  configuré dans `app.json`) déclenche une vérification à chaque lancement
  de l'app ; si une mise à jour existe, elle est téléchargée en arrière-plan
  et appliquée au lancement suivant, sans aucune action de l'utilisateur.
- **Bandeau en direct** : un bandeau "Une nouvelle version est prête" avec un
  bouton **Redémarrer** apparaît automatiquement en haut de l'écran dès
  qu'une mise à jour a fini de se télécharger pendant que l'app est déjà
  ouverte (`src/components/UpdateBanner.tsx`) — pas besoin d'attendre un
  redémarrage manuel de l'app.
- **Vérification manuelle** : un bouton "Vérifier les mises à jour" est
  disponible dans l'écran Profil, pour un utilisateur qui veut forcer la
  vérification immédiatement.

**Important** : `runtimeVersion.policy = "appVersion"` (déjà configuré) lie
chaque mise à jour OTA à la valeur `expo.version` de l'APK installé — une
mise à jour publiée sur un `version` différent n'atteindra pas les appareils
qui tournent sur l'ancien `version`. Ne change `expo.version` que lors d'un
nouveau build natif (point 2), jamais pour un simple `eas update`.

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

**Note ponctuelle** : les APK déjà installés avant l'ajout de la config
`expo.updates` (2026-07-29) ne recevront jamais les mises à jour OTA —
`updates.url` est figé au moment du build. Il faut qu'ils réinstallent
**une dernière fois** un APK buildé après cette date ; tous les futurs
changements JS/TS passeront ensuite par `eas update`, sans nouveau
téléchargement.
