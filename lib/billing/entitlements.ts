import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import {
  deriveEntitlementFacts,
  grantsPro,
  PRO,
  type RevokedReason,
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
 * ⚠️ EVERYTHING THE DISPLAY LAYER NEEDS FROM `entitlements`, IN ONE READ THAT
 * SAYS WHETHER IT WORKED.
 *
 * ## The defect this replaces, and why widening one consumer would not have fixed it
 *
 * `currentEntitlement` and `entitlementEndDate` both routed through
 * {@link listEntitlements}, which returns `[]` on a FAILED read — correct
 * fail-closed behaviour for a gate, and destructive for a sentence. Both then
 * answered `null` for two different facts: "no entitlement" and "could not read
 * entitlements". Five surfaces spent that `null` as though it were the first.
 *
 * The three-state answer already existed eight lines above, in
 * {@link proAccessState}, and the WRITE path already used it (`gate.ts`). So on
 * ONE failed read this app answered **"unknown, still syncing, retry"** on the
 * write path and **"not on a plan"** on the billing path, in the same request.
 *
 * Widening any single consumer would have left the other four, so the read is
 * widened ONCE, here, and the collapsing readers are GONE rather than left beside
 * it — a three-state reader sitting next to a two-state one is how this was
 * written in the first place.
 *
 * ## The four facts, and why they travel together
 *
 * They come from one row set, and separating them is what let two of them
 * disagree. `entitlement` excludes dead rows because a revoked comp must not be
 * labelled Complimentary; `endDate` includes them because a screen that drops the
 * date over-promises; `revoked` is the row somebody TURNED OFF; `accessLive` is
 * the question no field on this table answered before — **does this person hold
 * access right now** — which every surface was reconstructing from a date.
 */
export type EntitlementFacts =
  | {
      /** The read worked. Every field below means what it says. */
      known: true;
      /**
       * The strongest row active RIGHT NOW, for DISPLAY — the Billing row's
       * "current plan", and whether to say "complimentary" rather than name a
       * plan. Excludes dead rows on purpose.
       */
      entitlement: Entitlement | null;
      /**
       * ⚠️ WHEN THIS ACCOUNT'S PRO ACCESS ENDS OR ENDED, **INCLUDING WHEN IT IS
       * ALREADY OVER.** For dates only. It decides nothing.
       *
       * `entitlement` resolves through `strongestEntitlement`, which filters to
       * rows active right now. `/billing` fed that same value to
       * `manageActionFor` as the date to state, and the guard there exists
       * precisely for the case where the entitlement and the mirror DISAGREE — so
       * an expired or revoked entitlement came back `null`, `soonerOf` had
       * nothing to compare, and it fell back to the mirror. **The guard stopped
       * applying at exactly the moment the two dates diverge most.**
       *
       * Measured by a cold review: a yearly whose entitlement was clawed back to
       * 14 Aug with the mirror still at 2027-08-16 was promised another 365 days
       * of full access. A revoked dispute case was promised 31.
       *
       * The FURTHEST date across the user's pro rows, so a live row is never
       * under-cut by a stale one beside it, and `null` when no row names a date
       * at all (a no-expiry comp, or no rows) — which `soonerOf` correctly treats
       * as "this source has nothing to say".
       */
      endDate: string | null;
      /**
       * ⚠️ A PRO ROW SOMEBODY TURNED OFF. A DECISION, NOT AN ABSENCE.
       *
       * `revokeForCustomer` writes `is_active: false` and touches nothing else,
       * so this is the ONLY field that distinguishes a revoked account from one
       * that simply never had a row. It is deliberately not derived from a date:
       * `sync.ts:339` and `sync.ts:399` both write from `entitledUntil(sub)`, so
       * the entitlement's date and the mirror's are EQUAL by construction on a
       * revocation, and every predicate that compared them answered "no".
       */
      revoked: boolean;
      /**
       * ⚠️ WHY it was revoked, or `unknown` (D101 / Q106).
       *
       * `unknown` covers three states that must not be told apart by guessing:
       * the read failed, `005` is unapplied, or the row predates it. **It is
       * never treated as `dispute`** — that default would tell a refunded
       * customer their bank disputed a payment.
       *
       * Always `unknown` when {@link revoked} is false: there is no reason
       * because there was no revocation, and the query is not made.
       */
      revokedReason: RevokedReason;
      /**
       * ⚠️ DOES THIS PERSON HOLD ACCESS RIGHT NOW? The fact the app carried a
       * DATE for and never carried directly.
       *
       * The same rule `hasProAccess` gates on, so a surface can no longer
       * disagree with the gate about whether somebody is entitled.
       */
      accessLive: boolean;
    }
  /**
   * ⚠️ WE COULD NOT ASK. Not "they have nothing" — a distinction the caller MUST
   * make, which is why there is no field to read past it.
   */
  | { known: false };

/**
 * The widened read. Session-scoped like `hasProAccess`, and for the same reason:
 * a reader that takes a user id is a reader that can be pointed at somebody else.
 *
 * Request-`cache()`d, so several surfaces on one page pay for one query.
 */
/**
 * ⚠️ WHY THE ENTITLEMENT WAS REVOKED, IN ITS OWN TOLERANT QUERY (D101 / Q106).
 *
 *   "dispute"  a chargeback. `08`'s two dispute sentences apply.
 *   "refund"   the founder refunded them. Neither sentence applies.
 *   "unknown"  we could not ask, OR `005` is not applied, OR the row predates it.
 *
 * ## ⚠️ UNKNOWN IS NOT DISPUTE, AND HERE THE WRONG DEFAULT IS THE LIE
 *
 * Standing rule 0, in its sharpest form on this project: defaulting an unreadable
 * reason to `"dispute"` would tell somebody the founder refunded as a goodwill
 * gesture that **their bank disputed a payment**. Both sentences are withheld on
 * `unknown` instead — which costs a genuinely disputed customer an explanation
 * while the column is missing, and tells nobody anything false.
 *
 * **That window is not hypothetical: `005` is written and UNAPPLIED, so today
 * every revoked row in the database is `unknown`.**
 *
 * ## ⚠️ ITS OWN QUERY, DELIBERATELY
 *
 * Folding `revoked_reason` into the select in {@link readEntitlements} would mean
 * an unapplied migration takes down the WHOLE access read — PostgREST rejects the
 * entire request for one unknown column — so a missing display column would
 * become "nobody has access". The same shape `screenFacts` uses for
 * `courtesy_until` and for the same reason, and the lesson `trialLease.ts` paid
 * for by catching `42703` when the real answer was `PGRST204`.
 */
/**
 * ⚠️ MOVED TO `./access.ts` AND RE-EXPORTED, so every existing import keeps
 * working. It is needed by `reconcile/types.ts`, which is PURE and must not
 * import this `server-only` module — see the declaration there for why it is not
 * simply written out twice.
 */
export type { RevokedReason } from "./access";

async function revokedReasonFor(userId: string): Promise<RevokedReason> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("entitlements")
      .select("revoked_reason")
      .eq("user_id", userId)
      .eq("product", PRO)
      .eq("source", "stripe")
      .eq("is_active", false)
      .limit(1);

    if (error) {
      // 42703 from Postgres, PGRST204 from PostgREST's schema cache. Both mean
      // "005 is not applied yet"; anything else is a read that failed. Neither is
      // a reason to claim a dispute.
      console.info(`[entitlements] revoked_reason unavailable for ${userId}: ${error.message}`);
      return "unknown";
    }
    const reason = data?.[0]?.revoked_reason ?? null;
    return reason === "dispute" || reason === "refund" ? reason : "unknown";
  } catch (err) {
    console.error(
      `[entitlements] revoked_reason read threw for ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
    return "unknown";
  }
}

export const entitlementFacts = cache(async (): Promise<EntitlementFacts> => {
  const user = await getCurrentUser();
  /**
   * ⚠️ NO SESSION IS `known: false`, matching {@link proAccessState}. Somebody
   * with no session is not a lapsed subscriber, and the honest answer to "what
   * are they entitled to" is that we cannot say.
   */
  if (!user) return { known: false };

  const read = await readEntitlements(user.id);
  if (!read.ok) return { known: false };

  const derived = deriveEntitlementFacts(read.entitlements, new Date());
  /**
   * Only asked when there is something to ask about. A healthy account pays for
   * no extra query, and the question is meaningless for them anyway.
   */
  const revokedReason = derived.revoked ? await revokedReasonFor(user.id) : "unknown";
  return { known: true, ...derived, revokedReason };
});
