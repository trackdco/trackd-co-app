Save as: Context/Feature Specs/01-trial-eligibility.md

# Spec: Trial Eligibility

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

**Depends on:** nothing. This is the first spec in the build order.

**⚠️ SHIP-TOGETHER TRIPLE — this spec, `02a-paid-today-checkout.md` and
`02b-checkout-copy-and-disclosure.md` ship together or not at all.**

The three are one change wearing three names:

- This spec decides who gets free days. That decision makes the current
  checkout copy false for a returning customer, which `02b` fixes.
- This spec routes a beta-grace user onto a working payment path and leaves a
  returning customer on the broken one. That broken path is `02a`.
- Shipping this alone means the app makes a written promise on a payment screen
  that the server contradicts, or offers a button that cannot succeed. Neither
  is acceptable on a screen that takes money.

**Blocks:** `02a`, `02b`, `06-beta-grace-and-notices.md` (which relies on the
mid-grace rule below), `15-plan-switching.md` (which implements the carry-over
rule this spec defines).

**Contains no user-facing copy.** Every string on the checkout screen belongs to
`02b`. Nothing in this spec should add, change, or restate one. Where behaviour
here changes what a screen must say, this spec says so and stops.

**Every number and date this spec hands to a screen comes from its server-side
source and is passed as raw data, never as a formatted string.** `BETA_GRACE_DAYS`
comes from `lib/billing/betaGrace.ts`; a grace end date comes from
`entitlements.active_until`; a trial end comes from Stripe. The consuming screen
formats it. This is what keeps a screen from stating a date the server would
contradict.

---

## 1. Goal

One free trial per user, ever, and nobody is charged inside a period they were
told was free.

Three rules decide it, and they are the founder's, not open questions. A user
gets exactly one seven-day trial in their lifetime, not one per plan and not one
per subscription. A trial counts as used only if a card actually validated on it,
so an abandoned 3D-Secure challenge never burns a genuine first-timer's trial. And
the ~85 beta accounts who receive a fourteen-day grace when billing switches on do
not also get a trial, because that fortnight is their trial.

From the user's side, "working" looks like four different people getting four
correct answers from the same screen. A new user gets seven free days. A user
whose bank challenge timed out last Tuesday still gets seven free days. A user who
already had a trial is charged today and is told so. And a beta user who decides
mid-fortnight to set their plan up early is charged nothing until their fortnight
actually ends, on the date they were given in writing.

The last of those does not work today and is the reason this spec is more than a
review. It is specified in §3.4.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** change any string on the checkout screen, the paywall, or any other
  screen. Copy belongs to `02b`. If a behaviour here makes a string wrong, note it
  and leave it.
- **Do NOT** build the PaymentIntent / `confirmPayment` path for a user who is
  charged today. That is `02a`, and it ships alongside this. This spec must not
  half-build it.
- **Do NOT** build any plan-switch, upgrade, or downgrade control. §3.6 defines
  the carry-over rule; `15-plan-switching.md` implements it.
- **Do NOT** change `track("trial_started", …)` or add analytics events. It
  currently hardcodes `days: TRIAL_DAYS`, which is wrong for a paid-today
  subscribe. `02a` owns that; `13-billing-analytics.md` owns events.
- **Do NOT** persist a "this user has used their trial" marker in any column,
  metadata key, or table. It is derived from Stripe at read time and must stay
  derived. See §3.2.
- **Do NOT** change `hasValidatedCard`'s treatment of a refunded but previously
  active subscription. It counts as a used trial and that is correct: the trial was
  genuinely started. A refund is a support decision, not a trial reset.
- **Do NOT** gate access on `trialEligibility()`. Its `reason` is copy and nothing
  else. Access is decided by entitlements alone.
- **Do NOT** add an argument to `trialEligibility()`, or any argument to any server
  action that identifies whose data to act on.
- **Do NOT** touch the read-only gate, the entitlement writers in
  `lib/billing/sync.ts`, the save offer, the cancel flow, or the notification
  runner. Each has its own spec.
