-- ============================================================================
-- 006 — compound cycles  (Spec 06 · part two)
-- ============================================================================
-- An on/off pattern sitting ABOVE a compound's schedule. The schedule still
-- decides which DAYS a dose falls on; the cycle decides whether the compound is
-- being run at all that day. One cycle governs exactly one compound, and cycles
-- are never named — a cycle is just its compound.
--
-- NOTE ON THE WORD "CYCLE". The existing `cycles` table is a DIFFERENT concept:
-- the user's overall protocol run (the "Week 3 of 12" header, and the cycle_id
-- stamp that attributes journal / weight / bloodwork entries). That table is
-- untouched here. These columns are the per-compound on/off rule, which the app
-- calls a `CycleRule` in code precisely so the two cannot be confused.
--
-- STRICTLY ADDITIVE — new nullable columns only, no table created, no row
-- altered, no backfill. A compound with `cycle_anchor IS NULL` has no cycle and
-- behaves exactly as it did before this migration: always on, gated only by its
-- schedule. The feature costs nothing until it is used.
--
-- Columns are added to BOTH `protocol_compounds` (the current rule) and
-- `protocol_compound_schedules` (the versioned trail), mirroring each other 1:1
-- exactly as migration 005 does for the dose/schedule columns — so a version row
-- and the compound it describes can never drift apart in shape.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The end condition. Five, and no others (Spec 06 · Design Decisions):
--   never           runs indefinitely
--   on_date         ends on a given date, inclusive of that day
--   after_rounds    ends after N rounds; a round is one on-period + one off
--   when_vial_empty ends when the backing vial runs out (vials only)
-- A row with no cycle carries NULL here rather than 'never', so "has a cycle"
-- is one unambiguous test (`cycle_anchor IS NOT NULL`).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'cycle_end_type') THEN
        CREATE TYPE cycle_end_type AS ENUM (
            'never', 'on_date', 'after_rounds', 'when_vial_empty'
        );
    END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Current rule, on the compound.
-- ---------------------------------------------------------------------------
ALTER TABLE protocol_compounds
    -- The day the on/off phase counts from. NULL = no cycle. This is the single
    -- "has a cycle" test, which is why it is not defaulted.
    ADD COLUMN IF NOT EXISTS cycle_anchor      date,
    -- NULL on_days = a continuous cycle: no off-period, but still able to carry
    -- an end condition (a compound that simply runs until a date or a vial ends).
    ADD COLUMN IF NOT EXISTS cycle_on_days     smallint,
    ADD COLUMN IF NOT EXISTS cycle_off_days    smallint,
    ADD COLUMN IF NOT EXISTS cycle_end_type    cycle_end_type,
    ADD COLUMN IF NOT EXISTS cycle_end_date    date,
    ADD COLUMN IF NOT EXISTS cycle_end_rounds  smallint,
    -- One of the twelve approved palette names (see ui-context.md → Cycle
    -- palette). Stored as its NAME, not a hex value: the hex lives once in
    -- globals.css, so a palette retune never needs a data migration.
    ADD COLUMN IF NOT EXISTS cycle_colour      text;

-- Integrity: the pattern must be coherent, and each end condition must carry
-- exactly the field it needs. Enforced here rather than in TypeScript, per
-- Invariant 5 — the database is the source of truth for shape.
ALTER TABLE protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_cycle_shape;
ALTER TABLE protocol_compounds
    ADD CONSTRAINT protocol_compounds_cycle_shape CHECK (
        -- No cycle: every cycle column must be empty.
        (cycle_anchor IS NULL
            AND cycle_on_days IS NULL AND cycle_off_days IS NULL
            AND cycle_end_type IS NULL AND cycle_end_date IS NULL
            AND cycle_end_rounds IS NULL AND cycle_colour IS NULL)
        OR (
            cycle_anchor IS NOT NULL
            AND cycle_end_type IS NOT NULL
            AND cycle_colour IS NOT NULL
            -- on/off is all-or-nothing, and an on-period must be a real period.
            AND ((cycle_on_days IS NULL AND cycle_off_days IS NULL)
                 OR (cycle_on_days > 0 AND cycle_off_days >= 0))
            -- Each end condition carries its own field and no other.
            AND (cycle_end_type <> 'on_date'      OR cycle_end_date IS NOT NULL)
            AND (cycle_end_type <> 'after_rounds' OR (cycle_end_rounds > 0
                                                      AND cycle_on_days IS NOT NULL))
        )
    );

