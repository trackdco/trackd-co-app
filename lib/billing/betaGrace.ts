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
 *   COMP FOREVER      {@link COMP_EMAILS}. Five: the two founder accounts and
 *                     three friends. Closed as of 2026-08-14.
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
 * ## Pure, but SERVER-ONLY
 *
 * The whole file is data and one predicate, so it can be tested without a
 * database. The grant itself lives in `app/api/billing/beta-grace/route.ts`,
 * which is the only thing that writes `entitlements` and is secured like the
 * cron.
 *
 * ⚠️ IT IS NOT IMPORTABLE FROM ANYWHERE, and the `server-only` import below is
 * what makes that a fact rather than a convention. {@link COMP_EMAILS} is five
 * real people's email addresses, and until now nothing but habit stopped a
 * client component pulling them into a browser bundle — where they would be
 * readable by anyone who opened the network tab. Every importer in the
 * application is already server-side, so this costs nothing and closes the
 * hole permanently: importing this from a client component now FAILS THE BUILD.
 *
 * The marker has no runtime and is not a real package outside a Next bundle, so
 * Vitest resolves it to a no-op stub (`vitest.config.ts` → `test/server-only-stub.ts`).
 * The stub is why the tests below still run; it does not weaken the guarantee,
 * which is enforced by the bundler.
 */

import "server-only";

import { isBetaGrace } from "./manage";
import { serviceClient } from "./service";

/**
 * ⚠️ FREE FOREVER. Complete as of 2026-08-14: two founder accounts and three
 * friends. Adrian closed the list, so a further addition is a new decision
 * rather than an outstanding one.
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
  // The two founder accounts.
  "admin@trackdco.app",
  "adrianschimizzi1@gmail.com",
  // Friends, given Trackd for life (Adrian, 2026-08-14).
  //
  // ⚠️ LOWERCASE, ALWAYS. `betaGrantFor` lowercases what it is given, so a
  // capitalised sign-up address still matches — but only if the entry here is
  // lower. "Ananthr.ravi@gmail.com" as written would never match anything, and
  // the failure is silent: they would simply get the ordinary fourteen days and
  // lapse a fortnight later. A test pins that every entry is lowercase.
  "jasminemalihi06@gmail.com",
  "ananthr.ravi@gmail.com",
  // Given as "Angusbrake6@gmail.com" and lowercased here, which is the whole
  // point of the warning above.
  "angusbrake6@gmail.com",
  /**
   * Added 2026-08-27 (Adrian), which REOPENED the list closed on 08-14 — so
   * this is the first entry to take the re-run path rather than the backfill.
   *
   * He already held a dated comp row (expiring 10 Sep, from `004`'s re-grace),
   * so the first run cannot help him: its predicate is "has a row at all". The
   * UPGRADE branch is what grants this — `beta-grace/route.ts:234` clears
   * `active_until` on a row that has one — and it is the branch that exists
   * precisely for "Adrian adds a friend after go-live".
   */
  "barbrake24@gmail.com",
  // Anyone added from here needs the re-run path, which upgrades an existing
  // fourteen-day row to no-expiry; the first run skips them entirely.
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
/**
 * ⚠️⚠️ DO NOT ADD PLUS-ADDRESS CANONICALISATION HERE. IT IS LOAD-BEARING THAT
 * THIS IS AN EXACT MATCH (D113a, 27 Aug 2026).
 *
 * Stripping `+tag` before the `@` is the obvious tidy-up — Gmail treats
 * `a+x@gmail.com` and `a@gmail.com` as one mailbox, so folding them looks like a
 * correctness fix. **It is not, on this data.**
 *
 * `barbrake24+test1@gmail.com` is a REAL SEPARATE ACCOUNT and it is one of the
 * 82 beta-grace rows sitting at `2026-09-10T04:00:11.374343+00` — the instant
 * `supabase/billing/004_regrace_launch_date.sql` wrote and that those people
 * will be shown in writing. `barbrake24@gmail.com` is on {@link COMP_EMAILS}.
 *
 * Today they are different strings, so the `+test1` account answers `grace` and
 * the comp path cannot reach it. Fold them and it answers `comp` — at which
 * point `beta-grace/route.ts`'s UPGRADE branch becomes able to clear
 * `active_until` on a row at the 004 instant, silently converting a dated grace
 * into free-for-life and taking one row out of the set the notice describes.
 *
 * The canonicalisation would also be wrong in general: `+` addressing is a Gmail
 * convention, not an RFC guarantee, and this list is compared against addresses
 * from every provider.
 *
 * If a comp-list member ever signs up with a tagged address, add the tagged
 * address to {@link COMP_EMAILS} as its own entry. One list, exact strings.
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
 *
 * ## ⚠️ THE IMPLEMENTATION MOVED TO `./manage`, AND IT IS RE-EXPORTED HERE
 *
 * `08-billing-screen.md` §3.6 requires the billing DISPLAY module to use this
 * predicate rather than write a second one. That module is reachable from a
 * client component and THIS one carries `server-only`, so it could not import
 * from here: the dependency can only point the other way, exactly as it does for
 * `CANCELLABLE_STATUSES`, which `cancel.ts` imports from `manage.ts` for the
 * same reason.
 *
 * So the predicate lives in the pure module and is re-exported from here. Every
 * existing importer — `graceAsTrial` below, the dashboard, the reminder runner
 * and `betaGrace.test.ts` — is unchanged, and there is still exactly ONE
 * implementation. A copy in the display module would have been the defect this
 * area keeps paying for.
 */
