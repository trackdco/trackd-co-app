Save as: Context/Feature Specs/12-go-live.md

*(Canonical path. The founder saves these locally as `billing-12 - Go Live.md`, so the
filename on disk may differ. Cross-spec references are by number — 01, 02a, 12 —
which is unambiguous either way.)*

# Spec: Go-Live

**Context files (read before starting):** `AI-workflow-rules.md`,
`architecture.md`, `code-standards.md`, `ui-context.md`, `project-overview.md`,
`next-tasks.md`, `progress-tracker.md`. `ui-context.md` is the primary styling
reference — every visual decision below defers to it.

**Workflow reminder:** Implement one step at a time. After each step in the
Implementation section, stop, confirm it builds with no TypeScript/lint errors
and renders correctly, then proceed. Do NOT batch steps. Do NOT introduce new
shared components without flagging first (see `code-standards.md`).

---

## 0. Dependencies, and what ships with what

**Depends on every other spec.** It is the last thing that happens and the first thing
that has to be right.

**It holds three gates on behalf of other specs:**

- **The three ship-together sets**, which are merge gates rather than advice: `01` +
  `02a` + `02b`; `04` + `07`; `05` + `06`. Each ships whole or not at all.
- **`11`'s script must come back clean twice** before the public rollout step.
- **`07`'s reminder must be observed firing before a courtesy charge** on a test clock
  before `04`'s terms line ships its final clause.

**⚠️ This document is a runbook, not a design. It must be executable by the founder
alone, step by step, on the day, with no agent in the loop.** If a step cannot be
written so that one person can do it and know whether it worked, it is not finished.

---

## 1. Goal

Real money moves, in the right order, with a way back at every point.

Everything before this spec decides what the product does. This decides when it starts
doing it to real people, in what sequence, and what happens when a step comes back
wrong. The order is the founder's and it is not a suggestion: the highest-value check
first, the checks that never stop second, the reviewers last, and the first person to
hit a broken live path should be one of us.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** merge anything to `main` without the founder's explicit word, on the day.
- **Do NOT** re-land billing by merging the branch. §3.2.
- **Do NOT** set the gate flag before the backfill has run and its rows have been
  verified.
- **Do NOT** run the public rollout step before the reconciliation script has come
  back clean twice.
- **Do NOT** apply a migration from a deploy. Migrations are hand-applied.
- **Do NOT** treat green gates as evidence. `tsc`, the linter and 1,219 tests have
  caught none of the serious defects on this project.
- **Do NOT** build new product surface here. Anything this runbook discovers that
  needs building is a change to the spec that owns it.
- **Do NOT** invent a recovery story. §3.8 is the whole of it.

---

## 3. Design Decisions

### 3.1 ⚠️ The two blockers found in the dashboard review

Both are configuration, neither is code, and either one alone means a customer pays
and gets nothing.

**No hosted webhook endpoint has ever been registered.** Delivery has only ever been
the local CLI listener. Without a registered endpoint, in production nothing writes an
entitlement row: the subscription sync, the past-due handler, the ended handler and
the revocation handler are all webhook-driven. A user would be charged and never
receive access.

**No live-mode prices exist.** The mode guard fails loudly here — it compares the
key's mode against the price object's own live flag — so this cannot pass silently. It
still has to be done.

**Both are prerequisites of the rollout, not review items.** §3.3.

### 3.2 ⚠️ The re-land is a revert, not a merge

Billing was merged to `main` once and then reverted. The commits are therefore
ancestors of `main` with their changes undone, **so a merge brings back nothing.**

**The only way to re-land is `git revert c547dba`.**

That commit is confirmed as the revert, dated 13 August 2026, and it is an ancestor of
current `main`. Nothing has re-merged the billing work since.

**⚠️ The revert also took the notification work off**, unavoidably, because the
commits are not separable by a range revert. Reverting the revert brings both back
together, which is correct — `07` and the billing work ship as one landing.

