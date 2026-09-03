import { describe, expect, it } from "vitest";

import { graceDaysLeft } from "./graceEnding";

/** The real cohort's instant: 82 rows, all at this moment (measured 3 Sep 2026). */
const ENDS = "2026-09-10T04:00:11.374343+00:00";
const SYD = "Australia/Sydney";

describe("graceDaysLeft", () => {
  it("counts whole local days to the end date", () => {
    // 3 Sep 22:00 UTC is 4 Sep 08:00 in Sydney; the grace ends on 10 Sep there.
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-03T22:00:00Z"))).toBe(6);
    // 3 Sep 00:00 UTC is still 3 Sep 10:00 in Sydney.
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-03T00:00:00Z"))).toBe(7);
  });

  it("says 1 the day before and 0 on the day itself", () => {
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-09T00:00:00Z"))).toBe(1);
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-10T03:00:00Z"))).toBe(0);
  });

  /**
   * ⚠️ THE INSTANT ENDS IT, NOT THE CALENDAR DAY. At 04:00:12 the entitlement
   * is spent, and a notice still offering "today" would be describing access
   * the gate has already withdrawn.
   */
  it("returns null from the moment the grace lapses, not at midnight", () => {
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-10T04:00:10Z"))).toBe(0);
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-10T04:00:11.374Z"))).toBeNull();
    expect(graceDaysLeft(ENDS, SYD, new Date("2026-09-10T23:00:00Z"))).toBeNull();
  });

  it("resolves the day in the user's own zone, not the server's", () => {
    // One instant, one deadline, two people, two answers. 10 Sep 22:00 UTC is
    // still the 10th in London and already the 11th in Sydney, so the same
    // ending is two days off for one of them and one day off for the other.
    // Resolving this in the server's zone would tell one of them the wrong day.
    const soon = "2026-09-12T02:00:00Z";
    const at = new Date("2026-09-10T22:00:00Z");
    expect(graceDaysLeft(soon, "Europe/London", at)).toBe(2);
    expect(graceDaysLeft(soon, SYD, at)).toBe(1);
  });

  it("returns null for a row with nothing to announce", () => {
    // A free-for-life comp. Nothing is ending, so there is no notice.
    expect(graceDaysLeft(null, SYD, new Date("2026-09-03T00:00:00Z"))).toBeNull();
    expect(graceDaysLeft(undefined, SYD, new Date("2026-09-03T00:00:00Z"))).toBeNull();
    // A row we cannot read is not a deadline we may state.
    expect(graceDaysLeft("not a date", SYD, new Date("2026-09-03T00:00:00Z"))).toBeNull();
    expect(graceDaysLeft("", SYD, new Date("2026-09-03T00:00:00Z"))).toBeNull();
  });

  it("never returns a negative, which would render as 'in -1 days'", () => {
    for (const iso of [ENDS, "2026-09-11T02:00:00Z", "2026-12-01T00:00:00Z"]) {
      for (const at of ["2026-09-03T00:00:00Z", "2026-09-10T03:59:00Z", "2026-11-30T00:00:00Z"]) {
        const d = graceDaysLeft(iso, SYD, new Date(at));
        if (d !== null) expect(d).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
