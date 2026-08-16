Save as: Context/Feature Specs/15-plan-switching.md

*(Canonical path. The founder saves these locally as `billing-15 - Plan Switching.md`,
so the filename on disk may differ. Cross-spec references are by number — 01, 02a, 15
— which is unambiguous either way.)*

# Spec: Plan Switching

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

**Depends on:** `01-trial-eligibility.md`, which defines the carry-over rule this spec
implements, and `08-billing-screen.md`, which owns the screen it lives on.

**⚠️ Post-launch, and deliberately so (D9).** Launch is Thursday 20 August; this is
not in that set and must not appear as a blocker in any checklist. **Until it ships, a
wrong-plan pick in week one is fixed by hand in the Stripe dashboard**, which `12`'s
runbook carries.

**Seams:**

- `01` owns the carry-over rule. **This implements it and does not redefine it.**
- `03` owns cancel and resume. **A switch is neither**, and must not be built out of
  them. §3.2.
- `04` owns the courtesy period. A switch must not destroy one. §3.6.
- `08` owns the Billing screen and places the control.
- **D14 stands: the portal never carries plan switching.** Both toggles are off in
  test and `12` verifies them off in live. **This is the only plan-switch surface in
  the product**, and if the portal's toggle is ever turned on there are two, disagreeing
  about carry-over and about copy.

---

## 1. Goal

Somebody on the wrong plan can move to the right one without losing anything.

Today there is no control at all. The only route is cancel, wait to lapse, then
resubscribe — which costs them a read-only gap in the middle, remembers nothing, and
**burns their one trial for nothing**, since a resubscribe after lapsing is refused a
trial under the one-per-user rule. So the workaround is not merely awkward; it is
lossy in a way nobody would choose if they understood it.

**Working looks like this:** an upgrade takes effect immediately and is charged the
difference; a downgrade takes effect when the current period ends and changes nothing
before then; a trial that switches keeps the days it has left; and at no point does an
account hold two subscriptions or lose a day it paid for.

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT implement a switch as a cancel and a re-create.** §3.2. That is the
  current workaround and it is the thing this spec exists to remove.
- **⚠️ Do NOT display a charge amount computed in our own code.** §3.5. Every figure a
  user sees before confirming comes from Stripe's preview for that exact change.
- **Do NOT** grant, extend, or reset a trial on a switch. Carry-over is `01`'s rule and
  it carries what remains; it never adds.
- **Do NOT** destroy or shorten a courtesy period. §3.6.
- **Do NOT** allow a second switch while one is pending. §3.7.
- **Do NOT** enable plan switching in the Stripe portal, now or ever. D14.
- **Do NOT** switch a comp account, a lapsed account, or an account with no
  subscription. There is nothing to switch.
- **Do NOT** offer a save offer, a discount, or a diversion inside this flow.
- **Do NOT** treat this spec as a launch blocker.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 Upgrades now, downgrades at period end

**An upgrade takes effect immediately** and is charged the difference. Somebody moving
up has decided they want more now, and making them wait for a period boundary is the
product declining money it has been offered.

**A downgrade takes effect when the current period ends.** They keep what they paid
for, in full, until the day it runs out. **No refund, no proration credit, no
shortening.**

**That asymmetry is the rule** and it follows directly from an invariant: cancelling
never revokes access already paid for, and a downgrade is a partial cancellation
wearing a friendlier name.

### 3.2 ⚠️ A switch is a subscription update, not a cancel and a re-create

The subscription is modified in place. **Never cancelled and re-created.**

Three things break the moment it becomes a cancel-and-create: the account holds two
subscriptions for as long as the gap lasts, which is the invariant this project has
already been bitten by; the customer's subscription history gains a cancelled row that
looks like churn and is not; and the trial history the one-per-user rule derives from
gains a subscription that never should have existed.

**⚠️ A downgrade needs Stripe's own mechanism for a deferred change**, not a flag we
invent and act on later. `OPEN: awaiting answer to Q102` — which mechanism the pinned
library supports for this, and whether anything in the codebase already uses it. **A
locally scheduled "apply it later" job is not an acceptable substitute**: it means a
promise held in our infrastructure about somebody else's billing, and if it misfires
the customer is on the wrong plan and being charged for it.

### 3.3 The carry-over rule, implemented

**Switching plans during a trial carries the remaining days across.** Weekly on
Monday, yearly on Tuesday, is five days left — not a fresh seven and not zero.

`01` decided this and it is not reopened here. What this spec adds is where it bites:
the trial end is preserved across the update rather than recomputed, so the same
instant survives the plan change.

**⚠️ A trial switch is not an upgrade or a downgrade for timing purposes.** Nothing is
owed either way while a trial is running, so both directions take effect immediately
and the trial end does not move. The upgrade-now, downgrade-later split applies once
money has actually been charged.

