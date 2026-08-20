Save as: Context/Feature Specs/Billing Specs/billing-00-decision-ledger.md

*(Canonical path. Working document, not a spec — it follows none of the spec format
rules. Its job is to stop one number meaning two decisions, which has now happened
six times.)*

**⚠️ THE PATH ABOVE WAS WRONG UNTIL 18 AUG 2026 AND IS CORRECTED HERE.** It read
`Context/Feature Specs/00-decision-ledger.md`, which does not exist and never has —
that directory holds a different, older spec series (`00-INDEX.md`,
`01-design-system.md`, …). The ledger has always lived one level down, with the
`billing-` prefix.

**Why a wrong header on THIS file is worse than on any other.** A reader following it
finds nothing, and the obvious repair is to save a copy at the named path — at which
point there are two ledgers, and the one nobody is editing is the one the header
points at. **None of the six collisions below were caused by this**; every one of them
was a stale copy, including the founder's on 18 Aug. But a second file would be the
collision nobody catches, because both copies would look canonical.

Verified 18 Aug 2026: `find` across the repository returns exactly ONE match for
`*00-decision-ledger*` and one for `*ledger*`, and `git ls-files` agrees.

# Billing decisions and open questions

**How to use it.** Before issuing a decision, take the next free number from the
bottom of the D list. Before answering a question, check what it actually asked. If a
decision needs to supersede an earlier one, keep the number and mark it re-decided,
as D1 and D31 already are.

**Status at 15 Aug 2026. THE CORPUS IS COMPLETE: 00 and 01 through 19.**

**⚠️ UPDATED 20 Aug 2026 — next free decision number: `D110`. Next free question
number: `Q108`.** D102 to D109 and Q107 were taken by the final build round from
this file's own next-free list, in the brief's order. Nothing was renumbered.

**⚠️ D91 to D100 TAKEN 18 Aug 2026 by the build lane**, in the order the founder
listed them in the batch brief, from this file's own next-free list. Q106 taken for
the refund/dispute copy ambiguity below. Nothing was renumbered and no number was
accepted from the brief — it deliberately named none.

**The D71 to D77 gap is closed.** That block was re-sent and its seven decisions are
entered above, in their own numeric places rather than appended. The `19` correction
came with it: that spec cited D57 where this ledger and the manifest both say D68, and
both citations are fixed.

**Build-lane amendments start here.** D70 is the first: a contradiction found by
driving, ruled, and folded back into the spec it falsified rather than filed as a note
beside it. **An amendment edits the spec.** A corpus where the document and the
correction live apart is a corpus where somebody builds from the document.

**What arrives from here** is build-lane findings routed back as amendments, and any
counsel-driven supersession to D32 or to copy of that class. Both keep their original
numbers and are marked re-decided, as D1 and D31 already are — a supersession is not a
new decision and must not take a new number, or the record loses the fact that
something changed.

**⚠️ Launch target: Thursday 20 August. 01 to 12 are the launch set and are complete.
13 to 19 are post-launch and are not blockers in any seam or checklist they appear
in** — where one is referenced by a launch spec, it is referenced as an addition, not
as a dependency.

---

## Decisions

