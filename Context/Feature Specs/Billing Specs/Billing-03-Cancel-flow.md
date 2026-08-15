Save as: Context/Feature Specs/03-cancel-flow.md

# Spec: Cancel Flow

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

**Depends on:** nothing that is not already built. It does not depend on the triple
and can be built alongside it.

**In no ship-together pair.** It is the half of the cancel experience that stands on
its own: a user can cancel, be told what happens, and change their mind, with no save
offer in existence.

**Seams out, and they are strict:**

- **`04-save-offer.md` owns everything from the moment the cancellation is written.**
  The offer dialog, the countdown, the reopen row, and the "Your trial is cancelled"
  decline screen are all `04`'s, including their copy. **This spec carries none of
  those strings.** It guarantees the ordering `04` depends on and hands over.
- `08-billing-screen.md` owns the surrounding card structure and the three screen
  states. This spec owns the cancel row's own behaviour, treatment and copy, and the
  un-cancel card. Where the two touch, `08` places and this spec behaves.
- **A resume does not un-burn the save offer.** The offer burns when it is shown,
  which happens on the cancel, and `04` treats that as final. So a user who cancels,
  sees the offer, then changes their mind is left running with no offer left. That is
  correct and deliberate, not a defect: the offer is one per customer ever, and it
  burns on being shown rather than on being taken.
- `16-account-deletion.md` depends on this spec's cancel machinery. Deletion uses a
  different function, which cancels immediately rather than at period end, and the
  two must not be confused. §3.7.

**Every date on these screens comes from the server**, already formatted in the
user's stored timezone before it reaches the client. Nothing here computes or
formats a date in the browser.

---

## 1. Goal

Leaving is quiet, honest, and about as easy as joining.

Cancelling destroys nothing. The user keeps every day they paid for, keeps every log
forever, and can change their mind right up to the date. The screen says so in the
founder's words, and the words are the same whether they are on a trial or two years
into a subscription.

Underneath, one ordering matters more than anything else on the screen: **the
cancellation is written to Stripe before anything else happens.** Whatever comes
after it — a save offer, a closed tab, a dropped connection, a crash — the user is
cancelled. That ordering is the compliance story and it is what `04` is allowed to
assume.

Most of this is built and most of it is right. This spec's job is to say which parts
are correct and exactly how to prove it, fix the two places it diverges from approved
copy, and build the one piece that does not exist: the confirmation a user sees after
changing their mind.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** build, change, or carry any copy for the save offer, its countdown, its
  reopen row, or the "Your trial is cancelled" decline screen. All of it is `04`.
  If a change here seems to require touching one, stop and ask.
- **Do NOT** reorder anything so that the offer is looked up, rendered, or decided
  before the cancellation is written. That ordering is not an implementation detail.
- **Do NOT** restructure the Billing screen's card, rows, or states. That is `08`.
- **Do NOT** add a subscribe control, an upgrade control, or a plan switcher to this
  screen. Nothing may route a user at the paywall without the founder's word, and
  plan switching is `15`.
- **Do NOT** make cancelling harder: no extra confirmation step, no typed
  confirmation, no reason-required dropdown, no interstitial.
- **Do NOT** style the cancel row as destructive. Not red, no danger heading, no
  warning icon. `DANGER_ROW` is reserved for sign-out and account deletion.
- **Do NOT** use amber for any button, tab, or call to action anywhere in this work,
  including inside the un-cancel card.
- **Do NOT** write to `entitlements` from any cancel or resume path. Access already
  runs to the right date and the clock does the work.
- **Do NOT** use the immediate-cancel function. It exists for account deletion only.
  §3.7.
- **Do NOT** add an argument to `cancelSubscription` or `resumeSubscription`, or
  accept a subscription id from a client under any circumstances.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| Cancellation written to Stripe first, offer looked up afterwards | **Correct.** The single most important line in the flow. §3.2 |
