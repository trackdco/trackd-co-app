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

const SIGNED_PATH = join(__dirname, "signed", "beta-notice.txt");

/**
 * ⚠️ THE SIGNED LINES COME FROM A PURE-ASCII FILE, AND THE COMPARISON IS AGAINST
 * COMMENT-STRIPPED, ENTITY-DECODED COPY (5.5).
 *
 * ## What was wrong with the mechanism, which was not wrong with the values
 *
 * Three assertions read the RAW SOURCE and asked `.toContain(fragment)`. A signed
 * sentence DELETED FROM THE JSX and surviving in the reasoning comment above it
 * would still pass — and this file's own doc-block explains at length why raw
 * source is the wrong thing to read, having already been bitten by it once.
 * Nothing was vacuous when it was found; the mechanism simply could not tell the
 * difference, which is a defect waiting for its occasion.
 *
 * ## Why not `signedCopyPin`'s exact shape
 *
 * That file calls the same pure function the screen calls. There is no such
 * function here: the notice's copy is JSX literals inside a component, and
 * extracting it would be a product change, which Group 5 does not make. So this
 * takes everything of that shape which is available without one —
 *
 *   · a signed file, pure ASCII, one line per sentence (so a curly apostrophe or
 *     a non-breaking space in the notice cannot match);
 *   · a comparison against copy with COMMENTS REMOVED and JSX ENTITIES DECODED,
 *     so what is compared is what a reader sees rather than what the file says;
 *   · a control in BOTH directions — the comparator must fire on U+2019 and pass
 *     on a match;
 *   · and a control proving the STRIPPER closes the hole: a sentence that exists
 *     only inside a comment must NOT be found.
 */
const SIGNED_FRAGMENTS = readFileSync(SIGNED_PATH, "utf8")
  .split("\n")
  .map((l) => l.trimEnd())
  .filter((l) => l.length > 0);

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

  it("the signed file holds the three sentences, in pure ASCII", () => {
    expect(SIGNED_FRAGMENTS).toHaveLength(3);
    const nonAscii = SIGNED_FRAGMENTS.join("\n").split("").filter((c) => c.charCodeAt(0) > 127);
    expect(nonAscii, "the signed file is not pure ASCII, so it cannot pin punctuation").toEqual([]);
  });

  it("the notice still carries the signed sentence, character for character", () => {
    const copy = renderedCopy();
    for (const fragment of SIGNED_FRAGMENTS) {
      expect(
        copy,
        `the approved line no longer appears in the RENDERED copy: "${fragment}"`,
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
    // ⚠️ RENDERED copy, not raw source (5.5): the sentence must be in the JSX, not
    // in a comment describing the JSX.
    const copy = renderedCopy();
    expect(copy).toContain("After that your account goes read only.");
    expect(copy).not.toContain("read-only until");
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

  /**
   * ⚠️ THE CONTROL THAT PROVES THE HOLE IS SHUT (5.5). Both directions, on the
   * mechanism rather than on today's values.
   */
  it("⚠️ CONTROL: a sentence living ONLY in a comment is NOT found", () => {
    // This is the exact defect: before 5.5 the assertions read raw source, so a
    // signed sentence deleted from the JSX and left in the comment above it still
    // passed. The notice's own comment quotes "two more weeks" while explaining
    // why it does not derive — so the raw source contains it twice and the
    // rendered copy must contain it once.
    const raw = readFileSync(NOTICE, "utf8");
    const quotedInAComment = '"two more weeks" is SIGNED PROSE';
    expect(raw, "the comment this control relies on was rewritten").toContain(quotedInAComment);
    expect(
      renderedCopy(),
      "the stripper is not removing comments, so a deleted sentence would still pass",
    ).not.toContain(quotedInAComment);
  });

  it("⚠️ CONTROL: the comparison fires on a curly apostrophe and passes on a match", () => {
    // Without this, a comparator that matched everything would satisfy every
    // assertion above. U+2019 is the character that has shipped here before.
    const signed = "you've got two more weeks on us, until";
    expect(decodeEntities("you&apos;ve got two more weeks on us, until")).toBe(signed);
    expect(decodeEntities("you\u2019ve got two more weeks on us, until")).not.toBe(signed);
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
  return decodeEntities(
    readFileSync(NOTICE, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, " "),
  );
}

/**
 * ⚠️ THE ENTITIES A READER NEVER SEES (5.5). JSX escapes an apostrophe as
 * `&apos;`, so the source and the screen differ in exactly the characters signed
 * copy is pinned on. Decoding here means the signed file can be PURE ASCII and
 * still catch a curly apostrophe: `&apos;` becomes `'` (U+0027) and a real
 * U+2019 stays U+2019, so the two no longer compare equal.
 */
function decodeEntities(src: string): string {
  return src
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}
