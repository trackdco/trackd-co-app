Save as: Context/Feature Specs/05-read-only-gate.md

*(Canonical path. The founder saves these locally as `billing-05 - Read Only Gate.md`,
so the filename on disk may differ. Cross-spec references are by number — 01, 02a,
05 — which is unambiguous either way.)*

# Spec: Read-Only Gate

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

**Depends on:** nothing built. It can proceed alongside the triple.

**⚠️ SHIP-TOGETHER PAIR — this spec and `06-beta-grace-and-notices.md` ship together
or not at all.**

Turning the gate on before the ~90 accounts have entitlement rows puts every real
user of this product into read-only overnight, with no notice, having been given
none. There are **zero** entitlement rows in the database today. The gate is
currently off and the backfill has never been run.

**The order is not negotiable and belongs to `12-go-live.md`:** live keys, then run
the backfill, then verify the rows exist, then set the flag. Never the flag first.

**Seams:**

- `06` owns the backfill itself, the grace window, and the two one-time notices. This
  spec owns what happens once access has lapsed.
- `07-notifications.md` owns which reminders a read-only account does and does not
  receive. This spec owns the `canWrite` decision it re-derives.
- `08-billing-screen.md` owns the lapsed state of the Billing screen. This spec owns
  the pop-up that appears when a lapsed user tries to add something.
- `11-reconciliation-and-alerting.md` inherits the entitlement invariants in §3.7 as
  assertions.
- **`16-account-deletion.md` is exempt from this gate in its entirety.** Deletion
  today is a support-email path with no in-app write. When `16` builds self-serve
  deletion, its whole flow is ungated by design, including its cancel-at-Stripe first
  step and every data-removal write that follows. `16` carries the reciprocal seam
  and a Check When Done item: a lapsed, read-only user completes self-serve deletion
  end to end. **A lapsed user can always leave. The gate never blocks the exit.**
- `02b` owns checkout copy. The pop-up's route into checkout is this spec's; the
  screen it lands on is not.

**This spec carries the entitlement-writing section** (per M3). The writers are
coherent and well-documented enough to live here as a section rather than as a
separate spec, but they are the highest-consequence code in the build and §3.7 treats
them accordingly.

---

## 1. Goal

When access lapses, the user stops adding and nothing else.

Every screen opens. Everything already logged stays readable. Nothing is ever
deleted. They can still remove their own data, still fix their timezone, still turn
off notifications about a subscription they no longer have, still tell us why they
left. What stops is writing new data, and the app says so in the same words on every
surface.

**"Read only" is the exact phrase, everywhere.** Not "paused", not "expired", not
"locked".

Underneath it, one rule: access is decided by entitlements and nothing else. Not by a
Stripe status, not by the subscriptions mirror, not by a client flag. The gate asks
one question — does this user have active access to `pro` right now — and the answer
comes from one table.

Most of the gate is built and the parts that matter are right. This spec adjudicates
it, replaces the pop-up's copy with the approved copy, fixes the defect where a
refused write tells the user the app is syncing, and closes the hole where a write
function added tomorrow is ungated by default.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** gate a delete, an archive, a close, or anything else that winds
  something down. Removing your own data is yours to do.
- **Do NOT** gate settings, timezone, notification preferences, push subscription
  management, or profile edits.
- **Do NOT** gate any read. Not one.
- **Do NOT** gate feedback submission. A lapsed user telling us why they left is the
  last thing to block.
- **Do NOT** gate cancel or resume.
- **Do NOT** hide, blur, truncate, watermark, or paywall any data the user has
  already logged. Read-only means read-only, not a teaser.
- **Do NOT** decide access from a Stripe status, the `subscriptions` mirror, a
  `stripe_` column, or anything a client can send.
- **Do NOT** write to `entitlements` from client-side code, or add an insert, update
  or delete policy to that table. The database enforces this today and must keep
  enforcing it.
- **Do NOT** run the beta backfill, set `BILLING_GATE_ENABLED`, or apply any
  migration. Those are `06` and `12`.
- **Do NOT** change the beta notices, the grace window, or how the grace is
  identified. That is `06`.
- **Do NOT** add an argument to any gate function that identifies whose access to
  check.
