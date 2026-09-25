import { describe, it, expect } from "vitest";

import {
  candidates,
  dayStats,
  doseSwap,
  lowSwap,
  missedSwap,
  pickCheckup,
  remindersPausedForSpace,
  shortTime,
  stableIndex,
  streakOf,
  type CheckupFacts,
  type DayStat,
  type HistoryLog,
  type SwapContext,
} from "@/lib/notifications/checkups";
import { shiftDateKey, type ReminderCompound } from "@/lib/notifications/reminders";
import type { CycleRule } from "@/lib/protocol/cycleRule";

/* ------------------------------------------------------------ fixtures */

const compound = (over: Partial<ReminderCompound> = {}): ReminderCompound => ({
  id: "pc1",
  name: "BPC-157",
  schedule_type: "every_day",
  days_of_week: null,
  interval_days: null,
  first_dose_on: "2025-01-01",
  end_date: null,
  ...over,
});

/** Every day from `from` for `n` days, logged as `status`. */
const logRun = (compoundId: string, from: string, n: number, status = "taken"): HistoryLog[] =>
  Array.from({ length: n }, (_, i) => ({ compoundId, day: shiftDateKey(from, i), status }));

const TODAY = "2026-09-27"; // a Sunday

const facts = (over: Partial<CheckupFacts> = {}): CheckupFacts => {
  const compounds = over.compounds ?? [compound()];
  const logs = over.logs ?? [];
  const from = shiftDateKey(over.todayKey ?? TODAY, -400);
  return {
    userId: "u1",
    todayKey: TODAY,
    nowMinutes: 23 * 60,
    hideNames: false,
    compounds,
    stats: dayStats(compounds, logs, from, over.todayKey ?? TODAY),
    logs,
    lastLogDay: null,
    firstLogDay: null,
    signupDay: null,
    sent: new Set(),
    weights: [],
    weightUnit: "kg",
    weightDirection: null,
    photoDays: [],
    bloodDays: [],
    journalDays: [],
    stock: [],
    ...over,
  };
};

const keys = (f: CheckupFacts) => candidates(f).map((c) => c.key);

/** Every body and title the module can produce, checked against the house rules. */
const houseRules = (title: string, body: string) => {
  expect(`${title} ${body}`).not.toContain("—");
  expect(`${title} ${body}`).not.toMatch(/kyle/i);
  for (const line of body.split("\n")) {
    // One exception, Adrian's: Clean Sweep ends "Frame it."
    if (line === "A perfect month. Frame it.") continue;
    expect(line).not.toMatch(/[^.]\.$/);
  }
};

/* ------------------------------------------------------------ counting */

describe("dayStats", () => {
  it("counts doses, one per dose time, and caps logs at what was due", () => {
    const twice = compound({ doseTimes: ["08:00", "20:00"] });
    const logs = [...logRun("pc1", "2026-09-26", 1), ...logRun("pc1", "2026-09-26", 1), ...logRun("pc1", "2026-09-26", 1)];
    const [day] = dayStats([twice], logs, "2026-09-26", "2026-09-26");
    expect(day).toEqual({ key: "2026-09-26", due: 2, taken: 2, resolved: 2 });
  });

  it("counts a skip as dealt with but not as taken", () => {
    const [day] = dayStats([compound()], logRun("pc1", "2026-09-26", 1, "skipped"), "2026-09-26", "2026-09-26");
    expect(day).toMatchObject({ due: 1, taken: 0, resolved: 1 });
  });

  it("makes a day with nothing due a rest day", () => {
    const mondays = compound({ schedule_type: "specific_days", days_of_week: [1] });
    const [sunday] = dayStats([mondays], [], TODAY, TODAY);
    expect(sunday.due).toBe(0);
  });
});

describe("streakOf", () => {
  const stat = (key: string, due: number, resolved: number): DayStat => ({ key, due, taken: resolved, resolved });

  it("does not break on an unfinished today", () => {
    const s = streakOf([stat("a", 1, 1), stat("b", 1, 1), stat("c", 1, 0)]);
    expect(s).toMatchObject({ current: 2, todayComplete: false, todayDue: 1 });
  });

  it("counts today once today is finished", () => {
    expect(streakOf([stat("a", 1, 1), stat("b", 1, 1)]).current).toBe(2);
  });

  it("treats a rest day as neither", () => {
    expect(streakOf([stat("a", 1, 1), stat("b", 0, 0), stat("c", 1, 1)]).current).toBe(2);
  });

  it("knows the best run before this one, and where this one began", () => {
    const s = streakOf([stat("a", 1, 1), stat("b", 1, 1), stat("c", 1, 1), stat("d", 1, 0), stat("e", 1, 1)]);
    expect(s).toMatchObject({ current: 1, bestBefore: 3, since: "e" });
  });
});

