import { cache } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * The verified current user for this request — `getUser()` revalidates against
 * the Supabase Auth server, so it is the only trustworthy signal for access.
 * Wrapped in React `cache()` so the many guards that need it (the root layout's
 * desktop gate, the (app) shell, every page) share ONE round-trip per request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Authoritative auth + gate state for server-side guards.
 *
 * `getUser()` revalidates the session against the Supabase Auth server (never
 * trust the optimistic proxy refresh or getSession() for access decisions). When
 * a user exists we read the two gate columns the 18+/ToS interstitial writes.
 *
 * `passedGate` is the single source of truth for "this account may use the app":
 * it is true only once the user has confirmed 18+ AND accepted the legal docs
 * (architecture.md → Auth and Access Model). Use it in every protected route.
 */
export type SessionContext = {
  user: User | null;
  passedGate: boolean;
};

export async function getSessionContext(): Promise<SessionContext> {
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, passedGate: false };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_18_plus, tos_accepted_at")
    .eq("id", user.id)
    .maybeSingle();

  const passedGate = Boolean(profile?.is_18_plus && profile?.tos_accepted_at);

  return { user, passedGate };
}
