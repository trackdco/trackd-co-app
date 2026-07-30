"use client";

import { useEffect, useState } from "react";

/**
 * "Turn your phone upright" — the portrait lock's browser fallback (spec 07 ·
 * part one, approved by Adrian 2026-07-30).
 *
 * `app/manifest.ts` declares `orientation: "portrait"`, which the installed PWA
 * honours. iOS Safari in a browser tab ignores it, and the Screen Orientation
 * API's `lock()` is not implemented there outside fullscreen, so there is
 * nothing to call. This is the fallback: a panel, not a lock.
 *
 * THREE DELIBERATE SOFTENINGS, all Adrian's call:
 *
 * 1. **It waits.** Turning a phone flat, catching it at an angle, or handing it
 *    to someone fires an orientation change that lasts a second. Nagging for
 *    that is worse than the rotation. The panel only appears after the device
 *    has been in landscape continuously for {@link SETTLE_MS}, and any return
 *    to portrait cancels it outright.
 * 2. **It fades.** No snap, and it respects reduced motion.
 * 3. **It can be dismissed.** Someone who has locked their phone to landscape
 *    for an accessibility reason must not be walled out of a health app, and
 *    nothing here can tell that case apart from a casual rotation. "Show anyway"
 *    stands down for the rest of the session.
 *
 * HEIGHT-CAPPED so it can only ever fire on a phone: a landscape iPad or a short
 * desktop window is not what this is for.
 */
const SETTLE_MS = 1200;
const MAX_PHONE_HEIGHT = 500;

export function RotationNotice() {
  const [showing, setShowing] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;
    const mq = window.matchMedia(
      `(orientation: landscape) and (max-height: ${MAX_PHONE_HEIGHT}px)`,
    );
    let timer: number | undefined;

    const evaluate = () => {
      window.clearTimeout(timer);
      if (mq.matches) {
        // Sustained, not instantaneous.
        timer = window.setTimeout(() => setShowing(true), SETTLE_MS);
      } else {
        setShowing(false);
      }
    };

    evaluate();
    mq.addEventListener("change", evaluate);
    return () => {
      window.clearTimeout(timer);
      mq.removeEventListener("change", evaluate);
    };
  }, [dismissed]);

  if (!showing || dismissed) return null;

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-bg-base px-8 text-center duration-500 motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-label="Turn your phone upright"
    >
      <p className="text-lg font-medium text-foreground">Turn your phone upright</p>
      <p className="max-w-xs text-sm leading-relaxed text-text-muted">
        Trackd is built for portrait. Everything is where you left it.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="mt-2 min-h-11 rounded-md px-3 text-sm text-text-subtle underline underline-offset-4 transition-colors hover:text-text-muted"
      >
        Show anyway
      </button>
    </div>
  );
}
