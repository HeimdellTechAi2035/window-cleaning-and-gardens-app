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

self.addEventListener("install", () => {
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

// Sign-up alerts for the platform super-admin, sent via the Push API.
// This has nothing to do with the fetch-caching above — it just lets the
// installed /admin PWA show a notification even when it isn't open.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "RoundFlow", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "RoundFlow";
  const options = {
    body: data.body || "",
    icon: "/icons/admin-icon-192.png",
    badge: "/icons/admin-icon-192.png",
    data: { url: data.url || "/admin" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/admin";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

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