- **Do NOT** widen `lib/db/admin/` to return a row.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| Access read from `entitlements` only, never from Stripe or the mirror | **Correct**, and it is the whole architecture. §3.2 |
| `entitlements` is SELECT-only to the user, with no write policy and no write grant | **Correct.** Enforced by the database rather than by convention. §3.2 |
| The entitlement read fails CLOSED; the gate switch fails OPEN | **Correct**, and the two directions are deliberate. §3.3 |
| Guards sit on the write function itself, not on the route action | **Correct.** §3.4 |
| Deletes, settings and reads are never gated, with a test pinning deletes | **Correct.** §3.5 |
| `READ_ONLY_MESSAGE` avoids "your subscription has ended" | **Correct reasoning, unsigned words.** §3.6 |
| The pop-up is portaled with `pointer-events-auto` on the backdrop | **Correct, and load-bearing.** §3.8 |
| The entitlement writers, and their three shortening rules | **Correct.** §3.7 |
| The pop-up's title, body, buttons and footnote | **Diverges from the approved copy almost entirely.** §3.6 |
| A refused write shows a generic "still syncing" notice on most surfaces | **Defect.** §3.9 |
| Nothing added later is gated by default; no interceptor exists | **Hole.** §3.10 |

### 3.2 One question, one table

Every gate asks whether this user has active access to `pro` right now, and reads
`entitlements` to answer. It never asks Stripe. The webhook writes that table; Apple
and Google will write the same table through their own path when the product reaches
the app stores, and not one line of the read path changes.

**If any access check anywhere reads a Stripe subscription status, a `stripe_`
column, or the `subscriptions` table, the work has failed regardless of whether
payments work.** The mirror exists so a screen can say "renews on the 14th" without a
network call. It is display, and it gates nothing.

The rule itself is pure and tested, and the admin dashboard imports the same
predicate rather than restating it, so the dashboard cannot compute access
differently from the product. Keep that.

**Identity is not a parameter.** The function every gate calls resolves the user from
the verified session. A gate that takes a user id is a gate that can be pointed at
somebody else's. Row-level security is the backstop underneath; the caller should not
be able to ask the question about another user in the first place.

### 3.3 The two failure directions, which are opposite on purpose

**The entitlement read fails closed.** A database that will not answer is not
permission to enter.

**The gate switch fails open.** An unset environment variable must not lock out a
paying user, and the switch is checked before the entitlement read so an unset value
short-circuits to full access.

`BILLING_GATE_ENABLED` is compared strictly against the literal string, so anything
else is off. It is unset today. **It is also the kill switch:** setting it false
returns every account to full write access immediately, without a deploy. It stops no
charge — that is `12`'s runbook and §9e of the brief.

The same switch decides the Billing screen's access label, which is why it is a
function rather than an inline environment read. Off, an account with no entitlement
genuinely has the whole product. On, the same account is read-only, and a screen
still saying "Pro" would be lying at the worst moment.

### 3.4 The guard sits on the write, not on the route

**⚠️ Every export of a `"use server"` module is a publicly dispatchable HTTP
endpoint with its own id.** Gating a route action while leaving its data-layer sibling
exported is a lock on a door beside an open window, and a review drove exactly that:
the action refused and the underlying function wrote the row anyway.

So the guard is an explicit line inside each write function in the data layer, not in
middleware, not in a wrapper, and not in row-level security. There is no policy
anywhere that consults entitlements, and none is to be added — the gate is an
application decision about a product state, and RLS is about ownership.

The client-side provider is a user-experience affordance and explicitly not the
boundary. What it buys is that the user sees the real reason and the device's local
storage is never written for something the server has refused.

### 3.5 What is never gated, and why each

**Deletes and anything that winds something down.** Removing data you put in is
yours to do. A review once found a version that gated the non-destructive close while
leaving the destructive delete open, which left a lapsed user with a block that said
"running" forever. There is a test pinning this; keep it and extend it to anything
new.

**Settings, timezone, notification preferences and push subscriptions.** A lapsed
user must be able to fix their timezone and turn off reminders about a subscription
they no longer have.

**Every read.**

