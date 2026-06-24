"use client";

import { useEffect } from "react";

import { getCapability } from "@/lib/push/pushService";
import { markPwaInstalled } from "@/lib/pwa/installActions";

const RECORDED_KEY = "trackd:pwa-install-recorded";

/**
 * Renders nothing. When the app is running as an installed standalone PWA (it's on
 * the Home Screen), it records that on the user's profile ONCE so the install popup
 * is suppressed for good — on this and any other device. Mounted in the (app)
 * shell, so it runs on a real Home-Screen launch regardless of which screen opens.
 *
 * There is no iOS API to detect "installed" while browsing in Safari — `standalone`
 * is the one reliable signal, and it's only true when launched from the Home
 * Screen. So this is how we learn they've added it.
 */
export function PwaInstallTracker() {
  useEffect(() => {
    let recorded = false;
    try {
      recorded = window.localStorage.getItem(RECORDED_KEY) === "1";
    } catch {
      /* storage blocked — fall through and just (re)record, it's idempotent */
    }
    if (recorded) return;
    if (!getCapability().isStandalone) return;
    void markPwaInstalled().then((r) => {
      if (!r.ok) return;
      try {
        window.localStorage.setItem(RECORDED_KEY, "1");
      } catch {
        /* storage blocked — server is recorded, that's what matters */
      }
    });
  }, []);

  return null;
}
