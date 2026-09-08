import "server-only";

import { cancelNowForUser } from "@/lib/billing/cancel";
import { adminClient } from "@/lib/auth/adminClient";
import { sweepUserStorage, describeSweep } from "@/lib/storage/sweep";

/**
 * ⚠️ ACCOUNT DELETION, IN THE ONE ORDER THAT IS SAFE. `16-account-deletion.md`
 * §3.2 — "the order, which is the whole spec".
 *
 *     1. Cancel at Stripe.   2. Delete the storage objects.
 *     3. Delete the auth user, which CASCADES the rows.   4. Verify, by reading.
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
/**
 * ⚠️ THE STEPS THAT CAN STOP THE DELETION. The verification is deliberately NOT
 * one of them - see {@link DeletionOutcome} and {@link DeletionSteps.verifyErased}.
 */
export type DeletionStep = "cancel-stripe" | "sweep-storage" | "delete-auth-user";

export const DELETION_ORDER: readonly DeletionStep[] = [
  "cancel-stripe",
  "sweep-storage",
  "delete-auth-user",
] as const;

/**
 * ⚠️ REPORTED, NEVER GATING. The confirmation read runs after the account is
 * already gone, so it cannot withhold anything - see `deleteAccountFor`.
 */
export type Verification = { ok: true } | { ok: false; error: string };

