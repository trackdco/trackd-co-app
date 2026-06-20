-- ============================================================
--  profiles.protocol_migrated_at — cloud guard for the one-time device→Postgres
--  state migration (`lib/migration/migrateDeviceState.ts`).
--
--  WHY: the migration backfills the interim device-local stack / dose logs into the
--  canonical Postgres model. Its "already ran" marker used to live in localStorage,
--  which a PWA delete/reinstall WIPES — so the migration re-ran on every reinstall,
--  re-seeding the stack from the stale jsonb mirror tables and RESURRECTING
--  compounds the user had deleted. A nullable timestamp on the user's own profile
--  row is the durable, cross-device, reinstall-proof "has this user ever migrated"
--  flag (null = not yet). Set once on the first clean run; checked before every run.
--
--  No policy/grant change — the existing own-row profiles SELECT/UPDATE covers it
--  (mirrors `welcome_seen_at`, 003).
-- ============================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS protocol_migrated_at timestamptz;
