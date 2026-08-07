-- ============================================================================
-- 014 · bulk powder — the fourth inventory form
-- ============================================================================
--
-- ⚠️⚠️ DO NOT PASTE THIS WHOLE FILE INTO THE SQL EDITOR AS ONE BLOCK. ⚠️⚠️
--
-- `ALTER TYPE ... ADD VALUE` commits the new label, but the VALUE CANNOT BE
-- USED in the same transaction that added it — and the SQL Editor wraps a pasted
-- block in one transaction. PART A below names `bulk_powder`; PART B uses it in
-- a CHECK constraint. Run PART A, wait for it to succeed, then run PART B.
-- Pasting both together fails with
--   `unsafe use of new value "bulk_powder" of enum type inventory_type`
-- and leaves the enum extended but the constraint un-replaced, which is a
-- half-applied migration. Re-running PART B alone fixes that.
--
-- WHY
--
-- A tub of creatine or whey is not any of the three existing forms. It is not a
-- vial, and calling it `oral_solid` is a category error with real consequences:
-- `oral_solid` is counted (100 tabs × 25 mg each) and a tub is WEIGHED (1 kg,
-- scooped). The existing CHECK forces `strength_per_unit_mg IS NOT NULL` and
-- `total_amount_unit IN ('tab','capsule')`, so a tub could not be stored at all —
-- there is no tab, and there is no per-tab strength.
--
-- The container artwork has drawn a tub for these for a while (`containerFormFor`
-- infers it from the catalogue's dose unit: grams are scooped). That inference is
-- the picture only. This is the storage behind the picture.
--
-- WHY GRAMS GET THEIR OWN UNIT FAMILY
--
-- `unit_family_compatible` gains `g`, accepting `g` or `mg`. `g` is deliberately
-- NOT added to the existing `mg` family, because the families exist to stop a
-- dose being subtracted from the wrong base: with `g` inside the `mg` family, a
-- 5 g dose could be logged against a 5 mg peptide vial and would empty it a
-- thousand times over with no error. A tub accepts grams and milligrams; an
-- mg-tracked item still accepts only mg and mcg.
--
-- SERVING SIZE IS A CONVENIENCE, NEVER THE UNIT OF INVENTORY
--
-- `serving_size_g` powers a quick-add chip and a scoop-to-grams conversion. The
-- tub is tracked in grams and nothing else: `total_amount` is the tub weight and
-- `base_unit` is `g`. A scoop is how a human measures; a gram is how the maths
-- works. The CHECK confines the column to `bulk_powder` so it cannot appear on a
-- vial and imply something false about it.
--
-- SAFETY: additive. One new enum label, one nullable column, and a CHECK that
-- gains a fourth branch while the existing three are reproduced VERBATIM — every
-- existing row satisfies exactly the branch it satisfied before.
-- ============================================================================


-- ============================================================================
-- PART A — RUN THIS ON ITS OWN, FIRST. Nothing else in this file.
-- ============================================================================

ALTER TYPE public.inventory_type ADD VALUE IF NOT EXISTS 'bulk_powder';

-- `g` on `dose_unit`. It is believed to have been appended during catalogue
-- seeding (`lib/db/doseUnits.ts` mirrors it), but that was never verified
-- against the database, so this adds it only if it is genuinely absent.
ALTER TYPE public.dose_unit ADD VALUE IF NOT EXISTS 'g';


-- ============================================================================
-- PART B — RUN THIS SECOND, ONCE PART A HAS COMMITTED.
-- ============================================================================

ALTER TABLE public.inventory_items
    ADD COLUMN IF NOT EXISTS serving_size_g numeric(10,3);

COMMENT ON COLUMN public.inventory_items.serving_size_g IS
    'Grams in one scoop/serving, for a bulk_powder only. A CONVENIENCE: powers '
    'the quick-add chip and the scoop-to-grams conversion. Inventory is tracked '
    'in grams regardless, so this is never a unit of stock. NULL = not stated.';

-- The four-branch type CHECK. The first three branches are reproduced verbatim
-- from `trackd_schema_v0_4_2.sql:560-583` — if you are diffing, only the
-- `bulk_powder` branch and the trailing `serving_size_g` clause are new.
ALTER TABLE public.inventory_items DROP CONSTRAINT IF EXISTS inv_type_fields;
ALTER TABLE public.inventory_items ADD CONSTRAINT inv_type_fields CHECK (
    (
        (inventory_type = 'reconstituted'
            AND bac_water_ml IS NOT NULL
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit_mg IS NULL
            AND base_unit IN ('mg','iu')
            -- FIX D: the powder's stated amount IS the tracking base —
            -- the two units can't coherently differ for this type
            AND total_amount_unit = base_unit)
        OR
        (inventory_type = 'preconcentrated'
            AND concentration_mg_per_ml IS NOT NULL
            AND bac_water_ml IS NULL
            AND strength_per_unit_mg IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit = 'ml')
        OR
        (inventory_type = 'oral_solid'
            AND strength_per_unit_mg IS NOT NULL
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND base_unit = 'mg'
            AND total_amount_unit IN ('tab','capsule'))
        OR
        -- NEW. A tub: a weight, in grams, and nothing else. No BAC water, no
        -- concentration, no per-unit strength — none of those are facts about a
        -- tub. `total_amount` is the tub weight and `base_unit = 'g'`, so the
        -- stated amount IS the tracking base, exactly as for `reconstituted`.
        (inventory_type = 'bulk_powder'
            AND bac_water_ml IS NULL
            AND concentration_mg_per_ml IS NULL
            AND strength_per_unit_mg IS NULL
            AND base_unit = 'g'
            AND total_amount_unit = 'g')
    )
    -- A serving size is meaningless on anything that is not scooped, and a value
    -- sitting on a vial would imply a fact about it that is not true.
    AND (serving_size_g IS NULL OR inventory_type = 'bulk_powder')
);

-- Grams as their OWN family — see the header. `g` accepts `g` or `mg`; the `mg`
-- family is untouched, so no mg-tracked item starts accepting grams.
CREATE OR REPLACE FUNCTION public.unit_family_compatible(
    item_base public.dose_unit,
    dose      public.dose_unit
)
RETURNS boolean AS $$
    SELECT (item_base = 'mg' AND dose IN ('mg','mcg'))
        OR (item_base = 'iu' AND dose = 'iu')
        OR (item_base = 'g'  AND dose IN ('g','mg'));
$$ LANGUAGE sql IMMUTABLE
-- ⚠️ RESTATED, not decoration. `hardening/001` set this to close the advisor's
-- `function_search_path_mutable` finding, and CREATE OR REPLACE FUNCTION takes
-- every property except ownership and permissions from the NEW command — so
-- omitting it here silently un-hardens the function.
SET search_path = '';
