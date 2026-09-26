-- ============================================================================
-- 026 · spares, the dropper, a per-compound stock read, and the vial a cycle
--       ends on
-- ============================================================================
--
-- ▶ HOW TO RUN THIS
--   0. BEFORE `025` AND BEFORE THIS FILE: merge `design/half-life-motion` into
--      `main`, let Vercel deploy it, and confirm production is serving that
--      build. Section 5 adds a SECOND foreign key between `protocol_compounds`
--      and `inventory_items`, and PostgREST then refuses (PGRST201) every embed
--      between the two tables that does not name its key
--      (`protocol_compounds!inventory_items_protocol_compound_id_fkey!inner`).
--      `main` (a938d5a, 26 Sep 2026) has FOUR such embeds and names it in none:
--        a. `lib/db/inventory.ts`, twice (Stock). The branch hints both.
--        b. the low-stock read in `lib/notifications/runner.ts`. The branch
--           moves it to `INVENTORY_REMINDER_SELECT` in
--           `lib/notifications/reminders.ts`, hinted. Keep that in the merge.
--        c. `readStock` in `lib/notifications/checkupFacts.ts` (the check-ups,
--           `NOTIFICATION_CHECKUPS=on`). It is on `main` ONLY, so the branch
--           cannot hint it: the MERGE must, by hand.
--      Run this file against a build with any of them bare and Stock fails to
--      load for every user, the low-stock push goes silent, and the check-ups
--      quietly lose their stock. The gate, run on the exact commit production
--      serves (it reads every file, so it also catches an embed added later):
--        npx vitest run lib/db/embedHints.test.ts     (must pass)
--   1. Apply `025` FIRST, on its own. This file uses the two enum values it
--      adds, and fails with "invalid input value for enum" without them.
--   2. Pick the minute: NOT :00, :15, :30 or :45. The reminder cron reads
--      these tables then. Start at, say, :05 or :20.
--   3. Paste the WHOLE file into the SQL Editor and run it. Everything that is
--      not a statement is a comment, so there is no part to leave out. It is
--      ONE transaction (`BEGIN` … `COMMIT`) with `SET LOCAL lock_timeout =
--      '5s'`: a busy table stops it within 5 seconds instead of queueing every
--      reader behind it. Any error, "canceling statement due to lock timeout"
--      included, rolls the WHOLE file back and changes nothing: wait a minute
--      and run it again.
--   4. "Success. No rows returned" is the success message.
--   5. CHECK (paste this afterwards; it should return THREE rows):
--        SELECT 'column'  FROM information_schema.columns
--         WHERE table_name = 'protocol_compounds' AND column_name = 'cycle_end_item_id'
--        UNION ALL
--        SELECT 'view'    FROM pg_views WHERE viewname = 'v_compound_stock'
--        UNION ALL
--        SELECT 'started' FROM information_schema.columns
--         WHERE table_name = 'v_inventory_math' AND column_name = 'is_started';
--   6. CHECK the views' options and grants (TWO rows; each `reloptions` is
--      `{security_invoker=true}` and both `_reads` columns are `true`):
--        SELECT relname, reloptions,
--               has_table_privilege('authenticated', oid, 'SELECT') AS authenticated_reads,
--               has_table_privilege('service_role', oid, 'SELECT')  AS service_role_reads
--          FROM pg_class
--         WHERE relname IN ('v_inventory_math', 'v_compound_stock');
--      Not `relacl` by eye: `grants/002`'s default privileges give
--      `service_role` more than SELECT, so its entry reads like
--      `service_role=arwdDxtm/postgres`, and that is correct.
--   7. CHECK the API logs (Logs → API) for PGRST201 over the next few minutes:
--      there should be none. If there is, a caller was missed at step 0. The
--      two keys below are what make the embed ambiguous, so dropping them puts
--      the reads back at once (nothing writes `cycle_end_item_id` yet):
--        ALTER TABLE public.protocol_compounds
--          DROP CONSTRAINT protocol_compounds_cycle_end_item_fk;
--        ALTER TABLE public.protocol_compound_schedules
--          DROP CONSTRAINT protocol_compound_schedules_cycle_end_item_fk;
--      Then hint the caller, deploy, and run this file again.
--   8. Idempotent: every statement is `IF NOT EXISTS`, `DROP ... IF EXISTS`
--      then `ADD`, or `CREATE OR REPLACE`. Running it twice is harmless.
--
-- NOT BACKWARD COMPATIBLE WITH AN UNHINTED `main`: see step 0. Section 5's key
-- (`protocol_compounds.cycle_end_item_id` → `inventory_items`) is a second
-- relationship between the two tables, and it makes `protocol_compound_schedules`
-- a junction between them too, so an embed that does not name
-- `inventory_items_protocol_compound_id_fkey` fails (PGRST201). `main` has four
-- such embeds, one of them (`checkupFacts.ts`) not on this branch. Everything else here is compatible with what `main`
-- writes and reads, so nothing narrows what it writes or renames what it reads:
--   - every CHECK is WIDENED, never narrowed; every existing row still passes;
--   - `acquired_on` KEEPS its `DEFAULT current_date`, so a row `main` inserts
--     is started exactly as today. Only the new code writes NULL (a spare);
--   - `v_inventory_math` is REPLACED with the same columns in the same order and
--     one appended at the end, so its grant survives and `main`'s column list
--     still reads. A started row's figures are unchanged;
--   - the new columns are nullable and default to NULL.
--
-- Verified before shipping: the whole schema was replayed into a local Postgres
-- 17 (PGlite) from `trackd_schema_v0_4_2.sql` + `protocol/001`–`024`, its view
-- hash and columns matched production's exactly, and `025` + this file were
-- applied on top and exercised (scratchpad/pg in the session that wrote it).
-- Re-run on 26 Sep 2026 with the transaction wrapper: the same 21 checks pass,
-- twice over; run without `025` it fails and leaves nothing behind (the CHECK
-- it had dropped is back, no column, no view); `lock_timeout` is back to its
-- default after `COMMIT`; and the replay's only key from `inventory_items` to
-- `protocol_compounds` is `inventory_items_protocol_compound_id_fkey`, with
-- `protocol_compounds_cycle_end_item_fk` beside it once this has run.
-- ============================================================================

