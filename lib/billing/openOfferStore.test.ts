import { describe, expect, it } from "vitest";

import {
  OPEN_OFFER_MS,
  formatRemaining,
  isStillOpen,
  msRemaining,
  type OpenOffer,
} from "./openOfferStore";

/**
 * The pure half of "the offer survives being dismissed".
 *
 * `sessionStorage` itself is a browser API and is not worth mocking; what is
 * worth pinning is the arithmetic that decides whether a way back in is drawn,
 * and the one that stops a shared browser leaking somebody's offer.
 */

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const shown = "2026-08-19T15:00:00.000Z";
const at = (iso: string) => Date.parse(iso);

function offer(over: Partial<OpenOffer> = {}): OpenOffer {
  return {
    userId: A,
    shownAt: shown,
    kind: "trial",
    noun: "week",
    chargeOn: "2026-08-26T15:00:00.000Z",
    ...over,
  };
}

describe("msRemaining", () => {
  it("counts down from when it was first shown, not from now", () => {
    expect(msRemaining(shown, at("2026-08-19T15:00:00Z"))).toBe(OPEN_OFFER_MS);
    expect(msRemaining(shown, at("2026-08-19T15:04:00Z"))).toBe(6 * 60 * 1000);
  });

  it("bottoms out at zero rather than going negative", () => {
    expect(msRemaining(shown, at("2026-08-19T15:10:00Z"))).toBe(0);
    expect(msRemaining(shown, at("2026-08-19T18:00:00Z"))).toBe(0);
  });

  it("treats an unreadable stamp as no time left", () => {
    // The opposite of the server's tolerance, deliberately: this one only
    // decides whether to DRAW something, so the safe direction is to draw
    // nothing rather than a countdown from an unknown start.
    expect(msRemaining("not a date")).toBe(0);
  });
});

describe("formatRemaining", () => {
  it("pads both halves so the width never jitters", () => {
    expect(formatRemaining(10 * 60 * 1000)).toBe("10:00");
    expect(formatRemaining(9 * 60 * 1000 + 7000)).toBe("09:07");
    expect(formatRemaining(61 * 1000)).toBe("01:01");
  });

  it("shows 00:00 at and past the end", () => {
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5000)).toBe("00:00");
  });

  it("rounds up, so the last second is visible rather than skipped", () => {
    expect(formatRemaining(1)).toBe("00:01");
    expect(formatRemaining(999)).toBe("00:01");
  });
});

describe("isStillOpen", () => {
  it("is open inside the window for the right account", () => {
    expect(isStillOpen(offer(), A, at("2026-08-19T15:05:00Z"))).toBe(true);
  });

  it("is closed once the time is up", () => {
    expect(isStillOpen(offer(), A, at("2026-08-19T15:10:01Z"))).toBe(false);
  });

  it("IGNORES another account's offer on a shared browser", () => {
    // The trial banner's dismissal cookie had exactly this bug and a cold review
    // caught it: one person's state hiding or granting something for the next.
    expect(isStillOpen(offer({ userId: B }), A, at("2026-08-19T15:05:00Z"))).toBe(false);
  });

  it("is closed when there is nothing stored", () => {
    expect(isStillOpen(null, A)).toBe(false);
  });

  it("matches the server's window exactly", () => {
    // If these drift, the dialog counts down to a claim the server refuses, or
    // hides one it would still accept.
    expect(OPEN_OFFER_MS).toBe(10 * 60 * 1000);
  });
});
