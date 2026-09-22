/* EASTA service worker: caches the static app shell (CSS/JS/icons)
 * for fast repeat loads and basic offline resilience of the shell
 * itself. Deliberately does NOT cache /api/*, /v1/*, or any
 * cross-origin backend request -- chat data must always come from the
 * network, never a stale cache. Registered at the root scope (see
 * GET /sw.js in frontend/app.py) so it can control the whole site,
 * not just /static/. */

// Bumped whenever a cached asset's *content* changes too, not just the
// SHELL_ASSETS list -- e.g. v5 is icon-192.png/icon-512.png swapping
// from the old placeholder "E" to the real logo at the same URLs, so
// an already-installed PWA actually picks up the new bytes instead of
// keeping the stale cached version forever under the old cache name.
//
// v6: this got missed for a long stretch of phases (18 through 28) --
// the fetch handler below cache-first's *anything* under /static/,
// not just SHELL_ASSETS, which means every static file this app has
// (frontend/static/i18n/*.json in particular) gets cached on first
// fetch and then never re-checked against the network as long as the
// cache name stays the same. Real production symptom this caused:
// returning visitors kept getting a pre-Phase-18 en.json cached under
// v5, so any interface string added since then (Phase 18's
// conversation_search_placeholder, Phase 23's knowledge_base_link,
// ...) fell through i18n.js's t()'s "key not found" fallback and
// rendered as the raw key name instead of real text. Bumping the name
// here is what actually fixes it for already-visited users -- the
// activate handler below deletes every cache not matching this exact
// name, so the next load re-fetches everything fresh. Get in the
// habit of bumping this on every deploy that changes ANY file under
// frontend/static/, the same discipline as re-running schema.sql
// after a deploy that changes database/schema.sql.
const CACHE_NAME = "easta-shell-v6";
const OFFLINE_URL = "/offline";

const SHELL_ASSETS = [
    "/static/styles.css",
    "/static/chat.js",
    "/static/i18n.js",
    "/static/icons/icon-192.png",
    "/static/icons/icon-512.png",
    // The real logo (see offline.html's .brand-mark) -- without this,
    // the offline fallback page loaded while genuinely offline would
    // show a broken image instead of the logo.
    "/static/icons/icon-square.png",
    OFFLINE_URL
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

    // Page navigations (loading /chat, /login, /, ... -- not a
    // sub-resource fetch): network first, falling back to the cached
    // offline page when the network is unreachable. Without this
    // branch the service worker never intercepted navigations at all,
    // so a flaky-connection launch fell straight through to the
    // browser's own offline error page instead of the app -- this is
    // also specifically what Lighthouse's PWA audit checks ("current
    // page responds with a 200 when offline").
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(OFFLINE_URL))
        );
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
