-- ============================================================================
-- 019 · the runway learns about pauses
-- ============================================================================
--
-- WHY
--
-- `days_to_empty` divides remaining stock by an assumed weekly cadence. A paused
-- compound is consuming NOTHING, so the estimate keeps counting down through a
-- fortnight in which the vial does not move — and the amber "7 days or fewer"
-- flag can fire while the user is not taking it at all.
--
-- The fix is arithmetic, not a write: the days still to come in an active pause
-- are ADDED to the runway. Nothing about a pause is ever stored as a derived
-- value, here or anywhere else.
--
-- ⚠️ AN INDEFINITE PAUSE RETURNS NULL, NOT A LARGE NUMBER.
--
-- This is the part worth reading twice. "When does this run out" has no answer
-- when nothing is being consumed and no resume date exists — so the honest
-- output is NULL, which the client already renders as "no estimate". Returning
-- something enormous instead would put a made-up date on the card, and a made-up
-- date is indistinguishable from a real one once it is on screen.
--
-- `est_empty_date` IS DELIBERATELY LEFT ALONE
--
-- It is the UTC-leaking column (`supabase/protocol/010:5-20`) and the client
-- already prefers `days_to_empty`. Extending both would mean maintaining the
-- pause maths in two places, one of which is known-wrong about timezones and is
-- on its way out.
--
-- WHY CORRELATED SUBQUERIES AND NOT A JOIN
--
-- Two reasons, and the second is the binding one.
--
-- A plain join would multiply the inventory rows by their pause history — every
-- vial appearing once per pause ever taken — so it would have to be a LATERAL
-- picking the single covering row.
--
-- But a lateral means two extra columns on the inner `base` subquery, and the
-- outer SELECT starts with `base.*`. New columns there land in the MIDDLE of the
-- view's output, before `ml_per_dose` — and `CREATE OR REPLACE VIEW` may only
-- append columns at the end, so it would fail with "cannot change name of view
-- column". The alternative is DROP + CREATE, which takes the view's GRANT with
-- it (see `016`).
--
-- Correlated subqueries in the one expression that needs them add no columns at
-- all, so this stays a replace. They run per inventory row against an indexed
-- `(protocol_compound_id, started_on)`; there is one row per compound here, not
-- one per dose.
--
-- Everything else in this view is copied VERBATIM from `016`. `CREATE OR REPLACE
-- VIEW` requires the existing columns to keep their names, types and ORDER, and
-- none are added or removed here.
--
-- SAFETY: a view. No table is touched, no data migrated. Reverting is re-running
-- `016`. Tolerant of `018` not being applied: if `compound_pauses` does not
-- exist this file fails as a whole and the previous view stays in place, so
-- apply `018` first.
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
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'mg'  THEN dl.dose_amount / 1000.0
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'g'   THEN dl.dose_amount
                WHEN dl.dose_unit = 'mcg' THEN dl.dose_amount / 1000.0
                ELSE dl.dose_amount
            END
        ) AS consumed_base
    FROM dose_logs dl
    JOIN inventory_items i ON i.id = dl.inventory_item_id
    WHERE dl.status = 'taken' AND dl.inventory_item_id IS NOT NULL
    GROUP BY dl.inventory_item_id
)
SELECT
    base.*,
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round(base.planned_dose_base / base.concentration_per_ml, 3)
    END AS ml_per_dose,
    CASE WHEN base.concentration_per_ml IS NULL OR base.concentration_per_ml = 0
         THEN NULL
         ELSE round((base.planned_dose_base / base.concentration_per_ml) * 100, 1)
    END AS units_per_dose,
    CASE WHEN base.inventory_type = 'oral_solid' AND base.strength_per_unit > 0
         THEN round(base.planned_dose_base / base.strength_per_unit, 2)
         ELSE NULL
    END AS units_per_dose_oral,
    CASE WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0
         THEN NULL
         ELSE floor(base.remaining_base / base.planned_dose_base)
    END AS doses_remaining,
    CASE base.inventory_type
        WHEN 'preconcentrated' THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 2)
        WHEN 'reconstituted'   THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 3)
        WHEN 'oral_solid'      THEN floor(base.remaining_base / NULLIF(COALESCE(base.strength_per_unit, 1),0))
        WHEN 'bulk_powder'     THEN round(base.remaining_base, 1)
    END AS remaining_display,
    -- UNCHANGED, deliberately. See the header: this is the UTC-leaking column
    -- and the client already prefers `days_to_empty`.
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date,
    -- THE RUNWAY, with the pause added on.
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        -- ⚠️ Indefinitely paused: NULL, not a big number. There is no answer.
        WHEN EXISTS (
            SELECT 1 FROM compound_pauses cp
            WHERE cp.protocol_compound_id = base.protocol_compound_id
              AND cp.is_active
              AND cp.started_on <= current_date
              AND cp.ends_on IS NULL
        ) THEN NULL
        ELSE (( floor(base.remaining_base / base.planned_dose_base)
                / base.est_doses_per_week ) * 7)::int
             -- The days still to come in a pause covering TODAY. `started_on` is
             -- checked too, so a pause scheduled for next month does not
             -- silently extend today's runway.
             + COALESCE((
                 SELECT GREATEST(0, (cp.ends_on - current_date) + 1)::int
                 FROM compound_pauses cp
                 WHERE cp.protocol_compound_id = base.protocol_compound_id
                   AND cp.is_active
                   AND cp.started_on <= current_date
                   AND cp.ends_on >= current_date
                 ORDER BY cp.ends_on DESC
                 LIMIT 1
               ), 0)
    END AS days_to_empty
