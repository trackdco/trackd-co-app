-- ============================================================
--  ▶ HOW TO RUN THIS (Adrian)
--
--    1. SELECT ALL, COPY, PASTE THE WHOLE FILE into the Supabase SQL Editor.
--       Not a section, not "the bottom bit" — the whole thing, every time.
--       Everything that is not a statement is a `--` comment and Postgres
--       ignores it, so there is no way to paste too much and no decision for
--       you to make. Pasting only PART of a file is the way to get it wrong:
--       the bottom of this one is entirely comments, and running just that
--       succeeds while doing nothing at all.
--
--    2. "Success. No rows returned" IS THE SUCCESS MESSAGE. This file creates
--       a function, a trigger and a grant; none of those return rows. Seeing
--       nothing back means it worked.
--
--    3. THEN CHECK IT, because step 2 looks identical to having run nothing.
--       Paste this separately — it returns a row when the lock is on:
--
--         select tgname, tgenabled
--         from pg_trigger
--         where tgrelid = 'public.notification_preferences'::regclass
--           and tgname = 'guard_trial_reminder_stamp';
--
--       Or ask Claude to run `scratchpad/stamp-attack.mjs`, which proves it
--       with a real user token and cleans up after itself.
--
--  This file is IDEMPOTENT (`create or replace`, `drop trigger if exists`,
--  `revoke`). Running it twice is harmless — if you are ever unsure whether it
--  ran, run it again.
-- ============================================================
--  The trial reminder's dedupe stamp becomes unwritable by the user it is
--  about. Migration: `trial_stamp_lock`
--
--  ✅ APPLIED 2026-08-13 by Adrian, and VERIFIED the same night by running
--  `scratchpad/stamp-attack.mjs` against the live database: all five attacks
--  refused with 403/42501, all five legitimate writes still succeeded —
--  including the service role stamping and releasing, which is the one that
--  would have turned "~96 notifications a day" into "none, ever".
--
--  That verification is the record. This header is still only a CLAIM: a
--  hand-applied migration never appears in `list_migrations`, and `grants/004`
--  said "NOT YET APPLIED" for four days after it was applied while two sessions
--  carried the work as outstanding. Re-run the attack rather than trusting
--  this line.
-- ============================================================
--
--  THE HOLE, REPRODUCED LIVE 2026-08-13
--    `notification_preferences.trial_reminder_sent_for` (added by `004`) is
--    writable by the account it belongs to. With a real user JWT and nothing but
--    the publishable key, every one of these returned success:
--
--      PATCH  { "trial_reminder_sent_for": null }         -> 200, 1 row
--      PATCH  { "trial_reminder_sent_for": "2099-01-01" } -> 200, 1 row
--      PATCH  { …real settings…, "trial_reminder_sent_for": null }
--                                                          -> 200, 1 row
--      POST   { "user_id": …, "trial_reminder_sent_for": "2099-01-01" }
--                                                          -> 201, CREATED
--
--    Two harms, in opposite directions:
--
--      CLEARING it removes the only thing the reminder dedupes against, and the
--      cron runs every fifteen minutes. That is ~96 push notifications a day,
--      about somebody's money, to their phone.
--
--      SETTING it forward silences a notice three surfaces promise OUT LOUD —
--      the paywall timeline's "Day 5 · Reminder" and the checkout disclosure's
--      "We'll remind you on day 5" — while both screens carry on promising it.
--      The user is then charged with no warning, which is the exact outcome the
--      whole reminder exists to prevent.
--
--    Only self-affecting: cross-user writes correctly hit 0 rows, because the
--    RLS policy is `auth.uid() = user_id`. So it is a nuisance rather than a
--    breach — but it is a nuisance that ends in an unwarned charge, and unwarned
--    charges are disputes, and dispute rate is the number that closes payment
--    processor accounts.
--
--    ⚠️ THE INSERT AND THE DELETE ARE THE SAME HOLE THROUGH DIFFERENT VERBS,
--    and neither was in the brief. Both were found by probing rather than by
--    reading, and together they make a TWO-REQUEST silencing attack that no
--    UPDATE guard would have touched:
--
--      DELETE /rest/v1/notification_preferences?user_id=eq.<self>  -> 200
--      POST   { "user_id": <self>, "trial_reminder_sent_for": "2099-01-01" }
--                                                                  -> 201
--
--    And the DELETE alone is already enough. `claimTrialReminder` is a
--    conditional UPDATE and its row count IS the claim, so against a row that
--    does not exist it matches nothing, reports no error, and the reminder never
--    sends again. A user can permanently switch off a notice the app promises on
--    three screens, in one request, and nothing anywhere reports it.
--
--    So this migration does three things, not one: guard the UPDATE, guard the
--    INSERT, and take DELETE away.
--
--  WHY REVOKING DELETE IS SAFE
--    Nothing in the app deletes this row — the whole repo was searched. It is
--    created by the `handle_new_profile_prefs` trigger when a profile is made,
--    and it is meant to live as long as the account.
--
--    Account deletion is unaffected: the row cascades from `profiles (id)`, and
--    a cascade runs on the constraint's authority rather than the caller's
--    privileges. `profiles` itself already has exactly this shape in
--    `grants/001` ("no self-delete (deletion cascades from auth.users)"), so
--    this is the established pattern on this database rather than a new idea.
--
--  WHY A TRIGGER AND NOT COLUMN-LEVEL GRANTS
--    Column grants are the shape `grants/003` and `004` use on `profiles`, and
--    they are the wrong tool here. Postgres has no "revoke this one column";
--    the only way to express it is to REVOKE the table-wide privilege and then
--    GRANT an explicit list of every other column. That list is a maintenance
--    trap: every column added to the table later is missing from it, so a
--    perfectly legitimate write starts failing with 42501 somewhere unrelated.
--    It has already bitten `profiles` twice, and `004`'s own note says a new
--    `profiles` column now needs adding to two enumerations or it breaks.
--
--    `notification_preferences` is granted at TABLE level today (see `004`'s
--    closing note, which relies on exactly that). A trigger names ONE column and
--    leaves the grant alone, so nothing here has to be revisited when the table
--    grows. It also states the reason in its own error message, which a
--    privilege denial cannot.
--
--  WHY `current_user` AND NOT `auth.role()`
--    They agree for every request that can reach this table, and `current_user`
--    is the better of the two:
--
--      - It is the role PostgREST actually switched into (`SET LOCAL ROLE`),
--        which is the thing the privilege system itself checks. `auth.role()`
--        reads a claim out of the JWT, one layer further from the real grant.
--      - It is a Postgres built-in and cannot be missing. `auth.role()` is a
--        function in the `auth` schema, and if it were ever absent or renamed
--        this trigger would throw on EVERY write to this table — taking the
--        settings screen and the reminder cron down together. That is not a
--        risk worth running to save a word.
--
--    Already proven on this database: `grants/004`'s column privileges deny a
--    user JWT with 42501, and column privileges are checked against
--    `current_user`. So `current_user` is demonstrably 'authenticated' for these
--    requests.
--
--  WHY A DENYLIST AND NOT AN ALLOWLIST
--    It refuses `authenticated` and `anon` — the only two roles a browser can
--    ever hold — rather than permitting `service_role` alone.
--
--    An allowlist would also lock out `postgres`, which is Adrian in the SQL
--    editor unsticking a stamp by hand, and `supabase_admin`, which is a
--    restore. Both are legitimate, both are rare, and neither is the thing being
--    defended against. What is being defended against is a browser, and the two
--    roles a browser can hold are named exactly.
--
--  IT REFUSES A CHANGE, NOT A MENTION
--    `is distinct from` on UPDATE, so a client that reads the whole row and
--    writes the whole row back is not rejected for a column it did not touch.
--    The real settings save (`lib/notifications/prefsActions.ts`) never names
--    this column at all and is unaffected either way, but the rule should be
--    about what changed rather than about what was typed.
--
--  IT DOES NOT BREAK THE RUNNER
--    `app/api/notifications/run/route.ts` builds its client from
--    `SUPABASE_SECRET_KEY`, so the claim, the release and the read all run as
--    `service_role`. Confirmed by executing before this file was written: the
--    service role stamped, re-stamped and cleared the column while the user JWT
--    was doing all four of the writes above.
-- ============================================================