- **Do NOT** run the beta-grace backfill route. It is hand-run and belongs to `06`.
- **Do NOT** set `BILLING_GATE_ENABLED`. Turning the gate on before entitlement
  rows exist puts all 90 real accounts into read-only overnight.
- **Do NOT** change `COMP_EMAILS`, or move an address between it and
  `FOUNDER_EMAILS` in `lib/admin.ts`. They are deliberately different lists with
  different meanings.
- **Do NOT** change the Billing screen's plan label. §3.4 creates a new case for
  it; `08-billing-screen.md` decides what it reads.
- **Do NOT** widen anything in `lib/db/admin/` to return a row.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** merge anything to `main`. Nothing reaches `main` without the
  founder's explicit word, and the re-land route is a revert, not a merge — see
  `12-go-live.md`.

---

## 3. Design Decisions

### 3.1 What was already built, and what the verdict is

Five pieces of this were built before this spec existed. Four are correct and need
verifying, not rewriting. One is wrong.

| Built | Verdict |
|---|---|
| `hasUsedTrial` tests "did a card ever validate", not "did it have a trial_end" | **Correct.** Keep exactly as is. §3.2 |
| `hadBetaGrace` identifies the grace as `source: "comp"` with a non-null `active_until` | **Correct.** Keep. §3.3 |
| Both checks err towards granting on any error | **Correct.** Keep, and pin it with a test. §3.5 |
| `trialEligibility()` takes no arguments and resolves identity from the session | **Correct.** Keep. §3.7 |
| `startTrial` omits `trial_period_days` for a beta-grace user, so they are charged today | **Wrong.** It charges inside a fortnight the app promised in writing. §3.4 |

### 3.2 One trial per user, and why nothing records it

The used-trial fact is not stored anywhere. There is no column, no Stripe metadata
key, and no flag. It is derived on every call by listing the customer's Stripe
subscriptions and asking whether any of them carried a `trial_end` **and** had a
card validate on it.

Keep it that way. The obvious version — "does any subscription have a
`trial_end`" — is wrong in the expensive direction, because `startTrial` itself
creates and then cancels subscriptions during an abandoned card attempt, and every
one of those carries a `trial_end` and took nothing. Storing a marker would have
the same failure: something has to decide when to write it, and the only honest
moment to write it is the moment a card validates, which is exactly what the
derived check already asks. A marker adds a second source of truth that can
disagree with Stripe, and Stripe is where the money is.

The consequence to hold on to: a customer's trial history lives in Stripe, so a
Stripe outage means the question cannot be answered. §3.5 covers which way that
fails.

### 3.3 The beta grace, and how it is recognised

A beta-grace account is an `entitlements` row with `source = 'comp'` and a non-null
`active_until`. Nothing else in the system produces that shape: a comp with no
expiry is free-for-life, and a real subscription writes `source = 'stripe'`. No
new column and no new enum value is needed, which matters because an enum value is
a migration and this has to stay one statement the founder can run on the day.

The check reads whether the grace is still active or not, deliberately. The
question it answers is "have they already had their free run", and an expired
grace is exactly somebody who has.

**⚠️ The query that answers this selects `source` and `active_until` from
`entitlements`. Both columns exist and are applied. Do not add a column to this
select. A column added to a select breaks the entire request if its migration is
not applied, and this request decides whether somebody is charged today.**

### 3.4 A beta-grace user who subscribes mid-fortnight is never charged inside the fortnight

**This is the behaviour change in this spec, and it is the money-critical one.**

Today, a user still inside their fourteen days who reaches checkout has
`trial_period_days` omitted, so Stripe issues an invoice with an amount due
immediately. The app told them in writing they had until a named date. Charging
them before it violates the first invariant outright.

**The rule.** When an account holds a **live** beta grace — a `comp` entitlement
with an `active_until` still in the future — the subscription is created with
`trial_end` set to that grace end, rather than with `trial_period_days`. Their
first charge falls on the date they were given, and not a moment before.

