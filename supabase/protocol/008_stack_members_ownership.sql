-- ============================================================================
-- 008 — stack_members ownership hardening  (fixes a hole shipped in 007)
-- ============================================================================
-- 007's RLS on `stack_members` checked only `user_id = auth.uid()`. Nothing tied
-- the row's `stack_id` or `protocol_compound_id` to the caller, and the
-- one-stack-per-compound unique index is GLOBAL across users. Together that
-- allowed two things the app can never produce:
--
--   1. Inserting a membership row pointing at ANOTHER user's stack (the FK to
--      stacks(id) is satisfied; WITH CHECK only looked at user_id).
--   2. Worse — claiming another user's `protocol_compound_id`. RLS never
--      inspected that column, so the attacker takes the victim's slot on the
--      global unique index. The victim's own membership sync then fails 23505
--      forever, and their cleanup (`delete where user_id = self`) cannot reach
--      the offending row, so there is no repair path.
--
-- The fix is to make ownership STRUCTURAL rather than a policy predicate: a
-- membership row must reference a stack that is yours AND a compound that is
-- yours, enforced by composite foreign keys the database checks on every write.
-- A policy can be reasoned around; a foreign key cannot.
--
-- Idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Parent-side unique constraints, so the composite FKs below have something to
-- point at. Both are redundant with the existing primary keys (id is already
-- unique), which is exactly why they are free — they add an index each and no
-- new restriction.
-- ---------------------------------------------------------------------------
ALTER TABLE stacks
    DROP CONSTRAINT IF EXISTS stacks_id_user_key;
ALTER TABLE stacks
    ADD CONSTRAINT stacks_id_user_key UNIQUE (id, user_id);

ALTER TABLE protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_id_user_key;
ALTER TABLE protocol_compounds
    ADD CONSTRAINT protocol_compounds_id_user_key UNIQUE (id, user_id);

-- ---------------------------------------------------------------------------
-- Clean out any row that already violates ownership before adding the
-- constraints, or the ALTER fails. On a correct database this deletes nothing.
-- ---------------------------------------------------------------------------
DELETE FROM stack_members sm
WHERE NOT EXISTS (
        SELECT 1 FROM stacks s
        WHERE s.id = sm.stack_id AND s.user_id = sm.user_id
      )
   OR NOT EXISTS (
        SELECT 1 FROM protocol_compounds pc
        WHERE pc.id = sm.protocol_compound_id AND pc.user_id = sm.user_id
      );

-- ---------------------------------------------------------------------------
-- Replace the single-column FKs with COMPOSITE ones that carry the owner.
-- A row can now only exist if the stack and the compound both belong to the
-- same user as the row itself.
-- ---------------------------------------------------------------------------
ALTER TABLE stack_members
    DROP CONSTRAINT IF EXISTS stack_members_stack_id_fkey,
    DROP CONSTRAINT IF EXISTS stack_members_protocol_compound_id_fkey,
    DROP CONSTRAINT IF EXISTS stack_members_stack_owner_fkey,
    DROP CONSTRAINT IF EXISTS stack_members_compound_owner_fkey;

ALTER TABLE stack_members
    ADD CONSTRAINT stack_members_stack_owner_fkey
        FOREIGN KEY (stack_id, user_id)
        REFERENCES stacks (id, user_id) ON DELETE CASCADE,
    ADD CONSTRAINT stack_members_compound_owner_fkey
        FOREIGN KEY (protocol_compound_id, user_id)
        REFERENCES protocol_compounds (id, user_id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Scope the one-stack-per-compound rule to the OWNER.
--
-- Globally unique was wrong on both counts: it let one user occupy a slot that
-- belongs to another (the DoS above), and it is not what the rule means. "A
-- compound belongs to at most one stack" is a statement about one user's own
-- data. `protocol_compound_id` is already unique per user via the composite FK,
-- so including user_id costs nothing and closes the cross-tenant collision.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS stack_members_one_stack_per_compound;
CREATE UNIQUE INDEX IF NOT EXISTS stack_members_one_stack_per_compound
    ON stack_members (user_id, protocol_compound_id);