-- One transaction, so a failure anywhere leaves the database as it was. The
-- lock timeout is LOCAL: it ends with the transaction.
BEGIN;
SET LOCAL lock_timeout = '5s';


-- ---------------------------------------------------------------------------
-- 1. A spare vial, and the dropper, in the type CHECK
-- ---------------------------------------------------------------------------
--
-- SPARES. A container you hold but have not started has no start date
-- (`acquired_on IS NULL`). Mixing or opening it stamps today; so does picking
-- it in the log panel (build brief §5, items 1–2).
--
-- An UNMIXED vial could not be stored at all: the `reconstituted` arm demanded
-- `bac_water_ml`. It now accepts a vial with no water PROVIDED it also has no
-- mix date and no start date, so a vial is unmixed only as a whole. A vial WITH
-- water is accepted exactly as before, which is every row `main` writes.
--
-- THE DROPPER (`025`). Three shapes, each one arm:
--   mL, strength stated   research liquids: dosed in mL steps with the mg shown.
--                         Held in mL at a stated mg/mL, based in mg, exactly the
--                         maths of a pre-mixed vial.
--   drops, strength stated vitamin drops: "1000 IU a drop". Counted in drops,
--                         based in the strength's unit, like an oral with a
--                         stated strength.
--   drops, no strength    counted in drops, based in `drop`, like a tablet whose
--                         label states no single strength (`016`).
--
-- Reproduces `016`'s arms; only the `reconstituted` arm changes, and the
-- dropper arms are added.

ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inv_type_fields;
ALTER TABLE public.inventory_items ADD CONSTRAINT inv_type_fields CHECK (
    (
        (inventory_type = 'reconstituted'
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit IN ('mg','iu')
            AND total_amount_unit = base_unit
            -- Mixed (as before), or unmixed as a whole: no water, no mix date,
            -- not started.
            AND (bac_water_ml IS NOT NULL
                 OR (reconstituted_on IS NULL AND acquired_on IS NULL)))
        OR
        (inventory_type = 'preconcentrated'
            AND concentration_mg_per_ml IS NOT NULL
            AND bac_water_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit = 'ml')
        OR
        (inventory_type = 'oral_solid'
            AND strength_per_unit IS NOT NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit IN ('mg','iu')
            AND total_amount_unit IN ('tab','capsule'))
        OR
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
        OR
        -- Dropper, mL at a stated strength.
        (inventory_type = 'dropper'
            AND concentration_mg_per_ml IS NOT NULL
            AND bac_water_ml IS NULL
            AND strength_per_unit IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit = 'ml')
        OR
        -- Dropper, counted in drops at a stated strength per drop.
        (inventory_type = 'dropper'
            AND strength_per_unit IS NOT NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit IN ('mg','iu')
            AND total_amount_unit = 'drop')
        OR
        -- Dropper, counted in drops with no stated strength: the drop is the unit.
        (inventory_type = 'dropper'
            AND strength_per_unit IS NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit = 'drop'
            AND total_amount_unit = 'drop')
    )
    AND (serving_size_g IS NULL OR inventory_type = 'bulk_powder')
);


