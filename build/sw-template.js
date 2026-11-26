/* Service worker of Bank Statement Analyzer. Generated at build time from build/sw-template.js. */
const VERSION = __SW_VERSION__;
const COMMIT = __SW_COMMIT__;
const CHANGES = __SW_CHANGES__;
const ASSETS = __SW_ASSETS__;
const CACHE = `bsa-${VERSION}-${COMMIT}`;

const scope = new URL(self.registration.scope);
const labPrefix = new URL('lab/', scope).pathname;

self.addEventListener('install', (event) => {
  // No skipWaiting here: a new version waits until the user taps "Aktualisieren".
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(ASSETS.map((a) => new Request(new URL(a, scope), { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('bsa-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin !== scope.origin) return;
  if (!url.pathname.startsWith(scope.pathname)) return;
  if (url.pathname.startsWith(labPrefix)) return; // lab pages are never handled by the app
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      if (event.request.mode === 'navigate') {
        const page = await cache.match(new URL('./', scope));
        if (page) return page;
      }
      const hit = await cache.match(event.request, { ignoreSearch: true });
      return hit ?? fetch(event.request);
    })(),
  );
});

self.addEventListener('message', (event) => {
  const msg = event.data;
  if (msg === 'info') {
    event.ports[0]?.postMessage({ version: VERSION, commit: COMMIT, changes: CHANGES });
  } else if (msg === 'activate') {
    self.skipWaiting();
  }
});
