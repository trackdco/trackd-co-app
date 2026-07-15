-- 009 — Mirror the FRONT view (screen-left = the user's own left) + finalise Sub-Q
-- region coords (Spec 19). The body map now renders from region PATHS in the art
-- modules, so x/y is display metadata only; this keeps the catalogue consistent.
-- IM anterior L/R swapped (mirror); Sub-Q coords set to the region centroids under
-- the same convention. IM posterior unchanged. Idempotent (ON CONFLICT DO UPDATE).
INSERT INTO injection_sites (id, label, route, side, aspect, x, y, sort_order) VALUES
  ('im-delt-r', 'Delt – Right', 'im'::admin_route, 'right', 'anterior', 62.6, 21.5, 3),
  ('im-delt-l', 'Delt – Left', 'im'::admin_route, 'left', 'anterior', 37.4, 21.5, 4),
  ('im-quad-out-r', 'Outer Quad – Right', 'im'::admin_route, 'right', 'anterior', 61, 58, 5),
  ('im-quad-out-l', 'Outer Quad – Left', 'im'::admin_route, 'left', 'anterior', 39, 58, 6),
  ('im-quad-front-r', 'Front Quad – Right', 'im'::admin_route, 'right', 'anterior', 54.5, 64, 7),
  ('im-quad-front-l', 'Front Quad – Left', 'im'::admin_route, 'left', 'anterior', 45.5, 64, 8),
  ('im-bicep-r', 'Bicep – Right', 'im'::admin_route, 'right', 'anterior', 63.1, 31.9, 9),
  ('im-bicep-l', 'Bicep – Left', 'im'::admin_route, 'left', 'anterior', 36.9, 31.9, 10),
  ('im-pec-r', 'Pec – Right', 'im'::admin_route, 'right', 'anterior', 55.4, 24.8, 15),
  ('im-pec-l', 'Pec – Left', 'im'::admin_route, 'left', 'anterior', 44.8, 24.8, 16),
  ('im-vglute-r', 'Ventroglute – Right', 'im'::admin_route, 'right', 'anterior', 58.6, 48.6, 33),
  ('im-vglute-l', 'Ventroglute – Left', 'im'::admin_route, 'left', 'anterior', 41.4, 48.6, 34),
  ('sq-abdo-lr', 'Lower Abdomen – Right', 'subq'::admin_route, 'right', 'anterior', 54.8, 48.4, 19),
  ('sq-abdo-ll', 'Lower Abdomen – Left', 'subq'::admin_route, 'left', 'anterior', 45.2, 48.4, 20),
  ('sq-abdo-r', 'Side Abdomen – Right', 'subq'::admin_route, 'right', 'anterior', 56, 40.1, 21),
  ('sq-abdo-l', 'Side Abdomen – Left', 'subq'::admin_route, 'left', 'anterior', 44.2, 40.1, 22),
  ('sq-flank-r', 'Love Handle – Right', 'subq'::admin_route, 'right', 'posterior', 56.9, 43, 23),
  ('sq-flank-l', 'Love Handle – Left', 'subq'::admin_route, 'left', 'posterior', 42.7, 43.1, 24),
  ('sq-glute-r', 'Glute – Right', 'subq'::admin_route, 'right', 'posterior', 54.9, 52.6, 25),
  ('sq-glute-l', 'Glute – Left', 'subq'::admin_route, 'left', 'posterior', 44.8, 52.6, 26),
  ('sq-thigh-up-r', 'Outer Thigh – Upper Right', 'subq'::admin_route, 'right', 'anterior', 59.2, 54.1, 27),
  ('sq-thigh-up-l', 'Outer Thigh – Upper Left', 'subq'::admin_route, 'left', 'anterior', 40.7, 54.1, 28),
  ('sq-thigh-lo-r', 'Outer Thigh – Lower Right', 'subq'::admin_route, 'right', 'anterior', 58.9, 67.2, 29),
  ('sq-thigh-lo-l', 'Outer Thigh – Lower Left', 'subq'::admin_route, 'left', 'anterior', 41, 67.2, 30),
  ('sq-arm-r', 'Back of Arm – Right', 'subq'::admin_route, 'right', 'posterior', 64.1, 33.2, 31),
  ('sq-arm-l', 'Back of Arm – Left', 'subq'::admin_route, 'left', 'posterior', 35.8, 33.1, 32)
ON CONFLICT (id) DO UPDATE SET
  x = EXCLUDED.x,
  y = EXCLUDED.y;
