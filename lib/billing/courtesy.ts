import "server-only";

import { createClient } from "@/lib/supabase/server";

import { CANCELLABLE_STATUSES } from "./manage";

/**
 * ⚠️ THE SAVE-OFFER COURTESY END, READ IN ITS OWN TOLERANT QUERY.
 *
 * ## Why this is a separate query and not a column on the select beside it
 *
 * `courtesy_until` arrives with `supabase/billing/003`, **which was applied on
 * 16 August** (probe: `select courtesy_until` returns an empty set, not
 * `42703`). The separation STAYS regardless, and is not hypothetical: a deploy
 * and a migration do not land in the same instant, and the code has to be
 * correct in the gap.
 *
 * **PostgREST rejects the ENTIRE request for one unknown column.** Folded into
 * the select it sits beside, an unapplied migration would take down the whole
 * read — on `/billing`, that is the query carrying status, both dates and the
 * price id, so somebody trying to see what they are paying would get nothing at
 * all. Exactly the shape `notifications/004` uses for the same reason, and the
 * same lesson `trialLease.ts` paid for.
 *
 * Where the column cannot be read this is `null` and the label falls back to
 * pre-`003` behaviour, which `08-billing-screen.md` §3.7 calls "a correct and
 * deliberate degradation": one word, on one screen, for one kind of customer.
 *
 * ## ⚠️ IT LIVES HERE BECAUSE IT NOW HAS TWO CALLERS, AND THEY MUST NOT DRIFT
 *
 * It was a private helper in `app/(app)/billing/page.tsx`. Profile's plan pill
 * calls `planLabelFor` too, and **was passing no `courtesyUntil` at all** — so a
 * courtesy customer read "Free trial" on Profile while Billing read "Pro". That
 * is a Q88 state disagreement, and it was live. Giving Profile a second copy of
 * this query is how the next disagreement gets written, so there is one
 * function and two callers.
 *
 * **Profile gets the separate query too, rather than folding the column into its
 * existing `select("status")`.** Considered and rejected: folded, an unreadable
 * column kills the STATUS read alongside it, `subRow` comes back null, and a
 * genuine trialist's pill flips from "Free trial" to "Pro" — a wrong label, in
 * the over-promising direction, produced by nothing but a migration gap. Kept
 * separate, the degradation on both screens is identical and is the documented
 * one. It is also the Rule 0 shape: a folded select cannot tell "no courtesy
 * period" from "column unreadable", and collapses both into the same silence.
 *
 * ## The filter is the named set, never a literal
 *
 * `CANCELLABLE_STATUSES` — a courtesy period only exists on a subscription the
 * user could still act on. The literal three this replaced is the class of
 * defect that put the wrong subscription on the billing screen.
 */
export async function courtesyUntilFor(userId: string): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("subscriptions")
      .select("courtesy_until")
      .eq("user_id", userId)
      .in("status", [...CANCELLABLE_STATUSES])
      .not("courtesy_until", "is", null)
      .order("courtesy_until", { ascending: false })
      .limit(1);
    if (error) return null;
    return (data?.[0]?.courtesy_until as string | null) ?? null;
  } catch {
    return null;
  }
}
