-- ============================================================
--  004_regrace_launch_date.sql
--  D86 — re-date the beta grace to LAUNCH MORNING + 14 days.
--  Migration name: `regrace_launch_date`
--
--  ⚠️ NOT APPLIED. WRITTEN ONLY. Adrian applies this BY HAND on launch morning.
--     No agent runs it. It is `12` §P11, and P11 is the point of no return.
-- ============================================================
--
--  ## Why this file exists
--
--  The beta backfill ALREADY RAN, and it ran by accident.
--
--  `POST /api/billing/beta-grace` was driven live against production on
--  **2026-08-17 00:48:47 UTC** during the D81 verification (commit `e21c66a`,
--  committed 00:50:22 UTC — 95 seconds later). D81 needed the route's UPGRADE
--  branch, and only a live run reaches it; `?dry=1` writes nothing. Nobody
--  accounted for the fact that a live run against a database where NOBODY had a
--  row would also perform the entire first-run backfill. It did:
--
--      86 rows   source='comp', is_active=true, active_until 2026-08-31 00:48:47+00
--       4 rows   source='comp', active_until NULL   (the COMP_EMAILS list)
--      --------
--      90 rows   one per account in auth.users. No QA accounts remain.
--
--  So the fortnight started on 17 August and ends on **31 August**.
--
--  ## Why the route cannot fix it, and a migration has to
--
--  The backfill's predicate is **"has a row at all"**, deliberately
--  (`app/api/billing/beta-grace/route.ts:30-47`). That is correct and must not
--  change: an "active" test would hand a fresh fortnight to every lapsed account
--  on every re-run. The cost is that **the route cannot move anybody who already
--  has a row**, which is now all ninety.
--
--  ## Why it MUST be moved
--
--  `06` §3.6's approved notice reads:
--
--      "From today it's a paid app, and because you were here early you've got
--       two more weeks on us, until [date]."
--
--  "Two more weeks" is measured FROM THE DAY THE NOTICE IS SHOWN. Launch on the
--  20th and the true remainder is eleven days; slip to the 25th and it is six.
--  **The screen would contradict its own date** — Law 5 — and the contradiction
--  runs in the direction that takes access away early, which is the one direction
--  this project never allows.
--
--  ⚠️ P11's warning still applies, unchanged, and now applies to THIS FILE:
--  **applying it fixes the date every surface then shows** — the notice, the
--  banner, the reminder and the Billing screen all read the same instant. Apply
--  it only after the deploy is verified healthy (`12` §P11), because a rollback
--  afterwards leaves eighty-six people holding a date the app can no longer
--  honour.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   ⚠️⚠️ THIS FILE IS SINGLE USE AND MUST BE APPLIED ONLY AT P11. ⚠️⚠️
--
--   NOT as a rehearsal, NOT to "check it works", NOT the night before, NOT from
--   a staging window against this database. There is only one production
--   database and this file writes to it.
--
--   ⚠️ APPLYING IT EARLY IS UNRECOVERABLE BY THIS FILE. Being pinned to the
--   original backfill instant is what makes it exactly-once — and that same pin
--   means that once it has run, it can never move anybody again. An early run
--   starts the fortnight from the wrong moment and fixes a wrong date across the
--   notice, the banner, the reminder and the Billing screen. Correcting it would
--   need a SECOND migration, pinned to whatever wrong instant the early run
--   produced, written and applied by hand under the same rules as this one.
--
--   There is no undo. `06`'s notice will have told people the wrong date, and a
--   date somebody has been shown in writing cannot be quietly moved.
--
--   WHEN.  On LAUNCH MORNING, after P10 (legal documents published) and after
--          the deploy is verified healthy. BEFORE P13 (`BILLING_GATE_ENABLED`).
--          The fortnight is measured from the MOMENT YOU RUN IT, so run it on
--          the day you actually launch and not the night before.
--
--   1. Open the Supabase SQL Editor.
--   2. Paste THE WHOLE FILE. Not "the bottom bit": the bottom of this file is
--      comments, and running only that reports "Success. No rows returned",
--      which is also what a correct run reports. That mistake has already cost
--      this project one migration that was believed applied for a day.
--   3. "Success. No rows returned" is the correct result.
--   4. Then run the VERIFY block at the end, which DOES return rows. Read it.
--      It must show 86 rows sharing ONE expiry instant, and 4 rows with none.
--
--   SAFE TO RUN TWICE *AT P11*. See "exactly once by construction" below — a
--   second run at P11 updates ZERO rows rather than granting another fortnight,
--   so a doubled paste on the day is harmless. That is protection against
--   fat fingers at the right moment, NOT permission to run it at the wrong one:
--   the second run is a no-op precisely because the FIRST run is the one that
--   fixes the date forever.
--
-- ------------------------------------------------------------
--  What it will and will not touch
-- ------------------------------------------------------------
--
--  ✅ MOVES   the 86 dated `comp` rows written by the accidental backfill,
--            identified by their exact original expiry instant.
--  ❌ LEAVES  the 4 undated `comp` rows (COMP_EMAILS — free for life). Clearing
--            or dating one of those would put a friend who was promised Trackd
--            for life on a fourteen-day clock.
--  ❌ LEAVES  any `stripe` / `apple` / `google` row. Somebody paying is not a
--            beta account and must never be re-dated by a grace job.
--  ❌ LEAVES  any REVOKED row (`is_active = false`). ⚠️ THIS IS D81'S LESSON
--            APPLIED TO THE NEW MECHANISM. A revocation is a decision somebody
--            made, and a re-dating job is not entitled to reverse it. All 90
--            rows are active today, so this guard is unreachable as things
--            stand — it is here because "unreachable" is a claim about today,
--            and the last job that assumed it un-revoked somebody.
--  ❌ LEAVES  any row already expiring LATER than the new instant. The rule
--            everywhere in this area is "only ever lengthens, never shortens".
--
--  ## Exactly once by construction
--
--  The predicate pins `active_until` to the ORIGINAL backfill instant rather
--  than to "any dated comp row". After the first run no row carries that instant
--  any more, so a second run matches nothing and changes nobody.
--
--  That matters more than tidiness. A predicate of "any dated comp row" would
--  re-date EVERYBODY on every run — so running this twice, or running it again
--  after a slip, would silently move a date the notice had already shown people.
--  Pinning makes the second run a provable no-op rather than a promise someone
--  has to remember to keep.

