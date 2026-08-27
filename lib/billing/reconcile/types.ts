/**
 * RECONCILIATION — the shapes (Spec 11 · reconciliation and alerting).
 *
 * Pure data. No `server-only`, no Stripe import, no Supabase import, so the
 * rules and the report can be unit tested under the house rule that tests cover
 * `lib/**` pure logic. `fetch.ts` does the reading and produces a
 * {@link ReconcileSnapshot}; `rules.ts` decides; `report.ts` renders.
 *
 * ## Why the snapshot is plain data rather than Stripe objects
 *
 * A rule that takes a `Stripe.Subscription` can only be tested by constructing
 * one, and a `Stripe.Subscription` is a hundred fields of which four matter.
 * Every rule below reads five or six named facts, so the fetch layer narrows
 * once and the twelve rules each read something a test can write by hand.
 *
 * It also makes the mode question answerable: a snapshot carries the mode it was
 * taken in, so a report can never claim a live conclusion from a test-mode run.
 */

import type { RevokedReason } from "../access";

/** Which Stripe mode a run was taken against. §3.2 — never mix the two. */
export type StripeMode = "test" | "live";

/**
 * EVERY RULE, worst first.
 *
 * ⚠️ THE ORDER IS THE SEVERITY ORDER and `report.ts` renders in it. §3.5 wants
 * the worst thing first because a founder reading at three in the morning reads
 * the top of the list and acts on it.
 *
 * The first three are the ones that mean **money moved after somebody was told
 * it would not** — Invariant 1, the rule that outranks everything else on this
 * project. Everything below them is a correctness fault that has not yet taken
 * anyone's money.
 */
export const RULES = [
  /** §3.1 #6 — from `01` and `06`. A charge inside a promised beta fortnight. */
  "charge-inside-grace",
  /** §3.1 #7 — from `04`. A charge inside a save-offer courtesy period. */
  "charge-inside-courtesy",
  /** §3.1 #11 — D75. A courtesy marker granted on an unpaid subscription. */
  "courtesy-granted-while-unpaid",
  /**
   * §3.1 ⚠️ — the markers themselves. A removed marker makes the three rules
   * above go BLIND rather than fail, which is the worst way for a check to die.
   */
  "free-period-marker-missing",
  /** §3.1 #1 — nobody holds more than one billable subscription. */
  "two-billable-subscriptions",
  /** §3.1 #3 — every live subscription has an entitlement. Paying, no access. */
  "live-subscription-without-entitlement",
  /**
   * ⚠️ D-2.1's OTHER HALF — a REVOKED entitlement beside a subscription Stripe is
   * still billing. **Somebody is being charged for access they do not have.**
   *
   * ⚠️ WHAT IT MEANS BEYOND THAT COMES FROM `revoked_reason`, NEVER FROM A GUESS
   * (D101). A dispute means the cancel failed; a refund means no cancel was owed
   * and the shape is also parked finding P1; an unrecorded reason means no claim
   * may be made. The finding fires in all three — see `whyItWasRevoked`.
   *
   * Before a dispute cancelled the subscription this was an EXPECTED state and
   * §3.4 exempted it, correctly. Now that `revokeForCustomer` cancels, a live
   * subscription beside a revoked row means the cancel failed or never ran — so
   * we are still charging somebody whose money we no longer have, and each new
   * invoice they dispute stacks another fee.
   *
   * ⚠️ It is a NEW rule rather than a re-widening of
   * `live-subscription-without-entitlement`. Widening that one back would
   * reintroduce the false positive §3.4 correctly closed, and §3.4 warns that one
   * false positive on every dispute gets the whole report ignored. Two different
   * facts, two rules: that one is "nobody revoked anything and they have no
   * access", this one is "somebody DID revoke, and the billing is still running".
   *
   * Ranked directly below it because it is the same severity class — money moving
   * on an account that should not be charged — without being the same fault.
   */
  "revoked-entitlement-beside-live-subscription",
  /** §3.1 #2 — every active entitlement traces to a live subscription or comp. */
  "entitlement-without-source",
  /** §3.1 #5 — a charge date and an entitlement date that disagree. */
  "charge-and-entitlement-dates-disagree",
  /** §3.1 #8 — from `02a`. Incomplete past the window, entitlement attached. */
  "incomplete-past-window-with-entitlement",
  /** §3.1 #12 — from `19`. A zero-dollar invoice nobody can account for. */
  "unexplained-zero-invoice",
  /** §3.1 #4 — the webhook ledger. Reported as two separate states, §3.3. */
  "webhook-unattributed",
  /** §3.1 #4 — the other half. A handler that did not finish, and retried. */
  "webhook-unprocessed",
  /** §3.1 #9 — a live subscription on an archived price. */
  "subscription-on-archived-price",
  /** §3.1 #10 — two entitlements from the same source on one account. */
  "duplicate-entitlement-source",
  /**
   * D46 — "push plus dashboard, and a missing subscription fails the clean run".
   * An alerting system with no subscribed device is itself a silent failure, so
   * it is asserted rather than assumed. Last because it breaks no user's access.
   */
  "no-alert-device-subscribed",
] as const;

