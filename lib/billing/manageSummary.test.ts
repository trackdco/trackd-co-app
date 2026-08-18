import { describe, expect, it } from "vitest";

import { BETA_GRACE_DAYS } from "./betaGrace";
import { manageActionFor } from "./manage";
import {
  manageSummaryFor,
  summaryStateFor,
  type SummaryFacts,
  type SummaryState,
} from "./manageSummary";

/**
 * ⚠️ MANAGE'S TWELVE SIGNED SENTENCES, ASSERTED AGAINST THE STATE THAT PRODUCES
 * EACH ONE — never against "the screen contains this string".
 *
 * Twelve sentences on one surface is exactly where a neighbouring cohort's
 * sentence passes for the one you meant: they share openings ("You've got 14 days
 * on us until…"), they share dates, and eleven of them are wrong for any given
 * user. So every case below builds a STATE, asserts `summaryStateFor` resolved to
 * the state it meant, and only then asserts the sentence.
 *
 * ⚠️ AND THE COPY IS DIFFED AS CODEPOINTS, not read by eye. `signed.txt` in the
 * session scratchpad holds the founder's message verbatim; `codepoints.test`
 * below compares the rendered set against it character for character, so a curly
 * apostrophe, a non-breaking space or an em dash cannot survive review.
 */

const BASE: SummaryFacts = {
  entitlement: null,
  subscription: null,
  actionKind: "none",
  namesATrial: false,
  endsOn: null,
  graceEndsOn: null,
  courtesyEndsOn: null,
  price: null,
  interval: null,
  gateEnabled: false,
  accessEndsEarly: false,
  /**
   * ⚠️ THE BASE IS A LAPSED ACCOUNT: nothing live, nothing revoked. Cases that
   * mean otherwise say so explicitly, so a fixture can never claim a state its
   * own fields contradict.
   */
  accessLive: false,
  accessRevoked: false,
};

const f = (over: Partial<SummaryFacts>): SummaryFacts => ({ ...BASE, ...over });
const stripe = { source: "stripe" as const, activeUntil: "2027-08-18T00:00:00Z" };
const compForever = { source: "comp" as const, activeUntil: null };
const grace = { source: "comp" as const, activeUntil: "2026-08-27T00:00:00Z" };

/** Assert the state FIRST, then the sentence. Arrival before assertion. */
function say(facts: SummaryFacts, state: SummaryState): string | null {
  expect(summaryStateFor(facts)).toBe(state);
  return manageSummaryFor(facts);
}

