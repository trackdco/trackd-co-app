# FINDING — the cross-subscription clawback REPRODUCES (Group G)

**Status: REPRODUCED, NOT FIXED.** The brief's instruction for this item is "if it
reproduces it is a finding and you stop and report", and that is what happened.

**Driver:** `scratchpad/final/drive-G-crosssub.mjs`. 13 passed, 1 failed — the one
failure IS the finding.

## What the lifetime clock run saw, once

> a resubscribed customer's entitlement clawed back 371 days, from 2027-09-02 to
> 2026-08-27 — the OLD, cancelled subscription's unpaid period plus three days.

The account was torn down before it could be reproduced.

## What reproduces, deliberately, on real Stripe

    before  2026-07-06T04:02:29Z     (bought and paid for on subscription B)
    after   2026-07-01T04:02:29Z     (subscription A's unpaid period + 3 days)
    ------
    5.00 days of access taken off a customer by a subscription that is CANCELLED.

The shape, built from real Stripe objects with no seeded rows:

| | |
|---|---|
| sub A | weekly from t0, card dies at t0+7d → `past_due`, open invoice, then **cancelled** |
| sub B | weekly from t0+5d, paid, card dies at t0+12d → `past_due`; its own grace lengthens the shared entitlement to t0+15d |
| trigger | A's `invoice.payment_failed`, delivered again under a **fresh event id** |

A fresh id is not a contrivance: it is what a Stripe automatic retry, a dashboard
resend and this route's own stale-claim recovery all deliver.

## The mechanism, confirmed rather than guessed

`otherLiveEntitlementFloor` skips any subscription whose status is not in
`ENTITLING`, and **`ENTITLING` is `{trialing, active}`**. A `past_due` sibling
therefore raises **no floor at all**. Measured directly at leg 6 of the drive:

    sub B  past_due  entitles_to=2026-07-10   <- raises no floor
    sub A  canceled  entitles_to=2026-07-05
    0 sibling(s) counted as entitling

So the guard that exists specifically to stop one subscription clawing back
another's paid access is switched off exactly when the surviving subscription is
itself in trouble — which is the state a customer with two failing subscriptions is
in by definition.

## ⚠️ A.1 DID NOT CAUSE THIS, AND DID NOT WIDEN IT

The measured inputs run through **both** formulas give the identical answer:

    OLD  max(min(current, graceEnds), floor)  -> 2026-07-01, written
    NEW  pastDueGraceEnd(...)                 -> 2026-07-01, written
    SAME ANSWER: true

The clawback direction is the one that already existed, the floor is untouched by
this round, and the early return A.1 removed never applied here (the target was
already shorter than what was stored). This is a pre-existing defect that the
lifetime run glimpsed and this drive has now pinned down.

## What a fix would have to decide, and why it is NOT taken here

Widening `ENTITLING` to include `past_due` for the FLOOR only is the obvious move,
and it is a real decision rather than a typo:

- **For:** a past-due subscription has genuinely paid for the period it is in. Its
  own `markPastDue` has already set the shared row to its paid-through + 3 days,
  so counting it as a floor protects exactly what was paid for.
- **Against:** `ENTITLING` is also what decides whether a status EXTENDS the
  entitlement, and `past_due` is deliberately excluded there — that exclusion is
  what stopped "a free month per failed payment". Any change must reach the floor
  and **not** the extender, or it reopens the measured +58-day family.
- There is a second question underneath: should a **cancelled** subscription's
  failed invoice be able to move the shared row at all? Arguably it should return
  early, the way `markPastDue` already returns early for a first invoice.

Both are founder calls and neither is a one-line change. Recorded, not taken.
