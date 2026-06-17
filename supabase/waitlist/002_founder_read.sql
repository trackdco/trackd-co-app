-- ============================================================
--  Founder-only read access to the waitlist (for the in-app /admin dashboard).
--
--  The base table (001_waitlist.sql) is INSERT-only for everyone — nobody can
--  read it. This adds SELECT for the TWO founder accounts ONLY:
--    - anon still cannot read (no anon SELECT grant) — the public list stays private.
--    - other authenticated users match no rows (the policy's USING is false for
--      them), so they get an empty result, never the list.
--  KEEP THE EMAIL LIST IN SYNC with lib/admin.ts (FOUNDER_EMAILS).
-- ============================================================

-- 1) Let founder sessions SELECT the waitlist rows.
grant select on public.waitlist to authenticated;

drop policy if exists "waitlist founder read" on public.waitlist;
create policy "waitlist founder read"
  on public.waitlist
  for select
  to authenticated
  using ( lower(auth.jwt() ->> 'email') in ('admin@trackdco.app', 'adrianschimizzi1@gmail.com') );

-- 2) Aggregated counts per channel. security_invoker => the view runs as the
--    caller and inherits the RLS above, so only founders get real numbers
--    (everyone else aggregates over zero visible rows). Accurate at any size.
create or replace view public.v_waitlist_by_source
  with (security_invoker = true) as
  select coalesce(nullif(btrim(source), ''), '(direct)') as source,
         count(*)::int as signups
  from public.waitlist
  group by 1;

grant select on public.v_waitlist_by_source to authenticated;
