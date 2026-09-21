"use client";

import { useState, useSyncExternalStore } from "react";

import { PRODUCTION_HOST } from "@/lib/brand";

/**
 * "trackdco.app is now trakabl.app" — shown ONLY to somebody who typed the old
 * address and was redirected here (Adrian, 2026-09-21).
 *
 * ## ⚠️ WHY IT LIVES INSIDE THE HEADER ROW
 *
 * `site-header.tsx` is `relative z-50` with NO background and NO divider — it
 * deliberately sits on the page rather than forming a band. A full-width bar
 * pinned above it would invent a band the design does not have, which is the
 * exact "don't ruin the landing page" failure. Sitting inside the header row
 * adds no new surface at all, and the header's existing height absorbs it, so
 * the hero does not move by a pixel.
 *
 * ## ⚠️ THE QUERY PARAM IS THE SIGNAL, AND IT IS NOT LOAD-BEARING
 *
 * The redirect from the old origin appends `?from=<old host>`. That is the only
 * thing distinguishing a redirected visitor from a direct one, and it is
 * deliberately the weakest possible mechanism: if it is missing, absent or
 * mangled, this renders nothing and the page is exactly as it was.
 *
 * Referer was rejected — stripped by most privacy settings and absent on a
 * typed navigation, which is precisely the visitor this is for. A cookie set by
 * the old origin was rejected too: it cannot be read cross-origin, which is the
 * whole problem.
 *
 * ⚠️ IT DOES NOT TOUCH THE CANONICAL URL. `alternates.canonical` in
 * `app/page.tsx` is absolute and fixed, so a crawler following the redirect
 * still consolidates on the clean address and never indexes the param.
 *
 * ## Dismissal is per-browser, not per-account
 *
 * Nobody is signed in on a marketing page, so there is no account to key on and
 * `localStorage` is the honest store — a cookie would be sent on every request
 * to say something only the browser cares about.
 */
const DISMISS_KEY = "trakabl.arrivalNoticeDismissed";

/** Never changes, so the store never notifies. */
const subscribeNever = () => () => {};

/**
 * Whether this visitor arrived from the old address and has not dismissed it.
 *
 * ⚠️ RETURNS A BOOLEAN, NOT AN OBJECT. `useSyncExternalStore` compares
 * snapshots by identity and re-renders forever if `getSnapshot` allocates
 * something new each call.
 *
 * ⚠️ EVERY FAILURE PATH IS FALSE OR "NOT DISMISSED", NEVER A THROW. Private
 * mode and blocked site-data both throw on `localStorage` access, and this runs
 * during the landing page's render — an uncaught throw takes the header down
 * for a visitor whose only crime was a privacy setting.
 */
function arrivedFromOldDomain(): boolean {
  try {
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return false;
  } catch {
    // Unreadable storage counts as "not dismissed", which shows the notice one
    // extra time. That is the harmless direction.
  }
  try {
    return (
      new URLSearchParams(window.location.search).get("from") === PRODUCTION_HOST
    );
  } catch {
    return false;
  }
}

export function ArrivalNotice() {
  /**
   * Server renders false — it cannot know either input — and the client
   * resolves it on hydration. The cost is that it appears a frame late, which
   * is why it animates in rather than snapping: the entrance is the honest
   * shape of the constraint, not decoration.
   */
  const eligible = useSyncExternalStore(
    subscribeNever,
    arrivedFromOldDomain,
    () => false,
  );
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed) return null;

  return (
    <span className="lp-arrival ml-auto mr-3 hidden items-center gap-2 rounded-full border border-border-default bg-bg-surface-raised py-1.5 pl-3.5 pr-1.5 text-[0.7rem] text-text-muted sm:inline-flex">
      <span className="whitespace-nowrap">
        <b className="font-normal text-foreground">{PRODUCTION_HOST}</b> is now{" "}
        <b className="font-normal text-foreground">trakabl.app</b>
      </span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // A browser that cannot remember it will show it again. Preferable
            // to breaking the click.
          }
        }}
        className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-text-primary/8 text-[0.6rem] text-text-subtle transition-colors hover:bg-text-primary/14 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        &#10005;
      </button>
    </span>
  );
}
