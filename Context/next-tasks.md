# Next Tasks

The **windscreen** — the concrete next steps. This file says *what to do next*;
`progress-tracker.md` records what's already done. When a task finishes: log it in
`progress-tracker.md`, delete it here, add the next steps. Full history is in git.

Last updated: 2026-08-17 (spec 11 Steps 1-2 built; D86 written; the 29 Aug grace
reminder traced)

---

## 📮 TO THE SPEC CHAT — D90, a CLARIFICATION OF D30 keeping the number

**06 §3.7 and D30.** D30 decided the seen-marker is a per-browser cookie rather than a
database row. **It did not decide that one person's dismissal consumes another's
notice**, and a drive on 2026-08-17 found that it did: the cookie held one id, so B
dismissing overwrote A's record and A met the going-paid notice again.

**D90 (Adrian, 2026-08-17): the cookie is ACCOUNT-SCOPED.** Scope its value by user id
and reject a mismatch on read, as `openOfferStore` does, for the same stated reason — a
shared browser must not leak one person's state to the next. Two mechanisms doing the
same job should not disagree. §3.7's "known limitation" paragraph still stands for
cleared cookies, a second device and a private window; it must no longer be read as
covering a second account.

⚠️ **One note for the spec chat, because the wording and the code pull apart.**
"Reject a mismatch on read" was ALREADY the built behaviour (`betaNoticeStore.ts:50`,
`cookieValue === userId`), which is why B never inherited A's dismissal — the leak
direction was closed from the start. **The half that was missing was on the WRITE**: it
replaced the value rather than adding to it. And `openOfferStore` is itself a single
slot (`openOfferStore.ts:86`), correctly, because a ten-minute offer can only have one
in flight — so it is the right model for the CHECK and the wrong one for the STORAGE.
Built as a set of ids so both dismissals survive; if the spec means something narrower,
that is a ruling, not a clarification.

Capped at 8 ids (~300 bytes), evicting the oldest. The ninth account on one browser
re-shows the notice for the first, which is §7's harmless direction.

---

## 📮 TO THE SPEC CHAT — three amendments to 06, all decided by Adrian 2026-08-17

**06 §0** — "There are **zero** entitlement rows in the database today… The backfill
has never been run." **The premise is FALSE, not stale.** The backfill ran on
2026-08-17 during the D81 verification; there are ninety rows dated 31 August, and
`12` §P11 is now D86's re-dating migration. §0's ship-together reasoning still holds,
but its stated starting condition cannot be reached again.

**06 Step 6** — "run the route against them". **Do not.** `/api/billing/beta-grace`
is banned in every mode, for any reason, including as part of a test, because
driving it once already ran the backfill against production. Backfill logic is
exercised through `betaGrantFor` / `grantExpiry` against seeded rows, which needs no
route. Step 6's own goal — "confirm one instant is shared across every row it
writes" — is already true of the rows that exist.

**06 Step 7** — "Backfill, notice shown once, fortnight honoured…" is a sequence that
cannot be replayed. What it was reaching for is driven instead by
`scratchpad/harness/notice.scenario.ts`: **move the entitlement row and the notice
moves with it**, which is the property D86 depends on and the one that proves the
notice reads rather than computes.

---

## ✅ 06 STEPS 1-5 — ADJUDICATED, BUILT AND DRIVEN. 9/9 in `notice.scenario.ts`.

### ✅ Step 4 — the confetti is scoped, and it collapses rather than strands

Four cells driven at 390x844, because two of them are only meaningful beside the
other two. Read from the rendered DOM and the computed style, never from source.

|  | motion normal | `prefers-reduced-motion: reduce` |
|---|---|---|
| **comp** | 18 pieces, `display:block`, 18 animations, `iterations: 1`, `finished` at 8s | 18 pieces present, container `display:none`, **0 animations** |
| **beta** | **0 pieces, 0 animations** | 0 pieces |

The comp row is the control for the beta row (the burst exists at all, so zero on
the beta variant is scoping rather than breakage); the normal column is the control
for the reduce column (it runs at all, so stopped is the opt-out rather than a dead
component). `pointer-events: none` confirmed on the container — the burst covers
"Thank you", the only control on that variant.

**"One shot" is observed, not declared.** `iterations: 1` is the declaration;
`burstStates: ["finished"]` after 8 s — past the longest piece's 1140 ms delay plus
4600 ms duration — with all 18 pieces still in the DOM is the observation.

**And reduced motion is HIDDEN, not merely stilled**, which is the distinction
`confetti.tsx` already paid for: the shared `animation: none` opt-out alone strands
eighteen amber dots at `opacity: 0.59` along the top edge, because these keyframes
animate TO invisibility. `containerDisplay: "none"` is the collapse.

### ✅ Step 5 — once per account, and B never inherits A's dismissal

One persistent browser context, two beta accounts on **deliberately different
dates** (30 Sept vs 20 Nov). Two different variants would be told apart by their
headline and would prove nothing about scoping; same variant, different row, means
"B saw its own" cannot pass by accident.

- A's notice opens showing **30 Sept 2026** ← arrival
- "Got it" → detached, and the cookie holds **A's user id**
- reload → absent, with `nav[aria-label="Primary"]` asserted present as the CONTROL
  (a dead page and a suppressed notice are otherwise the same observation)
