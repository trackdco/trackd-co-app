import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ⚠️ WHAT CONTINUED USE MAY AND MAY NOT BE RECORDED AS.
 *
 * `app/(app)/legal-acceptance.ts` is a server action, so `vitest.config.ts`
 * (`include: ["lib/**\/*.test.ts"]`) cannot execute it. This reads its SOURCE —
 * the same technique `signedCopyPin.test.ts` uses for the cancel dialog — because
 * the alternative is no check at all on the one function that could manufacture
 * an Article 9 consent out of a dismissed pop-up.
 *
 * The rule it guards is written in the documents, not invented here:
 *
 *   Privacy v2.0 §17: "Continued use is never treated as consent to a new or
 *   expanded use of your health data."
 *
 * And the notice's own signed sentence names exactly two documents, so exactly
 * two may be recorded.
 */
const SOURCE = readFileSync(
  new URL("../../app/(app)/legal-acceptance.ts", import.meta.url),
  "utf8",
);
const PRIVACY = readFileSync(
  new URL("../../Context/legal-v2/privacy.md", import.meta.url),
  "utf8",
);
/** Comments quote the forbidden values, so the check must not read them. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("⚠️ acceptance by continued use is scoped to two documents", () => {
  it("⚠️ CONTROL: the comment-stripped source is non-empty and still writes consent rows", () => {
    expect(CODE.length).toBeGreaterThan(400);
    expect(CODE).toContain("consent_records");
    expect(CODE).toContain("upsert");
  });

  it("records the Terms and the Privacy Policy, which the notice's sentence names", () => {
    expect(CODE).toContain('document: "tos"');
    expect(CODE).toContain('document: "privacy"');
  });

  /**
   * ⚠️ THE ONE THAT MATTERS. A dismissed pop-up is not an affirmative step, and
   * the Privacy Policy promises in writing that it will never be treated as one.
   */
  it("⚠️ NEVER records health_data_consent from a dismissed notice", () => {
    expect(
      CODE,
      "continued use would be recorded as health-data consent, which Privacy §17 forbids in terms",
    ).not.toContain("health_data_consent");
  });

  /** The notice links the Disclaimer to be read; its sentence does not accept it. */
  it("⚠️ NEVER records the Medical Disclaimer, which the sentence does not name", () => {
    expect(CODE).not.toContain('document: "disclaimer"');
  });

  /**
   * ⚠️ THE VERSION IS READ LIVE, NEVER TYPED. On 26 August this must record 1.3
   * and on 27 August 2.0, because that is which document was actually in force.
   * A literal would backdate an acceptance to a document not yet in effect.
   */
  it("⚠️ reads the in-force version rather than hardcoding one", () => {
    expect(CODE).toContain('eq("is_current", true)');
    expect(CODE).not.toMatch(/version:\s*"[0-9]/);
  });

  /** The promise this is scoped against, still present in the document. */
  it("⚠️ Privacy §17 still forbids treating continued use as health consent", () => {
    expect(PRIVACY).toContain(
      "Continued use is never treated as consent to a new or expanded use of your health data.",
    );
  });
});
