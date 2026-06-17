-- ============================================================
--  Protocol Cutover — Step 2 schema delta: rotation plan
--  Migration: protocol_compound_rotation
-- ============================================================
-- The interim device-local `StackCompound` (lib/home/stack.ts) carried the
-- injection-site rotation as `rotationSites` (the user's ordered site list — the
-- order IS the cycle order) + `rotationIndex` (the pointer to the NEXT site,
-- advanced only by logging a dose). The canonical schema
-- (trackd_schema_v0_4_2.sql) modelled dose + schedule but had nowhere to store
-- this plan, so cutting Home over to `protocol_compounds` would have dropped a
-- signature feature. This adds it.
--
-- Additive + safe (the model tables are empty at apply time). dose_logs keeps the
-- coarse `injection_site` enum for per-dose history; the granular ordered plan
-- lives here as text[] of the local site ids (lib/home/siteCatalog.ts), so it
-- syncs to the cloud and survives a PWA reinstall.
--
-- Table-level grants already cover new columns (protocol_compounds grants full
-- DML to `authenticated` in supabase/grants/001_api_role_grants.sql); RLS is
-- unchanged. No new grant or policy needed.

ALTER TABLE protocol_compounds
  ADD COLUMN IF NOT EXISTS rotation_sites text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rotation_index smallint NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rotation_index_nonneg'
      AND conrelid = 'protocol_compounds'::regclass
  ) THEN
    ALTER TABLE protocol_compounds
      ADD CONSTRAINT rotation_index_nonneg CHECK (rotation_index >= 0);
  END IF;
END $$;
