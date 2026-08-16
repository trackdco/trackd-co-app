Save as: Context/Feature Specs/04-save-offer.md

*(Canonical path. The founder saves these locally as `billing-04 - Save Offer.md`, so
the filename on disk may differ. Cross-spec references are by number — 01, 02a, 04 —
which is unambiguous either way.)*

# Spec: Save Offer

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

**Depends on:** `03-cancel-flow.md`, which guarantees the ordering this spec is built
on top of.

**⚠️ PAIRED WITH `07-notifications.md`, and D1 is RE-DECIDED on what failing the pair
costs.**

The offer's terms line ends "and we'll remind you first." That is a promise, and `07`
is what keeps it. **The release condition is unchanged: a reminder verifiably firing
before a courtesy charge, proven on a Stripe test clock.** The in-app banner and push
are the carrier; Stripe's own email is supplementary and explicitly not the backstop,
because its reminder is configured seven days before a trial end and a trial courtesy
period is seven days long. Q79 is the verification question.

**What changes is the consequence of failing it. This spec still ships.** The earlier
rule, that the sentence and the spec both hold, is withdrawn: the code is built, and
withholding working code over one clause is a worse outcome than withholding the
clause.

**Two strings are withheld behind a flag instead:**

- the terms line's final clause, "and we'll remind you first"
- the accept screen's smaller line, "We'll remind you before that happens."

**⚠️ Both withheld together or neither. Never one.** They are the same promise said
twice, and shipping one without the other leaves a screen that promises a reminder
beside a screen that does not.

**The flag is `REMINDER_PROMISE_ENABLED`**, an environment variable read server-side,
the same shape as the billing gate's switch. **⚠️ UNSET MEANS WITHHELD**, deliberately:
forgetting to set it costs a promise rather than breaks one, which is the only safe
direction for a flag guarding a commitment. It lives at `reminderPromise.ts`, and
**both strings derive from one boolean**, so no calling code can ship one without the
other.

**The withheld terms line still names the charge and the date**, which is all §3.2
requires of it. Nothing about that requirement relaxes.

**Seams:**

- `03` owns the cancel row, the cancel confirmation, and the un-cancel card. **This
  spec carries none of those strings.** It takes over from the moment the
  cancellation is written.
- `08-billing-screen.md` owns the Billing screen's structure. The reopen row renders
  inside the plan block; `08` places, this spec behaves.
- `11-reconciliation-and-alerting.md` inherits the assertion that no subscription
  carrying a courtesy marker has been charged inside the courtesy period.
- `13-billing-analytics.md` owns the offer-shown, offer-taken and offer-declined
  events. This spec adds none.

**⚠️ This is the highest-risk screen in the product.** Accepting the offer LIFTS the
cancellation: the user gets free time and is then billed unless they cancel again.
Somebody arrives here having just pressed cancel, reads the word "free", and is on a
path to being charged. Every decision below is shaped by that.

**Every date and amount on these screens comes from the server**, computed by the
same functions that perform the grant, so the date a user reads is the date they are
charged.

---

## 1. Goal

One offer, once ever, on a real ten-minute clock, that never leaves anybody
uncancelled by accident and never charges anybody who was not told the date.

A user who has just cancelled is offered more time: seven days if they are on a
trial, one billing period capped at a month if they have ever paid. It is claimable
for exactly ten minutes, enforced by the server, with a countdown that means
something. Dismiss it and a way back appears with the same clock still running,
never restarted. Let it run out and it is gone.

The two things that must be true at every instant: **they are already cancelled**, so
every exit from this dialog leaves them cancelled; and **the terms line has named the
charge and the date** before they can accept.

Most of the mechanism is built and most of it is right, including the two decisions
that previously cost real money. This spec adjudicates it, fixes four defects the
implementer's own review surfaced, and builds the parts of the approved design that
do not exist yet.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** move, reword, soften, or fold the terms line into the paragraph above
  it. It sits above the buttons, in its own field, and names the charge and the date.
- **Do NOT** grant free time with a coupon, a discount, a credit, or a price change.
  Time is granted by moving Stripe's `trial_end` and by nothing else. A 100%-off
  coupon discounts a whole invoice, and on the yearly plan an invoice is a year.
- **Do NOT** show the offer before the cancellation is written, or make the offer's
  availability a precondition of cancelling.
- **Do NOT** offer a second one. Not after a decline, not after an expiry, not on a
  second cancellation, not to a customer who has had one on another plan.
- **Do NOT** restart, extend, pause, or refresh the ten-minute clock. Not on reopen,
  not on remount, not on a new session.
- **Do NOT** let the client author, adjust, or re-derive the offer's timestamp.
- **Do NOT** grant anything from the client. `sessionStorage` is a memory aid; the
  server re-checks everything.
