import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fit, FIT_FLOOR_PX, FIT_SHORT_PX, FIT_TALL_PX } from "./fit";

/** Resolve a `fit()` string the way the browser will, for a given shortfall. */
function resolve(length: string, shortPx: number): number {
  const plain = /^(-?[\d.]+)px$/.exec(length);
  if (plain) return Number(plain[1]);
  const floored = /^max\((-?[\d.]+)px, (.+)\)$/.exec(length);
  if (floored) return Math.max(Number(floored[1]), resolve(floored[2], shortPx));
  const m = /^calc\((-?[\d.]+)px - var\(--flow-short, 0px\) \* (-?[\d.]+)\)$/.exec(length);
  if (!m) throw new Error(`unexpected fit() output: ${length}`);
  return Number(m[1]) - shortPx * Number(m[2]);
}

describe("fit", () => {
  it("is the tall figure on a box the flow was tuned on", () => {
    expect(resolve(fit(330, 220), 0)).toBe(330);
    expect(resolve(fit(24, 12), 0)).toBe(24);
  });

  it("is the short figure on an SE, to well under a hundredth of a pixel", () => {
    const full = FIT_TALL_PX - FIT_SHORT_PX;
    expect(resolve(fit(330, 220), full)).toBeCloseTo(220, 2);
    expect(resolve(fit(24, 12), full)).toBeCloseTo(12, 2);
    expect(resolve(fit(40, 16), full)).toBeCloseTo(16, 2);
  });

  it("moves in a straight line between", () => {
    const half = (FIT_TALL_PX - FIT_SHORT_PX) / 2;
    expect(resolve(fit(330, 220), half)).toBeCloseTo(275, 2);
  });

  it("holds at a floor on a zoomed SE, and ignores it everywhere above", () => {
    const floor = FIT_TALL_PX - FIT_FLOOR_PX;
    const full = FIT_TALL_PX - FIT_SHORT_PX;
    // A chip's padding: 14px tall, 12px on an SE, and never below the 12px
    // that keeps the row at 44px.
    expect(resolve(fit(14, 12, 12), 0)).toBe(14);
    expect(resolve(fit(14, 12, 12), full)).toBeCloseTo(12, 2);
    expect(resolve(fit(14, 12, 12), floor)).toBe(12);
    expect(resolve(fit(14, 12), floor)).toBeLessThan(12);
  });

  it("writes a plain length when nothing changes", () => {
    expect(fit(16, 16)).toBe("16px");
  });

  it("carries on at the same rate to a zoomed SE", () => {
    const floor = FIT_TALL_PX - FIT_FLOOR_PX;
    // 330 → 220 over 152px is 0.72368/px, so another 94px takes 68 more off.
    expect(resolve(fit(330, 220), floor)).toBeCloseTo(151.97, 1);
  });

  /**
   * The constants live in TWO places: here, and in the `--flow-short` clamp on
   * `.flow-viewport`. If they drift, every `fit()` lands at the wrong size on
   * every phone between the two and nothing else would say so.
   */
  it("agrees with --flow-short in globals.css", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const clamp = /--flow-short:\s*clamp\(0px,\s*(\d+)px - 100svh,\s*(\d+)px\)/.exec(css);
    expect(clamp).not.toBeNull();
    expect(Number(clamp![1])).toBe(FIT_TALL_PX);
    expect(Number(clamp![2])).toBe(FIT_TALL_PX - FIT_FLOOR_PX);
  });
});
