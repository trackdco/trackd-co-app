import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ⚠️ DOES THIS ACCOUNT HAVE AN OPEN REFUND REQUEST? (D56, §3.6)
 *
 * Deleting an account destroys any open refund request, because feedback rows
 * cascade from `profiles` — verified against production `pg_constraint`:
 * `beta_feedback.user_id REFERENCES profiles(id) ON DELETE CASCADE`. So somebody
 * who asks for their money back and then deletes erases the request while the
 * founder may still owe them the money, and their obvious next move is their
 * bank. The warning is what stops that being a surprise.
 *
 * ## ⚠️ THE SHAPE IS DEFINED, NOT GUESSED — AND IT IS NOT BUILT
 *
 * `10-refund-requests.md` was never implemented: `beta_feedback` carries no
 * refund column, and nothing in `lib/db/` or `/admin` writes or reads one. So
 * **no refund request can exist in production today** and this returns false for
 * every real account.
 *
 * It is still built to the SHAPE `10` defines rather than to a guess, because
 * D41 resolved it: `10` §3.3 says the marker "carries the literal value
 * `refund_request`, set server-side, in the column the table already has for the
 * in-app route" — that is `beta_feedback.path`, described in
 * `supabase/feedback/001_beta_feedback.sql:29` as "the in-app route the tester
 * was on". No new table and no new column, and "a single equality on a
 * server-set value is the whole queue query".
 *
 * "Open" is `resolved_at IS NULL`, which is the same predicate `/admin`'s
 * feedback list already uses (`supabase/feedback/002_beta_feedback_resolved.sql`
 * — "NULL = open").
 *
 * ⚠️ **If `10` ships with a different discriminator, this is the one place to
 * change**, and the test beside it seeds a row of this shape so the change fails
 * loudly rather than silently returning false forever.
 *
 * ## ⚠️ THREE STATES COLLAPSED TO TWO, DELIBERATELY, AND WHICH WAY
 *
 * A failed read cannot distinguish "no request" from "could not check". This
 * returns **true** on a failed read, not false. That is the opposite of the
 * usual fail-closed direction and it is the right one here: the cost of showing
 * the warning to somebody with no open request is one extra sentence, and the
 * cost of hiding it from somebody who has one is that they lose the request and
 * their money with no notice. The permissive answer is the one that withholds
 * information, so absent is not unknown resolves toward showing it.
 *
 * It never blocks the deletion either way. The exit is never gated.
 */
export const REFUND_REQUEST_MARKER = "refund_request";

export async function hasOpenRefundRequest(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from("beta_feedback")
    .select("id")
    .eq("user_id", userId)
    .eq("path", REFUND_REQUEST_MARKER)
    .is("resolved_at", null)
    .limit(1);

  if (error) {
    // See the module comment: a read that failed is not "there is no request",
    // and the direction that costs less when wrong is showing the warning.
    console.error("[delete] refund-request check failed, warning anyway:", error.message);
    return true;
  }

  return (data?.length ?? 0) > 0;
}
