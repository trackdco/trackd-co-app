import { describe, expect, it } from "vitest";

import { buildMonthMatrix, formatDateKeyNumeric } from "./calendar";

/**
 * The photo sheet puts a date key in its TITLE, and the picker underneath it
 * reads days back out of the same grid the Calendar screen uses. Both are pinned
 * here, because both have a way of being wrong by exactly one day.
 */

describe("formatDateKeyNumeric — the title's date", () => {
  it("reads day/month/year, zero-padded, as the key already is", () => {
    expect(formatDateKeyNumeric("2026-09-05")).toBe("05/09/2026");
    expect(formatDateKeyNumeric("2026-12-31")).toBe("31/12/2026");
  });

  /**
   * The trap this helper exists to avoid: `new Date("2026-09-01")` parses as
   * UTC midnight, so anywhere behind UTC it formats as 31 August. The key was
   * written in the user's own timezone by `toDateKey`, so the only safe thing
   * to do with it is read it.
   */
  it("does not go through Date, so a key never shifts a day", () => {
    expect(formatDateKeyNumeric("2026-09-01")).toBe("01/09/2026");
    expect(formatDateKeyNumeric("2026-01-01")).toBe("01/01/2026");
  });

  it("hands back anything that is not a key rather than inventing one", () => {
    expect(formatDateKeyNumeric("")).toBe("");
    expect(formatDateKeyNumeric("2026-09")).toBe("2026-09");
  });
});

describe("buildMonthMatrix — what the picker offers", () => {
  it("is always six weeks, so the sheet does not change height by month", () => {
    expect(buildMonthMatrix(2026, 8)).toHaveLength(42);
    expect(buildMonthMatrix(2026, 1)).toHaveLength(42);
  });

  it("starts on a Monday and carries the spill days flagged", () => {
    const cells = buildMonthMatrix(2026, 8); // September 2026 starts on a Tuesday
    expect(cells[0].date.getDay()).toBe(1);
    expect(cells[0].key).toBe("2026-08-31");
    expect(cells[0].inMonth).toBe(false);
    expect(cells[1].key).toBe("2026-09-01");
    expect(cells[1].inMonth).toBe(true);
  });

  /**
   * The picker disables a day by comparing keys as STRINGS (`key > todayKey`),
   * which only holds because they are zero-padded ISO. If that ever stops being
   * true, a photo becomes datable into next month.
   */
  it("orders as strings the same way it orders as dates", () => {
    const cells = buildMonthMatrix(2026, 8);
    const keys = cells.map((c) => c.key);
    expect([...keys].sort()).toEqual(keys);
  });
});
