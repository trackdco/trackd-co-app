Save as: Context/Feature Specs/02a-paid-today-checkout.md

# Spec: Paid-Today Checkout

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

**Depends on:** `01-trial-eligibility.md`, which decides who lands on this path.

**⚠️ SHIP-TOGETHER TRIPLE — `01`, this spec and `02b-checkout-copy-and-disclosure.md`
ship together or not at all.**

`01` decides who is charged today. This spec makes being charged today possible.
`02b` writes what those people read. Shipping any two of the three puts a promise,
a button and a charge out of step with each other on a payment screen.

**Blocks:** `06-beta-grace-and-notices.md`. When the ~85 beta accounts reach the end
of their fortnight, every one of them who taps through the read-only pop-up arrives
on this path. Without this spec they arrive at a button that cannot succeed.

**Seams out:**

- `02b` owns every string on the checkout screen itself. This spec owns the
  post-payment holding screen (§3.7), because this spec is what makes a charged
  customer reach it.
- `11-reconciliation-and-alerting.md` inherits two assertions from here: no
  subscription sits `incomplete` past Stripe's cancellation window while an
  entitlement exists against it, and every subscription carrying
  `trackd_grace_until` has no paid invoice dated before that instant.
- `13-billing-analytics.md` owns the event that should fire when somebody is
  charged today. This spec does not add one; it stops a false one (§3.8).

**Every number this spec hands to Stripe or to a screen comes from its server-side
source.** The amount handed to Elements is the Stripe price's own minor-unit value,
never the display figure multiplied back up. The currency is Stripe's. Nothing is
typed as a literal.

---

## 1. Goal

A user with no free days can pay and get in.

Today they cannot. `startTrial` omits `trial_period_days`, so Stripe issues a first
invoice with an amount due immediately and `payment_behavior: "default_incomplete"`
parks the subscription in `incomplete` carrying a **PaymentIntent** on
`latest_invoice`. The create call expands `pending_setup_intent`, which is null in
that state. `setupSecret()` reads that field and only that field, returns null, and
the action falls through to its guard and returns `{status: "error"}`. The client
cannot help either: it is setup-only end to end, `<Elements mode="setup">` with a
single `stripe.confirmSetup()` call, and the string `latest_invoice` does not appear
anywhere in the codebase.

So the whole no-trial variant is correct-looking copy above a button that returns a
generic failure. This spec adds the missing arm of a fork that currently has one.

From the user's side, working looks like this: a returning customer who already had
their trial, or a beta user whose fortnight has ended, presses Subscribe, confirms a
card, is charged the amount the screen showed them, and lands in the app with access.
And when something goes wrong midway — a declined card, a bank challenge that forces
a redirect, a webhook that is slow — they are never charged twice and never told
their payment succeeded by a screen that cannot know.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** change any string on the checkout screen, the paywall, or the
  disclosure. `02b` owns those. This spec owns only the post-payment holding
  screen's copy, and even that is unsigned and marked in §7.
- **Do NOT** redesign the checkout screen's layout, spacing, or Stripe Elements
  theming. That is `09-checkout-redesign.md`. This spec changes what the sheet
  *does*, not how it looks.
- **Do NOT** change the SetupIntent arm's behaviour for a user who does get a
  trial. The trial path works. Every change here is additive to it.
- **Do NOT** add a new analytics event. `13` owns the event taxonomy. §3.8 removes
  a false event and adds nothing.
- **Do NOT** add a new `status` value to `StartTrialResult`. §3.2 discriminates on a
  field, not on a fourth status, because every existing caller branches on `status`.
- **Do NOT** change `trialEligibility()`, the one-trial rule, the grace-aligned
  branch, or anything else `01` owns.
- **Do NOT** touch the save offer, the cancel flow, the read-only gate, or the
  notification runner.
- **Do NOT** change the webhook handlers or anything in `lib/billing/sync.ts`. A
  paid-today subscription reaches entitlement through the existing
  `invoice.paid` → `syncSubscription` path, unchanged.
