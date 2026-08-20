import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { manageActionFor, periodEndLabelFor } from "./manage";
import { manageSummaryFor, type SummaryFacts } from "./manageSummary";
import { READ_ONLY_POPUP } from "./readOnlyCopy";

/**
 * ⚠️ THE SIGNED SET, DIFFED AS CODEPOINTS AGAINST THE FOUNDER'S OWN MESSAGE.
 *
 * `08`'s Manage summary is signed copy, and signed copy is checked by machine.
 * Reading twelve near-identical sentences by eye is exactly how a curly
 * apostrophe, a non-breaking space or an em dash survives a review — and this
 * project has shipped all three before.
 *
 * `signed/manage-summary.txt` is the founder's message pasted verbatim, one
 * sentence per line, with the placeholders left as `{price}`, `{date}` and
 * `{store}`. This renders each sentence with the SAME placeholders substituted
 * back in, so the comparison is of the words and punctuation only.
 *
 * ## ⚠️ WHAT DECIDES WHICH SIGNED STRINGS GET A MACHINE CHECK
 *
 * **Every one of them. A signed string that is rendered to a user gets a pin,
 * and if it cannot be reached from `lib/` then MOVING IT IS THE FIRST HALF OF
 * THE FIX — not a reason to skip the pin.**
 *
 * That rule was written on 20 Aug 2026 because the opposite had happened twice in
 * one batch, silently:
 *
 *   · the read-only pop-up's first clause was reworded TWICE (D98), got it wrong
 *     once, and lived in `components/` — outside `vitest.config.ts`'s include.
 *     Reverting it to the wording D98 ruled false left all 1573 tests green.
 *   · `/billing`'s "Renews on" / "Ends on" verb — the last step of a decision
 *     four separate fixes went into — was a ternary inside a page component,
 *     also unreachable.
 *
 * Both moved into `lib/` (`readOnlyCopy.ts`, `manage.ts#periodEndLabelFor`) and
 * both are pinned below. The pin reads THE VALUE THAT REACHES THE SCREEN — a
 * function's return, or a copy constant the component interpolates — never the
 * component's source, and never a regex over prose. See `signed/README.md`.
 *
 * ⚠️ IT COMPARES CODEPOINTS AND NAMES THE FIRST DIFFERENCE. `toBe` on a long
 * string prints two walls of text; the loop below prints the index, both
 * characters and both codepoints, which is the difference between "these differ"
 * and "character 47 is U+2019 and should be U+0027".
 */

const SIGNED_PATH = new URL("./signed/manage-summary.txt", import.meta.url);

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
  /**
   * ⚠️ THE BASE IS A LAPSED ACCOUNT: nothing live, nothing revoked. Cases that
   * mean otherwise say so explicitly, so a fixture can never claim a state its
   * own fields contradict.
   */
  accessLive: false,
  accessRevoked: false,
  accessRevokedReason: "unknown",
};
/**
 * ⚠️ `accessLive` FOLLOWS THE ENTITLEMENT UNLESS A CASE SAYS OTHERWISE.
 *
 * Not a convenience — the real invariant. `entitlement` is whatever
 * `strongestEntitlement` returned, and that function only ever returns a row
 * that is active RIGHT NOW, so a non-null entitlement and live access are the
 * same fact. `screenFacts` derives both from one row set for exactly this
 * reason.
 *
 * Defaulting it to `false` instead let fixtures claim a state that cannot exist
 * — a live `stripe` entitlement beside "no access" — and a fixture that
 * contradicts itself tests nothing. Cases that mean revoked, lapsed or
 * unreadable set it explicitly, and the explicit value always wins.
 */
const f = (over: Partial<SummaryFacts>): SummaryFacts => {
  const merged = { ...BASE, ...over };
  if (over.accessLive === undefined) merged.accessLive = merged.entitlement !== null;
  /**
   * ⚠️ AND A CASE THAT SAYS "REVOKED" WITHOUT SAYING WHY MEANS A DISPUTE.
   *
   * Every revoked case in this file predates D101 and was written about the
   * dispute cohort. Defaulting to "unknown" instead would silently withhold their
   * sentences and turn a dozen real assertions vacuous. The cases that mean a
   * REFUND or an unreadable reason say so explicitly, and the explicit value
   * always wins.
   */
  if (over.accessRevokedReason === undefined && merged.accessRevoked) {
    merged.accessRevokedReason = "dispute";
  }
  return merged;
};

