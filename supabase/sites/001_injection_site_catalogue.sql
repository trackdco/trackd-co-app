-- ============================================================
--  TRACKD CO — INJECTION SITE CATALOGUE  (post-v0.4.2, tracked migration)
--  Spec 19 (Injection Site Rework), Step 1 — data foundation.
-- ============================================================
--
--  The app already shipped a full list of injection sites as free-standing
--  TypeScript data (lib/home/siteCatalog.ts) — the source for the per-compound
--  rotation picker and the id→label lookup. This promotes that list to a proper
--  read-only CATALOGUE TABLE so each site can carry the metadata the body map
--  needs: route, side, aspect (which silhouette), and x/y map coordinates.
--
--  WHAT CHANGED FROM THE TS LIST (Angus's calls, 2026-07-11):
--   - Every existing site is preserved EXCEPT the two ventrogluteal entries
--     (im-vglute-r / im-vglute-l), which Angus removed for now ("we already have
--     glutes"). Historical dose_logs.injection_site and protocol_compounds.
--     rotation_sites are UNTOUCHED, so no logged history is lost — the legacy TS
--     list + picker stay as-is until Step 3 removes that whole mechanic.
--   - The glute is kept as TWO rows (im-glute-* and sq-glute-*), one per route —
--     the existing ids are preserved (nothing renamed/merged), so rotation_sites
--     ids and the working-set join stay valid.
--   - Deltoid renders on the FRONT (anterior) silhouette; love-handle/flank on
--     the BACK (posterior). => 32 sites (18 IM + 14 SubQ).
--
--  COORDINATE SPACE: a normalized per-silhouette grid, 0–100 in x and y,
--  centreline at x=50 (viewer-facing: on the ANTERIOR silhouette a "Right" site
--  sits left-of-centre, on the POSTERIOR silhouette a "Right" site sits
--  right-of-centre). `aspect` selects which silhouette the marker lives on. The
--  Step 2 SVG silhouette is drawn to this same grid; coords get visually
--  reconciled there — this migration just carries them.
--
--  ACCESS: read-only catalogue, same posture as compounds/biomarkers/markers —
--  RLS ON, authenticated SELECT via a USING(true) policy, NO write policy (so
--  RLS denies every user write; seeding is a service-role job). Route reuses the
--  existing admin_route enum (constrained here to the two injectable routes).
-- ============================================================

CREATE TABLE IF NOT EXISTS injection_sites (
    id          text PRIMARY KEY,                    -- stable code, e.g. 'im-glute-r'
    label       text NOT NULL,
    route       admin_route NOT NULL,
    side        text NOT NULL,
    aspect      text NOT NULL,
    x           numeric NOT NULL,
    y           numeric NOT NULL,
    sort_order  smallint NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT injection_sites_route_injectable CHECK (route IN ('im', 'subq')),
    CONSTRAINT injection_sites_side_valid       CHECK (side IN ('left', 'right', 'n_a')),
    CONSTRAINT injection_sites_aspect_valid     CHECK (aspect IN ('anterior', 'posterior')),
    CONSTRAINT injection_sites_x_range          CHECK (x >= 0 AND x <= 100),
    CONSTRAINT injection_sites_y_range          CHECK (y >= 0 AND y <= 100)
);

ALTER TABLE injection_sites ENABLE ROW LEVEL SECURITY;

-- Read-only to users: authenticated may SELECT; no write policy ⇒ RLS denies all
-- user writes (service role bypasses RLS for seeding). Mirrors the compounds/
-- biomarkers/markers catalogues.
CREATE POLICY "injection_sites readable by all authed users" ON injection_sites
    FOR SELECT
    TO authenticated
    USING (true);

-- PostgREST reach: this project does NOT auto-grant to the API roles (see
-- architecture.md → Auth and Access Model), so the read grant is explicit.
GRANT SELECT ON injection_sites TO authenticated;
