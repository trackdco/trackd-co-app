--  003_courtesy_until.sql
--  One column, `subscriptions.courtesy_until`, so a paying customer on a free
--  period is not described to themselves as a first-time trialist.
--  Migration: `courtesy_until`
--
--  ⚠️ NOT YET APPLIED, as of 2026-08-14. Written, not run.
--  A hand-applied migration never appears in `list_migrations`, so this header
--  is a CLAIM and never a record. Verify with the block at the bottom.
--
--  ▶ HOW TO RUN THIS
--    1. Open the Supabase SQL Editor.
--    2. Paste THE WHOLE FILE. Not "the bottom bit": the bottom of this file is
--       comments, and running only that reports "Success. No rows returned",
--       which is also what a correct run reports. That mistake has already cost
--       this project one migration that was believed applied for a day.
--    3. "Success. No rows returned" is the correct result.
--    4. Then run the VERIFY block at the end, which DOES return something.
--
--  ## Why this column exists
--
--  The save offer gives extra time by moving `trial_end` (see
--  `lib/billing/saveOffer.ts`). That is the only mechanism in Stripe that means
--  "this period is free" precisely, and it works identically on weekly, monthly
--  and yearly plans. A 100%-off coupon cannot: it discounts a whole INVOICE, and
--  on the yearly plan an invoice is a year, which is the $69.99 giveaway this
--  branch removed.
--
--  The cost is that Stripe reports the subscription as `trialing` for the free
--  stretch. Without this column `planLabelFor` reads that status and tells a
--  customer of two years that they are on a "Free trial" -- the label meant for
--  somebody who has never paid anything. Adrian, 2026-08-14: it has to say
--  something else.
--
--  So the grant writes `trackd_courtesy_until` into the Stripe subscription's
--  metadata, `syncSubscription` mirrors it here, and the label reads "Pro".
--
--  ## Safe unapplied
--
--  The mirror write tolerates the column being absent (PostgREST answers
--  `PGRST204` and the write is retried without it), and the label simply falls
--  back to today's behaviour: a courtesy month reads "Free trial". Nothing
--  breaks, one screen is briefly wrong for one kind of customer.

alter table public.subscriptions
  add column if not exists courtesy_until timestamptz;

comment on column public.subscriptions.courtesy_until is
  'When a save-offer courtesy period ends. Set while Stripe reports `trialing` '
  'on a subscription that has actually been paid for, so the plan label can say '
  '"Pro" rather than "Free trial". Null for a genuine first trial.';

--  No grant change is needed: `subscriptions` is service-role only for writes
--  and the existing SELECT policy is row-scoped rather than column-enumerated,
--  so a new column is readable by its owner the moment it exists. (Contrast
--  `profiles`, where both grants ENUMERATE columns and a new one 42501s on a
--  legitimate write until it is added to them.)

--  ▶ VERIFY -- paste this separately. It RETURNS ROWS, unlike the statement above.
--
--  select column_name, data_type, is_nullable
--  from information_schema.columns
--  where table_schema = 'public'
--    and table_name  = 'subscriptions'
--    and column_name = 'courtesy_until';
--
--  Expected: exactly ONE row, `timestamptz`, nullable YES.
--  No rows means the alter did not run, whatever the editor said.
