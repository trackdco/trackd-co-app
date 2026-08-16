Save as: Context/Feature Specs/08-billing-screen.md

*(Canonical path. The founder saves these locally as `billing-08 - Billing Screen.md`,
so the filename on disk may differ. Cross-spec references are by number — 01, 02a,
08 — which is unambiguous either way.)*

# Spec: Billing Screen

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

**Depends on:** `03-cancel-flow.md` (the cancel row and the un-cancel card),
`04-save-offer.md` (the reopen row), `05-read-only-gate.md` (the lapsed state), and
`06-beta-grace-and-notices.md` (the cohort the subscribe row serves).

**In no ship-together pair**, but it is downstream of three of them.

**Seams:**

- **This spec places; the flow specs behave.** The cancel row, both cancel dialogs and
  the un-cancel card belong to `03`. The reopen row and the offer dialog belong to
  `04`. This spec decides where they sit and what surrounds them, and **carries none
  of their copy.**
- **`05` owns what triggers a lapse; this spec owns how the lapse reads.** `12` owns
  Stripe's retry configuration. All three touch the declined state and none of them
  overlaps.
- **This spec owns the D31-B subscribe row** for entitled-but-expiring accounts, with
  its own copy to be drafted and signed. `06` owns the notice half of the same route.
- **`19-receipts-list.md` will replace the Receipts row's destination.** Until it
  ships, Receipts hands off to Stripe's hosted portal, and that is stated on the
  screen rather than implied.
- `02b` owns checkout copy. This spec owns the route to it, not the screen.

**Every number and date on this screen comes from the server**, formatted in the
user's stored timezone before it reaches the client. Nothing here computes or formats
a date in the browser.

---

## 1. Goal

A user opens Billing and learns, in one card, what they are on, what it costs, and
when the next thing happens to their money.

Four cohorts open this screen and today three of them are told less than they need.
A beta user two days from losing access sees a single word and no date. A paying
customer on a free courtesy month may be told they are on a trial. A user whose card
has just declined has no in-app surface at all — they find out from their bank. And
anybody who wants to change a card or read an invoice is thrown straight out to
Stripe with no warning that they are leaving.

**Working looks like this:** one card holding Access, Price, and the next date;
Manage below it for the things that need a second screen; Cancel below that, quiet and
set apart. Three states that each say what is true. And no surface that states a date
or a price the server would contradict.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** carry, reword, or duplicate any string owned by `03` or `04`. Cancel
  copy, resume copy, offer copy and the decline screen are theirs.
- **Do NOT** build an in-app receipts list. That is `19`. Receipts hands off to
  Stripe until it ships.
- **Do NOT** build plan switching, an upgrade control, or a downgrade control. That
  is `15`.
- **Do NOT** add a subscribe route for any cohort other than the one D31-B names:
  entitled accounts with an expiry, meaning beta grace and courtesy periods. The
  standing order that nothing routes a user at the paywall is amended for that row
  and the notice's secondary button, and for nothing else.
- **Do NOT** rebuild card entry, card storage, or anything that touches card details.
  Everything card-shaped stays with Stripe.
- **Do NOT** read a Stripe status to decide access. The mirror supplies dates for
  display and gates nothing.
- **Do NOT** style the cancel row as destructive, or move it into the plan card.
- **Do NOT** use amber for a button, a tab, or a call to action anywhere on this
  screen.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| One card with Access, Price and the date rows, dividers only where a row exists | **Correct**, and close to the approved structure. §3.2 |
