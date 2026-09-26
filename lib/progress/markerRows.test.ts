import { describe, expect, it } from "vitest";

import {
  createRemovalQueue,
  keyStep,
  pinFloor,
  pinLift,
  ratedInOrder,
  restoreRow,
  seedRows,
  stepAt,
  stepLook,
  tapStep,
} from "@/lib/progress/markerPick";

describe("seedRows", () => {
  it("makes every marker a row, in order, once, and keeps only whole ratings of 1 or more", () => {
    const { order, rated } = seedRows([
      { markerId: "energy", tierValue: 4 },
      { markerId: "sleep", tierValue: 0 }, // added, not rated yet
      { markerId: "energy", tierValue: 2 }, // a duplicate keeps the first place
      { markerId: "mood", tierValue: 2.9 },
      { markerId: "", tierValue: 3 },
      { markerId: "acne", tierValue: Number.NaN },
    ]);
    expect(order).toEqual(["energy", "sleep", "mood", "acne"]);
    expect([...rated.entries()]).toEqual([
      ["energy", 2],
      ["mood", 2],
    ]);
  });

  it("B6: a row handed back unrated stays a row and is never reported as a rating", () => {
    const { order, rated } = seedRows([
      { markerId: "sleep", tierValue: 3 },
      { markerId: "energy", tierValue: 0 },
    ]);
    expect(order).toEqual(["sleep", "energy"]);
    expect(ratedInOrder(order, rated)).toEqual([{ markerId: "sleep", tierValue: 3 }]);
  });
});

describe("ratedInOrder", () => {
  it("reports the rated rows in row order, whatever order they were rated in", () => {
    const rated = new Map([
      ["c", 1],
      ["a", 5],
    ]);
    expect(ratedInOrder(["a", "b", "c"], rated)).toEqual([
      { markerId: "a", tierValue: 5 },
      { markerId: "c", tierValue: 1 },
    ]);
  });

  it("leaves out a rating whose row has gone", () => {
    expect(ratedInOrder(["a"], new Map([["gone", 3]]))).toEqual([]);
  });
});

describe("restoreRow", () => {
  it("puts a removed row back where it was", () => {
    expect(restoreRow(["a", "c"], "b", 1)).toEqual(["a", "b", "c"]);
  });

  it("clamps to the end when rows have gone since, and never doubles a row", () => {
    expect(restoreRow(["a"], "b", 5)).toEqual(["a", "b"]);
    expect(restoreRow(["a", "b"], "b", 0)).toEqual(["a", "b"]);
    expect(restoreRow([], "b", -1)).toEqual(["b"]);
  });
});

describe("the steps", () => {
  it("finds the step under a pointer across five equal bars, holding the ends", () => {
    // Five bars across 100px starting at x = 20.
    expect(stepAt(21, 20, 100, 5)).toBe(1);
    expect(stepAt(40, 20, 100, 5)).toBe(1);
    expect(stepAt(41, 20, 100, 5)).toBe(2);
    expect(stepAt(119, 20, 100, 5)).toBe(5);
    expect(stepAt(-50, 20, 100, 5)).toBe(1);
    expect(stepAt(500, 20, 100, 5)).toBe(5);
    expect(stepAt(50, 0, 100, 2)).toBe(1);
    expect(stepAt(51, 0, 100, 2)).toBe(2);
  });

  it("tapping the chosen step clears it; any other sets it", () => {
    expect(tapStep(3, 3)).toBe(0);
    expect(tapStep(3, 4)).toBe(4);
    expect(tapStep(0, 1)).toBe(1);
  });

  it("fills white up to the rating on a ramp, the chosen bar full and enlarged", () => {
    const four = [0, 1, 2, 3, 4].map((i) => stepLook(i, 4));
    expect(four.map((b) => b.filled)).toEqual([true, true, true, true, false]);
    expect(four[0].opacity).toBeCloseTo(0.45 + 0.55 / 4);
    expect(four[3].opacity).toBe(1);
    expect(four.map((b) => b.scale)).toEqual([1, 1, 1, 1.08, 1]);
    // The ramp rises left to right.
    for (let i = 1; i < 4; i++) expect(four[i].opacity).toBeGreaterThan(four[i - 1].opacity);
  });

  it("draws nothing filled or enlarged before a rating", () => {
    for (let i = 0; i < 5; i++) expect(stepLook(i, 0)).toEqual({ filled: false, opacity: 0, scale: 1 });
  });

  it("takes the keyboard as a slider from not rated to the top step", () => {
    expect(keyStep(0, "ArrowRight", 5)).toBe(1);
    expect(keyStep(5, "ArrowUp", 5)).toBe(5);
    expect(keyStep(1, "ArrowLeft", 5)).toBe(0);
    expect(keyStep(0, "ArrowDown", 5)).toBe(0);
    expect(keyStep(3, "Home", 5)).toBe(0);
    expect(keyStep(2, "End", 5)).toBe(5);
    expect(keyStep(4, "Backspace", 5)).toBe(0);
    expect(keyStep(4, "Delete", 5)).toBe(0);
    expect(keyStep(4, "a", 5)).toBeNull();
  });
});