- **Do NOT** change the cancel row, the cancel confirmation, or the un-cancel card.
  Those are `03`.
- **Do NOT** add analytics events. `13` owns them.
- **Do NOT** apply `supabase/billing/003_courtesy_until.sql`. Migrations are applied
  by hand by the founder, and the ordering is `12`'s.
- **Do NOT** add an argument to any server action, or accept a subscription id,
  customer id, or offer token from a client.
- **Do NOT** widen the offer to plan switching, discounts, or a "pause" option.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| Extra time granted by moving `trial_end`, never a coupon | **Correct**, and it is the fix that stopped a full year being given away. §3.4 |
| One offer per customer, burning on being SHOWN not on being taken | **Correct.** §3.3 |
| Availability decided by the shown-marker alone, so a second cancellation gets none | **Correct.** §3.3 |
| `readSaveOffer` errs towards NOT offering on error | **Correct**, and the opposite direction from the trial checks, deliberately. §3.3 |
| Trial gets a week, monthly and yearly get a month, unknown falls back to a week | **Correct.** The cap is the mapping. §3.4 |
| Calendar-month arithmetic in UTC with the day clamped to the target month's last day | **Correct.** §3.4 |
| Extension computed from the current end of access, never from today | **Correct.** §3.4 |
| Ten-minute window enforced server-side | **Correct.** §3.5 |
| Countdown anchored on the server's timestamp, cursored by client time | **Correct.** §3.5 |
| `openOfferStore` account-scoped by comparing the stored user id, granting nothing | **Correct.** §3.6 |
| Expiry derived rather than `setState` in an effect | **Correct.** Keep the pattern. §3.5 |
| Concurrency closed by a metadata flag plus a Stripe idempotency key | **Correct in outcome, too broad in scope.** §3.7 |
| `claimExtraTime` mirrors its own grant rather than waiting for the webhook | **Correct.** §3.8 |
| `003_courtesy_until.sql` written, not applied, tolerated on both sides | **Correct.** §3.9 |
| Two server timestamps generated microseconds apart | **Defect.** §3.5 |
| The terms line's dateless fallback | **Defect.** §3.2 |
| The expired-claim message | **Defect.** §3.10 |
| The granted screen's paid variant | **Diverges from approved copy.** §3.11 |
| The gift card, the gift-box mark, Kyle, and the confetti | **Do not exist.** Built here. §3.12 |
| Eligibility on a subscription whose current period is unpaid | **Defect, found by driving. Amended as D70.** §3.3 |

### 3.2 The approved copy, verbatim

**The offer dialog.**

Title:

> One more thing.

Body:

> Thank you for choosing Trackd Co to run your protocol. Before you go, we'd like to offer you another [week|month], free.

The countdown, with the line beneath it:

> yours for the next 10 minutes

**⚠️ The terms line, which is not negotiable, and which sits ABOVE the buttons in its
own field so it cannot be moved, softened, or lost in a paragraph:**

> Your plan carries on as it is. You'll be charged on [date] unless you cancel before then, and we'll remind you first.

**⚠️ With `REMINDER_PROMISE_ENABLED` unset or false, the final clause is withheld and
the line ends at the date** (D1, §0). It still names the charge and the date, which is
all this section requires. The clause is never reworded to hedge the promise. It is
present or it is absent.

Buttons:

> I'd rather cancel

> Another [week|month], thanks

**⚠️ The dateless fallback is deleted.** The built code has a second terms variant
for when no charge date is available: it says the charge comes "when the extra
[period] is up" and names no date. The brief requires this line to name the charge
**and the date**, so a version that cannot is not a weaker acceptable variant, it is
a version that must not render.

**If the charge date cannot be resolved, the offer is not shown at all.** The user is
cancelled — which already happened — and simply sees no offer. That is a strictly
better outcome than a dialog that asks somebody to accept a charge on a date it
cannot name. Delete the fallback string rather than leaving it unreachable.

**After accepting.** Kyle, with a one-shot confetti burst:

> Thank you!

> Enjoy your free [week|month] on us. Your extended trial finishes on [date], and your plan picks up from there unless you choose to cancel.

Smaller and dimmer beneath, **withheld by the same flag and the same boolean as the
terms clause, never independently**:

> We'll remind you before that happens.

Button:

> Back to Trackd Co

**After declining**, a confirmation and never a second ask. **The title branches on
status (D27), the same pattern the approved cancel-confirmation title already uses:**

> Your trial is cancelled

> Your subscription is cancelled

> You'll keep full access to your Pro plan until [date], and you won't be charged. After that your account goes read only. You'll still see everything you've logged, you just can't add to it.