**Account deletion, in full, when it exists.** Today it is a support email and there
is nothing to gate. When `16-account-deletion.md` builds the self-serve path, none of
it is gated: not the Stripe cancellation that must come first, not the data removal
that follows. Gating any part of it would trap a lapsed user in an account they have
asked to leave, which is the worst possible reading of a read-only state.

**Feedback submission.** Directly relevant to `10-refund-requests.md`: a refund
request routed through the feedback path works in read-only today, and must keep
working.

**Cancel and resume.**

### 3.6 The pop-up: approved copy, and a structural divergence to decide

The approved pop-up, shown when a lapsed account tries to add anything:

> Your account is read only

> You don't have access at the moment, so Trackd Co is read only. You can still view everything you've logged, you just can't add to it.

> Nothing has been deleted.

> **⚠️ THE FIRST CLAUSE WAS RE-SIGNED 18 Aug 2026 (D98), AND THIS LINE CARRIES THE
> CORRECTED TEXT.** The originally approved opening — "You're not on a plan at the
> moment" — is **false for a past-due customer**, who IS on a plan Stripe is still
> charging, two taps from a screen reading "Renews on" and offering Cancel.
>
> A first reworking, "Your access has ended", was wrong in the OTHER direction: it is
> a statement about HISTORY and false for anyone who never had access, which after the
> 17 Aug backfill is every new sign-up. What is signed is a statement about **now**,
> true of all six cohorts: never had access, lapsed grace, lapsed trial, lapsed
> subscription, revoked, and past-due after the lapse.
>
> **The answer was to reword so one body fits, NOT to branch.** If a second variant
> ever seems necessary, that is the signal to stop and ask.
>
> ⚠️ **Since 20 Aug 2026 these five strings live in `lib/billing/readOnlyCopy.ts` and
> are pinned codepoint-for-codepoint against `lib/billing/signed/read-only-popup.txt`
> by `signedCopyPin.test.ts`.** They were JSX text in `components/`, which the
> committed suite cannot reach — a cold review reverted this clause to the wording
> above and watched all 1573 tests pass. Editing the copy here means editing the
> signed file too, or the suite fails. See `lib/billing/signed/README.md` for the
> standing rule on which signed strings get a machine check.

Buttons:

> Back to my logs

> Choose a plan

**The built pop-up is a different screen.** Its title sells rather than states
("Subscribe to keep logging"), its body leads with reassurance rather than with the
state, its buttons are "Not now" and "Subscribe", it carries an unsigned footnote,
and **it embeds a live plan selector with real Stripe prices**, which the approved
design does not have at all.

The copy is decided and is replaced with the approved lines above, character for
character. **The structural question — whether the plan selector stays — is not
copy, and it is D28 in §7 rather than something to resolve in either direction
here.** The two are entangled: "Choose a plan" is a button that goes somewhere, and a
pop-up that already shows the plans has nowhere for it to go.

**The approved body leads with the state, and that ordering is the point.** A user
who has just been blocked needs to know what is happening before they are told what
it would cost to undo it. The built version's reassurance-first ordering is defensible
and it is not what was signed off.

**The server's refusal string is a separate surface** and covers paths the pop-up
does not reach. Its reasoning is right and must survive whatever happens to the
wording: it deliberately does not say "your subscription has ended", because that is
false for the ~85 beta accounts who reach read-only having never had a subscription,
and telling somebody a transaction ended that never happened is the app inventing
history in the message explaining why they cannot log a dose. It is unsigned; D29 in
§7.

### 3.6b The final-day banner

**Decided.** On the user's final entitled day, and on that day only, a single quiet
banner reads:

> Your plan ends today.

Styled per the existing banner pattern, tapping through to Billing. Follow
`Context/ui-context.md`; add nothing to its exception list.

**⚠️ On any day a user is eligible for both this banner and a pair-2 reminder banner
from `07`, the reminder renders and this banner is suppressed.** It applies to every
cohort, not only trialists: a courtesy user's final day shows exactly one banner and
it is `07`'s. The promised reminder always wins, because it is the one made in
writing on the offer screen. This spec must not render a second banner under any
condition.

**One day only.** Not a countdown, not a week of escalating notices. The reminder
before the ending is `07`'s job; this is the last day, stated once.

### 3.7 The entitlement writers

Six writers, and nothing else can write the table.