-- ---------------------------------------------------------------------------
-- 2. The drop is its own unit family
-- ---------------------------------------------------------------------------
-- A drop-based item accepts drop doses and nothing else, for the same reason a
-- tab-based one accepts only tabs (`016`): the count is the thing depleted.
-- The body is `024`'s canonical one plus the last line, with its hardening.

CREATE OR REPLACE FUNCTION public.unit_family_compatible(
    item_base public.dose_unit,
    dose      public.dose_unit
)
RETURNS boolean AS $$
    SELECT (item_base = 'mg'      AND dose IN ('mg','mcg'))
        OR (item_base = 'iu'      AND dose = 'iu')
        OR (item_base = 'g'       AND dose IN ('g','mg'))
        OR (item_base = 'tab'     AND dose = 'tab')
        OR (item_base = 'capsule' AND dose = 'capsule')
        OR (item_base = 'drop'    AND dose = 'drop');
$$ LANGUAGE sql IMMUTABLE
-- ⚠️ Restated on purpose: CREATE OR REPLACE takes every property from the new
-- command, and `hardening/001` + `024` set this.
SET search_path = '';

ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS inv_backed_dose_unit;
ALTER TABLE public.dose_logs ADD CONSTRAINT inv_backed_dose_unit CHECK (
    inventory_item_id IS NULL
    OR dose_unit IN ('mg','mcg','iu','g','tab','capsule','drop')
);


-- ---------------------------------------------------------------------------
-- 3. `v_inventory_math`: a spare counts no doses, and the dropper has maths
-- ---------------------------------------------------------------------------
--
-- An unmixed vial was counted as doses ready (its powder, at the planned dose),
-- so Stock promised doses nobody could draw. A row with no start date now has
-- NULL doses and NULL runway; its amounts are still reported, so a spare can be
-- drawn at its real level. `is_started` is appended so a reader does not have to
-- join for it.
--
-- REPLACED, not dropped, so the grant survives (see `016`): every existing
-- column keeps its name, type and order, and `is_started` is appended LAST. The
-- start date is read through a join in the OUTER query, because adding it to the
-- `base` subquery would insert a column into `base.*` and move every column
-- after it. Everything not marked below is `019` verbatim.