| # | Subject | Owner | Status |
|---|---|---|---|
| D1 | The reminder that keeps "we'll remind you first" | 04, 07, 12 | **Re-decided.** Condition unchanged; 04 now ships either way, with both promise strings withheld behind `REMINDER_PROMISE_ENABLED` |
| D2 | Refund replies come from the founder's own mail client | 10 | Resolved |
| D3 | No written refund policy; refunds hand-issued at discretion | 10 | Resolved |
| D4 | No in-app mass-stop control | 12 | Resolved |
| D5 | Analytics vendor not final; PostHog EU behind an adapter | 13 | Resolved |
| D6 | Per-currency prices | 18 | Resolved — the signed table, carried in 18 §3.1 |
| D7 | Three plans final | 02b | Resolved |
| D8 | One global switch-on-anchored grace window | 06 | Resolved |
| D9 | Plan switching ships after go-live | 15 | Resolved |
| D10 | Migration 003 applied before the re-land deploy | 12 | Resolved |
| D11 | Copy sign-off process | — | Resolved |
| D12 | The spec map | — | Resolved |
| D13 | A mid-grace subscriber is never charged inside the fortnight | 01, 02b, 06 | Resolved |
| D14 | The portal never carries cancel or plan switching | 08, 12, 15 | Resolved |
| D15 | The holding screen's paid variant and its 60s timeout | 02a | Resolved |
| D16 | The trial subtitle | 02b | Resolved |
| D17 | The mid-grace variant set | 02b | Resolved |
| D18 | The monthly-equivalent bracket stays | 02b | Resolved |
| D19 | A comp reaching checkout | 02b | Resolved, nothing built |
| D20 | The paid path's failure string | 02b, routed by 02a | Resolved |
| D21 | The resume confirmation dialog stays | 03 | Resolved |
| D22 | "Keep my Pro plan" on the resume trigger | 03 | Resolved |
| D23 | The expired-claim message | 04 | Resolved |
| D24 | The granted screen for a paying customer | 04 | Resolved |
| D25 | "$0.00 USD" on the gift card | 04 | Resolved |
| D26 | The reopen row's label | 04 | Resolved |
| D27 | The declined screen's title branches on status | 04 | Resolved |
| D28 | The read-only pop-up's selector and destination | 05 | Resolved — selector goes, one shared destination |
| D29 | The server's read-only refusal string | 05 | Resolved — signed as built |
| D30 | The per-browser seen cookie ships | 06 | Resolved |
| D31 | The notice's buttons | 06, 08 | **Re-decided.** Both controls ship |
| D32 | The legal terms line | 06 | Resolved, pending counsel's confirmation |
| D33 | The courtesy reminder's wording | 07 | Resolved, re-signed after the em-dash catch |
| D34 | Stripe's own customer emails | 07, 12 | **Deferred** pending Q79's observation |
| D35 | The subscribe row's label and cohort | 08 | Resolved |
| D36 | The plan label across five states | 08 | Resolved |
| D37 | The declined and past-due state | 08 | Resolved |
| D38 | Does the payment block take the flow surface treatment? | 09 | **OPEN.** Optional; recommended no |
| D39 | Manage lives at `/billing/manage` | 08 | Resolved |
| D40 | Pin both Stripe client packages | 09, verified by 12 | Resolved |
| D41 | The `refund_request` discriminator | 10 | Resolved |
| D42 | The refund queue's alert thresholds | 10 | Resolved — **four** tiers, at 0 / 1 / 2 / 4 business days |
| D43 | The refund screen's copy set | 10 | Resolved 15 Aug 2026 — **six** strings, not four |
| D44 | One open refund request per person | 10 | Resolved |
| D45 | The empty-submission error | 10 | Resolved |
| D46 | Where reconciliation alerts are delivered | 11 | Resolved — push plus dashboard, and a missing subscription fails the clean run |
| D47 | Signed-URL TTL is 300 seconds | 16 | Resolved — one constant, all seven call sites |
| D48 | The tax and GST line on checkout | 12 | **OPEN.** Pending counsel |
| D49 | The live smoke test on a real card | 12 | Resolved, amended: confirm no live grace first |
| D50 | A 24-hour minimum soak before the public flip | 12 | Resolved |
| D51 | The kill-switch drill before launch week | 12 | Resolved |
| D52 | The backfill is the point of no return | 12 | Resolved |
| D53 | The analytics vendor | 13 | Resolved — PostHog, EU cloud, free tier. Privacy Policy gains it as the analytics provider |
| D54 | Where the lapse event is emitted from | 13 | **OPEN.** Recommended: at the first refused write |
| D55 | Analytics live from launch morning, grace window included | 13 | Resolved |
| D56 | Whether a refund request survives account deletion | 16 | **OPEN.** See 16 §7 |
| D57 | The deletion confirmation's title and body | 16 | **OPEN.** Money line and mechanism settled separately |
| D58 | Type-to-confirm on deletion | 16 | Resolved — types `DELETE`, disabled until exact |
| D59 | The deletion money line | 16 | Resolved — conditional on a live subscription or trial |
| D60 | How MRR treats a courtesy month | 14 | Resolved — excluded, with a pending split line |
| D61 | Where the reconciliation summary is persisted | 14 | **OPEN.** Carries a migration |
| D62 | The downgrade confirmation line | 15 | Resolved |
| D63 | Proration amounts come from Stripe's preview, never local maths | 15 | Resolved |
| D64 | The upgrade confirmation's copy | 15 | **OPEN.** See 15 §7 |
| D65 | Stripe automatic receipt emails ON, payments and refunds | 17, 12 | Resolved |
| D66 | The USD suffix stays while single-currency | 18 | Resolved |
| D67 | How the currency is chosen before a card exists | 18 | **OPEN.** See 18 §3.2 |
| D68 | Receipts show full history, paginated | 19 | Resolved |
| D69 | Zero-dollar invoice rows are labelled, never bare | 19, 11 | Resolved |
| D70 | An unpaid period is ineligible for the save offer | 04 | Resolved — build-lane amendment, seated in 04 §3.3 |
| D78 | The cancel dialog's body for a no-expiry comp account | 03 | Resolved — replacement body, row not hidden |
| D79 | A no-expiry comp is ineligible for the save offer | 04 | Resolved — same family and ordering as D70 |
| D80 | Paused and unpaid subscriptions cancel immediately | 03 | Resolved |
| D81 | The backfill must not resurrect a revoked comp | 12, seam to 01 | Resolved — fix before P11 |
| D71 | A comp-list member signing up after the backfill gets a comp at signup | 01 | Resolved — built |
| D72 | A slightly-extended trial is clean, not anomalous | 11 | Resolved — not built |
| D73 | The paywall's interval suffix comes from Stripe | 02b | Resolved — built |
| D74 | Six previously unsigned strings, signed as approved copy | 02b | Resolved — sacred as they stand |
| D75 | 11 asserts no courtesy marker on a subscription unpaid at grant | 11 | Resolved — not built |
| D76 | Void the open invoice when cancelling an incomplete subscription | 03 | Resolved — built, currently unreachable |
| D77 | A refused comp's welcome screen suppresses the trial line | 01 | Resolved — built |
| D82 | The courtesy push reuses the approved grace title | 07 | Resolved |
| D83 | An incomplete-only account gets the support line, not a cancel control | 03 | Resolved — existing approved copy, no new string |
| D84 | Manage's summary is ONE sentence | 08 | Resolved — the signed sentence is the whole line |
| D85 | The re-land is REVERT THEN MERGE, not revert alone | 12, seam to every spec citing the re-landing trap | Resolved — tested in a detached worktree |
| D86 | The 86 graces are re-dated by `004_regrace_launch_date.sql` | 12, seam to 06 | Resolved — written, unapplied, SINGLE-USE, launch morning only |
| D87 | Reconciliation alerts fire on EVERY failing run, not edge-triggered | 11 | Resolved — built |
| D88 | D72's tolerance is bounded at the largest extension any built mechanism can produce | 11 | Resolved — derived from the code, not chosen |
| D89 | The QA drivers are tracked | 12, seam to every spec that drives | Resolved — the spine now, the `.mjs` browser drivers at the freeze |
| D90 | The beta notice's seen cookie is account-scoped | 06 | Resolved — built |
| D91 | A dispute CANCELS the Stripe subscription | 03, seam to 11 | Resolved — built and driven against real Stripe |
| D92 | A disputed customer may resubscribe freely: no approval flow, no email gate | 03 | Resolved — the sentence routes them to the plan list |
| D93 | The dispute-cancellation sentence, signed | 08 | Resolved — signed 18 Aug, pinned as codepoints |
| D94 | `suspended` keys on the REVOCATION FLAG on a live row, not on two dates disagreeing | 08 | Resolved — found by three independent reviewers |
| D95 | A dropped chargeback is RETRIED, not reported handled | 03, seam to 11 | Resolved — unreadable throws, genuinely unmapped stays unattributed |
| D96 | The past-due grace STAYS at three days rather than matching Stripe's retry window | 05 | Resolved — matching would hand out ~2 weeks of free access per failed payment |
| D97 | The two after-the-lapse past-due sentences, signed | 08 | Pending — Group 3 |
| D98 | The read-only pop-up's first clause is reworded and STAYS UNBRANCHED | 05 | Pending — Group 3, and the standing stop-and-ask fired |
| D99 | Spec 11's revocation exemption narrows to the subscription in question; revoked-beside-live becomes a REPORTED state | 11 | Resolved — built, and §3.4's false premise corrected |
| D100 | The three parked `revokeForCustomer` findings accepted under §9g, with the CURRENT reason | 11 | Resolved — recorded, and their coverage MEASURED (one of three newly caught, not three) |
| D101 | The revocation reason is persisted; an unknown reason WITHHOLDS both dispute sentences | 03, seam to 08 | Resolved — `005` written and applied 18 Aug; answers Q106 |
| D102 | `soonerOf` is NOT normalised; the identity comparison is pinned at the source instead | 08 | Resolved — post-launch, behaviour-neutral today and correct BY ACCIDENT |
| D103 | The past-due grace is WRITTEN OUTRIGHT, lengthening or shortening, rather than only ever shortening | 05, seam to 08 | Resolved — the grace measured **0.00 days**; four bounds named and each driven |
| D104 | Updating a payment method RETRIES an open invoice, triggered by a webhook and never by a button | 03, seam to 12 | Resolved — Stripe's own next attempt is at day +2, measured |
| D105 | The courtesy marker gets a date test at the DISPLAY readers ONLY; it is never cleared | 08, seam to 11 | Resolved — the rules ask "did it happen", the screens ask "is it happening now" |
| D106 | A declined payment gets a DASHBOARD BANNER, in the existing slot, and NOT a pop-up | 05, seam to 07 | Resolved — founder ruling; gated on `BILLING_GATE_ENABLED` |
| D107 | The cancel dialog's dismiss label AND title follow the cohort: trial or plan | 03 | Resolved — **supersedes §3.9's unqualified "Keep my trial"** and closes the §3.9-versus-D36 conflict |
| D108 | The save offer's gift block and granted screen name a WINDOW, `{start} to {end}` | 04 | Resolved — the month form had never been rendered; "until {end}" described SEVEN months as one |
| D109 | The save offer is RESTORED to a session that ended at the dialog, inside its own ten minutes | 04 | Resolved — same marker, same instant, no new grant |