| Dates formatted server-side in the user's stored timezone | **Correct.** §3.2 |
| The mirror read for display only, never for access | **Correct.** |
| The payment row hidden for App Store subscriptions and for accounts with no Stripe customer | **Correct.** |
| The cancel row in its own block below the card | **Correct**, and `03` owns its behaviour |
| No Manage sub-screen exists | **Missing.** The approved structure requires one. §3.3 |
| No Stripe handoff dialog exists | **Missing.** Approved copy exists for it. §3.4 |
| No declined-card surface exists | **Missing.** Approved copy exists for it. §3.5 |
| A beta-grace account sees one row and no date at all | **Defect.** §3.6 |
| "Complimentary" is the same word for a founder and for a fortnight that expires | **Defect.** §3.6 |
| A courtesy month may read "Free trial" | **Correct while `003` is unapplied, wrong after.** §3.7 |
| No subscribe route for an entitled-but-expiring account | **Missing.** D31-B. §3.8 |

### 3.2 The approved structure

**One card** holding Access, Price, the relevant date, and a **Manage** row. **Cancel
sits below it in its own block**, as a quiet muted row, set apart at the foot.

Read down the screen: the heading, the plan card, the cancel block, and the back
link. `03`'s un-cancel card renders above the plan card when it fires; `04`'s reopen
row renders inside the plan block so the countdown appears where the plan does.

**Every date comes from the mirror**, which is written from a live Stripe object
rather than from a webhook payload, and is formatted server-side in the user's stored
timezone. **The trial end while trialing, the period end once paying**, which is the
same choice the entitlement logic makes and for the same reason: reading the period
end on a trialing subscription would name the first renewal rather than the date they
stop being charged nothing.

### 3.3 Manage, and the one sentence that has to be true

Manage opens a sub-screen holding **a one-sentence plain-English summary of what they
are on**, then **Card** and **Receipts**.

**The route is `/billing/manage` (D39), the first nested route in this app.** Every
authenticated route is one segment deep today, and the flat-sibling precedent was set
because a parent was being **removed** — which is not this situation. A sub-page with
a working back button is both the correct shape here and consistent with why that
precedent existed.

**⚠️ Being the first nested route, its back behaviour and layout are driven rather
than assumed.**

**The house shape for an opened-from-Profile screen is settled either way** and this
screen follows it: its own metadata title, a bare page-title heading with no chevron
and no app bar, the fixed bottom nav still visible, and a plain text back link at the
foot. The back link here reads back to Billing rather than to Profile, because that is
where the user came from.

**The summary sentence is signed:**

> Update your card or download receipts. Stripe handles both securely.

Two sentences, no em dash, naming both actions and crediting the handoff. **If the
built screen already says materially this, keep the built wording and mark it signed
rather than replacing it with these words.**

**⚠️ One thing to confirm, because it is a change of purpose rather than of wording.**
The approved structure describes this line as "a one-sentence plain-English summary of
**what they are on**". The signed sentence describes what the screen **does** instead,
which is a different job. I have adopted it as written, on the reasoning that the plan
card the user just came from already states what they are on — the access label, the
price and the date — so repeating it one screen deeper is duplication rather than
summary, and this line does the more useful work.

**If a "what you're on" line was meant to sit here as well, say so and it is one more
sentence, not a redesign.**

**Card and Receipts both hand off to Stripe today.** Card is the one control here
that should leave: card details are precisely the thing to give Stripe and never
touch, and a customer whose card is declining currently has no other way to fix it.
Receipts leaves only until `19` builds the in-app list.

**⚠️ The existing single row does both jobs and is replaced by two.** That row is
also the only caller of the portal action; splitting it must not create a second
caller that skips the handoff dialog in §3.4.

### 3.4 The handoff, which must not be reachable from anywhere else

Before handing off to Stripe:

> You're off to Stripe

> Stripe handles payments for Trackd Co, so your card details never touch us.

> Their page is where you change your card or download receipts. You'll come straight back here after.

Buttons:

> Not now

> Continue

**This is reachable only from the payment rows.** Not from the plan card, not from a
lapsed state, not from anywhere else.

**⚠️ The second line is only true because the portal was narrowed.** Per D14, the
customer portal has cancel and plan switching turned off, so it genuinely offers card
and receipts and nothing else. If either toggle is ever turned back on, this copy
becomes false. `12` verifies both are off in live mode before go-live.

