"use client";

import { useEffect } from "react";

/**
 * Registers the Web Push service worker (public/sw.js) once, after mount.
 *
 * Mounted in the (app) shell so it runs for signed-in users — the only ones who
 * can subscribe to push. The SW is fetch-free (push + notificationclick only),
 * so registering it cannot affect navigation or caching; it just makes
 * `pushManager.subscribe` possible (see lib/push/pushService.ts).
 *
 * Renders nothing. Safe to mount unconditionally: browsers without service-worker
 * support simply skip registration.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    // Root scope (/) so the SW controls the whole origin, which Web Push needs.
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
      console.error("[sw] registration failed:", err);
    });
  }, []);

  return null;
}