| `cancelSubscription()` and `resumeSubscription()` take no arguments and resolve identity from the session | **Correct.** §3.6 |
| Cancel applies to **every** live subscription, not one | **Correct**, and a fix. §3.6 |
| `cancel_at_period_end`, never an immediate cancel | **Correct.** §3.7 |
| Neither path writes `entitlements` | **Correct.** §3.8 |
| The cancel confirmation's title, body and buttons | **Correct**, matches approved copy character for character. §3.3 |
| The row is a quiet muted text row in its own block, not a button, not red | **Correct.** §3.4 |
| Hand-rolled dialog, portaled to body, focus-trapped, `pointer-events-auto` on the backdrop | **Correct.** §3.5 |
| The resume confirmation dialog's four strings | **Never signed off.** Raised as D21. §3.9 |
| The resume trigger's label | **Diverges from §6 of the brief.** Raised as D22. §3.9 |
| The un-cancel confirmation card | **Does not exist.** Built here. §3.10 |

### 3.2 ⚠️ The ordering, which is the whole point

The cancellation is written to Stripe **first**. The save offer is looked up
**after**, from the already-cancelled state. Every exit from whatever follows —
declining, Escape, the backdrop, a closed tab, a lost signal, a crashed browser —
leaves the user cancelled, because cancelling already happened before any of those
were possible.

This is built correctly today: the flag is applied to every live subscription, and
only then is the offer looked up and returned alongside the result.

**Nothing may move in front of it.** Not an offer eligibility check, not an analytics
call, not a confirmation. If the offer lookup throws, the user is still cancelled and
the cancellation still succeeded — the return value carries the offer optionally, and
an absent offer is a normal outcome rather than a failure.

**Verify it by breaking it, not by reading it.** Kill the connection between the
write and the offer lookup and confirm Stripe still shows the subscription cancelling
at period end. That is the only proof that counts.

### 3.3 The approved copy, verbatim

The cancel confirmation is built and already matches. It is reproduced here because a
spec that does not carry its own copy cannot be checked against the screen.

**Title**, on the noun that matches what they are on:

> Cancel your trial?

> Cancel your subscription?

**Body**, identical for both:

> You'll have full access to your Pro plan until [date], and you won't be charged. After that your account goes read only. You'll still see your whole history, you just can't add to it.

**Buttons:**

> Keep my trial

> Yes, cancel

The `[date]` is the end of access — the trial end while trialing, the period end once
paying — read from the mirror, formatted server-side in the user's stored timezone,
and passed to the dialog as a finished string.

**The second sentence is the point of the copy and must not be trimmed.** An earlier
version said only what would not happen. This says what they are giving up, in the
app's own words for it, and "read only" is the exact phrase used on every surface.

### 3.4 The row: quiet, at the foot, and not a warning

The cancel control is a muted text row in its own block below the plan card, set
apart from it. It is not a button, not red, and carries no danger heading, because
cancelling here is not destructive: nothing is deleted, every paid day is kept, and
the decision is reversible until the date.

Follow `Context/ui-context.md` for the row's colour, spacing and treatment. It reads
as the quietest row on the screen and it must still be a 44px tap target.

**⚠️ Leaving must stay about as easy as joining.** Subscribing is three taps.
Cancelling must not be materially harder, and §5 makes that a counted check rather
than an opinion.

### 3.5 The dialog's mechanics, which are correct and must stay correct

The dialog is hand-rolled rather than Radix: a `role="dialog"` with `aria-modal`, its
own focus trap keyed on the phase rather than on an open flag, its own Escape
handler, and its own backdrop click. It is portaled to `document.body`.

**⚠️ `pointer-events-auto` on the backdrop is load-bearing and must not be removed.**
A Radix modal elsewhere sets an inline `pointer-events: none` on `<body>`, and a
body-portaled dialog inherits it. When that happened on another surface, every
control inside the dialog was dead to touch and Escape was the only way out — and a
phone has no Escape key, so the only escape was reloading the app.

**The backdrop check must keep testing the in-flight ref as well as the pending
flag.** A backdrop tap in the same tick as "Yes, cancel" closed the dialog mid-request
and left a failure with nowhere to render.

