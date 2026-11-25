/* LicenseManagerPro service worker.
 *
 * App-shell caching for the PWA: the precached shell makes the app load
 * offline, and navigation requests fall back to the cached index.html.
 * API calls are never cached (they are cross-origin in production and
 * must always reach the backend).
 */

const CACHE_NAME = "lmp-v1";
const APP_SHELL = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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
    const {request} = event;
    if (request.method !== "GET") return;
    // Only handle same-origin requests; API calls and third-party
    // resources always go to the network untouched.
    if (new URL(request.url).origin !== self.location.origin) return;

    if (request.mode === "navigate") {
        // App navigation: try the network first so the shell stays fresh,
        // fall back to the cached shell when offline.
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    return response;
                })
                .catch(() => caches.match("./index.html"))
        );
        return;
    }

    // Static assets (JS/CSS/images): cache first, refresh in the background.
    event.respondWith(
        caches.match(request).then((cached) => {
            const network = fetch(request)
                .then((response) => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return response;
                })
                .catch(() => cached);
            return cached || network;
        })
    );
});
