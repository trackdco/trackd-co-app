import { describe, expect, it } from "vitest";

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

  it("it asks Stripe only for OPEN invoices, and stops when there are none", () => {
    expect(retryModule).toMatch(/status: "open"/);
    expect(retryModule).toMatch(/if \(open\.length === 0\)/);
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
