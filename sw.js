/*
  Service Worker: cacht nur die App Shell.
  Nutzerdaten liegen in IndexedDB und landen nie im SW-Cache.
  Bei jeder Änderung an Shell-Dateien VERSION erhöhen.
*/

const VERSION = 'v1';
const CACHE = `shell-${VERSION}`;

// Pfade relativ zum Scope, damit die App auch unter /health-app/ läuft
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './js/app.js',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Alte Shell-Caches entfernen
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Nur eigene GET-Requests bedienen, Sync (api.github.com) und alles Fremde geht direkt ins Netz
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation: immer die gecachte Shell ausliefern, Routing läuft über den Hash
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  // Shell-Dateien: Cache zuerst, sonst Netz ohne Zwischenspeichern
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});
