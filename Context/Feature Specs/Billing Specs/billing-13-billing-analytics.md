Save as: Context/Feature Specs/13-billing-analytics.md

*(Canonical path. The founder saves these locally as `billing-13 - Billing
Analytics.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 13 — which is unambiguous either way.)*

# Spec: Billing Analytics

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

**Depends on:** `01`, `02a`, `04`, `05` and `06` for the moments it instruments.

**Post-launch, with no ship-together pressure.** Nothing in the launch-critical set
waits on this.

**Seams:**

- `14-admin-billing-dashboard.md` reads what this produces. This spec owns the events;
  `14` owns what is shown about them.
- `02a` suppresses the false trial-start event for a paid-today subscribe and adds
  nothing in its place, deliberately, leaving the event taxonomy to this spec. **So
  between `02a` shipping and this shipping, a paid-today subscribe is unmeasured.**
  That gap is known and stated rather than discovered.
- `11-reconciliation-and-alerting.md` answers "is anything wrong". This answers "what
  happened". Neither borrows the other's job.

**⚠️ This product logs medical and performance protocols. That fact governs every
decision below**, and it is why §3.5 exists before anything about funnels.

---

## 1. Goal

Know whether the save offer saves anybody.

Nothing measures billing today. There is a helper that fires events into a buffer on
the window with no destination wired, and its event list is onboarding-only — no
cancel, no offer, no gate, nothing after the first purchase. So the highest-risk screen
in the product has no idea whether it works, and the read-only gate has no idea how
many people it turns into subscribers versus how many it turns into nobody.

**Eight events, one adapter, one destination that can be swapped without touching a
call site.**

---

## 2. Out of Scope (do NOT build)

- **⚠️ Do NOT enable autocapture, session recording, heatmaps, or any DOM-scraping
  feature.** §3.5. This is not a preference and it is not negotiable.
- **⚠️ Do NOT put a compound name, a dose, a bloodwork value, a photo reference, a
  protocol detail, a body measurement, or any free text a user typed into an event
  property.** Ever. §3.5.
- **Do NOT send an email address, a name, or a Stripe customer id as an identifier.**
  §3.6.
- **Do NOT compute MRR, revenue, ARPU or churn here.** That is `14`, from Stripe and
  our tables, not from events.
- **Do NOT let an analytics failure break a flow.** The helper never throws today and
  the adapter must not either.
- **Do NOT scatter vendor calls through the codebase.** One adapter, one import site
  per side.
- **Do NOT add events beyond the eight without a decision.** A taxonomy grows by
  agreement or it becomes noise.
- **Do NOT block a page render, a payment, or a navigation on a send completing.**
- **Do NOT merge anything to `main`.**

---

## 3. Design Decisions

### 3.1 The eight events, and what each one answers

| Event | Fires when | Answers |
|---|---|---|
| Trial started | A trial subscription is created with a validated card | How many trials begin |
| Checkout abandoned | Checkout is reached and left without a subscription | Where the money stops |
| Cancel opened | The cancel confirmation is shown | How many people reach the exit |
| Offer shown | The save offer is put on screen | The denominator for everything below |
| Offer taken | The extra time is granted | **Whether the offer saves anybody** |
| Offer declined | The offer is declined or expires | The other half of that answer |
| Lapsed into read only | Access ends and writing stops | How many the gate actually catches |
| Resubscribed | A lapsed or cancelled account subscribes again | Whether the gate converts |

**Offer shown, taken and declined are the three that justify the feature.** The save
offer is the highest-risk screen in the product and lifts a cancellation when taken.
Without these three there is no way to know whether that risk buys anything.

**A paid-today subscribe needs its own event and does not get one by widening trial
started.** `02a` suppresses the false one precisely so this spec can name it honestly;
a returning customer charged today did not start a trial. It is the ninth event in
practice, and naming it is part of D53's pass.

### 3.2 ⚠️ Four of the eight are not client events, and one has no moment at all

The existing helper no-ops on the server. Half this list happens there.

**Cancel opened and offer shown** are decided server-side, in the same call that
writes the cancellation. **Offer taken** is a server grant. **Resubscribed** is a
server-side subscription creation.

**So the adapter has two sides**, a client one and a server one, behind one interface.
The call sites differ; the event names, the property shapes and the destination do not.

**⚠️ Lapsed into read only has no code running at the moment it happens.** Access ends
because a clock passed a date. Nothing executes. So the event has to be attached to
something that does run, and the choice changes what the number means:

- **At the first refused write** — the event means "somebody lapsed and hit the wall".
  Honest, cheap, and it is the moment that matters commercially, because it is when
  they see the pop-up.
- **From a scheduled sweep** — the event means "somebody's access ended", whether or
  not they noticed. Truer to the words, and it needs a job that finds newly lapsed
  accounts.

**Recommended: the first refused write**, with the event named for what it actually
records rather than for the state change it approximates. D54 in §7.

### 3.3 ⚠️ The buffer dies exactly where the funnel matters most

Events go into an array on the window. **A full document load empties it**, and the
read-only pop-up's route into checkout is a full document load, deliberately, because
the onboarding flow reads its step at mount only.

So today the single most interesting transition in the whole funnel — blocked user
decides to pay — crosses a boundary that destroys the buffer.

**The adapter sends rather than accumulates.** Events leave promptly, not at unload,
because unload is unreliable on mobile and this path navigates away by design.

**The buffer stays for development only**, where it is genuinely useful for inspecting
a preview session, and it is not the delivery mechanism.

### 3.4 One adapter, and what "swappable" has to mean

**One module defines the event names, the property shape per event, and a single send
function.** Everything else imports that and nothing else. The vendor appears in one
file on each side.

**Swapping the vendor touches only the adapter.** That is the whole reason to build it
this way, because the vendor is not decided (D53) and shipping the instrumentation
before the destination is settled is the point of the design.

**PostHog is the shipped default**, EU cloud or self-hosted, chosen for
health-adjacent data. **Marked OPEN, and the code must not assume it** — no vendor
type leaking into a call site, no vendor-shaped property names in the schema.

**Failures are swallowed.** Analytics must never break a flow, and the existing helper
already gets this right.

### 3.5 ⚠️ What must never leave this product

**This app holds compounds, doses, bloodwork, weight, photos and cycles.** An
analytics integration is the single most likely route for that to leave the building,
and the two features most likely to do it are on by default in most vendors.

**Autocapture is off. Session recording is off. Heatmaps are off.** Autocapture reads
DOM text and element labels; on this product that means compound names and dose values
lifted off the screen and posted to a third party. Session recording means video of
somebody's bloodwork. **Neither is a setting to be tuned. Both are off, and the spec
asserts they are off rather than trusting a dashboard default.**

**Event properties carry billing shapes only:** a plan key, an interval, a currency, an
amount in minor units, a reason code from a fixed set, a boolean, a duration. **No free
text. No user-entered string of any kind. No health field, no matter how innocuous it
looks.**

**A property allowlist is enforced in the adapter**, so a call site cannot add a field
that was not designed. That is a small amount of ceremony buying the one guarantee this
product cannot afford to get wrong.

### 3.6 Who the events are about

**A stable pseudonymous identifier**, and nothing else. Not an email, not a name, not a
Stripe customer id — an id that identifies the account to us and nothing to anybody
who obtains the analytics data.

**No secret reaches a client bundle.** A client-side vendor key is write-only by
design, and the server side uses its own credential, held server-side.

**⚠️ There is a consent mechanism in this codebase** and this spec must not assume it
is irrelevant. Q97 establishes whether analytics falls under it, and if it does, the
adapter respects it rather than the call sites remembering to.

### 3.7 Invariants this spec touches

- **No secret ever reaches a client bundle.** The server credential stays server-side
  and the adapter is the only place either appears.
- **A user's logged data is never deleted, hidden, or withheld.** Nor, this spec adds,
  is it ever transmitted. §3.5 is that principle applied to a surface the invariant
  list did not anticipate.
- **A server action never accepts an identifier saying whose data to act on.** Server
  events resolve the account from the verified session or from the Stripe object being
  handled, never from a client argument.

### 3.8 If this goes wrong after go-live

An analytics failure is not a money failure. Nothing here gates access, charges
anybody, or writes to a billing table, and every send is swallowed on error.

**The exception worth naming is the one this spec creates: if the property allowlist
is bypassed, health data leaves the product and cannot be recalled.** That failure has
no runbook, which is why §3.5 is enforced in code rather than by convention. The
general recovery is §9e of the founder's brief, carried in `12-go-live.md`.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — The schema first, before any call site.**
Define the nine event names and the exact property shape of each, as types. Define the
allowlist. Nothing vendor-specific appears.
*Verify before moving on:* a call site cannot pass an undeclared property without a
type error.

**Step 2 — The adapter, both sides, with no vendor yet.**
One interface, a client implementation and a server implementation, both sending
promptly and both swallowing failures. Development keeps the window buffer.
*Verify before moving on:* events reach a logging stub from both sides, and a thrown
error inside the adapter does not surface to the caller.

**Step 3 — Wire the client events.**
Trial started, checkout abandoned, resubscribed where it is client-observed, and the
paid-today subscribe.
**⚠️ Confirm the events survive the full document load** out of the read-only pop-up
into checkout.
*Verify before moving on:* the blocked-to-paying transition is visible end to end in
the stub.

**Step 4 — Wire the server events.**
Cancel opened, offer shown, offer taken, offer declined, and the server side of
resubscribed. **⚠️ None of these may be exported from a `"use server"` module.**
*Verify before moving on:* each fires exactly once per real occurrence, including when
the offer expires rather than being declined.

**Step 5 — The lapse event, per D54.**
Do not build it against a guess.
*Verify before moving on:* it fires once per account, not once per refused write.

**Step 6 — Wire the destination.**
PostHog by default, with autocapture, session recording and heatmaps explicitly off.
**⚠️ Assert they are off in code rather than trusting the dashboard.**
*Verify before moving on:* inspect the outbound payloads directly and confirm no DOM
text, no user-entered string, and no health field of any kind appears.

**Step 7 — Prove the swap.**
Point the adapter at a second stub destination and confirm no file outside it changed.
*Verify before moving on:* the diff outside the adapter is empty.

**Step 8 — Drive the funnel end to end.**
**⚠️ Seed on `@trackd-qa.invalid`, delete BY ID ONLY, and clean up Stripe objects
first.**
**⚠️ `http://127.0.0.1` does not hydrate.**
*Verify before moving on:* every box in §5 answered yes, by observation.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`
- [ ] No new export was added to any `"use server"` module
- [ ] No vendor credential appears in a client bundle beyond a write-only key

**What must never leave, which is the bar this spec is judged on:**

- [ ] **Autocapture is off**, asserted in code
- [ ] **Session recording is off**, asserted in code
- [ ] **Heatmaps are off**, asserted in code
- [ ] Outbound payloads inspected directly: **no compound name, dose, bloodwork value,
      weight, photo reference, cycle detail or free text of any kind**
- [ ] The property allowlist rejects an undeclared field at the type level and at
      runtime
- [ ] The identifier is pseudonymous: no email, no name, no Stripe customer id
- [ ] Consent is respected in the adapter if Q97 says it applies

The eight, plus the ninth:

- [ ] Trial started fires once per trial, and never for a paid-today subscribe
- [ ] The paid-today subscribe has its own event
- [ ] Checkout abandoned fires when checkout is left without a subscription
- [ ] Cancel opened fires when the confirmation is shown
- [ ] Offer shown fires when the offer is put on screen, matching the server's own
      one-per-customer marker exactly
- [ ] Offer taken fires on the grant
- [ ] Offer declined fires on decline **and on expiry**
- [ ] Lapsed fires once per account, per D54
- [ ] Resubscribed fires for a lapsed account and for a cancelled one
- [ ] No event fires twice for one occurrence

Delivery:

- [ ] Events survive the full document load out of the read-only pop-up
- [ ] Nothing depends on unload
- [ ] An adapter failure never surfaces to a caller and never breaks a flow
- [ ] No page render, payment or navigation waits on a send

Swappability:

- [ ] Pointing at a different destination changes only the adapter, with an empty diff
      elsewhere
- [ ] No vendor type or vendor-shaped property name appears at a call site

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

**`OPEN — D53, the final analytics vendor and the ninth event's name.`** PostHog EU is
the shipped default and the code must not assume it. The decision is not urgent
because the adapter makes it cheap, but it should be made before real volume
accumulates somewhere you would rather it had not.

**Recommended: confirm PostHog EU** unless there is a reason to prefer otherwise. It
was chosen for the right reason — health-adjacent data staying in the EU — and
self-hosting is available if the third-party question ever becomes uncomfortable. The
ninth event's name goes with it, since naming a paid-today subscribe honestly is part
of the same taxonomy.

**`OPEN — D54, where the lapse event is emitted from.`**

- **A. At the first refused write.** The number means "lapsed and hit the wall". Cheap,
  honest, and it is the moment that matters commercially.
- **B. From a scheduled sweep.** The number means "access ended", whether noticed or
  not. Truer to the words, and it needs a job that finds newly lapsed accounts.

**Recommended: A**, with the event named for what it records. Nothing runs at the
moment access ends, so B is a job built to observe a non-event, and its number counts
people who may never open the app again. A counts the people the gate actually met,
which is the number that tells you whether the gate converts.

**`Q97`** — whether the consent records in this codebase gate analytics, and if so what
the check looks like. If they do, the adapter respects it centrally rather than each
call site remembering to.
