/**
 * ⚠️ THE SIGNED DELETION COPY, PINNED BYTE FOR BYTE.
 *
 * Twelve strings, all signed: seven by Adrian on 2026-09-03
 * (`Context/progress-tracker.md:3043`) and the money line as D59, quoted
 * verbatim at `billing-16-account-deletion.md:128`. The last four are the
 * failure messages, signed by Adrian on 2026-09-05 after three cold reviews
 * found that the single sentence they replaced claimed "Nothing has been
 * removed" in three failure states where that was false.
 *
 * This suite exists because "signed copy is character-for-character sacred" is
 * not a property anybody can hold in their head across a refactor. It compares
 * the constants against `signed/delete-account.txt`, one line per string, in
 * order. A reworded sentence, a smartened apostrophe or an em dash slipped in by
 * an editor all fail here rather than shipping to the last screen a leaving user
 * ever reads.
 *
 * ⚠️ **IF THIS FAILS, THE FIX IS NOT TO UPDATE THE TXT FILE.** The txt file is
 * the record of what was signed. A genuine copy change comes from the founder
 * and updates both, deliberately, in one commit that says so.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  DELETE_ACCOUNT_COPY,
  DELETE_ACCOUNT_FAILURE_COPY,
  DELETE_ACCOUNT_MONEY_LINE,
  deletionConfirmed,
} from "./deleteCopy";

const signed = readFileSync("lib/account/signed/delete-account.txt", "utf8")
  .split("\n")
  .filter((l) => l.length > 0);

/** The order the founder issued them, then D59. */
const INORDER: [string, string][] = [
  ["title", DELETE_ACCOUNT_COPY.title],
  ["body", DELETE_ACCOUNT_COPY.body],
  ["inputLabel", DELETE_ACCOUNT_COPY.inputLabel],
  ["placeholder", DELETE_ACCOUNT_COPY.placeholder],
  ["confirm", DELETE_ACCOUNT_COPY.confirm],
  ["dismiss", DELETE_ACCOUNT_COPY.dismiss],
  ["refundWarning", DELETE_ACCOUNT_COPY.refundWarning],
  ["moneyLine", DELETE_ACCOUNT_MONEY_LINE],
  // Signed 2026-09-05. Keyed on which step the deletion stopped at.
  ["nothingRemoved", DELETE_ACCOUNT_FAILURE_COPY.nothingRemoved],
  ["cancelledOnly", DELETE_ACCOUNT_FAILURE_COPY.cancelledOnly],
  ["partlyDeleted", DELETE_ACCOUNT_FAILURE_COPY.partlyDeleted],
  ["unknown", DELETE_ACCOUNT_FAILURE_COPY.unknown],
];

describe("the signed strings", () => {
  it("there are exactly twelve, and no more crept in", () => {
    expect(signed).toHaveLength(12);
    expect(Object.keys(DELETE_ACCOUNT_COPY)).toHaveLength(7);
    expect(Object.keys(DELETE_ACCOUNT_FAILURE_COPY)).toHaveLength(4);
  });

  /**
   * ⚠️ NO FAILURE MESSAGE MAY CLAIM NOTHING WAS REMOVED.
   *
   * The defect that produced this set: one sentence said "Nothing has been
   * removed" after EVERY failure, and by the time the sweep can fail the
   * subscription is already cancelled, and by the time the row delete can fail
   * the files are destroyed. Only `nothingRemoved` may say it, and only because
   * it is returned solely when the FIRST step failed and nothing ran after it.
   */
  it("only the first-step message claims nothing was removed", () => {
    const claimants = Object.entries(DELETE_ACCOUNT_FAILURE_COPY)
      .filter(([, v]) => /nothing has been removed/i.test(v))
      .map(([k]) => k);
    expect(claimants).toEqual(["nothingRemoved"]);
  });

  it.each(INORDER)("%s matches the signed file byte for byte", (name, value) => {
    const i = INORDER.findIndex(([n]) => n === name);
    expect(value).toBe(signed[i]);
  });
});

describe("⚠️ the characters, not just the words", () => {
  it("the apostrophe in the dismiss button is a STRAIGHT quote (U+0027)", () => {
    // Adrian ruled on this explicitly, 2026-09-04. An editor or a lint autofix
    // turning it into U+2019 would be a silent substitution in signed copy.
    expect(DELETE_ACCOUNT_COPY.dismiss).toBe("I'd rather stay");
    expect(DELETE_ACCOUNT_COPY.dismiss.charCodeAt(1)).toBe(0x27);
    expect(DELETE_ACCOUNT_COPY.dismiss).not.toContain("’");
    expect(DELETE_ACCOUNT_COPY.dismiss).not.toContain("&rsquo;");
  });

  it("no string contains an em dash", () => {
    for (const [name, value] of INORDER) {
      expect(value, `${name} must not contain an em dash`).not.toContain("—");
    }
  });

  it("no string contains a smart quote of any kind", () => {
    for (const [name, value] of INORDER) {
      expect(value, `${name}`).not.toMatch(/[‘’“”]/);
    }
  });

  it("the body names all five categories it promises to erase", () => {
    // The promise is what gates the whole screen on the sweep being proven. If
    // a category is ever dropped from the sentence, that is a copy change and
    // it comes from the founder.
    for (const word of ["compounds", "doses", "photos", "bloodwork", "metrics"]) {
      expect(DELETE_ACCOUNT_COPY.body).toContain(word);
    }
    expect(DELETE_ACCOUNT_COPY.body).toContain("unrecoverable");
  });

  it("⚠️ the confirmation does not imply a refund", () => {
    // 5's checklist, and the reason D59's line says charges STOP rather than
    // that money comes back. Stripe does not refund the remainder.
    for (const [name, value] of INORDER) {
      expect(value.toLowerCase(), `${name}`).not.toContain("refunded");
      expect(value.toLowerCase(), `${name}`).not.toContain("we will refund");
    }
    expect(DELETE_ACCOUNT_MONEY_LINE).toContain("no further charges will be made");
  });
});

describe("⚠️ the match is exact and case-sensitive (D58)", () => {
  it("accepts only DELETE", () => {
    expect(deletionConfirmed("DELETE")).toBe(true);
  });

  it.each([
    "delete",
    "Delete",
    "DELETE ",
    " DELETE",
    "DELETE\n",
    "DELET",
    "DELETEE",
    "",
    "DELETE DELETE",
    "DELETE ",
  ])("refuses %j", (typed) => {
    expect(deletionConfirmed(typed)).toBe(false);
  });

  it("does NOT trim, fold case, or normalise", () => {
    // Each of those would quietly widen what counts as consent to erasing
    // somebody's health data.
    const source = readFileSync("lib/account/deleteCopy.ts", "utf8");
    const body = source.slice(source.indexOf("export function deletionConfirmed"));
    expect(body).not.toMatch(/\.trim\(\)/);
    expect(body).not.toMatch(/toUpperCase|toLowerCase|localeCompare|normalize/);
  });
});
