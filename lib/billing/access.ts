/**
 * THE ACCESS RULE (Spec w2b-15) — pure, so it can be tested without a database.
 *
 * This is the single predicate the app's paid access rests on. It lives in its
 * own module with no server imports for the reason the house rule gives (`lib/`
 * is pure helpers, no React, no side effects) and for a better one: a rule
 * buried inside a query is a rule nobody can check. `lib/billing/entitlements.ts`
 * does the reading; this decides.
 *
 * Nothing here knows what Stripe is, and nothing here ever will. Apple and
 * Google write the same rows through RevenueCat later and this file does not
 * change.
 */

export const PRO = "pro" as const;

export type EntitlementProduct = typeof PRO;
export type EntitlementSource = "stripe" | "apple" | "google" | "comp";

export interface Entitlement {
  product: EntitlementProduct;
  source: EntitlementSource;
  /** null means it does not expire — a `comp`. */
  activeUntil: string | null;
  isActive: boolean;
}

/**
 * Is this row granting access at `now`?
 *
 * Two conditions, and they are deliberately separate:
 *
 *   - `isActive` is the KILL SWITCH. A chargeback or a withdrawn comp sets it
 *     false without touching the date, so the record stays readable.
 *   - `activeUntil` is the CLOCK. NULL means no expiry, which is what a founder
 *     account is; inventing a date there would mean someone's access ending on a
 *     day nobody chose.
 *
 * A cancellation is NOT a third condition. Cancelling on day 3 of a paid month
 * leaves `isActive` true and `activeUntil` at the period end, so the user keeps
 * what they paid for and this function needs to know nothing about cancellation.
 * Neither does it know about `past_due`: a declined card records itself on the
 * subscription MIRROR and leaves access standing until the date passes
 * naturally, because cards decline for boring reasons.
 *
 * Computed on read, every time. Storing a boolean would mean a trial that
 * expired at 3am stayed true until something remembered to run — the
 * stored-derived-value trap `architecture.md` bans everywhere else, and billing
 * is not the place to make an exception to it.
 */
export function isEntitlementActive(
  entitlement: Pick<Entitlement, "isActive" | "activeUntil">,
  now: Date,
): boolean {
  if (!entitlement.isActive) return false;
  if (entitlement.activeUntil === null) return true;
  const until = Date.parse(entitlement.activeUntil);
  // An unparseable date withholds access. It should be impossible against a
  // `timestamptz` column, and the safe direction for a value we cannot read is
  // to withhold rather than to grant.
  return Number.isFinite(until) && until > now.getTime();
}

/**
 * Does any of these grant `pro` right now?
 *
 * ANY active row is enough. A user can legitimately hold both a `comp` and a
 * `stripe` entitlement — a founder who also subscribes, a beta tester
 * converting — and the generous read is the correct one: they are entitled by
 * either route, and revoking because one of two grants lapsed is a bug with a
 * support ticket attached.
 */
export function grantsPro(
  entitlements: readonly Entitlement[],
  now: Date,
): boolean {
  return entitlements.some(
    (e) => e.product === PRO && isEntitlementActive(e, now),
  );
}

/**
 * The entitlement a user's access actually rests on, for DISPLAY. Null when none
 * is active.
 *
 * Prefers the one lasting longest, so "renews on the 14th" names the date access
 * really ends rather than whichever row came back first. A `comp` (no expiry)
 * always wins, which is right: a founder's access is not described by the
 * subscription they also happen to have.
 */
export function strongestEntitlement(
  entitlements: readonly Entitlement[],
  now: Date,
): Entitlement | null {
  const active = entitlements.filter(
    (e) => e.product === PRO && isEntitlementActive(e, now),
  );
  if (active.length === 0) return null;

  return active.reduce((best, e) => {
    if (best.activeUntil === null) return best;
    if (e.activeUntil === null) return e;
    return Date.parse(e.activeUntil) > Date.parse(best.activeUntil) ? e : best;
  });
}
