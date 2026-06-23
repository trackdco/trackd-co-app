"use client";

import { useCallback, useEffect, useState } from "react";

import {
  getActiveSubscription,
  getCapability,
  subscribe,
  unsubscribe,
  type PushCapability,
  type PushResult,
} from "@/lib/push/pushService";

/**
 * The single source of truth for push UI state, shared by the Settings toggle and
 * the onboarding step (Spec 14 D5). Reconciles, on mount, the live
 * Notification.permission + whether this device has a live PushSubscription + the
 * stored intent flag (passed in from the server as `initialEnabled`), per D6.
 *
 *   loading           — pre-mount / probing (avoids an SSR/client mismatch)
 *   unsupported       — browser lacks the Web Push primitives
 *   unconfigured      — no VAPID public key in this build (quiet "unavailable")
 *   ios-needs-install — iOS Safari, not yet added to the Home Screen
 *   denied            — OS permission denied (cannot re-prompt; show guidance)
 *   on                — subscribed + intent on
 *   off               — supported and ready, but not subscribed
 */
export type PushStatus =
  | "loading"
  | "unsupported"
  | "unconfigured"
  | "ios-needs-install"
  | "denied"
  | "on"
  | "off";

/** Resolve a promise to a fallback if it doesn't settle in `ms` (a SW that never
 *  reaches `ready` must not pin the UI in "loading" forever). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(fallback);
      }
    }, ms);
    p.then((v) => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(v);
      }
    }).catch(() => {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(fallback);
      }
    });
  });
}

function statusFrom(cap: PushCapability, hasSub: boolean, intent: boolean): PushStatus {
  if (!cap.supported) return "unsupported";
  if (!cap.configured) return "unconfigured";
  if (cap.isIOS && !cap.isStandalone) return "ios-needs-install";
  if (cap.permission === "denied") return "denied";
  return hasSub && intent ? "on" : "off";
}

export function usePushNotifications(initialEnabled: boolean) {
  const [status, setStatus] = useState<PushStatus>("loading");
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [busy, setBusy] = useState(false);

  // Reconcile on mount (browser-only values, so this can't run during SSR).
  useEffect(() => {
    let cancelled = false;
    const cap = getCapability();

    // Only probe for a subscription when the browser can actually have one.
    const needsProbe =
      cap.supported &&
      cap.configured &&
      !(cap.isIOS && !cap.isStandalone) &&
      cap.permission !== "denied";

    const probe = needsProbe
      ? withTimeout(getActiveSubscription(), 4000, null)
      : Promise.resolve(null);

    probe.then((sub) => {
      if (cancelled) return;
      setCapability(cap);
      setStatus(statusFrom(cap, Boolean(sub), initialEnabled));
    });

    return () => {
      cancelled = true;
    };
  }, [initialEnabled]);

  const enable = useCallback(async (): Promise<PushResult> => {
    setBusy(true);
    try {
      const result = await subscribe();
      const cap = getCapability();
      setCapability(cap);
      if (result.ok) {
        setStatus("on");
      } else if (result.reason === "denied") {
        setStatus("denied");
      } else if (result.reason === "unsupported") {
        setStatus("unsupported");
      } else if (result.reason === "unconfigured") {
        setStatus("unconfigured");
      } else {
        // dismissed / error — remain actionable.
        setStatus(statusFrom(cap, false, false));
      }
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async (): Promise<PushResult> => {
    setBusy(true);
    try {
      const result = await unsubscribe();
      const cap = getCapability();
      setCapability(cap);
      if (result.ok) setStatus(statusFrom(cap, false, false));
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, capability, busy, enable, disable };
}
