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
 * ## ⚠️ "LONGEST WINS" WAS WRONG, AND IT COST A PAYING CUSTOMER THEIR CANCEL BUTTON
 *
 * The original rule was: prefer the row lasting longest, with a no-expiry `comp`
 * always winning. That was correct while `comp` meant one thing — a founder,
 * free forever, whose access is genuinely not described by a subscription they
 * also happen to have.
 *
 * The beta grace made `comp` mean two things. It is written as `comp` WITH an
 * expiry, fourteen days out, and a cold review measured what "longest wins" then
 * did to somebody who subscribed during their fortnight:
 *
 *   - a 14-day grace outranks a fresh 7-day Stripe trial;
 *   - `manageActionFor` sees `source: "comp"` and returns `{kind: "none"}`;
 *   - `/billing` reads **"Access: Complimentary"** with **NO CANCEL CONTROL**,
 *     for a user whose card is on file and who will be charged;
 *   - the dashboard tells a PAYING subscriber **"Your free trial ends 15 Aug."**
 *
 * Anyone converting during days 1 to 7 of the fortnight hits it. A user who
 * cannot find the cancel button and is then charged is the exact chargeback this
 * whole area exists to avoid.
 *
 * ## So the order is by KIND first, and only then by date
 *
 *   1. **A comp with NO expiry.** Free forever. A founder or a friend, and their
 *      access really is not described by anything else.
 *   2. **A real subscription** (`stripe` / `apple` / `google`). Somebody is
 *      paying, or about to be, and everything on screen must be about THAT: the
 *      price, the renewal date, and the way out.
 *   3. **A time-limited comp.** The beta grace. A bridge, and the weakest claim
 *      of the three, because it is the one that is about to end with nothing
 *      behind it.
 *
 * Within a tier, longest still wins, so "renews on the 14th" still names the
 * date access really ends.
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
    const byTier = entitlementTier(e) - entitlementTier(best);
    if (byTier !== 0) return byTier < 0 ? e : best;
    // Same tier: the one lasting longest, with no-expiry beating any date.
    if (best.activeUntil === null) return best;
    if (e.activeUntil === null) return e;
    return Date.parse(e.activeUntil) > Date.parse(best.activeUntil) ? e : best;
  });
}

/**
 * Lower is stronger. See {@link strongestEntitlement} for why this exists.
 *
 * A `comp` is split by whether it EXPIRES, which is the only thing that
 * distinguishes "free forever" from "the beta grace" without a migration to add
 * a fourth `entitlement_source`.
 */
function entitlementTier(e: Entitlement): number {
  if (e.source === "comp") return e.activeUntil === null ? 0 : 2;
  return 1;
}
