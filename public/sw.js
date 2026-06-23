/*
 * Trackd service worker — Web Push only (Spec 14, Phase 1).
 *
 * This is the app's FIRST and only service worker. It exists purely to receive
 * Web Push and handle notification taps. It deliberately registers NO `fetch`
 * handler: the app's offline-first behaviour is localStorage + a Supabase mirror
 * (see architecture.md → Storage Model), NOT service-worker caching, so this SW
 * must never intercept navigations or assets. Keeping it fetch-free means it
 * cannot break the app, cache a stale shell, or interfere with Next.js.
 *
 * Served from /public as a static file at the root scope (/), so it controls the
 * whole origin — required for `pushManager.subscribe`. Registered by
 * components/pwa/service-worker-registrar.tsx.
 *
 * Plain JS (not TS): a service worker is served verbatim to the browser; there is
 * no build step for /public, so there is nothing to compile.
 */

// Activate a new SW version immediately rather than waiting for all tabs to
// close — safe here because there is no cache/version to migrate.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
