import { describe, expect, it } from "vitest";

import { isStillOpen, msRemaining, readOffer, type OpenOffer } from "./openOfferStore";
import { OFFER_WINDOW_MINUTES, offerStillOpen } from "./saveOffer";

/**
 * ⚠️ THE OFFER SURVIVES AN INTERRUPTED SESSION (Group E).
 *
 * The offer burns on being SHOWN, not on being taken. So the dialog renders, the
 * marker is written, and the person closes the tab or their phone dies — and they
 * come back to a bare Resume control with the free week already spent, **never
 * having seen it**. Closing a tab at that dialog is ordinary behaviour.
 *
 * `openOfferStore` already remembered a DISMISSED offer and could not help: it
 * uses `sessionStorage`, which dies with the tab. The restore is server-side, off
 * Stripe's own `trackd_save_offer_shown_at`.
 *
 * ## What these pin, and what only the driver can
 *
 * The window arithmetic and the two clocks agreeing are here. That the SERVER
 * actually hands the offer back after a tab is destroyed, and that it is gone at
 * minute eleven with the claim refused, is the driver's half — and it is the half
 * that matters, so it is driven on a real Stripe customer rather than asserted
 * here.
 */

const SHOWN = "2026-08-20T12:00:00.000Z";
const USER = "11111111-1111-1111-1111-111111111111";
const at = (iso: string) => Date.parse(iso);

const restored: OpenOffer = {
  userId: USER,
  shownAt: SHOWN,
  kind: "paid",
  noun: "month",
  chargeOn: "17 Sept 2026",
  startsOn: "17 Aug 2026",
};

describe("the restored offer is the SAME offer, not a new one", () => {
  /**
   * ⚠️ THE PROPERTY THAT STOPS THIS BEING AN EXPLOIT. `shownAt` is the ORIGINAL
   * server instant, read back from the marker rather than rewritten, so returning
   * at minute two leaves eight minutes — not ten. Reloading cannot buy a longer
   * window, which is what would turn a real countdown into invented urgency.
   */
  it("returning at minute two leaves eight minutes, not ten", () => {
    const twoMinutesLater = at("2026-08-20T12:02:00.000Z");
    expect(msRemaining(restored.shownAt, twoMinutesLater)).toBe(8 * 60 * 1000);
    expect(isStillOpen(restored, USER, twoMinutesLater)).toBe(true);
  });

  it("reloading five times does not move the clock", () => {
    const t = at("2026-08-20T12:03:00.000Z");
    const readings = [1, 2, 3, 4, 5].map(() => msRemaining(restored.shownAt, t));
    expect(new Set(readings).size).toBe(1);
    expect(readings[0]).toBe(7 * 60 * 1000);
  });

  /** Minute eleven: gone, exactly as it is today. */
  it("returning at minute eleven gets nothing", () => {
    const elevenMinutesLater = at("2026-08-20T12:11:00.000Z");
    expect(msRemaining(restored.shownAt, elevenMinutesLater)).toBe(0);
    expect(isStillOpen(restored, USER, elevenMinutesLater)).toBe(false);
  });

  /**
   * ⚠️ AND THE SERVER STILL REFUSES A CLAIM AT MINUTE ELEVEN. The screen deciding
   * not to draw a button is not what enforces the window — a client can say
   * whatever it likes. `grantExtraTime` calls `offerStillOpen`, and the restore
   * calls the SAME function, so a dialog that is restored is one the claim will
   * honour and a dialog that is withheld is one it would refuse.
   */
  it("the restore and the claim ask the same question of the same clock", () => {
    const inside = at("2026-08-20T12:02:00.000Z");
    const outside = at("2026-08-20T12:11:00.000Z");
    expect(offerStillOpen(SHOWN, inside)).toBe(true);
    expect(offerStillOpen(SHOWN, outside)).toBe(false);
  });

  /**
   * ⚠️ THE INVARIANT IS "THE SCREEN IS NEVER MORE PERMISSIVE THAN THE SERVER",
   * NOT "the two are identical" — and the difference is real, one millisecond
   * wide, and PRE-EXISTING.
   *
   * `offerStillOpen` is inclusive at the boundary (`now - at <= WINDOW`);
   * `msRemaining` is exclusive (`remaining > 0`). At exactly ten minutes the
   * server would still honour a claim and the screen has already stopped drawing
   * one. Measured here rather than assumed, because the first version of this test
   * asserted equality and went red at minute 10.
   *
   * It fails in the safe direction and is deliberately NOT changed: every dialog
   * that is drawn is one the server will honour, which is the property the
   * countdown's honesty rests on. The reverse would be a button that returns
   * "expired" to somebody watching a clock that says nine seconds left.
   */
  it("⚠️ every drawn offer is claimable, at every minute across the boundary", () => {
    for (let m = 0; m <= 15; m += 1) {
      const t = at(SHOWN) + m * 60_000;
      if (isStillOpen(restored, USER, t)) {
        expect(offerStillOpen(SHOWN, t), `minute ${m} is drawn but not claimable`).toBe(
          true,
        );
      }
    }
    // …and the one instant where they differ, named so it cannot drift wider.
    const exactlyTen = at(SHOWN) + OFFER_WINDOW_MINUTES * 60_000;
    expect(offerStillOpen(SHOWN, exactlyTen)).toBe(true);
    expect(isStillOpen(restored, USER, exactlyTen)).toBe(false);
    expect(isStillOpen(restored, USER, exactlyTen - 1)).toBe(true);
  });

  it("the window is the one constant both sides read", () => {
    expect(OFFER_WINDOW_MINUTES).toBe(10);
  });
});