### 3.3 The sequence, and the one place it cannot be followed literally

The founder's order, unchanged:

**1 — Stripe test clocks, over the whole lifecycle.** The highest-value step by a
distance, and already proven here: two CRITICAL defects were found only this way. One
customer walked all the way through with time fast-forwarded — trial, day-five
reminder, charge, renewal, cancel, offer, courtesy period, charge, decline, dunning,
lapse into read-only, resubscribe and be refused a second trial.

**2 — The reconciliation script.** `11`. Run before go-live, again after, then on a
schedule. It catches what every review missed, forever, instead of once.

**3 — Alerting on the same invariants.** The failure mode here has never been a clever
exploit. It has been silence.

**4 — Cold agent review, scoped tightly.** Three agents: money and races, the gate and
entitlements, the UI at 390x844. **Run at the END, once everything is built**, so they
are not reviewing code that is about to change underneath them.

**5 — A staged live rollout.** Founders first, then the three comped friends, then
public. **Hold the public step until the reconciliation script comes back clean
twice.**

**6 — A Stripe dashboard configuration review.** No agent can see any of this, and a
perfect codebase can still be undone by it.

**⚠️ Step 6 cannot come last for the items step 5 depends on, and pretending otherwise
would break the runbook.** Live prices, the webhook endpoint and the portal toggles
are not review items — they are preconditions of a live charge existing at all. **So
those three move to the pre-flight in §3.4, and step 6 keeps everything else:** Radar
rules, the statement descriptor, the public business name, failed delivery checks, and
the customer email settings. The numbering stays as the founder wrote it; what moves
is only what has to.

### 3.4 The pre-flight, before step 1

Everything here is done once, in this order, before the sequence starts.

**Commit the working tree.** The save offer and its migration are currently untracked
and unstaged. Nothing else in this runbook is safe while that is true.

**Apply migration 003.** By hand, before the re-land deploy (D10). An unused column is
a harmless window; new code meeting an absent column exercises the tolerant path in
production on the highest-risk screen.

**Re-land with the revert.** §3.2.

**Run the beta backfill, then verify the rows exist, then set the gate flag.** In that
order, never the flag first. There are zero entitlement rows today, and the gate on
before the backfill puts every real user into read-only overnight.

**Create the three live prices**, each at an interval count of one, and record their
ids in the production environment.

**Register the hosted webhook endpoint** with the eight handled events, and confirm a
delivery actually lands.

**Turn the portal's cancel and plan-switching off in live mode.** Both are off in
test; live is a separate configuration. `08`'s handoff copy promises the portal is
card and receipts only, and that promise is false until this is done.

**Verify the lockfile matches the pinned Stripe versions** (D40).

**Verify all four storage buckets are private in the dashboard.** The migrations
cannot guarantee it, so it is read off the dashboard by hand. Q95.

**Create dedicated live test accounts**, outside both the comp list and the founder
list. `01` refuses a subscription for any comp account, which is every founder and
every comped friend — **so the first two rollout cohorts cannot purchase by design,
and without these accounts the first real payment on the live integration is a
stranger's.**

**Publish the legal documents and the switch-on terms line.** Launch-morning items,
and `06`'s notice carries the line.

### 3.5 The merge gates

Three sets, and each is a yes-or-no question asked before anything reaches `main`.

**`01` + `02a` + `02b`.** The trial rule makes the existing screens false for a
returning customer, the screens describe a button that must work, and the button is
`02a`. Two of the three is a payment screen out of step with itself.

**`04` + `07`.** The offer's terms line ends "and we'll remind you first". **The
release condition is a reminder observed firing before a courtesy charge on a test
clock.** If it is not observed, the clause does not ship and neither does `04`.

**`05` + `06`.** The gate before the backfill is ninety people in read-only overnight
with no notice.

### 3.6 What only a person can check

**The Stripe dashboard, in live mode**, per step 6 and the pre-flight above.

