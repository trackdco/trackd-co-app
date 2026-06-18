-- ============================================================
--  Privacy Policy v1.0 — finalise backup wording with confirmed facts.
--  Applied as migration `legal_documents_privacy_v1_0_backups_7day`.
--
--  Confirmed in the Supabase dashboard (Database → Backups): the project is on
--  the PRO plan with DAILY encrypted database backups, ~7-day rolling retention,
--  and the dashboard explicitly notes Storage objects (uploaded files) are NOT
--  included in database backups. This replaces the plan-agnostic placeholder
--  wording from migration 007 with the real facts.
-- ============================================================

UPDATE legal_documents
SET body = replace(
  replace(
    body,
    'Where the database is backed up for disaster recovery, those backups are handled by our infrastructure provider (Supabase) under its backup policy for our plan: they are encrypted, retained only for the limited period that policy provides, and then overwritten, and they are protected in the same way as the primary data.',
    'Our database is backed up daily by our infrastructure provider (Supabase) for disaster recovery. These backups are encrypted, retained on a rolling basis for about 7 days and then overwritten, and protected in the same way as the primary data. They cover the database only — uploaded files such as bloodwork and progress photos are not included in these database backups.'
  ),
  'If any of your data remains in an encrypted backup after deletion, it is removed when that backup is overwritten on its normal cycle.',
  'If any of your data remains in an encrypted database backup after deletion, it is overwritten within about 7 days on the normal backup cycle.'
)
WHERE doc_type = 'privacy_policy' AND version = '1.0';
