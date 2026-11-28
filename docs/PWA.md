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

La version web est servie sur le domaine existant, sous
**https://ndawwune.ared-edu.org/app/** : aucun nouveau DNS. La page de
téléchargement reste à la racine (https://ndawwune.ared-edu.org/).

1. API : ajouter `https://ndawwune.ared-edu.org` à `CORS_ORIGINS` dans le
   `.env` de l'API (séparé par une virgule), puis redéployer l'API.
2. Sur le VPS :

   ```bash
   git clone https://github.com/korka-dev/ndaw-wune-app.git /opt/ndawwune/app
   cd /opt/ndawwune/app && git checkout lot-L13-role-superviseur
   bash deploy_pwa.sh
   ```

   Le script :
   - construit la version web dans Docker (Node inutile sur le serveur), avec
     le préfixe `/app` (`EXPO_WEB_BASE_URL`, puis `scripts/prefixe-web.mjs`) ;
   - la publie dans `/var/www/ndawwune-app` ;
   - copie la route `Caddyfile.app` dans `/etc/caddy/ndawwune-app.route` et
     ajoute `import /etc/caddy/ndawwune-app.route` dans le bloc du site
     `ndawwune.ared-edu.org` (sauvegarde `.avant-app`) ; si la configuration
     est invalide, le site est remis comme avant et Caddy n'est pas rechargé.

   Mises à jour : relancer `bash deploy_pwa.sh`.

## Installer sur le téléphone

- **Android (Chrome)** : ouvrir `https://ndawwune.ared-edu.org/app/` → menu ⋮ →
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
