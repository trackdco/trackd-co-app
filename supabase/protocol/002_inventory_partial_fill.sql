-- ============================================================
--  Protocol Cutover — Stock delta: partial-fill at add-time
--  Migration: inventory_partial_fill
-- ============================================================
-- The Stock model assumed every vial starts 100% FULL: remaining was derived in
-- v_inventory_math as (total capacity − doses logged against it). But a user often
-- starts tracking a vial that is already part-used (e.g. half a 10 mL bottle), and
-- there was nowhere to say so — so their runway read high until enough doses caught
-- it up.
--
-- This adds ONE raw INPUT column: how much of the vial's base-unit capacity was
-- already consumed BEFORE tracking began (NULL/0 = full, the existing behaviour).
-- We still NEVER store remaining (Invariant 1) — the view keeps deriving it, now as
--   remaining = total − consumed − prior_used   (clamped at 0).
-- `total_base` is left as the vial's TRUE full capacity, so the fullness bar
-- (remaining/total), doses-remaining, and projected-empty all stay correct and the
-- bar honestly shows a half-full vial as half full.
--
-- The app maps the friendly "how much is in it?" estimate (a Full/¾/½/¼ preset or an
-- exact amount-left in the vial's own measure) into this offset on insert/edit.
--
-- Additive + safe: nullable column, no backfill (existing vials stay "full"). Table-
-- level grants already cover new columns (inventory_items grants full DML to
-- `authenticated` in supabase/grants/001_api_role_grants.sql); RLS unchanged. The
-- view is replaced in place (CREATE OR REPLACE) so its SELECT grant + security_invoker
-- survive; its output columns are unchanged (only remaining_base's expression moves).

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS prior_used_base numeric(10,3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_prior_used_nonneg'
      AND conrelid = 'inventory_items'::regclass
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_prior_used_nonneg
      CHECK (prior_used_base IS NULL OR prior_used_base >= 0);
  END IF;
END $$;

-- Replace the view: identical output columns; remaining_base now also subtracts the
-- stored prior-used offset. Everything downstream of remaining_base (doses_remaining,
-- remaining_display, est_empty_date) follows automatically.
CREATE OR REPLACE VIEW v_inventory_math
    WITH (security_invoker = true)   -- SEC 1: evaluate underlying RLS as
                                     -- the CALLING user, never the owner
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        -- sum each taken dose converted into the base unit. Only mcg->mg
        -- needs scaling; mg and iu pass through. Cross-family doses are
        -- rejected at the DB layer by dose_logs_unit_family (FIX C), so
        -- pass-through here is safe by construction.
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
        -- partial-fill offset is applied to remaining, not here, so the fullness bar
        -- and "of N" context stay honest)
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN i.total_amount
            WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
            WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
        END AS total_base,
        -- remaining = total - prior_used - consumed, clamped at 0 (DERIVED, never
        -- stored). prior_used_base (NULL = 0) is the part-vial offset entered when the
        -- vial was added already part-used.
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
        -- rough weekly cadence from the schedule (estimate for reorder date)
        CASE pc.schedule_type
            WHEN 'every_day'     THEN 7.0 * pc.times_per_day
            WHEN 'specific_days' THEN COALESCE(array_length(pc.days_of_week, 1), 0) * pc.times_per_day
            WHEN 'every_n_days'  THEN (7.0 / NULLIF(pc.interval_days, 0)) * pc.times_per_day
        END AS est_doses_per_week
    FROM inventory_items i
    JOIN protocol_compounds pc ON pc.id = i.protocol_compound_id
    LEFT JOIN consumed c ON c.inventory_item_id = i.id
) base;
