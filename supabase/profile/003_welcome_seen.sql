-- ============================================================
--  profiles.welcome_seen_at — one-time founder-welcome popup gate.
--
--  WHY: on first sign-in a beta tester should see a short welcome + founder video
--  ONCE, across devices and reinstalls. A nullable timestamp on the user's own
--  profile row is the cross-device "have they seen it" flag (null = not yet). The
--  app only shows the popup when this is null AND a video link is configured, then
--  stamps it via the user's own RLS-scoped UPDATE (no policy/grant change — the
--  existing own-row profiles UPDATE covers the new column).
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS welcome_seen_at timestamptz;
