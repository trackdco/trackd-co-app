-- ============================================================
--  service_role table grants  (Spec 14 Phase 2 — reminder scheduler)
-- ============================================================
--
--  The original api_role_grants migration granted only anon + authenticated,
--  because nothing server-side ever used the service role. The Phase-2 reminder
--  scheduler (/api/notifications/run) is the FIRST service_role consumer: it reads
--  other users' due doses + subscriptions with the secret key. Without a table
--  GRANT that role got "42501 permission denied for table profiles" even though it
--  has rolbypassrls (RLS gates rows; a GRANT opens the table — see architecture.md).
--
--  service_role is the trusted, server-ONLY role (the sb_secret_ key, never shipped
--  to a client) and already BYPASSes RLS, so granting it the standard Supabase
--  posture — full access to the public schema — is correct, not a loosening. This
--  also covers the send-push Edge Function and any future server job.
-- ============================================================

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables/sequences inherit the same, so a new table never silently 42501s
-- the scheduler.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO service_role;