| Writer | Trigger | Effect |
|---|---|---|
| The subscription sync | `created`, `updated`, `trial_will_end`, `invoice.paid` | Upsert on user, product and source |
| Past-due handling | `invoice.payment_failed` | Shortens `active_until` to paid-through plus the grace |
| Subscription ended | `deleted` | Shortens only, and refuses a null period end |
| Revocation | dispute created, charge refunded | Deactivates immediately, date untouched |
| The offer claim | user takes the save offer | Calls the sync directly rather than waiting for the webhook |
| The beta backfill | hand-run, by `06` | Inserts the comp row |

**Three invariants live in here and are the reason this section exists.**

**A trialing subscription entitles only once a card has validated.** Otherwise a
trial is seven free days for anyone who can type sixteen digits.

**Past-due does not advance the clock.** A renewal that is going to fail does not
look like a failure straight away: the subscription reports active with the period
rolled forward, and only then does the charge fail. Treating that as entitling gave a
free month per failed payment, repeatable — measured, one date became the next
month's on a card that declined. So the failure handler pulls the date back to the
end of the last period actually paid for, plus the grace, and **can only ever
shorten**.

**Deletion may only shorten too.** An earlier version wrote the computed end
unconditionally after a cancellation and handed back the exact free month the
past-due handler had just removed.

**⚠️ The grace window rests on an assumption about the Stripe dashboard.** It is
three days, written so that it lands inside Stripe's first retry, so a card that works
on the second attempt is never noticed by the user. Smart Retries is on with up to
eight attempts over two weeks and publishes no fixed schedule. **Per the founder's
ruling, the window is neither widened nor narrowed on assumption**: `12-go-live.md`
measures the first retry's timing on a test clock, and the decision follows the
measurement. This spec states the assumption so it is visible rather than implicit.

**⚠️ Disputes diverge from Stripe deliberately.** Stripe leaves a disputed
subscription overdue; the app deactivates the entitlement immediately. Both are
defensible and they disagree, so `11` asserts against the app's rule rather than
Stripe's status, per the founder's ruling. Named here so a reviewer reads a decision.

**Every subscription handler re-reads the object from Stripe before acting**, rather
than trusting the webhook payload. Stripe guarantees no ordering and delivers
concurrently, and three separate wrong outcomes were measured from reordering alone.
Keep that.

### 3.8 The pop-up's mechanics

**⚠️ `pointer-events-auto` on the backdrop is load-bearing, not defensive.** A Radix
modal sets an inline `pointer-events: none` on the body while it is open and
re-enables it only on its own overlay. This pop-up portals to the body, and every one
of its trigger points is a control inside an already-open sheet — attaching bloodwork,
the calendar's one-off add, the dose detail sheet, add-stock. Without the class, the
pop-up paints correctly on top and nothing inside it can be touched. It was measured:
zero hit-testable elements, real taps timing out, and Escape the only way out — **and
a phone has no Escape key**, so the only escape was reloading the app.

**⚠️ A portal renders nothing on the server.** This pop-up cannot be verified from
served HTML; only the server's decision can. Every claim about it must come from
driving the running app.

### 3.9 ⚠️ Defect: a refused write tells the user the app is syncing

Sixteen gated functions return a bare success shape carrying a read-only flag, and
only one sheet in the entire app reads that flag. Every other refusal falls through
to the generic "still syncing" notice.

So a lapsed user taps to log a dose, the server refuses, and the app tells them it is
still syncing. That is untrue, it invites them to wait and try again, and it hides
the one fact they need — that they are read-only and nothing was lost.

**Every refused write surfaces the read-only state**, either by opening the pop-up
where a pop-up makes sense, or by rendering the server's refusal string where it does
not. No refused write may render the syncing notice.

This is the difference between a gate and a gate the user can understand, and it is
the kind of defect that generates support mail rather than conversions.

### 3.10 ⚠️ Hole: nothing added later is gated by default

There is no interceptor and no middleware. A write function added next week is
ungated unless somebody remembers, and the failure is silent — the feature simply
works for a lapsed user.

There is already a script that parses function bodies and regenerates the gate list.
**Wire it into the check sequence so an ungated write fails the run**, alongside the
type check and the linter, and treat a new ungated write as a build failure rather
than a review comment.

