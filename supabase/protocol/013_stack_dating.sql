-- ============================================================================
-- 013 — stacks are DATED  (Spec 05, fixing a hole shipped in 007)
-- ============================================================================
-- 007 gave a stack a name, a colour and a set of members, and no time dimension
-- whatsoever. The dashboard applies the grouping to whichever day is on screen,
-- so a stack created this morning was drawn over every day already lived: a
-- stack named "Vitamins" appeared on days when only creatine existed, and adding
-- a fourth member next month would have re-grouped every day before it joined.
--
-- Spec 01 already settled the principle for schedules — a change applies from the
-- chosen day FORWARD and never rewrites the past — and built
-- `protocol_compound_schedules` to enforce it. Stacks were simply built without
-- it. This migration applies the same rule to the one part of the protocol still
-- missing it:
--
--   * `stacks.effective_from`        — the day the grouping began.
--   * `stack_members.effective_from` — the day this compound joined.
--   * `stack_members.effective_to`   — EXCLUSIVE; NULL means it is still a member.
--
-- Backfill is exact where the database knows the answer (`stacks.created_at`) and
-- inherited where it does not (a member's start becomes its stack's start, which
-- is the only claim the undated shape supports). No membership is invented and
-- none is dropped: every existing row comes out still current.
--
-- Idempotent and safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. stacks.effective_from — exact, from the row's own creation timestamp.
--
-- `created_at` is timestamptz and the cast lands in the DATABASE's timezone (UTC
-- on Supabase), so a stack created late evening in a positive-offset zone can
-- backfill one day late. That is the safe direction — a stack that starts a day
-- later under-groups one day rather than falsely claiming days it never covered,
-- which is the entire bug being fixed. New rows are dated by the client, which
-- knows the user's real local day.
-- ---------------------------------------------------------------------------
ALTER TABLE stacks ADD COLUMN IF NOT EXISTS effective_from date;

UPDATE stacks SET effective_from = created_at::date WHERE effective_from IS NULL;

ALTER TABLE stacks ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;
ALTER TABLE stacks ALTER COLUMN effective_from SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. stack_members spans.
--
-- A member inherits its stack's start: under the undated shape it was in the
-- stack for the whole of the stack's life, and that is what the data says.
-- ---------------------------------------------------------------------------
ALTER TABLE stack_members ADD COLUMN IF NOT EXISTS effective_from date;
ALTER TABLE stack_members ADD COLUMN IF NOT EXISTS effective_to   date;

UPDATE stack_members sm
SET    effective_from = s.effective_from
FROM   stacks s
WHERE  s.id = sm.stack_id
  AND  sm.effective_from IS NULL;

-- Any orphan the join could not reach (there should be none — the composite FK
-- in 008 makes it impossible) still needs a value before the NOT NULL lands.
UPDATE stack_members SET effective_from = CURRENT_DATE WHERE effective_from IS NULL;

ALTER TABLE stack_members ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;
ALTER TABLE stack_members ALTER COLUMN effective_from SET NOT NULL;

-- EXCLUSIVE end, so `effective_to = effective_from` would be a span covering no
-- day at all. The client prunes those rather than storing them; this refuses
-- them outright, so a membership row always describes at least one real day.
ALTER TABLE stack_members DROP CONSTRAINT IF EXISTS stack_members_span_valid;
ALTER TABLE stack_members
    ADD CONSTRAINT stack_members_span_valid
    CHECK (effective_to IS NULL OR effective_to > effective_from);

-- ---------------------------------------------------------------------------
-- 3. The primary key has to go.
--
-- 007's PK was (stack_id, protocol_compound_id) — one row per compound per
-- stack, forever. With spans, leaving a stack and rejoining it later is two
-- rows, and that PK would reject the second. A surrogate key replaces it; the
-- real rules are the two indexes below, which is where they belong.
--
-- Nothing references stack_members, so dropping its PK breaks no foreign key.
-- The composite owner FKs added in 008 point at `stacks` and `protocol_compounds`
-- and are untouched.
-- ---------------------------------------------------------------------------
ALTER TABLE stack_members ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'stack_members_pkey' AND conrelid = 'stack_members'::regclass
          AND conkey <> (
              SELECT array_agg(attnum ORDER BY attnum) FROM pg_attribute
              WHERE attrelid = 'stack_members'::regclass AND attname = 'id'
          )
    ) THEN
        ALTER TABLE stack_members DROP CONSTRAINT stack_members_pkey;
        ALTER TABLE stack_members ADD CONSTRAINT stack_members_pkey PRIMARY KEY (id);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. One-stack-per-compound, now scoped to the PRESENT.
--
-- 008 scoped this rule to the owner and explained why. Dating adds a second
-- scope: the rule means "a compound is in at most one stack RIGHT NOW". A closed
-- span is history and must not occupy the slot, or a compound could never be
-- moved from one stack to another. The partial predicate says exactly that, and
-- it also covers "at most one open span per (stack, compound)" — a stricter
-- index on that pair would be redundant.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS stack_members_one_stack_per_compound;
DROP INDEX IF EXISTS stack_members_one_current_stack_per_compound;
CREATE UNIQUE INDEX stack_members_one_current_stack_per_compound
    ON stack_members (user_id, protocol_compound_id)
    WHERE effective_to IS NULL;

-- Resolution reads a stack's members and picks the spans covering a date, so
-- this is the access path that matters.
CREATE INDEX IF NOT EXISTS stack_members_stack_span_idx
    ON stack_members (stack_id, effective_from, effective_to);
