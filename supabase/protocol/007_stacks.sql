-- ============================================================================
-- 007 — stacks  (Spec 05 · part two)
-- ============================================================================
-- A stack is a DISPLAY GROUPING over compounds taken at the same time. It is
-- NOT a container: every member keeps its own schedule, dose, dose_logs and
-- history, and removing a compound from a stack changes nothing about that
-- compound.
--
-- That property is structural here, not a convention. `stacks` holds a name and
-- a colour; `stack_members` holds nothing but the pairing and an order. There is
-- no dose, schedule, time or log column anywhere in this migration, and
-- `protocol_compounds` GAINS NO COLUMN — so a stack has nowhere to store
-- anything about a member even if a later change tried to.
--
-- (A `stack_id` column on `protocol_compounds` would enforce one-stack-per-
-- compound just as well and query slightly faster, but it would put a
-- stack-owned field on the member, which is exactly what the spec forbids.)
--
-- STRICTLY ADDITIVE: two new tables, no existing row touched, no backfill. A
-- user with no stacks is unaffected in every way.
-- ============================================================================

CREATE TABLE IF NOT EXISTS stacks (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- Required and user-chosen. 80 chars matches the compound picker's existing
    -- NAME_MAX rather than inventing a second limit.
    name        text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),

    -- One of the twelve palette NAMES (ui-context.md → User palette). Stored as
    -- a name, never a hex value, so retuning the palette is a globals.css edit
    -- and never a data migration.
    colour      text NOT NULL CHECK (colour IN (
                    'slate','steel','teal','moss','olive','bronze',
                    'clay','rosewood','mauve','plum','indigo','stone')),

    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stacks_user_idx ON stacks (user_id);

CREATE TABLE IF NOT EXISTS stack_members (
    stack_id             uuid NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
    protocol_compound_id uuid NOT NULL
                         REFERENCES protocol_compounds(id) ON DELETE CASCADE,
    user_id              uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

    -- The user's chosen order within the stack.
    position             smallint NOT NULL DEFAULT 0,

    PRIMARY KEY (stack_id, protocol_compound_id)
);

-- THE one-stack-per-compound rule, as a constraint rather than an app check: a
-- compound can appear in `stack_members` at most once, full stop. (The PK above
-- separately stops it appearing twice inside the SAME stack.)
CREATE UNIQUE INDEX IF NOT EXISTS stack_members_one_stack_per_compound
    ON stack_members (protocol_compound_id);

CREATE INDEX IF NOT EXISTS stack_members_stack_idx ON stack_members (stack_id);

-- Deleting a MEMBER COMPOUND cascades to its membership row only — the stack
-- survives with one fewer member, and every dose_log for that compound is
-- untouched (Invariant 8; nothing about a member's history lives here).
-- Deleting a STACK cascades to its membership rows only — the compounds keep
-- running, ungrouped.

-- ---------------------------------------------------------------------------
-- RLS — own rows only, the house pattern: (SELECT auth.uid()), never bare.
-- ---------------------------------------------------------------------------
ALTER TABLE stacks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own stacks - all" ON stacks;
CREATE POLICY "own stacks - all" ON stacks
    FOR ALL
    USING       ((SELECT auth.uid()) = user_id)
    WITH CHECK  ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "own stack_members - all" ON stack_members;
CREATE POLICY "own stack_members - all" ON stack_members
    FOR ALL
    USING       ((SELECT auth.uid()) = user_id)
    WITH CHECK  ((SELECT auth.uid()) = user_id);

-- RLS gates rows; a table-level GRANT is what lets the API role reach the table
-- at all. This project's defaults do not auto-grant, so any new public table
-- must ship its own (see architecture.md → Auth and Access Model).
GRANT SELECT, INSERT, UPDATE, DELETE ON stacks        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON stack_members TO authenticated;

-- Keep `updated_at` honest, reusing the existing trigger function.
DROP TRIGGER IF EXISTS set_stacks_updated_at ON stacks;
CREATE TRIGGER set_stacks_updated_at
    BEFORE UPDATE ON stacks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
