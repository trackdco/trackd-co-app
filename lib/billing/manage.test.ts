import { describe, expect, it } from "vitest";

import {
  CANCELLABLE_STATUSES,
  endsBefore,
  FLAG_CANCELLABLE_STATUSES,
  STOPPABLE_NOW,
  formatAccessDate,
  isBetaGrace,
  isGenuineTrial,
  manageActionFor,
  planLabelFor,
  type ManageableSubscription,
  type PlanEntitlement,
} from "@/lib/billing/manage";
import type { EntitlementSource } from "@/lib/billing/access";
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

/**
 * An entitlement for {@link planLabelFor}, which takes the ROW and not its
 * `source` — see the note on its first parameter.
 *
 * ⚠️ `activeUntil` defaults to NULL, which is free-for-life. Every case below
 * that passes a bare source is therefore asserting the comp-forever answer, and
 * a comp with a date has to say so explicitly. That is deliberate: D36's defect
 * was the two reading identically, so the dated case must never be reachable by
 * forgetting an argument.
 */
function ent(
  source: EntitlementSource | null,
  activeUntil: string | null = null,
): PlanEntitlement | null {
  return source ? { source, activeUntil } : null;
}

/** A live beta grace: a comp WITH an expiry, which is the only thing that is. */
function grace(activeUntil = "2026-08-27T00:00:00.000Z"): PlanEntitlement {
  return { source: "comp", activeUntil };
}

