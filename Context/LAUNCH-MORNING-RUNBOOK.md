# LAUNCH MORNING RUNBOOK — Thursday 27 August 2026

Written 26 August 2026 for Adrian, to be followed top to bottom on the day.

**Reconciled from:** `billing-12-go-live.md` §4's P-sequence and S-sequence, the
corrections landed 25–26 August, and the standing rulings. **Where a source was
wrong, this file wins and says so** — every disagreement is listed in
*RECONCILIATION* at the foot, with which one I took and why.

**How to read a step.** Every step says **DO**, **WORKED WHEN**, **IF NOT**.
Steps marked **[ADRIAN]** are your own hands — a dashboard, a browser, a SQL
editor. Steps marked **[CLAUDE]** are ones to hand to me. Steps marked
**[EITHER]** you can do or hand over.

**Do not batch. Do not skip ahead. If a step's WORKED WHEN does not happen, stop
at that step** — every one of them is a gate for the step after it.

---

```text
╔═══════════════════════════════════════════════════════════════════════════╗
║  LAUNCH MORNING — 27 AUGUST 2026                                          ║
║  Follow top to bottom. Do not batch. Stop at the first WORKED WHEN that    ║
║  does not happen.                                                         ║
║                                                                           ║
║  THE THREE IRREVERSIBLE STEPS ARE P11, P12 AND S5. Everything before P11   ║
║  can be undone. Nothing after S5 can.                                     ║
╚═══════════════════════════════════════════════════════════════════════════╝


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 0 — PRE-FLIGHT.  Nothing here changes anything. All of it is safe.   │
│  Budget 30 minutes.                                                       │
└───────────────────────────────────────────────────────────────────────────┘

═══ P0 — CONFIRM YOU ARE ON THE REAL main ═══                        [CLAUDE]

  ⚠️ READ THIS EVEN IF YOU HAND THE STEP OVER. Your LOCAL main is NOT main.
  Measured 26 Aug: local main = 23434e0, subject "Merge remote-tracking branch
  'origin/main' into admin/dashboard". That is a stale admin/dashboard merge.
  The real one is origin/main = b925568. Everything today works against
  origin/main. Reverting onto local main reverts onto the wrong tree.

  DO
      git fetch origin --prune
      git rev-parse --short origin/main
      git log -1 --format='%h %s' origin/main

  WORKED WHEN
      origin/main prints b925568 — or a NEWER commit that you recognise,
      because you or I pushed it.

  IF NOT
      If origin/main is a hash you do not recognise, STOP and tell me.
      Somebody else pushed to main and nothing below is safe until we know
      what it was.


═══ P0a — PUSH THE BRANCH. ⚠️ NEW STEP, NOT IN SPEC 12 ═══           [CLAUDE]

  ⚠️ THIS IS THE ONE THAT WOULD HAVE BITTEN YOU HARDEST.
  Measured 26 Aug: origin/wave3/billing-cancel = ad296c5, and the local branch
  is THIRTY-ONE COMMITS AHEAD of it. The remote copy is missing the whole legal
  v2.0 wave, the billing UI round, and everything landed on 26 August.

  If you merge origin/wave3/billing-cancel tomorrow you ship a month-old branch
  and every check below still passes, because they check main against a branch
  that is itself stale.

  DO
      git status --porcelain                     # must print nothing
      git push origin wave3/billing-cancel
      git rev-parse --short wave3/billing-cancel origin/wave3/billing-cancel

  WORKED WHEN
      git status prints NOTHING (a clean tree), and the two hashes are the SAME.

  IF NOT
      Tree not clean → stop and show me what is uncommitted. Do not commit it
      yourself on the morning.
      Push rejected → stop. A rejection means the remote moved and somebody
      else has been working on this branch.


═══ P0b — THE LEGAL DOCUMENTS, BEFORE ANYTHING PUBLISHES THEM ═══   [ADRIAN]

  ⚠️ THE DOCUMENTS ARE ALREADY LIVE AND ALREADY CURRENT. Adrian ran the SQL on
  25 August, two days early, deliberately. So this is NOT "publish them" — it is
  "confirm what is already published is fit to be read by the public today".

  This is the last moment you can change a legal document quietly. After the
  gate goes on, people are reading them.

  DO — Supabase dashboard → SQL Editor → paste and Run:

      SELECT doc_type,
             version,
             is_current,
             is_beta,
             effective_date,
             (body LIKE '%—%')                        AS em_dash,
             (body LIKE '%Supersedes v1.4%')          AS wrong_lineage,
             (body LIKE '%DD Month%')                 AS placeholder_date,
             (body ILIKE '%DRAFT%')                   AS says_draft,
             (body ILIKE '%WATERMARK%')               AS says_watermark,
             (body ILIKE '%lorem%' OR body ILIKE '%TBD%'
              OR body ILIKE '%TODO%' OR body LIKE '%XXX%')
                                                      AS other_placeholder,
             length(body)                             AS length
        FROM legal_documents
       WHERE is_current
       ORDER BY doc_type;

  WORKED WHEN — FOUR rows, and this exact picture:

      doc_type              version  is_current  is_beta  effective_date
      consumer_health_data  2.0      true        false    2026-08-27
      medical_disclaimer    2.0      true        false    2026-08-27
      privacy_policy        2.0      true        false    2026-08-27
      terms_of_service      2.0      true        false    2026-08-27

      em_dash            false on ALL FOUR
      wrong_lineage      false on ALL FOUR
      placeholder_date   false on ALL FOUR
      says_draft         false on ALL FOUR
      says_watermark     false on ALL FOUR
      other_placeholder  false on ALL FOUR

      length             4383 / 7283 / 31185 / 25644
                         (consumer_health_data / medical_disclaimer /
                          privacy_policy / terms_of_service)

      This was the exact state measured on 26 August. Any difference means
      something changed overnight.

  ⚠️ WHAT is_beta MEANS, in plain English. It is the DRAFT MARKER. If it is
     true, the public page prints "· Beta draft" beside the version number.
     All four are false. If any is true, the page is telling the world your
     legal terms are a draft.

  ⚠️ THERE IS NO WATERMARK FEATURE. The check above is looking for the WORD in
     the text, which is the only kind of watermark this system could have — the
     pages render plain text from the database and nothing overlays them. A
     `false` here means "the word is not in the document", not "I checked an
     image". That is the honest limit of this check.

  THEN READ ALL FOUR PAGES WITH YOUR OWN EYES:

      https://trackdco.app/terms
      https://trackdco.app/privacy
      https://trackdco.app/medical-disclaimer
      https://trackdco.app/consumer-health-data

  WORKED WHEN
      Each one loads, shows "Version 2.0 · Effective 27 August 2026", the
      correct title, no "Beta draft", and reads as finished prose from top to
      bottom. Scroll to the END of each — a truncated document looks perfect
      until the last screen.

  IF NOT
      ANY of em_dash / wrong_lineage / placeholder_date / says_draft /
      says_watermark / other_placeholder is TRUE
        → STOP. Do not launch. Tell me which document and which column. This is
          a legal-text change and it is mine to write and yours to run, and it
          must happen before anybody reads the document.
      A page 404s
        → STOP. is_current has moved. Run the query above and send me the
          output.
      is_beta is true anywhere
        → STOP. One-line fix, but it must be run before launch.

  ⚠️ AND THE RE-RUN. After ANY change to a legal document today — any at all —
     run the SAME query again and read the SAME six false columns. Do not
     assume a targeted fix stayed targeted. The em-dash sweep in particular has
     to be re-run after every edit: a replacement pasted from a word processor
     is exactly how an em dash gets in, and that is the most likely way one
     arrives today.

  LAST SAFE MOMENT TO STOP: any time before P13. Nothing about the documents is
  irreversible — a document can be re-published at any point.


═══ P2 — CONFIRM MIGRATION 003 IS APPLIED ═══                       [ADRIAN]

  ⚠️ DO NOT RE-APPLY IT. It went in on 16 August. This only reads.

  DO — SQL Editor:

      SELECT courtesy_until FROM subscriptions LIMIT 1;

  WORKED WHEN
      It returns an EMPTY RESULT — zero rows, no error. That is success: the
      column exists and the table is empty.

  IF NOT
      An error mentioning `column "courtesy_until" does not exist` (code 42703)
        → STOP. 003 is missing and the courtesy period will not work. Tell me.


═══ P7 — LOCKFILE / VERSIONS ═══                                    [CLAUDE]

  DO
      npm ci && npm run check

  WORKED WHEN
      gate-audit prints "clean. 32 gated, 2 conditional, 70 ungated"
      81 test files pass, 1754 tests pass
      git status --porcelain prints NOTHING (npm ci did not move the lockfile)

  IF NOT
      Any red → STOP. Do not launch on a red suite. Send me the output.
      package-lock.json changed → STOP. The dependency tree moved overnight.


═══ P8 — STORAGE BUCKETS ARE PRIVATE ═══                            [ADRIAN]

  ⚠️ RE-CHECKED EVERY TIME even though it passed before. A bucket's privacy is
  a dashboard toggle that nothing in the code can guarantee, so a past check is
  evidence about the past.

  DO — Supabase dashboard → Storage. Open each of the four buckets in turn and
       look at its settings: bloodwork, progress photos, journal, avatars.

  WORKED WHEN
      All four say PRIVATE.

  IF NOT
      Any bucket public → STOP AND FIX IT IMMEDIATELY, before anything else on
      this page. That is people's medical photographs.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 1 — THE RE-LAND.  Reversible up to and including the deploy.        │
│  Budget 20 minutes.                                                       │
└───────────────────────────────────────────────────────────────────────────┘

═══ P3 — REVERT ═══                                                 [CLAUDE]

  ⚠️ REVERT FIRST, THEN MERGE. THE ORDER IS THE WHOLE STEP.

  WHY, in plain English. On 13 August the billing work was merged into main and
  then taken straight back out again by commit c547dba ("Revert 'Merge
  wave3/billing-cancel' — billing comes off main until Adrian says"). Git
  remembers that removal. Until you undo the removal, git believes the billing
  code is *supposed* to be absent, and merging the branch will bring across
  almost nothing.

  So: the REVERT undoes the removal — it puts back the code exactly as it stood
  on 13 August, and nothing later.

  DO
      git checkout main
      git reset --hard origin/main
      git revert --no-edit c547dba

  WORKED WHEN
      The revert completes with no conflict, and the billing files are back.

  IF NOT
      A merge conflict → STOP. Do not resolve it under time pressure. Tell me.

  LAST SAFE MOMENT TO STOP: right now, and until you push. `git reset --hard
  origin/main` undoes everything in this part completely.


═══ P3a — MERGE ═══                                                 [CLAUDE]

  ⚠️ THE REVERT ALONE SHIPS 13 AUGUST'S CODE. THIS IS THE STEP THAT SHIPS
  TODAY'S.

  WHY, in plain English. The revert restores the tree as it was at the original
  merge and NOTHING AFTER IT. Everything built on the branch since 13 August —
  which is nearly all of it — is new to main and only a merge brings it. Skip
  this and you launch a version of the app that is two weeks behind and missing,
  among much else: the open-invoice void, the `billing_reason` guard, the
  courtesy period, the save offer, the past-due grace, the dashboard banner,
  every legal v2.0 change, and every signed-copy pin.

  ⚠️ AND SEE P0a. If you did not push the branch, THIS is where a 31-commit-old
  branch gets shipped and looks like a success.

  DO
      git merge --no-ff wave3/billing-cancel
      git log --oneline -3

  WORKED WHEN — all of these are present on the tree you are about to ship:

      git grep -l "voidOpenInvoiceFor"        -- lib/   →  1 file
      git grep -l "FLAG_CANCELLABLE_STATUSES" -- lib/   →  3 files
      git grep -l "billing_reason"            -- lib/   →  4 files
      git grep -l "listAllSubscriptions"      -- lib/   →  8 files
      git grep -l "courtesy_until"            -- lib/   →  16 files
      ls supabase/billing/004_regrace_launch_date.sql    →  the file exists
      ls lib/billing/signed/continued-use.txt            →  the file exists

      ⚠️ `billing_reason` IS IN lib/, NOT app/. Spec 12 and the handover both
      describe it as living in "the handler", which reads like the webhook
      route. It does not — it is in `lib/billing/sync.ts:754`, inside
      `markPastDue`, which the route calls. Checking `app/` returns ZERO on a
      perfectly correct tree, which would stop you on a good merge. Measured
      26 Aug.

      The last one is the tell that TODAY'S work came across, not just
      August's — it was written on 26 August.

  IF NOT
      Conflicts → STOP. Tell me.
      Any grep returns 0 → STOP. The merge did not bring what it should.

  LAST SAFE MOMENT TO STOP: until you push. Until then, `git reset --hard
  origin/main` returns main to exactly where it was this morning.


═══ P3b — RUN THE SUITE ON THE MERGED TREE ═══                      [CLAUDE]

  ⚠️ NOT THE SAME AS P7. P7 tested the branch. This tests the MERGE RESULT,
  which is a tree that has never existed before this morning.

  DO
      npm run check

  WORKED WHEN
      gate-audit clean 32 / 2 / 70, and 1754 tests pass.

  IF NOT
      STOP. Do not push a red merge. `git reset --hard origin/main` and tell me.


═══ P3c — PUSH ═══                                                  [ADRIAN]

  ⚠️ THIS IS THE FIRST STEP THAT REACHES THE OUTSIDE WORLD. Pushing to main
  triggers a production deploy on Vercel automatically.

  Still recoverable — but by rolling forward or by a Vercel rollback, not by
  pretending it did not happen.

  DO
      git push origin main

  WORKED WHEN
      The push is accepted and a new deployment appears in Vercel within a
      minute or so.

  IF NOT
      Rejected → STOP. Somebody pushed to main between P0 and now.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 2 — THE DEPLOY.  Still reversible: Vercel can roll back.            │
│  Budget 20 minutes.                                                       │
└───────────────────────────────────────────────────────────────────────────┘

═══ P3d — WAIT FOR THE DEPLOY, THEN VERIFY IT IS HEALTHY ═══        [ADRIAN]

  ⚠️ "VERIFIED HEALTHY" IS NOT "VERCEL SAYS READY". Vercel says Ready when the
  build compiled. It says nothing about whether the app can reach the database,
  render a page, or serve a document. Everything after this point depends on
  this being genuinely true, so it gets a real check.

  DO — first, in the Vercel dashboard:
      Confirm the newest Production deployment shows READY, and that its commit
      message is the merge you just pushed.

  THEN — the real check. Open each of these in a browser. All six must load:

      1. https://trackdco.app/                       the homepage renders
      2. https://trackdco.app/terms                  Version 2.0, Effective 27 August 2026
      3. https://trackdco.app/privacy                Version 2.0, Effective 27 August 2026
      4. https://trackdco.app/medical-disclaimer     Version 2.0, Effective 27 August 2026
      5. https://trackdco.app/consumer-health-data   Version 2.0, Effective 27 August 2026
      6. https://trackdco.app/terms/1.3              Version 1.3, Effective 20 June 2026

  ⚠️ NUMBER 6 IS THE ONE THAT ACTUALLY PROVES SOMETHING. It is a route that
     only exists in code pushed on 26 August, and it can only render by reading
     a row out of the database. If it loads, then: the new code deployed, the
     app can reach Supabase, and page rendering works. Numbers 2 to 5 could all
     be served from an old cache. Number 6 could not.

  THEN — sign in as yourself and confirm the app loads: your protocol is there,
  today's doses are there, nothing is blank and nothing shows an error.

  WORKED WHEN
      All six URLs load with the right version and effective date, AND you are
      signed in and looking at your own real data.

  IF NOT
      Deployment FAILED in Vercel
        → Read the build log. If you cannot see it in a minute, roll back
          (Vercel → the previous deployment → Promote to Production) and tell
          me. Do not debug a build on launch morning.
      /terms/1.3 404s but the others load
        → The deploy is serving OLD code. Check the deployment's commit hash
          matches your merge. STOP until it does.
      Any page 500s
        → Roll back in Vercel and tell me. STOP.
      The app loads but your data is missing
        → STOP IMMEDIATELY. Roll back. That is a database connection problem
          and nothing below is safe.

  LAST SAFE MOMENT TO STOP: right here. This is the LAST fully clean stop.
  Vercel → previous deployment → Promote to Production puts the world back
  exactly as it was, and nobody will have noticed. After P11 that is no longer
  true.


═══ P4 — THE THREE LIVE PRICE IDs INTO VERCEL ═══                   [ADRIAN]

  DO — Stripe dashboard, ⚠️ WITH THE TEST-MODE TOGGLE OFF (top right, must say
       you are viewing LIVE data). Create three prices on the Pro product, each
       recurring, each "interval count" 1:

           weekly    every 1 week
           monthly   every 1 month
           yearly    every 1 year

       Copy each price id — they start `price_`.

       Then Vercel → the project → Settings → Environment Variables. Add three,
       scoped to PRODUCTION:

           STRIPE_PRICE_WEEKLY    price_...
           STRIPE_PRICE_MONTHLY   price_...
           STRIPE_PRICE_YEARLY    price_...

       Also confirm these are on LIVE values, not test:

           STRIPE_SECRET_KEY                  starts sk_live_
           NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY starts pk_live_

       ⚠️ DO NOT ADD STRIPE_WEBHOOK_SECRET YET. That is P5b and it is
          deliberately later. The reason is written there.

       Then REDEPLOY (Vercel → Deployments → the latest → Redeploy). Environment
       variables do not reach a running deployment; only a new one picks them up.

  WORKED WHEN
      After the redeploy, open https://trackdco.app/plans in a browser.
      All three plans render with prices, and there is no error on the page.

  IF NOT
      A "mode mismatch" error, or prices missing
        → You have mixed test and live. A `price_` created in test mode cannot
          be used with an `sk_live_` key. Check the toggle was OFF when you made
          them, and check the secret key starts sk_live_.
      The page is blank
        → STOP and tell me.

  LAST SAFE MOMENT TO STOP: here. No money can move yet — there is no webhook
  secret, so nothing Stripe says reaches the app.


═══ P5 — REGISTER THE WEBHOOK ENDPOINT ═══                          [ADRIAN]

  DO — Stripe dashboard, LIVE mode → Developers → Webhooks → Add endpoint.

       URL:   https://trackdco.app/api/stripe/webhook

       Select these THIRTEEN events. ⚠️ Spec 12 says eight. Spec 12 is out of
       date — the handler grew. Thirteen is the measured number:

           charge.dispute.closed
           charge.dispute.created
           charge.dispute.funds_withdrawn
           charge.dispute.updated
           charge.refunded
           customer.subscription.created
           customer.subscription.deleted
           customer.subscription.trial_will_end
           customer.subscription.updated
           customer.updated
           invoice.paid
           invoice.payment_failed
           payment_method.attached

       Save it. Then COPY THE SIGNING SECRET (starts `whsec_`) and put it
       somewhere you can paste from in a minute. DO NOT put it into Vercel yet.

  WORKED WHEN
      The endpoint is listed, enabled, and shows 13 events.

  IF NOT
      An event is not in Stripe's list → tell me its name. Do not guess a
      similar one.


═══ P5b — THE WEBHOOK SECRET, ⚠️ ONLY NOW ═══                       [ADRIAN]

  ⚠️ WHY THIS WAITED, AND IT IS NOT CAUTION FOR ITS OWN SAKE.

  The webhook secret is what makes Stripe's messages real to the app. Without
  it, every incoming event is rejected and nothing is written. With it, events
  start being processed immediately.

  The old code on main — the code that was live until an hour ago — has NO
  `billing_reason` guard on the path the webhook drives (`markPastDue`, in
  `lib/billing/sync.ts`). That guard is what stops the app treating a
  customer's FIRST invoice as a failed RENEWAL and clawing back access that was
  never owed. It only exists in the code you merged in P3a.

  So: if the secret goes in while an old deployment is still serving, a real
  event can hit the old handler and take access away from somebody. Putting it
  in only after the new deploy is verified healthy makes that impossible.

  ⚠️ CONFIRM BEFORE YOU PASTE: P3d passed, and /terms/1.3 loaded. If you have
     redeployed since P3d for any reason, re-check /terms/1.3 first.

  DO — Vercel → Settings → Environment Variables → add, scoped to PRODUCTION:

           STRIPE_WEBHOOK_SECRET   whsec_...

       Then REDEPLOY, and wait for READY.

  WORKED WHEN
      Stripe dashboard → your endpoint → "Send test webhook" → pick
      `customer.subscription.updated` → Send.
      Stripe shows a 200 response.

      ⚠️ AND A 200 IS NOT ENOUGH ON ITS OWN. Read the RESPONSE BODY that Stripe
      shows underneath. It must contain `"received":true`. A 200 with a
      different body means the route answered but the handler did not run —
      that exact confusion has cost this project two false all-clears.

  IF NOT
      400 with a signature error → the secret is wrong, or you copied the test
      endpoint's secret. Re-copy from the LIVE endpoint.
      404 → the URL is wrong.
      500 → STOP and tell me.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 3 — THE COUNTS, THEN THE POINT OF NO RETURN.                        │
│  Budget 20 minutes. Do not rush this part.                                │
└───────────────────────────────────────────────────────────────────────────┘

═══ P10a — THE COUNTS, WITH TWO INSTRUMENTS ═══                     [ADRIAN]

  ⚠️ TWO INSTRUMENTS, NEVER ONE, AND THEY MUST AGREE. The admin listing and
  direct SQL disagreed once on this project. One number from one source is a
  claim; two numbers that agree is a measurement. If they disagree, the honest
  answer is "I do not know how many users there are", and you do not run a
  migration against a population you cannot count.

  INSTRUMENT 1 — SQL. Supabase → SQL Editor:

      SELECT (SELECT count(*) FROM auth.users)          AS auth_users,
             (SELECT count(*) FROM profiles)            AS profiles,
             (SELECT count(*) FROM entitlements)        AS entitlements,
             (SELECT count(*) FROM entitlements
               WHERE is_active = false)                 AS revoked,
             (SELECT count(*) FROM subscriptions)       AS subscriptions,
             (SELECT count(*) FROM billing_customers)   AS billing_customers,
             (SELECT count(*) FROM auth.users
               WHERE email LIKE '%@trackd-qa.invalid')  AS qa_accounts,
             (SELECT count(*) FROM webhook_events
               WHERE processed_at IS NULL)              AS unprocessed_events,
             (SELECT count(*) FROM entitlements
               WHERE source = 'comp'
                 AND active_until
                     = timestamptz '2026-08-31 00:48:47.401+00')
                                                        AS awaiting_004;

  INSTRUMENT 2 — the admin listing. Supabase dashboard →
      Authentication → Users. Read the TOTAL USER COUNT off the top of the
      table. Do not count rows on the page — that is one page of many.

  WORKED WHEN — all of this, together:

      auth_users          94   ← and INSTRUMENT 2 shows the SAME number
      profiles            94
      entitlements        90
      revoked              0
      subscriptions        0
      billing_customers    0
      qa_accounts          0
      unprocessed_events   0
      awaiting_004        86   ← must be 86. This is 004's work, still to do.

      These were the exact figures on 26 August.

  ⚠️ A HIGHER auth_users IS FINE AND IS NOT A PROBLEM. It means real people
     signed up overnight. That has happened three times on this project and
     somebody nearly "fixed" it by deleting them. **NEVER DELETE A USER TO MAKE
     A COUNT MATCH.** If auth_users is 95 or 96, write the new number down,
     confirm profiles matches it, and carry on.

  IF NOT
      The two instruments DISAGREE
        → STOP. Do not proceed to P11. Tell me both numbers.
      revoked is not 0
        → STOP. Somebody's access was turned off and nobody recorded why.
      subscriptions or billing_customers is not 0
        → STOP. Somebody has a subscription before launch. Tell me.
      qa_accounts is not 0
        → STOP. Test fixtures are in the production user table and 004 would
          treat them as real people.
      unprocessed_events is not 0
        → NOT a stop on its own. It means the webhook is already working, which
          after P5b is expected. Note the number; you will compare against it in
          the soak.
      awaiting_004 is NOT 86
        → STOP. If it is 0, 004 has ALREADY BEEN APPLIED — do not run it again,
          skip to P11-verify and read the rows. Any other number and the grace
          rows are not the shape 004 expects.


═══ P11 — MIGRATION 004. ⚠️⚠️ THE POINT OF NO RETURN ⚠️⚠️ ═══       [ADRIAN]

  ╔═══════════════════════════════════════════════════════════════════════╗
  ║  STOP AND READ BEFORE YOU RUN ANYTHING.                               ║
  ║                                                                       ║
  ║  WHAT THIS DOES. It moves 86 people's free access to end fourteen     ║
  ║  days from THE MOMENT YOU PRESS RUN. Not from midnight, not from a    ║
  ║  date typed in — from that moment.                                    ║
  ║                                                                       ║
  ║  WHAT CANNOT BE UNDONE. The date it writes is the date every screen   ║
  ║  then shows those 86 people: the switch-on notice, the banner, the    ║
  ║  reminder email, the Billing screen. Once somebody has been shown a   ║
  ║  date in writing, that date cannot be quietly moved. There is no      ║
  ║  undo, and this file cannot move anybody a second time — being        ║
  ║  pinned to the original instant is exactly what makes it run once.    ║
  ║                                                                       ║
  ║  Correcting a wrong run needs a SECOND migration, written by hand,    ║
  ║  pinned to whatever wrong instant the first run produced.             ║
  ║                                                                       ║
  ║  THE LAST SAFE MOMENT TO STOP IS NOW. Before this, a Vercel rollback  ║
  ║  puts the world back and nobody notices. After this, it does not:     ║
  ║  a rollback leaves 86 people holding a date the app can no longer     ║
  ║  honour.                                                              ║
  ║                                                                       ║
  ║  BEFORE YOU RUN IT, CONFIRM ALL FOUR:                                 ║
  ║    ▢ P3d passed — the deploy is verified healthy                      ║
  ║    ▢ P0b passed — the documents are right                             ║
  ║    ▢ P10a passed — both instruments agree, awaiting_004 = 86          ║
  ║    ▢ You are launching TODAY, not tomorrow. The fortnight starts now. ║
  ╚═══════════════════════════════════════════════════════════════════════╝

  DO — Supabase → SQL Editor. Open the file
       supabase/billing/004_regrace_launch_date.sql, copy the SQL from it
       (everything from `do $$` to the final `end $$;`) and Run it ONCE.

       ⚠️ ONCE. Do not run it twice "to be sure". It refuses a second run, but
          do not rely on that as a habit.

  WORKED WHEN
      A NOTICE appears reading:
          regrace_launch_date: moving 86 row(s) from ... to ...

  IF NOT
      "no rows carry the original backfill instant"
        → It has ALREADY RUN. Do not run it again. Go to P12 and read the rows.
      "N row(s) would be SHORTENED"
        → It refused, and it was RIGHT to. Nothing changed. STOP and tell me.
      Any other error
        → STOP. Nothing has changed if it raised. Tell me the message.


═══ P12 — VERIFY 004'S EFFECT FROM THE ROWS ═══                     [ADRIAN]

  ⚠️ NOT "did the step run" — "did the step DO THE THING". This project has
  shipped a step that ran, did nothing, and reported success. Read the rows.

  DO — SQL Editor:

      SELECT count(*)                                    AS comp_rows,
             count(*) FILTER (WHERE active_until IS NULL) AS undated,
             count(DISTINCT active_until)                AS distinct_dates,
             min(active_until)                           AS the_date,
             count(*) FILTER (WHERE active_until
                   = timestamptz '2026-08-31 00:48:47.401+00') AS still_old
        FROM entitlements
       WHERE source = 'comp' AND product = 'pro' AND is_active;

  WORKED WHEN
      comp_rows        90
      undated           4      ← the free-for-life accounts, untouched
      distinct_dates    1      ← the 86 all share ONE instant
      the_date          today's date + 14 days     ← READ IT. Is it right?
      still_old         0      ← nobody left on the old date

  IF NOT
      still_old is not 0     → the migration only moved some. STOP, tell me.
      distinct_dates is not 1 → the rows are not aligned. STOP, tell me.
      undated is not 4        → STOP. Somebody's free-for-life access moved.
      the_date is wrong       → STOP IMMEDIATELY and tell me the date it shows.
                                 This is the one number 86 people will be shown.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 4 — SWITCHING IT ON.                                                │
└───────────────────────────────────────────────────────────────────────────┘

═══ P11b — STRIPE'S TRIAL-ENDING EMAIL ═══                          [ADRIAN]

  ⚠️ THE RECORDS DISAGREE ABOUT THIS ONE AND I HAVE NOT RESOLVED IT FOR YOU.
     Spec 12 and D34 say turn it OFF. The second clock run's handover records
     it as REVERSED — the email stays ON — and says both records need
     correcting. Neither correction was ever made, so I do not know which
     ruling is current, and I am not going to guess at a customer email.

  DO — Stripe dashboard, LIVE mode → Settings → Customer emails. LOOK at the
       "trial ending" setting and note whether it is on or off.

       Then decide, and tell me which you chose so I can correct the records.

       The measured facts, so you can decide in ten seconds:
         · The event fires with 3 days left, but the email's lead is set to 7
           days against a 7-day trial — so it sends at trial START.
         · On a courtesy period it tells a PAYING customer their TRIAL is
           ending, which is false, and Stripe's wording cannot be edited.
         · The app sends its own reminder either way.

       My read: OFF matches the measurements. But it is your call.

  ⚠️ RECEIPT EMAILS STAY ON (D65). Different email, different purpose. Do not
     turn customer emails off wholesale.

  WORKED WHEN
      You have read the setting with your own eyes and made a decision.
      There is no API for this — an email Stripe sends is not observable from
      code, so eyes are the only instrument.


═══ P12a — THE REMINDER FLAG ═══                                    [ADRIAN]

  DO — Vercel → Settings → Environment Variables, PRODUCTION:

           REMINDER_PROMISE_ENABLED   true

       Then REDEPLOY and wait for READY.

  WORKED WHEN
      The deployment is Ready and the variable shows in the Production list.

  ⚠️ WHY BEFORE THE GATE. It turns on two sentences that PROMISE a reminder
     — "and we'll remind you first" on the cancel dialog's terms line, and
     "We'll remind you before that happens." on the accept screen. Both or
     neither. Setting it before the gate means the promise is live before any
     user can reach the screen that makes it.

  IF NOT
      Deployment fails → roll back and tell me. Do NOT proceed to P13.


═══ P13 — THE GATE. THIS IS THE LAUNCH ═══                          [ADRIAN]

  ⚠️⚠️ NEVER BEFORE P12 IS CONFIRMED FROM THE ROWS. Not "P11 ran" — P12 read.
     Turning the gate on before the grace dates are right locks out 86 people
     who are entitled to two more weeks.

  ▢ Confirm P12 passed and you READ the date.

  DO — Vercel → Settings → Environment Variables, PRODUCTION:

           BILLING_GATE_ENABLED   true

       Then REDEPLOY and wait for READY.

  WORKED WHEN — ⚠️ PROVE IT FROM A LABEL, NOT FROM AN ABSENCE.

      "No pop-up appeared" is also what a broken page looks like. The proof is
      the Access label on the Billing screen, because it says something
      POSITIVE in both directions:

          gate OFF  →  Access reads "Pro"
          gate ON   →  Access reads "Read only"

      Sign in as an account with NO entitlement — one of the 4 accounts that
      has no row, or a brand-new sign-up — and open Billing.

      WORKED WHEN it reads "Read only".

      AND THE CONTROL: sign in as a free-for-life comp account and open
      Billing. It must read "Pro".

  IF NOT
      BOTH accounts read "Pro"
        → The flag did not reach the running deployment. Redeploy again. A
          variable does not reach a deployment that was already running.
      BOTH accounts show nothing / an error / a blank
        → The ENVIRONMENT is broken, not the product. Roll back and tell me.
          A control that fails on both is never a product finding.
      The lapsed account reads "Read only" and the comp reads "Read only"
        → STOP. The gate is locking out entitled people. TURN IT OFF
          IMMEDIATELY (see the kill switch below) and tell me.

  ⚠️ THE KILL SWITCH, AND ITS EXACT LIMIT.
     Setting BILLING_GATE_ENABLED to false and redeploying returns EVERY
     account to full write access, fast, without a code change.

     **IT DOES NOT STOP STRIPE CHARGING ANYBODY.** It is a mitigation for the
     gate, not for billing. Stopping charges means cancelling subscriptions in
     the Stripe dashboard, by hand, one at a time.


═══ P10 — THE DOCUMENTS ARE PUBLISHED ═══                           [ADRIAN]

  ⚠️ THERE IS NOTHING TO RUN. The documents went live on 25 August when you ran
  the SQL yourself. Spec 12's P10 and the old handover both say to run
  supabase/legal/013_legal_documents_v2_0.sql. DO NOT. That file contains no
  executable SQL at all — running it does nothing and reports success, which is
  the worst possible outcome on a launch morning. The step was deleted on
  26 August for exactly that reason.

  DO — confirm, don't publish. Open the switch-on notice as one of the 86 beta
       accounts (or ask me to point you at one) and read it.

  WORKED WHEN
      The notice shows the date from P12 — the same date, not a different one.
      Its two document links open /terms and /privacy, both at Version 2.0.

  IF NOT
      The notice shows a DIFFERENT date from P12 → STOP AND TELL ME. A screen
      contradicting its own data is the failure this whole ordering exists to
      prevent.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 5 — PROVING MONEY WORKS.  ⚠️ IRREVERSIBLE: REAL MONEY.              │
└───────────────────────────────────────────────────────────────────────────┘

═══ S5 — THE SMOKE PAYMENT ═══                                      [ADRIAN]

  ⚠️ IT MUST BE A FRESH ACCOUNT WITH NO FREE ACCESS, ON A REAL CARD.

  WHY, in plain English. An account with a beta grace or a comp entitlement
  does not get charged — it gets free time. It will sail through checkout, look
  perfect, and prove NOTHING about whether money works. It tests a different
  path with a different pass condition. This has to be an account that is asked
  for money and pays it.

  DO
      1. Create a BRAND NEW account, with an email that has never been used
         here — not yours, not a founder's, not on the comp list, not
         @trackd-qa.invalid.

      2. ⚠️ BEFORE PAYING, CONFIRM IT HAS NO FREE ACCESS. SQL Editor:

             SELECT u.email, e.source, e.active_until, e.is_active
               FROM auth.users u
               LEFT JOIN entitlements e ON e.user_id = u.id
              WHERE u.email = 'THE-EMAIL-YOU-JUST-USED';

         WORKED WHEN it returns ONE row with source, active_until and is_active
         all NULL — no entitlement at all.

         IF IT HAS ONE → STOP. Use a different email. Do not "waive" it under
         time pressure.

      3. Buy the WEEKLY plan — the cheapest real charge that exercises the
         whole chain — with your own real card.

  WORKED WHEN — all FOUR, and none of them is optional:

      1. THE CHARGE LANDS.
         Stripe → Payments. A succeeded payment for the weekly amount.

      2. THE WEBHOOK IS DELIVERED.
         Stripe → Developers → Webhooks → your endpoint → recent deliveries.
         `invoice.paid` shows 200, and the response body contains
         `"received":true`.

      3. THE ENTITLEMENT ROW IS WRITTEN. SQL Editor, same query as step 2
         above. It must NOW return source `stripe`, is_active `true`, and an
         active_until about a week out.

         ⚠️ THIS IS THE ONE THAT MATTERS MOST. A charge with no entitlement row
         is somebody who paid and got nothing.

      4. THE RECEIPT IS RIGHT.
         Check the inbox. The receipt arrives, names Trackd Co, and shows the
         right amount in USD.

  THEN
      Cancel the subscription in the Stripe dashboard and REFUND the payment.

  IF NOT
      Charge succeeded, NO entitlement row
        → STOP EVERYTHING. Turn the gate OFF (P13's kill switch). Somebody can
          pay and get nothing. Tell me immediately.
      Charge succeeded, webhook shows 400 or 500
        → Same. Gate off, tell me.
      Checkout offers a FREE TRIAL instead of asking for money
        → STOP. The account is not as fresh as you think, or trial eligibility
          is wrong. Do not proceed. This is exactly the vacuous pass this step
          exists to avoid.
      Card declined
        → Not a product fault. Try another card. If two decline, tell me.

  ⚠️ WHAT CANNOT BE UNDONE: the charge itself is real money against your real
     card. The refund returns it, but the transaction stays on the record and
     on your statement. There is no way to test this without that being true.


═══ S2 — RECONCILE ═══                                              [EITHER]

  DO
      BASE=https://trackdco.app npm run reconcile

  WORKED WHEN
      It reports CLEAN, states its mode, and says it paginated to exhaustion.
      Exit code 0.

  IF NOT
      Exit 1 (dirty)      → findings. Read them. Tell me.
      Exit 2 (incomplete) → ⚠️ IT PROVED NOTHING. This is NOT a pass. It could
                            not see everything it needed to. Tell me.


┌───────────────────────────────────────────────────────────────────────────┐
│  PART 6 — THE SOAK.  24 HOURS MINIMUM. YOU MAY LENGTHEN IT, NEVER SHORTEN.│
└───────────────────────────────────────────────────────────────────────────┘

═══ S7 — THE SOAK ═══                                               [EITHER]

  ⚠️ THE WAITING IS THE POINT, not a formality. A renewal boundary, a webhook
  retry and a dunning attempt can each only be observed by living through one.
  Two clean runs an hour apart are one run twice; two clean runs across 24
  hours are evidence.

  WHAT IT IS WATCHING FOR, and check each at least twice in the window:

      1. UNPROCESSED WEBHOOK EVENTS — the alarm.

             SELECT count(*) FROM webhook_events WHERE processed_at IS NULL;

         This started at ZERO today (cleared 26 August). Anything above zero
         means an event arrived and its handler did not finish.
         A few that clear themselves within minutes = Stripe retrying, normal.
         A number that only grows = STOP AND TELL ME.

      2. THE RECONCILE SCRIPT — clean TWICE, across the window, exit 0 both
         times. Exit 2 does not count as one of the two.

      3. ENTITLEMENTS AGAINST SUBSCRIPTIONS — nobody paying without access:

             SELECT count(*) FROM subscriptions s
              WHERE s.status IN ('active','trialing')
                AND NOT EXISTS (SELECT 1 FROM entitlements e
                                 WHERE e.user_id = s.user_id AND e.is_active);

         Must be 0. Anything else is somebody paying for nothing.

      4. THE 86 GRACE ROWS still share ONE date, and it is still P12's date.
         Re-run P12's query. If distinct_dates has become 2, something moved
         a date somebody was shown.

      5. STRIPE'S FAILED DELIVERIES — Developers → Webhooks → your endpoint.
         Any delivery stuck failing is an event the app never saw.

      6. AND YOUR OWN EYES, once: sign in as a real beta account and read the
         notice. It should still name P12's date.

  WORKED WHEN
      24 hours elapsed, two clean reconcile runs inside it, zero unresolved
      alerts, and 1, 3, 4 and 5 all still good.

  ⚠️ NOT BEFORE THE SOAK: telling anybody. No announcement, no post, no email.
     That is S8 and it is tomorrow's decision, not today's.
```

