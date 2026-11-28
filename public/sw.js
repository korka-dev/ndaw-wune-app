/*
 * Service worker NdawWune (PWA, lot L12).
 *
 * - Pages : réseau d'abord, la dernière version en cache si hors ligne.
 * - Fichiers de l'application (_expo/, assets/, icons/) : cache d'abord
 *   (leurs noms changent à chaque version).
 * - Fonctionne à la racine ou sous un sous-chemin (/app/) : la base est la
 *   portée du service worker.
 * - L'API (autre domaine) n'est jamais mise en cache ici : l'app garde ses
 *   données hors ligne dans sa base locale, comme l'APK.
 */
const CACHE = "ndawwune-v2";
const BASE = new URL(self.registration.scope).pathname; // "/" ou "/app/"
const COQUILLE = [BASE, BASE + "manifest.webmanifest", BASE + "icons/icon-192.png", BASE + "icons/icon-512.png"];
const FICHIERS_APP = new RegExp("^" + BASE.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "(_expo|assets|icons)/");

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
        .then((r) => { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(BASE, copie)); return r; })
        .catch(() => caches.match(BASE))
    );
    return;
  }

  if (FICHIERS_APP.test(url.pathname) || url.pathname.endsWith(".wasm")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copie = r.clone(); caches.open(CACHE).then((c) => c.put(req, copie)); }
        return r;
      }))
    );
  }
});
