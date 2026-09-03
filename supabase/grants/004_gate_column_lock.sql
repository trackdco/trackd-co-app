-- ============================================================
--  The 18+/ToS gate columns become service-only.
--  Spec w2b-15 cold-review repair. Migration: `gate_column_lock`
--
--  APPLIED. Verified against the LIVE database 2026-08-12 by running the attack,
--  not by trusting this line: with a real user JWT and only the publishable key,
--  PATCHing `is_18_plus`, `tos_accepted_at`, `tos_version`, `date_of_birth` and
--  all four together each returned 403 `42501`, while `sex` still returned 200.
--  All 23 `profiles` columns were then swept against the two lists below — 18
--  writable, 5 denied, no mismatch in either direction.
--
--  This header said "NOT YET APPLIED" for four days after it was applied, and
--  two sessions carried the work as outstanding. Verify against the live schema.
-- ============================================================
--
--  THE HOLE (reproduced live, 2026-08-08)
--    `grants/003` re-granted `authenticated` UPDATE on every `profiles` column
--    except `tier` — which includes `is_18_plus`, `tos_accepted_at`,
--    `tos_version` and `date_of_birth`. The owner UPDATE policy covers the whole
--    row. So one HTTP call with nothing but the PUBLISHABLE key:
--
--      PATCH /rest/v1/profiles?id=eq.<self>
--        { "is_18_plus": true, "tos_accepted_at": "…", "date_of_birth": "2015-01-01" }
--      -> 200
--
--    `passedGate` (`lib/auth.ts`) is exactly `is_18_plus AND tos_accepted_at`,
--    and it is the SOLE authorization on three separate controls:
--      - `app/onboarding/billing-actions.ts` — the payment path
--      - `app/onboarding/page.tsx`           — the paywall route guard
--      - `app/(app)/layout.tsx`              — the whole logged-in app
--
--    Measured on an account that had never seen `/welcome`: before the PATCH,
--    `/dashboard` 307'd and `startTrial` refused. After it, both succeeded and
--    the account finished with a `trialing` subscription and an ACTIVE `pro`
--    entitlement while `date_of_birth` said the user was ELEVEN, with zero rows
--    in `consent_records`.
--
--    Spec w2b-14 §3.2 ("the age gate precedes all substance-adjacent content and
--    all payment") and §17 ("no payment path bypasses the age gate") are both
--    false while a user can set the flag on themselves. The server-side age
--    checks in `app/welcome/actions.ts` and `passGateFromSession` are real and
--    both are simply walked around: nothing re-derives the flag from the date of
--    birth, and no constraint ties them together.
--
--    This predates the billing work — it has been true since `grants/003` — but
--    that spec promoted `passedGate` to the control on the PAYMENT path, which
--    is what turns a latent hole into a live one.
--
--  THE FIX — the same shape `tier` already uses
--    Column-level privileges. Postgres rejects an UPDATE or INSERT whose column
--    list includes an ungranted column for that role, with "permission denied
--    for column", BEFORE RLS runs. Declarative, no per-row trigger, and it
--    cannot be forgotten in a policy.
--
--  WHO CAN STILL WRITE THE GATE
--    - `service_role`: YES (GRANT ALL, `grants/002`, and it bypasses RLS). The
--      two legitimate writers move onto it — see the code note below.
--    - `handle_new_user` (SECURITY DEFINER signup trigger): YES, unaffected.
--    - `authenticated`: NO. Every other profile column is untouched.
--
--  ⚠️ CODE THAT MUST MOVE IN THE SAME CHANGE, or the gate can never be passed:
--      - `app/welcome/actions.ts`      (the 18+/ToS interstitial)
--      - `passGateFromSession` in `app/onboarding/actions.ts` (the claim)
--    Both write these columns as the user today and must write them with the
--    service-role client instead, AFTER their own server-side age check. Both
--    already do that check; what changes is only who executes the write.
--
--  ⚠️ MAINTENANCE, same as `grants/003`: the grant ENUMERATES columns, so ANY new
--     `profiles` column must be added to BOTH lists below or the Data API 42501s
--     on it. Leave service-only columns OUT.
--
--  Idempotent: REVOKE/GRANT are safe to re-run.
-- ============================================================

revoke update, insert on public.profiles from authenticated;

-- Everything except `tier` (grants/003) AND the four gate columns.
grant update (
  id, sex, height_cm, weight_kg, body_fat_pct, goal,
  units_preference, timezone, acquisition_source, referral_code,
  onboarding_completed_at, created_at, updated_at,
  avatar_path, protocol_migrated_at, notifications_enabled, pwa_installed_at,
  install_prompt_dismissed_at, display_name
) on public.profiles to authenticated;

grant insert (
  id, sex, height_cm, weight_kg, body_fat_pct, goal,
  units_preference, timezone, acquisition_source, referral_code,
  onboarding_completed_at, created_at, updated_at,
  avatar_path, protocol_migrated_at, notifications_enabled, pwa_installed_at,
  install_prompt_dismissed_at, display_name
) on public.profiles to authenticated;

-- SELECT is unchanged — a user still reads their own gate state for the UI.
-- DELETE stays ungranted. `service_role` is untouched.
--
-- NOTE: `date_of_birth` is in neither list, so it is service-only too. It is the
-- EVIDENCE for `is_18_plus`; leaving it writable would let someone set a
-- compliant flag and then edit the date it is supposed to rest on, which is the
-- same hole one step removed. The Profile screen never edits it — `PhysicalCard`
-- renders age as read-only, derived from this column — so nothing legitimate
-- loses a write.
