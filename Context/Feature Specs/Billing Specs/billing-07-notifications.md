Save as: Context/Feature Specs/07-notifications.md

*(Canonical path. The founder saves these locally as `billing-07 - Notifications.md`,
so the filename on disk may differ. Cross-spec references are by number — 01, 02a,
07 — which is unambiguous either way.)*

# Spec: Notifications

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

**Depends on:** `04-save-offer.md` for the courtesy period this spec must warn about,
and `05-read-only-gate.md` for the entitlement state it reads.

**⚠️ SHIP-TOGETHER PAIR — this spec and `04-save-offer.md` ship together or not at
all.**

**The amended D1 is this spec's whole reason for existing in the build order.** The
offer's terms line ends "and we'll remind you first." That is a promise made on the
highest-risk screen in the product, to somebody who just pressed cancel and is now on
a path to being charged.

**The release condition is a reminder VERIFIABLY firing before a courtesy charge,
proven on a Stripe test clock.** Not a code path that looks right. Not a test that
passes. An observed notification, before an observed charge, with time fast-forwarded.

**The in-app banner and push are the carrier. Stripe's own email is supplementary and
is explicitly not the backstop**, for a specific reason: Stripe's trial-reminder email
is configured to send seven days before a trial ends, and a trial is seven days long,
and a trial courtesy period is seven days long. Q79 is what establishes what it
actually does in that case.

**If the reminder cannot be proven to fire, the terms line's final clause does not
ship, and neither does `04`.**

**Seams:**

- **The final-day banner belongs to `05`, not here.** `05` shows one quiet banner on
  the last entitled day. This spec owns the reminder *before* that day. **⚠️ No
  double-banner: where the two windows overlap, this spec's reminder wins and `05`'s
  banner does not render.**
- `06` owns the grace fortnight. This spec owns the warning before it ends.
- `17-email-and-auth-identity.md` owns the missing email system, which is why the
  carrier here is push and in-app rather than mail.
- `12-go-live.md` owns the Stripe dashboard's own customer emails, including whether
  the mistimed trial reminder stays on.

---

## 1. Goal

Nobody is charged without a warning they could actually have seen, and nobody who
cannot write is nagged to write.

Two halves. A read-only account stops receiving dose reminders, missed-dose alerts
and low-stock warnings, because pushing "four doses are still unlogged today" to
somebody whose next tap the server will refuse is the product blocking an action and
then demanding it.

And a warning goes out before every ending that costs money: before a trial converts,
before a beta fortnight lapses, and — the piece that does not exist — **before a
courtesy period ends and a charge lands.** That last one is a promise already printed
on a screen, and this spec is what makes it true.

The read-only half is built and correct. The warning half is built for two of the
three endings, and the third is where the work is.

---

## 2. Out of Scope (do NOT build)

- **Do NOT** gate the trial, grace or courtesy warnings on write access. Those exist
  to tell somebody their access is ending, and the person that matters most to is
  exactly the one who can no longer write.
- **Do NOT** build an email system, a sending domain, or SMTP configuration. That is
  `17`, and its absence is a stated constraint here rather than a gap to fill.
- **Do NOT** rely on Stripe's email as the mechanism that keeps the offer's promise.
  It is supplementary. See §3.6.
- **Do NOT** render a second banner where `05`'s final-day banner already renders.
- **Do NOT** change the reminder's timing derivation. Both numbers are derived from
  the trial length precisely so the screens and the sender cannot drift apart.
- **Do NOT** use Stripe's own trial-will-end webhook as the send trigger. It fires
  three days out, which is day four of a seven-day trial, at an hour of Stripe's
  choosing in the middle of somebody's night.
- **Do NOT** send a reminder more than once per ending, or restart a claim that has
  already been stamped.
- **Do NOT** describe a fortnight of free beta access as a trial, or a paying
  customer's courtesy month as a trial. §3.4.
- **Do NOT** add analytics events. `13` owns them.
- **Do NOT** change the gate, the entitlement writers, or the save offer's grant.
- **Do NOT** merge anything to `main`.

---

## 3. Design Decisions

### 3.1 What was already built, and the verdict on each

