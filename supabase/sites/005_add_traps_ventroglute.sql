-- ============================================================
--  TRACKD CO — ADD TRAPS + RESTORE VENTROGLUTE  (tracked migration)
--  Spec 19 (Injection Site Rework) — catalogue addition, Angus 2026-07-15.
-- ============================================================
--
--  Adds two IM sites Angus decided to include after the initial 32:
--   - Trap (trapezius) — a common spot-injection site not on file before.
--   - Ventroglute — restored (it was dropped in Step 1); the medically-safest IM
--     site. The `im-vglute-*` ids match the legacy siteCatalog ids + the enum
--     (ventroglute_left/right), so historical dose_logs and any existing
--     rotation_sites configs line back up (see 006 re-backfill).
--
--  Idempotent (ON CONFLICT DO NOTHING) — safe to re-apply. Catalogue stays
--  read-only under RLS (service-role write). Bringing the live catalogue to
--  36 sites (22 IM + 14 SubQ).
-- ============================================================

INSERT INTO injection_sites (id, label, route, side, aspect, x, y, sort_order) VALUES
  ('im-vglute-r', 'Ventroglute – Right', 'im'::admin_route, 'right', 'posterior', 64, 51, 33),
  ('im-vglute-l', 'Ventroglute – Left',  'im'::admin_route, 'left',  'posterior', 36, 51, 34),
  ('im-trap-r',   'Trap – Right',         'im'::admin_route, 'right', 'posterior', 57, 19, 35),
  ('im-trap-l',   'Trap – Left',          'im'::admin_route, 'left',  'posterior', 43, 19, 36)
ON CONFLICT (id) DO NOTHING;
