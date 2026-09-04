import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ⚠️ THE SERVICE-ROLE CLIENT FOR THINGS THE TYPED ONES CANNOT REACH.
 *
 * Answers Q99 ("how the auth user is deleted, and whether an admin client
 * already exists for it"). The measured answer, 2026-09-03: **no reusable one
 * existed.** The shape was written inline three times — `api/billing/beta-grace
 * /route.ts:97`, `lib/billing/reconcile/alert.ts:80`, `api/notifications/run
 * /route.ts:35` — all three for `auth.admin.listUsers`, and `deleteUser` was
 * called only from `scratchpad/harness/`, never from shipped code.
 *
 * ## Why it is not `serviceClient()`
 *
 * `lib/billing/service.ts` is typed to `BillingDatabase`, deliberately, so a
 * misspelled billing column fails the build instead of a real payment. That
 * generic is exactly what makes it unusable here: account deletion touches
 * `profiles`, and the storage sweep reads `lab_panels`, `progress_photos` and
 * `journal_attachments`, none of which that schema knows. Widening
 * `BillingDatabase` to cover the whole database to satisfy one caller would take
 * the type safety off the writes that actually move money.
 *
 * So this is a SECOND client, untyped, for the paths that span the schema. It is
 * not a replacement and billing must keep using its own.
 *
 * ## ⚠️ `server-only`, AND THAT IS THE WHOLE GUARANTEE
 *
 * This holds the service-role key, which bypasses RLS on every table. Importing
 * it from a client component fails the BUILD rather than shipping `sb_secret_`
 * to a browser. It must never be imported into a `"use client"` module, and it
 * must never be handed a user id that came from a request — every caller
 * resolves the account from the verified session first.
 *
 * NOT a module-level singleton built at import time: the key is read when the
 * client is first asked for, so a route that never touches it does not crash a
 * deploy that has not set it. Same reasoning as `lib/billing/service.ts`.
 */
let client: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for account deletion.",
    );
  }

  client = createClient(url, key, {
    // No session, no refresh, no storage. This client is not a user and must
    // never accidentally pick one up.
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
