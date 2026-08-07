import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import {
  grantsPro,
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
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entitlements")
    .select("product, source, active_until, is_active")
    .eq("user_id", userId);

  if (error) {
    // FAIL CLOSED. A database that will not answer is not permission to enter.
    console.error("[entitlements] read failed:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    product: row.product as EntitlementProduct,
    source: row.source as EntitlementSource,
    activeUntil: row.active_until,
    isActive: row.is_active,
  }));
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
  const user = await getCurrentUser();
  if (!user) return false;
  return grantsPro(await listEntitlements(user.id), new Date());
});

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
