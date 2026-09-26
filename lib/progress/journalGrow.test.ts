import { describe, expect, it } from "vitest";

import { growAnchor, growScroll, translateY } from "./journalGrow";

describe("W52: the journal opens upwards", () => {
  const band = { top: 12, bottom: 700 };

  it("holds the bottom where it was, or brings it up to what can be seen", () => {
    expect(growAnchor(650, band)).toBe(650);
    expect(growAnchor(760, band)).toBe(700);
  });

  it("scrolls down as far as the card grew, so it grows up from where it sits", () => {
    expect(growScroll({ bottom: 690, anchor: 650, keepTop: 300, bandTop: 12, scrollY: 900 })).toBe(40);
  });

  it("never pushes what was just opened out of the top", () => {
    // The card's top is 30px under the band's top: only 30 of the 200 go.
    expect(growScroll({ bottom: 850, anchor: 650, keepTop: 42, bandTop: 12, scrollY: 900 })).toBe(30);
    // Already above it: the page stays.
    expect(growScroll({ bottom: 850, anchor: 650, keepTop: 0, bandTop: 12, scrollY: 900 })).toBe(0);
  });

  it("folding back, the page comes back up the same way, never above the top", () => {
    expect(growScroll({ bottom: 600, anchor: 650, keepTop: 300, bandTop: 12, scrollY: 900 })).toBe(-50);
    expect(growScroll({ bottom: 600, anchor: 650, keepTop: 300, bandTop: 12, scrollY: 20 })).toBe(-20);
  });

  it("at rest, nothing moves", () => {
    expect(growScroll({ bottom: 650, anchor: 650, keepTop: 300, bandTop: 12, scrollY: 900 })).toBe(0);
  });

  it("reads the scroll settle's nudge from a card's inline translate", () => {
    expect(translateY("0 12.5px")).toBe(12.5);
    expect(translateY("0px -3px")).toBe(-3);
    expect(translateY("")).toBe(0);
    expect(translateY("none")).toBe(0);
    expect(translateY(undefined)).toBe(0);
  });
});