export type RuleId = (typeof RULES)[number];

/** Rank for ordering. Lower is worse. Derived from {@link RULES}'s order. */
export function severityOf(rule: RuleId): number {
  return RULES.indexOf(rule);
}

/**
 * One broken rule, on one account.
 *
 * §3.5's order is deliberate and the field order here matches it: **the account
 * is what a person acts on, the rule is how bad it is, the evidence is what they
 * paste into the Stripe dashboard.**
 */
export interface Finding {
  rule: RuleId;
  /**
   * WHO. Identified by ids rather than by email address.
   *
   * A cold review already downgraded the backfill for returning every account's
   * address in one response, and the same reasoning applies harder here: this
   * report is delivered to a dashboard and a push notification. A Supabase user
   * id and a Stripe customer id are both directly pasteable into the two consoles
   * a person would actually open, so nothing is lost by leaving addresses out.
   *
   * Null when the finding is not about an account at all — an unattributable
   * webhook is precisely the case where we could not work out whose it was, and
   * saying "unknown" is the finding rather than a gap in it.
   */
  account: AccountRef | null;
  /**
   * WHAT MAKES IT TRUE. Ids, dates and amounts. Short lines, not a JSON dump —
   * §3.5 forbids the dump explicitly.
   */
  evidence: string[];
}

export interface AccountRef {
  /** The Supabase `auth.users` id, when we could resolve one. */
  userId: string | null;
  /** The Stripe customer id, when the finding came from Stripe's side. */
  stripeCustomerId: string | null;
}

/**
 * A Stripe subscription, narrowed to what the rules read.
 *
 * `metadata` is split out into named fields because three different things wear
 * Stripe's `trialing` status (§3.4) and the markers are the only way to hold them
 * apart. A rule that reads `metadata["trackd_grace_until"]` inline is a rule that
 * silently stops working when the key is renamed.
 */
export interface SubscriptionFact {
  id: string;
  customerId: string;
  status: string;
  /** Every price on the subscription. Usually one; an addon would make two. */
  priceIds: string[];
  /** Unix seconds, as Stripe gives them. Null when absent. */
  created: number;
  trialEnd: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  /** `metadata.user_id` — the webhook's fallback for resolving the account. */
  metadataUserId: string | null;
  /**
   * `trackd_grace_until` — an ISO instant, the PROMISED end of a beta fortnight.
   * Deliberately the promise rather than the `trial_end` actually sent: the two
   * differ when `freeTime.ts`'s minimum-offset clamp fires, and the question this
   * script asks is about the promise. See `lib/billing/freeTime.ts:80-84`.
   */
  graceUntil: string | null;
  /** `trackd_courtesy_until` — an ISO instant, the end of a save-offer month. */
  courtesyUntil: string | null;
}

/**
 * A Stripe CUSTOMER, narrowed to the two save-offer markers.
 *
 * ## ⚠️ WHY THIS TYPE EXISTS AT ALL
 *
 * The save offer's markers are split across two objects, and reading them from
 * the wrong one is a silent failure rather than an error:
 *
 *   `trackd_save_offer_shown_at`     CUSTOMER metadata  (`saveOffer.ts:215`)
 *   `trackd_save_offer_claimed_at`   CUSTOMER metadata  (`saveOffer.ts:407`)
 *   `trackd_courtesy_until`          SUBSCRIPTION metadata (`saveOffer.ts:506`)
 *   `trackd_grace_until`             SUBSCRIPTION metadata (`billing-actions.ts:865`)
 *
 * D75's rule — no courtesy marker on a subscription that was unpaid at the moment
 * of the grant — needs the CLAIM INSTANT, and the claim instant is on the
 * customer. Reading it off the subscription returns null every time, which would
 * make the rule pass vacuously on every account forever. That is precisely the
 * "green and measuring nothing" shape this project keeps paying for, so the two
 * objects are fetched separately and joined by id rather than assumed together.
 */
export interface StripeCustomerFact {
  id: string;
  /** `trackd_save_offer_shown_at` — when the offer was put on screen. */
  offerShownAt: string | null;
  /**
   * `trackd_save_offer_claimed_at` — when the courtesy was actually taken.
   * This is the grant instant D75 measures "was it unpaid then" against.
   */
  offerClaimedAt: string | null;
}

/** A Stripe invoice, narrowed to what places a charge in time. */
export interface InvoiceFact {
  id: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: string;
  /** Minor units, as Stripe holds them. Never divided here. */
  amountPaid: number;
  total: number;
  currency: string;
  /** Unix seconds. When the invoice was created. */
  created: number;
  /**
   * Unix seconds when money actually moved, or null if it never did.
   *
   * ⚠️ THIS IS THE FIELD THE MONEY RULES READ, not `created` and not `status`.
   * An invoice can be created inside a free period perfectly legitimately — a
   * zero-dollar one is raised at the start of every trial. What must never happen
   * is money moving inside it.
   */
  paidAt: number | null;
  billingReason: string | null;
}

