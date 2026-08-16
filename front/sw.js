// Marky service worker.
//
// Strategy, and why:
//   same-origin  → network-first, cache as fallback. Cache-first would serve a
//                  stale app.js every time you edit one during development; the
//                  network round trip to your own localhost costs nothing.
//   cross-origin → cache-first. The CDN URLs are version-pinned and immutable,
//                  and they are the heavy ones worth never re-fetching.
//   /api/*       → never touched. Those are live file reads and writes.

const VERSION = "v1.11";
const SHELL_CACHE = `marky-shell-${VERSION}`;
const RUNTIME_CACHE = `marky-runtime-${VERSION}`;

// The app shell: everything needed to boot the editor with no network.
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/app.css",
  "/welcome.md",
  "/toolbar.js",
  "/lazy-load.js",
  "/app.js",
  "/renderers.js",
  "/pdf-export.js",
  "/format-bar.js",
  "/static-export.js",
  "/html-export.js",
  "/file-api.js",
  "/theme-manager.js",
  "/docx-export.js",
  "/manifest.json",
  "/favicon.svg",
  "/favicon-32x32.png",
  "/favicon-192x192.png",
  "/favicon-512x512.png",
  "/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // Individual puts rather than addAll: one 404 should not void the install.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) await cache.put(url, res);
          } catch {
            /* offline during install; runtime caching will fill this in */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, RUNTIME_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => (keep.has(name) ? null : caches.delete(name))),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // The file API is live state — never cache it, never answer it from cache.
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  if (sameOrigin) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // An offline navigation to any path should still boot the editor.
    if (request.mode === "navigate") {
      const shell = await cache.match("/index.html");
      if (shell) return shell;
    }
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Opaque responses (no-cors CDN scripts) report status 0 but are usable.
  if (response.ok || response.type === "opaque") {
    cache.put(request, response.clone());
  }
  return response;
}
