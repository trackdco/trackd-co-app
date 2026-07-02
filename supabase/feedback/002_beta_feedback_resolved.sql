-- ============================================================
--  beta_feedback — add a founder-only "resolved" toggle.
--
--  WHY: as testers send feedback, the /admin list gets crowded. Founders need a
--  one-tap way to tick an item once its fix has shipped, so it drops out of the
--  open list. `resolved_at` (NULL = open) records WHEN it was marked done.
--
--  Access (defence-in-depth, mirrors the house pattern):
--    - Testers stay APPEND-ONLY — no UPDATE grant or policy for them.
--    - Only the two founder accounts may UPDATE, and ONLY the `resolved_at`
--      column (column-scoped GRANT), so even a founder can't rewrite a tester's
--      message/email through the API.
--  The founder email check mirrors the existing select policy. KEEP THE FOUNDER
--  EMAIL LIST IN SYNC with lib/admin.ts (FOUNDER_EMAILS) and
--  supabase/waitlist/002_founder_read.sql.
-- ============================================================

ALTER TABLE beta_feedback ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Founders (only) may mark an item resolved / reopen it.
DROP POLICY IF EXISTS "beta_feedback update founder" ON beta_feedback;
CREATE POLICY "beta_feedback update founder" ON beta_feedback
    FOR UPDATE TO authenticated
    USING (
        lower(auth.jwt() ->> 'email') IN ('admin@trackdco.app', 'adrianschimizzi1@gmail.com')
    )
    WITH CHECK (
        lower(auth.jwt() ->> 'email') IN ('admin@trackdco.app', 'adrianschimizzi1@gmail.com')
    );

-- Column-scoped UPDATE grant: only `resolved_at` is writable (RLS still gates the
-- rows to founders). The base INSERT/SELECT grants from 001 are unchanged.
GRANT UPDATE (resolved_at) ON beta_feedback TO authenticated;
