-- ============================================================
--  TRACKD CO — INJECTION SITE WORKING SET  (post-v0.4.2, tracked migration)
--  Spec 19 (Injection Site Rework), Step 1 — data foundation.
-- ============================================================
--
--  A user's WORKING SET of injection sites — the sites a given user actually
--  uses. A row-per-membership join table (user → catalogue site). Steps 2–4
--  build the body-map UI on top of this; Step 3 migrates each user's existing
--  per-compound rotation_sites into it.
--
--  Route is NOT stored here — it's derived by joining injection_sites.route (one
--  source of truth; a site id is 1:1 with a route, e.g. im-glute-r vs sq-glute-r
--  are distinct rows). Reads filter "per route" through that join.
--
--  House patterns (architecture.md → Auth and Access Model):
--   - RLS ON, keyed on (SELECT auth.uid()) = user_id (the planner-cached form).
--   - Explicit PostgREST grants — this project does NOT auto-grant DML to the API
--     roles.
--   - FK to profiles(id) ON DELETE CASCADE (a deleted account drops its set);
--     FK to injection_sites(id) ON DELETE CASCADE. Removing a site from a working
--     set never touches historical dose_logs (Invariant 8, archive-not-destroy).
-- ============================================================

CREATE TABLE IF NOT EXISTS user_injection_sites (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    site_id     text NOT NULL REFERENCES injection_sites(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_injection_sites_unique UNIQUE (user_id, site_id)
);

ALTER TABLE user_injection_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own user_injection_sites - all" ON user_injection_sites
    FOR ALL
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Working-set reads scan a user's memberships.
CREATE INDEX IF NOT EXISTS idx_user_injection_sites_user
    ON user_injection_sites (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_injection_sites TO authenticated;
