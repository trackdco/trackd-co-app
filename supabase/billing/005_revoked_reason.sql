-- ============================================================
--  005_revoked_reason.sql
--  D101 (answering Q106) — record WHY an entitlement was revoked.
--  Migration name: `revoked_reason`
--
--  ⚠️ NOT APPLIED. WRITTEN ONLY. Adrian applies migrations by hand.
-- ============================================================
--
--  ## ⚠️ THIS IS NOT 004, AND THE DIFFERENCE MATTERS
--
--  `004_regrace_launch_date.sql` sits next to this file carrying a SINGLE-USE,
--  LAUNCH-MORNING-ONLY warning. **None of that applies here.**
--
--      004   date-dependent, single-use, launch morning only, `12` §P11.
--            Running it at the wrong moment writes the wrong dates for 86 people.
--      005   THIS FILE. No date dependency, no coupling to launch, idempotent
--            (`add column if not exists`). Apply it WHENEVER YOU ARE READY —
--            before launch, after launch, or on a quiet Tuesday.
--
--  Re-running it is harmless. It is not part of P11 and it is not a point of no
--  return. The two files are adjacent and must not be confused, which is the only
--  reason this section exists.
--
--  ## Why this column exists (Q106)
--
--  `entitlements` records THAT a row was revoked and never WHY. A full refund and
--  a chargeback leave BYTE-IDENTICAL rows:
--
--      is_active    false
--      active_until untouched
--      source       'stripe'
--
--  So both of `08`'s dispute sentences select for a refunded account, and one of
--  them tells somebody the founder refunded as a goodwill gesture:
--
--      "Your subscription was cancelled because a payment was disputed with your
--       bank."
--
--  Nothing was disputed. `revokeForCustomer` ALREADY KNOWS — it takes
--  `reason: "dispute" | "refund"` as a parameter and simply does not persist it.
--  This is the one column that lets the screen tell them apart.
--
--  ## ⚠️ SAFE UNAPPLIED, AND THE CODE IS WRITTEN FOR THAT WINDOW
--
--  A deploy and a migration do not land in the same instant. Until this is
--  applied:
--
--    * the WRITE tolerates it. PostgREST answers `PGRST204` (not `42703` — it
--      validates the body against its own schema cache and rejects before
--      Postgres sees the statement) and the revoke is retried WITHOUT the column.
--      The revocation still lands. That is the same shape `003` uses and the same
--      lesson `trialLease.ts` paid for.
--    * the READ tolerates it, in its OWN query. `42703` or `PGRST204` answers
--      `unknown`, never `"dispute"`.
--
--  ⚠️ AND UNKNOWN IS NOT DISPUTE. Standing rule 0, and here the wrong default is
--  the lie itself: defaulting an unreadable reason to `"dispute"` would tell every
--  refunded customer their bank disputed a payment. Both dispute sentences are
--  WITHHELD on `unknown`, which costs a genuinely disputed customer an
--  explanation for as long as the column is missing and tells nobody anything
--  false. Every row revoked BEFORE this migration is legitimately `unknown`, so
--  that window is not hypothetical — it is the entire existing history.
--
--  ▶ HOW TO RUN THIS
--    1. Open the Supabase SQL Editor.
--    2. Paste THE WHOLE FILE. Not "the bottom bit": the bottom of this file is
--       comments, and running only that reports "Success. No rows returned",
--       which is also what a correct run reports. That mistake has already cost
--       this project one migration that was believed applied for a day.
--    3. "Success. No rows returned" is the correct result.
--    4. Then run the VERIFY block at the end, which DOES return something.

alter table public.entitlements
  add column if not exists revoked_reason text;

alter table public.entitlements
  drop constraint if exists entitlements_revoked_reason_check;

-- Only the two reasons `revokeForCustomer` can produce, and NULL for a row that
-- was never revoked. A free-text column would drift the moment somebody writes
-- "chargeback" instead of "dispute", and the screen selects copy off this value.
alter table public.entitlements
  add constraint entitlements_revoked_reason_check
  check (revoked_reason is null or revoked_reason in ('dispute', 'refund'));

comment on column public.entitlements.revoked_reason is
  'Why is_active was set false: dispute or refund. NULL when the row was never '
  'revoked, and also for every row revoked before 005 was applied -- which the '
  'read path treats as UNKNOWN and never as "dispute".';

--  No grant change is needed: `entitlements` is service-role only for writes and
--  the existing SELECT policy is row-scoped rather than column-enumerated, so a
--  new column is readable by its owner the moment it exists. (Contrast
--  `profiles`, where both grants ENUMERATE columns and a new one 42501s on a
--  legitimate write until it is added to them.)

--  ▶ VERIFY -- paste this separately. It RETURNS ROWS, unlike the statement above.
--
--  select column_name, data_type, is_nullable
--  from information_schema.columns
--  where table_schema = 'public'
--    and table_name  = 'entitlements'
--    and column_name = 'revoked_reason';
--
--  Expected: exactly ONE row, `text`, is_nullable YES.
--  No rows means the alter did not run, whatever the editor said.
--
--  And the constraint, which is the half a bare column check would miss:
--
--  select conname, pg_get_constraintdef(oid)
--  from pg_constraint
--  where conrelid = 'public.entitlements'::regclass
--    and conname  = 'entitlements_revoked_reason_check';
--
--  Expected: exactly ONE row, CHECK (revoked_reason IS NULL OR revoked_reason =
--  ANY (ARRAY['dispute'::text, 'refund'::text])).
