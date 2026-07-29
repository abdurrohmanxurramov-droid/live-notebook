// Service worker for Живой Блокнот — Web Push notifications + offline app shell (read-only).
const VERSION = "v3";
const SHELL_CACHE = `ln-shell-${VERSION}`;
const ASSET_CACHE = `ln-assets-${VERSION}`;
const OFFLINE_URL = "/";

const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_URLS.map((url) => cache.add(new Request(url, { cache: "reload" }))),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.allSettled(
        names
          .filter(
            (n) =>
              (n.startsWith("ln-shell-") || n.startsWith("ln-assets-")) &&
              n !== SHELL_CACHE &&
              n !== ASSET_CACHE,
          )
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/mcp") ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/.well-known") ||
    url.pathname.startsWith("/.lovable") ||
    url.pathname.includes("/auth") ||
    /supabase\.co$/.test(url.hostname)
  );
}

function isHashedAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_build/") || url.pathname.startsWith("/assets/")) &&
    /\.(js|css|woff2?|png|svg|jpg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (isNeverCached(url)) return;

  // Navigations: network-first with cached app shell fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put(OFFLINE_URL, fresh.clone()).catch(() => {});
          cache.put(new Request(url.pathname), fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response("Офлайн", {
              status: 503,
              headers: { "content-type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
    return;
  }

  // Hashed build assets: cache-first (immutable per deploy).
  if (isHashedAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const hit = await cache.match(request);
        if (hit) return hit;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone()).catch(() => {});
        return fresh;
      })(),
    );
    return;
  }

  // Same-origin shell files (manifest, icons): stale-while-revalidate.
  if (url.origin === self.location.origin && SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(request);
        const network = fetch(request)
          .then((res) => {
            if (res.ok) cache.put(request, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "Живой Блокнот", body: "Уведомление", url: "/" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag || "lesson",
      data: { url: payload.url || "/" },
      vibrate: [120, 60, 120],
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
