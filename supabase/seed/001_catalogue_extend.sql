-- ============================================================
--  Catalogue extension — enum values + reference_ranges table
--  Companion to trackd_schema_v0_4_2.sql.
--  Applied 2026-06-06 as migration `catalogue_enums_and_reference_ranges`.
--
--  WHY:
--   - The compounds seed uses categories (sarm, thyroid, stimulant) and a
--     unit (g) beyond the original v0_4_2 enums. Approved by Adrian: extend
--     the enums to match the seed rather than remap the data.
--   - IGF-1 reference ranges are age-banded (IGF-1 falls with age), which the
--     flat male/female columns on `biomarkers` cannot hold. A dedicated
--     age/sex-banded `reference_ranges` table stores them. STORED ONLY — not
--     wired into interpretation (informational, not evaluative; see
--     architecture.md invariants 3 & 4).
--
--  NOTE: the ALTER TYPE ... ADD VALUE adds live here; the rows that USE the
--  new values are seeded in a SEPARATE migration, because Postgres forbids
--  using a newly-added enum value in the same transaction that added it.
-- ============================================================

-- --- Enum extensions (idempotent) ---
ALTER TYPE compound_category ADD VALUE IF NOT EXISTS 'sarm';
ALTER TYPE compound_category ADD VALUE IF NOT EXISTS 'thyroid';
ALTER TYPE compound_category ADD VALUE IF NOT EXISTS 'stimulant';
ALTER TYPE dose_unit          ADD VALUE IF NOT EXISTS 'g';

-- --- reference_ranges (age/sex-banded biomarker ranges) ---
-- Reference catalogue, not user-owned. Same access model as `biomarkers`:
-- readable by all authenticated users, written only by the service role
-- (no write policy => RLS denies all user writes).
CREATE TABLE IF NOT EXISTS reference_ranges (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    biomarker_id uuid NOT NULL REFERENCES biomarkers(id) ON DELETE CASCADE,
    sex          sex_type,             -- NULL = applies to any sex
    age_min      smallint NOT NULL,    -- inclusive, years
    age_max      smallint NOT NULL,    -- inclusive, years
    unit         text NOT NULL,        -- unit the ref_low/ref_high are expressed in
    ref_low      numeric(12,4),
    ref_high     numeric(12,4),
    source       text,                 -- provenance / assay caveat
    created_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT reference_ranges_age_valid CHECK (age_min <= age_max),
    -- Idempotent re-seeding: one band per (biomarker, sex, age window).
    -- NULLS NOT DISTINCT so the NULL-sex ('any') rows still de-dupe (PG15+).
    CONSTRAINT reference_ranges_band_unique
        UNIQUE NULLS NOT DISTINCT (biomarker_id, sex, age_min, age_max)
);

ALTER TABLE reference_ranges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reference_ranges readable by all authed" ON reference_ranges;
CREATE POLICY "reference_ranges readable by all authed" ON reference_ranges
    FOR SELECT TO authenticated USING (true);
-- (No insert/update/delete policy => only the service role / seeding can write.)

CREATE INDEX IF NOT EXISTS idx_reference_ranges_biomarker
    ON reference_ranges(biomarker_id);