**⚠️ The navigation happens in the client, not by redirecting from the server
action.** A redirect inside a server action throws a control-flow signal that a
caller's try/catch swallows, and the failure mode is a button that silently does
nothing. The action returns a URL and the client assigns it, with a full document
load because the destination is another origin.

### 3.5 The declined card, and the seam around it

> Your payment didn't go through

> Your card was declined on [date]. Update your card details and we'll take it from there.

> Your account stays as it is until [date], and goes read only after that until a payment goes through.

Buttons:

> Not now

> Update my card

**Both dates come from the server and they are different dates.** The first is when
the charge failed. The second is when access actually ends, which is the end of the
last period they paid for plus the grace — the same value the entitlement holds, not
a guess and not the failure date plus a constant.

**Three specs touch this state and the boundaries are exact.** `05` decides when
access lapses and writes the entitlement. **This spec renders what a user sees while
past-due.** `12` owns Stripe's retry configuration, which is on, up to eight attempts
across two weeks, with the subscription cancelled on exhaustion.

**⚠️ The grace assumption is visible on this screen.** The three-day window is written
to land inside Stripe's first retry, so a card that works second time is never
noticed. Smart Retries publishes no fixed schedule, so per the founder's ruling
nothing is widened or narrowed until `12` measures the first retry on a clock. **If
the measurement says the first retry lands outside three days, the second sentence's
date is telling a recoverable customer they go read-only before Stripe has finished
trying.** That is the specific reason the measurement matters, and it belongs on this
screen's record.

**"Update my card" routes through the handoff dialog**, like every other portal
route. It is the state's primary action (D37).

**⚠️ The state never threatens data.** It says what happens to access and when, and
nothing about logs being lost, removed, or at risk, because nothing is. **This screen
presents the state and never decides it:** `05` owns the lapse moment and the
entitlement, and the retry-timing question stays pinned to `12`'s test-clock
observation.

### 3.6 ⚠️ Defect: a beta-grace account is told one word and no date

Today a beta user on day twelve of fourteen opens Billing and sees the heading, a
single row reading Access — Complimentary, and a back link. **No date appears
anywhere**, even though their access ends in two days and the row that governs it
holds the exact instant.

Meanwhile the dashboard notice told them the date, the reminder tells them the date,
and the banner tells them the date. **Billing — the screen somebody opens
specifically to find out what they are on and when it ends — is the only surface that
does not.**

**And the label cannot tell them apart from a founder.** "Complimentary" is returned
on the first branch for any comp entitlement, and that branch never looks at whether
the entitlement expires. A free-for-life account and a fortnight that runs out in two
days read identically.

The codebase already has the predicate that distinguishes them, and it is already
used by the dashboard and the reminder. **The billing display module does not import
it. That is the whole gap.** Use it: a comp entitlement with an expiry is the grace, a
comp without one is free-for-life, and the two must not read the same.

**D36 decides the wording, and its governing rule is absolute: the word "trial"
never renders for anyone who is not on one.**

- **A beta grace with no subscription** reads its state in the signed "days on us"
  vocabulary with its end date, beside the D35 row. Rendered as `On us until {date}`.
- **A grace-aligned `trialing` subscription** names the plan and its server-sourced
  start date, then flips to the standard active label once the plan starts. Rendered
  as `Pro`, with a `Starts {date}` row until then.
- **A courtesy period** reads `Free month until {date}`, or `Free week until {date}`,
  the noun following the granted period.
- **A genuine trial** keeps the trial label. **A free-for-life comp** keeps
  "Complimentary", with no date and no expiry language.

**⚠️ This label function is shared with Profile's plan pill (Q88).** Any string
changed here changes both screens, and Profile's row truncates a label past roughly
35 characters. Every label above is comfortably inside that, and the constraint is
recorded so the next person adding a state checks it rather than discovering it.