| Built | Verdict |
|---|---|
| Dose, missed-dose and low-stock reminders suppressed for a read-only account | **Correct.** §3.2 |
| The suppression folded into the three toggles rather than added per call site | **Correct**, so a fourth content reminder added later is covered by construction |
| Trial and grace warnings deliberately NOT suppressed | **Correct.** §3.2 |
| The runner re-derives write access from entitlements rather than calling the session-scoped gate | **Correct.** The cron has no session. §3.3 |
| One entitlements read serving both the write decision and the grace lookup | **Correct.** Two reads are two things that can disagree |
| A real trial wins over a grace when an account has both | **Correct.** §3.4 |
| Reminder timing derived from the trial length at both ends | **Correct.** §3.5 |
| The send claimed by a conditional update, and released if nothing was delivered | **Correct.** §3.5 |
| Quiet hours pushing the send to quiet-end rather than dropping it | **Correct**, and it is a fix. §3.5 |
| Two copy variants: a real trial and a beta grace | **True of the push, false of the banner.** Fixed; see below |
| A third variant for a courtesy period | **Does not exist.** This is the spec's main work. §3.4 |

### 3.1b The banner said "trial" to beta accounts, and it was days from shipping

**Found in this spec's own step 1, and it is worth recording rather than quietly
fixing.** The push had two correct variants. The banner did not: its line builder
returned "Your free trial ends {when}." unconditionally, while the dashboard fed it the
grace re-described as a trial. **So a beta-grace account read "Your free trial ends 28
Aug."** — the exact failure §3.4 exists to prevent, on the other surface.

**It was latent because the grace shape is only built when the gate is on**, which
means it would have surfaced for roughly ninety real accounts on launch morning and not
before. **A defect that is invisible until the day it matters most is the shape this
project keeps finding**, and it is why §3.4's rule is stated for every surface rather
than for the sender alone. Fixed.

### 3.2 Who is silenced, and who is not

**Silenced when read-only:** dose reminders, missed-dose alerts, low-stock warnings.
Everything that asks somebody to log something.

**Never silenced:** the trial warning, the grace warning, and the courtesy warning.
These are the messages that say access is ending or has ended, and a read-only user is
the person who most needs them.

The suppression is folded into the three content toggles rather than bolted onto each
send site, so anything added later inherits it. Keep that shape.

### 3.3 Why the runner re-derives access instead of asking the gate

The gate's own entry point resolves identity from the verified session, and the cron
has no session — it acts on whoever it is currently processing. So the runner reads
the entitlement rows for that user and applies **the same pure rule** the gate
applies, rather than a looser local approximation.

**That sameness is the requirement.** If the runner's idea of "can write" ever
diverges from the gate's, the app silences somebody it will accept writes from, or
nags somebody it will refuse. Both are visible to the user and neither is caught by a
test.

The entitlements query is issued only when the gate switch is on, and the write
decision defaults to true when it is off, which is today's world.

### 3.4 ⚠️ Three endings, three variants, and the one that would lie

Every ending is handed to the sender in the same shape — a status, an end date, no
pending cancellation — so the machinery does not have to learn a new concept. That is
a good decision. **The copy is where it stops being one.**

**A real trial:**

> Your trial ends soon

> Day 5 of 7. Your trial ends on [date], and billing starts then.

**A beta grace:**

> Your free access ends soon

> Trackd stays free until [date]. After that you can still read everything, but not log anything new.

This variant exists because the grace is described to the sender as a trial, which
costs the date arithmetic nothing and told ninety people with no card on file that
billing was about to start.

**A courtesy period, which does not exist yet and is the reason this spec is in the
pair.** Without it, a customer two years into a subscription who accepted a free month
receives "Day 5 of 7. Your trial ends on [date]" — false about the day, false about
the length, false about the trial, and sent to somebody about to be charged.

Signed off as D33 and carried as decided. The noun follows the granted period, "free
week" or "free month", and never "trial":

Banner:

> Your free month ends on {date}.

Banner body:

> Your plan starts then, and the reminder you were promised is this one. Cancel anytime before if you've changed your mind.

Push title **(D82), reusing the approved grace title, which is true of this cohort
too**:

> Your free access ends soon

Push body:

> Your free month ends {date}. Your plan starts then.

**The reuse is recorded rather than left as a gap.** This section signs titles for the
trial and grace variants and originally gave the courtesy variant only a body, which
would have left a builder inventing one. Reusing an approved line where it is true
follows the precedent `02b` set in reusing an approved button label, and it means one
fewer string to keep in step.

**Re-signed verbatim after the em-dash catch.** The original body carried an em
dash, which the house rules ban in every user-facing string. The founder re-signed
the line with a full stop in its place and kept "anytime" as one word. That is the
signed form and it is carried exactly, including "anytime". The line's best move is
untouched: naming this message as the promised reminder closes the loop with the
offer's terms line in the user's own reading.