CREATE OR REPLACE VIEW public.v_inventory_math
WITH (security_invoker = true)
AS
WITH consumed AS (
    SELECT
        dl.inventory_item_id,
        SUM(
            CASE
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'mg'  THEN dl.dose_amount / 1000.0
                WHEN i.base_unit = 'g' AND dl.dose_unit = 'g'   THEN dl.dose_amount
                WHEN dl.dose_unit = 'mcg' THEN dl.dose_amount / 1000.0
                -- A drop against a drop-based item passes through 1:1, like a tab.
                ELSE dl.dose_amount
            END
        ) AS consumed_base
    FROM public.dose_logs dl
    JOIN public.inventory_items i ON i.id = dl.inventory_item_id
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
    -- (026) Drops per dose too, for a dropper with a stated strength per drop.
    CASE WHEN base.inventory_type IN ('oral_solid','dropper') AND base.strength_per_unit > 0
         THEN round(base.planned_dose_base / base.strength_per_unit, 2)
         ELSE NULL
    END AS units_per_dose_oral,
    -- (026) A spare has no doses ready.
    CASE WHEN s.acquired_on IS NULL THEN NULL
         WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0
         THEN NULL
         ELSE floor(base.remaining_base / base.planned_dose_base)
    END AS doses_remaining,
    CASE base.inventory_type
        WHEN 'preconcentrated' THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 2)
        WHEN 'reconstituted'   THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 3)
        WHEN 'oral_solid'      THEN floor(base.remaining_base / NULLIF(COALESCE(base.strength_per_unit, 1),0))
        WHEN 'bulk_powder'     THEN round(base.remaining_base, 1)
        -- (026) mL left for an mL dropper, drops left for one counted in drops.
        WHEN 'dropper'         THEN CASE
            WHEN base.concentration_per_ml IS NOT NULL
            THEN round(base.remaining_base / NULLIF(base.concentration_per_ml,0), 2)
            ELSE floor(base.remaining_base / NULLIF(COALESCE(base.strength_per_unit, 1),0))
        END
    END AS remaining_display,
    CASE
        WHEN s.acquired_on IS NULL THEN NULL
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        ELSE current_date
             + (( floor(base.remaining_base / base.planned_dose_base)
                  / base.est_doses_per_week ) * 7)::int
    END AS est_empty_date,
    CASE
        WHEN s.acquired_on IS NULL THEN NULL
        WHEN base.planned_dose_base IS NULL OR base.planned_dose_base = 0 THEN NULL
        WHEN base.est_doses_per_week IS NULL OR base.est_doses_per_week = 0 THEN NULL
        WHEN EXISTS (
            SELECT 1 FROM public.compound_pauses cp
            WHERE cp.protocol_compound_id = base.protocol_compound_id
              AND cp.is_active
              AND cp.started_on <= current_date
              AND cp.ends_on IS NULL
        ) THEN NULL
        ELSE (( floor(base.remaining_base / base.planned_dose_base)
                / base.est_doses_per_week ) * 7)::int
             + COALESCE((
                 SELECT GREATEST(0, (cp.ends_on - current_date) + 1)::int
                 FROM public.compound_pauses cp
                 WHERE cp.protocol_compound_id = base.protocol_compound_id
                   AND cp.is_active
                   AND cp.started_on <= current_date
                   AND cp.ends_on >= current_date
                 ORDER BY cp.ends_on DESC
                 LIMIT 1
               ), 0)
    END AS days_to_empty,
    -- (026) Appended last so the replace keeps every other column in place.
    (s.acquired_on IS NOT NULL) AS is_started
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
            -- (026) mL × mg/mL, or drops × strength per drop, or drops.
            WHEN 'dropper'         THEN i.total_amount
                                        * COALESCE(i.concentration_mg_per_ml, i.strength_per_unit, 1)
        END AS total_base,
        GREATEST(
            (CASE i.inventory_type
                WHEN 'reconstituted'   THEN i.total_amount
                WHEN 'preconcentrated' THEN i.total_amount * i.concentration_mg_per_ml
                WHEN 'oral_solid'      THEN i.total_amount * COALESCE(i.strength_per_unit, 1)
                WHEN 'bulk_powder'     THEN i.total_amount
                WHEN 'dropper'         THEN i.total_amount
                                            * COALESCE(i.concentration_mg_per_ml, i.strength_per_unit, 1)
             END)
             - COALESCE(i.prior_used_base, 0)
             - COALESCE(c.consumed_base, 0),
            0
        ) AS remaining_base,
        CASE i.inventory_type
            WHEN 'reconstituted'   THEN CASE WHEN i.bac_water_ml > 0
                                             THEN round(i.total_amount / i.bac_water_ml, 3) END
            WHEN 'preconcentrated' THEN i.concentration_mg_per_ml
            -- (026) Only the mL dropper has a concentration; a drop one is NULL.
            WHEN 'dropper'         THEN i.concentration_mg_per_ml
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
    FROM public.inventory_items i
    JOIN public.protocol_compounds pc ON pc.id = i.protocol_compound_id
    LEFT JOIN consumed c ON c.inventory_item_id = i.id
) base
JOIN public.inventory_items s ON s.id = base.inventory_item_id;

GRANT SELECT ON public.v_inventory_math TO authenticated;
GRANT SELECT ON public.v_inventory_math TO service_role;


-- ---------------------------------------------------------------------------
-- 4. `v_compound_stock`: what a compound holds, not what one row holds
-- ---------------------------------------------------------------------------
--
-- Two containers can be open at once and both can be logged from (Adrian,
-- 2026-09-24), and spares are grouped. So "doses left" is a property of the
-- COMPOUND: the doses in every open container, with spares counting only once
-- started. One row per compound with any active stock.
--
-- "Runs dry" is NOT here. It walks forward over the days a dose is due, and
-- which days those are (cadence, cycle, pauses and the resume re-anchor) is
-- decided by the app's schedule model, `isDueOnFor` in `lib/home/stack.ts`.
-- Re-deriving it in SQL would be a second copy of that rule to drift. The
-- arithmetic of what is held stays here; the calendar stays there.

