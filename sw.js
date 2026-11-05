/* Bennoo — service worker : rend l'application installable et garde une copie des fichiers
   du site (pages, styles, code, images) pour qu'elle s'ouvre vite, même avec un réseau faible.
   Les données (Firebase) ne sont jamais mises en cache ici : elles viennent toujours du serveur.
   Stratégie « réseau d'abord » : on voit toujours la dernière version en ligne ; la copie ne sert
   que si le réseau ne répond pas. */
const CACHE = "bennoo-v1";
const SHELL = ["./", "./index.html", "./css/styles.css", "./js/app.js", "./images/logo.svg", "./images/google.svg", "./images/icon-192.png", "./manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return; // Firebase, Google, photos : pas de cache
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("./index.html", copy)); return res; })
      .catch(() => caches.match("./index.html")));
    return;
  }
  // Code et styles évoluent souvent : toujours la version en ligne, la copie ne sert que hors connexion.
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req)));
});
