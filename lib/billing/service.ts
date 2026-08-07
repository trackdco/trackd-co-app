import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { BillingDatabase } from "./schema";

/**
 * The SERVICE-ROLE Supabase client — the only thing that may write billing.
 *
 * `entitlements`, `subscriptions`, `billing_customers` and `webhook_events` have
 * no write policy and no write grant for `authenticated`. That is deliberate and
 * it is the spec's hardest rule: *"Do NOT write entitlements, unlock features, or
 * set any access flag from client-side code under any circumstances. Anyone with
 * browser dev tools can trigger a client success state."* The database enforces
 * it; this key is the single legitimate exception.
 *
 * `server-only` means importing it from a client component fails the build
 * rather than shipping `sb_secret_` to a browser.
 *
 * NOT request-cached and NOT a module-level singleton built at import time: the
 * key is read when the client is first asked for, so a route that never touches
 * billing does not crash a deploy that has not set it.
 *
 * TYPED against `BillingDatabase`, unlike the older service client in
 * `lib/db/adminMetrics.ts`. That one only ever counts rows, so an untyped client
 * costs it nothing; this one WRITES, and an untyped client resolves every table
 * to `never` — which means a misspelled column type-checks fine and fails on a
 * real payment instead.
 */

let client: ReturnType<typeof createClient<BillingDatabase>> | null = null;

export function serviceClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required for billing writes.",
    );
  }

  client = createClient<BillingDatabase>(url, key, {
    // No session, no refresh, no storage. This client is not a user and must
    // never accidentally pick one up.
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}
