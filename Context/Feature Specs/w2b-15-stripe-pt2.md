# Spec 02 — Stripe subscriptions, in-app checkout, 5-day trial

## Context for the Implementing Agent

Read these first, in this order, before touching anything:
`project-overview.md`, `architecture.md`, `ui-context.md`, `code-standards.md`, and `01-account-before-paywall.md`.

Spec 01 must be complete and verified before this spec starts. This spec assumes a signed-in user is always present on the paywall.

Working rules for this spec:

- Branch: `wave3/onboarding-flow`. Do NOT merge to `main` without Adrian's explicit word — `main` deploys straight to Vercel production.
- This is Next.js 16, not 14. `middleware` is `proxy.ts`.
- Do NOT create new shared components without asking first.
- Verify by EXECUTING, not by reading. Use Stripe test mode and the Stripe CLI to trigger and observe real events. Do not conclude anything works because the code looks right.
- Do one Implementation step at a time. Stop and report after each.
- No third-party billing service is used in this spec. Stripe only, via `stripe`, `@stripe/stripe-js`, and `@stripe/react-stripe-js`. Do NOT add RevenueCat, Paddle, Chargebee, or any other billing layer.

## Goal

Take payment for a TRACKD Pro subscription entirely inside the app, with a 5-day free trial, without the user ever leaving TRACKD.

The architectural requirement that outranks everything else in this spec: **the app must never ask Stripe whether a user has access.** It asks a table called `entitlements`. Stripe writes to that table. Later, Apple and Google will write to the same table via RevenueCat when TRACKD ships to the App Store and Play Store, and no app code will need to change.

If any access check anywhere in the codebase reads a Stripe subscription status directly, this spec has failed regardless of whether payments work.

## Out of Scope

Do NOT do any of the following in this spec:

- Anything involving RevenueCat, Apple in-app purchase, or Google Play billing. The entitlements table is built to accommodate them; nothing is wired to them.
- Building a plan-management or cancellation UI. The Billing row stays as specced in the overhaul — current plan displayed, no actions.
- Building the trial-ending notification or email itself. The webhook that would trigger it is in scope; the message is not.
- Affiliate or referral attribution (Rewardful, PromoteKit).
- Annual pricing, promo codes, discounts, or paid trials. One monthly price, one 5-day free trial.
- Changing the paywall's visual design. Payment UI is added to it; nothing else changes.
- Any dunning or churn-recovery flow beyond recording `past_due`.

## Adrian's amendments (2026-08-08) — these OVERRIDE the text below

Three decisions taken before implementation started. Where this section and the
body disagree, this section wins.

1. **THREE PLANS, ALL WIRED — not one monthly price.** The paywall's yearly /
   monthly / weekly rows stay and each gets its own recurring **AUD** price in
   Stripe. The body's "One monthly price" and its Out-of-Scope line banning
   annual pricing are superseded. Everything else in Out of Scope stands: no
   promo codes, no discounts, no paid trials.
   **Weekly moves to $3.99** (was $4.99). No code change is needed for that —
   see the pricing note below.

2. **THE TRIAL IS 7 DAYS, not 5.** `TRIAL_DAYS` in `lib/onboarding/pricing.ts`
   already says 7 and every figure the paywall prints derives from it: the
   headline, the CTA, the reminder beat, the billing date and the legal line.
   The reasoning is recorded on the constant — a five-day window does not cover
   one full protocol rotation, so the customer never sees the thing they are
   paying for, and seven unlocks "the first week is on us".
   Read every "5-day" in the body as 7. `trial_period_days` follows the constant.
   > Note the consequence: Stripe fires `customer.subscription.trial_will_end`
   > **three days out**, which is day 4, while the paywall promises a reminder on
   > **day 5** (`REMINDER_DAY = TRIAL_DAYS - 2`). The notification itself is out
   > of scope here, but whatever sends it must honour the day the SCREEN
   > promised, not the day the webhook happens to arrive.

3. **Prices are created in the Stripe dashboard by Adrian**, per the body. As of
   2026-08-08 the sandbox (`Trackd Co sandbox`, AU, default currency AUD, test
   mode, charges enabled) holds only the two USD prices left over from the
   abandoned `stripe` branch — $11.99/mo and $69.99/yr on product "Trackd Co".
   Those are NOT the ones to use. Three AUD prices are owed; the env var names
   need to grow to three.

**The pricing module has to stop holding amounts.** `PLANS` in
`lib/onboarding/pricing.ts` hardcodes `69.99 / 11.99 / 4.99`, which the body
forbids outright. The labels, periods, `PLAN_ORDER`, `TRIAL_DAYS` and every
derived helper (`monthlyEquivalent`, `yearlySavingPercent`, `weeklyAnchor`,
`billingDate`) stay in code — none of those is an amount. Only the numbers move
to Stripe. Note the amounts are read by three ANONYMOUS screens as well as the
paywall (`payoff` via `weeklyAnchor`, `cost` via `cost-variants`), so they have
to reach the client for a signed-out visitor too.

