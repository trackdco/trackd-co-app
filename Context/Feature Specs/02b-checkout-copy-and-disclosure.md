Save as: Context/Feature Specs/02b-checkout-copy-and-disclosure.md

# Spec: Checkout Copy and Disclosure

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

**Depends on:** `01-trial-eligibility.md` for the eligibility answer and
`graceEndsAt`; `02a-paid-today-checkout.md` for the working payment path the
no-trial copy sends people to.

**⚠️ SHIP-TOGETHER TRIPLE — `01`, `02a` and this spec ship together or not at all.**

This is the spec that makes the other two honest. `01` decides who is charged
today; `02a` makes being charged today work; this one is what those people read
before they press the button. Ship `01` alone and the screen breaks a written
promise. Ship this alone and it describes a button that cannot succeed.

**Seams out:**

- `09-checkout-redesign.md` owns the screen's layout, spacing, and Stripe Elements
  theming: moving the disclosure below the button, killing the dead vertical space,
  and fixing the amber Card tab. **This spec owns which facts must be visible and
  the no-scroll requirement; `09` owns the arrangement that satisfies it.** Both
  must verify it independently, because the arrangement is what breaks it.
- `08-billing-screen.md` owns what a mid-grace subscriber's Billing screen reads.
  This spec only owns what checkout says to them.
- `02a` owns the paid path's failure *routing* and this spec owns its *words*. The
  message a charged user currently reads is "Couldn't start your trial just now.",
  which is a sentence about a trial they were just told they cannot have. The
  replacement is D20 in §7.
- The paywall screen one step earlier prints the same first-charge date from the
  same function. §3.5's fix necessarily feeds both, so the two screens cannot
  disagree by a day. The paywall's own wording is otherwise untouched.

**All approved copy in §3 is carried character for character.** Every price and
date literal inside it renders from its server or Stripe source into wording
identical to the approved line: the `14` comes from `BETA_GRACE_DAYS`, amounts and
intervals come from the Stripe price object, and dates come from the server. Nothing
is typed as a literal and nothing is recomputed in the browser.

---

## 1. Goal

The checkout screen tells every user the truth about what is about to happen to
their money.

Four different people reach it and today three of them are told something false or
unverifiable. A returning customer is told they have had their trial in wording that
was never signed off. A beta user mid-fortnight is told their plan starts today,
when `01` now guarantees it does not. Every user reads a first-charge date computed
in their browser from a constant, for a subscription that does not exist yet, in
whatever timezone their device happens to be in. And every user reads an interval
suffix taken from a hardcoded table rather than from the price they are about to be
charged on.

Working looks like this: the four legally required facts are on screen at the same
time as the button, at both target widths, without scrolling; every one of them
comes from the server or from Stripe; and the words around them are the founder's,
not an approximation of them.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** move the disclosure block, change the spacing, restructure the frame,
  or touch the Stripe Elements appearance object. That is `09-checkout-redesign.md`.
  This spec changes words and where their values come from, not the arrangement.
- **Do NOT** fix the amber Card tab, the dead vertical space, or the oversized
  Stripe legal paragraph. All three are `09`.
- **Do NOT** build, change, or branch the payment confirmation path. That is `02a`.
- **Do NOT** change eligibility, the one-trial rule, or the grace-aligned start.
  That is `01`.
- **Do NOT** rewrite the paywall's copy. **Two exceptions, both about provenance
  rather than wording:** §3.5 changes where its date comes from, and **D73 changes
  where its interval suffix comes from** — Stripe's price object rather than the static
  table, the same correction §3.3 makes here. Nothing else about the paywall moves.
- **Do NOT** add a plan selector, a subscribe route, or any new navigation. Nothing
  may route a user at the paywall without the founder's word.
- **Do NOT** "improve", shorten, or soften any approved line in §3. If a line is
  genuinely impossible to implement, stop and ask.
- **Do NOT** invent copy for a state not named in this spec. If a state turns out to
  have no words, stop and ask rather than writing some.
- **Do NOT** convert a currency client-side, ever, or display a converted figure
  beside a charge that lands in USD.
- **Do NOT** add an analytics event or change an existing one.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** add a server action. This spec adds no new dispatchable endpoint.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 Which strings are approved, which are built-but-unsigned, and which are drafts

The screen's strings fall into three groups and they get three different treatments.
A reviewer needs to be able to tell which is which without guessing.

