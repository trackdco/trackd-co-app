# HANDOVER — TRACKD CO, THE SECOND FULL-LIFECYCLE CLOCK RUN

Written 25 August 2026, ~17:20 AEST, by the session that built the billing UI
round and published the v2.0 legal documents.

**Launch is Thursday 27 August. This is the last verification before it.**

You are a COLD session, and that is the point. The session that wrote this built
the code you are about to test. It is the worst possible reviewer of its own
work, which is why this job was deliberately handed to a fresh context. **Do not
take anything below as proven because it is written down. Measure it.**

---

## 0. THE FIRST THING YOU DO

Answer these three, with the command and its output pasted. Do not start work
until they are answered.

1. **State, measured now:** `git rev-parse --short HEAD`, `git status --porcelain`,
   `npx tsc --noEmit`, `npx vitest run`, `node scripts/gate-audit.mjs --check`,
   the five row counts, the Stripe clock count, which billing flags are in
   `.env.local`, and **migration 004's state read FROM THE ROWS, not from git**.
   Name anything that differs from §1 below. **A difference is a finding.**
2. **Name two things this document asserts that are not backed by a measurement
   you can see in it**, and say what would settle each.
3. **The stop condition:** what do you do if a leg produces a money defect?
   State the action, not the reasoning.

---

## 1. STATE AS MEASURED AT HANDOVER

```
HEAD                2e68f1e   branch wave3/billing-cancel   tree CLEAN
tsc                 clean     eslint clean
vitest              81 files, 1737 tests, all passing
gate-audit          clean. 32 gated, 2 conditional, 69 ungated
auth users 94 | QA 0 | entitlements 90 (86 backfill-dated + 4 null) | revoked 0
subscriptions 0 | billing_customers 0 | profiles 94
stripe TEST | customers 13 | test clocks 0
BILLING_GATE_ENABLED   ABSENT from .env.local
REMINDER_PROMISE_ENABLED ABSENT from .env.local
migration 004          UNAPPLIED — 86 rows still at 2026-08-31T00:48:47.401+00
```

⚠️ `grep -c` **EXITS 1 WHEN IT FINDS ZERO MATCHES**. A chain ending in
`grep -c BILLING_GATE .env.local` reports failure on success, because zero is the
desired answer. This has cost a false alarm twice.

---

## 2. YOUR JOB

Run the whole customer arc on Stripe test clocks, against everything that changed
today. The template, from `billing-12-go-live.md` §3.3 step 1:

> One customer walked all the way through with time fast-forwarded — trial,
> day-five reminder, charge, renewal, cancel, offer, courtesy period, charge,
> decline, dunning, lapse into read-only, resubscribe and be refused a second
> trial.

**One customer. No reseeding between legs.** Reseeding is how a run proves each
leg in isolation and proves the arc not at all.

```
HARNESS_ALLOW_STRIPE=1 npx vitest run \
  --config scratchpad/harness/vitest.harness.config.ts \
  scratchpad/harness/lifetime.scenario.ts --reporter=verbose
```

**Read `scratchpad/harness/README.md` first.** ⚠️ **Set `LIFETIME_STATE_DIR` to
your own scratchpad** — `scratchpad/harness/lifetime.ts:70` and
`scratchpad/final/lib.mjs:24` are hardcoded to past sessions' directories, so live
Stripe ids get ledgered somewhere you will not look.

### ADD THESE FOUR. None was covered by the first run.

1. **A CARD-RETRY LEG** — a first charge that fails, a card update, a successful
   retry. *Prove:* the state the account holds at each step, and that nothing is
   written that Stripe does not also hold.
   ⚠️ `pm_card_chargeDeclined` **throws AT ATTACH** and can never model dunning.
   Use `pm_card_chargeCustomerFail`, set on the **SUBSCRIPTION** — a
   subscription's own `default_payment_method` beats the customer's.
   ⚠️ `invoice.attempt_count` **cannot see an explicit `invoices.pay`**. Measured
   `1 → 1` across a retry that moved an invoice `open → paid` and created a fourth
   charge. **Count CHARGES, read the invoice STATUS.**

