import { describe, expect, it } from "vitest";

import {
  formatAccessDate,
  manageActionFor,
  planLabelFor,
  type ManageableSubscription,
} from "@/lib/billing/manage";
import {
  dismissedTrialNoticeDate,
  trialNoticeDismissalValue,
} from "@/lib/billing/trialNoticeStore";

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

describe("planLabelFor — Profile and Billing must agree", () => {
  it("says the same thing on both screens for the same user", () => {
    // The defect this replaced: Profile hardcoded "Beta · Pro" from
    // `profiles.tier` while /billing read the entitlement, so one user was told
    // two different things depending which screen they were on.
    const cases: Array<[Parameters<typeof planLabelFor>[0], string | null, string]> = [
      ["comp", "active", "Complimentary"],
      ["comp", "trialing", "Complimentary"],
      ["comp", null, "Complimentary"],
      ["stripe", "trialing", "Free trial"],
      // A running trial says so even before the entitlement row lands.
      [null, "trialing", "Free trial"],
      ["stripe", "active", "Pro"],
      ["stripe", "past_due", "Pro"],
      ["apple", "active", "Pro"],
      ["google", "active", "Pro"],
    ];
    for (const [source, status, expected] of cases) {
      expect(planLabelFor(source, status ? { status } : null)).toBe(expected);
    }
  });

  it("carries NO 'Beta' anywhere", () => {
    // Adrian, 2026-08-12: "we won't be in beta by then."
    const sources = ["comp", "stripe", "apple", "google", null] as const;
    const statuses = ["trialing", "active", "past_due", "canceled", null];
    for (const s of sources) {
      for (const st of statuses) {
        const label = planLabelFor(s, st ? { status: st } : null);
        expect(label.toLowerCase()).not.toContain("beta");
        expect(label).not.toContain("·");
      }
    }
  });

  it("tells a user with no entitlement they are on Pro", () => {
    // TRUE today and only today: nothing in the app reads `entitlements`, so
    // every account genuinely has the whole product. Whoever wires `hasProAccess`
    // into the layout must change this in the same commit. See the constant's
    // comment in manage.ts.
    expect(planLabelFor(null, null)).toBe("Pro");
    expect(planLabelFor(null, { status: "canceled" })).toBe("Pro");
    // But a live trial is named as one, entitlement row or not.
    expect(planLabelFor(null, { status: "trialing" })).toBe("Free trial");
  });

  it("a comp beside a live trial still reads as the comp", () => {
    // Their access rests on the comp; describing them by the subscription would
    // be wrong, and `strongestEntitlement` has already made that choice.
    expect(planLabelFor("comp", { status: "trialing" })).toBe("Complimentary");
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

describe("dismissedTrialNoticeDate — a dismissal belongs to ONE account", () => {
  const A = "11111111-1111-1111-1111-111111111111";
  const B = "22222222-2222-2222-2222-222222222222";

  it("returns the date for the account that dismissed it", () => {
    expect(dismissedTrialNoticeDate(`${A}:2026-08-13`, A)).toBe("2026-08-13");
  });

  it("returns NOTHING for a different account on the same browser", () => {
    /**
     * The leak a cold review found. Two accounts signed into one browser, both
     * trials ending on the same day: A's dismissal hid B's banner, and the thing
     * being hidden is the only in-app warning that a card is about to be charged.
     *
     * The first fix matched the cookie by its `:${date}` suffix, which looks
     * equivalent and matches on the date alone — so it did not fix this at all.
     * Measured again after the real fix.
     */
    expect(dismissedTrialNoticeDate(`${A}:2026-08-13`, B)).toBeNull();
  });

  it("ignores a malformed or absent cookie rather than trusting it", () => {
    for (const value of [null, undefined, "", "2026-08-13", "garbage"]) {
      expect(dismissedTrialNoticeDate(value, A)).toBeNull();
    }
  });

  it("round-trips whatever the writer stored", () => {
    expect(dismissedTrialNoticeDate(trialNoticeDismissalValue(A, "2026-12-01"), A)).toBe(
      "2026-12-01",
    );
  });
});
