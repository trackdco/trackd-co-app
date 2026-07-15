-- ============================================================
--  TRACKD CO — WORKING-SET RE-BACKFILL  (tracked migration)
--  Spec 19 — after restoring ventroglute (005).
-- ============================================================
--
--  The original backfill (004) SKIPPED `im-vglute-*` because those sites weren't
--  in the catalogue at the time. Now that 005 restored them, re-run the same
--  idempotent backfill so the users who had ventroglute configured get it seeded
--  into their working set. Same query as 004; ON CONFLICT DO NOTHING makes it a
--  no-op for every already-seeded site.
-- ============================================================

INSERT INTO user_injection_sites (user_id, site_id)
SELECT DISTINCT pc.user_id, sid
FROM protocol_compounds pc
CROSS JOIN LATERAL unnest(pc.rotation_sites) AS sid
JOIN injection_sites s ON s.id = sid
ON CONFLICT (user_id, site_id) DO NOTHING;
