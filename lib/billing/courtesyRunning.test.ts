import { describe, expect, it } from "vitest";

import { courtesyIsRunning, isGenuineTrial, planLabelFor } from "./manage";
import { manageSummaryFor, type SummaryFacts } from "./manageSummary";

/**
 * ⚠️ THE COURTESY PROMISE IS WITHDRAWN WHEN IT ENDS (Group C).
 *
 * Found by a cold reviewer, summarised to the founder, left out of the fix batch,
 * and rediscovered by the lifetime clock run. `/billing`'s "Free until {date}" row
 * and `/billing/manage`'s courtesy sentence both rendered on the marker being
 * PRESENT, with no test that the date is still ahead. `courtesy_until` is written
 * once when the save offer is granted and never cleared, so a customer who took
 * the free week and was then charged read
 *
 *     Free until   10 Aug 2026
 *     Renews on    17 Aug 2026
 *
 * on one card, and Manage told them the same thing in a sentence.
 *
 * ## ⚠️ THE MARKER IS NOT CLEARED. THE FIX IS AT THE DISPLAY READERS ONLY.
 *
 * Reconciliation depends on it persisting — its rules ask "did this account ever
 * get a courtesy period", and clearing it would make one rule fire on every past
 * courtesy account and another stop firing. Two questions, one column.
 *
 * So these tests do two jobs: they pin the date test at the readers that want
 * "is it happening now", and they pin the ABSENCE of it at the readers that want
 * "did it happen". The second half is the control — a fix applied one function
 * too widely puts D36's prohibited word in front of a two-year customer.
 */

const HOUR = 60 * 60 * 1000;
const NOW = new Date("2026-08-20T00:00:00Z");

describe("courtesyIsRunning — the question the screens ask", () => {
  it("a date in the future is running", () => {
    expect(courtesyIsRunning(new Date(NOW.getTime() + HOUR).toISOString(), NOW)).toBe(true);
  });

  it("a date in the past is NOT running, which is the whole defect", () => {
    expect(courtesyIsRunning(new Date(NOW.getTime() - HOUR).toISOString(), NOW)).toBe(false);
  });

  it("the instant it ends it stops running — not the end of that calendar day", () => {
    expect(courtesyIsRunning(NOW.toISOString(), NOW)).toBe(false);
  });

  it("no marker at all is not running", () => {
    expect(courtesyIsRunning(null, NOW)).toBe(false);
    expect(courtesyIsRunning(undefined, NOW)).toBe(false);
    expect(courtesyIsRunning("", NOW)).toBe(false);
  });

  /**
   * An unparseable value is a date THIS APP wrote, so it is our bug — and the safe
   * direction for a PROMISE is to stop making it rather than to keep making it
   * forever. The opposite direction to `offerStillOpen`, deliberately: there the
   * cost of erring is refusing a week we have just promised on screen.
   */
  it("a value that will not parse is not running", () => {
    expect(courtesyIsRunning("not a date", NOW)).toBe(false);
  });
});

/* ── the DISPLAY readers, which want "is it happening now" ──────────── */

const stripe = { source: "stripe" as const, activeUntil: "2027-01-01T00:00:00Z" };

const facts = (over: Partial<SummaryFacts>): SummaryFacts => ({
  entitlement: stripe,
  subscription: { status: "trialing", courtesyUntil: "2026-09-17T00:00:00Z" },
  actionKind: "cancel",
  namesATrial: false,
  graceDaysLeft: null,
  endsOn: "17 Sept 2026",
  graceEndsOn: null,
  courtesyEndsOn: "17 Sept 2026",
  courtesyRunning: true,
  price: "$69.99 USD",
  interval: "year",
  gateEnabled: false,
  accessLive: true,
  accessRevoked: false,
  accessRevokedReason: "unknown",
  ...over,
});

