# Handover — billing launch fix batch

**Branch** `wave3/billing-cancel`. **Freeze head** `a929d98`, unfrozen by this batch.
**Current head** — see `git log -1`; updated at every commit below.

## ⚠️ ROUND 9 — THE LAST ROUND. Groups A to G. COMPLETE.

Opened deliberately and once, because these were not fixes generating defects: a
specified feature that was never implemented (the three-day grace, measured at
**0.00 days**), a finding recorded and left out of the batch (the courtesy promise),
and four items the lifetime clock run could not close.

| commit | item |
|---|---|
| `cac60f9` | **A.1** the grace is written outright, in both directions |
| `e4fe861` | **B.1** a card update retries the open invoice |
| `2e3a790` | **C.1** the courtesy promise is withdrawn when it ends |
| `44d7f12` | **D.1** the declined-payment dashboard banner |
| `b86ca3b` | **F.1** the dismiss label follows the cohort; the offer copy names a window |
| `57a1849` | **E.1** the save offer survives an interrupted session |
| `637bdce` | **G.1** the cross-subscription clawback REPRODUCES — recorded, NOT fixed |

**Tests 1595 -> 1693** (+98). tsc, ESLint, gate audit 32/2/69 all unmoved.

### ⚠️ THE ONE THING THAT NEEDS A RULING BEFORE LAUNCH

**Group G reproduces.** `scratchpad/final/FINDING-G.md` has the full write-up. A
CANCELLED subscription's `invoice.payment_failed`, redelivered under a fresh event
id, clawed **5.00 days** of access off a customer — access bought and paid for on a
DIFFERENT, still-live subscription. Measured, not inferred.

The mechanism is `otherLiveEntitlementFloor` skipping anything not in `ENTITLING`,
and `ENTITLING` is `{trialing, active}` — so a `past_due` sibling raises **no floor
at all**, exactly when the surviving subscription is itself in trouble.

**A.1 did not cause it.** The measured inputs run through the OLD formula and
through `pastDueGraceEnd` give the identical answer. Pre-existing, and the lifetime
run glimpsed it once.

Not fixed here, per the brief's stop rule, and it is not a one-liner: any fix has to
reach the FLOOR without reaching the EXTENDER (`past_due` is excluded from
`ENTITLING` deliberately, and that exclusion is what stopped the measured +58 unpaid
days), and there is a second question underneath about whether a cancelled
subscription's failed invoice should move the shared row at all.

### What was DRIVEN, and with what control

| drive | result | the control that could have failed |
|---|---|---|
| `final/drive-A-grace.mjs` | **19/19** | the roll-forward extended the row 7.00d into the unpaid period FIRST, so the clawback direction is proven on the same account |
| `final/drive-B-card.mjs` | **28/28** | a card update on a healthy account writes nothing: no charge, no marker, the subscription's default card untouched |
| `final/drive-C-courtesy.mjs` | **30/30** | the finished-courtesy account still shows `Renews on`, so the card is not simply empty; and D36's word appears nowhere |
| `final/drive-D-banner.mjs` | **16/16** | a healthy subscriber gets NO banner; the gate proven ON from `NO_ACCESS_LABEL` before any "absent" assertion |
| `final/drive-EF-offer.mjs` | **39/39** | the week form absent from the month page and the month form absent from the week page |
| `final/drive-G-crosssub.mjs` | 13/14 | the 1 red IS the finding |

### ⚠️ FOUR INSTRUMENT CORRECTIONS THIS ROUND PAID FOR

Each one made an assertion read the wrong thing while the product was correct.

1. **`deliver` fell back to the event's REAL id.** Every "same payload again"
   assertion was vacuous — the route answered `{"duplicate":true}` with a **200**
   and the handler never ran. Found because Group G's entitlement did not move when
   the code says it should have. **A 200 is not proof a handler ran; check the body.**
2. **`attempt_count` cannot see an explicit `invoices.pay`.** Stripe counts
   AUTOMATIC collection attempts only. It read `1 -> 1` across a retry that moved an
   invoice `open -> paid` and created a fourth charge. ⚠️ **The lifetime run's own
   "attempt_count 1 -> 1" finding used this same field and would have read 1 -> 1 on
   a SUCCESSFUL retry too.** Count charges and read the invoice status instead.
3. **`eventsFor` bounded by the SIMULATED `t0`.** `event.created` is wall clock, so
   a clock frozen 40 days back made one sweep page forty days of the whole account's
   event stream: **3m39s**.