**Whether the trial-reminder email fires usefully.** It is set to seven days before a
trial ends, against a seven-day trial and a seven-day courtesy period. Q79 answers
what it actually does; D34 decides what to do about it, and **that decision waits for
the observation rather than preceding it**. The same question applies to the
upcoming-renewal email at seven days against a weekly cycle.

**Whether Stripe's first retry lands inside three days.** The past-due grace assumes
it does, so a card that recovers on the second attempt is never noticed by the user.
Smart Retries is on with up to eight attempts across two weeks and publishes no fixed
schedule. **Measure it on a clock. Do not widen or narrow the grace on assumption** —
that is the standing ruling, and the measurement is what releases it.

**The tax and GST line.** Pending counsel, recorded as D48. It is a checkout
disclosure question and it belongs to `02b` once decided; it is named here because
launch morning is when its absence would be noticed.

**The shortened statement descriptor**, still unset. The one-time post-trial message
is on.

### 3.7 The staged rollout

**Founders first**, on the dedicated live accounts from §3.4, because the first person
to hit a broken live path should be one of us.

**Then the three comped friends** — who also cannot purchase, so what is being
verified for that cohort is that their comp works, their notice reads correctly, and
nothing asks them for a card.

**Then public**, and not before the reconciliation script has come back clean **twice,
across a window in which money actually moved**. Twice in one minute is one run
repeated.

### 3.8 If something goes wrong, which is the whole of the recovery story

**`BILLING_GATE_ENABLED=false` returns every account to full write access immediately,
without a deploy.** It is the kill switch and it is fast. **It does not stop Stripe
charging anybody.** It is a mitigation for the gate, not for billing. It is also the
recovery for a database outage, since the entitlement read fails closed.

**Stopping charges means cancelling at Stripe, by hand.** There is no in-app control
that stops billing for everyone at once, and that is a decided position rather than a
gap (D4).

**Refunds are a dashboard action**, issued by hand at the founder's discretion. No
policy is written down; `10` states that plainly rather than implying one exists.

**Support has no tooling.** No self-serve deletion, no in-app receipts list, no admin
control to fix an individual's subscription. Everything exceptional is the founder in
the Stripe dashboard. **This runbook names that rather than assuming a support surface
exists.**

**A wrong-plan pick in week one is fixed by hand** in the dashboard, until `15` ships.

**⚠️ Until `16` ships, every hand-performed account deletion includes a storage sweep**
of the four buckets under that user's id. A database cascade cannot reach Storage, so
without the sweep the erasure promise is not being kept — and that is true today,
not after go-live.

### 3.9 Invariants

Every one of the ten is either enforced by a spec above or watched by `11`. This
runbook's own contribution is the ordering: **the gate after the backfill, the prices
and the endpoint before any charge, the public step after two clean runs.** Each of
those orderings exists because reversing it breaks a specific invariant, and each is
written into §4 as a step rather than left as an intention.

---

## 4. Implementation

**This section is the runbook. It is written to be followed by one person, in order,
on the day.** Each step states what to do and how to know it worked. Do not batch.

**Pre-flight**

**P0 — Fetch, and confirm you are on the real `main`.** Local `main` has been observed
at `23434e0`, whose subject is "Merge remote-tracking branch 'origin/main' into
admin/dashboard" — it is not `main`. `origin/main` was `b925568`, ten commits ahead.
Reverting onto local `main` reverts onto a stale tree. *Worked when:* `git rev-parse
main` and `git rev-parse origin/main` return the same hash.

**P1 — Commit the working tree** to `wave3/billing-cancel`. *Worked when:* `git status`
is clean.

**P2 — Verify migration 003 is applied.** It was applied on 16 August via
`apply_migration`, so unlike the hand-applied files it appears in `list_migrations` as
`20260816092215 courtesy_until`. **DO NOT re-apply it by hand.** Run its VERIFY block
only. *Worked when:* the verify returns exactly one row, and `select courtesy_until`
returns an empty set rather than `42703`.

