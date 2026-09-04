-- ============================================================
--  FORCE ROW LEVEL SECURITY on every public table.
--
--  ⚠️ WRITTEN, NOT RUN. Hand-applied by Adrian. (Audit, 2026-09-03.)
--
--  ⚠️ READ THIS BEFORE APPLYING IT: THIS CHANGES NOTHING TODAY, AND THE
--  HONEST CASE FOR IT IS WEAKER THAN THE NAME SUGGESTS.
--
--  ── WHAT FORCE ACTUALLY DOES ────────────────────────────────────────────
--  `ENABLE ROW LEVEL SECURITY` exempts the table OWNER. `FORCE` removes that
--  exemption so the owner is subject to its own policies too. It does NOT
--  affect a role holding the BYPASSRLS attribute — BYPASSRLS is checked first
--  and wins.
--
--  ── SO WHAT WOULD BREAK: NOTHING, AND HERE IS THE MEASUREMENT ───────────
--  Read from production `pg_roles` rather than assumed:
--
--      rolname          rolbypassrls
--      service_role     TRUE      <- every server path in this app
--      postgres         TRUE      <- owns all 44 public tables and views
--      authenticated    false     <- already fully subject to RLS
--      anon             false     <- already fully subject to RLS
--
--  Every service-role path is therefore UNAFFECTED: `lib/billing/service.ts`,
--  `lib/db/admin/core.ts`, `lib/storage/sweep.ts`, the three route handlers
--  (`api/stripe/webhook`, `api/billing/beta-grace`, `api/notifications/run`),
--  `lib/billing/reconcile/*` and `supabase/functions/send-push`. They connect
--  as `service_role`, which bypasses RLS by role attribute, not by ownership.
--
--  And the owner is `postgres`, which ALSO holds BYPASSRLS. So forcing RLS on
--  tables whose owner bypasses RLS anyway is, today, a no-op in both
--  directions: it breaks nothing and it prevents nothing.
--
--  ── THEN WHY APPLY IT ───────────────────────────────────────────────────
--  Because the no-op is a property of the CURRENT role setup, not of the
--  schema. The exemption it closes is the one that opens the moment anything
--  connects as an owner without BYPASSRLS: a migration tool run under a
--  dedicated owner role, a future `supabase_admin`-owned table, a local
--  restore, a psql session as a non-bypassing owner. In each of those a
--  SELECT would silently return every user's rows.
--
--  ⚠️ THIS IS DEFENCE IN DEPTH AND MUST NOT BE RECORDED AS A FIX. Nothing was
--  reachable before it and nothing becomes unreachable after it. If it is
--  applied it should be applied for the reason above, not because an audit
--  listed it — an audit item ticked for its own sake is how a project ends up
--  believing it is protected by a line that protects nothing.
--
--  ── THE ONE REAL RISK OF APPLYING IT ────────────────────────────────────
--  If BYPASSRLS were ever removed from `service_role` (a Supabase platform
--  change, or a hand edit), this migration is what turns that from a partial
--  failure into a total one: every service-role read would start returning
--  zero rows rather than erroring. Zero rows is the dangerous shape, because
--  `absent is not unknown` is violated silently — the webhook would attribute
--  nothing, the reconcile would find nothing to fix, and the sweep would report
--  buckets it could not see as empty. That is the scenario to watch, and it is
--  the reason the verify block below counts rows rather than checking for an
--  error.
-- ============================================================

ALTER TABLE public.profiles                     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cycles                       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_compounds           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.protocol_compound_schedules  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.compound_pauses              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.dose_logs                    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.one_off_logs                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_dose_logs               FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_compounds        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_stack_compounds         FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stacks                       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.stack_members                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.blocks                       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.block_targets                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.body_metrics                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.weight_logs                  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.lab_panels                   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.biomarker_results            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.marker_readings              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_markers                 FORCE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.journal_attachments          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.progress_photos              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.signup_intake                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.signup_attribution           FORCE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist                     FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_customers            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions                FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements                 FORCE ROW LEVEL SECURITY;

-- ⚠️ `webhook_events` IS DELIBERATELY INCLUDED AND IT IS THE ONE TO WATCH.
-- It has RLS enabled and ZERO policies, so forcing it means the owner gets the
-- same answer everyone else gets: nothing. That is correct — the only writer is
-- `api/stripe/webhook/route.ts` as `service_role`, which bypasses. But it is
-- also the table where a lost BYPASSRLS would be least visible, because a
-- webhook that writes nothing still returns 200 to Stripe.
ALTER TABLE public.webhook_events               FORCE ROW LEVEL SECURITY;

-- ⚠️ THE SIX READ-ONLY CATALOGUES ARE DELIBERATELY OMITTED.
--   compounds · markers · biomarkers · reference_ranges · injection_sites
--   legal_documents
-- Each carries one `USING (true)` SELECT policy and holds no user data. Forcing
-- them would make the owner subject to a policy that permits everything, which
-- changes nothing, while adding six lines somebody later has to reason about.
-- They are named here so their absence reads as a decision rather than an
-- oversight.


-- ============================================================
--  VERIFY — after applying. Two checks, and the SECOND is the important one.
-- ============================================================
--  1. The flag actually landed on all 35:
--
-- select count(*) filter (where relforcerowsecurity) as forced,      -- expect 35
--        count(*) filter (where not relforcerowsecurity) as not_forced -- expect 6 (the catalogues)
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r';
--
--  2. ⚠️ THE SERVICE ROLE STILL SEES ROWS. This is what proves the change was
--  the no-op it is supposed to be. Counting rows, NOT checking for an error,
--  because the failure mode is zero rows returned successfully:
--
-- select (select count(*) from public.profiles)     as profiles,      -- expect 100
--        (select count(*) from public.entitlements) as entitlements,  -- expect 88
--        (select count(*) from public.dose_logs)    as dose_logs;     -- expect > 0
--
--  ⚠️ IF ANY OF THOSE COMES BACK 0, `service_role` HAS LOST BYPASSRLS AND THIS
--  MIGRATION MUST BE ROLLED BACK IMMEDIATELY. Every server path in the product
--  is reading through that role.
--
--  ROLLBACK:
--    ALTER TABLE public.<name> NO FORCE ROW LEVEL SECURITY;   -- one per table
