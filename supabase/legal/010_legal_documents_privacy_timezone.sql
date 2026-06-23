-- ============================================================
--  Privacy Policy — disclose device-timezone collection (Spec 14 Phase 2)
--  Applied LIVE via the Supabase MCP (migration legal_documents_privacy_timezone).
-- ============================================================
--
--  In-place content refinement to the CURRENT privacy policy, kept at **v1.3**
--  (Adrian's call — not a version bump). The reminder scheduler now records each
--  user's device timezone (profiles.timezone) to fire reminders at the right local
--  time, so the "Information collected automatically" section discloses it. Mirrors
--  the earlier in-place v1.0 privacy content edits (006/007/008) — version + date
--  unchanged, just the body text. The tracked v1.3 migration (009) stays immutable
--  history; this is the recorded delta.
-- ============================================================

UPDATE legal_documents
SET body = replace(
  body,
  '• Basic technical logs: limited server and security logs from our hosting provider.',
  '• Basic technical logs: limited server and security logs from our hosting provider.'
  || E'\n• Device timezone: your device''s timezone (for example, "Europe/London"), recorded when you use notifications and used only to schedule reminders at the right local time. Turning notifications off stops its use.'
)
WHERE doc_type = 'privacy_policy' AND is_current = true AND version = '1.3';