**The two constants are confirmed:** full access reads "Pro", no access reads
**"Read only"** — two words, one space, lower-case second word. Neither is exported.
The pop-up and the server's refusal message embed the same words mid-sentence in
lower case, so the phrase is consistent even though the strings are not identical.

**⚠️ Two of those are my rendering of the ruling rather than its own words.** The
ruling gave requirements — days-on-us vocabulary, server-sourced date, never "trial"
— and not literal labels. `On us until {date}` and `Starts {date}` are what satisfy
them most plainly. If either reads wrong it is a word change, not a rebuild.

### 3.7 The courtesy month, and why the label is right today and wrong tomorrow

Moving `trial_end` to grant free time puts Stripe's status into `trialing` for the
free stretch, so without a marker a two-year customer on a free month reads as a
first-time trialist. The marker is a mirror column that arrives with
`003_courtesy_until.sql` — **written, not applied.**

**Unapplied, the entire observable effect is one word on this screen for one kind of
customer.** That is a correct and deliberate degradation, and per D10 the migration is
applied before the re-land deploy, so it is not the state this ships into.

**⚠️ Read the column in its own tolerant query. A column added to a select breaks the
ENTIRE request if the migration is not applied**, and the select this would be folded
into is the one that tells somebody what they are paying. **⚠️ An unapplied migration
reports `PGRST204` on a write and `42703` on a read.**

**A mid-grace subscriber holds two entitlements and needs a decided label.** They have
a comp entitlement with an expiry and a Stripe subscription that is `trialing` until
that same date, per `01`'s grace-aligned start. Which of the two the label reads from
is not currently decided by anything, and both answers are defensible. This is part of
D36.

### 3.8 The subscribe row (D31-B)

**The cohort, corrected and narrowed (D35):** an account holding a **live beta grace
AND no subscription.** Nothing else.

**⚠️ A courtesy user does NOT get this row, and the correction matters.** A courtesy
period exists only on a live subscription, so a courtesy customer already holds one.
Offering them a subscribe control invites a second billable subscription, which the
one-subscription invariant forbids outright. They get the manage surface, like every
other subscriber.

Not a lapsed account either, which gets `05`'s pop-up and its own route. Not a
free-for-life comp, which `01` refuses at the create call. Not a paying subscriber,
who has nothing to set up.

**It exists because the notice is dismissible and shows once.** After "Got it" the
notice is gone for the rest of the fortnight, and without this row a beta user who
dismissed it on day one has no route to checkout for thirteen days. `01`'s
grace-aligned branch and D13 both exist to serve exactly that person.

**Its label is "Set up my plan" (D35), identical to the notice's secondary
control.** One action, one name everywhere. Any supporting line names the end date
from its server source, in the signed "days on us" vocabulary, makes no new promise,
and carries no em dash.

It reads as available rather than urgent, matching the no-pressure hierarchy the
notice uses for the same cohort.

**⚠️ It is not amber.** It is a route, not a live state.

### 3.9 The three states

**Normal.** Access, Price, the next date, Manage. Cancel below.

**Cancelled but still running.** A card explaining what happens on the date, carrying
the resume control labelled **"Keep my Pro plan"** per D22. `03` owns that control's
behaviour and the explanatory paragraph beneath it; this spec owns the card that holds
them.

**Lapsed.** Access reads **"Read only"** — the exact phrase, matching every other
surface — with a route to choose a plan. `05` owns the gate and the pop-up; this spec
owns the row.

**A fourth condition cuts across all three:** past-due, per §3.5. It is a state of the
payment rather than of the plan, and it renders as the declined card above the plan
card rather than replacing any of the three.

### 3.10 Invariants this spec touches, and how the work preserves each

- **A screen never states a price, date or promise the server would contradict.**
  This is the spec's whole subject. Every date is server-formatted from the mirror,
  every amount from the Stripe price, the label reads from the entitlement that
  actually governs access, and §3.6's missing date is this invariant failing by
  omission rather than by contradiction.