- **Do NOT** widen `lib/db/admin/` to return a row.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** hold a card, a PAN, or any card detail in application state, in a log,
  or in a server action's arguments. Everything card-shaped stays inside Stripe's
  iframe.
- **Do NOT** add an argument to any server action that identifies whose subscription
  to act on. The subscription id, the customer and the intent all resolve from the
  verified session.
- **Do NOT** create live-mode prices, register a webhook endpoint, or set
  `BILLING_GATE_ENABLED`. All three belong to `12-go-live.md`.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 The three coordinated changes, and why it is three

The fix is not one line. The secret has to be fetched, returned, and confirmed, and
each of those is a different file with a different constraint.

| Where | What is wrong | What it becomes |
|---|---|---|
| The `subscriptions.create` call | Expands `pending_setup_intent` only | Also expands `latest_invoice.payment_intent` |
| `setupSecret()` | Reads one field, returns null for a paid subscription | Gains a sibling that reads the invoice's PaymentIntent; a resolver picks between them |
| `StartTrialResult` | Says "here is a client secret" without saying what kind | Carries which kind |
| `PaymentSheet` | One `confirmSetup()` call, `mode: "setup"` fixed at mount | Branches, with the mode decided before mount (§3.3) |
| The `setupSecret` call that follows `reconcileToOne` | Returns null for a paid survivor | Replaced by the resolver, at the call site |

**`reconcileToOne` itself is not modified, and that is now confirmed rather than
assumed (Q81).** It returns a `Stripe.Subscription` and never touches a secret; the
single `setupSecret` call happens after it returns, at the call site, on the
survivor. So the resolver replaces that one call and the reconcile body is left
alone. The only trial-shaped thing inside it is a log string, which is wording
rather than logic.

**Its dead-status guard already admits a paid-today subscription, verified.**
`DEAD_STATUSES` holds `canceled` and `incomplete_expired` and deliberately excludes
`incomplete`, with a comment saying why: `incomplete` is exactly where a
`default_incomplete` create with an amount due lands, waiting for the card the call
is about to collect. That comment was written for the trial path and happens to be
precisely what this spec needs. Do not widen or narrow the set.

### 3.2 How the server says which kind of secret it is returning

`StartTrialResult`'s `ok` variant gains one field naming the intent kind. No fourth
status: `already-subscribed` and `error` keep their meanings, and every existing
caller branches on `status` and must keep compiling untouched.

The resolver that produces it reads `pending_setup_intent` first and the expanded
invoice's PaymentIntent second, and returns which one it found. It must never
return a secret without saying what kind it is, and the type must make that
impossible to forget rather than merely discouraged.

**The subscription id already comes back and stays server-resolved.** Nothing about
this change lets a client name a subscription. **⚠️ Every export of a `"use server"`
module is a publicly dispatchable HTTP endpoint — the resolver is a private
function in that module and must not be exported.**

### 3.3 ⚠️ The Elements mode is fixed at mount, and that is the crux of this spec

Stripe's Elements takes `mode` at mount. It cannot be switched afterwards. But the
client secret only arrives after the user presses the button, which is far too late
to decide which mode the sheet should have been in.

So **the mode is decided from `trialEligibility()`, before the sheet mounts**, and
two rules follow from that.

**The CTA does not become pressable until eligibility has resolved.** Today the
screen renders with the generous default — eligible, seven days — and the button is
live immediately, so a user on a slow connection can press it before the server has
said whether they are being charged. In the setup-only world that was harmless. It
is not harmless now: it is the difference between mounting a sheet that collects a
card and one that takes money. The button waits.

**If the mounted mode and the returned intent kind disagree, nothing is confirmed.**
The disagreement is not hypothetical: the client's answer is generous by default and
generous on error, and the server decides independently and can legitimately reach a
different conclusion — a trial used up in another tab, a grace that expired between
the two calls. The dangerous direction is a sheet mounted for a trial receiving a
payment secret, because confirming it would charge somebody who is looking at a
screen that promised free days.

