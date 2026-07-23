// RoundFlow service worker.
//
// Scope is deliberately narrow: this app is a live scheduling/payments
// dashboard, so caching anything dynamic (pages, API routes, server
// actions) would risk showing stale jobs, prices, or payment statuses.
// The only thing cached is content-hashed static assets and the app
// icons, purely so the PWA installs and its shell paints instantly on
// repeat visits — every navigation and data request always goes to the
// network first.

const CACHE_NAME = "roundflow-static-v1";
const STATIC_CACHE_PATTERNS = [/^\/_next\/static\//, /^\/icons\//, /^\/apple-touch-icon\.png$/, /^\/favicon\.png$/];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function isCacheableStaticAsset(url) {
  return STATIC_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API routes, webhooks, auth, or server actions —
  // those must always hit the network for correct, live data.
  if (url.pathname.startsWith("/api/")) return;

  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
  );
});