*Note for whoever reads this later:* the original P2 said to apply the migration by
hand. That instruction was harmless rather than hazardous — `alter ... add column if
not exists` is idempotent and the verify block reads as success either way — but it
described a world that had already changed. **D10 is unaffected:** 003 was applied
before the re-land deploy, which is what D10 requires.

**P3 — Re-land: `git revert c547dba`.** *Worked when:* the billing and notification
files are present on the branch you intend to ship.

**P3a — Merge `wave3/billing-cancel`.** P3 restores the tree as of the original merge
and nothing after it. Every commit made on the branch since is new to `main`, and only
a merge brings those. **Without this step the launch ships the code as it stood on
13 August:** no invoice void, no `FLAG_CANCELLABLE_STATUSES`, no `billing_reason`
guard, no `listAllSubscriptions`, no reminder flag, no courtesy reminder variant, and
no `003` file. *Worked when:* `voidOpenInvoiceFor`, `FLAG_CANCELLABLE_STATUSES`, the
`billing_reason` guard, `listAllSubscriptions`, `offerTermsLine` and `resolveEnding`
are all present on the branch you intend to ship, and
`supabase/billing/003_courtesy_until.sql` exists.

**P4 — Create the three live prices**, each interval count 1. Record the ids in the
production environment. *Worked when:* the app in production loads all three without a
mode-mismatch error.

**P5 — Register the webhook endpoint** with the eight handled events. *Worked when:* a
test delivery appears in the ledger with a processed marker.

**P6 — Turn the live portal's cancel and plan-switching OFF.** *Worked when:* opening
the live portal as a test account offers card and invoices only.

**P7 — Verify the lockfile matches the pinned Stripe versions.** *Worked when:* a clean
install produces no version change.

**P8 — Verify all four storage buckets are private.** **Done once already,
founder-verified in the dashboard: bloodwork, progress photos, journal and avatars all
confirmed private via each bucket's own settings toggle.**

**⚠️ Re-verified on launch morning regardless.** A bucket's privacy is a dashboard
toggle that no migration can guarantee and nothing in the repo can assert, so a past
verification is evidence about the past. *Worked when:* read off the dashboard again on
the day.

**P9 — Create the dedicated live test accounts**, outside the comp and founder lists.
*Worked when:* each can reach checkout and is offered a plan.

**P10 — Publish the legal documents and the switch-on terms line.** *Worked when:* both
links in `06`'s notice resolve.

**P11 — Apply the re-dating migration by hand, then verify the rows.**

**⚠️ THE BACKFILL HAS ALREADY RUN. P11 IS NO LONGER "run the backfill" (D86).**

`POST /api/billing/beta-grace` was driven live against production on **2026-08-17
00:48:47 UTC**, 95 seconds before commit `e21c66a`, as part of the D81 verification —
D81 needed the route's upgrade branch and only a live run reaches it. Ninety rows
were written: **86 dated to 2026-08-31**, 4 free for life. Nobody planned that, and
it is a process finding rather than a blame question: a route whose whole remit is
"act on every account" was called in a test, and it did.

**The route cannot repair it.** Its predicate is "has a row at all", deliberately
(an "active" test would re-grant a fresh fortnight to every lapsed account on every
re-run), so it now skips all ninety. **⚠️ DO NOT CALL THAT ROUTE AGAIN as part of
this step, in any mode.**

So P11 is now: **apply `supabase/billing/004_regrace_launch_date.sql` by hand**, in
the Supabase SQL Editor, on launch morning. It re-dates the 86 dated comp rows to
**the moment it is applied plus fourteen days** and leaves the 4 undated rows, every
non-comp row, and any revoked row alone. There is no date to type in — it computes
from `now()` — and it is pinned to the original backfill instant, so applying it
twice moves nobody rather than granting a second fortnight.

**Why it must be applied and not skipped.** `06` §3.6's approved notice reads *"two
more weeks on us, until [date]"*, and "two more weeks" is measured from the day the
notice is shown. Launch on the 20th and the true remainder is eleven days; slip to
the 25th and it is six. The screen would contradict its own date, in the direction
that takes access away early.

