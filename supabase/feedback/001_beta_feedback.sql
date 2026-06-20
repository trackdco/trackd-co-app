-- ============================================================
--  beta_feedback — in-app "Beta notes & feedback" submissions.
--
--  WHY: beta testers need a one-tap way to send bugs / ideas from the +
--  (Shortcuts) menu. There is no transactional-email service wired up, so the
--  reliable, founder-viewable store is this table (read in /admin). Email
--  forwarding can be layered on later (Edge Function + secret) without changing
--  this schema.
--
--  Mirrors the house pattern (consent_records / waitlist):
--    - identity is the verified session's user; user_id is the FK to profiles.
--    - the submitter's email is captured server-side at insert (NOT trusted from
--      the client) so founders can follow up without a cross-schema auth join.
--    - APPEND-ONLY for clients: only INSERT + SELECT are granted/policied — no
--      UPDATE/DELETE, so a tester can't edit or wipe their feedback. Rows still
--      vanish when the account is deleted (FK ON DELETE CASCADE).
--
--  RLS: a tester inserts/sees ONLY their own rows; the two founder accounts can
--  SELECT every row (for the /admin list). KEEP THE FOUNDER EMAIL LIST IN SYNC
--  with lib/admin.ts (FOUNDER_EMAILS) and supabase/waitlist/002_founder_read.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS beta_feedback (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    email      text,                      -- submitter's email, captured server-side
    message    text NOT NULL,
    path       text,                      -- the in-app route the tester was on
    user_agent text,                      -- client UA at submit (optional context)
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT beta_feedback_message_len CHECK (char_length(message) BETWEEN 1 AND 4000)
);

CREATE INDEX IF NOT EXISTS beta_feedback_created_idx ON beta_feedback (created_at DESC);

ALTER TABLE beta_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beta_feedback insert own" ON beta_feedback;
CREATE POLICY "beta_feedback insert own" ON beta_feedback
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- A tester reads only their own rows; founders read everything.
DROP POLICY IF EXISTS "beta_feedback select own or founder" ON beta_feedback;
CREATE POLICY "beta_feedback select own or founder" ON beta_feedback
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR lower(auth.jwt() ->> 'email') IN ('admin@trackdco.app', 'adrianschimizzi1@gmail.com')
    );

-- PostgREST role grants (RLS still gates rows). Append-only: NO update/delete grant.
GRANT SELECT, INSERT ON beta_feedback TO authenticated;
