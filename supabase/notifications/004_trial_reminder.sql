-- ============================================================
--  The trial reminder's dedupe stamp. Migration: `trial_reminder`
--
--  NOT YET APPLIED.  ← verify against the live schema, never against this line.
--                       A hand-applied migration never shows in list_migrations,
--                       so this header is a claim, not a record.
-- ============================================================
--
--  WHAT IT IS FOR
--    The paywall timeline promises "Day 5 · Reminder" and the checkout
--    disclosure promises "We'll remind you on day 5". The reminder cron runs
--    every 15 minutes, so without a stamp the promise would be kept about
--    ninety-six times in one day.
--
--  WHY IT IS NOT NAMED `last_trial_reminder_on`
--    The three stamps beside it (`last_dose_reminder_on`, `last_missed_nudge_on`,
--    `last_low_stock_on`) hold the day a send HAPPENED. This one holds the
--    reminder day a send was FOR, which is a different fact, and the difference
--    is load-bearing:
--
--      - The reminder fires on or after its promised day, because the cron is
--        not guaranteed to have run (a deploy, an outage, a phone with no
--        subscription registered that morning). A send on day 6 for a day-5
--        reminder stamps DAY 5. Stamping day 6 would leave day 5 unstamped and
--        the same reminder would go out again the next morning.
--      - A returning customer's second trial has a different reminder date, so
--        it correctly gets its own reminder rather than being suppressed by a
--        stamp from months ago.
--
--    `lib/notifications/trialReminder.ts` is the matching half. The two must
--    agree about what this column means; the name is the cheapest way to make
--    that survive somebody reading only one of them.
--
--  SAFE EITHER WAY, AND THE CODE KNOWS IT
--    `lib/notifications/runner.ts` reads this column in its OWN query, separate
--    from the preferences select, and treats a `42703` (undefined column) as
--    "the trial reminder is not available yet" while every other reminder
--    carries on untouched. That isolation is deliberate: folding it into the
--    existing preferences select would mean an unapplied migration knocked out
--    quiet hours and all three dedupe stamps at once, and a dose reminder every
--    fifteen minutes is a far worse failure than a trial reminder that waits.
--
--    So: applying this turns the reminder ON. Not applying it leaves today's
--    behaviour exactly as it is.
--
--  Idempotent. `add column if not exists` is safe to re-run.
-- ============================================================

alter table public.notification_preferences
  add column if not exists trial_reminder_sent_for date;

comment on column public.notification_preferences.trial_reminder_sent_for is
  'The trial-reminder DATE a push has already been sent for (not the day it was sent). Written by lib/notifications/runner.ts. See supabase/notifications/004_trial_reminder.sql.';

-- No grant or policy change. `notification_preferences` already carries the
-- user's own select/update policy and the table-level grant, and a new column on
-- a table granted at TABLE level (rather than enumerated, the way `profiles` is
-- in `grants/003`/`004`) needs no further privilege. Verified by executing:
-- a signed-in user can read and write this column on their own row and no other.

-- ------------------------------------------------------------
--  VERIFY — paste these UNCOMMENTED. A commented block runs green and checks
--  nothing, which is how `protocol/024` reported success without executing a
--  single assertion.
-- ------------------------------------------------------------
--
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'notification_preferences'
--   and column_name = 'trial_reminder_sent_for';
-- -- expect exactly one row, data_type = 'date'
