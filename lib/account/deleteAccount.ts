import "server-only";

import { cancelNowForUser } from "@/lib/billing/cancel";
import { adminClient } from "@/lib/auth/adminClient";
import { sweepUserStorage, describeSweep } from "@/lib/storage/sweep";

/**
 * ⚠️ ACCOUNT DELETION, IN THE ONE ORDER THAT IS SAFE. `16-account-deletion.md`
 * §3.2 — "the order, which is the whole spec".
 *
 *     1. Cancel at Stripe.   2. Delete the storage objects.
 *     3. Delete the database rows.   4. Delete the auth user.
 *
 * ## Why Stripe is first
 *
 * `billing_customers`, `subscriptions` and `entitlements` all cascade from
 * `profiles`. Delete the row first and three things happen at once: the only
 * mapping from a Stripe customer back to a person is erased, the subscription
 * stays live and keeps billing, and every future webhook for that customer is
 * permanently unattributable. The result is somebody who deleted their account
 * and keeps being charged, with nothing left connecting the charge to them.
 * **That is a chargeback with extra steps, and dispute rate is the number that
 * closes payment processor accounts.**
 *
 * ## Why storage is before rows
 *
 * The same reason wearing a different hat: **the paths to the objects live in
 * the rows.** Delete the rows first and the files are orphaned with no index
 * back to them — measured to be real, not theoretical. On 2026-09-03 production
 * held six objects with no row pointing at them, one of them a live account's
 * 845 KB journal photo, because every upload writes the object before the row.
 *
 * ## ⚠️ IT FAILS CLOSED, AND THAT IS THE PROPERTY UNDER TEST
 *
 * If any step fails, **the steps after it do not run.** A failed cancellation
 * stops the deletion. A failed sweep stops the row delete. The user is told it
 * did not complete and retries, because a half-deleted account is worse than an
 * undeleted one — and every step is idempotent, so the retry is safe.
 *
 * Each partial state is deliberately the recoverable one: cancelled-but-not-
 * deleted is a person with no subscription and their data intact. The reverse is
 * not recoverable at all.
 *
 * ## ⚠️ THE STEPS ARE INJECTABLE, SO EACH CAN BE BROKEN
 *
 * §5 requires the ordering be proven "by breaking each step". A test that can
 * only drive the happy path proves the order exists, not that it holds. So the
 * four steps are an interface with a real implementation, and
 * `deleteAccount.test.ts` substitutes a failing one at each position and asserts
 * that `stepsRun` stops there.
 *
 * ⚠️ **This module is `server-only` and takes a user id.** That is safe only
 * because it is unreachable from a browser: the `"use server"` action in
 * `app/(app)/profile/delete-account-action.ts` resolves the account from the
 * verified session and is the ONLY thing that calls it. Never export this, or
 * anything wrapping it, from a `"use server"` module.
 */

/** The four steps, in order. Also the vocabulary the result speaks. */
export type DeletionStep = "cancel-stripe" | "sweep-storage" | "delete-rows" | "delete-auth-user";

export const DELETION_ORDER: readonly DeletionStep[] = [
  "cancel-stripe",
  "sweep-storage",
  "delete-rows",
  "delete-auth-user",
] as const;

export type DeletionOutcome =
  | { ok: true; stepsRun: DeletionStep[] }
  | { ok: false; failedAt: DeletionStep; error: string; stepsRun: DeletionStep[] };

/**
 * What each step does. Substituted wholesale in tests.
 *
 * Every one either resolves or throws — a step that reports failure by returning
 * a falsy value would be indistinguishable from a step that did nothing, which
 * is the shape this project has been caught by repeatedly.
 */
export interface DeletionSteps {
  cancelStripe(userId: string): Promise<void>;
  sweepStorage(userId: string): Promise<void>;
  deleteRows(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The real steps. Each throws with a message a person can act on. */
export const liveSteps: DeletionSteps = {
  /**
   * ⚠️ FIRST, AND IT THROWS. `cancelNowForUser` sweeps every BILLABLE status,
   * asks Stripe rather than the mirror, and refuses to answer from a truncated
   * list. If it cannot end them all it throws, and this flow stops.
   */
  async cancelStripe(userId) {
    await cancelNowForUser(userId);
  },

  /**
   * ⚠️ SECOND. Prefix enumeration primary, row map secondary, verified by
   * re-listing rather than by the delete's return value.
   */
  async sweepStorage(userId) {
    const result = await sweepUserStorage(adminClient(), userId);
    if (!result.ok) {
      // The full per-bucket detail goes to the log; the thrown message is what
      // a person reads. A partial sweep must never be reported as done.
      console.error("[delete] sweep did not complete:\n" + describeSweep(result));
      throw new Error(
        "Your files could not all be removed, so nothing has been deleted. Please try again.",
      );
    }
  },

  /**
   * ⚠️ THIRD. ONE delete, and the cascade does the rest.
   *
   * Every user-scoped table declares `ON DELETE CASCADE` from `profiles(id)` or
   * `auth.users(id)` — verified against production `pg_constraint`, 38
   * constraints, no exceptions. So deleting this single row removes the lot, and
   * enumerating tables here would be a second list to keep in sync with the
   * schema and to get wrong.
   */
  async deleteRows(userId) {
    const { error } = await adminClient().from("profiles").delete().eq("id", userId);
    if (error) throw new Error(`profiles delete failed: ${error.message}`);
  },

  /**
   * ⚠️ FOURTH AND LAST. Removing the auth user cascades `profiles` again
   * (harmlessly, it is already gone) and revokes every refresh token the account
   * holds, which is what makes the sign-out that follows final rather than
   * cosmetic.
   */
  async deleteAuthUser(userId) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    // ⚠️ The Supabase client RETURNS this error rather than throwing it.
    // Destructuring and ignoring it is how a teardown silently does nothing.
    if (error) throw new Error(`auth user delete failed: ${error.message}`);
  },
};

/**
 * Run the four steps in order, stopping at the first failure.
 *
 * ⚠️ Takes a user id because it is `server-only` and its single caller has
 * already proved whose account it is. See the module comment.
 */
export async function deleteAccountFor(
  userId: string,
  steps: DeletionSteps = liveSteps,
): Promise<DeletionOutcome> {
  if (!UUID.test(userId)) {
    // Belt and braces behind the session read. An empty or wildcard id must
    // never reach a delete, and `assertUserId` inside the sweep is too late for
    // the Stripe step that runs before it.
    throw new Error("deleteAccountFor: refusing an id that is not a bare UUID.");
  }

  const stepsRun: DeletionStep[] = [];
  const run: Record<DeletionStep, (id: string) => Promise<void>> = {
    "cancel-stripe": steps.cancelStripe.bind(steps),
    "sweep-storage": steps.sweepStorage.bind(steps),
    "delete-rows": steps.deleteRows.bind(steps),
    "delete-auth-user": steps.deleteAuthUser.bind(steps),
  };

  for (const step of DELETION_ORDER) {
    try {
      await run[step](userId);
      stepsRun.push(step);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[delete] ${userId} stopped at ${step}: ${error}`);
      // ⚠️ RETURNED, NOT RETHROWN, and `stepsRun` excludes the failed step. The
      // caller needs to know how far it got to tell the user whether anything
      // was destroyed.
      return { ok: false, failedAt: step, error, stepsRun };
    }
  }

  console.warn(`[delete] ${userId} deleted: ${stepsRun.join(" -> ")}`);
  return { ok: true, stepsRun };
}
