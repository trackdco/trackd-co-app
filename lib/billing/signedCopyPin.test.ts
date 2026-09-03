import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { manageActionFor, periodEndLabelFor } from "./manage";
import { manageSummaryFor, type SummaryFacts } from "./manageSummary";
import {
  cancelCompForeverBody,
  cancelConfirmBody,
  cancelEndsImmediatelyLead,
  cancelConfirmBodyParts,
  cancelConfirmDismiss,
  cancelConfirmTitle,
  resumeConfirmBody,
  offerAcceptLabel,
  offerBody,
  offerGiftWindow,
  offerGrantedBody,
  offerLine,
  offerPeriodWord,
  offerTitle,
} from "./cancelDialogCopy";
import {
  CONTINUED_USE_PARTS,
  continuedUseSentence,
  STAYING_NOTICE_TITLE,
} from "./noticeCopy";
import {
  offerTermsCharge,
  offerTermsChargeParts,
  offerTermsLead,
  offerTermsLine,
} from "./reminderPromise";
import {
  PAST_DUE_BANNER_IN_GRACE,
  PAST_DUE_BANNER_LAPSED,
  pastDueBannerFor,
} from "./pastDueBannerCopy";
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
  graceDaysLeft: null,
  courtesyEndsOn: null,
  courtesyRunning: false,
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
  /**
   * ⚠️ AND A CASE CARRYING A COURTESY MARKER MEANS ONE THAT IS RUNNING, unless it
   * says otherwise (Group C).
   *
   * Every courtesy case here was written about somebody INSIDE their free period,
   * which is the only cohort the signed sentence is true of. The real derivation
   * is `courtesyIsRunning`, applied once in `screenFacts` and pinned in
   * `courtesyRunning.test.ts` — it is deliberately NOT repeated here, because a
   * fixture that computed it from a hard-coded date would go quietly red on a
   * calendar day nobody chose. A case that means the period has FINISHED says
   * `courtesyRunning: false` and the explicit value always wins.
   */
  if (over.courtesyRunning === undefined) {
    merged.courtesyRunning = Boolean(merged.subscription?.courtesyUntil);
  }
  return merged;
};

/** The placeholders, put back so the diff is of words rather than of values. */
const D = "{date}";
/**
 * ⚠️ THE COUNT IS SUBSTITUTED THE WAY "{store}" IS, because it cannot be passed
 * as its own placeholder: `graceDaysLeft` is a NUMBER, so "{n}" will not go in
 * the way "{date}" and "{price}" do. A real count goes in and is swapped out of
 * the rendered sentence, which is exactly what the APP STORE line already does.
 *
 * ⚠️ NOT 1, and not 0. One renders "1 day left" and zero renders a different
 * sentence entirely, so either would pin a variant rather than the signed line.
 */
