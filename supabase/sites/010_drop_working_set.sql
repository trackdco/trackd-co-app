-- 010_drop_working_set.sql
-- Spec 19 as-built: the per-user "working set" mechanic was dropped mid-build. Every
-- catalogue site is now pickable when you log a dose (on the compound's own route),
-- so there is no membership list to maintain. The `user_injection_sites` table
-- (created in 003, backfilled in 004/006) is unused by all app code — nothing in
-- lib/components/app references it.
--
-- Drop it so no orphaned, user-owned table lingers in the schema. Idempotent and
-- safe: CASCADE removes its RLS policies + grants; no other object depends on it
-- (logged injection history lives in dose_logs.injection_site, untouched — Invariant 8).

drop table if exists public.user_injection_sites cascade;
