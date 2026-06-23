-- ============================================================
--  TRACKD CO — REMINDER SCHEDULING  (Spec 14, Phase 2)
-- ============================================================
--
--  Phase 1 built the transport (a device can receive a push). Phase 2 is the
--  scheduler that decides WHAT to send and WHEN, then fires through that pipe.
--
--  Scope (Adrian's product calls, 2026-06-23):
--    - Dose reminders       one daily digest at a user-set time ("3 doses due today")
--    - Missed-dose nudge    if due doses are still unlogged by a cutoff
--    - Low-stock alert      when a vial's v_inventory_math.est_empty_date is near
--    - Quiet hours          a window where nothing fires
--    - Founders first        the runner gates sends to founder accounts for now
--
--  The on/off toggles already exist on notification_preferences
--  (dose_reminders_on / unlogged_alert_on / low_inventory_alert_on). This adds the
--  TIMING + the DEDUPE stamps the every-15-min runner needs so a daily reminder
--  is sent at most once per local day. Times are interpreted in the user's
--  profiles.timezone (IANA), falling back to a default in the runner.
-- ============================================================

ALTER TABLE public.notification_preferences
    -- When the daily dose-reminder digest fires (user-local).
    ADD COLUMN IF NOT EXISTS reminder_time      time NOT NULL DEFAULT '09:00:00',
    -- After this local time, a still-unlogged due dose triggers the missed-dose nudge.
    ADD COLUMN IF NOT EXISTS missed_cutoff_time time NOT NULL DEFAULT '20:00:00',
    -- Quiet window: nothing is sent at/after quiet_start or before quiet_end (local).
    ADD COLUMN IF NOT EXISTS quiet_start        time NOT NULL DEFAULT '22:00:00',
    ADD COLUMN IF NOT EXISTS quiet_end          time NOT NULL DEFAULT '08:00:00',
    -- Alert when a vial is projected to run out within this many days.
    ADD COLUMN IF NOT EXISTS low_stock_days     smallint NOT NULL DEFAULT 7,
    -- Dedupe stamps (user-local date of the last send of each type), so the
    -- frequent runner never double-sends. NULL = never sent.
    ADD COLUMN IF NOT EXISTS last_dose_reminder_on date,
    ADD COLUMN IF NOT EXISTS last_missed_nudge_on  date,
    ADD COLUMN IF NOT EXISTS last_low_stock_on     date;