/* ------------------------------------------------------------ swaps */

describe("swaps", () => {
  const ctx = (over: Partial<SwapContext> = {}): SwapContext => ({
    userId: "u1", todayKey: TODAY, nowMinutes: 9 * 60, hideNames: false, ...over,
  });

  it("keep the plain wording on about half the days", () => {
    let plain = 0;
    for (let i = 0; i < 200; i++) {
      if (!doseSwap([compound()], ctx({ todayKey: shiftDateKey("2026-01-01", i) }))) plain++;
    }
    expect(plain).toBeGreaterThan(70);
    expect(plain).toBeLessThan(130);
  });

  it("never name a compound with names hidden", () => {
    for (let i = 0; i < 60; i++) {
      const c = ctx({ todayKey: shiftDateKey("2026-01-01", i), hideNames: true });
      expect(doseSwap([compound()], c)).toBeNull();
      expect(missedSwap([compound()], c, null)).toBeNull();
      expect(lowSwap([{ name: "BPC-157", estEmptyDate: null, daysToEmpty: 2, dosesRemaining: 2 }], c)).toBeNull();
    }
  });

  it("only say 'up first today' about a morning dose still ahead", () => {
    const early = compound({ doseTimes: ["08:00"] });
    const bodies = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const m = doseSwap([early], ctx({ todayKey: shiftDateKey("2026-01-01", i), nowMinutes: 9 * 60 }));
      if (m) bodies.add(m.body);
    }
    for (const b of bodies) expect(b).not.toMatch(/up first today|Coffee first/);

    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      const m = doseSwap([early], ctx({ todayKey: shiftDateKey("2026-01-01", i), nowMinutes: 7 * 60 }));
      if (m) seen.add(m.body);
    }
    expect([...seen].some((b) => b.includes("It's due at 8:00 this morning"))).toBe(true);
  });

  it("send the streak alert instead of don't-forget when a streak is at stake, names or not", () => {
    const streak = { current: 12, since: "x", bestBefore: 0, todayDue: 1, todayComplete: false };
    const m = missedSwap([compound()], ctx({ nowMinutes: 20 * 60, hideNames: true }), streak);
    expect(m?.title).toBe("Streak Alert");
    expect(m?.body).toMatch(/12-day streak/);
    expect(m?.tag).toBe("trackd-missed");
  });

  it("say how many doses are left and nothing about buying more", () => {
    const one = [{ name: "TB-500", estEmptyDate: null, daysToEmpty: 3, dosesRemaining: 2.4 }];
    const bodies = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const m = lowSwap(one, ctx({ todayKey: shiftDateKey("2026-01-01", i) }));
      if (m) bodies.add(m.body);
    }
    expect(bodies).toEqual(
      new Set(["About 2 doses of TB-500 left at your current pace", "TB-500 has about 2 doses left. Don't get caught short"]),
    );
    for (const b of bodies) expect(b).not.toMatch(/order|buy/i);
  });

  it("follow the house rules in every wording", () => {
    const pairs: Array<[ReminderCompound[], number]> = [[[compound({ doseTimes: ["08:00"] })], 7 * 60], [[compound(), compound({ id: "pc2", name: "TB-500" })], 9 * 60]];
    for (let i = 0; i < 60; i++) {
      for (const [due, now] of pairs) {
        const c = ctx({ todayKey: shiftDateKey("2026-01-01", i), nowMinutes: now });
        for (const m of [doseSwap(due, c), missedSwap(due.slice(0, 1), c, null)]) {
          if (m) houseRules(m.title, m.body);
        }
      }
    }
  });
});

/* ------------------------------------------------------------ check-ups */

