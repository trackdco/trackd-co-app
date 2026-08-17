import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import {
  grantsPro,
  PRO,
  strongestEntitlement,
  type Entitlement,
  type EntitlementProduct,
  type EntitlementSource,
} from "./access";

/**
 * THE ENTITLEMENT READ PATH (Spec w2b-15, step 4).
 *
 * One question, one answer: **does this user have active access to `pro` right
 * now?** Every gate in the app asks this and nothing else.
 *
 * ## It never asks Stripe, and that is the point of the whole spec
 *
 * It reads `entitlements`. Stripe writes that table through the webhook; Apple
 * and Google will write the same table through RevenueCat when TRACKD reaches
 * the App Store, and **not one line of this file changes**. If any access check
 * anywhere reads a Stripe subscription status, a `stripe_` column, or the
 * `subscriptions` table, the spec has failed regardless of whether payments
 * work.
 *
 * `subscriptions` exists and is a MIRROR — it answers "renews on the 14th"
 * without a network call. It is not consulted here and must not be.
 *
 * The rule itself is in `./access.ts`, pure and tested. This file only reads.
 */

export { PRO } from "./access";
export type { Entitlement, EntitlementProduct, EntitlementSource };

/**
 * Every entitlement row for a user, mapped.
 *
 * Takes an explicit `userId` because the webhook has no session — it acts on
 * whoever the Stripe event names. Application gates must NOT call this; they
 * call `hasProAccess`, which resolves identity from the verified session.
 */
export async function listEntitlements(userId: string): Promise<Entitlement[]> {
  const read = await readEntitlements(userId);
  // FAIL CLOSED. A database that will not answer is not permission to enter.
  return read.ok ? read.entitlements : [];
}

/**
 * ⚠️ THE SAME READ, BUT IT SAYS WHETHER IT WORKED.
 *
 * ## Why "no rows" and "could not ask" must not be the same answer
 *
 * `listEntitlements` returns `[]` for both, which is the right FAIL-CLOSED
 * behaviour — access is refused either way — but it destroys the distinction the
 * user-facing message depends on:
 *
 *   read succeeded, no entitlement  →  we KNOW they have lapsed
 *   read failed                     →  we do not know anything
 *
 * Telling somebody "You're not on a plan at the moment" when the database simply
 * would not answer is a claim the server cannot back, and it is the one case
 * where offering a retry is genuinely worth doing. The syncing notice keeps its
 * job for exactly this branch.
 *
 * The same shape as `resolveEnding`'s `undefined` versus `null` in
 * `lib/notifications/trialReminder.ts:250` — "unreadable" is not "read, absent",
 * and collapsing the two is how a surface ends up asserting something nobody
 * checked.
 */
export type EntitlementRead =
  | { ok: true; entitlements: Entitlement[] }
  | { ok: false };

export async function readEntitlements(userId: string): Promise<EntitlementRead> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entitlements")
    .select("product, source, active_until, is_active")
    .eq("user_id", userId);

  if (error) {
    console.error("[entitlements] read failed:", error.message);
    return { ok: false };
  }

  return {
    ok: true,
    entitlements: (data ?? []).map((row) => ({
      product: row.product as EntitlementProduct,
      source: row.source as EntitlementSource,
      activeUntil: row.active_until,
      isActive: row.is_active,
    })),
  };
}

/**
 * **The one function every gate calls.**
 *
 * Request-`cache()`d, so a page checking access three times pays for one query —
 * the same treatment `getCurrentUser` gets, for the same reason.
 *
 * Identity comes from the verified session and is NOT a parameter: a gate that
 * takes a user id is a gate that can be pointed at somebody else's. RLS is the
 * backstop underneath, but the caller should not be able to ask the question
 * about another user in the first place.
 */
export const hasProAccess = cache(async (): Promise<boolean> => {
  return (await proAccessState()) === "allowed";
});

/**
 * The same question, answered in THREE states rather than two (05 §3.9, Q85).
 *
 *   allowed    entitled right now.
 *   read-only  the read SUCCEEDED and nothing entitles them. We know.
 *   unknown    we could not find out. Refused, but no claim is made about why.
 *
 * A missing session is `unknown` rather than `read-only`: somebody with no
 * session is not a lapsed subscriber, and the honest answer to "are they
 * entitled" is that we cannot say. Both refuse, which is what fail-closed means;
 * only the words differ.
 */
export const proAccessState = cache(
  async (): Promise<"allowed" | "read-only" | "unknown"> => {
    const user = await getCurrentUser();
    if (!user) return "unknown";
    const read = await readEntitlements(user.id);
    if (!read.ok) return "unknown";
    return grantsPro(read.entitlements, new Date()) ? "allowed" : "read-only";
  },
);

/**
 * What the user's access rests on, for DISPLAY — the Billing row's "current
 * plan", and whether to say "complimentary" rather than name a plan.
 *
 * Session-scoped like `hasProAccess`, and for the same reason.
 */
export const currentEntitlement = cache(async (): Promise<Entitlement | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return strongestEntitlement(await listEntitlements(user.id), new Date());
});

/**
 * ⚠️ WHEN THIS ACCOUNT'S PRO ACCESS ENDS OR ENDED, **INCLUDING WHEN IT IS ALREADY
 * OVER.** For dates only. It decides nothing.
 *
 * ## The defect this exists for
 *
 * {@link currentEntitlement} resolves through `strongestEntitlement`, which
 * filters to rows active RIGHT NOW. That is correct for deciding what somebody is
 * ON — a dead row grants nothing and must not name their plan.
 *
 * But `/billing` also fed that same value to `manageActionFor` as the date to
 * state, and **the guard there exists precisely for the case where the
 * entitlement and the mirror DISAGREE.** An expired or revoked entitlement is not
 * active, so it came back `null`, so `soonerOf` had nothing to compare and fell
 * back to the mirror — **the guard stopped applying at exactly the moment the two
 * dates diverge most.**
 *
 * Measured by a cold review: a yearly whose entitlement was clawed back to 14 Aug
 * with the mirror still at 2027-08-16 was promised **another 365 days** of full
 * access. A revoked dispute case was promised 31.
 *
 * ## Why it is a separate function rather than a looser filter
 *
 * The two questions must not be merged. "What does their access rest on?" has to
 * keep excluding dead rows, or a revoked comp would be labelled Complimentary.
 * "When does or did it end?" has to include them, or the screen over-promises.
 * One function answering both is how this defect was written in the first place.
 *
 * Returns the FURTHEST date across the user's pro rows, so a live row is never
 * under-cut by a stale one beside it, and `null` when no row names a date at all
 * (a no-expiry comp, or no rows), which `soonerOf` correctly treats as "this
 * source has nothing to say".
 */
export const entitlementEndDate = cache(async (): Promise<string | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const dated = (await listEntitlements(user.id))
    .filter((e) => e.product === PRO && e.activeUntil !== null)
    .map((e) => Date.parse(e.activeUntil!))
    .filter((t) => Number.isFinite(t));
  if (dated.length === 0) return null;
  return new Date(Math.max(...dated)).toISOString();
});
