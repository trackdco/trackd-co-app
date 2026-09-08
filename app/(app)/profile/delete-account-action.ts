"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  deleteAccountFor,
  type DeletionStep,
} from "@/lib/account/deleteAccount";
import { DELETE_ACCOUNT_FAILURE_COPY } from "@/lib/account/deleteCopy";
import { createClient } from "@/lib/supabase/server";

/**
 * ⚠️ THE DELETION ACTION. THE MOST DANGEROUS EXPORT IN THIS PRODUCT, AND THE
 * RULES BELOW ARE WHAT MAKE IT SAFE.
 *
 * ## ⚠️ IT TAKES NO USER ID, AND THAT IS NOT A STYLE CHOICE
 *
 * Every export of a `"use server"` module is a **publicly dispatchable HTTP
 * endpoint** with its own stable id. Anyone on the internet can POST to it. An
 * export that accepted `userId` would let a stranger delete any account whose id
 * they could guess or read — and ids appear in storage paths, so they are not
 * secret.
 *
 * The account comes from `supabase.auth.getUser()`, which revalidates against
 * the Auth server rather than trusting a cookie. `16-account-deletion.md` §3.8:
 * *"A server action never accepts an identifier saying whose data to act on."*
 *
 * The confirmation phrase IS accepted, and it is not an identifier — it says
 * nothing about whose account this is, only that whoever is holding this session
 * meant it. It is re-checked here rather than trusted from the button, because
 * the button is a UX affordance and this is the enforcement.
 *
 * ## ⚠️ THIS FILE HAS EXACTLY ONE EXPORT AND MUST KEEP HAVING ONE
 *
 * Not a tidiness rule. A second export here is a second public endpoint, and the
 * helpers a deletion flow attracts — "sweep this user", "cancel this
 * subscription" — are precisely the ones that would take an id.
 * `deleteAccount.test.ts` pins the export list.
 *
 * ## ⚠️ NOT GATED, DELIBERATELY
 *
 * No `canWriteData`, no `refuseWrite`, no `requireWriteAccess`. `05` exempts
 * this entire flow from the read-only gate and carries the reciprocal statement:
 * **a lapsed user can always leave.** An account nobody can leave is data held
 * hostage, which is the one thing this product must never do. A future session
 * "tidying" a gate call into this file would break that, so the absence is
 * asserted in the tests rather than left to be noticed.
 *
 * ## The sign-out is LAST, and it works — measured, not assumed
 *
 * Deleting the auth user revokes every refresh token server-side, but the access
 * token already in the browser stays cryptographically valid until it expires.
 * So the cookie has to be cleared, and the question was whether `signOut()` can
 * still do that once the user it names is gone.
 *
 * It can. `@supabase/auth-js`'s `_signOut` calls the logout endpoint, and on a
 * 404/401/403 it **swallows the error and clears the local session anyway** —
 * its own comment reads *"ignore 404s since user might not exist anymore"*
 * (`GoTrueClient.js:3275-3288`). `_removeSession()` then runs, and the
 * `@supabase/ssr` cookie adapter deletes the auth cookies.
 *
 * ⚠️ **Which is why this is an ACTION and not a page.** Cookie writes are only
 * permitted in a server action or route handler; the same call in a Server
 * Component render would throw and leave a valid cookie behind.
 *
 * Order matters the other way too: signing out FIRST would log somebody out of
 * an account that might then fail to delete. Sign-out runs only after all four
 * steps have succeeded.
 *
 * ## Where they land
 *
 * The PUBLIC HOMEPAGE, signed out, with no `?next=` — exactly what a first-time
 * visitor sees (Adrian, 2026-09-04). Not `/login`, which would greet somebody
 * who has just erased their account with "Welcome back" and a deep link back
 * into it. There is no "deletion complete" page: the absence of the app is the
 * confirmation.
 */

/** The phrase, exact and case-sensitive. `delete` is not `DELETE`. */
const CONFIRMATION = "DELETE";

