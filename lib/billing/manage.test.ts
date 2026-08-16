import { describe, expect, it } from "vitest";

import {
  CANCELLABLE_STATUSES,
  FLAG_CANCELLABLE_STATUSES,
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
      accessEndsEarly: false,
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
      accessEndsEarly: false,
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
      accessEndsEarly: false,
    });
  });

  it("⚠️ offers a comp the way OUT of a live subscription that is still billing", () => {
    /**
     * This asserted the opposite, on the reasoning that "a cancel button would
     * offer to end something that is not paying for it". Two independent cold
     * reviews drove what that cost: comp a paying customer and `/billing` reads
     * "Access: Complimentary" beside "$11.99 USD / month" with NO cancel control
     * and no support line, while Stripe goes on charging them.
     *
     * The premise was wrong. Cancelling does not end access — it stops a CHARGE,
     * and the comp is a separate entitlement row a Stripe cancellation can never
     * touch. `access.ts` already documents this exact defect and calls it "the
     * exact chargeback this whole area exists to avoid"; the fix there was
     * applied to expiring comps only.
     *
     * The source still decides what they are ON. The subscription decides
     * whether there is something to stop.
     */
    expect(manageActionFor("comp", sub())).toEqual({
      kind: "cancel",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
      accessEndsEarly: false,
    });
    // ...and they are still described as complimentary, because that is what
    // their access actually rests on.
    expect(planLabelFor("comp", sub())).toBe("Complimentary");
  });

  it("offers a comp NOTHING when there is genuinely nothing to stop", () => {
    // The founder the old reasoning was written for: a comp and no subscription,
    // or one Stripe has finished with. Here "nothing to manage" is the truth.
    expect(manageActionFor("comp", null)).toEqual({ kind: "none", reason: "comp" });
    expect(manageActionFor("comp", sub({ status: "canceled" }))).toEqual({
      kind: "none",
      reason: "comp",
    });
  });

  it("sends an App Store subscription to the App Store when that is all there is", () => {
    // No Stripe subscription to act on, so the pointer is the only honest control.
    expect(manageActionFor("apple", null)).toEqual({ kind: "store", store: "apple" });
    expect(manageActionFor("google", null)).toEqual({ kind: "store", store: "google" });
    expect(manageActionFor("apple", sub({ status: "canceled" }))).toEqual({
      kind: "store",
      store: "apple",
    });
  });

  it("⚠️ but an App Store source does not hide a LIVE Stripe subscription either", () => {
    /**
     * `page.tsx` suppresses even the Stripe portal row for `kind: "store"`, so
     * this cohort had no route out of the app at all while Stripe charged them.
     * Same defect as the comp one, one branch further down. Not reachable until
     * RevenueCat ships, which is precisely when nobody will be reading this.
     */
    expect(manageActionFor("apple", sub()).kind).toBe("cancel");
    expect(manageActionFor("google", sub({ status: "trialing", trialEndsAt: "2026-08-23T00:00:00.000Z" })).kind).toBe("cancel");
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

  it("the source decides what you are ON; the subscription decides what you can STOP", () => {
    // A store subscription genuinely cannot be cancelled from here, so the
    // pointer at the right place is still the only honest control.
    expect(manageActionFor("apple", sub({ status: "canceled" })).kind).toBe("store");
    // A comp beside a live trial is described as complimentary and can still be
    // stopped, because Stripe is going to charge for that trial.
    expect(manageActionFor("comp", sub({ status: "trialing", trialEndsAt: "2026-08-23T00:00:00.000Z" })).kind).toBe("cancel");
    expect(planLabelFor("comp", sub({ status: "trialing" }))).toBe("Complimentary");
  });
});

