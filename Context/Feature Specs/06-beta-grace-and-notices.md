Save as: Context/Feature Specs/06-beta-grace-and-notices.md

*(Canonical path. The founder saves these locally as `billing-06 - Beta Grace And
Notices.md`, so the filename on disk may differ. Cross-spec references are by number
— 01, 02a, 06 — which is unambiguous either way.)*

# Spec: Beta Grace and Notices

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

**Depends on:** `01-trial-eligibility.md` for the mid-grace rule, and `02a`/`02b` for
the screen a beta user lands on when they act on the notice.

**⚠️ SHIP-TOGETHER PAIR — this spec and `05-read-only-gate.md` ship together or not
at all. Neither merges alone.**

`05` is the gate; this is what stops the gate landing on ninety people who were never
told. There are **zero** entitlement rows in the database today, so turning the gate
on first puts every real user of this product into read-only overnight with no
warning. The backfill has never been run.

**⚠️ The order belongs to `12-go-live.md` and is not negotiable:** live keys, then
run the backfill, then verify the rows exist, then set the gate flag.

**Seams:**

- `05` owns what happens after the fortnight ends. This spec owns the fortnight and
  the telling.
- `07-notifications.md` owns the reminder before the grace ends, including the copy
  variant that must not describe a fortnight of free access as a trial.
- `01` owns the rule that a mid-grace subscriber is not charged inside their
  fortnight. This spec states it because the fortnight is what makes it true.
- `02b` owns the checkout copy a beta user reads after tapping through.
- `12-go-live.md` owns running the backfill, and it is a hand-run step, not a deploy
  step.
- **`08-billing-screen.md` carries the other half of the route (D31).** The notice is
  dismissible and shows once, so after "Got it" it is gone for the rest of the
  fortnight. `08` gains a subscribe row on Billing for entitled-but-expiring accounts
  — beta grace and courtesy periods — so the route survives the dismissal. **This
  spec owns the notice half; `08` owns the Billing half, with its own copy to be
  drafted for signing.**
- **The standing order that nothing routes a user at the paywall is amended by D31**,
  for exactly two controls: this notice's secondary button and `08`'s subscribe row.
  Nothing else.
- **Legal review may populate the terms line in §3.6.** Updated Terms of Service take
  effect the day billing switches on, and counsel is reviewing whether existing users
  must be shown notice or acceptance at that moment. This notice is the only
  guaranteed-seen-once surface in the product, so the slot is reserved now. **Its
  absence is a decision, not an omission**, and its wording is signed copy when it
  lands (D32-pending). Do not draft it.

**Correction to the original spec map.** The map anticipated this spec delivering
backfill SQL under §9g rule 4. It does not: the backfill is an existing hand-run API
route protected by a shared secret, not a migration. **§9g rule 4 therefore does not
bite here.** If any SQL turns out to be needed, it follows the rule in full.

---

## 1. Goal

Ninety people who have used this product free for months are told it is going paid,
given a fortnight, and never charged inside it.

Eighty-five of them get fourteen free days from the moment billing switches on.
Five get it free for life. Both are told once, in the app, in words that match what
is actually happening to them. Nothing they have logged is touched, then or ever.

The fortnight is their trial. They do not also get a seven-day one, and a beta user
who decides to set their plan up on day three is not charged until day fourteen.

**One consequence is accepted deliberately and must not be engineered around.**
Somebody who does not open the app during their fortnight gets no warning and lapses
into read-only cold. They lose nothing permanently — every log is intact whenever
they return — and there is no email path to build here.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** build, spec, or suggest an email path for the notice. The notice is
  in-app only and the founder has accepted that a non-opener lapses without warning.
- **Do NOT** run the backfill route. It is hand-run and `12` owns when.
- **Do NOT** set `BILLING_GATE_ENABLED`.
- **Do NOT** change `COMP_EMAILS`, or move an address between it and the founder
  list. They are deliberately different lists: "free forever" and "may read everyone
  else's data" are different grants, and three of the five comp addresses are not
  founders.
- **Do NOT** change how the grace is identified. A comp entitlement with an expiry is
  the grace and a comp entitlement without one is free-for-life, and nothing else in
  the system produces either shape. No new column, no new enum value.
- **Do NOT** change `BETA_GRACE_DAYS` or derive it from the trial length. The
  relationship between fourteen and seven is a coincidence of judgement, not a rule.
- **Do NOT** put confetti on the beta variant of the notice. §3.6.
- **Do NOT** re-announce the going-paid notice. It happens once.
- **Do NOT** gate anything. `05` owns the gate.
- **Do NOT** touch the trial eligibility rules or the mid-grace charge alignment.
  Those are `01`.