The two conditionally gated functions — where one function serves both directions,
and only the direction that adds is refused — stay conditional and must be
recorded as deliberate exceptions the script knows about, not as failures to be
silenced.

### 3.11 Invariants this spec touches, and how the work preserves each

- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** Every read stays open, every delete stays open, and §2 forbids
  blurring, truncating or teasing logged data. Read-only is a write gate and nothing
  more.
- **Access is decided by entitlements and nothing else.** §3.2, and the ban in §2 on
  reading a Stripe status or the mirror for an access decision.
- **A server action never accepts an identifier saying whose data to act on.** §3.2's
  session-resolved identity and §3.4's guard placement. **⚠️ Every export of a
  `"use server"` module is publicly dispatchable.**
- **Nobody is ever charged after being told they would not be.** §3.7's shortening
  rules: a failed payment must never be able to hand out more access than the user
  already had, and a lapse must never extend one.
- **No user holds more than one billable subscription at any moment.** The writers
  key on user, product and source, so a comp and a Stripe entitlement coexist as two
  rows rather than one silently destroying the other.
- **A screen never states a price, date or promise the server would contradict.** The
  gate switch decides the access label as well as the gate, from one function, so the
  label and the behaviour cannot disagree.

### 3.12 The unapplied-migration state

This spec adds no column and no migration. It still has to be correct in the window
where one is unapplied, because the deploy and the hand-applied migration do not land
in the same instant.

**⚠️ An unapplied migration reports `PGRST204` on a write and `42703` on a read.**
PostgREST validates a write body against its own schema cache before Postgres sees
it, so the Postgres code never arrives on the write path. Code handling only one of
the two has already caused a payment path to fail closed on this project.

**⚠️ A column added to a select breaks the ENTIRE request if the migration is not
applied.** Any new column is read in its own tolerant query, never folded into an
existing select — especially not into a select that decides access.

### 3.13 If this goes wrong after go-live

`BILLING_GATE_ENABLED=false` is the kill switch and returns every account to full
write access immediately, without a deploy. It stops no charge.

**It is also the stated recovery for a database outage.** The entitlement read fails
closed, deliberately, so a Supabase outage with the gate on puts every account into
read-only until the database answers again. Setting the switch false is what restores
write access in that window, and it is faster than any deploy. That is the direct
consequence of the fail-closed choice in §3.3 and it is worth knowing before it
happens rather than during. Stopping charges
means cancelling at Stripe by hand, there is no in-app mass stop, and there is no
support tooling to fix an individual. The runbook is §9e of the founder's brief,
carried in `12-go-live.md`. Refer to it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Adjudicate what is built.**
Read the gate module, the entitlement read path, the pop-up, the writers and the gate
list against §3.1's table. Record confirmed or diverged per row before changing
anything.
*Verify before moving on:* a written line per row.

**Step 2 — Replace the pop-up's copy.**
Swap the title, body and buttons for the approved lines in §3.6, character for
character. **⚠️ No em dash.** Leave the structural question alone until D28 lands.
*Verify before moving on:* every string matches §3.6 exactly, driven at 390x844.

**Step 3 — Apply D28 once decided.**
Do not build against a guess. If it is still open, leave the plan selector exactly as
it is and mark the point `OPEN`.
*Verify before moving on:* the route from the pop-up to a plan works from every one
of its trigger points.

**Step 4 — Make every refused write say so.**
Surface the read-only state on every gated path. **No refused write may render the
syncing notice.** Where a pop-up fits, open it; where it does not, render the server's
refusal string.
*Verify before moving on:* drive a refusal from every one of the gated surfaces and
confirm none of them mentions syncing.

**Step 5 — Fail the build on an ungated write.**
Wire the existing gate-audit script into the check sequence so an ungated write
function fails the run. Record the two conditional exceptions explicitly.
*Verify before moving on:* add a throwaway ungated write function, confirm the check
fails, then remove it.

**Step 6 — Attack the gate.**
For every gated data-layer function, call it directly as an anonymous caller and as
another signed-in user, and with forged arguments. Then confirm the ungated set —
deletes, settings, reads, feedback, cancel and resume — still works while read-only.
*Verify before moving on:* every gated call refused, every ungated call permitted.