-- ---------------------------------------------------------------------------
-- Versioned trail, mirroring the above 1:1 (migration 005's contract).
-- ---------------------------------------------------------------------------
ALTER TABLE protocol_compound_schedules
    ADD COLUMN IF NOT EXISTS cycle_anchor      date,
    ADD COLUMN IF NOT EXISTS cycle_on_days     smallint,
    ADD COLUMN IF NOT EXISTS cycle_off_days    smallint,
    ADD COLUMN IF NOT EXISTS cycle_end_type    cycle_end_type,
    ADD COLUMN IF NOT EXISTS cycle_end_date    date,
    ADD COLUMN IF NOT EXISTS cycle_end_rounds  smallint,
    ADD COLUMN IF NOT EXISTS cycle_colour      text;

-- ============================================================================
-- v_inventory_math — teach the runs-dry projection about off periods.
-- ============================================================================
-- A cycle changes WHEN doses are due, so it changes how long a vial lasts. A
-- vial holding fourteen doses lasts a fortnight on a daily schedule but a month
-- on seven-on / seven-off. Before this the view computed est_doses_per_week
-- purely from the cadence columns and knew nothing about cycles, so it projected
-- every cycled compound running dry roughly twice as fast as it really does.
--
-- The fix is one factor: scale the weekly rate by the fraction of days the
-- compound is actually being run, on_days / (on_days + off_days). A continuous
-- cycle and an uncycled compound both scale by 1, so nothing else changes.
--
-- This stays IN THE VIEW rather than being corrected in app code, because
-- remaining / doses-remaining / projected-empty are derived values the app must
-- read and never recompute (Invariant 1, and code-standards.md → Data Access).
--
-- Everything else is reproduced VERBATIM from the current definition
-- (supabase/protocol/002_inventory_partial_fill.sql, which is the live one —
-- NOT the v0.4.2 original, which predates the prior_used_base offset). Only the
-- est_doses_per_week expression changes.
--
-- CREATE OR REPLACE, deliberately, not DROP + CREATE: the output columns are
-- unchanged (the cycle factor lives inside the subquery, which `base.*` passes
-- through), and REPLACE preserves the existing grants. A DROP would silently
-- revoke SELECT from `authenticated` and 42501 every inventory read.
-- ============================================================================

CREATE OR REPLACE VIEW v_inventory_math
    WITH (security_invoker = true)   -- SEC 1: evaluate underlying RLS as
                                     -- the CALLING user, never the owner
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        SUM(
            CASE dl.dose_unit
                WHEN 'mcg' THEN dl.dose_amount / 1000.0
                ELSE dl.dose_amount
            END
        ) AS consumed_base
    FROM dose_logs dl
    WHERE dl.status = 'taken' AND dl.inventory_item_id IS NOT NULL
    GROUP BY dl.inventory_item_id
)
SELECT
    base.*,
    -- mL to draw per dose (injectables only)
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round(base.planned_dose_base / base.concentration_per_ml, 3)
    END AS ml_per_dose,
    -- insulin units per dose (1 mL = 100 U)
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round((base.planned_dose_base / base.concentration_per_ml) * 100, 1)
    END AS units_per_dose,
    -- tabs/caps per dose (oral only)
    CASE WHEN base.inventory_type = 'oral_solid' AND base.strength_per_unit_mg > 0
         THEN round(base.planned_dose_base / base.strength_per_unit_mg, 2)
         ELSE NULL
    END AS units_per_dose_oral,
    -- whole planned doses remaining
    CASE WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0
         THEN NULL
         ELSE floor(base.remaining_base / base.planned_dose_base)
    END AS doses_remaining,
    -- human-friendly remaining in the container's own measure
    CASE base.inventory_type
        WHEN 'preconcentrated' THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 2)
        WHEN 'reconstituted'   THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 3)
        WHEN 'oral_solid'      THEN floor(base.remaining_base / NULLIF(base.strength_per_unit_mg,0))
    END AS remaining_display,
    -- approximate empty date for the reorder prompt (estimate only)
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date
FROM (
    SELECT
        i.id AS inventory_item_id,
        i.protocol_compound_id,
        i.inventory_type,
        i.base_unit,
        i.strength_per_unit_mg,
        pc.dose_amount,
        pc.dose_unit,
        -- planned dose expressed in the item's base unit
        CASE pc.dose_unit WHEN 'mcg' THEN pc.dose_amount / 1000.0 ELSE pc.dose_amount END
            AS planned_dose_base,
        -- total capacity in base unit, per type (the vial's TRUE full size — the
        -- partial-fill offset is applied to remaining, not here)
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN i.total_amount
            WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
            WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
        END AS total_base,
        -- remaining = total - prior_used - consumed, clamped at 0 (DERIVED)
        GREATEST(
            (CASE i.inventory_type
                WHEN 'reconstituted'   THEN i.total_amount
                WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
                WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
             END)
             - COALESCE(i.prior_used_base, 0)
             - COALESCE(c.consumed_base, 0),
            0
        ) AS remaining_base,
        -- concentration: derived for reconstituted, stated for preconcentrated
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN CASE WHEN i.bac_water_ml > 0
                                             THEN round(i.total_amount / i.bac_water_ml, 3) END
            WHEN 'preconcentrated' THEN i.concentration_mg_per_ml
            ELSE NULL
        END AS concentration_per_ml,
        -- Rough weekly cadence, THEN scaled by the share of days the cycle is on.
        -- This factor is the only change from the previous definition.
        (CASE pc.schedule_type
            WHEN 'every_day'     THEN 7.0 * pc.times_per_day
            WHEN 'specific_days' THEN COALESCE(array_length(pc.days_of_week, 1), 0) * pc.times_per_day
            WHEN 'every_n_days'  THEN (7.0 / NULLIF(pc.interval_days, 0)) * pc.times_per_day
         END)
        * CASE
            -- On/off cycle: only on_days out of every full round are dosed, so a
            -- vial lasts (on+off)/on times longer than the cadence alone implies.
            WHEN pc.cycle_anchor IS NOT NULL
                 AND pc.cycle_on_days IS NOT NULL
                 AND (pc.cycle_on_days + COALESCE(pc.cycle_off_days, 0)) > 0
            THEN pc.cycle_on_days::numeric
                 / (pc.cycle_on_days + COALESCE(pc.cycle_off_days, 0))
            -- No cycle, or a continuous one: unchanged.
            ELSE 1
          END
        AS est_doses_per_week
    FROM inventory_items i
    JOIN protocol_compounds pc ON pc.id = i.protocol_compound_id
    LEFT JOIN consumed c ON c.inventory_item_id = i.id
) base;
