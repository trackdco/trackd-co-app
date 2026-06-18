-- ============================================================
--  Privacy Policy v1.0 — make the backup wording true regardless of plan.
--  Applied as migration `legal_documents_privacy_v1_0_backups_safe`.
--
--  WHY: the policy should not ASSERT we keep encrypted backups (or commit to a
--  retention window) until the Supabase plan's backup policy is confirmed in the
--  dashboard (Settings → Database → Backups). Free plans have no automated
--  backups; Pro keeps daily backups ~7 days. This rewords §5 + §7 so they are
--  true whether or not backups exist. FOLLOW-UP: once the real retention is
--  known, replace with a definite statement + the actual period (or drop the
--  backup claim entirely if there are none).
-- ============================================================

UPDATE legal_documents
SET body = replace(
  replace(
    body,
    'We keep encrypted backups of the database so that we can recover it after a failure. These backups are kept only for a short, rolling period and are then automatically overwritten; they are protected in the same way as the primary data, and your data is not kept in them beyond that recovery window.',
    'Where the database is backed up for disaster recovery, those backups are handled by our infrastructure provider (Supabase) under its backup policy for our plan: they are encrypted, retained only for the limited period that policy provides, and then overwritten, and they are protected in the same way as the primary data.'
  ),
  'Residual copies may remain in our encrypted backups only until those backups are overwritten on their normal short rolling cycle.',
  'If any of your data remains in an encrypted backup after deletion, it is removed when that backup is overwritten on its normal cycle.'
)
WHERE doc_type = 'privacy_policy' AND version = '1.0';