On a mismatch: do not confirm. Cancel the subscription that was just created, so no
confirmable intent is left behind. Re-render the sheet in the server's mode, which
re-renders `02b`'s copy with it. Surface an honest message rather than a silent
re-render, because the screen the user was reading has just changed what it says.

**This is invariant 1 in mechanical form.** A PaymentIntent is not a charge until it
is confirmed, so refusing to confirm is the whole protection. Never confirm an
intent whose kind was not the kind the screen was describing.

### 3.4 The amount handed to Elements

Payment mode requires an amount and a currency at mount. Both come from the same
Stripe price object the screen is already reading.

**The amount is the price's minor-unit value, taken from Stripe.** It is not the
display figure multiplied by 100. The price loader currently divides `unit_amount`
by 100 and exposes only the divided value, so expose the raw minor-unit amount
alongside it and hand that to Elements. Multiplying a display float back up is how a
$69.99 charge becomes $69.98 or $6999.0000001, and this is the one number on the
screen that is also the number taken from a card.

The currency is Stripe's, lower-cased as Stripe returns it. Nothing is converted
client-side, ever — a converted figure beside a charge that lands in USD is a
dispute.

### 3.5 ⚠️ The redirect-based 3D-Secure gap, which is a duplicate-charge risk

Today, when a bank forces a full-page redirect rather than an inline challenge,
Stripe returns the user to `/onboarding?step=start` with `redirect_status` and an
intent client secret appended to the URL. Nothing in the codebase reads either
parameter. The flow remounts, `holding` is component state so it is false, and the
user lands back on the card form.

On the setup path that is merely bad: they see the form again and nothing was
charged. **On the payment path it is a screen inviting somebody to pay for a charge
that may have already succeeded.** The `already-subscribed` guard catches most
second attempts, because a validated card on an active subscription refuses — but
"most" is not the standard on a payment screen, and the user is being asked to do
something the app should already know the answer to.

So: on mount, if the URL carries a returning intent, resolve it before rendering the
form. A succeeded intent goes straight to the holding screen. A failed one renders
the error and the form. One still requiring action renders the form with an honest
message. And in every case the parameters are cleared from the URL so a refresh or a
back-navigation cannot replay the branch.

**No subscription is created while a returning intent is unresolved.** The resolve
happens first, always.

### 3.6 The `incomplete` window is fifteen days, not the twenty-three hours the code assumes

The Stripe dashboard cancels incomplete payments after **15 days**. A comment in the
codebase reasons from roughly 23 hours, which is the default and is not this
account's setting.

Two things follow.

**An abandoned paid-today attempt leaves a confirmable PaymentIntent alive for a
fortnight.** `incomplete` is in `BILLABLE_STATUSES`, so it blocks a second
subscription, which is correct. But the abandoned-attempt loop only treats a
subscription as resumable when `setupSecret` finds something on it, and a paid
subscription has no SetupIntent — so today it would be cancelled and replaced on
every return, generating a fresh invoice each time and leaving a trail of cancelled
subscriptions and abandoned invoices on the customer.

**So the paid path is made resumable in the same way the setup path already is.**
Resumability is decided by the same resolver from §3.2: a live subscription on the
plan the user is asking for again, carrying a confirmable intent of either kind, is
handed back rather than replaced. Every other live subscription is still cancelled,
for the reason the existing loop states — leaving one running would both block the
user and quietly bill the wrong thing.

Whether cancelling an `incomplete` subscription voids its open invoice in this
account's configuration is a fact to observe on a test clock, not to assume. It is a
Check When Done item.

### 3.7 The holding screen, and why its current words are wrong for a charged customer

After a confirmed card, the checkout screen is replaced by a holding state that
polls `hasEntitlement()` across eleven checks over roughly thirty seconds, then shows
a recoverable screen whose Continue re-checks once and proceeds regardless. The
design is right and the reasoning behind it — that the app's own gates read the same
table, so holding somebody hostage to a webhook we cannot see is worse than letting
them in — holds for a charged customer too. Keep all of it.

Two things do not hold.