2. **A COURTESY-THEN-DECLINE SEQUENCE** — courtesy granted, then a decline inside
   it. *Prove:* which of the two governs access at every point, and that the
   person is never told one thing while the other is true.

3. **THE FIVE IDEMPOTENCY MECHANISMS**, never proven behaviourally — `claimEvent`,
   the trial lease, `startTrial`'s key, `findOrCreateCustomer`'s key,
   `grantExtraTime`'s already-claimed branch. For each, prove the SECOND
   invocation is **REFUSED** and that the refusal is **distinguishable from a
   failure**. A mechanism that silently does nothing twice is not proven
   idempotent.
   ⚠️ `claimEvent` must assert all three branches — fresh,
   duplicate-because-processed, and **fresh-because-stale** (`processed_at` NULL,
   `received_at` older than `STALE_CLAIM_MS` = 60s) — **distinguished by the
   response BODY, not the status code**: the route answers `200` for a refused
   duplicate too. `{"received":true}` ran; `{"received":true,"duplicate":true}`
   did not.
   ⚠️ `trial_lock_until` is read only inside its own conditional `UPDATE`. The
   value never reaches a TypeScript branch, so it **cannot** be asserted by
   seeding it.

4. **A BROWSER LEG** reading copy off rendered screens with
   `scratchpad/contact-sheet/signed.mjs` — every signed line reachable in the arc,
   codepoint by codepoint, **from the screen** rather than from a `lib/` return.
   This is the only way to prove signed copy renders: `vitest.config.ts` is
   `environment: "node"` with no `.test.tsx` in the tree, so the suite cannot
   render at all.
   ⚠️ That differ's whitespace normalisation is **ASCII-only on purpose**:
   JavaScript's `\s` matches U+00A0, and normalising it hid a non-breaking space
   entirely. **Do not "simplify" it back.**

---

## 3. WHAT CHANGED TODAY — WHAT YOU ARE ACTUALLY TESTING

Nine commits, `eb7ff3b..2e68f1e`. Read `git log` for the reasoning; this is the
list of surfaces that moved.

**Billing UI**
- `StripeHandoff` button mode: `w-full` beside `flex-1`. **Both are load-bearing**
  — `flex-1` is inert outside a flex context, `w-full` is wrong inside one.
  Callers: `DeclinedCard` (flex row) and `/billing/manage` (block).
- Manage's past-due card gained an "Edit my card information" CTA, amber outline.
- The save-offer dialog was rebuilt: centred title `One more thing…` (U+2026, ONE
  character), flat `color-mix` amber panel, split-flap `FlipClock`, two-line
  centred terms with a bold-but-not-white charge date, accept label
  `Claim free week` / `Claim free month`.
- Notice cards are title + subtitle + one inset action. The **copy** was re-signed
  to two sentences so `splitSummary` produces the pair; the component did not
  change.
- Read-only pop-up's "Choose a plan" and the offer's accept button: amber outline
  and text, **no fill**.
- `/plans` subtitle: `Three billing options.`
- `cancel-dialog.txt` went 8 lines → 18. `manage-summary.txt` lines 3, 4 and 9
  were re-signed.

