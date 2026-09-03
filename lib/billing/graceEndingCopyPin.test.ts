import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  GRACE_CONTINUED_USE_PARTS,
  GRACE_NOTICE_PARTS,
  graceContinuedUseSentence,
} from "./noticeCopy";

/**
 * ⚠️ THE SEVEN-DAY NOTICE'S SIGNED COPY, PINNED AGAINST PURE-ASCII FILES.
 *
 * ## Why this pins CONSTANTS and `graceCopyPin.test.ts` pins SOURCE
 *
 * That file reads `BetaLaunchNotice.tsx`, strips comments and decodes entities,
 * because that notice's copy is JSX literals and extracting it would have been a
 * product change. It works, and it is fragile in one specific way: its signed
 * fragments have to match the component's LINE WRAPPING, so re-flowing a
 * paragraph in an editor breaks a legal pin for no reason.
 *
 * This notice put its copy in `lib/` on the first commit, which is the rule
 * `noticeCopy.ts` already states. So the comparison is between strings.
 *
 * ## The two directions this has to be tested in
 *
 * A pin that only checks "the constant equals the signed file" is satisfied by a
 * component that ignores the constant entirely. So there is also a control that
 * the component IMPORTS these and does NOT carry its own copy of any signed
 * sentence, which is the vacuous-pass shape this project keeps paying for.
 */

const ROOT = join(__dirname, "..", "..");
const NOTICE = join(ROOT, "components/billing/GraceEndingNotice.tsx");

const SIGNED = readFileSync(join(__dirname, "signed", "grace-ending.txt"), "utf8")
  .split("\n")
  .map((l) => l.trimEnd())
  .filter((l) => l.length > 0);

const SIGNED_CONTINUED = readFileSync(
  join(__dirname, "signed", "grace-continued-use.txt"),
  "utf8",
).trim();

/** The notice's source with every comment removed. Block comments too: this
 *  file's own reasoning and the component's quote phrases ABOUT the copy. */
