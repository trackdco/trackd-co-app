-- Migration: pwa_install_state
--
-- Per-account state for the "Add to Home Screen" popup so it shows ONCE (not every
-- login, and not once-per-device the way a localStorage-only flag did):
--   * pwa_installed_at         — stamped the first time we ever see the app running
--                                as an installed standalone PWA (i.e. it's on their
--                                Home Screen). Lets us suppress the popup for good.
--   * install_prompt_dismissed_at — stamped when the user dismisses the popup.
--
-- The popup shows only when iOS + in Safari (not standalone) + BOTH columns NULL.
-- Both nullable/additive; existing `authenticated` UPDATE/SELECT grants on
-- `profiles` already cover the new columns, and the own-row RLS policy is unchanged.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pwa_installed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS install_prompt_dismissed_at timestamptz;
