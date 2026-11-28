# ==============================================================================
#  NDAW WUNE — Config Caddy pour la version web de l'application (PWA, lot L12)
#
#  Installé par deploy_pwa.sh dans /etc/caddy/sites/ndawwune-app.caddy (le
#  domaine suit APP_DOMAIN). Fichiers statiques servis depuis
#  /var/www/ndawwune-app (résultat de `expo export --platform web`).
#
#  Créer d'abord l'enregistrement DNS (A/AAAA) du domaine vers ce VPS.
# ==============================================================================

app.ndawwune.ared-edu.org {
    root * /var/www/ndawwune-app
    encode zstd gzip

    header {
        # Base locale (SQLite WebAssembly) : la page doit être isolée.
        Cross-Origin-Opener-Policy   "same-origin"
        Cross-Origin-Embedder-Policy "require-corp"
        Cross-Origin-Resource-Policy "same-origin"
        X-Content-Type-Options       "nosniff"
        Referrer-Policy              "strict-origin-when-cross-origin"
        Strict-Transport-Security    "max-age=31536000"
        Permissions-Policy           "geolocation=(), microphone=()"
        -Server
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
