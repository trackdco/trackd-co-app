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
import { isStoppedOn } from "@/lib/protocol/scheduleVersions";
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

/* ------------------------------------------------------- the pause gates */

describe("isDueToday — pauses do all three of the things they do on the client", () => {
  /**
   * A pause is not one gate but three, and this mirror had only the first: the
   * day is not due; the CADENCE re-anchors to the resume day; paused days do not
   * advance the CYCLE clock. A cold review walked an every-3-days compound
   * paused for two days and found the app and the phone disagreeing on seven of
   * the next eleven days — the phone announcing doses the app never asked for,
   * and silent on the days it did ask.
   */
  const pause = (startedOn: string, endsOn: string | null) => ({
    id: `p-${startedOn}`,
    startedOn,
    endsOn,
  });

  const clientOf = (over: Record<string, unknown> = {}) =>
    ({
      id: "pc1",
      name: "Testosterone E",
      category: "anabolic",
      method: "im",
      dose: 250,
      unit: "mg",
      schedule: {
        cadence: { type: "everyNDays", n: 3 },
        timeOfDay: "08:00",
        startDate: "2026-08-01",
      },
      rotationSites: [],
      rotationIndex: 0,
      ...over,
    }) as unknown as StackCompound;

  const serverOf = (over: Partial<ReminderCompound> = {}) =>
    compound({
      schedule_type: "every_n_days",
      interval_days: 3,
      first_dose_on: "2026-08-01",
      ...over,
    });

  it("re-anchors the cadence to the resume day, exactly as the client does", () => {
    const pauses = [pause("2026-08-04", "2026-08-05")];
    const server = serverOf({ pauses });
    const client = clientOf({ pauses });
    for (let i = 1; i <= 20; i++) {
      const key = `2026-08-${String(i).padStart(2, "0")}`;
      expect(isDueToday(server, key), `server/client disagree on ${key}`).toBe(
        isDueOnFor(client, dateOf(key)),
      );
    }
    // And concretely, so a future edit cannot make both sides wrong together:
    // the compound comes back on the 6th and runs 6, 9, 12 — not 7, 10, 13.
    expect(isDueToday(server, "2026-08-06")).toBe(true);
    expect(isDueToday(server, "2026-08-07")).toBe(false);
    expect(isDueToday(server, "2026-08-09")).toBe(true);
  });

  it("does not let paused days advance the cycle clock", () => {
    const pauses = [pause("2026-08-03", "2026-08-05")];
    const cycle: CycleRule = {
      pattern: { type: "onOff", onDays: 5, offDays: 2 },
      end: { type: "never" },
      colour: "slate",
      anchor: "2026-08-01",
    };
    const server = serverOf({ schedule_type: "every_day", interval_days: null, cycle, pauses });
    const client = clientOf({
      schedule: { cadence: { type: "daily" }, timeOfDay: "08:00", startDate: "2026-08-01" },
      cycle,
      pauses,
    });
    for (let i = 1; i <= 21; i++) {
      const key = `2026-08-${String(i).padStart(2, "0")}`;
      expect(isDueToday(server, key), `server/client disagree on ${key}`).toBe(
        isDueOnFor(client, dateOf(key)),
      );
    }
  });

  it("still refuses the days the pause itself covers", () => {
    const server = serverOf({
      schedule_type: "every_day",
      interval_days: null,
      pauses: [pause("2026-08-04", "2026-08-06")],
    });
    expect(isDueToday(server, "2026-08-04")).toBe(false);
    expect(isDueToday(server, "2026-08-06")).toBe(false); // ends_on is inclusive
    expect(isDueToday(server, "2026-08-07")).toBe(true);
  });

  it("handles an open-ended pause, which has no resume day to anchor to", () => {
    const pauses = [pause("2026-08-04", null)];
    const server = serverOf({ pauses });
    const client = clientOf({ pauses });
    for (const key of ["2026-08-05", "2026-08-10", "2026-09-01"]) {
      expect(isDueToday(server, key), `disagree on ${key}`).toBe(
        isDueOnFor(client, dateOf(key)),
      );
      expect(isDueToday(server, key)).toBe(false);
    }
  });

  it("anchors on the earliest recorded version, so a re-add cannot shift the grid", () => {
    // `first_dose_on` is rewritten by a re-add; the client keeps the original
    // origin as the anchor. Anchored on the new date alone the two land on
    // different residues mod 3 and disagree on every dose day of the new run.
    const server = serverOf({ first_dose_on: "2026-08-04", scheduleOrigin: "2026-08-01" });
    const client = clientOf({
      schedule: { cadence: { type: "everyNDays", n: 3 }, timeOfDay: "08:00", startDate: "2026-08-04" },
      scheduleHistory: [
        {
          effectiveFrom: "2026-08-01",
          cadence: { type: "everyNDays", n: 3 },
          timeOfDay: "08:00",
          dose: 250,
          unit: "mg",
        },
      ],
    });
    for (let i = 1; i <= 20; i++) {
      const key = `2026-08-${String(i).padStart(2, "0")}`;
      expect(isDueToday(server, key), `server/client disagree on ${key}`).toBe(
        isDueOnFor(client, dateOf(key)),
      );
    }
  });

  it("leaves a compound with no pauses exactly as it was", () => {
    const server = serverOf();
    for (const key of ["2026-08-01", "2026-08-04", "2026-08-07"]) {
      expect(isDueToday(server, key)).toBe(true);
    }
    expect(isDueToday(server, "2026-08-05")).toBe(false);
  });
});

