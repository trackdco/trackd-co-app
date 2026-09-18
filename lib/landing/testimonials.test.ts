import { describe, expect, it } from "vitest";

import {
  PLACEHOLDER_TESTIMONIALS,
  TESTIMONIALS,
  nearestIndex,
  showTestimonials,
} from "./testimonials";

describe("placeholder testimonials", () => {
  it("⚠️ never render invented quotes on the production deployment", () => {
    expect(showTestimonials({ VERCEL_ENV: "production" }, true)).toBe(false);
  });

  it("render on previews and locally, where they are useful", () => {
    expect(showTestimonials({ VERCEL_ENV: "preview" }, true)).toBe(true);
    expect(showTestimonials({ VERCEL_ENV: "development" }, true)).toBe(true);
    expect(showTestimonials({}, true)).toBe(true);
  });

  it("render everywhere once the quotes are real", () => {
    expect(showTestimonials({ VERCEL_ENV: "production" }, false)).toBe(true);
  });

  /**
   * ⚠️ FLIPPING THIS BACK IS A DECISION, NOT A TIDY-UP. False means every card
   * in the file is a real person quoting their own opinion, and the section
   * renders on trackdco.app. Anything less than that and this goes back to
   * true in the same change that adds the card.
   */
  /**
   * ⚠️ False means every card stands on something a real person actually said.
   * It does NOT mean the names are real, which they are not: they are aliases
   * over real opinions, and that is the arrangement Adrian settled on.
   */
  it("renders on production, because every card is a real opinion", () => {
    expect(PLACEHOLDER_TESTIMONIALS).toBe(false);
    expect(showTestimonials({ VERCEL_ENV: "production" })).toBe(true);
  });

  /**
   * ⚠️ THE HOUSE STYLE STOPS AT THE QUOTATION MARKS (Adrian, 2026-09-18).
   *
   * The page bans exclamation marks and emoji, and this test used to hold the
   * reviews to that too. It no longer does: a review is a person talking, and
   * flattening one into house voice is how a real quote starts reading as a
   * written one. Jasmine's "I'd highly recommend!!! :)" stands.
   *
   * The em dash stays banned, and that is the point of what is left here. It
   * is the one mark almost nobody types on a phone, so an em dash inside a
   * quote is the tell that the house wrote it rather than the person. Same for
   * an @handle, which would collide with a real account.
   */
  it("keeps the one mark that would give away a quote the house wrote", () => {
    for (const t of TESTIMONIALS) {
      expect(t.quote).not.toMatch(/—/);
      expect(t.name).not.toMatch(/^@/);
    }
  });
});

describe("nearestIndex", () => {
  const offsets = [0, 300, 600, 900];

  it("picks the card whose edge is nearest the scroll position", () => {
    expect(nearestIndex(0, offsets)).toBe(0);
    expect(nearestIndex(140, offsets)).toBe(0);
    expect(nearestIndex(160, offsets)).toBe(1);
    expect(nearestIndex(890, offsets)).toBe(3);
  });

  it("lights the last dot at the end of the track, even short of its edge", () => {
    // A wide screen stops scrolling at 700, before the last card's edge (900)
    // lines up. By distance alone that is card 2, and the last dot never lit.
    expect(nearestIndex(700, offsets)).toBe(2);
    expect(nearestIndex(700, offsets, 700)).toBe(3);
    expect(nearestIndex(699, offsets, 700)).toBe(3);
    expect(nearestIndex(500, offsets, 700)).toBe(2);
  });

  it("is safe with no cards", () => {
    expect(nearestIndex(50, [])).toBe(0);
  });
});
