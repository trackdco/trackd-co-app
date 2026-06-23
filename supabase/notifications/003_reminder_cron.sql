-- ============================================================
--  REMINDER SCHEDULER CRON  (Spec 14, Phase 2) — applied LIVE via MCP
-- ============================================================
--
--  pg_cron job that drives the reminder scheduler: every minute it POSTs to the
--  Vercel route /api/notifications/run (via pg_net), which runs each founder
--  through the reminder engine (respecting their reminder time, quiet hours, and
--  once-per-day dedupe). Requires the pg_cron + pg_net extensions
--  (`enable_cron_extensions` migration) and, on the Vercel side, SUPABASE_SECRET_KEY
--  + CRON_SECRET env vars + the service_role table grants (`service_role_grants`).
--
--  This file is the sanitized RECORD — the live job (created via the Supabase MCP)
--  carries the real CRON_SECRET as the Bearer token. Do NOT commit the real secret;
--  it lives only in the cron.job command (service-role-readable) + Vercel env.
--
--  NOTE: schedule is '*/15 * * * *' (every 15 min, steady state — relaxed from
--  '* * * * *' after testing on 2026-06-23). A daily reminder only needs to fire
--  within a few minutes of its set time. To change: cron.unschedule('reminder-runner')
--  then re-run cron.schedule with the new cadence.
-- ============================================================

-- (extensions, enabled separately)
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;

select cron.schedule(
  'reminder-runner',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://trackdco.app/api/notifications/run',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'  -- real value applied via MCP, never committed
    )
  );
  $cron$
);

-- Remove with: select cron.unschedule('reminder-runner');