Four consequences, all of which have to be stated because none is obvious.

**It also fixes the broken button.** A subscription with nothing due today gets a
SetupIntent, which is the arm the client is built for. A subscription with an
amount due today gets a PaymentIntent, which the client cannot confirm — the whole
paid-today path errors out. Aligning to the grace end keeps a mid-grace user on the
working arm. This is a real benefit but it is not the justification: the
justification is that we said they would not be charged.

**Stripe has a minimum acceptable `trial_end` offset**, so a user on the last hours
of their fortnight may have less remaining than Stripe will accept. When the
remaining grace is shorter than that minimum, set `trial_end` to the earliest value
Stripe will accept, never to a value earlier than the grace end. The user gets a few
free hours more than promised, which costs nothing and cannot break the promise.
Erring long here is the same direction the rest of this file errs.
**The constant is `STRIPE_MIN_TRIAL_END_OFFSET`, 48 hours**, with a comment citing
Stripe's documented `trial_end` minimum. Step 6 verifies the real boundary
empirically in test mode, and **48 hours is kept as the clamp regardless of what the
observation shows** — a margin on the safe side of a documented minimum costs a beta
user a few free hours and costs nothing else.

**It writes a marker, because three different things now produce `trialing`.**
Stripe reports `trialing` for a real trial, for a save-offer courtesy period
(marked `trackd_courtesy_until`), and now for a grace-aligned start. Write
`trackd_grace_until` into the subscription's metadata, as an ISO instant, merged
into the existing metadata so `user_id` survives. Without it, nothing downstream can
tell a first-time trialist from a beta user finishing their fortnight, and
`11-reconciliation-and-alerting.md` needs exactly that distinction to assert that
nobody was charged inside a promised free period.

**It creates a second entitlement row for the overlap.** The user holds their comp
row until the grace end and a new `stripe` row from the same instant. Both expire
together and the subscription then renews, so access is continuous;
`strongestEntitlement` picks between them. This must be verified at the boundary
rather than assumed, and it is one of the Check When Done items below.

**What it changes on a screen, which this spec does not decide.** During the
residual grace the user's subscription is `trialing`, and the Billing screen's
current rule reads `trialing` as "Free trial". They are not on a trial. What the
label should read is `08-billing-screen.md`'s call, and `02b` owns the checkout
subtitle for a mid-grace user, which is a sanctioned draft under Rule 1 because the
approved line ("Your plan starts from today") is false for this person.

### 3.5 Which way each check fails, and why it is the right way

Every check in this area errs towards **granting** free time. That is deliberate
and must not be tidied into consistency.

Being wrong in the generous direction costs seven days. Being wrong in the other
direction charges a first-time customer immediately, on a screen that just promised
them seven free days, which is a chargeback — and dispute rate is the number that
closes payment processor accounts.

So: a Postgres error reading the grace grants the trial. A failure deciding
eligibility at all returns the generous default. The client's initial state before
the server answers is the generous one, and a failed call keeps it.

**One asymmetry is correct and must survive.** If Stripe cannot be reached,
`trialEligibility()` falls into its outer catch and the screen promises a trial,
while `startTrial` returns an error and the button fails. The screen is generous
and the money path refuses. That is the right pair: a screen that over-promises
and a server that will not charge is a bad minute; a screen that over-promises and
a server that charges is a dispute. Pin it with a test so nobody "fixes" it into
symmetry.

### 3.6 The carry-over rule, defined here and implemented in spec 15

Switching plans during a trial carries the remaining days across. Weekly on Monday,
yearly on Tuesday, is five days left — not a fresh seven and not zero.

There is no plan-switch control in the app, so today this rule has no surface. It
is written down here so that `15-plan-switching.md` implements a decided rule
rather than inventing one, and so that nobody implements a fresh trial by accident
in the meantime.

