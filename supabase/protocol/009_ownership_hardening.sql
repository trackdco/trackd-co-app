-- ============================================================================
-- 009 — ownership hardening for the tables 008 missed
-- ============================================================================
-- 008 diagnosed a class of hole and fixed ONE table. A security review found the
-- identical shape live on three more constraints. The shape is:
--
--   * RLS that checks only `user_id = auth.uid()`, and
--   * a SINGLE-COLUMN foreign key, which RLS is never applied to, and
--   * a UNIQUE index that is NOT scoped to the owner.
--
-- Together those let an authenticated user insert a row that references ANOTHER
-- user's parent and occupy that parent's slot on the unique index. The victim's
-- own upsert then collides forever, and their cleanup (`… WHERE user_id = self`)
-- cannot see the squatting row, so there is no repair path. Not data disclosure,
-- but a permanent denial of sync, which for a tracking app is worse than it sounds.
--
-- The fix, as in 008: make ownership STRUCTURAL with composite foreign keys the
-- database checks on every write, and scope the unique indexes to the owner. A
-- policy can be reasoned around; a foreign key cannot.
--
-- Idempotent and safe to re-run. `protocol_compounds_id_user_key` already exists
-- from 008, so the parent side of the first fix is free.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. protocol_compound_schedules (from 005; 006 added cycle columns to it
--    without noticing). Squatting (protocol_compound_id, effective_from) makes
--    the victim's pushScheduleVersions upsert fail 42501 forever, which silently
--    stops the trail that PREVENTS retroactive schedule rewrites from being
--    backed up at all.
-- ---------------------------------------------------------------------------
ALTER TABLE protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_protocol_compound_id_fkey,
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_owner_fkey;

-- Any row already violating ownership must go, or the ALTER fails. On a correct
-- database this deletes nothing.
DELETE FROM protocol_compound_schedules pcs
WHERE NOT EXISTS (
    SELECT 1 FROM protocol_compounds pc
    WHERE pc.id = pcs.protocol_compound_id AND pc.user_id = pcs.user_id
);

ALTER TABLE protocol_compound_schedules
    ADD CONSTRAINT protocol_compound_schedules_owner_fkey
        FOREIGN KEY (protocol_compound_id, user_id)
        REFERENCES protocol_compounds (id, user_id) ON DELETE CASCADE;

-- Scope the version key to the owner. Two users can now legitimately hold a
-- version for the same day without colliding, which is what it always meant.
-- NOTE the app upserts with `onConflict: "user_id,protocol_compound_id,
-- effective_from"`, which must name a real unique CONSTRAINT (not just an index)
-- for PostgREST to resolve it. `lib/home/protocolSync.ts` is updated in the same
-- change; re-scoping this without that would fail every schedule-version write.
ALTER TABLE protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_unique;
ALTER TABLE protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_owner_unique;
ALTER TABLE protocol_compound_schedules
    ADD CONSTRAINT protocol_compound_schedules_owner_unique
        UNIQUE (user_id, protocol_compound_id, effective_from);

-- ---------------------------------------------------------------------------
-- 2. The version trail also had NO shape CHECK, breaking 006's own stated
--    "mirror each other 1:1" contract with protocol_compounds. Bare smallints
--    meant a NEGATIVE cycle_end_rounds was storable, and
--    `round >= cycle.end.rounds` then reports the cycle ended from its anchor
--    day onward — silently removing every dose for that compound from the
--    calendar and from adherence.
-- ---------------------------------------------------------------------------
ALTER TABLE protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS protocol_compound_schedules_cycle_sane;
ALTER TABLE protocol_compound_schedules
    ADD CONSTRAINT protocol_compound_schedules_cycle_sane CHECK (
        (cycle_on_days    IS NULL OR cycle_on_days    > 0)
    AND (cycle_off_days   IS NULL OR cycle_off_days   >= 0)
    AND (cycle_end_rounds IS NULL OR cycle_end_rounds > 0)
    AND (cycle_colour     IS NULL OR cycle_colour IN (
            'slate','steel','teal','moss','olive','bronze',
            'clay','rosewood','mauve','plum','indigo','stone'))
    );

-- ---------------------------------------------------------------------------
-- 3. protocol_compounds' own uniques (003 and 004) are keyed on cycle_id, whose
--    FK to cycles(id) is single-column — so a row can point at another user's
--    cycle and squat (cycle_id, compound_id) or (cycle_id, custom_name).
-- ---------------------------------------------------------------------------
ALTER TABLE cycles
    DROP CONSTRAINT IF EXISTS cycles_id_user_key;
ALTER TABLE cycles
    ADD CONSTRAINT cycles_id_user_key UNIQUE (id, user_id);

DELETE FROM protocol_compounds pc
WHERE NOT EXISTS (
    SELECT 1 FROM cycles c WHERE c.id = pc.cycle_id AND c.user_id = pc.user_id
);

ALTER TABLE protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_cycle_id_fkey,
    DROP CONSTRAINT IF EXISTS protocol_compounds_cycle_owner_fkey;
ALTER TABLE protocol_compounds
    ADD CONSTRAINT protocol_compounds_cycle_owner_fkey
        FOREIGN KEY (cycle_id, user_id)
        REFERENCES cycles (id, user_id) ON DELETE CASCADE;

-- With the composite FK above, cycle_id can only ever be the caller's own cycle,
-- so these two keys are now implicitly owner-scoped and need no change. Recorded
-- here so a future reader does not have to re-derive it:
--   * protocol_compounds_cycle_compound_key  UNIQUE (cycle_id, compound_id)
--   * the (cycle_id, lower(btrim(custom_name))) partial index from 004
