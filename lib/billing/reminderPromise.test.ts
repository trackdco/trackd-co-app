import { describe, expect, it } from "vitest";

import { offerTermsLine, reminderQuietLine } from "./reminderPromise";

/**
 * The release condition for the `04` + `07` pair (amended D1) is a reminder
 * verifiably firing before a courtesy charge. If it cannot be observed, both
 * promise strings are withheld and the spec still ships.
 *
 * These tests are about the two properties that make that safe: the withhold is
 * a WITHHOLD rather than a rewrite, and the two strings cannot come apart.
 */

const CHARGE_ON = "23 Aug 2026";

describe("the reminder promise", () => {
  it("names the charge and the date whether or not the promise is made", () => {
    // The half of the terms line that is NOT negotiable under `04` §2 is
    // present in both forms. Withholding the promise must never cost the date.
    for (const promised of [true, false]) {
      const line = offerTermsLine(CHARGE_ON, promised);
      expect(line).toContain(CHARGE_ON);
      expect(line).toContain("You'll be charged on");
      expect(line).toContain("unless you cancel before then");
      expect(line.endsWith(".")).toBe(true);
    }
  });

  /**
   * ⚠️ THE LEAD SENTENCE WAS RE-SIGNED ON 2026-08-25, and these two assertions
   * were updated rather than relaxed.
   *
   * It read "Your plan carries on as it is." and now reads "By accepting, your
   * plan will continue as is." — the save-offer redesign names the ACT, because
   * the line sits directly above the button that performs it.
   *
   * ⚠️ WHAT DID NOT CHANGE is the property these tests exist for: the clause is
   * APPENDED AND REMOVED WHOLE, never reworded, and it attaches to the CHARGE
   * sentence rather than the lead. The split into `offerTermsLead` and
   * `offerTermsCharge` is a rendering change; `offerTermsLine` is now built FROM
   * them, so this file still measures the string that reaches the screen.
   */
  it("is the approved line, character for character, when promised", () => {
    expect(offerTermsLine(CHARGE_ON, true)).toBe(
      "By accepting, your plan will continue as is. You'll be charged on 23 Aug 2026 unless you cancel before then, and we'll remind you first.",
    );
    expect(reminderQuietLine(true)).toBe("We'll remind you before that happens.");
  });

  it("WITHHOLDS the final clause rather than rewording the sentence", () => {
    // Identical up to the clause, then a full stop. Not a new sentence, not a
    // softened one: the same line with one clause removed.
    expect(offerTermsLine(CHARGE_ON, false)).toBe(
      "By accepting, your plan will continue as is. You'll be charged on 23 Aug 2026 unless you cancel before then.",
    );

    const kept = offerTermsLine(CHARGE_ON, true);
    const withheld = offerTermsLine(CHARGE_ON, false);
    expect(kept.startsWith(withheld.slice(0, -1))).toBe(true);
  });

  it("says nothing about reminding when withheld", () => {
    expect(offerTermsLine(CHARGE_ON, false)).not.toContain("remind");
    expect(reminderQuietLine(false)).toBeUndefined();
  });

  it("⚠️ ships BOTH promises or NEITHER, never one", () => {
    // Half the promise is worse than none: the terms line committing to a
    // reminder while the thank-you screen is silent reads as the app dropping
    // the commitment between two screens. Both derive from one boolean, so this
    // asserts the property the design exists to guarantee.
    for (const promised of [true, false]) {
      const termsPromises = offerTermsLine(CHARGE_ON, promised).includes("remind");
      const quietPromises = reminderQuietLine(promised) !== undefined;
      expect(termsPromises).toBe(quietPromises);
      expect(termsPromises).toBe(promised);
    }
  });

  it("carries no em dash in either string, in either state", () => {
    for (const promised of [true, false]) {
      expect(offerTermsLine(CHARGE_ON, promised)).not.toContain("—");
      expect(reminderQuietLine(promised) ?? "").not.toContain("—");
    }
  });

  it("never authors a date of its own", () => {
    // Every displayed date comes from its server-side source. Handed a different
    // formatted date, the line states that one and invents nothing.
    expect(offerTermsLine("1 Jan 2027", true)).toContain("1 Jan 2027");
    expect(offerTermsLine("1 Jan 2027", true)).not.toContain(CHARGE_ON);
  });
});