Button:

> Close

The body carries the matching one-word branch already built: a paying customer reads
"you won't be charged again". Between the two, a decliner who has paid never reads
the word "trial" on this screen.

The declined screen is this spec's, not `03`'s. It exists so nobody closes the app
unsure whether cancelling worked, and it changes nothing: the cancellation was
written before the offer was ever looked up.

**No em dash appears in any of these strings.** The mascot is Kyle, a vial, never a
jar. A plan is "your Pro plan".

### 3.3 One offer, burning on being shown

Availability is decided by a single marker on the Stripe **customer**, written at the
moment the cancel path decides to offer. Not when the dialog opens.

**Burning on show rather than on open is deliberate and must not be relaxed.** A
separate "I saw it" call is a request anybody who wanted the offer twice could simply
not make. It also starts the clock, so the marker does two jobs and cannot disagree
with itself.

The write is best-effort: a failure means somebody might be offered it twice, which
is a better outcome than a cancellation that errors because a marketing flag would
not write. **The cancellation must never fail because of anything in this spec.**

Reading it errs the other way and returns "not available" on error, because the cost
of being wrong there is one person not seeing an offer, and the cost in the other
direction is a second free period for somebody who already had one.

**One time each, ever — not one of each.** A customer who took the trial offer and
later pays and cancels again gets nothing. There is no eligibility floor in the other
direction either: somebody who subscribes and cancels ten minutes later still gets
one.

**Which offer they get depends on Stripe's status: `trialing` gets the trial offer,
and a subscription whose current period has actually been paid for gets the period
offer.**

**⚠️ D70, BUILD-LANE AMENDMENT. An unpaid period is not eligible for any offer.**

This clause replaces an earlier sentence in this section which read that the choice
depended on Stripe's status "and nothing else", with anything other than `trialing`
treated as having been paid for. **Driving falsified that premise.** A subscription
that is `past_due`, or in any equivalent open-invoice state, has a current period
nobody paid for, and the period offer's arithmetic anchors to the end of that period.

**Measured: 58 unpaid days granted, and the past-due clawback undone.** A renewal
rolls the period forward and reports active, the charge then fails, and the past-due
handler pulls the entitlement back to the end of the last period actually paid for
plus the grace. **The subscription's own period end stays on the rolled-forward,
unpaid period**, so an offer anchored to it grants free time on top of a month nobody
paid for, and the grant's entitlement write pushes the clawed-back date forward again.
The offer silently reverses a correction built specifically to stop a free month per
failed payment.

**The rule:**

- **The eligibility read returns none, server-side.** Not a smaller offer, not a
  different anchor, not a corrected date. None.
- **The user lands on the ordinary post-cancel decline screen**, which this spec
  already owns and which is correct for them. They are cancelled, they keep what they
  actually paid for, and nothing about their situation is misdescribed.
- **⚠️ Their once-ever offer is NOT burned by the refusal.** They were never offered
  anything. If they settle the invoice and cancel again later, the offer is still
  theirs.

**⚠️ The check runs BEFORE the shown-marker is written, and this is the ordering that
makes the clause work.** The burn-on-show rule above is built and correct as it stands
at `saveOffer.ts:122` and **nothing in this amendment disturbs it**. What the amendment
requires is only that ineligibility is decided first: a check placed after that write
would refuse the offer and consume it in the same breath, which is the precise failure
the not-burned rule exists to prevent.

**Determine it from the invoice, not from the status alone.** `past_due` is the
obvious case and `unpaid` is its sibling, but status is a lagging proxy for what this
rule actually cares about, which is whether the current period has been paid for. **An
unpaid or open invoice against the current period is the discriminator**, with the
statuses as a cross-check rather than the test.

**⚠️ D79, BUILD-LANE AMENDMENT, SAME FAMILY AND SAME ORDERING. A no-expiry comp is
ineligible for any offer, and the refusal does not burn the once-ever flag.**

Found by driving, and the sequence is the reason it matters. **The cohort had just
read "your free access carries on as it always has" on the cancel confirmation, and
was then offered another week free.** Accepting would have lifted their cancellation
and re-armed a real charge, on a person promised in writing that they would never be
charged.

**The same three clauses as D70 apply unchanged:** the eligibility read returns none
server-side, the user lands on the ordinary post-cancel decline screen, and **the
once-ever flag is not burned**, because they were never offered anything.

**⚠️ The same ordering constraint applies too: the check runs BEFORE the shown-marker
is written.** A no-expiry comp has nothing to be retained by and nothing to be charged
for, so an offer is not merely wasteful here — it is the one screen in the product that
can turn "never" into a charge.