function renderedSource(): string {
  return readFileSync(NOTICE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/** Every signed string the notice can put on screen, as one blob. */
const ALL_PARTS = Object.values(GRACE_NOTICE_PARTS).join("\n");

describe("the seven-day notice's approved copy", () => {
  it("carries every signed line, character for character", () => {
    for (const line of SIGNED) {
      expect(
        ALL_PARTS,
        `the approved line is no longer in GRACE_NOTICE_PARTS: "${line}"`,
      ).toContain(line);
    }
  });

  it("the signed files are pure ASCII, so they can pin punctuation", () => {
    const chars = [...SIGNED.join("\n"), ...SIGNED_CONTINUED].filter(
      (c) => c.charCodeAt(0) > 127,
    );
    expect(chars, "a non-ASCII character cannot catch a curly apostrophe").toEqual([]);
  });

  /**
   * ⚠️ U+0027, NOT U+2019. A curly apostrophe has already shipped on this
   * project once. Both the copy and the pin are straight, so a typographic one
   * pasted in from a word processor fails rather than silently replacing it.
   */
  it("every apostrophe is the straight one", () => {
    expect(ALL_PARTS).not.toContain("’");
    expect(ALL_PARTS).toContain("You'll still see");
  });

  it("the continued-use sentence rejoins to the signed one", () => {
    expect(graceContinuedUseSentence()).toBe(SIGNED_CONTINUED);
  });

  /**
   * ⚠️ ALL FOUR DOCUMENTS ARE NAMED AND ONLY TWO ARE ACCEPTED. This is the
   * assertion that stops a future tidy-up folding the sentence into one clause.
   *
   * Privacy v2.0 §17 says continued use is never treated as consent to
   * health-data processing, and `recordDocumentAcceptance` writes `tos` and
   * `privacy` only. A sentence claiming acceptance of the other two would
   * contradict the policy inside the notice announcing that policy.
   */
  it("only the Terms and the Privacy Policy are described as accepted", () => {
    const s = graceContinuedUseSentence();
    const accepted = s.slice(0, s.indexOf(". Our"));
    expect(accepted).toContain("you accept the updated");
    expect(accepted).toContain(GRACE_CONTINUED_USE_PARTS.terms);
    expect(accepted).toContain(GRACE_CONTINUED_USE_PARTS.privacy);
    expect(
      accepted,
      "the Medical Disclaimer must not sit inside the acceptance clause",
    ).not.toContain(GRACE_CONTINUED_USE_PARTS.disclaimer);
    expect(
      accepted,
      "⚠️ the health-data policy must NEVER be accepted by continued use (Privacy v2.0 §17)",
    ).not.toContain(GRACE_CONTINUED_USE_PARTS.chd);
    // ...and both are still NAMED, which is what Adrian asked for.
    expect(s).toContain(GRACE_CONTINUED_USE_PARTS.disclaimer);
    expect(s).toContain(GRACE_CONTINUED_USE_PARTS.chd);
    expect(s).toContain("have changed as well.");
  });

  it("no em dash and no banned word reaches the copy", () => {
    const copy = `${ALL_PARTS}\n${graceContinuedUseSentence()}`;
    expect(copy, "no em dash in user-facing copy, ever").not.toContain("—");
    expect(copy, "no exclamation mark inside the app").not.toContain("!");
    for (const banned of ["paused", "expired", "locked", "jar", "trial"]) {
      expect(copy.toLowerCase(), `"${banned}" must not appear`).not.toContain(banned);
    }
  });

  /**
   * The exact phrase, two words, matching `READ_ONLY_MESSAGE` and the launch
   * notice. Three surfaces describe one state and must not describe it in three
   * ways, and this is the surface whose whole job is explaining it BEFORE
   * anybody meets it.
   */
  it("says 'read only' as two words, like every other surface", () => {
    expect(GRACE_NOTICE_PARTS.readOnly).toContain("your account will become read only.");
    expect(GRACE_NOTICE_PARTS.readOnly).not.toContain("read-only");
  });

  /**
   * ⚠️ A NUMBER DERIVES, PROSE DOES NOT. The notice shows ONCE and may be opened
   * on any day of the fortnight, so a typed count would be wrong for everybody
   * who did not open it the morning it shipped.
   */
  it("no day count is typed into the copy", () => {
    expect(ALL_PARTS, "the count comes from graceDaysLeft, never from the copy").not.toMatch(/\d/);
    expect(GRACE_NOTICE_PARTS.headLead).toBe("Your free run will end");
  });
});

describe("CONTROL: the component actually renders from these constants", () => {
  it("imports both, so the pins above are not decorative", () => {
    const src = readFileSync(NOTICE, "utf8");
    expect(src).toContain('from "@/lib/billing/noticeCopy"');
    expect(src).toContain("GRACE_NOTICE_PARTS");
    expect(src).toContain("GRACE_CONTINUED_USE_PARTS");
  });

  /**
   * ⚠️ THE ASSERTION THAT MAKES THE REST MEAN SOMETHING. If the component held
   * its own literal copy of a signed sentence, every test above would pass while
   * the screen showed something nobody signed.
   *
   * Comments are stripped first: the component's reasoning quotes phrases ABOUT
   * the copy, and prose about a sentence is not a second copy of it.
   */
  it("holds no literal copy of any signed sentence", () => {
    const src = renderedSource();
    for (const line of SIGNED) {
      expect(
        src,
        `"${line}" is written into the component. It must come from GRACE_NOTICE_PARTS.`,
      ).not.toContain(line);
    }
    expect(src).not.toContain(SIGNED_CONTINUED);
  });

  /**
   * ⚠️ EVERY PART MUST REACH THE SCREEN, not just exist in the constants.
   *
   * A cold review pointed out the gap: the pins prove the parts rejoin to the
   * signed sentence and that the component holds no literal copy of it, but
   * nothing proved the component RENDERS all of them. Dropping `L.end` (" have
   * changed as well.") in a JSX re-flow would leave every other test green while
   * the notice stopped saying the two documents had changed at all, which is the
   * half that keeps the sentence honest about what is NOT accepted.
   *
   * ⚠️ This checks the parts are REFERENCED, not the whitespace between them.
   * That is still eyeballed. A dropped space or full stop is visibly broken on
   * screen, so it is the low-severity half; a silently dropped clause is not.
   */
  it("renders every part of the continued-use sentence", () => {
    const src = renderedSource();
    for (const key of Object.keys(GRACE_CONTINUED_USE_PARTS)) {
      expect(src, `L.${key} is never rendered, so that clause is missing`).toContain(`L.${key}`);
    }
  });

  it("CONTROL: the stripper leaves the component behind", () => {
    // A stripper that removed everything would make the check above pass by
    // having nothing left to read. This is the shape that bit `graceCopyPin`.
    const src = renderedSource();
    expect(src).toContain("GraceEndingNotice");
    expect(src).toContain("createPortal");
    expect(src.length).toBeGreaterThan(1500);
  });

  /**
   * The supersede is only safe because this notice records the acceptance too.
   * If this call ever goes, 77 accounts lose the only v2.0 notice they will get.
   */
  it("records the document acceptance on dismissal", () => {
    const src = renderedSource();
    expect(src).toContain("recordDocumentAcceptance()");
    expect(src).toContain("markGraceNoticeSeen");
  });
});