---

## WHAT COULD STILL GO WRONG

Honest, not reassuring. These are ranked by how likely they are to surprise you
tomorrow, and every one of them has actually happened on this project or was
measured as reachable.

**1. You merge a stale branch and everything looks fine.** `origin/wave3/billing-cancel`
is **31 commits behind** local. Every check in P3a would still pass against the
stale branch, because those files existed in August too. The tell is
`lib/billing/signed/continued-use.txt` — it was written on 26 August and exists
nowhere earlier. **Do P0a. Do not skip it.**

**2. A variable goes into Vercel and nothing happens.** Environment variables do
not reach a deployment that is already running. Every single time you add or
change one — prices, webhook secret, reminder flag, gate — you must **redeploy**
and wait for Ready. This will catch you at least once, most likely at P13, and it
will look exactly like the gate being broken.

**3. The gate looks broken and the environment is at fault.** If BOTH the lapsed
account and the comp account show nothing — blank, error, no label at all — that
is not a product finding. A control that fails on both is a broken environment.
Roll back rather than debugging the product.

**4. 004 gets applied the night before, or twice.** The fortnight is measured from
the instant you press Run. Applying it on Wednesday evening means 86 people get
thirteen days and a screen that says fourteen. It refuses a second run, but it
cannot refuse an early one. **Run it on the day you actually launch.**