describe("a restored offer cannot cross accounts", () => {
  it("another user's offer is ignored", () => {
    const other = "22222222-2222-2222-2222-222222222222";
    expect(isStillOpen(restored, other, at("2026-08-20T12:02:00.000Z"))).toBe(false);
  });
});

describe("the stored shape requires the F2 window", () => {
  /**
   * `startsOn` is required rather than optional. An entry written before the field
   * existed is at most ten minutes old, so treating it as absent costs a reopen
   * row nobody can still be looking at — and the alternative is a gift block
   * reading "  to 17 Sept 2026".
   */
  it("an entry with no startsOn is treated as absent, not as a partial offer", () => {
    const store = new Map<string, string>();
    (globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    } as Storage;

    store.set(
      "trackd-open-save-offer",
      JSON.stringify({ ...restored, startsOn: undefined }),
    );
    expect(readOffer()).toBeNull();

    // …and the control: the complete entry reads back.
    store.set("trackd-open-save-offer", JSON.stringify(restored));
    expect(readOffer()).toEqual(restored);
  });
});

describe("the wiring — the restore is bounded, tolerant, and grants nothing", () => {
  const restore = stripComments(readSync("lib/billing/openOffer.ts"));
  const facts = stripComments(readSync("lib/billing/screenFacts.ts"));
  const dialog = stripComments(readSync("components/billing/CancelSubscription.tsx"));

  it("⚠️ CONTROL: the comment-stripped sources are non-empty and hold their subject", () => {
    expect(restore.length).toBeGreaterThan(400);
    expect(restore).toContain("openOfferFor");
    expect(facts).toContain("loadBillingFacts");
    expect(dialog).toContain("serverOffer");
  });

  it("it refuses a claimed offer, an unshown one, and one out of time", () => {
    expect(restore).toMatch(/OFFER_CLAIMED_KEY\]\) return null/);
    expect(restore).toMatch(/if \(!shownAt\) return null/);
    expect(restore).toMatch(/if \(!offerStillOpen\(shownAt\)\) return null/);
  });

  /**
   * The two holes a cold review found round the flags alone: cancel, un-cancel,
   * then claim; and cancel, let it die, subscribe again and claim on the new one.
   */
  it("it refuses somebody who is no longer cancelled, and D70's unpaid cohort", () => {
    expect(restore).toMatch(/if \(!primary\.cancel_at_period_end\) return null/);
    expect(restore).toMatch(/if \(periodIsUnpaid\(primary\)\) return null/);
  });

  /** ⚠️ IT NEVER REWRITES THE MARKER. That is what would restart the countdown. */
  it("it never writes to Stripe at all", () => {
    expect(restore).not.toMatch(/customers\.update/);
    expect(restore).not.toMatch(/subscriptions\.update/);
    expect(restore).not.toMatch(/markOfferShown/);
  });

  /**
   * ⚠️ BOUNDED TO THE ONE STATE AN OFFER CAN EXIST IN, so `/billing` does not
   * make a Stripe call for every visitor.
   */
  it("screenFacts only asks when the account is cancelled and has a Stripe customer", () => {
    expect(facts).toMatch(
      /action\.kind === "resume" && customer\?\.stripe_customer_id[\s\S]{0,120}openOfferFor/,
    );
  });

  /** The tab's own memory is fresher and wins; the server's is the fallback. */
  it("sessionStorage takes precedence over the server copy", () => {
    const seed = dialog.slice(dialog.indexOf("const [carried, setCarried]"));
    expect(seed.indexOf("if (stored) return stored;")).toBeLessThan(
      seed.indexOf("if (!serverOffer) return null;"),
    );
  });
});

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readSync(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}
