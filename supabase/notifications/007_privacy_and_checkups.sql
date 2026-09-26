-- ============================================================
--  Notifications 007 - hide compound names, check-ups, and their log (2026-09-26).
--
--  Adrian signed off two things on 2026-09-25/26 that need somewhere to live:
--
--   1. hide_compound_names - the lock-screen privacy switch. A peptide or hormone
--      name on a lock screen tells whoever is holding the phone what somebody is
--      taking. On, every push is worded from counts alone
--      (`lib/notifications/reminders.ts` -> MessageOptions).
--
--   2. last_checkup_on + notification_log - at most ONE check-up a day, and the
--      one-off ones (a 100-day streak, a new compound's first dose, one year) only
--      ever once. Both are RUNNER-OWNED, like the stamps 005/006 lock: an account
--      that could clear them would be sent the same check-up every 15 minutes, and
--      one that could date them forward would silence them.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--   Paste the whole file into the Supabase SQL Editor and run it, then the VERIFY
--   block at the bottom. Safe to re-run.
--
--   ⚠️ DEPLOYING THE CODE BEFORE THIS IS SAFE, and it has to be: the runner reads
--   these columns in their OWN query (`collectCheckupPrefs` in runner.ts),
--   so while they are missing that one read fails, names stay shown, and no
--   check-up goes out. The reminders themselves are untouched. See the preferences
--   select comment in runner.ts for what a shared select would have cost.
--
--   ⚠️ CHECK-UPS STAY OFF UNTIL `NOTIFICATION_CHECKUPS=on` IS SET in Vercel, which
--   waits for the new Notifications page. There is no Check-ins switch (Adrian,
--   2026-09-26): the Notifications switch turns check-ups off with everything else.
-- ============================================================

alter table public.notification_preferences
  add column if not exists hide_compound_names boolean not null default false,
  add column if not exists last_checkup_on     date;

comment on column public.notification_preferences.hide_compound_names is
  'Word every push from counts alone, never naming a compound (lock-screen privacy).';
comment on column public.notification_preferences.last_checkup_on is
  'Runner-owned: the user-local day the last check-up went out. One a day at most.';

-- ------------------------------------------------------------
--  The log of one-off check-ups.
--
--  `key` names the occasion, not the message: "streak-100", "first-dose:<compound>",
--  "vial:<inventory item>", "quiet:21:<last log day>". A row means "this occasion
--  has been marked", so the runner never marks it twice. `sent_on` is the
--  user-local day it went out, which the quiet-spell pause reads back.
-- ------------------------------------------------------------
create table if not exists public.notification_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null check (length(key) between 1 and 200),
  sent_on    date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists notification_log_user_sent_idx
  on public.notification_log (user_id, sent_on desc);

alter table public.notification_log enable row level security;
alter table public.notification_log force row level security;

-- The account may READ its own log (so a future "what we've sent you" view can),
-- and nothing else. No insert, update or delete policy: deleting a row would
-- re-arm a one-off, which is the stamp problem 005/006 exist to stop.
drop policy if exists "own notification_log - read" on public.notification_log;
create policy "own notification_log - read"
  on public.notification_log for select
  using ((select auth.uid()) = user_id);

-- Grants (supabase/grants/001 grants EXISTING tables only; a new table brings its own).
revoke all on public.notification_log from anon, authenticated;
grant select on public.notification_log to authenticated;
grant select, insert, update, delete on public.notification_log to service_role;

-- ------------------------------------------------------------
--  last_checkup_on joins the runner-owned stamps the 005/006 guard refuses.
--  Same function, one more column; the trigger itself is unchanged.
-- ------------------------------------------------------------
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
       or new.last_low_stock_on is not null
       or new.last_checkup_on is not null then
      raise exception
        'runner-owned notification stamps are set by the reminder runner, not by the account'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.trial_reminder_sent_for is distinct from old.trial_reminder_sent_for
     or new.last_dose_reminder_on is distinct from old.last_dose_reminder_on
     or new.last_missed_nudge_on  is distinct from old.last_missed_nudge_on
     or new.last_low_stock_on     is distinct from old.last_low_stock_on
     or new.last_checkup_on       is distinct from old.last_checkup_on then
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
  'last_missed_nudge_on, last_low_stock_on, last_checkup_on. Clearing them makes '
  'reminders fire every cron tick (~96/day); dating them forward silences them. See '
  'supabase/notifications/005, 006 and 007.';

drop trigger if exists guard_trial_reminder_stamp on public.notification_preferences;
create trigger guard_trial_reminder_stamp
  before insert or update on public.notification_preferences
  for each row execute function public.guard_trial_reminder_stamp();

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards.
-- ------------------------------------------------------------
--  1. The columns exist with their defaults:
--       select hide_compound_names, last_checkup_on
--         from notification_preferences limit 1;       -- false, null
--
--  2. The account can set the switch but not the stamp (as a user, via
--     PostgREST or impersonation). Expect success, then 42501:
--       update notification_preferences set hide_compound_names = true where user_id = auth.uid();
--       update notification_preferences set last_checkup_on = null  where user_id = auth.uid();
--
--  3. The log is read-only to the account. Expect 42501 (no grant):
--       insert into notification_log (user_id, key, sent_on) values (auth.uid(), 'x', current_date);
--       delete from notification_log where user_id = auth.uid();
