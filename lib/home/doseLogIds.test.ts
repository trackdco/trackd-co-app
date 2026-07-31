/**
 * Recovering a dose's local day from its own row id.
 *
 * The scenario these pin: `supabase/protocol/012` correctly nulled `logged_for`,
 * so EVERY dose currently in production has no stored day. Hydration then fell
 * back to deriving one from `taken_at` in whatever timezone the device is in
 * NOW — and because the row id is built from the day, a re-derived day minted a
 * SECOND row for the same physical dose, double-decrementing its vial and
 * writing the guess down permanently.
 */
import { describe, it, expect } from "vitest"

import { doseLogRowId, recoverLoggedDay, shiftDayKey } from "@/lib/home/doseLogIds"

const USER = "11111111-2222-3333-4444-555555555555"
const PC = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

/** Sydney (UTC+10) 8am on 30 Jul is 22:00 UTC on the 29th — the day differs. */
const SYDNEY_DAY = "2026-07-30"
const SYDNEY_INSTANT = "2026-07-29T22:00:00.000Z"

describe("recoverLoggedDay", () => {
  it("recovers the day a dose was logged on, not the day its instant falls in", () => {
    const rowId = doseLogRowId(USER, SYDNEY_DAY, PC);
    // The UTC day of the instant is the 29th. The dose belongs to the 30th.
    expect(SYDNEY_INSTANT.slice(0, 10)).toBe("2026-07-29");
    expect(recoverLoggedDay(USER, rowId, PC, SYDNEY_INSTANT)).toBe(SYDNEY_DAY);
  });

  it("returns the SAME day whatever timezone the device is in", () => {
    // The whole defect: the answer used to depend on where the phone was.
    const rowId = doseLogRowId(USER, SYDNEY_DAY, PC);
    for (const tz of ["Australia/Sydney", "America/Los_Angeles", "UTC", "Pacific/Kiritimati"]) {
      expect(recoverLoggedDay(USER, rowId, PC, SYDNEY_INSTANT), tz).toBe(SYDNEY_DAY);
    }
  });

  it("does not mint a second row: the recovered day rebuilds the SAME id", () => {
    // This is the property that stops the duplicate. Re-pushing a dose under its
    // recovered day must target the row that already exists.
    const original = doseLogRowId(USER, SYDNEY_DAY, PC);
    const recovered = recoverLoggedDay(USER, original, PC, SYDNEY_INSTANT)!;
    expect(doseLogRowId(USER, recovered, PC)).toBe(original);
  });

  it("covers the full timezone range, UTC-12 to UTC+14", () => {
    // Kiritimati is UTC+14 and Baker Island UTC-12, so a local day can sit one
    // day either side of the instant's UTC day and never further.
    const instant = "2026-07-29T12:00:00.000Z";
    for (const day of ["2026-07-28", "2026-07-29", "2026-07-30"]) {
      const rowId = doseLogRowId(USER, day, PC);
      expect(recoverLoggedDay(USER, rowId, PC, instant), day).toBe(day);
    }
  });

  it("returns null rather than guessing when the id was not built this way", () => {
    // A row from some other scheme must fall through to the old behaviour, not
    // be assigned a plausible-looking day.
    expect(recoverLoggedDay(USER, "not-a-derived-id", PC, SYDNEY_INSTANT)).toBeNull();
    expect(
      recoverLoggedDay(USER, doseLogRowId("someone-else", SYDNEY_DAY, PC), PC, SYDNEY_INSTANT),
    ).toBeNull();
    expect(
      recoverLoggedDay(USER, doseLogRowId(USER, SYDNEY_DAY, "other-pc"), PC, SYDNEY_INSTANT),
    ).toBeNull();
  });

  it("returns null for a day more than one off, rather than searching forever", () => {
    // A dose whose id says 5 days from its instant is not a timezone effect and
    // must not be silently adopted.
    const rowId = doseLogRowId(USER, "2026-08-03", PC);
    expect(recoverLoggedDay(USER, rowId, PC, SYDNEY_INSTANT)).toBeNull();
  });

  it("tolerates a malformed instant", () => {
    expect(recoverLoggedDay(USER, doseLogRowId(USER, SYDNEY_DAY, PC), PC, "")).toBeNull();
    expect(recoverLoggedDay(USER, doseLogRowId(USER, SYDNEY_DAY, PC), PC, "rubbish")).toBeNull();
  });
});

describe("doseLogRowId", () => {
  it("is stable and uuid-shaped", () => {
    const id = doseLogRowId(USER, SYDNEY_DAY, PC);
    expect(id).toBe(doseLogRowId(USER, SYDNEY_DAY, PC));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("changes with the day, which is why a re-derived day duplicated a dose", () => {
    expect(doseLogRowId(USER, "2026-07-30", PC)).not.toBe(doseLogRowId(USER, "2026-07-29", PC));
  });
});

describe("shiftDayKey", () => {
  it("crosses month and year boundaries in UTC", () => {
    expect(shiftDayKey("2026-07-31", 1)).toBe("2026-08-01");
    expect(shiftDayKey("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDayKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDayKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("is unaffected by a local DST transition", () => {
    // Europe/London springs forward on 29 March 2026. Counted in UTC, the day
    // either side is still exactly one day.
    expect(shiftDayKey("2026-03-29", -1)).toBe("2026-03-28");
    expect(shiftDayKey("2026-03-29", 1)).toBe("2026-03-30");
  });
});