**Legal, v2.0, effective 2026-08-27**
- Four documents ingested from `Context/legal-v2/*.md` (the source of truth).
- ~~⚠️ **Terms, Privacy and Medical Disclaimer are `is_current = false`.** v1.3 is
  still in force. `supabase/legal/013_legal_documents_v2_0.sql` holds the
  launch-morning flip as ONE transaction — the demote and promote cannot be
  separate statements, because `legal_documents_one_current_per_type` is a UNIQUE
  index on (doc_type) WHERE is_current.~~

  **⚠️ CORRECTED 2026-08-26 — THE FLIP HAS ALREADY HAPPENED, TWO DAYS EARLY.**
  Adrian ran the launch SQL by hand on **25 August**. Measured live on 26 August,
  against the database rather than against a file:

  ```
  consumer_health_data  2.0  is_current=true   effective 2026-08-27
  medical_disclaimer    2.0  is_current=true   effective 2026-08-27
  privacy_policy        2.0  is_current=true   effective 2026-08-27
  terms_of_service      2.0  is_current=true   effective 2026-08-27
  terms/privacy/disclaimer 1.3  is_current=false  effective 2026-06-20
  ```

  It is recorded in `f8968c1`'s commit body and **nowhere else** — which is why
  three separate records went on asserting the opposite for a day. A state change
  applied by hand has to land in the records the next session reads, not only in
  the message of the commit that happened to be open at the time.

  The consequence, and it was live for two days: `getCurrentLegalDocument` filters
  on `is_current`, so **v1.3 became reachable at no URL at all** while
  `consent_records` still names it as the version 81 accounts accepted. Closed on
  26 August by `/terms/1.3`, `/privacy/1.3` and `/medical-disclaimer/1.3` — see
  `getLegalDocumentVersion`. **`is_current` was NOT flipped back.**
- ⚠️ **`consumer_health_data` IS current**, deliberately: new doc_type, no prior
  version, and an inactive row means a 404 on the page Washington's My Health My
  Data Act requires to be findable.
- Onboarding now has **TWO consent ticks**. The documents require a "dedicated
  box"; one combined tick made the Privacy Policy false about its own signup.
- Dismissing the switch-on notice now records acceptance of `tos` + `privacy` at
  the **live** version. ⚠️ It must NEVER record `health_data_consent` — Privacy
  §17 forbids treating continued use as health consent — nor `disclaimer`.

---

## 4. THE STANDING RULES. ALL OF THEM EARNED.

**0. ABSENT IS NOT UNKNOWN. WIDEN THE RETURN SO THE THIRD STATE EXISTS.**
The most expensive mistake on this project, now **nine** times over. A read that
cannot tell *absent* from *could not find out* defaults to the permissive answer.
Two were added TODAY: a gate-state prober reported "flag OFF" when every route was
404ing (it could not tell "gate off" from "page did not render"), and a teardown
reported a leak for accounts that were already deleted.

**1. A REVOKED ROW IS A DECISION, NOT A GAP.** `entitlements.is_active = false` is
an answer somebody GAVE. Measured now: 0 revoked rows.

**2. NEVER PATCH A LIST TO SEED A FIXTURE.** That technique is what ran the
backfill against all ninety real accounts. If a rule cannot be exercised without
editing a production list, unit test it and say so.

**3. THROTTLE WHAT NAGS. NEVER THROTTLE WHAT ANSWERS A TAP.**

**4. BEFORE REPORTING A DEFECT FOUND BY A DRIVER, CONFIRM THE DRIVER REACHED THE
STATE.** Fired twice more today. A past-due CTA reported missing was a fixture
with no `billing_customers` row — the screen was right. **A false finding costs
what a false pass costs, from the other direction.**

**5. "WHAT PERIOD IS THIS?" IS NOT "WHAT HAS BEEN PAID FOR?"** Every instance
reads a field describing the period the subscription is IN where the decision
needs the period the customer has PAID FOR. Identical on a healthy account —
which is why it survives review — and divergent the moment a renewal fails.
**Instances 3 and 4 are OPEN (Q107).** A fifth was found today: `namesATrial`
answers "is this a trial?" where the cancelled sentence needs "has this account
ever paid?"

**THE STOP RULE: if a fix generates a NEW defect, STOP AND REPORT rather than
fixing forward.** It has fired four times. Overridden only where every cause was
NAMED rather than unexplained.

---

## 5. THE STOP-LIST

- **Never apply, re-run or reverse a migration.** 004 especially — it is
  launch-morning only, after P10, after the deploy is verified healthy.
- **Never call `POST /api/billing/beta-grace`** in any mode, for any reason,
  including as part of a test. Driving it once ran the entire backfill against
  production.
- **Never patch a production list, price table or founder list to seed a fixture.**
- **Nothing merges or pushes to `main`.**
- **Never delete a QA account by domain match.** A domain sweep destroyed **16
  real fixtures**. Delete **BY ID**, from your own ledger, **Stripe objects first**.
