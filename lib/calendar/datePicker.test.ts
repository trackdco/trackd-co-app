import { describe, expect, it } from "vitest";

import {
  addDaysToKey,
  addMonthsToKey,
  anchorDay,
  canGoToday,
  canStepMonth,
  clampDay,
  dateFieldText,
  dayAccessibleName,
  dayBounds,
  dayMoveForKey,
  isDateKey,
  isDayOutside,
  isMonthOutside,
  isYearOutside,
  monthShort,
  moveDay,
  panelBounds,
  rovingDay,
} from "./calendar";

/**
 * W32: ONE date field for the whole app, opening the app's own month calendar
 * (`DatePickerPanel`) instead of `<input type="date">`, which ran off the
 * screen on iOS in cycles, blocks, bloods and the journal writer. The rules the
 * field and the calendar share are pinned here: which days can be picked,
 * where the calendar opens, where the keyboard goes, how the field reads.
 */

const OPEN = dayBounds(null, null);

describe("isDateKey — a real day, written as a key", () => {
  it("takes a real day", () => {
    expect(isDateKey("2026-09-26")).toBe(true);
    expect(isDateKey("2028-02-29")).toBe(true);
  });
  it("refuses a day that does not exist, and anything not a key", () => {
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("2027-02-29")).toBe(false);
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2026-9-1")).toBe(false);
    expect(isDateKey("")).toBe(false);
    expect(isDateKey(null)).toBe(false);
    expect(isDateKey(undefined)).toBe(false);
  });
});

describe("dayBounds / panelBounds — the range a picker offers", () => {
  it("treats a missing or malformed end as open", () => {
    expect(dayBounds(undefined, "")).toEqual({ min: null, max: null });
    expect(dayBounds("2026-02-30", "2026-09-01")).toEqual({ min: null, max: "2026-09-01" });
  });

  it("collapses crossed bounds onto min, so the calendar is never dead", () => {
    expect(dayBounds("2026-10-05", "2026-09-26")).toEqual({ min: "2026-10-05", max: "2026-10-05" });
  });

  /** Backward compatibility for the photo, weight and journal calendars. */
  it("keeps today as the last day when a caller says nothing about max", () => {
    expect(panelBounds("2026-09-26")).toEqual({ min: null, max: "2026-09-26" });
  });
  it("opens the future when max is null, and takes a given max", () => {
    expect(panelBounds("2026-09-26", "2026-09-01", null)).toEqual({ min: "2026-09-01", max: null });
    expect(panelBounds("2026-09-26", null, "2027-01-01")).toEqual({ min: null, max: "2027-01-01" });
  });
});

describe("isDayOutside / clampDay — bounds are inclusive", () => {
  const b = dayBounds("2026-09-10", "2026-09-20");
  it("allows both ends and everything between", () => {
    expect(isDayOutside("2026-09-10", b)).toBe(false);
    expect(isDayOutside("2026-09-15", b)).toBe(false);
    expect(isDayOutside("2026-09-20", b)).toBe(false);
  });
  it("refuses a day either side", () => {
    expect(isDayOutside("2026-09-09", b)).toBe(true);
    expect(isDayOutside("2026-09-21", b)).toBe(true);
  });
  it("clamps to the nearest pickable day", () => {
    expect(clampDay("2026-01-01", b)).toBe("2026-09-10");
    expect(clampDay("2027-01-01", b)).toBe("2026-09-20");
    expect(clampDay("2026-09-12", b)).toBe("2026-09-12");
    expect(clampDay("1999-01-01", OPEN)).toBe("1999-01-01");
  });
});

