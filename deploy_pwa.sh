#!/usr/bin/env bash
# ==============================================================================
#  NDAW WUNE — Déploiement de la version web de l'application (PWA, lot L12)
#
#  Sur le VPS (Docker et Caddy déjà installés par l'API) :
#    git clone https://github.com/korka-dev/ndaw-wune-app.git /opt/ndawwune/app
#    cd /opt/ndawwune/app && git checkout <branche>
#    sudo bash deploy_pwa.sh
#
#  La version web est servie sous https://$SITE_DOMAIN$BASE_PATH/ (défaut :
#  https://ndawwune.ared-edu.org/app/) : aucun nouveau DNS, la page de
#  téléchargement reste à la racine du site.
#
#  Variables (facultatives) :
#    SITE_DOMAIN domaine du site existant (défaut : ndawwune.ared-edu.org)
#    BASE_PATH   sous-chemin de l'app     (défaut : /app)
#    API_URL     URL de l'API             (défaut : https://api.ndawwune.ared-edu.org/api/v1)
#
#  Le même script sert aux mises à jour (git pull + reconstruction).
#  Côté API, ajouter https://$SITE_DOMAIN à CORS_ORIGINS (.env) puis redéployer.
# ==============================================================================
set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
log()     { echo -e "${CYAN}▶  $*${NC}"; }
success() { echo -e "${GREEN}✅  $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠️   $*${NC}"; }
error()   { echo -e "${RED}❌  $*${NC}"; exit 1; }

SITE_DOMAIN="${SITE_DOMAIN:-ndawwune.ared-edu.org}"
BASE_PATH="/$(echo "${BASE_PATH:-/app}" | sed 's#^/*##; s#/*$##')"
ROUTE_FILE="/etc/caddy/ndawwune-app.route"
API_URL="${API_URL:-https://api.ndawwune.ared-edu.org/api/v1}"
# Dossier de la version web. Surtout pas /var/www/ndawwune-app : c'est celui de
# la page de téléchargement (index.html, logo, ndawwune.apk).
WEB_ROOT="/var/www/ndawwune-pwa"
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
  -e EXPO_PUBLIC_API_URL="$API_URL" -e EXPO_WEB_BASE_URL="$BASE_PATH" -e CI=1 -e EXPO_NO_TELEMETRY=1 \
  node:24-slim sh -c "npm ci --no-audit --no-fund --loglevel=error && npx expo export --platform web --output-dir dist-web && node scripts/prefixe-web.mjs '$BASE_PATH' dist-web"

[ -f dist-web/index.html ] && [ -f dist-web/sw.js ] && [ -f dist-web/manifest.webmanifest ] \
  || error "Construction incomplète (index.html, sw.js ou manifest.webmanifest manquant)."
grep -rqF "$API_URL" dist-web/_expo/static/js/web/ || error "L'URL de l'API n'apparaît pas dans le code construit."
grep -qF "src=\"${BASE_PATH}/_expo/" dist-web/index.html || error "Le code n'est pas préfixé par ${BASE_PATH}."
success "Version web construite ($(du -sh dist-web | cut -f1))."

# ── 3. Publication (remplacement d'un bloc) ───────────────────────────────────
$SUDO mkdir -p "$(dirname "$WEB_ROOT")"
$SUDO rm -rf "${WEB_ROOT}.new" && $SUDO cp -r dist-web "${WEB_ROOT}.new"
$SUDO rm -rf "${WEB_ROOT}.old"
[ -d "$WEB_ROOT" ] && $SUDO mv "$WEB_ROOT" "${WEB_ROOT}.old"
$SUDO mv "${WEB_ROOT}.new" "$WEB_ROOT"
$SUDO chmod -R a+rX "$WEB_ROOT"
success "Fichiers publiés dans $WEB_ROOT."

# ── 4. Caddy : route ${BASE_PATH} dans le site existant ───────────────────────
if command -v caddy >/dev/null; then
  $SUDO cp Caddyfile.app "$ROUTE_FILE"
  $SUDO sed -i "s#/app#${BASE_PATH}#g" "$ROUTE_FILE"
  # Fichier qui contient le bloc du site (ex. « ndawwune.ared-edu.org { »).
  DOM_RE="$(echo "$SITE_DOMAIN" | sed 's/\./\\./g')"
  SITE_FILE=$($SUDO grep -lE "^[[:space:]]*([^#{]*[ ,/])?${DOM_RE}(:[0-9]+)?[[:space:]]*(,[^{]*)?\{[[:space:]]*$" \
              /etc/caddy/Caddyfile /etc/caddy/sites/*.caddy 2>/dev/null | head -1 || true)
  [ -n "$SITE_FILE" ] || error "Bloc du site ${SITE_DOMAIN} introuvable dans /etc/caddy : ajoutez-y à la main la ligne « import ${ROUTE_FILE} »."

  if ! $SUDO grep -qF "import ${ROUTE_FILE}" "$SITE_FILE"; then
    $SUDO cp "$SITE_FILE" "${SITE_FILE}.avant-app"
    $SUDO awk -v re="^[[:space:]]*([^#{]*[ ,/])?${DOM_RE}(:[0-9]+)?[[:space:]]*(,[^{]*)?\\{[[:space:]]*$" -v imp="    import ${ROUTE_FILE}" \
      '{ print } !fait && $0 ~ re { print imp; fait = 1 }' "${SITE_FILE}.avant-app" | $SUDO tee "$SITE_FILE" >/dev/null
    success "Route ${BASE_PATH} ajoutée au site ${SITE_DOMAIN} (${SITE_FILE}, sauvegarde .avant-app)."
  fi

  if $SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    $SUDO systemctl reload caddy
    success "Caddy : https://${SITE_DOMAIN}${BASE_PATH}/"
  else
    $SUDO caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
    [ -f "${SITE_FILE}.avant-app" ] && $SUDO cp "${SITE_FILE}.avant-app" "$SITE_FILE"
    error "Configuration Caddy invalide : site remis comme avant, Caddy non rechargé."
  fi
else
  warn "Caddy introuvable : fichiers publiés mais site non exposé."
fi

echo
warn "Côté API : CORS_ORIGINS (.env) doit contenir https://${SITE_DOMAIN}, puis redéployer l'API."
success "Terminé. Lien à partager : https://${SITE_DOMAIN}/ (iPhone → bouton « Ouvrir NDAW WUNE »)."