### 3.4 A grace-aligned subscription keeps its grace

A beta user who set their plan up mid-fortnight holds a subscription whose trial end
is their grace end. **If they switch plans before their fortnight is over, that date
does not move.** They were told a date in writing and a plan change is not a reason to
charge them earlier.

Mechanically this is the same requirement as §3.3 — preserve the trial end across the
update — and the grace marker travels with the subscription.

### 3.5 ⚠️ Every amount shown comes from Stripe's preview, never from our arithmetic

**Any charge amount a user sees before confirming a switch is Stripe's upcoming-invoice
preview for that exact change.** Not a figure our code worked out. Local arithmetic may
be used only for estimates that are never displayed.

The reason is simple and it has already cost this project money once in a different
form: **proration is Stripe's arithmetic, and any number we compute is a second
opinion about somebody's card.** Period boundaries, partial days, tax, existing
credits, and the interval count all feed it. A figure that differs from the invoice by
a cent is a support conversation; a figure that differs by a dollar is a dispute.

**The Check When Done drives this**: the displayed amount must equal the amount
actually invoiced, verified on a test clock for a mid-cycle upgrade on each plan pair.

**Any worked example anywhere in this spec is illustrative and must be labelled as
such.** None of them is a specification of an amount.

> *Illustrative only, not a specification:* somebody halfway through a monthly period
> who upgrades to yearly is charged roughly the yearly price less the unused half of
> the month. **The actual figure comes from the preview and may differ for reasons
> this sentence does not model.**

### 3.6 Switching during a courtesy period

A courtesy period is free time granted on a live subscription by moving its trial end.
It reports as `trialing` and it is somebody who has paid before.

**A switch must not shorten it, cancel it, or convert it into a charge.** The trial end
is preserved exactly as in §3.3, and the courtesy marker travels with the subscription
so `07`'s reminder, `11`'s assertion and `14`'s reporting all keep working afterwards.

**⚠️ If preserving the courtesy across a plan change is not possible with the mechanism
Q102 identifies, stop and ask.** Silently ending somebody's free month because they
changed plan is the first invariant broken by a feature that had nothing to do with it.

### 3.7 One switch in flight

**While a change is pending, no second change may be started.** A pending downgrade can
be **cancelled**, returning the account to its current plan with nothing else altered,
but it cannot be replaced by a different pending change in one step.

Two pending changes is a state nobody can reason about, including the person who owns
the account, and it is the state that produces "which plan am I actually on".

**The Billing screen says a change is pending, and names the plan and the date.** A
pending change the user cannot see is a surprise waiting for a period boundary. That
row's copy is part of D64.

### 3.8 The copy

**The downgrade confirmation line is signed (D62):**

> You'll switch to {plan} on {date}, when your current plan ends. Until then nothing changes, and you keep everything you've paid for.

`{plan}` and `{date}` both render from the server, and the date is the current period
end from the mirror, formatted in the user's stored timezone. No em dash.

**The upgrade confirmation is not signed** and is D64 in §7. It has a harder job: it
must name a charge that is happening now, at an amount that came from Stripe, and it
must not imply the change is reversible in the way a downgrade is.

### 3.9 Invariants this spec touches, and how the work preserves each

- **No user holds more than one billable subscription at any moment.** §3.2 is that
  invariant: the subscription is modified in place, so there is never a moment with
  two.
- **Cancelling never revokes access already paid for.** §3.1's downgrade-at-period-end
  is the same rule applied to a partial cancellation.
- **Nobody is ever charged after being told they would not be.** §3.4 and §3.6: a
  grace and a courtesy period both survive a switch untouched.
- **A screen never states a price, date or promise the server would contradict.** §3.5
  is this invariant at its strictest — the displayed number and the invoiced number are
  the same number because they have the same author.
- **A server action never accepts an identifier saying whose data to act on.** The
  switch action takes a plan key and nothing else. The subscription resolves from the
  verified session, exactly as cancel and resume already do. **⚠️ Every export of a
  `"use server"` module is a publicly dispatchable HTTP endpoint.**

### 3.10 If this goes wrong after go-live

A failed switch must leave the customer on the plan they were already on, charged what
they were already being charged. **Partial states are the danger**: a Stripe update
that succeeded with a mirror write that failed leaves the screen describing the old
plan while the card is billed for the new one.

Follow the existing pattern rather than inventing one — Stripe accepting the change is
what makes it real, the mirror write is logged and not thrown, and the webhook
reconciles a moment later. `11` then catches anything that did not.