describe("⚠️ the twelve signed sentences, each from its own state", () => {
  it("PAYING", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "active" },
          actionKind: "cancel",
          endsOn: "18 Aug 2027",
          price: "$69.99 USD",
          interval: "year",
        }),
        "paying",
      ),
    ).toBe("You're on your Pro plan at $69.99 USD a year, and it renews on 18 Aug 2027.");
  });

  it("TRIAL", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "trialing" },
          actionKind: "cancel",
          endsOn: "25 Aug 2026",
          price: "$69.99 USD",
          interval: "year",
        }),
        "trial",
      ),
    ).toBe(
      "You're on a free trial of your Pro plan until 25 Aug 2026, and then it's $69.99 USD a year.",
    );
  });

  it("CANCELLED, paid at least once", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "active", cancelAtPeriodEnd: true },
          actionKind: "resume",
          namesATrial: false,
          endsOn: "18 Sept 2026",
        }),
        "cancelled-paid",
      ),
    ).toBe(
      "You've cancelled, so you keep your Pro plan until 18 Sept 2026 and won't be charged again.",
    );
  });

  it("CANCELLED, never charged", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "trialing", cancelAtPeriodEnd: true },
          actionKind: "resume",
          namesATrial: true,
          endsOn: "25 Aug 2026",
        }),
        "cancelled-never-charged",
      ),
    ).toBe("You've cancelled, so you keep your Pro plan until 25 Aug 2026 and won't be charged.");
  });

  it("⚠️ CONTROL: the cancelled pair differs ONLY by the word 'again'", () => {
    // The two sentences are one word apart, which is exactly the pair most likely
    // to pass for each other. Asserted as a difference rather than as two strings.
    const paid = manageSummaryFor(
      f({ actionKind: "resume", namesATrial: false, endsOn: "1 Jan 2027" }),
    );
    const never = manageSummaryFor(
      f({ actionKind: "resume", namesATrial: true, endsOn: "1 Jan 2027" }),
    );
    expect(paid).not.toBe(never);
    expect(paid).toBe(`${never!.slice(0, -1)} again.`);
  });

  it("BETA GRACE", () => {
    expect(
      say(
        f({ entitlement: grace, graceEndsOn: "27 Aug 2026" }),
        "beta-grace",
      ),
    ).toBe(
      "You've got 14 days on us until 27 Aug 2026, and you'll need a plan after that to keep adding.",
    );
  });

  it("FREE FOR LIFE", () => {
    expect(say(f({ entitlement: compForever }), "comp-forever")).toBe(
      "You have free access for life, so there's nothing to pay and nothing to renew.",
    );
  });

  it("LAPSED", () => {
    expect(say(f({ gateEnabled: true }), "lapsed")).toBe(
      "You're not on a plan at the moment, so Trackd Co is read only.",
    );
  });

  it("COURTESY", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "trialing", courtesyUntil: "2026-09-17T00:00:00Z" },
          actionKind: "cancel",
          courtesyEndsOn: "17 Sept 2026",
          price: "$69.99 USD",
          interval: "year",
        }),
        "courtesy",
      ),
    ).toBe("Your Pro plan is free until 17 Sept 2026, and then it's $69.99 USD a year.");
  });

  it("PAST DUE / DECLINED", () => {
    expect(
      say(
        f({
          entitlement: stripe,
          subscription: { status: "past_due" },
          actionKind: "cancel",
          endsOn: "25 Aug 2026",
        }),
        "past-due",
      ),
    ).toBe(
      "Your last payment didn't go through, so your Pro plan runs until 25 Aug 2026 and your account goes read only after that until a payment goes through.",
    );
  });

  it("GRACE-ALIGNED TRIALING", () => {
    const sentence = say(
      f({
        entitlement: grace,
        subscription: { status: "trialing" },
        actionKind: "cancel",
        graceEndsOn: "27 Aug 2026",
        price: "$69.99 USD",
        interval: "year",
      }),
      "grace-aligned",
    );
    expect(sentence).toBe(
      "You've got 14 days on us until 27 Aug 2026, and then your Pro plan starts at $69.99 USD a year.",
    );
    // ⚠️ D36's absolute rule, on the surface most likely to break it.
    expect(sentence!.toLowerCase()).not.toContain("trial");
  });

  it("APP STORE, both stores, from the data", () => {
    expect(
      say(
        f({ entitlement: { source: "apple", activeUntil: null }, actionKind: "store" }),
        "app-store",
      ),
    ).toBe(
      "Your subscription is managed through the App Store, so you'll need to change or cancel it there.",
    );
    // ⚠️ `google` is in the live entitlement_source enum, so it is reachable.
    expect(
      say(
        f({ entitlement: { source: "google", activeUntil: null }, actionKind: "store" }),
        "app-store",
      ),
    ).toBe(
      "Your subscription is managed through Google Play, so you'll need to change or cancel it there.",
    );
  });

  it("⚠️ R5(a) FREE FOR LIFE while Stripe is still charging", () => {
    const sentence = say(
      f({
        entitlement: compForever,
        subscription: { status: "active" },
        actionKind: "cancel",
        price: "$69.99 USD",
        interval: "year",
      }),
      "comp-forever-paying",
    );
    expect(sentence).toBe(
      "You have free access for life, so your Pro plan at $69.99 USD a year adds nothing, and cancelling it won't change what you can do.",
    );
    // ⚠️ CONTROL: the ordinary free-for-life sentence would be FALSE for them, and
    // this is the assertion that catches it being stretched onto this cohort.
    expect(sentence).not.toContain("nothing to pay");
    // ...while a comp with NO live subscription still gets the ordinary one.
    expect(say(f({ entitlement: compForever }), "comp-forever")).toContain("nothing to pay");
  });

  it("⚠️ R5(b) paused, unpaid and incomplete get NO sentence, withheld", () => {
    /**
     * ⚠️ THE `actionKind` HERE IS THE ONE `manageActionFor` REALLY RETURNS, and
     * the first version of this test got it wrong in the direction that passes.
     *
     * It passed `"unavailable"` for all three. **D80 changed that**: `paused` and
     * `unpaid` are stoppable immediately, so they now return `cancel`, and only
     * `incomplete` still returns `unavailable`. So the test asserted the right
     * OUTCOME through an input the app never produces, and the real `paused`
     * account fell through to the PAYING sentence — driven, and it read "You're on
     * your Pro plan at $69.99 USD a year, and it renews on 17 Sept 2026" for an
     * account charging nobody.
     *
     * A unit test that feeds a state the app cannot reach is a fixture wearing a
     * costume, exactly like a driver that computes the date the app computes.
     */
    const REAL_ACTION_KIND = {
      paused: "cancel",
      unpaid: "cancel",
      incomplete: "unavailable",
    } as const;
    for (const [status, actionKind] of Object.entries(REAL_ACTION_KIND)) {
      const facts = f({
        entitlement: stripe,
        subscription: { status },
        actionKind,
        endsOn: "1 Jan 2027",
        price: "$69.99 USD",
        interval: "year",
      });
      expect(summaryStateFor(facts)).toBe("withheld");
      expect(manageSummaryFor(facts)).toBeNull();
    }
    // CONTROL: the same facts with an actionable status DO produce a sentence, so
    // "null" is the withhold and not the function failing to work.
    expect(
      manageSummaryFor(
        f({
          entitlement: stripe,
          subscription: { status: "active" },
          actionKind: "cancel",
          endsOn: "1 Jan 2027",
          price: "$69.99 USD",
          interval: "year",
        }),
      ),
    ).not.toBeNull();
  });
});

