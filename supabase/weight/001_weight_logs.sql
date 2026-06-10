-- ============================================================
--  TRACKD CO — WEIGHT LOGS  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  The dedicated bodyweight-tracking table for the Weight view
--  (Context/Feature Specs/08-Home-page-fixes-v1.md → C). Distinct
--  from profiles.weight_kg (the onboarding "Starting weight"
--  snapshot, numeric(5,1)) and from body_metrics (broader body
--  composition; superseded for weight tracking by this table).
--
--  Owned per-user, one entry per day, last write wins. Bodyweight
--  only — no body composition. Stored unit is kilograms; imperial
--  is a display/entry preference (converted in the app).
--
--  House patterns: RLS keyed on (SELECT auth.uid()); explicit
--  PostgREST grants (this project does NOT auto-grant DML to the
--  API roles — see architecture.md → Auth and Access Model).
-- ============================================================

CREATE TABLE IF NOT EXISTS weight_logs (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    weight      numeric(5,2) NOT NULL,
    logged_for  date NOT NULL DEFAULT current_date,
    created_at  timestamptz NOT NULL DEFAULT now(),

    -- Generous-but-realistic guardrail; mirrors profiles/body_metrics (30–300 kg).
    CONSTRAINT weight_logs_weight_sane CHECK (weight >= 30 AND weight <= 300),
    -- One entry per day; the app upserts on this so re-logging a day overwrites it.
    CONSTRAINT weight_logs_one_per_day UNIQUE (profile_id, logged_for)
);

ALTER TABLE weight_logs ENABLE ROW LEVEL SECURITY;

-- Owner-scoped: a user can only ever see/write their own rows. Wrapped
-- (SELECT auth.uid()) so the planner caches it once per statement.
CREATE POLICY "own weight_logs - all" ON weight_logs FOR ALL
    USING ((SELECT auth.uid()) = profile_id)
    WITH CHECK ((SELECT auth.uid()) = profile_id);

-- Trend reads scan a user's history in date order.
CREATE INDEX IF NOT EXISTS idx_weight_logs_trend
    ON weight_logs (profile_id, logged_for);

-- RLS gates rows; this GRANT opens the table to the Data API. Without it the
-- API role 42501s before RLS ever runs (see architecture.md).
GRANT SELECT, INSERT, UPDATE, DELETE ON weight_logs TO authenticated;
