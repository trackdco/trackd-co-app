"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { DANGER_ROW } from "@/lib/ui-presets";
import { signOut } from "@/app/(app)/actions";
import { releaseDeviceSubscription } from "@/lib/push/pushActions";

/**
 * Hand this device's push subscription back before the session goes.
 *
 * A `PushSubscription` belongs to the service-worker registration, not to the
 * session, so signing out used to leave the row behind and the cron kept posting
 * this user's doses to this phone — which the NEXT person to sign in on it then
 * received. The endpoint is only knowable in the browser, so the release has to
 * happen here, in the form action, before `signOut` clears the cookies that
 * authorise the delete.
 *
 * Every step is best-effort and swallowed: no failure of the push plumbing may
 * ever stop somebody signing out. Without a service worker (every non-PWA
 * browser) there is nothing to release and this costs one `undefined` check.
 */
async function signOutThisDevice() {
  try {
    // Each step is TIME-BOXED separately, and both boxes are on the one control a
    // user must always be able to reach. `getRegistration` waits on the service
    // worker, which can sit pending forever if the worker is installing or
    // wedged; the delete is a network round-trip. Boxing them together would let
    // a slow lookup eat the delete's whole budget, which is the half that
    // actually closes the leak.
    const endpoint = await withTimeout(readEndpoint(), 2000);
    if (endpoint) await withTimeout(releaseDeviceSubscription(endpoint), 3000);
  } catch {
    // Swallowed on purpose: no failure of the push plumbing may stop a sign-out.
    // The cost of the timeout path is the row surviving — the bug this closes —
    // and being unable to sign out at all is worse.
  }
  await signOut();
}

/**
 * This device's push endpoint, or null. Deliberately does NOT unsubscribe the
 * browser: the row is what makes a send reach this phone, and dropping it is
 * exactly enough to stop the next account receiving the last one's doses.
 * Revoking the browser subscription as well left the SAME user, signing back in
 * a minute later, with an intent flag saying "notify me" and nothing to notify —
 * silently, because only a tap in Settings ever calls `subscribe()` again.
 * `usePushNotifications` re-registers what the browser still holds on mount.
 */
async function readEndpoint(): Promise<string | null> {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  return sub?.endpoint ?? null;
}

/** Resolve to null if `p` hasn't settled in `ms`. Never rejects. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch(() => {
      clearTimeout(t);
      resolve(null);
    });
  });
}

/**
 * Sign out with a confirm step (Context/Feature Specs/08 → B6). Used on every
 * entry point — the shell header link and the Profile bottom button — so a tap
 * can never sign you out by accident. The Confirm button submits
 * `signOutThisDevice`, which releases this device's push subscription and then
 * calls the `signOut` server action.
 *
 * The form action is a CLIENT function rather than the server action directly,
 * because the push endpoint is only knowable in the browser. Nothing is lost by
 * it: the confirm dialog is `useState` + a portal, so a no-JS session could never
 * reach this button in the first place.
 *
 * `variant`:
 *  - `link`   — the quiet header text link.
 *  - `button` — a standalone deep-red button (destructive token).
 *  - `row`    — a row inside Profile's danger zone (spec 09 · part two). The
 *               section's outline carries the boundary, so the row is unfilled
 *               and only its label is red.
 */
export function SignOutConfirm({
  variant,
}: {
  variant: "link" | "button" | "row";
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "row"
            ? DANGER_ROW
            : cn(
                "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
                variant === "link"
                  /* ⚠️ 44px, Apple's floor. It measured 69x36: `py-2` around a
                     20px line box is 36px however it is read. `min-h-11` states
                     the height instead of deriving it, and `inline-flex` keeps
                     the label centred in the taller box. */
                  ? "-mr-2 inline-flex min-h-11 items-center rounded-md px-2 text-sm text-text-muted hover:text-foreground"
                  : "flex w-full items-center justify-center rounded-2xl border border-accent-destructive/50 bg-accent-destructive/10 py-3.5 text-sm font-medium text-accent-destructive hover:bg-accent-destructive/15",
              )
        }
      >
        Sign out
      </button>

      {/* Rendered through a portal to <body> so it escapes any transformed
          ancestor (e.g. the Profile page's `animate-home-up` wrapper). Inside a
          transform, `position: fixed` is contained by that ancestor and its
          z-index is trapped in the ancestor's stacking context — which dropped
          the modal behind the fixed bottom nav and pinned it to the page bottom.
          Portaling + z-[60] (above the z-40 nav) keeps the buttons tappable. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] grid place-items-center bg-overlay-backdrop p-6 animate-in fade-in-0 duration-150 motion-reduce:animate-none"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="signout-title"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xs rounded-3xl border border-border-default bg-bg-surface p-5 shadow-lg animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none"
            >
              <h2
                id="signout-title"
                className="text-base font-medium text-foreground"
              >
                Sign out?
              </h2>
              <p className="mt-1.5 text-sm text-text-muted">
                You&apos;ll need to sign in again to get back to your protocol.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded-xl border border-border-strong py-2.5 text-sm font-medium text-text-muted transition-colors hover:text-text-primary"
                >
                  Cancel
                </button>
                <form action={signOutThisDevice} className="flex-1">
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-accent-destructive py-2.5 text-sm font-medium text-text-primary transition-opacity hover:opacity-90"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