describe("⚠️ the substitutions come from their sources, never typed", () => {
  it("the interval is the PRICE's, so a monthly subscriber reads 'a month'", () => {
    const monthly = manageSummaryFor(
      f({
        entitlement: stripe,
        subscription: { status: "active" },
        actionKind: "cancel",
        endsOn: "18 Sept 2026",
        price: "$11.99 USD",
        interval: "month",
      }),
    );
    expect(monthly).toBe("You're on your Pro plan at $11.99 USD a month, and it renews on 18 Sept 2026.");
    // ⚠️ CONTROL: the literal "year" must not survive anywhere in a monthly sentence.
    expect(monthly).not.toContain("a year");
  });

  it("a weekly price reads 'a week'", () => {
    expect(
      manageSummaryFor(
        f({
          entitlement: stripe,
          subscription: { status: "active" },
          actionKind: "cancel",
          endsOn: "25 Aug 2026",
          price: "$3.99 USD",
          interval: "week",
        }),
      ),
    ).toContain("$3.99 USD a week");
  });

  it("the 14 is BETA_GRACE_DAYS and moves with it", () => {
    const sentence = manageSummaryFor(f({ entitlement: grace, graceEndsOn: "27 Aug 2026" }))!;
    expect(sentence).toContain(`${BETA_GRACE_DAYS} days on us`);
    // The signed copy says fourteen; this asserts the SOURCE agrees rather than
    // asserting the literal, so changing the grant changes the sentence.
    expect(BETA_GRACE_DAYS).toBe(14);
  });

  it("⚠️ Rule 0: a sentence whose substitution is missing does NOT render", () => {
    // No price -> the paying sentence cannot be stated, so it is withheld whole.
    expect(
      manageSummaryFor(
        f({
          entitlement: stripe,
          subscription: { status: "active" },
          actionKind: "cancel",
          endsOn: "18 Aug 2027",
          price: null,
          interval: null,
        }),
      ),
    ).toBeNull();
    // No date -> same.
    expect(
      manageSummaryFor(
        f({ actionKind: "resume", namesATrial: false, endsOn: null }),
      ),
    ).toBeNull();
    // ⚠️ CONTROL: the two states that name NEITHER still render, so "null" is the
    // missing substitution and not a function that returns null too eagerly.
    expect(manageSummaryFor(f({ entitlement: compForever }))).not.toBeNull();
    expect(manageSummaryFor(f({ gateEnabled: true }))).not.toBeNull();
  });
});