**⚠️ The seam is now ruled as D75:** `11` asserts that no courtesy marker exists on a
subscription that was unpaid at the moment of the grant. **This clause prevents the
state; that assertion catches a regression reintroducing it.** The two are not
redundant, and this is the class of failure that has always been silent on this
project.

### 3.4 The grant, and the two decisions that stopped it costing money

**Time is granted by moving `trial_end`.** It is the only mechanism that means "this
period is free" exactly, and it works identically on weekly, monthly and yearly. A
100%-off coupon discounts an invoice, and on the yearly plan an invoice is a year —
which is how $69.99 was given away once already.

**The period is capped at a month by the mapping, not by a comparison.** A trial gets
a week whatever plan sits behind it, because a trial is seven days long regardless.
Monthly and yearly both get a month. Weekly gets a week, because a month would be
four times what they pay. An unknown or missing interval falls back to a week, which
is the cheaper direction and is the correct way to be wrong.

**A yearly subscriber never gets a free year.** There is no arithmetic that could
produce one: yearly maps to month.

**⚠️ And the anchor below is only sound because D70 in §3.3 removes the case where it
is not.** Computing from the current end of access is right for a paid period and wrong
for an unpaid one, and the difference is invisible in the subscription object itself.
D70 is what keeps the next paragraph true.

**A month is a calendar month, in UTC, with the day clamped to the target month's
last day**, so the 31st of January becomes the 28th of February rather than rolling
into March.

**The extension is computed from the current end of access, never from today.**
Somebody who cancels on day one of a seven-day trial is given a fourteen-day trial,
not sent back to day eight. Computing from now would shorten the access of anybody
who cancelled early, which is a punishment dressed as a gift.

**The grant also lifts the cancellation**, sets no proration, and writes the courtesy
marker onto the subscription's metadata, merged so the user id survives.

### 3.5 The ten minutes, and the one defect in it

The window is enforced on the server. The countdown on screen is a display of that
rule and never the rule itself: a tab left open, a replayed request, or a hand-rolled
call all arrive at the server and are refused exactly when the clock said they would
be.

The countdown anchors on the server's timestamp and cursors on client time, so a
device with a skewed clock shows a wrong countdown and the server still enforces the
real window. Skew fast and the button disappears early; skew slow and the claim comes
back refused. Both are acceptable; the reverse would not be.

**The expiry is derived, not `setState` in an effect.** When the clock reaches zero
with the dialog open, it becomes the acknowledgement rather than leaving a button the
server would refuse. Keep that pattern: an effect that sets state on a value changing
once a second is a cascading render once a second, and the lint rule forbidding it is
right.

**⚠️ Defect: two timestamps, not one.** The value returned to the client and the
value written to Stripe's metadata are generated by two separate calls to the clock,
in two different modules, separated by a round trip to Stripe. They are not the same
instant. At a ten-minute window the divergence is harmless in practice, but the claim
that the clock on screen is the clock the server enforces is currently a description
of intent rather than of the code.

**Fix it by generating the instant once** and passing it to both the marker write and
the returned offer. Then the sentence is true, and a cold reviewer reading the two
does not have to work out whether it matters.

### 3.6 Dismissal, recovery, and why the store grants nothing

A dismissed offer can be reopened, with the same clock, still counting from the
server's timestamp, never restarted. The reopen row renders inside the plan block so
the countdown appears where the plan does rather than as a separate surface.

The remembered offer lives in `sessionStorage` under a fixed key, with the user id
stored **inside** the value and a mismatch rejected on read. One browser holds at most
one remembered offer, and a second account signing in sees an entry that fails the
identity check and is shown nothing. That is correct: the store is a memory aid, it
grants nothing, and the server re-checks the marker on every claim.

**It is remembered before the dialog opens**, so an offer dismissed in its first
second is still recoverable.

**A stale entry is left alone deliberately.** The identity and time checks reject
anything unusable on the way out, so cleaning it up would be a write whose only
effect is to save a comparison.

### 3.7 Concurrency, and narrowing a key that is too broad

Three guards cover three different windows and all three are needed.

A client-side in-flight ref closes the same-tick double tap, because the transition's
pending flag has not committed within that tick — two clicks at a zero-millisecond
gap sent two requests before it existed.

A claimed-marker on the customer closes the sequential case: coming back tomorrow and
asking again.

A Stripe idempotency key closes the concurrent case, which the marker cannot: two
requests both read "not claimed" before either writes, and Stripe metadata has no
compare-and-swap. Both compute the same new `trial_end` from the same current value,
send an identical body under the same key, and Stripe applies it once.

