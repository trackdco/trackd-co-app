-- ============================================================================
-- 020 · one_off_logs — something you took once, off-plan
-- ============================================================================
--
-- WHY NOT `dose_logs`
--
-- `dose_logs.protocol_compound_id` is NOT NULL, and its id is deterministic per
-- (user, day, compound, slot) at BOTH ends — the row id and the device store
-- key. A one-off has no protocol row to point at, and two one-offs of the same
-- thing on the same day must both survive, which a deterministic key makes
-- impossible by construction.
--
-- THE ONE TABLE IN THIS APP WITH A RANDOM ID
--
-- Everywhere else the id is derived so a replay overwrites in place. Here there
-- is nothing to derive it FROM that would not collide with a legitimate second
-- entry. The id is generated on the client, held in localStorage from the moment
-- of writing, and reused on every replay — which is what preserves idempotency
-- without a deterministic key. Do not "fix" this into a hash of its fields.
--
-- ⚠️ `compound_id` POINTS AT THE CATALOGUE, NEVER AT A PROTOCOL ROW.
--
-- This is the whole design, and it is Adrian's call (2026-08-07) over the spec's
-- "a one-off log references nothing". He wanted these to show up in HISTORY —
-- the calendar, a block's look-back — while still counting toward nothing.
--
-- Those two only reconcile if the reference is to the read-only CATALOGUE. A
-- catalogue compound is a name, a category and a default unit; it carries no
-- schedule, no stock and no adherence, so none of those can follow a one-off
-- into a place it does not belong. Point this at `protocol_compounds` instead
-- and the row lands in that compound's dose history, its consistency
-- denominator and its stock depletion — automatically, and then keeping it out
-- of them becomes a special case in every reader rather than a property of the
-- data. **Do not repoint this column.**
--
-- `compound_id` is NULLABLE because a user's OWN compound ("Make your own")
-- has no catalogue row — its identity lives on the device. `label` is therefore
-- always written and is what every surface displays; `compound_id` is the extra
-- that lets history draw the right container and category when there is one.
--
-- WHAT IT IS EXCLUDED FROM, AND WHY THAT IS NOT A LIST OF SPECIAL CASES
--
-- Consistency, the runway, stock and the compound picker all read
-- `protocol_compounds` / `dose_logs`. This table is not either of them, so it is
-- excluded from all four by NOT BEING THERE, rather than by four filters
-- somebody has to remember to write.
--
-- SAFETY: a new table. Nothing existing is touched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.one_off_logs (
    id          uuid PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
    -- The CATALOGUE compound, when it is one. See the ⚠️ above before changing
    -- what this references. ON DELETE SET NULL: the catalogue is read-only and
    -- nothing deletes from it today, but a one-off must survive if that ever
    -- changes — `label` still names it.
    compound_id uuid REFERENCES public.compounds (id) ON DELETE SET NULL,
    -- Always written, catalogue match or not. Every surface displays THIS.
    label       text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
    amount      numeric(10,3),
    -- `text` with a CHECK, deliberately NOT the `dose_unit` enum. That enum is
    -- guarded by three unit-family triggers protecting inventory maths, and a
    -- one-off touches no inventory — so it may say `scoop`, which the enum has
    -- no business learning.
    unit        text CHECK (
                    unit IS NULL
                    OR unit IN ('g','mg','mcg','iu','ml','tab','capsule','scoop')
                ),
    -- The DEVICE's local day, on the same terms as `dose_logs.logged_for`: only
    -- written when the device vouches for it, never `current_date` in SQL. The
    -- server cannot know which calendar day the user was standing in.
    logged_for  date NOT NULL,
    taken_at    timestamptz NOT NULL DEFAULT now(),
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.one_off_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own one_off_logs - all" ON public.one_off_logs;
CREATE POLICY "own one_off_logs - all" ON public.one_off_logs FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- ⚠️ REQUIRED. Every new table needs its own explicit grant or PostgREST answers
-- 42501 for every request against it, whatever RLS says
-- (`supabase/protocol/007_stacks.sql:88-92` is the precedent, and Blocks shipped
-- without one and had to be fixed in production).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.one_off_logs TO authenticated;

-- The read path: a user's logs for a day, or across a window.
CREATE INDEX IF NOT EXISTS idx_one_off_logs_user_day
    ON public.one_off_logs (user_id, logged_for);

COMMENT ON TABLE public.one_off_logs IS
    'Something taken once, off-plan. Has no protocol_compound_id and no '
    'inventory_item_id, which is what keeps it out of consistency, the runway '
    'and stock — by absence rather than by filters. compound_id points at the '
    'read-only CATALOGUE so history can name and draw it; repointing that at '
    'protocol_compounds would drag it into everything it is meant to stay out '
    'of. The id is client-generated and RANDOM, uniquely in this app: two '
    'one-offs of the same thing on the same day must both survive.';