/**
 * ⚠️ WHAT TO SAY, DECIDED BY HOW FAR THE DELETION GOT.
 *
 * ⚠️ NOT EXPORTED. This file has exactly one export by design - every export of
 * a `"use server"` module is a publicly dispatchable HTTP endpoint - and a copy
 * helper is no reason to add a second.
 *
 * §3.2 stops at the first failing step, so `failedAt` says exactly which of the
 * four states the account is in, and each of them is a different true sentence.
 * The single sentence this replaced claimed "Nothing has been removed" in all
 * four, which was false in three of them: by the time the sweep can fail the
 * Stripe subscription is already cancelled with the remaining paid time gone,
 * and by the time the row delete can fail the files are already destroyed.
 */
/**
 * ⚠️ CLEAR THE AUTH COOKIES OURSELVES, BECAUSE `signOut()` SOMETIMES DOES NOT.
 *
 * ## What was wrong with trusting it
 *
 * `_signOut` in `@supabase/auth-js` returns early with a non-null `error` and
 * **never reaches `_removeSession()`** on a session-read error, or on an admin
 * error that is not 404/401/403. So on a 500 or a retryable fetch failure the
 * cookie SURVIVES while this action reports the deletion succeeded.
 *
 * ## Why the residue is worth code rather than a shrug
 *
 * The access token stays valid, and Storage's INSERT policy is signature-checked
 * rather than row-checked. So a second tab left open can still upload into the
 * prefix the sweep just cleared, producing an object with no row and no user -
 * the orphan shape `sweep.ts` documents live instances of on production.
 *
 * ## ⚠️ WHAT THIS DOES NOT FIX (Q108)
 *
 * **The access token stays cryptographically valid until it expires.** That is a
 * property of a signed JWT and no cookie clear can revoke it: a token already
 * copied out of the browser keeps working until expiry. Deleting the auth user
 * revokes the REFRESH token, so the session cannot be extended, which bounds the
 * exposure to one token lifetime. **The configured lifetime is a Supabase
 * dashboard setting and CANNOT BE CHECKED from this repository.**
 *
 * ## Matched by name, so chunked cookies go too
 *
 * `@supabase/ssr` splits a large session across `...auth-token.0`,
 * `...auth-token.1` and so on. Deleting only the unsuffixed name would leave the
 * chunks, so every `sb-*auth-token*` cookie is removed. Nothing else is
 * touched - this is somebody's browser, not ours to tidy.
 */