**⚠️ The key is scoped to the user and Stripe keys live twenty-four hours, which is
broader than the thing being made idempotent.** A user who claims, un-cancels,
cancels again and claims again inside a day meets a replayed response rather than a
fresh grant. The outcome is still correct, because the claimed-marker refuses them
first — but the ordering is not what makes it correct, and a guard that is right by
accident is one refactor away from being wrong.

**Narrow the key to the attempt**, by including the subscription and the offer's
server timestamp alongside the user. Two concurrent claims on the same attempt still
compute an identical key and still dedupe, because both read the same timestamp from
the same metadata. A different attempt is a different key.

### 3.8 The mirror is written by the claim, not left to the webhook

The claim writes the mirror itself rather than waiting for the webhook. That is
correct and must stay: a review measured the dialog saying one date while the
entitlement still held the old one. Usually the webhook lands a second later; when it
does not, the user goes read-only on the old date having been told in writing they
had another week.

### 3.9 The unapplied migration, and why the tolerance is two different mechanisms

`supabase/billing/003_courtesy_until.sql` adds one column so a paying customer on a
free period is not described to themselves as a first-time trialist. Moving
`trial_end` puts Stripe's status into `trialing` for the free stretch, and without the
column a two-year subscriber reads as somebody who has never paid.

**It is written and not applied, and this spec does not apply it.** The founder
applies migrations by hand, and per D10 this one is applied **before** the re-land
deploy, sequenced in `12-go-live.md`.

**The code must be correct in the window where it is not applied, and it already
is** — through two different mechanisms, because the two sides fail differently:

- **Reading** uses a separate tolerant query rather than folding the column into the
  page's main select. **⚠️ A column added to a select breaks the ENTIRE request if
  the migration is not applied**, so folding it in would take down the whole billing
  screen for one unknown column.
- **Writing** retries without the column. **⚠️ An unapplied migration reports
  `PGRST204` on a write and `42703` on a read**, because PostgREST validates the
  request body against its own schema cache before Postgres sees the statement. Code
  that handles only one of the two has already caused a payment path to fail closed
  on this project. The existing check handles both plus the column name in the
  message; keep all three.

Unapplied, the entire observable effect is one word on one screen for one kind of
customer. The Stripe metadata is still written and is the source of truth.

### 3.10 Defect: the expired claim tells the user the wrong thing

A claim arriving after the window returns a reason the server distinguishes and the
message collapses: expired, never-offered and outright failure all render as
"We couldn't add the extra time just now." That reads as transient and invites a
retry that will also fail.

It is nearly unreachable, because the client flips to the acknowledgement the moment
its own countdown hits zero, so the button is gone before the server would refuse.
The path opens only under clock skew, a replayed request, or a hand-rolled call —
which is exactly what the server check exists for, and exactly the user who most
deserves an honest answer.

**Plumb the reason through and say the offer has expired.** Signed off as D23 and
carried as decided, on the expiry branch only:

> Your offer has expired. Your cancellation still stands and nothing has been charged.

The two reassurances are the point: somebody reaching this branch has just been
refused something they thought they had, and the only things they need to know are
that their cancellation is intact and that no money moved.

### 3.11 Divergence: the granted screen's paid variant

The approved line is written for a trial: "Your extended trial finishes on [date]".
The built paid variant substitutes the plan, producing "Your plan finishes on
[date]", which tells a paying customer their plan is ending on the screen
congratulating them for staying.

Signed off as D24 and carried as decided. **The noun follows the granted period
rather than the plan:**

> Enjoy your free month on us. Your free month finishes on [date], and your plan picks up from there unless you choose to cancel.

The trial variant keeps the approved line unchanged.

**Design note, and it explains why this screen is warm rather than transactional.**
The offer's purpose is re-habituation, not a parting gift: the free period exists to
get somebody back into the app, using it again. That is why the accept screen thanks
them properly, why the charge date was named in the terms line *before* they could
accept it, and why the reminder before that charge is load-bearing rather than
courteous. The warmth is only honest because the disclosure came first and the
reminder follows. Remove either and this screen becomes something else.

**The dateless fallback on this screen is also deleted.** The built code falls back to
"is extended" with no date when the grant's end date is missing. The grant has already
happened by then, so refusing to render is not an option — instead, the end date is
required on a successful grant, and the type must make a success without one
impossible to express. A grant that cannot say when the free time ends is a bug, not a
display case.

### 3.12 What does not exist yet

**The gift card.** A card showing what they get, the date, and the amount, with **a
gift-box mark, not a tick** — a ticked circle looks like something you can untick, on
the one screen where a mis-tap has a price. Follow `Context/ui-context.md` for the
card's treatment; do not add anything to its exception list.