- **Do NOT** write a migration unless something genuinely requires one, and if it
  does, stop and ask first.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| The grace is a comp entitlement with an expiry; free-for-life is one without | **Correct.** No migration, one shape, and it already drives the banner and the reminder. §3.2 |
| Every existing account gets one grant or the other, with no "nothing" branch | **Correct.** An account that gets nothing is an account locked out with no notice. §3.2 |
| The comp list is a closed TypeScript list, lower-cased on both sides, with a test pinning it | **Correct.** §3.3 |
| The backfill computes one instant and writes absolute expiries | **Correct**, and it is what makes D8's single global window true. §3.4 |
| The re-run predicate is "has a row at all" | **Correct.** A lapsed grace stays lapsed. §3.4 |
| The grace is re-described as a trial for the banner and the reminder, guarded so a real subscription is never re-described | **Correct.** §3.5 |
| The notice is remembered in a cookie, account-scoped, read server-side before the page is built | **Correct**, and the reasoning is load-bearing. §3.7 |
| Confetti on the comp variant only | **Correct**, and the reasoning must survive. §3.6 |
| The built notice strings | **Not yet seen.** `OPEN: awaiting answer to Q86`. §3.6 |

### 3.2 How the two grants are told apart

A comp entitlement **with** an expiry is the beta grace, and a comp entitlement
**without** one is free-for-life. Nothing else in the system produces either
combination: a real subscription writes a different source and carries its own dates.

This is why no migration is needed and no new enum value exists. An enum value is a
migration, and this has to stay something the founder can run in one go on the day.

**Every existing account gets one of the two.** There is no third branch, because an
account that receives nothing is an account locked out on the day billing switches on
with no notice at all, which is the outcome this whole area exists to prevent.

### 3.3 The five, and why the list is not the founder list

Free-for-life is decided by a closed list of five addresses: two founder accounts and
three friends. Lower-cased on both sides, so a capitalised sign-up address still
matches, with a test pinning every entry lower-case — a mixed-case entry would never
match anything and the failure would be silent, giving that person the ordinary
fortnight and lapsing them two weeks later.

**⚠️ It is deliberately not the founder list.** That list gates the admin dashboard
and is duplicated into row-level security policies. Adding a friend to a comp list
must not hand them a dashboard showing everybody else's data, and it must certainly
not require editing SQL to do it. Two lists, two meanings, no accidental privilege.

The list is closed. Anyone added after the backfill has run needs the re-run path,
which upgrades an existing fortnight row to no expiry; a first run skips them
entirely.

### 3.4 One global window, anchored on switch-on (D8)

The backfill takes the clock **once**, at the start of the run, and writes each
account an absolute expiry computed from that single instant. So all ~85 accounts
share one fortnight that starts when the run happens and ends fourteen days later,
which is exactly what D8 decided.

Three consequences, all of which belong in the spec rather than in somebody's head:

**Changing the constant later moves nobody.** The rows hold absolute instants, not a
number of days.

**An account created after the run gets no grace at all.** The route only ever runs
by hand, so a sign-up between the backfill and the gate switching on is an ordinary
new user: eligible for the ordinary seven-day trial, and correctly so. `12` should
run the backfill and set the flag close together for that reason.

**A re-run restarts nobody.** The predicate is "has a row at all", not "has an active
row", so a lapsed grace stays lapsed and cannot be refreshed by running the route
again. The single exception is an addition to the comp list, which is upgraded by
clearing the expiry.

### 3.5 The grace is described as a trial to the machinery, and only to the machinery

The grace is handed to the banner and the reminder in the shape of a trial — a
status, an end date, and no pending cancellation — so neither has to learn a new
concept. That is a good decision and it stays.

**⚠️ It is guarded so a real subscription is never re-described.** A paying
subscriber's entitlement also carries an expiry, and without the comp test their
dashboard would have announced a free trial ending on a date a year away.

**The re-description must not reach the copy.** `07` owns the reminder's wording and
must tell a beta account their free access is ending, never that their trial is
ending and billing is about to start — ninety people with no card on file were told
exactly that by an earlier version. Named here because this spec is the reason the
shape exists.

**Nobody can have opted out of a charge they never agreed to**, so the grace is
handed over with no cancellation pending, always.

### 3.6 The two notices

**To the ~85:**

> Trackd Co is going paid

> You've been using it free while we built it, and everything you've logged is yours to keep. That doesn't change.

> From today it's a paid app, and because you were here early you've got two more weeks on us, until [date].