/** The placeholders, put back so the diff is of words rather than of values. */
const D = "{date}";
const P = "{price}";
const stripe = { source: "stripe" as const, activeUntil: "2027-01-01T00:00:00Z" };
const compForever = { source: "comp" as const, activeUntil: null };
const grace = { source: "comp" as const, activeUntil: "2026-08-27T00:00:00Z" };

/** ⚠️ In the founder's message the interval is written "year". */
const YEAR = { price: P, interval: "year" };

const RENDERED: Array<[string, string | null]> = [
  ["PAYING", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "active" }, actionKind: "cancel", endsOn: D, ...YEAR }))],
  ["TRIAL", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "trialing" }, actionKind: "cancel", endsOn: D, ...YEAR }))],
  ["CANCELLED paid", manageSummaryFor(f({ actionKind: "resume", namesATrial: false, endsOn: D }))],
  ["CANCELLED never charged", manageSummaryFor(f({ actionKind: "resume", namesATrial: true, endsOn: D }))],
  ["BETA GRACE", manageSummaryFor(f({ entitlement: grace, graceEndsOn: D }))],
  ["FREE FOR LIFE", manageSummaryFor(f({ entitlement: compForever }))],
  ["LAPSED", manageSummaryFor(f({ gateEnabled: true }))],
  ["COURTESY", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "trialing", courtesyUntil: "x" }, actionKind: "cancel", courtesyEndsOn: D, ...YEAR }))],
  ["PAST DUE", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "past_due" }, actionKind: "cancel", endsOn: D }))],
  ["GRACE-ALIGNED", manageSummaryFor(f({ entitlement: grace, subscription: { status: "trialing" }, actionKind: "cancel", graceEndsOn: D, ...YEAR }))],
  ["APP STORE", manageSummaryFor(f({ entitlement: { source: "apple", activeUntil: null }, actionKind: "store" }))?.replace("the App Store", "{store}") ?? null],
  ["FREE FOR LIFE while charging", manageSummaryFor(f({ entitlement: compForever, subscription: { status: "active" }, actionKind: "cancel", ...YEAR }))],
  ["SUSPENDED", manageSummaryFor(f({ entitlement: null, subscription: { status: "active" }, actionKind: "cancel", accessRevoked: true, accessLive: false, ...YEAR }))],
  /**
   * ⚠️ THE SETTLED DISPUTE (2.4). No subscription at all — `canceled` is absent
   * from BILLABLE_STATUSES, so the mirror row is filtered out and `actionKind`
   * is "none". It names no price and no date, so no substitution applies.
   */
  ["DISPUTE CANCELLED", manageSummaryFor(f({ entitlement: null, subscription: null, actionKind: "none", accessRevoked: true, accessLive: false }))],
  /** ⚠️ PAST-DUE AFTER THE LAPSE (3.2, D97). Names no date, by necessity. */
  ["PAST DUE after the lapse", manageSummaryFor(f({ entitlement: null, subscription: { status: "past_due" }, actionKind: "cancel", accessLive: false }))],
];

