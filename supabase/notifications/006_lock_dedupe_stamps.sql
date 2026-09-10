-- ============================================================
--  Notifications 006 - lock the other three runner-owned stamps (Audit, 2026-09-08).
--
--  `005_trial_stamp_lock.sql` locked ONE column, trial_reminder_sent_for. But
--  `002_reminder_scheduling.sql:34-36` added THREE more stamps of the same kind -
--  last_dose_reminder_on, last_missed_nudge_on, last_low_stock_on - and left them
--  writable by the account. CONFIRMED on production 2026-09-08: role
--  `authenticated` holds column-level UPDATE on all three, and the 005 trigger
--  guards none of them.
--
--  The harm is exactly what 005 was written to stop, one column over:
--    - null them  -> `runner.ts:994,1001,1008` fire on every 15-minute tick, ~96
--                    pushes/day to that user.
--    - date them forward -> the reminders go silent.
--  Self-affecting only (RLS blocks cross-user writes), so this is an integrity /
--  self-abuse defect rather than a breach - but it defeats a control this project
--  deliberately built.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--   Paste this whole file into the Supabase SQL Editor and run it. It only
--   REPLACES a trigger function, so it is safe to run any time and needs no code
--   change and no grant change. Then run the VERIFY block at the bottom.
--
--  ⚠️ DOES NOT BREAK THE RUNNER, for the same reason 005 does not: the runner
--  (`app/api/notifications/run/route.ts`) builds its client from
--  SUPABASE_SECRET_KEY, so its writes run as `service_role`, which the
--  `current_user not in ('authenticated','anon')` early-return lets straight
--  through. Only the account's own JWT is refused.
--
--  ⚠️ REFUSES A CHANGE, NOT A MENTION. `is distinct from` on UPDATE, so a client
--  that reads the whole row and writes it back untouched is not rejected. The real
--  settings save (`lib/notifications/prefsActions.ts`) never names these columns.
-- ============================================================

create or replace function public.guard_trial_reminder_stamp()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default), deliberately - the check is "who is asking".
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.trial_reminder_sent_for is not null
       or new.last_dose_reminder_on is not null
       or new.last_missed_nudge_on is not null
       or new.last_low_stock_on is not null then
      raise exception
        'runner-owned notification stamps are set by the reminder runner, not by the account'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.trial_reminder_sent_for is distinct from old.trial_reminder_sent_for
     or new.last_dose_reminder_on is distinct from old.last_dose_reminder_on
     or new.last_missed_nudge_on  is distinct from old.last_missed_nudge_on
     or new.last_low_stock_on     is distinct from old.last_low_stock_on then
    raise exception
      'runner-owned notification stamps are set by the reminder runner, not by the account'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_trial_reminder_stamp() is
  'Refuses any change from the authenticated/anon role to the runner-owned '
  'notification_preferences stamps: trial_reminder_sent_for, last_dose_reminder_on, '
  'last_missed_nudge_on, last_low_stock_on. Clearing them makes reminders fire '
  'every cron tick (~96/day); dating them forward silences them. See '
  'supabase/notifications/005_trial_stamp_lock.sql and 006_lock_dedupe_stamps.sql.';

-- The trigger from 005 already fires BEFORE INSERT OR UPDATE and calls this
-- function, so replacing the function body is sufficient. Re-assert it anyway so
-- this migration stands alone if 005 was somehow not applied.
drop trigger if exists guard_trial_reminder_stamp on public.notification_preferences;
create trigger guard_trial_reminder_stamp
  before insert or update on public.notification_preferences
  for each row execute function public.guard_trial_reminder_stamp();

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards.
-- ------------------------------------------------------------
--  1. The account is refused on each stamp (run as an ordinary user via PostgREST,
--     or impersonate in the SQL editor). Expect 42501 on:
--       update notification_preferences set last_dose_reminder_on = null where user_id = auth.uid();
--       update notification_preferences set last_low_stock_on = '2099-01-01' where user_id = auth.uid();
--
--  2. The runner (service_role) is still allowed. Expect success:
--       -- as service_role
--       update notification_preferences set last_dose_reminder_on = current_date where user_id = '<any>';
--
--  3. A no-op whole-row write by the account is NOT refused (only real changes are):
--       update notification_preferences set updated_at = now() where user_id = auth.uid();  -- ok
