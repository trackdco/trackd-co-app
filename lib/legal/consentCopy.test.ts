import { describe, expect, it } from "vitest";

import { HEALTH_CONSENT, healthConsentSentence } from "./consentCopy";

/**
 * ⚠️ THE HEALTH SENTENCE IS THE ONE A `consent_records` ROW IS A RECORD OF, so it
 * gets a pin like any other signed string. Before 25 Aug 2026 it lived in
 * `app/welcome/gate-form.tsx` where no test could reach it.
 */
describe("⚠️ the health-data consent sentence", () => {
  it("rejoins to exactly the sentence /welcome has always shown", () => {
    expect(healthConsentSentence()).toBe(
      "I explicitly consent to Trackd processing my health-related data " +
        "(compounds, doses, bloodwork, body metrics, photos and journal entries) " +
        "to provide the Service, as described in the Privacy Policy.",
    );
  });

  /** The split must be lossless, or the rendered sentence is not the pinned one. */
  it("⚠️ the parts rejoin without losing or adding a character", () => {
    expect(
      HEALTH_CONSENT.before + HEALTH_CONSENT.linkLabel + HEALTH_CONSENT.after,
    ).toBe(healthConsentSentence());
    // …and the link half is really the link, not an empty string that would
    // render no link at all while the rejoin above still passed.
    expect(HEALTH_CONSENT.linkLabel).toBe("Privacy Policy");
    expect(HEALTH_CONSENT.linkHref).toBe("/privacy");
  });

  /**
   * ⚠️ IT MUST NAME THE DATA. A consent that says only "health data" is not the
   * explicit, specific consent Article 9 asks for, and the enumeration is the
   * part that makes it specific.
   */
  it("⚠️ names every category of health data it covers", () => {
    for (const category of [
      "compounds",
      "doses",
      "bloodwork",
      "body metrics",
      "photos",
      "journal entries",
    ]) {
      expect(healthConsentSentence()).toContain(category);
    }
  });

  it("⚠️ no banned dash", () => {
    expect(/[‐-―−]/.test(healthConsentSentence())).toBe(false);
  });
});
