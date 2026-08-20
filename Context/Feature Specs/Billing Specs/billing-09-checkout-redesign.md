Save as: Context/Feature Specs/09-checkout-redesign.md

*(Canonical path. The founder saves these locally as `billing-09 - Checkout
Redesign.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 09 — which is unambiguous either way.)*

# Spec: Checkout Redesign

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

**Depends on:** `02b-checkout-copy-and-disclosure.md`, which owns every string on this
screen and the requirement that four facts stay visible with the button.

**In no ship-together pair.** It is a redesign of a screen the triple has already made
correct, and it can land after them.

**⚠️ This spec changes arrangement and never copy.** Every string on the checkout
screen is already signed, in `02b` and `01`. If a layout change seems to need a
different word, that is a `02b` decision and this spec stops and asks. Nothing here
edits, shortens, reflows-by-rewriting, or "tightens" a single line.

**Seams:**

- **`02b` owns the requirement that the four facts are visible with the button
  without scrolling, at 390x844 and 320x568. This spec owns the arrangement that
  satisfies it** — and moving the disclosure below the button is the single change
  most likely to reintroduce the defect an audit already found once, where this
  screen could be paid on with the price scrolled out of view. **Both specs verify it
  independently. A pass in one is not a pass in the other.**
- `02a` owns the payment fork and the Elements mode. This spec must not change which
  mode mounts or how a confirmation is made.
- `01` owns eligibility. This spec must not change which variant renders.

**⚠️ `Context/ui-context.md` wins every conflict on this screen, and nothing may be
added to its exception list.** If a layout the founder asked for cannot be built
inside it, this spec says so explicitly and asks rather than inventing an exception.

---

## 1. Goal

The payment screen stops looking like two products stacked on top of each other.

The parts Trackd Co owns are already correct and on-system. Four things are not.
There is roughly 200px of dead vertical space between the subtitle and the payment
block. Stripe's Payment Element sits on our dark canvas as a foreign object with its
own grey panel, its own badges and its own oversized legal paragraph. Its "Card" tab
renders amber, which the design system forbids outright for a form control. And the
disclosure block sits above the button when it belongs below it.

**Working looks like this:** one screen, one design language, nothing floating, and
the price, the trial length, the first-charge date and the fact that it renews all
visible at the same time as the button, at both target widths, without scrolling.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** change any string on this screen. Not the title, subtitle, disclosure,
  CTA, or error. `02b` owns them and they are signed.
- **Do NOT** remove a disclosure fact, abbreviate one, or move one out of the block
  to make the layout fit. If it does not fit, the arrangement is wrong, not the
  content.
- **Do NOT** change the Elements mode, the confirmation branch, or anything `02a`
  owns.
- **Do NOT** change eligibility, the variant selection, or the server-side resolve.
- **Do NOT** edit `ui-context.md`, add a token to it, add an exception to it, or
  document a new pattern in it. It is fixed input.
- **Do NOT** restructure the shared onboarding frame or change how any other
  onboarding screen lays out. The fix is local to this screen.
- **Do NOT** introduce a new shared component without flagging first.
- **Do NOT** hardcode a colour anywhere outside the one file that already carries a
  documented fallback exception.
- **Do NOT** re-enable Link, or add a payment method type. The current set is
  deliberate.
- **Do NOT** move the wallet buttons below the card fields.
- **Do NOT** write or apply any SQL. This spec produces no migration.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What is wrong, and what each fix costs

| Problem | Fix | Size |
|---|---|---|
| ~200px of dead vertical space | One class on one line of this screen | One word |
| The Element reads as a foreign object | Extend the existing appearance object | Contained |
| The "Card" tab renders amber | Override the tab rules explicitly | Small, and it is a rule violation |
| Stripe's legal paragraph is oversized | Reduce it through the appearance API | Small |
| The disclosure sits above the button | Move it below, then re-verify the no-scroll bar | **The risky one.** §3.5 |

### 3.2 The dead space, which is one word

The gap is not in the shared frame. The screen passes no centring flag, so the frame
renders its header pinned and its scroll port aligned to the top — and then **this
screen adds a `justify-center` of its own** on the flex column holding the payment
sheet. That column takes the remaining port height and centres its contents inside it,
which is exactly the hole.

**Change it to top-alignment.** It touches this screen only, and no other onboarding
screen's layout moves.

The gap is variable rather than a fixed 200px, and that is worth knowing before
measuring: the wrapper is sized as the larger of its content and the available space,
so centring only does anything when there is spare room. On a tall viewport, or with a
short no-trial disclosure, the spare room is large and splits above and below. On a
small phone with the accordion open there is none and the port scrolls from the top.
**So the fix must be measured on both target widths and in both accordion states**,
not on one.

Then rebalance the spacing so nothing floats. Follow `ui-context.md` for the spacing
scale; the existing rhythm is a 4px step and the appearance object already hands
Stripe that same base unit.

### 3.3 Bringing the Element onto our tokens

The appearance object already exists and already does the right thing in the right
way: it reads the live design tokens off the document at mount, because the Element
renders in a cross-origin iframe that cannot see our custom properties and Stripe
needs literal values. **Extend it. Do not replace it, and do not start typing hex.**

The seven literal fallbacks in that file are a documented exception that exists
because the read needs a document and the module is imported into one that
server-renders. They are never what a browser actually uses — a review read the live
iframe's computed styles and found the real tokens. **Keep them, keep them in step,
and do not copy the pattern anywhere else.**

**The highest-value work is here**, per the brief: radius, surfaces, borders,
typography and spacing all onto our tokens, so the Element stops reading as a grey
panel dropped onto a dark canvas. The existing rules cover inputs, labels, tabs and
blocks. What is still foreign is what those rules do not reach.

**Stripe's legal paragraph is reduced through the appearance API**, not hidden and not
overridden with CSS from outside the iframe, which cannot reach it anyway.

**⚠️ Prefer a typed appearance variable over a rule selector wherever one exists, and
this is now a hard preference rather than a style note (Q90).** The rules object is an
open index signature: **every string compiles, including a misspelt or non-existent
selector.** A wrong selector is ignored, the element keeps its default, nothing errors
and nothing fails the build. A typed variable fails at compile time instead, which is
the difference between a caught mistake and a silent one.

The installed library is `@stripe/stripe-js` 9.13.0 with `@stripe/react-stripe-js`
6.8.0. Typed variables confirmed available in it, and worth reaching for first: the
input border and focus border and their shadows, the focus outline and shadow, the
label colour, size, weight and spacing, the border radius including a separate button
radius, tab and accordion spacing, the tab icon colours **including the selected
one**, tab and block logo colours, the animation switch, and the label placement mode.

**Both Stripe client packages are pinned to exact versions (D40), carets removed.**
The lockfile alone was holding them, so an install could move a minor version
underneath a payment screen as a side effect. Pinned, an upgrade becomes a deliberate
act recorded in a commit. **Seam to `12-go-live.md`: the go-live checklist verifies
the lockfile matches the pins.**

**Step 3 still verifies by reading the live iframe's computed styles**, not by
screenshot, because that is the only way to catch a rule that was silently ignored.

### 3.4 ⚠️ The amber tab is a violation, not a preference

`ui-context.md` records one rule above all others here: **amber means "this is live
or needs you now", one or two beats a screen, and a button, a form tab or a call to
action must never be amber.** A form tab is not a live state.

The tab is amber because the accent is passed to Stripe as its primary colour, and
Stripe uses that for tab selection as well as for focus.

**The fix keeps the accent and overrides the tab.** Do not change the primary colour
to fix the tab: the app's own primary is white, and a white focus ring on a
near-white field is invisible, which is precisely the mistake `ui-context.md` records
for the switch control. Amber is already the app's ring colour, so an input's amber
focus ring is consistent with every other focusable control in the product and stays.

**So: keep the accent for focus, and override the selected tab's border, label and
icon so a selected tab reads in the foreground colour rather than in amber.** Q90
splits those three into two confidence levels, and the spec treats them differently:

- **The icon has a typed variable** for its selected colour. Use it. No rule
  selector, no silent-failure risk.
- **The border already goes through a rule selector that is shipping today** and whose
  treatment was reviewed on a real device, so it is empirically real even though the
  types cannot confirm it. Keep it and change its colour.
- **The label is documented and confirmed (Q91).** `.TabLabel--selected` is listed in
  Stripe's Tabs rules table, so the label moves out of the verify-by-hand tier and is
  styled directly, with `.TabLabel` for the resting state where it needs it. The
  on-device visual confirmation stays as the proof rather than as the discovery.

**Stripe's terms text is the one still unconfirmed**, with one extra avenue:
the Payment Element also exposes a terms option separate from the appearance object.
Check both before writing a rule.

**⚠️ Q67's answer governs whether any of this can be excused as an onboarding
exception, and it cannot.** There are four documented exceptions, not one. The
many-amber exception is scoped to an onboarding **answer list** — a selected chip
reading amber — and this screen has no answer list. The surface-treatment and motion
exceptions apply to `/onboarding` by route, so this screen is inside their scope, but
it uses neither today. The voice exception covers two named strings and this is not
one of them. **The amber tab is a straight violation with no exception available**, and
nothing new gets added to that list.

### 3.5 ⚠️ The disclosure moves below the button, and this is the dangerous change

The four required facts are the trial length, the exact renewal amount with its
currency, the date of the first charge, and that it renews until cancelled. Per ruling
A4 the no-trial variant's disclosure lines **are** those four facts, with "Starts
today" as the trial-length fact stated affirmatively.

**All four must be visible at the same time as the button, without scrolling, at
390x844 and at 320x568.** A previous audit found this screen could be paid on with the
price scrolled out of view. Moving the block below the button is exactly the change
that can put it back there.

**The mid-grace variant is the tightest case and is measured specifically.** Its lines
carry a date where the other variants carry the word "today", so it is the longest the
disclosure ever gets.

**Measure, do not eyeball.** Both widths, both accordion states, every variant,
with the wallet row present and absent. **⚠️ `http://127.0.0.1` does not hydrate, so
any measurement taken through it is invalid.**

**If the four facts cannot be kept on screen below the button at 320x568, say so and
ask.** Do not shrink a fact out of legibility, do not drop one, and do not move one
back above the button unilaterally. The requirement is `02b`'s and the arrangement is
this spec's, and a conflict between them is a question, not a judgement call.

#### ⚠️ IT WAS ASKED, AND IT WAS ANSWERED — 2026-08-20

The instruction above was followed: Step 5 measured that the facts cannot be kept on
screen at 320x568, said so, and asked rather than trimming. **`02b` §3.7 is now AMENDED**
and records 320x568 as a **measured limitation under §9g**: Stripe's Payment Element is
424px inside a 375px scroller, so no arrangement of Trackd's own content can satisfy it.
Nothing was trimmed, shrunk or moved — a pinned-bar arrangement that satisfies the
requirement literally was built and rejected because it leaves the card fields **−3px**
at 320x568 keyboard-up.

**390x844 is unchanged and is still a hard PASS.** The paragraph above still governs
there, and this spec still verifies it independently, as `02b` §3.7 requires.

### 3.6 The wallet row stays where it is

The express checkout element is mounted above the card fields deliberately: on mobile
that is the primary conversion path, and a buried wallet button is a button nobody
uses. It renders nothing at all on a device with no wallet configured, so it costs a
desktop user no space.

**Its absence is the layout case that produces the worst gap**, because the space it
would occupy is what the centring was distributing. So every measurement in this spec
is taken **both** with a wallet available and without one.

Duplicate wallets inside the card block stay suppressed, and Link stays off. Both are
deliberate: left to the account defaults, Stripe renders Link's phone and name fields
and its own terms ahead of the card number, measured as pushing everything else off a
320x568 screen.

### 3.7 Invariants this spec touches, and how the work preserves each

- **A screen never states a price, date or promise the server would contradict.**
  §3.5 is this invariant expressed as a layout requirement: a price that has scrolled
  out of view has not been stated. This spec does not change where any number comes
  from, and must not.
- **No secret ever reaches a client bundle.** The appearance object reads design
  tokens off the document and nothing else. Nothing added here goes near a key.
- **Nobody is ever charged after being told they would not be.** The disclosure is
  what does the telling, and this spec is responsible for it still being readable at
  the moment the button is pressed.

### 3.8 If this goes wrong after go-live

A layout regression on this screen is a disclosure failure, not a cosmetic one. The
recovery is a deploy, and there is no flag that hides a broken payment screen. The
general runbook is §9e of the founder's brief, carried in `12-go-live.md`. Refer to
it; do not restate it.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Baseline the measurements before changing anything.**
At 390x844 and 320x568, with the accordion open and closed, with a wallet available
and without, and for every variant: record what is visible with the button and what is
not. This is the number every later step is compared against.
**⚠️ `http://127.0.0.1` does not hydrate.**
*Verify before moving on:* a written table of measurements.

**Step 2 — Remove the dead space.**
Change this screen's own centring to top-alignment. Do not touch the shared frame and
do not change any other screen.
*Verify before moving on:* the gap is gone at both widths, and every other onboarding
screen is pixel-identical to its baseline.

**Step 3 — Extend the Elements appearance.**
Radius, surfaces, borders, typography, spacing onto our tokens. Reduce Stripe's legal
paragraph. **⚠️ Confirm every rule selector against Stripe's appearance reference for
the pinned version.** A selector that does not exist is ignored silently.
*Verify before moving on:* read the live iframe's computed styles and confirm the
real token values are applied, rather than judging from a screenshot.

**Step 4 — Fix the amber tab.**
Keep the accent for focus; override the selected tab's border, label and icon so it
reads in the foreground colour. Do not change the primary colour.
*Verify before moving on:* the selected tab is not amber, the input focus ring still
is, and the computed styles confirm both.

**Step 5 — Move the disclosure below the button.**
Then re-measure everything from Step 1.
**⚠️ This is the change that can reintroduce the audited defect. If the four facts
cannot be kept on screen at 320x568, stop and ask rather than trimming one.**
⚠️ **DONE, ASKED AND ANSWERED (20 Aug) — see §3.5's amendment note.** 320x568 is a §9g
limitation; 390x844 remains a hard pass.
*Verify before moving on:* all four facts and the button visible together, every
variant, both widths, both accordion states, wallet present and absent.

**Step 6 — Rebalance the spacing.**
Nothing floats, nothing hugs an edge, and the rhythm follows the existing scale.
*Verify before moving on:* driven at both widths, compared against the Step 1
baseline.

**Step 7 — Prove nothing else moved.**
Every other onboarding screen, and the payment behaviour itself: the trial path still
confirms, the paid path still confirms, wallets still work, and no string changed.
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
- [ ] Every tap target at least 44px, including inside the Element
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
      (this spec should add none — confirm it added none)

**The four facts, which is the hardest bar on this screen:**

- [ ] At 390x844, all four facts and the button visible together, no scrolling —
      trial variant
- [ ] At 390x844 — returning-customer variant
- [ ] At 390x844 — mid-grace variant, the longest case
- [ ] At 320x568, all three variants — ⚠️ **a §9g measured limitation, not a pass**
      (`02b` §3.7, amended 2026-08-20). Ticked by confirming the limitation's terms: the
      disclosure complete, unshrunk, immediately below the button, reachable by scrolling
      an inner container, and **no fact trimmed to make it fit**
- [ ] All of the above with the accordion OPEN
- [ ] All of the above with a wallet button present, and again with it absent
- [ ] No fact was trimmed, abbreviated, shrunk out of legibility, or moved out of the
      block to make it fit

The layout:

- [ ] The dead vertical space is gone at both widths
- [ ] Nothing floats and nothing hugs an edge
- [ ] Every other onboarding screen is unchanged from its baseline
- [ ] The wallet row is still above the card fields

The Element:

- [ ] Radius, surfaces, borders, typography and spacing read from our tokens,
      confirmed against the live iframe's computed styles rather than a screenshot
- [ ] Stripe's legal paragraph is reduced through the appearance API
- [ ] **The selected tab is not amber**, in its border, its label and its icon
- [ ] The input focus ring is still amber, matching every other focusable control
- [ ] The primary colour was not changed
- [ ] No hex was added outside the one file that carries the documented fallback
      exception
- [ ] Every appearance rule selector was confirmed against Stripe's reference, and
      none is silently ignored

The rules:

- [ ] `ui-context.md` is byte-identical to before this work
- [ ] Nothing was added to its exception list
- [ ] **No user-facing string changed.** Diff the rendered strings against `02b` and
      confirm zero differences
- [ ] Nothing amber on this screen is a button, a tab, or a call to action

Behaviour unchanged:

- [ ] The trial path still confirms and still reaches the holding screen
- [ ] The paid path still confirms
- [ ] Wallet payment still completes
- [ ] The eligibility variant still resolves server-side with no flicker

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

One optional decision and one question. Neither blocks any step.

**`OPEN — D38, whether the payment block takes the flow surface treatment.`** The
onboarding flow has a canvas lift and a card treatment — a faint hairline along a
card's top edge and a soft shadow — introduced for `/onboarding` and applied there
only. This screen sits inside that scope by route and uses neither today; the paywall
one step earlier uses the card treatment on its affiliate block.

**Recommended: no.** The restraint is the point of that treatment, and this is the one
screen where the user's attention should be on four facts and a button rather than on
depth. It is also the screen most at risk from anything that costs vertical space. If
the screen still reads flat after Steps 3 and 6, this is the lever to reach for, and
it is a one-line change then.

~~`Q90 — versions and selectors`~~ **Answered 15 Aug 2026.** Versions confirmed and
typed variables enumerated in §3.3. The rule selectors are not typed and never will
be, because the object is an open index signature, so the package cannot confirm them.

~~`Q91 — the tab label selector`~~ **Answered 15 Aug 2026 from Stripe's Appearance API
documentation.** The Tabs rules table lists `.Tab`, `.TabIcon` and `.TabLabel`, each
carrying a `--selected` state and the usual pseudo-classes, so `.TabLabel--selected`
is documented and supported. Carried in §3.4. **Stripe's terms text is not covered by
that table**, so it keeps its documentation check, alongside the Payment Element's own
terms option.

**`OPEN — D38, whether the payment block takes the flow surface treatment.`** The
onboarding flow has a canvas lift and a card treatment — a faint hairline along a
card's top edge and a soft shadow — introduced for `/onboarding` and applied there
only. This screen sits inside that scope by route and uses neither today; the paywall
one step earlier uses the card treatment on its affiliate block.

**Recommended: no.** The restraint is the point of that treatment, and this is the one
screen where the user's attention should be on four facts and a button rather than on
depth. It is also the screen most at risk from anything that costs vertical space. If
the screen still reads flat after Steps 3 and 6, this is the lever to reach for, and
it is a one-line change then.

~~`Q90 — versions and selectors`~~ **Answered 15 Aug 2026, and half of it cannot be
answered from the repo.** The versions are confirmed and the typed variables are
enumerated in §3.3. The rule selectors are not typed and never will be — the object
is an open index signature, so the package cannot confirm them. **The selected tab's
label and Stripe's terms text need a human to read Stripe's appearance reference.**
That is a documentation lookup, not a code lookup, and naming a selector from memory
is exactly the silent failure this spec is written around.

~~`D40 — pinning the Stripe client packages`~~ **Resolved 15 Aug 2026.** Both pinned
exactly, carets removed, with `12` verifying the lockfile matches. Carried in §3.3.

**`OPEN — Stripe's terms text.`** Q91 settled the tab label; the terms text was not
covered by the same table. It keeps its documentation check, alongside the Payment
Element's own terms option, and it is the last unconfirmed selector on this screen.
**⚠️ Do not name it from memory** — the rules object accepts any string, so a wrong
selector is ignored in silence.
