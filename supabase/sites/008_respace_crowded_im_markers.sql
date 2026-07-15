-- 008 — Re-space crowded IM markers so their tap targets don't overlap (Spec 19).
-- After 007 re-tuned coords to muscle centroids, two adjacent-muscle pairs landed
-- closer than the map's r=7 (0–100 grid) hit target: Outer-Quad vs Front-Quad
-- (~4.3 apart) and Tricep vs Lat (~6.4 apart). At that spacing a marker's dot falls
-- inside its neighbour's (later-painted) hit disc, so taps hit the wrong site and
-- Outer-Quad was unreachable. These 8 rows are nudged apart (still on their muscle)
-- to restore the ~≥8-unit spacing the rest of the catalogue uses. Idempotent.
INSERT INTO injection_sites (id, label, route, side, aspect, x, y, sort_order) VALUES
  ('im-quad-out-r', 'Outer Quad – Right', 'im'::admin_route, 'right', 'anterior', 39, 58, 5),
  ('im-quad-out-l', 'Outer Quad – Left', 'im'::admin_route, 'left', 'anterior', 61, 58, 6),
  ('im-quad-front-r', 'Front Quad – Right', 'im'::admin_route, 'right', 'anterior', 45.5, 64, 7),
  ('im-quad-front-l', 'Front Quad – Left', 'im'::admin_route, 'left', 'anterior', 54.5, 64, 8),
  ('im-tricep-r', 'Tricep – Right', 'im'::admin_route, 'right', 'posterior', 66, 31, 11),
  ('im-tricep-l', 'Tricep – Left', 'im'::admin_route, 'left', 'posterior', 34, 31, 12),
  ('im-lat-r', 'Lat – Right', 'im'::admin_route, 'right', 'posterior', 57.5, 35.5, 13),
  ('im-lat-l', 'Lat – Left', 'im'::admin_route, 'left', 'posterior', 42.5, 35.5, 14)
ON CONFLICT (id) DO UPDATE SET
  x = EXCLUDED.x,
  y = EXCLUDED.y;