The amount shown is zero, **and it is written "$0.00 USD" (D25)**. The house rule
that the currency is always named on screen wins over the approved line's shorter
form, because the gift card sits inches from a terms line naming a real charge in USD
and two amounts formatted differently on one screen is exactly what a reviewer
notices.

**Kyle and the confetti on the accept screen.** The mascot lives at
`public/onboarding/kyle-thumbs.png` and is rendered through the existing mascot
component; the confetti component already exists, fires one shot, is
`pointer-events-none`, and collapses to nothing under `prefers-reduced-motion`.
Nothing in the billing components imports either today.

**⚠️ There is a standing warning in this codebase against exactly this, and it must
be answered rather than ignored.** The beta notice restricts confetti to its gift
variant, on the reasoning that confetti over a screen telling somebody they are about
to be charged is the worst thing that screen could do. This screen is followed by a
charge.

**It ships anyway, and the reason is specific:** the terms line named the charge and
the date *before* the user accepted, and the quiet line under the celebration repeats
that a reminder is coming. The confetti celebrates the free time they just accepted,
not the charge that follows, and they were told about the charge first. A cold
reviewer will flag this; the answer is this paragraph.

**The reopen row's label** is signed as built (D26):

> Your extra {week|month} is still here

with the countdown to its right and "yours for the next 10 minutes" beneath.

### 3.13 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** The terms line names
  the charge and the date before acceptance is possible, and §3.2 removes the variant
  that could not. §3.11 removes the dateless success case. The pair with `07` is what
  makes "we'll remind you first" true.
- **The cancellation is written before the offer exists, always.** This spec never
  reorders that, and §3.3 keeps the marker write best-effort so it can never fail a
  cancellation.
- **No user holds more than one billable subscription at any moment.** The grant
  updates the existing subscription and creates nothing.
- **Cancelling never revokes access already paid for.** The extension is computed
  from the current end of access, so accepting can only ever move it later.
- **Access is decided by entitlements and nothing else.** The claim writes the mirror
  and the entitlement through the ordinary sync path; the dialog gates nothing.
- **A server action never accepts an identifier saying whose data to act on.** Every
  action here takes nothing, or takes no identifier. The offer's timestamp is read
  from Stripe's metadata, never from the client. **⚠️ Every export of a `"use server"`
  module is a publicly dispatchable HTTP endpoint.**
- **A screen never states a price, date or promise the server would contradict.** The
  charge date is computed by the same functions that perform the grant, and the
  countdown is a display of a rule the server enforces independently.

### 3.14 If this goes wrong after go-live

Do not invent a recovery story. `BILLING_GATE_ENABLED=false` restores write access
without a deploy but stops no charge; stopping charges means cancelling at Stripe by
hand; there is no in-app control to fix an individual's subscription and no support
tooling. The runbook is §9e of the founder's brief, carried in `12-go-live.md`. Refer
to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Commit, then adjudicate.**
The save offer is currently uncommitted and partly untracked. Commit it to
`wave3/billing-cancel` before touching anything. Then read the offer module, the
store, the dialog and the claim action against §3.1's table and record confirmed or
diverged per row.
*Verify before moving on:* a clean `git status`, and a written line per row.

**Step 2 — One timestamp.**
Generate the offer's instant once and pass it to both the marker write and the
returned offer, so the clock on screen and the clock the server enforces are the same
value rather than two values taken moments apart.
*Verify before moving on:* the metadata's stored instant and the value the client
receives are byte-identical.

**Step 3 — Delete the dateless terms fallback.**
Remove the variant that names no date, and make an unresolvable charge date mean the
offer is not shown at all. The user is already cancelled, so showing nothing is a
complete and correct outcome.
*Verify before moving on:* force an unresolvable date and confirm the cancellation
succeeds, no offer renders, and nothing errors.

**Step 4 — Narrow the idempotency key.**
Include the subscription and the offer's server timestamp alongside the user, so the
key identifies the attempt rather than the user-day. Two concurrent claims on the
same attempt must still dedupe.
*Verify before moving on:* two claims in the same tick produce one grant; a claim,
un-cancel, cancel and claim inside twenty-four hours produces a fresh evaluation
rather than a replayed response, and is still refused by the claimed-marker.

**Step 4b — Refuse an unpaid period, without burning the offer.**
Per D70 in §3.3. The check sits **before** the shown-marker is written, and it reads the
current period's invoice rather than trusting the status.
**⚠️ Verify flag safety explicitly**: after a refusal the customer's metadata carries
no shown-marker, and a later cancellation once the invoice is settled still offers.
*Verify before moving on:* drive a past-due cancellation on a test clock and confirm no
offer, no marker, the decline screen, and the entitlement date unchanged from what the
past-due handler set.