**⚠️ D81 IS FIXED AND STAYS FIXED.** The revoked-comp resurrection and the
never-looked-at-a-calendar classifier were both closed in `e21c66a`. The migration
carries the same guard — it will not touch a row whose `is_active` is false —
because a revocation is a decision somebody made and a re-dating job is not
entitled to reverse it.

Two findings, both driven, and they compound.

**The dated-comp predicate does not filter on the active flag, and the upgrade branch
writes it back as true.** So a comp that was deliberately revoked, while still holding
a dated row, is un-revoked by a re-run. **A revocation is a decision somebody made, and
a backfill is not entitled to reverse it.** The predicate filters on the active flag,
and no branch writes it back to true for a row that was revoked.

**And the classifier maps any dated row to a grace without testing whether the date has
passed**, while the backstop fires only on an absent or unknown entitlement. **So an
expired grace is classified as a live one and falls through to being charged today**
rather than being handled as the expired grace it is. Charging an expired grace may
well be the right outcome, but it must be the decided outcome rather than the one that
happens because a classifier did not look at a date.

**⚠️ Seam into `01`:** the classifier is what `01`'s grace-aligned branch reads, so a
dated row that has expired must classify as expired, not as grace. `01` decides what
then happens; this decision only requires that the question is asked.

**⚠️ THIS IS STILL THE POINT OF NO RETURN, SHORT OF THE KILL SWITCH (D52). Applying
the re-dating fixes the date that every surface then shows them** — the notice, the
banner, the reminder, the Billing screen. The warning transfers intact from the
backfill to the migration, because the date it sets is the date all four surfaces
read.

**Apply it only after the deploy is verified healthy.** A deploy that has to be
rolled back afterwards leaves eighty-six people holding a date the app is no longer
able to honour.
*Worked when:* the row count matches the account count, every dated row shares ONE
expiry instant fourteen days out, the 4 undated rows are still undated, and no row
still carries `2026-08-31 00:48:47.401+00`. The file's VERIFY block returns exactly
this.

**P12 — Verify the rows.** *Worked when:* counted directly, not inferred from the
route's response.

**P13 — Set `BILLING_GATE_ENABLED`.** **⚠️ Never before P11 and P12.** *Worked when:* a
seeded lapsed account is read-only and an entitled account is not.

**The sequence**

**S1 — Test clocks, the whole lifecycle.** Walk the full path with time fast-forwarded:
trial, day-five reminder, charge, renewal, cancel, offer, courtesy period, charge, card
decline, dunning, lapse, resubscribe and be refused a second trial. **Observe the
reminder firing before the courtesy charge** — this is `04`'s release condition. Record
Stripe's first retry timing. Record what the trial-reminder email does.
*Worked when:* every stage observed, and the two recordings written down.

**S2 — Run the reconciliation script.** *Worked when:* it reports clean, states its
mode, and confirms it paginated to exhaustion.

**S3 — Turn alerting on.** *Worked when:* a deliberately broken rule produces exactly
one alert, and a founder device is subscribed.

**S3b — Rehearse the kill switch, in test mode, before launch week.** Set the gate
flag false and confirm every account returns to full write access **without a
deploy**. Then state its limitation out loud, in the words the brief uses and not
softer: **it does not stop Stripe charging anybody. It is a mitigation for the gate,
not for billing.** Stopping charges means cancelling at Stripe by hand.
*Worked when:* access restored with no deploy, and the limitation written into the
runbook verbatim rather than paraphrased.

**S4 — Cold agent review, three agents, scoped.** Money and races; the gate and
entitlements; the UI at 390x844. *Worked when:* no CRITICAL and no HIGH findings
remain. Low and medium findings unrelated to payments may be accepted deliberately and
**written down**.

