-- ============================================================================
-- 012 · UNDO 011's backfill. It guessed a timezone, and guessed wrong.
-- ============================================================================
--
-- APPLY THIS. 011 is live and is currently showing some doses on two days.
--
-- WHAT WENT WRONG
--
-- 011 added `logged_for` (correct, keep it) and then backfilled existing rows
-- with `(taken_at AT TIME ZONE 'UTC')::date`, claiming that was "exactly what
-- the app derives for them today". It is not. The app derives a dose's day with
-- `toDateKey`, which uses `getFullYear/getMonth/getDate` — the DEVICE's local
-- date, not UTC.
--
-- So for any dose whose local day and UTC day differ, the backfill wrote a
-- DIFFERENT day from the one the app had always shown. In Sydney that is every
-- dose logged between midnight and 10am; in Los Angeles every dose logged after
-- 5pm. The morning and the evening — when people actually dose.
--
-- The damage is worse than a wrong label, because hydration prefers
-- `logged_for` while the device's jsonb mirror still holds the original local
-- day. The merge then treats them as two different days and the SAME DOSE
-- RENDERS TWICE, on adjacent days. And the ghost cannot be removed: unticking it
-- derives a dose-log id from the day the UI is showing, which is not the day the
-- row was written under, so the delete matches zero rows, reports success,
-- clears the tombstone, and the next pull brings the ghost back.
--
-- THE FIX
--
-- Null the column. A backfill CANNOT know which timezone a past dose was logged
-- in — that information was never recorded, which is the entire reason 011
-- exists. `logged_for` is therefore write-once, by the device, at log time, and
-- nothing else may ever populate it. Rows with NULL fall back to deriving the
-- day from `taken_at` exactly as the app did before 011, so history goes back to
-- reading precisely as it always has.
--
-- SAFE TO RUN NOW, and only now: the app code that writes `logged_for` has not
-- been deployed (it is on an unmerged branch), so every non-null value in this
-- column came from 011's backfill and none of it is a real device answer.
--
-- After this, `logged_for` fills in going forward, one dose at a time, with the
-- day the device actually recorded.
-- ============================================================================

UPDATE dose_logs
   SET logged_for = NULL
 WHERE logged_for IS NOT NULL;

COMMENT ON COLUMN dose_logs.logged_for IS
    'The user''s LOCAL calendar day for this dose, written by the DEVICE at log '
    'time and by nothing else. NULL means the day is not recorded and the client '
    'derives it from taken_at, which is the pre-011 behaviour. Never backfill '
    'this column: the timezone a past dose was logged in was never recorded, so '
    'any backfill is a guess, and a wrong guess shows one dose on two days.';
