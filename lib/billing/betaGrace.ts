/**
 * WHAT HAPPENS TO THE PEOPLE WHO WERE ALREADY HERE.
 *
 * There are ~90 accounts on production and every one of them has used the whole
 * app for free, some for about two months. The moment billing switches on, each
 * of them needs an answer to "what happens to me", and until now the app had
 * nothing to say.
 *
 * Adrian's answer, 2026-08-13:
 *
 *   COMP FOREVER      {@link COMP_EMAILS}. Two addresses today, and he owes a
 *                     list of friends to add.
 *   EVERYONE ELSE     {@link BETA_GRACE_DAYS} free, then the read-only gate.
 *   A ONE-TIME NOTICE explaining it, on next open.
 *
 * Fourteen days is DOUBLE the seven-day trial, deliberately. They agreed to
 * nothing, they have had the product for months, and a notice period shorter
 * than a new stranger's trial would read as worse treatment for having been
 * early. It is also the cheapest possible insurance against the thing that
 * actually closes payment processor accounts: people who feel ambushed dispute
 * charges, and a dispute rate is not recoverable by apologising afterwards.
 *
 * ## Pure, and it holds no secrets
 *
 * The whole file is data and one predicate, so it can be tested without a
 * database and imported from anywhere. The grant itself lives in
 * `app/api/billing/beta-grace/route.ts`, which is the only thing that writes
 * `entitlements` and is secured like the cron.
 */

/**
 * ⚠️ FREE FOREVER. ADRIAN OWES A LIST OF FRIENDS FOR THIS — REMIND HIM.
 *
 * Add one string per line. Lowercase, and the comparison lowercases the input
 * too, so a capitalised sign-up address still matches.
 *
 * ## It is deliberately NOT `FOUNDER_EMAILS`
 *
 * `lib/admin.ts` holds an identical-looking pair of addresses and this must not
 * reuse it, because that list does two other jobs: it gates `/admin` (the
 * waitlist dashboard, which shows everybody's sign-ups) and it is duplicated
 * into a waitlist RLS SELECT policy in `supabase/waitlist/002_founder_read.sql`.
 *
 * "Free forever" and "may read everyone else's data" are completely different
 * grants. Adding a friend to a comp list must not hand them the admin
 * dashboard, and it certainly must not require editing an RLS policy in SQL to
 * do it. Two lists, two meanings, no accidental privilege.
 */
export const COMP_EMAILS: readonly string[] = [
  "admin@trackdco.app",
  "adrianschimizzi1@gmail.com",
  // ADD FRIENDS HERE, one per line, lowercase.
];

/**
 * How long everybody else keeps full access after billing switches on.
 *
 * Double `TRIAL_DAYS`. Not imported from `pricing.ts` and multiplied, because
 * the relationship is a coincidence of judgement rather than a rule: if the
 * trial ever becomes five days this must not silently become ten.
 */
export const BETA_GRACE_DAYS = 14;

export type BetaGrant =
  /** Free forever: an entitlement with no expiry. */
  | { kind: "comp" }
  /** Free until a date, then read-only. */
  | { kind: "grace"; days: number };

/**
 * What this account gets. Pure.
 *
 * Every existing account gets ONE of these; there is no "nothing" branch,
 * because an account that gets nothing is an account locked out on the day
 * billing switches on with no notice at all, which is the outcome this whole
 * file exists to prevent.
 */
export function betaGrantFor(email: string | null | undefined): BetaGrant {
  const normalised = (email ?? "").trim().toLowerCase();
  return COMP_EMAILS.includes(normalised)
    ? { kind: "comp" }
    : { kind: "grace", days: BETA_GRACE_DAYS };
}

/** When a grant runs out, or null for one that never does. */
export function grantExpiry(grant: BetaGrant, from: Date): string | null {
  if (grant.kind === "comp") return null;
  return new Date(from.getTime() + grant.days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * IS THIS ENTITLEMENT THE BETA GRACE, rather than a comp or a subscription?
 *
 * The grace is written as `source: "comp"` with an `active_until`, and nothing
 * else in the system produces that shape:
 *
 *   comp + no expiry   a founder or a friend. Free forever.
 *   comp + an expiry   THIS. The beta grace, and only ever this.
 *   stripe / apple / google  a real subscription, which has its own mirror row
 *                            and its own dates.
 *
 * So no migration and no new `entitlement_source` enum value is needed to tell
 * them apart, which matters because an enum value is a migration and this is
 * meant to be one SQL statement Adrian can run on the day.
 *
 * It is what lets the grace period drive the TRIAL BANNER and the day-5 push
 * without either of them learning a new concept: both take a
 * `{status, trialEndsAt, cancelAtPeriodEnd}` shape, and a grace period is
 * exactly that shape with the end date taken from the entitlement instead of
 * from Stripe. See `graceAsTrial`.
 */
export function isBetaGrace(
  entitlement: { source: string; activeUntil: string | null } | null,
): boolean {
  return Boolean(entitlement && entitlement.source === "comp" && entitlement.activeUntil);
}

/**
 * The grace period, described as the trial it functionally is.
 *
 * Returns null for anything that is not a grace, so a real subscription is never
 * re-described by this. That guard is load-bearing rather than defensive: a
 * PAID subscriber's entitlement also carries an `active_until`, and without the
 * `comp` test their dashboard would have announced "Your free trial ends
 * 13 Aug 2027".
 */
export function graceAsTrial(
  entitlement: { source: string; activeUntil: string | null } | null,
): { status: string; trialEndsAt: string | null; cancelAtPeriodEnd: boolean } | null {
  if (!isBetaGrace(entitlement)) return null;
  return {
    status: "trialing",
    trialEndsAt: entitlement!.activeUntil,
    // There is nothing to cancel. Nobody agreed to be charged, so nobody can
    // have opted out of a charge, and the notice is owed either way.
    cancelAtPeriodEnd: false,
  };
}
