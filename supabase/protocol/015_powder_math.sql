-- ============================================================================
-- 015 · v_inventory_math learns about tubs, and learns to read the item's base
-- ============================================================================
--
-- WHY, PART ONE — the tub has no maths at all
--
-- `014` made a `bulk_powder` row storable. This makes it countable. Every CASE
-- in the view is keyed on `inventory_type` with three branches, so a tub falls
-- through all of them and gets NULL for its total, its remaining and its
-- display. It would appear in Stock as a card with no numbers on it.
--
-- Three branches gain a `bulk_powder` arm, and all three are the same trivial
-- expression, because a tub is the simplest item in the schema: the amount IS
-- the base. `total_amount` grams in, grams out, no concentration and no per-unit
-- strength to multiply through.
--
-- WHY, PART TWO — and this is the actual bug
--
-- The `consumed` CTE converts `mcg → mg` and passes everything else through,
-- WITHOUT LOOKING AT THE ITEM (`010:35-46`). That was correct while every
-- inventory-backed item was based in mg or iu. It is wrong the moment an item is
-- based in grams: a 500 mg dose of creatine logged against a 1000 g tub would
-- subtract five hundred GRAMS, emptying a 1 kg tub in two doses.
--
-- No unit family prevents this — `014` deliberately lets a `g` item take an `mg`
-- dose, because that is a real thing people do (500 mg of something scooped).
-- The conversion has to know the item. So `consumed` now JOINs `inventory_items`
-- and converts against `base_unit`:
--
--     g  item + mg  dose  → ÷ 1000     (new)
--     g  item + g   dose  → as-is      (new)
--     any item + mcg dose → ÷ 1000     (as before)
--     otherwise           → as-is      (as before)
--
-- The mg/iu behaviour is byte-for-byte what it was, so no existing item's
-- remaining moves by so much as a milligram when this is applied.
--
-- Everything else in this view is copied VERBATIM from `010`. `CREATE OR REPLACE
-- VIEW` requires the existing columns to keep their names, types and ORDER, and
-- no column is added or removed here.
--
-- SAFETY: a view. No table is touched and no data is migrated. Reverting is
-- re-running `010`.
-- ============================================================================

CREATE OR REPLACE VIEW v_inventory_math
WITH (security_invoker = true)   -- RLS on the underlying tables is evaluated as
                                 -- the CALLING user, never the owner
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        SUM(
            CASE
                -- A gram-based item (a tub). Doses arrive in either g or mg —
                -- `unit_family_compatible` allows both — so the item's base is
                -- the only thing that says which conversion applies.
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'mg'  THEN dl.dose_amount / 1000.0
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'g'   THEN dl.dose_amount
                -- Unchanged from 010: mcg against an mg-based item.
                WHEN dl.dose_unit = 'mcg' THEN dl.dose_amount / 1000.0
                ELSE dl.dose_amount
            END
        ) AS consumed_base
    FROM dose_logs dl
    -- The JOIN is the whole point of this migration: the conversion above cannot
    -- be written without the item's base unit. An INNER join is right — a log
    -- with no item consumes nothing and the WHERE already excluded it.
    JOIN inventory_items i ON i.id = dl.inventory_item_id
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
        -- NEW. A tub's own measure IS grams, so there is nothing to divide by.
        -- Rounded to 1dp: a scale reads 990.5 g, not 990.4823 g.
        WHEN 'bulk_powder'     THEN round(base.remaining_base, 1)
    END AS remaining_display,
    -- approximate empty date for the reorder prompt (estimate only)
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date,
    -- 010's timezone-free runway: the same figure `est_empty_date` adds to
    -- `current_date`, exposed on its own so the client adds it to the LOCAL today.
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
        -- Planned dose expressed in the item's base unit. Same shape as
        -- `consumed` above and for the same reason: a tub planned in mg has to
        -- come down to grams or every derived figure below is out by 1000.
        CASE
            WHEN i.base_unit = 'g' AND pc.dose_unit = 'mg'  THEN pc.dose_amount / 1000.0
            WHEN i.base_unit = 'g' AND pc.dose_unit = 'g'   THEN pc.dose_amount
            WHEN pc.dose_unit = 'mcg' THEN pc.dose_amount / 1000.0
            ELSE pc.dose_amount
        END AS planned_dose_base,
        -- total capacity in base unit, per type (the vial's TRUE full size — the
        -- partial-fill offset is applied to remaining, not here)
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN i.total_amount
            WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
            WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
            WHEN 'bulk_powder'     THEN i.total_amount   -- NEW: grams in, grams out
        END AS total_base,
        -- remaining = total - prior_used - consumed, clamped at 0 (DERIVED)
        GREATEST(
            (CASE i.inventory_type
                WHEN 'reconstituted'   THEN i.total_amount
                WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
                WHEN 'oral_solid'      THEN i.total_amount * i.strength_per_unit_mg
                WHEN 'bulk_powder'     THEN i.total_amount   -- NEW
             END)
             - COALESCE(i.prior_used_base, 0)
             - COALESCE(c.consumed_base, 0),
            0
        ) AS remaining_base,
        -- concentration: derived for reconstituted, stated for preconcentrated.
        -- A tub has none — it is not a solution — so it stays NULL and every
        -- concentration-gated expression above correctly skips it.
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
