-- ============================================================
--  TRACKD CO — DEVICE STATE SYNC  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Cloud backup for the three interim device-local stores so a
--  user's protocol survives a PWA delete/reinstall (which wipes the
--  installed app's localStorage). These mirror, row-per-entity, the
--  client stores:
--    - user_stack_compounds   <- trackd.stack.v2.<uid>        (lib/home/stack.ts)
--    - user_dose_logs         <- trackd.doselog.v1.<uid>      (lib/home/doseLog.ts)
--    - user_custom_compounds  <- trackd.customCompounds.<uid> (components/navigation/add-to-stack-menu.tsx)
--
--  INTERIM: each row carries the verbatim client object in a jsonb
--  `data` payload, so there is zero client<->DB translation (the
--  app's existing read-normalisers harden the shape). This is NOT
--  the normalised cycles/protocol_compounds/inventory model — that
--  remains the future end-state. localStorage stays the device cache
--  the UI reads synchronously; these tables are the durable source
--  keyed to auth.uid() and hydrated into localStorage on load.
--
--  House patterns: RLS keyed on (SELECT auth.uid()) = profile_id;
--  explicit PostgREST grants (this project does NOT auto-grant DML
--  to the API roles — see architecture.md → Auth and Access Model);
--  set_updated_at trigger (function defined in trackd_schema_v0_4_2).
--
--  compound_id is TEXT, not a uuid FK to compounds: custom-compound
--  ids can be the non-UUID `c_...` fallback (insecure-context
--  newId()), and stack ids are client-generated.
-- ============================================================

-- ---------------------------------------------------------------
--  user_stack_compounds — one row per StackCompound in the stack
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_stack_compounds (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    compound_id text NOT NULL,
    data        jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_stack_compounds_unique UNIQUE (profile_id, compound_id)
);
ALTER TABLE user_stack_compounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_stack_compounds - all" ON user_stack_compounds FOR ALL
    USING ((SELECT auth.uid()) = profile_id)
    WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE TRIGGER user_stack_compounds_updated_at BEFORE UPDATE ON user_stack_compounds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_user_stack_compounds_profile
    ON user_stack_compounds (profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_stack_compounds TO authenticated;

-- ---------------------------------------------------------------
--  user_dose_logs — one row per logged dose (date + compound)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_dose_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    logged_on   date NOT NULL,
    compound_id text NOT NULL,
    data        jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_dose_logs_unique UNIQUE (profile_id, logged_on, compound_id)
);
ALTER TABLE user_dose_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_dose_logs - all" ON user_dose_logs FOR ALL
    USING ((SELECT auth.uid()) = profile_id)
    WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE TRIGGER user_dose_logs_updated_at BEFORE UPDATE ON user_dose_logs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
-- History reads scan a user's logs in date order.
CREATE INDEX IF NOT EXISTS idx_user_dose_logs_profile
    ON user_dose_logs (profile_id, logged_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_dose_logs TO authenticated;

-- ---------------------------------------------------------------
--  user_custom_compounds — one row per "Make your own" compound
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_custom_compounds (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    compound_id text NOT NULL,
    data        jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_custom_compounds_unique UNIQUE (profile_id, compound_id)
);
ALTER TABLE user_custom_compounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user_custom_compounds - all" ON user_custom_compounds FOR ALL
    USING ((SELECT auth.uid()) = profile_id)
    WITH CHECK ((SELECT auth.uid()) = profile_id);
CREATE TRIGGER user_custom_compounds_updated_at BEFORE UPDATE ON user_custom_compounds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX IF NOT EXISTS idx_user_custom_compounds_profile
    ON user_custom_compounds (profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON user_custom_compounds TO authenticated;