> After that your account goes read only. You'll still see everything you've logged, you just can't add to it. Nothing gets deleted.

Buttons (D31), with **"Got it" visually primary** and "Set up my plan" secondary:

> Got it

> Set up my plan

**The hierarchy is the decision, not the button count.** The screen's credibility
rests on applying no pressure, so the dismissal reads as the expected action and the
route to checkout is available without being urged. Follow `Context/ui-context.md`
for how a primary and a secondary control sit together; **a secondary control is
never amber.**

"Set up my plan" opens checkout, where `01`'s mid-grace rule applies.

**To the 5:**

> Trackd Co is yours. For life.

> Adrian and Angus have given you free access for life.

> It costs money for everyone else from today. Not for you, not now and not later. No card, no renewal, nothing to cancel.

> You were here for the version that barely worked, and you stayed. That's worth more than a subscription.

Button:

> Thank you

**The terms line sits under the body and above the buttons (D32).** Counsel-advised
and founder-signed, carried character for character:

> By continuing to use Trackd, you agree to the updated Terms of Service and Privacy Policy.

**Both documents are linked** where the platform supports links. **Acceptance is
continued use after notice**, so neither button changes its label, its behaviour, or
its meaning: "Got it" still only dismisses, and "Set up my plan" still only routes.
Nothing on this screen is an accept button and nothing may be styled as one.

**Build the layout so the notice reads correctly with the line present and with it
absent**, with no shift either way. The absent case still matters: if counsel amends
or withdraws the line, that arrives as a superseding decision rather than as a
rebuild.

**⚠️ Two scope points that are counsel's to confirm, not mine to decide.** The line is
carried on **both** variants here, on the reading that every existing user receives
notice of updated terms and a comped account is still a user bound by them; if it is
meant for the paying cohort only, that is a one-line change. And the ~85 who never
open the app during their fortnight never see this notice, so continued-use acceptance
never attaches to them — the same accepted limitation as the lapse, but it may carry
more weight for terms than it does for billing.

**The `[date]` renders from the account's own stored expiry**, server-side, in the
user's stored timezone, through one server-fed formatter shared by every surface that
prints it, so no two screens can format the same instant differently. It is never computed in the browser and never derived from
the constant.

**⚠️ Confetti fires on the comp variant only, and this is not a styling preference.**
The other variant tells somebody their free access ends in a fortnight. Confetti over
that is the app celebrating at a person it is about to start charging, which is the
single worst thing this screen could do. The existing confetti component is one shot,
`pointer-events-none`, and collapses to nothing under reduced motion; use it
unchanged.

**"Set up my plan" opens checkout**, where `01`'s mid-grace rule applies: the user is
not charged inside their fortnight, and their first charge is scheduled at the grace
end. `02b` owns the words they read there, including the mid-grace variant, which
reads as welcome rather than warning for exactly this reason — somebody acting on
this notice on day three is pre-arming their billing, not surrendering their free
time.

**`OPEN: awaiting answer to Q86`** — the built component's actual strings, both
variants, so the built-versus-approved comparison can be recorded rather than
assumed. The approved lines above are what ships either way; what is missing is the
list of what changes.

### 3.7 Once, and why a cookie rather than local storage

The notice is a modal, and whether it has been seen is read on the **server**, in the
request's cookies, before the page is built. So a notice already seen is never sent
to the browser at all.

**⚠️ Local storage cannot do this and the difference was measured.** The server
cannot read a device, so a locally-stored flag means the server renders the notice
every time and the client removes it after hydration: measured at a ~166ms paint of
an already-dismissed notice and a 68px page jump, on every load, for the whole
window. As a banner that was bad. As a modal it is a dialog about somebody's billing
flashing across the screen on every single app open and then being snatched away.

**It is scoped to the account**, by storing the user id as the value. Keyed on
nothing, a shared browser would show one person's notice being dismissed by another's
— the exact defect a previous fix failed to close by matching on a date suffix, which
looked equivalent and matched any account with the same date.

**Once ever, not once per trial.** The trial banner's cookie carries a date so a
returning customer's second trial is announced again. This one deliberately does not:
there is one moment when Trackd Co starts charging, it happens once, and
re-announcing it is an interruption with nothing new to say.

**The known limitation, stated rather than engineered around:** a cookie is
per-browser. Clearing cookies, a second device, or a private window all re-show the
notice. For a going-paid announcement that is tolerable — the information is still
true and still worth reading — and for the comp notice it is arguably a gift. Making
it exactly-once needs a column, which is a migration, for a screen that shows for two
weeks. **Recommended: accept it.** D30 in §7 if you disagree.