**Step 7 — Drive the lapse on a test clock, with the gate on.**
Seed an account, let the entitlement expire, and walk the app: every screen opens,
every log is readable, nothing is deleted, adding is refused with the right words,
deleting still works, the timezone still saves.
**⚠️ Set `BILLING_GATE_ENABLED` only in a local environment. Never in production, and
never before `06`'s backfill has run and been verified.**
**⚠️ A portal renders nothing on the server. Verify the pop-up by driving it.**
**⚠️ `http://127.0.0.1` does not hydrate.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* every box in §5 answered yes, by observation.

**Step 8 — Exercise the writers on a test clock.**
A failed payment that shortens rather than extends. A cancellation that shortens
rather than restoring. A dispute that deactivates immediately. A trialing subscription
with no validated card that entitles nothing.
*Verify before moving on:* each measured against the dates Stripe holds, not against
what the code intends.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] The gate and the pop-up behave correctly with the newest migration UNAPPLIED
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] `pointer-events-auto` is on the pop-up's backdrop, verified by tapping every
      control in it from inside an already-open sheet, on a phone-sized viewport

What read-only means:

- [ ] Every screen opens for a lapsed account
- [ ] Every previously logged item is fully readable, unblurred, untruncated, with no
      teaser or upsell overlay
- [ ] Nothing is deleted, hidden, or withheld
- [ ] Adding is refused everywhere it should be
- [ ] Deleting, archiving, closing and ending still work
- [ ] Timezone, notification preferences and push subscriptions still save
- [ ] Feedback submission still works
- [ ] Cancel and resume still work
- [ ] The exact phrase "read only" appears on every surface that names the state, and
      "paused", "expired" and "locked" appear on none
- [ ] The final-day banner renders on the last entitled day only, once, and never
      alongside `07`'s reminder banner
- [ ] A lapsed, read-only user can still reach and complete every part of the exit
      path that exists

The words:

- [ ] The pop-up renders the approved lines in §3.6 character for character
- [ ] No em dash appears anywhere in this flow
- [ ] No surface tells a beta account that their subscription has ended
- [ ] **No refused write renders the syncing notice**, on any gated surface

The gate itself:

- [ ] With the switch unset, every account has full write access
- [ ] With the switch on and an active entitlement, writes succeed
- [ ] With the switch on and a lapsed entitlement, writes are refused
- [ ] With the switch on and the entitlements read failing, writes are refused
- [ ] Setting the switch false restores write access immediately with no deploy
- [ ] No access decision anywhere reads a Stripe status, a `stripe_` column, or the
      subscriptions mirror
- [ ] The Billing screen's access label and the gate's behaviour never disagree
- [ ] An ungated write function fails the check run

The writers:

- [ ] A trialing subscription with no validated card entitles nothing
- [ ] A failed payment shortens the entitlement and never extends it, verified across
      a renewal on a test clock
- [ ] A cancellation shortens and never restores time the failure handler removed
- [ ] A deletion with a null period end is refused rather than granting forever
- [ ] A dispute deactivates the entitlement immediately, and the divergence from
      Stripe's own status is recorded rather than reconciled away
- [ ] A comp entitlement and a Stripe entitlement coexist as two rows, neither
      overwriting the other
- [ ] `entitlements` still has no insert, update or delete policy and no write grant
- [ ] No client-side code path can write the table

Attacks:

- [ ] Every gated data-layer function refuses an anonymous caller and another
      signed-in user when called directly, not only through its route action
- [ ] No gate function accepts a user id

The pair with `06`:

- [ ] The gate is not enabled anywhere until `06`'s backfill has run and its rows
      have been verified to exist
- [ ] With the backfill run and the gate on, no existing account is read-only who
      should not be

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

One decision made, two still open, two questions, and one addition awaiting your
word. Only Step 3 is blocked.

~~`The final-day banner`~~ **Decided 15 Aug 2026.** "Your plan ends today.", quiet,
existing banner pattern, last entitled day only, tapping to Billing, never alongside
`07`'s reminder. Carried in §3.6b.

⚠️ **RESOLVED — the ledger carries D28. Corrected 2026-08-20; this heading was the last place still calling it open.**