describe("who gets a cancel control", () => {
  it("offers cancel on a paying subscription", () => {
    expect(manageActionFor(ent("stripe"), sub())).toEqual({
      kind: "cancel",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
      namesATrial: false,
      accessEndsEarly: false,
    });
  });

  it("offers cancel on a TRIAL, dated to the trial end", () => {
    // Not `current_period_end`, which on a trialing subscription is the date of
    // the first renewal rather than the date they stop being charged nothing.
    const action = manageActionFor(ent("stripe"),
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
      namesATrial: true,
      accessEndsEarly: false,
    });
  });

  it("offers cancel while PAST DUE", () => {
    // Somebody whose card is failing is one of the most likely to want out.
    // Refusing the button because a charge did not land would be the app
    // arguing with them about whether they may leave.
    expect(manageActionFor(ent("stripe"), sub({ status: "past_due" })).kind).toBe("cancel");
  });

  it("offers RESUME once a cancellation is scheduled", () => {
    const action = manageActionFor(ent("stripe"), sub({ cancelAtPeriodEnd: true }));
    expect(action).toEqual({
      kind: "resume",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
      namesATrial: false,
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
    expect(manageActionFor(ent("comp"), sub())).toEqual({
      kind: "cancel",
      endsOn: "2026-09-14T15:39:23.000Z",
      isTrial: false,
      namesATrial: false,
      accessEndsEarly: false,
    });
    // ...and they are still described as complimentary, because that is what
    // their access actually rests on.
    expect(planLabelFor(ent("comp"), sub())).toBe("Complimentary");
  });

  it("offers a comp NOTHING when there is genuinely nothing to stop", () => {
    // The founder the old reasoning was written for: a comp and no subscription,
    // or one Stripe has finished with. Here "nothing to manage" is the truth.
    expect(manageActionFor(ent("comp"), null)).toEqual({ kind: "none", reason: "comp" });
    expect(manageActionFor(ent("comp"), sub({ status: "canceled" }))).toEqual({
      kind: "none",
      reason: "comp",
    });
  });

  it("sends an App Store subscription to the App Store when that is all there is", () => {
    // No Stripe subscription to act on, so the pointer is the only honest control.
    expect(manageActionFor(ent("apple"), null)).toEqual({ kind: "store", store: "apple" });
    expect(manageActionFor(ent("google"), null)).toEqual({ kind: "store", store: "google" });
    expect(manageActionFor(ent("apple"), sub({ status: "canceled" }))).toEqual({
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
    expect(manageActionFor(ent("apple"), sub()).kind).toBe("cancel");
    expect(manageActionFor(ent("google"), sub({ status: "trialing", trialEndsAt: "2026-08-23T00:00:00.000Z" })).kind).toBe("cancel");
  });

  it("says there is nothing to manage when there is no subscription", () => {
    // Everybody in the beta today.
    expect(manageActionFor(null, null)).toEqual({
      kind: "none",
      reason: "no-subscription",
    });
  });

  it("does not offer to cancel something already ended", () => {
    // ⚠️ `paused` and `unpaid` WERE in this list and have been removed by D80.
    // They are not ended — they are stoppable by the other mechanism, and the
    // list is about subscriptions Stripe has finished with. Their new behaviour
    // is asserted below.
    for (const status of ["canceled", "incomplete_expired"]) {
      expect(manageActionFor(ent("stripe"), sub({ status })).kind).toBe("unavailable");
    }
  });

  it("⚠️ D80: offers a control on `paused` and `unpaid`, which are stoppable now", () => {
    // Stripe refuses the period-end flag on these and accepts an immediate
    // cancel, so the app HAS a way to stop them. Leaving them at `unavailable`
    // would signpost as unstoppable a state the app can now stop — a correct fix
    // the screen cannot dispatch, which is this file's recurring defect.
    for (const status of ["paused", "unpaid"]) {
      expect(manageActionFor(ent("stripe"), sub({ status })).kind).toBe("cancel");
    }
  });

  it("⚠️ but `incomplete` still gets no control (D83)", () => {
    // It takes the flag, so the ACTION reaches it — but the screen offers
    // nothing, because the dialog cannot honestly name a date for a subscription
    // with no paid period. D83 rules the support line, and it self-heals in ~23h.
    expect(manageActionFor(ent("stripe"), sub({ status: "incomplete" })).kind).toBe("unavailable");
  });

  it("refuses rather than showing a button that cannot name a date", () => {
    // Every confirmation states when access ends. One that cannot is worse
    // than no button.
    const action = manageActionFor(ent("stripe"),
      sub({ currentPeriodEnd: null, trialEndsAt: null }),
    );
    expect(action).toEqual({ kind: "unavailable", reason: "no-period-end" });
  });

  it("the source decides what you are ON; the subscription decides what you can STOP", () => {
    // A store subscription genuinely cannot be cancelled from here, so the
    // pointer at the right place is still the only honest control.
    expect(manageActionFor(ent("apple"), sub({ status: "canceled" })).kind).toBe("store");
    // A comp beside a live trial is described as complimentary and can still be
    // stopped, because Stripe is going to charge for that trial.
    expect(manageActionFor(ent("comp"), sub({ status: "trialing", trialEndsAt: "2026-08-23T00:00:00.000Z" })).kind).toBe("cancel");
    expect(planLabelFor(ent("comp"), sub({ status: "trialing" }))).toBe("Complimentary");
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
    const action = manageActionFor(ent("stripe"),
      sub({ status: "past_due", currentPeriodEnd: "2026-09-14T15:39:23.000Z" }),
      "2026-08-18T15:39:23.000Z",
    );
    expect(action).toEqual({
      kind: "cancel",
      endsOn: "2026-08-18T15:39:23.000Z",
      isTrial: false,
      namesATrial: false,
      // ⚠️ The date came from the entitlement, so nothing renews on it. The plan
      // card labels it "Ends on" rather than "Renews on" because of this flag.
      accessEndsEarly: true,
    });
  });

  it("never LENGTHENS from the entitlement", () => {
    // The mirror is still what the screen displays. A generous entitlement must
    // not be able to promise more than the subscription actually runs to.
    const action = manageActionFor(ent("stripe"), sub(), "2027-01-01T00:00:00.000Z");
    expect(action.kind === "cancel" && action.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("leaves the mirror alone when there is no entitlement row yet", () => {
    // The webhook lands a second later. A trial whose row has not been written
    // must not have its date pulled back to nothing in the gap.
    const withNull = manageActionFor(ent("stripe"), sub(), null);
    const without = manageActionFor(ent("stripe"), sub());
    expect(withNull).toEqual(without);
    expect(withNull.kind === "cancel" && withNull.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("ignores an entitlement that does not expire", () => {
    // `null` on a comp means "does not expire", not "expires at zero".
    const action = manageActionFor(ent("stripe"), sub(), null);
    expect(action.kind === "cancel" && action.endsOn).toBe("2026-09-14T15:39:23.000Z");
  });

  it("ignores an unparseable entitlement date rather than shortening to NaN", () => {
    const action = manageActionFor(ent("stripe"), sub(), "not a date");
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
      expect(manageActionFor(ent("stripe"), sub({ status })).kind).toBe("cancel");
    }
    // ⚠️ D80 SPLIT THIS. `paused` and `unpaid` now get a control via the
    // immediate-cancel mechanism, so the screen's set is CANCELLABLE plus
    // STOPPABLE_NOW rather than CANCELLABLE alone. `incomplete` is the one that
    // the action reaches and the screen still does not offer (D83).
    for (const status of STOPPABLE_NOW) {
      expect(manageActionFor(ent("stripe"), sub({ status })).kind).toBe("cancel");
    }
    expect(manageActionFor(ent("stripe"), sub({ status: "incomplete" })).kind).toBe("unavailable");
  });
});

describe("planLabelFor — Profile and Billing must agree", () => {
  it("says the same thing on both screens for the same user", () => {
    // The defect this replaced: Profile hardcoded "Beta · Pro" from
    // `profiles.tier` while /billing read the entitlement, so one user was told
    // two different things depending which screen they were on.
    const cases: Array<[EntitlementSource | null, string | null, string]> = [
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
      expect(planLabelFor(ent(source), status ? { status } : null)).toBe(expected);
    }
  });

  it("carries NO 'Beta' anywhere", () => {
    // Adrian, 2026-08-12: "we won't be in beta by then."
    const sources = ["comp", "stripe", "apple", "google", null] as const;
    const statuses = ["trialing", "active", "past_due", "canceled", null];
    for (const s of sources) {
      for (const st of statuses) {
        const label = planLabelFor(ent(s), st ? { status: st } : null);
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
    const cases: Array<[EntitlementSource | null, string | null]> = [
      ["comp", "active"],
      ["comp", null],
      ["stripe", "active"],
      ["stripe", "past_due"],
      ["stripe", "trialing"],
      ["apple", "active"],
      ["google", "active"],
      /**
       * ⚠️ `[null, "trialing"]` WAS HERE AND HAS BEEN REMOVED BY FOUNDER RULING.
       *
       * It asserted that a trial with no entitlement row reads "Free trial"
       * either side of the switch, reasoning that "the webhook lands a second
       * later and the screen must not flicker to Read only in the gap".
       *
       * That reasoning is sound for the gap it describes and **cannot tell that
       * gap apart from the state that never closes.** A trial whose 3D Secure was
       * abandoned sits `trialing` in the mirror with no entitlement until Stripe
       * expires it, and read "Free trial" the whole time — on the one screen
       * somebody opens to find out why they are locked out.
       *
       * The two states are indistinguishable from the mirror, so the choice is
       * which way to be wrong: a flicker of about a second for a legitimate new
       * trial, or a permanent falsehood for an abandoned one. The ruling takes
       * the flicker. Covered by its own case below.
       */
    ];
    for (const [source, status] of cases) {
      const sub = status ? { status } : null;
      expect(planLabelFor(ent(source), sub, true)).toBe(planLabelFor(ent(source), sub, false));
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
    expect(planLabelFor(ent("comp"), { status: "trialing" })).toBe("Complimentary");
  });
});

/**
 * ⚠️ D36 / §3.6 — A FOUNDER AND A FORTNIGHT MUST NOT READ THE SAME.
 *
 * §3.6 calls this a DEFECT rather than a gap: "'Complimentary' is returned on the
 * first branch for any comp entitlement, and that branch never looks at whether
 * the entitlement expires. A free-for-life account and a fortnight that runs out
 * in two days read identically."
 *
 * ⚠️ THESE ASSERTIONS ARE INVISIBLE TO THE DEFECT ON THEIR OWN. Both comp states
 * once returned "Complimentary", so a one-sided test for the free-for-life answer
 * passed throughout. Every case here therefore names its COUNTERPART, and the
 * last test asserts the two labels differ as a value rather than by re-stating
 * either string.
 */
describe("⚠️ D36: the two comp states, and the one that expires", () => {
  it("free for life reads Complimentary, with no date and no expiry language", () => {
    expect(planLabelFor(ent("comp"), null)).toBe("Complimentary");
    // CONTROL: the same account WITH a date is the other state entirely.
    expect(planLabelFor(grace(), null)).toBe("On us");
  });

  it("a live beta grace reads the signed days-on-us vocabulary", () => {
    expect(planLabelFor(grace(), null)).toBe("On us");
    // ⚠️ D36's one absolute rule: the word never renders for anyone not on one.
    expect(planLabelFor(grace(), null).toLowerCase()).not.toContain("trial");
    // Nor does it borrow the founder's word, which is the whole defect.
    expect(planLabelFor(grace(), null)).not.toBe("Complimentary");
  });

  it("a mid-grace subscriber reads the PLAN, never a trial", () => {
    // §3.6: a grace-aligned `trialing` subscription "names the plan and its
    // server-sourced start date". They are inside their fortnight with a plan
    // waiting behind it, and they are not on a trial.
    expect(planLabelFor(grace(), { status: "trialing" })).toBe("Pro");
    // CONTROL: the same grace with NO subscription is still the grace, so the
    // subscription is genuinely what moved the answer.
    expect(planLabelFor(grace(), null)).toBe("On us");
    // CONTROL: the same `trialing` status on a real subscriber is a real trial,
    // so this has not simply deleted the trial label.
    expect(planLabelFor(ent("stripe"), { status: "trialing" })).toBe("Free trial");
  });

  it("a grace that has been consumed reads the plan once it is active", () => {
    // The label flips to the standard active answer when the plan starts, which
    // is `strongestEntitlement` handing over to the `stripe` row.
    expect(planLabelFor(ent("stripe"), { status: "active" })).toBe("Pro");
  });

  it("⚠️ the two comp labels are different STRINGS, whatever they say", () => {
    /**
     * The regression this is really for: somebody tidying two literals into one
     * constant, or restoring the single-branch version. Asserting the two are
     * unequal survives a wording change; asserting either string does not.
     */
    const forever = planLabelFor(ent("comp"), null);
    const fortnight = planLabelFor(grace(), null);
    expect(forever).not.toBe(fortnight);
    // And neither is empty, which would make the inequality above vacuous.
    expect(forever.length).toBeGreaterThan(0);
    expect(fortnight.length).toBeGreaterThan(0);
  });

  it("isBetaGrace is the predicate deciding it, and it is ONE function", () => {
    // Moved here from `betaGrace.ts` so the display module can reach it; that
    // module re-exports it, so `graceAsTrial`, the dashboard and the reminder
    // runner all still ask the same question. §3.6: "Import it."
    expect(isBetaGrace({ source: "comp", activeUntil: "2026-08-27T00:00:00Z" })).toBe(true);
    expect(isBetaGrace({ source: "comp", activeUntil: null })).toBe(false);
    expect(isBetaGrace(null)).toBe(false);
    // A paid subscriber's entitlement also carries a date. Only `comp` is a grace.
    expect(isBetaGrace({ source: "stripe", activeUntil: "2027-08-13T00:00:00Z" })).toBe(false);
  });

  it("⚠️ every comp label fits Profile's pill, which truncates past ~35 characters", () => {
    // §3.6 records the constraint "so the next person adding a state checks it
    // rather than discovering it". This is that check.
    for (const label of [
      planLabelFor(ent("comp"), null),
      planLabelFor(grace(), null),
      planLabelFor(grace(), { status: "trialing" }),
    ]) {
      expect(label.length).toBeLessThanOrEqual(35);
      // No date reaches the pill: the shared function answers the state only.
      expect(label).not.toMatch(/\d/);
    }
  });
});

/**
 * ⚠️ THREE STATES ARRIVE AS `trialing` AND ONE OF THEM IS A TRIAL.
 *
 * Found by driving, not by this suite: the plan card rendered a "Trial ends" row
 * off Stripe's status directly, so a mid-grace subscriber read "Access Pro /
 * Starts 20 Aug / Trial ends 20 Aug" — the forbidden word two rows under the fix
 * for it, and the same date twice. `planLabelFor` now branches on this same
 * function, so the label and the row cannot answer differently.
 */
describe("⚠️ isGenuineTrial — the question D36 actually turns on", () => {
  it("a first-timer's seven days IS a trial", () => {
    expect(isGenuineTrial(ent("stripe"), { status: "trialing" })).toBe(true);
    // And before the entitlement row lands, which is a real window.
    expect(isGenuineTrial(null, { status: "trialing" })).toBe(true);
  });

  it("a courtesy period is NOT, however Stripe describes it", () => {
    expect(
      isGenuineTrial(ent("stripe"), {
        status: "trialing",
        courtesyUntil: "2026-09-15T00:00:00Z",
      }),
    ).toBe(false);
    // CONTROL: the identical subscription without the marker is a real trial, so
    // the marker is what moved the answer.
    expect(isGenuineTrial(ent("stripe"), { status: "trialing", courtesyUntil: null })).toBe(true);
  });

  it("a grace-aligned subscription is NOT", () => {
    expect(isGenuineTrial(grace(), { status: "trialing" })).toBe(false);
    // CONTROL: the same subscription under a free-for-life comp is not a grace,
    // so `isBetaGrace` is what moved the answer and not the source alone.
    expect(isGenuineTrial(ent("comp"), { status: "trialing" })).toBe(true);
  });

  it("nothing that is not trialing is a trial", () => {
    for (const status of ["active", "past_due", "paused", "unpaid", "canceled", "incomplete"]) {
      expect(isGenuineTrial(ent("stripe"), { status })).toBe(false);
    }
    expect(isGenuineTrial(ent("stripe"), null)).toBe(false);
  });

  it("⚠️ the label NEVER says trial unless this says so — one direction only", () => {
    /**
     * ⚠️ THIS ASSERTED THE BICONDITIONAL AND FAILED, CORRECTLY, ON ONE CASE.
     *
     * A free-for-life comp holding a live `trialing` Stripe subscription labels
     * as "Complimentary" — that is what their access rests on — while
     * `isGenuineTrial` says true, because the subscription really is a trial and
     * really will convert to a charge. **Both answers are right**, and they are
     * right about different questions: "what does this person's access rest on"
     * and "is this subscription a trial". That is the same two-questions split
     * `CANCELLABLE_STATUSES` and `BILLABLE_STATUSES` exist for, and collapsing it
     * would hide a real trial's end date from the one cohort being charged
     * while labelled complimentary.
     *
     * D36's rule is one-directional and this is it: the word never renders for
     * anyone who is not on a trial. Nothing requires the converse.
     */
    const cases: Array<
      [PlanEntitlement | null, Parameters<typeof isGenuineTrial>[1]]
    > = [
      [ent("stripe"), { status: "trialing" }],
      [ent("stripe"), { status: "trialing", courtesyUntil: "2026-09-15T00:00:00Z" }],
      [grace(), { status: "trialing" }],
      [ent("comp"), { status: "trialing" }],
      [ent("stripe"), { status: "active" }],
      [null, { status: "trialing" }],
    ];
    for (const [e, s] of cases) {
      if (planLabelFor(e, s) === "Free trial") {
        expect(isGenuineTrial(e, s)).toBe(true);
      }
    }
    // CONTROL: the loop above is vacuous unless the label really does say
    // "Free trial" for somebody in this set.
    expect(cases.filter(([e, s]) => planLabelFor(e, s) === "Free trial").length).toBeGreaterThan(0);
    // And the deliberate asymmetry is asserted rather than left implicit.
    expect(isGenuineTrial(ent("comp"), { status: "trialing" })).toBe(true);
    expect(planLabelFor(ent("comp"), { status: "trialing" })).toBe("Complimentary");
  });
});

/**
 * ⚠️ F1 — TWO QUESTIONS, TWO ANSWERS, AND NEITHER MAY EAT THE OTHER.
 *
 * `isTrial` is the DATE question (access ends at `trial_ends_at`, and a date row
 * already states it above). `namesATrial` is the COPY question (may `03`'s
 * control call this a trial?). Feeding the noun from the date answer called a
 * beta fortnight and a two-year customer's courtesy month a trial — driven, both
 * cohorts reading "Cancel my trial".
 */
describe("⚠️ manageActionFor: the date question and the copy question", () => {
  const trialing = (over = {}) =>
    sub({ status: "trialing", trialEndsAt: "2026-08-27T00:00:00.000Z", ...over });

  it("a genuine trial answers YES to both", () => {
    const a = manageActionFor(ent("stripe"), trialing());
    expect(a).toMatchObject({ isTrial: true, namesATrial: true });
  });

  it("a courtesy period ends on the trial date but is NOT named a trial", () => {
    const a = manageActionFor(
      ent("stripe"),
      trialing({ courtesyUntil: "2026-08-27T00:00:00.000Z" }),
    );
    // The DATE question stays yes — their access really does end there, and
    // reading `current_period_end` instead would name a day after it stopped.
    expect(a).toMatchObject({ isTrial: true, namesATrial: false });
    expect("endsOn" in a && a.endsOn).toBe("2026-08-27T00:00:00.000Z");
  });

  it("a beta fortnight ends on the trial date but is NOT named a trial", () => {
    const a = manageActionFor(grace(), trialing());
    expect(a).toMatchObject({ isTrial: true, namesATrial: false });
    expect("endsOn" in a && a.endsOn).toBe("2026-08-27T00:00:00.000Z");
  });

  it("⚠️ CONTROL: the two answers are not simply the same field twice", () => {
    // If a refactor ever collapses them, this is what fails. It needs a case
    // where they genuinely differ, which the two above are.
    const courtesy = manageActionFor(
      ent("stripe"),
      trialing({ courtesyUntil: "2026-08-27T00:00:00.000Z" }),
    );
    expect("isTrial" in courtesy && courtesy.isTrial).not.toBe(
      "namesATrial" in courtesy && courtesy.namesATrial,
    );
    // ...and a case where they agree, so "always differ" is not the fix either.
    const real = manageActionFor(ent("stripe"), trialing());
    expect("isTrial" in real && real.isTrial).toBe(
      "namesATrial" in real && real.namesATrial,
    );
  });
});

/**
 * ⚠️ F3 — "Renews on {date}" IS A CLAIM ABOUT WHAT HAPPENS NEXT.
 *
 * `accessEndsEarly` asked "is this `past_due`", which is one instance of the
 * question rather than the question. Driven: a `paused` subscription read
 * "Renews on 17 Sept 2026" while charging nobody, and D80 means the control ends
 * it immediately. Same false claim `40e961d` fixed for `past_due`, one status
 * across.
 */
describe("⚠️ accessEndsEarly asks whether anything RENEWS", () => {
  it("nothing renews while paused or unpaid, so the date is an end", () => {
    for (const status of ["paused", "unpaid"]) {
      const a = manageActionFor(ent("stripe"), sub({ status }));
      expect(a).toMatchObject({ kind: "cancel", accessEndsEarly: true });
    }
  });

  it("nor while past due, which is the case that was already right", () => {
    expect(manageActionFor(ent("stripe"), sub({ status: "past_due" }))).toMatchObject({
      accessEndsEarly: true,
    });
  });

  it("⚠️ CONTROL: an active subscription DOES renew and must still say so", () => {
    // Without this, "everything ends early" passes every assertion above and
    // every paying customer is told their plan is ending.
    expect(manageActionFor(ent("stripe"), sub({ status: "active" }))).toMatchObject({
      accessEndsEarly: false,
    });
  });

  it("⚠️ CONTROL: a diverging entitlement still shortens, independently of status", () => {
    // The other half of the condition, which the renewal question must not have
    // swallowed: an active subscription whose entitlement was clawed back.
    expect(
      manageActionFor(ent("stripe"), sub({ status: "active" }), "2026-08-20T00:00:00.000Z"),
    ).toMatchObject({ accessEndsEarly: true, endsOn: "2026-08-20T00:00:00.000Z" });
  });

  it("⚠️ NO FIFTH STATUS SET was minted to answer it", () => {
    /**
     * The renewal question is composed from the sets that already exist —
     * `STOPPABLE_NOW`, the `past_due` status and `DEAD_STATUSES`. This asserts
     * the composition still lines up with `STOPPABLE_NOW` rather than having
     * quietly grown a private list beside it, which is how the next defect gets
     * written.
     */
    for (const status of STOPPABLE_NOW) {
      expect(manageActionFor(ent("stripe"), sub({ status }))).toMatchObject({
        accessEndsEarly: true,
      });
    }
    // And a status in neither set renews, so the sets are doing the deciding.
    expect(STOPPABLE_NOW.has("active")).toBe(false);
    expect(manageActionFor(ent("stripe"), sub({ status: "active" }))).toMatchObject({
      accessEndsEarly: false,
    });
  });
});

/**
 * ⚠️ D36's OTHER HALF: identical in consequence must read identically.
 *
 * Three ways to have no access, and a user can do exactly the same things in all
 * three. Giving any of them its own label would be the screen inventing a
 * distinction the product does not honour.
 */
describe("⚠️ D36: the three read-only states are one label", () => {
  it("never had access, ran out, and was taken away all read the same", () => {
    // All three reach `planLabelFor` as "no active entitlement", because
    // `strongestEntitlement` filters to rows active right now — an expired row
    // and a revoked one are both absent from its answer, exactly like a user who
    // never had one.
    const neverHad = planLabelFor(null, null, true);
    const ranOut = planLabelFor(null, { status: "canceled" }, true);
    const revoked = planLabelFor(null, { status: "active" }, true);
    expect(neverHad).toBe("Read only");
    expect(ranOut).toBe("Read only");
    expect(revoked).toBe("Read only");
    // CONTROL: the label is capable of saying something else, so the three
    // matching is a decision rather than a function that only ever returns one
    // string.
    expect(planLabelFor(ent("stripe"), { status: "active" }, true)).toBe("Pro");
  });

  it("the exact phrase, two words, lower-case second word", () => {
    // Matches the pop-up and the server's refusal message. Never "paused",
    // "expired" or "locked".
    const label = planLabelFor(null, null, true);
    expect(label).toBe("Read only");
    for (const forbidden of ["paused", "expired", "locked", "read-only"]) {
      expect(label.toLowerCase()).not.toContain(forbidden);
    }
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
      planLabelFor(ent("stripe"), {
        status: "trialing",
        courtesyUntil: "2026-09-19T00:00:00.000Z",
      }),
    ).toBe("Pro");
  });

  it("still reads Free trial for a genuine first trial", () => {
    expect(planLabelFor(ent("stripe"), { status: "trialing", courtesyUntil: null })).toBe(
      "Free trial",
    );
    // Undefined is the shape the page passes when 003 has not been applied yet.
    expect(planLabelFor(ent("stripe"), { status: "trialing" })).toBe("Free trial");
  });

  it("does not let a courtesy flag override a comp", () => {
    // A founder who also subscribes is on a comp, and describing them by the
    // subscription would be wrong whatever the subscription says.
    expect(
      planLabelFor(ent("comp"), {
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

/**
 * ⚠️ 2.3 — THE MIRROR MUST NOT ANSWER THE ACCESS QUESTION BEFORE THE GATE DOES.
 *
 * `planLabelFor`'s gate branch sat at the bottom, under two checks that read the
 * mirror. So with the gate ON, an account with no entitlement row was told it was
 * on a "Free trial" purely because a `trialing` row existed in the mirror —
 * driven with a real trialing subscription whose 3D Secure was abandoned, which
 * Stripe leaves standing until it expires.
 *
 * `entitlements` is the only table that decides access. Asking Stripe's status
 * first is the same inversion that produced the `/billing` filter defect.
 */
describe("⚠️ planLabelFor: gate on plus no entitlement is Read only, before any mirror read", () => {
  const trialing = { status: "trialing" as const, courtesyUntil: null };

  it("says Read only for a trialing mirror row with NO entitlement, gate ON", () => {
    expect(planLabelFor(null, trialing, true)).toBe("Read only");
  });

  it("says Read only for a courtesy mirror row with NO entitlement, gate ON", () => {
    expect(planLabelFor(null, { status: "trialing", courtesyUntil: "2026-09-01T00:00:00Z" }, true))
      .toBe("Read only");
  });

  it("says Read only with no subscription at all, gate ON", () => {
    expect(planLabelFor(null, null, true)).toBe("Read only");
  });

  it("⚠️ leaves the PRE-GATE world exactly as it was", () => {
    // ~90 real accounts are here today. With the gate off nothing is withheld,
    // so the mirror checks still run and still answer.
    expect(planLabelFor(null, trialing, false)).toBe("Free trial");
    expect(planLabelFor(null, null, false)).toBe("Pro");
  });

  it("does not touch anybody who actually holds an entitlement", () => {
    // A comp is a source and is entitled: still Complimentary, gate or no gate.
    expect(planLabelFor(ent("comp"), trialing, true)).toBe("Complimentary");
    expect(planLabelFor(ent("comp"), null, true)).toBe("Complimentary");
    // A stripe entitlement on a courtesy period still reads Pro, not Free trial.
    expect(planLabelFor(ent("stripe"), { status: "trialing", courtesyUntil: "2026-09-01T00:00:00Z" }, true))
      .toBe("Pro");
    // And a real trial with its entitlement written still says so.
    expect(planLabelFor(ent("stripe"), trialing, true)).toBe("Free trial");
  });
});

/**
 * ⚠️ THE COST OF 2.3's RULING, PINNED SO IT IS NOT REDISCOVERED AS A BUG.
 *
 * A legitimately new trial has a mirror row before its entitlement row exists,
 * and in that gap the label now reads "Read only". That is a DELIBERATE trade,
 * not an oversight: the same state is produced by an abandoned 3D Secure attempt
 * that never gets an entitlement at all, and the mirror cannot tell the two
 * apart. A second of flicker is the cheaper way to be wrong than a permanent
 * "Free trial" shown to somebody who is actually locked out.
 */
describe("2.3's deliberate cost: the webhook gap now reads Read only", () => {
  it("shows Read only in the gap between a trial being created and its entitlement landing", () => {
    expect(planLabelFor(null, { status: "trialing", courtesyUntil: null }, true)).toBe("Read only");
  });

  it("and reads Free trial the moment the entitlement row exists", () => {
    expect(planLabelFor(ent("stripe"), { status: "trialing", courtesyUntil: null }, true)).toBe("Free trial");
  });
});

/**
 * ⚠️ THE EQUIVALENCE PIN FOR `accessEndsEarly`'s MOVE FROM STRINGS TO INSTANTS.
 *
 * `accessEndsEarly` read `endsOn !== mirrorEnd`. That was a STRING comparison, and
 * the two dates arrive in different serialisations by construction:
 *
 *   mirrorEnd   raw from PostgREST, MICROSECOND precision and `+00:00`
 *   endsOn      round-tripped through `toISOString()`, MILLISECOND and `Z`
 *
 * It was nevertheless correct, because `soonerOf` returns one of its inputs
 * verbatim and tie-breaks to the first — so the comparison was an identity test
 * over a decision already made on instants. Two undocumented dependencies, either
 * of which a tidy-up would break: normalise the return and every paying customer
 * with a microsecond mirror reads "Ends on"; flip the tie-break and the branch
 * inverts for every account whose rows hold the same instant.
 *
 * ⚠️ THESE FIVE ROWS ARE THE MEASURED BEHAVIOUR OF THE OLD STRING COMPARISON,
 * taken BEFORE the change. The new instant comparison must reproduce every one of
 * them. A difference here does not mean "update the expectation" — it means the
 * reasoning about `soonerOf` was wrong and the change needs re-thinking.
 */
describe("⚠️ accessEndsEarly compares INSTANTS, and matches the old string compare exactly", () => {
  /** Microsecond precision and a `+00:00` offset, as PostgREST returns it. */
  const MIRROR_PG = "2027-08-18T05:55:22.247123+00:00";
  /** The same instant, as `deriveEntitlementFacts` round-trips it. */
  const ENT_ROUNDTRIPPED = new Date(Date.parse(MIRROR_PG)).toISOString();

  const at = (entitlementActiveUntil: string | null) =>
    manageActionFor(
      null,
      {
        status: "active",
        trialEndsAt: null,
        currentPeriodEnd: MIRROR_PG,
        cancelAtPeriodEnd: false,
      },
      entitlementActiveUntil,
    );
  const early = (a: ReturnType<typeof manageActionFor>) =>
    a.kind === "cancel" || a.kind === "resume" ? a.accessEndsEarly : "n/a";

  it("ARRIVAL: the two serialisations really are the same instant and different strings", () => {
    // Without this the whole block could be comparing two identical strings and
    // proving nothing about serialisation at all.
    expect(Date.parse(MIRROR_PG)).toBe(Date.parse(ENT_ROUNDTRIPPED));
    expect(MIRROR_PG).not.toBe(ENT_ROUNDTRIPPED);
  });

  it("same instant, DIFFERENT serialisations -> false", () => {
    expect(early(at(ENT_ROUNDTRIPPED))).toBe(false);
  });

  it("same instant, same string -> false", () => {
    expect(early(at(MIRROR_PG))).toBe(false);
  });

  it("entitlement 1ms EARLIER -> true", () => {
    expect(early(at(new Date(Date.parse(MIRROR_PG) - 1).toISOString()))).toBe(true);
  });

  it("entitlement 1ms LATER -> false", () => {
    expect(early(at(new Date(Date.parse(MIRROR_PG) + 1).toISOString()))).toBe(false);
  });

  it("entitlement null -> false", () => {
    expect(early(at(null))).toBe(false);
  });

  /**
   * ⚠️ THE CONTROL, AND THE FIRST VERSION OF IT WAS VACUOUS.
   *
   * It passed `normalised` as the ENTITLEMENT date and asserted the answer was
   * unchanged — which passes under BOTH implementations, because `soonerOf` still
   * returns `mirrorEnd` verbatim either way, so `endsOn !== mirrorEnd` is still an
   * identity test. **It distinguished nothing.** Measured by reverting line 522 to
   * the string comparison: 81/81 passed with it too.
   *
   * The fragility does not live in `accessEndsEarly`; it lives in the SHAPE OF
   * `soonerOf`'s RETURN. So the control has to be at the comparison itself, where
   * the two implementations genuinely differ:
   *
   *   old, on the pair a normalised `soonerOf` would hand it:
   *     "….247Z" !== "….247123+00:00"        -> TRUE   ("Ends on", wrongly)
   *   new, on the same pair:
   *     endsBefore("….247Z", "….247123+00:00") -> FALSE ("Renews on", correctly)
   *
   * That is the whole change, asserted rather than argued.
   */
  it("⚠️ CONTROL: on the pair a normalised soonerOf would produce, the two differ", () => {
    const normalised = new Date(Date.parse(MIRROR_PG)).toISOString();
    expect(normalised, "the two spellings are identical, so this proves nothing").not.toBe(
      MIRROR_PG,
    );
    // What the OLD comparison would have answered on that pair.
    expect(normalised !== MIRROR_PG, "the old string compare claimed access ends early").toBe(
      true,
    );
    // What the NEW one answers.
    expect(
      endsBefore(normalised, MIRROR_PG),
      "the instant comparison must see the same instant and answer false",
    ).toBe(false);
  });

  it("⚠️ endsBefore compares instants, in both directions", () => {
    const base = "2027-08-18T05:55:22.247123+00:00";
    expect(endsBefore(new Date(Date.parse(base) - 1).toISOString(), base)).toBe(true);
    expect(endsBefore(new Date(Date.parse(base) + 1).toISOString(), base)).toBe(false);
    expect(endsBefore(new Date(Date.parse(base)).toISOString(), base)).toBe(false);
    // ⚠️ Unparseable errs towards "something ends early", which WITHHOLDS a
    // renewal claim rather than making one. Stated in the function and pinned here.
    expect(endsBefore("not a date", base)).toBe(true);
    expect(endsBefore(base, "not a date")).toBe(true);
  });
});
