# Q107 — THE NARROWING IS NOT SAFE. STOPPING, AS INSTRUCTED.

The founder's ruling was: **a dead subscription's failed invoice does not move the
shared entitlement row**, on the premise that *"cancellation already has its own
handler for shortening access"*. He attached a condition:

> ⚠️ CONFIRM THAT BEFORE YOU BUILD IT: is there any path where markPastDue is the
> ONLY thing shortening access after a cancellation? If so, say so and stop — that
> changes the answer.

**There is. It is measured, not reasoned.** Nothing was built.

## The measurement

`scratchpad/final/drive-Q107-order.mjs`, real Stripe, real test clock, one weekly
subscription. Every event is the app's own webhook receiving a real Stripe event.

```
leg 1  paid through           2026-07-18T04:50:41
leg 2  cycle rolls forward    active_until 2026-07-18 -> 2026-07-25   (+7.00d, UNPAID)
leg 3  renewal declines, the payment_failed event is HELD BACK
leg 4  subscription CANCELLED, customer.subscription.deleted delivered
       -> endSubscription runs and writes NOTHING
          active_until = 2026-07-25  (7.00 days past paid-through)
leg 5  the held payment_failed is delivered LAST
       -> markPastDue writes 2026-07-21  (3.00 days past paid-through)
```

**`endSubscription` left seven unpaid days standing. `markPastDue` was the only
thing that took them back.** Narrowed, the seven days stand.

## Why the premise fails — it is the arithmetic, not the existence of the handler

`endSubscription` is a **lengthening guard, not a clawback**:

```ts
const until = entitledUntil(sub);           // canceled -> items[0].current_period_end
const shortened = Math.max(Math.min(Date.parse(current), Date.parse(until)), floor ?? -Inf);
if (shortened >= Date.parse(current)) return "handled";   // <- fires
```

For a subscription cancelled during an unpaid period, `current_period_end` is the end
of the period nobody paid for. And `syncSubscription` has **already written exactly
that instant** into `active_until` when the cycle rolled forward while the
subscription was still `active` — `entitledUntil(sub)` reads the same field in both
handlers. So `current` and `until` are equal *by construction, not by coincidence*,
`Math.min` changes nothing, and the guard declines to write.

Confirmed by three independent lenses, all holding:

- **Control flow** — walked statement by statement; `active_until` is written twice
  on this path and only `markPastDue`'s write shortens. `endSubscription`
  structurally cannot reach below U, because U is its own `Math.min` input.
- **Reachability** — no contrivance needed. `markPastDue` makes an *unconditional*
  Stripe call (`otherLiveEntitlementFloor` → `listAllSubscriptions`) which is
  documented to **throw so the webhook retries**; the route returns 500 and leaves
  `processed_at` NULL; `claimEvent` re-runs it once it is 60s stale; and the route's
  own header records that Stripe "guarantees no ordering and delivers concurrently",
  with three measured wrong outcomes from reordering alone.
- **Cost** — see below.

## Four reachable ways the subscription becomes `canceled`

1. **Stripe's own end-of-dunning cancel** — which `sync.ts` itself calls *"the
   DEFAULT end state of every failed renewal"*.
2. `cancelImmediately` (D80) for `paused` / `unpaid`.
3. `stopDisputedBilling`'s dispute cancel (D91).
4. A dashboard cancel, or account deletion.

⚠️ **And a fifth if the narrowing keys on `cancel_at_period_end` rather than on
status**: `past_due` is in `CANCELLABLE_STATUSES`, so the ordinary customer pressing
Cancel would qualify too. If the ruling is re-issued, it must key on **status**.

## The cost, both directions — this is the trade to re-decide

| | what it costs |
|---|---|
| **Narrowing** (leaks an unpaid period) | weekly **+4.00 d** (~$2.28) · monthly **+25–28 d** (~$10.81) · yearly **+362 d** (~$69.41) |
| **Not narrowing** (Q107's original defect) | **5.00 d** of *already-paid* access taken back, reproduced; **371 d** seen once by the lifetime run |

Two properties bound the narrowing's failure and are worth weighing:

- **One-shot.** The subscription is `canceled`, so no further period ever rolls. It
  cannot repeat on that account.
- **Self-terminating.** `active_until` is a date and `isEntitlementActive` is computed
  on every read, so access simply stops at the unpaid period end with no write, no
  cron and no operator.

The other direction has neither property: it takes money's worth of service off a
customer who paid, and it is the direction Standing Law 1 is about.

## What would make the narrowing safe

Not attempted, and named only so the next round does not re-derive it: the premise
becomes true if `endSubscription` computes its `until` from **the last period the
customer actually PAID for** rather than from `items[0].current_period_end`. That is
a second change to a second handler, in the same family as the floor rewrite already
ledgered under Q107 — and it is the same underlying error a third time: a field being
asked "what period is this?" when the question is "what has been paid for?".