describe("⚠️ suspended: access revoked while the subscription is still billing", () => {
  /**
   * ⚠️ THIS BLOCK USED TO CERTIFY A STATE THE APP CANNOT PRODUCE, and it said
   * so in its own comment: "the dates diverge". **They do not.**
   *
   *   sync.ts:339  subscriptions.current_period_end = entitledUntil(sub)
   *   sync.ts:399  entitlements.active_until        = entitledUntil(sub)
   *
   * One function, one object, two columns — and `revokeForCustomer`
   * (sync.ts:1112-1117) writes `is_active: false` and never touches
   * `active_until`. So on a real revocation the two dates are EQUAL, and the
   * hand-set `accessEndsEarly: true` below was the only thing making the branch
   * fire. The driver that seeded the same divergence
   * (`scratchpad/qa-08-step8-cohorts.mjs`) has been reseeded to the writers'
   * expression and now reports the sentence ABSENT.
   *
   * So the two questions are separated. Hand-setting a predicate to pin COPY is
   * legitimate; hand-setting it to claim the state is REACHABLE is not.
   */
  it("COPY PIN — given the state, the sentence is the signed one (reachability is the test below)", () => {
    const facts = f({
      entitlement: null,
      subscription: { status: "active" },
      actionKind: "cancel",
      endsOn: "17 Sept 2026",
      price: "$69.99 USD",
      interval: "year",
      accessEndsEarly: true,
    });
    expect(summaryStateFor(facts)).toBe("suspended");
    const sentence = manageSummaryFor(facts);
    expect(sentence).toBe(
      "Your access has been suspended while we look into a payment dispute, and your Pro plan at $69.99 USD a year is still active.",
    );
    // ⚠️ BOTH HALVES, because either alone is a lie: access gone, money moving.
    expect(sentence).toContain("suspended");
    expect(sentence).toContain("is still active");
    // Not "read only" — they did not lapse. Not "cancelled" — nothing stopped.
    expect(sentence!.toLowerCase()).not.toContain("read only");
    expect(sentence!.toLowerCase()).not.toContain("cancel");
    // And it promises no resolution and no timeframe.
    expect(sentence!.toLowerCase()).not.toMatch(/\bdays?\b|within|soon|shortly|resolve/);
  });

  /**
   * ⚠️ REACHABILITY, DERIVED — the question the copy pin above cannot answer.
   *
   * Nothing here is hand-set. The row shape is what `revokeForCustomer` leaves
   * behind, field for field, and `accessEndsEarly` comes from `manageActionFor`,
   * the function the screen calls.
   *
   * ⚠️ THIS ASSERTS THE DEFECT, NOT THE INTENT. Today the branch does not fire
   * and a revoked customer reads the PAYING sentence's renewal claim. Item 1.4
   * re-keys `suspended` onto the revocation flag and flips these expectations;
   * until then this records what the app actually does, so the change is visible
   * in a diff rather than discovered later.
   */
  it("⚠️ REACHABILITY: on the shape revokeForCustomer really writes, the branch does NOT fire (1.4)", () => {
    // One date, because one function writes both columns.
    const both = "2027-08-18T00:00:00Z";
    const action = manageActionFor(
      // `currentEntitlement` excludes the revoked row, so the screen sees null.
      null,
      {
        status: "active",
        trialEndsAt: null,
        currentPeriodEnd: both,
        cancelAtPeriodEnd: false,
      },
      // `entitlementEndDate` INCLUDES it, and it carries the same date.
      both,
    );
    expect(action.kind).toBe("cancel");
    // ARRIVAL: the predicate is genuinely false — not absent, not undefined.
    expect(action).toMatchObject({ accessEndsEarly: false });

    const revoked = f({
      entitlement: null,
      subscription: { status: "active" },
      actionKind: action.kind as "cancel",
      endsOn: "18 Aug 2027",
      price: "$69.99 USD",
      interval: "year",
      accessEndsEarly: (action as { accessEndsEarly: boolean }).accessEndsEarly,
    });
    // The state three reviewers reported: revoked, and described as paying.
    expect(summaryStateFor(revoked)).toBe("paying");
    expect(manageSummaryFor(revoked)).toContain("it renews on 18 Aug 2027");
  });

  it("⚠️ CONTROL: the same account WITHOUT the divergence still gets its sentence", () => {
    // Without this, "withhold whenever there is no entitlement" would pass the
    // assertion above and silence every ordinary account on the gate-off world.
    //
    // ⚠️ NOTE FOR 1.4: this shape — no entitlement, live subscription, gate off —
    // IS the revoked cohort, and "the same account WITHOUT the divergence" is
    // only true while the divergence is what selects the sentence. When
    // `suspended` re-keys onto the revocation flag, this control must be re-based
    // on an account that is genuinely paying (an entitlement present) or it will
    // be asserting the renewal claim on a revoked customer.
    const healthy = f({
      entitlement: null,
      subscription: { status: "active" },
      actionKind: "cancel",
      endsOn: "17 Sept 2026",
      price: "$69.99 USD",
      interval: "year",
      accessEndsEarly: false,
    });
    expect(summaryStateFor(healthy)).toBe("paying");
    expect(manageSummaryFor(healthy)).toContain("it renews on 17 Sept 2026");
  });

  it("⚠️ CONTROL: past-due keeps its OWN sentence and is not swallowed", () => {
    // `past_due` always sets accessEndsEarly, and D37's sentence is correct for
    // it. If the withhold sat above the past-due branch it would delete a signed
    // sentence — two states, two answers, and only one of them is missing copy.
    const pastDue = f({
      entitlement: stripe,
      subscription: { status: "past_due" },
      actionKind: "cancel",
      endsOn: "25 Aug 2026",
      accessEndsEarly: true,
    });
    expect(summaryStateFor(pastDue)).toBe("past-due");
    expect(manageSummaryFor(pastDue)).toContain("Your last payment didn't go through");
  });
});