4. **Sleeping instead of waiting for the artefact.** 4s after "Yes, cancel" read the
   dialog while it still said "Working…" — six assertions red against a correct
   screen, and a LATER line of the same output showed it rendered perfectly.

### Three Stripe facts worth keeping

- **A subscription's renewal cycle and its charge attempt are not the same moment.**
  At `t0 + 7d + 1min` the invoice is `draft` with `attempt_count: 0` and the
  subscription still `active`. Stripe finalizes about an hour later. A driver that
  stops at the period boundary reports "no failure" while everything works.
- **`pm_card_visa` is not a PaymentMethod id.** `customers.create` accepts it and
  mints a real `pm_...`; `subscriptions.create` refuses it with `resource_missing`.
- **A yearly save-offer grant raises a SECOND invoice** — `subscription_update`,
  `total=0`, `due=0`, `paid=0`. No money moves. The brief asked for "the invoice
  count is unchanged"; the count is the wrong instrument and the total is the right
  one.

### The three items the lifetime run could not close

- **A mid-period yearly ACCEPT flips `active` to `trialing`** — measured:
  `trial_end` a year and a month out, `trackd_courtesy_until` written,
  `cancel_at_period_end` lifted, **and no charge**. Group A is width-independent by
  construction: `markPastDue` reads the failing INVOICE LINE, never the
  subscription's period, so a courtesy of any width never enters its arithmetic.
- **"No charge at accept" for a paid subscriber** — now measured on a YEARLY that is
  genuinely `active`. Nothing charged, nothing owed.
- **The mirror's stale `trial_ends_at`** — **five readers, every one of them guarded
  on `status === "trialing"`**: `/billing`'s row (via `isGenuineTrial`),
  `manageActionFor`'s `isTrial`, `lib/db/admin/billing.ts`'s ending-soon tile, the
  reminder runner's query, and the dashboard's query. Inert everywhere, not just on
  the screen that noticed it.

### Decision numbers taken — D102 to D109, and Q107

From `billing-00-decision-ledger.md`'s own next-free list, in the brief's order.
Nothing renumbered. **Next free is now D110 / Q108.**

| # | subject | owner |
|---|---|---|
| D102 | `soonerOf` NOT normalised; pinned at the source (taken last round, now recorded) | 08 |
| D103 | The past-due grace is WRITTEN OUTRIGHT, in both directions | 05, seam to 08 |
| D104 | A card update RETRIES an open invoice, from an event | 03, seam to 12 |
| D105 | The courtesy date test at the DISPLAY readers only; the marker is never cleared | 08, seam to 11 |
| D106 | The declined-payment dashboard banner, and NOT a pop-up | 05, seam to 07 |
| D107 | The dismiss label AND title follow the cohort — **supersedes 03 §3.9** | 03 |
| D108 | The offer's gift block and granted screen name a WINDOW | 04 |
| D109 | The save offer is restored to a session that ended at the dialog | 04 |
| **Q107** | **Should the floor count a `past_due` sibling? OPEN — Group G** | 05, seam to 11 |

