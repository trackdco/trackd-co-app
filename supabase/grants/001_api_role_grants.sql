-- ============================================================
--  API role privileges (PostgREST roles: anon / authenticated)
--  Companion to trackd_schema_v0_4_2.sql, the storage policies, and the
--  legal-documents migration. Applied as migration `api_role_grants`.
--
--  WHY THIS EXISTS
--   RLS gates ROWS, but it only runs once PostgREST can reach the table at all.
--   Reaching a table needs a table-level GRANT to the API role. This project's
--   Supabase defaults do NOT auto-grant DML to anon/authenticated (they carry
--   only REFERENCES/TRIGGER/TRUNCATE), so before these GRANTs every Data API
--   read/write returned 42501 "permission denied for table …" — the app could
--   not read or write a single table, including the profiles UPDATE behind the
--   18+/ToS gate.
--
--   These GRANTs do not weaken the security model: RLS remains the ONLY
--   row-level gate ((SELECT auth.uid()) = …). The grants simply open the door so
--   RLS can do its job. Read-only catalogues stay read-only because they have no
--   write POLICY (RLS denies writes regardless of the grant).
--
--  ACCESS MODEL (see Context/architecture.md → "Auth and Access Model")
--   - legal_documents : public read (anon + authenticated). Shown pre-auth at
--     signup; writes stay service-role.
--   - compounds / biomarkers / markers / reference_ranges : authenticated read
--     only. No anon, no writes (no write policy ⇒ RLS denies writes).
--   - user-owned tables : authenticated full DML, every row gated by RLS. anon
--     gets nothing.
--   - profiles : authenticated SELECT/INSERT/UPDATE — no self-delete (no DELETE
--     policy; account deletion cascades from auth.users).
--   - v_inventory_math / v_biomarker_position : authenticated read. Both are
--     security_invoker, so they respect the caller's RLS on the base tables.
--
--  NB: this grants the EXISTING objects only. Any NEW public table added later
--  must include its own grants (or set ALTER DEFAULT PRIVILEGES once the
--  migration-applying role is confirmed). RLS on every table still applies.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Public-read legal documents (pre-auth signup display + the gate).
GRANT SELECT ON public.legal_documents TO anon, authenticated;

-- Read-only seed catalogues (authenticated read only).
GRANT SELECT ON
  public.compounds,
  public.biomarkers,
  public.markers,
  public.reference_ranges
TO authenticated;

-- User-owned data: authenticated full DML, RLS-scoped per row.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.cycles,
  public.protocol_compounds,
  public.inventory_items,
  public.dose_logs,
  public.lab_panels,
  public.biomarker_results,
  public.body_metrics,
  public.journal_entries,
  public.marker_readings,
  public.user_markers,
  public.notification_preferences,
  public.push_subscriptions
TO authenticated;

-- profiles: no self-delete (deletion cascades from auth.users).
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Computed views (security_invoker ⇒ respect the caller's RLS). Read-only.
GRANT SELECT ON public.v_inventory_math, public.v_biomarker_position TO authenticated;

-- Sequences (if any). uuid PKs use gen_random_uuid() (no sequence), but grant
-- defensively so any identity/serial column added later can be INSERTed into.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
