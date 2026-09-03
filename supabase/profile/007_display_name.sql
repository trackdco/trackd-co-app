-- Migration: display_name
--
-- What the app CALLS you, as opposed to who the account belongs to.
--
--  THE SPLIT THIS EXISTS TO FIX
--    Onboarding asks "What's your name?" on its first screen and claims the
--    answer to `signup_intake.name`. That answer was then used on exactly ONE
--    screen (the post-paywall welcome) and never again: Home's greeting and the
--    Profile heading both read Google's `user_metadata.full_name`, so we asked a
--    question, used it once, and ignored it forever. A Google account with no
--    name on it fell all the way through to the EMAIL LOCAL-PART, which is how
--    "Hello, adrianschimizzi1" reached a home screen.
--
--  WHY NOT JUST READ `signup_intake.name`
--    Because it must stay editable, and that table is deliberately append-only
--    (`onboarding/002` — no UPDATE policy, no DELETE policy, no update grant).
--    It is the RECORD OF WHAT THEY ANSWERED AT SIGNUP, which is an intake asset;
--    a row Profile can rewrite is no longer a record of anything. So the live,
--    user-editable value gets its own column and the intake row keeps the raw
--    answer untouched.
--
--  FIRST TOKEN ONLY, ENFORCED ON WRITE (Adrian, 2026-09-03)
--    The onboarding field says "First name", but a placeholder is not a
--    constraint and people type their full name into it. Sliced on WRITE rather
--    than at render: slicing at render would show "Adrian Schimizzi" in the edit
--    field while Home said "Adrian", and that visible mismatch is the thing that
--    actually looks broken. `signup_intake.name` still holds the whole string.
--
--  24 MIRRORS `signup_intake.name` AND `NAME_MAX` in `lib/onboarding/session.ts`.
--    Same cap, same normaliser (`normaliseName`), enforced at the database per
--    Invariant 5 rather than in TypeScript alone.

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  drop constraint if exists profiles_display_name_len;
alter table public.profiles
  add constraint profiles_display_name_len
  check (display_name is null or char_length(display_name) between 1 and 24);

-- ⚠️ THE GRANT IS NOT AUTOMATIC. `grants/004` ENUMERATES columns, so a new
-- `profiles` column is unreachable through the Data API (42501) until it is
-- named. Column-level grants are additive, so this adds the one column here AND
-- `grants/004`'s two lists are updated in the same change, or a re-run of that
-- file would revoke it again. SELECT is table-level and needs nothing.
grant update (display_name) on public.profiles to authenticated;
grant insert (display_name) on public.profiles to authenticated;

-- Backfill: every account that came through onboarding already answered this.
-- Only where the profile has none, so this is safe to re-run and can never
-- overwrite a name someone has since edited. `regexp_split_to_array` on `\s+`
-- rather than `split_part(… , ' ', 1)`, which returns an empty string for a
-- name typed with a leading space or separated by a tab.
update public.profiles p
set display_name = nullif((regexp_split_to_array(btrim(si.name), '\s+'))[1], '')
from public.signup_intake si
where si.user_id = p.id
  and p.display_name is null
  and si.name is not null
  and btrim(si.name) <> '';
