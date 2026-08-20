import { describe, expect, it } from "vitest";

import { BILLABLE_STATUSES } from "./cancel";
import { CARD_RETRY_KEY, cardRetryVerdict } from "./cardUpdate";

/**
 * ⚠️ UPDATING A CARD RETRIES THE OPEN INVOICE — the bounds (Group B).
 *
 * The lifetime clock run measured the gap: card updated, `attempt_count` 1 -> 1,
 * no new charge, invoice still `open` after 240 seconds of real time, because
 * Stripe waits for its own next dunning attempt at **simulated day +2**. So a
 * customer who fixes their card in a minute is locked out for two more days,
 * under a screen promising access back "as soon as a payment goes through".
 *
 * Closing that means the app can now START A CHARGE off a webhook. These pin the
 * three refusals that keep it from starting one nobody asked for, and the driver
 * pins the half they cannot reach — that a real card on a real invoice actually
 * gets paid and that access comes back on `invoice.paid` rather than on the
 * update.
 */

const PM = "pm_test_new_card";
const SUB = "sub_test_1";

const dunning = {
  markerPaymentMethod: null as string | null | undefined,
  paymentMethodId: PM,
  subscriptionId: SUB as string | null,
  subscriptionStatus: "past_due" as string | null,
};

describe("the state that DOES get an attempt", () => {
  it("a past_due subscription with an open invoice and no marker", () => {
    expect(cardRetryVerdict(dunning)).toEqual({ attempt: true });
  });

  it("`unpaid` too — the other dunning state", () => {
    expect(cardRetryVerdict({ ...dunning, subscriptionStatus: "unpaid" })).toEqual({
      attempt: true,
    });
  });
});

describe("idempotence — the same card is attempted once", () => {
  /**
   * ⚠️ THE SEQUENTIAL GUARD, AND IT IS THE ONE THAT MATTERS IN PRACTICE. One
   * card update in Stripe's portal fires MORE THAN ONE event —
   * `payment_method.attached` and `customer.updated` at minimum — and both route
   * to this handler. Without the marker, one tap on "Update card" would produce
   * two charge attempts.
   */
  it("refuses when the invoice was already tried with this exact card", () => {
    expect(cardRetryVerdict({ ...dunning, markerPaymentMethod: PM })).toEqual({
      attempt: false,
      because: "same-card",
    });
  });

  it("driving the same event twice reaches the same verdict, and the second is a refusal", () => {
    const first = cardRetryVerdict(dunning);
    expect(first).toEqual({ attempt: true });
    // What the marker holds after the first attempt.
    const second = cardRetryVerdict({ ...dunning, markerPaymentMethod: PM });
    expect(second.attempt).toBe(false);
  });

  /**
   * ⚠️ THE CONTROL, AND IT IS A DELIBERATE BEHAVIOUR RATHER THAN A LEAK. A
   * genuinely DIFFERENT card gets its own attempt: a customer whose first
   * replacement also declined is exactly the person this feature exists for, and
   * refusing them would stop one level short of the problem. It cannot become a
   * double CHARGE — the moment an attempt succeeds the invoice is no longer
   * `open` and the caller never reaches this function again.
   */
  it("a DIFFERENT card is attempted, which is the point of the feature", () => {
    expect(
      cardRetryVerdict({ ...dunning, markerPaymentMethod: "pm_the_dead_one" }),
    ).toEqual({ attempt: true });
  });

  it("an absent marker is not confused with a matching one", () => {
    expect(cardRetryVerdict({ ...dunning, markerPaymentMethod: undefined }).attempt).toBe(true);
    expect(cardRetryVerdict({ ...dunning, markerPaymentMethod: null }).attempt).toBe(true);
  });
});

describe("it does NOTHING outside a renewal failure", () => {
  /**
   * ⚠️ `incomplete` IS A FIRST INVOICE, NOT A RENEWAL — the same distinction
   * `markPastDue` draws with its `subscription_create` guard. An abandoned 3D
   * Secure attempt leaves one of these `open` on an `incomplete` subscription,
   * and paying it would buy a subscription somebody walked away from.
   */
  it("refuses an `incomplete` subscription", () => {
    expect(cardRetryVerdict({ ...dunning, subscriptionStatus: "incomplete" })).toEqual({
      attempt: false,
      because: "not-dunning",
    });
  });

  it("refuses a healthy subscription — a card update on a working plan writes nothing", () => {
    for (const status of ["active", "trialing", "canceled", "paused", "incomplete_expired"]) {
      expect(
        cardRetryVerdict({ ...dunning, subscriptionStatus: status }),
        `${status} must not be attempted`,
      ).toEqual({ attempt: false, because: "not-dunning" });
    }
  });

  it("refuses a one-off invoice that belongs to no subscription", () => {
    expect(
      cardRetryVerdict({ ...dunning, subscriptionId: null, subscriptionStatus: null }),
    ).toEqual({ attempt: false, because: "not-a-subscription" });
  });
});

