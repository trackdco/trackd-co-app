-- ============================================================
--  consent_records — per-user, per-version legal-consent log.
--  Spec 12 (Legal Compliance Cutover), Step 2. Applied as migration
--  `consent_records`.
--
--  WHY: the signup gate captures three separate affirmative consents (Terms +
--  Privacy, Medical Disclaimer, and explicit health-data processing). The ToS and
--  Privacy Policy promise we record WHICH version of each document a user accepted
--  and WHEN — this is the auditable, append-only store for that. It complements
--  profiles.tos_accepted_at / tos_version (which still gate app access via
--  getSessionContext); this table is the granular legal record.
--
--  Deliberate, scoped schema exception to the usual "no schema changes" rule
--  (Adrian-approved) — per-version consent logging is a legal requirement.
--
--  APPEND-ONLY: only INSERT + SELECT are granted/policied for `authenticated`;
--  there is no UPDATE/DELETE grant or policy, so the audit trail can't be edited
--  from any client. Rows are still removed when the account is deleted (FK to
--  profiles → auth.users ON DELETE CASCADE).
-- ============================================================

CREATE TYPE consent_document AS ENUM (
  'tos',
  'privacy',
  'disclaimer',
  'health_data_consent'
);

CREATE TABLE IF NOT EXISTS consent_records (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    document    consent_document NOT NULL,
    version     text NOT NULL,             -- the document version accepted, e.g. '1.3'
    accepted_at timestamptz NOT NULL DEFAULT now(),
    user_agent  text                       -- nullable; the client UA at acceptance
);

CREATE INDEX IF NOT EXISTS consent_records_user_doc_idx
    ON consent_records (user_id, document);

ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_records insert own" ON consent_records;
CREATE POLICY "consent_records insert own" ON consent_records
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "consent_records select own" ON consent_records;
CREATE POLICY "consent_records select own" ON consent_records
    FOR SELECT TO authenticated
    USING ((SELECT auth.uid()) = user_id);

-- PostgREST role grants (RLS still gates rows). Append-only: NO update/delete grant.
GRANT SELECT, INSERT ON consent_records TO authenticated;
