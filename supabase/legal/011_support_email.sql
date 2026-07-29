-- ============================================================
--  Contact address: legal@trackdco.app → support@trackdco.app
--  (Adrian, 2026-07-29 — the legal@ mailbox no longer exists.)
--
--  WHY A REPLACE RATHER THAN A REWRITE
--  The v1.3 bodies live ONLY in the database (see 009 — the text is deliberately
--  not duplicated in the repo, to avoid drift), so this cannot be a re-insert of
--  known text. A targeted `replace()` on the body is exact regardless of how many
--  times the address appears or what surrounds it, and touches nothing else.
--
--  NOT A VERSION BUMP. The substance of the documents is unchanged — this
--  corrects a contact address that no longer resolves. Bumping to 1.4 would
--  invalidate nothing and would make every existing `consent_records` row read as
--  consent to a superseded version, which would be misleading rather than more
--  correct. `is_current`, `version` and `effective_date` are all left alone.
--
--  CURRENT ROWS ONLY. Superseded versions (v1.0 / v0.x, `is_current = false`) are
--  the historical record of what users actually agreed to at the time and are
--  deliberately NOT rewritten. They are never rendered — the public pages and the
--  signup gate both read `is_current` — so no user can reach the dead address
--  through them.
--
--  Idempotent: re-running finds no occurrences and updates nothing.
-- ============================================================

UPDATE legal_documents
SET body = replace(body, 'legal@trackdco.app', 'support@trackdco.app')
WHERE is_current = true
  AND body LIKE '%legal@trackdco.app%';

-- Verify (expect zero rows):
--   SELECT doc_type, version FROM legal_documents
--   WHERE is_current = true AND body LIKE '%legal@trackdco.app%';
--
-- And confirm the new address landed (expect one row per doc that had it):
--   SELECT doc_type, version FROM legal_documents
--   WHERE is_current = true AND body LIKE '%support@trackdco.app%';