describe("check-ups", () => {
  it("say nothing when there is nothing to say", () => {
    expect(candidates(facts())).toEqual([]);
  });

  it("leave a one-off out once it has been sent, and everything out when the log is unreadable", () => {
    const f = facts({ firstLogDay: shiftDateKey(TODAY, -1) });
    expect(keys(f)).toContain("day-two");
    expect(keys({ ...f, sent: new Set(["day-two"]) })).not.toContain("day-two");
    expect(keys({ ...f, sent: null })).not.toContain("day-two");
  });

  it("wait for their hour", () => {
    const f = facts({ firstLogDay: shiftDateKey(TODAY, -1) });
    expect(pickCheckup({ ...f, nowMinutes: 8 * 60 + 59 })).toBeNull();
    expect(pickCheckup({ ...f, nowMinutes: 9 * 60 })?.key).toBe("day-two");
  });

  it("send the most important one first", () => {
    const f = facts({
      firstLogDay: shiftDateKey(TODAY, -1),
      weights: [{ day: shiftDateKey(TODAY, -7), kg: 90 }, { day: shiftDateKey(TODAY, -14), kg: 91 }],
      stock: [{ id: "i1", compoundId: "pc1", name: "BPC-157", reconstitutedOn: shiftDateKey(TODAY, -28), dosesRemaining: 5 }],
    });
    expect(pickCheckup(f)?.key).toBe("vial:i1");
  });

  describe("the week (Sunday)", () => {
    const monday = shiftDateKey(TODAY, -6);
    it("says Flawless for a full week", () => {
      const f = facts({ logs: logRun("pc1", monday, 7) });
      const c = candidates(f).find((x) => x.key === `week:${monday}`);
      expect(c?.message.body).toBe("7 of 7 doses logged. Flawless");
    });
    it("leaves today out until today is done", () => {
      const f = facts({ logs: logRun("pc1", monday, 6) });
      expect(candidates(f).find((x) => x.key.startsWith("week:"))?.message.body).toBe("6 of 6 doses logged. Flawless");
    });
    it("says nothing about a week with nothing logged", () => {
      expect(keys(facts()).some((k) => k.startsWith("week:"))).toBe(false);
    });
    it("calls a patchy week a clean slate", () => {
      const f = facts({ logs: logRun("pc1", monday, 3) });
      expect(candidates(f).find((x) => x.key.startsWith("week:"))?.message.body).toBe("3 of 6 doses logged. Next week's a clean slate");
    });
    it("mentions weight only toward a known goal, in their unit", () => {
      const weights = [{ day: shiftDateKey(TODAY, -1), kg: 89.4 }, { day: shiftDateKey(TODAY, -8), kg: 90 }];
      const logs = logRun("pc1", monday, 7);
      const cut = facts({ logs, weights, weightDirection: -1 });
      expect(candidates(cut).find((x) => x.key.startsWith("week:"))?.message.body).toBe(
        "7 of 7 doses logged, and your weight moved 0.6 kg toward your goal 🎉",
      );
      const bulk = facts({ logs, weights, weightDirection: 1 });
      expect(candidates(bulk).find((x) => x.key.startsWith("week:"))?.message.body).toBe("7 of 7 doses logged. Flawless");
      const lbs = facts({ logs, weights, weightDirection: -1, weightUnit: "lbs" });
      expect(candidates(lbs).find((x) => x.key.startsWith("week:"))?.message.body).toMatch(/1\.3 lbs toward your goal/);
    });
  });

  it("congratulates a perfect month on the 1st and says nothing about a weak one", () => {
    const today = "2026-10-01";
    const perfect = facts({ todayKey: today, logs: logRun("pc1", "2026-09-01", 30) });
    const body = candidates(perfect).find((c) => c.key === "month:2026-09")?.message.body ?? "";
    expect(["30 for 30 in September\nNot a single dose missed 🏆", "Every dose in September, logged\nA perfect month. Frame it."]).toContain(body);
    const weak = facts({ todayKey: today, logs: logRun("pc1", "2026-09-01", 15) });
    expect(keys(weak)).not.toContain("month:2026-09");
  });

  describe("streaks", () => {
    it("marks 100 days once", () => {
      const f = facts({ logs: logRun("pc1", shiftDateKey(TODAY, -99), 100) });
      const c = candidates(f).find((x) => x.key.startsWith("streak-100:"));
      expect(c?.message.title).toBe("100 Days");
    });
    it("calls a new record only past two weeks and past their best", () => {
      const short = facts({ logs: logRun("pc1", shiftDateKey(TODAY, -9), 10) });
      expect(keys(short).some((k) => k.startsWith("record:"))).toBe(false);
      const best = facts({ logs: [...logRun("pc1", "2026-06-01", 20), ...logRun("pc1", shiftDateKey(TODAY, -20), 21)] });
      const rec = candidates(best).find((x) => x.key.startsWith("record:"));
      expect(rec?.message.body).toBe("21 days straight\nThat's your longest streak yet 🔥");
    });
  });

  describe("quiet spells", () => {
    const quiet = (gap: number) => {
      const last = shiftDateKey(TODAY, -gap);
      return facts({ lastLogDay: last, logs: logRun("pc1", shiftDateKey(last, -5), 6) });
    };
    it("go a week, two weeks, three weeks, each once", () => {
      expect(keys(quiet(7))).toContain(`quiet:7:${shiftDateKey(TODAY, -7)}`);
      expect(keys(quiet(15))).toContain(`quiet:14:${shiftDateKey(TODAY, -15)}`);
      expect(keys(quiet(21))).toContain(`quiet:21:${shiftDateKey(TODAY, -21)}`);
      expect(keys(quiet(40)).some((k) => k.startsWith("quiet:"))).toBe(false);
    });
    it("title the one-week spell with the app name alone", () => {
      expect(candidates(quiet(7)).find((c) => c.key.startsWith("quiet:7"))?.message.title).toBe("");
    });
    it("keep reminders paused after 'Giving You Space' until the next log", () => {
      const last = "2026-09-01";
      const sent = new Set([`quiet:21:${last}`]);
      expect(remindersPausedForSpace(sent, last)).toBe(true);
      expect(remindersPausedForSpace(sent, "2026-09-26")).toBe(false);
      expect(remindersPausedForSpace(null, last)).toBe(false);
    });
  });

  describe("cycles", () => {
    const cycle: CycleRule = { pattern: { type: "onOff", onDays: 21, offDays: 7 }, end: { type: "never" }, colour: "slate", anchor: "2026-08-30" };
    it("announce a week-long break and when it ends", () => {
      // 30 Aug + 21 = 20 Sep: the first day off. Back on 27 Sep.
      const f = facts({ todayKey: "2026-09-20", compounds: [compound({ cycle })] });
      expect(candidates(f).find((c) => c.key.startsWith("cycle-off"))?.message.body).toBe(
        "BPC-157 is on its break. Nothing due until 27 Sep",
      );
      const back = facts({ todayKey: "2026-09-27", compounds: [compound({ cycle })] });
      expect(keys(back).some((k) => k.startsWith("cycle-on"))).toBe(true);
    });
    it("stay quiet about a two-day weekend off", () => {
      const weekend: CycleRule = { ...cycle, pattern: { type: "onOff", onDays: 5, offDays: 2 } };
      for (let i = 0; i < 14; i++) {
        const f = facts({ todayKey: shiftDateKey("2026-09-01", i), compounds: [compound({ cycle: weekend })] });
        expect(keys(f).some((k) => k.startsWith("cycle-"))).toBe(false);
      }
    });
    it("warn three days before a cycle ends", () => {
      const ending: CycleRule = { pattern: { type: "continuous" }, end: { type: "onDate", date: "2026-09-30" }, colour: "slate", anchor: "2026-08-01" };
      const f = facts({ compounds: [compound({ cycle: ending })] });
      expect(candidates(f).find((c) => c.key.startsWith("cycle-end"))?.message.body).toBe("Your BPC-157 cycle ends on 30 Sep");
    });
  });

  it("name nothing with names hidden", () => {
    const f = facts({
      hideNames: true,
      logs: logRun("pc1", shiftDateKey(TODAY, -10), 11),
      stock: [{ id: "i1", compoundId: "pc1", name: "BPC-157", reconstitutedOn: shiftDateKey(TODAY, -28), dosesRemaining: 0.5 }],
    });
    for (const c of candidates(f)) expect(`${c.message.title} ${c.message.body}`).not.toContain("BPC-157");
  });

  it("send All Gone only for the dose that emptied the last of it", () => {
    const logs = logRun("pc1", TODAY, 1);
    const empty = { id: "i1", compoundId: "pc1", name: "TB-500", reconstitutedOn: null, dosesRemaining: 0 };
    expect(keys(facts({ logs, stock: [empty] }))).toContain("gone:i1");
    const spare = { id: "i2", compoundId: "pc1", name: "TB-500", reconstitutedOn: null, dosesRemaining: 10 };
    expect(keys(facts({ logs, stock: [empty, spare] }))).not.toContain("gone:i1");
    expect(keys(facts({ logs: [], stock: [empty] }))).not.toContain("gone:i1");
  });

  it("follow the house rules in every check-up", () => {
    const days = Array.from({ length: 40 }, (_, i) => shiftDateKey("2026-09-01", i));
    for (const todayKey of days) {
      const f = facts({
        todayKey,
        logs: logRun("pc1", shiftDateKey(todayKey, -120), 121),
        lastLogDay: shiftDateKey(todayKey, -8),
        firstLogDay: shiftDateKey(todayKey, -365),
        signupDay: shiftDateKey(todayKey, -7),
        weights: [{ day: shiftDateKey(todayKey, -7), kg: 90 }, { day: shiftDateKey(todayKey, -20), kg: 91 }],
        photoDays: [shiftDateKey(todayKey, -86), shiftDateKey(todayKey, -30)],
        bloodDays: [shiftDateKey(todayKey, -85)],
        journalDays: [shiftDateKey(todayKey, -15), shiftDateKey(todayKey, -40)],
      });
      for (const c of candidates(f)) houseRules(c.message.title, c.message.body);
    }
  });
});

describe("helpers", () => {
  it("write a time the way the cards did", () => {
    expect(shortTime("08:00")).toBe("8:00");
    expect(shortTime("20:30:00")).toBe("20:30");
  });
  it("pick the same way for the same day, every tick", () => {
    expect(stableIndex("u1|2026-09-27|dose", 6)).toBe(stableIndex("u1|2026-09-27|dose", 6));
  });
});