## ⚠️ THE FLOOR ASKS THE WRONG QUESTION — RECORDED, DELIBERATELY NOT FIXED (20 Aug 2026)

**Founder's ruling: do NOT change the floor's status set in this round.** Recorded here
with the mechanism, the measurement and the door that stays open.

### The mechanism

`otherLiveEntitlementFloor` (`lib/billing/sync.ts`) skips any sibling subscription whose
status is not in `ENTITLING`, and `ENTITLING` is `{trialing, active}`. So a `past_due`
sibling **raises no floor at all** — and the guard that exists to stop one subscription
clawing back another's paid access is switched off exactly when the surviving
subscription is itself in trouble.

**It is the third instance of one pattern**, and that is why it is worth a heading
rather than a line. The floor asks *"is this subscription ENTITLING?"* when the question
it needs answered is *"what has this subscription PAID FOR?"*:

| | asked | needed |
|---|---|---|
| `accessEndsEarly` | one flag, two jobs | two questions, two answers (fixed 1.4) |
| `offerPeriodToGrant` | one short-circuit, two questions | "what to GRANT" vs "what IS this period" (renamed, and it still hid F2 for a round) |
| `otherLiveEntitlementFloor` | "is it entitling?" | **"what has it paid for?"** |

### The correct fix, stated so it is not re-derived

**A `past_due` sibling with a future paid-through raises a floor AT that date, while
`past_due` stays OUT of `ENTITLING`.** Those are two different questions about one
status and they must keep two different answers: `past_due`'s exclusion from `ENTITLING`
is what stopped the measured **+58 unpaid days**, and any fix that widens `ENTITLING`
itself reopens that family.

### Why not this round

It changes clawback semantics, and the narrowing was expected to close the measured
door more cheaply. ⚠️ **The narrowing then failed its own confirmation** (see Q107), so
**neither fix has landed and the door is still open.**

### The door that stays open, stated exactly

**Two live subscriptions BOTH `past_due`, plus a third that is dead with an outstanding
invoice.** Measured at **5.00 days** taken off paid access
(`scratchpad/final/drive-G-crosssub.mjs`, `FINDING-G.md`); the lifetime run saw **371
days** once on a yearly.

That state is **already the anomaly** the one-subscription invariant exists to prevent —
`startTrial`'s lease and the reconcile both guarantee a user has at most one live
subscription, and `screenFacts` logs it loudly when there is more than one. So the door
is real, it is bounded to an account that should not exist, and it is visible when it
does.

**Also open, unnumbered:**

- The read-only pop-up's copy set, raised three times: it is neither the brief's
  approved pop-up nor the built one, its body never uses the exact phrase "read only",
  and its title branches on a trial or subscription that a lapsed account does not
  have (05 §7).

- Whether the entitlement-writer section in 05 should gain an idempotency ledger, an
  unattributed-parking description, and a customer-identity trust rule (05 §7).

---

## Questions