## Design Decisions

**Stripe configuration**

Product and prices are defined in the Stripe dashboard, not in code. The app references a price ID (`price_...`) held in an environment variable. There must be no dollar amount hardcoded anywhere in the codebase — the price shown on the paywall is read from Stripe, so a dashboard change takes effect without a deploy.

Currency is AUD. Test mode and live mode use separate keys and separate price IDs, held in separate environment variables.

**Checkout surface**

Stripe Payment Element, mounted inside TRACKD's own paywall. Not Stripe Hosted Checkout. Not Stripe Embedded Checkout. The user must never be redirected to a stripe.com domain.

The Element is themed via Stripe's `appearance` API to match the values already defined in `ui-context.md` — fonts, near-black surface, amber accent, border radius, spacing. Do not invent new colours or type. Read the values from the existing context file.

Apple Pay and Google Pay express buttons must be enabled and must render above the card fields. This is the primary conversion path on mobile and is not optional. Card entry is the fallback beneath them.

**Trial mechanics**

5-day free trial, card required up front. Nothing is charged on day 0.

Because the amount today is zero, the subscription is created with a trial and returns a `pending_setup_intent` rather than a payment intent. The client confirms that SetupIntent. This runs 3D Secure bank verification while the user is present, which materially improves the odds the day-5 charge succeeds instead of silently failing overnight.

**Access is granted by webhook only**

The client's success callback proves the card was accepted. It proves nothing about entitlement. Access is granted only when a webhook arrives from Stripe.

Do NOT write entitlements, unlock features, or set any access flag from client-side code under any circumstances. Anyone with browser dev tools can trigger a client success state.

**The post-payment gap**

There is typically a one to three second gap between the card confirming and the webhook landing. The user must not be dropped into the app during that window and shown the paywall they just paid to escape.

Show a holding state after confirmation while polling for the entitlement. On success, proceed into the app. If the entitlement has not appeared after a reasonable window, show a recoverable state that does not imply the payment failed — it did not.

**Database tables**

Four new tables. Follow the existing schema conventions in `architecture.md` for naming, ID types, timestamps, and row-level security.

`billing_customers` — links a TRACKD user to their Stripe customer. Columns: `user_id`, `stripe_customer_id`. Unique constraint on each. One row per user, created once, never deleted.

`subscriptions` — a local mirror of Stripe, never the authority. Columns: `user_id`, `stripe_subscription_id`, `stripe_price_id`, `status`, `trial_ends_at`, `current_period_end`, `cancel_at_period_end`. Exists so the app can display "renews on the 14th" without calling Stripe. Nothing gates access on this table.

`entitlements` — the only table the app reads to decide access. Columns: `user_id`, `product`, `source`, `active_until`, `is_active`. `product` is `pro` for now. `source` is `stripe`, and later `apple` or `google`. The `source` column also allows a value of `comp`, which is how founder, cofounder and beta-tester accounts are granted access without a fake Stripe subscription.

`webhook_events` — every event Stripe sends. Columns: `stripe_event_id` with a UNIQUE constraint, `type`, `payload`, `processed_at`. The unique constraint is the idempotency mechanism: Stripe retries on failure and delivers events out of order, so the same event will arrive more than once. Inserting first and letting the constraint reject duplicates is what makes every handler safe to run twice.

**Webhook events to handle**

- `customer.subscription.created` and `customer.subscription.updated` — upsert the `subscriptions` row; if status is `trialing` or `active`, upsert the entitlement with `active_until` set to the trial end or period end respectively.
- `invoice.paid` — extend the entitlement to the new `current_period_end`.
- `invoice.payment_failed` — set subscription status to `past_due`. Do NOT revoke the entitlement immediately; leave a grace window (default: entitlement stands until `active_until` passes naturally). Cards decline for boring reasons.
- `customer.subscription.deleted` — set the entitlement inactive at `current_period_end`, not immediately. A user who cancels on day 3 of a paid month keeps the month they paid for.
- `customer.subscription.trial_will_end` — record it. Stripe fires this three days before the trial ends, which on a 5-day trial is day 2. The notification itself is out of scope; the hook must exist and be logged so it can be wired later.

Webhook signature verification is mandatory. An unsigned or badly-signed request is rejected before any parsing. The webhook route must be excluded from any body-parsing middleware, since signature verification needs the raw body.

**Stripe account description**

Given TRACKD's history with automated enforcement on other platforms, the Stripe account business description must state plainly that TRACKD sells a subscription to a logging and tracking application, and that it does not sell, supply, or facilitate the supply of any substance. Flag this to Adrian rather than writing it yourself.

