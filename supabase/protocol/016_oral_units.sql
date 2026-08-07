-- ============================================================================
-- 016 · an oral's strength, in the unit printed on the label — or not at all
-- ============================================================================
--
-- ⚠️ THIS IS THE ONLY BACKWARDS-INCOMPATIBLE MIGRATION IN SPEC w2b-13. ⚠️
--
-- Every other file in this spec can be applied before or after the deploy. This
-- one RENAMES a column, so the old name disappears the instant it commits and
-- any running code still selecting `strength_per_unit_mg` breaks immediately.
-- **Apply this and deploy together.** If you would rather not coordinate, the
-- safe alternative is to ADD `strength_per_unit`, backfill it from
-- `strength_per_unit_mg`, and drop the old column in a later migration — at the
-- cost of two columns meaning the same thing for a while.
--
-- WHY THE RENAME
--
-- The name lies as soon as a tablet is measured in anything but milligrams, and
-- vitamin D is the everyday case: it is sold in IU, universally. A 5000 IU
-- tablet cannot be represented today at all, because the `oral_solid` branch of
-- `inv_type_fields` pins `base_unit = 'mg'`. Storing 5000 in a column called
-- `_mg` and calling it IU is exactly the silently-wrong-number failure the unit
-- families exist to prevent.
--
-- WHY STRENGTH BECOMES OPTIONAL
--
-- There are two honest ways to hold a tablet, and only one of them fits today's
-- schema:
--
--   Strength STATED — vitamin C, 1000 mg a tab. You log 2000 mg and two tablets
--     leave stock. `base_unit` is `mg` or `iu`; the count × strength is the base.
--
--   Strength NOT STATED — a multivitamin, a fish oil capsule. There is no single
--     number on the label to divide by, and nobody thinks in "milligrams of
--     multivitamin". You log 1 tab and one tablet leaves stock. `base_unit` is
--     `tab` or `capsule` and equals `total_amount_unit`; the count IS the base.
--
-- The second is impossible before this migration: `strength_per_unit_mg IS NOT
-- NULL` is required, and `inv_backed_dose_unit` excludes `tab`/`capsule`
-- outright. Both are relaxed here.
--
-- WHY WIDENING `inv_backed_dose_unit` IS SAFE
--
-- That CHECK (`trackd_schema_v0_4_2.sql:719-721`) was only ever a coarse first
-- pass — its own comment says so: "this CHECK just excludes ml/tab/capsule
-- outright" while "family compatibility with the SPECIFIC item is cross-table,
-- so it's enforced by the dose_logs_unit_family trigger". The TRIGGER is what
-- actually protects the maths, and it is being extended in the same statement
-- block. `ml` stays excluded: no item is based in millilitres, so an ml dose has
-- nothing coherent to subtract from.
--
-- SAFETY: the rename is mechanical and loses nothing. Every CHECK below is
-- WIDENED, never narrowed, so every existing row still satisfies it — a stated
-- strength in mg is the first arm of the new `oral_solid` branch, unchanged.
-- ============================================================================

-- NO `BEGIN;`/`COMMIT;` here. A migration runner (and the Supabase MCP) already
-- wraps the payload in a transaction; an inner BEGIN is ignored with a warning
-- and the inner COMMIT then closes the RUNNER's transaction early, so its own
-- bookkeeping insert lands outside it. Applied by hand in the SQL Editor this
-- file is still atomic, because a single migration is one transaction there too.

-- ---------------------------------------------------------------- 1. rename
-- Guarded so re-running the file is a no-op rather than an error.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'inventory_items'
          AND column_name  = 'strength_per_unit_mg'
    ) THEN
        ALTER TABLE public.inventory_items
            RENAME COLUMN strength_per_unit_mg TO strength_per_unit;
    END IF;
END $$;

COMMENT ON COLUMN public.inventory_items.strength_per_unit IS
    'Strength of ONE tablet/capsule, in the unit named by base_unit (mg or iu) — '
    'NOT always milligrams, which is why this column was renamed in 016. NULL is '
    'a valid and meaningful state: the label states no single strength (a '
    'multivitamin), and then base_unit is tab/capsule and the COUNT is the base.';

-- ----------------------------------------------------- 2. the type CHECK
-- Reproduces 014's four branches; only the `oral_solid` arm changes. It splits
-- in two because "strength stated" and "strength not stated" are genuinely
-- different shapes, and writing it as one branch with a pile of ORs makes it
-- impossible to see which combinations are legal.
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inv_type_fields;
ALTER TABLE public.inventory_items ADD CONSTRAINT inv_type_fields CHECK (
    (
        (inventory_type = 'reconstituted'
            AND bac_water_ml IS NOT NULL
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit IN ('mg','iu')
            AND total_amount_unit = base_unit)
        OR
        (inventory_type = 'preconcentrated'
            AND concentration_mg_per_ml IS NOT NULL
            AND bac_water_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit = 'ml')
        OR
        -- Oral, strength STATED: the base is the strength's unit, and count ×
        -- strength is the amount of drug in the bottle.
        (inventory_type = 'oral_solid'
            AND strength_per_unit IS NOT NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit IN ('mg','iu')
            AND total_amount_unit IN ('tab','capsule'))
        OR
        -- Oral, strength NOT stated: the tablet itself is the unit. base_unit
        -- must EQUAL total_amount_unit, or the count would be counted in one
        -- unit and depleted in another.
        (inventory_type = 'oral_solid'
            AND strength_per_unit IS NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit IN ('tab','capsule')
            AND total_amount_unit = base_unit)
        OR
        (inventory_type = 'bulk_powder'
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit = 'g'
            AND total_amount_unit = 'g')
    )
    AND (serving_size_g IS NULL OR inventory_type = 'bulk_powder')
);

