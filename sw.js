const CACHE_NAME = 'aurafy-cache-v23';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

// Clean up all caches on activation
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)));
    }).then(() => self.clients.claim())
  );
});

// Network-first for everything so live edits are immediate
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // APIs and external audio
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.hostname.includes('saavn') || url.hostname.includes('groq')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Network-first, fallback to cache offline
  e.respondWith(
    fetch(e.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
      }
      return networkResponse;
    }).catch(() => caches.match(e.request))
  );
});