export type DeletionOutcome =
  | { ok: true; stepsRun: DeletionStep[]; verification: Verification }
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
  deleteAuthUser(userId: string): Promise<void>;
  /**
   * ⚠️ IT STILL THROWS, AND THROWING STILL DOES NOT STOP ANYTHING. It runs after
   * the account is gone, so `deleteAccountFor` catches it and reports it.
   */
  verifyErased(userId: string): Promise<void>;
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
      /**
       * ⚠️ IT DOES NOT SAY "NOTHING HAS BEEN DELETED", BECAUSE THAT IS FALSE.
       *
       * The sweep is step TWO. By the time it can fail, step one has already
       * cancelled the subscription at Stripe, immediately and without a refund.
       * The old text asserted the opposite, which is the same class of untruth
       * the failure copy was rewritten to remove - and this string is a
       * developer-facing exception message, so it was missed by that pass.
       *
       * What the USER reads is `DELETE_ACCOUNT_FAILURE_COPY.cancelledOnly`,
       * chosen by `failureCopyFor` from the step that failed. This text goes to
       * the server log.
       */
      throw new Error(
        "Your files could not all be removed, so the deletion stopped before any data was deleted. Please try again.",
      );
    }
  },

  /**
   * ⚠️ THIRD. ONE DELETE, AND THE CASCADE TAKES THE ROWS WITH IT.
   *
   * ## Why this is now third, where the row delete used to be
   *
   * It used to delete the `profiles` row here and the auth user last. A cold
   * review found that ordering had a TERMINAL failure state: when the row delete
   * succeeded and the auth delete then threw, `profiles` was gone, so
   * `lib/auth.ts` computed `passedGate` false, `app/(app)/layout.tsx` redirected
   * to `/welcome`, and `ProfileScreen` — the only place the deletion dialog is
   * rendered — sits inside `(app)` and was therefore unreachable. **The retry the
   * copy promises did not exist.** Re-accepting the terms could not rescue it
   * either, because the `consent_records` insert has a foreign key to `profiles`
   * and failed 23503 forever.
   *
   * ## The intermediate state does not exist any more, rather than being rarer
   *
   * Deleting the auth user removes everything on its own, in ONE statement, so
   * there is no window between "rows gone" and "auth user gone" to be stranded
   * in. Measured on a seeded account against production on 2026-09-08 rather
   * than derived from `pg_constraint`: `billing_customers`, `subscriptions`,
   * `entitlements`, `blocks` and `profiles` each held one row, the auth user was
   * deleted and nothing else, and all five read back zero.
   *
   * ⚠️ **`blocks` and `block_targets` hang off `auth.users` DIRECTLY, not off
   * `profiles`.** The old row delete never reached them; only this step does.
   *
   * ## If it fails, nothing has been deleted from the database
   *
   * The cascade fires only on a successful delete, so a failure here leaves the
   * account whole — measured the same day: `profiles` present, `is_18_plus` and
   * `tos_accepted_at` intact so the gate passes, the app renders, the dialog is
   * reachable, and the retry completed cleanly.
   *
   * ⚠️ Their uploaded FILES are already gone by this point, because §3.2 puts
   * the sweep first and that has not changed. "Whole" is true of the account and
   * its rows, not of storage. That is the pre-existing trade §3.2 accepts, and
   * `DELETE_ACCOUNT_FAILURE_COPY.partlyDeleted` is what the user reads.
   *
   * It also revokes every refresh token, which is what makes the sign-out that
   * follows final rather than cosmetic.
   */
  async deleteAuthUser(userId) {
    const { error } = await adminClient().auth.admin.deleteUser(userId);
    // ⚠️ The Supabase client RETURNS this error rather than throwing it.
    // Destructuring and ignoring it is how a teardown silently does nothing.
    if (!error) return;

    /**
     * ⚠️ AN ERROR IS NOT THE VERDICT. THE POST-CONDITION IS, SO ASK.
     *
     * This used to read the error's SHAPE and treat any 404 as "already gone".
     * Two cold reviews found the same hole: a 404 from a misrouted admin URL - a
     * wrong `NEXT_PUBLIC_SUPABASE_URL`, a proxy change, an auth API path change -
     * is indistinguishable from "this user does not exist", and it would have
     * read as SUCCESS while the cascade had already taken every row.
     *
     * So the shape is no longer trusted. The question "is this user gone" is put
     * to the server directly, which is the same standard `sweep.ts` holds itself
     * to: verified by re-reading, never by the delete's return value.
     */
    if (await authUserIsGone(userId)) return;
    throw new Error(`auth user delete failed: ${error.message}`);
  },

  /**
   * ⚠️ LAST, AND IT REPORTS RATHER THAN GATES. A READ THAT CAN FAIL.
   *
   * **A verification that cannot fail is a step that runs, does nothing and
   * exits 0**, so this still throws when it finds something. What changed is who
   * catches it: `deleteAccountFor` does, and records it, because by the time
   * this runs the account is already gone and withholding the cleanup would
   * punish somebody for a failed READ. See the call site for the defect that
   * taught us that.
   *
   * It deletes nothing: by the time it runs the cascade has either taken
   * everything or the step before it threw and this never ran.
   *
   * ## ⚠️ A READ THAT ERRORED IS A FAILURE, NOT AN EMPTY TABLE
   *
   * Absent is not unknown. Every read here has three outcomes — rows, no rows,
   * or could-not-ask — and only the middle one passes. A read that 500s must
   * never be recorded as "verified empty", which is the exact way a verification
   * step becomes decorative.
   *
   * ## Why these tables and not all thirty-four
   *
   * The money-adjacent ones plus the two roots. `profiles` is the root of the
   * 30-table cascade and `blocks` hangs off `auth.users` directly, so between
   * them the two cascade paths are both exercised on every single deletion.
   * Enumerating all thirty-four here would be a second list to keep in sync with
   * the schema; that job belongs to `cascadeCoverage.test.ts`, which goes red if
   * any foreign key to `profiles` or `auth.users` stops cascading. ⚠️ It runs
   * under `npm test` and `npm run check` and **nothing runs it automatically** -
   * `npm run build` does not. Its own header carries the detail and the four
   * shapes it cannot see.
   */
  async verifyErased(userId) {
    const client = adminClient();
    const problems: string[] = [];

    // The auth user itself. Only a definite "no user" passes.
    const { data, error } = await client.auth.admin.getUserById(userId);
    if (error) {
      if (!isUserNotFound(error)) {
        problems.push(`auth user: could not verify (${error.message})`);
      }
    } else if (data?.user) {
      problems.push("auth user: still exists");
    }

    for (const [table, column] of VERIFIED_EMPTY) {
      const { count, error: readError } = await client
        .from(table)
        .select("*", { count: "exact", head: true })
        .eq(column, userId);

      if (readError) {
        problems.push(`${table}: could not verify (${readError.message})`);
        continue;
      }
      // ⚠️ A null count is a read that did not answer, not a zero.
      if (count === null || count === undefined) {
        problems.push(`${table}: read returned no count and no error`);
        continue;
      }
      if (count > 0) problems.push(`${table}: ${count} row(s) remain`);
    }

    if (problems.length > 0) {
      throw new Error(`the account is not fully erased: ${problems.join("; ")}`);
    }
  },
};

/**
 * What {@link liveSteps.verifyErased} reads back, and the column that owns the
 * row. Both cascade roots are represented: `profiles` heads the thirty-table
 * cascade, and `blocks` hangs off `auth.users` directly.
 */
const VERIFIED_EMPTY: ReadonlyArray<readonly [string, string]> = [
  ["profiles", "id"],
  ["billing_customers", "user_id"],
  ["subscriptions", "user_id"],
  ["entitlements", "user_id"],
  ["blocks", "user_id"],
] as const;