- soft nav to `/protocol` and back → absent, shell present
- swap the `sb-*` session cookies to B, keeping the seen-cookie (CONTROL: it still
  holds A's id, or B seeing a notice would be trivially true) → **B's notice opens
  showing 20 Nov 2026, and never 30 Sept**

### 🟡 S4 — ONE COOKIE SLOT, AND THE SPEC DOES NOT RULE ON WHAT IT COSTS

**Observed, pinned by a test, and flagged for a ruling rather than decided here.**

§3.7 says two things that are both true and that pull apart in exactly one case: the
flag "is scoped to the ACCOUNT, by storing the user id as the value", and "a cookie
is per-browser", listing the re-show cases it accepts — clearing cookies, a second
device, a private window. **Two accounts alternating in one browser is not in that
list**, and it behaves differently from both readings.

Driven: A dismisses (cookie = A). B signs into the same browser, sees its own notice,
dismisses (cookie = B). **A returns and the notice is SHOWN AGAIN** — and it is A's
own notice, showing A's date. The cookie is one slot holding one id, so it cannot
remember two dismissals at once.

So §5's box *"the notice shows once per account and does not return on reload or
navigation"* is true for every account except one that shared a browser.

**Not called a defect here.** `04`'s offer store is account-scoped and D30's cookie
is per-browser, deliberately, so the two disagree by design; and §7 already reasons
that "a re-shown notice is a second notice, which is harmless, while a never-shown
one is the real gap". A second going-paid notice costs an interruption, not money,
and no charge or promise moves. **Recorded because it is a real observable behaviour
on a shared device that no line of the spec names.** If Adrian wants exactly-once
per account it needs a column, which is a migration — §7's D30 recommendation is to
accept it, and accepting it should be written to cover this case too.

### ✅ The date's provenance is CORRECT (Step 3, by reading)

`dashboard/page.tsx:236-241` renders `betaEntitlement.activeUntil` — **the
entitlement row** — formatted server-side in the user's stored timezone.
`isComp` is `!activeUntil`, so a no-expiry comp is the comp variant. **Nothing is
derived.**

**✅ And the stored zone is now DRIVEN too, closing Step 3's other half.** The
move-the-row test proves the notice READS; this proves it reads in the RIGHT ZONE,
which is a separate failure — a correctly-read instant formatted in the browser's
zone is still wrong on screen, and wrong by a whole day for half of every day. The
instant is chosen so the two zones disagree on the calendar date, which is the only
kind that can tell them apart: `2026-09-30T16:00Z` is **1 Oct** in the stored
Australia/Sydney and **30 Sept** in the device's America/Los_Angeles. The notice
reads "until 1 Oct 2026", with the device zone asserted as
`America/Los_Angeles` as the control.

**And the one place a derived date WOULD be wrong is worth naming.**
`app/onboarding/page.tsx:293-317` deliberately runs `resolveFreeTime` and shows the
CLAMPED instant, because that screen states a CHARGE date and must match what
Stripe will hold. ⚠️ **The notice must never copy that.** The clamp only moves
LATER, so a notice showing it would promise access up to 48 hours beyond
`active_until` — and the gate lapses at `active_until`. A notice reading the clamp
would over-promise against the gate that enforces it. Two surfaces, two dates, both
correct: charge date is clamped, access-ends date is the row.

### ❌ The notice copy diverges from §3.6, in both variants

Same shape as `05`'s pop-up. Recorded here so the comparison is written down:

| §3.6 approved | Built |
|---|---|
| "Trackd Co is going paid" | "Trackd is going paid" |
| "You've been using it free while we built it…" | "You've been using Trackd for free while we built it…" |
| "From today it's a paid app, and because you were here early you've got two more weeks on us, until [date]." | "From now on Trackd is a paid app. You've got until {date} on us to decide." |
| "After that your account goes read only. You'll still see everything you've logged, you just can't add to it. Nothing gets deleted." | "After that you can still open Trackd and read everything in it. You just won't be able to log anything new until you subscribe. Nothing gets deleted." |
| Buttons: "Got it" (primary) + "Set up my plan" | ONE button: "Got it" |
| "Trackd Co is yours. For life." | "Trackd is yours. For life." |
| "It costs money for everyone else from today…" | "Trackd costs money for everyone else from today…" |
| "You were here for the version that barely worked, and you stayed. That's worth more than a subscription." | "Thanks for being here when it was held together with tape." |

⚠️ **The built beta variant never uses the exact phrase "read only"**, which the
brief makes mandatory on every surface naming the state. Same defect `05` §7 raised
about the alternative pop-up copy set.

D31 is **re-decided — both controls ship**, so the missing second button is a
divergence rather than an open question.

### ⚠️ "two weeks" is TYPED, and the fourteen must never be

`BetaLaunchNotice.tsx:255` falls back to the literal `"two weeks"` when `endsOn` is
null. The rule is that the fourteen comes from `BETA_GRACE_DAYS` and is never
typed. The approved line also says "two more weeks" as signed prose — so this needs
Adrian's word on whether the signed wording derives from the constant or is simply
sacred as written.

### 🔴 CONFLICT 1 — Step 6 instructs the thing that is banned

`06` Step 6: *"run the route against them"*. Adrian, 2026-08-17: **"DO NOT CALL
`app/api/billing/beta-grace`, in any mode, for any reason, including as part of a
test."** The instruction is newer, explicit, and was given because that route
already ran the backfill against production. Taking the instruction as governing,
and NOT running the route — but saying so rather than resolving it silently.

Backfill logic can still be exercised by calling `betaGrantFor` / `grantExpiry`
against seeded rows, which needs no route.

### 🔴 CONFLICT 2 — Steps 6 and 7 assume a backfill that has already run

Both are written for a database with **zero** entitlement rows (`06` §0 says so
outright). There are ninety, dated 31 August, and **P11 is now D86's re-dating
migration rather than the backfill**. So Step 6's "confirm one instant is shared
across every row it writes" is already true of rows that exist, and Step 7's
"backfill, then notice" is a sequence that cannot be replayed.

What still needs driving from Step 7 is everything AFTER the rows exist: notice
once, fortnight honoured, mid-grace subscribe charging nothing inside it, `07`'s
reminder, then the lapse into `05`'s gate — and `05` Step 7 has already driven the
last of those.

---

## 🔴 05 STEP 6 IS IN PROGRESS, AND ITS DRIVER IS NOT IN THE REPO

**Status: NOT a pass, and deliberately not reported as one.** `qa-05-attack.mjs`
captures a real server-action dispatch, but the ENTITLED account's write is not
landing — so the three attacks would be replayed against a path never proven to
work. Standing rule 4: confirm the driver reached the state before reporting a
result from it. Three green ticks there would have been a false pass.

    ✅ ARRIVAL: a real server-action dispatch was captured — 1 POST
    ❌ ARRIVAL: the entitled account's write actually landed — 0 rows

Next: find why (the captured POST may not be `logWeight` at all), then re-run.

### ⚠️ AND THE DRIVERS ARE ON ONE MACHINE, IN NOBODY'S CLONE

`.gitignore:73` is `/scratchpad/*` with `!/scratchpad/harness/` re-included. So the
harness scenarios are tracked and **every `qa-*.mjs` and `cold-*.mjs` driver is
not** — including `qa-05-readonly.mjs`, the 23/23 drive of the read-only pop-up
that `05` Steps 2 and 3 were signed off on, and the whole shared spine those
drivers import (`admin.mjs`, `qa-billing.mjs`, `qa-cancel.mjs`).

**This exact failure is already written down in `lib/billing/gate.ts`**, about
`gate-audit.mjs`: *"It lived in `scratchpad/`, which `.gitignore` excludes — so the
script this paragraph rests its credibility on was on one machine and in nobody's
clone. A cold review pointed that out. It is tracked now."* It was fixed for that
one file and the class was left open.

It matters here because `05` §5 and `12` both rest on evidence these drivers
produced. A cold reviewer cannot re-run any of it, and neither can a future
session.

**Founder's call, two options:** track the driver corpus the way `harness/` is
tracked, or accept that driven evidence is a point-in-time claim in a commit
message and say so. Not decided here, because moving ~60 files that import a shared
untracked spine is not a change to make silently.

---

## ✅ PAIR 2'S RELEASE CONDITION IS OBSERVED — 2026-08-17, on a real Stripe test clock

**`07` §0: "an observed notification, before an observed charge, with time fast
forwarded."** `scratchpad/harness/promise.scenario.ts`, 1/1, `HARNESS_ALLOW_STRIPE=1`.

    reminder delivered   2026-08-28T23:05:00Z   trialReminder=sent, stamp 2026-08-29
    courtesy period ends 2026-08-31T05:20:18Z
    invoice PAID         2026-08-31T06:20:18Z   in_1U5IyNEmCWV24GLCdjGAssQ6

Real customer, real `pm_card_visa`, real subscription, real test clock, real invoice,
real web-push bytes under a valid VAPID signature. Four arrival checks before any of
it counts: the mirror written from the live object; the grant returning
`{ok:true, kind:"trial"}`; the mirror moved AND `courtesy_until` non-null AND
`cancel_at_period_end` lifted; and an invoice that actually got paid.

Both directions asserted, because "we'll remind you first" breaks equally either way:
the reminder precedes the charge, **and** no money moved before the courtesy period
ended.

⚠️ **NOT real: the webhook.** There is no tunnel from Stripe to this laptop, so
`syncSubscription` is called directly with the live Stripe object — which is what the
webhook does with it, and what `05` §3.7 records the offer claim itself doing.

### ⚠️ `REMINDER_PROMISE_ENABLED` IS ADRIAN'S TO SET, AND I HAVE NOT SET IT

`07` §5 says this observation "releases `REMINDER_PROMISE_ENABLED`, not `04`". The flag
is absent from `.env.local` and `reminderPromise.ts:39` fails toward NOT promising by
design. Setting it ships two signed promise strings to real users and is an environment
change in Vercel, so it is a founder action, not an agent one. **The condition it waits
on is now met.**

### What Step 6 still owes

Step 6 asks for the lifecycle **twice**: a courtesy period ending and charging (done,
above) and **a plain trial ending and converting** with no offer in between (not
driven). The mechanism is the same clock and the same assertions with the grant step
removed. Step 7 (Q79, Stripe's own trial-ending email against a moved `trial_end`) is
untouched and still `it.todo` in `monday.scenario.ts`.

---

## 🔴 05 §3.6b's FINAL-DAY BANNER WAS DECIDED AND NEVER BUILT — found driving 07 Step 4

**`07` Step 5 is "enforce the no-double-banner rule". There is nothing to suppress.**

`05` §3.6b decides a banner — **"Your plan ends today."**, quiet, last entitled day
only, tapping to Billing — and `05` §7 records it as decided on 15 Aug. **The string
appears nowhere in the tree**, and `05`'s Steps 1-8 contain no step that builds it: the
decision was recorded in the design section and never given an implementation step.

Driven, `banner.scenario.ts`, 5/5, gate on, 390x844, with a control grep proving the
search works before trusting the empty result:

| Account on its final entitled day | Banners |
|---|---|
| trialing, not cancelled | **1** — "Your free trial ends today." |
| beta grace (comp, expiring) | **1** — "Your free access ends today.", never "trial" |
| trialing, `cancel_at_period_end` | **0** |
| active + `cancel_at_period_end`, period ends today | **0** |

**So `07` §3.7's rule holds VACUOUSLY** — exactly one banner on the overlap day and it
is `07`'s — while `05` §5's box *"the final-day banner renders on the last entitled day
only"* is false in the other direction: it never renders.

⚠️ **The two zero rows are the finding.** `trialNoticeFor` returns null on its first
line for `cancelAtPeriodEnd` and for any status that is not `trialing`
(`trialReminder.ts:291`), both deliberately — `07`'s promise is "before anything
changes", and for somebody who already cancelled, nothing is. **That is precisely the
hole `05` §3.6b was decided to fill**, in a cohort-neutral sentence that also works for
the ~85 who never had a subscription. Nobody currently gets it.

**Not a money defect and not stop-list.** Nobody is charged, no promise is contradicted,
and the copy is already signed so there is nothing to invent.

### ✅ RULED 2026-08-17 — IT SHIPS, as `05` STEP 9, QUEUED AFTER 08 AND 09

Adrian: a decided screen with no build step is the same class as D76 wired to nothing.
**But no promise is broken** — a canceller was told the date in the cancel confirmation
and a beta user in the notice — so it is a courtesy, and `08` and `09` have no code at
all. They go first.

⚠️ **If the freeze arrives before Step 9 does, record it under §9g as a DELIBERATELY
ACCEPTED GAP rather than an oversight**, citing `05` §3.6b for the decision and
`lib/notifications/trialReminder.ts:291` for why `07`'s banner cannot cover the cohort.

---

## 🔴 MUST CLOSE BEFORE 07 SHIPS — the grace reminder degrades into the trial copy

**Traced 2026-08-17, four ways, then adversarially refuted three ways. Not live
today. Latent, and it opens the moment 07 is deployed.**

**The question:** can the production cron push "your free access ends" to the 86 real
grace accounts on 29 August, with `BILLING_GATE_ENABLED` unset and `06`'s notice never
shown? (The 86 graces end 2026-08-31; the reminder lead is two days.)

**Today: NO, for two independent reasons.** Production runs `origin/main` (`b925568`),
which does not contain `lib/notifications/trialReminder.ts` or `lib/billing/gate.ts` at
all — the reminder engine is not deployed. And on this branch, the grace read is behind
the gate: `runner.ts:202-211` makes the `entitlements` query the *then* branch of a
`billingGateEnabled()` ternary, so with the flag unset the row is never fetched, `trial`
is null, and `trialReminderVerdict` returns `no-trial` on its first line.

**⚠️ THE DANGEROUS PATH IS NOT THE GATED ONE, AND IT IS NOT GATED AT ALL.**

The sibling read at `runner.ts:150-161` — `subscriptions` where `status='trialing'` —
has **no gate on it**, and `runner.ts:270-276` PREFERS it: `trial = row ? {...} : grace`.

So when one of the 86 subscribes mid-grace:

1. `01` §3.4 creates the subscription with `trial_end` = **the grace end**, not a day
   count (`billing-actions.ts:834`, `freeTime.ts:85`);
2. the webhook mirrors it verbatim — `trial_ends_at: ts(sub.trial_end)` (`sync.ts:678`);
3. the mirror row now exists, so `grace` is null and
   **`isBetaGrace` is false** (`runner.ts:290`);
4. `courtesyUntil` reads null, so `resolveEnding` returns `{kind:"trial"}`
   (`trialReminder.ts:258`);
5. the push becomes **"Your free trial ends soon" / "Day 5 of 7. Your trial ends on
   31 Aug, and billing starts then."** (`trialReminder.ts:499-501`).

**That is Law 5 broken twice over, to a beta account.** The fortnight is "14 days on
us" and NEVER a trial; "Day 5 of 7" is false about both the day and the length; and
`06` §3.5 names this exact regression — *"must tell a beta account their free access is
ending, never that their trial is ending and billing is about to start — ninety people
with no card on file were told exactly that by an earlier version."* The correct grace
copy exists and is right (`trialReminder.ts:484-497`); the guard that selects it lives
only inside the `isBetaGrace` branch, which this path walks around.

**Blast radius, measured rather than assumed:** 86 grace accounts, of which **13** have
both `notifications_enabled` and a push device today, and **0** have
`trial_reminder_sent_for` stamped, so nothing is deduped away.

⚠️ **13 is a floor, not a ceiling.** `savePushSubscription` writes the device row and
flips `notifications_enabled` in one action (`pushActions.ts:66-107`), and the enable
prompt is deliberately non-dismissable and renders on every dashboard load
(`EnableNotificationsStep.tsx:13,36`). Every marginal enabler is drawn from a pool that
is 100% grace-shaped. The bound on 29 August is 86.

⚠️ **`subscriptions = 0` is the PRECONDITION, not a comfort.** The grace is computed
only when there is no mirror row (`runner.ts:259-268`), so an empty mirror is exactly
what makes all 86 eligible. Any argument of the form "no money has moved, so this is
low risk" is backwards for this hazard.

**Owed, and it is `07`'s to build.** The reminder must ask "is this account on a beta
grace" from something **the mirror cannot overwrite**, rather than inferring it from the
absence of a subscription row.

**⚠️ DO NOT CLOSE THIS BY GATING THE SIBLING READ.** (Adrian, 2026-08-17.) Putting
`billingGateEnabled()` on the `subscriptions` query would stop the wrong message by
stopping every message — it trades a false notification for a missing one, and the
missing one is the promise two screens make out loud.

**Routed to the spec chat as an amendment to `07` §3.5.** The defect is spec-level, not
just a code shape: §3.5 describes the guard as belonging to the beta-grace case, and the
implementation faithfully put it inside the `isBetaGrace` branch. Both are wrong in the
same way — "is this a beta grace" is a property of the ACCOUNT, and the current design
derives it from the shape of the subscription data instead, so it stops being true the
moment the account acquires a subscription. The spec needs to say where that fact comes
from.

### ~~`07`'s list gains one more, from the same trace~~ ✅ CLOSED 2026-08-17, BY DRIVING

**The claim-burns-the-key entry read the claim and not the release.** It was right that
`claimTrialReminder` stamps before the send (`runner.ts:975`), and right that a burned
key would suppress the genuine reminder as `already-sent`. But `runner.ts:1005-1017`
already hands the claim back when nothing was delivered — **the second of the two fixes
that entry proposed was already in the tree.**

Driven rather than read, because a release that exists and never runs is
indistinguishable from no release. `monday.scenario.ts`, a push subscription pointing
at a port nothing listens on, which is the real failure mode rather than a mocked throw:

    failed send:  trialReminder=send-failed   stampAfter=null     <- handed back
    retry:        trialReminder=sent          delivered=1         <- CONTROL

The control is the half that matters. A release that also destroyed the ability to send
would satisfy `stampAfter=null` perfectly.

**Still true, and accepted where the code already says so:** a hard process crash
between the claim and the release burns the key, because nothing runs to hand it back.
`runner.ts`'s own comment takes that trade deliberately — "a missed push is recoverable
where ninety-six pushes about a charge is not" — and the Home banner reaches everybody
regardless.

**And the route's GET export is `07`'s too.** `app/api/notifications/run/route.ts:99-100`
exports `GET` as well as `POST`, on a route whose whole job is to TRIGGER SENDS. A GET
is reachable by a link prefetcher, a browser history entry, a chat unfurler or anything
that follows a URL — **the shared secret is the only thing standing between any of those
and a real send to real devices.** A trigger should not be reachable by navigation.

### One operational note, FOUNDER'S — do not touch

The dev-server binding and the **GET** export on `app/api/notifications/run/route.ts:99-100`
were reported and are being handled outside the repo. **No agent changes either.** (The
local dev server was moved to loopback on 2026-08-17 at Adrian's instruction; that is a
process change, not a repo change.)

---

## ✅ UNBLOCKED — the specs arrived, and 03 is built (2026-08-16)

`Billing-03-Cancel-flow.md`, `Billing-04-Save-Offer.md` and
`Billing-05-read-only-gate.md` are no longer empty. **03 is built, driven and
cold-reviewed three times.** `04` is next; `05` is not started.

---

## 🔴 DECISIONS OWED BY ADRIAN, FROM SPEC 03'S COLD REVIEWS

Three of these were found by driving, are money-side, and are **not** things an
agent should decide.

### 1. An `incomplete` subscription can still take the money after Cancel

**Measured, end to end.** An abandoned paid attempt sits `incomplete` with its
first invoice payable for about 23 hours. Anything that pays it — a 3DS
challenge finished in another tab, a retry, a dashboard action — turns it
`active` immediately.

```
sub … incomplete            invoice: open due=6999
cancel_at_period_end        ACCEPTED (true)
…and the invoice is STILL payable: 1 open, 6999
```

So **setting the flag does not stop it**, which means widening
`CANCELLABLE_STATUSES` would not fix anything. Stopping an `incomplete`
subscription needs the invoice VOIDED, or `subscriptions.cancel()` — and §2 of
spec 03 forbids the immediate-cancel function from this path outright.

**Mitigated, not fixed:** a user whose only subscription is `incomplete` now
reads *"This one can't be changed from here. Email support@trackdco.app"*
instead of a blank screen. Before this work they got nothing at all.

**The decision:** may the user-facing cancel path void an open first invoice (or
call the immediate cancel) for an `incomplete` subscription? Both are outside
what 03 permits.

### 2. A comp beside a live subscription — resolved as a defect, flagging anyway

`manageActionFor` gave a `comp` **no cancel control** while Stripe went on
charging them. Two independent reviews raised it; `access.ts` already documents
the identical defect and calls it "the exact chargeback this whole area exists to
avoid", with the fix applied to EXPIRING comps only.

**Changed:** the source still decides what you are ON ("Complimentary"); the
subscription decides what you can STOP. A comped customer with a live cancellable
subscription now gets the cancel row. Two tests that encoded the half-fixed state
were rewritten with the reasoning.

**Flagged because it is visible:** a comped founder who also subscribed will now
see "Cancel my subscription" on `/billing`. That is the point — Stripe is billing
them — but it is a change to what Adrian sees on his own account.

### 3. GATE-ON ONLY: a read-only user is told "Free trial"

`planLabelFor` reads the mirror's `trialing` status ahead of the gate branch, so
with `BILLING_GATE_ENABLED=true` an account with **no entitlement** but a live
trial row reads "Free trial" and is offered a dialog promising "full access to
your Pro plan until …", while `canWriteData()` refuses every write.

**Not fixed, deliberately.** Two very different causes produce an identical
database shape: a webhook still in flight (transient, and flickering to "Read
only" would be its own harm — there is a test asserting exactly that), and a
trial created with no validated card (permanent, and genuinely not entitled). The
discriminator is `cardIsValidated`, which is not on the mirror, so telling them
apart needs a column — a migration, and migrations are written, never applied.

**Nobody is affected while the flag is unset. It must be resolved before step 4
of the go-live order.** Belongs to `05` and `12`.

---

## ✅ 03 — CANCEL FLOW. BUILT, DRIVEN, AND COLD-REVIEWED THREE TIMES (2026-08-16)

**Not merged. Nothing pushed. `BILLING_GATE_ENABLED` still unset.**

Most of the cancel flow was already right, and the spec said so. What this
actually produced was one new screen, two copy decisions, and **six CRITICALs
that only driving found** — every one of which passed `tsc`, ESLint and the full
suite first.

### What was built

- **The un-cancel confirmation card** (§3.10). "Glad you're staying." above the
  plan card, amber by hairline and wash, fading in, dismissible, noun following
  status. Component state in the component that ran the resume, portaled up into
  a slot on the page — §3.10 forbids persisting it, so the state has to live with
  the action and the card has to live at the top.
- **D22**: the resume trigger reads "Keep my Pro plan", derived once, consumed
  twice (Q82). The cancel dialog's own "Keep my trial" dismiss is untouched.
- **Q83 answered:** nothing consumes `savedAt` on the billing actions, so the
  card could not key off it.

### The six CRITICALs, all found by DRIVING

1. **One `paused` subscription made cancelling impossible.** Stripe hard-refuses
   `cancel_at_period_end` on it; the cancel path read the wider
   `BILLABLE_STATUSES`, so the loop threw and every retry failed identically
   while the live trial converted. **This is the `paused` question that had been
   carried as open** — the answer is that the two paths need different sets, and
   `CANCELLABLE_STATUSES` (which existed with no consumer) is now the cancel
   path's, while deletion keeps the wider one because `subscriptions.cancel()`
   accepts a paused subscription happily.
2. **Cancelling took 358 days of paid access** off a yearly subscriber: two live
   subscriptions, one shared entitlement row, last webhook won.
3. **`endSubscription` did the same thing a different way** — a stray trial dying
   after the cancel dragged the shared row back 362 days.
4. **`markPastDue` did it a third way**, and wider: one declined charge on an
   unrelated second subscription clawed a paid year back to three days, with no
   duplicate live subscription needed.
5. **Pressing Cancel restored an entitlement a chargeback had revoked.**
6. **Resume re-armed the charge while telling the user it had failed.**

Fixes: both loops are `allSettled` with deliberately opposite honesty rules (a
partial cancel reports failure, a partial resume reports success); a sync may
only ever extend; the two handlers that shorten by design may not go below what
the customer's OTHER live subscriptions entitle; and only a **non-zero**
`invoice.paid` may resurrect a revocation (27 of the last 40 `invoice.paid`
events on this project were $0 — every trial start raises one).

### Also fixed

A dropped connection destroyed the screen and left the confirm button inert. A
failed cancel moved focus onto the button that ABANDONS it, and announced
nothing — driven keyboard-only, the natural retry dismissed the dialog having
cancelled nothing. The offer's charge date was formatted in the browser's zone
while everything around it used the profile's (three dialogs, three days, one
charge). A `past_due` user was promised access 27 days past its real end. At
320x568 the un-cancel card landed off-screen, then — after the first fix —
under the iOS status bar.

### Carried, not fixed

- The plan card's own "Trial ends" row is raw mirror and can disagree with the
  dialog; `renewalRow` labels the access-end date "Renews on" for a `past_due`
  user. Both are the Billing screen's structure, which `08` owns.
- A `paused` or `unpaid` subscription is left untouched by Cancel. Defensible
  (Stripe refuses the call) but a paused subscription that later resumes bills
  somebody who pressed Cancel.
- `markPastDue`'s clawback has no memory, so a later entitling event can hand the
  unpaid period back. Reachable only on top of CRITICAL 4, which is now fixed;
  durable memory needs a column.
- `syncSubscription` can still write `active_until = NULL`, which reads as never
  expires. `endSubscription` refuses exactly this; the sync has no equivalent.
- Profile's plan pill reads the mirror with no status filter, ordered by
  `updated_at` — the query shape `/billing` removed for cause.
- The save offer computes free time from `items[0].current_period_end`, which on
  a `past_due` subscription is the period the card DECLINED on: measured at +58
  unpaid days with the failed invoice still open. **`04` owns this and it
  contradicts `04` §3.3's own premise that "anything else has been paid for".**

---

## 💳 THE BILLING TRIPLE — 01, 02a AND 02b ARE ALL BUILT (2026-08-15)

**⚠️ SHIP-TOGETHER. `01`, `02a` and `02b` reach `main` together or not at all.**
Spec 01 decides who gets free days, which makes the current checkout copy false
for a returning customer and routes a post-grace user onto a payment path that
cannot succeed yet. Shipping 01 alone means the app makes a written promise on a
payment screen that the server contradicts.

### ✅ 01 — trial eligibility. BUILT AND DRIVEN.

See `progress-tracker.md` for what it does and the full drive table. In short:
one trial per user ever, a mid-grace beta user is charged nothing inside their
fortnight, a free-for-life comp cannot buy, and the comp list can no longer
reach a browser bundle.

### ✅ 02a — the paid-today checkout. BUILT AND DRIVEN.

A user with no free days can pay. Driven: a post-grace account lands `active`
with its invoice `amount_due=1199 status=paid` and the card saved, and renews a
month later on a test clock with no second card entry. See
`progress-tracker.md`.

⚠️ **The spec's own field name was wrong and failed silently.** §3.1 says to
expand `latest_invoice.payment_intent`; Stripe removed that field in
`2025-03-31.basil` and this SDK sends `2026-07-29.dahlia`. The expand string is
still ACCEPTED with no error and returns null every time. Built against
`latest_invoice.confirmation_secret` instead. **Anyone writing a later billing
spec against Stripe docs should check the field still exists on this API
version before naming it.**

### ✅ 02b — checkout copy and disclosure. BUILT AND DRIVEN.

Every cohort reads the truth. Eligibility and the first-charge date are both
resolved server-side, the interval suffix comes from Stripe, and the approved
copy is carried character for character. See `progress-tracker.md`.

### ✅ THE COLD REVIEWS ARE CLEAN — no CRITICAL, no HIGH outstanding (2026-08-15)

Three independent reviewers across all three specs: money and races, gate and
entitlements, UI at 390x844. **No CRITICAL from any of them.** Four HIGHs were
found and all four are fixed and re-driven:

1. **A resumed trial could charge a calendar day early.** Abandon 3DS at 23:40,
   return at 00:05: the screen recomputes its date, the resumed subscription
   kept its old `trial_end`. No tolerance can fix it — any elapsed time makes a
   fresh trial later — so the subscription is now EXTENDED to match, or
   replaced if Stripe refuses.
2. **The paywall promised "7 days free" to people about to be charged today.**
   New exposure from this work: before 02a the paid path errored, so nobody
   could be charged. Trial lines are now withheld per cohort, never reworded.
3. **A mid-grace user was shown the raw `active_until` while Stripe got the
   48h-clamped one.** The screen said 15 Aug, Stripe held 17 Aug. Every beta
   account passes through that window. The date is now formatted through the
   same resolver the create call uses.
4. **The welcome screen said "7 days on us" seconds after a $69.99 charge.**
   The trial half is withheld; the true half stays.

Two MEDIUMs were regressions introduced by earlier fixes in this same run (the
comp backstop defeating the `is_active` kill switch, and the mid-grace holding
screen falling back to "Setting up your trial."). Both fixed. The rest are in
`progress-tracker.md`.

⚠️ **Deliberate deviation, recorded:** 02b §3.2's approved disclosure line 1
carries no trailing full stop while lines 2 and 3 do. The build renders one, on
Adrian's call (2026-08-15) — the omission reads as a typo in the spec, and the
three lines match each other on screen.

### 🔴 OWED TO `09-checkout-redesign.md`, MEASURED AND FAILING

**The four required facts are NOT visible with the button at 320x568.** This is
pre-existing, not caused by 02b: measured before the spec, the button sat at
y=777 in a 568px viewport, ~209px below the fold. Carrying the approved copy
verbatim moved it to y=802. **390x844 passes for every variant.**

`02b` §3.7 owns the REQUIREMENT and `09` owns the ARRANGEMENT that satisfies it,
and §2 forbids 02b from touching layout, spacing or the frame. So this cannot be
closed until `09` is built, and `09` is the spec that moves the disclosure below
the button, which is the change most likely to make it worse.

Two §5 checkboxes are therefore open and BOTH belong to `09`:

- the four facts visible with the button at 320x568, every variant
- the subtitle being one line at 320x568 (the approved beta line is three)

⚠️ **`09` must re-measure at BOTH widths and for the MID-GRACE variant
specifically**, which is the longest case: its lines carry a date where the
others carry the word "today".

### ⚠️ Known and NOT fixed in 01, judged, with a concrete failing case

**`reconcileToOne`'s dead-subscription guard cannot fire in the case it was
written for.** `mine` falls back to `created`, and under an idempotency key
`created` can be a REPLAY carrying the original `status: "trialing"`, so the
`DEAD_STATUSES` check reads a stale status and passes. It only ever sees a fresh
status when the object is alive, which is when it has nothing to catch. Reachable
via lease expiry: two concurrent calls on different plans, the loser's own
subscription is cancelled by the winner's reconcile, and the loser then hands
back its client secret anyway. **No charge** — the card confirms against a
cancelled subscription, no entitlement is written, and `TrialHold` eventually
lets them into an app with nothing behind them. Fix is to re-fetch by id rather
than trust `created`. Left because the reconcile is shared machinery and spec 01
was told to leave `payment_behavior`, the idempotency key and their neighbours
alone.

**`hasValidatedCard` treats an absent `pending_setup_intent` as proof a card step
finished.** That is absence of evidence, and it fails towards "trial used", which
is the expensive direction. A subscription created OUTSIDE this path never had a
setup intent to begin with — `sync.ts` says so in as many words, and
`reconcileToOne` names the cohort: a hand-made one in the Stripe dashboard, a
webhook replay, a future RevenueCat import. Comp a beta tester by hand in the
dashboard, let it cancel, and they are charged on day one. Wants positive
evidence (`default_payment_method || default_source || latest_invoice.paid`)
rather than an absent marker. Not reachable from anything the app itself creates.

**`paused` is in `BILLABLE_STATUSES` and reads as "money moved".** It is produced
by `missing_payment_method: "pause"`, which means the opposite: the trial ended
and no card was ever given. Nothing this path creates can reach it (it hardcodes
`"cancel"`), but an imported or dashboard-made subscription could, and it would
both burn the trial and answer `already-subscribed`.

**⚠️ PARTLY RESOLVED BY `03` (2026-08-16), and not in the direction this note
assumed.** `03` adjudicated the shared-list question and the answer was that the
two paths ask different questions: `BILLABLE_STATUSES` stays exactly as it is for
eligibility and deletion, and the CANCEL path now reads the narrower
`CANCELLABLE_STATUSES`. That was not a tidy-up — leaving `paused` in the cancel
path's list made cancelling **throw**, because Stripe hard-refuses
`cancel_at_period_end` on a paused subscription. See `03`'s section above.

**What is left of this item is the ELIGIBILITY half only:** whether a `paused`
subscription should burn a trial and answer `already-subscribed`. That is still
`01`'s cohort question and still wants a narrower set of its own rather than a
narrower shared one. Unchanged, and still not reachable from anything the app
creates.


**The idempotency key can still 400 a mid-grace retry in the final 48 hours.**
Spec 02a §3.9 added a segment naming the create shape, which closes the
trial-versus-paid collision — proven against Stripe: with the old key the paid
create is REFUSED, with the new one it succeeds. **One sub-case survives.** When
the 48h clamp fires, `trial_end` is `now + 48h` and MOVES between attempts while
the kind and the fingerprint stay put. A user with under 48h of grace left whose
create FAILED (leaving the subscription set unchanged) and who retries minutes
later sends the same key with a different `trial_end`, and Stripe rejects it.
They see an error until the key ages out, up to 24 hours.

Narrow: it needs a mid-grace user in their last two days AND a failed create AND
a retry. It fails towards refusing rather than charging.

**⚠️ THE FIX AS PREVIOUSLY WRITTEN HERE WAS UNSAFE, and is corrected (2026-08-16).**
It said to "round `now + 48h` down to the hour". Applied as a bare substitution
that is a money defect: `freeTime.ts:151-153` decides
`chosen = clamped ? earliest : graceEnd`, so a downward-quantised `earliest` can
land BEFORE `graceEnd` — up to 59m59s inside a period the app promised free,
ending in a charge within it. That is worse than the 400 it was meant to fix,
because the 400 fails towards refusing and this fails towards charging.

The safe form keeps the promise as a floor:

```
chosen = Math.max(graceEnd, quantise(earliest))
```

Never a bare substitution. Whoever next touches that key does it that way.

### ⚠️ Still true, and it is what makes all of the above safe

`BILLING_GATE_ENABLED` is unset, so none of this changes anything for the ~90
real accounts until it is set. The go-live order below is unchanged and step 8
still comes last.

---

## ⚠️ NOTIFICATIONS — fixed, NOT on `main`, and a list of knowns (2026-08-13)

The push engine's `stopped`/pause/version gates are fixed and reviewed (see
`progress-tracker.md`), and they live on **`wave3/billing-cancel`**, not on
`main`.

**⚠️ They are not separable from the billing work.** They were built on top of
it in the same branch, so merging them means merging billing, and Adrian's call
is that nothing billing-shaped goes to `main` until billing is finished. A merge
to `main` happened once tonight and was reverted for exactly that reason.

So the notification fixes are NOT live. Until the branch lands, production still
runs the engine that announces a compound whose `is_active` never caught up with
its delete, and that drifts off the app's grid after a pause. Nobody is
currently in either state (checked: 17 push-enabled accounts, 51 active
compounds, zero affected), which is what makes waiting acceptable.

What is left that is **not** in the code:

### 1. ✅ `005_trial_stamp_lock.sql` — APPLIED AND VERIFIED (2026-08-13, Adrian)

Pasted into the SQL Editor and proven the same night with
`scratchpad/stamp-attack.mjs` against the live database: all five attacks
refused with 403/42501 (clear the stamp, set it forward, smuggle it into a
settings save, insert a row pre-stamped, delete the row), and all five
legitimate writes still succeeded — including the service role stamping AND
releasing, which is the one that would have turned "~96 notifications a day"
into "none, ever".

The lesson, now a standard in `code-standards.md`: he had pasted "just the
bottom bit", and the bottom of that file is entirely comments. It would have
reported "Success. No rows returned" — which is also what a correct run reports
— while doing nothing. Every hand-applied SQL file now opens with a
`▶ HOW TO RUN THIS` block: paste the whole file, no rows returned is success,
and here is a check that actually returns something.

### 2. Known and NOT fixed — findings from four cold reviews, ranked

None is a regression; all pre-date tonight's work and all have a concrete
failing case on file.

- **The three older dedupe stamps treat a zero-row UPDATE as success.** The
  trial stamp got a conditional UPDATE with a returned row count; the other
  three did not. With the preferences row deleted (possible until 005 is
  applied) the dose reminder re-sends every fifteen minutes — ~52 pushes in a
  day, with the cron reporting success each time.
- **A `reminder_time` inside the user's own quiet window silences dose and
  low-stock reminders forever.** Quiet 22:00→08:00 with a 23:00 reminder time:
  every tick before 23:00 is "too early", every tick after 22:00 is "quiet
  hours", and the two never open together. The trial reminder already works
  around this (`trialMin`); the other three do not. Reachable from the three
  unconstrained time inputs in `ReminderSettings`.
- **Custom compounds are announced as "your compound" and "Something is running
  low".** `PC_REMINDER_SELECT` and the inventory select both omit `custom_name`;
  `lib/db/inventory.ts` gets this right and the notification path does not.
- **A multi-dose day is nudged as one dose.** `loggedTodayIds` is a set of
  compound ids and the select does not read `slot_index`, so logging the morning
  dose suppresses the evening nudge for the whole compound.
- **`/api/notifications/run` has no `maxDuration` and no `ORDER BY`.** The loop
  is sequential with a 5s push timeout per message per device, and the profile
  order is unstable, so a truncated invocation skips an arbitrary set of users.
- **A missing pause row now diverges permanently rather than for the pause's
  length**, because the mirror re-anchors the cadence like the client does.
  `pushCompoundPause` is gated and fire-and-forget with no retry.
- **`trackSync` never reads `readOnly`**, so every gated refusal except
  `AddStockSheet`'s shows "still syncing, we'll keep trying" for a write that
  will never be retried.

### 3. When `BILLING_GATE_ENABLED` goes true, re-read `lib/billing/gate.ts` first

Two functions are conditionally gated and the conditions are load-bearing. The
delete path must stay open in both, or a lapsed user's delete records the flag
without the reason — and the reason is what the push engine now reads.

---

## 🔴 ADRIAN'S LIST — everything owed by him, in one place

Nothing below can be done by an agent. Everything else on this branch is built.

### 1. ✅ THE LIST OF FRIENDS FOR FREE ACCESS — CLOSED, with one live caveat

`COMP_EMAILS` in **`lib/billing/betaGrace.ts`** holds five, and Adrian closed the
list on 2026-08-14 ("last free one for now"):

```ts
"admin@trackdco.app",          // founder
"adrianschimizzi1@gmail.com",  // founder
"jasminemalihi06@gmail.com",
"ananthr.ravi@gmail.com",
"angusbrake6@gmail.com",       // given capitalised, stored lowercase
```

**Do NOT put them in `FOUNDER_EMAILS` (`lib/admin.ts`) instead.** That list also
opens `/admin`, which shows every waitlist sign-up, and it is duplicated into an
RLS policy in `supabase/waitlist/002_founder_read.sql`. Free forever and "can
see everyone's data" are different things.

#### ⚠️ `angusbrake6@gmail.com` HAS NO ACCOUNT, AND THE BACKFILL ONLY SEES ACCOUNTS

Checked against production, 2026-08-14: 90 auth users, and four of the five comp
addresses have one. `angusbrake6@gmail.com` does not.

That matters, because **`COMP_EMAILS` is read in exactly one place** — the
backfill route — and that route enumerates `auth.admin.listUsers()`
(`app/api/billing/beta-grace/route.ts:102-114`) and grants against the accounts
it finds. **Nothing reads the comp list at sign-up.** So an address with no
account is not skipped, it is simply never considered, and:

- if he signs up **before** the backfill runs, he is comped for life, correctly;
- if he signs up **after**, he is an ordinary new user — trial, then the gate —
  and his comp entry does nothing at all, silently, forever.

Same silent-failure shape as the capitalisation trap the file warns about, in
through a different door.

**Two ways to close it, Adrian's call:**

1. **Have him sign up before step 6 of the go-live order.** Costs nothing, needs
   no code, and it is one message. Then confirm with `scratchpad/comp-check.mjs`,
   which prints every comp address against the live account list.
2. **Re-run the backfill after he signs up.** It is idempotent and the re-run
   path UPGRADES a time-limited row to no-expiry, so this works — but it means
   remembering to run it a second time, at a moment nothing will remind anybody.

Option 1 is the one that cannot be forgotten. Either way, **re-running the
backfill is the only repair**, and it is safe: it never shortens anybody and
never touches a `stripe`/`apple`/`google` row.

### 2. STRIPE OFF SANDBOX

Nothing on this branch may merge until this is done. Detail further down under
"Owed by Adrian, when he wants to go live" — live keys, live prices, a live
webhook endpoint and its secret, a LIVE portal configuration, Apple Pay domain
registration, Link off in live mode, and the account business description.

### 3. NO MIGRATIONS OWED — ALL APPLIED (audited live 2026-08-16)

Every SQL file in `supabase/` was audited against the LIVE schema on 2026-08-16
via the Supabase MCP, object by object, rather than by reading headers. Nothing
is outstanding. The three files this section and the two below used to carry as
owed were all already in:

| File | Proven present by |
|---|---|
| `supabase/billing/002_trial_start_lease.sql` | `billing_customers.trial_lock_until` exists. Applied 2026-08-14, as its header says. |
| `supabase/notifications/004_trial_reminder.sql` | `notification_preferences.trial_reminder_sent_for` exists. Applied 2026-08-12, as its header says — the "NOT APPLIED" note further down this file was stale for four days. |
| `supabase/notifications/005_trial_stamp_lock.sql` | `guard_trial_reminder_stamp` exists in `pg_proc`. |

Two were applied on 2026-08-16 through the MCP, so unlike every hand-applied
file they DO appear in `list_migrations`:

| File | Migration name | Verified by |
|---|---|---|
| `supabase/billing/003_courtesy_until.sql` | `courtesy_until` | `subscriptions.courtesy_until`, `timestamp with time zone`, nullable. |
| `supabase/legal/012_em_dashes.sql` | `legal_documents_em_dashes` | 0 prose em dashes in all three current v1.3 rows; the one remaining per row is the title separator, which is stripped before render. |

`supabase/cycles/002_cycle_id_backfill.optional.sql` is deliberately NOT run:
it is marked optional and the live data has exactly ONE candidate row in
`body_metrics` and none in `journal_entries` (Adrian's call, 2026-08-16).

**The ledger is not a record of this project.** `list_migrations` stops at
`drop_working_set` (2026-07-15); roughly thirty files since then were pasted
into the SQL Editor and left no trace. Audit against the live schema, never
against a header or against this table.

### 4. THE GO-LIVE ORDER, AND IT IS NOT NEGOTIABLE

```
1. Stripe off sandbox. Live keys + prices + webhook secret into Vercel.
2. (nothing) All migrations are applied — audited live 2026-08-16, see above.
3. COMP_EMAILS is filled in and closed.   (2026-08-14 — nothing to do)
3b. Make sure angusbrake6@gmail.com HAS SIGNED UP. He had no account on
    2026-08-14, and the backfill can only grant to an account that exists.
    Check: npx tsx scratchpad/comp-check.mjs
4. Merge, deploy.
5. POST /api/billing/beta-grace?dry=1  with  Authorization: Bearer $CRON_SECRET
   -> READ the output. It should say ~90 accounts, N comp, the rest grace.
   N must be the number of comp addresses that actually have accounts.
6. POST /api/billing/beta-grace       (no ?dry) — grants the rows.
7. Verify: select count(*) from entitlements;   must be ~90, not 0.
8. ONLY THEN set BILLING_GATE_ENABLED=true in Vercel Production.
```

**Step 8 before step 6 puts every one of the ~90 real accounts into read-only
with no notice.** That is why the gate is an environment variable and not a
constant: merging this branch changes nothing at all until that switch is set.

**Step 3b is the one that will be forgotten.** A comp address with no account is
not an error anywhere: the dry run simply reports one fewer comp than expected,
and nothing says which one is missing. Read the number.

### 5. ✅ DOES A RETURNING CUSTOMER GET A SECOND FREE TRIAL? — DECIDED AND BUILT

**Adrian's call: ONE TRIAL PER CUSTOMER, EVER.** Built as billing spec 01 on
2026-08-15 and driven against real Stripe. A returning customer is charged from
day one, and the checkout screen now says so rather than promising free days it
will not give (`02b` owns the wording).

The loop this closes was verified on 2026-08-13: subscribe, cancel, let it
lapse, subscribe again — free forever in seven-day steps. Harmless while nothing
gated; the read-only gate is what turned it into the way to use Trackd for
nothing.

⚠️ **The naive version in the old note here was a trap, and it was a real one.**
It said `all.some((s) => s.trial_end !== null)`, which denies a genuine
first-timer their trial because their bank challenge timed out once. The
built version tests whether a card ever VALIDATED instead. **And the first
attempt at that was still wrong** — a cancelled abandoned attempt read as
validated purely because its status was no longer `trialing`, so abandoning 3DS
and then picking a different plan burned the trial. Found by driving it, not by
reading it. See `progress-tracker.md`.

### 5b. 🟡 A RELATED ONE THAT IS STILL OPEN: the reconciliation view

Nothing yet asserts, on a schedule, that no account was charged inside a period
it was promised free. `trackd_grace_until` is now written on every grace-aligned
subscription specifically so that question is answerable — three different
things report `trialing` (a real trial, a save-offer courtesy period, and a
grace-aligned start) and this is what tells them apart. Owned by
`11-reconciliation-and-alerting.md`, which is not written yet.

### 6. 🟡 FOUR THINGS THE COLD REVIEW FOUND THAT ARE JUDGED, NOT FIXED

Every CRITICAL and HIGH from all three reviewers is fixed and re-driven. These
four are real, are recorded so nobody has to re-find them, and each needs a
decision rather than a patch.

**1. A cancelled trial gets no warning that access is about to end.**
`trialNoticeFor` and the push both go silent on `cancel_at_period_end`,
justified as "nothing is about to change for them: they will not be charged."
That was true before the gate. With the gate on, something DOES change on that
date: the app goes read only. The honest fix is a second, different notice for
somebody who has cancelled ("you keep everything, but you won't be able to log
after the 19th") and that is new copy, which is Adrian's.

**2. The beta notice is once per BROWSER, not once per account.** A second
device shows it again, and on a shared browser two accounts clobber each other's
cookie (it holds one user id). Fixing it properly means a column on `profiles`
and a migration. The failure mode is somebody seeing a one-time notice twice,
which is mild, and the cookie was chosen to avoid the hydration flash that cost
the trial banner a 166ms paint and a 68px jump on every load.

**3. An in-session expiry produces silent failures until the page reloads.** The
server flips at the instant (measured: ok at t=0s, refused at t=7s), but the
browser holds the `canWrite` the layout rendered. A user whose grace runs out
while they are looking at the app gets refusals with no pop-up. Narrow (a
14-day or annual boundary has to land inside one session) and self-correcting on
the next navigation.

**4. `graceAsTrial` describes an ALREADY-EXPIRED grace as a trial.** Contained
today — the caller reports `trial-over` — but it makes `RunResult.trialReminder`
report trial reasons for users who have no trial, and an expired comp sorts
first under the runner's `order("active_until").limit(1)`.

### 7. THE STRIPE PORTAL'S SECOND CANCEL BUTTON

The account's DEFAULT portal configuration enables `subscription_cancel`, so a
user who opens "Payment method and invoices" finds a cancel button in Stripe's
wording next to ours. Harmless (the webhook syncs either way) but it bypasses
the save offer entirely. Turn the feature off on the portal configuration if
cancelling should live in one place. Dashboard change, not a code change.

---

## 🎮 THE ARCADE — what is left

Behind the header "Arcade" control, or ⌘K → "games". Built: **Chess** (11 bots,
250-2000 Elo), **Vial Stack**, **Dose 2048**, **Vial Snake**, **Titration**,
**Kyle Run**, **Draw Time**.

**Not yet built, and Adrian asked for them:**
- **Block Blast** — drag 8×8 block shapes onto a grid, clear rows and columns.
  Adrian rated this the best "on a call" game of the set.
- **Connect Four vs Will** — amber discs vs grey pills, decent AI.
- **Solitaire** — Klondike with **amber-suited** cards. Explicitly NOT
  compound-suited; Adrian changed his mind on that.

**Scores are not persisted yet.** They live in component state and die on close.
Adrian's call was a small table keyed to the founder account so it survives a
browser change and works across both his devices — that needs one migration
(`arcade_scores`: user_id, game, score, achieved_at) plus RLS. He also said "it's
just a game to win and lose" about chess specifically, so chess may not need it.

**Kyle does not react to the data yet.** The idea: the footer/menu Kyle idles
normally, slumps when there is open feedback, and celebrates the day MRR first
goes above zero — a status indicator you read without reading. Cheap now that
`drawKyle` takes a pose.

**Chess ideas not done:** a slight piece-slide animation between squares (Adrian
said "doesn't need to be that"), and the roster sprites are still 16×18 while the
chess pieces went to 24×24 — bumping the roster would make the ladder portraits
match the board.

---

## 💳 WHEN BILLING IS SORTED — come straight back here

Adrian is sorting billing (2026-08-14 onward). The /admin dashboard already
reads billing and is currently reporting an empty but CORRECT picture. The
moment real money moves, these need revisiting **in this order**:

1. **Verify MRR against Stripe's own number.** `/admin` computes MRR from the
   local `subscriptions` mirror joined to prices fetched from Stripe
   (`lib/db/admin/billing.ts` → `revenue`). It counts `status = 'active'` only.
   The first time a real payment lands, open the Stripe dashboard and check the
   two agree. If they drift, the mirror is the suspect, not the maths — see (2).

2. **🔴 THE OPEN QUESTION: 29 subscription webhooks, 0 subscription rows.**
   `webhook_events` holds 424 events including 29 `customer.subscription.created`
   and 29 `invoice.paid`, while `subscriptions`, `entitlements` and
   `billing_customers` are all **empty**. Those events carry
   `test_helpers.test_clock.*`, so they are test-mode traffic and the rows were
   most likely cleaned up — but the alternative is that the handler is not
   persisting, and that would be a live billing bug hiding behind an empty
   table. **Confirm which before trusting any revenue number.**

3. **Adrian's call: consider reading MRR from Stripe directly** rather than from
   the local mirror ("you could just merge Stripe and be like, okay, how much
   MRR"). Sensible once billing is real. Trade-off: authoritative and immune to
   webhook drift, but it puts a paginated Stripe API call on the dashboard's
   critical path. Suggested shape — keep the mirror for the fast render, and add
   a "reconcile with Stripe" action that fetches the truth on demand and shows
   any disagreement. Never on the sandbox.

4. **`/admin` already makes one outbound Stripe call** per render
   (`loadPricesSafe()`, memoised 5 min) to price subscriptions. It cannot throw
   and cannot fail the page — an outage renders "could not price these" rather
   than zero revenue — but it is a new external dependency on this page.

5. **`interval_count` is now handled** (fixed 2026-08-13). Stripe writes "every
   3 months" as `interval: month` + `interval_count: 3`; nothing read the count,
   so a quarterly plan would have reported 3× the real MRR. If you add a plan in
   the Stripe dashboard with any interval other than 1, the maths is already
   right — but add a test if you add a new interval shape.

6. **The revenue tab is built for the empty state on purpose.** The MRR hero
   reads "awaiting first customer" with trials in flight beside it, and converts
   to a real figure by itself the day money lands. No code change needed.

---

## /admin — what is owed next

The dashboard was rebuilt 2026-08-13 (see `progress-tracker.md`).

### 📊 WHAT THE FUNNEL SAYS RIGHT NOW (measured 2026-08-13, live data)

```
Created an account         90   100%
Passed the legal gate      76    84%   84% of the step above
Added a compound           27    30%   36% of the step above   <-- the leak
Logged a dose              14    16%   52% of the step above
Still dosing (7d)           8     9%   57% of the step above
```

**56 of 90 accounts have never written anything at all**, across all eleven
feature surfaces.

The gate is not the problem: 84% get through it. The drop is **76 → 27 at
"added a compound"** — roughly two thirds of the people who finish onboarding
never add a single compound, and adding one is the thing the whole app is for.
Everything downstream of that step converts reasonably (36% → 52% → 57%), so
this is an activation problem at one specific screen, not a general leak.

This is a product question, not a dashboard one, and it is the first thing the
dashboard was built to be able to say. Worth deciding what to do about before
adding features further down the funnel.

### 🔴 FOUND WHILE BUILDING IT: `profiles.onboarding_completed_at` is a dead column

Nothing in the codebase writes it. **All 90 live accounts have it null.** It is
in the schema, it is in both grant lists, and it is the obvious column to reach
for when asking "did they finish onboarding" — which is exactly the trap. The
funnel now uses `consent_records` instead, because `app/welcome/actions.ts`
writes that and only then grants app access, so it is the signal that actually
means "got through".

**Decide one of two things, and do it deliberately:**
- **Write it.** Stamp `onboarding_completed_at` at the end of the onboarding
  flow, and the funnel can use the honest column. Note the grant lists already
  include it, so no new migration is needed for the write path.
- **Drop it.** Remove the column so the next person does not read it and get a
  confident zero.

Leaving it as-is is the one option that keeps the trap armed. Related: two live
accounts hold a protocol compound with **no consent record at all** (they predate
the gate) — the funnel intersects sets so they simply drop out at that step, but
it is worth knowing they exist.

### 🟠 SECURITY, from the cold review: the founder gate keys on an email STRING

`lib/admin.ts` and three SQL policies gate on `auth.jwt() ->> 'email'`. That is
only as strong as the Supabase Auth project settings, which are **not in this
repo**. Today it holds — email confirmation is on and Google OAuth verifies — but:

- if "Confirm email" is ever switched off, anyone can register an unclaimed
  founder address and read every cross-user aggregate, the whole waitlist and
  the whole feedback queue;
- `admin@trackdco.app` is squattable if no account holds it yet;
- Supabase's email-change flow is a second path in.

**Fix, when Adrian wants it:** gate on the two fixed `auth.uid()` UUIDs instead
of the email. One migration, and it removes the dependency on a dashboard
setting entirely. NOT done here — it is a change to the auth model, not a
tidy-up, and it touches three RLS policies.

Credit where due: the policies read the **top-level** `email` claim, not
`user_metadata`, so they are not client-spoofable.

### What was deliberately NOT done:

- **The onboarding free-text is still not readable anywhere.**
  `signup_intake.struggle_detail` is the single most useful field in the flow —
  it is the only one the user writes themselves — and the dashboard only shows
  how many people filled it in. Adrian chose counts-only to keep the
  service-role layer's no-rows invariant intact. To read the text properly, add
  a founder-scoped RLS SELECT policy on `signup_intake` (mirroring
  `supabase/waitlist/002_founder_read.sql`) and read it on the page through the
  founder's OWN client. **Do not widen `lib/db/admin/` to return it** — that
  directory's whole safety argument is that it never returns a row.

- **Aggregates are computed in TypeScript, not SQL.** PostgREST cannot express
  `count(distinct …)` or `group by`, so the distinct-user and ranked-tally reads
  pull one narrow column (capped at `ROW_CAP` = 20,000) and reduce it in memory.
  At today's size that is a few thousand rows. A read that comes back exactly at
  the cap now records an issue and the page says the number is a floor — so the
  failure is visible rather than silent. When that starts firing, replace the
  hot ones with SQL views or RPCs; nothing on the page has to change.

- **Waitlist → account conversion is not shown, on purpose.** The two are only
  joinable on email, and matching them would mean reading both lists in full to
  compare addresses. The counts are shown side by side and no conversion rate is
  claimed, because the honest version of that number needs a decision about
  matching emails first.

- **The funnel is all-time, not range-filtered.** A funnel over a 30-day window
  would drop everyone who signed up before it and read as a collapse. If a
  cohort funnel is wanted, it needs a cohort definition first.

- **`profiles.tier` is still not shown.** Gates read `entitlements`; tier is
  historical (Spec 16). Showing it would invite reading it as truth.

---

## AWAITING ADRIAN — `fix/container-wording-and-stack-untick`

Built, reviewed twice, **not merged**. Adrian merges when he has tested it. Three
commits; state and reasoning in `progress-tracker.md`.

**What he asked to check on his throwaway account:**

1. Editing stock on a powder (creatine) — should read "same as your current
   **tub**", never "vial".
2. Adding a peptide's stock — the powder field should show **mg** as plain text,
   with no `iu` pill. HCG / hMG / Somatropin show **iu**, also with no toggle.
3. Ticking a stack, then tapping the filled tick again — everything unticks,
   except anything paused or Skipped.
4. Ticking a stack and watching the stock figure go down without leaving and
   coming back.

**⚠️ One thing to look for in his existing data.** Any stock row saved with
`base_unit = 'iu'` whose compound is dosed in mg or mcg has NEVER decremented —
`unit_family_compatible` pairs `iu` only with `iu`, so those doses linked to
nothing and the container has sat permanently full. The fix stops it happening
again but does not repair rows already written that way. If a peptide's stock has
never moved, that is why; correcting the amounts on it re-saves the right unit.

To find them:

```sql
select i.id, c.name, i.base_unit, pc.dose_unit
from inventory_items i
join protocol_compounds pc on pc.id = i.protocol_compound_id
join compounds c on c.id = pc.compound_id
where i.is_active
  and not (
    (i.base_unit = 'mg'  and pc.dose_unit in ('mg','mcg')) or
    (i.base_unit = 'iu'  and pc.dose_unit = 'iu')          or
    (i.base_unit = 'g'   and pc.dose_unit in ('g','mg'))   or
    (i.base_unit = pc.dose_unit)
  );
```

**One product call owed from Adrian.** HGH is dosed in iu and SOLD in mg —
Norditropin, Genotropin and Jintropin are all aliases on the Somatropin entry
and all mg pens. The field now hints "Boxes often state mg — 1 mg is about
3 iu" rather than converting, so the arithmetic stays with whoever is holding
the box. If he would rather the app accept mg and convert, that is a change to
`needsIuFromMgHint` plus a conversion at save time.

**Not fixed, deliberately — flagged for a later pass:**

- A wholly-paused stack whose day already had logs renders a "Paused" header and
  an inert tick over visibly logged doses, and its bulk untick is unreachable.
  Pre-existing; the fix belongs in `HomeScreen`'s paused-stack partition.
- A failed `deleteProtocolDoseLog` is never retried. Its tombstone suppresses the
  row for 14 days and then self-prunes, so an un-log that failed silently
  resurfaces a fortnight later. Pre-existing and architectural.
- Nothing on screen says a filled stack tick can be tapped to untick.
- `UNIT_FAMILIES` lets the dose-unit dropdown swap `tab` and `capsule`, which
  `unit_family_compatible` deliberately does not. Switching a stocked compound
  between them is rejected by `check_protocol_unit_family` with a generic notice.
- The EDIT path reads the CLIENT stack's unit while the trigger reads the
  server's `protocol_compounds.dose_unit`, and does not push the compound first —
  so an unpushed local unit change can still produce a rejected `base_unit`.

---

## ⚠️ BILLING IS BUILT AND MUST NOT BE ROUTED TO YET

**Spec w2b-15 is BUILT and verified end to end against real Stripe.** State and
reasoning: `progress-tracker.md` + `architecture.md` → **Billing**.

**Adrian is not billing yet.** The paywall takes real payments the moment it is
reachable, so **nothing may point a user at `/onboarding`** until he says so.
That is already true — the flow is additive and `/login` is untouched — so the
task is simply: do not wire the entry point, and do not merge.

### ⚠️ THE PREVIEW CANNOT SHOW THE PAYWALL YET

The Stripe variables were only ever added to `.env.local`. Vercel's **Preview**
environment almost certainly has none of them, so on a preview deploy:

- `loadPricesSafe` returns nothing and the paywall renders "We couldn't load our
  prices just now" instead of the plan rows;
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is absent, so the Payment Element renders
  "Payments aren't available right now".

Both are the deliberate honest-failure paths rather than bugs, but they mean the
paywall cannot be judged from a preview link. To fix, add to Vercel → Settings →
Environment Variables, scoped to **Preview** only:
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_YEARLY`,
`STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_WEEKLY` (all TEST values, in `.env.local`),
plus `STRIPE_WEBHOOK_SECRET` from a real webhook endpoint pointed at the preview
if the webhook is to be exercised there too.

**Everything before the paywall works on a preview without any of this**, since
the flow is free until that screen.

Until then the way to walk the paywall is a LAN dev server on a phone — which is
also the only way today, because Vercel Deployment Protection means a preview
link only opens for someone signed into Adrian's Vercel account.

### ✅ `grants/004_gate_column_lock.sql` IS APPLIED — verified live, 2026-08-12

**The 18+ gate hole is CLOSED.** Verified by executing the attack rather than by
reading the file header, which still said "NOT YET APPLIED" and was stale. On a
throwaway account with a real user JWT and nothing but the publishable key:

| PATCH | result |
|---|---|
| `is_18_plus` | **403 `42501`** |
| `tos_accepted_at` | **403 `42501`** |
| `tos_version` | **403 `42501`** |
| `date_of_birth` | **403 `42501`** |
| all four in one request | **403 `42501`** |
| `sex` (control) | 200 — still writable, as it must be |

Then **every one of `profiles`' 23 columns** was probed individually against the
enumerated grants in `003` + `004`: 18 writable, 5 denied, **zero mismatches in
either direction**. So no legitimate write is broken and nothing extra is open.
`scratchpad/grant-sweep.mjs` is the probe; it is worth re-running after any
`profiles` column is added, because both grants ENUMERATE and a new column that
is missing from them 42501s on a legitimate write.

### ⚠️ THE EM DASH SWEEP REACHED POSTGRES

**`supabase/legal/012_em_dashes.sql` IS APPLIED** (re-run through the MCP as
migration `legal_documents_em_dashes`, 2026-08-16, and verified: zero prose em
dashes across all three current v1.3 rows). Its own header had claimed applied
since 2026-08-12 while this section said the opposite; the re-run is a no-op
when already applied, because every statement carries its own LIKE guard, so
the contradiction was settled by executing rather than by picking a side.

The house rule ("NO EM
DASHES in any user-facing string") had never touched the legal documents, because
they are text ROWS in Postgres rather than files, and `/terms`, `/privacy` and
`/medical-disclaimer` render `body` verbatim. Sixteen of them in the three
current (v1.3) rows.

**No version bump**, the same call `011_support_email.sql` made: the substance is
unchanged, and bumping would make every existing `consent_records` row read as
consent to a superseded document. Superseded rows are left alone as the
historical record.

**Targeted replacements, not a blanket swap.** Several of these dashes are PAIRED
and doing the work of parentheses ("…all associated data — including your
bloodwork files — within 30 days…"), so a global `replace()` produces comma
splices and worse. Each one was read in context; no word is added, removed or
reordered. The titles keep theirs, because
`components/legal/legal-document.tsx` strips the "Trackd Co — " prefix before
rendering and the strip regex accepts either character.

**Everything else user-visible is clean.** The remaining em dashes in the repo
are comments, test names, `console.error` strings, and the `/preview/*` +
`/onboarding/{cost,payoff}` harnesses, which are gated on `VERCEL_ENV` /
`NODE_ENV` and 404 in production. The `"—"` empty-value glyph stays: it is a
typographic blank, not prose (Adrian, 2026-08-12).

### ⚠️ THE GATE IS BUILT AND IS SWITCHED OFF

`BILLING_GATE_ENABLED` is unset, so `canWriteData()` returns true for everybody
and the whole read-only gate is inert. Merging this branch changes nothing for
any of the 90 accounts. See "the go-live order" at the top of this file for when
and in what order to turn it on.

### ✅ NO MIGRATION OWED — `notifications/004` IS APPLIED

**`supabase/notifications/004_trial_reminder.sql` IS APPLIED.** Verified against
the live schema 2026-08-16: `notification_preferences.trial_reminder_sent_for`
is present. This section said NOT APPLIED, dated 2026-08-12 — the same day the
file's own header records it as applied and verified. The header was right.

That makes twice on this branch (`grants/004`, then this) that a "NOT APPLIED"
note in `next-tasks.md` outlived the migration it described. The note below is
kept for its reasoning about WHY the column is read in its own query; read the
paragraph, not its premise. One additive column,
`notification_preferences.trial_reminder_sent_for date`.

**It is the only thing between the trial reminder and it sending.** The code is
built and driven end to end; without the column there is nowhere to record that a
reminder went out, so the runner deliberately withholds rather than sending the
same push every fifteen minutes for a day. The cron says so in its own output:

```
{"id":"…","sent":0,"trialReminder":"migration-004-not-applied"}
```

**Safe either way.** The column is read in its OWN query, separate from the
preferences select, precisely so an unapplied migration cannot knock out quiet
hours and the three existing dedupe stamps with it. Not applying it leaves
today's behaviour exactly as it is.

### Owed by Adrian, when he wants to go live

1. **Register `trackdco.app` for Apple Pay in LIVE mode.** The test-mode
   registration proves nothing (test mode does not enforce domain verification).
   The verification file is already committed and served at
   `public/.well-known/apple-developer-merchantid-domain-association`, so this is
   one click with no deploy.
2. **A live webhook endpoint** pointing at `/api/stripe/webhook`, and its signing
   secret into Vercel as `STRIPE_WEBHOOK_SECRET`. Local work uses `stripe listen`,
   which prints its own.
3. **Live-mode keys and three live price IDs** into Vercel Production. The env
   var names are the same; the VALUES are scoped per environment. There is no
   `_TEST`/`_LIVE` selector on purpose — `lib/billing/stripe.ts` asserts the
   key's mode matches the price's `livemode`, which catches the real mistake.
4. **The Stripe account business description.** Given TRACKD's history with
   automated enforcement elsewhere, it must state plainly that TRACKD sells a
   subscription to a logging and tracking application and does NOT sell, supply
   or facilitate the supply of any substance. Adrian writes this, not the agent.
5. **Turn Link off in LIVE mode too.** It is off in test (via the payment method
   configuration API — NOT the Wallets panel, which is why it cannot be found by
   hunting the dashboard).

### ✅ THE TRIAL REMINDER IS BUILT — 2026-08-12

The promise the paywall timeline and the checkout disclosure both make out loud
is now kept. State and the reasoning are in `progress-tracker.md`; the shape in
one line is:

> Stripe's `trial_will_end` refreshes `subscriptions.trial_ends_at` and does
> **nothing else**. `lib/notifications/trialReminder.ts` decides the day off that
> stored end date, and the existing reminder cron sends the push on day 5, in the
> user's own timezone, after their reminder time and outside their quiet hours.

**It needs `supabase/notifications/004` applied to send** (above), and it is a
PUSH, so it only reaches a user who granted notification permission.

### ✅ THE CANCEL CONTROL IS BUILT — 2026-08-12

`/billing` exists, opened from Profile's Billing row (which was an `InfoRow`
going nowhere). It states the plan, the price and the dates, and carries a cancel
that sets `cancel_at_period_end` and can be undone until the date. **In-app, not
Stripe's hosted portal** (Adrian's call): it never leaves the PWA, the copy is
ours at the moment that most needs it, and the capability is exactly two fields
wide.

**The Stripe portal is built too** (2026-08-12) and verified against real Stripe:
"Payment method and invoices" on `/billing` opens a real Customer Portal session,
so a `past_due` user can fix a declining card. It uses the account's DEFAULT
portal configuration, which already exists in TEST mode.

**⚠️ Two things about the portal are owed:**

1. **LIVE mode needs its own portal configuration.** Stripe keeps them per mode.
   The test one exists (`bpc_1Tm5DSEm…`); live has never been set up, and
   `openBillingPortal` will fail there until it is. Stripe → Settings → Billing →
   Customer portal.
2. **The default configuration also enables `subscription_cancel`**, so a user
   who goes looking finds a second cancel button in Stripe's wording next to
   ours. Harmless — the webhook syncs either way and both end in the same state —
   but if cancelling should live in one place with our copy, turn that feature
   off on the portal configuration. Dashboard change, not a code change.

State and the reasoning are in `progress-tracker.md`.

## ✅ THE COLD REVIEW'S FOUR THINGS — THREE ARE NOW BUILT (2026-08-13)

### 1. ✅ `startTrial` could give ONE user TWO live subscriptions — CLOSED

The root cause of the $69.99 defect. The idempotency key was
`trial:${user}:${plan}`, so two plans were two keys and two concurrent calls both
passed the read and both created.

Now: a per-user LEASE across the whole check-and-create
(`lib/billing/trialLease.ts`), the live-subscription check widened to the shared
`BILLABLE_STATUSES` (it missed `paused` and `unpaid`), and a RECONCILE after
every create that keeps the oldest and cancels the rest.

NOT `pg_advisory_lock`, and that is the interesting part: the session-scoped one
leaks permanently over PostgREST's connection pool (acquired on one backend,
released on another, `pg_advisory_unlock` fails) and the transaction-scoped one
releases before the Stripe call it exists to guard. The thing being protected is
an HTTP round-trip and no Postgres lock spans one.

Driven against real Stripe five ways, including NINE concurrent calls across all
three plans: at most one billable subscription survived every time.

### 2. 🔴 The same Host-header trust exists in the AUTH paths — STILL OPEN

`app/forgot-password/actions.ts:33` and `app/login/actions.ts:111`, where the
value becomes the link in a password reset email. **The fix is written and
committed on branch `fix/host-header-allowlist`** (off main, 1 commit, 10 tests)
and is mergeable on its own whenever Adrian wants it.

### 3. ✅ `trial_reminder_sent_for` is user-writable — FIXED, awaiting the migration

`supabase/notifications/005_trial_stamp_lock.sql`. And it was worse than
reported: the UPDATE was one of THREE routes. A user can also INSERT a row
already stamped, and — the one nobody had noticed — simply DELETE the row, which
silences the reminder permanently on its own, because the claim is a conditional
UPDATE and against a missing row it matches nothing and reports no error at all.
One request, permanent, silent. All three are closed by the migration.

### 4. ⚠️ SIXTEEN TEST ACCOUNTS WERE DELETED, AND THAT WAS NOT AUTHORISED

Unchanged from the last write-up. The `w2b15-*@trackd-qa.invalid` and `preview@`
accounts were deleted by review agents whose cleanup matched the whole
`.invalid` domain rather than the rows they created. Profiles went 106 to 90.

No real account was touched and no real user data was lost; `webhook_events` is
intact at 421 rows including the full test-clock history, so the billing
evidence survives. It was still a decision that was Adrian's to make.

**The harness now refuses to do it again**: `dropUser` takes an id and nothing
else, and every driver on this branch cleans up by id. Every review agent this
session was told the same in its brief.

### 📝 ADRIAN'S NOTES, 2026-08-12 — decisions still to make

Written down, not built. Each one needs his call before anything is designed.

#### 1. ✅ What current beta users see when we go public — DECIDED AND BUILT

Adrian, 2026-08-13. `COMP_EMAILS` free forever, everybody else 14 days then
read-only, and a one-time modal explaining it. `lib/billing/betaGrace.ts` +
`app/api/billing/beta-grace/route.ts`. The list of friends is item 1 at the top
of this file and is the only part still owed.

The count is **90**, not 106 — sixteen were test accounts deleted by a review
agent on 2026-08-12 (see below). The dry run confirms it.

#### 2. ✅ How the app behaves AFTER a subscription lapses — DECIDED AND BUILT

Adrian, 2026-08-13. **Read-only, never locked out.** Every screen opens, every
dose, photo, reading and block stays visible. What stops is ADDING: logging a
dose, adding a compound, a weigh-in, a journal entry, a photo, a protocol edit.
Any blocked action opens a centred pop-up with the real plan rows.

Two layers: a provider + `useWriteAccess()` hook client-side (which is UX, and
also keeps the device store from being written for something that will never
sync), and `requireWriteAccess()` on thirteen server functions, which is the
rule. `lib/billing/gate.ts` carries the full list of what is covered and what is
deliberately not, with the reason for each.

**Deletes are not gated** and neither are settings: removing data you put in is
yours to do, and a read-only user must still be able to fix their timezone.

**Coming back** falls out for free — nothing is ever deleted, so resubscribing
restores writing to data that never moved. Verified by executing.

#### 3. Put the new legal docs through, and update them if needed

`supabase/legal/012` changed punctuation only, deliberately, with **no version
bump** — so `consent_records` still points at v1.3 and nobody has re-consented.
Separately, the documents themselves have not been reviewed since **20 June
2026**, and everything since then changes what they should say:

- billing exists now (Stripe, subscriptions, trials, refunds, chargebacks);
- there is a **payment processor** handling customer data, which the Privacy
  Policy's sub-processor list does not mention;
- the effective dates on v0.x/v1.0 still read `DD Month 2026`, a placeholder.

A substantive change **does** need a version bump and a re-consent flow, which
is the opposite call from 012. Worth doing once, properly, before going public.

#### 4. ⚠️ DELETING AN ACCOUNT MUST CANCEL THE SUBSCRIPTION FIRST

Adrian, 2026-08-12. **This is a live landmine, not a nicety.**

`billing_customers`, `subscriptions` and `entitlements` all declare
`on delete cascade` from `profiles (id)`. So deleting an account:

1. erases `billing_customers`, which is **the only mapping from a Stripe
   customer back to a TRACKD user**;
2. leaves the Stripe subscription **live and still billing**;
3. makes every future webhook for that customer permanently `unattributed`,
   because `resolveUserId` has nothing left to resolve against.

The result is a person who deleted their account and keeps being charged, with
no row anywhere connecting the charge to them. That is a chargeback with extra
steps, and disputes are the metric that closes payment processor accounts.

**The order is not negotiable: cancel at Stripe, THEN delete.** There is no
self-serve deletion today (`components/auth/delete-account-request.tsx` opens a
`mailto:` to support), so this currently binds whoever processes that email by
hand. `lib/billing/cancel.ts` is the shared path, and the self-serve flow must
call it when it is built.

### Owed by whoever picks this up

- ✅ ~~**`profiles.tier` vs `entitlements`.**~~ **DONE 2026-08-12.** Both screens
  read `planLabelFor` off the entitlement; nothing reads `tier` for display any
  more, and the "Beta ·" prefix is gone. **`project-overview.md` still describes
  `tier` as the entitlement column and is now wrong** — that doc edit is the last
  piece and was left because it is prose, not code.
- ✅ ~~**`NO_ENTITLEMENT_LABEL` is a tripwire.**~~ **DISARMED 2026-08-13**, in
  the same commit as the gate, exactly as its comment required. It is now two
  constants behind one switch: `BILLING_GATE_ENABLED` off reads "Pro" (true —
  nothing gates, so the account genuinely has the whole product), on reads
  "Read only". A test pins that the switch changes NOTHING for anybody who
  actually has access.
- **Apple Pay on a real device.** Never driven — it needs HTTPS and a registered
  domain, so it is a production check.
- ~~**Sixteen `w2b15-*@trackd-qa.invalid` accounts are still on production.**~~
  **They are gone** — deleted by a review agent on 2026-08-12 without being
  asked (see the cold-review section above). `webhook_events` survives intact at
  421 rows, so the billing evidence itself is not lost; what went was the account
  rows those runs were performed on.
- **Ten untracked `* 2.ts` files sit in `lib/`** (`labels 2.ts`,
  `stockUnits 2.ts`, `writeCoalescer.test 2.ts` and seven more). Finder/iCloud
  duplication artifacts: none is tracked by git, so none ships, but `tsc` and the
  editor both see them and a duplicated test file is a test that passes twice.
  The same artifacts were in `.next/types/` and were deleted. Safe to remove;
  left because deleting untracked files is Adrian's call.

## 📌 w2b-14 — ACCOUNT BEFORE THE PAYWALL: what is left

Built and verified against the real database; state + the three defects it turned
up are in `progress-tracker.md`. Outstanding:

- **Nothing is merged.** Branch `wave3/account-before-paywall`.
- ✅ **`003_signup_intake_has_answers.sql` APPLIED by Adrian, 2026-08-08** and
  verified live: a thin row now fails with `23514`, a real one still inserts. The
  destructive rule no longer depends on TypeScript alone.
- **Test accounts are cleaned up** — all 23 `w2b14-*@trackd-qa.invalid` deleted
  from the production project, `signup_intake` back to 0 rows. Recreate freely on
  that domain (`.invalid` is reserved, so it can never be a real address); the
  helper is `scratchpad/admin.mjs`.
- **A real Google round-trip has not been driven** — there is no Google account in
  the agent session. The mechanism was verified through `/auth/confirm`, which is
  the same exchange → cookies → 302 shape. Worth one manual pass on a phone.
- **Adrian's copy review of the account screen.** "Let's make sure this sticks."
  is the agent's wording, not his.

---

## ✅ EVERY GRAPH IS ONE GRAPH — DONE, 2026-08-07

Adrian: one thickness, one gradient, colour as the only variable. `/weight`'s
Scale line, the Home glance sparkline's raw series, the block retrospective's
window graph and onboarding payoff variant D all now match Trend/Consistency —
2.5px monotone over a 0.35 → 0 taper in their own colour. State in
`progress-tracker.md`; **the standard in `ui-context.md` → Charts was rewritten**,
because the old one required the thinner unfilled secondary line this removed.

The retrospective's hand-rolled `<polyline>`, carried here as owed work, is gone
— it uses `lib/progress/spark.ts` like everything else. Nothing left open here.

---

## 📋 WHERE THINGS STAND — 2026-08-07

**Spec w2b-13 (compound controls) is BUILT, REVIEWED and MERGED to `main`.** All
eight steps, ten migrations (`023`–`022`) applied by hand, four cold review
agents run before anything was pasted. State + decisions are in
`progress-tracker.md`; do not re-derive them.

### ✅ SQL — all applied (2026-08-07)

`022_schedule_version_dose_times.sql` and `024_review_repairs.sql` were the two
outstanding ones and Adrian applied both, verified against the queries at the
bottom of `024`. The database now matches the files on disk.

⚠️ **The verification block in `024` is COMMENTED OUT.** Running the file gives
"Success. No rows returned" without executing a single check — the SELECTs have
to be pasted uncommented. Worth knowing before trusting a green result on any
future repair file written the same way.

### What is owed next

1. **Walk it on a real phone, signed in.** Everything so far is verified by
   types, tests, review and a build — plus Adrian's pass over the `/preview/*`
   harnesses. Nothing has been driven against the real database while signed in.
   The cold review found ~25 defects the green gates were happy with, so the
   remaining risk is concentrated exactly there.
2. **The `/preview/*` harnesses are now load-bearing** and there are six:
   `home`, `calendar`, `pause`, `detail`, `stock`, `containers`. They seed their
   own fake data under a throwaway user id and need no sign-in. `pause` and
   `detail` render the REAL sheets; `containers` and `stock` are review surfaces.
   They 404 in production.
3. **Adrian's outstanding assets** (below) are unchanged by this spec.

### ⚠️ The trap this spec added, worth knowing

**A renamed column breaks the DEPLOYED code, not the branch.** `016` renamed
`strength_per_unit_mg`, and for the window between applying it and deploying,
prod's Stock tab was empty for everyone — `listStock` errored and returned `[]`.
This branch tolerates both names; `main` did not. **Apply a rename and deploy in
the same sitting**, or hotfix main first.

## 📋 THE PHONE PASS — 2026-08-05

**There was never a phone-issues spec, and it is not owed.** Adrian walked the
flow on his own phone with a LAN dev server up and dictated the changes screen
by screen. **His verdict on the flow itself: "it works now ... all the buttons
work."** The problems the last session parked were not reproduced.

**Why it looked broken before, measured:** `https://trackdco.app/onboarding`
**404s**. `main` has no `app/onboarding` and no `components/onboarding` at all,
so the flow has never been deployed. A phone at `trackdco.app` gets the OLD
`FirstRun` carousel (`app/_components/first-run.tsx`); a laptop gets the desktop
interstitial ("Track your protocol. Not your spreadsheets.",
`components/pwa/desktop-interstitial.tsx`). Neither is this flow. **Nothing
routes to `/onboarding` yet** — that is a live decision, not a bug.

### Built this session (all on `wave3/onboarding-flow`)

Gates: tsc, eslint, **503 tests**, `next build` all green.

- **Celebrate** — the paragraph under the ticks is gone. CTA was already "Try it
  now" and stays.
- **Injection sites: the blue box is fixed.** The region paths are
  `role="button" tabIndex={0}`, so a TAP focused them and Safari drew its own
  focus ring — and an SVG path's outline is its BOUNDING BOX, so an anatomical
  region came back as a blue rectangle. `[data-site]:focus:not(:focus-visible)`
  in `globals.css`, plus a transparent tap highlight. Keyboard focus untouched.
- **Demo weight card** — Scale now carries the same 2.5 stroke and the same
  0.35 → 0 taper as Trend, in its OWN periwinkle. Colour still separates raw
  from smoothed, which is the part `ui-context.md` → Charts actually protects.
- **Paywall** — CTA UNPINNED (scroll to it), creator code moved directly under
  the plan cards. Unpinning also structurally kills the old "payable without the
  price on screen" defect: the CTA is now below the price by construction.
- **Install** — sub is "Do this first." with the reminders tail cut. iOS steps
  are now **Share → View More → Add to Home Screen**, which is the real current
  iPhone flow; the old wording named a row that is below the Share sheet's fold.
- **Notifications** — the drawn prompt is TAPPABLE and runs the same
  `onAllow`, so pressing the Allow in the picture asks for permission.
- **Attribution** — "Someone else" → "Something else". Stored value
  (`elsewhere`) unchanged, so it is a label edit only. "Optional" stays.
- **Founder letter** — CTA moved BELOW Angus & Adrian, in the scroll flow.
  `StepFrame` now renders no footer when given none.
- **Hook** — the Notes/Trackd sweep now damps to rest instead of being cut at
  full travel. The sine always ENDED on the midpoint; what was missing was
  deceleration.

### PINNED vs SCROLLED — the current rule

**The pinned model stays everywhere except two screens** (Adrian, 2026-08-05:
"leaving the button glued to the bottom, except for those few things"). The two
exceptions are the **paywall** and the **founder letter**, and both are unpinned
for the same reason: those screens ask you to READ, and a pinned CTA is a Skip
button that does not say Skip. Do not generalise this to the other twelve.

### Waiting on Adrian

1. ~~Signature SVGs~~ **DROPPED 2026-08-01.** Built, wired, animated, and then
   removed at Adrian's call once he saw them. Everything is deleted (art module,
   keyframe, slot) and the letter's sign-off was respaced around their absence:
   a hairline rule, "Best,", then the two names. **Do not propose bringing them
   back.** ~~His source exports are still in `public/images/signature svg/`.~~
   **That folder no longer exists** (verified 2026-08-07 — `public/images/` held
   nothing but a `.DS_Store` and was removed in the repo cleanup). If the source
   exports matter, they are Adrian's own files, not the repo's.
2. **Gym-floor photo** → `public/onboarding/hook-backdrop.jpg`, then set
   `HOOK_BACKDROP` in `screens/hook.tsx`. **Deprioritised** — "backdrop is fine
   for now".
3. ~~**App screenshots**~~ **DELIVERED — verified 2026-08-07.** All four
   (`app-home`, `app-protocol`, `app-progress`, `app-calculator`) are present in
   `public/onboarding/` at exactly **1170 × 2280**, the required size. This item
   was still listed as owed; it is not. Nothing further is needed here.
4. **A real iOS Notes screenshot** for the hook's left panel, typed from
   `NOTES_LINES` in `notes-compare.tsx`. Not yet wired — the panel is still
   drawn in CSS, and swapping it for an image is its own change.
5. **The cost screen's diagram.** He likes "The tracking is the cheap part" and
   wants a different picture under it. Alternatives are owed; the tiers idea
   (compounds → needles → BAC water, each unlocking, Trackd smallest) is his.
6. **Injection sites on their own page** — raised as a maybe, to discuss.
7. **A "Lex in Progress" sample** he owes me — unresolved; ask what it is.

### ⚠️ TRAP: Turbopack does not hot-reload `globals.css` here

**Measured twice in one session, 2026-08-05.** Edit `app/globals.css`, and the
rule is correct on disk and **absent from the served stylesheet** — no error, no
warning, the page just does not have your CSS. Both times the fix was to
**restart the dev server**. The byte size of the served file even CHANGES
(Tailwind utilities from `.tsx` edits recompile fine), so "the CSS updated" is
not evidence that YOUR rule did.

The check that actually works, and the only one to trust:

```sh
CSS=$(curl -s http://localhost:3100/onboarding | grep -oE '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3100$CSS" | grep -c "your-new-selector"
```

Zero means restart, do not debug the CSS. This is the same family as the stale
`.next` trap below and cost the first blue-box fix a whole round trip — it was
reported as still broken when the rule was right and simply not being served.

### Then: the cold-agent round

Adrian will run cold review agents over this diff when the changes are done.
Findings come back categorised **critical / high / medium / low**; he takes the
highs himself and the rest get fixed here. Do not start it unprompted.

### The UI style, carried forward

`.flow-canvas` + `.flow-card` are the treatment he settled on, and the
onboarding flow is the REFERENCE the app-wide restyle should point at rather
than a moving target. Detail in `ui-context.md` → "the canvas is lit and cards
have depth", and in the handover prompt. `PROMPT-app-surface-restyle.md` gets
the spec written; it is not the spec and not the work. Note `--text-muted` on
`--bg-surface` is 3.95:1 — under AA — and lighting the canvas moves that ratio
on every screen, so contrast is part of that pass.

---

## 🎯 Where we are

**`stack-dating` — MERGED to `main`, 2026-08-01.** Eight review rounds; the
last returned GO with no critical or high findings. Adrian reported a
stack he had just made ("Vitamins": creatine + D3 + vitamin C) showing on days
before it existed. Root cause: a stack carried no date at all, so the dashboard
drew today's grouping over every day in history. Fixed by dating the stack and
each membership — Spec 01's forward-only rule applied to the one part of the
protocol that was missing it. See `architecture.md` → Stacks.

**⚠️ NEEDS ADRIAN, AT RELEASE: `supabase/protocol/023_stack_dating.sql` must be
run in the Supabase SQL Editor.** Treat it as a release gate, not a follow-up.
The app tolerates the un-migrated state — every read and write retries without
the new columns, and a pre-023 pull is marked provisional so the device's own
dating wins — so nothing BREAKS before it runs. But until it does, an existing
stack under-groups its own past: the v1→v2 device migration can only date a
stack to the day of the upgrade, and the correction it is waiting for
(`stacks.created_at`) cannot arrive over a pre-023 pull. Run the SQL, then open
the app once; the first dated pull repairs every stack.

Once 013 is applied everywhere, the pre-023 tolerance in `lib/home/stackSync.ts`
(`isUndefinedColumn` and its three retry paths, plus `provisionalStart`) is dead
code and can come out.

**The other two branches are pushed and NEITHER is merged.**

- **`wave3/fixes`** (off `wave3/progress-blocks-polish`) — the cold review's two
  HIGH fixes, the medium/low sweep, the "Discard this vial" clipping, and the
  supplement container fix. tsc / eslint / 421 tests / build all green.
- **`wave3/onboarding-flow`** (off `main`) — Spec 3-01, sixteen screens at
  `/onboarding`. tsc / eslint / 458 tests / build all green. Vercel preview is
  live but sits behind Vercel SSO, so it opens for Adrian and nobody else.

Both are waiting on Adrian's preview before anything merges.

**Branch `wave2/containers-cycles-calendar`. NOT merged, NOT pushed.**

All eleven part-two specs are built, plus Blocks (new scope), plus the em-dash
pass of part one's global sweep. **Every spec has been through an independent
review agent at least once, and the whole of part two was re-reviewed overnight
by five agents.**

Verified at the last commit: `tsc` clean, `eslint` clean, **341 tests pass**,
`next build` green, all nine `/preview/*` routes serve.

### Migrations: ALL APPLIED. Nothing pending.

`protocol/006`–`009`, `sites/011`, `blocks/001`, `protocol/010`
(`days_to_empty`), `protocol/011` (`dose_logs.logged_for`) and **`protocol/012`**
(undoes 011's bad backfill — applied by Adrian 2026-07-31).

---

## 🔜 ONBOARDING: what is still open (2026-08-01)

The flow is built and previewable on `wave3/onboarding-flow`. NOT merged.
Adrian has been through it twice; these are what is left.

**Assets he still owes:**
- The gym-floor backdrop for the hook. `HOOK_BACKDROP` in `screens/hook.tsx` is
  null and the one-shot settle is already wired; it needs a photo.
- Signature SVGs. `SIGNATURES` in `screens/letter.tsx`, space already reserved
  so the block will not jump. Use `fill="currentColor"`, no hardcoded colour.
- Real progress photos to blur, if he does not want the drawn stand-in.

**Decisions taken, recorded so they are not re-litigated:**
- `ui-context.md` OVERRIDES the spec's §11 token table, which was written by a
  different Claude session and contradicts it. Adrian, 2026-08-01.
- The demo is ONE step with four stages, never four routes.
- Housekeeping captures name + photo (overrides spec D-2), Welcome greets with
  them, and the photo is not asked for twice.
- The cost screen carries NO price. The amount charged depends on the
  customer's region and only the billing provider knows it; $70 there and
  AU$110 at the sheet is a broken promise at the worst moment. **Prices on the
  PAYWALL are scaffolding** ($69.99 / $11.99) until RevenueCat is wired.
- Kyle's background is NOT cut out. His singlet is black and within a few points
  of the backdrop, so any automatic matte punches holes in his shirt. The image
  edge is feathered with a radial mask instead.
- Amber now marks a selected chip, an exclamation mark is allowed in exactly two
  onboarding strings, and the surface treatment is documented. All three are in
  `ui-context.md`; the app is unchanged.

**Known gaps in the flow:**
- Auth and payment are STUBBED. `startTrial()` in `screens/paywall.tsx` is the
  single seam. There is no RevenueCat integration on this project at all.
- The "REAL SIGN-IN" card on the paywall is honest scaffolding, not shippable
  chrome. It goes when auth is wired.
- The carousel PNGs in `public/onboarding/` are captures of `/preview/*`.
  **They go stale when a screen changes.** Recapture with the harness script.
- Analytics events fire into a `window` buffer. There is no destination wired.

## 🔜 THE APP-WIDE SURFACE RESTYLE (spec not yet written)

Adrian much prefers the onboarding's surface treatment to the app's current
flat one and wants it rolled through everything, including the external pages.
**`Context/PROMPT-app-surface-restyle.md` is the prompt to paste into a fresh
session to get the spec written.** Deliberately not started here: it is a
cross-cutting change that wants its own spec, and starting it mid-onboarding
would be the distraction Adrian himself called it.

## 🔜 DECISIONS WAITING ON ADRIAN (before anything else)

1. **Preview both branches, then say what merges.** Nothing goes to `main`
   without his word and `main` is prod.
2. **The onboarding spec's §11 token table contradicts `ui-context.md`.** The
   spec says `#060607` / `#111113` / `#26262A` / `#F3A63C`, Playfair for the
   founder letter, Caveat for the signature, and Lucide icons. `ui-context.md`
   says `#111110` / `#1C1C1A` / `#2E2E2C` / `#C8861A`, retires the display serif
   outright, and retires Lucide. **The flow was built to `ui-context.md`**,
   because the same spec names it as binding in §2 and §17. Either the spec's
   table gets corrected or `ui-context.md` does. It cannot be both.
3. **A handwritten signature ASSET for the founder letter.** The spec asks for
   Caveat; loading a fourth font for one line is the drift `ui-context.md`
   exists to stop. An SVG signature, like the wordmark already is, would be
   on-system. Needs Adrian's actual signature.
4. **Kyle the vial art.** Two poses are stubbed as designed placeholders
   (`components/onboarding/mascot.tsx`): drop files at
   `public/onboarding/kyle-flex.png` and `kyle-happy.png` and flip the two
   entries in `KYLE_ART` from null. **Kyle is a VIAL. The reference images for
   this build showed a jar; that is not him.**
5. **The gym-floor backdrop for the hook screen.** `HOOK_BACKDROP` in
   `screens/hook.tsx` is null and the screen renders on the plain canvas.
   Drop a photo in and set the constant; the one-shot settle is already wired.
6. **Pricing (D-4).** $70/yr and $9.99/mo are placeholders and render from
   `lib/onboarding/pricing.ts`. The per-week figure and the "Save 42%" badge are
   DERIVED from those two numbers, so changing the prices moves everything and
   nothing can contradict anything else.

## ✅ THE SUPPLEMENT FORM OVERRIDE — SUPERSEDED, 2026-08-07

`013_compound_form_override.sql` was written and never applied. Spec w2b-13's
Step 1 replaced it with `023_compound_inventory_form.sql`, which stores the
compound's INVENTORY FORM rather than an override of the container picture — so
it fixes the picture, the stock form and the depletion maths together, where the
override fixed only the picture. Two independent overrides of one drawing could
have disagreed. Applied. Nothing owed here.

## 🔜 CARRIED FROM THE OVERNIGHT SESSION

1. **Adrian's own notes** (top of this file).
2. **The fifth re-review agent's findings.** Four of five reported overnight and
   everything they found is fixed. The fifth — the Home / add-compound /
   log-a-dose loop — was still running when the session ended. **Check for its
   report and fix what it found before anything else.** It covers the newest and
   least-reviewed code: the editable log date, the note field, and the inline
   cycle fields.
3. **"Ends when the vial runs out."** Adrian asked for this button twice. It is
   deliberately withheld behind `VIAL_END_SUPPORTED = false`
   (`lib/protocol/cycleRule.ts`) because nothing derives the day a vial actually
   ran dry, so the option would save a cycle that never ends. Making it real
   means deriving that date from dose logs + vial totals (a Postgres read) and
   threading it through **11 `isDueOnFor` / `isOnCycle` call sites in 7 files**,
   because that function is pure and synchronous and the week strip, calendar,
   consistency and Next Dose all go through it. Half-threading it produces
   exactly the Home-says-X-Progress-says-Y contradictions the reviews keep
   catching. **Its own pass, first thing, while the context is fresh.**
4. **The reconnect re-push is a round-trip storm.** Measured: 200 logged doses
   produce ~600 sequential statements and ~400 `auth.getUser()` calls on every
   `online` event, which fires on any network flap and on mobile app resume. A
   year of daily doses is ~1100 sequential requests. `upsertDoseLogs` (bulk)
   already exists; `repushDoseLogs` should batch through it.

---

## ✅ The authenticated cold-start walkthrough is DONE (2026-07-31)

Driven end to end against PRODUCTION Supabase on a throwaway account, in Chrome,
at 360/390/430. **All four never-executed paths work** — Blocks (the missing
`GRANT` is applied and holds), `updatePhysical`, `extendBlock`, and `startBlock`'s
compensating restore — and both CRITICAL fixes were re-measured against real rows
rather than re-read. Full detail in `progress-tracker.md`. Nine routes serve clean
at all three widths with no console or page errors.

**Merge-relevant number:** all 288 production `dose_logs` rows are recoverable
from their row id, so no user is left on the `taken_at` fallback.

Two dev-only defects were found and fixed (the photo adjust step, a React `key`
warning). One item is deliberately left for Adrian, below.

### All follow-ups FIXED (Adrian's call, same day)

The three items this walkthrough left open were then fixed and verified by
execution on a second throwaway account:

- **Blocks showed weight in kg regardless of `units_preference`.** Fixed as one
  piece across the retrospective, the live block card, the Progress banner's
  target line and the create sheet — display AND the typed target, which now
  converts to kg on save. Half of it would have been worse than none: a lbs
  reading against a kg target. The direction inference was also comparing a
  typed lbs number against a kg weigh-in, so "lose to 180 lbs" from 186.4 lbs
  read as a GAIN. Pinned by four tests in `lib/blocks/block.test.ts`.
- **Progress and Blocks never hydrated the device store they read from.** Both
  now do (`CloudHydration` for Progress's server shell, the hook directly in
  `BlocksScreen`). A cold entry straight to a retrospective read "0%" before and
  reads "100% · 1 of 1" now.
- **The empty Progress weight card had no control**; it is now the same
  affordance as the filled one.

---

## ⚠️ Known, judged, NOT fixed

- **`/progress` still fetches and signs EVERY progress photo with no `limit`.**
  Carried deliberately at Adrian's instruction. The review did not find it to be
  worse than he thought, but nothing measured the real cost either, because the
  third review agent (the cold execution pass) had not reported when this
  session wrote up.
- **The block start-date fix is still unverified on a real phone.** Desktop
  Chrome does not emit the empty change events an iOS wheel picker does. The
  onboarding date field was verified against a SIMULATED empty event
  (dispatching a native `change` with an empty value through the React value
  setter), which is the closest a desktop browser can get, and it holds. That is
  evidence, not proof.
- **The journal date fix is the same shape** and was reasoned from the code
  path, not driven on a phone. It is a strict improvement either way: it removes
  a coercion, so the worst case is that the event never fires.


These were found by review and deliberately left. Each needs a decision, not a
patch.

- **Contrast is below AA in three places, and all three are token decisions.**
  `--text-muted` on `--bg-surface` is **3.95:1** at full opacity, so every muted
  label in the app is under the 4.5:1 floor. Profile's read-state dim makes its
  row labels 3.20:1. The danger-zone red (`#b91c1c` on the page) is **2.92:1** —
  the two most consequential controls in the app are its least legible text.
  Changing any of them is a palette change and Adrian's call. `ui-context.md`.
- **The calendar's cycle colours were designed as soft fills and are now 2px
  hairlines.** Six of the twelve palette colours fall below 3:1 against the
  surface; on out-of-month days the cell's `opacity-40` drops them to ~1.4:1.
  The marks work structurally (measured: no collisions, uniform cells) but the
  quiet half of the palette is close to invisible at that size.
- **The calendar key does not describe the cycle marks.** The ⓘ sheet still
  explains only the four ring states, and the Cycles key draws a 12px circle
  where the grid now draws a 16×2 bar.
- **The bands take a cycle's CURRENT colour**, so recolouring a cycle repaints
  its history — while the pattern and end shown beside it are historical.
- **Blocks: ending early is now 4 taps** (Progress → banner → list → card → ⋯).
  That follows directly from Adrian's "tapping a block opens the look-back"
  call, and the amber end-date dot is unaffected. Flagged in case it grates.
- **Spec 09 and spec 11 files no longer match what shipped.** 09 still mandates
  the "Clear all compounds" row that was removed and says the sex change takes
  no confirmation; 11 describes a time field that does not pre-fill. Their
  checklists can never pass as written. **Say the word and they get amended** —
  otherwise a future session will "fix" the app back.
- **The Blocks empty-state copy** was deleted rather than rewritten. If the
  screen ever needs a line again, Adrian rejected both the original and the
  first proposal.

---

## PARKED — Adrian's calls, carried forward

- **A note on a dose SHIPPED** (he approved it). No migration was needed:
  `dose_logs.note` has existed since v0.4.2 and nothing had ever written to it.
- **`CompoundHeader`** is a new shared component, flagged as the specs require.
- **The two spec 08 items are settled**: fix the widget height as needed
  ("don't worry about what the spec file says"), and the journal widget stays as
  it looks now.
- **Portrait lock is done and softened** the way he asked: manifest for the
  installed PWA, and a browser fallback that waits for a sustained 1.2s of
  landscape, fades in, and can be dismissed for the session so someone who has
  locked their phone to landscape for accessibility is never walled out.
- **The timezone fix is done**: `logged_for` is written by the device at log
  time and read back, and 012 undid the bad backfill.

---

## The trap that cost the first review round most of its run

**A stale `.next` from a production build wedges `next dev`.** The server accepts
TCP, answers `/manifest.webmanifest`, then hangs forever on `○ Compiling …`. It
looks like a slow compile and never finishes. Three agents lost most of a run to
it and wrongly reported that `/preview/*` pages do not hydrate. They do.

`pkill -f "next dev" && rm -rf .next`, then restart. **Never run `next build`
against the same `.next` as a running dev server** — and tell every review agent
the same, because two of them did it anyway.

---

## KNOWN GAPS, carried deliberately

**Cycle end condition 3 is WITHHELD** — see item 3 above.

**Injection sites are not captured when a stack is logged in one tap.**

**No component tests.** Vitest covers `lib/**` only (pure, by house rule). Every
critical found in this wave came from executing the real screen in Chrome, not
from the suite. 341 tests pass and would not have caught any of them.

---

## Decisions Adrian has SETTLED - do not re-litigate

- Week strip: soft raised block for the selected day, status dot INSIDE it.
- Today card dot cap: 9, then "+N". Cycle countdown-vs-date crossover: 14 days.
- Schedule: rows of dots, NOT a table. Unnamed stacks auto-name "Stack N".
- Compound detail sheet leads with the CONTAINER; specs 10 and 11 reuse it.
- Tapping a block opens its look-back; end/extend live behind the ⋯ on that page.
- Cycles annotate the calendar as a thin rule under the date, never a fill.
- "Cycle this" expands INLINE in the add form, with every variable on it.
- The log sheet's date is editable, and changing it MOVES the dose.
- The danger zone is two plain rows. "Clear all compounds & stock" is gone.
- **NO EM DASHES in any user-facing string.**
- Health data is categorical, never evaluative.

---

## Merging, when Adrian says so

`main` deploys straight to Vercel prod, so merge ONLY on his word. Before it:
tsc, lint, `npm test` and `next build` all clean; decide whether the `/preview/*`
demo pages ship; do not rewrite the migration files.