describe("⚠️ the date on screen is the EARLIER of the mirror and the entitlement", () => {
  /**
   * A cold review measured the gap on a `past_due` account: Stripe rolls the
   * period forward BEFORE the payment fails, so the mirror's
   * `current_period_end` is the end of the period nobody paid for, while
   * `markPastDue` has clawed the entitlement back to the last paid period plus
   * three days. The dialog promised "full access to your Pro plan until 15 Sept"
   * to somebody going read only on 18 Aug.
   */
  it("shortens to the entitlement when the mirror over-promises", () => {
    const action = manageActionFor(
      "stripe",
      sub({ status: "past_due", currentPeriodEnd: "2026-09-14T15:39:23.000Z" }),
      "2026-08-18T15:39:23.000Z",
    );
    expect(action).toEqual({
      kind: "cancel",
      endsOn: "2026-08-18T15:39:23.000Z",
      isTrial: false,
      // ⚠️ The date came from the entitlement, so nothing renews on it. The plan
      // card labels it "Ends on" rather than "Renews on" because of this flag.
      accessEndsEarly: true,
    });
  });

  it("never LENGTHENS from the entitlement", () => {
    // The mirror is still what the screen displays. A generous entitlement must
    // not be able to promise more than the subscription actually runs to.
    const action = manageActionFor("stripe", sub(), "2027-01-01T00:00:00.000Z");
    expect(action.kind === "cancel" && action.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("leaves the mirror alone when there is no entitlement row yet", () => {
    // The webhook lands a second later. A trial whose row has not been written
    // must not have its date pulled back to nothing in the gap.
    const withNull = manageActionFor("stripe", sub(), null);
    const without = manageActionFor("stripe", sub());
    expect(withNull).toEqual(without);
    expect(withNull.kind === "cancel" && withNull.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("ignores an entitlement that does not expire", () => {
    // `null` on a comp means "does not expire", not "expires at zero".
    const action = manageActionFor("stripe", sub(), null);
    expect(action.kind === "cancel" && action.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("ignores an unparseable entitlement date rather than shortening to NaN", () => {
    const action = manageActionFor("stripe", sub(), "not a date");
    expect(action.kind === "cancel" && action.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });
});

describe("⚠️ CANCELLABLE_STATUSES is what `cancel_at_period_end` may be set on", () => {
  /**
   * Stripe HARD-REFUSES the flag on a `paused` subscription ("Resume the
   * subscription first"), and the cancel action used to read the wider
   * `BILLABLE_STATUSES` — so one paused subscription on the customer made
   * cancelling throw and the user could not cancel at all. Two questions, two
   * lists, and this is the one the user-facing path asks.
   */
  it("holds exactly the three Stripe accepts the flag on", () => {
    expect([...CANCELLABLE_STATUSES].sort()).toEqual(["active", "past_due", "trialing"]);
  });

  it("excludes the statuses Stripe refuses or has finished with", () => {
    for (const status of ["paused", "unpaid", "incomplete", "incomplete_expired", "canceled"]) {
      expect(CANCELLABLE_STATUSES.has(status)).toBe(false);
    }
  });

  it("is the same list the screen gates its control on", () => {
    // The screen offering a control for a status set the action does not act on
    // is precisely how the paused defect stayed invisible.
    for (const status of CANCELLABLE_STATUSES) {
      expect(manageActionFor("stripe", sub({ status })).kind).toBe("cancel");
    }
    for (const status of ["paused", "unpaid", "incomplete"]) {
      expect(manageActionFor("stripe", sub({ status })).kind).toBe("unavailable");
    }
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

  it("tells a user with no entitlement they are on Pro WHILE NOTHING GATES", () => {
    // With `BILLING_GATE_ENABLED` off, nothing in the app reads `entitlements`
    // for access, so an account with no row genuinely has the whole product.
    // Saying "Free" would be the app lying about what it is giving away.
    expect(planLabelFor(null, null)).toBe("Pro");
    expect(planLabelFor(null, { status: "canceled" })).toBe("Pro");
    // But a live trial is named as one, entitlement row or not.
    expect(planLabelFor(null, { status: "trialing" })).toBe("Free trial");
  });

  it("⚠️ tells the SAME user they are READ ONLY once the gate is on", () => {
    // The tripwire the old single constant carried in its comment for four
    // days. With the gate on, that account cannot log a dose, and a screen
    // reading "Pro" would be a lie told on the one page they opened to find out
    // why they are locked out.
    expect(planLabelFor(null, null, true)).toBe("Read only");
    expect(planLabelFor(null, { status: "canceled" }, true)).toBe("Read only");
  });

  it("the gate switch changes NOTHING for anybody who actually has access", () => {
    // The switch may only ever affect the no-entitlement case. If it moved any
    // of these, turning the gate on would relabel paying customers.
    const cases: Array<[Parameters<typeof planLabelFor>[0], string | null]> = [
      ["comp", "active"],
      ["comp", null],
      ["stripe", "active"],
      ["stripe", "past_due"],
      ["stripe", "trialing"],
      ["apple", "active"],
      ["google", "active"],
      // A trial with no entitlement row yet: still a trial either way. The
      // webhook lands a second later and the screen must not flicker to
      // "Read only" in the gap.
      [null, "trialing"],
    ];
    for (const [source, status] of cases) {
      const sub = status ? { status } : null;
      expect(planLabelFor(source, sub, true)).toBe(planLabelFor(source, sub, false));
    }
  });

  it("defaults to the pre-gate answer when the switch is not passed", () => {
    // Fails in the GENEROUS direction on purpose. A caller that forgets the
    // argument over-describes access, which is a support email; the other
    // default would tell a paying user they were read-only.
    expect(planLabelFor(null, null)).toBe(planLabelFor(null, null, false));
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

describe("planLabelFor — a courtesy period is not a trial", () => {
  /**
   * The save offer gives free time by moving Stripe's `trial_end`, so a paying
   * customer who accepts one is reported as `trialing` for that stretch. Without
   * the courtesy flag the screen calls a two-year subscriber a first-time
   * trialist. Adrian, 2026-08-14: it has to say something else.
   */
  it("reads Pro for a paid customer on a free month", () => {
    expect(
      planLabelFor("stripe", {
        status: "trialing",
        courtesyUntil: "2026-09-19T00:00:00.000Z",
      }),
    ).toBe("Pro");
  });

  it("still reads Free trial for a genuine first trial", () => {
    expect(planLabelFor("stripe", { status: "trialing", courtesyUntil: null })).toBe(
      "Free trial",
    );
    // Undefined is the shape the page passes when 003 has not been applied yet.
    expect(planLabelFor("stripe", { status: "trialing" })).toBe("Free trial");
  });

  it("does not let a courtesy flag override a comp", () => {
    // A founder who also subscribes is on a comp, and describing them by the
    // subscription would be wrong whatever the subscription says.
    expect(
      planLabelFor("comp", {
        status: "trialing",
        courtesyUntil: "2026-09-19T00:00:00.000Z",
      }),
    ).toBe("Complimentary");
  });

  it("cannot invent access for somebody with no entitlement", () => {
    // The flag is cosmetic. With the gate on and no entitlement the answer is
    // still "Read only", courtesy period or not.
    expect(
      planLabelFor(null, { status: "canceled", courtesyUntil: null }, true),
    ).toBe("Read only");
  });
});

/**
 * ⚠️ THE ACTION'S SET IS WIDER THAN THE SCREEN'S, AND THE GAP IS DELIBERATE.
 *
 * D76 taught `applyCancelFlag` to void an `incomplete` subscription's open
 * invoice, and it was DEAD CODE: the action resolved its ids through
 * `CANCELLABLE_STATUSES`, which has no `incomplete`, so the void was never
 * reached and the subscription was never cancelled at all. A cold review drove
 * $69.99 through that gap while the dialog promised no charge.
 *
 * These pin the shape of the fix rather than the fix itself. The defect was not a
 * wrong function; it was a correct function nothing could reach.
 */
describe("⚠️ FLAG_CANCELLABLE_STATUSES — what the cancel ACTION acts on", () => {
  it("contains `incomplete`, which is the whole point of it existing", () => {
    // Stripe keeps an incomplete subscription's first invoice payable for ~23
    // hours. It accepts `cancel_at_period_end` on one perfectly happily.
    expect(FLAG_CANCELLABLE_STATUSES.has("incomplete")).toBe(true);
  });

  it("is a strict superset of what the SCREEN offers a control for", () => {
    for (const status of CANCELLABLE_STATUSES) {
      expect(FLAG_CANCELLABLE_STATUSES.has(status)).toBe(true);
    }
    expect(FLAG_CANCELLABLE_STATUSES.size).toBeGreaterThan(CANCELLABLE_STATUSES.size);
  });

  it("⚠️ still excludes `paused` and `unpaid`, which Stripe HARD-REFUSES the flag on", () => {
    // "You cannot set `cancel_at_period_end` while a subscription is `paused`."
    // Including either would make one paused subscription break cancelling
    // entirely, which is the defect the split originally fixed. D80 handles them
    // with an immediate cancel instead.
    expect(FLAG_CANCELLABLE_STATUSES.has("paused")).toBe(false);
    expect(FLAG_CANCELLABLE_STATUSES.has("unpaid")).toBe(false);
  });

  it("excludes the statuses Stripe has finished with", () => {
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(FLAG_CANCELLABLE_STATUSES.has(status)).toBe(false);
    }
  });

  it("leaves the SCREEN's set untouched, so widening one did not widen both", () => {
    // The class of defect this whole review found: one set answering two
    // questions gets widened for one of them and silently changes the other.
    expect([...CANCELLABLE_STATUSES].sort()).toEqual(["active", "past_due", "trialing"]);
    expect(CANCELLABLE_STATUSES.has("incomplete")).toBe(false);
  });
});
