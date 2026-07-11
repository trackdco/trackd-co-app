/*
 * Trackd service worker — Web Push + splash precache.
 *
 * This is the app's only service worker. Its primary job is Web Push (Spec 14):
 * receive pushes and handle notification taps. It ALSO precaches exactly two
 * static assets — the Kyle-the-vial splash clip + its poster — and serves ONLY
 * those from cache, so the splash plays even with no connection.
 *
 * It deliberately does NOT cache the app shell or any other asset. The fetch
 * handler responds for the two splash files and nothing else (it returns without
 * calling respondWith for every other request), so it can never intercept a
 * navigation, cache a stale shell, or interfere with Next.js — the app's
 * offline-first behaviour stays localStorage + the Supabase mirror (see
 * architecture.md → Storage Model).
 *
 * Served from /public as a static file at the root scope (/), so it controls the
 * whole origin — required for `pushManager.subscribe`. Registered by
 * components/pwa/service-worker-registrar.tsx.
 *
 * Plain JS (not TS): a service worker is served verbatim to the browser; there is
 * no build step for /public, so there is nothing to compile.
 */

// Bump the cache name to roll the splash asset. Old caches are pruned on activate
// (bumped to v2 to drop the retired splash video from the precache).
const SPLASH_CACHE = "trackd-splash-v2";
const SPLASH_ASSETS = ["/trackd-kyle-vial-splash-poster.jpg"];

// Activate a new SW version immediately rather than waiting for all tabs to
// close. Precache the splash poster so it shows offline.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(SPLASH_CACHE)
      .then((cache) => cache.addAll(SPLASH_ASSETS))
      .catch(() => {
        /* offline at install / asset missing — fetch handler will fill it later */
      }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      // Only ever prune OUR splash caches (e.g. a prior trackd-splash-v0) — never
      // touch caches owned by anything else on the origin.
      await Promise.all(
        keys
          .filter((k) => k.startsWith("trackd-splash-") && k !== SPLASH_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

// Serve the splash poster; everything else is left entirely to the browser (no
// respondWith → no interception). The poster is cache-first so it shows offline.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin || !SPLASH_ASSETS.includes(url.pathname)) {
    return; // not a splash asset — passthrough, never intercept the app
  }
  event.respondWith(serveSplash(request, url.pathname));
});

async function serveSplash(request, pathname) {
  const cache = await caches.open(SPLASH_CACHE);

  // Poster (image): cache-first is safe — images don't use Range requests.
  const hit = await cache.match(pathname);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res && res.ok) await cache.put(pathname, res.clone());
    return res;
  } catch {
    return Response.error();
  }
}

// A push arrived. The server (send-push) sends a JSON body
// { title, body, url?, tag? }. Show a notification; if the body is missing or
// unparseable, fall back to a generic Trackd notification rather than throwing
// (a thrown push handler can show the browser's default "site updated" message).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  const title = data.title || "Trackd";
  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: data.tag,
    data: { url: data.url || "/dashboard" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification tapped: focus an already-open Trackd window if one is on (or near)
// the target URL, otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        const existing = windowClients.find((client) => client.url.includes(targetUrl));
        if (existing) return existing.focus();
        return self.clients.openWindow(targetUrl);
      }),
  );
});
