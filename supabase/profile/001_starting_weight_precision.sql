-- ============================================================
--  TRACKD CO — STARTING WEIGHT PRECISION  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Widen profiles.weight_kg from numeric(5,1) → numeric(5,2) so the profile
--  "Starting weight" honours the input rule of up to 2 decimal places
--  (Context/Feature Specs/08 → B4/B5). Additive + safe: precision stays 5 (max
--  999.99), the 30–300 kg range fits in 3 integer + 2 decimal digits, and the
--  existing weight_sane CHECK is unaffected. Existing values re-represent
--  losslessly (e.g. 95.0 → 95.00).
--
--  NOTE: this changes a column declared in the canonical schema
--  (trackd_schema_v0_4_2.sql, a protected file). Recorded here as the deliberate,
--  versioned change; the canonical file still describes the original v0.4.2 shape.
-- ============================================================

ALTER TABLE profiles ALTER COLUMN weight_kg TYPE numeric(5,2);