**Step 5 — Plumb the expired reason through.**
Distinguish expiry from the catch-all and render D23's decided string.
*Verify before moving on:* an expired claim forced through a skewed clock renders the
honest message and does not invite a retry.

**Step 6 — Build the gift card.**
Follow `ui-context.md`. A gift-box mark, never a tick. Show what they get, the date,
and the amount as "$0.00 USD".
**⚠️ Nothing amber may be a button, a tab, or a call to action on this dialog.**
*Verify before moving on:* rendered at 390x844 and 320x568, with the terms line still
above the buttons and everything reachable without scrolling.

**Step 7 — Build the accept screen: Kyle and the confetti.**
Use the existing mascot component and the existing confetti component. One shot,
`pointer-events-none`, collapsing to nothing under `prefers-reduced-motion`.
*Verify before moving on:* the burst fires once, cannot be re-triggered by a
re-render, and disappears entirely under reduced motion.

**Step 8 — Apply the branching copy: D24 and D27.**
The granted screen's noun follows the granted period for a paying customer and keeps
the approved line for a trialist. The declined screen's title branches on status.
*Verify before moving on:* a paying customer never reads the word "trial" on either
screen, and a trialist reads the approved lines unchanged.

**Step 9 — Prove the offer cannot be had twice.**
Decline it and cancel again. Let it expire and cancel again. Take it, resume, cancel
again. Take it on a trial, then pay, then cancel.
*Verify before moving on:* exactly one offer per customer across all four.

**Step 10 — Prove the ten minutes.**
Claim at nine minutes and at eleven. Dismiss at two minutes and reopen at eight, with
the countdown continuing rather than restarting. Leave a tab open past the window and
claim. Skew the device clock both ways.
*Verify before moving on:* the server's answer governs in every case.

