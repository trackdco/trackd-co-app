/**
 * Push reminders — the server-side mirror of "what's due today".
 *
 * Every case here pins a defect found in the pre-merge review of wave 2 part
 * two, where the client learned about cycles and the timezone-free runway and
 * this mirror was left behind. The mirror is the thing users feel: the screen
 * being right does not stop the phone being wrong.
 */
import { describe, it, expect } from "vitest";

import {
  isDueToday,
  dueUnlogged,
  lowStock,
  lowStockMessage,
  doseReminderMessage,
  PC_REMINDER_SELECT,
  type ReminderCompound,
  type LowStockItem,
} from "@/lib/notifications/reminders";
import { CYCLE_COLUMNS, type CycleRule } from "@/lib/protocol/cycleRule";
import { isDueOnFor, type StackCompound } from "@/lib/home/stack";

/* ------------------------------------------------------------ fixtures */

const compound = (over: Partial<ReminderCompound> = {}): ReminderCompound => ({
  id: "pc1",
  name: "Testosterone E",
  schedule_type: "every_day",
  days_of_week: null,
  interval_days: null,
  first_dose_on: "2026-01-01",
  end_date: null,
  ...over,
});

/** 7 days on, 7 days off, counting from 1 Jan 2026. */
const sevenSeven: CycleRule = {
  pattern: { type: "onOff", onDays: 7, offDays: 7 },
  end: { type: "never" },
  colour: "slate",
  anchor: "2026-01-01",
};

const dateOf = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/* ------------------------------------------------------- the cycle gate */

describe("isDueToday — the cycle gate", () => {
  // 1-7 Jan are ON, 8-14 Jan are OFF, 15 Jan is ON again.
  const ON_DAYS = ["2026-01-01", "2026-01-04", "2026-01-07", "2026-01-15"];
  const OFF_DAYS = ["2026-01-08", "2026-01-11", "2026-01-14"];

  it("does not announce a dose on an off-cycle day", () => {
    const c = compound({ cycle: sevenSeven });
    for (const day of OFF_DAYS) {
      expect(isDueToday(c, day), `${day} must not be due`).toBe(false);
    }
  });

  it("still announces on an on-cycle day", () => {
    const c = compound({ cycle: sevenSeven });
    for (const day of ON_DAYS) {
      expect(isDueToday(c, day), `${day} must be due`).toBe(true);
    }
  });

  it("agrees with the client's isDueOnFor on every day of a full round", () => {
    // The regression that mattered: the two answered differently for a fortnight.
    const server = compound({ cycle: sevenSeven });
    const client = {
      id: "pc1",
      name: "Testosterone E",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: {
        cadence: { type: "daily" },
        timeOfDay: "08:00",
        startDate: "2026-01-01",
      },
      rotationSites: [],
      rotationIndex: 0,
      cycle: sevenSeven,
    } as unknown as StackCompound;

    for (let i = 0; i < 14; i++) {
      const d = new Date(2026, 0, 1 + i);
      const key = `2026-01-${String(d.getDate()).padStart(2, "0")}`;
      expect(isDueToday(server, key), `server/client disagree on ${key}`).toBe(
        isDueOnFor(client, dateOf(key)),
      );
    }
  });

  it("leaves an uncycled compound exactly as it was", () => {
    const c = compound();
    for (const day of [...ON_DAYS, ...OFF_DAYS]) {
      expect(isDueToday(c, day)).toBe(true);
    }
  });

  it("gates the nudge too, so an off day cannot be reported as missed", () => {
    const c = compound({ cycle: sevenSeven });
    expect(dueUnlogged([c], new Set(), "2026-01-11")).toEqual([]);
    expect(dueUnlogged([c], new Set(), "2026-01-04")).toHaveLength(1);
  });

  it("keeps the cycle gate independent of the cadence gate", () => {
    // Every second day, on a 7/7 cycle: an off-week must be silent even on the
    // days the cadence alone would fire.
    const c = compound({
      schedule_type: "every_n_days",
      interval_days: 2,
      cycle: sevenSeven,
    });
    expect(isDueToday(c, "2026-01-11")).toBe(false); // cadence-due, cycle off
    expect(isDueToday(c, "2026-01-05")).toBe(true); // cadence-due, cycle on
    expect(isDueToday(c, "2026-01-06")).toBe(false); // cycle on, cadence rest day
  });
});

