-- ============================================================
--  TRACKD CO — HEIGHT RANGE 120–230 cm  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Tighten the profiles.height_sane CHECK from 100–250 cm to a realistic-but-
--  generous adult range of 120–230 cm (≈ 47–91 in), matching the Settings form +
--  server validation (Context/Feature Specs/07, last paragraph; Adrian-approved
--  range, 2026-06-12). 120 cm keeps little-people adults in range while dropping
--  the unrealistic sub-120 floor; 230 cm clears all but the most extreme outliers.
--  Pre-checked safe: no existing profile row falls outside 120–230 (the live
--  heights are 188–191 cm), so re-adding the CHECK validates cleanly.
--
--  NOTE: this re-declares a constraint from the canonical schema
--  (trackd_schema_v0_4_2.sql, a protected file). Recorded here as the deliberate,
--  versioned change; the canonical file still describes the original v0.4.2 shape.
-- ============================================================

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS height_sane;
ALTER TABLE profiles
  ADD CONSTRAINT height_sane
  CHECK (height_cm IS NULL OR (height_cm >= 120 AND height_cm <= 230));