**⚠️ The discriminator depends on an unapplied migration, and the fallback must be
the safe one.** A courtesy period is told apart from a trial by the mirror's courtesy
column, which arrives with `supabase/billing/003_courtesy_until.sql` — **written, not
applied.** Per D10 it is applied before the re-land deploy, so by go-live it is there.
But the code must be correct in the window where it is not.

**Where a courtesy period cannot be distinguished, fall back to the grace variant's
neutral wording, never to the trial variant.** The neutral wording is true of all
three endings; the trial wording is false of two. A fallback that degrades to a lie
is not a fallback.

**⚠️ An unapplied migration reports `PGRST204` on a write and `42703` on a read**, and
**a column added to a select breaks the ENTIRE request if the migration is not
applied.** The courtesy column is read in its own tolerant query, never folded into
the select that decides whether anybody gets reminded at all.

### 3.5 Timing, and the two mechanisms that keep it honest

The reminder fires two days before the ending, at the user's own reminder time, in
their own timezone. Both numbers are derived from the trial length rather than written
down twice, so a change to the trial cannot silently break a promise printed on the
paywall.

**The screens count forward and the sender counts back, deliberately.** A person reads
a timeline forwards; the sender only holds the end date. Counting back is also the
more honest of the two if they ever disagree — if Stripe's trial is not exactly the
standard length, because of a support extension or a courtesy grant, then "day five"
is a number about a schedule that no longer exists while "two days before you are
charged" is still exactly what was promised. **This is precisely why the courtesy
period works at all: the grant moves the trial end, the mirror follows, and the
sender counts back from the new date with no new machinery.**

**Quiet hours push the send to quiet-end rather than dropping it.** A reminder time
inside a quiet window killed the send permanently, because every tick was either too
early or inside quiet hours. Keep the fix.

**The send is claimed before delivery by a conditional update and released if nothing
was delivered**, so a crash mid-send does not consume the only warning somebody gets.
**⚠️ A moved end date is a new claim.** The stamp is keyed to the date, so a courtesy
grant that moves the ending produces a fresh claim and a fresh reminder rather than
being suppressed by the stamp from the original trial. This must be verified, not
assumed, and it is the mechanism the whole pair rests on.

### 3.6 The carrier, and why Stripe's email is not it

**Push reaches only users who granted permission.** The in-app banner reaches
everybody who opens the app. Between them they are the carrier, and the banner's line
is built by the same function the push uses so the two cannot word one fact
differently.

**Stripe's own customer emails are supplementary and their timing is not ours.** The
trial-reminder email is configured seven days before trial end. A trial is seven days.
A trial courtesy period is seven days. **Q79 establishes what Stripe actually does
with that**, and it is answerable only on a test clock.

**Two further limitations, stated rather than assumed:**

The Stripe customer's email address is written once when the customer is created and
**never refreshed**, and there is no local column holding it. A user who changes their
address in the app keeps the old one at Stripe indefinitely, so a supplementary email
may go somewhere they no longer read. `17` fixes it; this spec must not depend on it.

The upcoming-renewal email is also set to seven days, which on a weekly plan is the
whole cycle. **`12`'s dashboard review decides what to do about both**, and D34 in §7
frames it.

**None of this changes the release condition.** The promise is kept by the reminder
this spec builds, proven on a clock.

### 3.7 The no-double-banner rule

`05` shows one quiet banner on the final entitled day. This spec's reminder fires two
days before an ending. The windows overlap on the last day.

**The rule, stated absolutely: on any day a user is eligible for both `05`'s
final-day banner and a pair-2 reminder banner, the reminder renders and the final-day
banner is suppressed. The promised reminder always wins.** Two banners about the same
ending on one screen is worse than either alone, and the one that was promised in
writing is the one that cannot be dropped.

`05` carries the reciprocal instruction. Verify from both directions.

### 3.8 Invariants this spec touches, and how the work preserves each

- **Nobody is ever charged after being told they would not be.** The courtesy
  reminder is the mechanism behind "we'll remind you first". Without it the sentence
  is false and `04` does not ship.
- **A user's logged data is never deleted, hidden, or withheld to apply commercial
  pressure.** Silencing content reminders for a read-only account is the opposite of
  pressure: it stops the app demanding what it has blocked.
