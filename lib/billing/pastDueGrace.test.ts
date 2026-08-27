import { describe, expect, it } from "vitest";

import { pastDueGraceEnd } from "./sync";

/**
 * ⚠️ THE THREE-DAY GRACE, WHICH MEASURED ZERO (Group A).
 *
 * The lifetime clock run put the two numbers beside each other: paid through
 * `2026-08-17T01:39:48`, access to `2026-08-17T01:39:48`. **0.00 days.**
 *
 * `markPastDue` computed `max(min(current, unpaid-start + 3d), floor)` and
 * returned early when that was not SHORTER than what was stored — and on an
 * ordinary renewal failure the entitlement already ends exactly at the unpaid
 * period's start, so the minimum IS the stored value, nothing was written, and
 * the handler answered "handled". The function could only ever claw a
 * LONGER-dated entitlement back. **It could never grant the grace.**
 *
 * ## What these pin, and why here rather than only in a driver
 *
 * The arithmetic is the whole of the fix and it is the half a clock run measures
 * slowest: one real Stripe renewal failure per direction, minutes each. Extracted
 * as a pure function, every bound below is a line that runs in a millisecond and
 * fails loudly when somebody re-introduces the `Math.min` that produced the zero.
 *
 * ⚠️ THEY DO NOT PROVE THE HANDLER USES IT. `pastDueGrace.wiring.test.ts` holds
 * that half, and the DRIVER holds the half neither of them can: that a real
 * `invoice.payment_failed` from real Stripe lands the date this function returns
 * in the real `entitlements` row.
 */

const DAY = 24 * 60 * 60 * 1000;
const iso = (s: string) => Date.parse(s);

/** A weekly renewal that failed. The line's period is the UNPAID week. */
const PAID_THROUGH = iso("2026-08-17T01:39:48Z");
const UNPAID_PERIOD_END = iso("2026-08-24T01:39:48Z");
const GRACE_ENDS = PAID_THROUGH + 3 * DAY;

const base = {
  graceEnds: GRACE_ENDS,
  renewalWouldGive: UNPAID_PERIOD_END,
  currentMs: PAID_THROUGH,
  floor: null as number | null,
};

describe("the property: access ends exactly three days after the paid-through date", () => {
  /**
   * ⚠️ THE MEASURED DEFECT, AS A TEST. This is the case that produced 0.00 days:
   * the stored date and the paid-through date are the SAME instant, which is what
   * a healthy renewal failure looks like.
   */
  it("LENGTHENS when the entitlement ends exactly at the unpaid period's start", () => {
    const target = pastDueGraceEnd(base);
    expect(target).toBe(GRACE_ENDS);
    expect((target - base.currentMs) / DAY).toBe(3);
  });

  /**
   * ⚠️ THE CONTROL, AND IT IS THE BEHAVIOUR THAT ALREADY EXISTED. A renewal
   * failure arriving after `syncSubscription` has rolled the period forward finds
   * a MONTH of unpaid access stored, and must still claw it back to the same
   * three days. This is the direction that produced "14 Aug became 14 Sept on a
   * card that declined", and trading it away for the grant is the exact failure
   * this pair of tests exists to catch.
   */
  it("still SHORTENS a rolled-forward unpaid period to the same instant", () => {
    const rolledForward = iso("2026-09-17T01:39:48Z");
    const target = pastDueGraceEnd({
      ...base,
      currentMs: rolledForward,
      renewalWouldGive: rolledForward,
    });
    expect(target).toBe(GRACE_ENDS);
    expect(target).toBeLessThan(rolledForward);
  });

  /**
   * ⚠️ IDEMPOTENCE IS A PROPERTY OF THE ARITHMETIC, not of a marker.
   *
   * The target is computed from the invoice alone — never from `now`, never as a
   * delta against what is stored — so the second delivery of the same event
   * computes the same instant and the handler's `target === currentMs` check
   * turns it into a no-op. Driven here by feeding the FIRST answer back in as the
   * stored value, which is exactly what a redelivery sees.
   */
  it("is idempotent: feeding its own answer back in returns that same answer", () => {
    const first = pastDueGraceEnd(base);
    const second = pastDueGraceEnd({ ...base, currentMs: first });
    const third = pastDueGraceEnd({ ...base, currentMs: second });
    expect(second).toBe(first);
    expect(third).toBe(first);
  });
});

