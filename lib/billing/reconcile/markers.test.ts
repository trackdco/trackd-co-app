import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COURTESY_KEY } from "@/lib/billing/saveOffer";

import { CLAIMED_KEY, GRACE_KEY, SHOWN_KEY } from "./fetch";

/**
 * THE MARKER KEYS ARE PINNED TO THEIR WRITERS.
 *
 * ## Why this file exists
 *
 * §3.1's warning: assertions 6 and 7 are the two that protect Invariant 1, and
 * **"if either marker is ever removed, its assertion goes blind rather than
 * failing loudly, which is the worst way for a check to die."**
 *
 * The same is true of a marker that is merely RENAMED. Three of the four keys
 * this script reads are written as bare string literals by modules that export no
 * constant for them:
 *
 *   `trackd_grace_until`            written inline at `billing-actions.ts:865`
 *   `trackd_save_offer_shown_at`    module-private in `saveOffer.ts:72`
 *   `trackd_save_offer_claimed_at`  module-private in `saveOffer.ts:74`
 *   `trackd_courtesy_until`         EXPORTED as `COURTESY_KEY` — imported directly
 *
 * A rename in any writer would leave `fetch.ts` reading a key nobody writes.
 * Nothing would error. Every money rule that depends on that marker would simply
 * find nothing and report clean, forever.
 *
 * ⚠️ `billing-actions.ts` IS A `"use server"` MODULE, so the obvious fix — export
 * the constant and import it — is not available: every export of such a module is
 * a publicly dispatchable HTTP endpoint, and both `01` and `02a` carry a Check
 * When Done item that its export list is unchanged. So the pin is a test that
 * reads the writer's source instead. Cruder, and it fails just as loudly.
 */

const ROOT = join(__dirname, "..", "..", "..");

function source(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

describe("the free-period markers are pinned to the code that writes them", () => {
  it("`trackd_courtesy_until` is imported, so it cannot drift at all", () => {
    expect(COURTESY_KEY).toBe("trackd_courtesy_until");
  });

  /**
   * The grace marker carries the PROMISED end rather than the `trial_end`
   * actually sent — the two differ when `freeTime.ts`'s clamp fires, and the
   * question reconciliation asks is about the promise (`freeTime.ts:80-84`).
   */
  it("`trackd_grace_until` is still written by the checkout path", () => {
    const writer = source("app/onboarding/billing-actions.ts");
    expect(GRACE_KEY).toBe("trackd_grace_until");
    expect(writer).toContain(`${GRACE_KEY}: freeTime.graceEndsAt`);
  });

  it("the two save-offer markers are still written on the CUSTOMER", () => {
    const writer = source("lib/billing/saveOffer.ts");
    expect(SHOWN_KEY).toBe("trackd_save_offer_shown_at");
    expect(CLAIMED_KEY).toBe("trackd_save_offer_claimed_at");
    expect(writer).toContain(`const SHOWN_KEY = "${SHOWN_KEY}"`);
    expect(writer).toContain(`const CLAIMED_KEY = "${CLAIMED_KEY}"`);
  });

  /**
   * ⚠️ THE OBJECT EACH MARKER LIVES ON IS PART OF THE CONTRACT.
   *
   * Reading `claimed_at` off the subscription returns null silently rather than
   * erroring, which would make D75's assertion pass vacuously on every account
   * forever. The first draft of `fetch.ts` did exactly that. So the split is
   * pinned too: the claim goes on the customer, the courtesy end on the
   * subscription.
   */
  it("the claim instant is on the customer and the courtesy end on the subscription", () => {
    const writer = source("lib/billing/saveOffer.ts");
    expect(writer).toMatch(/customers\.update\([\s\S]{0,200}\[CLAIMED_KEY\]/);
    expect(writer).toMatch(/subscriptions\.update\([\s\S]{0,400}\[COURTESY_KEY\]/);
  });
});
