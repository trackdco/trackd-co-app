-- ============================================================================
-- 011 · dose_logs.logged_for — the DAY a dose belongs to, stored not inferred
-- ============================================================================
--
-- WHY
--
-- `taken_at` is an absolute instant, and the day a dose belongs to has been
-- re-derived from it on every load using whatever timezone the phone is in at
-- that moment. That works until the phone moves. Fly Sydney to Los Angeles and
-- yesterday's doses slide to the day before; because the device's jsonb mirror
-- keeps the ORIGINAL local day, the hydration merge can then show the same dose
-- twice, on adjacent days.
--
-- A day is a fact about where you were standing when you took it. It is not
-- recoverable from an instant alone, so it has to be recorded at the moment the
-- dose is logged, by the only party that knows: the device.
--
-- `taken_at` is unchanged and still authoritative for the INSTANT — the vial
-- resolution and the notification runner both key off it, correctly.
--
-- BACKFILL. Existing rows get the UTC date of `taken_at`, which is exactly what
-- the app derives for them today, so nothing anyone is currently looking at
-- moves. Rows written after this migration carry the true local day.
--
-- SAFETY: additive. One nullable column, one backfill, one index. No data is
-- destroyed and no existing column changes type or meaning.
-- ============================================================================

ALTER TABLE dose_logs
    ADD COLUMN IF NOT EXISTS logged_for date;

COMMENT ON COLUMN dose_logs.logged_for IS
    'The user''s LOCAL calendar day for this dose, written by the device at log '
    'time. Authoritative for which day a dose belongs to; taken_at remains '
    'authoritative for the instant. NULL only on rows predating migration 011 '
    'that the backfill could not reach.';

-- Existing rows: the UTC date of the instant, which reproduces the behaviour
-- these rows already have. Idempotent — only fills what is still NULL.
UPDATE dose_logs
   SET logged_for = (taken_at AT TIME ZONE 'UTC')::date
 WHERE logged_for IS NULL;

-- Every read that groups a user's doses by day goes through this.
CREATE INDEX IF NOT EXISTS dose_logs_user_logged_for_idx
    ON dose_logs (user_id, logged_for);
