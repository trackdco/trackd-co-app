-- Migration: protocol_compound_uniqueness
--
-- Closes the "duplicate compounds" class of bug (two of the same compound in a
-- user's protocol). Two gaps allowed it:
--   1. protocol_compounds had only a PRIMARY KEY on `id` — nothing stopped two
--      rows for the same (cycle, compound). The read-merge only de-duplicated the
--      local/mirror extras against the Postgres pull, never the pull against
--      itself, so once two rows existed they BOTH rendered as stack rows.
--   2. The single-active-cycle index was authored but left commented out, so a
--      concurrent ensureActiveCycle() race (the inline "Got a vial?" path fires
--      pushProtocolCompound twice at once) could spawn two "Current" cycles.
--
-- This migration first consolidates/dedupes any existing rows (a no-op on clean
-- data — verified zero offending groups before applying) and then adds the two
-- DB-level guards. Idempotent: safe to re-run.

-- 1. One active cycle per user. Keep the OLDEST active cycle as the keeper; move
--    that user's protocol_compounds out of any other active cycle onto it, then
--    deactivate the extras. (Compounds in already-inactive cycles are archived
--    history and stay put.)
WITH keeper AS (
  SELECT DISTINCT ON (user_id) user_id, id AS cycle_id
  FROM cycles
  WHERE is_active
  ORDER BY user_id, created_at ASC, id ASC
)
UPDATE protocol_compounds pc
SET cycle_id = k.cycle_id
FROM keeper k
WHERE pc.user_id = k.user_id
  AND pc.cycle_id <> k.cycle_id
  AND EXISTS (SELECT 1 FROM cycles c WHERE c.id = pc.cycle_id AND c.is_active);

WITH keeper AS (
  SELECT DISTINCT ON (user_id) user_id, id AS cycle_id
  FROM cycles
  WHERE is_active
  ORDER BY user_id, created_at ASC, id ASC
)
UPDATE cycles c
SET is_active = false
FROM keeper k
WHERE c.user_id = k.user_id
  AND c.is_active
  AND c.id <> k.cycle_id;

-- 2. De-dupe protocol_compounds within (cycle_id, compound_id). Keep the best row
--    (active first, then most-recently-updated); re-point its inventory items and
--    dose logs to the keeper so no history is lost; delete the losers.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER w AS keeper_id,
         row_number()    OVER w AS rn
  FROM protocol_compounds
  WINDOW w AS (
    PARTITION BY cycle_id, compound_id
    ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
  )
)
UPDATE inventory_items i
SET protocol_compound_id = r.keeper_id
FROM ranked r
WHERE i.protocol_compound_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER w AS keeper_id,
         row_number()    OVER w AS rn
  FROM protocol_compounds
  WINDOW w AS (
    PARTITION BY cycle_id, compound_id
    ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
  )
)
UPDATE dose_logs d
SET protocol_compound_id = r.keeper_id
FROM ranked r
WHERE d.protocol_compound_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY cycle_id, compound_id
           ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM protocol_compounds
)
DELETE FROM protocol_compounds pc
USING ranked r
WHERE pc.id = r.id AND r.rn > 1;

-- 3. The guards.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_cycle_per_user
  ON cycles(user_id) WHERE is_active;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'protocol_compounds_cycle_compound_unique'
  ) THEN
    ALTER TABLE protocol_compounds
      ADD CONSTRAINT protocol_compounds_cycle_compound_unique
      UNIQUE (cycle_id, compound_id);
  END IF;
END $$;