**What must not be mistaken for a switch.** A user with an abandoned attempt on
one plan who returns and picks another has the abandoned one cancelled and the new
one created with a full seven days. That is correct and must not be "fixed" into
carry-over: no card ever validated on the abandoned attempt, so no trial was ever
used, so there is nothing to carry. A user who *has* validated a card is refused
with `already-subscribed` and never reaches the create call at all.

**Resolved, 15 Aug 2026 (Q65, D14).** The Stripe customer portal has both
`subscription_cancel` and `subscription_update` turned OFF in test mode. The portal
offers payment-method update and invoice history only, so there is no plan-switch
surface anywhere and no second cancel route wearing Stripe's wording. Cancelling
happens only through the in-app flow; plan switching ships as `15-plan-switching.md`,
in-app, with the carry-over rule above. **⚠️ The live-mode portal is a separate
configuration and both toggles must be verified OFF there before go-live —
`12-go-live.md` owns that check.**

### 3.7 A comp account must never be able to start a subscription

A free-for-life comp holds an entitlement with a **null** `active_until`, so the
grace check does not match it and they read as a brand-new user eligible for a
seven-day trial. There is no route to checkout for them today — the comp notice has
a single "Thank you" button and the read-only pop-up cannot fire for an account
that is permanently entitled — but "currently unreachable" is not a guarantee, and
the outcome if it is ever reached is charging somebody who was told in writing they
would never be charged.

`startTrial` refuses. An account holding a non-expiring comp entitlement returns
`already-subscribed`, which the checkout screen already handles by walking the user
into the app. No new status, no new copy, no new screen.

**⚠️ D71: a comp-list member who signs up AFTER the backfill is granted their comp at
signup, server-side.** The backfill runs once by hand and only ever sees accounts that
already exist, so a comped friend who creates their account the following week would
otherwise be an ordinary new user with an ordinary trial and an ordinary charge at the
end of it. The grant happens on the authenticated paths themselves rather than being
left to a later sweep, from the same closed comp list.

**The go-live runbook's check stays as a second line of defence.** Two independent
mechanisms for a five-person list is cheap, and the failure it guards against is
somebody being charged who was promised in writing they never would be.

**⚠️ D77: a comp refused a trial must not be congratulated on one.** The welcome
screen read "You're in! 7 days on us." to a free-for-life member. **The trial line is
suppressed entirely, with no replacement copy** — there is nothing to announce, and
inventing a line for the occasion would be writing new copy for a screen that already
says everything true about their position.

**This is a decision, not an oversight, and `001_billing_tables.sql` says the
opposite.** That file's comment on `entitlements_one_per_source` explicitly
anticipates "a founder who also subscribes" as a legitimate reason a user might
hold both a `comp` and a `stripe` entitlement at once. The schema still permits
it; this rule forecloses it at the application layer, because the cost of a comp
being charged is worse than the cost of a comp being unable to buy something they
already have for free. A cold reviewer reading both should read a decided
narrowing, not a contradiction.

**⚠️ Seam to `12-go-live.md`.** This rule bars the two founder accounts and the
three comped friends from purchasing — which is exactly the first two cohorts of
the staged rollout, founders first and then the comped friends. The natural
cohort cannot buy anything, by design. `12-go-live.md` must therefore provide
dedicated live-mode test accounts for the founders-first step, outside both
`COMP_EMAILS` and `FOUNDER_EMAILS`, or the first real payment on the live
integration will be a stranger's.

### 3.8 The eligibility answer's shape, and what `days` means

`trialEligibility()` stays a no-argument server action returning
`{ eligible, reason, days }`, with one field added.

`days` is **the length of the free run they had**, not the number of days
remaining and not the number elapsed. A beta user on day 12 of 14 gets `14`. That
is the only reading the value is correct for, and the only string that renders it
reads it in the past tense. **Nothing may render `days` as a countdown, a
remaining balance, or a progress figure.**

