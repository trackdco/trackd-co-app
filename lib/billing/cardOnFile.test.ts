import { describe, expect, it } from "vitest";

import { attachedCard, pointedCard } from "./cardOnFile";

/**
 * ⚠️ THE ROW SAID "None on file" TO SOMEBODY WHOSE CARD WAS STORED.
 *
 * Adrian, 2026-08-27, against his own live `trialing` subscription. `cardOnFile`
 * read `customer.invoice_settings.default_payment_method` and nothing else, and
 * that field is null for every trial subscriber by design — `startTrial` uses
 * `save_default_payment_method: "on_subscription"`, which sets a default when an
 * invoice is paid, and a trial pays none.
 *
 * ⚠️ THE OBVIOUS FIX WAS MEASURED AND DISCARDED. `startTrial`'s exact
 * `subscriptions.create` was replayed against real Stripe and its
 * `pending_setup_intent` confirmed with a card:
 *
 *     customer.invoice_settings.default_payment_method  null
 *     subscription.default_payment_method               null   <- the obvious fix
 *     customer's attached card payment methods          visa ****4242
 *
 * A confirmed trial's card is pointed at by NOTHING. These pin the order that
 * follows from that, so nobody restores a one-field read.
 */

const visa = {
  id: "pm_visa",
  type: "card",
  card: { brand: "visa", last4: "4242" },
} as never;

const amex = {
  id: "pm_amex",
  type: "card",
  card: { brand: "amex", last4: "0005" },
} as never;

const sub = (status: string, pm: unknown) =>
  ({ status, default_payment_method: pm }) as never;

describe("what a subscription points at wins", () => {
  it("a billable subscription's own card beats the customer default", () => {
    expect(pointedCard([sub("active", visa)], amex)).toEqual({
      brand: "Visa",
      last4: "4242",
    });
  });

  it("falls to the customer default when no subscription points anywhere", () => {
    expect(pointedCard([sub("active", null)], amex)).toEqual({
      brand: "Amex",
      last4: "0005",
    });
  });

  /**
   * ⚠️ THE SET IS `BILLABLE_STATUSES`, so a cancelled subscription's stale
   * pointer is NOT the card on file. Showing it would name a card against a
   * subscription that can no longer charge anybody.
   */
  it("ignores a cancelled subscription's stale pointer", () => {
    expect(pointedCard([sub("canceled", visa)], null)).toBeNull();
  });

  it("`trialing` IS billable, so a trial that has a pointer is read", () => {
    expect(pointedCard([sub("trialing", visa)], null)).toEqual({
      brand: "Visa",
      last4: "4242",
    });
  });

  /** The measured shape: nothing points anywhere. Step 3 has to run. */
  it("returns null for the confirmed-trial shape, so the caller looks further", () => {
    expect(pointedCard([sub("trialing", null)], null)).toBeNull();
  });

  /** An unexpanded field is a bug in the request, not a card to chase. */
  it("treats a bare string id as absent rather than following it", () => {
    expect(pointedCard([sub("active", "pm_visa")], null)).toBeNull();
  });
});

describe("the attached card, and the refusal to guess", () => {
  it("one attached card is unambiguous and is shown", () => {
    expect(attachedCard([visa])).toEqual({ brand: "Visa", last4: "4242" });
  });

  /**
   * ⚠️ THE REFUSAL. With no pointer anywhere and two cards attached, STRIPE
   * ITSELF does not know which it would charge. Printing one would invent a fact
   * about somebody's money.
   */
  it("refuses to pick between two attached cards with no default anywhere", () => {
    expect(attachedCard([visa, amex])).toBeNull();
  });

  it("no cards attached is simply none", () => {
    expect(attachedCard([])).toBeNull();
  });
});

describe("brands", () => {
  it("capitalises Stripe's slug for display", () => {
    expect(attachedCard([amex])?.brand).toBe("Amex");
  });

  it("an unknown brand falls back to a plain 'Card' rather than a raw slug", () => {
    const odd = { id: "pm_x", type: "card", card: { brand: "elo", last4: "1111" } } as never;
    expect(attachedCard([odd])).toEqual({ brand: "Card", last4: "1111" });
  });

  it("a non-card payment method is not a card on file", () => {
    const link = { id: "pm_link", type: "link", link: {} } as never;
    expect(attachedCard([link])).toBeNull();
  });
});