async function clearAuthCookies(): Promise<void> {
  try {
    const jar = await cookies();
    for (const cookie of jar.getAll()) {
      if (/^sb-.*auth-token/.test(cookie.name)) jar.delete(cookie.name);
    }
  } catch (error) {
    // A cookie write is only permitted in an action or a route handler, and this
    // IS one - but the deletion has already completed and must not be reported
    // as failed because the jar refused.
    console.error(
      "[delete] could not clear auth cookies:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

function failureCopyFor(failedAt: DeletionStep): string {
  switch (failedAt) {
    case "cancel-stripe":
      // Nothing ran after it. The account is entirely untouched.
      return DELETE_ACCOUNT_FAILURE_COPY.nothingRemoved;
    case "sweep-storage":
      // The cancel succeeded. Rows are intact; the money is not coming back.
      return DELETE_ACCOUNT_FAILURE_COPY.cancelledOnly;
    case "delete-auth-user":
      /**
       * Files are already gone by here, because the sweep runs first. Every ROW
       * survives, though - the cascade fires only on a successful delete - so
       * the account still works and the retry is reachable. Something of theirs
       * HAS gone, so this must not read as "nothing happened", or somebody walks
       * away from a half-deleted account.
       *
       * ⚠️ There is no case for the confirmation read, deliberately: it runs
       * after the account is already gone and cannot fail the deletion, so it
       * never reaches a user. See `deleteAccountFor`.
       */
      return DELETE_ACCOUNT_FAILURE_COPY.partlyDeleted;
  }
}

export async function deleteMyAccount(
  confirmation: string,
): Promise<{ ok: false; error: string }> {
  const supabase = await createClient();

  /**
   * ⚠️ `getUser()`, NEVER `getSession()`. It revalidates against the Auth
   * server. A session read would trust a cookie, and this is the one action
   * where trusting a cookie is unrecoverable.
   */
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  /**
   * ⚠️ ABSENT IS NOT UNKNOWN. A read that FAILED is not "you are not signed in".
   *
   * `error` was discarded here, so an Auth server having a bad minute told a
   * signed-in person *"You need to be signed in to delete your account."* - a
   * sentence that is false, and that sends somebody who is trying to leave off
   * to a login screen they are already past.
   *
   * It refuses either way, so this fails in the SAFE direction and is a COPY
   * defect rather than an access one. The honest answer for a read that did not
   * answer is the one that claims nothing.
   */
  if (userError) {
    console.error("[delete] getUser failed, refusing without naming a sign-in state:", userError.message);
    return { ok: false, error: DELETE_ACCOUNT_FAILURE_COPY.unknown };
  }

  if (!user) {
    // Genuinely nobody: an anonymous caller, or one whose account is already
    // gone. Both get the same nothing — no enumeration, no detail.
    return { ok: false, error: "You need to be signed in to delete your account." };
  }

  if (confirmation !== CONFIRMATION) {
    // The button enforces this too. This is the copy nobody should ever see:
    // reaching it means the request did not come from the screen.
    return { ok: false, error: "Type DELETE to confirm." };
  }

  const outcome = await deleteAccountFor(user.id);

  if (!outcome.ok) {
    /**
     * ⚠️ THE ACCOUNT IS INTACT AND THEY STAY SIGNED IN.
     *
     * Every partial state this can stop in is the recoverable one, by §3.2's
     * ordering: cancelled-but-not-deleted is a person with no subscription and
     * all of their data. Signing them out here would strand them outside an
     * account that still exists.
     *
     * ⚠️ "INTACT" IS TRUE OF THE ACCOUNT, NOT OF EVERYTHING. Only a failure at
     * the FIRST step leaves nothing removed. Later ones have already cancelled
     * the subscription, and later still have already destroyed files. The
     * account still exists and they stay signed in either way, which is why the
     * sign-out below is not reached - but the SENTENCE must say which of those
     * happened, and {@link failureCopyFor} is what decides that.
     *
     * The message names no internal detail. `outcome.error` carries a database
     * or Stripe string and is already in the server log; putting it on the
     * screen would show somebody a PostgREST complaint at the worst moment.
     */
    return { ok: false, error: failureCopyFor(outcome.failedAt) };
  }

  /**
   * ⚠️ FIRE AND FORGET IS NOT ACCEPTABLE HERE, so it is awaited AND READ.
   *
   * ## A failed sign-out is distinguishable, and it was being discarded
   *
   * `_signOut` in the installed `@supabase/auth-js` returns early with a
   * non-null `error` and **never reaches `_removeSession()`** on a session-read
   * error, or on an admin error that is not 404/401/403. Only the clean path
   * clears the session and answers `{ error: null }`. So the two ARE separable,
   * and this used to throw the answer away.
   *
   * ## Why the residue matters more than it looks
   *
   * The access token stays cryptographically valid until it expires, and
   * Storage's INSERT policy is signature-checked. So a second tab left open can
   * still upload into the prefix the sweep just cleared - producing an object
   * with no row and no user, which is exactly the orphan shape `sweep.ts`
   * documents live instances of on production.
   *
   * ## ⚠️ LOGGED, NOT ACTED ON, AND THAT IS DELIBERATE PENDING A RULING
   *
   * Failing the whole deletion over a sign-out is probably worse than the
   * residue: the account is already gone, so there is nothing left to fail back
   * to, and the failure copy would tell somebody to retry a deletion that has
   * already completed. Adrian has not ruled what this should DO, so this makes
   * the distinction exist and observable and changes no behaviour. See the open
   * item in `Context/next-tasks.md`.
   */
  const { error: signOutError } = await supabase.auth.signOut();
  if (signOutError) {
    console.error(
      `[delete] ${user.id} deleted, but signOut reported: ${signOutError.message}. Clearing the cookies directly.`,
    );
  }

  /**
   * ⚠️ UNCONDITIONAL, AND AFTER `signOut` RATHER THAN INSTEAD OF IT.
   *
   * `signOut` still does the useful server-side work when it can. This is the
   * part that must be true whether or not it succeeded, so it does not sit
   * behind `if (signOutError)` - a clean-looking `signOut` that failed to write
   * the response cookie would slip through that branch.
   */
  await clearAuthCookies();

  // Throws internally, so nothing below runs and the function never returns on
  // the success path.
  redirect("/");
}