CREATE OR REPLACE VIEW public.v_compound_stock
WITH (security_invoker = true)
AS
SELECT
    i.protocol_compound_id,
    SUM(m.doses_remaining) FILTER (WHERE i.acquired_on IS NOT NULL) AS doses_ready,
    COUNT(*) FILTER (WHERE i.acquired_on IS NOT NULL)               AS open_count,
    COUNT(*) FILTER (WHERE i.acquired_on IS NULL)                   AS spares_held
FROM public.inventory_items i
JOIN public.v_inventory_math m ON m.inventory_item_id = i.id
WHERE i.is_active
GROUP BY i.protocol_compound_id;

GRANT SELECT ON public.v_compound_stock TO authenticated;
GRANT SELECT ON public.v_compound_stock TO service_role;


-- ---------------------------------------------------------------------------
-- 5. The vial a cycle ends on
-- ---------------------------------------------------------------------------
--
-- "Ends when the vial runs out" was withheld (`VIAL_END_SUPPORTED = false`)
-- because there was no way to say WHICH vial. It now ends when a CHOSEN
-- container runs out; NULL means the one being logged from (Adrian,
-- 2026-09-24). It rides the version trail too, mirroring the other cycle
-- columns 1:1 (`006`'s contract).
--
-- OWNERSHIP IS STRUCTURAL, as `009` and `024` require: a composite key to
-- `inventory_items (id, user_id)`, so a row can only name its OWN owner's
-- container. RLS is never applied to a foreign key; a single-column key would
-- let a user point at someone else's vial. `ON DELETE SET NULL (cycle_end_item_id)`
-- clears only that column (Postgres 15+; production is 17.6) so deleting the vial
-- falls back to "the one being logged from" instead of failing.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'inventory_items_id_user_key'
    ) THEN
        ALTER TABLE public.inventory_items
            ADD CONSTRAINT inventory_items_id_user_key UNIQUE (id, user_id);
    END IF;
END $$;

ALTER TABLE public.protocol_compounds
    ADD COLUMN IF NOT EXISTS cycle_end_item_id uuid;
ALTER TABLE public.protocol_compound_schedules
    ADD COLUMN IF NOT EXISTS cycle_end_item_id uuid;

ALTER TABLE public.protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_cycle_end_item_fk;
ALTER TABLE public.protocol_compounds
    ADD CONSTRAINT protocol_compounds_cycle_end_item_fk
    FOREIGN KEY (cycle_end_item_id, user_id)
    REFERENCES public.inventory_items (id, user_id)
    ON DELETE SET NULL (cycle_end_item_id);

ALTER TABLE public.protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_cycle_end_item_fk;
ALTER TABLE public.protocol_compound_schedules
    ADD CONSTRAINT protocol_compound_schedules_cycle_end_item_fk
    FOREIGN KEY (cycle_end_item_id, user_id)
    REFERENCES public.inventory_items (id, user_id)
    ON DELETE SET NULL (cycle_end_item_id);

-- Only a vial-end cycle names a vial, so a stale id cannot survive a switch to
-- another end condition and come back if it is switched again.
ALTER TABLE public.protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_cycle_end_item_shape;
ALTER TABLE public.protocol_compounds
    ADD CONSTRAINT protocol_compounds_cycle_end_item_shape
    CHECK (cycle_end_item_id IS NULL OR cycle_end_type = 'when_vial_empty');

ALTER TABLE public.protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_cycle_end_item_shape;
ALTER TABLE public.protocol_compound_schedules
    ADD CONSTRAINT protocol_compound_schedules_cycle_end_item_shape
    CHECK (cycle_end_item_id IS NULL OR cycle_end_type = 'when_vial_empty');

COMMENT ON COLUMN public.protocol_compounds.cycle_end_item_id IS
    'The container whose running out ends a when_vial_empty cycle. NULL = the '
    'container being logged from. Only ever set when cycle_end_type is '
    'when_vial_empty (026).';


-- The end of the transaction opened at the top. Nothing above is kept unless
-- this runs.
COMMIT;