describe("the pinned Add bar", () => {
  const bar = { left: 20, right: 370 };

  it("sits above the tab bar and the + when they overlap it", () => {
    const nav = { top: 780, bottom: 844, left: 0, right: 390 };
    const plus = { top: 708, bottom: 764, left: 314, right: 370 };
    expect(pinFloor(0, 844, bar, [nav], 8)).toBe(772);
    expect(pinFloor(0, 844, bar, [nav, plus], 8)).toBe(700);
  });

  it("ignores what is beside the bar, not drawn, off screen or up top", () => {
    const beside = { top: 700, bottom: 760, left: 380, right: 390 };
    const hidden = { top: 0, bottom: 0, left: 0, right: 0 };
    const below = { top: 900, bottom: 960, left: 0, right: 390 };
    const header = { top: 0, bottom: 60, left: 0, right: 390 };
    expect(pinFloor(0, 844, bar, [beside, hidden, below, header], 8)).toBe(836);
  });

  it("W8: lifts a bar below the floor up to it, as sticky would", () => {
    // The bar sits at 900 to 944, the floor is 772: lift it by 172.
    expect(pinLift({ top: 900, bottom: 944 }, 772, 300)).toBe(-172);
  });

  it("never lifts a bar that is already in view, or past the picker's top", () => {
    expect(pinLift({ top: 500, bottom: 544 }, 772, 300)).toBe(0);
    // The picker's top is at 880: the bar can rise only 20.
    expect(pinLift({ top: 900, bottom: 944 }, 772, 880)).toBe(-20);
    expect(pinLift({ top: 900, bottom: 944 }, 772, 950)).toBe(0);
  });
});

describe("createRemovalQueue (cold review B6)", () => {
  function fakeClock() {
    let now = 0;
    const jobs: { at: number; fn: () => void; id: number }[] = [];
    let next = 1;
    return {
      timers: {
        set: (fn: () => void, ms: number) => {
          const id = next++;
          jobs.push({ at: now + ms, fn, id });
          return id;
        },
        clear: (h: unknown) => {
          const i = jobs.findIndex((j) => j.id === h);
          if (i >= 0) jobs.splice(i, 1);
        },
      },
      advance(ms: number) {
        now += ms;
        for (const j of jobs.filter((x) => x.at <= now)) {
          jobs.splice(jobs.indexOf(j), 1);
          j.fn();
        }
      },
    };
  }

  it("sends a removal only once its Undo window has passed, even with no dialer left to hear it", () => {
    const clock = fakeClock();
    const sent: string[] = [];
    const q = createRemovalQueue<string>((name) => sent.push(name), clock.timers);
    q.schedule("own:neck", "Neck Pain", 3150);
    // The dialer unmounts here (the journal closes). Nothing is sent early.
    clock.advance(3000);
    expect(sent).toEqual([]);
    expect(q.has("own:neck")).toBe(true);
    clock.advance(200);
    expect(sent).toEqual(["Neck Pain"]);
    expect(q.has("own:neck")).toBe(false);
  });

  it("Undo still works after the dialer has gone, and nothing is sent", () => {
    const clock = fakeClock();
    const sent: string[] = [];
    const q = createRemovalQueue<string>((name) => sent.push(name), clock.timers);
    q.schedule("own:neck", "Neck Pain", 3150);
    expect(q.cancel("own:neck")).toBe(true);
    clock.advance(10_000);
    expect(sent).toEqual([]);
    expect(q.cancel("own:neck")).toBe(false);
  });

  it("tells a dialer that mounts meanwhile what is still held, and when it changes", () => {
    const clock = fakeClock();
    const q = createRemovalQueue<string>(() => {}, clock.timers);
    let heard = 0;
    const off = q.subscribe(() => heard++);
    q.schedule("own:a", "A", 100);
    q.schedule("own:b", "B", 100);
    expect(q.ids()).toEqual(["own:a", "own:b"]);
    q.cancel("own:a");
    clock.advance(100);
    expect(q.ids()).toEqual([]);
    expect(heard).toBe(4);
    off();
    q.schedule("own:c", "C", 100);
    expect(heard).toBe(4);
  });

  it("a second removal of the same marker restarts its window instead of sending twice", () => {
    const clock = fakeClock();
    const sent: string[] = [];
    const q = createRemovalQueue<string>((name) => sent.push(name), clock.timers);
    q.schedule("own:a", "A", 100);
    clock.advance(80);
    q.schedule("own:a", "A", 100);
    clock.advance(80);
    expect(sent).toEqual([]);
    clock.advance(40);
    expect(sent).toEqual(["A"]);
  });
});
