import { describe, expect, it } from "vitest";

import { chooseNotice, type NoticeChoice } from "./graceEnding";

/**
 * ⚠️ THE NINE-STATE MATRIX, WHICH IS THE TEST THAT WOULD HAVE CAUGHT IT.
 *
 * A cold review found that the supersede lasted exactly one page load: it was
 * keyed on whether the grace notice was RENDERING rather than on whether the
 * account was in the cohort, so dismissing it un-suppressed the launch notice
 * and 77 accounts met "two more weeks, until 10 Sept 2026" with a week left.
 *
 * The condition was inline in a server component and three booleans deep, so
 * nothing could see it. This is the matrix, pinned.
 */

const GRACE = { source: "comp", activeUntil: "2026-09-10T04:00:11.374343+00:00" };
const COMP_FOREVER = { source: "comp", activeUntil: null };
const STRIPE = { source: "stripe", activeUntil: "2027-09-05T08:56:42+00:00" };

const base = {
  gateEnabled: true,
  accessKnown: true,
  entitlement: null as { source: string; activeUntil: string | null } | null,
  daysLeft: null as number | null,
  graceSeen: false,
  launchSeen: false,
};

const cases: ReadonlyArray<[string, Partial<typeof base>, NoticeChoice]> = [
  // ── The 82 ──────────────────────────────────────────────────────────────
  ["grace, neither seen", { entitlement: GRACE, daysLeft: 7 }, "grace"],
  [
    "⚠️ grace, GRACE dismissed — must NOT fall through to the launch notice",
    { entitlement: GRACE, daysLeft: 7, graceSeen: true },
    "none",
  ],
  ["grace, both seen", { entitlement: GRACE, daysLeft: 7, graceSeen: true, launchSeen: true }, "none"],
  [
    "grace, launch already seen (the 5 who dismissed it on 27 Aug)",
    { entitlement: GRACE, daysLeft: 7, launchSeen: true },
    "grace",
  ],
  ["grace on its final day", { entitlement: GRACE, daysLeft: 0 }, "grace"],

  // ── The 5 free-for-life comps: their variant is never superseded ────────
  ["free-for-life comp", { entitlement: COMP_FOREVER }, "launch"],
  ["free-for-life comp, seen", { entitlement: COMP_FOREVER, launchSeen: true }, "none"],

  // ── The 2 subscribers, and the empty states ─────────────────────────────
  ["stripe subscriber", { entitlement: STRIPE }, "none"],
  ["lapsed grace (row gone, days null)", { entitlement: null }, "none"],
  ["no entitlement row at all", {}, "none"],

  // ── The two withholds ───────────────────────────────────────────────────
  ["gate off", { gateEnabled: false, entitlement: GRACE, daysLeft: 7 }, "none"],
  ["entitlement read FAILED", { accessKnown: false, entitlement: GRACE, daysLeft: 7 }, "none"],
];

describe("chooseNotice", () => {
  for (const [name, patch, expected] of cases) {
    it(`${name} -> ${expected}`, () => {
      expect(chooseNotice({ ...base, ...patch })).toBe(expected);
    });
  }

  /**
   * The regression, stated as the sequence rather than as two rows: dismissing
   * the grace notice must never hand the account the older one on the next load.
   */
  it("⚠️ REGRESSION: dismissing the grace notice does not summon the launch notice", () => {
    const account = { ...base, entitlement: GRACE, daysLeft: 7 };
    expect(chooseNotice(account)).toBe("grace");
    // ...they dismiss it, which writes only the GRACE cookie.
    expect(chooseNotice({ ...account, graceSeen: true })).toBe("none");
    // ...and it stays none however many times they come back.
    expect(chooseNotice({ ...account, graceSeen: true })).toBe("none");
  });

  it("the count changing day to day never changes which notice is chosen", () => {
    for (let d = 0; d <= 14; d += 1) {
      expect(chooseNotice({ ...base, entitlement: GRACE, daysLeft: d })).toBe("grace");
    }
  });
});
