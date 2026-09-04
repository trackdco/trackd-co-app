"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import {
  decideResign,
  MAX_REFRESHES_PER_MOUNT,
  type ResignState,
} from "@/lib/media/resignOnExpiry";

/**
 * ⚠️ RECOVERS AN IMAGE WHOSE SIGNED URL EXPIRED WHILE THE TAB SAT OPEN.
 *
 * Signed storage URLs live five minutes (`lib/storage/signedUrl.ts`). The four
 * pages that mint them re-sign on every render, so a normal visit never notices;
 * a tab left open past the expiry and then scrolled does. This is what stops the
 * person seeing a broken box where their own progress photo was.
 *
 * ## One listener, no leaf components touched, no new DTO field
 *
 * `error` on an `<img>` does not bubble — but it DOES fire in the CAPTURE phase,
 * so a single listener on `document` sees every failed image in the tree.
 * `router.refresh()` re-runs the server component, which re-signs every URL on
 * the page. Nothing was added to `BloodworkPhoto`, `ProgressPhoto`,
 * `JournalAttachment` or `CalendarPhoto`, no storage path is sent to the browser
 * that was not already inside the `src`, and all four pages stay server
 * components.
 *
 * ## ⚠️ NO TIMER, NO POLLING, NOTHING FOR IMAGES NOBODY IS LOOKING AT
 *
 * The only trigger is a real `error` event, which the browser fires only for an
 * image it actually tried to load. Nothing is scheduled and no clock is read —
 * `resignOnExpiry.test.ts` pins that as source, so a future session adding a
 * backoff trips a test.
 *
 * ## What bounds the loop
 *
 * All three bounds live in {@link decideResign} and are tested there. In short:
 * one attempt per OBJECT ever (keyed on `bucket/path`, not the token, because
 * the token is the part a re-sign changes), one refresh in flight at a time, and
 * a hard ceiling per mount. A deleted object therefore costs exactly ONE
 * refresh and is then ignored for the life of the mount.
 *
 * ## Mounted in the (app) layout
 *
 * Same place and the same shape as `SyncStatusNotice`, `RotationNotice` and
 * `ServiceWorkerRegistrar` — a client sibling with no markup of its own.
 */
export function SignedImageRecovery() {
  const router = useRouter();
  // A ref, not state: nothing here renders, and re-rendering on every failed
  // image is the last thing a page full of failed images needs.
  const state = useRef<ResignState>({ attempted: new Set(), pending: false, fired: 0 });

  useEffect(() => {
    const onError = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;

      const decision = decideResign(target.currentSrc || target.src, state.current);
      if (!decision.refresh) return;

      // Recorded BEFORE the refresh is asked for, so the object can never be
      // retried twice by two errors arriving in the same tick.
      state.current.attempted.add(decision.key);
      state.current.pending = true;
      state.current.fired += 1;

      router.refresh();

      // Cleared on the next microtask rather than on a timer: `router.refresh()`
      // is fire-and-forget, and holding `pending` open forever would mean a
      // second, genuinely-later expiry never recovered. One tick is enough to
      // coalesce the burst of errors that arrive together, which is all bound 2
      // is for — bound 1 is what stops a real loop.
      queueMicrotask(() => {
        state.current.pending = false;
      });
    };

    // ⚠️ `capture: true` IS THE WHOLE MECHANISM. Image `error` events do not
    // bubble, so a listener without it sees nothing at all.
    document.addEventListener("error", onError, true);
    return () => document.removeEventListener("error", onError, true);
  }, [router]);

  return null;
}

export { MAX_REFRESHES_PER_MOUNT };