**A comp flag rides on the same answer (D77)**, so the welcome screen can suppress its
trial line from one server-resolved fact rather than by re-deriving the cohort on the
client. It is a flag, not a fourth reason: the reasons describe which free run somebody
had, and a comp had none.

The other new field is `graceEndsAt`: the ISO instant a live beta grace ends, or null.
It is present only when `reason` is `"beta"` and the grace has not yet expired, and
it is what lets `02b` tell a mid-grace user apart from a post-grace one. It is
handed over as a raw ISO instant from `entitlements.active_until`, never as a
formatted date — the consuming screen formats it, in the timezone that screen
already uses.

`reason` gains no new value. Three reasons and a nullable date answer four cases.

### 3.9 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** §3.4 is this
  invariant, applied to the one population the current code violates it for.
  §3.5's failure directions serve the same invariant from the other side, and §3.7
  closes it for comps.
- **No user holds more than one billable subscription at any moment.** The
  abandoned-attempt cancel loop stays as built, `already-subscribed` still refuses
  a validated customer, and the comp refusal adds a third road to the same answer.
  Nothing in this spec creates a subscription without going through those checks.
- **Access is decided by entitlements and nothing else.** `trialEligibility()`
  reads entitlements, but only to decide what a screen *says*. It gates nothing,
  and the Out of Scope section forbids making it a gate. The `subscriptions` mirror
  is not read by anything in this spec.
- **A server action never accepts an identifier saying whose data to act on.**
  `trialEligibility()` keeps its zero arguments. `startTrial(plan)` takes a plan
  key and nothing else; the user, the customer and the grace all resolve from the
  verified session. **⚠️ Every export of a `"use server"` module is a publicly
  dispatchable HTTP endpoint, so any helper added during this work must not be
  exported from one.**
- **No secret ever reaches a client bundle.** `lib/billing/betaGrace.ts` holds five
  real email addresses and has no `server-only` import, so nothing but convention
  stops a client component pulling them into a bundle. Step 5 closes it.
- **A screen never states a price, date or promise the server would contradict.**
  §3.8's raw-ISO handover and the ban on rendering `days` as a countdown are both
  this invariant. The `14` on the checkout screen already arrives as data rather
  than as a typed literal, and stays that way.

### 3.10 If this goes wrong after go-live

Do not invent a recovery story here. `BILLING_GATE_ENABLED=false` returns every
account to full write access without a deploy but does not stop Stripe charging
anybody; stopping charges means cancelling at Stripe by hand; there is no support
tooling and no in-app mass stop. The runbook is §9e of the founder's brief, carried
in `12-go-live.md`. Refer to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Commit what is already there, before touching anything.**
The entire save offer is currently uncommitted: `lib/billing/openOfferStore.ts`,
its test, `lib/billing/saveOffer.test.ts` and `supabase/billing/003_courtesy_until.sql`
are untracked, and roughly 1,748 insertions across 24 files are modified and
unstaged. This spec modifies two of those same files. Commit the working tree to
`wave3/billing-cancel` first, so there is a point to return to.
*Verify before moving on:* `git status --short` is clean, and `git log --oneline -1`
shows the commit on `wave3/billing-cancel`. **⚠️ Do NOT merge to `main` and do NOT
push anything to `main`.**

**Step 2 — Add the pure resolver and its tests.**
Add one pure function that decides what free time a subscription is created with,
in `lib/billing/` alongside the other pure billing logic, returning a discriminated
result covering three cases: a full trial, a start aligned to a live grace end, and
no free time at all. It takes the facts as arguments — whether a trial has been
used, the grace end if there is a live one, and `now` — and reads nothing itself, so
it is testable under the house rule that tests cover `lib/**` pure logic only.
Include the minimum-offset clamp from §3.4 as part of this function, with the value
left as a named constant marked `OPEN: awaiting answer to Q76`.
*Verify before moving on:* unit tests cover all three cases plus the clamp, plus a
grace that ended in the past (which must resolve to "no free time", not to a
negative trial), and `npx vitest run` is green.

