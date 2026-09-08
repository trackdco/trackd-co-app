/**
 * ⚠️ THE CONTROL IS THE POSITIVE CASE, AND IT IS BUILT BY NEXT ITSELF.
 *
 * A test that only proved "a crash no longer clears the device" would pass
 * against a predicate that returns `false` for everything - including a real
 * redirect, which would silently stop the device sweep from ever running. So
 * the first test manufactures the redirect error with **Next's own
 * `getRedirectError`**, the same function `redirect()` uses. If Next changes the
 * digest format, that test fails loudly here rather than the erasure promise
 * failing quietly in a browser.
 */
import { describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getRedirectError } = require("next/dist/client/components/redirect.js");

import { isRedirectSignal } from "./redirectSignal";

describe("⚠️ THE CONTROL - a real redirect must still be recognised", () => {
  it("recognises the error Next's own redirect() throws", () => {
    const real = getRedirectError("/", "replace", 307);
    expect(isRedirectSignal(real)).toBe(true);
  });

  it("recognises a push redirect too, not just replace", () => {
    expect(isRedirectSignal(getRedirectError("/", "push", 307))).toBe(true);
  });

  it("the fixture really is the shape this predicate claims to read", () => {
    // Pins the measured format. `redirect.js:48` builds it.
    expect(getRedirectError("/", "replace", 307).digest).toBe("NEXT_REDIRECT;replace;/;307;");
  });
});

describe("⚠️ a server failure is NOT a redirect", () => {
  it("a React server-error digest does not pass", () => {
    // Measured against Next 16.2.7: React attaches a numeric string digest.
    const crash = Object.assign(new Error("boom"), { digest: "3849572013" });
    expect(isRedirectSignal(crash)).toBe(false);
  });

  /**
   * The regression this whole module exists for. The old test was
   * `"digest" in e`, which cannot separate the two - so it is asserted here that
   * both DO carry the key, to record why the presence test was insufficient.
   */
  it("both shapes carry a `digest` key, which is why presence was the wrong test", () => {
    const real = getRedirectError("/", "replace", 307);
    const crash = Object.assign(new Error("boom"), { digest: "3849572013" });
    expect("digest" in real).toBe(true);
    expect("digest" in crash).toBe(true);
    expect(isRedirectSignal(real)).toBe(true);
    expect(isRedirectSignal(crash)).toBe(false);
  });

  it.each([
    ["a plain error", new Error("boom")],
    ["null", null],
    ["undefined", undefined],
    ["a string", "NEXT_REDIRECT;replace;/;307;"],
    ["a number", 404],
    ["a non-string digest", Object.assign(new Error("x"), { digest: 1234 })],
    ["a lookalike without the separator", Object.assign(new Error("x"), { digest: "NEXT_REDIRECTED" })],
  ])("%s does not pass", (_label, value) => {
    expect(isRedirectSignal(value)).toBe(false);
  });
});
