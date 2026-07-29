-- ============================================================================
-- 005 — protocol_compound_schedules  (Spec 01 · Dose & Schedule Integrity)
-- ============================================================================
-- Schedule VERSIONING. Until now a `protocol_compounds` row held ONE dose +
-- schedule, mutated in place on every edit — so "what was due on 12 June" was
-- always answered with today's rule. Changing a cadence in August retroactively
-- rewrote every past day: a Tuesday the user correctly rested could turn into a
-- missed dose because of a decision made two months later.
--
-- A schedule is a RULE and a logged dose is an EVENT. Editing intent must never
-- mutate history. This table records each version of the rule with the day it
-- took effect, so resolving a past date means finding the version active then.
--
-- STRICTLY ADDITIVE. No existing row is altered, moved or deleted, and no
-- backfill is performed: a compound with no rows here resolves to its
-- `protocol_compounds` values exactly as before, which is correct — its schedule
-- has never been changed, so one version is the whole truth. Versions are
-- written from the first edit onwards (the client seeds a baseline from the
-- OUTGOING values at that point, so the days before the edit keep the old rule).
--
-- Cascades from `protocol_compounds`, so it inherits the existing lifecycle:
-- deleting a compound takes its versions with it, and nothing here can outlive
-- the compound it describes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_compound_schedules (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    protocol_compound_id uuid NOT NULL REFERENCES protocol_compounds(id) ON DELETE CASCADE,

    -- The day this version takes effect. It governs every day >= this, up to the
    -- next version's effective_from. A date (not a timestamp): the whole model
    -- resolves "was it due on this DAY", and a time here would invite a
    -- mid-day boundary that no screen could express.
    effective_from       date NOT NULL,

    -- The dose + schedule as they were under this version. Mirrors the
    -- corresponding columns on `protocol_compounds` so the mapping is 1:1 and no
    -- translation layer can drift.
    dose_amount          numeric(10,3) NOT NULL,
    dose_unit            dose_unit NOT NULL,
    schedule_type        schedule_type NOT NULL DEFAULT 'every_day',
    days_of_week         smallint[],
    interval_days        smallint,
    -- One element, possibly NULL — NULL is the stored "no dose time set" state
    -- (see `stackCompoundToProtocolInsert`). Same convention as
    -- `protocol_compounds.dose_times`, deliberately, so neither can mean
    -- something different from the other.
    dose_times           time[] NOT NULL DEFAULT '{09:00}',

    -- This version records a STOP rather than a rule: the compound was DELETED on
    -- `effective_from` and dosed nothing until a later version resumes it
    -- (Spec 02 → the gap). Without it, deleting and re-adding a compound leaves
    -- the days in between governed by the rule in force before the delete, so a
    -- break the user chose to take reads back as a run of missed doses. The
    -- dose/schedule columns above are still populated so the row round-trips, but
    -- nothing reads them while this is true.
    stopped              boolean NOT NULL DEFAULT false,

    created_at           timestamptz NOT NULL DEFAULT now(),

    -- One version per compound per day. Re-editing on the same day REPLACES that
    -- day's version rather than stacking duplicates, which the client relies on
    -- (it upserts on this pair).
    CONSTRAINT protocol_compound_schedules_unique UNIQUE (protocol_compound_id, effective_from),
    CONSTRAINT schedule_version_dose_positive CHECK (dose_amount > 0),
    -- Same schedule-integrity rules as protocol_compounds: the supporting column
    -- for the chosen type must be present. COALESCE matters — array_length('{}')
    -- is NULL, and a NULL CHECK passes.
    CONSTRAINT schedule_version_shape CHECK (
        (schedule_type = 'every_day')
        OR (schedule_type = 'specific_days' AND days_of_week IS NOT NULL
            AND COALESCE(array_length(days_of_week, 1), 0) >= 1)
        OR (schedule_type = 'every_n_days'  AND interval_days IS NOT NULL)
    ),
    CONSTRAINT schedule_version_days_valid CHECK (
        days_of_week IS NULL OR days_of_week <@ '{1,2,3,4,5,6,7}'::smallint[]
    ),
    CONSTRAINT schedule_version_interval_valid CHECK (
        interval_days IS NULL OR interval_days >= 1
    ),
    CONSTRAINT schedule_version_dose_times_one CHECK (
        COALESCE(array_length(dose_times, 1), 0) = 1
    )
);

-- RLS: the house pattern — `(SELECT auth.uid())` so the planner caches it, and
-- one FOR ALL policy scoped to the owner. Cross-user reads must be impossible
-- (architecture.md invariant 2).
ALTER TABLE protocol_compound_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own protocol_compound_schedules - all" ON protocol_compound_schedules;
CREATE POLICY "own protocol_compound_schedules - all" ON protocol_compound_schedules
    FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Resolution reads every version for a compound and picks the latest one whose
-- effective_from <= the date, so this is the access path that matters.
CREATE INDEX IF NOT EXISTS idx_pcs_compound_effective
    ON protocol_compound_schedules (protocol_compound_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_pcs_user
    ON protocol_compound_schedules (user_id);

-- GRANTS: RLS gates rows, but PostgREST cannot reach the table at all without a
-- table-level grant — this project does not auto-grant, so every new public
-- table must ship its own or the Data API 42501s on it (architecture.md → Auth
-- and Access Model).
GRANT SELECT, INSERT, UPDATE, DELETE ON protocol_compound_schedules TO authenticated;