describe("bound 3 — never past what a successful renewal would have given", () => {
  it("caps at the failing period's END when the period is shorter than the grace", () => {
    // A one-day period. Paying would have bought one day; declining must not buy three.
    const oneDayLater = PAID_THROUGH + 1 * DAY;
    expect(
      pastDueGraceEnd({ ...base, renewalWouldGive: oneDayLater }),
    ).toBe(oneDayLater);
  });

  /**
   * ⚠️ THE CONTROL FOR THE CAP. On every interval this product actually sells —
   * weekly, monthly, yearly — the period is longer than three days, so the cap
   * must NOT bind. A cap that always fired would silently turn the grace into
   * "the whole unpaid period", which is the free-month defect.
   */
  it("does NOT bind on a weekly period, which is every real plan here", () => {
    expect(pastDueGraceEnd(base)).toBe(GRACE_ENDS);
    expect(GRACE_ENDS).toBeLessThan(UNPAID_PERIOD_END);
  });

  it("an invoice with no line period end applies no cap rather than guessing one", () => {
    expect(pastDueGraceEnd({ ...base, renewalWouldGive: null })).toBe(GRACE_ENDS);
  });
});

describe("bound 4 — the other-subscription floor protects, and never grants", () => {
  /**
   * The floor's own reason for existing: a paid yearly running to 2027 beside a
   * second subscription whose card declined. Clawing the shared row back to a
   * three-day grace took 362 days off somebody who had paid for them.
   */
  it("stops a clawback going below what another live subscription entitles them to", () => {
    const yearly = iso("2027-08-15T00:00:00Z");
    expect(
      pastDueGraceEnd({
        ...base,
        currentMs: yearly,
        renewalWouldGive: yearly,
        floor: yearly,
      }),
    ).toBe(yearly);
  });

  it("raises a clawback only as far as the floor, not all the way back", () => {
    const stored = iso("2026-12-01T00:00:00Z");
    const otherSub = iso("2026-10-01T00:00:00Z");
    expect(
      pastDueGraceEnd({ ...base, currentMs: stored, renewalWouldGive: stored, floor: otherSub }),
    ).toBe(otherSub);
  });

  /**
   * ⚠️ THE FLOOR IS NOT A SECOND GRANT, AND THIS IS THE LINE THAT SAYS SO.
   *
   * A floor ABOVE what is stored means another subscription reaches further than
   * this row records. That may be worth knowing, and it is not this handler's
   * business: a failed payment quietly extending an entitlement off the back of a
   * subscription it was told nothing about is a grant nobody asked for. The
   * answer stays the three-day grace.
   */
  it("never pushes the answer above what is already stored", () => {
    const far = iso("2030-01-01T00:00:00Z");
    expect(pastDueGraceEnd({ ...base, floor: far })).toBe(GRACE_ENDS);
    expect(pastDueGraceEnd({ ...base, floor: far })).toBeLessThan(far);
  });

  it("no floor at all leaves the grace exactly where it fell", () => {
    expect(pastDueGraceEnd({ ...base, floor: null })).toBe(GRACE_ENDS);
  });
});

/**
 * ⚠️ THE CONSTANT AND THE PROPERTY, PINNED TO EACH OTHER.
 *
 * The property is stated in days and the code multiplies a constant. If somebody
 * moves `PAST_DUE_GRACE_DAYS` the sentence "three days" stops being true — on
 * this screen, in `DeclinedCard`'s reasoning, and in D96, which RULED the grace
 * stays at three days. This is what sends them back to that ruling.
 */
