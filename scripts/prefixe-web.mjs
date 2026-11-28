/**
 * Version web servie sous un sous-chemin (ex. /app) : préfixe les liens des
 * fichiers de public/ (manifeste, icônes, service worker) qu'Expo ne réécrit
 * pas. Le code de l'app (_expo/…) est déjà préfixé par experiments.baseUrl.
 *
 *   node scripts/prefixe-web.mjs /app dist-web
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , baseBrut, dossier] = process.argv;
if (!baseBrut || !dossier) { console.error("usage : prefixe-web.mjs <base> <dossier>"); process.exit(1); }
const base = "/" + baseBrut.replace(/^\/+|\/+$/g, "");          // "/app"
if (base === "/") process.exit(0);

function remplacer(fichier, paires) {
  const chemin = join(dossier, fichier);
  let s = readFileSync(chemin, "utf8");
  for (const [de, vers] of paires) {
    if (!s.includes(de)) throw new Error(`${fichier} : « ${de} » introuvable`);
    s = s.split(de).join(vers);
  }
  writeFileSync(chemin, s);
}

remplacer("index.html", [
  ['href="/manifest.webmanifest"', `href="${base}/manifest.webmanifest"`],
  ['href="/icons/', `href="${base}/icons/`],
  ['register("/sw.js")', `register("${base}/sw.js")`],
]);
remplacer("manifest.webmanifest", [
  ['"start_url": "/"', `"start_url": "${base}/"`],
  ['"scope": "/"', `"scope": "${base}/"`],
  ['"src": "/icons/', `"src": "${base}/icons/`],
]);
console.log(`Liens de la version web préfixés par ${base}/`);
