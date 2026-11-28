/*
 * Service worker NdawWune (PWA, lot L12).
 *
 * - Pages : réseau d'abord, la dernière version en cache si hors ligne.
 * - Fichiers de l'application (/_expo/, /assets/, /icons/) : cache d'abord
 *   (leurs noms changent à chaque version).
 * - L'API (autre domaine) n'est jamais mise en cache ici : l'app garde ses
 *   données hors ligne dans sa base locale, comme l'APK.
 */
const CACHE = "ndawwune-v1";
const COQUILLE = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put("/", copie)); return r; })
        .catch(() => caches.match("/"))
    );
    return;
  }

  if (/^\/(_expo|assets|icons)\//.test(url.pathname) || url.pathname.endsWith(".wasm")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
        return r;
      }))
    );
  }
});
