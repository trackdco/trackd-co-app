import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BETA_GRACE_DAYS } from "./betaGrace";

/**
 * ⚠️ THE SIGNED SENTENCE AND THE CONSTANT, PINNED TO EACH OTHER (06 §3.6).
 *
 * ## A number derives. Prose does not. (Adrian, 2026-08-17.)
 *
 * "14 days" on the checkout subtitle is a NUMBER, so it comes from
 * {@link BETA_GRACE_DAYS} and is never typed — if the constant changes, "14" is
 * flatly false. `02b` already enforces that.
 *
 * **"two more weeks" is signed PROSE that happens to describe fourteen days.**
 * Deriving it would mean generating unsigned wording for values nobody approved
 * — "two more weeks" for 14, and then what for 10, or 21? That is worse than the
 * risk it removes, so the notice types the signed sentence.
 *
 * The risk it leaves is that the constant drifts away from the copy silently, and
 * this is what closes it: **change `BETA_GRACE_DAYS` and this test fails, pointing
 * at the sentence that has to be re-signed.** Nobody can move the number without
 * being sent back to the founder for new words.
 *
 * Same shape as D88's derivation pin, which fails if `EXTRA_TRIAL_DAYS` ever
 * outgrows the calendar month the bound is derived from.
 */

const ROOT = join(__dirname, "..", "..");
const NOTICE = join(ROOT, "components/billing/BetaLaunchNotice.tsx");

/** §3.6's approved beta line, split as JSX wraps it. */
const SIGNED_FRAGMENTS = [
  "From today it&apos;s a paid app, and because you were here early",
  "you&apos;ve got two more weeks on us, until",
];

describe("the fortnight's number and its signed sentence cannot drift apart", () => {
  it("BETA_GRACE_DAYS is 14, which is what 'two more weeks' says", () => {
    expect(
      BETA_GRACE_DAYS,
      "BETA_GRACE_DAYS changed. The notice says 'two more weeks on us', which is " +
        "SIGNED PROSE and does not derive — so it is now describing a period that " +
        "no longer exists. Take the new number to Adrian and get the sentence " +
        "re-signed (06 §3.6), then update this test with the approved wording.",
    ).toBe(14);
  });

  it("the notice still carries the signed sentence, character for character", () => {
    const source = readFileSync(NOTICE, "utf8");
    for (const fragment of SIGNED_FRAGMENTS) {
      expect(
        source,
        `the approved line no longer appears in the notice: "${fragment}"`,
      ).toContain(fragment);
    }
  });

  /**
   * ⚠️ THE FALLBACK IS DELETED, NOT WEAKENED (standing rule 0).
   *
   * It read `endsOn ? \`until ${endsOn}\` : "two weeks"` — converting "I could not
   * resolve this account's expiry" into a confident claim about how long they
   * have. `04` §3.2 ruled the class: a version that cannot name the date is not a
   * weaker acceptable variant, it is a version that must not render.
   */
  it("there is no dateless fallback left in the notice", () => {
    // ⚠️ RENDERED COPY ONLY. The reasoning comment above the guard QUOTES the
    // deleted fallback verbatim, which is the point of it — so a scan of the raw
    // source flags the explanation of the fix as the fix's absence.
    expect(renderedCopy()).not.toContain('"two weeks"');
    expect(readFileSync(NOTICE, "utf8")).toContain("cannotNameTheDate");
  });

  /**
   * The exact phrase, on the surface whose whole job is explaining the state
   * BEFORE anybody meets it. Get this wrong and the first time somebody reads
   * "read only" is when they are locked out.
   */
  it("the beta variant uses the exact phrase 'read only'", () => {
    const source = readFileSync(NOTICE, "utf8");
    expect(source).toContain("After that your account goes read only.");
    expect(source).not.toContain("read-only until");
  });

  it("no banned word and no em dash reaches either variant", () => {
    const copy = renderedCopy().toLowerCase();
    for (const banned of ["paused", "expired", "locked", " jar"]) {
      expect(copy, `"${banned}" must not appear in rendered copy`).not.toContain(banned);
    }
    expect(copy, "no em dash in user-facing copy").not.toContain("—");
  });

  /**
   * ⚠️ THE STRIPPER IS ITSELF PINNED. A stripper that removed too much would make
   * every check above pass by having nothing left to read — the vacuous-pass shape
   * this project keeps paying for. So it is asserted to still contain the copy.
   */
  it("CONTROL: the stripper leaves the actual copy behind", () => {
    const copy = renderedCopy();
    expect(copy).toContain("Trackd Co is going paid");
    expect(copy).toContain("Trackd Co is yours. For life.");
    expect(copy).toContain("Set up my plan");
    expect(copy.length).toBeGreaterThan(600);
  });
});

/**
 * The notice's source with every comment removed.
 *
 * ⚠️ BLOCK COMMENTS, NOT JUST LINE-LEADING ONES. The first version filtered lines
 * starting with `*` or `//`, which leaves the middle of a `{/* ... *\/}` JSX
 * comment behind — and this file's own reasoning quotes the deleted `"two weeks"`
 * fallback and the phrase "never a jar". Both were reported as defects in the
 * rendered copy when they are prose ABOUT the copy.
 */
function renderedCopy(): string {
  return readFileSync(NOTICE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}
