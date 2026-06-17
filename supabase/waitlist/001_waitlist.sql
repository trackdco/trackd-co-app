-- ============================================================
--  Waitlist — public pre-launch email capture
--
--  New public table, so it ships its own RLS + GRANTs (per the api_role_grants
--  migration's rule: every new public table must, or it 42501s on the Data API).
--
--  ACCESS MODEL
--   - Anyone (anon + authenticated) may INSERT their email — it's a public
--     sign-up form.
--   - NOBODY can SELECT/UPDATE/DELETE through the API: there is no such policy
--     and no such grant, so RLS denies them and the email list can't be read or
--     enumerated by visitors. Admin reads the list via the dashboard / a
--     service-role key (which bypasses RLS).
--   RLS stays the only row-level gate; the GRANT just opens the INSERT door.
-- ============================================================

create table if not exists public.waitlist (
  id          uuid        primary key default gen_random_uuid(),
  email       text        not null,
  source      text,                       -- ?ref= channel attribution (nullable)
  created_at  timestamptz not null default now(),
  constraint waitlist_email_len  check (char_length(email) between 3 and 254),
  constraint waitlist_source_len check (source is null or char_length(source) <= 120)
);

-- Case-insensitive dedupe: one row per email regardless of casing. A repeat
-- sign-up hits this and the app treats the unique violation as success.
create unique index if not exists waitlist_email_lower_idx
  on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- Public may INSERT only. (No SELECT/UPDATE/DELETE policy ⇒ RLS denies them.)
drop policy if exists "waitlist public insert" on public.waitlist;
create policy "waitlist public insert"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- Open the door for INSERT only — RLS is still the gate. Deliberately NO SELECT.
grant insert on public.waitlist to anon, authenticated;