describe("PC_REMINDER_SELECT", () => {
  it("fetches every cycle column, or the gate silently stops gating", () => {
    // A missing column does not throw: `cycleRuleFromColumns` just returns
    // undefined and every day reads as on. This is the guard against that.
    for (const col of CYCLE_COLUMNS) {
      expect(PC_REMINDER_SELECT, `${col} missing from the select`).toContain(col);
    }
  });
});

/* ---------------------------------------------------------- low stock */

describe("lowStock — the runway figure", () => {
  const item = (over: Partial<LowStockItem> = {}): LowStockItem => ({
    name: "Testosterone E",
    estEmptyDate: null,
    daysToEmpty: null,
    dosesRemaining: null,
    ...over,
  });

  it("prefers the view's day count over differencing a UTC-anchored date", () => {
    // The skew case: Sydney 09:00, so the DB's current_date is still yesterday.
    // est_empty_date says 7 days (fires at a threshold of 7); days_to_empty, the
    // figure the Protocol card shows, says 8 (does not fire).
    const skewed = item({ estEmptyDate: "2026-08-07", daysToEmpty: 8 });
    expect(lowStock([skewed], "2026-07-31", 7)).toEqual([]);
  });

  it("agrees with the Protocol card's amber threshold", () => {
    // The card goes amber at <= 7 days from empty, read off days_to_empty.
    for (const [days, expected] of [
      [8, false],
      [7, true],
      [1, true],
      [0, true],
    ] as const) {
      const got = lowStock([item({ daysToEmpty: days })], "2026-07-31", 7).length > 0;
      expect(got, `days_to_empty=${days}`).toBe(expected);
    }
  });

  it("falls back to the date when the count is absent", () => {
    const legacy = item({ estEmptyDate: "2026-08-03" });
    expect(lowStock([legacy], "2026-07-31", 7)).toHaveLength(1);
  });

  it("ignores a vial with neither figure rather than guessing", () => {
    expect(lowStock([item()], "2026-07-31", 7)).toEqual([]);
  });

  it("does not fire on a vial that already ran out", () => {
    expect(lowStock([item({ daysToEmpty: -1 })], "2026-07-31", 7)).toEqual([]);
  });
});

/* ------------------------------------------------------------ messages */

describe("push copy stays readable", () => {
  const vials = (n: number): LowStockItem[] =>
    Array.from({ length: n }, (_, i) => ({
      name: `Compound number ${i + 1}`,
      estEmptyDate: null,
      daysToEmpty: 1,
      dosesRemaining: null,
    }));

  it("lists a few vials by name", () => {
    expect(lowStockMessage(vials(3))?.body).toContain("Compound number 3");
  });

  it("stops listing names once the list would run long", () => {
    const body = lowStockMessage(vials(10))?.body ?? "";
    expect(body).toBe("10 compounds are running low.");
    expect(body).not.toContain("Compound number");
  });

  it("never calls them vials — the set can hold tubs and bottles too", () => {
    // The feeding query filters on no `inventory_type`, so creatine and vitamin
    // D3 reach this message and were announced as "2 vials are running low".
    expect(lowStockMessage(vials(3))?.body).not.toContain("vial");
    expect(lowStockMessage(vials(10))?.body).not.toContain("vial");
  });

  it("caps the dose digest the same way", () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      compound({ id: `c${i}`, name: `Compound number ${i + 1}` }),
    );
    expect(doseReminderMessage(many)?.body).toBe("You have 9 doses due today.");
  });

  it("keeps every message free of em dashes", () => {
    const bodies = [
      lowStockMessage(vials(1))?.body,
      lowStockMessage(vials(10))?.body,
      doseReminderMessage([compound()])?.body,
      doseReminderMessage(vials(9).map((_, i) => compound({ id: `c${i}` })))?.body,
    ];
    for (const b of bodies) expect(b ?? "").not.toContain("—");
  });
});