**The timing assumption.** The thirty seconds is sized on "most webhooks land inside
three seconds", which is true of `customer.subscription.created` on a trialing
subscription, fired at creation. A charged subscription has to travel through
payment confirmation, `invoice.paid`, and `customer.subscription.updated` before
`syncSubscription` writes an entitling row. A charged customer is measurably more
likely to reach the slow screen than a trialing one. Extend the backoff on the paid
path only, leaving the trial path's timing exactly as it is.

**The words.** "Setting up your trial." is the headline a customer who was just
charged reads, and it is a bare string with no variant and no prop to switch on.
"Nothing is lost, so carry on" is true and reassuring for a trial, and reads very
differently to somebody whose card has just been debited by a screen that will not
confirm it.

The paid variant must satisfy three constraints: it must not say "trial"; it must
not claim the payment succeeded, because this screen genuinely cannot know; and it
must acknowledge that money moved, because a charged customer reading a screen that
ignores the charge will go looking for their bank.

**These two strings were not in the founder's original approved copy and were signed
off separately as D15 on 15 Aug 2026.** They are decided, and they are carried
verbatim below. Do not shorten, soften, or improve them, and keep both in the one
place the existing component already keeps its strings.

- Waiting headline, paid path only: **"Setting up your plan."**
- Recoverable-state body, paid path only: **"We're still finishing your setup. Your
  payment is safe and your Pro plan will appear shortly. Carry on, and check your
  Billing screen if anything looks missing."**

The trial path keeps "Setting up your trial." and its existing body, unchanged.

### 3.8 The false analytics event

`track("trial_started", { plan, days: TRIAL_DAYS })` fires on every confirmed
outcome, so once this path works a customer charged today is logged as having
started a seven-day trial. Every downstream funnel number would be wrong from the
first paid customer onward.

**Fix it by not firing it.** When no trial was granted, the event does not fire.
This spec adds no replacement event: `13-billing-analytics.md` owns the taxonomy,
and inventing a name here means `13` inherits a string it did not choose. The
consequence is stated plainly so nobody mistakes it for an oversight — **between
this spec shipping and `13` shipping, a paid-today subscribe is unmeasured.** That
is the correct trade: an unmeasured event is a gap, a wrong one is a lie in a
dashboard.

### 3.9 ⚠️ The idempotency key must gain the intent kind, or the paid retry 400s

The create's key is `trial:<user>:<plan>:<fingerprint>`, where the fingerprint is
every subscription id the customer has ever held, sorted and joined. It is a good
key and it closes the double-tap: two concurrent calls read the same Stripe state,
compute the same key, and Stripe dedupes them.

**It cannot tell a trial attempt from a paid attempt.** Same user, same plan, same
subscription history, different `trial_period_days` — the key is identical and the
parameters are not. Stripe rejects a repeated key carrying different parameters with
a 400, so the second attempt fails outright for twenty-four hours rather than falling
through to a fresh subscription. This is exactly the failure the existing comment
describes for a user-only key, arriving by a different road, and this spec is what
opens that road by adding a second create shape.

**So the key gains a segment naming the intent kind.** A trial create and a paid
create on the same plan and the same history produce different keys and never
collide. Nothing else about the key changes: the fingerprint still includes cancelled
subscriptions, which is what makes a resubscribe differ from the attempt before it,
and it is still sorted so two racers compute it identically.

The reachable case is not exotic. A user whose eligibility resolves generously,
whose server-side check then says otherwise, retries on the same plan minutes later
— §3.3's mismatch path lands them there by design.

*Noted, not fixed:* the id list comes from a `limit: 100` call with no pagination, so
a customer past a hundred subscriptions would fingerprint a truncated set. It
degrades toward more keys rather than fewer, so it is a note rather than a defect.

### 3.10 The failure message says "trial" to somebody being charged

Both failure branches after the reconcile return "Couldn't start your trial just
now." A user who is being charged today reaches both of them, and reads a sentence
about a trial they were just told they cannot have.

**This spec owns the routing; `02b` owns the words.** The paid path returns the
string signed off as D20 and carried in `02b` §3.2, character for character:

