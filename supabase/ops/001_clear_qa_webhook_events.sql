-- ============================================================
--  001_clear_qa_webhook_events.sql
--  Clear the 149 unprocessed webhook events so launch day's alarm starts empty.
--
--  ⚠️ HAND-APPLIED BY ADRIAN. No agent runs this. Written 2026-08-26.
--
--  ✅ APPLIED BY ADRIAN, 2026-08-26. VERIFIED FROM THE ROWS, not from the run:
--
--      unprocessed  149 -> 0
--      processed    13692 -> 13692   <- UNMOVED, which is the check that matters
--      total        13841 -> 13692
--
--  The processed count not moving is what proves the DELETE hit only the rows it
--  was aimed at. A step that reports success is not a step that did the work.
-- ============================================================
--
--  ## Why the alarm has to start empty
--
--  `webhook_events_unprocessed_idx` is the launch-day alarm: a row with
--  `processed_at IS NULL` means an event arrived and its handler did not finish.
--  On launch morning that is the single most important signal in the system —
--  and it is useless if it already reads 149 before the first real event lands.
--  An alarm nobody can read at a glance is an alarm nobody reads.
--
--  ## What these 149 rows ARE — measured 2026-08-26, not assumed
--
--  Four instruments, each able to return a different answer than it did:
--
--    livemode on the event                  0 of 149 are livemode=true
--    metadata.user_id -> live auth.users    21 carry one; 0 point at a live row
--    email on the payload                   52 carry one; ALL @trackd-qa.invalid
--    same customer as a QA-email event      a further 68 events
--
--  ⚠️ ONE INSTRUMENT WAS VACUOUS AND IS RECORDED AS SUCH. "Maps to
--  `billing_customers`" returned 0 — but that table holds ZERO rows, so it would
--  return 0 for a real customer too. It proves nothing and was discarded rather
--  than counted.
--
--  ⚠️ AND THE CLASSIFIER FAILED, WHICH IS WHY IT CAN BE TRUSTED. 29 events across
--  6 customers came back UNCLASSIFIED — no email, no test clock and no user_id
--  anywhere in all 13,841 rows. The database could not tell "QA" from "I could
--  not find out", so it was not allowed to guess. Resolved by reading Stripe
--  directly, with a control (`cus_THISCANNOTEXIST` -> "No such customer", so an
--  absent customer is distinguishable from a failed read):
--
--    3 customers carry a test_clock                        24 events
--    cus_V4t33Unxy0W0y3, cus_V5DUpzl4hGxArA  DELETED        4 events
--    cus_V1uFv2sHp8DZ33  "(created by Stripe CLI)"          1 event
--
--  All 149 accounted for. None is real customer activity, and none could be:
--  every row is test-mode, `billing_customers` holds no rows, and no account has
--  ever had a Stripe customer.
--
--  ## Why DELETE and not "mark processed"
--
--  Stamping `processed_at = now()` would silence the alarm and leave a permanent
--  lie in the table: 149 rows claiming a handler ran and finished. The table is
--  the audit trail for money events. A row that did not happen should not be in
--  it wearing the shape of one that did.
--
-- ------------------------------------------------------------
--  ▶ HOW TO RUN THIS
-- ------------------------------------------------------------
--
--   Supabase SQL Editor. One transaction. It REFUSES rather than deleting if the
--   table has changed shape since this was written — a live-mode row, or a row
--   that reaches a real account, means something happened that this file did not
--   anticipate, and the right response to that is to stop.
--
--   Safe to run twice: the second run deletes nothing and raises the "already
--   clear" notice.
--
--   ⚠️ DO NOT RUN THIS AFTER THE LIVE WEBHOOK SECRET IS IN VERCEL (P12). From
--   that moment an unprocessed row can be a REAL failed event, and this file
--   cannot tell the difference. It is a launch-EVE cleanup, not a launch-morning
--   step.
--
-- ============================================================

begin;

do $$
declare
  total     int;
  livemode  int;
  attached  int;
  deleted   int;
begin
  select count(*) into total
  from public.webhook_events where processed_at is null;

  if total = 0 then
    raise notice 'clear_qa_webhook_events: already clear, nothing to do.';
    return;
  end if;

  -- REFUSAL 1. A live-mode event is real money and is never QA residue.
  select count(*) into livemode
  from public.webhook_events
  where processed_at is null
    and coalesce(payload->>'livemode', 'false') = 'true';

  if livemode > 0 then
    raise exception
      'clear_qa_webhook_events: % of % unprocessed row(s) are LIVEMODE. Refusing. A live-mode event is real customer money, not QA residue. Nothing has been changed. Inspect: SELECT stripe_event_id, type, received_at FROM webhook_events WHERE processed_at IS NULL AND payload->>''livemode'' = ''true'';',
      livemode, total;
  end if;

  -- REFUSAL 2. Any row that reaches an account that still exists.
  select count(*) into attached
  from public.webhook_events w
  where w.processed_at is null
    and (
      (w.payload->'data'->'object'->'metadata'->>'user_id') is not null
      and exists (
        select 1 from auth.users u
        where u.id::text = w.payload->'data'->'object'->'metadata'->>'user_id'
      )
    );

  if attached > 0 then
    raise exception
      'clear_qa_webhook_events: % unprocessed row(s) name a user_id that STILL EXISTS in auth.users. Refusing. Nothing has been changed.',
      attached;
  end if;

  -- REFUSAL 3. Any row whose customer is mapped to a real account.
  select count(*) into attached
  from public.webhook_events w
  where w.processed_at is null
    and coalesce(w.payload->'data'->'object'->>'customer',
                 w.payload->'data'->'object'->>'id')
        in (select stripe_customer_id from public.billing_customers);

  if attached > 0 then
    raise exception
      'clear_qa_webhook_events: % unprocessed row(s) belong to a customer in billing_customers. Refusing. Nothing has been changed.',
      attached;
  end if;

  delete from public.webhook_events where processed_at is null;
  get diagnostics deleted = row_count;

  raise notice 'clear_qa_webhook_events: deleted % unprocessed row(s). Processed rows are untouched.', deleted;
end $$;

commit;

-- ------------------------------------------------------------
--  ▶ VERIFY afterwards. Expect unprocessed = 0 and processed = 13692.
--    ⚠️ The processed count must NOT have moved. If it has, this deleted
--       something it should not have.
-- ------------------------------------------------------------
--
-- SELECT count(*) FILTER (WHERE processed_at IS NULL)     AS unprocessed,
--        count(*) FILTER (WHERE processed_at IS NOT NULL) AS processed,
--        count(*)                                          AS total
--   FROM webhook_events;