| # | Subject | Blocks | Status |
|---|---|---|---|
| Q1–Q64 | The first implementer round | — | Answered |
| Q65 | Portal configuration in test mode | 08, 12 | Answered |
| Q66 | What writes entitlement rows | 05 | Answered |
| Q67 | The onboarding exceptions in ui-context | 09 | Answered — there are four, not one |
| Q68 | Existing files in Context/Feature Specs | — | Answered |
| Q69 | The mid-grace checkout path | 01, 02a, 02b, 06 | Answered — it is broken |
| Q70 | Retry and dunning configuration | 05, 12 | Answered |
| Q71 | Email on the Stripe customer | 04, 07, 17 | Answered — set once, never refreshed |
| Q72 | Any PaymentIntent branch | 02a | Answered — none |
| Q73 | Founder-read RLS on the billing tables | 10 | Answered — none |
| Q74 | What a grace account's Billing screen reads | 08 | Answered, consumed by 08 |
| Q75 | — | — | Never minted; numbering gap, left open deliberately |
| Q76 | Stripe's minimum trial_end offset | 01 | Resolved as a 48h clamp |
| Q77 | The subscriptions.create call in full | 02a | Answered |
| Q78 | The holding screen | 02a | Answered |
| Q79 | Does Stripe's email fire for a moved trial_end? | 04, 07, 12 | **OPEN.** Test clock only |
| Q80 | What the idempotency fingerprint covers | 02a | Answered |
| Q81 | reconcileToOne in full | 02a | Answered |
| Q82 | What the resume label is computed from | 03 | **OPEN.** Traceable during Step 1 |
| Q83 | What consumes savedAt | 03 | **OPEN.** Not blocking |
| Q84 | Where "Set up my plan" goes | 06 | Resolved from evidence held |
| Q85 | The generic syncing notice | 05 | **OPEN.** Step 4 needs it to finish |
| Q86 | The built notice strings | 06 | Answered |
| Q87 | Whether "Set up my plan" exists | 06 | Answered — it does not |
| Q88 | The access label strings | 08 | Answered |
| Q89 | Sub-route patterns | 08 | Answered — none exist |
| Q90 | Stripe versions and appearance selectors | 09 | Half answered; selectors are a docs lookup |
| Q91 | The selected tab's label selector | 09 | Answered — documented. Terms text still open |
| Q92 | The paywall's step key | 06 | **OPEN.** One narrow question |
| Q93 | Whether any Stripe list call paginates | 11 | **OPEN.** New |
| Q94 | The script-runner convention under scripts/ | 11 | **OPEN.** New |
| Q95 | Whether the four storage buckets are private | 12, 16 | Answered — all four private; re-verified on the day |
| Q96 | The live webhook endpoint's registered event set | 12 | **OPEN.** After registration |
| Q97 | Whether consent records gate analytics | 13 | **OPEN.** New |
| Q98 | Where storage object paths are recorded, and the bucket key layout | 16 | **OPEN.** New |
| Q99 | How the auth user is deleted, and whether an admin client exists | 16 | **OPEN.** New |
| Q100 | The seven signed-URL call sites | 16 | **OPEN.** New |
| Q101 | What the awaiting-first-customer state currently checks | 14 | **OPEN.** New |
| Q102 | Which Stripe mechanism defers a downgrade to period end | 15 | **OPEN.** New |
| Q103 | Whether the mirror can record a pending plan change | 15 | **OPEN.** New |
| Q104 | Where the Google sign-in screen's name comes from | 17 | **OPEN.** New |
| Q105 | How a partial refund appears on the invoice object | 19 | **OPEN.** New |
| Q107 | Should the entitlement FLOOR count a `past_due` sibling, and should a CANCELLED subscription's failed invoice be able to move the shared row at all? | 05, seam to 11 | **OPEN, AND BOTH HALVES ARE NOW ANSWERED "NOT LIKE THAT". ⚠️ 20 Aug: the founder ruled the NARROWING (a dead subscription's failed invoice moves nothing) and required a confirmation first — is `markPastDue` ever the ONLY shortener after a cancellation? **IT IS, AND IT IS MEASURED** (`drive-Q107-order.mjs`): `endSubscription` left **7.00 unpaid days** standing and `markPastDue` was the only thing that took them back. `endSubscription` is a LENGTHENING GUARD, not a clawback — its `until` is `items[0].current_period_end`, the same field `syncSubscription` already wrote into `active_until` at the cycle roll, so `Math.min` finds them equal and it declines to write. Cost of narrowing: weekly +4.00d, monthly +25–28d, yearly **+362d** — but one-shot and self-terminating. Cost of not narrowing: 5.00d of PAID access taken back, 371d seen once. ⚠️ If re-issued the ruling must key on STATUS, never on `cancel_at_period_end` — `past_due` is in `CANCELLABLE_STATUSES`, so the ordinary Cancel button would qualify. See `scratchpad/final/FINDING-Q107.md`. **The floor's own fix is ledgered separately below.** ORIGINAL FINDING: REPRODUCED, MEASURED, NOT FIXED. A cancelled subscription clawed **5.00 days** off access paid for on a live one. `otherLiveEntitlementFloor` skips anything outside `ENTITLING` = `{trialing, active}`, so a past-due sibling raises no floor. Any fix must reach the FLOOR without reaching the EXTENDER — `past_due`'s exclusion from `ENTITLING` is what stopped the measured +58 unpaid days. See `scratchpad/final/FINDING-G.md` and `drive-G-crosssub.mjs`. |

---

## ⚠️ POST-LAUNCH JOB: audit whether the money tests reach the states they claim

**Not before Thursday. Recorded so it is not lost.**

Nobody has checked whether the tests guarding the money paths actually put the
system into the state they assert about. Two instances are already on the record,
found by accident rather than by looking:

- **`manage.test.ts:71-97`** once asserted the OPPOSITE of correct behaviour — that
  a comp should be denied the way out of a live billing subscription. The reverse
  assertion WAS the bug, and it passed for months.
- **`billingreason.scenario.ts`'s clawback branch** seeded `active_until` at the old
  period end, so it never created the optimistic extension the clawback exists to
  undo. The handler correctly did nothing, and the test would have passed for the
  wrong reason the moment the assertion was loosened.

Both share one shape: **a green test that never entered the state it names.** That
is worse than no test, because it is counted as coverage. The audit is to walk each
money-path test and ask what state it actually constructs, not what its name says.

