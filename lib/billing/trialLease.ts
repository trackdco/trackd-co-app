import "server-only";

import { serviceClient } from "./service";

/**
 * THE PER-USER LEASE `startTrial` HOLDS WHILE IT CHECKS STRIPE AND CREATES.
 *
 * ## What it is for
 *
 * `startTrial` is a read of Stripe followed by a write to Stripe, and the only
 * thing serialising it was a Stripe idempotency key of `trial:${user}:${plan}`.
 * Two plans are two keys. A cold review fired two concurrent calls for different
 * plans from one signed-in session and got **two live trials on one customer**,
 * both billable, which is the root of the worst defect on this branch: cancel
 * then stopped one of them, said so, and a test clock took $69.99.
 *
 * ## Why this is not `pg_advisory_lock`
 *
 * It is the textbook answer and it cannot work here. `pg_advisory_lock` is
 * SESSION-scoped, and every statement goes through PostgREST, which serves from
 * a connection pool: the acquire lands on one backend and the release on
 * another, `pg_advisory_unlock` only works from the owning session, so the lock
 * leaks permanently and the account can never start a trial again.
 * `pg_try_advisory_xact_lock` is transaction-scoped and PostgREST gives each
 * request its own transaction, so it would release before the Stripe call it
 * exists to guard.
 *
 * The thing being protected is an HTTP round-trip to a third party. No Postgres
 * lock spans that. A lease does: claimed in one atomic conditional UPDATE, held
 * across the network call, and — the part that matters — **it cannot leak**,
 * because it expires. A request that dies mid-flight costs the next one
 * {@link LEASE_MS}, not the account forever.
 *
 * Same shape as the trial reminder's claim-before-send, where a conditional
 * UPDATE's row count decides who owns the work.
 *
 * ## It is safe while `supabase/billing/002` is unapplied
 *
 * The claim returns `"unenforced"` rather than throwing, and `startTrial`
 * proceeds without it. An unapplied migration must not take a payment path down.
 * The race is closed in that window by `startTrial`'s reconcile step instead.
 */

/**
 * How long a claim is good for.
 *
 * Long enough to cover the worst realistic run of `startTrial`: a customer
 * create, a subscription list, up to a handful of cancels and a subscription
 * create, each a Stripe API call. Stripe's own timeout is 80 seconds per
 * request, so anything under about a minute could expire under a single slow
 * call and let a second request in behind it.
 *
 * Short enough that a process killed mid-flight (a deploy, an OOM) costs the
 * user one retry rather than a support email. There is nothing to clean up: the
 * next claim simply finds it expired.
 */
export const LEASE_MS = 90_000;

/**
 * `-infinity` in Postgres, written from here as an epoch timestamp.
 *
 * Both mean "no lease". The SQL default is `-infinity` because it is
 * unambiguous in a schema; the release writes epoch because it is a plain ISO
 * string that needs no cast and cannot be mistyped.
 */
const UNHELD = new Date(0).toISOString();

/**
 * ⚠️ "`002` HAS NOT BEEN APPLIED", IN THE TWO CODES IT ACTUALLY ARRIVES AS.
 *
 * `42703` is Postgres's `undefined_column`, which is what a FILTER on a missing
 * column produces. It is also the one this file was originally written to catch,
 * and it was the wrong one on its own.
 *
 * **`PGRST204` is what really comes back**, measured against the live database:
 *
 *     Could not find the 'trial_lock_until' column of 'billing_customers'
 *     in the schema cache
 *
 * PostgREST validates the request BODY against its cached schema and rejects it
 * before Postgres ever sees the statement, so the Postgres error code never
 * happens. Catching only `42703` meant an unapplied migration fell through to
 * the generic branch, returned `"busy"`, retried five times over two seconds and
 * then **refused to start any trial at all** — the exact fail-closed outcome the
 * tolerance exists to prevent, on a payment path, with tsc and eslint green.
 *
 * Found by executing. Both are caught now, because which one you get depends on
 * whether the column is missing from the payload or from the filter.
 *
 * NOTE FOR WHOEVER APPLIES `002`: PostgREST's schema cache has to reload before
 * the column is usable. Supabase does that automatically on DDL, within a few
 * seconds. If `PGRST204` persists after applying, the reload is what is missing,
 * not the column — check `information_schema.columns` before touching anything.
 */
const MIGRATION_NOT_APPLIED = new Set(["42703", "PGRST204"]);

export type LeaseOutcome =
  /** This request owns the lease and MUST release it. */
  | "held"
  /** Somebody else owns it. Do not touch Stripe. */
  | "busy"
  /** `002` is not applied. Proceed unprotected; the caller reconciles instead. */
  | "unenforced";

/**
 * Claim the lease for a user, or report who has it.
 *
 * **There must already be a `billing_customers` row.** `findOrCreateCustomer`
 * runs first and that ordering is the guarantee: this claims an existing row and
 * never creates one, so a missing row reads as `busy` rather than silently
 * running unprotected.
 */
export async function acquireTrialLease(userId: string): Promise<LeaseOutcome> {
  const nowIso = new Date().toISOString();
  const until = new Date(Date.now() + LEASE_MS).toISOString();

  /**
   * ONE STATEMENT. The condition and the write are the same UPDATE, so two
   * concurrent claims cannot both pass — Postgres takes a row lock for the
   * duration and the loser re-evaluates `trial_lock_until < now` against the
   * value the winner just wrote.
   *
   * A read-then-write here would reproduce exactly the bug this file exists to
   * close, one layer down.
   */
  const { data, error } = await serviceClient()
    .from("billing_customers")
    .update({ trial_lock_until: until })
    .eq("user_id", userId)
    .lt("trial_lock_until", nowIso)
    .select("user_id");

  if (error) {
    if (MIGRATION_NOT_APPLIED.has(error.code)) {
      console.warn(
        "[billing] supabase/billing/002 is not applied: startTrial is running without its lease. Concurrent starts are caught by the reconcile instead.",
      );
      return "unenforced";
    }
    /**
     * Any other failure is treated as BUSY, which is the safe direction: a
     * database we cannot claim against is a database we cannot trust to have
     * serialised anything, and the cost of being wrong is one retry rather than
     * a second live subscription.
     */
    console.error("[billing] trial lease claim failed:", error.message);
    return "busy";
  }

  return data && data.length === 1 ? "held" : "busy";
}

/**
 * Hand the lease back. Best effort, and deliberately so.
 *
 * A release that fails is not an error worth surfacing to somebody who has just
 * started a trial: the lease expires on its own, so the worst case is that their
 * next attempt waits {@link LEASE_MS}. Throwing here would turn a successful
 * subscription into an error message.
 *
 * Not conditional on still owning it. If the lease has already expired and
 * somebody else has claimed it, this clears THEIRS — which is why
 * {@link LEASE_MS} is set well above the longest run rather than trimmed to the
 * common case.
 */
export async function releaseTrialLease(userId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("billing_customers")
    .update({ trial_lock_until: UNHELD })
    .eq("user_id", userId);

  if (error && !MIGRATION_NOT_APPLIED.has(error.code)) {
    console.error("[billing] trial lease release failed:", error.message);
  }
}