- **Never delete a real user to make a count match.** A rising count is a real
  sign-up. Has happened three times.
- **Never write a flag into `.env.local`.** Command line only —
  `scratchpad/dev-gate-on.sh` / `dev-gate-off.sh` own the lifecycle. Prove the
  state from a **positive named artefact in BOTH directions**;
  `scratchpad/contact-sheet/gate-proof.mjs` does this and has a third state for
  "could not check".
- **Never pass a raw card number to `paymentMethods.create` or `tokens.create`.**
- **Never leave a driver without teardown in a `finally`.** One did today and
  leaked 16 QA accounts until the next audit.
- **Do NOT fix what the run finds.** A finding is the editor's to rule on.

---

## 6. TRAPS THAT COST TIME TODAY

- ⚠️ **THE DEV SERVER SERVES A STALE STYLESHEET.** Four new CSS classes appeared
  **0 times** in the served CSS while a class six lines away appeared twice. The
  contact sheet photographed CSS that no longer existed. **The renderer's
  freshness guard CANNOT catch this** — it compares screenshot mtime to source
  mtime, and the screenshots were newer. Fix: kill every `next` process, confirm
  port 3100 free, `rm -rf .next`, restart. Then prove the classes are in the
  served CSS **before** shooting.
- ⚠️ **`rm -rf .next` while a dev server runs** leaves `.next/dev` inconsistent
  and the next start serves **404 for every route** with no compile error. The
  tell is a CONTROL failing, not a treatment.
- ⚠️ **Orphan `next` processes stack.** Four were running at once today. Kill by
  pid and verify the port is free.
- ⚠️ **WAIT ON A NAMED ARTEFACT, NEVER ON SECONDS.** Fired twice more today: a
  900ms sleep photographed a button reading "Working…" because `busy` clears a
  beat after the phase flips. Wait for the button's OWN LABEL.
- ⚠️ **A `200` from the webhook route proves NOTHING about whether a handler ran.**
  Read the BODY.
- ⚠️ **`event.created` is WALL CLOCK**, not the simulated instant.
- ⚠️ **Freeze a test clock in the PAST.** The app compares entitlement dates
  against wall clock; a clock moves only Stripe's.
- ⚠️ **A test-clock customer does NOT appear in `stripe.customers.list`.**
- ⚠️ **`pm_card_visa` is not a PaymentMethod id.**
- ⚠️ **ONE SESSION AT A TIME.** Two sessions creating and tearing down clocks
  collide on cleanup and delete each other's fixtures.
- ⚠️ **A test can fail for a reason unrelated to what it tests.**
  `containersHaveOneSource` was logged across several sessions as an unexplained
  intermittent failure and an apparent contradiction between the guard and its own
  logic. It was **a 5000ms timeout**: 516 files read one at a time. Fixed today.
  If a guard fails, read the failure MESSAGE before theorising.

---

## 7. OPEN, ACCEPTED, AND NOT YOURS TO FIX