describe("the Manage sentence stops promising once the period is over", () => {
  it("says it while it is running", () => {
    expect(manageSummaryFor(facts({}))).toBe(
      "Your Pro plan is free until 17 Sept 2026, and then it's $69.99 USD a year.",
    );
  });

  /**
   * ⚠️ AND WHAT IT SAYS INSTEAD IS THE POINT. Falling silent would leave Manage
   * with no sentence for a paying customer; falling through to `trial` would put
   * D36's word in front of them. It lands on `paying`, which is what they are on.
   */
  it("says the PAYING sentence once it is over, not the courtesy one and not nothing", () => {
    const after = manageSummaryFor(facts({ courtesyRunning: false, courtesyEndsOn: null }));
    expect(after).toBe(
      "You're on your Pro plan at $69.99 USD a year, and it renews on 17 Sept 2026.",
    );
    expect(after).not.toMatch(/free until/);
    expect(after).not.toMatch(/trial/i);
  });
});

/* ── the DID-IT-HAPPEN readers, which must NOT take the date test ──── */

describe("the readers that want 'did it happen' are deliberately unchanged", () => {
  /**
   * ⚠️ THE CONTROL FOR THE WHOLE GROUP.
   *
   * The save offer buys free time by moving `trial_end`, so Stripe reports
   * `trialing` throughout a courtesy period — and for a while AFTER it, until the
   * mirror catches up. These two functions exist to stop that status being read as
   * a first trial. Teaching them the date test would make a finished courtesy
   * beside a `trialing` row resolve to "Free trial" for a customer of two years,
   * which is D36's one absolute prohibition, produced by applying this fix one
   * function too widely.
   */
  const finished = { status: "trialing", courtesyUntil: "2020-01-01T00:00:00Z" };

  it("planLabelFor still says Pro for a FINISHED courtesy on a trialing row", () => {
    expect(planLabelFor(stripe, finished)).toBe("Pro");
    expect(planLabelFor(stripe, finished)).not.toBe("Free trial");
  });

  it("isGenuineTrial still refuses the word for a FINISHED courtesy", () => {
    expect(isGenuineTrial(stripe, finished)).toBe(false);
  });

  it("and both still answer correctly while it IS running", () => {
    const running = { status: "trialing", courtesyUntil: "2099-01-01T00:00:00Z" };
    expect(planLabelFor(stripe, running)).toBe("Pro");
    expect(isGenuineTrial(stripe, running)).toBe(false);
  });

  /** A genuine first trial is untouched by any of this. */
  it("a real trial with no marker is still a trial", () => {
    expect(isGenuineTrial(stripe, { status: "trialing", courtesyUntil: null })).toBe(true);
    expect(planLabelFor(stripe, { status: "trialing", courtesyUntil: null })).toBe("Free trial");
  });
});

describe("the wiring — one resolved value, read by both screens", () => {
  const facts_ = stripComments(readSync("lib/billing/screenFacts.ts"));
  const billing = stripComments(readSync("app/(app)/billing/page.tsx"));
  const manage = stripComments(readSync("app/(app)/billing/manage/page.tsx"));
  const courtesyRead = stripComments(readSync("lib/billing/courtesy.ts"));

  it("screenFacts resolves it once, with courtesyIsRunning", () => {
    expect(facts_).toMatch(/courtesyRunningUntil: courtesyIsRunning\(courtesyUntil\)/);
  });

  it("the 'Free until' row renders off the resolved value, never the raw marker", () => {
    expect(billing).toMatch(/\{courtesyRunningUntil \?/);
    expect(billing).not.toMatch(/\{subscription\?\.courtesyUntil \?/);
  });

  it("Manage's sentence is fed from the same value", () => {
    expect(manage).toMatch(/courtesyEndsOn: facts\.courtesyRunningUntil/);
    expect(manage).toMatch(/courtesyRunning: facts\.courtesyRunningUntil !== null/);
  });

  /**
   * ⚠️ THE READ ITSELF TAKES NO DATE TEST. It feeds BOTH kinds of reader, and
   * filtering at the query would answer reconciliation's question wrongly while
   * fixing the screens'.
   */
  it("courtesyUntilFor still returns the raw marker, running or not", () => {
    expect(courtesyRead).not.toMatch(/courtesyIsRunning/);
    expect(courtesyRead).not.toMatch(/\.gt\(/);
  });
});

/** Block comments, line comments, and nothing else. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function readSync(path: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readFileSync } = require("node:fs") as typeof import("node:fs");
  return readFileSync(path, "utf8");
}