describe("⚠️ precedence: the standing ruling, asserted rather than assumed", () => {
  it("store outranks everything, because nothing here can act on it", () => {
    expect(
      summaryStateFor(
        f({
          entitlement: { source: "apple", activeUntil: null },
          subscription: { status: "past_due" },
          actionKind: "store",
        }),
      ),
    ).toBe("app-store");
  });

  it("cancelled outranks past-due", () => {
    // Their own later decision, and "won't be charged again" is the promise
    // Standing Law 1 protects. Telling them about a next charge would argue.
    expect(
      summaryStateFor(
        f({
          entitlement: stripe,
          subscription: { status: "past_due", cancelAtPeriodEnd: true },
          actionKind: "resume",
        }),
      ),
    ).toBe("cancelled-paid");
  });

  it("cancelled outranks courtesy", () => {
    expect(
      summaryStateFor(
        f({
          entitlement: stripe,
          subscription: {
            status: "trialing",
            courtesyUntil: "2026-09-17T00:00:00Z",
            cancelAtPeriodEnd: true,
          },
          actionKind: "resume",
        }),
      ),
    ).toBe("cancelled-paid");
  });

  it("⚠️ CONTROL: without the cancellation those same facts are their own states", () => {
    // Otherwise "cancelled always wins" would pass every case above while the
    // other states were unreachable.
    expect(
      summaryStateFor(
        f({
          entitlement: stripe,
          subscription: { status: "past_due" },
          actionKind: "cancel",
        }),
      ),
    ).toBe("past-due");
    expect(
      summaryStateFor(
        f({
          entitlement: stripe,
          subscription: { status: "trialing", courtesyUntil: "2026-09-17T00:00:00Z" },
          actionKind: "cancel",
        }),
      ),
    ).toBe("courtesy");
  });

  it("⚠️ every state is reachable, so none of the twelve is dead copy", () => {
    const reached = new Set<SummaryState>();
    const cases: SummaryFacts[] = [
      f({ entitlement: { source: "apple", activeUntil: null }, actionKind: "store" }),
      f({ actionKind: "resume", namesATrial: false, endsOn: "1 Jan 2027" }),
      f({ actionKind: "resume", namesATrial: true, endsOn: "1 Jan 2027" }),
      f({ entitlement: stripe, subscription: { status: "past_due" }, actionKind: "cancel" }),
      f({ entitlement: compForever, subscription: { status: "active" }, actionKind: "cancel" }),
      f({ entitlement: compForever }),
      f({ entitlement: grace, subscription: { status: "trialing" }, actionKind: "cancel" }),
      f({ entitlement: grace }),
      f({
        entitlement: stripe,
        subscription: { status: "trialing", courtesyUntil: "2026-09-17T00:00:00Z" },
        actionKind: "cancel",
      }),
      f({ entitlement: stripe, subscription: { status: "trialing" }, actionKind: "cancel" }),
      f({ entitlement: stripe, subscription: { status: "active" }, actionKind: "cancel" }),
      f({ gateEnabled: true }),
      f({ entitlement: stripe, subscription: { status: "paused" }, actionKind: "unavailable" }),
    ];
    for (const c of cases) reached.add(summaryStateFor(c));
    const all: SummaryState[] = [
      "app-store",
      "cancelled-paid",
      "cancelled-never-charged",
      "past-due",
      "comp-forever-paying",
      "comp-forever",
      "grace-aligned",
      "beta-grace",
      "courtesy",
      "trial",
      "paying",
      "lapsed",
      "withheld",
    ];
    for (const s of all) expect(reached.has(s)).toBe(true);
  });
});

