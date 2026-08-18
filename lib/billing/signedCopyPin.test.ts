import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { manageSummaryFor, type SummaryFacts } from "./manageSummary";

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
  accessEndsEarly: false,
};
const f = (over: Partial<SummaryFacts>): SummaryFacts => ({ ...BASE, ...over });

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
  ["SUSPENDED", manageSummaryFor(f({ entitlement: null, subscription: { status: "active" }, actionKind: "cancel", accessEndsEarly: true, ...YEAR }))],
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

  it("the signed file holds exactly the thirteen sentences the founder sent", () => {
    expect(signed).toHaveLength(13);
    expect(RENDERED).toHaveLength(13);
  });

  for (let i = 0; i < 13; i += 1) {
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