function firstDifference(actual: string, expected: string): string | null {
  const n = Math.max(actual.length, expected.length);
  for (let i = 0; i < n; i += 1) {
    if (actual[i] !== expected[i]) {
      const cp = (c: string | undefined) =>
        c === undefined ? "<end>" : `${JSON.stringify(c)} U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
      return `index ${i}: rendered ${cp(actual[i])}, signed ${cp(expected[i])}\n  rendered: ${actual.slice(Math.max(0, i - 30), i + 30)}\n  signed:   ${expected.slice(Math.max(0, i - 30), i + 30)}`;
    }
  }
  return null;
}

describe("⚠️ signed copy pin: Manage's summary, codepoint for codepoint", () => {
  const signed = readFileSync(SIGNED_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  it("the signed file holds exactly the fifteen sentences the founder sent", () => {
    expect(signed).toHaveLength(15);
    expect(RENDERED).toHaveLength(15);
  });

  for (let i = 0; i < 15; i += 1) {
    it(`${RENDERED[i]?.[0] ?? `#${i}`} matches the signed line character for character`, () => {
      const [, actual] = RENDERED[i];
      expect(actual).not.toBeNull();
      const diff = firstDifference(actual!, signed[i]);
      expect(diff).toBeNull();
    });
  }

  it("⚠️ CONTROL: the pin can actually fail", () => {
    // Without this, a comparison that silently passed everything would look
    // identical to twelve correct sentences.
    expect(firstDifference("You're on", "You’re on")).toContain("U+2019");
    expect(firstDifference("a b", "a b")).toBeNull();
  });
});


/* ═══════════════════════════════════════════════════════════════════════════
   ⚠️ THE READ-ONLY POP-UP (05 §3.6, D98) — the pin it did not have.

   Measured 20 Aug 2026: reverting the first clause to "You're not on a plan at
   the moment" — the wording D98 ruled FALSE for a past-due customer who is on a
   plan Stripe is still charging — left 1573/1573 green. The words were JSX text
   in `components/`, which this suite cannot reach; they now live in
   `lib/billing/readOnlyCopy.ts` and are diffed here against the signed file.
   ═══════════════════════════════════════════════════════════════════════════ */

const POPUP_PATH = new URL("./signed/read-only-popup.txt", import.meta.url);
const POPUP_SOURCE = new URL("../../components/billing/ReadOnlyGate.tsx", import.meta.url);

describe("⚠️ signed copy pin: the read-only pop-up, codepoint for codepoint", () => {
  const signed = readFileSync(POPUP_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  /** In the order the user reads them down the dialog. */
  const RENDERED: Array<[string, string]> = [
    ["TITLE", READ_ONLY_POPUP.title],
    ["BODY", READ_ONLY_POPUP.body],
    ["REASSURANCE", READ_ONLY_POPUP.reassurance],
    ["DISMISS", READ_ONLY_POPUP.dismiss],
    ["ACTION", READ_ONLY_POPUP.action],
  ];

  it("the signed file holds exactly the five strings the founder approved", () => {
    expect(signed).toHaveLength(5);
    expect(RENDERED).toHaveLength(5);
  });

  for (let i = 0; i < 5; i += 1) {
    it(`${RENDERED[i]?.[0] ?? `#${i}`} matches the signed line character for character`, () => {
      const diff = firstDifference(RENDERED[i][1], signed[i]);
      expect(diff).toBeNull();
    });
  }

  /**
   * ⚠️ THE FIRST CLAUSE IS THE ONE THAT WAS WRONG TWICE, IN OPPOSITE DIRECTIONS.
   * Both rejected wordings are named here so neither can come back quietly.
   */
  it("⚠️ neither rejected wording of the first clause has returned", () => {
    expect(
      READ_ONLY_POPUP.body,
      'D98: "not on a plan" is false for a past-due customer who IS on a plan',
    ).not.toContain("You're not on a plan at the moment");
    expect(
      READ_ONLY_POPUP.body,
      'D98: "your access has ended" is false for anyone who never had access',
    ).not.toContain("Your access has ended");
    // And the signed statement about NOW, which is true of all six cohorts.
    expect(READ_ONLY_POPUP.body.startsWith("You don't have access at the moment")).toBe(true);
  });

  it("⚠️ no banned dash anywhere in the approved copy", () => {
    for (const [name, text] of RENDERED) {
      expect(/[\u2010-\u2015\u2212]/.test(text), `${name} carries a banned dash`).toBe(false);
    }
  });

  /**
   * ⚠️ AND THE COMPONENT STILL RENDERS FROM THE MODULE.
   *
   * The pin above reads the value; this reads the wiring. Without it somebody
   * could inline the words back into the JSX and every assertion above would go
   * on passing against a constant nothing renders.
   *
   * ⚠️ COMMENT-STRIPPED, because `ReadOnlyGate.tsx` legitimately NAMES both
   * rejected wordings in its explanatory note — a raw substring test reads those
   * as the code. That is item 5.5's defect and it is not repeated here.
   */
  const componentCode = readFileSync(POPUP_SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("⚠️ CONTROL: the comment-stripped component is not empty and still holds the dialog", () => {
    // Without this a renamed file or an over-eager strip would make the two
    // assertions below vacuous.
    expect(componentCode.length).toBeGreaterThan(500);
    expect(componentCode).toContain("readonly-title");
  });

  it("⚠️ the component renders the copy from the module, and holds none of it inline", () => {
    expect(componentCode).toContain("READ_ONLY_POPUP.title");
    expect(componentCode).toContain("READ_ONLY_POPUP.body");
    expect(componentCode).toContain("READ_ONLY_POPUP.reassurance");
    expect(
      componentCode,
      "the signed body is inlined in the JSX again, where nothing pins it",
    ).not.toContain("so Trackd Co is read only");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠️ "Renews on" / "Ends on" — THE VERB, AND WHAT THIS PIN DOES NOT PROVE.

   Signed copy, and a CLAIM ABOUT WHAT HAPPENS NEXT: four measured false claims
   stand behind it. It was a ternary inside `app/(app)/billing/page.tsx`, outside
   this suite's reach; it now lives in `manage.ts#periodEndLabelFor`.
   ═══════════════════════════════════════════════════════════════════════════ */

describe("⚠️ signed copy pin: the period-end verb", () => {
  /** Microsecond precision and `+00:00`, as PostgREST returns it. */
  const MIRROR_PG = "2027-08-18T05:55:22.247123+00:00";
  /** The same instant, as `deriveEntitlementFacts` round-trips it. */
  const ENT_ROUNDTRIPPED = new Date(Date.parse(MIRROR_PG)).toISOString();

  const verb = (entitlementEnd: string | null, cancelAtPeriodEnd = false) =>
    periodEndLabelFor(
      manageActionFor(
        null,
        {
          status: "active",
          trialEndsAt: null,
          currentPeriodEnd: MIRROR_PG,
          cancelAtPeriodEnd,
        },
        entitlementEnd,
      ),
    );

  it("ARRIVAL: the two serialisations really are the same instant and different strings", () => {
    expect(Date.parse(MIRROR_PG)).toBe(Date.parse(ENT_ROUNDTRIPPED));
    expect(MIRROR_PG).not.toBe(ENT_ROUNDTRIPPED);
  });

  /**
   * ⚠️ THE ONE A PAYING CUSTOMER READS. Their two rows hold the same instant in
   * different spellings, which is EVERY paying customer, and a renewal genuinely
   * happens — so the verb has to be "Renews on".
   */
  it("a paying customer whose rows agree reads 'Renews on', codepoint for codepoint", () => {
    expect(firstDifference(verb(ENT_ROUNDTRIPPED) ?? "", "Renews on")).toBeNull();
  });

  /**
   * ⚠️ THE CONTROL, AND IT IS A REAL ONE: the same fixture one millisecond apart
   * flips the verb. Without it "Renews on" could be a constant.
   */
  it("⚠️ CONTROL: an entitlement ending 1ms EARLIER reads 'Ends on'", () => {
    const earlier = new Date(Date.parse(MIRROR_PG) - 1).toISOString();
    expect(firstDifference(verb(earlier) ?? "", "Ends on")).toBeNull();
  });

  it("⚠️ CONTROL: a scheduled cancellation always reads 'Ends on' — nothing renews", () => {
    expect(verb(ENT_ROUNDTRIPPED, true)).toBe("Ends on");
  });

  it("no other wording is on offer", () => {
    for (const v of [verb(ENT_ROUNDTRIPPED), verb(null), verb("not a date")]) {
      expect(["Renews on", "Ends on"]).toContain(v);
    }
  });

  /**
   * ⚠️ WHAT THE PIN ABOVE DOES **NOT** PROVE, STATED RATHER THAN IMPLIED.
   *
   * Reverting `accessEndsEarly` to the string comparison `endsOn !== mirrorEnd`
   * does NOT change any answer above, and does not change any answer anywhere:
   * measured 20 Aug 2026 across the whole suite, 1573/1573 still green. That is
   * not a hole in the pin, it is the honest shape of the hazard — `soonerOf`
   * returns one of its inputs VERBATIM and tie-breaks to the first, so the string
   * compare is an identity test over a decision already made on instants. It is
   * correct TODAY and correct BY ACCIDENT.
   *
   * What breaks it is a future tidy-up of `soonerOf` — normalise its return and
   * every paying customer whose mirror carries microseconds reads "Ends on".
   * A behavioural pin cannot catch a change that is currently behaviour-neutral,
   * so the dependency is asserted at the source instead, comment-stripped.
   *
   * ⚠️ THE PERMANENT FIX IS NOT A TEST: make `soonerOf` return a normalised ISO
   * string, and the identity comparison becomes impossible rather than
   * discouraged. That is a behaviour change and is deliberately NOT taken here.
   */
  const manageCode = readFileSync(new URL("./manage.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("⚠️ CONTROL: the comment-stripped source is not empty and still holds the predicate", () => {
    expect(manageCode.length).toBeGreaterThan(500);
    expect(manageCode).toContain("accessEndsEarly");
    expect(manageCode).toContain("soonerOf");
  });

  it("⚠️ accessEndsEarly compares INSTANTS, and does not depend on soonerOf's return identity", () => {
    expect(manageCode).toContain("endsBefore(endsOn, mirrorEnd)");
    expect(
      manageCode,
      "the identity comparison is back; a normalised soonerOf now reads 'Ends on' for every paying customer",
    ).not.toContain("endsOn !== mirrorEnd");
  });
});
