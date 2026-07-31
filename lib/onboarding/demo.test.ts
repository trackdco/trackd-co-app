import { describe, expect, it } from "vitest";

import {
  DEMO_COMPOUND,
  DEMO_SITES,
  DEMO_START,
  demoFill,
  demoProjectedEmpty,
  formatDemoDate,
  isDemoEmpty,
  logDemoDose,
  pushRecentSite,
} from "./demo";

/**
 * The reflow screen is the highest-leverage surface in the flow (Spec 3-01
 * §4). These pin the maths behind it: a figure that goes negative, drifts on
 * floats, or divides by zero would land on exactly the screen that has to feel
 * good.
 */

describe("logDemoDose", () => {
  it("drops remaining by one dose and decrements doses left", () => {
    const next = logDemoDose(DEMO_START);
    expect(next.remainingMl).toBe(9.5);
    expect(next.dosesLeft).toBe(19);
    expect(next.logged).toBe(1);
  });

  it("does not accumulate float dust across a whole vial", () => {
    let stock = DEMO_START;
    for (let i = 0; i < 20; i += 1) stock = logDemoDose(stock);
    expect(stock.remainingMl).toBe(0);
    expect(stock.dosesLeft).toBe(0);
  });

  it("clamps at zero however hard it is tapped", () => {
    let stock = DEMO_START;
    for (let i = 0; i < 60; i += 1) stock = logDemoDose(stock);
    expect(stock.remainingMl).toBe(0);
    expect(stock.dosesLeft).toBe(0);
    expect(stock.remainingMl).toBeGreaterThanOrEqual(0);
  });

  it("reports empty only once the vial is actually drained", () => {
    expect(isDemoEmpty(DEMO_START)).toBe(false);
    let stock = DEMO_START;
    for (let i = 0; i < 19; i += 1) stock = logDemoDose(stock);
    expect(isDemoEmpty(stock)).toBe(false);
    expect(isDemoEmpty(logDemoDose(stock))).toBe(true);
  });
});

describe("demoFill", () => {
  it("runs from full to empty and never leaves 0…1", () => {
    expect(demoFill(DEMO_START)).toBe(1);
    let stock = DEMO_START;
    for (let i = 0; i < 40; i += 1) {
      stock = logDemoDose(stock);
      const fill = demoFill(stock);
      expect(fill).toBeGreaterThanOrEqual(0);
      expect(fill).toBeLessThanOrEqual(1);
    }
    expect(demoFill(stock)).toBe(0);
  });
});

describe("demoProjectedEmpty", () => {
  it("counts forward by the sample schedule", () => {
    // 20 doses left, every third day → 60 days past 1 Jan 2026.
    expect(demoProjectedEmpty(DEMO_START, "2026-01-01")).toBe("2026-03-02");
  });

  it("moves closer with every logged dose", () => {
    const first = demoProjectedEmpty(DEMO_START, "2026-01-01");
    const second = demoProjectedEmpty(logDemoDose(DEMO_START), "2026-01-01");
    expect(first).not.toBe(second);
    expect(String(second) < String(first)).toBe(true);
  });

  it("has no date once the vial is empty", () => {
    let stock = DEMO_START;
    for (let i = 0; i < 20; i += 1) stock = logDemoDose(stock);
    expect(demoProjectedEmpty(stock, "2026-01-01")).toBeNull();
    expect(formatDemoDate(null)).toBe("Empty");
  });

  it("crosses a year boundary and a leap day without shifting", () => {
    expect(demoProjectedEmpty({ ...DEMO_START, dosesLeft: 1 }, "2023-12-31")).toBe(
      "2024-01-03",
    );
    expect(demoProjectedEmpty({ ...DEMO_START, dosesLeft: 1 }, "2024-02-27")).toBe(
      "2024-03-01",
    );
  });

  it("returns null rather than a wrong date for a malformed today", () => {
    expect(demoProjectedEmpty(DEMO_START, "not-a-date")).toBeNull();
  });
});

describe("formatDemoDate", () => {
  it("formats day then month, Australian order", () => {
    expect(formatDemoDate("2026-08-12")).toBe("12 Aug");
    expect(formatDemoDate("2026-01-01")).toBe("1 Jan");
  });
});

describe("the sample vial", () => {
  it("starts full with a whole number of doses", () => {
    expect(DEMO_START.remainingMl).toBe(DEMO_COMPOUND.vialMl);
    expect(DEMO_START.dosesLeft).toBe(20);
    expect(Number.isInteger(DEMO_START.dosesLeft)).toBe(true);
  });
});

describe("pushRecentSite", () => {
  it("puts the newest first and keeps three", () => {
    expect(pushRecentSite(["a", "b", "c"], "d")).toEqual(["d", "a", "b"]);
  });

  it("works from empty", () => {
    expect(pushRecentSite([], "L delt")).toEqual(["L delt"]);
  });
});

describe("DEMO_SITES", () => {
  it("has unique ids", () => {
    const ids = DEMO_SITES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps every marker inside the silhouette box", () => {
    for (const site of DEMO_SITES) {
      expect(site.x).toBeGreaterThan(0);
      expect(site.x).toBeLessThan(100);
      expect(site.y).toBeGreaterThan(0);
      expect(site.y).toBeLessThan(100);
    }
  });

  it("puts glutes on the back view, per D-1", () => {
    for (const site of DEMO_SITES.filter((s) => s.label.includes("glute"))) {
      if (site.label.includes("ventroglute")) continue;
      expect(site.view).toBe("back");
    }
  });
});
