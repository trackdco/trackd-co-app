-- ============================================================
--  profiles.tier column lock  (Spec 16 / Feature Specs/16 — tier-column-lock)
--  Migration: profiles_tier_lock
-- ============================================================
--
--  THE HOLE (verified live, 2026-07-03)
--    `authenticated` held a TABLE-LEVEL UPDATE grant on public.profiles
--    (api_role_grants line 67: "GRANT SELECT, INSERT, UPDATE ON profiles"), and the
--    owner UPDATE policy covers the whole row (WITH CHECK (auth.uid() = id)). A
--    table-level UPDATE grant carries every column, so any logged-in user could
--      PATCH /profiles?id=eq.<self>  { "tier": "paid" }
--    through the Data API and grant themselves Pro. Harmless TODAY (default is
--    already 'paid'), but the instant the default flips to 'free' and features gate
--    on tier, every user could self-upgrade for free. The Stripe webhook is MEANT to
--    be the column's only writer — this makes that an enforced fact, not a convention.
--
--  APPROACH A — column-level privilege (declarative; the spec's preferred).
--    Revoke the blanket UPDATE/INSERT from `authenticated` and re-grant it on EVERY
--    column EXCEPT `tier`. Postgres then rejects any UPDATE/INSERT whose column list
--    includes tier for that role — including an upsert's ON CONFLICT DO UPDATE SET
--    tier — with "permission denied for column tier", BEFORE RLS even runs. `tier`
--    is the ONLY service-only column on profiles (billing state lives in the separate
--    `subscriptions` table), so it is the only exclusion.
--
--    Chosen over Approach B (a BEFORE UPDATE trigger) because it is declarative,
--    enforced by the privilege system with no per-row trigger cost, and NOTHING in
--    the app writes tier as `authenticated` (every profiles .update() is
--    avatar / tos-gate / prefs / migration-flag / settings(sex·goal·units·height);
--    there is no client-side profiles INSERT) — so the lock breaks no legitimate path.
--
--  WHO CAN STILL WRITE tier
--    - service_role (the Stripe webhook, `sb_secret_` key): YES. It holds
--      GRANT ALL ON ALL TABLES (supabase/grants/002) and BYPASSes RLS; column grants
--      to `authenticated` don't touch it. `lib/stripe/sync.ts` writes
--      profiles.tier via createServiceRoleClient() — unchanged.
--    - handle_new_user (signup trigger, SECURITY DEFINER): YES. It runs as the
--      definer/owner, so these `authenticated` column grants don't constrain it; it
--      still sets tier (default) on new-profile creation.
--    - authenticated (a normal user): NO — for tier only. All other columns still
--      updatable (RLS still scopes to the owner).
--
--  ⚠️ MAINTENANCE NOTE (also recorded in Context/code-standards.md): because the
--     grant ENUMERATES columns, ANY new profiles column added later must be added to
--     BOTH lists below, or the Data API will reject writes to it (42501). New
--     service-only columns should be LEFT OUT (same treatment as tier).
--
--  Idempotent: REVOKE/GRANT are safe to re-run.
-- ============================================================

-- Drop the blanket UPDATE + INSERT that carried every column (incl. tier).
REVOKE UPDATE, INSERT ON public.profiles FROM authenticated;

-- Re-grant UPDATE on every column EXCEPT tier.
GRANT UPDATE (
  id, sex, date_of_birth, height_cm, weight_kg, body_fat_pct, goal,
  units_preference, timezone, acquisition_source, referral_code, is_18_plus,
  tos_accepted_at, tos_version, onboarding_completed_at, created_at, updated_at,
  avatar_path, protocol_migrated_at, notifications_enabled, pwa_installed_at,
  install_prompt_dismissed_at
) ON public.profiles TO authenticated;

-- Re-grant INSERT on every column EXCEPT tier (defense in depth: closes the
-- upsert / fresh-insert vector too, so tier can't be set on the way IN either).
GRANT INSERT (
  id, sex, date_of_birth, height_cm, weight_kg, body_fat_pct, goal,
  units_preference, timezone, acquisition_source, referral_code, is_18_plus,
  tos_accepted_at, tos_version, onboarding_completed_at, created_at, updated_at,
  avatar_path, protocol_migrated_at, notifications_enabled, pwa_installed_at,
  install_prompt_dismissed_at
) ON public.profiles TO authenticated;

-- SELECT is unchanged (users still read their own tier for the UI); DELETE stays
-- ungranted (no self-delete). service_role grants are untouched (see grants/002).
