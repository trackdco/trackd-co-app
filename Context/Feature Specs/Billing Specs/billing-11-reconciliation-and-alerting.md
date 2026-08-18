Save as: Context/Feature Specs/11-reconciliation-and-alerting.md

*(Canonical path. The founder saves these locally as `billing-11 - Reconciliation And
Alerting.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 11 — which is unambiguous either way.)*

# Spec: Reconciliation and Alerting

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

**Depends on:** `04-save-offer.md` and `05-read-only-gate.md` for the markers and the
entitlement rules it asserts against, and `01`, `02a` and `08` for three further
assertions each of them hands over.

**In no ship-together pair**, but **it gates the pair that matters most**: §9b makes
this step 2, and **the script must come back clean twice before the public rollout
step**. `12-go-live.md` holds that gate.

**Seams:**

- `12-go-live.md` owns the sequence. This spec owns the thing the sequence runs.
- `14-admin-billing-dashboard.md` surfaces this script's output on the dashboard. This
  spec owns the output's shape; `14` owns where it appears.
- **Every assertion below is inherited from the spec that made the rule.** This spec
  invents no business rule. Where an assertion and a spec disagree, the spec is right
  and this is wrong.

**⚠️ It asserts against the app's own rules, never against Stripe's statuses.** Stripe
is the source of truth for money; our rules are the source of truth for what should
have happened to it. Where the two diverge deliberately, this script follows ours.

---

## 1. Goal

Ask Stripe for the truth, compare it to our tables, and make silence impossible.

**The failure mode on this project has never been a clever exploit. It has been
silence: money moving while the app said it was not.** Every review this project has
run catches what it looks at, once. This catches what every review missed, forever.

Working looks like two things. A script the founder can run and read in ten seconds —
**clean says clean, plainly; dirty names the account, the rule broken, and the
evidence.** And an alert on the same invariants, so that a rule breaking at three in
the morning is something the founder finds out about rather than something a customer
finds out about.

**It fixes nothing. It reads, compares, and reports.** A script that repairs is a
script that can cause the state it was written to detect.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT write, update, cancel, refund, or delete anything.** Not in Stripe, not
  in the database. This is read-only, and that is the property that makes it safe to
  run against production on a schedule.
- **Do NOT self-heal, reconcile-and-repair, or "correct" a mismatch.** A mismatch is
  reported to a person.
- **Do NOT invent a business rule.** Every assertion traces to a spec. If an
  assertion seems to need a rule that no spec states, stop and ask.
- **Do NOT assert against Stripe's own status where our rule deliberately differs.**
  §3.4.
- **Do NOT compute MRR, revenue, or any reporting figure. That is `14`.** This answers
  "is anything wrong", not "how are we doing".
- **Do NOT expose it as an unauthenticated endpoint**, or as an endpoint at all
  without the shared-secret pattern the existing scheduled route uses.
- **Do NOT let the service role reach a client bundle**, or return raw rows to any
  browser surface beyond what `14` renders.
- **Do NOT widen `lib/db/admin/` to return rows.**
- **Do NOT run it against production before `12` says so.**
- **Do NOT merge anything to `main`.**

---

## 3. Design Decisions

### 3.1 The assertions, and where each comes from

Every one is a rule some other spec decided. This is the list, with its source, so a
failing assertion can be traced to the decision it protects.

**The five from the founder's brief:**

1. **Nobody holds more than one billable subscription at any moment.** Counting every
   status the app treats as billable, including the incomplete one.
2. **Every active entitlement traces to a live subscription or a comp.**
3. **Every live subscription has an entitlement.**
4. **No unattributed and no unprocessed webhooks.** §3.3.
5. **No subscription whose charge date and entitlement date disagree.**

**Five more, inherited from the specs:**

6. **No subscription carrying the grace marker has a paid invoice dated before that
   instant** — from `01` and `06`. This is the machine-checkable form of "a beta user
   was never charged inside the fortnight they were promised".
7. **No subscription carrying the courtesy marker has a charge inside its courtesy
   period** — from `04`. The same sentence for the save offer's free time.
8. **No subscription sits incomplete past Stripe's cancellation window with an
   entitlement attached** — from `02a`. That window is fifteen days on this account,
   not the library default.
9. **Every live subscription's price is one of the three active prices**, not one of
   the archived iterations on the product — from the dashboard review.
10. **No account holds two entitlements from the same source.** The uniqueness
    constraint should make this impossible; asserting it is how we find out if it
    ever wasn't.
11. **No courtesy marker exists on a subscription that was unpaid at the moment of
    the grant** — D75, and the seam `04` §3.3 handed back. **D70 prevents the state;
    this catches a regression that reintroduced it.** The two are not redundant: a
    rule enforced in one code path and asserted in another is the only arrangement
    that survives somebody refactoring the first.
12. **No zero-dollar invoice exists without a marker explaining it** — from `19`. A
    free period raises an invoice, and every one of them should trace to a courtesy
    grant or a grace-aligned start. **An undiscriminated one is reported as
    unattributed**, the same treatment an unattributable webhook gets, because a
    zero charge nobody can account for is a free period nobody granted.

**⚠️ Assertions 6 and 7 are the two that protect the first invariant** — nobody is
ever charged after being told they would not be — and they are the reason the two
metadata markers exist at all. If either marker is ever removed, its assertion goes
blind rather than failing loudly, which is the worst way for a check to die. **Assert
that the markers themselves are present where they should be**, not only that no
charge landed inside them.

### 3.1b ⚠️ D72: a slightly-extended trial is clean, not anomalous

Assertion 5 catches a charge date and an entitlement date that disagree, which is
exactly the check that would fire on a trial deliberately extended by a few hours to
match a date already printed on a screen.

**That extension is a fix, not a defect, and this script must not report it as one.**
The screen told somebody a date; the subscription was moved to honour it. **A check
that flags the product keeping its word is a check that trains its reader to ignore
findings**, which is the failure this whole spec exists to avoid.

So a trial end that sits slightly later than the arithmetic predicts, in the direction
that favours the user, is clean. **The tolerance runs one way only:** later is honoured,
earlier is a finding, because earlier means somebody is charged before the date they
were shown.

### 3.2 What it reads, and the one thing that will break it quietly

Stripe is asked for the truth: every subscription, every customer, every invoice
needed to place a charge in time. Our tables supply what should have happened.

**⚠️ Pagination is the failure this script is most likely to have and least likely to
notice.** There is at least one list call in this codebase that takes a hundred
records with no pagination, which is invisible while the numbers are small and
silently wrong the day they are not. **Every list call here paginates to exhaustion,
and the script asserts that it did** — a run that hit a page limit reports itself as
incomplete rather than reporting clean. A reconciliation script that silently
reconciles the first hundred accounts is worse than none, because it produces the word
"clean".

**Test-clock accounts pollute the picture.** Test mode holds the whole test-clock
history, and the QA accounts are seeded and deleted repeatedly. **The run states which
mode it ran against**, and a test-mode run is never evidence for a live-mode
conclusion.

**Rate limits are real on an account with hundreds of subscriptions.** Fetch in bulk
rather than per-account where the API allows it, and let the run take longer rather
than fan out.

### 3.3 Webhooks, and why an unattributed event is not stamped

The webhook ledger records every event, keyed on its Stripe id, with a processed
marker that means "we are satisfied with what happened to this".

**An event we could not attribute to a user is deliberately left unstamped.** It is a
paying customer with no entitlement and nobody being told, and the partial index over
unprocessed rows is the only monitoring signal that system has. Stamping it made that
index permanently empty and the failure invisible.

**So this script's fourth assertion reads that ledger and reports both states
separately:** unattributed, meaning we could not work out whose it was, and
unprocessed, meaning a handler did not finish. They have different causes and
different fixes, and collapsing them into one number loses the distinction the ledger
was built to preserve.

**⚠️ A row left unprocessed for more than a minute is treated by the handler as a
crashed attempt and retried.** So a row that is still unprocessed when this script
runs has failed more than once, and that is worth saying in the output rather than
counting.

### 3.4 Where our rules and Stripe's disagree, on purpose

**A dispute deactivates the entitlement immediately in our system; Stripe leaves the
subscription ACTIVE.** Both are defensible and they disagree.

> **⚠️ CORRECTED 18 Aug 2026. This sentence read "Stripe leaves the subscription
> overdue", and that is measurably false.** A reviewer asserted directly on the Stripe
> object after a real revoke and it was `active`. The difference is not pedantry:
> *overdue* implies dunning has begun and the money has stopped, while *active* means
> **the next invoice is raised on schedule**. The wrong word made "we take access away
> and leave Stripe alone" look harmless, and it is not — we go on charging somebody
> whose money we no longer have, they dispute the next invoice too, and the dispute
> fee stacks.
>
> It is corrected here as well as in the code because it is a premise the next reader
> would otherwise re-derive the same wrong conclusion from.

**A dispute now CANCELS the Stripe subscription** (owner `03`, seam here). So the
exempt state below is the window before that cancel lands, and the settled state is a
`canceled` subscription beside a deactivated entitlement.

**This script asserts against our rule.** A disputed subscription with a deactivated
entitlement is correct and must not be reported. A disputed subscription with a live
entitlement is a finding. Asserting against Stripe's status instead would report a
false positive on every dispute, and a check that cries wolf on a known-good state is
a check that gets ignored.

**⚠️ The exemption is about THE ROW THAT SUBSCRIPTION WOULD HAVE WRITTEN — `pro` from
`stripe` — and not about everything the account has ever held.** It was implemented
over every entitlement of every product and source, which means "this user has ever
had anything revoked": one withdrawn comp permanently silenced
`live-subscription-without-entitlement`, the rule this spec calls the worst
customer-facing state that is not a wrong charge. Driven with two accounts one row
apart — control reported, subject silent.

**⚠️ And a revoked entitlement beside a subscription Stripe is STILL BILLING is now
its own reported rule**, `revoked-entitlement-beside-live-subscription`. Once a
dispute cancels, that shape stops being expected and becomes the signal that the
cancel failed or never ran. It is a NEW rule rather than a re-widening of
`live-subscription-without-entitlement`: widening that one back would reintroduce the
false positive this section correctly closed.

**A courtesy period reports as `trialing` at Stripe** while being a paid customer's
free month. The marker is what tells them apart, which is assertion 7's other job.

**A grace-aligned subscription also reports as `trialing`** while being a beta user's
fortnight. Its own marker distinguishes it.

**Three different things wear Stripe's trial status, and this script is the one place
that has to hold all three apart.** Getting it wrong here produces noise on a report
whose entire value is that it is quiet when things are fine.

### 3.5 The output, which is a founder reading it in ten seconds

**A clean run says so plainly**, names what it checked and how many of each, states
the mode it ran against, and stops.

**A dirty run names, for each finding: the account, the rule that broke, and the
evidence** — the specific ids, dates and amounts that make it true. In that order,
because the account is what a person acts on, the rule is what tells them how bad it
is, and the evidence is what they paste into the Stripe dashboard.

**⚠️ Never a wall of JSON.** A dump is a thing nobody reads, and a report nobody reads
is the silence this spec exists to end. Findings are grouped by rule, ordered worst
first, and a run with three hundred findings of one kind says so rather than printing
three hundred lines.

**Exit state carries the answer**, so a scheduled run can be acted on without parsing
prose, and so `12`'s "twice clean" gate is a fact rather than a judgement.

**The same content feeds `14`'s dashboard surface when `14` ships.** One report, two
renderings, so the page and the terminal can never disagree about whether things are
fine. **⚠️ `14` is post-launch and is not a blocker here:** the script stands alone,
the terminal output is the launch-day surface, and the dashboard rendering is an
addition rather than a dependency.

### 3.6 Alerting, which has to use what exists

Step 3 of the sequence is alerting on the same invariants, and the argument for it is
that **anything which makes silence impossible is worth more than another reviewer.**

**⚠️ There is no email system in this codebase.** So an alert cannot be an email, and
building one is `17`'s work, not this spec's. What exists today is web push to
subscribed devices, and the admin dashboard's own alert block.

**Use both, and say plainly what each is worth.** Push reaches a founder's phone
within seconds and only if that device is subscribed. The dashboard reaches them when
they look. Neither alone is sufficient, together they are what this codebase can
honestly offer, and D46 in §7 is where the delivery decision is recorded.

**Alert on a state, not on every run.** A rule that has been broken for six hours
should not produce seventy-two notifications. The alert fires when a rule starts
failing and when it stops, and the dashboard carries the standing state in between.

### 3.7 When it runs

**Before go-live, and it must come back clean twice before the public step.** Not
twice in a minute — twice across a window where money has actually moved, so the
second run is evidence rather than a repeat.

**After go-live**, immediately, and then on a schedule.

**The scheduled run uses the existing pattern**: a route protected by a shared secret,
triggered by the same scheduler the reminder engine already uses. No new
infrastructure, no new secret type, no public endpoint.

### 3.8 Invariants this spec touches, and how the work preserves each

This spec does not preserve the invariants so much as **watch** them. Every one of the
ten is either asserted directly or is the reason an assertion exists.

The two it must preserve in its own conduct:

- **No secret ever reaches a client bundle.** The script and its route are
  server-only, the service role is never imported anywhere a browser can reach, and
  the report's dashboard rendering goes through `14`'s founder-scoped surface rather
  than shipping raw findings to a client.
- **A server action never accepts an identifier saying whose data to act on.** The
  scheduled route takes a shared secret and nothing else. It acts on everybody by
  design, which is why it is a secret-gated route rather than a session-scoped action.
  **⚠️ Every export of a `"use server"` module is publicly dispatchable**, so none of
  this belongs in one.

### 3.9 If this goes wrong after go-live

This spec is part of the answer to that question rather than a subject of it. But its
own failure mode is worth naming: **a reconciliation script that breaks silently is
strictly worse than none**, because the word "clean" starts meaning "did not run".
That is why §3.2 requires a run that hit a limit to report itself incomplete, and why
the exit state carries the answer rather than the prose.

The general runbook is §9e of the founder's brief, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The fetch layer, paginating to exhaustion.**
Every Stripe list call paginates fully and reports whether it did. Fetch in bulk
rather than per-account. Record the mode the run is against.
`OPEN: awaiting answer to Q93` — whether any existing list call already paginates, so
this follows a pattern if one exists.
*Verify before moving on:* seed more records than one page holds and confirm the run
sees all of them and says so.

**Step 2 — The rules, as pure functions, one per assertion.**
Ten functions taking fetched state and returning findings. Pure, so they are testable
under the house rule that tests cover pure logic, and so a rule can be read on its own.
**⚠️ Each names the spec it comes from in a comment.**
*Verify before moving on:* unit tests per rule, including the three-way trial-status
case from §3.4.

**Step 3 — The report.**
Clean says clean. Dirty names account, rule, evidence, grouped by rule, worst first,
with a count rather than a flood. Exit state carries the answer.
*Verify before moving on:* run it against deliberately broken seeded state and read
the output cold. If it takes more than ten seconds to understand, it is wrong.

**Step 4 — Break each rule deliberately and confirm it is caught.**
Ten seeded violations, one per assertion, each confirmed to produce exactly one
finding naming the right account and rule.
**⚠️ Seed on `@trackd-qa.invalid` and delete BY ID ONLY.**
**⚠️ Clean up Stripe objects BEFORE deleting a test user.**
*Verify before moving on:* ten violations, ten findings, no false positives from the
correct state around them.

**Step 5 — Confirm the deliberate divergences do not fire.**
A dispute with a deactivated entitlement, a courtesy month, and a grace-aligned
subscription. All three are correct states and none may be reported.
*Verify before moving on:* zero findings across all three.

**Step 6 — The scheduled route.**
Shared-secret gated, same pattern as the existing scheduler. No public endpoint.
`OPEN: awaiting answer to Q94` — the script-runner convention, so this follows it.
*Verify before moving on:* the route refuses without the secret and returns the same
answer the script does.

**Step 7 — Alerting.**
Fires on a rule starting to fail and on it stopping, not on every run. Delivered per
D46.
*Verify before moving on:* a rule broken for hours produces one alert, not one per
run.

**Step 8 — Run it read-only against production, with `12`'s permission and not
before.**
**⚠️ The Supabase database is production, with ~90 real users. This run must not write
anything.**
*Verify before moving on:* the run completes, reports, and the database and Stripe are
both byte-identical afterwards.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] Every rule has a unit test, and the tests cover pure logic only
- [ ] The route refuses a caller without the shared secret
- [ ] Nothing here is exported from a `"use server"` module
- [ ] The service role is unreachable from any client bundle

It is read-only:

- [ ] **The script writes nothing to Stripe and nothing to the database**, confirmed
      by running it against a snapshot and diffing both afterwards
- [ ] It repairs nothing, cancels nothing, and refunds nothing
- [ ] It can be run twice in a row with identical output

The ten assertions, each proven by breaking it:

- [ ] Two billable subscriptions on one account is caught
- [ ] An active entitlement with no live subscription or comp is caught
- [ ] A live subscription with no entitlement is caught
- [ ] An unattributed webhook is caught, and reported separately from an unprocessed
      one
- [ ] A charge date and an entitlement date that disagree is caught
- [ ] **A charge inside a promised grace period is caught**
- [ ] **A charge inside a courtesy period is caught**
- [ ] An incomplete subscription past the cancellation window with an entitlement is
      caught
- [ ] A subscription on an archived price is caught
- [ ] Two entitlements from the same source on one account is caught
- [ ] A zero-dollar invoice with no explaining marker is reported as unattributed
- [ ] **A courtesy marker on a subscription that was unpaid at grant time is caught**
      (D75), seeded deliberately to prove the assertion fires
- [ ] **A slightly-extended trial produces no finding** (D72), and an extension in the
      other direction still does
- [ ] The markers themselves are asserted present, so a removed marker fails loudly
      rather than blinding an assertion

The deliberate divergences, each proven NOT to fire:

- [ ] A dispute with a deactivated entitlement produces no finding
- [ ] A courtesy month produces no finding
- [ ] A grace-aligned subscription produces no finding
- [ ] All three trial-status cases are held apart correctly

Pagination and completeness:

- [ ] Every list call paginates to exhaustion
- [ ] **A run that hits a limit reports itself INCOMPLETE and never reports clean**
- [ ] The output states which Stripe mode it ran against
- [ ] Seeded state larger than one page is fully seen

The report:

- [ ] A clean run says so plainly and is understandable in ten seconds
- [ ] A dirty run names the account, the rule and the evidence, in that order
- [ ] Findings are grouped by rule, worst first, and counted rather than flooded
- [ ] It is not a wall of JSON
- [ ] The exit state carries the answer without parsing prose
- [ ] The terminal output is complete and readable on its own, with no dependency on
      any dashboard surface
- [ ] Once `14` ships, its rendering and the terminal output cannot disagree (not a
      launch-day check)

Alerting:

- [ ] An alert fires when a rule starts failing and when it stops
- [ ] A rule failing for hours produces one alert, not one per run
- [ ] The delivery honestly reflects what each channel is worth, and no alert path
      depends on an email system that does not exist

The go-live gate:

- [ ] **The script has come back clean TWICE, across a window in which money actually
      moved, before the public rollout step.** `12` holds this gate

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

4. **Migrations are written, never applied.** This spec produces no SQL. If any is
   needed it stops and asks first, and any file it eventually produces opens with a
   ▶ HOW TO RUN THIS block and ends with a VERIFY block that returns rows, for the
   founder to apply by hand.

---

## 7. Open items

One decision and two questions.

**`OPEN — D46, where an alert is delivered.`** There is no email system, so the honest
options are the two things that exist.

- **A. Web push to founder devices, plus the standing state on the admin dashboard.**
  Push for the moment a rule breaks, the dashboard for the state in between. Both
  already exist and neither needs new infrastructure.
- **B. The dashboard alone.** Simpler, and it reaches the founder only when they look
  — which is precisely the silence this step exists to end.
- **C. Wait for `17`'s email system** and ship reconciliation without alerting until
  then.

**Recommended: A**, with its limitation stated in the runbook rather than hidden: push
reaches a device that is subscribed, and if no founder device is subscribed the alert
reaches nobody. **That is a state worth asserting on too** — an alerting system with no
subscribed device is itself a silent failure, and the script can check for it.

C is worth naming only to reject it: shipping the check without the alert means the
one thing that makes silence impossible arrives after the money starts moving.

**`Q93`** — whether any existing Stripe list call in this codebase paginates, and what
the expected order of magnitude is for subscriptions and invoices at go-live. Needed
so Step 1 follows a pattern if one exists and sizes the fetch if it does not.

**`Q94`** — the convention for a runnable script in this repo: how the existing one is
invoked, how it loads environment variables, and whether there is a package script for
it. Needed so this lands as something the founder can actually run rather than
something that needs explaining every time.