### 3.8 What the ~85 are actually promised, and what must never happen to them

They keep everything. Every log survives the fortnight, survives the lapse, and
survives indefinitely. Read-only means they stop adding and nothing else, and the
notice says so in its own words before it happens.

**Nobody in this cohort is charged inside their fortnight.** `01` guarantees it at
the create call; this spec guarantees the fortnight exists and is honoured; `11`
asserts it afterwards against the marker `01` writes.

**Nobody in this cohort gets a seven-day trial on top.** Twenty-one free days for the
group that has already had the whole product for months is not what was decided, and
`01` refuses it.

### 3.9 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** The notice names a
  date, the entitlement holds that date, and `01` aligns the first charge to it. The
  date on screen comes from the stored expiry, so the screen and the server cannot
  disagree.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** The notice says nothing gets deleted, and `05` is what makes that true
  when the fortnight ends.
- **Access is decided by entitlements and nothing else.** The backfill writes
  entitlement rows, which is the only mechanism that grants anything here. The
  notice is a notice.
- **A screen never states a price, date or promise the server would contradict.** The
  `[date]` renders from the row that governs access, server-side.
- **No user holds more than one billable subscription at any moment.** The backfill
  creates no subscription. A mid-grace subscriber holds a comp row and a Stripe row,
  which are two entitlements and one subscription.

### 3.10 If this goes wrong after go-live

If the gate is on and the rows are wrong, `BILLING_GATE_ENABLED=false` returns
everybody to full write access immediately without a deploy. It stops no charge. The
runbook is §9e of the founder's brief, carried in `12-go-live.md`. Refer to it; do
not restate it.

**The specific failure worth naming:** the gate on with the backfill unrun, or
partially run, means real users in read-only who should not be. That is what the
pair exists to prevent and what `12`'s verify-the-rows step catches before the flag
is ever set.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Adjudicate what is built.**
Read the grace module, the backfill route, the notice component and the cookie store
against §3.1's table. Record confirmed or diverged per row, and record the built
notice strings in full so the comparison against §3.6 is written down rather than
carried in somebody's head.
*Verify before moving on:* a written line per row, plus the string comparison.

**Step 2 — Bring the notice copy to the approved lines.**
Both variants, character for character per §3.6. **⚠️ No em dash. Kyle is a vial,
never a jar. A plan is "your Pro plan".**
*Verify before moving on:* every string matches, driven at 390x844, both variants.

**Step 3 — Confirm the date's provenance.**
The `[date]` renders from the account's stored expiry, server-side, in the user's
stored timezone. Not from the constant, not from the browser, not from a projection.
*Verify before moving on:* with the device timezone set well away from the stored
one, the notice's date matches the entitlement row.

**Step 4 — Confirm the confetti scoping.**
One shot on the comp variant, nothing on the beta variant, collapsing to nothing
under reduced motion.
*Verify before moving on:* both variants driven, reduced motion on and off.

**Step 5 — Prove the notice shows once.**
Dismiss it, reload, navigate away and back, and sign a second account into the same
browser.
*Verify before moving on:* one showing per account, and the second account's notice
is its own rather than the first's.

**Step 6 — Dry-run the backfill against seeded accounts only.**
**⚠️ Do NOT run it against the production account set.** Seed accounts on
`@trackd-qa.invalid`, run the route against them, and confirm one instant is shared
across every row it writes.
**⚠️ Test accounts are deleted BY ID ONLY. A previous cleanup matched the whole
domain and destroyed 16 real fixtures.**
**⚠️ Clean up Stripe objects BEFORE deleting a test user.**
*Verify before moving on:* every seeded row carries the same expiry to the second,
comps carry none, and a re-run restarts nobody.