/** A row of our `entitlements` table. The only table that decides access. */
export interface EntitlementFact {
  userId: string;
  product: string;
  source: string;
  activeUntil: string | null;
  isActive: boolean;
  /**
   * ⚠️ WHY IT WAS TURNED OFF (D101 / Q106) — so a rule does not have to GUESS.
   *
   * `revokeForCustomer` persists this, and three screen-side readers already
   * consult it. `revoked-entitlement-beside-live-subscription` did not, and it
   * asserted "a dispute cancels the subscription, so this means the cancel failed
   * or never ran" over a row that a REFUND turned off — a refund deliberately
   * does not cancel (`sync.ts`), so that sentence was false for that cohort and
   * the remediation it names is "cancel a subscription nobody decided to cancel".
   *
   * ⚠️ `"unknown"` IS A REAL ANSWER AND IT IS NOT `"dispute"`. It means the
   * reason column could not be read, `005` is unapplied, or the row predates it.
   * A rule reading this must say less, never guess more.
   */
  revokedReason: RevokedReason;
}

/** A row of `billing_customers` — the user ↔ Stripe customer link. */
export interface CustomerLinkFact {
  userId: string;
  stripeCustomerId: string;
}

/**
 * A `webhook_events` row that has not been stamped.
 *
 * ⚠️ SCOPED TO THE RUN'S MODE. The ledger holds test-mode and live-mode events in
 * one production table, and on 2026-08-17 it held 148 unstamped test-mode rows
 * from QA teardown. A live run that counted those would report 148 findings
 * forever, and a report that is never quiet is the failure §3.5 exists to
 * prevent. `fetch.ts` filters on the payload's own `livemode`.
 */
export interface UnstampedWebhookFact {
  eventId: string;
  type: string;
  receivedAt: string;
  /**
   * Whether the payload names a Stripe customer we can map to a user.
   *
   * §3.3 requires unattributed and unprocessed to be reported SEPARATELY, and the
   * ledger has no column that distinguishes them — both leave `processed_at`
   * null. So the distinction is re-derived here from the same question the
   * handler asked: could this event be tied to an account? Resolved by
   * `fetch.ts` against `billing_customers` and the payload's `metadata.user_id`.
   */
  attributableToUserId: string | null;
  /** The customer the payload names, when it names one. Evidence either way. */
  customerId: string | null;
}

/**
 * WHETHER THE RUN SAW EVERYTHING.
 *
 * §3.2's hardest requirement: a run that hit a page limit **reports itself
 * incomplete and never reports clean**. A reconciliation script that silently
 * reconciles the first hundred accounts is worse than none, because it produces
 * the word "clean".
 *
 * Note the deliberate difference from `listAllSubscriptions`, which THROWS on
 * overflow. Throwing is right there because every caller is about to spend or
 * refuse money on the answer. Here it is wrong: a throw loses every finding the
 * run had already collected, which is the opposite of what a reconciliation run
 * is for. So this records the truncation and the report refuses to say "clean".
 */
export interface Completeness {
  /** Each list call that could not be exhausted, named, with what it hit. */
  truncated: string[];
  /** Each read that failed outright. A failed read is not a clean read. */
  failed: string[];
}

/** Everything a rule may read. Assembled by `fetch.ts`, consumed by `rules.ts`. */
export interface ReconcileSnapshot {
  mode: StripeMode;
  /** When the run was taken. Passed in, never read from a clock inside a rule. */
  now: Date;
  subscriptions: SubscriptionFact[];
  invoices: InvoiceFact[];
  /** Stripe's customers, for the save-offer markers. Joined to subs by id. */
  stripeCustomers: StripeCustomerFact[];
  entitlements: EntitlementFact[];
  customers: CustomerLinkFact[];
  unstampedWebhooks: UnstampedWebhookFact[];
  /**
   * The three price ids this environment is configured with. A live subscription
   * on anything else is on an archived iteration — §3.1 #9.
   */
  activePriceIds: string[];
  /** How many founder devices could actually receive a push alert. D46. */
  alertDevices: number;
  completeness: Completeness;
}

/** What a whole run amounts to. The exit state is derived from this. */
export type RunStatus = "clean" | "dirty" | "incomplete";

export interface ReconcileReport {
  status: RunStatus;
  mode: StripeMode;
  /** ISO. Stamped by the caller, never by a pure function. */
  ranAt: string;
  findings: Finding[];
  completeness: Completeness;
  /** What was checked and how many of each, for the clean run's own account. */
  counts: {
    subscriptions: number;
    invoices: number;
    stripeCustomers: number;
    entitlements: number;
    customers: number;
    unstampedWebhooks: number;
  };
}