**Step 3 — Extend `trialEligibility()` with `graceEndsAt`.**
Add the nullable ISO field to the returned type and populate it from the same
entitlements read that already answers the grace question — one read, not two. A
second read is a second thing that can fail independently and disagree with the
first. Keep the existing short-circuit order: Postgres first, Stripe only if the
grace check answers no, so a user with no billing customer never touches Stripe.
Keep the outer catch and the generous fallback exactly as they are.
*Verify before moving on:* `tsc` clean; the existing checkout screen still compiles
against the widened type with no changes to it; a manual call as a beta user
mid-grace returns a non-null `graceEndsAt`, and as a post-grace beta user returns
null.

**Step 4 — Wire `startTrial`.**
Three changes, in this order inside the function. First, refuse an account holding a
non-expiring comp entitlement, returning `already-subscribed` before any Stripe
object is created. Second, replace the current two-way `eligibleForTrial` boolean
with the Step 2 resolver, so the create call sets either `trial_period_days`, or
`trial_end` at the grace end, or neither. Third, when the grace-aligned branch is
taken, merge `trackd_grace_until` into the subscription metadata as an ISO instant,
preserving `user_id`.
Leave `payment_behavior`, `payment_settings`, `trial_settings` and the idempotency
key exactly as they are. The server decides eligibility here independently and must
never trust a value the client sends.
*Verify before moving on:* `tsc` and ESLint clean. Then, in Stripe test mode, create
a subscription on a seeded mid-grace account and read the object back: `trial_end`
equals the grace end (or the clamped minimum), the amount due today is zero, a
SetupIntent exists, and `trackd_grace_until` is on the metadata beside `user_id`.

**Step 5 — Close the `betaGrace.ts` bundle hole.**
Add `import "server-only"` to `lib/billing/betaGrace.ts`. Every importer in the
application is server-side, so no application code should break.
The tests import this module directly, so the test run is expected to break:
`server-only` throws outside a server bundling context and Vitest is not one.
**The fix is pre-authorised and it is a test-config change, not a source change:**
alias `server-only` to a no-op stub in the Vitest config, so the import resolves to
nothing under test and still throws in a client bundle, which is the behaviour being
bought. Do not split the file, do not move `COMP_EMAILS`, and do not add a
conditional import.
**⚠️ Anything beyond that alias stops and asks.** A structural change to this file
is a decision, not a guess, and `06-beta-grace-and-notices.md` depends on it too.
*Verify before moving on:* `npx vitest run` green, `next build` succeeds, and a
search of the client bundle output finds none of the comp addresses.
**⚠️ Do NOT run `next build` while a dev server is running, and do NOT delete
`.next` while one is running.**