FROM (
    SELECT
        i.id AS inventory_item_id,
        i.protocol_compound_id,
        i.inventory_type,
        i.base_unit,
        i.strength_per_unit,
        pc.dose_amount,
        pc.dose_unit,
        CASE
            WHEN i.base_unit = 'g' AND pc.dose_unit = 'mg'  THEN pc.dose_amount / 1000.0
            WHEN i.base_unit = 'g' AND pc.dose_unit = 'g'   THEN pc.dose_amount
            WHEN pc.dose_unit = 'mcg' THEN pc.dose_amount / 1000.0
            ELSE pc.dose_amount
        END AS planned_dose_base,
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN i.total_amount
            WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
            WHEN 'oral_solid'      THEN i.total_amount * COALESCE(i.strength_per_unit, 1)
            WHEN 'bulk_powder'     THEN i.total_amount
        END AS total_base,
        GREATEST(
            (CASE i.inventory_type
                WHEN 'reconstituted'   THEN i.total_amount
                WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
                WHEN 'oral_solid'      THEN i.total_amount * COALESCE(i.strength_per_unit, 1)
                WHEN 'bulk_powder'     THEN i.total_amount
             END)
             - COALESCE(i.prior_used_base, 0)
             - COALESCE(c.consumed_base, 0),
            0
        ) AS remaining_base,
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN CASE WHEN i.bac_water_ml > 0
                                             THEN round(i.total_amount / i.bac_water_ml, 3) END
            WHEN 'preconcentrated' THEN i.concentration_mg_per_ml
            ELSE NULL
        END AS concentration_per_ml,
        (CASE pc.schedule_type
            WHEN 'every_day'     THEN 7.0 * pc.times_per_day
            WHEN 'specific_days' THEN COALESCE(array_length(pc.days_of_week, 1), 0) * pc.times_per_day
            WHEN 'every_n_days'  THEN (7.0 / NULLIF(pc.interval_days, 0)) * pc.times_per_day
         END)
        * CASE
            WHEN pc.cycle_anchor IS NOT NULL
                 AND pc.cycle_on_days IS NOT NULL
                 AND (pc.cycle_on_days + COALESCE(pc.cycle_off_days, 0)) > 0
            THEN pc.cycle_on_days::numeric
                 / (pc.cycle_on_days + COALESCE(pc.cycle_off_days, 0))
            ELSE 1
          END
        AS est_doses_per_week
    FROM inventory_items i
    JOIN protocol_compounds pc ON pc.id = i.protocol_compound_id
    LEFT JOIN consumed c ON c.inventory_item_id = i.id
) base;

-- The view is REPLACED, not dropped, so its grant survives — that is precisely
-- why this file goes to the trouble of adding no columns. Restated anyway: a
-- missing grant here is a 42501 on every read of the runway, and the cost of
-- being sure is one idempotent statement.
GRANT SELECT ON public.v_inventory_math TO authenticated;