**5. The smoke test passes vacuously.** This is the most dangerous one, because it
fails *upward* — everything looks green. If the account has a grace or a comp, it
will not be charged, checkout will succeed, and you will have proved nothing about
money. If checkout offers a free trial instead of asking for a card, **that is the
failure**, not a nice surprise. Stop there.

**6. A charge lands with no entitlement row.** The worst outcome in the system:
somebody paid and got nothing. It is why step 3 of S5 is a database read and not a
glance at the screen. If it happens, the kill switch does **not** fix it — the
gate off restores access, but their money is still taken. Refund by hand.

**7. Somebody signs up during launch and the counts move.** A rising `auth_users`
is a real person, three times over on this project. Somebody nearly deleted them to
make a number match. **Never delete a user to make a count agree.**

**8. Stripe test/live mixing.** Every setting is per-mode and none of it carries
across. A `price_` made in test mode with an `sk_live_` key produces a mode-mismatch
error at checkout; the webhook secret from the test endpoint produces a signature
failure. Check the mode toggle before every Stripe action today.

**9. A 200 that proves nothing.** Both at P5b and in the soak: the webhook route
answers `200` for events it refused as duplicates, and answered `200` throughout a
period when the handler never ran at all. **Read the response body.** `"received":true`
is the proof; the status code is not.

