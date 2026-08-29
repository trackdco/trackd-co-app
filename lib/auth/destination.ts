import "server-only";

import { headers } from "next/headers";

import { DEFAULT_NEXT, REQUESTED_PATH_HEADER, safeNextPath } from "./nextPath";

/**
 * ⚠️ WHERE THE VISITOR WAS GOING, FOR THE GUARDS THAT SEND THEM AWAY.
 *
 * Every server-side guard that bounces somebody to `/login` used to drop the
 * destination on the floor, so opening `/billing`, a shared link to `/progress`
 * or a bookmarked `/plans` all ended the same way: sign in, land on the
 * dashboard, with nothing left to say where you had been pointed. Adrian hit it
 * on `/billing`; it was never a billing bug, and there were five doorways.
 *
 *   app/(app)/layout.tsx              the whole logged-in app (two guards)
 *   app/welcome/page.tsx              the 18+/ToS gate, bounced back out
 *   components/billing/BillingFlowEntry.tsx   `/plans` and `/checkout`
 *
 * That last one matters more than its size: `/billing`'s subscribe row points at
 * `/plans`, so a lapsed session on the one screen built to sell a plan would
 * have landed the user on the dashboard instead of the plan they clicked.
 *
 * ## Why it is a header and not an argument
 *
 * A Next 16 layout CANNOT read the current path. `layout.md` §Pathname says so
 * outright — layouts do not re-render on navigation, so they get no pathname —
 * and points at `usePathname` in a Client Component, which is no use to a guard
 * whose whole job is to decide on the server, before anything renders, that you
 * may not be here. So the proxy stamps it (`lib/supabase/middleware.ts`) using
 * the mechanism `proxy.md` §Setting Headers names for exactly this.
 *
 * ## ⚠️ IT IS A CONVENIENCE AND DECIDES NOTHING
 *
 * Access is decided by `getUser()` in the guard that calls this, and is
 * untouched. All this picks is where somebody lands AFTER they have proved who
 * they are. When the header is absent — a request that missed the proxy matcher
 * — every function here returns the bare path it always returned, so the failure
 * mode is the old behaviour rather than an open door.
 *
 * Re-validated through `safeNextPath` even though the proxy composed it from
 * `request.nextUrl` and so cannot name another origin: a header is input, and
 * these build redirects out of it.
 */

/** The stamped path, validated, or null if there is nothing worth carrying. */
export async function requestedDestination(): Promise<string | null> {
  const raw = (await headers()).get(REQUESTED_PATH_HEADER);
  if (!raw) return null;
  // `""` as the fallback so a rejected value is distinguishable from a real one.
  const safe = safeNextPath(raw, "");
  // Both doors land on `DEFAULT_NEXT` anyway, so carrying it explicitly is noise
  // on the URL and a `?next=` on a redirect nobody asked to redirect.
  return safe && safe !== DEFAULT_NEXT ? safe : null;
}

/** `/login`, carrying the destination when there is one. */
export async function loginWithDestination(): Promise<string> {
  const dest = await requestedDestination();
  return dest ? `/login?next=${encodeURIComponent(dest)}` : "/login";
}

/**
 * `/welcome`, carrying the destination when there is one — the same carry, one
 * door further in, for a signed-in user who has not passed the 18+/ToS gate.
 * `completeGate` spends it on the way out, so a first-run user who opened a deep
 * link still ends up there rather than on the dashboard.
 */
export async function gateWithDestination(): Promise<string> {
  const dest = await requestedDestination();
  return dest ? `/welcome?next=${encodeURIComponent(dest)}` : "/welcome";
}