**Paywall disclosure**

The following must all be simultaneously visible on the paywall at the moment the CTA is on screen, with no scrolling required to reveal any of them:

- the trial length
- the exact renewal amount in AUD
- the date the first charge occurs
- that it renews automatically until cancelled

This is a hard requirement. A previous audit of this screen found it could be paid on without the price ever rendering. It is also what the ACCC looks at on free-trial-to-paid conversions, and what Apple and Google will enforce at store review.

## Implementation

Do these one at a time. Stop and report after each step.

1. Read the context files. Report back the existing schema conventions, how server routes and environment variables are structured, and the exact appearance tokens from `ui-context.md` you will pass to Stripe. Do not write code in this step.

2. Ask Adrian to create the Product and monthly AUD price in Stripe test mode and supply the test price ID, publishable key, secret key, and webhook signing secret. Do not proceed without them.

3. Create the four tables with the existing schema conventions and row-level security. No application code yet. Confirm the tables exist and the unique constraints are enforced by attempting a duplicate insert.

4. Build the entitlement read path: a single server-side function that answers "does this user have active access to product `pro` right now". Add a `comp` entitlement manually for Adrian's account and confirm the function returns true for him and false for a fresh account.

5. Build the webhook route. Verify the signature, insert into `webhook_events` first, and no-op cleanly on duplicate event IDs. Handle only `customer.subscription.created` and `customer.subscription.updated` in this step. Test with the Stripe CLI by forwarding real test events — do not test by hand-crafting request bodies.

6. Build the server endpoint that the paywall CTA calls: find or create the Stripe customer, create the subscription with a 5-day trial, return the pending SetupIntent client secret. Confirm by calling it and inspecting the resulting subscription in the Stripe dashboard.

7. Mount the Payment Element on the paywall with the appearance tokens from step 1, Apple Pay and Google Pay above the card fields. Confirm it renders correctly at a real phone viewport in both light and dark treatment, and that the wallet buttons actually appear on a device that supports them.

8. Wire the CTA end to end with a test card. Confirm the entitlement row appears via the webhook, and confirm explicitly that no client-side code writes to `entitlements` — search the codebase and report the result.

9. Build the post-payment holding state with polling. Confirm the user never sees the paywall after a successful payment, including on a deliberately slowed webhook.

10. Add the remaining webhook handlers: `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`. Trigger each with the Stripe CLI and confirm the resulting entitlement state for each.

11. Add the paywall disclosure copy. Measure that all four disclosure elements and the CTA are visible together at the smallest supported viewport without scrolling.

12. Audit: search the entire codebase for any access check that reads a Stripe subscription status, a `stripe_` column, or a hardcoded price. Report every hit. There should be none.

13. Run the full gate: `tsc`, `eslint`, the test suite, `next build`. All clean. Never run `next build` while a dev server is up.

14. Push the branch and deploy a Vercel preview with test-mode keys. Report the preview URL. Do not merge, and do not put live keys anywhere.

## Check When Done

Every item below must be confirmed by executing, using Stripe test mode and the Stripe CLI.

- [ ] No dollar amount is hardcoded anywhere; the paywall price is read from Stripe
- [ ] The user is never redirected to a stripe.com domain at any point
- [ ] Apple Pay and Google Pay buttons render above the card fields on a supporting device
- [ ] The Payment Element matches `ui-context.md` tokens at a real phone viewport
- [ ] Tapping the CTA creates a Stripe subscription with `status: trialing` and a 5-day trial, confirmed in the Stripe dashboard
- [ ] The SetupIntent is confirmed client-side and 3D Secure runs on a test card that requires it
- [ ] The entitlement row is created by the webhook, with `active_until` equal to the trial end
- [ ] A codebase search confirms no client-side code writes to `entitlements`
- [ ] A codebase search confirms no access check anywhere reads a Stripe subscription status directly
- [ ] Replaying the same webhook event twice via the Stripe CLI produces exactly one set of changes
- [ ] A webhook request with an invalid signature is rejected before parsing
- [ ] `invoice.paid` extends the entitlement to the new period end
- [ ] `invoice.payment_failed` sets `past_due` without immediately revoking access
- [ ] `customer.subscription.deleted` ends access at period end, not immediately
- [ ] `customer.subscription.trial_will_end` is received and logged
- [ ] A `comp` entitlement grants access with no Stripe subscription present
- [ ] The user never sees the paywall after paying, including with a deliberately delayed webhook
- [ ] Trial length, renewal amount in AUD, first charge date, and auto-renewal notice are all visible at the same time as the CTA, without scrolling, at the smallest supported viewport
- [ ] `tsc`, `eslint`, the test suite and `next build` are all clean
- [ ] Branch pushed, preview deployed with test keys only, preview URL reported, nothing merged, no live keys committed