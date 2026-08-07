-- ============================================================
--  signup_intake — the anonymous onboarding answers, claimed onto an account.
--  Spec w2b-14 (Account creation before the paywall), step 4.
--  Migration name: `signup_intake`
--
--  NOT YET APPLIED. Verify against the live schema, never against this comment
--  (`supabase/onboarding/001`'s header sat stale for weeks saying the opposite).
-- ============================================================
--
--  WHAT THIS IS FOR
--    The whole pre-paywall half of onboarding runs with no account, so the
--    answers live in ONE localStorage key (`trackd.onboarding.v1`,
--    `lib/onboarding/session.ts`). Spec w2b-14 adds an account screen before
--    the paywall, and the moment auth succeeds those answers have somewhere to
--    go. This is that somewhere — for the ones with no home already:
--
--      dob / sex / consent  -> profiles + consent_records  (the 18+/ToS gate)
--      attribution          -> signup_attribution          (asked post-paywall)
--      name / running / struggle / struggle_detail / affiliate_code -> HERE
--
--  WHY A TABLE AND NOT COLUMNS ON `profiles`
--    Identical reasoning to `signup_attribution` (see 001): every new `profiles`
--    column must be added to BOTH column-level grant lists in a new
--    `supabase/grants/00N_*` migration (the Spec 16 tier lock) or the Data API
--    42501s on every write to it. Five columns would be five more entries in a
--    list that has already bitten this project. A dedicated table carries its
--    own grants and its own RLS.
--
--  APPEND-ONLY, AND THAT IS THE FEATURE
--    Only SELECT + INSERT are granted and policied. No UPDATE, no DELETE.
--    Spec §Edge cases: "User already has an account and signs in on the account
--    screen: their existing data wins. Do NOT overwrite an existing user's saved
--    protocol with a fresh set of onboarding answers." With `user_id` as the
--    PRIMARY KEY and no UPDATE grant, a second claim can only ever fail with
--    23505 — which the app reads as "already claimed, discard the local set".
--    That makes "existing data wins" a fact the database enforces rather than a
--    branch in TypeScript that a later refactor can drop. Same shape as
--    `consent_records`, for the same reason.
--
--  EVERY CAP AND EVERY MEMBERSHIP TEST MATCHES THE CLIENT
--    A value `normaliseSession` accepts must never be rejected here, and a value
--    it cannot produce must never be storable. The tag lists mirror
--    `RUNNING_TAGS` and `STRUGGLE_TAGS`; 24 mirrors the `name` slice and
--    `normaliseCode`; 80 mirrors `DETAIL_MAX`. Constrained at the database
--    rather than in TypeScript alone, per Invariant 5.
-- ============================================================

create table if not exists public.signup_intake (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  -- What to call them. Asked on the first housekeeping screen and used by the
  -- post-paywall Welcome screen ("You're in, <name>!"). `profiles` has no name
  -- column at all, so without this the name is lost the moment the anonymous
  -- session is cleared.
  name text
    check (name is null or char_length(name) between 1 and 24),

  -- Mirrors `RUNNING_TAGS` in `lib/onboarding/session.ts`. `<@` is containment:
  -- every element must be a known tag. `off_season` is RETIRED as an option and
  -- kept as a tag — devices that already answered it still hold it, and a tag is
  -- removed from the OFFER, never from the PARSER.
  running text[] not null default '{}'
    check (running <@ array[
      'comp_prep','off_season','trt','peptides','first_cycle','blast_cruise',
      'health','nothing'
    ]::text[]),

  -- Mirrors `STRUGGLE_TAGS`.
  struggle text[] not null default '{}'
    check (struggle <@ array[
      'whats_left','recon_maths','last_site','notes_app','too_much','no_history',
      'took_today','cant_compare','other'
    ]::text[]),

  -- The free text typed under "Something else". The single most useful field in
  -- the flow for deciding what to build next, because it is the only one the
  -- user writes themselves.
  struggle_detail text
    check (struggle_detail is null or char_length(struggle_detail) between 1 and 80),

  -- The creator code captured from `?code=` on first load. It is captured
  -- BEFORE the account exists, so it is claimed here with the rest of the
  -- session rather than waiting for the post-paywall attribution screen — a
  -- user who abandons after the paywall would otherwise take the one piece of
  -- hard attribution we have with them. `signup_attribution.affiliate_code`
  -- still exists and is still written by that screen; this is the earlier,
  -- always-present copy, not a replacement.
  affiliate_code text
    check (affiliate_code is null or char_length(affiliate_code) between 1 and 24),

  created_at timestamptz not null default now()
);

-- Detail only belongs to the catch-all, exactly as
-- `signup_attribution_detail_scope` enforces for its own field. Without it a
-- client bug could file free text against an answer that never asked for one,
-- which is the one thing that would make the aggregate lie.
alter table public.signup_intake
  drop constraint if exists signup_intake_detail_scope;
alter table public.signup_intake
  add constraint signup_intake_detail_scope
  check (struggle_detail is null or 'other' = any (struggle));

alter table public.signup_intake enable row level security;

-- House pattern: the identity call is wrapped so the planner caches it.
drop policy if exists "own signup_intake - select" on public.signup_intake;
create policy "own signup_intake - select"
  on public.signup_intake for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own signup_intake - insert" on public.signup_intake;
create policy "own signup_intake - insert"
  on public.signup_intake for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- NO update policy and NO delete policy, deliberately. See "APPEND-ONLY" above.
-- Account deletion is handled by the FK cascade.

-- RLS gates rows; a table-level GRANT is what lets the API role reach the table
-- at all. This project does not auto-grant, and a table shipped without these
-- 42501s on first use (`supabase/blocks/001` shipped without them and would
-- have broken Blocks on merge).
grant select, insert on public.signup_intake to authenticated;