The general runbook is §9e of the founder's brief, carried in `12-go-live.md`, and
until this spec ships a wrong plan is fixed by hand in the dashboard.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Establish the mechanism before building anything on it.**
Determine how a deferred change is expressed with the pinned library, and whether the
codebase already uses it. **⚠️ Do not proceed on a locally scheduled job.**
`OPEN: awaiting answer to Q102`.
*Verify before moving on:* a deferred downgrade created by hand in test mode applies
itself at the period boundary on a test clock, with no code of ours running at that
moment.

**Step 2 — The preview.**
Fetch Stripe's upcoming-invoice preview for the exact change being offered. **⚠️ No
locally computed figure reaches a screen.**
*Verify before moving on:* the previewed amount for a mid-cycle upgrade matches the
invoice that is actually raised, on each plan pair.

**Step 3 — The switch action.**
Modify in place. Upgrades immediate, downgrades deferred, trial end preserved in every
case. No user id argument, nothing exported that should not be.
*Verify before moving on:* an upgrade, a downgrade and a trial switch each leave
exactly one subscription, with the trial end unchanged where one exists.

**Step 4 — Courtesy and grace.**
Switch during a courtesy period and during a grace-aligned trial. **⚠️ If either
cannot be preserved, stop and ask.**
*Verify before moving on:* both markers survive, both dates unchanged, and `07`,
`11` and `14` all still classify the subscription correctly afterwards.

**Step 5 — One in flight, and the pending row.**
Block a second change; allow a pending one to be cancelled. Show the pending state on
Billing with the plan and the date, per D64.
*Verify before moving on:* a second change is refused, a cancellation of the pending
change restores the status quo exactly, and the row disappears when it does.

**Step 6 — The copy.**
D62's line verbatim; D64's once decided. **⚠️ No em dash.**
*Verify before moving on:* both render with server-sourced plan and date.

**Step 7 — Drive every pair on a test clock.**
All six directed pairs across the three plans, mid-cycle and at a boundary, plus a
trial switch and a courtesy switch.
**⚠️ Seed on `@trackd-qa.invalid`, delete BY ID ONLY, clean up Stripe objects first.**
**⚠️ `http://127.0.0.1` does not hydrate.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The switch action refuses an anonymous caller and another signed-in user, and
      takes no subscription id
- [ ] No new export was added to a `"use server"` module

The money:

- [ ] **The amount displayed before confirming equals the amount actually invoiced**,
      verified on a test clock for a mid-cycle upgrade on **each plan pair**
- [ ] No displayed figure is computed by our code
- [ ] A downgrade charges nothing at the moment it is chosen
- [ ] A downgrade produces no refund and no proration credit
- [ ] The customer keeps every paid day of the plan they are leaving

The mechanics:

- [ ] Every switch modifies the subscription in place
- [ ] **At no point does the account hold two subscriptions**, checked during the
      switch and not only afterwards
- [ ] No cancelled subscription is created by a switch
- [ ] An upgrade takes effect immediately
- [ ] A downgrade takes effect exactly at the period end, applied by Stripe rather than
      by our code
- [ ] A failed switch leaves the customer on the plan they were on

Trials, grace and courtesy:

- [ ] A trial switch carries the remaining days across, in both directions
- [ ] No switch grants, extends or resets a trial
- [ ] **A grace-aligned subscription's date does not move**
- [ ] **A courtesy period survives a switch intact**, with its marker
- [ ] `07`, `11` and `14` all classify the subscription correctly after each

One in flight:

- [ ] A second change is refused while one is pending
- [ ] A pending change can be cancelled, restoring the status quo exactly
- [ ] Billing shows the pending change with its plan and date, and the row clears when
      it applies or is cancelled

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

4. **Migrations are written, never applied.** If Q103 shows the mirror cannot record a
   pending change and one is needed, this spec produces SQL under the standing rule: a
   ▶ HOW TO RUN THIS block, a VERIFY block that returns rows, hand-applied, and code
   that behaves correctly before it is applied.

---

## 7. Open items

**`OPEN — D64, the upgrade confirmation's copy, and the pending-change row.`** Two
strings. The confirmation has to name a charge happening now, at an amount that came
from Stripe rather than from us, and must not imply the change is reversible the way a
downgrade is. The pending row has to say which plan and which date without reading as a
warning.

I have not drafted them, for the same reason as before: the downgrade line you signed
sets a voice, and the upgrade line should sound like its sibling rather than like my
approximation of it. **Give me the upgrade line and I will fit the pending row to
both.**

**`Q102`** — which Stripe mechanism the pinned library supports for a change that
applies at the period end, and whether anything in this codebase already uses it.
**Blocks Step 1, and the answer decides whether §3.6's courtesy preservation is
possible at all.**

**`Q103`** — whether the subscriptions mirror can record a pending plan change today,
or whether the pending row must read from Stripe on each render. If a column is needed
it is a migration under the standing rule, and the code must work before it is applied.
