-- ============================================================
--  Remove profiles.welcome_seen_at — the founder-welcome popup is gone.
--
--  WHY: the founder video is now sent to testers individually instead of living
--  in the app, so the one-time welcome popup (and its code) was removed. This
--  column was the "have they seen it" gate (added in 003_welcome_seen.sql). It
--  shipped DORMANT (no video URL was ever set), so it was never written to — the
--  drop loses no data. No policy/view/default referenced it.
-- ============================================================

ALTER TABLE profiles DROP COLUMN IF EXISTS welcome_seen_at;