- **Access is decided by entitlements and nothing else.** The runner reads
  entitlements and applies the same pure rule the gate applies. It decides what to
  send, never what somebody may do.
- **A screen never states a price, date or promise the server would contradict.**
  Every date in every variant comes from the mirror, which is written from a live
  Stripe object rather than a webhook payload, and the banner and the push share one
  line-building function.
- **A server action never accepts an identifier saying whose data to act on.** The
  runner is not a server action; it is a route protected by a shared secret and it
  acts on whoever it is processing. **⚠️ Any export added to a `"use server"` module
  during this work is a publicly dispatchable endpoint.**

### 3.9 If this goes wrong after go-live

`BILLING_GATE_ENABLED=false` restores write access without a deploy and stops no
charge. There is no in-app control that stops billing for everybody, and no support
tooling. The runbook is §9e of the founder's brief, carried in `12-go-live.md`. Refer
to it; do not restate it.

**The failure specific to this spec:** a reminder that silently stops sending is
invisible until somebody is charged without warning. That is the silence the
reconciliation work in `11` exists to make impossible, and the cron's own response
payload is the only observability this system has today.

---

## 4. Implementation

Follow `architecture.md` for the project's actual folder structure, navigation,
and naming conventions — place files where existing screens/components live; the
paths below are intent, not literal if they conflict with the repo. Follow
`code-standards.md` for component patterns, typing, and lint cleanliness.

Build in this order, verifying each step before the next:

**Step 1 — Adjudicate what is built.**
Read the runner, the reminder module and the banner against §3.1's table. Record
confirmed or diverged per row before changing anything.
*Verify before moving on:* a written line per row.

**Step 2 — Add the courtesy discriminator, tolerantly.**
Read the courtesy marker in its own query, never folded into the select that decides
who is reminded. Handle both the write code and the read code an unapplied migration
produces.
**⚠️ Where the marker cannot be read, fall back to the neutral variant, never to the
trial variant.**
*Verify before moving on:* with `003` unapplied, a courtesy period is reminded with
neutral wording and nothing errors; with it applied, the courtesy variant is selected.

**Step 3 — Add the courtesy copy variant.**
Per D33 once decided. **⚠️ No em dash. Do not call it a trial.**
*Verify before moving on:* a paying customer on a courtesy month never reads the word
"trial" in a push or on the banner.

**Step 4 — Prove a moved end date produces a fresh claim.**
Grant a courtesy period on a subscription that has already been reminded for its
original ending, and confirm a second claim is made and a second reminder sent.
*Verify before moving on:* observed, on a clock, not reasoned about.

**Step 5 — Enforce the no-double-banner rule.**
Where this spec's reminder window and `05`'s final-day banner overlap, this one
renders and `05`'s does not.
*Verify before moving on:* driven at 390x844 on the overlap day, from both specs'
sides.

**Step 6 — Drive the full reminder lifecycle on a test clock, twice.**
Once for a trial ending and converting. Once for a courtesy period ending and
charging. In both, the reminder must be observed **before** the charge.
**⚠️ This is pair 2's release condition. Until it is observed, the offer's final
clause does not ship and `04` does not ship.**
**⚠️ `http://127.0.0.1` does not hydrate.**
**⚠️ The Supabase database is production, with ~90 real users. Seed test accounts on
`@trackd-qa.invalid` and delete them BY ID ONLY.**
**⚠️ Clean up Stripe objects BEFORE deleting a test user.**
**⚠️ Do NOT run `next build` or delete `.next` while a dev server is running.**
*Verify before moving on:* two observed reminders, two observed charges, correct
order both times.

**Step 7 — Answer Q79 by observation.**
On the same clock, record whether Stripe's own trial-ending email fires for a moved
trial end, and what it does when the period is seven days or shorter.
*Verify before moving on:* written down, and handed to `12` for the dashboard
decision.

---

## 5. Check When Done

Gates and environment:

- [ ] `tsc` clean, ESLint clean, all tests pass, `next build` succeeds
- [ ] Verified by DRIVING the running app at 390x844 on `http://localhost`, not by
      reading code or trusting tests
- [ ] Verified against real Stripe test mode with a test clock, never a fixture
- [ ] Everything works with `003` UNAPPLIED, with the neutral fallback in place
- [ ] Every dialog: focus moves in, Tab cycles inside it, Escape closes it, and
      focus returns to the trigger