create or replace function public.guard_trial_reminder_stamp()
returns trigger
language plpgsql
-- SECURITY INVOKER (the default), deliberately. The whole check is "who is
-- asking", and a definer function would answer that question with its owner.
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.trial_reminder_sent_for is not null then
      raise exception
        'trial_reminder_sent_for is set by the reminder runner, not by the account'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.trial_reminder_sent_for is distinct from old.trial_reminder_sent_for then
    raise exception
      'trial_reminder_sent_for is set by the reminder runner, not by the account'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_trial_reminder_stamp() is
  'Refuses any change to notification_preferences.trial_reminder_sent_for from '
  'the authenticated or anon role. Clearing it makes the trial reminder fire '
  'every cron tick (~96/day); setting it forward silences a notice three '
  'screens promise out loud. See supabase/notifications/005_trial_stamp_lock.sql.';

drop trigger if exists guard_trial_reminder_stamp on public.notification_preferences;
create trigger guard_trial_reminder_stamp
  before insert or update on public.notification_preferences
  for each row execute function public.guard_trial_reminder_stamp();

-- ------------------------------------------------------------
--  And the third verb. Deleting the row silences the reminder outright: the
--  claim is a conditional UPDATE, and against a row that does not exist it
--  matches nothing and reports no error at all.
--
--  `grants/001` grants DELETE here alongside the genuinely user-owned tables
--  (dose logs, journal entries, lab panels). This is not one of those. It is a
--  settings row created by a trigger and owned by the account for its lifetime,
--  which is the same reason `profiles` is granted without DELETE two lines
--  below it in that file.
-- ------------------------------------------------------------