export { isBetaGrace };

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

/**
 * ⚠️ D71 — GRANT THE COMP ROW AT SIGNUP, FOR THE PEOPLE THE LIST NAMES.
 *
 * ## Why this exists, and why it is the OTHER half of the fix
 *
 * The refusal in `startTrial` stops a comp-list member being charged. It does
 * not stop them landing in read-only the moment the gate goes on at P13,
 * because nothing grants them a row and the only writer today is the hand-run
 * backfill — which by definition ran before they signed up. So the person Adrian
 * promised Trackd to for life gets the app taken off them on launch morning.
 *
 * **Both, not either.** If this grant ever fails or races, the refusal is still
 * what stops the charge; if the refusal were ever weakened, this is what keeps
 * their access. Neither is load-bearing alone.
 *
 * ## Cheap for everybody who is not on the list
 *
 * `betaGrantFor` is a pure in-memory membership test, so for every ordinary
 * sign-in this is a string comparison and returns without touching the network.
 * Only the five addresses on the list ever reach the write.
 *
 * ## Idempotent, and it never overwrites a decision
 *
 * `ignoreDuplicates` on the natural key, so a second run is a no-op — and, more
 * importantly, a row that already exists is LEFT ALONE. That is deliberate in
 * two directions:
 *
 *   - a comp that has been REVOKED (`is_active` false) stays revoked. Someone
 *     decided that, and a sign-in must not undo it.
 *   - a time-limited grace row keeps its date; upgrading those to forever is the
 *     backfill's job and it does it by UPDATE.
 *
 * ⚠️ Verified against the P11 backfill: a row written here is picked up by
 * `answered`, which is built from ANY entitlement row, and is not in
 * `timeLimitedComp`, which requires a dated one — so the backfill skips it
 * rather than attempting a second INSERT against the unique key.
 *
 * ⚠️ SERVICE ROLE, SERVER ONLY. `entitlements` grants `authenticated` an
 * own-row SELECT and no write at all, so a user-scoped client cannot do this and
 * must never be asked to. This module already carries `server-only`.
 *
 * Never throws. A failure here is logged and left: the caller is an auth
 * redirect, and a comp who cannot be granted a row is still refused a purchase
 * by `startTrial`, which is the half that costs money.
 */
export async function ensureCompEntitlement(
  userId: string,
  email: string | null | undefined,
): Promise<void> {
  if (betaGrantFor(email).kind !== "comp") return;

  try {
    const { error } = await serviceClient().from("entitlements").upsert(
      {
        user_id: userId,
        product: "pro",
        source: "comp",
        // Free for life. `is_active_now` reads a null date as "does not expire".
        active_until: null,
        is_active: true,
      },
      { onConflict: "user_id,product,source", ignoreDuplicates: true },
    );
    if (error) {
      console.error(`[billing] could not grant the comp entitlement for ${userId}:`, error.message);
      return;
    }
    console.info(`[billing] comp entitlement ensured for ${userId}`);
  } catch (err) {
    console.error(
      `[billing] could not grant the comp entitlement for ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}