**`(was: STILL OPEN) — D28, does the read-only pop-up keep its plan selector?`** This is a
different surface from the banner above and the question is unanswered. The pop-up
fires when a user who has ALREADY lapsed tries to add something. The built version
embeds a live plan list with real Stripe prices and subscribes from inside the modal;
the approved design is a plain notice with a button that goes somewhere.

- **A. The approved design.** State, reassurance, two buttons, routing to the paywall.
- **B. Keep the selector**, with the approved title and body above it.

**Recommended: A**, for the reasons in §3.6 — but the cost is one extra step between
being blocked and subscribing, for all ~85 beta accounts within a fortnight of
go-live, which is why it is your call.

⚠️ **SUPERSEDED — CLOSED BY D98, 18 Aug 2026. Corrected 2026-08-20.** Both objections
below were the reasons the proposed set could not be carried, and D98 answered both by
signing a DIFFERENT set, which is what is built and pinned in
`lib/billing/readOnlyCopy.ts`:

>  title  "Your account is read only"  — one string, NOT branched
>  body   "You don't have access at the moment, so Trackd Co is read only. You can
>          still view everything you've logged, you just can't add to it."

So the body DOES use the exact phrase, and the title does NOT branch. D98 also rules the
body stays UNBRANCHED across all six cohorts. The text below is kept as the record of why
the earlier set was refused; **it is not a description of what is built.**

**`SUPERSEDED (was: STILL OPEN) — the pop-up's copy.`** A set of strings was signed off that is neither
the brief's §5 pop-up nor the built one: a title branching on trial/subscription, the
body "Everything you've logged is safe and stays yours. Start a plan whenever you're
ready to keep going.", and the button "See plans".

Two things block carrying it, and neither is a preference:

- **The body never says "read only",** and the brief makes that the exact phrase on
  every surface that names the state. A pop-up explaining a read-only state that does
  not use the words is the one place the rule matters most.
- **A title branching on trial/subscription does not resolve here.** This pop-up is
  shown to somebody whose access has already lapsed, so they are on neither. The
  branch works on the cancel and decline screens because those fire while the thing
  still exists.

If this set is superseding §5's approved pop-up, say so explicitly and give the title
in full, and the spec will record it as a supersession with the divergence table kept
as the record. Until then, §3.6 carries §5's approved lines.

⚠️ **RESOLVED — the ledger carries D29. Corrected 2026-08-20; this heading was the last place still calling it open.**

**`(was: OPEN) — D29, the server's refusal string.`** Built as "Trackd is read only until
you subscribe. Everything you've logged is still here." It is not in the approved
copy. It covers the paths the pop-up does not reach.

Its reasoning must survive whatever is decided: it deliberately avoids "your
subscription has ended", which is false for the ~85 beta accounts who reach read-only
without ever having had one.

**Recommended: sign it as built.** It is true for a lapsed subscriber, a lapsed trial
and a lapsed beta account alike, it uses the exact phrase, and it leads with the
state exactly as the approved pop-up does. The alternative is a second sentence
saying the same thing in different words, which is how two surfaces start describing
one state differently.

**`Q84`** — the route and step key the paywall screen uses, so "Choose a plan" lands
on it rather than on the card screen. Blocks Step 3 if D28 resolves to A.

**`ADDITION — the entitlement-writer section.`** Three items were approved that this
spec does not currently contain: an idempotency ledger, unattributed parking for
`11`, and an explicit no-client-trust rule on customer identity. The webhook layer
already parks unattributed events deliberately, and the customer is already resolved
server-side, so two of the three describe behaviour that exists elsewhere rather than
here. Say whether they are to be specified in §3.7 and I will write them; they are
additions rather than approvals, and I have not invented them into the section.

**`Q85`** — what the generic "still syncing" notice is, where it renders, and what
each gated surface currently does with the read-only flag it already receives.
Needed to size Step 4 precisely; Step 4 can begin without it but not finish.

**Also carried, not a decision:** the pop-up's unsigned footnote about trials being
for new accounts, and its unsigned no-prices error string. Both survive only if D28
resolves to B; under A neither has a home. Raised so their disappearance is a
consequence of a decision rather than an omission.