-- ------------------------------------------------------------
--  The guard. STOPS rather than doing something unintended.
-- ------------------------------------------------------------

do $$
declare
  target    timestamptz := now() + interval '14 days';
  original  timestamptz := timestamptz '2026-08-31 00:48:47.401+00';
  movable   int;
  shortened int;
begin
  select count(*) into movable
  from public.entitlements
  where source = 'comp'
    and product = 'pro'
    and is_active
    and active_until = original;

  -- Nothing to move. Either this has already been applied (the expected reason)
  -- or the rows are not the shape this file was written against. Either way,
  -- STOP: a migration that silently does nothing is how a launch step gets
  -- ticked without having happened.
  if movable = 0 then
    raise exception
      'regrace_launch_date: no rows carry the original backfill instant %. Either this migration has ALREADY been applied (check the VERIFY block at the end of this file), or the grace rows are not the shape this file expects. Nothing has been changed. Inspect first: SELECT source, is_active, active_until, count(*) FROM public.entitlements GROUP BY 1,2,3;',
      original;
  end if;

  -- NEVER SHORTEN. The one direction this project does not allow. Unreachable
  -- while `target` is in the future and `original` is 31 August, and asserted
  -- anyway because the cost of being wrong is somebody losing access on a date
  -- earlier than the one they were shown in writing.
  select count(*) into shortened
  from public.entitlements
  where source = 'comp'
    and product = 'pro'
    and is_active
    and active_until = original
    and active_until > target;

  if shortened > 0 then
    raise exception
      'regrace_launch_date: % row(s) would be SHORTENED (their current expiry % is later than the proposed %). Refusing. Nobody loses access on an earlier date than the one they were shown.',
      shortened, original, target;
  end if;

  raise notice 'regrace_launch_date: moving % row(s) from % to %', movable, original, target;

  update public.entitlements
  set active_until = target
  where source = 'comp'
    and product = 'pro'
    and is_active
    and active_until = original;
end $$;

-- ------------------------------------------------------------
--  ▶ VERIFY — paste this separately. It RETURNS ROWS, unlike the block above.
-- ------------------------------------------------------------
--
--  select
--    source,
--    is_active,
--    (active_until is null) as free_for_life,
--    active_until,
--    count(*) as rows
--  from public.entitlements
--  group by 1, 2, 3, 4
--  order by rows desc;
--
--  EXPECTED, immediately after a correct run:
--
--    comp | true | false | <launch morning + 14 days> | 86
--    comp | true | true  | (null)                     |  4
--
--  ⚠️ READ THE INSTANT, not just the counts. It must be fourteen days after the
--     moment you ran this, and every one of the 86 must share ONE instant. Two
--     different instants means it was run twice against different row sets, and
--     the notice can then only be right for one of the groups.
--
--  ⚠️ NO ROW may show `2026-08-31 00:48:47.401+00` afterwards. If one does, the
--     update did not run, whatever the editor said.
--
--  And the cross-check that P12 actually asks for — row count against account
--  count, counted directly rather than inferred from any response:
--
--  select
--    (select count(*) from auth.users)                                as accounts,
--    (select count(*) from public.entitlements)                       as entitlement_rows,
--    (select count(*) from public.entitlements where active_until is null) as free_for_life,
--    (select count(*) from public.entitlements
--       where active_until is not null and is_active)                 as on_the_clock;
--
--  EXPECTED: accounts = entitlement_rows, free_for_life = 4, on_the_clock = 86.
--
--  ⚠️ IF `accounts` EXCEEDS `entitlement_rows`, somebody signed up after
--     2026-08-17 and holds NO entitlement row. They are not a beta account and
--     the grace was never promised to them, so they belong to `01`/`02a`'s
--     ordinary new-user path — but confirm that is who they are before P13,
--     because P13 is what makes a missing row mean read-only.
--
--     One known case: `angusbrake6@gmail.com` is on COMP_EMAILS and has NO
--     ACCOUNT as of 2026-08-17. If he signs up before launch he will hold no
--     row, and the ONLY thing that grants him free-for-life is re-running
--     `POST /api/billing/beta-grace` after he has signed up — which is safe,
--     skips everybody who already has a row, and is the documented repair path
--     (`Context/next-tasks.md:459`). Re-running it does NOT undo this migration:
--     the route only inserts for accounts with no row.
