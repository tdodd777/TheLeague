// Minimal service worker.
// Strategy: cache-first for the app shell; network-first for HTML, fall back
// to cache when offline; pass-through for anything else.

const VERSION = "league-2026-v4";
const SHELL = [
  "/",
  "/standings",
  "/managers",
  "/rankings/dynasty",
  "/h2h",
  "/records",
  "/history",
  "/awards",
  "/transactions",
  "/drafts",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      cache.addAll(SHELL).catch(() => {
        // ignore precache failures — page still works without offline shell
      }),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Never intercept top-level navigations. Calling event.respondWith for a
  // navigation request disqualifies the page from the browser's back/forward
  // cache — Lighthouse flags this as "Page prevented bfcache restoration".
  // The shell precache still warms the offline fallback used during install,
  // but live navigations should go straight through to the network.
  if (req.mode === "navigate") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache live API responses.
  if (url.pathname.startsWith("/api/")) return;

  // Never cache Next.js build output. Chunk filenames are content-hashed so
  // stale entries here cause "originalFactory is undefined" at RSC hydration
  // when the manifest references a module the cached chunk doesn't have.
  if (url.pathname.startsWith("/_next/")) return;

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (res.type === "basic" || res.type === "default")) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
