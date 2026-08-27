/**
 * WHAT FREE TIME A SUBSCRIPTION IS CREATED WITH (Spec 01 · trial eligibility).
 *
 * Pure, so the one decision that stands between a user and a charge on the day
 * they were promised none can be tested without Stripe, without Postgres, and
 * without a clock. It reads nothing: every fact it needs arrives as an
 * argument, and `app/onboarding/billing-actions.ts` does the reading.
 *
 * Three answers, and the create call sets a different thing for each:
 *
 *   trial   `trial_period_days`. A first-timer, seven free days.
 *   grace   `trial_end`, at the beta grace end. Nothing due until the date
 *           they were given in writing.
 *   none    neither. Charged today, which `02a` makes work.
 *
 * ## Why the grace case is not just "a trial with a different length"
 *
 * Because the two are measured from opposite ends. A trial is N days FROM NOW,
 * so `trial_period_days` is the honest expression of it. A grace is a FIXED
 * INSTANT that was decided when the beta grace was granted and has been sitting
 * in `entitlements.active_until` ever since — a user on day 12 of 14 has two
 * days left, not fourteen. Expressing that as a day count means computing the
 * remainder, and a rounding error in that arithmetic is a charge on the wrong
 * day. `trial_end` says the instant outright and cannot drift.
 */

import { TRIAL_DAYS } from "@/lib/onboarding/pricing";

/**
 * ⚠️ STRIPE WILL REFUSE A `trial_end` THAT IS TOO SOON, so a user in the last
 * hours of their fortnight may have less remaining than Stripe accepts.
 *
 * Stripe documents a minimum of at least 2 days in the future when a
 * subscription is CREATED with a `trial_end` on some API paths, and at least 1
 * hour when one is UPDATED. This path creates, so 48 hours is the clamp.
 * Milliseconds, to match `Date.getTime()`.
 *
 * ⚠️ The direction of the clamp is the whole point: it only ever moves the end
 * LATER. A user in that window gets a few free hours more than they were
 * promised, which costs almost nothing. Moving it earlier would charge somebody
 * inside a period the app told them in writing was free, which is the one thing
 * this spec exists to prevent.
 *
 * ## MEASURED, 2026-08-15, against Stripe test mode (Q76)
 *
 * `subscriptions.create` with an explicit `trial_end` and the exact parameters
 * this path sends accepted EVERY offset tried — 10 minutes, 30 minutes, 1, 2,
 * 6, 24, 47 and 48 hours — all landing `trialing`. The documented two-day
 * minimum does not apply to this call. The only constraint Stripe actually
 * enforces is that the instant is in the FUTURE: `-1 hour` is refused outright
 * ("expects a unix timestamp representing a date and time in the future"), and
 * a `trial_end` of exactly NOW is accepted but comes back `active` rather than
 * `trialing` — no trial, an invoice due immediately. That last one is the
 * dangerous edge, and `resolveFreeTime` never reaches it: a grace end at or
 * before `now` resolves to "no free time" instead.
 *
 * ⚠️ 48 HOURS IS KEPT ANYWAY, on Adrian's instruction and for a good reason.
 * The margin is free — a beta user in their final hours gets two days instead
 * of two hours, on a fortnight that was already a goodwill gesture — and the
 * failure it guards against is a charge inside a period we promised was free.
 * A measurement in test mode is also not a contract: this is undocumented
 * behaviour, so it can tighten without notice, and the clamp is what makes that
 * a non-event. Do not lower it to match the measurement.
 */
export const STRIPE_MIN_TRIAL_END_OFFSET = 48 * 60 * 60 * 1000;

