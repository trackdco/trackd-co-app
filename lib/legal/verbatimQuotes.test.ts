import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { healthConsentSentence } from "./consentCopy";

/**
 * ⚠️ TWO STRINGS IN THE BUILD ARE QUOTED WORD FOR WORD INSIDE THE LEGAL
 * DOCUMENTS, SO THE DOCUMENTS CAN BE WRONG ABOUT THE APP.
 *
 * This is the ONLY thing standing between "the Privacy Policy describes a box"
 * and "that box says what the Privacy Policy claims it says". It reads the
 * committed document and the shipped string and diffs them by codepoint.
 *
 * ⚠️ IT READS `Context/legal-v2/*.md`, WHICH IS THE SOURCE THE MIGRATION IS
 * BUILT FROM. If the documents are ever re-exported, this fails before the
 * mismatch can reach a user — which is the whole point. It is not a duplicate of
 * `consentCopy.test.ts`: that one pins the sentence against ITSELF, this one
 * pins it against the CONTRACT that quotes it.
 */
const PRIVACY = readFileSync(
  new URL("../../Context/legal-v2/privacy.md", import.meta.url),
  "utf8",
);
const TERMS = readFileSync(
  new URL("../../Context/legal-v2/terms.md", import.meta.url),
  "utf8",
);

/** Names the index and both codepoints, never two walls of text. */
function firstDifference(a: string, b: string): string | null {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    if (a[i] !== b[i]) {
      return `index ${i}: shipped ${JSON.stringify(a[i])} (U+${(a.codePointAt(i) ?? 0)
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")}) vs document ${JSON.stringify(b[i])} (U+${(b.codePointAt(i) ?? 0)
        .toString(16)
        .toUpperCase()
        .padStart(4, "0")})`;
    }
  }
  return null;
}

describe("⚠️ strings the legal documents quote word for word", () => {
  /**
   * Privacy Policy v2.0 §1 quotes the health-consent tick in full. If the tick
   * ever says something else, the Privacy Policy is factually wrong about the
   * consent it relies on for Article 9 processing.
   */
  it("the health-consent tick matches Privacy Policy §1 exactly", () => {
    const quoted = PRIVACY.match(/ticking a dedicated box that reads: "(.*?)"/)?.[1];
    // ⚠️ CONTROL: the quote must actually have been FOUND. A regex that matched
    // nothing would make this test pass against `undefined` for ever.
    expect(quoted, "Privacy Policy §1 no longer quotes the box — find out why").toBeTruthy();
    expect(firstDifference(healthConsentSentence(), quoted!)).toBeNull();
  });

  /**
   * ⚠️ THE HOMEPAGE LINK IS A STATUTORY REQUIREMENT, NOT A NAVIGATION CHOICE.
   *
   * Washington's My Health My Data Act requires the consumer health data privacy
   * policy to be published under that name and linked where a visitor can reach
   * it WITHOUT LOGGING IN.
   *
   * ⚠️ THE HOMEPAGE MOVED (2026-08-27) and this test is why we noticed. `/` used
   * to render `FirstRun`, which carried these links; it now redirects to the
   * onboarding flow, whose first screen is the hook. Deleting FirstRun therefore
   * deleted a statutory link from the logged-out entry point, and this control
   * failed on exactly that. The links were added to the hook rather than the
   * assertion being relaxed.
   *
   * If the front door moves again, point this at whatever the logged-out visitor
   * lands on — never at whichever file happens to still contain the strings.
   *
   * The full name is pinned because a shortened label ("Health Data", "Your
   * data") reads perfectly well and fails the check the statute actually
   * describes. This is the kind of string a tidy-up shortens.
   */
  it("⚠️ the homepage links the Consumer Health Data Privacy Policy by its full name", () => {
    const homepage = readFileSync(
      new URL("../../components/onboarding/screens/hook.tsx", import.meta.url),
      "utf8",
    );
    /**
     * ⚠️ MATCHED ON THE ROUTE AND THE LABEL, NOT ON JSX SHAPE. This asserted
     * `href="/consumer-health-data"` and broke the moment the links moved into a
     * mapped array — while the link itself was perfectly fine. A control that
     * fails on a refactor it has no opinion about gets weakened or deleted, and
     * then it is not there on the day it matters.
     */
    expect(homepage).toContain("/consumer-health-data");
    expect(homepage).toContain("Consumer Health Data Privacy Policy");
    // The other three must be reachable from the homepage too — a privacy
    // policy a visitor cannot find from the front page is one in name only.
    for (const route of ["/terms", "/privacy", "/medical-disclaimer"]) {
      expect(homepage, `${route} is not linked from the homepage`).toContain(route);
    }
  });

  /**
   * ⚠️ THE CONSUMER HEALTH DATA POLICY IS PRIVACY §16, AND THE PRIVACY POLICY
   * SAYS SO IN WRITING.
   *
   * §16: *"We also publish it separately, WORD FOR WORD, as our Consumer Health
   * Data Privacy Policy, so that it is easy to find."* That is a claim the
   * Privacy Policy makes about another document, and the two live in separate
   * files — so an edit to one and not the other makes the sentence above false
   * without anything else noticing.
   *
   * They are byte-identical today (3666 characters each). This is what keeps
   * them that way. If it ever fails, the fix is to re-export BOTH from the same
   * source, never to soften this assertion.
   */
  it("⚠️ the standalone policy is Privacy §16 word for word", () => {
    const CHD = readFileSync(
      new URL("../../Context/legal-v2/consumer-health-data.md", import.meta.url),
      "utf8",
    );
    const section16 = /^## 16\..*?$([\s\S]*?)^## 17\./m.exec(PRIVACY)?.[1];
    // ⚠️ CONTROL: §16 must actually have been found. A regex that matched
    // nothing would compare `undefined` for ever.
    expect(section16, "Privacy §16 could not be located — has the numbering moved?").toBeTruthy();

    const KEY = "**What consumer health data we collect.**";
    expect(CHD).toContain(KEY);
    expect(section16!).toContain(KEY);

    const standalone = CHD.slice(CHD.indexOf(KEY)).trim();
    const inPolicy = section16!.slice(section16!.indexOf(KEY)).trim();
    expect(standalone).toBe(inPolicy);
  });

  /**
   * ⚠️ AND THE DOCUMENTS DESCRIBE THE SHAPE OF THE SIGNUP, NOT JUST THE WORDS.
   *
   * Privacy §1 says a "dedicated box"; the Terms say "three things through
   * separate, affirmative steps". Those are claims about the SCREEN. They were
   * false on the onboarding path on 25 Aug 2026 — one combined tick — and this
   * records the requirement so a future simplification cannot quietly re-break
   * it without a test naming the document that forbids it.
   */
  it("⚠️ the documents require a SEPARATE, dedicated health-consent step", () => {
    expect(PRIVACY).toContain("through a separate consent step, distinct from accepting our Terms of Service");
    expect(PRIVACY).toContain("ticking a dedicated box");
    expect(TERMS).toContain("confirm three things through separate, affirmative steps");
  });
});
