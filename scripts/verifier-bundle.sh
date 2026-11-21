#!/usr/bin/env bash
# ==============================================================================
#  NDAW WUNE Mobile — Contrôle avant `eas update` / `eas build` (rapport V2, APP-42)
#
#  EXPO_PUBLIC_API_URL est inscrite dans le bundle : une mauvaise valeur part
#  chez tous les tuteurs. Ce contrôle échoue si :
#    - un .env.local existe (prioritaire sur .env.production lors d'un eas update) ;
#    - .env.production et les profils preview/production d'eas.json divergent ;
#    - le bundle exporté appelle une autre API (avec --export).
#
#  Usage :  npm run verifier:bundle            # cohérence des fichiers
#           npm run verifier:bundle -- --export  # + export Android et lecture du bundle
# ==============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] && { echo "❌ .env.local présent : il serait inliné dans le bundle de production (voir BUILD.md)." >&2; exit 1; }
[ -f .env.production.local ] && { echo "❌ .env.production.local présent : il remplace .env.production." >&2; exit 1; }

ENV_URL="$(grep -E '^EXPO_PUBLIC_API_URL=' .env.production | tail -n1 | cut -d= -f2-)"
read -r PREVIEW PRODUCTION < <(node -e '
const b = require("./eas.json").build;
console.log((b.preview?.env?.EXPO_PUBLIC_API_URL ?? "-") + " " + (b.production?.env?.EXPO_PUBLIC_API_URL ?? "-"));')

echo "  .env.production         : $ENV_URL"
echo "  eas.json (preview)      : $PREVIEW"
echo "  eas.json (production)   : $PRODUCTION"
if [ "$ENV_URL" != "$PREVIEW" ] || [ "$ENV_URL" != "$PRODUCTION" ]; then
  echo "❌ URL d'API divergentes : alignez .env.production et eas.json avant toute publication." >&2
  exit 1
fi
case "$ENV_URL" in https://*/api/v1) ;; *) echo "❌ URL attendue au format https://…/api/v1" >&2; exit 1;; esac

if [ "${1:-}" = "--export" ]; then
  OUT="$(mktemp -d)"
  trap 'rm -rf "$OUT"' EXIT
  npx expo export --platform android --clear --output-dir "$OUT" >/dev/null
  B="$(node -e 'console.log(require(process.argv[1]).fileMetadata.android.bundle)' "$OUT/metadata.json")"
  TROUVEES="$(grep -aoE 'https?://[a-zA-Z0-9._:-]+/api/v1' "$OUT/$B" | sort -u)"
  echo "  bundle exporté          : $(echo "$TROUVEES" | tr '\n' ' ')"
  [ "$TROUVEES" = "$ENV_URL" ] || { echo "❌ Le bundle n'appelle pas uniquement $ENV_URL" >&2; exit 1; }
fi
echo "✅ Configuration mobile cohérente : $ENV_URL"