> We couldn't start your plan just now. Nothing has been charged.

Both branches are reached before anything is confirmed, so no charge has occurred
when either fires and the second sentence is true whenever it renders. The trial
path keeps its own message unchanged.

### 3.11 What is deliberately unchanged

`payment_behavior: "default_incomplete"` stays: it is what stops a subscription
activating with no payment method attached. `payment_settings.save_default_payment_method`
stays, so the card is saved for renewal on both arms. `trial_settings.end_behavior`
stays, harmlessly inert when there is no trial. `metadata.user_id` stays, because
the webhook needs it for events that outrun the `billing_customers` row. The
idempotency key's existing four segments stay as
they are; §3.9 adds a fifth rather than altering any of them.

### 3.12 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** §3.3's mode
  gate is this invariant mechanically: the screen's promise and the intent's kind
  must agree before anything is confirmed, and a disagreement cancels rather than
  charges. §3.5 closes the redirect gap that could take a second payment for the
  same subscription.
- **No user holds more than one billable subscription at any moment.** §3.6 keeps
  the abandoned-attempt loop's guarantee intact across the new path by making a
  paid attempt resumable rather than replaceable, and every other live subscription
  is still cancelled. `already-subscribed` still refuses a validated customer.
- **Access is decided by entitlements and nothing else.** The holding screen polls
  `hasEntitlement()`, which reads the same table every gate reads. It grants
  nothing and must not be given a faster, looser check — a client that can grant
  access is a client anyone can grant themselves access with.
- **A server action never accepts an identifier saying whose data to act on.**
  `startTrial(plan)` keeps its single plan argument. The returning-intent resolve in
  §3.5 reads a client secret from the URL, which identifies an intent rather than a
  person, and it must still confirm the resolved subscription belongs to the
  verified session before acting on it.
- **No secret ever reaches a client bundle.** A per-intent client secret is meant to
  reach the browser and is not a secret in this sense. No Stripe API key, webhook
  secret, or service-role key is touched by this work.
- **A screen never states a price, date or promise the server would contradict.**
  §3.4's minor-unit amount is the same number in the charge and on the screen. §3.7
  forbids a holding screen that claims a payment succeeded.

### 3.13 If this goes wrong after go-live

Do not invent a recovery story. `BILLING_GATE_ENABLED=false` restores write access
without a deploy but stops no charge; stopping charges means cancelling at Stripe by
hand; there is no support tooling and no in-app mass stop. The runbook is §9e of the
founder's brief, carried in `12-go-live.md`. Refer to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Expand the invoice's PaymentIntent on BOTH calls, and add the resolver.**
Widen the `subscriptions.create` expand list to include the invoice's PaymentIntent
alongside `pending_setup_intent`. **⚠️ Widen `listSubscriptions`'s expand list in the
same step, and do not defer it.** That list expands `data.pending_setup_intent` only,
and `reconcileToOne` prefers the freshly-listed copy of the subscription over the
create response, falling back to the create response only when the listed one is
absent. Widen the create alone and the survivor silently loses the expansion every
time the listed copy wins — which is the common case, not the edge one. The failure
is a paid path that works when you test the create and returns null in production.
Then add a private resolver beside `setupSecret` that returns both the secret and its
kind, checking the SetupIntent first and the invoice's PaymentIntent second. Leave
`setupSecret` in place for now so nothing breaks mid-step.
*Verify before moving on:* `tsc` and ESLint clean; in Stripe test mode, create one
subscription of each kind and confirm the resolver returns a setup secret for the
trialing one and a payment secret for the charged one — and confirm the payment
secret is still found when the survivor came from the list rather than the create.

**Step 2 — Carry the kind through `StartTrialResult`, at the call site.**
Add the intent-kind field to the `ok` variant. Replace the `setupSecret` call that
runs on `reconcileToOne`'s survivor with the resolver, and populate the field from
what it returns. **Do not modify `reconcileToOne`'s body** — per §3.1 it never
handles a secret, so there is nothing inside it to thread. Do not add a status.
*Verify before moving on:* `tsc` clean; the existing trial path still returns a
setup secret and still works end to end, driven, not read; the reconcile function's
diff is empty.

