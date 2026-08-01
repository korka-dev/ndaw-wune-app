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
eas update --branch preview --clear-cache --message "description du changement"
```

### ⚠️ URL de l'API : le piège des fichiers .env

`EXPO_PUBLIC_API_URL` est **inlinée dans le bundle** au moment du bundling.
Contrairement à `eas build`, `eas update` n'utilise PAS le bloc `env` des
profils de `eas.json` : il charge les fichiers `.env` locaux, dans cet ordre
de priorité décroissante :

```
.env.production.local  >  .env.local  >  .env.production  >  .env
```

`.env.local` étant prioritaire sur `.env.production`, une URL de
développement qui y traîne part chez tous les tuteurs et casse l'app (aucun
appel API n'aboutit). C'est arrivé le 01/08/2026.

Organisation en place pour l'éviter :

| Fichier | Contenu | Chargé par |
|---|---|---|
| `.env.development.local` | URL LAN de dev (`http://192.168.x.x:8000/api/v1`) | `expo start` uniquement |
| `.env.production` | `https://api.ndawwune.cloud/api/v1` | `eas update`, `expo export`, `eas build` |

**Ne jamais recréer de `.env.local`** : il serait chargé aussi bien en
développement qu'en production.

`--clear-cache` est indispensable : Metro met en cache la valeur déjà inlinée,
et un changement de `.env` sans vidage de cache produit un bundle avec
l'ancienne URL (le log affiche pourtant le bon fichier chargé — trompeur).

### Vérifier le bundle AVANT de publier

```bash
npx expo export --platform android --clear --output-dir /tmp/dist-check
B=$(python3 -c "import json;print(json.load(open('/tmp/dist-check/metadata.json'))['fileMetadata']['android']['bundle'])")
grep -aoE 'https?://[a-zA-Z0-9._:-]+/api/v1' "/tmp/dist-check/$B" | sort -u
```

La seule URL affichée doit être `https://api.ndawwune.cloud/api/v1`.

### En cas de mauvaise publication

```bash
# Neutraliser immédiatement : les apps repassent sur le bundle embarqué dans l'APK
eas update:roll-back-to-embedded --branch preview --message "annulation"
```

Puis republier une version correcte : la mise à jour la plus récente gagne.
Aucun appareil n'a besoin de réinstaller — la récupération se fait au
lancement suivant, `expo-updates` interrogeant `u.expo.dev` indépendamment de
l'API de l'app.

Comment ça se passe côté utilisateur, une fois l'APK à jour (voir point 2)
installé au moins une fois :
- **Automatique** : `expo.updates.checkAutomatically = "ON_LOAD"` (déjà
  configuré dans `app.json`) déclenche une vérification à chaque lancement
  de l'app ; si une mise à jour existe, elle est téléchargée en arrière-plan
  et appliquée au lancement suivant, sans aucune action de l'utilisateur.
- **Alerte à l'entrée dans l'app** : `src/components/UpdateModal.tsx` vérifie
  au lancement ET à chaque retour depuis l'arrière-plan (`AppState`), télécharge
  la nouvelle version en silence, puis affiche une boîte de dialogue
  "Mise à jour disponible" avec un bouton **Faire la mise à jour** qui redémarre
  l'app immédiatement. "Plus tard" reporte au prochain lancement, sans
  réafficher l'alerte pendant la session en cours.
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
| Mise à jour JS/TS (bugfix, feature…) | `eas update --branch preview --clear-cache --message "..."` |
| Après git pull / changement package.json | `npm install` |

**Note ponctuelle** : les APK déjà installés avant l'ajout de la config
`expo.updates` (2026-07-29) ne recevront jamais les mises à jour OTA —
`updates.url` est figé au moment du build. Il faut qu'ils réinstallent
**une dernière fois** un APK buildé après cette date ; tous les futurs
changements JS/TS passeront ensuite par `eas update`, sans nouveau
téléchargement.
