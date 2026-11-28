# Version web installable (PWA) — lot L12

Même application que l'APK, ouverte dans le navigateur et ajoutée à l'écran
d'accueil (icône NdawWune). Mêmes identifiants, même serveur, mêmes données.
Tuteurs, superviseurs et inspecteurs retrouvent leur espace.

## Ce qui diffère de l'APK

| Fonction | PWA |
|---|---|
| Connexion, planning, minuteur, rapports, pointage, espace inspecteur | identique |
| Hors ligne | base locale du navigateur (SQLite WebAssembly), non chiffrée |
| Connexion mémorisée | stockage du navigateur (effacé à la déconnexion) |
| Ressources | PDF affichés dans le navigateur ; autres fichiers téléchargés |
| Rappels vocaux / notifications | non disponibles |
| Verrou par empreinte | non disponible |
| Mises à jour | automatiques au lancement suivant (pas d'APK à réinstaller) |

## Mise en production

1. DNS : enregistrement A de `app.ndawwune.ared-edu.org` vers le VPS.
2. API : ajouter `https://app.ndawwune.ared-edu.org` à `CORS_ORIGINS` dans le
   `.env` de l'API (séparé par une virgule), puis redéployer l'API
   (la version qui envoie `Cross-Origin-Resource-Policy` est nécessaire).
3. Sur le VPS :

   ```bash
   git clone https://github.com/korka-dev/ndaw-wune-app.git /opt/ndawwune/app
   cd /opt/ndawwune/app && git checkout lot-L12-pwa
   bash deploy_pwa.sh
   ```

   Le script construit la version web dans Docker (Node inutile sur le
   serveur), la publie dans `/var/www/ndawwune-app` et configure Caddy
   (`/etc/caddy/sites/ndawwune-app.caddy`). Mises à jour : relancer
   `bash deploy_pwa.sh`.

## Installer sur le téléphone

- **Android (Chrome)** : ouvrir `https://app.ndawwune.ared-edu.org` → menu ⋮ →
  « Ajouter à l'écran d'accueil » (ou « Installer l'application »).
- **iPhone (Safari)** : ouvrir le lien → bouton Partager → « Sur l'écran d'accueil ».

## Technique

- `metro.config.js` remplace, sur le web seulement, les modules propres au
  téléphone par `src/web/*` (stockage, empreinte, PDF, ouverture d'app).
- `src/services/dbCipher.web.ts` : base locale non chiffrée.
- `public/` : `index.html` (manifeste, service worker), `manifest.webmanifest`,
  `sw.js`, icônes.
- La page est isolée (COOP `same-origin` + COEP `require-corp`) : exigé par la
  base locale. L'API répond donc avec `Cross-Origin-Resource-Policy: cross-origin`.
- Essai local : `EXPO_PUBLIC_API_URL=http://localhost:8100/api/v1 npm run build:web`,
  puis servir `dist-web/` avec les en-têtes ci-dessus.
