import { describe, expect, it } from "vitest";

import { DEFAULT_NEXT, safeNextPath } from "./nextPath";

/**
 * The four bypasses a cold review drove through the `startsWith` version of this
 * check, pinned. Two of them (`//` and an absolute URL) the prefix test caught;
 * two of them it did not, and those two are the reason this parser exists.
 *
 * `/login` now reads `?next=` off the address bar, so these are reachable input
 * rather than a hypothetical — see the header comment in `nextPath.ts`.
 */
describe("safeNextPath", () => {
  it("keeps an ordinary internal path, with its query and fragment", () => {
    expect(safeNextPath("/billing")).toBe("/billing");
    expect(safeNextPath("/progress?tab=photos")).toBe("/progress?tab=photos");
    expect(safeNextPath("/protocol#today")).toBe("/protocol#today");
  });

  it("refuses another origin, however it is spelled", () => {
    expect(safeNextPath("https://evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("//evil.com")).toBe(DEFAULT_NEXT);
    // ⚠️ The two the prefix test PASSED. The URL parser folds `\` to `/` and
    // strips C0 controls, so both of these land on evil.com in a real browser.
    expect(safeNextPath("/\\evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/\t/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/\n/evil.com")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("/\r/evil.com")).toBe(DEFAULT_NEXT);
  });

  it("refuses anything that is not a rooted string", () => {
    expect(safeNextPath(undefined)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(null)).toBe(DEFAULT_NEXT);
    expect(safeNextPath(["/billing", "/billing"])).toBe(DEFAULT_NEXT);
    expect(safeNextPath("billing")).toBe(DEFAULT_NEXT);
    expect(safeNextPath("")).toBe(DEFAULT_NEXT);
  });

  it("honours a caller's own fallback", () => {
    // `/auth/confirm` sends a recovery link to `/reset-password`, not the
    // dashboard, so the fallback is per-caller rather than global.
    expect(safeNextPath("https://evil.com", "/reset-password")).toBe(
      "/reset-password",
    );
  });
});
