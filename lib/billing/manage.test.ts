import { describe, expect, it } from "vitest";

import {
  formatAccessDate,
  manageActionFor,
  type ManageableSubscription,
} from "@/lib/billing/manage";

function sub(over: Partial<ManageableSubscription> = {}): ManageableSubscription {
  return {
    status: "active",
    trialEndsAt: null,
    currentPeriodEnd: "2026-09-14T15:39:23.000Z",
    cancelAtPeriodEnd: false,
    ...over,
  };
}

describe("who gets a cancel control", () => {
  it("offers cancel on a paying subscription", () => {
    expect(manageActionFor("stripe", sub())).toEqual({
      kind: "cancel",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
    });
  });

  it("offers cancel on a TRIAL, dated to the trial end", () => {
    // Not `current_period_end`, which on a trialing subscription is the date of
    // the first renewal rather than the date they stop being charged nothing.
    const action = manageActionFor(
      "stripe",
      sub({
        status: "trialing",
        trialEndsAt: "2026-08-14T15:39:23.000Z",
        currentPeriodEnd: "2026-09-14T15:39:23.000Z",
      }),
    );
    expect(action).toEqual({
      kind: "cancel",
      endsOn: "2026-08-14T15:39:23.000Z",
      isTrial: true,
    });
  });

  it("offers cancel while PAST DUE", () => {
    // Somebody whose card is failing is one of the most likely to want out.
    // Refusing the button because a charge did not land would be the app
    // arguing with them about whether they may leave.
    expect(manageActionFor("stripe", sub({ status: "past_due" })).kind).toBe("cancel");
  });

  it("offers RESUME once a cancellation is scheduled", () => {
    const action = manageActionFor("stripe", sub({ cancelAtPeriodEnd: true }));
    expect(action).toEqual({
      kind: "resume",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
    });
  });

  it("offers NOTHING to a comp, even if a Stripe row exists beside it", () => {
    // A founder who also subscribed. Their access rests on the comp, and a
    // cancel button would offer to end something that is not paying for it.
    expect(manageActionFor("comp", sub())).toEqual({ kind: "none", reason: "comp" });
  });

  it("sends an App Store subscription to the App Store", () => {
    expect(manageActionFor("apple", sub())).toEqual({ kind: "store", store: "apple" });
    expect(manageActionFor("google", sub())).toEqual({ kind: "store", store: "google" });
  });

  it("says there is nothing to manage when there is no subscription", () => {
    // Everybody in the beta today.
    expect(manageActionFor(null, null)).toEqual({
      kind: "none",
      reason: "no-subscription",
    });
  });

  it("does not offer to cancel something already ended", () => {
    for (const status of ["canceled", "incomplete_expired", "unpaid", "paused"]) {
      expect(manageActionFor("stripe", sub({ status })).kind).toBe("unavailable");
    }
  });

  it("refuses rather than showing a button that cannot name a date", () => {
    // Every confirmation states when access ends. One that cannot is worse
    // than no button.
    const action = manageActionFor(
      "stripe",
      sub({ currentPeriodEnd: null, trialEndsAt: null }),
    );
    expect(action).toEqual({ kind: "unavailable", reason: "no-period-end" });
  });

  it("the source outranks the subscription, always", () => {
    // The ordering that matters: a comp with a live Stripe row is still a comp.
    expect(manageActionFor("comp", sub({ status: "trialing" })).kind).toBe("none");
    expect(manageActionFor("apple", sub({ cancelAtPeriodEnd: true })).kind).toBe("store");
  });
});

describe("formatAccessDate", () => {
  it("prints the date in the USER's zone, not the server's", () => {
    // 15:39 UTC is already the next day in Sydney. This date is the one somebody
    // is deciding whether to be charged on, so it has to be theirs.
    const iso = "2026-08-14T15:39:23.000Z";
    expect(formatAccessDate(iso, "Australia/Sydney")).toBe("15 Aug 2026");
    expect(formatAccessDate(iso, "America/Los_Angeles")).toBe("14 Aug 2026");
  });

  it("returns empty for an unparseable date rather than 'Invalid Date'", () => {
    expect(formatAccessDate("nope", "UTC")).toBe("");
  });
});