**The focus trap is keyed on phase because the dialog's contents are replaced** when
`04`'s offer follows the confirmation. Keep that keying; an open/closed boolean
strands focus on the swap.

### 3.6 Identity, and why these actions take nothing

Neither action takes an argument. The user comes from the verified session; the
customer is read through the caller's own RLS-scoped client, so the database refuses
a stranger's row independently of the query; and the subscription ids come from
Stripe, never from the client.

**⚠️ Every export of a `"use server"` module is a publicly dispatchable HTTP
endpoint.** Any helper added during this work stays private to its module.

**Cancel applies to every live subscription on the customer.** "Cancel my
subscription" means stop billing me, not stop billing me for whichever row sorted
first. This is a fix, not a flourish: a single-row read is what previously cancelled
the wrong subscription and took a full year's payment. Do not narrow it.

### 3.7 Period end, never immediate, and the one function that is not this one

The user-facing path sets `cancel_at_period_end` and nothing else. It cannot switch a
plan, change a price, alter a trial, or touch entitlements, and that narrowness is
deliberate: a control that reaches into a payment provider should be exactly the
promise it keeps and not one field wider.

Stripe accepting the change is what makes it real. If the local mirror write then
fails, that is logged and not thrown, because telling a user their cancellation did
not go through when it did is the worst available lie. The webhook reconciles a
moment later.

**⚠️ There is a second function that cancels immediately, and it is not for this
flow.** It exists for account deletion, where there is no access left to preserve and
an orphaned live subscription would bill with nothing connecting it to a person. It
must never be called from a cancel row. `16-account-deletion.md` owns it.

### 3.8 Cancelling never revokes what was paid for

No cancel or resume path writes `entitlements`. The entitlement's `active_until`
already holds the right date, and the clock does the work. Access ends when the paid
period ends and not a moment earlier.

The mirror supplies the date the screen displays and gates nothing. Access is decided
by entitlements alone, on both sides of a cancellation.

### 3.9 Two divergences to resolve, not to fix quietly

**The resume confirmation dialog stays, and its four built strings are now signed
(D21).** Resuming re-arms a charge, and this is the only surface that says so before
it is re-armed. Carried as decided copy:

- Title: the trigger's label with a question mark.
- Body: "Your {trial|subscription} carries on as normal and finishes on {date}. You'll be charged then unless you cancel again."
- Buttons: "Not now" and "Yes, keep it".

The body names the charge and the date, which is the same standard the save offer's
terms line is held to.

**The resume trigger's label becomes "Keep my Pro plan" (D22)**, as §6 of the brief
has it, replacing the built "Keep my trial" / "Keep my subscription". It is
plan-agnostic, so it needs no branching on status and cannot drift out of step with
it, and it matches the naming rule that a plan is "your Pro plan".

**⚠️ The cancel dialog's own dismiss button is a different control and is
unaffected.** It stays "Keep my trial", which is approved copy for that control. Two
controls, two labels, deliberately.

### 3.10 The un-cancel confirmation, which does not exist yet

After a user changes their mind, an amber confirmation card appears at the top of
Billing:

> Glad you're staying.

> Your trial will carry on as usual.

It fades in, it is dismissible, and **it is held in component state only, so leaving
the screen clears it.** It is not persisted, not stored in a cookie, and not derived
from the subscription — it is a response to an action the user just took, and it
belongs to that moment only.

**⚠️ Amber is permitted here and only here in this spec.** A confirmation of a live
state change is what amber is for. But the card carries no amber button, no amber
call to action, and no amber tab; if it has a dismiss control, that control is not
amber. Follow `Context/ui-context.md` for everything else about it, and do not add
anything to that file's exception list.

**The fade collapses to nothing under `prefers-reduced-motion`.**

**⚠️ It must survive the revalidation that follows the resume.** The resume action
revalidates the Billing path, so the screen re-renders from the server the instant
the card should appear. If the component remounts rather than reconciling, the card
is destroyed in the same tick it is created. This is a verification item, not an
assumption, and if it does remount, stop and ask rather than reaching for
`sessionStorage` — persistence is precisely what the approved behaviour rules out.

