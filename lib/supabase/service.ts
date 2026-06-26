import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged Supabase client (service/secret key) — bypasses RLS.
 *
 * Use ONLY in trusted server contexts that must act across users without a
 * session: the Stripe webhook, the reminder scheduler, etc. NEVER expose it to
 * the client and NEVER use it to serve user-facing reads — that would defeat the
 * RLS that isolates one user's data from another's.
 *
 * Mirrors the inline client in app/api/notifications/run/route.ts and reuses the
 * same env var names (SUPABASE_SECRET_KEY, legacy SUPABASE_SERVICE_ROLE_KEY).
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    "";
  if (!url || !key) {
    throw new Error(
      "Supabase service role is not configured (set SUPABASE_SECRET_KEY).",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
