/**
 * ⚠️ WHEN A FAILED IMAGE IS WORTH RE-SIGNING FOR, AND WHEN IT IS NOT.
 *
 * Pure decision logic, no React (`code-standards.md` — `lib/` holds pure
 * helpers). The React shell is `components/media/SignedImageRecovery.tsx` and it
 * is deliberately thin: everything that could loop lives here, where it is
 * pinned by tests rather than asserted in a comment.
 *
 * ## The problem
 *
 * Signed storage URLs live five minutes (`lib/storage/signedUrl.ts`). The four
 * pages that mint them are server components that re-sign on every render, so a
 * normal visit never notices. What five minutes does not survive is a tab left
 * open past the expiry and then scrolled: the image 400s and the person is
 * looking at a broken box where their own progress photo was.
 *
 * ## The fix, and its shape
 *
 * `error` on an `<img>` does not bubble, but it DOES fire in the capture phase,
 * so one listener on `document` sees every failed image in the tree without
 * touching a single leaf component and without adding `path` to any DTO. On a
 * failure that looks like an expired signed URL, `router.refresh()` re-runs the
 * server component, which re-signs everything and swaps the `src`.
 *
 * ## ⚠️ WHAT BOUNDS THE LOOP, WITHOUT A TIMER
 *
 * The danger is obvious: refresh, get a URL that still fails, refresh again,
 * forever. A genuinely deleted object does exactly that. Three bounds, all
 * state, no clocks and no polling:
 *
 *  1. **ONE ATTEMPT PER OBJECT, EVER.** The decision is keyed on the object's
 *     `bucket/path`, parsed out of the signed URL — which is ALREADY in the
 *     browser, because it is what the `src` is made of. Nothing new is sent. A
 *     re-sign mints a NEW token, so keying on the URL would not bound anything:
 *     the retry would look like a fresh failure every time. Keying on the OBJECT
 *     does bound it, because the object is what stayed the same. First failure
 *     for a path: refresh. Second failure for that same path: the object is gone,
 *     not stale, and it is never retried again.
 *  2. **ONE REFRESH IN FLIGHT.** Fifty images expire together and fifty `error`
 *     events fire; one refresh fixes all fifty. While one is pending every
 *     further request is swallowed.
 *  3. **A HARD CEILING PER MOUNT.** A backstop for anything the first two did not
 *     foresee. Once it is reached this stops asking and the user reloads by hand,
 *     which is exactly the state we were in before this existed.
 *
 * And it only ever acts on a URL matching the Supabase signed-object shape, so a
 * broken onboarding asset, an external image or a data URI never triggers
 * anything at all.
 */

/**
 * The object a signed storage URL points at, as `bucket/path`, or null if this
 * is not one.
 *
 * Supabase signs as `<origin>/storage/v1/object/sign/<bucket>/<path>?token=…`.
 * The token is deliberately EXCLUDED from the key — it is the part that changes
 * on a re-sign, and keying on it would defeat bound 1.
 */
export function signedObjectKey(src: string | null | undefined): string | null {
  if (!src) return null;
  const marker = "/storage/v1/object/sign/";
  const at = src.indexOf(marker);
  if (at === -1) return null;
  const rest = src.slice(at + marker.length);
  const object = rest.split("?")[0];
  return object.length > 0 ? decodeURIComponent(object) : null;
}

/** The mutable state the decision needs. Owned by the React shell. */
export interface ResignState {
  /** Object keys already retried once. A second failure means it is really gone. */
  attempted: Set<string>;
  /** True while a refresh is in flight. */
  pending: boolean;
  /** How many refreshes this mount has fired. */
  fired: number;
}

/** A backstop, not a product rule. Bounds 1 and 2 are what actually hold. */
export const MAX_REFRESHES_PER_MOUNT = 5;

export type ResignDecision =
  | { refresh: true; key: string }
  | { refresh: false; reason: "not-a-signed-url" | "already-attempted" | "in-flight" | "ceiling" };

/**
 * Whether a failed image should cause one re-sign.
 *
 * ⚠️ PURE, and it does not mutate `state`. The caller records the attempt, so a
 * test can drive the same decision twice and see it change its mind the second
 * time — which is the whole property being pinned.
 */
export function decideResign(src: string | null | undefined, state: ResignState): ResignDecision {
  const key = signedObjectKey(src);
  if (!key) return { refresh: false, reason: "not-a-signed-url" };
  // Ordered so the object bound is reported ahead of the transient ones: a
  // genuinely deleted object must read as "already attempted" rather than being
  // masked by whatever else happened to be in flight.
  if (state.attempted.has(key)) return { refresh: false, reason: "already-attempted" };
  if (state.pending) return { refresh: false, reason: "in-flight" };
  if (state.fired >= MAX_REFRESHES_PER_MOUNT) return { refresh: false, reason: "ceiling" };
  return { refresh: true, key };
}
