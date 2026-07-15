-- 007 — Re-tune IM marker coordinates to Angus's anatomical body SVG (Spec 19).
-- Idempotent (ON CONFLICT (id) DO UPDATE); same pattern as 002 / 005 / 006.
-- Requires 001 (table) + 002 (seed). Only the 22 intramuscular rows change:
-- x/y were re-mapped to the muscle centroids of the new front/back artwork, and
-- ventroglute moved to the anterior (front) view where the artwork draws it.
-- Sub-Q rows are untouched (their artwork lands later).
INSERT INTO injection_sites (id, label, route, side, aspect, x, y, sort_order) VALUES
  ('im-glute-r', 'Glute – Right', 'im'::admin_route, 'right', 'posterior', 54.9, 49.5, 1),
  ('im-glute-l', 'Glute – Left', 'im'::admin_route, 'left', 'posterior', 44.9, 49.5, 2),
  ('im-delt-r', 'Delt – Right', 'im'::admin_route, 'right', 'anterior', 37.4, 21.5, 3),
  ('im-delt-l', 'Delt – Left', 'im'::admin_route, 'left', 'anterior', 62.6, 21.5, 4),
  ('im-quad-out-r', 'Outer Quad – Right', 'im'::admin_route, 'right', 'anterior', 40.1, 60.5, 5),
  ('im-quad-out-l', 'Outer Quad – Left', 'im'::admin_route, 'left', 'anterior', 59.8, 60.5, 6),
  ('im-quad-front-r', 'Front Quad – Right', 'im'::admin_route, 'right', 'anterior', 44.1, 59, 7),
  ('im-quad-front-l', 'Front Quad – Left', 'im'::admin_route, 'left', 'anterior', 55.9, 59.1, 8),
  ('im-bicep-r', 'Bicep – Right', 'im'::admin_route, 'right', 'anterior', 36.9, 31.9, 9),
  ('im-bicep-l', 'Bicep – Left', 'im'::admin_route, 'left', 'anterior', 63.1, 31.9, 10),
  ('im-tricep-r', 'Tricep – Right', 'im'::admin_route, 'right', 'posterior', 63.8, 31.6, 11),
  ('im-tricep-l', 'Tricep – Left', 'im'::admin_route, 'left', 'posterior', 36.1, 31.6, 12),
  ('im-lat-r', 'Lat – Right', 'im'::admin_route, 'right', 'posterior', 58.5, 35.1, 13),
  ('im-lat-l', 'Lat – Left', 'im'::admin_route, 'left', 'posterior', 41.5, 35.1, 14),
  ('im-pec-r', 'Pec – Right', 'im'::admin_route, 'right', 'anterior', 44.8, 24.8, 15),
  ('im-pec-l', 'Pec – Left', 'im'::admin_route, 'left', 'anterior', 55.4, 24.8, 16),
  ('im-calf-r', 'Calf – Right', 'im'::admin_route, 'right', 'posterior', 57.1, 76.7, 17),
  ('im-calf-l', 'Calf – Left', 'im'::admin_route, 'left', 'posterior', 42.8, 76.9, 18),
  ('im-vglute-r', 'Ventroglute – Right', 'im'::admin_route, 'right', 'anterior', 41.4, 48.6, 33),
  ('im-vglute-l', 'Ventroglute – Left', 'im'::admin_route, 'left', 'anterior', 58.6, 48.6, 34),
  ('im-trap-r', 'Trap – Right', 'im'::admin_route, 'right', 'posterior', 54.6, 22.1, 35),
  ('im-trap-l', 'Trap – Left', 'im'::admin_route, 'left', 'posterior', 45.2, 22, 36)
ON CONFLICT (id) DO UPDATE SET
  aspect = EXCLUDED.aspect,
  x = EXCLUDED.x,
  y = EXCLUDED.y;
