-- Signup attribution — "where did you hear about us", including the typed
-- answer under "Someone else" (Adrian, 2026-08-01).
--
-- WHY A TABLE AND NOT A COLUMN ON `profiles`:
--   `code-standards.md` requires every new `profiles` column to be added to
--   BOTH column-level grant lists in a new `supabase/grants/00N_*` migration
--   (the Spec 16 tier lock), or the Data API 42501s on every write to that
--   column. Two columns here would be two more entries in a list that has
--   already bitten this project. A dedicated table carries its own grants and
--   its own RLS, exactly as `consent_records` does.
--
-- ONE ROW PER USER, last answer wins. This is not an audit log: the user
-- answers once, and a second answer is a correction rather than a new fact.
--
-- NOT YET APPLIED. Adrian applies migrations by hand (the Supabase MCP is not
-- authorised in the agent session). Nothing in the app writes this table yet
-- either — attribution is captured on the anonymous device session and there is
-- no account to attach it to until auth is wired at the paywall
-- (`startTrial()` in `components/onboarding/screens/paywall.tsx`).

create table if not exists public.signup_attribution (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  -- Mirrors `ATTRIBUTION_TAGS` in `lib/onboarding/session.ts`. Constrained at
  -- the database rather than in TypeScript alone, per Invariant 5.
  source text not null
    check (source in ('instagram', 'tiktok', 'mate', 'community', 'elsewhere')),

  -- The free text typed under the catch-all. NULL for every other source.
  -- The length cap matches `ATTRIBUTION_DETAIL_MAX` (80), so a value the client
  -- accepts can never be rejected here.
  detail text
    check (detail is null or char_length(detail) between 1 and 80),

  -- A creator code is a STRONGER attribution than a self-reported one (spec
  -- §4), so it is recorded beside the answer rather than instead of it.
  affiliate_code text
    check (affiliate_code is null or char_length(affiliate_code) between 1 and 32),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Detail only belongs to the catch-all. Without this a client bug could file
-- free text under "Instagram", which is the one thing that would make the
-- aggregate lie.
alter table public.signup_attribution
  drop constraint if exists signup_attribution_detail_scope;
alter table public.signup_attribution
  add constraint signup_attribution_detail_scope
  check (detail is null or source = 'elsewhere');

create index if not exists signup_attribution_source_idx
  on public.signup_attribution (source);

alter table public.signup_attribution enable row level security;

-- House pattern: the identity call is wrapped so the planner caches it.
drop policy if exists "own signup_attribution - select" on public.signup_attribution;
create policy "own signup_attribution - select"
  on public.signup_attribution for select
  using ((select auth.uid()) = user_id);

drop policy if exists "own signup_attribution - insert" on public.signup_attribution;
create policy "own signup_attribution - insert"
  on public.signup_attribution for insert
  with check ((select auth.uid()) = user_id);

drop policy if exists "own signup_attribution - update" on public.signup_attribution;
create policy "own signup_attribution - update"
  on public.signup_attribution for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- No delete policy: a user removing their own attribution has no product
-- meaning, and account deletion is handled by the FK cascade.

-- RLS gates rows; a table-level GRANT is what lets the API role reach the table
-- at all. This project does not auto-grant, and a table shipped without these
-- 42501s on first use (`supabase/blocks/001` shipped without them and would
-- have broken Blocks on merge).
grant select, insert, update on public.signup_attribution to authenticated;

-- Keeps `updated_at` honest on a corrected answer. `set_updated_at` already
-- exists and already pins `search_path = ''` (Spec 17 hardening).
drop trigger if exists set_signup_attribution_updated_at on public.signup_attribution;
create trigger set_signup_attribution_updated_at
  before update on public.signup_attribution
  for each row execute function public.set_updated_at();

-- READING IT BACK is deliberately NOT solved here, and needs Adrian's call.
-- Two options, and they are not equivalent:
--   (a) Service role, through `lib/db/adminMetrics.ts`. No new policy, no
--       founder emails duplicated into SQL. But that file's rule is "nothing in
--       it may RETURN a row", and the typed answers are exactly the rows you
--       want to read, so the rule would have to be narrowed on purpose.
--   (b) A founder-only SELECT policy, like `waitlist` has. Reads normally, but
--       adds a THIRD place the founder email list is hardcoded, which
--       `architecture.md` already flags as a maintenance hazard.