**Derive, do not `setState` in an effect body.** The card's visibility follows from
the action's result in the transition callback, not from an effect watching the
subscription.

**The second line's noun follows the subscription's status**, as every other string
in this flow already does. A trialist reads the approved line unchanged; a paying
customer reads "Your subscription will carry on as usual." This is a sanctioned
one-word branch to signed copy, decided alongside D21 and D22.

### 3.11 Invariants this spec touches, and how the work preserves each

- **The cancellation is written before the offer exists, always.** §3.2. Verified by
  interrupting the sequence, not by reading it.
- **Cancelling never revokes access already paid for.** §3.7 and §3.8: period end
  only, and no entitlement write on either path.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** Nothing in this flow touches user data, and the copy says so in the
  sentence about read only.
- **A server action never accepts an identifier saying whose data to act on.** §3.6.
  Both actions keep zero arguments.
- **Access is decided by entitlements and nothing else.** §3.8. The mirror is
  display-only on both sides of a cancellation.
- **A screen never states a price, date or promise the server would contradict.**
  Every date on these surfaces is server-formatted from the mirror, which is written
  from a live Stripe object rather than from a webhook payload.
- **Nobody is ever charged after being told they would not be.** The resume path
  re-arms a charge, which is why §3.9 recommends keeping a confirmation that says so
  before it happens.

### 3.12 If this goes wrong after go-live

Do not invent a recovery story. `BILLING_GATE_ENABLED=false` restores write access
without a deploy but stops no charge; stopping charges means cancelling at Stripe by
hand; there is no support tooling and no in-app control to fix an individual's
subscription. The runbook is §9e of the founder's brief, carried in `12-go-live.md`.
Refer to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Adjudicate what is built, before changing anything.**
Read the cancel component, both server actions, and the Billing page against §3.1's
table. Confirm each verdict against the code rather than against this spec. Record
anything that does not match what §3.1 claims and stop, because the rest of these
steps assume the table is accurate.
*Verify before moving on:* a written line per row saying confirmed or diverged.

**Step 2 — Prove the ordering by interrupting it.**
Drive a cancellation in Stripe test mode and interrupt between the write and the
offer lookup. Then do the same with the browser closed mid-request, and with the
network dropped. In every case, confirm in the Stripe dashboard that the subscription
is set to cancel at period end.
*Verify before moving on:* three interruption modes, three cancelled subscriptions,
zero cases where the user is left uncancelled.

**Step 3 — Confirm the approved copy renders character for character.**
Compare every rendered string against §3.3, including punctuation. Confirm the date
is server-formatted in the stored timezone and never computed in the browser.
**⚠️ No em dash in any user-facing string.**
*Verify before moving on:* both nouns, both dialogs, screenshots at 390x844.

**Step 4 — Build the un-cancel confirmation card.**
Per §3.10: amber, fading in, dismissible, component state only, above the plan card.
Follow `ui-context.md` for its treatment. No amber button anywhere in it.
**⚠️ Verify it survives the resume action's revalidation.** If the component
remounts, stop and ask.
**⚠️ The fade collapses to nothing under `prefers-reduced-motion`.**
*Verify before moving on:* the card appears after resuming, dismisses, and is gone
after navigating away and back.

**Step 5 — Apply D21 and D22.**
Change the resume trigger's label to "Keep my Pro plan" everywhere it is derived, and
confirm the resume dialog's four signed strings render unchanged. Add the un-cancel
card's noun branch.
**⚠️ Do not touch the cancel dialog's own "Keep my trial" dismiss button.** It is a
different control and it is approved copy.
*Verify before moving on:* the trigger reads "Keep my Pro plan" on both a trial and a
paid subscription, and the cancel dialog's dismiss button is unaffected.

