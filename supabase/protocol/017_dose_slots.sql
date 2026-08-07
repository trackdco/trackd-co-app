-- ============================================================================
-- 017 · dose_logs.slot_index — more than one dose a day
-- ============================================================================
--
-- WHY
--
-- `times_per_day` has been on `protocol_compounds` since v0.4.2 and nothing has
-- ever been able to satisfy it. A dose log is one row per compound per day at
-- BOTH ends — `doseLogRowId` hashes (user, day, compound) and the device store
-- keys a day's entry by compound id — so logging a compound twice overwrote the
-- first dose with the second. A 2× daily compound could be logged once.
--
-- WHY A DEFAULT OF 0, AND WHY THAT NEEDS NO BACKFILL
--
-- Every row ever written is the day's first dose, which is slot 0. `DEFAULT 0`
-- plus `NOT NULL` makes every existing row correct the moment the column exists,
-- with no UPDATE pass over the table.
--
-- That is only half of it. The other half is in `lib/home/doseLogIds.ts`: slot 0
-- seeds the row id with the OLD string, unsuffixed, so an existing row keeps the
-- id it already has. Had slot 0 changed the seed, every historical row would
-- have got a new id and the next push would have inserted duplicates alongside
-- the originals rather than updating them. The two halves have to agree; do not
-- change one without the other.
--
-- WHAT A SLOT IS, AND WHAT IT IS NOT
--
-- A slot is an INDEX into that day's `dose_times`, never a time. It is resolved
-- against the schedule version in force ON THAT DAY (`supabase/protocol/005`),
-- not today's — otherwise reordering your dose times, or dropping from 3× to 2×
-- daily, would retroactively relabel history and a dose logged at 20:00 would
-- start displaying as 14:00.
--
-- It follows that a slot may legitimately exceed the CURRENT `times_per_day`:
-- those are past doses that were genuinely taken, not errors, and they must
-- still render. That is why the CHECK below is `>= 0` and nothing more — a
-- constraint against `times_per_day` would be a constraint against a value that
-- changes, and it would start rejecting history.
--
-- PER-SLOT AMOUNTS ARE DELIBERATELY NOT HERE. A compound dosed 2× daily delivers
-- `dose_amount` twice. 100 mg in the morning and 50 mg at night needs a per-slot
-- column on the SCHEDULE, not just an index on the log, and that is its own
-- change.
--
-- SAFETY: additive. One NOT NULL column with a default on an existing table, and
-- a CHECK that every possible value of that default satisfies.
-- ============================================================================

ALTER TABLE public.dose_logs
    ADD COLUMN IF NOT EXISTS slot_index smallint NOT NULL DEFAULT 0;

ALTER TABLE public.dose_logs DROP CONSTRAINT IF EXISTS dose_logs_slot_index_check;
ALTER TABLE public.dose_logs
    ADD CONSTRAINT dose_logs_slot_index_check CHECK (slot_index >= 0);

COMMENT ON COLUMN public.dose_logs.slot_index IS
    'Which of the day''s scheduled doses this row is: an INDEX into the '
    'dose_times of the schedule version in force on logged_for, never a time. 0 '
    'for every row written before supabase/protocol/017, which is why it needs '
    'no backfill. May exceed the compound''s CURRENT times_per_day — those are '
    'doses genuinely taken under an older schedule, not errors.';
