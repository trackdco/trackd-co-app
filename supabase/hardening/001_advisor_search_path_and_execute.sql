-- ============================================================
--  Supabase Advisor hardening — schema-level warnings
--  Migration: advisor_search_path_and_execute   (Spec 17 / Feature Specs/17)
-- ============================================================
--
--  Source: Supabase Advisor, 3 July 2026 — 0 errors, 12 warnings. This ONE
--  migration clears the schema-level ones: 5 functions with a mutable search_path,
--  and the 2 SECURITY DEFINER signup-trigger functions carrying EXECUTE to PUBLIC.
--  (Handled elsewhere, NOT here: leaked-password protection = an Auth dashboard
--  toggle; the waitlist "RLS Policy Always True" = spec 08.)
--
--  ── PART A — pin search_path on the 5 mutable-search_path functions ──
--  A function with a mutable search_path can be hijacked if an attacker pre-creates
--  a same-named object in an earlier-in-path schema. Pinning search_path closes it.
--  We use the GOLD STANDARD `= ''` on ALL FIVE, because each one is already safe
--  under an empty path (verified from the live bodies in §0):
--    - set_updated_at()          : body is just `NEW.updated_at = now()` — now() is
--                                  pg_catalog (always in scope), no unqualified refs.
--    - unit_family_compatible()  : pure enum comparison of its args to literals; no
--                                  object lookups at all.
--    - check_inventory_unit_family / check_protocol_unit_family /
--      check_dose_log_unit_family: every table + function + type is ALREADY
--                                  schema-qualified (public.inventory_items,
--                                  public.protocol_compounds, public.unit_family_compatible,
--                                  public.dose_unit), so `= ''` needs no body change.
--  So NO function body is rewritten and NO `pg_catalog, public` fallback is needed —
--  the linter's trap (empty path breaking an unqualified ref) does not apply here.
--  These 5 back the inventory / dose / updated_at integrity triggers, so each is
--  re-tested live after applying (an incompatible insert must still RAISE 23514).
--
--  ── PART B — revoke direct EXECUTE on the 2 SECURITY DEFINER trigger functions ──
--  handle_new_user + handle_new_profile_prefs run as the DEFINER (owner) and had
--  EXECUTE granted to PUBLIC — a SECURITY DEFINER function anyone can call directly
--  is a privilege-escalation surface. They are invoked by their triggers
--  (on_auth_user_created on auth.users → creates the profile → on_profile_created_prefs
--  → creates the prefs row), and trigger invocation does NOT check EXECUTE privilege,
--  so revoking direct EXECUTE does not touch the signup path. Their search_path is
--  already pinned to '' (unchanged here).
--
--  ── PART C — pg_net: NO ACTION ──
--  pg_net is IN USE (installed v0.20.3; the live `reminder-runner` pg_cron job calls
--  net.http_post → /api/notifications/run). So it is NOT dropped/moved here. Moving
--  it into a dedicated `extensions` schema is deferred to when Edge Functions land
--  (noted in Context/next-tasks.md).
--
--  Idempotent: ALTER … SET and REVOKE are safe to re-run.
-- ============================================================

-- ── Part A ─────────────────────────────────────────────────
ALTER FUNCTION public.set_updated_at()                                            SET search_path = '';
ALTER FUNCTION public.unit_family_compatible(public.dose_unit, public.dose_unit)  SET search_path = '';
ALTER FUNCTION public.check_inventory_unit_family()                               SET search_path = '';
ALTER FUNCTION public.check_protocol_unit_family()                                SET search_path = '';
ALTER FUNCTION public.check_dose_log_unit_family()                                SET search_path = '';

-- ── Part B ─────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.handle_new_user()          FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_profile_prefs() FROM public, anon, authenticated;