describe("addDaysToKey / addMonthsToKey — arithmetic on the key itself", () => {
  it("crosses months, years and a leap day", () => {
    expect(addDaysToKey("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDaysToKey("2026-01-01", -1)).toBe("2025-12-31");
  });
  /** The day the clocks change in Sydney (and in London the month after). */
  it("adds exactly one day across a daylight-saving night", () => {
    expect(addDaysToKey("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDaysToKey("2026-10-04", 1)).toBe("2026-10-05");
    expect(addDaysToKey("2026-10-25", 1)).toBe("2026-10-26");
  });
  it("holds a month step to the end of a shorter month", () => {
    expect(addMonthsToKey("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToKey("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToKey("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsToKey("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsToKey("2028-02-29", 12)).toBe("2029-02-28");
  });
});

describe("month and year bounds — the arrows stop where nothing can be picked", () => {
  const pastOnly = panelBounds("2026-09-26");
  it("stops the next-month arrow at today's month (the photo sheet's rule)", () => {
    expect(canStepMonth({ year: 2026, month0: 8 }, 1, pastOnly)).toBe(false);
    expect(canStepMonth({ year: 2026, month0: 7 }, 1, pastOnly)).toBe(true);
    expect(canStepMonth({ year: 2026, month0: 8 }, -1, pastOnly)).toBe(true);
  });
  it("stops the previous-month arrow at min's month", () => {
    const b = dayBounds("2026-09-26", null);
    expect(canStepMonth({ year: 2026, month0: 8 }, -1, b)).toBe(false);
    expect(canStepMonth({ year: 2026, month0: 9 }, -1, b)).toBe(true);
    expect(canStepMonth({ year: 2030, month0: 0 }, 1, b)).toBe(true);
  });
  it("steps across a year end", () => {
    expect(canStepMonth({ year: 2026, month0: 11 }, 1, dayBounds(null, "2027-01-01"))).toBe(true);
    expect(canStepMonth({ year: 2027, month0: 0 }, -1, dayBounds("2026-12-31", null))).toBe(true);
  });
  it("marks whole months and years outside", () => {
    const b = dayBounds("2026-03-15", "2027-02-01");
    expect(isMonthOutside(2026, 1, b)).toBe(true);
    expect(isMonthOutside(2026, 2, b)).toBe(false);
    expect(isMonthOutside(2027, 1, b)).toBe(false);
    expect(isMonthOutside(2027, 2, b)).toBe(true);
    expect(isYearOutside(2025, b)).toBe(true);
    expect(isYearOutside(2026, b)).toBe(false);
    expect(isYearOutside(2027, b)).toBe(false);
    expect(isYearOutside(2028, b)).toBe(true);
    expect(isYearOutside(1900, OPEN)).toBe(false);
  });
});

describe("anchorDay — where the calendar opens", () => {
  it("opens on the chosen day", () => {
    expect(anchorDay("2026-03-04", "2026-09-26", OPEN)).toBe("2026-03-04");
  });
  /** W47: a new cycle's end date starts EMPTY. The calendar must still open
   *  somewhere it can be used, not on a day it will not take. */
  it("opens an empty field on today, or on the first day it can take", () => {
    expect(anchorDay("", "2026-09-26", OPEN)).toBe("2026-09-26");
    expect(anchorDay("", "2026-09-26", dayBounds("2026-10-10", null))).toBe("2026-10-10");
    expect(anchorDay("", "2026-09-26", dayBounds(null, "2026-08-01"))).toBe("2026-08-01");
  });
  it("moves a chosen day the bounds no longer allow onto one they do", () => {
    expect(anchorDay("2026-09-01", "2026-09-26", dayBounds("2026-09-10", null))).toBe("2026-09-26");
    expect(anchorDay("2026-09-01", "2026-09-05", dayBounds("2026-09-10", null))).toBe("2026-09-10");
  });
});

describe("rovingDay — the one day in the grid that Tab lands on", () => {
  const b = dayBounds(null, "2026-09-26");
  it("takes the first preferred day that is in this month and pickable", () => {
    expect(rovingDay(2026, 8, ["2026-09-12", "2026-09-26"], b)).toBe("2026-09-12");
    expect(rovingDay(2026, 8, ["2026-08-12", "2026-09-26"], b)).toBe("2026-09-26");
    expect(rovingDay(2026, 8, ["2026-09-30", "2026-09-20"], b)).toBe("2026-09-20");
  });
  it("falls back to the month's first pickable day", () => {
    expect(rovingDay(2026, 6, ["2026-09-12"], b)).toBe("2026-07-01");
    expect(rovingDay(2026, 8, [null, undefined, ""], dayBounds("2026-09-14", null))).toBe("2026-09-14");
  });
  it("is null for a month with nothing to pick", () => {
    expect(rovingDay(2026, 9, ["2026-10-01"], b)).toBe(null);
  });
});

describe("dayMoveForKey / moveDay — the grid from the keyboard", () => {
  it("maps the date picker's keys", () => {
    expect(dayMoveForKey("ArrowLeft")).toBe("prevDay");
    expect(dayMoveForKey("ArrowRight")).toBe("nextDay");
    expect(dayMoveForKey("ArrowUp")).toBe("prevWeek");
    expect(dayMoveForKey("ArrowDown")).toBe("nextWeek");
    expect(dayMoveForKey("Home")).toBe("weekStart");
    expect(dayMoveForKey("End")).toBe("weekEnd");
    expect(dayMoveForKey("PageUp")).toBe("prevMonth");
    expect(dayMoveForKey("PageDown", true)).toBe("nextYear");
    expect(dayMoveForKey("Enter")).toBe(null);
    expect(dayMoveForKey("Tab")).toBe(null);
  });
  it("moves by day, week, month and year", () => {
    expect(moveDay("2026-09-30", "nextDay", OPEN)).toBe("2026-10-01");
    expect(moveDay("2026-09-03", "prevWeek", OPEN)).toBe("2026-08-27");
    expect(moveDay("2026-01-31", "nextMonth", OPEN)).toBe("2026-02-28");
    expect(moveDay("2028-02-29", "prevYear", OPEN)).toBe("2027-02-28");
  });
  it("runs the week Monday to Sunday, like the grid", () => {
    // Saturday 26 September 2026.
    expect(moveDay("2026-09-26", "weekStart", OPEN)).toBe("2026-09-21");
    expect(moveDay("2026-09-26", "weekEnd", OPEN)).toBe("2026-09-27");
    // Monday and Sunday stay where they are.
    expect(moveDay("2026-09-21", "weekStart", OPEN)).toBe("2026-09-21");
    expect(moveDay("2026-09-27", "weekEnd", OPEN)).toBe("2026-09-27");
  });
  it("never lands on a day that cannot be picked", () => {
    const b = panelBounds("2026-09-26");
    expect(moveDay("2026-09-26", "nextDay", b)).toBe("2026-09-26");
    expect(moveDay("2026-09-22", "nextWeek", b)).toBe("2026-09-26");
    expect(moveDay("2026-09-10", "nextMonth", b)).toBe("2026-09-26");
    expect(moveDay("2026-09-12", "prevMonth", dayBounds("2026-09-01", null))).toBe("2026-09-01");
  });
});

describe("canGoToday — the calendar's Today", () => {
  const sep = { year: 2026, month0: 8 };
  it("acts when today can be picked and is not already the chosen day in view", () => {
    expect(canGoToday("2026-09-26", "2026-09-01", sep, OPEN)).toBe(true);
    expect(canGoToday("2026-09-26", "2026-09-26", { year: 2026, month0: 5 }, OPEN)).toBe(true);
    expect(canGoToday("2026-09-26", "", sep, OPEN)).toBe(true);
  });
  it("rests when it would do nothing", () => {
    expect(canGoToday("2026-09-26", "2026-09-26", sep, OPEN)).toBe(false);
  });
  /** An end date that must fall after a future start: Today cannot be it. */
  it("rests when today cannot be picked", () => {
    expect(canGoToday("2026-09-26", "", sep, dayBounds("2026-10-01", null))).toBe(false);
    expect(canGoToday("2026-09-26", "", sep, dayBounds(null, "2026-09-25"))).toBe(false);
  });
});

describe("dateFieldText — the field's words, in the app's format", () => {
  it("reads as the app's day, with the year only when it is not this year", () => {
    expect(dateFieldText("2026-09-26", 2026)).toBe("Sat 26 Sep");
    expect(dateFieldText("2027-09-03", 2026)).toBe("Fri 3 Sep 2027");
    expect(dateFieldText("2025-12-31", 2026)).toBe("Wed 31 Dec 2025");
  });
  it("is empty for an empty or malformed value (the field shows its placeholder)", () => {
    expect(dateFieldText("", 2026)).toBe("");
    expect(dateFieldText("2026-02-30", 2026)).toBe("");
  });
  it("gives a screen reader the year every time", () => {
    expect(dayAccessibleName("2026-09-26")).toBe("Sat 26 Sep 2026");
  });
  it("names the months for the month-and-year view", () => {
    expect(monthShort(0)).toBe("Jan");
    expect(monthShort(11)).toBe("Dec");
  });
});