describe("three days is the ruled number (D96)", () => {
  it("the grace this function is handed is exactly PAST_DUE_GRACE_DAYS wide", () => {
    // Read from the module the handler uses, not typed here.
    const source = readSync("lib/billing/sync.ts");
    const match = /const PAST_DUE_GRACE_DAYS = (\d+);/.exec(source);
    expect(match?.[1], "PAST_DUE_GRACE_DAYS is no longer a plain literal").toBeDefined();
    expect(
      Number(match![1]),
      "PAST_DUE_GRACE_DAYS moved. D96 ruled it stays at three days, and the copy " +
        "in DeclinedCard and the dashboard banner both name a date derived from it.",
    ).toBe(3);
  });
});

/**
 * ⚠️ THE WIRING. THE ARITHMETIC BEING RIGHT PROVES NOTHING IF NOBODY CALLS IT.
 *
 * Source assertions, for the reason `stripeEntitlementRead.test.ts` gives about
 * the same class of rule: `markPastDue` reaches `serviceClient()` and Stripe,
 * which this pure `lib/**` suite cannot exercise, and mocking them wholesale would
 * test the mock. What must not silently come back is the EARLY RETURN that made
 * the grace zero.
 *
 * These sit BESIDE the value tests above and the driver below; they replace
 * neither. `signed/README.md`'s rule, applied to behaviour rather than to copy.
 */
describe("the handler is wired to it, and the zero-grace shape cannot come back", () => {
  const source = readSync("lib/billing/sync.ts");

  it("markPastDue computes its target through pastDueGraceEnd", () => {
    expect(source).toMatch(/const target = pastDueGraceEnd\(\{/);
  });

  /**
   * ⚠️ THE EXACT LINE THAT PRODUCED 0.00 DAYS. `shortened >= Date.parse(current)`
   * returned "handled" on every ordinary renewal failure. `endSubscription` still
   * has its own copy of that guard and SHOULD — it only ever shortens — so this
   * counts rather than merely searching, and the count is ONE.
   */
  it("only ONE shortening path still returns early on 'not shorter', and it is not this one", () => {
    const early = source.match(/if \(shortened >= Date\.parse\(current\)\) return "handled";/g);
    expect(
      early?.length ?? 0,
      "endSubscription keeps that guard; markPastDue must not have it back",
    ).toBe(1);
    // …and the one that remains is inside endSubscription, after its own header.
    const endSub = source.slice(source.indexOf("export async function endSubscription"));
    expect(endSub).toMatch(/if \(shortened >= Date\.parse\(current\)\) return "handled";/);
  });

  it("the grace is anchored to the invoice line's period start, never to now", () => {
    const fn = source.slice(
      source.indexOf("export async function markPastDue"),
      source.indexOf("export function pastDueGraceEnd"),
    );
    expect(fn).toMatch(/invoice\.lines\?\.data\?\.\[0\]\?\.period\?\.start/);
    // `new Date().toISOString()` survives ONLY as the documented last-resort
    // fallback for an invoice that carries no period at all.
    expect((fn.match(/new Date\(\)\.toISOString\(\)/g) ?? []).length).toBe(1);
  });

  /** The revoked bound: a grant may not reach a row somebody turned off. */
  it("refuses to LENGTHEN a revoked entitlement, and says so", () => {
    const fn = source.slice(
      source.indexOf("export async function markPastDue"),
      source.indexOf("export function pastDueGraceEnd"),
    );
    expect(fn).toMatch(/target > currentMs && read\.kind === "present" && !read\.isActive/);
  });

  /** The first-invoice guard is bound 1, and it predates this change. */
  it("still returns early on a first invoice, which is not a renewal", () => {
    const fn = source.slice(
      source.indexOf("export async function markPastDue"),
      source.indexOf("export function pastDueGraceEnd"),
    );
    expect(fn).toMatch(/if \(invoice\.billing_reason === "subscription_create"\)/);
  });
});

function readSync(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}