-- --------------------------------------------- 3. the unit families
-- `tab` and `capsule` become their own single-member families: a tab-based item
-- accepts tab doses and nothing else. Deliberately NOT interchangeable with each
-- other — a bottle of capsules should not silently accept a dose logged in tabs,
-- because the two counts are not the same object.
CREATE OR REPLACE FUNCTION public.unit_family_compatible(
    item_base public.dose_unit,
    dose      public.dose_unit
)
RETURNS boolean AS $$
    SELECT (item_base = 'mg'      AND dose IN ('mg','mcg'))
        OR (item_base = 'iu'      AND dose = 'iu')
        OR (item_base = 'g'       AND dose IN ('g','mg'))
        OR (item_base = 'tab'     AND dose = 'tab')
        OR (item_base = 'capsule' AND dose = 'capsule');
$$ LANGUAGE sql IMMUTABLE
-- ⚠️ RESTATED, not decoration. `hardening/001` set this to close the advisor's
-- `function_search_path_mutable` finding, and CREATE OR REPLACE FUNCTION takes
-- every property except ownership and permissions from the NEW command — so
-- omitting it here silently un-hardens the function.
SET search_path = '';

-- ------------------------------------- 4. what an inventory-backed dose may be
-- See the header: this is the coarse first pass, and the family trigger is the
-- real enforcement. `ml` stays out — nothing is based in millilitres.
ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS inv_backed_dose_unit;
ALTER TABLE public.dose_logs ADD CONSTRAINT inv_backed_dose_unit CHECK (
    inventory_item_id IS NULL
    OR dose_unit IN ('mg','mcg','iu','g','tab','capsule')
);

-- --------------------------------------------------------------- 5. the view
-- DROP + CREATE rather than CREATE OR REPLACE, because the view's own OUTPUT
-- column is still called `strength_per_unit_mg` and CREATE OR REPLACE cannot
-- rename a view column. Renaming the table column does NOT rename it: a view's
-- output names are fixed when it is created.
--
-- ⚠️ DROPPING THE VIEW DROPS ITS GRANT. `supabase/grants/001` line 70 is
-- `GRANT SELECT ON public.v_inventory_math ... TO authenticated`, and a dropped
-- object takes its privileges with it. The re-GRANT at the bottom is not
-- optional belt-and-braces — without it every authenticated read of the runway
-- returns 42501 and Stock shows blank cards. This whole file is one transaction
-- so the view is never missing between the DROP and the CREATE.
DROP VIEW IF EXISTS v_inventory_math;

CREATE VIEW v_inventory_math
WITH (security_invoker = true)   -- RLS on the underlying tables is evaluated as
                                 -- the CALLING user, never the owner
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        SUM(
            CASE
                -- 015's base-aware conversion, unchanged.
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'mg'  THEN dl.dose_amount / 1000.0
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'g'   THEN dl.dose_amount
                WHEN dl.dose_unit = 'mcg' THEN dl.dose_amount / 1000.0
                -- A tab dose against a tab-based item falls through to ELSE and
                -- passes through 1:1, which is correct: one tab logged is one
                -- tab gone. The family check already guarantees the pairing.
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
    -- Tabs/caps per dose. Only meaningful when a strength was stated: with no
    -- strength the dose IS already a count, so there is nothing to convert and
    -- NULL is the honest answer rather than a tautological 1.
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
        -- COALESCE to 1: with no stated strength the base already IS the tablet
        -- count, so dividing by 1 returns it unchanged. This is the same
        -- COALESCE that appears in `total_base` and `remaining_base` below, and
        -- it is what makes both kinds of tablet work through one expression.
        WHEN 'oral_solid'      THEN floor(base.remaining_base / NULLIF(COALESCE(base.strength_per_unit, 1),0))
        WHEN 'bulk_powder'     THEN round(base.remaining_base, 1)
    END AS remaining_display,
    CASE
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date,
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
        i.strength_per_unit,          -- renamed; the view's output follows it
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

-- THE RE-GRANTS. See the ⚠️ above the DROP — these are load-bearing.
--
-- BOTH roles. `grants/002` granted the view to `service_role` via
-- `GRANT ALL ON ALL TABLES`, which the DROP takes with it — and the notification
-- runner reads this view as `service_role` while DISCARDING the error
-- (`lib/notifications/runner.ts`), so a missing grant there fails silently and
-- low-stock pushes simply stop forever.
GRANT SELECT ON public.v_inventory_math TO authenticated;
GRANT SELECT ON public.v_inventory_math TO service_role;
