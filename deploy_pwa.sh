#!/usr/bin/env bash
# ==============================================================================
#  NDAW WUNE — Déploiement de la version web de l'application (PWA, lot L12)
#
#  Sur le VPS (Docker et Caddy déjà installés par l'API) :
#    git clone https://github.com/korka-dev/ndaw-wune-app.git /opt/ndawwune/app
#    cd /opt/ndawwune/app && git checkout <branche>
#    sudo bash deploy_pwa.sh
#
#  Variables (facultatives) :
#    APP_DOMAIN  domaine de la PWA      (défaut : app.ndawwune.ared-edu.org)
#    API_URL     URL de l'API           (défaut : https://api.ndawwune.ared-edu.org/api/v1)
#
#  Le même script sert aux mises à jour (git pull + reconstruction).
#  Côté API, ajouter https://$APP_DOMAIN à CORS_ORIGINS (.env) puis redéployer.
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()     { echo -e "${CYAN}▶  $*${NC}"; }
success() { echo -e "${GREEN}✅  $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️   $*${NC}"; }
error()   { echo -e "${RED}❌  $*${NC}"; exit 1; }

APP_DOMAIN="${APP_DOMAIN:-app.ndawwune.ared-edu.org}"
API_URL="${API_URL:-https://api.ndawwune.ared-edu.org/api/v1}"
WEB_ROOT="/var/www/ndawwune-app"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v docker >/dev/null || error "Docker n'est pas installé (lancez d'abord deploy_vps.sh de l'API)."
echo "$API_URL" | grep -q "^https://" || error "API_URL doit commencer par https:// (reçu : $API_URL)."

# ── 1. Code à jour ────────────────────────────────────────────────────────────
if git rev-parse --git-dir >/dev/null 2>&1; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  log "Branche $BRANCH — git pull"
  git pull --ff-only origin "$BRANCH"
fi
success "Version : $(git log -1 --format='%h %s' 2>/dev/null || echo '?')"

# ── 2. Construction (dans Docker : pas besoin de Node sur le serveur) ────────
log "Construction de la version web (API : $API_URL)…"
rm -rf dist-web
docker run --rm \
  -v "$PWD":/app -v ndawwune-app-node-modules:/app/node_modules -w /app \
  -e EXPO_PUBLIC_API_URL="$API_URL" -e CI=1 -e EXPO_NO_TELEMETRY=1 \
  node:24-slim sh -c "npm ci --no-audit --no-fund --loglevel=error && npx expo export --platform web --output-dir dist-web"

[ -f dist-web/index.html ] && [ -f dist-web/sw.js ] && [ -f dist-web/manifest.webmanifest ] \
  || error "Construction incomplète (index.html, sw.js ou manifest.webmanifest manquant)."
grep -rqF "$API_URL" dist-web/_expo/static/js/web/ || error "L'URL de l'API n'apparaît pas dans le code construit."
success "Version web construite ($(du -sh dist-web | cut -f1))."

# ── 3. Publication (remplacement d'un bloc) ───────────────────────────────────
$SUDO mkdir -p "$(dirname "$WEB_ROOT")"
$SUDO rm -rf "${WEB_ROOT}.new" && $SUDO cp -r dist-web "${WEB_ROOT}.new"
$SUDO rm -rf "${WEB_ROOT}.old"
[ -d "$WEB_ROOT" ] && $SUDO mv "$WEB_ROOT" "${WEB_ROOT}.old"
$SUDO mv "${WEB_ROOT}.new" "$WEB_ROOT"
$SUDO chmod -R a+rX "$WEB_ROOT"
success "Fichiers publiés dans $WEB_ROOT."

# ── 4. Caddy ──────────────────────────────────────────────────────────────────
if command -v caddy >/dev/null; then
  $SUDO mkdir -p /etc/caddy/sites
  grep -q "import /etc/caddy/sites/\*.caddy" /etc/caddy/Caddyfile 2>/dev/null \
    || echo -e "\nimport /etc/caddy/sites/*.caddy" | $SUDO tee -a /etc/caddy/Caddyfile >/dev/null
  sed "s/^app\.ndawwune\.ared-edu\.org {/${APP_DOMAIN} {/" Caddyfile.app | $SUDO tee /etc/caddy/sites/ndawwune-app.caddy >/dev/null
  if $SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    $SUDO systemctl reload caddy
    success "Caddy : https://${APP_DOMAIN}"
  else
    $SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
    error "Configuration Caddy invalide : Caddy non rechargé."
  fi
else
  warn "Caddy introuvable : fichiers publiés mais site non exposé."
fi

echo
warn "Côté API : CORS_ORIGINS (.env) doit contenir https://${APP_DOMAIN}, puis redéployer l'API."
success "Terminé. Ouvrez https://${APP_DOMAIN} sur le téléphone → menu ⋮ → « Ajouter à l'écran d'accueil »."