- **Access is decided by entitlements and nothing else.** The mirror supplies dates
  for display. Nothing on this screen gates anything.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** The lapsed state says read-only and routes to a plan; it does not
  threaten, count down data, or imply loss.
- **Cancelling never revokes access already paid for.** The cancelled-but-running
  state exists to say so out loud, with the date.
- **Nobody is ever charged after being told they would not be.** The declined card's
  second date is the entitlement's, not a guess, so what it says about when access
  ends is what actually happens.
- **A server action never accepts an identifier saying whose data to act on.** The
  portal action resolves the customer from the verified session. **⚠️ Every export of
  a `"use server"` module is a publicly dispatchable HTTP endpoint.**

### 3.11 If this goes wrong after go-live

`BILLING_GATE_ENABLED=false` restores write access without a deploy and stops no
charge. There is no in-app control to fix an individual's subscription, no self-serve
deletion, and no in-app receipts list — everything exceptional is the founder in the
Stripe dashboard. The runbook is §9e of the founder's brief, carried in
`12-go-live.md`. Refer to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Adjudicate what is built.**
Read the page, the display module and the payment row against §3.1's table. Record
confirmed or diverged per row, and record every string currently on the screen.
*Verify before moving on:* a written line per row.

**Step 2 — Fix the grace display.**
Import the existing predicate rather than writing a second one. Distinguish a comp
with an expiry from a comp without one, and show the date. Apply D36 once decided; if
it is open, build the distinction and mark the wording `OPEN`.
*Verify before moving on:* a seeded grace account on day twelve sees its end date, and
a seeded free-for-life account sees no date and no expiry language.

**Step 3 — Build the handoff dialog.**
Per §3.4, reachable only from the payment rows. Follow `ui-context.md`.
**⚠️ The client navigates; the action returns a URL.**
*Verify before moving on:* every route to Stripe passes through it, and no route
bypasses it.

**Step 4 — Build the Manage sub-screen.**
The summary sentence, then Card and Receipts, both through the handoff. Apply D35 once
decided.
*Verify before moving on:* back navigation returns to Billing cleanly, and the
existing single row no longer exists in two places.

**Step 5 — Build the declined card.**
Per §3.5, with both dates from the server and "Update my card" routing through the
handoff.
*Verify before moving on:* drive a decline on a test clock and confirm both dates
match Stripe and the entitlement respectively.

**Step 6 — Build the subscribe row.**
Per §3.8, for entitled-but-expiring accounts only. Apply D37 once decided.
**⚠️ Not amber.**
*Verify before moving on:* it renders for a grace account and a courtesy account, and
for nobody else — not lapsed, not comp, not a paying subscriber.

**Step 7 — Build the three states.**
Normal, cancelled-but-running, lapsed, with past-due cutting across them.
*Verify before moving on:* each state driven at 390x844 and 320x568.

**Step 8 — Drive every cohort on a test clock.**
New trialist, paying subscriber, courtesy month, beta grace mid-fortnight, mid-grace
subscriber, lapsed account, past-due account, free-for-life comp, App Store account.
**⚠️ Verify the courtesy label with `003` UNAPPLIED as well as applied.**
**⚠️ `http://127.0.0.1` does not hydrate.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ Clean up Stripe objects BEFORE deleting a test user.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The screen works with `003` UNAPPLIED, and the only difference is the plan label
      for a courtesy customer
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] Nothing amber on this screen is a button, a tab, or a call to action

Every cohort sees something true:

- [ ] A trialist sees their trial end date
- [ ] A paying subscriber sees their renewal date and amount
- [ ] **A beta-grace account sees its end date**, and is not labelled identically to a
      free-for-life comp
- [ ] A free-for-life comp sees no expiry, no date, and no subscribe row
- [ ] A courtesy customer is not called a first-time trialist once `003` is applied
- [ ] A mid-grace subscriber's label is the decided one and does not flicker between
      two entitlements
- [ ] A lapsed account reads "Read only", the exact phrase, two words, lower-case
      second word