**S5 — Rollout, founders: the live smoke test (D49).** On an account outside both
lists, with the founder's own real card, on the **weekly** plan — the cheapest real
charge that still exercises the whole chain.

**⚠️ First, confirm the account holds no live grace entitlement.** The existing account
earmarked for this is likely inside the ~85 beta cohort, so the backfill will have
granted it fourteen free days at switch-on. **An account holding a grace does not test
the paid-today path at all — it tests D13's alignment instead**, which has a different
pass condition and would quietly succeed while proving nothing about a real charge.

If it holds one: expire or waive the grace by hand first, or use a freshly created
account. **Either path must still satisfy every condition below.**

Verify the full arc: the charge lands, the webhook is delivered, the entitlement row
is written, the receipt is right. Then **cancel and refund it in the dashboard.**

**⚠️ Then run `11`'s script and confirm it attributes the entire arc, refund included,
and still reports clean.** A refund that the reconciliation cannot account for is a
finding, and finding that out on a founder's own card is the point of doing it this
way.

**This is the founders-first step in practice**, because `01` refuses a subscription
for any comp account and every founder is one — the natural cohort cannot purchase by
design.
*Worked when:* charge, webhook, entitlement row and receipt all confirmed; refund
issued; script clean afterwards.

**S6 — Rollout, the three comped friends.** *Worked when:* their comp works, their
notice reads correctly, and nothing asks them for a card.

**S7 — The soak.** **⚠️ A minimum of 24 hours between the smoke test and the public
flip**, with `11`'s script clean **twice** across that window and **zero unresolved
alerts**. The founder may lengthen this and may never shorten it.

The window is what turns two runs into evidence: a renewal boundary, a webhook
retry or a dunning attempt can only be observed by waiting through one.
*Worked when:* 24 hours elapsed, two clean runs inside it, no alert outstanding.

**S8 — Rollout, public.** **⚠️ Not before S7.**

**S9 — The remaining dashboard review.** Radar rules, the statement descriptor, the
public business name, failed deliveries, and the customer email settings per D34.
*Worked when:* each item read and recorded.

---

## 5. Check When Done

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds — **and this is
      treated as necessary, never as evidence**
- [ ] Every pre-flight step P1 to P13 completed in order, each with its worked-when
      confirmed
- [ ] Every sequence step S1 to S9 completed in order
- [ ] The working tree was committed before anything else began
- [ ] Migration 003 applied by hand and verified by its own VERIFY block
- [ ] **Re-landed by `git revert c547dba` FOLLOWED BY a merge of
      `wave3/billing-cancel`.** The revert alone restores only the originally merged
      commits; the branch's later work needs the merge. A merge ALONE brings nothing,
      which is what the original wording was guarding against — but the revert alone
      brings only half.
- [ ] Three live prices exist, each at interval count 1
- [ ] The hosted webhook endpoint is registered and a delivery has been observed
      landing and being processed
- [ ] The live portal offers card and invoices only
- [ ] The lockfile matches the pinned Stripe versions
- [ ] All four storage buckets confirmed private, **re-read off the dashboard on the
      day** rather than relying on the earlier verification
- [ ] Dedicated live test accounts exist outside both lists
- [ ] Legal documents published and both links in the notice resolve
- [ ] The backfill ran, its rows were verified by counting, and only then was the gate
      flag set

The three merge gates:

- [ ] `01`, `02a` and `02b` all complete before any of them reaches `main`
- [ ] `04` and `07` both complete, **and a reminder observed firing before a courtesy
      charge on a test clock**, before `04`'s terms line ships its final clause
- [ ] `05` and `06` both complete, and the gate never enabled before the backfill

The observations only a clock can make:

- [ ] The whole lifecycle walked with a test clock, every stage observed
- [ ] Stripe's first retry timing recorded, and the past-due grace neither widened nor
      narrowed on assumption
- [ ] What the trial-reminder email does with a seven-day period recorded, and D34
      decided from the observation rather than before it

Reconciliation and alerting:

- [ ] The script reports clean, states its mode, and confirms full pagination
- [ ] **Two clean runs across a window in which money actually moved, before the
      public step**
- [ ] A deliberately broken rule produces exactly one alert
- [ ] A founder device is subscribed to push, and the script fails clean if none is

The rollout:

- [ ] The smoke-test account confirmed to hold **no live grace entitlement** before
      the test, or had one waived, or was freshly created
- [ ] The live smoke test completed on a real card, weekly plan, with charge,
      webhook, entitlement row and receipt all confirmed
- [ ] It was then cancelled and refunded in the dashboard, and `11`'s script
      attributed the whole arc including the refund and still reported clean
- [ ] **At least 24 hours elapsed between the smoke test and the public flip**, with
      two clean runs inside the window and zero unresolved alerts
- [ ] The kill switch was rehearsed in test mode before launch week, and its
      limitation is stated verbatim rather than softened
- [ ] **The backfill was run only after the deploy was verified healthy**, and the
      runbook says in bold that it starts the fortnight and fixes the date
- [ ] **A deliberately revoked comp is still revoked after a re-run**, verified by
      seeding one and running the backfill twice
- [ ] No branch writes the active flag back to true for a revoked row
- [ ] **An expired dated row classifies as expired, not as a live grace**, and what
      happens next is `01`'s decided path rather than a fall-through
- [ ] The three comped friends second, and nothing asked them for a card
- [ ] Public last, and not before the two clean runs

Recovery, confirmed before it is needed:

- [ ] Setting the gate flag false restores write access immediately with no deploy
- [ ] The runbook states plainly that this stops no charge
- [ ] The manual steps for stopping charges, refunding, and fixing an individual are
      written down and were followed once in test

- [ ] **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** Once
      everything is built, run independent cold-agent reviews — one on money and
      races, one on the gate and entitlements, one on the UI at 390x844 — and keep
      fixing and re-running until no CRITICAL and no HIGH findings remain. Low and
      medium findings unrelated to payments may be accepted deliberately and written
      down. Payments are the strict bar.

---

## 6. The four standing rules

1. **⚠️ DO NOT EDIT THE CONTEXT FILES.** `ui-context.md`, `architecture.md`,
   `code-standards.md`, `project-overview.md` and `ai-workflow-rules.md` are fixed
   input and must stay identical. If work seems to require changing one, stop and
   ask the founder. The only files an agent updates as it goes are
   `progress-tracker.md` (state) and `next-tasks.md` (steps).

2. **⚠️ THE PROJECT IS NOT DONE UNTIL COLD AGENTS COME BACK CLEAN.** As stated at
   the end of §5. It applies to the work as a whole rather than to this spec alone.

3. **Billing is verified against real Stripe test mode, never a fixture.** Other
   specs in this repo build against mock data. This one cannot: the defects live in
   Stripe's own state machine, and two CRITICALs on this project were found only
   with a test clock.

4. **Migrations are written, never applied.** This spec produces no SQL. It applies
   one that already exists, by hand, as P2 — which is the same rule seen from the
   other side.

---

## 7. Open items

**`OPEN — D48, the tax and GST line.`** Pending counsel. It is a checkout disclosure
and belongs to `02b` once decided; it is named here because launch morning is when its
absence would be noticed rather than when it can be fixed.

**`OPEN — D34, Stripe's own customer emails.`** Deferred deliberately until S1's
observation. Deciding before the clock has answered is guessing about a message our
customers receive.

**`OPEN — the past-due grace window.`** Neither widened nor narrowed until S1 records
the first retry's timing. If it lands outside three days, a recoverable customer is
being told they go read-only before Stripe has finished trying, and that is a decision
rather than an edit.

**`Q95`** — whether all four storage buckets are private in live. Founder verifying in
the dashboard.

**`Q96`** — the event set actually registered on the live endpoint, recorded after P5,
so the eight handled events and the eight subscribed events can be compared rather
than assumed equal.
