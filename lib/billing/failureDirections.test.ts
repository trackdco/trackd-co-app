/**
 * ⚠️ WHICH WAY EACH CHECK FAILS (spec 01 §3.5) — pinned so it cannot be tidied
 * into consistency.
 *
 * Every check on the trial-eligibility path errs towards GRANTING free time.
 * That looks like sloppiness and is not. Being wrong in the generous direction
 * costs seven days. Being wrong the other way charges a first-time customer
 * immediately, on a screen that just promised them seven free days — which is a
 * chargeback, and dispute rate is the number that closes payment processor
 * accounts.
 *
 * ## The one asymmetry, which is the thing most likely to be "fixed"
 *
 * When Stripe cannot be reached, `trialEligibility()` falls into its outer catch
 * and the SCREEN PROMISES A TRIAL, while `startTrial` returns an error and the
 * BUTTON REFUSES. Those two look inconsistent side by side and a future session
 * will be tempted to make them agree. They must not agree:
 *
 *   screen over-promises + server refuses  =  a bad minute
 *   screen over-promises + server charges  =  a dispute
 *
 * ## Why these are source assertions
 *
 * Both functions live in a `"use server"` module whose imports (`next/headers`,
 * the Supabase server client, the Stripe SDK) cannot be exercised in this pure
 * `lib/**` suite, and mocking them wholesale would test the mock. The house
 * already uses this shape where the risk is a silent omission rather than a
 * wrong answer — see `deleteIsNeverGated.test.ts`, which pins the same class of
 * rule the same way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = "app/onboarding/billing-actions.ts";
const source = readFileSync(SOURCE, "utf8");

/** The body of a named function, up to the next top-level declaration. */
function bodyOf(name: string): string {
  // `hasValidatedCard` is sync, the rest are async.
  const start = source.search(new RegExp(`^(export )?(async )?function ${name}\\(`, "m"));
  expect(start, `${name} not found in ${SOURCE} — was it renamed?`).toBeGreaterThan(-1);
  const rest = source.slice(start + 1);
  const next = rest.search(/^(export )?(async )?function /m);
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Everything from a function's LAST `catch` onwards — its outermost one.
 *
 * `lastIndexOf`, not `indexOf`: `startTrial` opens an inner try/catch around
 * `findOrCreateCustomer` long before the outer one, and slicing from that
 * caught the whole happy path — including the legitimate `status: "ok"` of the
 * abandoned-attempt resume — inside what was supposed to be the failure tail.
 */
const outerCatch = (body: string) => body.slice(body.lastIndexOf("} catch"));

describe("trialEligibility errs towards SAYING YES", () => {
  const body = bodyOf("trialEligibility");

  it("declares a generous fallback that grants a full trial", () => {
    // `eligible: true`, `reason: "new"`, the full TRIAL_DAYS. If this ever
    // becomes `eligible: false`, a Stripe outage starts telling first-time
    // customers they are being charged today.
    expect(body).toMatch(/const fallback = \{[\s\S]*?eligible: true/);
    expect(body).toMatch(/const fallback = \{[\s\S]*?days: TRIAL_DAYS/);
  });

  it("still has the outer catch, and it returns the fallback", () => {
    // The catch is what turns "Stripe is down" into "you get a trial" rather
    // than into an unhandled rejection on a payment screen.
    const tail = outerCatch(body);
    expect(tail).toContain("return fallback");
  });

  it("returns the fallback for an anonymous caller rather than throwing", () => {
    expect(body).toMatch(/if \(!user\) return fallback/);
  });
});

describe("startTrial errs towards REFUSING", () => {
  const body = bodyOf("startTrial");

  it("returns an error, never a subscription, when anything throws", () => {
    // The asymmetry itself. A catch here that granted anything — a trial, a
    // subscription, an optimistic success — is the defect this pins.
    const tail = outerCatch(body);
    expect(tail).toMatch(/status: "error"/);
    expect(tail).not.toMatch(/status: "ok"/);
  });

  it("refuses an anonymous caller", () => {
    expect(body).toMatch(/if \(!user\) return \{ status: "error"/);
  });

  it("still enforces the age gate before creating anything", () => {
    // Carried in from w2b-14: rendering the paywall does not re-check the age,
    // so this endpoint is where it is actually enforced.
    expect(body).toContain("passedGate");
    expect(body.indexOf("passedGate")).toBeLessThan(body.indexOf("subscriptions.create"));
  });
});

describe("the entitlements read grants on failure", () => {
  const body = bodyOf("compEntitlement");

  it("returns `none` on a Postgres error, which grants the trial", () => {
    // `none` means "an ordinary user", so a failed read hands out free days
    // rather than charging somebody who may have been promised none.
    const onError = body.slice(body.indexOf("if (error)"));
    expect(onError).toMatch(/return \{ kind: "none" \}/);
  });

  it("returns `none` from the catch as well", () => {
    const tail = outerCatch(body);
    expect(tail).toMatch(/return \{ kind: "none" \}/);
  });

  it("never throws its way out", () => {
    expect(body).toContain("try {");
    expect(body).toContain("} catch");
  });
});

describe("the comp refusal happens before any Stripe object exists", () => {
  const body = bodyOf("startTrial");

  it("checks the comp entitlement before resolving the Stripe customer", () => {
    // §3.7. If this order inverts, a free-for-life comp gets a Stripe customer
    // minted for them on the way to being refused — clutter in the account of
    // record, generated by an account that must never transact at all.
    const refusal = body.indexOf('comp.kind === "forever"');
    const customer = body.indexOf("findOrCreateCustomer");
    expect(refusal).toBeGreaterThan(-1);
    expect(customer).toBeGreaterThan(-1);
    expect(refusal).toBeLessThan(customer);
  });
});

describe("an abandoned attempt never burns the trial", () => {
  /**
   * ⚠️ MEASURED AGAINST REAL STRIPE, 2026-08-15. A first-timer abandoned a 3D
   * Secure challenge, came back, picked a different plan — `startTrial`
   * cancelled the abandoned one, and the cancelled attempt (no payment method,
   * no source, `pending_setup_intent` still pending) read as a used trial. They
   * were charged today against a screen that had just promised seven free days.
   *
   * The rule that stops it: for a status where the card step may never have
   * finished, ASK, rather than inferring "validated" from the status alone.
   */
  const source = readFileSync(SOURCE, "utf8");

  it("treats a cancelled attempt as a status where the card step may be unfinished", () => {
    const set = source.match(/CARD_STEP_MAY_BE_UNFINISHED[\s\S]*?\]\);/)?.[0] ?? "";
    expect(set).toContain('"trialing"');
    expect(set).toContain('"canceled"');
    expect(set).toContain('"incomplete_expired"');
  });

  it("no longer short-circuits every non-trialing status to validated", () => {
    // `if (sub.status !== "trialing") return true;` is the exact line that
    // burned the trial. It must not come back.
    expect(source).not.toMatch(/if \(sub\.status !== "trialing"\) return true;/);
  });

  it("still reads the pending setup intent as the proof a card step finished", () => {
    // This is what keeps the refunded-but-previously-active case counting as a
    // used trial: confirming clears the intent, so a subscription that genuinely
    // ran has none and still reads as validated.
    const body = bodyOf("hasValidatedCard");
    expect(body).toContain("return !sub.pending_setup_intent;");
  });

  it("still refuses to call `incomplete` a validated card", () => {
    const body = bodyOf("hasValidatedCard");
    expect(body).toMatch(/if \(sub\.status === "incomplete"\) return false;/);
  });
});

describe("the eligibility answer is copy, and gates nothing", () => {
  it("no access check anywhere reads trialEligibility", () => {
    // Out of Scope forbids making it a gate. Access is decided by entitlements
    // alone; this only decides what a screen SAYS.
    const gate = readFileSync("lib/billing/gate.ts", "utf8");
    const access = readFileSync("lib/billing/access.ts", "utf8");
    const entitlements = readFileSync("lib/billing/entitlements.ts", "utf8");
    for (const file of [gate, access, entitlements]) {
      expect(file).not.toContain("trialEligibility");
    }
  });
});
