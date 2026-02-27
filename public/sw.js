// ============================================
// Raute Service Worker
// ============================================
// Handles: app shell caching, map tile caching, background sync

const CACHE_NAME = 'raute-v1';
const TILE_CACHE_NAME = 'raute-tiles-v1';

// App shell files to precache
const APP_SHELL = [
  '/logo.png',
  '/logo.jpg',
  '/offline/',
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch(() => {
        // Some files may not exist, that's ok
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME && name !== TILE_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: different strategies for different resources
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Map tiles: cache-first (tiles rarely change)
  if (
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('basemaps.cartocdn.com')
  ) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            // Return empty response for offline tiles
            return new Response('', { status: 408 });
          });
        });
      })
    );
    return;
  }

  // Static assets (_next/static): cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          });
        });
      })
    );
    return;
  }

  // HTML pages: network-first, fall back to offline page
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match('/offline/') || new Response('Offline', {
          status: 503,
          headers: { 'Content-Type': 'text/html' },
        });
      })
    );
    return;
  }
});

// Background Sync: process offline queue when connectivity returns
self.addEventListener('sync', (event) => {
  if (event.tag === 'offline-queue-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        // Notify any open client to process their offline queue
        clients.forEach((client) => {
          client.postMessage({ type: 'PROCESS_OFFLINE_QUEUE' });
        });
      })
    );
  }
});