**Step 3 — Gate the CTA on eligibility, and pass the mode down.**
The button is not pressable until `trialEligibility()` has resolved. Derive the
sheet's mode from the resolved answer and pass it down along with the minor-unit
amount and currency for the payment case. Expose the raw minor-unit amount on the
price object rather than multiplying the display value back up.
Follow `ui-context.md` for how a not-yet-pressable primary button reads — it is a
disabled state on an existing control, not a new component, and **⚠️ a primary
button is white (`bg-accent-primary`) and must never be amber.**
*Verify before moving on:* on a throttled connection the button is visibly not
pressable until the answer lands; the amount passed to Elements matches Stripe's
`unit_amount` exactly for all three plans.

**Step 4 — Branch the confirm, and add the mismatch guard.**
Mount Elements in the mode from Step 3, and confirm through `confirmSetup` or
`confirmPayment` according to the kind the server returned. Before confirming,
compare the returned kind against the mounted mode; on a mismatch, confirm nothing,
cancel the created subscription, re-render the sheet in the server's mode, and
surface an honest message.
Keep the existing single `run()` path so the wallet and card routes cannot diverge,
and keep the wallet-specific `paymentFailed` call — the OS sheet sits above the DOM
and spins forever without it.
*Verify before moving on:* force a mismatch by seeding an account whose eligibility
changes between the two calls, and confirm nothing is charged and no confirmable
intent survives.

**Step 5 — Handle the returning redirect.**
On mount, resolve a returning intent from the URL before rendering the form or
creating anything. Succeeded goes to the holding screen; failed renders the error
and the form; requires-action renders the form with an honest message. Clear the
parameters from the URL in every case.
**⚠️ Confirm the resolved subscription belongs to the verified session before acting
on it.** A client secret in a URL identifies an intent, not a person.
*Verify before moving on:* drive a redirect-based 3DS test card through to success
and confirm the user lands on the holding screen, not the card form, and that a
refresh does not replay it.

**Step 6 — Make the paid attempt resumable, and extend the holding screen.**
Use the Step 1 resolver in the abandoned-attempt loop so a live subscription on the
requested plan carrying a confirmable intent of either kind is handed back rather
than cancelled and replaced. Then add the paid variant to the holding screen: a prop,
a longer backoff on that path only — **60 seconds, against the trial path's
unchanged ~30 (D15)** — and the two decided strings from §3.7.
*Verify before moving on:* abandon a paid-today attempt, return, pick the same plan,
and confirm the same subscription and the same invoice are resumed rather than a
second pair created.

**Step 7 — Stop the false analytics event.**
Suppress `trial_started` when no trial was granted. Add nothing in its place.
*Verify before moving on:* the window buffer holds no `trial_started` entry after a
paid-today subscribe, and still holds one after a trial subscribe.

**Step 8 — Drive the whole thing, against real Stripe test mode, with a test clock.**
Not fixtures. The defects on this path live in Stripe's own state machine, and every
serious one on this project was found by driving the running application.
Walk every case in §5 end to end at 390x844 on `http://localhost`.
**⚠️ `http://127.0.0.1` does not hydrate. Any conclusion about tapping drawn through
it is invalid.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ Clean up the Stripe objects BEFORE deleting a test user — deleting cascades
away `billing_customers`, the only mapping back to the Stripe customer.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The screen still works with the newest migration UNAPPLIED
      (`003_courtesy_until.sql` is written and not applied)
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] No new export was added to any `"use server"` module

The happy path:

- [ ] A returning customer who used their trial is charged the exact amount the
      screen showed, in the currency it named, and reaches the app with access
- [ ] A beta account past its fortnight completes the same journey
- [ ] The card is saved and the following renewal charges it without a second card
      entry
- [ ] The amount sent to Elements equals Stripe's `unit_amount` for all three plans,
      with no rounding drift
- [ ] The trial path is byte-for-byte unchanged in behaviour: still a SetupIntent,
      still `confirmSetup`, still the same holding screen and timing