**Step 11 — Drive the full lifecycle on a test clock.**
Trial cancel, offer, accept, courtesy period, the reminder firing, the charge, then
cancel again with no offer. Then the same from a paid subscription. Then the yearly
plan specifically, confirming a month and never a year.
**⚠️ Verify the courtesy period behaves correctly with `003` UNAPPLIED as well as
applied.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ Clean up Stripe objects BEFORE deleting a test user.**
**⚠️ `http://127.0.0.1` does not hydrate.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The whole flow works with `003` UNAPPLIED, and the only difference is the plan
      label on one screen
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`, including the
      confetti
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] `pointer-events-auto` is still on the dialog's backdrop

The ordering, which nothing here may weaken:

- [ ] Declining leaves the user cancelled
- [ ] Escape leaves the user cancelled
- [ ] A backdrop tap leaves the user cancelled
- [ ] Closing the tab mid-dialog leaves the user cancelled
- [ ] Losing the connection mid-dialog leaves the user cancelled
- [ ] A failure writing the shown-marker still leaves the cancellation successful

One offer, ever:

- [ ] Declining burns it: a second cancellation offers nothing
- [ ] Letting it expire burns it: a second cancellation offers nothing
- [ ] Taking it burns it: cancelling again offers nothing
- [ ] A customer who had the trial offer and later pays and cancels gets nothing
- [ ] Somebody who subscribes and cancels ten minutes later still gets one

Ineligible cohorts (D70 and D79, §3.3):

- [ ] **A no-expiry comp is offered NOTHING on cancellation**, and the refusal writes
      no shown-marker
- [ ] Driven from the cancel confirmation that tells them their free access carries on,
      confirming no offer follows it

An unpaid period (D70, §3.3):

- [ ] A `past_due` subscription is offered NOTHING on cancellation
- [ ] The same for any subscription whose current period carries an unpaid or open
      invoice, whatever its status reads
- [ ] **The refusal writes no shown-marker**, verified by reading the customer's
      metadata afterwards
- [ ] After settling the invoice, a later cancellation DOES receive the offer
- [ ] The user sees the ordinary decline screen and nothing about an offer
- [ ] **The entitlement date after the refusal is exactly what the past-due handler
      set**, with no free days added and no clawback undone
- [ ] Driven on a test clock through renewal, failed charge and cancellation — the
      sequence that produced the 58 unpaid days

The clock:

- [ ] A claim at nine minutes succeeds; at eleven it is refused by the server
- [ ] Dismissing at two minutes and reopening at eight shows roughly two minutes
      remaining, not ten
- [ ] The countdown never restarts, on reopen, remount, refresh, or a new session
- [ ] A device clock skewed fast hides the button early and the server still agrees
- [ ] A device clock skewed slow shows the button and the claim is refused with the
      honest message
- [ ] The instant in Stripe's metadata and the instant the client received are
      identical

The money:

- [ ] A trial cancel offers a week; the grant moves `trial_end` by seven days from
      the current trial end
- [ ] A weekly plan offers a week, a monthly plan a month, **a yearly plan a month
      and never a year**
- [ ] A subscription with an unknown interval falls back to a week
- [ ] Cancelling on day one of a trial produces a fourteen-day trial, not day eight
- [ ] A grant on the 31st lands on the last day of the target month, not the 3rd of
      the next
- [ ] No coupon, discount, credit or price change exists anywhere in the grant path
- [ ] The courtesy marker is written on the subscription and the user id survives the
      merge
- [ ] The mirror is written by the claim, not left to the webhook, and the entitlement
      date matches what the screen said

The words:

- [ ] Every string in §3.2 renders character for character
- [ ] The terms line sits ABOVE the buttons and names the charge and the date
- [ ] No dateless terms variant exists anywhere in the codebase
- [ ] No em dash appears anywhere in this flow
- [ ] The gift card carries a gift-box mark and not a tick
- [ ] Kyle is a vial and is never called a jar
- [ ] The declined screen never asks a second time
- [ ] A paying customer who declines never reads the word "trial" on that screen,
      in the title or the body
- [ ] The gift card's amount reads "$0.00 USD"

Concurrency and attacks:

- [ ] Two claims in the same tick produce one grant
- [ ] Cancel and claim issued together converge
- [ ] Claim and resume issued together converge
- [ ] Double taps in the same tick produce one request
- [ ] Every action refuses an anonymous caller and another signed-in user
- [ ] A forged offer timestamp, subscription id, or customer id is refused
- [ ] A second account on a shared browser is shown no offer belonging to the first

The pair with `07`:

- [ ] **A reminder verifiably fires before a courtesy charge, proven on a test
      clock.** This releases `REMINDER_PROMISE_ENABLED`, not this spec: this spec
      ships either way
- [ ] With the flag unset, **both** promise strings are absent, and the terms line
      still names the charge and the date
- [ ] With it set, **both** are present
- [ ] No configuration produces one without the other, and both derive from one
      boolean
- [ ] Q79 answered by observation: whether Stripe's own trial-ending email fires for
      a moved `trial_end`, and what it does when the courtesy period is seven days or
      shorter
- [ ] The reminder's copy does not describe a two-year customer's courtesy month as a
      trial

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

4. **Migrations are written, never applied.** This spec produces no new SQL and does
   not apply `003`. If the work turns out to need any, it stops and asks rather than
   writing one, and any file it eventually produces opens with a ▶ HOW TO RUN THIS
   block and ends with a VERIFY block that returns rows, for the founder to apply by
   hand.

---

## 7. Open items

No founder decisions outstanding. One verification question remains, and it governs
this spec's release.

~~`D23 — the expired-claim message`~~ **Resolved 15 Aug 2026.** "Your offer has
expired. Your cancellation still stands and nothing has been charged." Carried in
§3.10.

~~`D24 — the granted screen for a paying customer`~~ **Resolved 15 Aug 2026.** The
noun follows the granted period, not the plan. Carried in §3.11, with the
re-habituation design note that explains the screen's tone.

~~`D25 — the currency on the gift card`~~ **Resolved 15 Aug 2026.** "$0.00 USD".
Carried in §3.12.

~~`D26 — the reopen row's label`~~ **Resolved 15 Aug 2026.** Signed as built: "Your
extra {week|month} is still here." Carried in §3.12.

~~`D27 — the declined screen's title`~~ **Resolved 15 Aug 2026.** Branches on status,
matching the approved cancel-confirmation title. Carried in §3.2.

**`AMENDED — D79, a no-expiry comp is ineligible.`** Build-lane amendment, found by
driving. Seated in §3.3 beside D70, sharing its three clauses and its ordering
constraint.

**`AMENDED — D70, an unpaid period is ineligible.`** Build-lane amendment, found by
driving. **Seated in §3.3**, replacing the sentence it falsified, with the
burn-semantics sub-clause and the flag-safety verification. **Its recommended seam is now ruled as D75**, owned by `11`.

**`RE-DECIDED — D1, what failing the pair costs.`** The release condition is
unchanged; the consequence is not. This spec ships regardless, with two strings
withheld behind `REMINDER_PROMISE_ENABLED`, together or not at all. Carried in §0 and
§3.2.

**`Q79`** — whether Stripe's trial-ending email fires for a `trial_end` moved
mid-cycle, and what happens when the courtesy period is seven days or shorter, given
the email is configured seven days before trial end. Answerable only on a test clock.
It does not block construction, and under the re-decided D1 it no longer blocks
release either: it decides whether the promise ships, not whether the spec does.

**Also carried, not a decision:** the built decline screen's " again" branch for a
paying customer is kept, and D27 now completes the pair at the title.
