# Build & déploiement — NdawWune Mobile

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
| `.env.production` | URL de l'API de production (identique aux profils `preview` et `production` d'`eas.json`) | `eas update`, `expo export`, `eas build` |

**Ne jamais recréer de `.env.local`** : il serait chargé aussi bien en
développement qu'en production.

`--clear-cache` est indispensable : Metro met en cache la valeur déjà inlinée,
et un changement de `.env` sans vidage de cache produit un bundle avec
l'ancienne URL (le log affiche pourtant le bon fichier chargé — trompeur).

### Vérifier le bundle AVANT de publier

```bash
npm run verifier:bundle -- --export
```

Le script (APP-42) refuse la publication si un `.env.local` traîne, si
`.env.production` et `eas.json` divergent, ou si le bundle exporté appelle une
autre API que celle de `.env.production`. Changement de domaine (serveur
ARED) : voir `Backend/ndaw-wune-api/docs/DEPLOIEMENT_ARED.md` — les APK déjà
installés gardent l'URL inscrite dans leur bundle tant qu'ils n'ont pas reçu
la mise à jour OTA : l'ancien domaine doit rester servi pendant la transition.

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

## 4. Vulnérabilités npm

Ne jamais lancer `npm audit fix --force` : il changerait la version d'Expo
hors de la procédure ci-dessous. Après la montée en SDK 58, `npm audit
--omit=dev` ne signale plus que 3 alertes « moderate » dans l'outillage de
build (`minimatch` via `@expo/fingerprint`), absentes du bundle de l'app.

---

## 5. Montée Expo SDK 54 → 58 (version 1.1.0)

La branche `lot-L5-expo-sdk` passe le projet de **SDK 54 (RN 0.81)** à
**SDK 58 (RN 0.88, React 19.3, TypeScript 6)**, une version à la fois
(55, 56, 57, 58). Changements :

- **Son de fin d'activité** : `expo-av` remplacé par `expo-audio` (le module
  n'est plus maintenu). Le son est joué au premier plan ; en arrière-plan,
  c'est la notification planifiée qui sonne.
- **Splash** : configuration déplacée dans le plugin `expo-splash-screen`.
- **Barre d'état** : `backgroundColor` / `translucent` supprimés. Android
  est « edge-to-edge » depuis le SDK 54 ; les marges viennent des safe areas.
- **Dépendances devenues explicites** : `@expo/vector-icons`, `expo-asset`,
  `expo-system-ui` (applique le thème clair sur Android),
  `@expo/config-plugins` (requis par le plugin `react-native-pdf`, seul
  avertissement restant d'`expo-doctor`), `@react-native/jest-preset` et
  `react-test-renderer` (tests).
- **TypeScript 6** (mode strict par défaut) et **RN 0.88** (composants en
  fonctions) : les refs utilisent `ComponentRef<typeof View>` ;
  `StyleSheet.absoluteFillObject` devient `StyleSheet.absoluteFill`.

### Mise en service : un NOUVEL APK est obligatoire

Le code natif change : **aucune mise à jour OTA ne peut faire passer un
APK SDK 54 en SDK 58.** La version passe à **1.1.0** ; avec
`runtimeVersion.policy = "appVersion"`, les OTA de la 1.1.0 ne sont jamais
envoyées aux APK 1.0.0, qui continuent à recevoir celles de la 1.0.0.

1. `npm ci`, puis `npm run verifier:bundle -- --export`.
2. `eas build --profile preview --platform android`, puis installation sur
   le **téléphone de référence**. Recette : connexion ; synchronisation et
   file d'attente (saisies hors ligne conservées depuis la 1.0.0 installée
   par-dessus) ; démarrage et fin de séance avec le **son d'alarme** ;
   notifications vocales ; ouverture d'une ressource **PDF** ; photo du
   rapport ; évaluation d'un élève (superviseur) ; verrou biométrique ; mise à jour OTA.
3. Diffusion de l'APK 1.1.0 aux tuteurs et superviseurs.
4. Une fois tous les terminaux en 1.1.0 : `MIN_APP_VERSION=1.1.0` côté API.
   Les retardataires voient l'écran de mise à jour ; leur file d'attente est
   conservée et envoyée après installation.
5. Publication Play Store : renseigner `android.versionCode` (supérieur au
   dernier publié) dans `app.json` avant `eas build --profile production`.

Retour arrière : réinstaller l'APK 1.0.0 (SDK 54), qui continue de recevoir
les OTA de la branche 1.0.0.

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
