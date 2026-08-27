# Billing triple — build review

**Branch:** `wave3/billing-cancel` · **Base:** `ebbd3cf` · **Head:** `19117ec`
**Specs:** `01-trial-eligibility`, `02a-paid-today-checkout`, `02b-checkout-copy-and-disclosure`
**Date:** 15 Aug 2026 · 25 commits · 25 files · +5,307 / −189

Nothing merged. Nothing pushed. `BILLING_GATE_ENABLED` still unset, so none of
this changes anything for the ~90 live accounts until it is set.

---

## 1. What the three specs actually do

They are one change wearing three names, and they ship together or not at all.

| Spec | Decides |
|---|---|
| **01** | Who gets free days |
| **02a** | Makes being charged today possible |
| **02b** | What each of those people reads before pressing the button |

Ship 01 alone and the screen breaks a written promise. Ship 02b alone and it
describes a button that cannot succeed.

### The four people who reach checkout, and what each now gets

| Cohort | Screen says | Stripe does |
|---|---|---|
| Brand new | "Nothing to pay today" · 7 days free | SetupIntent, `trial_end` +7d, $0 due |
| Beta, mid-fortnight | "Starts 24 Aug 2026" | SetupIntent, `trial_end` **at the grace end**, $0 due |
| Beta, fortnight ended | "Starts today · First charge today" | PaymentIntent, `active`, **$11.99 charged** |
| Used their trial | "You've had your trial." | PaymentIntent, `active`, charged |
| Free-for-life comp | (never reaches it) | `already-subscribed`, **zero Stripe objects** |

---

## 2. The money-critical changes

**A beta user who subscribes mid-fortnight is no longer charged inside it.**
They previously had `trial_period_days` omitted, so Stripe raised an invoice due
immediately — the app charging somebody before a date it had given them in
writing. Their subscription is now created with `trial_end` at the grace end,
taken from `entitlements.active_until`. A fixed instant, not a day count: a
remainder calculation is a charge on the wrong day.

**One trial per user, ever**, derived from Stripe at read time. Nothing persists
a "trial used" marker — confirmed by grep across `supabase/`, `lib/` and `app/`.

**A user with no free days can now pay at all.** That path returned a generic
error before: the client was setup-only end to end and the create expanded a
field that is null for a paid subscription.

**A free-for-life comp cannot buy**, refused before any Stripe object exists,
backed by two independent authorities so a database blip cannot open it.

---

## 3. Defects found by DRIVING, that tests and types did not catch

Every one of these passed `tsc`, ESLint and the full suite.

**An abandoned tap burned a first-timer's trial.** Abandon a 3D Secure
challenge, come back, pick a *different* plan: `startTrial` cancels the
abandoned attempt, and from that moment it read as a used trial — because
`hasValidatedCard` treated any non-`trialing` status as validated. Measured on
the object: no payment method, no source, setup intent still pending, predicate
returning `true`. No card ever touched it. Two steps to reach, and it charged a
first-time customer against a screen promising seven free days.

**The spec named a Stripe field that no longer exists, and it fails silently.**
02a §3.1 says to expand `latest_invoice.payment_intent`. Stripe removed it in
API version `2025-03-31.basil`; this SDK sends `2026-07-29.dahlia`.

```
expand latest_invoice.payment_intent       ACCEPTED  → null every time
expand latest_invoice.confirmation_secret  ACCEPTED  → {"client_secret":"pi_…","type":"payment_intent"}
```

The expand string is *accepted*, so there is no error to catch. Following the
spec literally would have built exactly the defect its own Step 1 warns about.

**A mode mismatch, caught by the guard written for it.** 02b's copy change made
a mid-grace user render "Nothing to pay today" while `trial` was false, so the
sheet mounted in *payment* mode against a server-issued SetupIntent. 02a's gate
refused to confirm and cancelled — safe, and completely broken. That guard was
written a day earlier against code written later, and it earned its place.

**`69.99 * 100` is `6998.999999999999`.** The amount handed to Elements is now
Stripe's own integer. Derived, the yearly plan would have been a non-integer.

---

## 4. The cold reviews

Three independent reviewers across all three specs: money and races, gate and
entitlements, UI at 390x844.

**No CRITICAL from any of them.** Four HIGH, all fixed and re-driven:

1. **A resumed trial could charge a calendar day early.** Abandon at 23:40,
   return at 00:05 — the screen recomputes its date, the resumed subscription
   keeps its old `trial_end`. No tolerance can fix this: *any* elapsed time
   makes a fresh trial later than the abandoned one. The subscription is now
   extended to match, or replaced if Stripe refuses.
2. **The paywall promised "7 days free" to people about to be charged today.**
   New exposure from this work — before 02a the paid path errored, so the
   promise was false but nobody could be charged.
3. **A mid-grace user saw the raw `active_until` while Stripe got the
   48h-clamped one.** Screen said 15 Aug, Stripe held 17 Aug. Every beta
   account passes through that window.
4. **The welcome screen said "7 days on us" seconds after a $69.99 charge.**

Two MEDIUMs were **regressions from fixes made earlier in the same run**, which
is worth knowing about how this went:

- the comp backstop silently defeated the `is_active` kill switch for exactly
  the five accounts it was most about;
- fixing the mid-grace holding screen sent that cohort to the branch headed
  "Setting up your trial." — the one word D17 forbids for them.

All copy fixes were **withheld, never reworded**. No approved line was
shortened, softened or improved.

---

## 5. Verified by execution, not by reading

At 390x844 on `http://localhost`, against real Stripe test mode, with a test
clock where the question was about a month from now.

- Paid-today: `active`, `amount_due=1199 status=paid`, card saved
- **Renewal on a test clock:** two paid invoices, entitlement +1 month, no second card entry
- **Grace-end boundary on a test clock:** $11.99 charged on the promised day, no read-only gap
- Mode mismatch forced: nothing confirmed, no charge, no confirmable intent left
- Two tabs and a triple-tap mid-confirm: **exactly one charge, 1199 cents each**
- Stripe unreachable: screen stays generous, no payment form renders, nothing charged
- Entitlements read failing: trial granted, button refuses, no charge
- Anonymous and forged-plan attacks: refused, zero subscriptions
- Another user's redirect intent: refused, reveals nothing
- Every cohort's copy read verbatim on all three plans

**Empirically established, not assumed:**

- Stripe accepts a `trial_end` as short as **10 minutes** on create; the
  documented 2-day minimum does not apply to this call. 48h kept anyway.
- Cancelling an `incomplete` subscription **voids** its invoice, so no orphan
  charge can follow.
- The old idempotency key **is refused by Stripe** on a paid retry; the new one
  succeeds.

**Production audited after every run:** back to exactly 90 auth users, zero
`@trackd-qa.invalid` accounts, zero test clocks, zero leftover billing rows.

---

## 6. What is still owed

**Two §5 checkboxes cannot be closed here, and both belong to
`09-checkout-redesign.md`:**

The four required facts are **not visible with the button at 320x568**. This is
pre-existing, measured both ways:

```
PRE-02b   button y=777 in a 568px viewport   ~209px below the fold
POST-02b  button y=802                       ~234px below
```

Carrying the approved copy verbatim added ~25px to an overflow that was already
there. **390x844 passes for every variant.** 02b §2 forbids touching layout, and
`09` is the spec that moves the disclosure below the button — the change most
likely to make it worse. `09` must re-measure the **mid-grace** variant
specifically: it is the longest case, carrying a date where the others say
"today".

**Judged and recorded, not fixed** (all in `next-tasks.md` with failing cases):
the idempotency key's clamped-value sub-case; `reconcileToOne`'s dead-status
guard under an idempotent replay; `hasValidatedCard` trusting an absent setup
intent for dashboard-created subscriptions; `paused` sitting in
`BILLABLE_STATUSES`.

**A paid-today subscribe is deliberately unmeasured** until `13` ships. The false
`trial_started` event is gone and nothing replaced it — `13` owns the taxonomy,
and an unmeasured event is a gap where a wrong one is a lie in a dashboard.

---

## 7. Before this goes live

Unchanged from `next-tasks.md`, and step 8 is still last:

1. Stripe off sandbox — live keys, prices, webhook secret
2. Apply `supabase/billing/002`
3. Confirm `angusbrake6@gmail.com` has signed up (`npx tsx scratchpad/comp-check.mjs`)
4. Merge, deploy
5. `POST /api/billing/beta-grace?dry=1` — read the output
6. `POST /api/billing/beta-grace`
7. Verify `select count(*) from entitlements` is ~90, not 0
8. **Only then** set `BILLING_GATE_ENABLED=true`

⚠️ `supabase/billing/003_courtesy_until.sql` stays unapplied. Confirmed absent on
the live database, and every drive above ran against that exact state.
