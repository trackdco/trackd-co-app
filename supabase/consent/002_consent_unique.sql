-- ============================================================
--  consent_records — make the per-version audit idempotent.
--
--  WHY: the signup gate now writes consent_records BEFORE it sets the access gate
--  on profiles, and BLOCKS the user from entering until the audit lands (so an
--  account can never have access without a complete consent record). That means a
--  transient failure is retried — and without a uniqueness guard each retry would
--  append duplicate rows. This unique index lets the insert be an idempotent
--  upsert (ON CONFLICT DO NOTHING): one row per (user, document, version), retries
--  are no-ops. A version bump still records a fresh row.
--
--  Safe to apply: verified zero existing duplicates before creating the index.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS consent_records_user_doc_version_uidx
    ON consent_records (user_id, document, version);