/* ----------------------------------------------------- the stopped gate */

describe("isDueToday — the stopped gate", () => {
  /**
   * The bug this pins, measured on a real account: four compounds were DELETED
   * on 31 July and 7 August, and `protocol_compounds.is_active` stayed true
   * because that one write never landed. For up to thirteen days the runner read
   * the stale flag, announced them as due every morning and nagged for "missing"
   * them every evening — while the app, which reads the schedule trail, had
   * correctly shown nothing. The trail was in Postgres the whole time.
   */
  const deletedOn = (dateKey: string) => ({
    effectiveFrom: dateKey,
    cadence: { type: "daily" as const },
    timeOfDay: "08:00",
    dose: 250,
    unit: "mg",
    stopped: true,
  });

  const client = (history: unknown[]) =>
    ({
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
      scheduleHistory: history,
    }) as unknown as StackCompound;

  it("never announces a compound the trail says was deleted", () => {
    expect(isDueToday(compound({ stopped: true }), "2026-01-05")).toBe(false);
  });

  it("cannot report a deleted compound as missed either", () => {
    expect(dueUnlogged([compound({ stopped: true })], new Set(), "2026-01-05")).toEqual([]);
  });

  it("agrees with the client on every day around the delete", () => {
    // The whole point: one predicate, two readers. `isStoppedOn` decides for the
    // server exactly what `resolveScheduleOn` decides for the client.
    const history = [
      { ...deletedOn("2026-01-01"), stopped: false },
      deletedOn("2026-01-10"),
    ];
    for (let i = 0; i < 20; i++) {
      const d = new Date(2026, 0, 1 + i);
      const key = `2026-01-${String(d.getDate()).padStart(2, "0")}`;
      const server = compound({ stopped: isStoppedOn(history, key) });
      expect(isDueToday(server, key), `server/client disagree on ${key}`).toBe(
        isDueOnFor(client(history), dateOf(key)),
      );
    }
  });

  it("comes back when the compound is re-added", () => {
    // A re-add records its own version and `recordScheduleVersion` drops every
    // version dated after it, so the stop stops governing. If this ever fails,
    // the gate is silencing compounds the user is actually running — the exact
    // opposite failure, and a worse one.
    const history = [deletedOn("2026-01-10"), { ...deletedOn("2026-01-15"), stopped: false }];
    expect(isStoppedOn(history, "2026-01-12")).toBe(true);
    expect(isStoppedOn(history, "2026-01-20")).toBe(false);
    expect(isDueToday(compound({ stopped: isStoppedOn(history, "2026-01-20") }), "2026-01-20")).toBe(
      true,
    );
  });

  it("leaves a compound with no trail alone", () => {
    // Every compound until one is edited. No versions must read as running.
    expect(isStoppedOn([], "2026-01-05")).toBe(false);
    expect(isDueToday(compound(), "2026-01-05")).toBe(true);
  });

  it("suppresses the low-stock nudge for a deleted compound's vials", () => {
    const vial: LowStockItem = {
      name: "Testosterone E",
      stopped: true,
      estEmptyDate: null,
      daysToEmpty: 1,
      dosesRemaining: 2,
    };
    expect(lowStock([vial], "2026-01-05", 7)).toEqual([]);
    expect(lowStock([{ ...vial, stopped: false }], "2026-01-05", 7)).toHaveLength(1);
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
