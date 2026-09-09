/* -------------------------------------------------------------
 * VIRTUAL MOUSE & KEYBOARD - SERVICE WORKER
 * Provides offline caching, fast load times, and PWA capabilities.
 * ------------------------------------------------------------- */

const CACHE_NAME = "mouse-vm-v1.0.16";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css?v=2.9",
  "./app.js?v=2.9",
  "./manifest.json?v=2.9",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

// Install Event: Cache essential shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn("PWA: Some assets failed to pre-cache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up outdated caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Network first with Cache fallback for dynamic requests
self.addEventListener("fetch", (event) => {
  // Ignore non-GET and WebSocket requests
  if (event.request.method !== "GET" || event.request.url.startsWith("ws:") || event.request.url.startsWith("wss:")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to revalidate cache (Stale-While-Revalidate)
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse.clone());
            });
          }
        }).catch(() => { });
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== "basic") {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Return index.html for navigation requests when offline
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
      });
    })
  );
});
