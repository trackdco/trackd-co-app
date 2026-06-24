-- ============================================================
--  TRACKD CO — CUSTOM PROTOCOL COMPOUNDS  (post-v0.4.2, tracked migration)
-- ============================================================
--
--  Lets user-created "Make your own" compounds enter the normalised
--  protocol/inventory chain so they can carry vials + stock runway
--  (v_inventory_math) exactly like catalogue compounds — the
--  "amounts on custom vials" feature (pulled into beta scope).
--
--  Approach (the recommended one): a protocol_compound is now EITHER a
--  catalogue compound (compound_id set — the prior shape) OR a custom one
--  (compound_id NULL + custom_name/custom_category carried on the row).
--  The whole inventory_items + v_inventory_math chain hangs off
--  protocol_compounds and is UNCHANGED, so giving customs a home here
--  lights up stock, runway, dose<->vial linking and low-stock alerts for
--  them with no new inventory schema and no parallel TS maths.
--
--  The read-only `compounds` catalogue is deliberately UNTOUCHED (still
--  service-role-only writes), so Invariant 6 ("seed catalogues are
--  read-only to users") stands. Custom identity lives on the user-owned,
--  already-RLS'd protocol_compounds row — no new access surface.
--
--  Additive + back-compatible: every existing row has compound_id set and
--  custom_name NULL, which satisfies the new identity CHECK; the partial
--  unique index only covers custom rows (compound_id IS NULL), of which
--  there are none yet. No existing functionality changes.
--
--  House patterns: no new table, no new RLS/grants needed —
--  protocol_compounds already has "own protocol_compounds - all" RLS and
--  full DML granted to `authenticated` (supabase/grants/001). New columns
--  inherit the table's grants + policy.
-- ============================================================

-- compound_id becomes optional (NULL => a custom compound).
ALTER TABLE protocol_compounds ALTER COLUMN compound_id DROP NOT NULL;

-- A custom compound carries its own name/category (no catalogue row to join).
ALTER TABLE protocol_compounds ADD COLUMN IF NOT EXISTS custom_name text;
ALTER TABLE protocol_compounds ADD COLUMN IF NOT EXISTS custom_category text;

-- Exactly one identity source: a catalogue id XOR a custom (name + category). The
-- two custom fields move TOGETHER — a custom row must carry both (so reads never
-- silently fall back to a default category) and a catalogue row carries neither.
-- (Idempotent — Postgres has no IF NOT EXISTS for ADD CONSTRAINT, so guard via the
-- catalog.)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'protocol_compound_identity'
    ) THEN
        ALTER TABLE protocol_compounds ADD CONSTRAINT protocol_compound_identity CHECK (
            (compound_id IS NOT NULL AND custom_name IS NULL AND custom_category IS NULL)
            OR (compound_id IS NULL AND custom_name IS NOT NULL AND custom_category IS NOT NULL)
        );
    END IF;
END $$;

-- One custom compound of a given name per cycle. The catalogue uniqueness
-- (UNIQUE (cycle_id, compound_id), supabase/protocol/003) does NOT constrain
-- customs — compound_id is NULL and Postgres treats NULLs as distinct — so add a
-- name-scoped guard that applies only to custom rows. Normalised with
-- lower(btrim(...)) to match the client's trim().toLowerCase() canonicalisation
-- (lib/home/hydrateProtocol.ts), so a case-/whitespace-only variant can't be
-- stored as a second row the client would later collapse into one (hiding it +
-- its attached stock/log data).
CREATE UNIQUE INDEX IF NOT EXISTS protocol_compounds_custom_unique
    ON protocol_compounds (cycle_id, lower(btrim(custom_name)))
    WHERE compound_id IS NULL;
