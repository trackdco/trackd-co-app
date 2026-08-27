import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCESS_UNKNOWN_MESSAGE, READ_ONLY_MESSAGE } from "./gate";

/**
 * THE THREE REFUSAL STRINGS, PINNED — and there are only three (05 §3.9, Q85).
 *
 * A refused write says one of exactly three things, and each belongs to one state:
 *
 *   read-only, fire-and-forget  the approved pop-up            (ReadOnlyGate.tsx)
 *   read-only, route action     READ_ONLY_MESSAGE
 *   unknown                     ACCESS_UNKNOWN_MESSAGE, or the syncing notice
 *
 * ⚠️ NO FOURTH STRING WAS WRITTEN, and this file is how that stays true.
 * `ACCESS_UNKNOWN_MESSAGE` is one of D74's six signed strings, already live on the
 * checkout path for the same state, and is sacred as it stands.
 */

const ROOT = join(__dirname, "..", "..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("the unknown-state string is the one already signed under D74", () => {
  it("is character for character what the checkout path refuses with", () => {
    const writer = source("app/onboarding/billing-actions.ts");
    expect(ACCESS_UNKNOWN_MESSAGE).toBe(
      "We couldn't check your account just now. Please try again in a moment.",
    );
    /**
     * ⚠️ PINNED TO THE WRITER'S SOURCE rather than imported from it.
     * `billing-actions.ts` is a `"use server"` module and every export of one is
     * a publicly dispatchable endpoint, so its export list must not grow. If
     * either copy is ever reworded, this fails instead of the two quietly
     * describing one state in two different sentences.
     */
    expect(writer).toContain(ACCESS_UNKNOWN_MESSAGE);
  });

  it("refuses on the read having FAILED, which is the same state", () => {
    const writer = source("app/onboarding/billing-actions.ts");
    // The string sits inside the `comp.kind === "unknown"` branch — the
    // entitlements read failing, reached from the purchase side.
    const at = writer.indexOf(ACCESS_UNKNOWN_MESSAGE);
    expect(at).toBeGreaterThan(0);
    expect(writer.slice(Math.max(0, at - 700), at)).toContain('comp.kind === "unknown"');
  });
});

describe("the two strings say different things, because the states differ", () => {
  it("only the read-only one mentions subscribing", () => {
    expect(READ_ONLY_MESSAGE).toContain("subscribe");
    expect(ACCESS_UNKNOWN_MESSAGE).not.toContain("subscribe");
  });

  /**
   * ⚠️ THE WHOLE POINT. Telling somebody they are read only when the database
   * would not answer is a claim the server cannot back.
   */
  it("the unknown one makes NO claim about their plan", () => {
    expect(ACCESS_UNKNOWN_MESSAGE).not.toMatch(/read only/i);
    expect(ACCESS_UNKNOWN_MESSAGE).not.toMatch(/plan/i);
  });

  it("only the unknown one invites a retry, because only there is one meaningful", () => {
    expect(ACCESS_UNKNOWN_MESSAGE).toMatch(/try again/i);
    expect(READ_ONLY_MESSAGE).not.toMatch(/try again/i);
  });
});

describe("the copy laws hold on both", () => {
  it("no em dash", () => {
    for (const s of [READ_ONLY_MESSAGE, ACCESS_UNKNOWN_MESSAGE]) {
      expect(s).not.toContain("—");
    }
  });

  it('"read only" is the exact phrase, and the banned words appear on neither', () => {
    expect(READ_ONLY_MESSAGE).toContain("read only");
    for (const s of [READ_ONLY_MESSAGE, ACCESS_UNKNOWN_MESSAGE]) {
      expect(s.toLowerCase()).not.toContain("paused");
      expect(s.toLowerCase()).not.toContain("expired");
      expect(s.toLowerCase()).not.toContain("locked");
      // "read-only" hyphenated is the wrong phrase everywhere.
      expect(s).not.toContain("read-only");
    }
  });

  /**
   * It must not tell the ~86 beta accounts that a subscription of theirs ended.
   * They never had one, and inventing a transaction in the message explaining a
   * refusal is the specific thing `05` §3.6 forbids.
   */
  it("neither claims a subscription ended", () => {
    for (const s of [READ_ONLY_MESSAGE, ACCESS_UNKNOWN_MESSAGE]) {
      expect(s.toLowerCase()).not.toContain("has ended");
      expect(s.toLowerCase()).not.toContain("your subscription");
    }
  });
});
