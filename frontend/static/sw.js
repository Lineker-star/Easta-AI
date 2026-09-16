/* EASTA service worker: caches the static app shell (CSS/JS/icons)
 * for fast repeat loads and basic offline resilience of the shell
 * itself. Deliberately does NOT cache /api/*, /v1/*, or any
 * cross-origin backend request -- chat data must always come from the
 * network, never a stale cache. Registered at the root scope (see
 * GET /sw.js in frontend/app.py) so it can control the whole site,
 * not just /static/. */

const CACHE_NAME = "easta-shell-v2";

const SHELL_ASSETS = [
    "/static/styles.css",
    "/static/chat.js",
    "/static/i18n.js",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(SHELL_ASSETS))
            .catch(() => {
                // A single missing/failed asset shouldn't block
                // installation -- the fetch handler below falls back
                // to the network for anything not cached.
            })
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== "GET" || url.origin !== self.location.origin) {
        return;
    }

    if (!url.pathname.startsWith("/static/")) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cached) => {
            if (cached) {
                return cached;
            }

            return fetch(event.request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
});