⚠️ **D107 IS THE ONE TO ROUTE TO THE SPEC CHAT.** It resolves the `03` §3.9 versus
D36 conflict that was routed and left open: §3.9 pinned "Keep my trial" unqualified
for every cohort, D36 forbids "trial" rendering for anyone not on one. The ruling is
that the label follows the cohort, and the TITLE moves with it so one dialog does
not use two words for one thing. The half of §3.9 that survives intact is the
important half: this is still not `resumeLabel` (D22's "Keep my Pro plan"), and the
trigger row's `Cancel my {noun}` is untouched.

---

## ⚠️ DECISION NUMBERS TAKEN — D91 to D100, and Q106

Taken 18 Aug 2026 from the ledger's own next-free list, in the brief's order.
**Next free is now D101 / Q107.** Nothing renumbered.

| # | subject | owner |
|---|---|---|
| D91 | A dispute CANCELS the Stripe subscription | 03, seam to 11 |
| D92 | A disputed customer may resubscribe freely | 03 |
| D93 | The dispute-cancellation sentence, signed | 08 |
| D94 | `suspended` keys on the revocation flag | 08 |
| D95 | A dropped chargeback is retried | 03, seam to 11 |
| D96 | The past-due grace stays at three days | 05 |
| D97 | The two after-the-lapse past-due sentences | 08 — **Group 3** |
| D98 | The read-only pop-up reworded, STAYS UNBRANCHED | 05 — **Group 3** |
| D99 | The revocation exemption narrows; revoked-beside-live reported | 11 |
| D100 | The three parked findings accepted under §9g | 11 |

| D101 | Revocation reason persisted; unknown WITHHOLDS | 03, seam to 08 |

**Next free: D103 / Q107.** **Q106 ANSWERED by D101.** **D102 taken 20 Aug — `soonerOf` NOT normalised, post-launch.**

**Q106 was** — does the dispute copy apply to a REFUND-revoked account? `entitlements` records THAT a row was revoked and never WHY, so a refund and a
dispute leave byte-identical rows. Predates this batch; D93 inherits it. Cheapest fix
noted in the ledger: `revokeForCustomer` already takes `reason` and does not persist it.

## Groups done

- **Group 0 — COMPLETE. Reported, awaiting acknowledgment.**
  - `55c35a1` 0.1 — revoked cohort reseeded to the writers' expression; unit test split
    into a copy pin and a derived reachability test.
  - `e24d058` 0.2 — leak detector: every number in the verdict, exit 0/1/2, both Stripe
    reads paged, nothing classified away.
  - `50d47df` 0.3 — `Ledger.teardown` fails loudly and keeps what it could not delete.
- **Group 1 — COMPLETE.** `688af98` 1.1 widen once (EntitlementRead's shape) ·
  `7d05e1f` 1.2 comp guard refuses on unreadable · `74daafc` 1.3 predicate split ·
  `979e38d` 1.4 suspended keys on the revocation flag · `0db6d9b` 1.5 screens carry
  accessLive · `994b357` 1.6 subscriptions read says whether it worked ·
  `cd6d2b2` 1.7 dashboard banner + the false comment.
- **Group 2 — COMPLETE.** `139d5e9` 2.2 · `a23aeb4` 2.1 (driven against real Stripe) ·
  `6499513` 2.3 · `64bd672` 2.4 · `418b33e` 2.5 + the ledger.
- **Group 3 — COMPLETE.** `6f4f0f4` 3.1 · `f272e8d` 3.2 · `6c8b0d9` 3.3 ·
  `5d118d7` the new-sign-up drive. Plus `a53c0d9` D101/Q106 (migration 005).
- **Group 4 — COMPLETE.** `59b34ee` 4.1 (+ a 2nd stale copy in beta-grace/route.ts) ·
  `420bf5e` 4.2 · `a994c02` 4.3 · `29a80c0` tracked dev launchers.
- **Group 5 — COMPLETE.** `b8a4bc6` 5.1 · `76d68ef` 5.2-5.4 · `ffd4362` baseline 92 ·
  `b7daa74` 5.5-5.9 + the P13 launch note.
- **Group 7 — COMPLETE. The LAST round of fixes.** `fb25c89` 7.1 · `67904d5` 7.2.
  Opened by a cold re-verify (COLDCHAT-REVERIFY) which drove the two paths this batch
  had stated it could NOT drive — both held — and found two defects the batch's own
  count of one had missed. The stop rule fired at two and was overridden ONCE,
  deliberately, because both causes were named.
- **ALL GROUPS DONE.**

## ⚠️ GROUP 7 — WHAT THE RE-VERIFY FOUND, AND THE ONE INSTRUCTION I REFUSED

**7.1 — the reconcile report called a hand-issued refund a failed dispute cancel.**
Generated by 2.1 + 2.3 + D101 landing together: the rule asserts a premise the reason
column added in the same batch disproves. Re-worded, not silenced.

> ⚠️ **THE BRIEF SAID TO SILENCE THE REFUND COHORT. I REFUSED AND THE FOUNDER
> CONFIRMED THE REFUSAL.** That gate makes parked finding **P1** silent — P1 IS a
> refund, and `parkedFindings.test.ts` records this rule as the only net that catches
> it. Measured (mutation N6): the gate turns that test red. **Silencing the refund
> cohort is the same decision as closing P1, and it should be taken once rather than
> twice.**

**7.2 — two signed strings had no committed pin.** The read-only pop-up's first clause
(reworded twice, wrong once) and `/billing`'s "Renews on" / "Ends on" verb. Both
reverted cleanly to a wrong version with **1573/1573 green**. Both moved into `lib/`
and pinned; `05` §3.6 was also stale and is corrected.

## ⚠️ TWO PROCESS RULES, PAID FOR IN THIS ROUND

**1. `git checkout -- .` ON A DIRTY TREE EATS EVERY UNCOMMITTED EDIT.**

A mutation harness used it to restore after each mutation. That was safe in the first
pass, when the tree was clean, and destroyed the whole fix set in the second, when it
was not. Untracked files SURVIVE, which is worse than a clean wipe: one mutation stayed
live in a new file and the next two mutations silently measured the wrong tree.

  · **COMMIT BEFORE MUTATING, or mutate in a `git worktree`.**
  · Restore from a per-file `cp` backup, never from `git checkout -- .`.
  · A mutation harness that restores with a repo-wide command is a harness that can
    only be run once safely, and nothing tells you which run that was.

**⚠️ AND THE RECOVERY IS THE STANDING ONE, not a one-off.** Replay from scripts, then
**re-verify the FINAL state from scratch** — gates, every mutation re-run, the real
drivers re-driven, and a **byte-diff against an INDEPENDENT record** (`qa-05-readonly`'s
APPROVED map, written by an earlier round and untouched by the fix). A replayed tree
that has only been checked against its own scripts is a claim; the independent diff is
what makes it evidence.

`git worktree add --detach <dir> <sha>` + a `node_modules` symlink also verifies a
commit IN ISOLATION without touching the working tree. Used on `fb25c89`: 1578/1578.

**2. A TOLERANT COLUMN GETS ITS OWN QUERY — TRACE THE CONSEQUENCE TO ITS END.**

`fetchRevokedReasons` is separate from the entitlements select, and the reasoning is
the rule rather than the instance:

> Folded in, one unapplied migration makes PostgREST reject the WHOLE request.
> `fetchEntitlements` returns `[]`. **Every live subscriber then reads
> entitlement-less, and `live-subscription-without-entitlement` fires on ALL of
> them** — because **incompleteness does NOT suppress findings** (`report.ts`: the
> status is incomplete even when there are findings). One migration gap becomes a
> report full of invented lockouts.

Same shape as `entitlements.ts` and `screenFacts`, and the cost is DIFFERENT at each
site — a blank screen there, a fabricated report here. **Ask what the empty result
DOES downstream, not just whether the read can fail.**

## ✅ 005 APPLIED 18 Aug — and the dispute sentences RENDER

Verified both halves of its VERIFY block. Every dispute driver now names its window:
`[005 APPLIED] 13/13` on screen, `[005 APPLIED] 5/5` in the harness with the reason
persisted exactly (`dispute` / `refund`), and a REFUND cohort rendering neither
sentence. D93's signed sentence has now been seen on a screen.

## (superseded) OWED BEFORE LAUNCH — APPLY MIGRATION 005

`supabase/billing/005_revoked_reason.sql` is WRITTEN and UNAPPLIED. It is **not**
launch-coupled the way 004 is — no date dependency, idempotent, apply whenever.

**Until it is applied, a genuinely disputed customer sees NO explanation on Manage.**
Every revoked row reads `unknown`, and unknown WITHHOLDS both dispute sentences by
ruling (telling a refunded customer their bank disputed a payment is the lie the
default would produce). Nothing false is said — but D93's sentence reaches nobody
until the migration runs. Applying it before launch closes that.

## ⚠️ D98's COPY WAS RE-SIGNED MID-BATCH — use the SECOND wording

"Your access has ended" is FALSE for the never-had-access cohort, and after the 17 Aug
backfill that is every new sign-up. Use:

> You don't have access at the moment, so Trackd Co is read only. You can still view
> everything you've logged, you just can't add to it.

Drive it against ALL SIX cohorts including a fresh account with no entitlement row.

## ✅ THE NEW-SIGN-UP PATH IS INTACT — driven 8/8, gate on

Pop-up with the D98 clause, `?step=plans`, and a genuine 7-day trial offered with no
refusal. Nothing purchased. `scratchpad/drive-newsignup.mjs`, tracked. P11 unchanged,
`12` untouched.

## ⚠️ THE 15 HARNESS FAILURES — CLASSIFIED, NOT FIXED

**All 15 are category 2: they need a flag. ZERO regressions.** Proven by running,
not by reading the headers.

| file | fails | category | proof |
|---|---|---|---|
| `notice.scenario.ts` | 9 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `banner.scenario.ts` | 3 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `readonly.scenario.ts` | 1 | needs `BILLING_GATE_ENABLED` (browser) | green with the gate on |
| `rule0.scenario.ts` | 2 | needs the flag IN-PROCESS | green with the flag |

banner + notice + readonly: **20/20** against a gate-on dev server, gate proven from
the named artefact first. rule0: **2/2** with `BILLING_GATE_ENABLED=true` on the vitest
command line — and its own first test IS the named-artefact control that the flag
reached the process.

Every failure is an ARRIVAL assertion failing safe ("the notice did not open",
"not exactly one banner"), never a vacuous pass. None is a genuine regression, and
none was touched.

## Baseline

| | at freeze | now |
|---|---|---|
| tsc + ESLint | clean | clean |
| gate audit | 32 / 2 / 69 | 32 / 2 / 69 (unmoved) |
| `npm run check` tests | 1523 | **1595** (+72, all new controls; 1573 at the re-verify freeze, +22 in Group 7) |
| `qa-05-readonly.mjs` | 23/23 | 23/23 |
| accounts | 90 / 0 / 90 / 0 / 0 | **92** / 0 / 90 / 0 / 0 — real Google sign-ups on 18 and 19 Aug. Baseline raised twice, nobody deleted. `entitlements` still 90, so neither holds a row. |
| migration 003 | applied | probed, one row, timestamptz, nullable |
| migration 005 | written, unapplied | **applied 18 Aug by the founder**; `revoked_reason` verified live, and Group 7 reads it in reconcile too |
| migration 004 | written, unapplied | **untouched — launch morning only** |
| flags | absent from `.env.local` | absent, unchanged |

## Things I decided myself

1. **The 12 live Stripe subscriptions are recorded, not deleted.** Widening the audit
   surfaced them. All test-mode on an `sk_test_` key, created 25 Jun to 7 Aug, none on
   `@trackd-qa.invalid`, five are Stripe sample data, none maps to a DB row. Recorded
   BY SUBSCRIPTION ID in `qa-audit.mjs` so a new one on the same customer still fires.
2. **`qa-audit-controls.mjs` is tracked**, with a `.gitignore` negation. A detector
   whose control is on one machine is the claim-not-evidence failure D89 exists for.
3. **The 0.1 row-selection assertion was replaced, not patched** — it is unanswerable
   once the two dates are equal, and that question is already asked in P1/P2.
4. **`manageSummary.test.ts` characterises the defect** rather than asserting the
   intent. 1.4 flipped it.
5. **1.1 widened at `EntitlementRead`'s shape**, not `compEntitlement`'s — it already
   exists, `proAccessState` already proves it on the same table, and
   `compEntitlement`'s union is comp-specific. The two collapsing readers were
   DELETED rather than left beside it.
6. **1.4 produced one new defect and it was caught by driving** — P2 (the
   `invoice.paid` lag) fell through to a renewal claim naming a PAST date. Resolved by
   returning to the founder's own recorded ruling for that cohort (withhold), which the
   driver already carried four lines above the assertion that had overwritten it.
   Nothing was invented. **That is one occurrence; the stop rule is two running.**
7. **1.5's declined card WITHHOLDS** rather than rewording. Group 3.1 signs the
   replacement.

## Corrections to the brief, both measured

- **Orphans cannot exist.** All three billing tables are `ON DELETE CASCADE` to
  `auth.users`. Driven both ways. The check stays; it has no live control and says so.
- **The harness does not exit 0 by default** (item 5.8's premise). It exits 1: 15
  failed / 7 passed across banner, notice, readonly, rule0. Confirmed pre-existing by
  running them with and without the 0.3 change.

## Open / needs a ruling

- Group 0 acknowledgment before Groups 1-5.
- `scratchpad/harness/{coldgate,moneygateon,moneyreconcile,moneyrevokedskip,
  moneysuspended}.scenario.ts` are still untracked cold-review reproductions.

## Running things

    ./scratchpad/dev-gate-on.sh     # export-and-exec; `npx` LOSES the flag
    ./scratchpad/dev-gate-off.sh    # the state the tree is left in
    node scratchpad/coldgate/gate-7-flag-absent.mjs   # reads the gate off a NAMED artefact

Drive on `http://localhost:3100`, never `127.0.0.1`. Count out of process after every
run including failed ones.
