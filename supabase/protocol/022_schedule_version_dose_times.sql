-- ============================================================================
-- 022 · a schedule VERSION may hold more than one dose time
-- ============================================================================
--
-- ⚠️ WITHOUT THIS, 017 AND 021 SHIP A FEATURE THE DATABASE REJECTS.
--
-- Found by review, not by testing — three independent passes flagged it, and no
-- test caught it because the whole suite is pure and never reaches Postgres.
--
-- THE BUG
--
-- `005_protocol_compound_schedules.sql:82-84` declares:
--
--     CONSTRAINT schedule_version_dose_times_one CHECK (
--         COALESCE(array_length(dose_times, 1), 0) = 1
--     )
--
-- which was correct when a compound could only be dosed once a day. `017` made
-- multi-dose days real and `pushScheduleVersions` now writes
-- `dose_times: [time, ...laterTimes]` — so a 2x-daily compound sends an array of
-- length 2 and Postgres answers `23514`.
--
-- That error is neither `42P01` nor `42703`/`PGRST204`, so NOTHING RETRIES IT.
-- The push returns `{ok: false}` and, because the versions go up as one batched
-- upsert, EVERY version for that compound fails together. The version trail is
-- what stops a schedule change rewriting the past, so the compounds most likely
-- to need it are exactly the ones that silently stop getting it.
--
-- WHY `>= 1` AND NOT A CAP
--
-- `protocol_compounds` bounds the count through `dose_times_match`, which ties
-- the array's length to `times_per_day` (itself bounded by `times_per_day_sane`).
-- The version table has no `times_per_day` column to tie to, and inventing a
-- second, independent cap here would let the two disagree — a version could
-- become unwritable for a compound the DB is perfectly happy with. The floor is
-- what actually matters: an EMPTY array has no slot 0 and would strand every
-- dose logged against the version.
--
-- ALSO: per-slot amounts must be positive
--
-- `021` added `slot_doses` to both tables without a positivity check, while the
-- scalar `dose_amount` on each has had one since it was created
-- (`dose_positive`, `schedule_version_dose_positive`). A `0` or `-5` in the
-- array therefore stores fine and only fails at LOG time, against
-- `dose_logs.dose_amount_positive` — i.e. the error surfaces when the user taps
-- the tick, days later, with nothing on screen explaining it. The client already
-- defends against these values, which is the tell that they are reachable.
--
-- `0 < ALL (array)` is true for an empty array and NULL-tolerant per element, so
-- the COALESCE keeps a NULL element ("use dose_amount") legal.
--
-- SAFETY: one constraint widened, two added. Every existing row satisfies all
-- three — today every `dose_times` is length 1 and every `slot_doses` is NULL.
-- ============================================================================

-- ------------------------------------------------- 1. more than one dose time
ALTER TABLE public.protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS schedule_version_dose_times_one;

ALTER TABLE public.protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS schedule_version_dose_times_min1;
ALTER TABLE public.protocol_compound_schedules
    ADD CONSTRAINT schedule_version_dose_times_min1
    CHECK (COALESCE(array_length(dose_times, 1), 0) >= 1);

COMMENT ON COLUMN public.protocol_compound_schedules.dose_times IS
    'The times this version was dosed at, one per slot, POSITION-INDEXED: '
    'dose_times[n] is slot n-1 (Postgres arrays are 1-based). A NULL element is '
    'an unset time holding its slot''s place — never compact this array, or '
    'every later dose shifts onto the wrong slot. Was capped at exactly one '
    'element until 022; supabase/protocol/017 made multi-dose days real.';

-- ---------------------------------------------- 2. per-slot amounts, positive
ALTER TABLE public.protocol_compounds
    DROP CONSTRAINT IF EXISTS protocol_compounds_slot_doses_positive;
ALTER TABLE public.protocol_compounds
    ADD CONSTRAINT protocol_compounds_slot_doses_positive
    CHECK (slot_doses IS NULL OR COALESCE(0 < ALL (slot_doses), true));

ALTER TABLE public.protocol_compound_schedules
    DROP CONSTRAINT IF EXISTS schedule_version_slot_doses_positive;
ALTER TABLE public.protocol_compound_schedules
    ADD CONSTRAINT schedule_version_slot_doses_positive
    CHECK (slot_doses IS NULL OR COALESCE(0 < ALL (slot_doses), true));

-- ------------------------------------------------- 3. a one-off has an amount
-- Same reasoning as above, applied to the table 020 added: `dose_logs` has
-- `dose_amount_positive` and `one_off_logs.amount` had nothing.
ALTER TABLE public.one_off_logs
    DROP CONSTRAINT IF EXISTS one_off_logs_amount_positive;
ALTER TABLE public.one_off_logs
    ADD CONSTRAINT one_off_logs_amount_positive
    CHECK (amount IS NULL OR amount > 0);