**Approved (§5 of the founder's brief) — carried character for character.** The
no-trial title, both no-trial subtitles, the no-trial button, the three no-trial
disclosure lines, and the trial reminder line.

**Built but never signed off — left exactly as built.** The trial title "Nothing to
pay today.", the trial CTA "Start my 7-day free trial", the trial disclosure's first
two lines, and the error string. These were never in the approved copy and are not
marked for change, so they are not touched. Leaving a working unsigned string alone
is correct; rewriting it because it happens to be nearby is not.

**⚠️ D74: six strings previously unsigned are now approved copy, and sacred character
for character from here.** They live in the billing actions, the checkout screen and
the payment sheet, and they cover states this spec never named — which is why both cold
reviewers flagged them under §2's stop-and-ask rule rather than as drift.

**Those states are now named.** They are no longer unsigned strings a builder may
change; they are approved copy under the same rule as everything else in §3.2, and
altering one requires a decision. **This spec does not reproduce them**, because it
never held them: they are signed in place, at their existing locations, exactly as they
stand.

**Signed off separately, after the original approved copy.** The trial subtitle
replacement (D16), the four-string mid-grace variant (D17), and the
monthly-equivalent bracket (D18). All are now decided copy, carried verbatim in §3.2
and §3.4, and treated exactly like the original approved lines: not to be shortened,
softened, or improved.

The paid path's failure string (D20) is also signed and carried in §3.2. **Nothing
in this spec is still a draft.**

### 3.2 The approved copy, verbatim

**No-trial title.** Rendered today with emphasis markup on the final word, which
changes no character and stays:

> You've had your trial.

**No-trial subtitle, beta user.** The built string is "Your 14 days on us was it, so
your plan starts today." That is not the approved line and is replaced by it:

> We gave you 14 days free when Trackd Co went paid. Your plan starts from today.

The `14` renders from `BETA_GRACE_DAYS` and is never typed. **This line is for a
beta user whose fortnight has ENDED.** A user still inside it reads the mid-grace
variant instead — see §3.4.

**No-trial subtitle, returning customer.** Already correct as built:

> Free trials are for new accounts, so your plan starts today.

**No-trial button:**

> Subscribe

**Trial subtitle.** The built line "Just a card to keep your trial going." is cut per
§6 of the brief. Signed off as D16 and carried as decided:

> We're setting billing up now, so nothing interrupts you later.

It must render as one line at 320x568. See §3.7.

**No-trial disclosure, three lines:**

> Starts today, then $69.99 USD/yr

> First charge today, then renews until you cancel.

> Cancel any time from your Billing screen.

The amount, the currency code and the interval suffix all render from the Stripe
price object into exactly that shape, so a monthly plan reads "then $11.99 USD/mo"
and a weekly one "then $3.99 USD/wk". See §3.3 and §3.6.

**The monthly-equivalent bracket stays.** "($5.83/mo)" after the yearly amount is
text the approved line does not contain, and it is a sanctioned addition to it
(D18). Kept exactly as built: **yearly plan only, never on weekly or monthly**,
rendered from the same Stripe price, so the first disclosure line reads "Starts
today, then $69.99 USD/yr ($5.83/mo)".

**The paid path's failure message.** `02a`'s two post-reconcile failure branches
currently return "Couldn't start your trial just now.", which a user being charged
today reaches and which describes a trial they were just told they cannot have.
Signed off as D20 and carried as decided:

> We couldn't start your plan just now. Nothing has been charged.

Both branches fire before anything is confirmed, so the second sentence is true
whenever the string renders. `02a` routes to it; this spec owns the words.

**Trial reminder line.** Already correct as built, and named here so nobody
"improves" it:

> We'll notify you before your trial ends. Cancel any time before then.

No channel is named, and none may be added. Push only reaches opted-in users and
there is no email system in this codebase, so naming a channel would be a promise to
a specific mechanism that does not reliably exist.

### 3.3 ⚠️ The interval suffix comes from Stripe, not from a hardcoded table

Today the suffix is derived from `PLANS`, a static record mapping `yearly` to
`year`, and never from `price.recurring.interval`. The amount follows Stripe and the
unit does not. Change the interval in Stripe and the screen keeps printing the old
one, next to the new amount, above a button that charges.

The suffix derives from the Stripe price's own recurring interval.

**And from its interval count.** Stripe expresses "every three months" as an
interval of `month` with a count of three, so a screen reading only the interval
prices a quarterly plan as monthly. All three prices are configured at a count of
one today, which is exactly why this would go unnoticed until the day somebody adds
a quarterly plan in the dashboard.

**A price whose interval count is not one must not render a price line at all.**
The screen shows its existing "couldn't load your plan" error and the button does
not proceed. This is the invariant applied literally: a screen that cannot state a
price correctly states nothing rather than stating it wrongly. It is also loud,
which is the point — a wrong suffix is silent, and silence is the failure mode this
project keeps paying for.

### 3.4 The mid-grace beta user, and the four lines that are false for them

`01` guarantees a beta user who subscribes inside their fortnight is not charged
until their grace ends. Three approved lines say otherwise to that person:

| Line | Why it is false mid-grace |
|---|---|
| Title: "You've had your trial." | They have not. They had a fortnight, and it has not finished. |
| Subtitle: "…Your plan starts from today." | It starts at grace end. |
| Disclosure: "Starts today" / "First charge today" | Both are the grace-end date. |

All four replacements were signed off as D17 and are carried as decided copy.

**Title**, reusing the existing trial-variant string, which is literally true for
this cohort and invents nothing:

> Nothing to pay today.

**Subtitle**, present tense, one line, with the `14` from `BETA_GRACE_DAYS`. It
deliberately does not use the word "trial", because the grace is not one:

> Your plan starts when your 14 days on us end, on {date}.

**Disclosure lines 1 and 2**, the approved lines with the date where they say
"today":

> Starts {date}, then $69.99 USD/yr ($5.83/mo)

> First charge {date}, then renews until you cancel.

The third line is unchanged: "Cancel any time from your Billing screen."

**⚠️ This variant reads as welcome, not as warning, and that is a stated
requirement rather than a matter of taste.** A mid-grace user adding a card early is
pre-arming billing so that nothing interrupts them when the fortnight ends. Nothing
in this variant may frame their free time as running out, expiring, or being used
up. If an implementation detail forces language of that shape, stop and ask.

The variant is selected by one condition: `reason` is `"beta"` **and** `graceEndsAt`
from `01` is non-null. Post-grace beta users take the approved lines in §3.2
unchanged.

**`graceEndsAt` arrives as a raw ISO instant and is formatted for display on the
server**, in the user's stored timezone, by the same path §3.5 establishes. It is a
real stored `active_until`, or the clamped value where `01`'s minimum-offset rule
applies to somebody in the final hours of their fortnight. So it is never EARLIER
than the date they were promised, which is what separates it from the projection
every other cohort reads. It is not exact, and this spec does not claim it is.

### 3.5 ⚠️ The first-charge date comes from the server, never from the browser

Today the date is `billingDate(new Date())` — resolved once on mount, in the
browser, in the device's timezone, from `TRIAL_DAYS`. Every screen on `/billing`
formats dates server-side in the user's stored timezone instead, so the two can
disagree for anyone travelling. The paywall computes its own on its own mount, so
the two onboarding screens can disagree with each other across midnight.

The date is resolved on the server, in the user's stored timezone, by one shared
function, and passed down. The same value feeds the paywall, so the two screens
cannot differ.

**It is still a projection, and the spec says so rather than pretending otherwise.**
The subscription does not exist when the screen renders — nothing is created until
the button is pressed — so pre-purchase this is necessarily a prediction. What the
fix removes is the device-timezone divergence and the two-screens-disagreeing
problem. What it cannot remove is a user reading the screen at 23:58 and pressing at
00:02, where Stripe's actual trial end will fall a day later than the line they
read. That residual is accepted, stated here so it is a known limitation rather than
a surprise, and it is why **every date shown after the subscription exists comes
from Stripe and not from this projection.**

The mid-grace variant is exempt from all of the above: its date is a stored
`active_until`, not a projection.

**Derive, never `setState` in an effect body.** The lint rule forbids it and the
codebase respects it. The date arrives as a prop and is used as one.

### 3.6 Eligibility is resolved on the server, so the promise never changes under the user

Today the screen mounts with the generous default — eligible, seven days — and
corrects itself when the effect's call returns. In the setup-only world that was a
brief cosmetic flicker. With `02a` shipping, it is a payment screen that can say
"7 days free" and then say "First charge today" a moment later, while the user is
reading it.

**Resolve eligibility on the server, at page render, and pass it down as the initial
value.** The onboarding page is already a server component and already loads prices
server-side. This removes the flicker entirely and means the copy and `02a`'s
Elements mode are decided from the same answer at the same moment.

**The cost is honest and worth naming: it adds a Stripe round trip to first paint**
for a user who has a billing customer. A user with none never touches Stripe, which
is most first-timers. Correctness on the screen that takes money is worth the
milliseconds, and the alternative is a promise that mutates while somebody reads it.

**The fallback stays generous.** If the server cannot decide, it returns the same
generous default it does today. Erring the other way charges a first-timer against a
screen promising free days. `02a`'s mismatch guard is what catches the case where
the generous fallback and the server's later answer disagree, and it cancels rather
than charging.

### 3.7 ⚠️ The four facts, visible with the button, at both widths

Per ruling A4, the no-trial disclosure lines **are** the four required facts. "Starts
today" is the trial-length fact stated affirmatively; the amount with its currency,
the first-charge date, and "renews until you cancel" are the other three.

All four must be visible **at the same time as the button, without scrolling, at
390x844 and at 320x568.** A previous audit found this screen could be paid on with
the price scrolled out of view.

This spec owns the requirement. `09` owns the arrangement that satisfies it, and `09`
is the spec that moves the block below the button — which is exactly the change most
likely to reintroduce the defect. **Both specs verify it independently, at both
widths, by measuring on the running app.** A pass in one is not a pass in the other.

**The mid-grace variant is the tightest case** and must be measured specifically: its
lines carry a date where the others carry the word "today", so it is the longest the
disclosure ever gets.

**One short line for the subtitle.** At 320x568 a three-line subtitle under the
headline pushed the card fields off the top of the port, measured, leaving a payment
screen whose form you had to scroll up to find. Every draft in §7 respects that.

### 3.8 What is deliberately not changed

The monthly-equivalent bracket after the yearly amount is kept, per D18, and is
carried in §3.2 as decided copy rather than left open. The built trial title and
trial CTA stay as they are. The general error string stays as it is; only the paid
path's post-reconcile failure message changes, per D20 in §3.2. The Stripe Payment Element's own field labels are Stripe's and are not ours
to set.

### 3.9 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** §3.4 is this
  invariant on the one cohort where the approved copy and `01`'s guarantee collide,
  and it raises rather than resolves the two lines it is not sanctioned to change.
- **A screen never states a price, date or promise the server would contradict.**
  §3.3, §3.5 and §3.6 are three separate breaches of this and their three fixes.
  §3.3's refuse-to-render rule is the invariant applied at its strictest.
- **Access is decided by entitlements and nothing else.** The eligibility answer
  drives copy and `02a`'s Elements mode. It gates nothing, and nothing here may make
  it a gate.
- **A server action never accepts an identifier saying whose data to act on.** This
  spec adds no server action. The server-side eligibility resolve happens inside an
  already-authenticated page render, from the verified session.

### 3.10 If this goes wrong after go-live

Do not invent a recovery story. `BILLING_GATE_ENABLED=false` restores write access
without a deploy but stops no charge; stopping charges means cancelling at Stripe by
hand. The runbook is §9e of the founder's brief, carried in `12-go-live.md`. Refer to
it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Move eligibility to the server.**
Resolve the eligibility answer during the onboarding page's server render and pass it
down as the initial value, alongside the prices it already loads. Keep the generous
fallback on error. Remove the client-side fetch effect so there is one answer, not
two.
*Verify before moving on:* on a throttled connection the screen never renders trial
copy and then no-trial copy; view source and confirm the correct variant is in the
served HTML.

**Step 2 — Take the interval from Stripe, and refuse a bad one.**
Derive the suffix from the price's recurring interval instead of the static table.
Where the interval count is not one, render the existing "couldn't load your plan"
error rather than a price line, and do not let the button proceed.
*Verify before moving on:* create a temporary quarterly price in Stripe test mode,
point a plan at it, and confirm the screen refuses rather than printing "/mo". Delete
it afterwards.

**Step 3 — Resolve the first-charge date on the server.**
Compute it server-side in the user's stored timezone through one shared function, and
pass it to both the checkout screen and the paywall. Remove the browser computation.
**⚠️ Derive from the prop; do not `setState` inside an effect body.**
*Verify before moving on:* with the device timezone set well away from the stored
one, the date matches `/billing`'s formatting of the same instant; the paywall and
checkout show the same date across a midnight boundary in the same session.

**Step 4 — Replace the beta subtitle with the approved line.**
Swap the built string for the approved one, with the `14` rendering from
`BETA_GRACE_DAYS`. Character for character.
*Verify before moving on:* the rendered string matches §3.2 exactly, including
punctuation, and contains no em dash.

**Step 5 — Add the mid-grace variant.**
Select it on `reason === "beta"` and a non-null `graceEndsAt`. Render the subtitle,
title and two disclosure lines from §7's decisions once they land. Format the date
server-side, in the user's stored timezone, from the raw ISO instant.
**⚠️ Do not build this step against a guess.** If §7's items are still open, build
the selection logic and leave the strings marked `OPEN`, rather than writing
placeholder copy that could ship.
*Verify before moving on:* a seeded mid-grace account sees the variant; a seeded
post-grace account sees the approved lines from §3.2; no other cohort ever sees it.

**Step 6 — Measure the four facts at both widths.**
At 390x844 and at 320x568, with the accordion open and closed, confirm all four facts
and the button are on screen together without scrolling, for every variant, with the
mid-grace variant measured specifically as the longest case.
**⚠️ `http://127.0.0.1` does not hydrate. Any conclusion about tapping or measuring
drawn through it is invalid.**
*Verify before moving on:* measured, not inspected by eye.

**Step 7 — Drive every variant end to end against real Stripe test mode.**
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
- [ ] The screen still works with the newest migration UNAPPLIED
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
      (this spec should add none — confirm it added none)

The words:

- [ ] Every approved line in §3.2 renders character for character, punctuation
      included
- [ ] No em dash appears in any string on this screen
- [ ] The `14` in the beta subtitle comes from `BETA_GRACE_DAYS` and is not typed
      anywhere
- [ ] The trial title, trial CTA, trial disclosure lines 1 and 2, and the error
      string are unchanged from what was built
- [ ] No string was invented for a state not named in this spec
- [ ] **The six strings signed under D74 are byte-identical to what was signed**, and
      none was reworded, reflowed or "tidied"
- [ ] The paywall's interval suffix comes from Stripe, and nothing else about the
      paywall's copy changed

The numbers and dates:

- [ ] The interval suffix comes from Stripe's price for all three plans, and a
      price with an interval count other than one renders the error rather than a
      price line
- [ ] The amount and currency come from Stripe, with no client-side conversion
      anywhere
- [ ] The first-charge date is server-resolved in the user's stored timezone, and
      matches `/billing`'s formatting of the same instant with the device set to a
      different zone
- [ ] The paywall and the checkout screen show the same first-charge date in the
      same session, including across a midnight boundary
- [ ] A mid-grace user's date is their stored `active_until`, or the `01`-clamped
      value, never earlier than promised, and never a projection

The variants:

- [ ] New user: trial copy, seven free days, trial CTA
- [ ] Returning customer who used their trial: the approved no-trial lines
- [ ] Beta user whose fortnight has ended: the approved beta subtitle
- [ ] Beta user still inside their fortnight: the mid-grace variant, with the
      grace-end date, and never the word "today" in the disclosure
- [ ] The mid-grace variant contains no language of expiry, running out, or being
      used up, on any of its four lines, and never uses the word "trial"
- [ ] The monthly-equivalent bracket appears on yearly only, never on monthly or
      weekly
- [ ] The paid path's failure message renders D20's string and never says "trial"
- [ ] The copy never changes under the user after first paint, on a throttled
      connection
- [ ] With eligibility unresolvable, the screen shows the generous default and
      `02a`'s mismatch guard prevents a charge

The four facts:

- [ ] At 390x844, all four facts and the button are visible together, no scrolling,
      for every variant
- [ ] At 320x568, the same, for every variant
- [ ] The mid-grace variant specifically measured at both widths as the longest case
- [ ] Measured with the Payment Element accordion both open and closed
- [ ] The subtitle is one line at 320x568 in every variant

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

No founder decisions outstanding. All five are resolved and carried in §3.

~~`D20 — the paid path's failure string`~~ **Resolved 15 Aug 2026.** "We couldn't
start your plan just now. Nothing has been charged." Carried in §3.2; routed by `02a`
§3.10.

~~`D16 — the trial subtitle replacement`~~ **Resolved 15 Aug 2026.** "We're setting
billing up now, so nothing interrupts you later." Carried in §3.2. (Supersedes an
earlier sign-off on the founder's own draft; this is the signed line.)

~~`D17 — the mid-grace variant set`~~ **Resolved 15 Aug 2026.** Title "Nothing to pay
today."; subtitle "Your plan starts when your 14 days on us end, on {date}." (founder
wording, superseding the earlier draft, and deliberately avoiding the word "trial");
both disclosure lines as carried in §3.4; and the stated requirement that the variant
reads as welcome rather than warning.

~~`D18 — the monthly-equivalent bracket`~~ **Resolved 15 Aug 2026.** Kept, yearly
only, from the same Stripe price. A sanctioned addition to an approved line, carried
in §3.2.

~~`D19 — what a comp account sees here`~~ **Resolved 15 Aug 2026.** Nothing built.
`01` refuses a free-for-life comp before any Stripe object exists and there is no
route to this screen for them. Recorded so that adding one later is a decision rather
than a discovery.
