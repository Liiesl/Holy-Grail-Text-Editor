const CACHE_NAME = 'holy-grail-editor-v2.1'; // Increment version to force update/re-cache
const STATIC_ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/offline.html', // Fallback page
  '/style.css',
  '/liveEditor.css',
  '/auth.css',
  '/SCMD/slashCommand.css',
  '/sidebar.css',
  '/textStyleModal.css',
  '/SCMD/embedPageModal.css',
  '/SCMD/emojiModal.css',
  '/userSettingsModal.css',
  '/pagePeekModal.css',
  '/homePage.css',
  '/main.js',
  '/sidePanel.js',
  '/editArea.js',
  '/SCMD/slashCommand.js',
  '/homePage.js',
  '/textStyleModal.js',
  '/tableEditor.js',
  '/SCMD/emojiModal.js',
  '/SCMD/embedPageModal.js',
  '/auth_client.js',
  '/userSettingsModal.js',
  '/moreOptionsModal.js',
  '/pagePeekModal.js',
  '/manifest.json', // Cache the manifest
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
  // Note: External CDN resources (cdnjs.cloudflare.com) are not cached by default here.
  // If full offline for these is needed, consider downloading or adding them to cache.
];

// API GET requests that should try network first, then cache if offline.
const API_NETWORK_FIRST_PATTERNS = [
    '/api/auth/status',
    '/api/projects',
    '/api/project/.*/tree',
    '/api/project/.*/page/.*', // Covers GET page content and GET page info
];

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        const promises = STATIC_ASSETS_TO_CACHE.map(url => {
            return cache.add(url).catch(err => {
                console.warn(`Service Worker: Failed to cache ${url}`, err);
                // This allows Promise.all to continue even if one asset fails to cache
            });
        });
        return Promise.all(promises);
      })
      .then(() => {
        console.log('Service Worker: Static assets cached (or attempted).');
        return self.skipWaiting(); // Activate new SW immediately
      })
      .catch(err => {
          console.error('Service Worker: Caching failed significantly during install', err);
      })
  );
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
        console.log('Service Worker: Activated and old caches cleaned.');
        return self.clients.claim(); // Take control of open clients
    })
  );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const request = event.request;

    // 1. Handle non-GET requests: Always network.
    // These are mutations (POST, PUT, DELETE) and shouldn't be cached by this basic SW.
    if (request.method !== 'GET') {
        event.respondWith(fetch(request));
        return;
    }

    // 2. Handle specific API GET requests (Network-first, then cache)
    if (API_NETWORK_FIRST_PATTERNS.some(pattern => new RegExp(pattern).test(url.pathname))) {
        event.respondWith(
            fetch(request)
                .then(networkResponse => {
                    if (networkResponse.ok) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => { // Network failed, try cache
                    return caches.match(request).then(cachedResponse => {
                        if (cachedResponse) return cachedResponse;
                        // Not in cache, return a structured error for API calls
                        return new Response(JSON.stringify({ error: 'Offline and data not available in cache' }), {
                           headers: { 'Content-Type': 'application/json' },
                           status: 503,
                           statusText: 'Service Unavailable - Offline'
                        });
                    });
                })
        );
        return;
    }

    // 3. Handle static assets and app shell (Cache-first, then network)
    // Includes explicitly listed assets and common file types.
    const isStaticAsset = STATIC_ASSETS_TO_CACHE.includes(url.pathname) ||
                          url.pathname.startsWith('/icons/') || // Covers all icons
                          url.pathname.startsWith('/SCMD/') || // Covers SCMD subdirectory files
                          ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.woff', '.woff2', '.ttf', '.eot', '.json']
                          .some(ext => url.pathname.endsWith(ext));

    if (isStaticAsset) {
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse; // Serve from cache if found

                    // Not in cache, fetch from network
                    return fetch(request).then((networkResponse) => {
                        if (networkResponse.ok) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseToCache); // Cache the new resource
                            });
                        }
                        return networkResponse;
                    }).catch(error => { // Network fetch failed
                        console.error(`SW: Fetch failed for static asset ${url.pathname}:`, error);
                        // For document navigations (HTML pages), serve offline.html as fallback
                        if (request.destination === 'document' || url.pathname === '/') {
                           return caches.match('/offline.html').then(offlinePage => {
                               return offlinePage || new Response("Application is offline.", { status: 503, statusText: "Offline" });
                           });
                        }
                        // For other assets, return a generic error response
                        return new Response('', {status: 404, statusText: "Not Found in Cache or Network"});
                    });
                })
        );
        return;
    }

    // 4. Default for any other GET requests: Try network, then cache as a fallback.
    // This is a general handler for things not explicitly matched above.
    event.respondWith(
        fetch(request)
            .then(networkResponse => {
                // If successful, attempt to cache it for potential future offline use
                if (networkResponse.ok) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => { // Network failed, try cache
                return caches.match(request).then(cachedResponse => {
                    if (cachedResponse) return cachedResponse;
                    // If it's a navigation request and still nothing, serve offline.html
                    if (request.destination === 'document') {
                         return caches.match('/offline.html').then(offlinePage => {
                             return offlinePage || new Response("Application is offline.", { status: 503, statusText: "Offline" });
                         });
                    }
                    // Generic failure for other uncached resources
                    return new Response("Network error and resource not found in cache.", {status: 503, statusText: "Offline or Network Error"});
                });
            })
    );
});