| # | What | Status |
|---|---|---|
| 1 | **Q107 — cross-subscription clawback.** A cancelled subscription's failed invoice can claw a shared entitlement back to its own 3-day grace, destroying access paid for on a different LIVE subscription. **5.00 days reproduced; 371 days seen once.** | OPEN. Post-launch order is fixed: fix `endSubscription`'s QUESTION first, then the narrowing, then the floor. ⚠️ If re-issued the narrowing must key on **STATUS**, never `cancel_at_period_end`. |
| 2 | **"won't be charged again"** is false for the grace-aligned-then-cancelled cohort (~86 accounts), who were never charged a first time. Adrian was told and kept the wording. | ACCEPTED, recorded in `manageSummary.ts`. |
| 3 | **02b §3.7 — four facts at 320×568.** Stripe's Payment Element is 424px inside a 375px scroller. **390×844 remains a hard PASS.** | ACCEPTED. |
| 4 | **The wallet-row residue** — 8px × 350px mount div on no-wallet devices. | RULED LEFT, post-launch. |
| 5 | **Three parked `revokeForCustomer` findings.** Two of three caught, P3 still silent. | ACCEPTED on VOLUME. |
| 6 | **`cardOnFile` collapses Rule 0's third state.** "No card" and "Stripe did not answer" both render "None on file". | Safe ONLY because nothing branches on it. **Widen before anything does.** |
| 7 | **13 accounts have no `consent_records` rows** (94 users, 81 complete sets). | UNEXPLAINED, untouched. |
| 8 | **Homepage still reads "Free while it's in beta."** False about price from 27 August. | FLAGGED, Adrian's copy to change. |
| 9 | **Spec 10 (refund requests) ships DESCOPED.** D41/D44/D45 still say `Resolved`. | Correct the records; do not build the form. |
| 10 | **P11b REVERSED — Stripe's trial-ending email stays ON.** Contradicts D34 and `billing-12-go-live.md:461`. | Both records must be corrected. |

**Never photographed at all:** the "Glad you're staying" notice, and the
returning-user checkout title (needs a Stripe customer with a genuinely USED
trial — `hasUsedTrial` reads Stripe, not our tables).

**Believed but NOT measured by the outgoing session:** the 10 live Stripe
subscriptions are harmless (only the count was measured); migrations 003 and 005
CONTENT (columns probed, row values not); `endSubscription`'s behaviour for a
subscription cancelled inside a PAID period is reasoned, not measured; ~44 ledger
rows reading a bare `Resolved` have never been re-verified, and one of them (D40)
was measurably false.

---

## 8. HOW TO REPORT

- **Report each leg AS YOU FINISH IT, in its own message.** If this dies, the legs
  that landed matter more than a perfect final report.
- **Prove each instrument can FAIL before trusting it.** A leg that cannot fail
  proves nothing. This project has shipped an instrument that reported clean while
  blind, and produced two false readings today from instruments that could not
  distinguish absence from error.
- **Report what you MEASURED, never what you expected.** "Absent" and "I could not
  check" are different results.
- **Confirm baseline counts at the end:**
  `auth users 94 · entitlements 90 · subscriptions 0 · billing_customers 0 · QA 0 · clocks 0`
- **Finish with:** every leg's verdict, every finding, tree state, and anything you
  measured that looked wrong but did not touch.

---

## 9. LAUNCH MORNING, FOR WHOEVER IS THERE

Not your job, but it must not be lost:

1. Merge `wave3/billing-cancel` → `main`, deploy, **verify healthy**.
2. Apply migration **004** (re-dates the 86 beta graces).
3. ~~Run the flip in `supabase/legal/013_legal_documents_v2_0.sql` — ONE transaction.~~

   **⚠️ STEP DELETED 2026-08-26. DO NOT RUN THAT FILE. The flip already happened
   on 25 August** (see §3) and the file now contains **zero non-comment,
   non-blank lines** — measured:
   `grep -vE '^\s*--' supabase/legal/013_legal_documents_v2_0.sql | grep -cvE '^\s*$'` → `0`.
   Its `BEGIN; UPDATE …; COMMIT;` block is commented out, because it was written
   as instructions to a human and then carried out by hand.

   **This is why the step is deleted rather than corrected.** Running that file
   executes nothing, raises nothing and **exits 0** — a launch-morning step that
   reports success while doing nothing, on the one morning nobody has spare
   attention to notice. A step that cannot be distinguished from a working step
   is worse than no step: it spends the checklist's credibility. Nothing is
   written into the file in its place, for the same reason — the work is done,
   and a fresh copy of an already-applied `UPDATE` is a second chance to apply it
   at the wrong moment.
4. Put the live Stripe webhook secret into Vercel **only after** the merged deploy
   is verified. ⚠️ `origin/main`'s handler has **no `billing_reason` guard**.
5. Turn `BILLING_GATE_ENABLED` on.
6. Counts are taken with **TWO instruments, never one** — the admin API and SQL
   against `auth.users` disagreed once.
