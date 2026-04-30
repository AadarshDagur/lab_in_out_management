const CACHE_NAME = 'lab-manager-v3';
const STATIC_ASSETS = [
  '/css/style.css',
  '/js/main.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Always force Network-First for HTML/Navigation to prevent logging into other people's cached sessions!
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('<html><head><title>Offline</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: sans-serif; text-align: center; padding: 20px; color: #333;"><h2>You are offline.</h2><p>Please reconnect to the internet to use LabManager.</p></body></html>', {
            headers: {'Content-Type': 'text/html'}
        });
      })
    );
    return;
  }

  // Check cache first for assets and images
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Cache Hit - Return it
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const url = new URL(event.request.url);
        // Only dynamically cache static assets (not API or HTML)
        if (
          url.pathname.includes('/css/') ||
          url.pathname.includes('/js/') ||
          url.pathname.includes('/icons/') ||
          url.origin === 'https://cdn.jsdelivr.net' || 
          url.origin === 'https://fonts.googleapis.com' ||
          url.origin === 'https://fonts.gstatic.com'
        ) {
           const responseToCache = networkResponse.clone();
           caches.open(CACHE_NAME).then((cache) => {
             cache.put(event.request, responseToCache);
           });
        }
        return networkResponse;
      }).catch(err => {
         console.warn("Fetch failed: ", err);
      });
    })
  );
});
