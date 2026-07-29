"use client";

import { useEffect } from "react";

/**
 * PWA runtime setup, mounted once by the (app) shell: registers the Web Push
 * service worker and asks the browser to hold the app in portrait.
 *
 * Renders nothing. Safe to mount unconditionally — every capability below is
 * feature-detected, and a browser lacking one simply skips it.
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

  // Portrait lock (Spec 07). `app/manifest.ts` already declares
  // `orientation: "portrait"`, which is what actually locks an INSTALLED app.
  // This is the second half: the Screen Orientation API, the only real lock a
  // browser offers. It is deliberately a silent best-effort —
  //  * it throws unless the page is installed/standalone or fullscreen, and
  //  * iOS Safari does not implement it at all,
  // so on an uninstalled iPhone the app WILL still rotate. Adrian's call
  // (2026-07-29): lock it where a lock genuinely exists and accept the rest —
  // no "rotate your phone" overlay, which would also trap anyone whose device is
  // locked to landscape for accessibility reasons.
  useEffect(() => {
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    if (!orientation?.lock) return;
    // Rejects on every browser that can't honour it. That's the expected path,
    // not an error worth surfacing.
    void orientation.lock("portrait").catch(() => {});
  }, []);

  return null;
}