**10. The courtesy clawback, if you are unlucky and fast.** Reproduced on a test
clock: a save-offer grant is silently undone by Stripe's own retry, destroying up to
11 days while the screen still shows the granted date. Earliest any real account
could reach it is **3 September** — seven days out, and it needs a subscriber whose
first charge fails, who then cancels, accepts the offer, and gets retried. Ruled not
a launch blocker; queued post-launch beside Q107. If somebody reports losing access
they were promised, **this is the first thing to suspect.**

**11. "Free while it's in beta." on the homepage.** Still there, and false from
today. Flagged, and your copy to change. Nothing breaks — but the first person who
reads it will have been told the wrong price by the front page.

**12. Q107 — the cross-subscription clawback.** Open, unfixed, and it needs somebody
holding two subscriptions where one fails. Reproduced at 5.00 days lost, seen once at
371. Very unlikely on day one with zero subscribers, which is the only reason it is
not blocking.

**13. Time pressure will push you to batch steps.** Every ordering here exists
because reversing it broke something specific and measurable — the gate after the
grace dates, the webhook secret after the healthy deploy, the counts before the
migration. The sequence is the safety.

---

## RECONCILIATION — where the sources disagreed, and which I took

| # | The disagreement | Resolved |
|---|---|---|
| 1 | **P5: spec 12 says "the eight handled events".** | **Thirteen.** Counted from `app/api/stripe/webhook/route.ts` on 26 Aug. The handler grew; the spec did not. Registering eight leaves five event types never delivered. |
| 2 | **P10: spec 12 and the old handover both say to publish the documents / run `013_legal_documents_v2_0.sql`.** | **Deleted.** The documents went live 25 Aug by Adrian's hand, and that file holds **zero** non-comment, non-blank lines — it runs, does nothing, and exits 0. P10 is now a confirmation step. |
| 3 | **P0: spec 12 gives local `main` at 23434e0 as a past observation.** | **Still true today.** Re-measured 26 Aug: local `main` is *still* 23434e0. Kept as a live warning, not history. |
| 4 | **P1: "commit the working tree".** | **Replaced by P0a — push it.** The tree is clean; the *remote branch* is 31 commits behind. Committing was never the risk; pushing is. |
| 5 | **P11b: spec 12 and D34 say the trial-ending email OFF. The clock-run handover records it REVERSED, staying ON, and says both records need correcting.** | **NOT resolved — escalated to Adrian.** No correction was ever made, so neither record can be trusted. I gave the measurements and my read (OFF), and left the decision. I will not guess at a customer email. |
| 6 | **P2: the original said apply 003 by hand.** | **Read-only verify.** Applied 16 Aug. Spec 12 already carries this correction; kept. |
| 7 | **"Verified healthy" is used four times and never defined.** | **Defined as six URLs plus a signed-in check**, with `/terms/1.3` as the load-bearing one — it exists only in 26 Aug code and can only render by reading the database, so it cannot be served from a cache. |
| 8 | **S1 (test clocks) and S3b (kill-switch rehearsal) sit in the launch sequence.** | **Both already done** — S1 twice, S3b before launch week. Not repeated on the morning; the kill switch's *limitation* is carried verbatim into P13. |
| 9 | **S4 (cold agent review) is listed before rollout.** | **Done** — the second clock run was it. Its findings are ruled and either landed or queued. |
| 10 | **S6 (the three comped friends) sits between smoke and soak.** | **Left out of the morning.** Nothing about it gates the soak, and it is not time-critical. Do it during the soak window. |
| 11 | **Spec 12 and the handover both place the `billing_reason` guard in "the handler", which reads as the webhook route.** | **It is in `lib/billing/sync.ts:754`**, inside `markPastDue`. Checking `app/` for it returns **zero on a correct tree** — a check that would have stopped Adrian on a good merge. Corrected in P3a and P5b. |

**Two steps completed since the sources were written**, both by Adrian on 26 August, both verified from the rows rather than from the fact that a command ran:

- **`supabase/ops/001_clear_qa_webhook_events.sql`** — unprocessed `149 → 0`, processed `13692 → 13692` **unmoved**, which is the number that proves the delete hit only its target.
- **`supabase/legal/014_supersedes_v1_3.sql`** (D110) — all three v2.0 documents now read `Supersedes v1.3.`; zero read v1.4.

Both records are struck through and corrected in place rather than overwritten, so a reader can still tell a decision carried out from one merely recorded as carried out.
