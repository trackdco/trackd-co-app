/**
 * The night the runner told Adrian three doses were unlogged while all three sat
 * logged in the database, an hour old (2026-09-07, 20:00 Sydney).
 *
 * Two defects could each produce it on their own, and both are pinned here. The
 * shared principle: a nudge is an assertion ABOUT THE USER, so it may only be
 * made from facts we actually read.
 */
import { describe, expect, it } from "vitest";

import {
  dueUnlogged,
  loggedDayOf,
  overdueUnlogged,
  waitMinutes,
  type ReminderCompound,
} from "@/lib/notifications/reminders";

const SYD = "Australia/Sydney";

const compound = (over: Partial<ReminderCompound> = {}): ReminderCompound => ({
  id: "c1",
  name: "Vitamin D3",
  schedule_type: "every_day",
  days_of_week: null,
  interval_days: null,
  first_dose_on: "2026-07-01",
  end_date: null,
  ...over,
});

describe("which day a dose belongs to", () => {
  it("takes the day the device recorded, not the one derived from the instant", () => {
    // The real row from that night: taken_at 03:00 UTC, logged_for the 7th.
    expect(
      loggedDayOf({ logged_for: "2026-09-07", taken_at: "2026-09-07T03:00:00+00:00" }, SYD),
    ).toBe("2026-09-07");
  });

  it("keeps a BACK-DATED dose on the day it was entered FOR", () => {
    // Entered on the 8th, for the 7th. Deriving from the instant would count it
    // as the 8th, and the 7th would go on being nagged about forever.
    expect(
      loggedDayOf({ logged_for: "2026-09-07", taken_at: "2026-09-08T09:15:00+00:00" }, SYD),
    ).toBe("2026-09-07");
  });

  it("does not move a dose when the user has since changed timezone", () => {
    // Logged in Sydney, profile now says London. The stored day is a fact about
    // where they were standing; re-deriving it answers a different question.
    expect(
      loggedDayOf({ logged_for: "2026-09-07", taken_at: "2026-09-07T22:30:00+00:00" }, "Europe/London"),
    ).toBe("2026-09-07");
  });

  it("falls back to the instant only for a row written before logged_for existed", () => {
    expect(loggedDayOf({ logged_for: null, taken_at: "2026-09-07T03:00:00+00:00" }, SYD)).toBe(
      "2026-09-07",
    );
    // 22:30 UTC is already tomorrow in Sydney, which is what the fallback is for.
    expect(loggedDayOf({ logged_for: null, taken_at: "2026-09-07T22:30:00+00:00" }, SYD)).toBe(
      "2026-09-08",
    );
  });

  it("answers null rather than guessing when there is nothing to read", () => {
    expect(loggedDayOf({ logged_for: null, taken_at: null }, SYD)).toBeNull();
    expect(loggedDayOf({ logged_for: null, taken_at: "not a date" }, SYD)).toBeNull();
  });

  it("means a logged compound is not reported unlogged", () => {
    // The whole point, end to end: three due, three logged, nothing to nag about.
    const due = [compound({ id: "a" }), compound({ id: "b" }), compound({ id: "c" })];
    const logged = new Set(["a", "b", "c"]);
    expect(dueUnlogged(due, logged, "2026-09-07")).toHaveLength(0);
  });
});