/**
 * ⚠️ SUPABASE'S OWN "THIS USER DOES NOT EXIST", AND NOTHING WIDER.
 *
 * Exported so its narrowness is tested against BEHAVIOUR rather than against
 * this file's source text. The test that used to guard it read the source and
 * could not fail; see `deleteAccount.test.ts`.
 *
 * ⚠️ NOT a bare `status === 404` and NOT a message match. `error.message` is
 * vendor prose that can be reworded in a patch release, and a bare 404 is what
 * a misrouted admin endpoint returns for EVERY user. The code is the contract.
 */
export function isUserNotFound(
  error: { status?: number; code?: string; message?: string } | null,
): boolean {
  return error?.code === "user_not_found";
}

/**
 * ⚠️ "THIS USER DOES NOT EXIST" IS THE GOAL STATE, NOT A FAILURE — BUT IT IS
 * ESTABLISHED BY READING, NOT BY GUESSING FROM AN ERROR.
 *
 * ## The defect this exists for, found by driving it
 *
 * The live drive ran a deletion twice on the same id — the retry a half-failed
 * deletion makes, and the one §5 requires to "complete cleanly". The second run
 * swept correctly, deleted no rows because there were none, and then **failed on
 * `delete-auth-user` with "User not found"**.
 *
 * The user-visible consequence is the worst available lie: the action turns a
 * failure into a sentence claiming nothing was removed, so somebody retrying
 * after a partial failure would be told their data was intact **at the exact
 * moment it had all just been erased.**
 *
 * ## ⚠️ ONLY A SUCCESSFUL READ THAT ANSWERS "NO USER" PROVES ABSENCE
 *
 * An ERRORED read cannot tell "this user is gone" from "I could not ask", so it
 * only counts when the server names the reason as `user_not_found`. A network
 * failure, a 500, a permission problem and a misrouted URL all answer `false`
 * and the deletion stops — which is the recoverable direction, because the
 * alternative is reporting a deletion complete while `auth.users` still holds
 * the person's email, phone and credentials.
 */
async function authUserIsGone(userId: string): Promise<boolean> {
  const { data, error } = await adminClient().auth.admin.getUserById(userId);
  if (error) return isUserNotFound(error);
  return !data?.user;
}

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

  /**
   * ⚠️ THE CONFIRMATION READ. IT REPORTS. IT DOES NOT GATE. THAT IS THE WHOLE
   * POINT AND IT IS THE OPPOSITE OF EVERY STEP ABOVE IT.
   *
   * ## The defect this shape exists for
   *
   * It used to be the fourth step in the loop, so a throw returned
   * `{ok: false}`. But by the time it runs **the auth user is already gone and
   * the cascade has already taken every row.** Any transient error on any one of
   * its six reads then returned the action BEFORE the sign-out, before the
   * cookie clear, before the device wipe and before the redirect - so somebody
   * whose account no longer existed was told to "try again" at a screen they
   * could no longer reach, their on-device health data survived in breach of
   * D116, and their session cookie stayed put.
   *
   * Failing closed protects somebody when there is still something to protect.
   * Here there is not: the account is gone either way, and withholding the
   * cleanup protects nobody and costs them the four promises above.
   *
   * ## ⚠️ IT MUST STILL BE ABLE TO FAIL, AND LOUDLY
   *
   * A read that cannot report a problem is a step that runs, does nothing and
   * exits 0. So it still throws, the throw is still caught here, and the outcome
   * still carries it — `ok: true` says the deletion ran, `verification` says
   * whether we could confirm it.
   *
   * ⚠️ **WHERE THE LOUD PART LANDS.** The person is gone and can read nothing, so
   * the only audience is the server log: this `console.error`, greppable on
   * `ERASURE UNVERIFIED`. **Nothing pages anybody on it today.** A push alerter
   * exists (`lib/billing/reconcile/alert.ts`) but it is bound to spec 11's
   * reconciliation report, so routing this into it is its own decision and is
   * not taken here.
   */
  let verification: Verification = { ok: true };
  try {
    await steps.verifyErased(userId);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(
      `[delete] ⚠️ ERASURE UNVERIFIED for ${userId}: ${error}. The account WAS deleted; the confirmation read did not complete. Check by hand.`,
    );
    verification = { ok: false, error };
  }

  console.warn(
    `[delete] ${userId} deleted: ${stepsRun.join(" -> ")}` +
      (verification.ok ? " (verified)" : " (UNVERIFIED)"),
  );
  return { ok: true, stepsRun, verification };
}