/** What the subscription create call should do about free time. */
export type FreeTime =
  /** A full trial. Sets `trial_period_days`. */
  | { kind: "trial"; days: number }
  /**
   * Aligned to a live beta grace. Sets `trial_end`.
   *
   * `trialEnd` is a Unix timestamp in WHOLE SECONDS, which is the shape Stripe
   * takes, so the caller passes it straight through and no arithmetic happens
   * at the call site.
   *
   * `graceEndsAt` is the PROMISED end — the instant from
   * `entitlements.active_until` — and is what goes into the subscription's
   * `trackd_grace_until` metadata. It is deliberately the promise rather than
   * `trialEnd`: when the clamp fires the two differ, and reconciliation
   * (`11-reconciliation-and-alerting.md`) asks "was anybody charged inside a
   * period we promised was free", which is a question about the promise.
   */
  | { kind: "grace"; trialEnd: number; graceEndsAt: string; clamped: boolean }
  /** No free time. The subscription bills today. */
  | { kind: "none" };

/** The facts the decision rests on. All of them are read by the caller. */
export interface FreeTimeFacts {
  /**
   * Has a card ever validated on a subscription of theirs that carried a
   * `trial_end`? See `hasUsedTrial` — the test is "did it become real", never
   * "did it have a trial_end", because an abandoned 3D Secure attempt leaves
   * one of the latter and took nothing.
   */
  hasUsedTrial: boolean;
  /**
   * The end of this account's beta grace as an ISO instant, or null if they
   * never had one.
   *
   * ⚠️ Passed whether it has expired or not, and the difference is decided
   * HERE rather than by the caller. An expired grace still answers "have they
   * already had their free run" with yes, so it must reach this function to
   * produce `none`; a caller that filtered to live graces only would hand an
   * expired beta account a fresh seven-day trial.
   */
  graceEndsAt: string | null;
  now: Date;
}

/**
 * DECIDE. Nothing here gates access — this only decides what a subscription is
 * created with, and `entitlements` decides what the user can do.
 *
 * ## The order is load-bearing
 *
 * A live grace is checked FIRST, ahead of `hasUsedTrial`. The two can be true
 * together, and when they are, "never charge inside a promised free period"
 * outranks "one trial per user": one costs us a few days, the other charges
 * somebody on a date we told them they were safe. (`startTrial` refuses a
 * customer with a validated card long before this is reached, so the pair is
 * close to unreachable in practice. The ordering still has to be right, because
 * "unreachable" is a claim about today's call sites.)
 */
export function resolveFreeTime(facts: FreeTimeFacts): FreeTime {
  const { hasUsedTrial, graceEndsAt, now } = facts;

  if (graceEndsAt !== null) {
    const graceEnd = Date.parse(graceEndsAt);

    /**
     * An unreadable grace end falls through to the ordinary rules rather than
     * being handled here.
     *
     * It should be impossible — `active_until` is a `timestamptz` — but the
     * direction matters if it ever happens, and §3.5 already decided it: a
     * failure to read the grace GRANTS the trial. This is that failure arriving
     * as a bad string instead of as a Postgres error, so it gets the same
     * answer rather than a fourth behaviour invented here.
     */
    if (Number.isFinite(graceEnd)) {
      /**
       * A grace that has already ended is `none`, not a negative trial.
       *
       * They had their free run; it is over. This is the returning beta user
       * who is charged today, and `02b` owns telling them so.
       */
      if (graceEnd <= now.getTime()) return { kind: "none" };

      const earliest = now.getTime() + STRIPE_MIN_TRIAL_END_OFFSET;
      const clamped = graceEnd < earliest;
      const chosen = clamped ? earliest : graceEnd;

      return {
        kind: "grace",
        /**
         * ⚠️ CEIL, never floor or round. Stripe counts in whole seconds, and
         * rounding a grace end DOWN lands the trial end up to 999ms before the
         * instant the user was promised. That is the promise broken by a
         * rounding mode, which is a silly way to break it. Erring long is the
         * same direction as the clamp above.
         */
        trialEnd: Math.ceil(chosen / 1000),
        graceEndsAt,
        clamped,
      };
    }
  }

  if (hasUsedTrial) return { kind: "none" };

  return { kind: "trial", days: TRIAL_DAYS };
}
