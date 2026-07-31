-- ============================================================================
-- 010 · v_inventory_math: say how many DAYS are left, not which date it is
-- ============================================================================
--
-- WHY
--
-- `est_empty_date` is `current_date + N`. `current_date` is the DATABASE's date,
-- and Supabase runs UTC, so for an Australian user it is yesterday for the first
-- ten hours of every day and for a Californian it is tomorrow every evening. The
-- app then subtracts the DEVICE's today from it to get "runs dry in N days", and
-- that subtraction is a day out for most of the world for part of every day. On
-- the vial card the same slip flips the amber "7 days or fewer" flag on and off
-- an hour before or after it should.
--
-- A duration has no timezone. `days_to_empty` is the same arithmetic with the
-- date anchoring removed, so the client adds it to the day IT knows it is.
--
-- `est_empty_date` is KEPT, unchanged, so nothing that reads it breaks while the
-- callers move over. `lib/notifications/runner.ts` still uses it server-side,
-- where UTC is the right frame anyway.
--
-- Everything else in this view is copied VERBATIM from `006_compound_cycles.sql`.
-- The only change is the one new expression. `CREATE OR REPLACE VIEW` requires
-- the existing columns to keep their names, types and ORDER, so the new column is
-- appended last.
--
-- SAFETY: additive, and re-runnable. No table is touched, no data is migrated,
-- and reverting is re-running 006.
-- ============================================================================

CREATE OR REPLACE VIEW v_inventory_math
WITH (security_invoker = true)   -- RLS on the underlying tables is evaluated as
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
    END AS est_empty_date,
    -- THE NEW COLUMN. The same figure `est_empty_date` adds to `current_date`,
    -- exposed on its own so the client can add it to the LOCAL today instead.
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE (( floor(base.remaining_base / base.planned_dose_base)
                / base.est_doses_per_week ) * 7)::int
    END AS days_to_empty
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