**Step 7 — Walk the full beta lifecycle on a test clock.**
Backfill, notice shown once, fortnight honoured, a mid-grace subscribe that charges
nothing until the fortnight ends, `07`'s reminder before the end, then the lapse into
`05`'s gate at fourteen days.
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
- [ ] Everything works with the newest migration UNAPPLIED
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`, including the
      confetti
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] The notice is a portal, so it is verified by driving the app and never from
      served HTML

The words:

- [ ] Both variants render §3.6 character for character
- [ ] No em dash anywhere in either variant
- [ ] The beta variant never celebrates, and the comp variant never warns
- [ ] The `[date]` comes from the stored expiry, server-side, in the user's timezone
- [ ] With the device timezone set well away from the stored one, the notice's date
      matches the entitlement row and every other surface that prints it
- [ ] The terms line renders character for character on both variants, with both
      documents linked
- [ ] Neither button's label, behaviour or styling changed: nothing on the screen
      reads as an accept button
- [ ] The notice renders correctly with the terms line PRESENT and with it ABSENT,
      with no layout shift and nothing pushed off screen at 320x568

Once, and only once:

- [ ] The notice shows once per account and does not return on reload or navigation
- [ ] A second account in the same browser sees its own notice, never the first's
- [ ] The going-paid notice is never re-announced

The backfill:

- [ ] Every row written in one run shares one expiry instant
- [ ] Comp accounts get no expiry; everybody else gets one
- [ ] A re-run restarts nobody, and a lapsed grace stays lapsed
- [ ] A comp-list addition is upgraded rather than duplicated
- [ ] An account created after the run gets no grace and is treated as a new user
- [ ] The route refuses a caller without the shared secret

The route to checkout (D31):

- [ ] A mid-grace user reaches checkout from the notice's "Set up my plan"
- [ ] A mid-grace user reaches checkout from Billing AFTER dismissing the notice
- [ ] D13 alignment holds end to end from BOTH routes: no charge before the fortnight
      ends, and the first charge on the date the notice named
- [ ] "Got it" is visually primary and "Set up my plan" secondary, and neither is
      amber

The full lifecycle, on a test clock:

- [ ] Backfill, notice, fortnight, lapse, read-only — end to end
- [ ] A mid-grace subscriber is charged NOTHING before the fortnight ends, and their
      first charge lands on the date the notice named
- [ ] A beta account is refused a seven-day trial, before and after the fortnight
- [ ] `07`'s reminder fires before the grace ends and does not describe the fortnight
      as a trial
- [ ] At the boundary, access ends exactly once, with no gap and no double-lapse
- [ ] A beta account that never opens the app lapses cleanly, loses nothing, and
      finds every log intact on return

The pair with `05`:

- [ ] The gate is not enabled anywhere until this backfill has run and its rows have
      been verified to exist
- [ ] Neither spec is merged without the other

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

4. **Migrations are written, never applied.** This spec produces no SQL — the
   backfill is a hand-run route, not a migration, correcting the original spec map.
   If any SQL turns out to be needed, it stops and asks first, and any file it
   eventually produces opens with a ▶ HOW TO RUN THIS block and ends with a VERIFY
   block that returns rows, for the founder to apply by hand.

---

---

## 7. Open items

**Numbering note.** D29 is assigned in `05` and D30 in this spec, so the
notice-button decision is **D31** and the legal terms line **D32**, one number to one
decision.

~~`D31 — the notice's buttons`~~ **Re-decided 15 Aug 2026.** Both controls ship: "Got
it" primary and dismissing, "Set up my plan" secondary and routing to checkout. `08`
additionally gains a subscribe row for entitled-but-expiring accounts so the route
survives the dismissal, and the standing paywall-routing order is amended for those
two controls only. Carried in §3.6 and §0.

~~`D32 — the legal terms line`~~ **Resolved 15 Aug 2026, counsel-advised and
founder-signed.** "By continuing to use Trackd, you agree to the updated Terms of
Service and Privacy Policy.", both documents linked, acceptance by continued use, no
button changed. Carried in §3.6. **Wording pending counsel's final confirmation only;
an amendment returns as a superseding decision rather than as new work.** Two scope
points for counsel are named in §3.6: whether it belongs on the comp variant, and
that a user who never opens the app never receives notice.

**`OPEN — D30, exactly-once versus per-browser.`** Still unanswered. The notice is
remembered in a cookie, so clearing cookies, a second device, or a private window
re-shows it. **Recommended: accept it** — exactly-once means a column, which means a
migration, for a screen that exists for a fortnight. It matters slightly more now
that the terms line rides on the same surface: a re-shown notice is a second notice,
which is harmless, while a never-shown one is the real gap and no storage choice
fixes that.

**`OPEN: awaiting answer to Q86`** — the built notice component's actual strings,
both variants, verbatim. Blocks Step 1's completion, not Step 2's.

**`Q87`** — what "Set up my plan" navigates to today, and whether it does a full
document load. The read-only pop-up's equivalent uses a full load deliberately,
because the onboarding flow reads its step and session at mount and on history
navigation only, so a soft navigation would change the address bar and leave the
app's tree on screen. If this button does a soft push, it has the same defect.

**Also noted, not a decision:** this spec produces no migration. The global deadline
is written once at switch-on by the hand-run backfill route, not by SQL. If it should
instead be a migration with paste-ready SQL under §9g rule 4, that is a change of
mechanism rather than a clarification, and it needs saying.