- [ ] Every label renders correctly in Profile's plan pill as well as here, and none
      truncates
- [ ] An App Store account is told it can only be changed there

The dates and amounts:

- [ ] Every date is server-formatted in the user's stored timezone, verified with the
      device set to a different zone
- [ ] The trial end shows while trialing and the period end once paying
- [ ] The declined card's two dates are different and each comes from its own source:
      the failure date from Stripe, the access date from the entitlement
- [ ] No amount or date is computed in the browser
- [ ] No screen states a date the server would contradict

Manage and the handoff:

- [ ] Manage opens a sub-screen with the summary, Card and Receipts
- [ ] The summary sentence renders as signed, and no em dash appears on the screen
- [ ] Every route to Stripe passes through the handoff dialog, and none bypasses it
- [ ] The handoff is unreachable from anywhere but the payment rows
- [ ] Receipts states that it hands off to Stripe until `19` ships
- [ ] Returning from Stripe lands back on Billing

The subscribe row:

- [ ] Renders for a beta-grace account and a courtesy account
- [ ] Renders for nobody else: not lapsed, not comp, not a paying subscriber, not a
      trialist
- [ ] A mid-grace user who dismissed the notice reaches checkout from this row
- [ ] D13 alignment holds from this route: no charge before the fortnight ends

The three states:

- [ ] Normal, cancelled-but-running and lapsed each render at 390x844 and 320x568
- [ ] Past-due renders above the plan card in all three
- [ ] The cancelled-but-running card carries "Keep my Pro plan" and `03`'s paragraph
- [ ] The cancel row is quiet, muted, in its own block, and not styled as destructive
- [ ] No string owned by `03` or `04` is duplicated in this spec's work

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

Three decisions closed. One piece of copy outstanding, and two implementer questions.

~~`D35 — the subscribe row`~~ **Resolved 15 Aug 2026.** Label "Set up my plan",
identical to the notice's secondary control. Cohort narrowed by the founder's own
correction to a live beta grace holding no subscription; a courtesy user never sees
it, because a second subscribe control on a live subscription runs at the
one-subscription invariant. Carried in §3.8.

~~`D36 — the plan label`~~ **Resolved 15 Aug 2026.** "Trial" never renders for anyone
not on one. Five states and their labels carried in §3.6, with two strings rendered
from the ruling rather than quoted from it and flagged as such.

~~`D37 — the declined and past-due state`~~ **Resolved 15 Aug 2026.** The approved
copy renders verbatim, the primary action routes through the handoff, the state never
threatens data, and this screen presents the state without deciding it. Carried in
§3.5.

**`OPEN — the Manage summary sentence.`** The one piece of copy this screen needs and
does not have: one plain-English sentence answering "what am I on and when does the
next thing happen", derived entirely from server state, in a form per state — a
trialist, a paying subscriber, a courtesy customer, a cancelled-but-running account,
and a grace account.

I have not drafted these deliberately. The sentence's whole value is that it sounds
like you rather than like a summary, and five near-identical templates from me is the
wrong starting point. **Draft one and I will fit the other four to it**, or tell me
the shape and I will draft the set.

~~`Q88 — the access label strings`~~ **Answered 15 Aug 2026.** Five strings, both
constants confirmed, and the function is shared with Profile's plan pill with a
~35-character truncation. Carried in §3.6.

~~`Q89 — the sub-route pattern`~~ **Answered 15 Aug 2026.** None exists; every route
is one segment deep. It is a decision rather than a pattern, and it is D39 below.

~~`D39 — where the Manage screen lives`~~ **Resolved 15 Aug 2026.** `/billing/manage`,
the first nested route in the app, with its back behaviour and layout driven rather
than assumed. Carried in §3.3.

~~`The Manage summary sentence`~~ **Signed 15 Aug 2026.** "Update your card or download
receipts. Stripe handles both securely." Carried in §3.3, with one confirmation
outstanding there about whether a "what you're on" line was also intended.
