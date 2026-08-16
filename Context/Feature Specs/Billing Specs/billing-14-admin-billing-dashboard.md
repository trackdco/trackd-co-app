Save as: Context/Feature Specs/14-admin-billing-dashboard.md

*(Canonical path. The founder saves these locally as `billing-14 - Admin Billing
Dashboard.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 14 — which is unambiguous either way.)*

# Spec: Admin Billing Dashboard

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

**Depends on:** `04`, `05`, `10`, `11` and `13` for the states, the boundary and the
data it reports on.

**⚠️ Post-launch. Not a launch blocker, and it must not become one.** `11`'s script
stands alone with its terminal output as the launch-day surface; this page is an
addition to it. Launch target is Thursday 20 August and nothing here is in that set.

**Seams:**

- `11` owns the reconciliation run and its findings. **This owns their appearance on
  the page and nothing about their content.**
- `10` established the pattern for a founder-scoped row read and the rule that
  `lib/db/admin/` returns counts only. **Both hold here without exception.**
- `13` owns the event taxonomy. Where an event and a Stripe fact answer the same
  question, §3.4 says which one this page believes.

**⚠️ The existing dashboard already reads billing and will report wrong numbers the
moment real money moves.** That is what this spec fixes, and it is why it is first
among the reporting work rather than last.

---

## 1. Goal

The dashboard stops being wrong the day it starts mattering.

It already computes revenue, and it already excludes exactly the customers the save
offer creates. It has no idea whether an offer has ever been shown, taken or declined
— the numbers that decide whether the riskiest screen in the product earns its place.
It cannot say how many people were refused a trial under the one-per-user rule. And it
has no view of whether reconciliation is passing.

**Working looks like this:** revenue that does not move when a retention decision is
made, three numbers that answer whether the offer works, and a line at the top that
says whether the money is reconciling.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT widen `lib/db/admin/` to return a row.** The boundary is the return type,
  not the permission — the service role already reads everything.
- **Do NOT** add a founder policy to the billing tables. `10` established the
  alternative and this follows it.
- **Do NOT** add the founder email list to a fifth place.
- **Do NOT** compute access, entitlement or eligibility here. This page reports; it
  never decides.
- **Do NOT** write to Stripe or to any billing table. Read-only, like `11`.
- **Do NOT** re-implement the reconciliation rules. This renders `11`'s output.
- **Do NOT** show a user's identity, message or plan anywhere this spec does not
  explicitly require it.
- **Do NOT** treat this page as a launch dependency in any checklist.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 ⚠️ MRR excludes exactly the customers the save offer creates

Revenue counts subscriptions Stripe reports as `active`, and excludes `trialing` and
`past_due`. Both exclusions are correct and well reasoned: a trial is not revenue, and
a failed charge is money that did not arrive.

**But a courtesy period reports as `trialing`.** Granting free time moves the trial
end, which is the only mechanism that means "this period is free" precisely — and the
side effect is that a two-year customer on a free month looks to Stripe exactly like a
first-time trialist.

**So today, accepting a save offer removes a paying customer from MRR, and their
courtesy period ending puts them back.** Revenue moves because of a retention
decision rather than because of anything a customer did, and it moves in the wrong
direction at the moment the feature works.

**Decided (D60): courtesy periods stay excluded from MRR, and the page carries a
split line:**

> MRR $X · +$Y pending from courtesy periods

**MRR states money currently recurring, and never a promise.** That is the stricter
reading and it is the right one for a figure with that name — a customer who is being
charged nothing this month is not recurring revenue this month, whatever they will be
next month.

**The split line is what stops the graph reading backwards.** The concern was that
accepting an offer would look like losing a customer; the pending figure says exactly
where that money went and that it is coming back. The cost of the offer is visible,
the headline never overstates, and neither number has to lie to make the other
readable.

### 3.2 ⚠️ Three things wear Stripe's trial status, and this is the third spec to need that

A real trial is not revenue. A courtesy period is revenue with a cost attached. A
grace-aligned subscription is not revenue yet — its first charge lands at the grace
end.

`07` needs this split for its reminder copy. `11` needs it for its assertions. **This
spec needs it for money.** Three specs, one distinction, and three implementations of
it would be three chances to disagree about what a customer is.

**It lives in one shared pure function, and all three call it.** The markers already
exist — the courtesy marker on the subscription, the grace marker from `01` — and the
mirror carries the courtesy column once its migration is applied, which happens before
the re-land deploy.

**⚠️ Where the marker cannot be read, fall back to treating the subscription as a real
trial**, which excludes it from revenue. Under-reporting revenue is a number somebody
questions; over-reporting it is a number somebody believes.

### 3.3 The offer's three numbers

**Shown, taken, declined.** They are the only measure of whether the highest-risk
screen in the product earns its place.

**Counted from Stripe's customer metadata, which is the authoritative record.** The
shown marker is written by the cancel path at the moment the offer is put on screen —
it is what enforces one-per-customer — and the claimed marker is written on the grant.
Both are facts about money rather than telemetry, and they survive a user clearing
their browser, an analytics outage, and a vendor change.

**⚠️ Declined and expired are indistinguishable in the metadata**, because both leave a
shown marker and no claimed marker. The page says "not taken" rather than "declined",
and **the split between declining and letting it run out comes from `13`'s events when
they exist.** Naming it honestly costs nothing; guessing would put a wrong number
beside a right one.

### 3.3b Every number is bound to Stripe-verified rows

**The page's figures come from rows `11` has verified against Stripe, not from our
tables read on their own.** Our mirror is written from live Stripe objects and is
usually right; "usually right" is not the standard for a page whose only job is money.

So the dashboard and the reconciliation script share one source of truth, and a
disagreement between them is impossible by construction rather than by discipline. It
also means the page cannot quietly become confident about a state the script would
have flagged.

**⚠️ `/admin` renders money and never touches it.** No write path, to Stripe or to any
table, exists anywhere on this surface.

### 3.4 Where an event and a Stripe fact disagree, the Stripe fact wins

Both `13` and this page can answer some of the same questions. **This page believes
Stripe and the database, always**, and uses events only for things neither records —
the decline-versus-expiry split, checkout abandonment, and the moment a lapsed user
hits the wall.

Events can be dropped, blocked by a browser, or lost across a document load. A
subscription's metadata cannot. On a page whose only job is to be right about money,
that ordering is not a preference.

### 3.5 Trials refused, and the honest version of that number

**Nothing records a refusal.** Eligibility is computed live on every call and stored
nowhere, deliberately — the used-trial fact is derived from Stripe's subscription
history rather than persisted, so there is no marker to count.

**What can be counted from the database: subscriptions created with no trial**, which
is every returning customer charged today and every beta account past its fortnight.
That is the outcome of the rule rather than the rule firing, and it is the number worth
showing.

**What cannot: how many people saw the no-trial checkout and left.** That needs `13`'s
abandonment event. **Label the figure for what it is** — subscriptions started without
a trial — rather than calling it refusals and implying a completeness it does not have.

### 3.6 Reconciliation on the page

**The last run's verdict belongs at the top, in the block that already answers "is
anything wrong".** Clean, dirty, or not run recently — and *not run recently* is the
state most worth showing, because a reconciliation that silently stopped is exactly
the silence the whole effort exists to end.

**Counts and rule names only.** A finding names an account, and an account is a row.
The boundary in `lib/db/admin/` holds: the page shows how many findings and which
rules broke; the detail stays in `11`'s own output, or comes through the narrow
founder-scoped reader `10` established.

**Somewhere has to hold the last run's result**, and nothing does today. D61 in §7,
and it carries a migration under the standing rule.

### 3.7 Invariants this spec touches

- **A screen never states a price, date or promise the server would contradict.** This
  is a screen made entirely of numbers, and §3.1 through §3.5 are that invariant
  applied to each of them.
- **No secret ever reaches a client bundle.** The service role stays server-side and
  nothing new is exposed.
- **Access is decided by entitlements and nothing else.** This page reads
  entitlements and reports on them; it decides nothing.

### 3.8 If this goes wrong after go-live

A wrong number here misleads the founder rather than a customer, which is why this is
post-launch. **The exception is the reconciliation line: a page reporting "clean" for a
run that never happened is worse than a page reporting nothing**, which is why §3.6
requires the not-run-recently state to be as visible as a failure. The general runbook
is §9e of the founder's brief, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The shared three-way classifier.**
One pure function distinguishing a real trial, a courtesy period and a grace-aligned
subscription, from the markers. Tested. **⚠️ `07` and `11` adopt it rather than keeping
their own** — check both and converge them.
*Verify before moving on:* unit tests per case plus the marker-absent fallback, and no
second implementation remains anywhere.

**Step 2 — The MRR split line, per D60.**
Courtesy periods stay out of MRR and appear in the pending figure beside it.
*Verify before moving on:* granting a courtesy period on a test clock moves that
amount out of MRR and into the pending figure, the two together account for it
exactly, and the headline never overstates.

**Step 3 — The offer's three numbers.**
Shown and taken from the metadata, not-taken derived. Labelled honestly.
*Verify before moving on:* seed one shown, one taken and one expired, and confirm the
counts match Stripe's metadata exactly.

**Step 4 — Subscriptions started without a trial.**
Counted from the database, labelled for what it is.
*Verify before moving on:* a seeded returning customer and a seeded post-grace account
both appear; a normal trial does not.

**Step 5 — The reconciliation line, per D61.**
Counts and rule names at the top. The not-run-recently state as visible as a failure.
**⚠️ No finding detail on this page.**
*Verify before moving on:* a stale run reads as stale rather than as clean, and
`lib/db/admin/`'s diff contains no new row-returning function.

**Step 6 — Drive it against seeded states.**
Every state at once: a trial, a paying subscriber, a courtesy month, a grace, a
past-due, a lapsed account and a comp.
**⚠️ Seed on `@trackd-qa.invalid`, delete BY ID ONLY, clean up Stripe objects first.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`
- [ ] **`lib/db/admin/` returns no row, and its diff contains no new row-returning
      function**
- [ ] No founder policy was added to a billing table, and the email list still exists
      in exactly four places
- [ ] Nothing on this page writes to Stripe or to any table

The numbers:

- [ ] **Granting a courtesy period moves that amount out of MRR and into the pending
      figure**, with the two together accounting for it exactly
- [ ] The headline MRR never includes money that is not currently recurring
- [ ] Every figure on the page derives from Stripe-verified rows, not from our tables
      read alone
- [ ] No write path to Stripe or to any table exists on this surface
- [ ] A real trial is still excluded from revenue
- [ ] A grace-aligned subscription is excluded from revenue until its first charge
- [ ] A past-due subscription is still excluded
- [ ] With the courtesy marker unreadable, the fallback under-reports rather than
      over-reports
- [ ] Offers shown and taken match Stripe's metadata exactly
- [ ] The third number is labelled "not taken", never "declined"
- [ ] Subscriptions started without a trial is labelled for what it is, not as
      "refusals"
- [ ] One shared classifier, adopted by `07` and `11`, with no second implementation
      anywhere

Reconciliation:

- [ ] The last run's verdict is at the top, in the block that answers "is anything
      wrong"
- [ ] **A run that has not happened recently reads as stale, never as clean**
- [ ] Counts and rule names only; no finding detail and no account named

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

4. **Migrations are written, never applied.** D61 produces one. It opens with a
   ▶ HOW TO RUN THIS block and ends with a VERIFY block that returns rows, for the
   founder to apply by hand, and the code behaves correctly in the window before it is
   applied.

---

## 7. Open items

~~`D60 — how MRR treats a courtesy month`~~ **Resolved 15 Aug 2026.** Excluded, with
the split line carried in §3.1. MRR states money currently recurring, never a promise,
and the pending figure keeps the cost of the offer visible.

**`OPEN — D61, where the last reconciliation result is stored.`** Nothing holds it
today, and the page cannot show a verdict it has no record of.

- **A. A small table**, written by the scheduled run. A hand-applied migration, and the
  page reads the latest row.
- **B. No storage; the page runs the script on load.** No migration, but a page load
  that hits Stripe hard and a founder who cannot tell a fresh failure from an old one.

**Recommended: A.** B makes the page slow, makes it expensive, and loses the history
that tells you whether something has been broken for an hour or a week. The migration
is small and follows the standing rule.

**`Q101`** — what the current awaiting-first-customer state checks, so it retires
cleanly the moment real revenue exists rather than lingering beside a real number.