---

## Carried forward into specs not yet written

**`16-account-deletion.md`** inherits three things from the storage audit, and they
are recorded here so they are not rediscovered:

- **A database cascade cannot reach Storage.** Deletion must enumerate and delete the
  user's objects across all four buckets explicitly.
- **Until 16 ships, every hand-performed deletion includes a dashboard storage sweep**
  of those four buckets under the user's id. Without it the erasure promise is not
  being kept, and that is true today rather than after go-live.
- **D47's signed-URL TTL** lands here as a small item: one constant, all seven call
  sites, including the avatar page's hardcoded value.

---

## D42 and D43, in full

Both were decided on Saturday 15 August 2026 and did not reach this ledger until
17 August. The table above showed them open for two days; the delay is recorded
because `10-refund-requests.md` §7 still reads as though they are.

### D42 — the refund queue's alert thresholds

**Three tiers**, on the oldest OPEN request:

| Tier | Condition |
|---|---|
| Informational | any unanswered request, shown in `/admin`'s "what needs you" block with its age |
| Amber | oldest open request past **1 business day** |
| Missed target | oldest open request past **2 business days** |
| Chargeback risk | oldest open request past **4 business days** |

Two business days is the number the screen prints, so passing it is a missed
target rather than a warning.

**⚠️ THE FOURTH TIER IS A DIFFERENT FACT, NOT A LOUDER VERSION OF THE THIRD**, and
it must be labelled so it reads that way. Four business days is where somebody
stops waiting and calls their bank. That does not make the reply later; it changes
what the request IS — a dispute, carrying a fee and a mark on the Stripe account,
decided by someone other than us and no longer answerable by replying. "Very late"
would invite the same action as the missed-target tier, which is to reply sooner.
This one is telling the operator that replying may no longer be enough.

**Ordering note.** §7 originally recommended four tiers of this shape, the ruling
of 15 Aug carried three, and the fourth was added on 17 Aug. **D42 keeps its
number**: the fourth tier completes the entry rather than superseding it, and the
first three stand exactly as they were ruled.

### D43 — the refund screen's copy set

**Six strings, not four.** Character for character, no em dash.

| Slot | String |
|---|---|
| Title | Request a refund |
| Under the title | A real person reads every one of these. We'll review your request and get back to you, usually within 2 business days. |
| Success title | Thanks, we've got it. |
| Success body | We usually reply within 2 business days. Nothing changes on your account in the meantime. |
| Confirmation intro, above the copied text | A copy of your request is below for your reference. |
| Disabled entry point (D44) | You already have a request open. We'll come back to you on that one. |

**Never "we will" or "guaranteed" on the reply time.** "usually" is deliberate and
is what keeps two business days a target rather than a promise. The signed
under-title line does say "We'll", but it attaches to *review your request and get
back to you*; the time itself carries "usually", so the rule holds.

**No timeframe on the disabled state.** The line above the form already carries it,
and repeating it there would state the promise twice on one screen.

**⚠️ Two notes so a cold reviewer does not file this as a contradiction:**

- **The success title is the opening of §7's option B, which §7 rejects.** B was
  rejected for *dropping "usually" and turning a target into a commitment*. The
  signed body retains "usually", so the rejection reason does not carry to the
  title. The signed pair takes B's warmth and A's discipline.
- **The under-title line is NEW COPY**, in neither option A nor B. It adds "A real
  person reads every one of these," which neither option carried.

**Checked against the legal documents**, which §7 requires so that one number does
not exist in two forms: no collision. The only "business day" in the current set is
Privacy Policy v1.3's *"acknowledge a complaint within 5 business days"*, a
different promise. Terms v1.3 carries the refund text and states no timeframe at
all. **Two business days exists in one form only.**


---

## D83 and D84

### D83 — an incomplete-only account gets the support line

An account whose ONLY subscription is `incomplete` renders no cancel control, and
that is the ruling rather than a gap. It gets the existing approved line:

> This one can't be changed from here. Email support@trackdco.app and we'll sort it out.

**No new copy, and no cancel control.** The existing cancel dialog would be false
for them — it promises full access "until [date]" to somebody who has no access
and no paid period — and inventing a fourth variant for a state that clears itself
is a string to maintain forever for a cohort that exists for under a day.

**The window is measured, not assumed.** A `default_incomplete` subscription is
alive at +22h and `incomplete_expired` with a void invoice at +23h, driven on a
test clock (`scratchpad/harness/clockwindow.scenario.ts`). Nobody in this state has
been told they will not be charged, which is what separates it from D76's cohort.

**⚠️ This does NOT make D76's void optional.** D76 is not a mitigation for the
window's length. Somebody who presses Cancel has been told in writing that they
will not be charged, and their invoice stays payable for the rest of that day —
long enough to finish a 3D Secure challenge in a stale tab. D76 makes that sentence
true at the moment it is said. A shorter window is not a mitigation for a promise
that is false while it lasts.

### D84 — Manage's summary is one sentence

`08`'s brief asks Manage to open with "a one-sentence plain-English summary of what
they are on". **The signed sentence is that summary.** No second "what you're on"
line ships alongside it.

This closes the open item that asked whether a further line was also intended. It
was not.


---

## D85 — the re-land is revert THEN merge

