-- ============================================================
--  TRACKD CO — WORKING-SET BACKFILL  (post-v0.4.2, tracked migration)
--  Spec 19 (Injection Site Rework), Step 3 — one-time, idempotent.
-- ============================================================
--
--  Seeds each existing user's injection-site WORKING SET from the union of every
--  site they had configured across all their compounds
--  (`protocol_compounds.rotation_sites`), so no tester has to re-do setup when the
--  log flow cuts over to the working-set body map.
--
--  - Idempotent: ON CONFLICT (user_id, site_id) DO NOTHING — safe to re-run, and
--    it never fights a user who has since edited their set in the setup menu.
--  - A configured site with no clean catalogue match is SKIPPED, not guessed
--    (the INNER JOIN to injection_sites drops it). At apply time the only
--    unmatched values were the retired ventrogluteal ids (`im-vglute-l/-r`, 4
--    users) — Angus dropped ventroglute from the catalogue, so those users simply
--    don't get it seeded and can add other sites in the setup menu.
--  - Includes archived compounds too (the union is "every site configured"), and
--    never touches historical dose_logs.
-- ============================================================

INSERT INTO user_injection_sites (user_id, site_id)
SELECT DISTINCT pc.user_id, sid
FROM protocol_compounds pc
CROSS JOIN LATERAL unnest(pc.rotation_sites) AS sid
JOIN injection_sites s ON s.id = sid
ON CONFLICT (user_id, site_id) DO NOTHING;