describe("the unlogged nudge waits from the DOSE, not from the clock", () => {
  it("reads the stored wait, and defaults to two hours", () => {
    expect(waitMinutes("min_30")).toBe(30);
    expect(waitMinutes("hour_1")).toBe(60);
    expect(waitMinutes("hour_2")).toBe(120);
    expect(waitMinutes("hour_4")).toBe(240);
    expect(waitMinutes(null)).toBe(120);
    expect(waitMinutes("nonsense")).toBe(120);
  });

  it("says nothing about a dose that is not late yet", () => {
    // Due at 21:00, two hour wait, and it is 20:00. The old fixed cutoff called
    // this "still unlogged today" a full hour before it was even due.
    const evening = compound({ doseTimes: ["21:00:00"] });
    expect(overdueUnlogged([evening], 20 * 60, 120, 20 * 60)).toHaveLength(0);
  });

  it("names it once the dose plus the wait has passed", () => {
    const morning = compound({ doseTimes: ["10:09:00"] });
    expect(overdueUnlogged([morning], 12 * 60 + 8, 120, 20 * 60)).toHaveLength(0);
    expect(overdueUnlogged([morning], 12 * 60 + 9, 120, 20 * 60)).toHaveLength(1);
  });

  it("waits for the LAST dose of a multi-dose day", () => {
    // Morning done, evening still ahead: the compound is not "still unlogged"
    // until its final slot has come and gone.
    const twice = compound({ doseTimes: ["08:00:00", "20:00:00"] });
    expect(overdueUnlogged([twice], 11 * 60, 120, 20 * 60)).toHaveLength(0);
    expect(overdueUnlogged([twice], 22 * 60 + 1, 120, 20 * 60)).toHaveLength(1);
  });

  it("falls back to the cutoff for a compound with no dose time set", () => {
    // The time is optional by design, and "unset plus two hours" is not a time.
    const untimed = compound({ doseTimes: [] });
    expect(overdueUnlogged([untimed], 19 * 60, 120, 20 * 60)).toHaveLength(0);
    expect(overdueUnlogged([untimed], 20 * 60, 120, 20 * 60)).toHaveLength(1);
    // A null element is the stored "unset" state, not a value to parse.
    const nulled = compound({ doseTimes: [null] });
    expect(overdueUnlogged([nulled], 19 * 60, 120, 20 * 60)).toHaveLength(0);
  });

  it("narrows the message to what is actually late", () => {
    // Adrian's three, at 17:45 with a two hour wait. D3 (10:09) went late at
    // 12:09 and Vitamin C (15:39) at 17:39; Retatrutide (16:28) is not late
    // until 18:28, so the message must not count it.
    const set = [
      compound({ id: "d3", doseTimes: ["10:09:00"] }),
      compound({ id: "c", doseTimes: ["15:39:00"] }),
      compound({ id: "reta", doseTimes: ["16:28:00"] }),
    ];
    const late = overdueUnlogged(set, 17 * 60 + 45, 120, 20 * 60);
    expect(late.map((c) => c.id)).toEqual(["d3", "c"]);
  });
});

describe("the nudge still arrives in the evening, it just says less", () => {
  /* The first cut of this fix fired the moment anything went overdue. That is
     worse, not better: one column records the day's nudge, so the earliest late
     dose spends it and the evening dose you also forgot is never mentioned.
     The cutoff stays; only the CONTENT is narrowed to what is genuinely late. */
  const morning = compound({ id: "d3", doseTimes: ["10:09:00"] });
  const evening = compound({ id: "reta", doseTimes: ["21:00:00"] });

  it("is silent at lunchtime even though the morning dose is overdue", () => {
    // Overdue since 12:09, but the message is not the runner's to spend yet.
    const late = overdueUnlogged([morning, evening], 12 * 60 + 30, 120, 20 * 60);
    expect(late.map((c) => c.id)).toEqual(["d3"]);
    expect(12 * 60 + 30 >= 20 * 60).toBe(false); // the gate the runner applies
  });

  it("at the cutoff names the morning dose and not the 9pm one", () => {
    // The original defect: a 21:00 dose reported "still unlogged" at 20:00.
    const late = overdueUnlogged([morning, evening], 20 * 60, 120, 20 * 60);
    expect(late.map((c) => c.id)).toEqual(["d3"]);
  });

  it("catches the whole day rather than only the first thing to go late", () => {
    const alsoAfternoon = compound({ id: "vitc", doseTimes: ["15:39:00"] });
    const late = overdueUnlogged([morning, alsoAfternoon], 20 * 60, 120, 20 * 60);
    expect(late.map((c) => c.id)).toEqual(["d3", "vitc"]);
  });
});
