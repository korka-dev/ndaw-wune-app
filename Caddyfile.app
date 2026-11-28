# ==============================================================================
#  NDAW WUNE — Route Caddy de la version web de l'application (PWA)
#
#  Servie sous https://ndawwune.ared-edu.org/app/ : pas de nouveau DNS.
#  deploy_pwa.sh copie ce fichier dans /etc/caddy/ndawwune-app.route et ajoute
#      import /etc/caddy/ndawwune-app.route
#  DANS le bloc du site ndawwune.ared-edu.org (la page de téléchargement reste
#  à la racine). Fichiers servis depuis /var/www/ndawwune-app.
# ==============================================================================

redir /app /app/ 308

handle_path /app/* {
    root * /var/www/ndawwune-app
    encode zstd gzip

    header {
        # Base locale (SQLite WebAssembly) : la page doit être isolée.
        Cross-Origin-Opener-Policy   "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
        Cross-Origin-Resource-Policy "same-origin"
        X-Content-Type-Options       "nosniff"
        Permissions-Policy           "geolocation=(), microphone=()"
    }

    # Fichiers de l'app : noms hashés → cache 1 an.
    @immutable path /_expo/static/*
    header @immutable Cache-Control "public, max-age=31536000, immutable"

    # Toujours revérifiés : nouvelle version visible au prochain lancement.
    @frais path / /index.html /sw.js /manifest.webmanifest
    header @frais Cache-Control "no-cache"

    @wasm path *.wasm
    header @wasm Content-Type "application/wasm"

    # Application d'une seule page : toute adresse inconnue renvoie index.html.
    try_files {path} {path}.html /index.html
    file_server
}
