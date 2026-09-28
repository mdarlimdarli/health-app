/*
  Service Worker: cacht nur die App Shell.
  Nutzerdaten liegen in IndexedDB und landen nie im SW-Cache.
  Bei jeder Änderung an Shell-Dateien VERSION erhöhen.
*/

const VERSION = 'v6';
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
  './js/db.js',
  './js/crypto.js',
  './js/sync.js',
  './js/ui.js',
  './js/profile.js',
  './js/planner.js',
  './js/vendor/idb.js',
  './js/modules/settings.js',
  './js/modules/profile-form.js',
  './js/modules/training.js',
  './data/exercises.json',
  './assets/fonts/inter-latin-wght-normal.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).then(() => cacheExerciseImages(cache)))
      .then(() => self.skipWaiting())
  );
});

// Übungsgrafiken für den Offline-Betrieb: Liste kommt aus data/exercises.json
async function cacheExerciseImages(cache) {
  const response = await cache.match('./data/exercises.json');
  if (!response) return;
  const { exercises } = await response.json();
  await cache.addAll(exercises.map((exercise) => `./assets/exercises/${exercise.svg}`));
}

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

  // Navigation zur App: gecachte Shell ausliefern, Routing läuft über den Hash.
  // Andere Seiten (z. B. die lokale test.html) gehen normal ins Netz.
  const scopePath = new URL(self.registration.scope).pathname;
  const isAppPage = url.pathname === scopePath || url.pathname === `${scopePath}index.html`;
  if (request.mode === 'navigate' && isAppPage) {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(request))
    );
    return;
  }

  // Inhaltsdateien (data/*.json, z. B. Übungen): Netz zuerst, damit Änderungen
  // ohne neue SW-Version ankommen. Offline oder nach 3 Sekunden gilt der Cache.
  if (url.pathname.startsWith(`${scopePath}data/`)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Shell-Dateien: Cache zuerst, sonst Netz ohne Zwischenspeichern
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request))
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), 3000));
    const response = await Promise.race([fetch(request, { cache: 'no-cache' }), timeout]);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached || Response.error();
  }
}
