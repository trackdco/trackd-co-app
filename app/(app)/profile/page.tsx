import type { Metadata } from "next";

import { ProfileScreen } from "@/components/profile/ProfileScreen";
import { currentEntitlement } from "@/lib/billing/entitlements";
import { planLabelFor } from "@/lib/billing/manage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Profile · Trackd Co" };

/**
 * Profile tab — the data wrapper. Reads only the caller's own profiles row
 * (RLS-scoped) and hands it to `ProfileScreen`. The (app) layout has already
 * enforced auth + the 18+/ToS gate, so `user` is guaranteed here; user_metadata
 * is used for display only, never for access decisions.
 *
 * Settings was dissolved into this screen by spec 09 · part two — its route,
 * page, form and server action are gone, and `updatePhysical` in
 * `./actions.ts` is the old `updateSettings` with its validation unchanged.
 */
export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    // `tier` is no longer read: the plan label comes from `entitlements`.
    .select(
      "created_at, sex, date_of_birth, height_cm, weight_kg, goal, units_preference, avatar_path",
    )
    .eq("id", user!.id)
    .maybeSingle();

  // The avatar bucket is private — display via a short-lived signed URL. A fresh
  // URL is minted each render (the page revalidates), so it never reads stale.
  let avatarUrl: string | null = null;
  if (profile?.avatar_path) {
    const { data: signed } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_path, 3600);
    avatarUrl = signed?.signedUrl ?? null;
  }

  // The displayed weight follows the Weight view: the latest logged reading,
  // falling back to the onboarding snapshot, then "—". So logging in the weight
  // section updates here too.
  const { data: latestWeight } = await supabase
    .from("weight_logs")
    .select("weight")
    // Scoped explicitly, like every other read on this page. RLS already answers
    // for it; defence in depth is the house pattern and this was the one query
    // that relied on the backstop alone.
    .eq("profile_id", user!.id)
    .order("logged_for", { ascending: false })
    .limit(1)
    .maybeSingle();
  const displayWeightKg = latestWeight?.weight ?? profile?.weight_kg ?? null;

  // ----- display identity (auth metadata only; never an access decision) -----
  const fullName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    null;
  const hasName = Boolean(fullName?.trim());
  const email = user?.email ?? "";

  /**
   * THE PLAN LABEL COMES FROM `entitlements` NOW, NOT `profiles.tier`.
   *
   * This read `tier` and hardcoded "Beta · Pro" while `/billing` read the
   * entitlement, so one user could be told two different things on two screens.
   * `tier` is historical — `grants/003` locked it to the service role and
   * `architecture.md` makes `entitlements` the only table that decides anything
   * — and `planLabelFor` is now the single answer both screens ask for.
   *
   * The "Beta ·" prefix is gone on Adrian's call (2026-08-12): "we won't be in
   * beta by then." What somebody with no entitlement is told is a named constant
   * in `manage.ts`, with the reason it is currently "Pro" written next to it.
   */
  const entitlement = await currentEntitlement();
  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user!.id)
    .order("updated_at", { ascending: false })
    .limit(1);
  const planLabel = planLabelFor(
    entitlement?.source ?? null,
    subRow?.[0] ? { status: subRow[0].status as string } : null,
  );

  return (
    <ProfileScreen
      userId={user!.id}
      initials={getInitials(fullName, email)}
      avatarUrl={avatarUrl}
      displayName={hasName ? fullName!.trim() : email || "Your account"}
      hasName={hasName}
      email={email}
      planLabel={planLabel}
      physical={{
        sex: profile?.sex ?? null,
        goal: profile?.goal ?? null,
        unitsPreference: profile?.units_preference ?? "metric",
        heightCm: profile?.height_cm ?? null,
        age: ageFromDob(profile?.date_of_birth),
        weightKg: displayWeightKg == null ? null : Number(displayWeightKg),
      }}
    />
  );
}

/* ── Pure formatting helpers ─────────────────────────────────────── */

// First Unicode code point (not UTF-16 unit) so astral chars / emoji in a
// display name don't split a surrogate pair into mojibake.
function firstCodePoint(s: string | undefined): string {
  return s ? ([...s][0] ?? "") : "";
}

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = firstCodePoint(parts[0]);
    const last = parts.length > 1 ? firstCodePoint(parts[parts.length - 1]) : "";
    return (first + last || first || "?").toUpperCase();
  }
  const local = email.split("@")[0] ?? "";
  return ([...local].slice(0, 2).join("") || "?").toUpperCase();
}

function ageFromDob(iso?: string | null): number | null {
  if (!iso) return null;
  const dob = new Date(iso);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  // Guard nonsensical values (future / bad DOB) so the row falls back to "—"
  // like every other field, rather than rendering e.g. "-4 yrs".
  return age >= 0 && age < 150 ? age : null;
}