/**
 * ⚠️ THE WIRING. The verdict being right proves nothing if the handler ignores it
 * or if the route never calls the handler.
 */
describe("the handler and the route are wired to it", () => {
  /**
   * ⚠️ COMMENTS STRIPPED FIRST — `signed/README.md` rule 3, and it is not
   * decoration here. This module's doc-block NAMES `entitlements` twice in the
   * course of explaining that it must never touch the table, so a raw substring
   * test would read the reasoning as the code and fail on a correct file.
   */
  const retryModule = stripComments(readSync("lib/billing/cardUpdate.ts"));
  const route = stripComments(readSync("app/api/stripe/webhook/route.ts"));

  it("both card events reach the retry", () => {
    expect(route).toMatch(/case "payment_method\.attached"/);
    expect(route).toMatch(/case "customer\.updated"/);
    expect((route.match(/retryOpenInvoicesForCustomer\(/g) ?? []).length).toBe(2);
  });

  /**
   * ⚠️ ACCESS COMES BACK ON `invoice.paid` AND NOWHERE ELSE. An optimistic
   * restore on the card update would grant access for a charge that has not
   * settled — the mistake `extendFromInvoice`'s zero-amount guard exists for.
   */
  it("the retry module never touches the entitlements table", () => {
    expect(retryModule).not.toMatch(/entitlements/);
    expect(retryModule).not.toMatch(/serviceClient/);
  });

  it("it asks Stripe only for OPEN invoices, and stops CHARGING when there are none", () => {
    expect(retryModule).toMatch(/status: "open"/);
    expect(retryModule).toMatch(/if \(open\.length === 0\)/);
  });

  /* ── the POINT step, which is unconditional (founder, 20 Aug 2026) ── */

  /**
   * ⚠️ THE POINTER MOVES BEFORE ANY INVOICE IS LOOKED AT.
   *
   * The first version did nothing at all without an open invoice, which helped
   * only customers who had ALREADY been locked out. Somebody who replaces an
   * expiring card before it fails still had their subscription pointing at the
   * dead one, so their next renewal failed for a problem they had already fixed.
   */
  it("the subscription pointer is moved BEFORE the open-invoice check", () => {
    const pointAt = retryModule.indexOf("pointSubscriptionsAt(customerId, pmId, client)");
    const listAt = retryModule.indexOf('status: "open"');
    expect(pointAt).toBeGreaterThan(0);
    expect(listAt).toBeGreaterThan(0);
    expect(pointAt).toBeLessThan(listAt);
  });

  /**
   * ⚠️ THE NAMED SET, NEVER A LITERAL. `BILLABLE_STATUSES` asks "what could still
   * take their money?", which is exactly the question here: a subscription that
   * can still charge should charge the card the customer has just handed us. A
   * literal list goes stale the next time the set moves — the class of defect
   * `/billing`'s mirror filter and the courtesy read both paid for.
   */
  it("it points every BILLABLE subscription, from the named set", () => {
    expect(retryModule).toMatch(/BILLABLE_STATUSES\.has\(sub\.status\)/);
    expect(retryModule).not.toMatch(/\["past_due", "unpaid"\][\s\S]{0,40}default_payment_method/);
    // the set really does include the customer who acted BEFORE anything broke
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"]) {
      expect(BILLABLE_STATUSES.has(status), `${status} must be pointed`).toBe(true);
    }
    // …and really does exclude what Stripe has finished with
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(BILLABLE_STATUSES.has(status), `${status} must NOT be pointed`).toBe(false);
    }
  });

  /**
   * ⚠️ POINTING CHARGES NOBODY. The whole justification for making it
   * unconditional is that it writes a pointer and nothing else, so the step must
   * not be able to reach `invoices.pay` or raise an invoice.
   */
  it("the point step cannot charge: it only writes default_payment_method", () => {
    const fn = retryModule.slice(retryModule.indexOf("async function pointSubscriptionsAt"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/subscriptions\.update\([\s\S]{0,60}default_payment_method: pmId/);
    expect(body).not.toMatch(/invoices\.pay/);
    expect(body).not.toMatch(/invoices\.create/);
    expect(body).not.toMatch(/invoice_settings/);
  });

  /**
   * ⚠️ IDEMPOTENT BY COMPARISON. One portal update fires more than one event that
   * reaches this handler; without the skip, each would be a Stripe write and a
   * `customer.subscription.updated` back at us.
   */
  it("a subscription already pointing at the card is skipped without a write", () => {
    expect(retryModule).toMatch(/if \(current === pmId\) continue;/);
  });

  /**
   * ⚠️ PAGED. A truncated list silently leaves the OLDEST subscription — where a
   * long-lived yearly lives — pointing at the dead card, surfacing a year later as
   * a renewal nobody can explain.
   */
  it("it pages the subscription list rather than reading one page", () => {
    expect(retryModule).toMatch(/listAllSubscriptions\(client, customerId\)/);
  });

  /**
   * ⚠️ NO LOOP. `subscriptions.update` fires `customer.subscription.updated`, and
   * the route sends that to `syncSubscription` — never back here. Asserted at the
   * ROUTE, because a handler that can re-trigger itself on a payments path is the
   * expensive kind of mistake.
   */
  it("customer.subscription.updated does not route back into this handler", () => {
    const updatedCase = route.slice(
      route.indexOf('case "customer.subscription.updated":'),
      route.indexOf('case "customer.subscription.deleted":'),
    );
    expect(updatedCase).toMatch(/syncSubscription/);
    expect(updatedCase).not.toMatch(/retryOpenInvoicesForCustomer/);
  });

  /**
   * ⚠️ IT MUST REACH THE SUBSCRIPTION. A subscription's own
   * `default_payment_method` beats the customer's, and `startTrial` creates them
   * with `save_default_payment_method: "on_subscription"` — so every paying
   * customer's subscription points at the card that just died. Setting only the
   * customer level leaves the next renewal failing.
   */
  it("it sets the SUBSCRIPTION's default payment method, not only the customer's", () => {
    expect(retryModule).toMatch(/subscriptions\.update\([\s\S]{0,80}default_payment_method: pmId/);
  });

  /**
   * ⚠️ MARKED BEFORE THE ATTEMPT, which is the opposite order to
   * `grantExtraTime` and deliberately so: stamping last fails towards a SECOND
   * CHARGE ATTEMPT, stamping first fails towards a retry that did not happen.
   */
  it("the marker is written before the payment is attempted", () => {
    const markAt = retryModule.indexOf(`[CARD_RETRY_KEY]: pmId`);
    const payAt = retryModule.indexOf("invoices.pay(");
    expect(markAt).toBeGreaterThan(0);
    expect(payAt).toBeGreaterThan(0);
    expect(markAt).toBeLessThan(payAt);
  });

  it("the concurrent guard is an idempotency key over the invoice and the card", () => {
    expect(retryModule).toMatch(/idempotencyKey: `card-retry:\$\{invoiceId\}:\$\{pmId\}`/);
  });

  it("the marker key is the one the driver reads", () => {
    expect(CARD_RETRY_KEY).toBe("trackd_card_update_retry_pm");
  });

  /**
   * ⚠️ THE STRIPPER GETS ITS OWN CONTROL, in both directions. A stripper that
   * removed everything would make every assertion above vacuous, and a stripper
   * that removed nothing would fail the `entitlements` test on a correct file.
   * `graceCopyPin.test.ts` carries the same pair for the same reason.
   */
  it("the comment stripper removes comments and keeps code", () => {
    const sample = [
      "/** entitlements are never written here */",
      'const kept = "entitlements-in-a-string";',
      "// entitlements again, in a line comment",
      "const alsoKept = 1;",
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toMatch(/never written here/);
    expect(stripped).not.toMatch(/again, in a line comment/);
    expect(stripped).toMatch(/const kept/);
    expect(stripped).toMatch(/const alsoKept/);
    // …and the raw file DOES name the table in its reasoning, which is what
    // makes the strip load-bearing rather than cosmetic.
    expect(readSync("lib/billing/cardUpdate.ts")).toMatch(/entitlements/);
  });
});

/** Block comments, line comments, and nothing else. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readSync(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}
