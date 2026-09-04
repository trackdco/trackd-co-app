"use server";

import { redirect } from "next/navigation";

import { deleteAccountFor } from "@/lib/account/deleteAccount";
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
  } = await supabase.auth.getUser();

  if (!user) {
    // An anonymous caller, or one whose account is already gone. Both get the
    // same nothing — no enumeration, no detail.
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
     * The message names no internal detail. `outcome.error` carries a database
     * or Stripe string and is already in the server log; putting it on the
     * screen would show somebody a PostgREST complaint at the worst moment.
     */
    return {
      ok: false,
      error: "Your account could not be deleted. Nothing has been removed. Please try again.",
    };
  }

  /**
   * ⚠️ FIRE AND FORGET IS NOT ACCEPTABLE HERE, so it is awaited. If the cookie
   * survives, the next request carries a credential for an account that no
   * longer exists — harmless for access, because `getUser()` fails, but it means
   * the redirect lands on a homepage that may still render as signed-in.
   */
  await supabase.auth.signOut();

  // Throws internally, so nothing below runs and the function never returns on
  // the success path.
  redirect("/");
}