revoke delete on public.notification_preferences from authenticated;

-- ============================================================
--  VERIFY — run the ATTACK, not this file's header.
--
--  `scratchpad/stamp-attack.mjs` does all of it in one go, with a throwaway
--  account, and cleans up BY ID. Before this migration it printed:
--
--      PATCH clear the stamp        -> 200 1 row(s)
--      PATCH set the stamp forward  -> 200 1 row(s)
--      PATCH smuggled in prefs      -> 200 1 row(s)
--      INSERT a row pre-stamped     -> 201 *** CREATED ***
--      DELETE own prefs row         -> 200, row gone
--
--  After it, all five must be 403 / 42501, and every one of these must still
--  pass:
--
--      PATCH the real settings save     -> 200
--      PATCH the SAME value back        -> 200   (a no-op change is not a change)
--      INSERT a plain row               -> 201
--      service role re-stamps           -> OK
--      service role releases            -> OK
--
--  The last two are the ones that matter most. A lock that also stops the runner
--  turns "~96 notifications a day" into "none, ever", which is the failure the
--  reminder was built to fix.
--
--  Or by hand, in SQL:
--
--    -- the trigger is attached, on both verbs
--    select tgname, tgenabled, pg_get_triggerdef(oid)
--    from pg_trigger
--    where tgrelid = 'public.notification_preferences'::regclass
--      and not tgisinternal;
--
--    -- and it lets the service role through (run as the service role)
--    update public.notification_preferences
--    set trial_reminder_sent_for = current_date
--    where user_id = '<some user id>'
--    returning trial_reminder_sent_for;
-- ============================================================