**Step 6 — Count the taps.**
Measure the tap count from the app's home surface to a completed cancellation, and
from the same surface to a completed subscribe. Record both numbers.
**⚠️ `http://127.0.0.1` does not hydrate. Any tap conclusion drawn through it is
invalid.**
*Verify before moving on:* the two numbers, written down. If cancelling is more than
one tap longer than subscribing, stop and raise it.

**Step 7 — Attack both actions.**
Anonymous caller, another signed-in user, forged arguments, and the victim's ids.
Then concurrency: two cancels at once, cancel and resume together, and double taps in
the same tick.
*Verify before moving on:* every case refused or converged, with exactly one outcome
per account.

**Step 8 — Drive the whole flow against real Stripe test mode with a test clock.**
Trial cancel, paid cancel, resume, and cancel again, across the period boundary.
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
- [ ] Every tap target at least 44px, including the quiet cancel row
- [ ] Animation collapses to nothing under `prefers-reduced-motion`, including the
      un-cancel card's fade
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
      (this spec should add none — confirm it added none)

The ordering:

- [ ] Stripe shows the subscription cancelling at period end after an interruption
      between the write and the offer lookup
- [ ] The same after a closed tab mid-request
- [ ] The same after a dropped connection mid-request
- [ ] An offer lookup that throws still returns a successful cancellation
- [ ] Nothing was moved in front of the write

The words:

- [ ] Every string in §3.3 renders character for character, both nouns, punctuation
      included
- [ ] No em dash appears anywhere in this flow
- [ ] The date is server-formatted in the user's stored timezone and matches the
      mirror
- [ ] No string belonging to `04` appears anywhere in this spec's work

The row and the card:

- [ ] The cancel row is muted, not red, not a button, in its own block below the plan
      card, with no danger heading
- [ ] The un-cancel card appears after resuming, is dismissible, and is gone after
      navigating away and returning
- [ ] It survives the resume action's revalidation without being destroyed
- [ ] Nothing amber in it is a button, a tab, or a call to action
- [ ] Nothing was added to `ui-context.md`'s exception list

Money and access:

- [ ] Cancelling leaves every paid day intact, verified across the period boundary on
      a test clock
- [ ] Neither path writes to `entitlements`
- [ ] Cancel applies to every live subscription on the customer, verified with two
      live subscriptions seeded deliberately
- [ ] The immediate-cancel function is never reached from this flow
- [ ] Resuming re-arms the charge and the user is told so before it happens

Ease of leaving:

- [ ] Tap count to cancel, and tap count to subscribe, both recorded
- [ ] Cancelling is not materially harder than joining
- [ ] No extra confirmation, typed confirmation, or required reason was added

Attacks and races:

- [ ] Both actions refuse an anonymous caller and another signed-in user
- [ ] Neither accepts a subscription id from the client
- [ ] Two cancels in the same tick leave exactly one outcome
- [ ] Cancel and resume issued together converge on the expected state: the
      subscription running, the cancellation lifted, AND the save offer already
      burned, since `markOfferShown` fired on the cancel and a resume does not
      restore it
- [ ] Double-tapping the confirm button produces one request and one result

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

No founder decisions outstanding. Two questions remain with the implementer, neither
blocking.

~~`D21 — the resume confirmation dialog`~~ **Resolved 15 Aug 2026.** It stays, and
its four built strings are signed as-is. Carried in §3.9.

~~`D22 — the resume trigger's label`~~ **Resolved 15 Aug 2026.** "Keep my Pro plan",
per §6 of the brief. The cancel dialog's "Keep my trial" dismiss button is a separate
control and is unchanged. Carried in §3.9.

~~`The un-cancel card's second line`~~ **Resolved 15 Aug 2026.** The noun follows
status: "Your subscription will carry on as usual." for a paying customer, the
approved trial line unchanged for a trialist. Carried in §3.10.

**`Q82`** — what `resumeLabel` is computed from, so D22 can be applied in one place
rather than two. Traceable during Step 1.

**`Q83`** — what consumes `savedAt` on the action results today. The un-cancel card
may be able to key off it rather than adding state.
