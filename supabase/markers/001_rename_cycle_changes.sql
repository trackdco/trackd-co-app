-- ============================================================================
--  Spec 04 (wave 2) — rename the "Cycle Changes" marker to "Menstrual Changes"
-- ============================================================================
--  WHY
--  "Cycle" already means a compound run with on/off periods (the `cycles` table,
--  the Protocol "Plan" view, "Week X of N"). A marker also called "Cycle Changes"
--  puts two unrelated meanings of the word in front of the same user — the same
--  collision we are resolving for "stack". This renames the marker; the Cycles
--  feature keeps the word.
--
--  SAFETY
--  * No data migration is needed. `marker_readings` reaches its marker through
--    `user_markers.marker_id` — an id, never the name — so every reading already
--    logged follows the row and keeps rendering, under the new label.
--  * `markers` is a read-only seed catalogue (Invariant 6): users cannot write it,
--    and no write policy exists. This runs as the service role, like every other
--    catalogue seed.
--  * Idempotent: re-running is a no-op once the row is renamed, and it will not
--    fail if a "Menstrual Changes" row somehow already exists (the WHERE NOT
--    EXISTS guard protects the `name` UNIQUE constraint).
--  * `supabase/seed/markers.csv` carries the new name too, so a future re-seed
--    (`ON CONFLICT (name) DO UPDATE`) agrees with this rather than re-inserting
--    the old row.
-- ----------------------------------------------------------------------------

UPDATE markers
SET name = 'Menstrual Changes'
WHERE name = 'Cycle Changes'
  AND NOT EXISTS (
    SELECT 1 FROM markers m2 WHERE m2.name = 'Menstrual Changes'
  );

-- Verify (expect one row, named 'Menstrual Changes'):
--   SELECT id, name, polarity, tier_labels, is_default
--   FROM markers WHERE name IN ('Cycle Changes', 'Menstrual Changes');
