/**
 * Web Push client service (Spec 14, Phase 1) — capability detection, permission,
 * subscribe/unsubscribe, and syncing the subscription to the user's account.
 *
 * Browser-only (touches navigator / window / Notification); never import from
 * server code. The React state lives in the usePushNotifications hook — this
 * module is the imperative core both the Settings toggle and the onboarding step
 * call through, so there is ONE code path (Spec 14 D5).
 *
 * No client push library (Spec 14 dependency rule): the only new dep is
 * server-side web-push, inside the Edge Function. Here we use the platform
 * PushManager + a small VAPID-key helper.
 */

import {
  savePushSubscription,
  removePushSubscription,
  type PushSubscriptionInput,
} from "@/lib/push/pushActions";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export type PushCapability = {
  /** The browser exposes the Web Push primitives at all. */
  supported: boolean;
  /** iPhone/iPad (incl. iPadOS, which masquerades as desktop Safari). */
  isIOS: boolean;
  /** Running as an installed, standalone PWA (home-screen launch). */
  isStandalone: boolean;
  /** Whether a VAPID public key is configured in this build. */
  configured: boolean;
  /** Live OS-level permission. "default" = not yet asked. */
  permission: NotificationPermission;
};

/** Why a subscribe/unsubscribe attempt didn't complete, for friendly UI copy. */
export type PushResult =
  | { ok: true }
  | {
      ok: false;
      reason: "unsupported" | "unconfigured" | "denied" | "dismissed" | "error";
    };

/** Decode a base64url VAPID key into the Uint8Array applicationServerKey wants.
 *  Return type is inferred as Uint8Array<ArrayBuffer> (a fresh, non-shared buffer),
 *  which is what BufferSource requires — annotating the bare `Uint8Array` would
 *  widen it to ArrayBufferLike and fail the applicationServerKey assignment. */
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function detectIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ reports as desktop Safari but has a touch screen.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function getCapability(): PushCapability {
  const supported =
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  return {
    supported,
    isIOS: detectIOS(),
    isStandalone: detectStandalone(),
    configured: VAPID_PUBLIC_KEY.length > 0,
    permission: supported ? Notification.permission : "default",
  };
}

/** The registered SW, waiting until it is active so pushManager is usable. */
async function getReadyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    // The (app) shell registers /sw.js; ready resolves once it controls the page.
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

/** The current PushSubscription for this device, if any (never throws). */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  const reg = await getReadyRegistration();
  if (!reg) return null;
  try {
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Pull the endpoint/p256dh/auth out of a PushSubscription for the server. */
function decompose(sub: PushSubscription): PushSubscriptionInput {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh ?? "",
    auth: json.keys?.auth ?? "",
    userAgent:
      typeof navigator !== "undefined" ? navigator.userAgent : null,
  };
}

/**
 * Request permission (MUST be called from a user gesture), subscribe via the
 * PushManager (reusing any existing subscription), then persist it to the user's
 * account and flip the intent flag on.
 */
export async function subscribe(): Promise<PushResult> {
  const cap = getCapability();
  if (!cap.supported) return { ok: false, reason: "unsupported" };
  if (!cap.configured) return { ok: false, reason: "unconfigured" };

  try {
    // One-shot permission request — never re-prompts once denied.
    const permission = await Notification.requestPermission();
    if (permission === "denied") return { ok: false, reason: "denied" };
    if (permission !== "granted") return { ok: false, reason: "dismissed" };

    const reg = await getReadyRegistration();
    if (!reg) return { ok: false, reason: "unsupported" };

    // Reuse an existing subscription rather than re-subscribing (Spec 14 Step 4).
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { ok } = await savePushSubscription(decompose(sub));
    return ok ? { ok: true } : { ok: false, reason: "error" };
  } catch (e) {
    console.error("[push] subscribe failed", e);
    return { ok: false, reason: "error" };
  }
}

/**
 * Unsubscribe this device and flip the intent flag off. Tears down the local
 * PushSubscription, then deletes the server row by endpoint.
 */
export async function unsubscribe(): Promise<PushResult> {
  const cap = getCapability();
  if (!cap.supported) return { ok: false, reason: "unsupported" };

  try {
    const sub = await getActiveSubscription();
    const endpoint = sub?.endpoint ?? "";
    if (sub) await sub.unsubscribe();
    const { ok } = await removePushSubscription(endpoint);
    return ok ? { ok: true } : { ok: false, reason: "error" };
  } catch (e) {
    console.error("[push] unsubscribe failed", e);
    return { ok: false, reason: "error" };
  }
}