The mode gate:

- [ ] The CTA is not pressable until eligibility resolves
- [ ] A sheet mounted for a trial that receives a payment secret confirms NOTHING,
      charges nothing, and leaves no confirmable intent behind
- [ ] After a mismatch, the re-rendered sheet and the copy on screen agree with the
      server's answer

Redirects and interruptions:

- [ ] A redirect-based 3DS success returns the user to the holding screen, never to
      the card form
- [ ] A redirect-based 3DS failure returns them to the form with an honest message
      and no charge
- [ ] Refreshing or navigating back after a returning redirect does not replay the
      branch or create a second subscription
- [ ] An inline 3DS challenge that is dismissed leaves the user on the form with an
      inline error and no subscription able to be confirmed later

The incomplete window:

- [ ] An abandoned paid-today attempt, returned to on the same plan, resumes the
      same subscription and the same invoice rather than creating a second pair
- [ ] Returning on a *different* plan cancels the abandoned one and creates exactly
      one live subscription
- [ ] Observe and record what cancelling an `incomplete` subscription does to its
      open invoice in this account's configuration
- [ ] No account ever holds two subscriptions in `BILLABLE_STATUSES` at once,
      including `incomplete`

Expansion and the idempotency key:

- [ ] The resolver finds a payment secret on a survivor that came from the LIST
      path, not only on one that came from the create response
- [ ] A trial attempt that loses the eligibility race, followed the same day by a
      paid attempt on the same plan with the same subscription history, succeeds
      rather than returning a 400 from a replayed key
- [ ] A genuine double-tap on the same shape still produces exactly one
      subscription
- [ ] `reconcileToOne`'s body is unchanged

The holding screen:

- [ ] A charged customer never sees the word "trial" on it
- [ ] It never claims the payment succeeded, on either variant
- [ ] No failure message on the paid path contains the word "trial"
- [ ] The paid path gives up at 60 seconds and the trial path is unchanged at ~30
- [ ] Continue still re-checks and still proceeds either way
- [ ] The polling loop fires `onEntitled` at most once under remount and under a
      fast unmount/remount cycle

Attacks and races:

- [ ] `startTrial` refuses an anonymous caller, another signed-in user, and a forged
      plan key
- [ ] A returning intent belonging to another user is refused
- [ ] Two `startTrial` calls in the same tick produce exactly one live subscription
- [ ] Two tabs confirming the same intent produce exactly one charge
- [ ] Double-tapping Subscribe during confirmation produces exactly one charge

Analytics:

- [ ] No `trial_started` event fires for a paid-today subscribe
- [ ] `trial_started` still fires for a genuine trial

Ship-together:

- [ ] `01`, `02a` and `02b` are all complete before any of the three reaches `main`

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

~~`Q80 — what fingerprint(all) computes over`~~ **Answered 15 Aug 2026.** Every
subscription id the customer has ever held, sorted and joined. It exposed a
collision this spec had to fix rather than merely document; see §3.9.

~~`Q81 — the full body of reconcileToOne`~~ **Answered 15 Aug 2026.** It never
handles a secret, so nothing is threaded through it; the resolver replaces the
`setupSecret` call that follows it. See §3.1 and Step 2.

~~`D20 — the paid path's failure string`~~ **Resolved 15 Aug 2026.** "We couldn't
start your plan just now. Nothing has been charged." Owned by `02b`, routed here per
§3.10. Nothing in this spec is awaiting a decision.

~~`D15 — the holding screen's paid variant`~~ **Resolved 15 Aug 2026.** Headline
"Setting up your plan."; recoverable body "We're still finishing your setup. Your
payment is safe and your Pro plan will appear shortly. Carry on, and check your
Billing screen if anything looks missing."; paid-path timeout 60 seconds, trial path
unchanged at ~30. All three are carried as decided copy in §3.7 and Step 6. The
options they were chosen from are not repeated here: the decision is what a reviewer
needs, not the shortlist.

Nothing else in this spec is awaiting a founder decision.