**⚠️ ISSUED AS D84 AND RECORDED AS D85. The number in the instruction was already
taken**, by D84 (Manage's summary), assigned the previous day. The instruction said
"take D84 from 00's next-free list", and the next-free list said D85 — so the intent
(take the next free number) is followed and the literal number is not. **This is the
sixth-plus instance of the collision this ledger exists to prevent**, and it happened
because the issuer's view of the list was a day old. Renumbering is a one-line change
if the other order is preferred; nothing outside this ledger cites either number yet.

### The decision

`12` §3.2 is right that **a merge alone brings nothing back**: the billing commits are
ancestors of `main` with their changes undone, so git considers them already merged.
It draws the wrong conclusion from it — that the revert is therefore the whole
re-landing.

**The revert restores the tree as of the ORIGINAL merge and nothing after it.** Every
commit made on `wave3/billing-cancel` since 13 August is new to `main`, and only a
merge brings those. Reverting the revert is what makes that subsequent merge *work*;
it is not a substitute for it.

Followed literally, the launch would have shipped the code as it stood on 13 August:
no invoice void (D76), no `FLAG_CANCELLABLE_STATUSES`, no `billing_reason` guard, no
`listAllSubscriptions`, no reminder flag, no courtesy reminder variant, and no `003`
file — **all four Group 1 CRITICALs among them** — while §5's checklist item
"Re-landed by `git revert c547dba`, never by a merge" was ticked as it happened.

### Tested, in a detached worktree outside the repository

Against `origin/main` (`b925568`), which is the real launch base — local `main` was
ten commits behind and pointed at a merge into `admin/dashboard`, which is what P0 now
exists to catch.

    git revert c547dba              0 conflicts, 102 files
    git merge wave3/billing-cancel  0 conflicts

All seven P3a checks pass, and **every billing and notification file in the resulting
tree is byte-identical to the branch head**. The twenty files that differ are the
admin/arcade work that lives on `origin/main` and not on the branch, which is exactly
what a merge should preserve.

**⚠️ This proves the SHAPE, not the final state.** It was run against today's branch
head and must be re-run at code-complete against the real head. That goes on the
Tuesday-night gate.

`main` was never touched: detached HEAD, no branch, no push, worktree removed.


---

## D86 to D90 — five decisions that existed in code and not here

**Entered 18 Aug 2026.** All five were minted in conversation and built; none had
reached this file. **Numbers taken from the next-free list in the file itself**, in
the order the founder listed them, per the standing rule that nobody names a number
from memory. Nothing was renumbered.

### D86 — the 86 graces are re-dated on launch morning

`supabase/billing/004_regrace_launch_date.sql`. **Written, unapplied, SINGLE-USE, and
it belongs to launch morning.** The grace window is anchored to the switch-on (D8),
so the 86 rows written before the launch date was fixed carry the wrong end. It is
not to be applied, re-run or reversed at any other time.

### D87 — reconciliation alerts fire on every failing run

Not edge-triggered. **Edge-triggering tells you once and then goes quiet while the
problem persists**, which reads identically to the problem having been fixed. A
condition that is still true is still worth saying.

### D88 — D72's tolerance is derived, not chosen

The largest extension any BUILT mechanism can produce, read off the code rather than
picked as a round number. A tolerance chosen by hand is a number nobody can defend
when it fires, and one that drifts silently the moment a mechanism changes.

### D89 — the QA drivers are tracked

The harness spine now; the `.mjs` browser drivers at the freeze. **Secret-scanned,
and stripped of anything that patches a list or calls a billing-writing route.** The
reason is reproducibility: a baseline that cannot be re-run from a clone is a claim,
not evidence.

### D90 — the beta notice's seen cookie is account-scoped

Per-browser was not enough. On a shared browser one person's dismissal consumed
another person's notice, and the notice shows ONCE — so the second person would never
see it at all, on the one screen explaining what happens to their access.


---

## D91 to D100 — the dispute path, the access question, and the past-due window

**Taken 18 Aug 2026 by the build lane, from this file's own next-free list, in the
order the founder listed them.** The batch brief deliberately named no numbers, "because
every collision on this project came from an issuer minting from a stale view of the
list". Nothing was renumbered.

### D91 — a dispute cancels the Stripe subscription

Until now a dispute took access away and left Stripe billing. Two costs, and the
second is the expensive one: **we go on charging somebody whose money we no longer
have**, and the next invoice they dispute stacks another **dispute fee** — a fee we
pay per dispute, on a charge we were never going to keep.

**Access first, billing second.** The cancel runs after the entitlement write, so a
failure there leaves the revocation landed and Stripe redelivers; the revoke is
idempotent, so the retry is free.

**Only the subscription the disputed charge paid for**, resolved through
`subscriptionBehind`. A customer can hold two, and cancelling a healthy second one
would be the same shape as the `$3.99 refund destroys a $69.99 year` defect. Where it
cannot be resolved, nothing is cancelled — and D99's new rule reports exactly that
shape, which is what makes the conservative choice safe rather than silent.

**Refunds are excluded.** The ruling names disputes. A refund is a hand-issued support
action, often goodwill, with no fee stacking behind it.

### D92 — a disputed customer may resubscribe freely

No approval flow, no email gate. **A dispute is often a stolen card, a forgotten
charge, or a bank acting automatically** — the person is frequently not hostile, and a
second dispute is a dashboard problem rather than a feature. D93's sentence routes
them to the plan list rather than to a gate.

### D93 — the dispute-cancellation sentence

> Your subscription was cancelled because a payment was disputed with your bank.
> Email support@trackdco.app if that wasn't you, or choose a plan below whenever
> you're ready.

**Its own state, not a variant of the suspended line**, because the two say opposite
things about the money — one says the plan is still active, the other says it was
cancelled — and one sentence with a conditional clause would be false half the time.
It names no price and no date deliberately: the subscription is gone, so no amount is
still true and nothing happens on any day. Pinned as codepoints; the set is fourteen.

### D94 — `suspended` keys on the revocation flag

**The branch could not fire at all.** It keyed on `accessEndsEarly`, whose date half
asks whether the entitlement's date and the mirror's disagree — and they never
disagree on a revocation. `sync.ts:339` and `sync.ts:399` both write from the same
`entitledUntil(sub)` call on the same object, and the revoke touches neither. Found by
**three independent reviewers**: one by reading, one by measuring, one by driving with
a control.

Now `accessRevoked && !accessLive && actionKind === "cancel"`, each condition
load-bearing and each with its own control. The branch has not moved.

### D95 — a dropped chargeback is retried

`sync.ts` throws on an unreadable Stripe charge so Stripe retries, then six lines later
dropped the error on the `billing_customers` read and returned `unattributed` — which
Stripe answers with a 200 and never redelivers. **A revocation we failed to apply was
silently stamped as processed**, against the file's own stated principle.

**"Unmapped" and "unreadable" stay different facts**, and only one is helped by a
retry: a genuinely unmapped customer will never grow an account row, so it stays
`unattributed`. Collapsing them the other way would be the mirror-image defect.

### D96 — the past-due grace stays at three days

Matching Stripe's retry window would hand out **roughly two weeks of free access per
failed payment**. It stays at three, and D97's sentences cover the window after the
lapse instead.

### D97 and D98 — see Group 3

Both signed; both land in the past-due and read-only work.

**⚠️ D98's first clause was re-signed after this batch began.** The first wording,
"Your access has ended", is FALSE for the never-had-access cohort — anyone signing up
after the 17 Aug backfill holds no entitlement row, and at P13 that is exactly who
reads it. The replacement is a statement about NOW rather than about history:

> You don't have access at the moment, so Trackd Co is read only. You can still view
> everything you've logged, you just can't add to it.

True of all six cohorts. **It stays unbranched**, and the standing stop-and-ask
instruction in `ReadOnlyGate.tsx` fired and this is its answer.

### D99 — the revocation exemption narrows, and revoked-beside-live is reported

Wrong twice, and the two are one predicate.

**Wrong premise.** §3.4 said "Stripe leaves the subscription overdue". Measured
directly on the Stripe object after a real revoke: **Stripe leaves it ACTIVE.** Overdue
implies dunning has begun and the money has stopped; active means the next invoice is
raised on schedule. **The spec sentence is corrected**, not only the code, because it
is a premise the next reader would re-derive from.

**Wrong scope.** `entitlementsByUser` is unfiltered by product AND source, so the
exemption meant "this user has ever had anything revoked". **One withdrawn comp
permanently silenced the rule** whose own docstring calls its subject "the worst
customer-facing state in the system that is not a wrong charge". Driven with two
accounts one row apart: control reported, subject silent.

**And the other side of the same predicate.** Once a dispute cancels, a revoked
`pro`/`stripe` row beside a live subscription stops being expected and becomes the
signal the cancel failed. That is a **new named rule**, not a re-widening of rule 6 —
widening that back would reintroduce the false positive §3.4 correctly closed, and
§3.4 warns one false positive per dispute gets the whole report ignored.

### D100 — the three parked `revokeForCustomer` findings, accepted under §9g

**P1** refunding an earlier period revokes the current paid one. **P2** two
subscriptions both refunded in full leave access on. **P3** a redelivered
`invoice.paid` reinstates on money that went back. All present at HEAD, unchanged.

**Root cause, one line:** `otherLiveEntitlementFloor` answers *"is another subscription
LIVE"* where the revoke needs *"is money we STILL HOLD paying for this access"*. Fixing
it properly needs per-period accounting across charges and invoices — a different
model, not a patch.

**⚠️ THEIR CONTAINMENT ARGUMENT HAS CHANGED.** It was "it gates nothing while
`BILLING_GATE_ENABLED` is unset", written 16 Aug. **`08` then made the revoked row
drive copy on two screens regardless of the flag**, so that argument is dead. The
current reason:

- refunds are **hand-issued by the founder**, one at a time;
- the user base is **~90**;
- and **P1 and P2 are caught while P3 is not**, with P3 pinned as an empty result so
  the gap cannot close, or reopen, unrecorded.

**⚠️ The reason above is the CORRECTED one.** The brief's version said D99's fix takes
all three from silent to caught, and a §9g acceptance resting on a reason that turns
out to be optimistic is worse than no acceptance at all. It takes ONE.

**⚠️ Measured rather than claimed, and the brief was optimistic.** It said D99's fix
takes all three from silent to caught. It takes ONE:

| | caught by | |
|---|---|---|
| P1 | `revoked-entitlement-beside-live-subscription` | **newly**, by D99 |
| P2 | `two-billable-subscriptions` | already, by an older rule |
| P3 | *nothing* | **STILL SILENT** |

P3 leaves an active entitlement beside a live subscription, and the only thing wrong is
that the money went back — which no rule can see without the per-period accounting the
model fix would bring. `parkedFindings.test.ts` pins all three, including P3's empty
result, so the gap cannot close unrecorded.

**What would change the acceptance:** **volume**, or **refunds becoming self-serve**.
Either makes the frequency argument false and the model fix becomes the answer.

---

## Q106 — does the dispute copy apply to a REFUND-revoked account? **ANSWERED by D101**

**Raised 18 Aug 2026 by the build lane while implementing D93. Not a defect — a
question the specs do not answer, and it predates this batch.**

`entitlements` records **that** a row was revoked and never **why**. A full refund and
a dispute leave byte-identical rows: `is_active: false`, `active_until` untouched,
`source: "stripe"`. So both dispute sentences are selected for a refunded account too:

- refund + subscription still live → *"your access has been suspended while we look
  into a payment dispute"* — and no dispute happened;
- refund + subscription later ends → *"your subscription was cancelled because a
  payment was disputed with your bank"* — same problem.

**This is not new.** The suspended sentence has had it since it was signed on 18 Aug;
D93 inherits it rather than introducing it. It is recorded here because implementing
the second sentence made it visible in a way one sentence did not.

**Why it was not fixed in the batch:** distinguishing them needs a reason on the
revocation — a column, or a lookup back to the charge — which is a schema or model
decision, not an implementation, two days from go-live. **Nothing was invented**, per
the standing rule against copy for a state no spec names.

**Frequency argument, same as D100's:** refunds are hand-issued, the base is ~90, and
the founder knows who they refunded. **What would change it:** refunds becoming
self-serve, or volume.

**The cheapest fix if it is wanted:** a `revoked_reason` column written by
`revokeForCustomer`, which already knows — it takes `reason: "dispute" | "refund"` as
a parameter and simply does not persist it.

---

## D102 — `soonerOf` is NOT normalised. POST-LAUNCH, and a decision rather than an oversight

**Founder ruling, 20 Aug 2026.** Confirmed rather than reconsidered, after a cold
review raised it and recommended against taking it.

**The hazard.** `accessEndsEarly` (`manage.ts`) compares the entitlement's end date
with the mirror's. Those two arrive in different serialisations by construction —
PostgREST returns microseconds and `+00:00`, `deriveEntitlementFacts` round-trips to
milliseconds and `Z` — so **the same instant is a different string for essentially
every account**. 6.1 moved the comparison onto instants via `endsBefore`.

**Why a tidy-up is the thing to fear.** Before 6.1 the comparison was `endsOn !==
mirrorEnd`, and it was correct BY ACCIDENT: `soonerOf` returns one of its inputs
VERBATIM and tie-breaks to the FIRST, so the string compare was an identity test over a
decision already made on instants. Normalise `soonerOf`'s return — an obvious tidy-up —
and **every paying customer whose mirror carries microseconds reads "Ends on"** where a
renewal genuinely happens. That is the exact false claim `renewsOnPeriodEnd` exists to
remove.

**The proposal, and why it is NOT taken.** Making `soonerOf` return a normalised ISO
string would make the identity comparison *impossible* rather than discouraged.

> **⚠️ MEASURED, BOTH DIRECTIONS (6.1, 20 Aug 2026).** With `soonerOf` normalised:
> line 522 on STRINGS → **3 failures**, including "same instant, same string".
> Line 522 on INSTANTS → **82/82, unaffected.** So the change is safe and would
> convert a comment into an enforced property.

**Ruled against, for three reasons, in the round declared last:**

1. **The revert it would prevent is already caught.** `signedCopyPin.test.ts`'s
   period-end verb block asserts, comment-stripped, that `endsBefore(endsOn, mirrorEnd)`
   is present and `endsOn !== mirrorEnd` is not. Measured 20 Aug: mutation N3 reverts
   line 522 and the suite goes **red**, where before that pin it stayed **1573/1573
   green**.
2. **It is a behaviour change on a money-adjacent path** in a round whose own rule was
   that anything found is accepted or delayed, not patched.
3. **Neither a normalisation nor a test is permanent against a determined edit**, so the
   argument for it is weaker than it first looks.

**Post-launch, reconsider on its merits.** `soonerOf` has exactly ONE caller and line
522 was the ONLY identity-dependence on its return anywhere in the codebase — checked,
not assumed — so the change stays cheap. Nothing is blocked by it.

---

## D101 — the revocation reason is persisted, and an unknown reason WITHHOLDS

**Founder ruling, 18 Aug 2026, answering Q106.** Store it.

`supabase/billing/005_revoked_reason.sql` adds `entitlements.revoked_reason`, checked
to `'dispute' | 'refund' | null`.

**✅ APPLIED 18 Aug 2026 by the founder, by hand.** VERIFIED against the live schema,
both halves of the file's own VERIFY block: `information_schema.columns` returns one
row (`text`, nullable YES), and `pg_constraint` returns
`CHECK (revoked_reason IS NULL OR revoked_reason = ANY (ARRAY['dispute','refund']))`.

**⚠️ IT BECAME A LAUNCH ITEM BEFORE IT WAS APPLIED, and the reason is worth keeping.**
While it was unapplied every revoked row read `unknown`, so both dispute sentences were
withheld from everybody — **D93's signed sentence rendered to nobody**. A sentence that
is codepoint-pinned but has never appeared on a screen is not a shipped sentence, and
it would have gone to launch that way.

**⚠️ It is NOT 004.** `004` is date-dependent, single-use and launch-morning-only;
`005` has no date dependency, no coupling to launch, and is idempotent. **Apply it
whenever ready.** The two files are adjacent and the header says so, because confusing
them is the only real risk in having both.

**Correct in the unapplied window, which is the window we are in.**

- The WRITE retries without the column on `PGRST204`/`42703`. A revocation must never
  fail because of a display column — that would be a chargeback we did not apply.
- The READ is its own tolerant query. Folding it into the access read would mean an
  unapplied migration takes the whole thing down and nobody has access.

**⚠️ UNKNOWN IS NOT DISPUTE, and here the wrong default IS the lie.** Standing rule 0
in its sharpest form on this project: defaulting to `"dispute"` would tell somebody the
founder refunded as a goodwill gesture that **their bank disputed a payment**. So both
dispute sentences render **only** for `reason === "dispute"`; a refund and an unknown
both **WITHHOLD** — a withhold, never a reworded neighbour, and no new copy.

**⚠️ THE COST IS LIVE UNTIL 005 IS APPLIED, and it is worth stating plainly.** Every
revoked row today is `unknown`, so **a genuinely disputed customer currently sees no
explanation on Manage at all.** That is the accepted trade — it tells nobody anything
false — but it means D93's sentence does not reach anybody until the migration runs.
**Applying `005` before launch is the cheap way to close it**, and nothing else depends
on the timing.

**Driven both ways against real Stripe, in BOTH windows**, and every result line names
which window it ran in — a bare pass means two different things either side of the
migration, and a later reader cannot otherwise tell which they are reading.

`[005 UNAPPLIED]` — the write retried without the column, the revocation still landed,
the subscription was still cancelled on a dispute and left alone on a refund, and both
sentences were withheld.

`[005 APPLIED]` — the reason is genuinely PERSISTED (`dispute` and `refund`
respectively, asserted exactly rather than tolerated), and on the real Manage screen:

| cohort | row | renders |
|---|---|---|
| revoked, subscription live | `dispute` | the suspended sentence, character for character |
| revoked, subscription cancelled | `dispute` | the settled sentence, character for character |
| revoked by a REFUND | `refund` | **nothing** — no dispute sentence, no renewal claim |

The refund cohort is the control Q106 exists for: its row is byte-identical to the
dispute cohort's in every column but this one, so if the sentences still selected for
it the fix would have done nothing. 13/13.