- [ ] Every tap target at least 44px
- [ ] Animation collapses to nothing under `prefers-reduced-motion`
- [ ] Nothing sits under the fixed bottom nav or the FAB
- [ ] Any new server action refuses an anonymous caller and another signed-in user
- [ ] The run route still refuses a caller without the shared secret

Who is silenced:

- [ ] A read-only account receives no dose reminder, no missed-dose alert, no
      low-stock warning
- [ ] A read-only account still receives the trial, grace and courtesy warnings
- [ ] With the gate off, nobody is silenced
- [ ] The runner's write decision and the gate's write decision agree for the same
      account, checked on an entitled account and a lapsed one

The three variants:

- [ ] A real trial gets the trial wording
- [ ] A beta grace gets the grace wording and is never told billing starts
- [ ] **The banner and the push agree**, checked for a beta-grace account with the
      gate ON, which is the only state in which the defect in §3.1b was reachable
- [ ] The courtesy push carries the D82 title
- [ ] A courtesy period gets the courtesy wording and is never called a trial
- [ ] With `003` unapplied, a courtesy period falls back to the NEUTRAL wording and
      never to the trial wording
- [ ] No em dash appears in any variant
- [ ] Every date comes from the mirror, and the push and the banner show the same one

Timing:

- [ ] The reminder fires two days before the ending, in the user's timezone
- [ ] A reminder time inside quiet hours fires at quiet-end rather than never
- [ ] A crash mid-send releases the claim and the reminder is sent on the next run
- [ ] **A moved end date produces a fresh claim and a second reminder**, verified by
      granting a courtesy period after the original reminder has already been sent
- [ ] No ending produces two reminders

The pair with `04`:

- [ ] **A reminder is OBSERVED firing before a courtesy charge, on a test clock.**
      This releases `REMINDER_PROMISE_ENABLED`, not `04`: `04` ships either way
- [ ] Until it is observed, the flag stays unset and both promise strings stay
      withheld together
- [ ] The same observed for a trial converting
- [ ] Q79 answered by observation and handed to `12`

The banner seam:

- [ ] On the overlap day, exactly one banner renders, and it is this spec's
- [ ] A courtesy user's final day shows exactly one banner, and it is the pair-2
      reminder
- [ ] `05`'s final-day banner still renders on days this spec's reminder does not

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

4. **Migrations are written, never applied.** This spec produces no SQL and does not
   apply `003`. If any is needed it stops and asks first, and any file it eventually
   produces opens with a ▶ HOW TO RUN THIS block and ends with a VERIFY block that
   returns rows, for the founder to apply by hand.

---

## 7. Open items

One decision blocks Step 3. One is `12`'s to act on. One question governs release.

~~`D33 — the courtesy reminder's wording`~~ **Resolved 15 Aug 2026.** Banner, body
and push carried in §3.4, with the noun following the granted period.

~~`D33's punctuation`~~ **Closed 15 Aug 2026.** Re-signed with a full stop in place
of the em dash; "anytime" stands as signed. Carried verbatim in §3.4.

~~`D34 — Stripe's own customer emails`~~ **RESOLVED 17 Aug 2026 ON THE Q79
MEASUREMENT: the trial-ending email goes OFF.** Two reasons, both from the observed
numbers rather than from judgement:

1. **At a seven-day lead against a seven-day trial it fires at trial START**, which
   warns nobody of anything.
2. **On a courtesy period it tells a paying customer their TRIAL is ending** — the
   Law 5 violation this spec exists to prevent, and Stripe's copy cannot be edited
   to fix it. A moved `trial_end` raises a fresh `trial_will_end`, so Stripe
   re-schedules on a courtesy grant rather than staying quiet.

`07`'s push and banner are the carrier, and D1's release condition is observed. **D65's
receipt emails stay ON** — different email, different purpose.

The dashboard toggle is a launch-morning step in `12`, with by-eye verification,
because the email itself is not API-observable: Stripe exposes no endpoint for sent
customer emails and test mode delivers them nowhere a harness can read.

**The upcoming-renewal email at seven days against a weekly cycle is a separate
question and is NOT decided here.** It was named in the same paragraph as the trial
email and is a different message on a different trigger; Q79 measured the trial one.

**`Q79`** — whether Stripe's trial-ending email fires for a `trial_end` moved
mid-cycle, and what it does when the period is seven days or shorter. Answerable only
on a test clock, in Step 7. **It does not block construction. It informs D34, and the
pair's release depends on the separate observation in Step 6.**