describe("⚠️ no em dash, and no smart punctuation, anywhere in the set", () => {
  it("every sentence is plain ASCII punctuation", () => {
    const every = [
      f({ entitlement: stripe, subscription: { status: "active" }, actionKind: "cancel", endsOn: "1 Jan 2027", price: "$69.99 USD", interval: "year" }),
      f({ entitlement: stripe, subscription: { status: "trialing" }, actionKind: "cancel", endsOn: "1 Jan 2027", price: "$69.99 USD", interval: "year" }),
      f({ actionKind: "resume", namesATrial: false, endsOn: "1 Jan 2027" }),
      f({ actionKind: "resume", namesATrial: true, endsOn: "1 Jan 2027" }),
      f({ entitlement: grace, graceEndsOn: "27 Aug 2026" }),
      f({ entitlement: compForever }),
      f({ gateEnabled: true }),
      f({ entitlement: stripe, subscription: { status: "trialing", courtesyUntil: "x" }, actionKind: "cancel", courtesyEndsOn: "17 Sept 2026", price: "$69.99 USD", interval: "year" }),
      f({ entitlement: stripe, subscription: { status: "past_due" }, actionKind: "cancel", endsOn: "1 Jan 2027" }),
      f({ entitlement: grace, subscription: { status: "trialing" }, actionKind: "cancel", graceEndsOn: "27 Aug 2026", price: "$69.99 USD", interval: "year" }),
      f({ entitlement: { source: "apple", activeUntil: null }, actionKind: "store" }),
      f({ entitlement: compForever, subscription: { status: "active" }, actionKind: "cancel", price: "$69.99 USD", interval: "year" }),
    ];
    for (const facts of every) {
      const s = manageSummaryFor(facts);
      expect(s).not.toBeNull();
      // Em dash, en dash, curly quotes, non-breaking space — every one of these
      // has reached a screen in this project before.
      for (const cp of ["—", "–", "‘", "’", "“", "”", " "]) {
        expect(s!.includes(cp)).toBe(false);
      }
      // A plain apostrophe IS expected in most of them, and is ASCII 0x27.
      expect(/^[\x20-\x7E]*$/.test(s!)).toBe(true);
    }
  });
});
