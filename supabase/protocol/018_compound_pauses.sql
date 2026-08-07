-- ============================================================================
-- 018 · compound_pauses — stopping for a fortnight without deleting anything
-- ============================================================================
--
-- WHY A TABLE AND NOT COLUMNS
--
-- A compound is paused many times over its life. Columns hold ONE pause, and
-- overwriting an old one retroactively converts its days back into MISSED days —
-- because "missed" is inferred from due-and-unlogged
-- (`components/home/HomeScreen.tsx`), not stored. A holiday you took in March
-- would reappear as a fortnight of failures the moment you paused again in July.
--
-- Modelled on `blocks` (`supabase/blocks/001_blocks.sql`), the only existing
-- shape in this schema with a start, a nullable end and a partial unique index.
--
-- WHY NOT A `stopped` SCHEDULE VERSION
--
-- A stop is open-ended until something supersedes it, and it cannot be written
-- in advance. A pause has a planned END and is routinely backdated. They are
-- different objects that happen to both mean "not right now".
--
-- WHY NOT `is_active = false`
--
-- That is what DELETE writes. A paused compound is still live: still in its
-- stack, still holding stock, still showing on the dashboard. Pause and archive
-- are different states and conflating them loses the difference between "I am
-- taking a break" and "I have stopped taking this".
--
-- BOTH ENDS ARE INCLUSIVE
--
-- `started_on` is the first paused day and `ends_on` is the LAST. Resuming today
-- writes `ends_on = yesterday`, so today is due again. This is stated here
-- because undefined inclusivity is the single most likely source of an
-- off-by-one in this feature, and an off-by-one shows up to the user as a
-- phantom missed day.
--
-- WHY `id` IS CLIENT-GENERATED
--
-- The house pattern: the client writes localStorage synchronously and pushes in
-- the background, so a replay must be idempotent. A server-generated id would
-- insert a second pause on every retry.
--
-- ⚠️ OWNERSHIP IS STRUCTURAL — the composite FK, not just RLS.
--
-- The first draft of this file had a SINGLE-COLUMN FK to `protocol_compounds`
-- plus a unique index not scoped to the owner, which is verbatim the shape
-- `009_ownership_hardening.sql` exists to close: RLS is never applied to a
-- foreign key, so any authenticated user could insert a pause referencing
-- ANOTHER user's compound, occupy their slot on the partial unique index, and
-- lock them out of ever pausing it — with no repair path, because the victim's
-- own cleanup (`WHERE user_id = self`) cannot see the squatting row.
--
-- `protocol_compounds_id_user_key UNIQUE (id, user_id)` already exists from 008,
-- so the composite FK is free. A policy can be reasoned around; a foreign key
-- cannot. `blocks/001` is the model.
--
-- THE PARTIAL UNIQUE INDEX, AND WHAT IT DELIBERATELY DOES NOT COVER
--
-- One INDEFINITE pause per compound, enforced in the database. Overlap between
-- DATED pauses is prevented in app logic instead, and that is not laziness:
-- `current_date` is not immutable and cannot appear in an index predicate, and
-- an exclusion constraint over date ranges would need btree_gist for what the
-- write path already guarantees (a new pause overlapping an existing one extends
-- that row rather than inserting).
--
-- SAFETY: a new table. Nothing existing is touched, and dropping it would leave
-- every compound simply unpaused.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.compound_pauses (
    id                   uuid PRIMARY KEY,
    user_id              uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    protocol_compound_id uuid NOT NULL,
    -- First paused day, inclusive.
    started_on           date NOT NULL,
    -- Last paused day, inclusive. NULL = indefinite.
    ends_on              date,
    -- Shared by every pause one "pause whole stack" action wrote. NULL for a
    -- pause created on a single compound.
    pause_group_id       uuid,
    is_active            boolean NOT NULL DEFAULT true,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pause_order CHECK (ends_on IS NULL OR ends_on >= started_on),
    -- COMPOSITE FK: the compound's owner and the pause's owner must be the SAME
    -- user, enforced by the key rather than by a policy. See the ⚠️ above.
    CONSTRAINT compound_pauses_owner_fk
        FOREIGN KEY (protocol_compound_id, user_id)
        REFERENCES public.protocol_compounds (id, user_id)
        ON DELETE CASCADE
);

ALTER TABLE public.compound_pauses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own compound_pauses - all" ON public.compound_pauses;
CREATE POLICY "own compound_pauses - all" ON public.compound_pauses FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ⚠️ REQUIRED. Every new table needs its own explicit grant or PostgREST answers
-- 42501 for every request against it, whatever RLS says
-- (`supabase/protocol/007_stacks.sql:88-92` is the precedent, and the Blocks
-- table shipped without one and had to be fixed in production).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compound_pauses TO authenticated;

-- The read path: every pause for a compound, in date order.
CREATE INDEX IF NOT EXISTS idx_compound_pauses_compound
    ON public.compound_pauses (protocol_compound_id, started_on);

-- Resolving "what did this one Pause-the-stack action cover".
CREATE INDEX IF NOT EXISTS idx_compound_pauses_group
    ON public.compound_pauses (pause_group_id)
    WHERE pause_group_id IS NOT NULL;

-- The notification runner's own query shape: `user_id + is_active +
-- started_on <= today`, every tick, for every user. Without this it is a seq
-- scan. `blocks/001` has the same index for the same reason.
CREATE INDEX IF NOT EXISTS idx_compound_pauses_user_started
    ON public.compound_pauses (user_id, started_on);

-- ONE indefinite pause per compound, SCOPED TO THE OWNER. The scoping is the
-- second half of the hardening above: an unscoped index is squattable even with
-- the composite FK in place on some shapes, and scoping costs nothing here.
-- Dated overlaps are still prevented in app logic — `current_date` is not
-- immutable and cannot appear in an index predicate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_compound_pauses_one_indefinite
    ON public.compound_pauses (user_id, protocol_compound_id)
    WHERE is_active AND ends_on IS NULL;

DROP TRIGGER IF EXISTS compound_pauses_updated_at ON public.compound_pauses;
CREATE TRIGGER compound_pauses_updated_at BEFORE UPDATE ON public.compound_pauses
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.compound_pauses IS
    'A stretch during which a compound is not being taken. BOTH ENDS INCLUSIVE: '
    'started_on is the first paused day, ends_on the last, so resuming today '
    'writes ends_on = yesterday. NOTHING derived from a pause is ever stored — '
    'no "paused" flag, no rewritten end date, no adjusted remaining — which is '
    'what makes backdating a pause free of any backfill. There is also no job '
    'that resumes one: a dated pause ends because the comparison stops matching.';