const N = 7;
const withN = (s: string | null | undefined): string | null =>
  s?.replace(`${N} days left`, "{n} days left") ?? null;
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
  ["BETA GRACE", withN(manageSummaryFor(f({ entitlement: grace, graceEndsOn: D, graceDaysLeft: N })))],
  ["FREE FOR LIFE", manageSummaryFor(f({ entitlement: compForever }))],
  ["LAPSED", manageSummaryFor(f({ gateEnabled: true }))],
  ["COURTESY", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "trialing", courtesyUntil: "x" }, actionKind: "cancel", courtesyEndsOn: D, ...YEAR }))],
  ["PAST DUE", manageSummaryFor(f({ entitlement: stripe, subscription: { status: "past_due" }, actionKind: "cancel", endsOn: D }))],
  ["GRACE-ALIGNED", withN(manageSummaryFor(f({ entitlement: grace, subscription: { status: "trialing" }, actionKind: "cancel", graceEndsOn: D, graceDaysLeft: N, ...YEAR })))],
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

  /**
   * ⚠️ THE SPLIT IS LOSSLESS, PROVEN, NOT ASSERTED BY COMMENT.
   *
   * The redesign renders the terms as two centred lines with the charge date
   * bold. Three shapes of the same sentence now exist — the paragraph, the two
   * lines, and the three parts around the date — and this is what stops them
   * becoming three different sentences. It is the same control `splitSummary`
   * carries, for the same reason.
   */
  it("⚠️ the terms rejoin to the signed sentence exactly, in both promise states", () => {
    for (const promised of [false, true]) {
      const charge = offerTermsCharge("{date}", promised);
      expect(offerTermsLine("{date}", promised)).toBe(`${offerTermsLead()} ${charge}`);
      const parts = offerTermsChargeParts("{date}", promised);
      expect(parts.before + parts.date + parts.after).toBe(charge);
      // ⚠️ AND THE BOLD HALF IS THE DATE, not an empty string that renders no
      // bold at all while the assertion above still passes.
      expect(parts.date).toBe("{date}");
    }
  });

  /**
   * ⚠️ `04` §0's SHIP-TOGETHER PAIR SURVIVES THE SPLIT. The reminder clause must
   * attach to the CHARGE sentence and never to the lead — "your plan will
   * continue as is, and we'll remind you first" promises a reminder about the
   * wrong event.
   */
  it("⚠️ the reminder clause attaches to the charge sentence, never the lead", () => {
    expect(offerTermsCharge("{date}", true)).toContain("and we'll remind you first");
    expect(offerTermsCharge("{date}", false)).not.toContain("remind");
    expect(offerTermsLead()).not.toContain("remind");
  });

  /**
   * ⚠️ F2's LESSON APPLIED TO THE THREE NEW PERIOD-CARRYING STRINGS. A monthly
   * and a yearly subscriber are both offered a MONTH; hardcoding "week" would
   * offer a free week and then grant a month.
   */
  it("⚠️ every redesigned string follows the period word and never collapses to a week", () => {
    for (const [month, week] of [
      [offerBody("month"), offerBody("week")],
      [offerLine("month"), offerLine("week")],
      [offerAcceptLabel("month"), offerAcceptLabel("week")],
    ]) {
      expect(month).not.toBe(week);
      expect(month.replace("month", "week")).toBe(week);
    }
  });

  /** ⚠️ ONE CHARACTER, U+2026 — not three full stops, which a casual read passes. */
  it("⚠️ the offer title ends in a real ellipsis", () => {
    expect(offerTitle()).toBe("One more thing\u2026");
    expect(offerTitle()).not.toContain("...");
    expect(offerTitle().codePointAt(14)).toBe(0x2026);
  });

  /**
   * ⚠️ THE CONFIRM BODY'S DATE IS BOLD ON SCREEN, so it is rendered from a SPLIT
   * of the signed sentence rather than from two hand-typed halves. If the split
   * ever loses or adds a character, the screen shows something nobody signed.
   */
  it("⚠️ the confirm body rejoins to the signed sentence exactly", () => {
    const parts = cancelConfirmBodyParts("{date}");
    expect(parts.before + parts.date + parts.after).toBe(cancelConfirmBody("{date}"));
    // …and the bold half is really the date, not an empty string that would
    // render no bold while the rejoin above still passed.
    expect(parts.date).toBe("{date}");
    expect(parts.before.length).toBeGreaterThan(0);
    expect(parts.after.length).toBeGreaterThan(0);
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

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠️ THE DECLINED-PAYMENT DASHBOARD BANNER (Group D, founder ruling).

   Two sentences, signed character for character, on the one surface everybody
   opens. Until now a failed payment reached a customer through a push they may
   never have allowed and a screen they had no reason to open, so the first they
   heard of it was being locked out.

   Built in `lib/billing/pastDueBannerCopy.ts` rather than in the component, which
   is `signed/README.md`'s standing rule: copy outside `lib/` cannot be pinned,
   and the read-only pop-up's first clause was reverted to a wording D98 had ruled
   FALSE with all 1573 tests green.
   ═══════════════════════════════════════════════════════════════════════════ */

const BANNER_PATH = new URL("./signed/past-due-banner.txt", import.meta.url);
const BANNER_SOURCE = new URL(
  "../../components/billing/PaymentFailedBanner.tsx",
  import.meta.url,
);

describe("⚠️ signed copy pin: the declined-payment banner, codepoint for codepoint", () => {
  const signed = readFileSync(BANNER_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  /** The placeholder put back, so the diff is of words rather than of a value. */
  const RENDERED: Array<[string, string]> = [
    ["IN GRACE", PAST_DUE_BANNER_IN_GRACE(D)],
    ["AFTER THE LAPSE", PAST_DUE_BANNER_LAPSED],
  ];

  it("the signed file holds exactly the two strings the founder approved", () => {
    expect(signed).toHaveLength(2);
    expect(RENDERED).toHaveLength(2);
  });

  for (let i = 0; i < 2; i += 1) {
    it(`${RENDERED[i]?.[0] ?? `#${i}`} matches the signed line character for character`, () => {
      const diff = firstDifference(RENDERED[i][1], signed[i]);
      expect(diff).toBeNull();
    });
  }

  it("⚠️ no banned dash in either sentence", () => {
    for (const [name, text] of RENDERED) {
      expect(/[‐-―−]/.test(text), `${name} carries a banned dash`).toBe(false);
    }
  });

  /**
   * ⚠️ THE SECOND SENTENCE NAMES NO DATE, AND THAT IS THE RULING RATHER THAN AN
   * OMISSION. Nobody can promise when a Stripe Smart Retry lands, so any date
   * there would be invented. This is what stops one being helpfully added later.
   */
  it("⚠️ the after-the-lapse sentence carries no date placeholder", () => {
    expect(PAST_DUE_BANNER_LAPSED).not.toContain("{date}");
    expect(PAST_DUE_BANNER_LAPSED).not.toMatch(/\d/);
    // …and the in-grace one does, which is what makes the absence meaningful.
    expect(PAST_DUE_BANNER_IN_GRACE("{date}")).toContain("{date}");
  });
});

describe("⚠️ which sentence renders, and when nothing does", () => {
  const base = {
    isPastDue: true,
    accessKnown: true,
    accessLive: true,
    graceEndsOn: "20 Aug 2026",
  };

  it("inside the grace it names the grace end date", () => {
    expect(pastDueBannerFor(base)).toBe(
      "Your payment didn't go through. Update your card by 20 Aug 2026 to keep access.",
    );
  });

  it("after the lapse it says read only, and names no date", () => {
    expect(pastDueBannerFor({ ...base, accessLive: false })).toBe(PAST_DUE_BANNER_LAPSED);
  });

  /**
   * ⚠️ THE CONTROL. A banner that rendered for everybody would satisfy both
   * assertions above perfectly and put a payment warning on the home screen of
   * every healthy account in the product.
   */
  it("⚠️ CONTROL: nothing at all when the account is not past due", () => {
    expect(pastDueBannerFor({ ...base, isPastDue: false })).toBeNull();
    expect(pastDueBannerFor({ ...base, isPastDue: false, accessLive: false })).toBeNull();
  });

  /**
   * Withheld rather than reworded, and the after-lapse line is NOT a fallback:
   * "your account is read only" is false for somebody inside the grace.
   */
  it("inside the grace with no date it withholds, rather than borrowing the other sentence", () => {
    expect(pastDueBannerFor({ ...base, graceEndsOn: null })).toBeNull();
  });

  /**
   * The dashboard's own rule for an unreadable read, applied to an UNSOLICITED
   * surface. `DeclinedCard` makes the opposite call on `/billing` and is right to:
   * that screen is answering a question somebody asked.
   */
  it("an unreadable entitlement withholds both sentences", () => {
    expect(pastDueBannerFor({ ...base, accessKnown: false })).toBeNull();
    expect(pastDueBannerFor({ ...base, accessKnown: false, accessLive: false })).toBeNull();
  });
});

describe("⚠️ the banner is wired, gated, and holds none of the copy inline", () => {
  const componentCode = readFileSync(BANNER_SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const dashboardCode = readFileSync(
    new URL("../../app/(app)/dashboard/page.tsx", import.meta.url),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("⚠️ CONTROL: both comment-stripped sources are non-empty and still hold their subject", () => {
    expect(componentCode.length).toBeGreaterThan(300);
    expect(componentCode).toContain("PaymentFailedBanner");
    expect(dashboardCode.length).toBeGreaterThan(2000);
    expect(dashboardCode).toContain("trialBanner=");
  });

  it("the component renders the line it is handed and inlines neither sentence", () => {
    expect(componentCode).toContain("{line}");
    expect(componentCode).not.toContain("didn't go through");
  });

  /** Both tap through to /billing. The founder's ruling, and the only action. */
  it("it taps through to /billing", () => {
    expect(componentCode).toContain('href="/billing"');
  });

  /**
   * ⚠️ NOT A POP-UP. Founder's ruling: the read-only pop-up already interrupts on
   * a blocked write, and two dialogs about one problem is how people stop reading
   * both.
   */
  it("⚠️ it is a banner and never a dialog", () => {
    expect(componentCode).not.toContain("createPortal");
    expect(componentCode).not.toContain('role="dialog"');
    expect(componentCode).not.toContain("aria-modal");
  });

  it("the dashboard renders it in the ONE banner slot, below the reminder and above the final day", () => {
    const slot = dashboardCode.slice(dashboardCode.indexOf("trialBanner="));
    const reminder = slot.indexOf("TrialEndingBanner");
    const declined = slot.indexOf("PaymentFailedBanner");
    const finalDay = slot.indexOf("PlanEndsTodayBanner");
    expect(reminder).toBeGreaterThan(-1);
    expect(declined).toBeGreaterThan(reminder);
    expect(finalDay).toBeGreaterThan(declined);
  });

  /**
   * ⚠️ GATED, for the reason this file already gives about `graceTrial`: with the
   * switch off nothing ends, and both sentences claim something about ACCESS.
   */
  it("the past-due read only happens with the gate on", () => {
    expect(dashboardCode).toMatch(/const pastDueRow = billingGateEnabled\(\)/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠️ THE CANCEL DIALOG — F1's LABELS AND F2's WINDOW.

   Both were JSX-adjacent strings inside `components/billing/CancelSubscription.tsx`,
   outside this suite's reach, which is how F2 survived a whole round: the month
   form had NEVER been rendered on a screen. The driver meant to test it used a
   yearly price but created the subscription with a `trial_end`, so
   `offerPeriodToGrant` short-circuited to "week" and every character-for-character
   assertion ran on the week strings.

   They now live in `lib/billing/cancelDialogCopy.ts` and are diffed here.
   ═══════════════════════════════════════════════════════════════════════════ */

const CANCEL_PATH = new URL("./signed/cancel-dialog.txt", import.meta.url);
const CANCEL_SOURCE = new URL(
  "../../components/billing/CancelSubscription.tsx",
  import.meta.url,
);

describe("⚠️ signed copy pin: the cancel dialog, codepoint for codepoint", () => {
  const signed = readFileSync(CANCEL_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  const START = "{start}";
  const END = "{end}";

  /** In the order the file lists them. */
  const RENDERED: Array<[string, string]> = [
    ["TITLE on a trial", cancelConfirmTitle(true)],
    ["TITLE otherwise", cancelConfirmTitle(false)],
    ["DISMISS on a trial", cancelConfirmDismiss(true)],
    ["DISMISS otherwise", cancelConfirmDismiss(false)],
    ["GIFT WINDOW", offerGiftWindow(START, END)],
    ["GRANTED month", offerGrantedBody("month", START, END)],
    ["GRANTED week", offerGrantedBody("week", START, END)],
    /**
     * ⚠️ FIRST-SIGNED 2026-08-23, NOT RE-SIGNED — it had never been pinned at all.
     *
     * It lived inline in `CancelSubscription.tsx` at TWO call sites in two drifted
     * wordings ("have"/"keep", "your whole history"/"everything you've logged", and
     * a conditional "again"), so no pin could see either and the two could keep
     * diverging. One function now feeds both surfaces and this line pins it.
     */
    ["CANCEL BODY", cancelConfirmBody("{date}")],
    /**
     * ⚠️ THE SAVE-OFFER REDESIGN (Adrian, 2026-08-25). TEN LINES, SIX STRINGS.
     *
     * All six were LITERALS IN `CancelSubscription.tsx` and therefore invisible
     * to every test in this repo — `vitest.config.ts` is
     * `include: ["lib/**\/*.test.ts"]`. Moving them into `lib/` was the first
     * half of the fix, exactly as this file's own header requires.
     *
     * The month and week forms are pinned SEPARATELY rather than as one string
     * with the noun substituted. F2's lesson: two strings differing by one word
     * is precisely how the unrendered one goes a whole round carrying a defect.
     * The terms' charge sentence is pinned in BOTH promise states for the same
     * reason — `REMINDER_PROMISE` is currently unset, so the promised form is
     * the one nobody has ever seen.
     */
    ["OFFER TITLE", offerTitle()],
    ["OFFER BODY month", offerBody("month")],
    ["OFFER BODY week", offerBody("week")],
    ["OFFER LINE month", offerLine("month")],
    ["OFFER LINE week", offerLine("week")],
    ["TERMS lead", offerTermsLead()],
    ["TERMS charge, withheld", offerTermsCharge("{date}", false)],
    ["TERMS charge, promised", offerTermsCharge("{date}", true)],
    ["ACCEPT month", offerAcceptLabel("month")],
    ["ACCEPT week", offerAcceptLabel("week")],
    /**
     * ⚠️ FIRST-SIGNED 2026-08-26, AS-IS. Four strings the second clock run found
     * with NO signed line and NO pin. Adrian signed all four verbatim as they
     * already shipped — not a word moved, and that is the point: what changed is
     * that a machine can now tell if one does.
     *
     * All four were literals in `CancelSubscription.tsx`, invisible to every test
     * here. One of them carried a comment reading *"Signed copy, character for
     * character, from 2026-08-16"* — signed it was, checked it was not.
     *
     * ⚠️ THE RESUME BODY IS PINNED IN BOTH NOUNS, and that is F2's lesson applied
     * rather than quoted: two strings differing by one word is exactly how the
     * unrendered one goes a whole round carrying a defect.
     */
    ["ENDS IMMEDIATELY lead", cancelEndsImmediatelyLead()],
    ["COMP FOREVER body", cancelCompForeverBody()],
    ["RESUME body on a trial", resumeConfirmBody(true, "{date}")],
    ["RESUME body otherwise", resumeConfirmBody(false, "{date}")],
  ];

  it("the signed file holds exactly the twenty-two strings the founder approved", () => {
    expect(signed).toHaveLength(22);
    expect(RENDERED).toHaveLength(22);
  });

  for (let i = 0; i < 22; i += 1) {
    it(`${RENDERED[i]?.[0] ?? `#${i}`} matches the signed line character for character`, () => {
      const diff = firstDifference(RENDERED[i][1], signed[i]);
      expect(diff).toBeNull();
    });
  }

  it("⚠️ no banned dash anywhere in the approved copy", () => {
    for (const [name, text] of RENDERED) {
      expect(/[‐-―−]/.test(text), `${name} carries a banned dash`).toBe(false);
    }
  });

  /**
   * ⚠️ F1's WHOLE POINT: one dialog, one word for one thing. A title and a button
   * that disagreed is what the ruling exists to stop, and it is the state the code
   * was in — `Cancel your subscription?` above `Keep my trial`.
   */
  it("⚠️ the title and the dismiss label always name the same thing", () => {
    expect(cancelConfirmTitle(true)).toContain("trial");
    expect(cancelConfirmDismiss(true)).toContain("trial");
    expect(cancelConfirmTitle(false)).toContain("plan");
    expect(cancelConfirmDismiss(false)).toContain("plan");
  });

  /** D36's one absolute rule, applied to the two strings F1 moves. */
  it("⚠️ the word 'trial' never renders for somebody who is not on one", () => {
    expect(cancelConfirmTitle(false)).not.toMatch(/trial/i);
    expect(cancelConfirmDismiss(false)).not.toMatch(/trial/i);
  });

  /**
   * ⚠️ THE COLLAPSE THAT HID F2 FOR A WHOLE ROUND, PINNED DIRECTLY.
   *
   * `offerPeriodToGrant` short-circuits on `status === "trialing"` and returns
   * "week", which is right when deciding what to GRANT and wrong when describing
   * a period that already exists. The screen drive used a yearly price with a
   * `trial_end`, hit that short circuit, and ran every character-for-character
   * assertion on the week strings — so the month form was never rendered and the
   * defect in it was never seen.
   *
   * ⚠️ FOUND BY MUTATION, NOT BY READING. Collapsing `offerPeriodWord` to a
   * constant "week" left all 548 `lib/billing` tests green, because every other
   * assertion here substitutes the word explicitly. That is the same shape as the
   * defect itself, which is why it gets its own line.
   */
  it("⚠️ the period word follows the granted period and never collapses to a week", () => {
    expect(offerPeriodWord("month")).toBe("month");
    expect(offerPeriodWord("week")).toBe("week");
    // …and it reaches the sentence, rather than being right in isolation.
    expect(offerGrantedBody(offerPeriodWord("month"), START, END)).toContain("free month");
    expect(offerGrantedBody(offerPeriodWord("week"), START, END)).toContain("free week");
  });

  /**
   * ⚠️ F2: THE MONTH AND WEEK FORMS DIFFER BY ONE WORD, WHICH IS EXACTLY HOW THE
   * MONTH FORM WENT A WHOLE ROUND WITHOUT EVER BEING RENDERED.
   */
  it("⚠️ the two granted forms differ only in the period word", () => {
    const month = offerGrantedBody("month", START, END);
    const week = offerGrantedBody("week", START, END);
    expect(month).not.toBe(week);
    expect(month.replace("month", "week")).toBe(week);
  });

  /**
   * ⚠️ AND BOTH NAME A WINDOW RATHER THAN AN END. The gift block said
   * "until {end}", which for a mid-year yearly subscriber described SEVEN MONTHS
   * of free access as though it started today.
   */
  it("⚠️ every F2 string names BOTH ends of the window", () => {
    for (const text of [
      offerGiftWindow(START, END),
      offerGrantedBody("month", START, END),
      offerGrantedBody("week", START, END),
    ]) {
      expect(text).toContain(START);
      expect(text).toContain(END);
    }
    // …and the deleted wording, so it cannot come back.
    expect(offerGiftWindow(START, END)).not.toMatch(/^until /);
  });
});

describe("⚠️ the dialog renders from the module and holds none of it inline", () => {
  const dialogCode = readFileSync(CANCEL_SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("⚠️ CONTROL: the comment-stripped dialog is non-empty and still holds its phases", () => {
    expect(dialogCode.length).toBeGreaterThan(2000);
    expect(dialogCode).toContain('"granted"');
    expect(dialogCode).toContain('"offer"');
  });

  it("F1's two strings come from the module", () => {
    expect(dialogCode).toContain("cancelConfirmTitle(isTrial)");
    expect(dialogCode).toContain("cancelConfirmDismiss(isTrial)");
    expect(
      dialogCode,
      "the unconditional 'Keep my trial' is back, which is D36's prohibited word for a paying customer",
    ).not.toContain('dismiss: "Keep my trial"');
    expect(dialogCode).not.toContain("title: `Cancel your ${noun}?`");
  });

  /**
   * ⚠️ THE FOUR FIRST-SIGNED STRINGS (2026-08-26) COME FROM THE MODULE TOO, and
   * the comp body is checked at BOTH its call sites.
   *
   * It was a duplicated literal — the confirm dialog and the cancelled
   * acknowledgement — byte-identical on the day this was written. The previous
   * duplicated pair in this same file drifted into "have"/"keep" and "your whole
   * history"/"everything you've logged" with no test able to see either, so
   * "identical today" is not a reason to leave two copies.
   */
  it("⚠️ the four first-signed strings come from the module, at every call site", () => {
    expect(dialogCode).toContain("cancelEndsImmediatelyLead()");
    expect(dialogCode).toContain("resumeConfirmBody(isTrial, endsOn)");
    expect(
      (dialogCode.match(/cancelCompForeverBody\(\)/g) ?? []).length,
      "the comp body must come from the module at BOTH call sites",
    ).toBe(2);
    expect(dialogCode).not.toContain("This ends your subscription straight away");
    expect(dialogCode).not.toContain("Your free access carries on as it always has");
    expect(dialogCode).not.toContain("carries on as normal and finishes on");
  });

  it("F2's two strings come from the module", () => {
    expect(dialogCode).toContain("offerGiftWindow(offer.startsOn, chargeOnLabel)");
    expect(dialogCode).toContain("offerGrantedBody(period");
    expect(
      dialogCode,
      "the end-only gift line is back, which described seven months of free access as one",
    ).not.toContain("until: `until ${chargeOnLabel}`");
    expect(
      dialogCode,
      "the present-tense variant is back, about a period that can start six months out",
    ).not.toContain("Enjoy your free");
  });

  /**
   * ⚠️ THE PERIOD WORD MUST NOT COME FROM `offerPeriodToGrant`. That function
   * answers "what should we GRANT?" and short-circuits on `status === "trialing"`,
   * which is the misreading that hid F2: it returned "week" for a yearly
   * subscription and every assertion ran on the week strings.
   */
  it("⚠️ the period word is read off the offer, never re-derived from the subscription", () => {
    expect(dialogCode).toContain("offerPeriodWord(");
    expect(dialogCode).not.toContain("offerPeriodToGrant");
  });

  /** The terms line is the one that names the charge, and it must still be built
   *  by its own module rather than assembled here. */
  it("the terms line and the countdown are untouched", () => {
    expect(dialogCode).toContain("offerTermsLine(chargeOnLabel, remindersPromised)");
    expect(dialogCode).toContain("yours for the next 10 minutes");
  });

  /**
   * ⚠️ D25's "$0.00 USD" IS DELIBERATELY GONE FROM THE PANEL (Adrian,
   * 2026-08-25), AND THIS PINS THE REMOVAL RATHER THAN MOURNING IT.
   *
   * This assertion used to read `expect(dialogCode).toContain("$0.00 USD")`. The
   * redesign enumerates the panel's contents — gift icon, offer line, dates,
   * clock — and the amount is not among them.
   *
   * D25 is not contradicted: it is the house rule that an amount NAMES ITS
   * CURRENCY, so that two differently-formatted amounts cannot share one screen.
   * With this one removed there is exactly one money value left on the dialog —
   * the charge in the terms line — so the condition D25 exists to prevent cannot
   * arise. ⚠️ IF THE AMOUNT IS EVER RESTORED IT COMES BACK AS "$0.00 USD", never
   * "$0.00" and never "Free": D25 governs its FORM, and only its presence changed.
   */
  it("⚠️ the gift amount stays removed, and cannot come back in a shorter form", () => {
    expect(dialogCode).not.toContain("$0.00");
    expect(dialogCode).not.toContain("amount:");
  });

  /**
   * ⚠️ THE SIX REDESIGNED STRINGS COME FROM THE MODULE. Each was a literal here
   * before, where no pin could reach it. A regression puts one back inline, so
   * this asserts BOTH halves: the call is present AND the old literal is absent.
   */
  it("⚠️ the six redesigned offer strings come from the module, not from inline literals", () => {
    expect(dialogCode).toContain("offerTitle()");
    expect(dialogCode).toContain("offerBody(period)");
    expect(dialogCode).toContain("offerLine(period)");
    expect(dialogCode).toContain("offerAcceptLabel(period)");
    expect(dialogCode).toContain("offerTermsLead()");
    expect(dialogCode).toContain("offerTermsChargeParts(chargeOnLabel, remindersPromised)");

    expect(dialogCode, "the pre-redesign title is back").not.toContain('"One more thing."');
    expect(dialogCode, "the cut thank-you sentence is back").not.toContain("Thank you for choosing");
    expect(dialogCode, "the pre-redesign accept label is back").not.toContain(", thanks`");
    expect(dialogCode, "the pre-redesign offer line is back").not.toContain("Another ${period}");
  });

  /**
   * ⚠️ THE ORDERING IS THE ONE THING ON THIS SCREEN THAT IS NOT COSMETIC. The
   * offer appears AFTER the cancellation is written to Stripe, and every exit
   * must leave them cancelled. Declining goes to the acknowledgement — it does
   * not un-cancel, and it writes nothing.
   */
  it("⚠️ declining the offer still only changes phase, and writes nothing", () => {
    expect(dialogCode).toContain('setPhase("declined")');
    expect(dialogCode).not.toMatch(/shownPhase === "offer" \? \(\) => resume/);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   ⚠️ TWO NOTICE SENTENCES, FIRST-SIGNED 2026-08-26 AND FIRST-PINNED HERE.

   Both were JSX text in `components/billing/`, unreachable by every test in this
   repo. Adrian signed both AS-IS, verbatim as they already ship, so nothing was
   reworded — the pin records what is there rather than changing it.

   ⚠️ ONE OF THEM CARRIED A COMMENT SAYING IT WAS ALREADY PINNED.
   `BetaLaunchNotice.tsx` read *"The signed sentence above names the Terms and the
   Privacy Policy and is PINNED"*. Measured on 26 August: the string appeared
   NOWHERE in `lib/`. A comment claiming a protection that does not exist is worse
   than no comment, because a reader stops looking. It is true now.
   ═══════════════════════════════════════════════════════════════════════════ */

const STAYING_PATH = new URL("./signed/staying-notice.txt", import.meta.url);
const CONTINUED_PATH = new URL("./signed/continued-use.txt", import.meta.url);
const STAYING_SOURCE = new URL(
  "../../components/billing/StayingNotice.tsx",
  import.meta.url,
);
const BETA_SOURCE = new URL(
  "../../components/billing/BetaLaunchNotice.tsx",
  import.meta.url,
);

describe("⚠️ signed copy pin: the staying notice, codepoint for codepoint", () => {
  const signed = readFileSync(STAYING_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  it("the signed file holds exactly the one sentence Adrian signed", () => {
    expect(signed).toHaveLength(1);
  });

  it("the title matches the signed line character for character", () => {
    expect(firstDifference(STAYING_NOTICE_TITLE, signed[0])).toBeNull();
  });

  /**
   * ⚠️ THE APOSTROPHE IS THE REASON THIS PIN EXISTS. The component writes
   * `&apos;`, which is U+0027 — not the U+2019 the phrase acquires the moment
   * anybody retypes it anywhere that autocorrects. A curly apostrophe has shipped
   * on this project before.
   */
  it("⚠️ the apostrophe is U+0027, and a curly one is caught", () => {
    expect(STAYING_NOTICE_TITLE).toContain("'");
    expect(STAYING_NOTICE_TITLE).not.toContain("’");
    expect(firstDifference(STAYING_NOTICE_TITLE, "Glad you’re staying.")).toContain(
      "U+2019",
    );
  });

  it("⚠️ no banned dash", () => {
    expect(/[‐-―−]/.test(STAYING_NOTICE_TITLE)).toBe(false);
  });

  /**
   * ⚠️ WHAT THIS PIN DOES NOT PROVE, SAID PLAINLY.
   *
   * **This sentence has never been photographed rendering.** The second clock
   * run's report lists the "Glad you're staying" notice under *never
   * photographed at all*. So: the string is the signed one, and the component
   * renders from this constant. Nobody has seen it on a screen, and this test
   * cannot tell you otherwise — `vitest.config.ts` is `environment: "node"` with
   * no `.test.tsx` in the tree, so the suite cannot render anything.
   */
  it("the component renders from the constant and holds none of it inline", () => {
    const code = readFileSync(STAYING_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // CONTROL: the stripper left a real component behind.
    expect(code.length).toBeGreaterThan(500);
    expect(code).toContain("STAYING_NOTICE_TITLE");
    expect(code).not.toContain("Glad you");
  });
});

describe("⚠️ signed copy pin: the continued-use sentence (D32), codepoint for codepoint", () => {
  const signed = readFileSync(CONTINUED_PATH, "utf8")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  it("the signed file holds exactly the one sentence Adrian signed", () => {
    expect(signed).toHaveLength(1);
  });

  it("the sentence matches the signed line character for character", () => {
    expect(firstDifference(continuedUseSentence(), signed[0])).toBeNull();
  });

  /**
   * ⚠️ SPLIT, NOT REBUILT. The component interleaves two `<Link>`s, so it renders
   * the parts — and the parts must rejoin to the signed sentence BY CONSTRUCTION,
   * or the pin above is testing a string nobody sees. Same guarantee
   * `cancelConfirmBodyParts` carries.
   */
  it("⚠️ the parts rejoin to the signed sentence exactly", () => {
    const p = CONTINUED_USE_PARTS;
    expect(`${p.lead} ${p.terms} ${p.join} ${p.privacy}${p.end}`).toBe(signed[0]);
  });

  /**
   * ⚠️ IT NAMES TWO DOCUMENTS AND MUST GO ON NAMING EXACTLY TWO.
   *
   * `recordDocumentAcceptance` writes `tos` and `privacy` and nothing else, because
   * Privacy v2.0 §17 forbids treating continued use as consent to health-data
   * processing. If this sentence ever grew a third document, the acceptance it
   * describes and the acceptance we record would part company — and the sentence
   * would be the false one, since it is what the user actually reads.
   */
  it("⚠️ it names the Terms and the Privacy Policy, and nothing else", () => {
    const full = continuedUseSentence();
    expect(full).toContain("Terms of Service");
    expect(full).toContain("Privacy Policy");
    expect(full).not.toMatch(/Medical Disclaimer/);
    expect(full).not.toMatch(/Consumer Health Data/);
  });

  it("⚠️ no banned dash", () => {
    expect(/[‐-―−]/.test(continuedUseSentence())).toBe(false);
  });

  it("the notice renders from the module and holds none of it inline", () => {
    const code = readFileSync(BETA_SOURCE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    // CONTROL: the stripper left a real component behind, links and all.
    expect(code.length).toBeGreaterThan(2000);
    expect(code).toContain('href="/terms"');
    expect(code).toContain("CONTINUED_USE_PARTS.lead");
    expect(code).not.toContain("By continuing to use Trackd");
  });
});