**Step 6 — Drive it, against real Stripe test mode, with a test clock.**
Also verify the real `trial_end` minimum Stripe enforces, empirically, and record it.
**⚠️ Keep the 48-hour clamp regardless of the finding.**
Not fixtures. The defects on this path live in Stripe's own state machine, and every
serious one found on this project was found by driving the running application —
`tsc`, ESLint and 1,219 tests have caught none of them. There is no test-clock
harness in the repo yet; drive it by hand for now, and `12-go-live.md` owns building
the driver.
Walk each case in §5's edge-case list end to end at 390x844 on `http://localhost`.
**⚠️ `http://127.0.0.1` does not hydrate. Any conclusion about tapping or clicking
drawn through it is invalid.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid`, and delete them BY ID ONLY — a previous cleanup matched the
whole domain and destroyed 16 real fixtures.**
**⚠️ Clean up the Stripe objects BEFORE deleting a test user. Deleting the user
cascades away `billing_customers`, which is the only mapping back to the Stripe
customer.**
*Verify before moving on:* every box in §5 is answered yes, by observation rather
than by reading code.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The screen still works with the newest migration UNAPPLIED —
      `supabase/billing/003_courtesy_until.sql` is written and not applied; confirm
      the checkout and eligibility paths behave identically with it absent
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] No new export was added to any `"use server"` module

The one-trial rule:

- [ ] A brand-new account is offered seven free days and gets them
- [ ] A user who completed a trial and later lapsed is refused a second one, and is
      told they are being charged today rather than being promised free days
- [ ] An abandoned 3D-Secure attempt does NOT burn the trial: force the 3DS test
      card, abandon the challenge, return, and confirm seven free days are still
      granted
- [ ] A user with abandoned attempts on two different plans ends with exactly one
      live subscription after picking a third
- [ ] Nothing anywhere persists a "trial used" marker

The beta grace:

- [ ] A beta-grace account is refused a trial, whether the grace is still running or
      has expired
- [ ] A mid-grace account that subscribes is charged NOTHING today: the invoice due
      today is zero and `trial_end` equals their grace end
- [ ] `trackd_grace_until` is written on the subscription metadata, and `user_id`
      survives the merge
- [ ] A mid-grace account with less remaining than Stripe's minimum offset gets the
      clamped value, which is LATER than the grace end and never earlier
- [ ] A post-grace account is correctly routed to the paid-today path (which `02a`
      makes work; before `02a` lands this case is expected to error rather than to
      charge)
- [ ] At the grace-end boundary, access is continuous: the comp row and the stripe
      row expire together, the renewal lands, and the account never drops to
      read-only in between
- [ ] `graceEndsAt` is non-null mid-grace, null post-grace, and null for every
      non-beta account
- [ ] `days` returns 14 for a beta account regardless of how far into the fortnight
      they are, and is rendered nowhere as a countdown

Comps:

- [ ] An account with a non-expiring comp entitlement cannot create a subscription:
      `startTrial` returns `already-subscribed` and no Stripe object is created
- [ ] **A comp-list member signing up after the backfill is granted their comp at
      signup**, on every authenticated path, and is never offered a trial
- [ ] **A comp never reads a line congratulating them on a trial**, and no replacement
      line was invented in its place
- [ ] No comp email address appears anywhere in the built client bundle

Failure directions:

- [ ] With Stripe unreachable, the screen stays generous and the button refuses;
      confirm no charge occurs
- [ ] With the entitlements read failing, the trial is GRANTED, not refused
- [ ] A test pins the asymmetry in §3.5 so it cannot be tidied into symmetry

Attacks and races:

- [ ] `trialEligibility()` refuses an anonymous caller and returns nothing about
      another signed-in user
- [ ] `startTrial` called with a forged plan key, another user's ids, or from an
      anonymous session refuses
- [ ] Two `startTrial` calls in the same tick produce exactly one live subscription
- [ ] Two browser tabs starting a trial for the same account produce exactly one
      live subscription

Ship-together:

- [ ] `01`, `02a` and `02b` are all complete before any of the three reaches
      `main`. If `02a` is not done, this does not ship.

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

4. **Migrations are written, never applied.** This spec produces no SQL. If the work
   turns out to need any, it stops and asks rather than writing one, and any file it
   eventually produces opens with a ▶ HOW TO RUN THIS block and ends with a VERIFY
   block that returns rows, for the founder to apply by hand.

---

## 7. Open items

- ~~`Q65`~~ **Resolved 15 Aug 2026.** Portal cancel and plan switching are both
  OFF; see §3.6. The live-mode equivalent is `12-go-live.md`'s check.
- ~~`Q76`~~ **Resolved 15 Aug 2026.** The clamp constant is
  `STRIPE_MIN_TRIAL_END_OFFSET`, 48 hours, citing Stripe's documented minimum, with
  the real boundary verified empirically in Step 6 and 48 hours kept regardless.
- ~~`Q74`~~ **Answered, and consumed by `08-billing-screen.md`.** A beta-grace
  account with no subscription returns "Complimentary" on the first branch, with no
  date anywhere on the screen. `08` §3.6 owns the fix; D36 owns the wording.

**Nothing in this spec is awaiting an answer or a decision.**
