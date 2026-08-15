You are continuing the billing build for Trackd Co on branch `wave3/billing-cancel`.
Confirm you are on that branch before anything else. **Do not merge or push to `main`
under any circumstances.**

## What is already done

Billing specs `01-trial-eligibility`, `02a-paid-today-checkout` and
`02b-checkout-copy-and-disclosure` are **built, driven and cold-reviewed**, on this
branch, not merged. Read `Context/Feature Specs/Billing Specs/REVIEW-billing-triple.md`
first — it is a written handover of that work and will save you a lot of reading.
Branch head at handoff: `c752c92`. Gates green: tsc 0, ESLint 0, 1273 tests,
`next build` passes.

## Your task

Implement, strictly in this order, one at a time:

1. `Context/Feature Specs/Billing Specs/Billing-03-Cancel-flow.md`
2. `Context/Feature Specs/Billing Specs/Billing-04-Save-Offer.md`

Read the next spec in full before starting it. Each spec's header names the context
files to read first — read them. Each spec's rules are binding: its Out of Scope
section, its four standing rules, and every ⚠️ warning at the step where it appears.

Work one Implementation step at a time. After each step run the gates (tsc, ESLint,
tests, and the step's own verification). **Do not stop for approval between steps** —
work continuously and report at the end of each spec. Stop mid-run only for genuine
ambiguity: a spec instruction that contradicts the code, requires something a spec
forbids, or is a decision with money on it. Never guess, never work around, never
invent copy.

On completing each spec, run three independent cold-agent reviews as the spec's §5
requires — one on money and races, one on the gate and entitlements, one on the UI at
390x844 — and keep fixing until no CRITICAL and no HIGH remain. Low and medium
findings unrelated to payments may be accepted deliberately and written down.

## ⚠️ Spec 04 is the highest-risk screen in the product

Its orderings are law: **the cancellation is written to Stripe before the offer
renders; the offer burns on show; the server clock is the only clock.** If anything in
the built code contradicts the spec, STOP on that point and write the contradiction
into your report rather than resolving it yourself.

Note that the cancel flow and save offer **already exist** in the codebase
(`lib/billing/cancel.ts`, `lib/billing/saveOffer.ts`, `lib/billing/openOfferStore.ts`,
`supabase/billing/003_courtesy_until.sql`). So 03 and 04 are likely review-and-amend
specs over built work, not greenfield.

## Hard lines

- **Nothing merges or pushes to `main`.** Ever.
- **No migrations are applied by you.** `supabase/billing/003_courtesy_until.sql` stays
  UNAPPLIED and the code must work with it absent. Confirmed absent on the live DB.
- **`BILLING_GATE_ENABLED` stays unset.**
- **No approved string is ever reworded.** Withhold a line, never rewrite it. Carry
  signed copy character for character. **No em dash in any user-facing string, ever.**
- Do not edit `ui-context.md`, `architecture.md`, `code-standards.md`,
  `project-overview.md` or `ai-workflow-rules.md`. You update only
  `progress-tracker.md` and `next-tasks.md` as you go.

## Environment

- **The Supabase database is PRODUCTION with ~90 real users.** Test accounts only on
  `@trackd-qa.invalid`, deleted **BY ID ONLY** (a previous sweep matched the domain and
  destroyed 16 real fixtures). **Clean up Stripe objects BEFORE deleting the user** —
  deleting cascades away `billing_customers`, the only mapping back to the customer.
  Audit afterwards: it should return to exactly 90 auth users, zero test clocks, zero
  leftover `entitlements` / `billing_customers` rows.
- **Stripe is TEST MODE / sandbox.** Never touch live mode.
- `http://127.0.0.1` **does not hydrate** — drive only `http://localhost`. A dev server
  runs on port **3100**.
- **Never run `next build` or delete `.next` while a dev server is running.** Stop it
  first, build, then restart it.

## The QA harness already exists — reuse it, do not rebuild it

In `scratchpad/`: `admin.mjs` (`makeUser` on @trackd-qa.invalid, `dropUser` by id,
cookie-jar `signIn`), `qa-billing.mjs` (seed billing states, teardown that does Stripe
before the user), plus driven cases: `qa-start-trial.mjs`, `qa-one-trial.mjs`,
`qa-attacks.mjs`, `qa-failure-directions.mjs`, `qa-overlap.mjs`, `qa-test-clock.mjs`,
`qa-copy.mjs`, `qa-four-facts.mjs`, `qa-paid-races.mjs`, `qa-mismatch.mjs`,
`qa-returning-intent.mjs`, `qa-paid-resume.mjs`, `qa-holding-screen.mjs`. Playwright is
installed. Webhooks: `stripe listen --forward-to localhost:3100/api/stripe/webhook`
(its signing secret already matches `.env.local`).

## Traps that have already cost time here

- The Stripe card iframe must be targeted by `title="Secure payment input frame"` —
  the FIRST `__privateStripeFrame` is the wallets frame and has no card fields.
- Replaying a captured server action **loses the session**, so it refuses at `!user`
  before reaching what you meant to test. Tamper with the body in flight via route
  interception instead.
- `vitest | tail -3` prints "Start at"/"Duration" and **cuts off the pass/fail line**.
  Grep for `Tests ` instead. This hid 7 failures once.
- Stripe removed `invoice.payment_intent` in API `2025-03-31.basil`. The expand string
  is still ACCEPTED and returns null forever. Use `latest_invoice.confirmation_secret`,
  which carries `{client_secret, type}`.
- `react-hooks/purity` forbids `Date.now()` in a render body, including server
  components. Read the clock inside a non-component helper.
- A `.next` left in a production-build shape makes `next dev` 404 every route. Clear it
  while the server is stopped.

## Known and NOT fixed, already recorded in `next-tasks.md`

Do not rediscover these; they have concrete failing cases written down. The 320x568
four-facts failure (pre-existing, owed to `09-checkout-redesign.md`); the idempotency
key's clamped-value sub-case; `reconcileToOne`'s dead-status guard under an idempotent
replay; `hasValidatedCard` trusting an absent setup intent for dashboard-created
subscriptions; `paused` sitting in `BILLABLE_STATUSES` (which is shared with the cancel
path, so **03 may own that one**).

## Report format, at the end of each spec

What built; what the cold agents found by severity; what you fixed; what you left and
why; gate state (tsc / ESLint / tests / build); the exact commit head; the production
cleanup audit; and anything that stopped you.
